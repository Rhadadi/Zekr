#!/usr/bin/env python3
"""Classical tafsirs, one text per ayah, for Zekr's web build (data/classical/).

The texts come from github.com/spa5k/tafsir_api (the per-surah JSON files, served by jsDelivr).
Only works whose authors died long ago, or that their publisher (the Royal Aal al-Bayt Institute, altafsir.com)
gives away free, are here; modern commentaries (Qutb, Ibn Ashur, Mawdudi ...) are in copyright and are not.

  python3 tools/classical_tafsir.py --fetch    download into data/raw/classical/<edition>/<surah>.json (once)
  python3 tools/build_data.py --classics      writes web/public/data/classics/: index.json, and for each book
                                               <id>/<surah>-<n>.json.gz (the browser unpacks them)

An ayah the author discusses together with its neighbours has the same text in each; a chunk holds it once and gives
the others as the number of the ayah that has it.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "classical"
URL = "https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/{edition}/{surah}.json"

# id, source edition, language, name and author (en, fa)
BOOKS = [
    ("jalalayn", "ar-tafsir-al-jalalayn", "ar",
     ("Tafsir al-Jalalayn", "تفسیر جلالین"),
     ("al-Mahalli (d. 864/1459) and al-Suyuti (d. 911/1505)", "جلال‌الدین محلی (د. ۸۶۴) و جلال‌الدین سیوطی (د. ۹۱۱)")),
    ("jalalayn-en", "en-al-jalalayn", "en",
     ("Tafsir al-Jalalayn, in English", "تفسیر جلالین، به انگلیسی"),
     ("translated by Feras Hamza, Royal Aal al-Bayt Institute for Islamic Thought (altafsir.com)", "ترجمهٔ فراس حمزه، مؤسسهٔ آل‌البیت (altafsir.com)")),
    ("ibn-kathir", "ar-tafsir-ibn-kathir", "ar",
     ("Tafsir Ibn Kathir", "تفسیر ابن‌کثیر"),
     ("Ibn Kathir (d. 774/1373)", "ابن‌کثیر (د. ۷۷۴)")),
    ("tabari", "ar-tafsir-al-tabari", "ar",
     ("Jami' al-Bayan, al-Tabari", "جامع‌البیان طبری"),
     ("al-Tabari (d. 310/923)", "طبری (د. ۳۱۰)")),
    ("qurtubi", "ar-tafseer-al-qurtubi", "ar",
     ("al-Jami' li-Ahkam al-Qur'an, al-Qurtubi", "الجامع لأحکام القرآن، قرطبی"),
     ("al-Qurtubi (d. 671/1273)", "قرطبی (د. ۶۷۱)")),
    ("razi", "tafsir-al-razi", "ar",
     ("Mafatih al-Ghayb, al-Razi", "مفاتیح‌الغیب، فخر رازی"),
     ("Fakhr al-Din al-Razi (d. 606/1210)", "فخر رازی (د. ۶۰۶)")),
    ("baydawi", "tafsir-al-baydawi", "ar",
     ("Anwar al-Tanzil, al-Baydawi", "انوارالتنزیل، بیضاوی"),
     ("al-Baydawi (d. about 685/1286)", "بیضاوی (د. حدود ۶۸۵)")),
    ("zamakhshari", "al-kashshaf-al-zamakhshari", "ar",
     ("al-Kashshaf, al-Zamakhshari", "الکشّاف، زمخشری"),
     ("al-Zamakhshari (d. 538/1144)", "زمخشری (د. ۵۳۸)")),
]
SOURCE = "github.com/spa5k/tafsir_api (the texts of altafsir.com, Shamela and others)"
PAGE_MARK = re.compile(r"\(p-\d+\)\s*")  # where a page of the printed book began, left in some of the texts
CHUNK = 250_000  # bytes of text in one file: opening an ayah fetches a few KB, not a surah

def get(url: str) -> bytes | None:
    for _ in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return r.read()
        except Exception:
            continue
    return None


def fetch_one(job):
    edition, surah = job
    out = RAW / edition / f"{surah}.json"
    if out.exists():
        return 0
    data = get(URL.format(edition=edition, surah=surah))
    if data is None:
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return 0


def fetch_all() -> None:
    jobs = [(b[1], s) for b in BOOKS for s in range(1, 115)]
    with ThreadPoolExecutor(12) as pool:
        failed = sum(pool.map(fetch_one, jobs))
    print(f"fetched {len(jobs)} files, {failed} missing")


def read_surah(edition: str, surah: int) -> dict[int, str]:
    f = RAW / edition / f"{surah}.json"
    if not f.exists():
        return {}
    j = json.loads(f.read_text(encoding="utf-8"))
    rows = j if isinstance(j, list) else j.get("ayahs", [])
    texts = {int(r["ayah"]): PAGE_MARK.sub("", r["text"]).strip() for r in rows}
    return {n: t for n, t in texts.items() if t}


def chunks_of(texts: dict[int, str]) -> list[dict[str, str | int]]:
    out: list[dict[str, str | int]] = []
    cur: dict[str, str | int] = {}
    size = 0
    run_start, prev = 0, None
    for n in sorted(texts):
        text = texts[n]
        if text == prev and str(run_start) in cur:
            cur[str(n)] = run_start
            continue
        if cur and size + len(text.encode()) > CHUNK:
            out.append(cur)
            cur, size = {}, 0
        cur[str(n)] = text
        size += len(text.encode())
        run_start, prev = n, text
    if cur:
        out.append(cur)
    return out


def fingerprint() -> str:
    """Of the downloaded texts and of how they are cut, for the data version (before anything is written)."""
    digest = hashlib.sha256(repr((BOOKS, CHUNK)).encode())
    for b in BOOKS:
        for surah in range(1, 115):
            f = RAW / b[1] / f"{surah}.json"
            if f.exists():
                digest.update(f.read_bytes())
    return digest.hexdigest()[:16]


def build_web(out: Path, ayahs: list[int]) -> None:
    """Writes out/classics/. `ayahs`: how many ayahs each surah has."""
    d = out / "classics"
    if d.exists():
        for f in d.rglob("*"):
            if f.is_file():
                f.unlink()
    books = []
    for id_, edition, lang, name, author in BOOKS:
        starts: dict[str, list[int]] = {}
        for surah in range(1, 115):
            texts = {n: t for n, t in read_surah(edition, surah).items() if 1 <= n <= ayahs[surah - 1]}
            if not texts:
                continue
            for k, chunk in enumerate(chunks_of(texts)):
                body = gzip.compress(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0)
                f = d / id_ / f"{surah}-{k + 1}.json.gz"
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_bytes(body)
                starts.setdefault(str(surah), []).append(min(int(n) for n in chunk))
        books.append({"id": id_, "lang": lang, "name": {"en": name[0], "fa": name[1]}, "author": {"en": author[0], "fa": author[1]}, "chunks": starts})
    index = {"source": SOURCE, "books": books}
    (d / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")



def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", action="store_true")
    args = ap.parse_args(argv)
    if not args.fetch:
        ap.print_help()
        return 0
    fetch_all()
    return 0


if __name__ == "__main__":
    sys.exit(main())
