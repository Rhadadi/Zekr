import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_data as bd  # noqa: E402

BASMALA = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"


def surah(index, ayas, start):
    return bd.Surah(ET.Element("sura", {"index": str(index), "ayas": str(ayas), "start": str(start), "name": "x", "tname": "x",
                                         "ename": "x", "type": "Meccan", "order": "1", "rukus": "1"}))


class Normalization(unittest.TestCase):
    def test_persian_letters_and_digits(self):
        self.assertEqual(bd.normalize_persian("كتاب  ي ى ٣"), "کتاب ی ی ۳")

    def test_persian_keeps_zwnj(self):
        self.assertEqual(bd.normalize_persian("می‌رود"), "می‌رود")

    def test_plain_collapses_spaces(self):
        self.assertEqual(bd.normalize_plain("  a   b  "), "a b")

    def test_strip_markup(self):
        self.assertEqual(bd.strip_markup("Bismi All<u>a</U>hi a<b>l</B>"), "Bismi Allahi al")

    def test_letters_only_drops_marks(self):
        self.assertEqual(bd.letters_only("بِسْمِ"), "بسم")


class Parsing(unittest.TestCase):
    def test_parse_with_header(self):
        raw = "# Name: صفوی\n# Translator: Someone\n\n1|1|الف\n1|2|ب\n"
        texts, header = bd.parse_tanzil(raw)
        self.assertEqual(texts, {(1, 1): "الف", (1, 2): "ب"})
        self.assertEqual(header["Translator"], "Someone")

    def test_text_may_contain_pipes(self):
        texts, _ = bd.parse_tanzil("1|1|a|b\n")
        self.assertEqual(texts[(1, 1)], "a|b")

    def test_duplicate_is_an_error(self):
        with self.assertRaises(ValueError):
            bd.parse_tanzil("1|1|a\n1|1|b\n")

    def test_garbage_is_an_error(self):
        with self.assertRaises(ValueError):
            bd.parse_tanzil("hello\n")


class Basmala(unittest.TestCase):
    def texts(self):
        t = {(1, 1): BASMALA}
        for s in range(2, 115):
            t[(s, 1)] = ("" if s == 9 else BASMALA + " ") + f"كلمة{s} أخرى"
        return t

    def test_stripped_from_every_surah_but_1_and_9(self):
        out = bd.strip_basmala(self.texts())
        self.assertEqual(out[(1, 1)], BASMALA)
        self.assertEqual(out[(2, 1)], "كلمة2 أخرى")
        self.assertEqual(out[(9, 1)], "كلمة9 أخرى")

    def test_tolerates_spelling_variant_like_95_1(self):
        t = self.texts()
        t[(95, 1)] = "بِّسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ وَالتِّينِ"
        self.assertEqual(bd.strip_basmala(t)[(95, 1)], "وَالتِّينِ")

    def test_missing_basmala_is_an_error(self):
        t = self.texts()
        t[(36, 1)] = "يس"
        with self.assertRaises(ValueError):
            bd.strip_basmala(t)


class Metadata(unittest.TestCase):
    def test_ayah_id_is_global_and_one_based(self):
        s1, s2 = surah(1, 7, 0), surah(2, 286, 7)
        self.assertEqual(bd.ayah_id(s1, 1), 1)
        self.assertEqual(bd.ayah_id(s2, 1), 8)

    def test_segment_of(self):
        marks = [(1, 1, 1, 1, None), (2, 2, 142, 149, None), (3, 2, 253, 260, None)]
        self.assertEqual(bd.segment_of(marks, 1), 1)
        self.assertEqual(bd.segment_of(marks, 148), 1)
        self.assertEqual(bd.segment_of(marks, 149), 2)
        self.assertEqual(bd.segment_of(marks, 6236), 3)

    def test_persian_surah_names(self):
        self.assertEqual(len(bd.SURAH_NAMES_FA), 114)
        self.assertEqual(bd.SURAH_NAMES_FA[0], "فاتحه")
        self.assertEqual(bd.SURAH_NAMES_FA[16], "اسراء")  # 17
        self.assertEqual(bd.SURAH_NAMES_FA[113], "ناس")


class Pools(unittest.TestCase):
    def test_fits_pool_excludes_long_and_empty(self):
        surahs = [surah(1, 4, 0)]
        ar = {(1, 1): "ب" * 10, (1, 2): "ب" * 10, (1, 3): "ب" * 50, (1, 4): "ب" * 10}
        tr = {"x.y": {"texts": {(1, 1): "short", (1, 2): "", (1, 3): "short", (1, 4): "t" * 200}}}
        pools = bd.build_pools(surahs, ar, tr)
        self.assertEqual(pools["all"], [1, 2, 3, 4])
        self.assertEqual(pools["fits.x.y"], [1])


if __name__ == "__main__":
    unittest.main()
