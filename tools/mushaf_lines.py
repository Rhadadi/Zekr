#!/usr/bin/env python3
"""Which words are on which line of each of the 604 pages of the Madani mushaf (the 15-line layout of the printed
edition), so the printed page can show its text in a font, line for line.

Downloads the layout once from the quran.com API (api.quran.com/api/v4, words with their line numbers) into
data/raw/mushaf-lines/ and writes assets/mushaf-lines.json, which is committed: the build never calls the API.

  {"source": ..., "pages": [[line, ...], ...]}   one entry per page; a line is a list of words, with the number of an
                                                   ayah (an int) where that ayah ends

Only the lines with words are kept (surah banners and the basmala are drawn by the page's picture).
Python standard library only.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "mushaf-lines"
OUT = ROOT / "assets" / "mushaf-lines.json"
API = "https://api.quran.com/api/v4/verses/by_page/{n}?words=true&word_fields=text_uthmani,line_number&per_page=60"


def page(n: int) -> dict:
    path = CACHE / f"{n:03}.json"
    if not path.exists():
        req = urllib.request.Request(API.format(n=n), headers={"User-Agent": "Mozilla/5.0 (Zekr build)", "Accept": "application/json"})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = json.load(r)
                break
            except OSError as e:
                print(f"page {n}: {e}; retrying", file=sys.stderr)
                time.sleep(2 + 3 * attempt)
        else:
            raise SystemExit(f"page {n} could not be downloaded")
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        time.sleep(0.25)
    return json.loads(path.read_text(encoding="utf-8"))


def lines_of(data: dict) -> list[list]:
    lines: dict[int, list] = {}
    for v in data["verses"]:
        for w in v["words"]:
            if w["char_type_name"] == "end":
                lines.setdefault(w["line_number"], []).append(int(v["verse_key"].split(":")[1]))
            else:
                lines.setdefault(w["line_number"], []).append(w["text_uthmani"])
    return [lines[k] for k in sorted(lines)]


def main() -> int:
    pages = [lines_of(page(n)) for n in range(1, 605)]
    words = sum(1 for p in pages for line in p for t in line if isinstance(t, str))
    ends = sum(1 for p in pages for line in p for t in line if isinstance(t, int))
    if ends != 6236:
        raise SystemExit(f"expected 6236 ayah ends, found {ends}")
    OUT.write_text(json.dumps({"source": "api.quran.com/api/v4 (words with line_number, 15-line Madani layout)", "pages": pages},
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: 604 pages, {sum(len(p) for p in pages)} lines, {words} words, {ends} ayah ends")
    return 0


if __name__ == "__main__":
    sys.exit(main())
