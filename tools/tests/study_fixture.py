"""A made-up Study Quran package for tests: the real schema (docs/study-quran-schema.sql), filler text.

Nothing here is from the book. It has the shapes the importer produces: shared notes covering several ayahs,
overlapping notes, an ayah with no commentary, an unnumbered "quoted header" note, and cross-references.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AYAHS = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227,
         93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96,
         29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17,
         19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]
FIRST = [sum(AYAHS[:i]) + 1 for i in range(114)]


def ayah_id(surah: int, number: int) -> int:
    return FIRST[surah - 1] + number - 1


def build(path: Path, *, complete: bool = True) -> Path:
    """Writes the package to `path` and returns it."""
    path = Path(path)
    path.unlink(missing_ok=True)
    db = sqlite3.connect(path)
    schema = (ROOT / "docs" / "study-quran-schema.sql").read_text(encoding="utf-8")
    db.executescript(schema)
    db.execute("INSERT INTO source VALUES('study_quran','Fixture Quran','en','f0f0','fixture.pdf','test-1','verse',?)", (1 if complete else 0,))
    db.execute("INSERT INTO translation VALUES('en.study_quran','study_quran','en','Fixture translation','Nobody')")
    for s, count in enumerate(AYAHS, start=1):
        db.execute("INSERT INTO surah VALUES(?,?,?,?,?,?,?)", (s, count, FIRST[s - 1], f"Surah {s}", f"Surah {s}", s, s))
        db.execute("INSERT INTO surah_introduction VALUES('study_quran',?,?,?)", (s, f"[Fixture introduction to surah {s}.]\n\nSecond paragraph.", f"<p>[Fixture introduction to surah {s}.]</p><p>Second paragraph.</p>"))
        db.execute("INSERT INTO surah_opening VALUES('study_quran',?,?)", (s, f"[Fixture opening {s}]"))
        for n in range(1, count + 1):
            a = ayah_id(s, n)
            db.execute("INSERT INTO ayah VALUES(?,?,?)", (a, s, n))
            text = f"[Fixture translation {s}:{n}]"
            db.execute("INSERT INTO translation_text VALUES('en.study_quran',?,?,?)", (a, text, f"<p>{text}</p>"))
    entry_no = 0

    def entry(s, first, last, label, kind="explicit_note", text=None):
        nonlocal entry_no
        entry_no += 1
        eid = f"sq-{s}-{entry_no}"
        text = text or f"[Fixture commentary on {s}:{first}–{last}.] It mentions tawḥīd. See {s}:{first}."
        db.execute("INSERT INTO tafsir_entry VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                   (eid, "study_quran", s, label, first, last, entry_no, "", "", kind, text, f"<p>{text}</p>"))
        for n in range(first, last + 1):
            db.execute("INSERT INTO tafsir_ayah VALUES(?,?)", (eid, ayah_id(s, n)))
        db.execute("INSERT INTO source_span(source_id,record_type,record_id,pdf_page,char_start,char_end) VALUES('study_quran','tafsir',?,?,0,10)", (eid, 100 + s))
        db.execute("INSERT INTO cross_reference(record_type,record_id,char_start,char_end,raw,target_kind,target_surah,first_ayah,last_ayah) VALUES('tafsir',?,0,5,?,'ayah',?,?,?)",
                   (eid, f"{s}:{first}", s, first, first))
        return eid

    for s, count in enumerate(AYAHS, start=1):
        if s == 1:  # 1:7 is left without commentary
            entry(1, 1, 5, "1–5")
            entry(1, 6, 6, "6")
            continue
        n = 1
        while n <= count:
            last = min(count, n + 4)
            if s == 26 and n <= 110 <= last:
                last = 109  # 26:110 has no separately numbered commentary
            entry(s, n, last, f"{n}–{last}" if last > n else str(n))
            n = last + 1
            if s == 26 and n == 110:
                n = 111
    entry(2, 275, 281, "275–81")                   # a note that spans ayahs, beside the note on 275 alone
    entry(2, 275, 275, "275", text="[Fixture commentary on 2:275.] It mentions usury, once. See 2:275.")
    entry(2, 11, 12, "11–12")                      # overlaps the 6-10 / 11-15 groups: a shared, overlapping note
    entry(38, 5, 5, "", "quoted_header")           # an unnumbered note kept as the source has it
    db.execute("INSERT INTO import_issue(severity,surah_id,message) VALUES('warning',38,'fixture: unnumbered paragraph')")
    db.commit()
    db.execute("VACUUM")
    db.close()
    return path
