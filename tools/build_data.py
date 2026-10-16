#!/usr/bin/env python3
"""Zekr data pipeline.

Downloads the Quran text, metadata and translations from Tanzil (https://tanzil.net),
checks them, and builds everything the apps need:

  ios/Zekr/Resources/quran.sqlite          full database for the iPhone app
  ios/ZekrWidgets/Resources/widget.sqlite  small database for the Lock Screen widget
  web/public/data/                         JSON files for the web app

Python standard library only, so it runs on a Mac with nothing to install.

Usage:
  python3 tools/build_data.py            build everything (downloads on first run)
  python3 tools/build_data.py --check    download and validate only, write nothing
  python3 tools/build_data.py --refresh  ignore the download cache
  python3 tools/build_data.py --almizan  also build the Al-Mizan tafsir for the iPhone app
                                         (downloads it first if needed; see tools/almizan.py)

Downloaded files are cached in data/raw/ (not committed). Generated files are not
committed either; run this script to recreate them.

Tanzil terms: the Quran text must be copied verbatim and credited to Tanzil with a
link to tanzil.net. The translations are for non-commercial use (see docs/PLAN.md §8).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sqlite3
import sys
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"

TANZIL_TEXT_URL = "https://tanzil.net/pub/download/index.php?quranType={kind}&outType=txt-2&agree=true"
TANZIL_TRANS_URL = "https://tanzil.net/trans/?transID={tid}&type=txt-2"
TANZIL_META_URL = "https://tanzil.net/res/text/metadata/quran-data.xml"

AYAH_COUNT = 6236
SURAH_COUNT = 114

# Quran text variants (Tanzil name -> our key)
TEXTS = {"uthmani": "uthmani", "simple": "simple", "simple-clean": "clean"}

# Translations we ship. `widget` marks the ones the Lock Screen widget offers.
TRANSLATIONS = [
    # id, widget
    ("fa.safavi", True),
    ("fa.fooladvand", True),
    ("fa.khorramshahi", False),
    ("fa.ayati", False),
    ("fa.bahrampour", False),
    ("fa.ansarian", False),
    ("fa.makarem", False),
    ("en.sahih", True),
    ("en.qarai", True),
    ("en.transliteration", False),
]

# What fits in the Lock Screen widget (accessoryRectangular): one line of Arabic and
# two lines of translation. These are estimates until checked on a real device.
WIDGET_FIT = {"arabic_max_letters": 34, "translation_max_chars": 80}

# Persian surah names, in surah order (1-114).
SURAH_NAMES_FA = (
    "فاتحه بقره آل‌عمران نساء مائده انعام اعراف انفال توبه یونس "
    "هود یوسف رعد ابراهیم حجر نحل اسراء کهف مریم طه "
    "انبیاء حج مؤمنون نور فرقان شعراء نمل قصص عنکبوت روم "
    "لقمان سجده احزاب سبأ فاطر یس صافات ص زمر غافر "
    "فصلت شوری زخرف دخان جاثیه احقاف محمد فتح حجرات ق "
    "ذاریات طور نجم قمر الرحمن واقعه حدید مجادله حشر ممتحنه "
    "صف جمعه منافقون تغابن طلاق تحریم ملک قلم حاقه معارج "
    "نوح جن مزمل مدثر قیامت انسان مرسلات نبأ نازعات عبس "
    "تکویر انفطار مطففین انشقاق بروج طارق اعلی غاشیه فجر بلد "
    "شمس لیل ضحی شرح تین علق قدر بینه زلزله عادیات "
    "قارعه تکاثر عصر همزه فیل قریش ماعون کوثر کافرون نصر "
    "مسد اخلاص فلق ناس"
).split()

# Arabic letter variants -> Persian letters (some Tanzil Persian translations use the
# Arabic forms of yeh and kaf, which render wrongly with Persian fonts).
FA_LETTERS = str.maketrans(
    {
        "ي": "ی",  # ي -> ی
        "ى": "ی",  # ى -> ی
        "ك": "ک",  # ك -> ک
        **{chr(0x0660 + i): chr(0x06F0 + i) for i in range(10)},  # ٠-٩ -> ۰-۹
    }
)


# --------------------------------------------------------------------------- text


def normalize_persian(text: str) -> str:
    """Persian letters/digits, single spaces, no stray spaces."""
    text = text.translate(FA_LETTERS).replace(" ", " ")
    return re.sub(r"[ \t]+", " ", text).strip()


def normalize_plain(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text.replace(" ", " ")).strip()


def strip_markup(text: str) -> str:
    """Remove the <u>/<b> emphasis tags Tanzil uses in its transliteration."""
    return re.sub(r"</?[A-Za-z]+>", "", text)


def strip_basmala(texts: dict[tuple[int, int], str]) -> dict[tuple[int, int], str]:
    """Tanzil's text files put the basmala in front of the first ayah of every surah
    except 1 (where it *is* ayah 1) and 9 (which has none). Remove that prefix so each
    ayah holds only its own words; the apps show the basmala as a separate heading.

    The prefix is removed by word count (the basmala is 4 words) and checked by its
    letters, because Tanzil spells it slightly differently in places (e.g. 95:1)."""
    basmala_words = texts[(1, 1)].split()
    if len(basmala_words) != 4:
        raise ValueError("1:1 should be the 4-word basmala")
    expected = letters_only(" ".join(basmala_words))
    out = dict(texts)
    for surah in range(2, 115):
        if surah == 9:
            continue
        words = texts[(surah, 1)].split()
        if letters_only(" ".join(words[:4])) != expected or len(words) <= 4:
            raise ValueError(f"{surah}:1 does not start with the basmala: {texts[(surah, 1)][:40]!r}")
        out[(surah, 1)] = " ".join(words[4:])
    return out


def letters_only(text: str) -> str:
    """Drop combining marks (harakat, Quranic annotation signs). Length of the result is
    a rough measure of how wide the Arabic line is."""
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def parse_tanzil(raw: str) -> tuple[dict[tuple[int, int], str], dict[str, str]]:
    """Parse Tanzil's `surah|ayah|text` format. Returns (texts, header fields)."""
    texts: dict[tuple[int, int], str] = {}
    header: dict[str, str] = {}
    for line in raw.splitlines():
        line = line.strip().lstrip("﻿")
        if not line:
            continue
        if line.startswith("#"):
            m = re.match(r"#\s*(Name|Translator|Language|ID|Last Update|Source):\s*(.*)$", line)
            if m:
                header[m.group(1)] = m.group(2).strip()
            continue
        parts = line.split("|", 2)
        if len(parts) != 3 or not (parts[0].isdigit() and parts[1].isdigit()):
            raise ValueError(f"unexpected line: {line[:80]!r}")
        key = (int(parts[0]), int(parts[1]))
        if key in texts:
            raise ValueError(f"duplicate ayah {key}")
        texts[key] = parts[2]
    return texts, header


# ------------------------------------------------------------------------ download


def fetch(url: str, dest: Path, refresh: bool) -> bytes:
    if dest.exists() and not refresh:
        return dest.read_bytes()
    dest.parent.mkdir(parents=True, exist_ok=True)
    last: Exception | None = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "zekr-data-pipeline/1"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < 1000:
                raise ValueError(f"suspiciously small response ({len(data)} bytes)")
            dest.write_bytes(data)
            return data
        except Exception as e:  # noqa: BLE001 - retry on any download problem
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"could not download {url}: {last}")


# --------------------------------------------------------------------------- model


class Surah:
    def __init__(self, el: ET.Element):
        a = el.attrib
        self.id = int(a["index"])
        self.ayahs = int(a["ayas"])
        self.start = int(a["start"])  # ayah id of first ayah = start + 1
        self.name_ar = a["name"]
        self.name_tr = a["tname"]
        self.name_en = a["ename"]
        self.revelation = a["type"]
        self.order = int(a["order"])
        self.rukus = int(a["rukus"])
        self.name_fa = SURAH_NAMES_FA[self.id - 1]


def ayah_id(surah: Surah, number: int) -> int:
    return surah.start + number


def load_metadata(raw: bytes):
    root = ET.fromstring(raw)
    surahs = [Surah(e) for e in root.find("suras")]
    by_id = {s.id: s for s in surahs}

    def marks(tag):
        out = []
        for e in root.find(tag):
            s = by_id[int(e.attrib["sura"])]
            out.append((int(e.attrib["index"]), s.id, int(e.attrib["aya"]), ayah_id(s, int(e.attrib["aya"])), e.attrib.get("type")))
        return out

    return surahs, {
        "juz": marks("juzs"),
        "hizb_quarter": marks("hizbs"),
        "page": marks("pages"),
        "sajda": marks("sajdas"),
        "ruku": marks("rukus"),
    }


def segment_of(marks, aid: int) -> int:
    """Index (as in the metadata) of the last mark whose ayah id is <= aid."""
    result = marks[0][0]
    for index, _s, _a, mark_id, _t in marks:
        if mark_id <= aid:
            result = index
        else:
            break
    return result


# ---------------------------------------------------------------------- validation


class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def check_shape(name: str, texts, surahs, report: Report, allow_empty: int = 0):
    expected = {(s.id, n) for s in surahs for n in range(1, s.ayahs + 1)}
    got = set(texts)
    if got != expected:
        missing = sorted(expected - got)[:5]
        extra = sorted(got - expected)[:5]
        report.error(f"{name}: ayah set differs from metadata (missing {missing}, extra {extra})")
        return
    empty = [k for k, v in texts.items() if not v.strip()]
    if len(empty) > allow_empty:
        report.error(f"{name}: {len(empty)} empty ayahs, first {empty[:3]}")
    elif empty:
        report.warn(f"{name}: empty ayahs {empty} (translated together with a neighbouring ayah); apps show a placeholder")


def check_arabic(uthmani, simple, clean, report: Report):
    if len(clean[(1, 1)].split()) != 4:
        report.error("clean 1:1 should be the 4-word basmala")
    for name, per in (("uthmani", uthmani), ("simple", simple), ("clean", clean)):
        for s in (2, 3, 36, 114):
            if per[(s, 1)].startswith(per[(1, 1)].split()[0]):
                report.error(f"{name} {s}:1 still starts with the basmala")
        if per[(9, 1)].startswith(per[(1, 1)].split()[0]):
            report.error(f"{name} 9:1 should not start with the basmala")
    if clean[(2, 1)] != "الم":
        report.error(f"clean 2:1 should be الم, got {clean[(2, 1)]!r}")


def check_translation(tid: str, texts, arabic_clean, report: Report):
    lo, hi = [], []
    for key, t in texts.items():
        ratio = len(t) / max(1, len(arabic_clean[key]))
        if ratio < 0.4:
            lo.append((round(ratio, 2), key))
        elif ratio > 14:
            hi.append((round(ratio, 2), key))
    if lo or hi:
        report.warn(f"{tid}: unusual length vs Arabic: {len(lo)} very short, {len(hi)} very long (e.g. {sorted(lo)[:2]} {sorted(hi)[-2:]})")
    tiny = [k for k, t in texts.items() if 0 < len(t) < 6 and len(arabic_clean[k]) > 30]
    if tiny:
        report.error(f"{tid}: {len(tiny)} ayahs have almost no text for a long Arabic ayah (truncated source?), e.g. {tiny[:3]}")
    markup = [k for k, t in texts.items() if re.search(r"[<>]", t)]
    if markup:
        report.error(f"{tid}: markup left in {len(markup)} ayahs, e.g. {markup[:3]}")
    if tid.startswith("fa."):
        bad = [k for k, t in texts.items() if re.search(r"[يىك]", t)]
        if bad:
            report.error(f"{tid}: Arabic letter variants remain after normalization at {bad[:3]}")
        latin = [k for k, t in texts.items() if re.search(r"[A-Za-z]{3,}", t)]
        if latin:
            report.warn(f"{tid}: {len(latin)} ayahs contain Latin words, e.g. {latin[:3]}")


def check_surah_names(surahs, report: Report):
    if len(SURAH_NAMES_FA) != SURAH_COUNT:
        report.error(f"expected {SURAH_COUNT} Persian surah names, have {len(SURAH_NAMES_FA)}")
        return

    def fold(s: str) -> str:
        s = letters_only(unicodedata.normalize("NFKC", s))
        s = s.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ی", "ي": "ی", "ك": "ک", "ؤ": "و", "ئ": "ی", "‌": "", " ": "", "-": ""}))
        return re.sub(r"^ال", "", s)

    known_differences = {75}  # القيامة vs قیامت: Persian spells it with a plain ت
    for s in surahs:
        a, b = fold(s.name_ar), fold(s.name_fa)
        if s.id in known_differences:
            continue
        if a != b and a not in b and b not in a:
            report.warn(f"surah {s.id}: Persian name {s.name_fa!r} vs Arabic {s.name_ar!r} - please check")


# ------------------------------------------------------------------------- pools


def build_pools(surahs, arabic_simple, translations) -> dict[str, list[int]]:
    """Ayah id lists the widget / daily-ayah page can draw from (ascending ids)."""
    ids = {(s.id, n): ayah_id(s, n) for s in surahs for n in range(1, s.ayahs + 1)}
    ordered = sorted(ids, key=ids.get)
    pools: dict[str, list[int]] = {"all": [ids[k] for k in ordered]}
    ar_len = {k: len(letters_only(arabic_simple[k])) for k in ordered}
    for tid, info in translations.items():
        pools[f"fits.{tid}"] = [
            ids[k]
            for k in ordered
            if ar_len[k] <= WIDGET_FIT["arabic_max_letters"] and 0 < len(info["texts"][k]) <= WIDGET_FIT["translation_max_chars"]
        ]
    return pools


# ------------------------------------------------------------------------- output


BASMALA: dict[str, str] = {}


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def search_fold_ar(text: str) -> str:
    return letters_only(text)


def build_sqlite(path: Path, *, surahs, marks, texts, translations, pools, version: str, widget: bool):
    if path.exists():
        path.unlink()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    cur = db.cursor()
    cur.executescript(
        """
        PRAGMA journal_mode = OFF;
        CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
        CREATE TABLE surah(
            id INTEGER PRIMARY KEY, ayah_count INTEGER NOT NULL, first_ayah_id INTEGER NOT NULL,
            name_ar TEXT NOT NULL, name_fa TEXT NOT NULL, name_tr TEXT NOT NULL, name_en TEXT NOT NULL,
            revelation TEXT NOT NULL, revelation_order INTEGER NOT NULL
        );
        CREATE TABLE translation(
            id TEXT PRIMARY KEY, lang TEXT NOT NULL, name TEXT NOT NULL, translator TEXT NOT NULL,
            direction TEXT NOT NULL, sort INTEGER NOT NULL
        ) WITHOUT ROWID;
        CREATE TABLE translation_text(
            translation_id TEXT NOT NULL, ayah_id INTEGER NOT NULL, text TEXT NOT NULL,
            PRIMARY KEY(translation_id, ayah_id)
        ) WITHOUT ROWID;
        CREATE TABLE pool(name TEXT NOT NULL, position INTEGER NOT NULL, ayah_id INTEGER NOT NULL, PRIMARY KEY(name, position)) WITHOUT ROWID;
        """
    )
    cur.execute("INSERT INTO meta VALUES('schema_version','1')")
    cur.execute("INSERT INTO meta VALUES('data_version',?)", (version,))
    cur.execute("INSERT INTO meta VALUES('widget_fit',?)", (json.dumps(WIDGET_FIT),))
    cur.execute("INSERT INTO meta VALUES('basmala_uthmani',?)", (BASMALA["uthmani"],))
    cur.execute("INSERT INTO meta VALUES('basmala_simple',?)", (BASMALA["simple"],))
    cur.executemany(
        "INSERT INTO surah VALUES(?,?,?,?,?,?,?,?,?)",
        [(s.id, s.ayahs, s.start + 1, s.name_ar, s.name_fa, s.name_tr, s.name_en, s.revelation, s.order) for s in surahs],
    )
    if widget:
        cur.execute("CREATE TABLE ayah(id INTEGER PRIMARY KEY, surah INTEGER NOT NULL, number INTEGER NOT NULL, text_simple TEXT NOT NULL)")
    else:
        cur.execute(
            """CREATE TABLE ayah(
            id INTEGER PRIMARY KEY, surah INTEGER NOT NULL, number INTEGER NOT NULL,
            page INTEGER NOT NULL, juz INTEGER NOT NULL, hizb_quarter INTEGER NOT NULL, sajda TEXT,
            text_uthmani TEXT NOT NULL, text_simple TEXT NOT NULL, text_clean TEXT NOT NULL)"""
        )
        cur.execute("CREATE UNIQUE INDEX ayah_ref ON ayah(surah, number)")
    sajda_ids = {m[3]: m[4] for m in marks["sajda"]}
    for s in surahs:
        for n in range(1, s.ayahs + 1):
            aid = ayah_id(s, n)
            k = (s.id, n)
            if widget:
                cur.execute("INSERT INTO ayah VALUES(?,?,?,?)", (aid, s.id, n, texts["simple"][k]))
            else:
                cur.execute(
                    "INSERT INTO ayah VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (aid, s.id, n, segment_of(marks["page"], aid), segment_of(marks["juz"], aid), segment_of(marks["hizb_quarter"], aid),
                     sajda_ids.get(aid), texts["uthmani"][k], texts["simple"][k], texts["clean"][k]),
                )
    chosen = [(i, tid, info) for i, (tid, info) in enumerate(translations.items()) if info["widget"] or not widget]
    for sort, tid, info in chosen:
        cur.execute("INSERT INTO translation VALUES(?,?,?,?,?,?)", (tid, info["lang"], info["name"], info["translator"], info["dir"], sort))
        cur.executemany(
            "INSERT INTO translation_text VALUES(?,?,?)",
            [(tid, ayah_id(s, n), info["texts"][(s.id, n)]) for s in surahs for n in range(1, s.ayahs + 1)],
        )
    for name, ids in pools.items():
        if widget and name.startswith("fits.") and name[5:] not in {t for _, t, _ in chosen}:
            continue
        cur.executemany("INSERT INTO pool VALUES(?,?,?)", [(name, i, a) for i, a in enumerate(ids)])
    if not widget:
        # Full-text search. Contentless: rowid = source_index * 10000 + ayah_id, so the table stays small.
        cur.execute("CREATE TABLE search_source(idx INTEGER PRIMARY KEY, source TEXT NOT NULL)")
        cur.execute("CREATE VIRTUAL TABLE search USING fts5(text, content='', tokenize='unicode61 remove_diacritics 2')")
        sources = ["arabic"] + [tid for _, tid, _ in chosen]
        cur.executemany("INSERT INTO search_source VALUES(?,?)", list(enumerate(sources)))
        for s in surahs:
            for n in range(1, s.ayahs + 1):
                aid = ayah_id(s, n)
                cur.execute("INSERT INTO search(rowid, text) VALUES(?,?)", (aid, texts["clean"][(s.id, n)]))
        for idx, (_, tid, info) in enumerate(chosen, start=1):
            for s in surahs:
                for n in range(1, s.ayahs + 1):
                    cur.execute("INSERT INTO search(rowid, text) VALUES(?,?)", (idx * 10000 + ayah_id(s, n), info["texts"][(s.id, n)]))
        cur.execute("INSERT INTO search(search) VALUES('optimize')")
    db.commit()
    db.execute("VACUUM")
    db.close()


def build_web(out: Path, *, surahs, marks, texts, translations, pools, version: str, tafsir: list[str] | None = None, wbw: bool = False):
    if out.exists():
        shutil.rmtree(out)
    order = [(s.id, n) for s in surahs for n in range(1, s.ayahs + 1)]
    for key, per in texts.items():
        write_json(out / "text" / f"{key}.json", [per[k] for k in order])
    for tid, info in translations.items():
        write_json(out / "tr" / f"{tid}.json", [info["texts"][k] for k in order])
    write_json(out / "pools.json", {"fit": WIDGET_FIT, "pools": pools})
    write_json(
        out / "meta.json",
        {
            "version": version,
            "basmala": BASMALA,
            "surahs": [
                {"id": s.id, "ayahs": s.ayahs, "first": s.start + 1, "ar": s.name_ar, "fa": s.name_fa, "tr": s.name_tr, "en": s.name_en,
                 "type": s.revelation, "order": s.order}
                for s in surahs
            ],
            "juz": [{"n": i, "surah": su, "ayah": a, "id": mid} for i, su, a, mid, _ in marks["juz"]],
            "hizbQuarters": [{"n": i, "surah": su, "ayah": a, "id": mid} for i, su, a, mid, _ in marks["hizb_quarter"]],
            "pages": [mid for _, _, _, mid, _ in marks["page"]],
            "sajdas": [{"surah": su, "ayah": a, "id": mid, "type": t} for _, su, a, mid, t in marks["sajda"]],
            "translations": [
                {"id": tid, "lang": i["lang"], "name": i["name"], "translator": i["translator"], "dir": i["dir"], "widget": i["widget"]}
                for tid, i in translations.items()
            ],
            # tafsirs in data/<id>/ (private builds only; the public site has none)
            "tafsir": tafsir or [],
            # word-by-word Persian meanings in data/wbw/<surah>.json (tools/wbw.py)
            **({"wbw": "fa"} if wbw else {}),
        },
    )


# --------------------------------------------------------------------------- main


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="download and validate only")
    ap.add_argument("--refresh", action="store_true", help="re-download everything")
    ap.add_argument("--study-quran", type=Path, help="complete Study Quran content database (the Pages deploy unpacks assets/study-quran into one)")
    ap.add_argument("--study-quran-audio", type=Path, action="append", default=[],
                    help="local commentary audio package folder; repeat for each surah (requires --study-quran)")
    ap.add_argument("--web-dir", type=Path, default=ROOT / "web" / "public" / "data")
    ap.add_argument("--ios-db", type=Path, default=ROOT / "ios" / "Zekr" / "Resources" / "quran.sqlite")
    ap.add_argument("--widget-db", type=Path, default=ROOT / "ios" / "ZekrWidgets" / "Resources" / "widget.sqlite")
    ap.add_argument("--almizan", action="store_true", help="also build the Al-Mizan tafsir database for the iPhone app")
    ap.add_argument("--almizan-db", type=Path, default=ROOT / "ios" / "Zekr" / "Resources" / "almizan.sqlite")
    ap.add_argument(
        "--almizan-web", action="store_true",
        help="also put Al-Mizan into the web data (private builds only: never deploy it publicly, see docs/PLAN.md §8)",
    )
    ap.add_argument("--no-wbw", action="store_true", help="leave out the word-by-word Persian meanings (no download)")
    args = ap.parse_args(argv)
    if args.study_quran_audio and not args.study_quran:
        ap.error("--study-quran-audio requires --study-quran")

    report = Report()
    hashes: dict[str, str] = {}

    meta_raw = fetch(TANZIL_META_URL, RAW_DIR / "quran-data.xml", args.refresh)
    hashes["quran-data.xml"] = hashlib.sha256(meta_raw).hexdigest()
    surahs, marks = load_metadata(meta_raw)
    if len(surahs) != SURAH_COUNT or sum(s.ayahs for s in surahs) != AYAH_COUNT:
        report.error("metadata does not describe 114 surahs / 6,236 ayahs")
    check_surah_names(surahs, report)

    texts: dict[str, dict] = {}
    for kind, key in TEXTS.items():
        raw = fetch(TANZIL_TEXT_URL.format(kind=kind), RAW_DIR / f"text.{kind}.txt", args.refresh)
        hashes[f"text.{kind}"] = hashlib.sha256(raw).hexdigest()
        parsed, _ = parse_tanzil(raw.decode("utf-8"))
        texts[key] = {k: normalize_plain(v) for k, v in parsed.items()}
        check_shape(f"text.{kind}", texts[key], surahs, report)
        if not report.errors:
            texts[key] = strip_basmala(texts[key])
    if not report.errors:
        check_arabic(texts["uthmani"], texts["simple"], texts["clean"], report)

    translations: dict[str, dict] = {}
    for tid, widget in TRANSLATIONS:
        raw = fetch(TANZIL_TRANS_URL.format(tid=tid), RAW_DIR / f"tr.{tid}.txt", args.refresh)
        hashes[f"tr.{tid}"] = hashlib.sha256(raw).hexdigest()
        parsed, header = parse_tanzil(raw.decode("utf-8"))
        lang = tid.split(".")[0]
        base = normalize_persian if lang == "fa" else normalize_plain
        norm = lambda v: base(strip_markup(v))
        info = {
            "lang": lang,
            "name": norm(header.get("Name", tid)),
            "translator": header.get("Translator", ""),
            "dir": "rtl" if lang == "fa" else "ltr",
            "widget": widget,
            "texts": {k: norm(v) for k, v in parsed.items()},
        }
        check_shape(tid, info["texts"], surahs, report, allow_empty=3)
        translations[tid] = info
        if not report.errors:
            check_translation(tid, info["texts"], texts["clean"], report)

    words = None
    if not args.no_wbw:
        import wbw
        try:
            raw = wbw.fetch(RAW_DIR / "quran_wbw_fa.zip", args.refresh)
            words = wbw.load(raw, [s.ayahs for s in surahs], normalize_persian)
            hashes["wbw"] = wbw.SHA256
        except (ValueError, RuntimeError, OSError, KeyError) as e:
            report.error(f"word by word: {e}")

    audio_assets = {}
    if args.study_quran:
        from study_quran import load_translation, checksum, TRANSLATION
        try:
            translations[TRANSLATION] = load_translation(args.study_quran, surahs)
            hashes["study_quran"] = checksum(args.study_quran)
            if args.study_quran_audio:
                from study_audio import load_audio, fingerprint
                audio_assets = load_audio(args.study_quran_audio, args.study_quran)
                hashes["study_quran_audio"] = fingerprint(audio_assets)
        except (ValueError, sqlite3.Error, OSError) as e:
            report.error(f"Study Quran: {e}")

    for w in report.warnings:
        print("warning:", w)
    if report.errors:
        for e in report.errors:
            print("ERROR:", e, file=sys.stderr)
        return 1

    BASMALA.update(uthmani=texts["uthmani"][(1, 1)], simple=texts["simple"][(1, 1)])
    pools = build_pools(surahs, texts["simple"], translations)
    if args.almizan_web:
        hashes["almizan-web"] = "1"  # a build with the tafsir gets its own data version
    version = hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()[:12]
    print(f"ok: {len(surahs)} surahs, {AYAH_COUNT} ayahs, {len(translations)} translations, data version {version}")
    for name in ("all", "fits.fa.safavi", "fits.fa.fooladvand", "fits.en.sahih"):
        print(f"  pool {name}: {len(pools[name])} ayahs")
    if args.check:
        return 0

    kw = dict(surahs=surahs, marks=marks, texts=texts, translations=translations, pools=pools, version=version)
    build_sqlite(args.ios_db, widget=False, **kw)
    build_sqlite(args.widget_db, widget=True, **kw)
    build_web(args.web_dir, tafsir=["almizan"] if args.almizan_web else None, wbw=words is not None, **kw)
    if words is not None:
        import wbw
        wbw.build_web(args.web_dir, words, [s.ayahs for s in surahs])
    if args.study_quran:
        from study_quran import install_sqlite, export_web
        install_sqlite(args.study_quran, args.ios_db)
        export_web(args.study_quran, args.web_dir)
    from study_audio import install as install_audio
    install_audio(audio_assets, args.ios_db, args.web_dir)
    for p in (args.ios_db, args.widget_db):
        print(f"wrote {p.relative_to(ROOT)} ({p.stat().st_size / 1e6:.1f} MB)")
    if args.almizan or args.almizan_web:
        import almizan

        almizan.fetch_all()
        sections = almizan.load_all([s.ayahs for s in surahs], [s.start + 1 for s in surahs])
        almizan.build_sqlite(args.almizan_db, sections)
        print(f"wrote {args.almizan_db.relative_to(ROOT)} ({args.almizan_db.stat().st_size / 1e6:.1f} MB, {len(sections)} sections)")
        if args.almizan_web:
            almizan.build_web(args.web_dir, sections)
            print(f"wrote {args.web_dir.relative_to(ROOT)}/almizan/ (private build: do not deploy publicly)")
    total = sum(f.stat().st_size for f in args.web_dir.rglob("*.json"))
    print(f"wrote {args.web_dir.relative_to(ROOT)}/ ({total / 1e6:.1f} MB of JSON)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
