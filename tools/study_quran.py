"""Standard-library adapter for a complete, locally imported Study Quran package."""
from __future__ import annotations
import csv
import hashlib
import json
import sqlite3
from pathlib import Path

SOURCE = "study_quran"
TRANSLATION = "en.study_quran"
CONTENT_TABLES = ("source", "surah_introduction", "surah_opening", "tafsir_entry",
                  "tafsir_ayah", "source_span", "cross_reference", "import_issue")


def open_package(path):
    db = sqlite3.connect(Path(path).resolve().as_uri()+"?mode=ro",uri=True)
    db.row_factory = sqlite3.Row
    return db


def load_translation(path, surahs):
    with open_package(path) as db:
        source = db.execute("SELECT * FROM source WHERE id=?",(SOURCE,)).fetchone()
        if not source or not source["complete"]:
            raise ValueError("Study Quran package is a pilot/incomplete import; full builds require complete data")
        expected = {s.start+n:(s.id,n) for s in surahs for n in range(1,s.ayahs+1)}
        actual = {r["id"]:(r["surah"],r["number"]) for r in db.execute("SELECT * FROM ayah")}
        if actual != expected:
            raise ValueError("Study Quran verse IDs/numbering do not match Zekr")
        info = db.execute("SELECT * FROM translation WHERE id=?",(TRANSLATION,)).fetchone()
        texts = {actual[r["ayah_id"]]:r["text"] for r in db.execute(
            "SELECT ayah_id,text FROM translation_text WHERE translation_id=?",(TRANSLATION,))}
        if len(texts)!=len(expected) or any(not t.strip() for t in texts.values()):
            raise ValueError("Study Quran translations are missing/empty")
        if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok" or db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Study Quran package failed SQLite integrity checks")
        covered = {r[0] for r in db.execute("SELECT DISTINCT ayah_id FROM tafsir_ayah")}
        if not covered.issubset(expected):
            raise ValueError("Study Quran commentary references unknown ayahs")
        return {"lang":"en","name":info["name"],"translator":info["translator"],
                "dir":"ltr","widget":False,"texts":texts}


def install_sqlite(package, destination):
    with open_package(package) as src, sqlite3.connect(destination) as dest:
        dest.execute("PRAGMA foreign_keys=ON")
        for table in CONTENT_TABLES:
            sql = src.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone()[0]
            dest.execute(sql)
            rows = src.execute(f"SELECT * FROM {table}").fetchall()
            if rows:
                dest.executemany(f"INSERT INTO {table} VALUES({','.join('?' for _ in rows[0])})",rows)
        dest.execute("CREATE INDEX tafsir_by_ayah ON tafsir_ayah(ayah_id,entry_id)")
        dest.execute("CREATE INDEX span_by_record ON source_span(record_type,record_id)")
        dest.execute("CREATE VIRTUAL TABLE tafsir_search USING fts5(entry_id UNINDEXED,text,tokenize='unicode61 remove_diacritics 2')")
        dest.executemany("INSERT INTO tafsir_search VALUES(?,?)",
                         [(r[0],r[1]+" "+r[2]) for r in src.execute("SELECT id,lemma_text,text FROM tafsir_entry")])
        dest.execute("INSERT OR REPLACE INTO meta VALUES('study_quran','1')")
        dest.execute("INSERT OR REPLACE INTO meta VALUES('schema_version','2')")
        if dest.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Zekr content integration failed foreign-key validation")


def write_json(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")


def export_web(package, out):
    out = Path(out)
    with open_package(package) as src:
        meta_path = out/"meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        source = dict(src.execute("SELECT * FROM source WHERE id=?",(SOURCE,)).fetchone())
        meta["studyQuran"] = {"id":SOURCE,"name":source["title"],"pdfSha256":source["pdf_sha256"],
                              "importVersion":source["import_version"]}
        for surah in src.execute("SELECT id FROM surah ORDER BY id"):
            s = surah[0]
            intro = dict(src.execute("SELECT text,html FROM surah_introduction WHERE surah_id=?",(s,)).fetchone())
            intro["pages"] = [r[0] for r in src.execute(
                "SELECT DISTINCT pdf_page FROM source_span WHERE record_type='introduction' AND record_id=? ORDER BY pdf_page",(str(s),))]
            write_json(out/"intro"/SOURCE/f"{s}.json",intro)
            entries, by_ayah = [], {}
            for row in src.execute("SELECT * FROM tafsir_entry WHERE surah_id=? ORDER BY source_order",(s,)):
                entry = dict(row)
                entry["ayah_ids"] = [r[0] for r in src.execute("SELECT ayah_id FROM tafsir_ayah WHERE entry_id=? ORDER BY ayah_id",(row["id"],))]
                entry["pages"] = [r[0] for r in src.execute("SELECT DISTINCT pdf_page FROM source_span WHERE record_type='tafsir' AND record_id=? ORDER BY pdf_page",(row["id"],))]
                entry["references"] = [dict(r) for r in src.execute("SELECT raw,target_kind,target_surah,first_ayah,last_ayah FROM cross_reference WHERE record_type='tafsir' AND record_id=? ORDER BY char_start",(row["id"],))]
                for aid in entry["ayah_ids"]:
                    by_ayah.setdefault(str(aid),[]).append(entry["id"])
                entries.append(entry)
            write_json(out/"tafsir"/SOURCE/f"{s}.json",{"surah":s,"entries":entries,"byAyah":by_ayah})
        write_json(meta_path,meta)


def export_tables(package, out):
    """Reusable tables, independent of Zekr's web format."""
    out = Path(out)
    out.mkdir(parents=True,exist_ok=True)
    with open_package(package) as db:
        for table in ("surah","ayah","translation","translation_text",*CONTENT_TABLES):
            rows = [dict(r) for r in db.execute(f"SELECT * FROM {table}")]
            write_json(out/f"{table}.json",rows)
            if rows:
                with (out/f"{table}.csv").open("w",encoding="utf-8",newline="") as f:
                    w=csv.DictWriter(f,fieldnames=list(rows[0]))
                    w.writeheader()
                    w.writerows(rows)


def checksum(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
