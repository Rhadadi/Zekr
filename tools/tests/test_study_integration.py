"""The Study Quran adapter, end to end, on a made-up package (no book text needed)."""
import json
import sqlite3
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as bd  # noqa: E402
import study_fixture as fx  # noqa: E402
import study_quran as sq  # noqa: E402


def surahs():
    return [bd.Surah(ET.Element("sura", {"index": str(i), "ayas": str(n), "start": str(fx.FIRST[i - 1] - 1), "name": "x", "tname": "x",
                                         "ename": "x", "type": "Meccan", "order": "1", "rukus": "1"}))
            for i, n in enumerate(fx.AYAHS, start=1)]


class StudyAdapter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        cls.pkg = fx.build(cls.dir / "study_quran.sqlite")
        cls.app_db = cls.dir / "quran.sqlite"
        db = sqlite3.connect(cls.app_db)
        # the parts of Zekr's own quran.sqlite the Study Quran tables point at
        db.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
        db.execute("CREATE TABLE surah(id INTEGER PRIMARY KEY)")
        db.execute("CREATE TABLE ayah(id INTEGER PRIMARY KEY)")
        db.executemany("INSERT INTO surah VALUES(?)", [(i,) for i in range(1, 115)])
        db.executemany("INSERT INTO ayah VALUES(?)", [(i,) for i in range(1, 6237)])
        db.commit()
        db.close()
        sq.install_sqlite(cls.pkg, cls.app_db)
        cls.web = cls.dir / "web"
        cls.web.mkdir()
        (cls.web / "meta.json").write_text(json.dumps({"version": "x"}), encoding="utf-8")
        sq.export_web(cls.pkg, cls.web)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_translation_is_separate_and_complete(self):
        info = sq.load_translation(self.pkg, surahs())
        self.assertEqual(len(info["texts"]), 6236)
        self.assertEqual(info["texts"][(2, 255)][:9], "[Fixture ")
        self.assertFalse(info["widget"], "the widget never gets the book's text")
        self.assertNotIn("commentary", " ".join(info["texts"].values()).lower())

    def test_pilot_package_is_refused(self):
        pilot = fx.build(self.dir / "pilot.sqlite", complete=False)
        with self.assertRaisesRegex(ValueError, "pilot/incomplete"):
            sq.load_translation(pilot, surahs())

    def test_shared_commentary_is_stored_once_and_links_to_every_ayah(self):
        db = sqlite3.connect(self.app_db)
        rows = db.execute("SELECT e.id, e.note_label FROM tafsir_entry e WHERE e.surah_id=2 AND e.first_ayah=1").fetchall()
        self.assertEqual(len(rows), 1)
        linked = [r[0] for r in db.execute("SELECT ayah_id FROM tafsir_ayah WHERE entry_id=? ORDER BY 1", (rows[0][0],))]
        self.assertEqual(linked, [fx.ayah_id(2, n) for n in range(1, 6)])
        # an overlapping note: 2:11 and 2:12 are in two notes each
        both = db.execute("SELECT count(*) FROM tafsir_ayah WHERE ayah_id IN (?,?)", (fx.ayah_id(2, 11), fx.ayah_id(2, 12))).fetchone()[0]
        self.assertEqual(both, 4)
        self.assertEqual(db.execute("SELECT count(*) FROM tafsir_ayah WHERE ayah_id=?", (fx.ayah_id(1, 7),)).fetchone()[0], 0)
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_search_index_and_meta(self):
        db = sqlite3.connect(self.app_db)
        self.assertEqual(db.execute("SELECT value FROM meta WHERE key='study_quran'").fetchone()[0], "1")
        hits = db.execute("SELECT entry_id FROM tafsir_search WHERE tafsir_search MATCH 'tawhid'").fetchall()
        self.assertGreater(len(hits), 1000, "diacritics are folded: tawḥīd is found as tawhid")

    def test_web_files_per_surah(self):
        meta = json.loads((self.web / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["studyQuran"]["id"], "study_quran")
        data = json.loads((self.web / "tafsir" / "study_quran" / "2.json").read_text(encoding="utf-8"))
        ids11 = data["byAyah"][str(fx.ayah_id(2, 11))]
        ids12 = data["byAyah"][str(fx.ayah_id(2, 12))]
        self.assertEqual(len(ids11), 2)
        self.assertEqual(set(ids11), set(ids12), "shared notes link to each ayah they cover")
        self.assertEqual(data["entries"][0]["pages"], [102])
        self.assertNotIn(str(fx.ayah_id(1, 7)), json.loads((self.web / "tafsir" / "study_quran" / "1.json").read_text(encoding="utf-8"))["byAyah"])
        self.assertTrue((self.web / "intro" / "study_quran" / "114.json").exists())

    def test_unnumbered_note_is_kept_as_in_the_source(self):
        db = sqlite3.connect(self.app_db)
        row = db.execute("SELECT note_label, coverage_kind FROM tafsir_entry WHERE surah_id=38 AND coverage_kind='quoted_header'").fetchone()
        self.assertEqual(row, ("", "quoted_header"))


if __name__ == "__main__":
    unittest.main()
