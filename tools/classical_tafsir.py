#!/usr/bin/env python3
"""Classical tafsirs, one text per ayah, for Zekr's web build (data/classical/).

The texts come from github.com/spa5k/tafsir_api (the per-surah JSON files, served by jsDelivr), and the Persian
ones from ganjoor.net, which shares its texts for others to build on (its API, four requests at a time).
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
# jsDelivr refuses a package over 50 MB, which some of the larger editions are: GitHub itself has the same files
URL_RAW = "https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/{edition}/{surah}.json"

# id, source edition, language, name and author (en, fa); the first is the one shown until the reader picks another
BOOKS = [
    ("meybodi", "ganjoor:1905", "fa",
     ("Kashf al-Asrar, Meybodi (in Persian)", "کشف‌الاسرار و عدة‌الابرار، میبدی"),
     ("Rashid al-Din Meybodi (wrote it in 520/1126); the text of ganjoor.net", "رشیدالدین میبدی (نگارش ۵۲۰)؛ متن گنجور")),
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
    ("ibn-atiyya", "al-muharrar-al-wajiz-ibn-atiyyah", "ar",
     ("al-Muharrar al-Wajiz, Ibn Atiyya", "المحرّر الوجیز، ابن‌عطیه"),
     ("Ibn Atiyya al-Andalusi (d. 542/1147)", "ابن‌عطیهٔ اندلسی (د. ۵۴۲)")),
    ("abu-hayyan", "al-bahr-al-muhit", "ar",
     ("al-Bahr al-Muhit, Abu Hayyan", "البحر المحیط، ابوحیان"),
     ("Abu Hayyan al-Andalusi (d. 745/1344)", "ابوحیان اندلسی (د. ۷۴۵)")),
    ("nasafi", "tafsir-al-nasafi", "ar",
     ("Madarik al-Tanzil, al-Nasafi", "مدارک‌التنزیل، نسفی"),
     ("al-Nasafi (d. 710/1310)", "نسفی (د. ۷۱۰)")),
    ("alusi", "tafsir-al-alusi", "ar",
     ("Ruh al-Ma'ani, al-Alusi", "روح‌المعانی، آلوسی"),
     ("al-Alusi (d. 1270/1854)", "آلوسی (د. ۱۲۷۰)")),
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
    data = get(URL.format(edition=edition, surah=surah)) or get(URL_RAW.format(edition=edition, surah=surah))
    if data is None:
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return 0


def fetch_all() -> None:
    jobs = [(b[1], s) for b in BOOKS if not b[1].startswith("ganjoor:") for s in range(1, 115)]
    with ThreadPoolExecutor(12) as pool:
        failed = sum(pool.map(fetch_one, jobs))
    failed += sum(fetch_ganjoor(b[1]) for b in BOOKS if b[1].startswith("ganjoor:"))
    print(f"fetched {len(jobs)} files, {failed} missing")


# Persian tafsirs from ganjoor.net (its API): the edition is "ganjoor:<the book's category id>". A surah is saved as the
# list of its sections, [title, text] each, in order.
GANJOOR = "https://api.ganjoor.net/api/ganjoor/"


def ganjoor(path: str):
    data = get(GANJOOR + path)
    return json.loads(data) if data else None


def fetch_ganjoor(edition: str) -> int:
    book = ganjoor(f"cat/{edition.split(':')[1]}")
    if not book:
        return 114
    failed = 0
    for k, cat in enumerate(book["cat"]["children"][:114]):
        out = RAW / edition.replace(":", "-") / f"{k + 1}.json"
        if out.exists():
            continue
        listing = ganjoor(f"cat/{cat['id']}?poems=true")
        poems = listing["cat"]["poems"] if listing else None
        with ThreadPoolExecutor(4) as pool:
            got = list(pool.map(lambda p: ganjoor(f"poem/{p['id']}?catInfo=false&rhymes=false&recitations=false&images=false&songs=false&comments=false&navigation=false&relatedpoems=false"), poems or []))
        if not poems or any(g is None for g in got):
            failed += 1
            continue
        sections = [[g["title"], "\n".join(v["text"].strip() for v in g["verses"] if v["text"].strip())] for g in got]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(sections, ensure_ascii=False), encoding="utf-8")
    return failed


# Meybodi goes through the Quran in sessions of a few ayahs, each in three rounds (nowba): his Persian rendering of the
# ayahs, then the commentary, then the mystic reading. The rendering quotes the ayahs, vowelled, phrase by phrase; the
# Persian is not vowelled. Ganjoor's copy mostly lacks the ayah numbers, so a session is placed by finding its first
# quoted words in the surah.
ROUNDS = {"الاولی": "ترجمه", "الثانیة": "تفسیر", "الثالثة": "تفسیر عرفانی"}
VOWELS = re.compile("[\u064B-\u0652]")
NOT_LETTERS = re.compile("[^\u0621-\u064A]")
LETTERS = str.maketrans({"ی": "ي", "ى": "ي", "ک": "ك", "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ؤ": "و", "ئ": "ي", "ء": None, "ة": "ه"})


def bare(text: str) -> str:
    """Arabic letters only, spelt one way: what the two copies of an ayah have in common."""
    return NOT_LETTERS.sub("", text.translate(LETTERS))


def first_words(rendering: str, letters: str, after: int) -> int | None:
    """Where in the surah's letters a session's rendering begins: its first quoted (vowelled) words, looked for after
    position `after`. None when they are not found."""
    quoted = [bare(w) for w in rendering.split() if VOWELS.search(w)]
    for skip in range(4):  # a stray first word ("الم", a spelling of its own) is passed over
        key = "".join(quoted[skip:skip + 3])
        if len(key) < 6:
            continue
        at = letters.find(key, after)
        if at >= 0:
            return at
    return None


def quote_at(paragraph: str, letters: str, after: int, until: int) -> int | None:
    """Where in the surah's letters a paragraph is about: the place of the first run of quoted (vowelled) words in it
    that is found between `after` and `until`. None when there is none (the paragraph goes on with the one before)."""
    words = paragraph.split()[:60]
    runs: list[list[str]] = []
    for w in words:
        if VOWELS.search(w):
            if runs and runs[-1][-1] is not None:
                runs[-1].append(w)
            else:
                runs.append([w])
        elif runs and runs[-1][-1] is not None:
            runs[-1].append(None)  # a run ends at the first word that is not vowelled
    for run in runs[:4]:
        quoted = [bare(w) for w in run if w is not None]
        key = "".join(quoted[:4])
        if len(key) < 6:
            continue
        at = letters.find(key, after, until)
        if at >= 0:
            return at
    return None


def split_round(text: str, letters: str, owner: list[int], first: int, last: int) -> list[tuple[int, int, str]]:
    """One round of a session (`first`..`last`: the ayahs of the session) cut into its paragraphs, each with the ayahs
    it is about: from the ayah it begins at to the one before the next paragraph's. Paragraphs that do not begin at
    a quoted ayah go on with the one before; the ayahs between two quoted ones are covered by the paragraph before."""
    paragraphs = [p for p in text.split("\n") if p.strip()]
    begin = owner.index(first)
    end = len(owner) - owner[::-1].index(last)
    pos, at_ayah = begin, first
    starts = []
    for para in paragraphs:
        at = quote_at(para, letters, pos, end)
        if at is not None and owner[at] >= at_ayah and owner[at] - at_ayah <= 25:
            pos, at_ayah = at, owner[at]
        starts.append(at_ayah)
    out = []
    for i, para in enumerate(paragraphs):
        nxt = next((x for x in starts[i + 1:] if x > starts[i]), last + 1)
        out.append((starts[i], nxt - 1, para))
    return out


def read_sessions(sections: list[list[str]], quran: list[str]) -> dict[int, str]:
    """Every ayah of a surah (`quran`: its ayahs' text), what the book says on it: for each of the three rounds of the
    session it is in, "# <round>" and the paragraphs about the ayah (a paragraph about several ayahs is on each of
    them). A session that cannot be placed stays with the one before it; an ayah the book passes over reads as the
    one before it."""
    letters, owner = "", []
    for n, ayah in enumerate(quran, 1):
        b = bare(ayah)
        letters += b
        owner += [n] * len(b)
    sessions: list[tuple[int, list[tuple[str | None, str]]]] = []  # first ayah, rounds
    after = 0
    for title, text in sections:
        round_ = next((k for k in ROUNDS if k in title.replace("ى", "ی")), None)  # spelt with either yeh
        if round_ == "الاولی" or not sessions:
            at = first_words(text, letters, after) if sessions else 0
            start = owner[at] if at is not None and at < len(owner) else None
            if not sessions or (start is not None and start > sessions[-1][0]):
                sessions.append((start or 1, [(round_, text)]))
                after = (at or 0) + 1
                continue
        sessions[-1][1].append((round_, text))
    out: dict[int, str] = {}
    for k, (start, rounds) in enumerate(sessions):
        end = sessions[k + 1][0] - 1 if k + 1 < len(sessions) else len(quran)
        per_ayah: dict[int, list[str]] = {n: [] for n in range(start, end + 1)}
        for round_, text in rounds:
            heading = f"# النوبة {round_} — {ROUNDS[round_]}" if round_ else ""
            parts = split_round(text, letters, owner, start, end)
            for n in range(start, end + 1):
                mine = [para for lo, hi, para in parts if lo <= n <= hi]
                if mine:
                    per_ayah[n] += ([heading] if heading else []) + mine
        for n, lines in per_ayah.items():
            out[n] = "\n".join(lines)
    # an ayah the book passes over reads as the one before it
    for n in range(2, len(quran) + 1):
        if not out.get(n) and out.get(n - 1):
            out[n] = out[n - 1]
    return {n: t for n, t in out.items() if t}


def raw_file(edition: str, surah: int) -> Path:
    return RAW / edition.replace(":", "-") / f"{surah}.json"


def read_surah(edition: str, surah: int, quran: list[str]) -> dict[int, str]:
    f = raw_file(edition, surah)
    if not f.exists():
        return {}
    if edition.startswith("ganjoor:"):
        return read_sessions(json.loads(f.read_text(encoding="utf-8")), quran)
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
            f = raw_file(b[1], surah)
            if f.exists():
                digest.update(f.read_bytes())
    return digest.hexdigest()[:16]


def build_web(out: Path, quran: dict[tuple[int, int], str]) -> None:
    """Writes out/classics/. `quran`: the text of every ayah (Tanzil's simple-clean, without the basmala)."""
    d = out / "classics"
    if d.exists():
        for f in d.rglob("*"):
            if f.is_file():
                f.unlink()
    books = []
    for id_, edition, lang, name, author in BOOKS:
        starts: dict[str, list[int]] = {}
        for surah in range(1, 115):
            ayahs = [quran[surah, n] for n in range(1, 300) if (surah, n) in quran]
            texts = {n: t for n, t in read_surah(edition, surah, ayahs).items() if 1 <= n <= len(ayahs)}
            if not texts:
                continue
            for k, chunk in enumerate(chunks_of(texts)):
                body = gzip.compress(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0)
                f = d / id_ / f"{surah}-{k + 1}.json.gz"
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_bytes(body)
                starts.setdefault(str(surah), []).append(min(int(n) for n in chunk))
        books.append({"id": id_, "lang": lang, "name": {"en": name[0], "fa": name[1]}, "author": {"en": author[0], "fa": author[1]},
                      **({"source": "ganjoor.net"} if edition.startswith("ganjoor:") else {}), "chunks": starts})
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
