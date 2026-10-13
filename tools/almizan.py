#!/usr/bin/env python3
"""Al-Mizan (Allameh Tabatabaei), Persian translation by Mousavi Hamadani, for Zekr.

The text comes from the Zolal project (github.com/roshan-research/zolal, built with CRCIS Noor),
one HTML file per section of ayahs, in the groups Al-Mizan itself uses (e.g. Maryam 1-15).
tools/almizan_sections.json lists the 594 sections (from Zolal's js/meta.js); together they cover
every ayah exactly once.

  python3 tools/almizan.py --fetch     download the sections into data/raw/almizan_fa/ (about 10 minutes, once)
  python3 tools/build_data.py --almizan              also build ios/Zekr/Resources/almizan.sqlite
  python3 tools/build_data.py --almizan --almizan-web   and web/public/data/almizan/ (private builds only)

The text is copyrighted (CRCIS / Daftar-e Entesharat-e Eslami). It is for private family use:
never commit it, and never put it on the public website. See docs/PLAN.md §8.
"""

from __future__ import annotations

import argparse
import gzip
import html
import json
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "almizan_fa"
SECTIONS_FILE = Path(__file__).resolve().parent / "almizan_sections.json"
URL = "https://zolal.s3.amazonaws.com/almizan_fa/{id}"
SOURCE = "Al-Mizan, Persian translation by Mousavi Hamadani; text from the Zolal project (CRCIS Noor)"

PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def load_sections() -> list[tuple[str, int, int, int]]:
    """(id, surah, first ayah, last ayah) for every section, in Quran order."""
    out = []
    for sid in json.loads(SECTIONS_FILE.read_text(encoding="utf-8")):
        m = re.fullmatch(r"(\d+)_(\d+)-(\d+)", sid)
        if not m:
            raise ValueError(f"bad section id {sid!r}")
        out.append((sid, int(m[1]), int(m[2]), int(m[3])))
    return out


def check_coverage(sections, ayah_counts: list[int]) -> list[str]:
    """Every ayah of every surah in exactly one section, in order. Returns problems found."""
    problems = []
    expected = {}
    for sid, surah, a, b in sections:
        if a > b:
            problems.append(f"{sid}: empty range")
        start = expected.get(surah, 1)
        if a != start:
            problems.append(f"{sid}: expected to start at {surah}:{start}")
        expected[surah] = b + 1
    for surah, count in enumerate(ayah_counts, start=1):
        if expected.get(surah, 1) != count + 1:
            problems.append(f"surah {surah}: sections end at {expected.get(surah, 1) - 1}, surah has {count} ayahs")
    return problems


# --------------------------------------------------------------------------- download


def fetch_section(sid: str, refresh: bool = False) -> str:
    dest = RAW_DIR / sid
    if dest.exists() and not refresh:
        return dest.read_text(encoding="utf-8")
    dest.parent.mkdir(parents=True, exist_ok=True)
    last: Exception | None = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(URL.format(id=sid), headers={"User-Agent": "zekr-data-pipeline/1", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if data[:2] == b"\x1f\x8b":
                data = gzip.decompress(data)
            text = data.decode("utf-8")
            if "<p" not in text:
                raise ValueError("no paragraphs in the response")
            dest.write_text(text, encoding="utf-8")
            return text
        except Exception as e:  # noqa: BLE001 - retry on any download problem
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"could not download Al-Mizan section {sid}: {last}")


def fetch_all(refresh: bool = False, pause: float = 0.5) -> None:
    sections = load_sections()
    for i, (sid, *_rest) in enumerate(sections, start=1):
        cached = (RAW_DIR / sid).exists() and not refresh
        fetch_section(sid, refresh)
        if not cached:
            time.sleep(pause)  # be polite to the host
        if i % 50 == 0 or i == len(sections):
            print(f"  Al-Mizan: {i}/{len(sections)} sections", flush=True)


# --------------------------------------------------------------------------- parse
#
# A section becomes {"id", "surah", "from", "to", "title", "blocks", "notes"}:
#   blocks: [{"t": "s" | "h" | "t" | "p", "r": runs}]
#           s = surah heading, h = part heading (ترجمه آیات, بیان آیات, بحث روایتی), t = topic, p = paragraph
#   runs:   [text] plain, [text, "q"] Quran quote, [text, "e"] word under discussion,
#           [text, "d"] hadith, [n, "n"] footnote n (1-based index into notes)
#   notes:  footnote texts (source citations), in order
# web/src/tafsir.ts and ios/ZekrKit (Tafsir.swift) read this format.

STYLE_OF = {("span", "aya"): "q", ("em", ""): "e", ("span", "hadith"): "d"}


def clean(text: str) -> str:
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", text))


class SectionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[dict] = []
        self.notes: list[str] = []
        self.title = ""
        self.kind: str | None = None  # block being read
        self.runs: list[list] = []
        self.styles: list[str | None] = []  # style pushed by each open inline tag
        self.skip = 0  # inside a footnote marker or the section title
        self.in_title = False

    # blocks
    def open_block(self, kind: str) -> None:
        self.close_block()
        self.kind = kind
        self.runs = []

    def close_block(self) -> None:
        if self.kind is None:
            return
        runs = self.tidy(self.runs)
        if runs:
            self.blocks.append({"t": self.kind, "r": runs})
        self.kind = None
        self.runs = []

    @staticmethod
    def tidy(runs: list[list]) -> list[list]:
        """Merge neighbours with the same style, collapse spaces, trim the ends."""
        out: list[list] = []
        for run in runs:
            if run[-1] == "n" and isinstance(run[0], int):
                out.append(run)
                continue
            text = clean(run[0])
            if not text:
                continue
            if out and out[-1][1:] == run[1:] and not (out[-1][-1] == "n"):
                out[-1][0] = clean(out[-1][0] + text)
            else:
                out.append([text, *run[1:]])
        while out and isinstance(out[0][0], str) and len(out[0]) == 1 and not out[0][0].strip():
            out.pop(0)
        if out and isinstance(out[0][0], str):
            out[0][0] = out[0][0].lstrip(" \u200c")
        if out and isinstance(out[-1][0], str):
            out[-1][0] = out[-1][0].rstrip(" \u200c")
        return [r for r in out if not (isinstance(r[0], str) and not r[0])]

    # html events
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "code":
            return  # page, section, aya and book markers carry no text
        if self.skip:
            self.styles.append(None)
            self.skip += 1 if tag == "span" else 0
            return
        if tag == "h2":
            self.open_block("s")
        elif tag == "h3" and cls == "ayas":
            self.close_block()
            self.in_title = True
        elif tag == "h3":
            self.open_block("h")
        elif tag == "p":
            self.open_block("p")
        elif tag == "span" and cls == "footnote":
            note = clean(re.sub(r"<[^>]+>", "", html.unescape(a.get("title") or ""))).strip()
            if note:
                self.ensure_block()
                self.notes.append(note)
                self.runs.append([len(self.notes), "n"])
            self.skip = 1
            self.styles.append(None)
        elif tag == "span" and cls == "title" and self.kind in ("h", "t"):
            # "بیان آیات <title>": the part's name, then the topic as its own heading
            if self.kind == "h" and not "".join(r[0] for r in self.runs if isinstance(r[0], str)).strip():
                self.kind = "t"
            elif self.kind == "h":
                self.open_block("t")
            self.styles.append(None)
        elif tag in ("span", "em"):
            self.styles.append(STYLE_OF.get((tag, cls)))

    def handle_endtag(self, tag):
        if tag == "code":
            return
        if tag in ("span", "em"):
            if self.styles:
                self.styles.pop()
            if self.skip and tag == "span":
                self.skip -= 1
            return
        if tag == "h3" and self.in_title:
            self.in_title = False
            self.title = clean(self.title).strip()
        elif tag in ("h2", "h3", "p"):
            self.close_block()

    def handle_startendtag(self, tag, attrs):
        if tag != "code":  # <br/> and the like
            self.handle_data(" ")

    def ensure_block(self) -> None:
        if self.kind is None:
            self.open_block("p")

    def handle_data(self, data):
        if self.skip:
            return
        if self.in_title:
            self.title += data
            return
        if self.kind is None:
            if not data.strip():
                return
            self.open_block("p")
        style = next((s for s in reversed(self.styles) if s), None)
        self.runs.append([data] if style is None else [data, style])

    def close(self):
        super().close()
        self.close_block()


def parse_section(sid: str, raw: str) -> dict:
    m = re.fullmatch(r"(\d+)_(\d+)-(\d+)", sid)
    if not m:
        raise ValueError(f"bad section id {sid!r}")
    p = SectionParser()
    p.feed(raw)
    p.close()
    return {"id": sid, "surah": int(m[1]), "from": int(m[2]), "to": int(m[3]), "title": p.title, "blocks": p.blocks, "notes": p.notes}


def plain_length(section: dict) -> int:
    return sum(len(r[0]) for b in section["blocks"] for r in b["r"] if isinstance(r[0], str))


def fa_digits(n: int) -> str:
    return str(n).translate(PERSIAN_DIGITS)


# --------------------------------------------------------------------------- build


def load_all(ayah_counts: list[int], first_ids: list[int]) -> list[dict]:
    """Parse every cached section and check it. Raises with a list of problems if anything is off."""
    sections = load_sections()
    problems = check_coverage(sections, ayah_counts)
    missing = [sid for sid, *_ in sections if not (RAW_DIR / sid).exists()]
    if missing:
        raise RuntimeError(f"{len(missing)} Al-Mizan sections are not downloaded yet; run: python3 tools/almizan.py --fetch")
    out = []
    for sid, surah, a, b in sections:
        sec = parse_section(sid, (RAW_DIR / sid).read_text(encoding="utf-8"))
        if plain_length(sec) < 200:
            problems.append(f"{sid}: only {plain_length(sec)} characters of text")
        if not sec["title"]:
            sec["title"] = f"سوره {surah}، آیه‌های {fa_digits(a)} تا {fa_digits(b)}"
        sec["firstId"] = first_ids[surah - 1] + a - 1
        sec["lastId"] = first_ids[surah - 1] + b - 1
        out.append(sec)
    if problems:
        raise RuntimeError("Al-Mizan data problems:\n  " + "\n  ".join(problems))
    return out


def body_json(sec: dict) -> str:
    return json.dumps({"blocks": sec["blocks"], "notes": sec["notes"]}, ensure_ascii=False, separators=(",", ":"))


def build_sqlite(path: Path, sections: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript(
        """
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE section (
            id TEXT PRIMARY KEY, surah INTEGER NOT NULL, ayah_from INTEGER NOT NULL, ayah_to INTEGER NOT NULL,
            first_id INTEGER NOT NULL, last_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL
        );
        CREATE INDEX section_range ON section (first_id, last_id);
        """
    )
    db.executemany("INSERT INTO meta VALUES (?, ?)", [("source", SOURCE), ("format", "1")])
    db.executemany(
        "INSERT INTO section VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [(s["id"], s["surah"], s["from"], s["to"], s["firstId"], s["lastId"], s["title"], body_json(s)) for s in sections],
    )
    db.commit()
    db.execute("VACUUM")
    db.close()
    tmp.replace(path)


def build_web(out: Path, sections: list[dict]) -> None:
    """For a private web build only: one JSON file per section plus an index."""
    d = out / "almizan"
    if d.exists():
        for f in d.glob("*.json"):
            f.unlink()
    d.mkdir(parents=True, exist_ok=True)
    index = {"source": SOURCE, "sections": [[s["id"], s["firstId"], s["lastId"]] for s in sections]}
    (d / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for s in sections:
        (d / f"{s['id']}.json").write_text(json.dumps(s, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", action="store_true", help="download the sections not yet in data/raw/almizan_fa/")
    ap.add_argument("--refresh", action="store_true", help="download every section again")
    args = ap.parse_args(argv)
    if not (args.fetch or args.refresh):
        ap.print_help()
        return 0
    fetch_all(refresh=args.refresh)
    return 0


if __name__ == "__main__":
    sys.exit(main())
