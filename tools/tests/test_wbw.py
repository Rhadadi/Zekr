import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import wbw  # noqa: E402


def made_up_zip(rows) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(wbw.MEMBER, json.dumps(rows, ensure_ascii=False))
    return buf.getvalue()


def row(s, a, p, ar, fa, kind="word"):
    return {"surah": s, "ayah": a, "position": p, "char_type": kind, "arabic": ar, "translation": fa}


class WordByWordTest(unittest.TestCase):
    # made-up words for a made-up two-surah book (2 ayahs, then 1)
    ROWS = [row(1, 1, 1, "ا", "يك"), row(1, 1, 2, "ب", "دو"), row(1, 2, 1, "ج", "سه"), row(2, 1, 1, "د", "چهار"), row(2, 1, 2, "۝", "", "end")]

    def test_words_per_ayah_in_order_with_persian_letters(self):
        words = wbw.load(made_up_zip(self.ROWS), [2, 1], lambda t: t.replace("ي", "ی").replace("ك", "ک"))
        self.assertEqual(words[(1, 1)], [("ا", "یک"), ("ب", "دو")])
        self.assertEqual(words[(2, 1)], [("د", "چهار")])  # the end-of-ayah sign is not a word

    def test_a_missing_ayah_or_a_word_out_of_order_is_an_error(self):
        with self.assertRaises(ValueError):
            wbw.load(made_up_zip(self.ROWS[:2] + self.ROWS[3:]), [2, 1], str)
        with self.assertRaises(ValueError):
            wbw.load(made_up_zip([self.ROWS[1], self.ROWS[0]] + self.ROWS[2:]), [2, 1], str)

    def test_web_files_one_per_surah(self):
        words = wbw.load(made_up_zip(self.ROWS), [2, 1], str)
        with tempfile.TemporaryDirectory() as d:
            wbw.build_web(Path(d), words, [2, 1])
            self.assertEqual(json.loads((Path(d) / "wbw" / "1.json").read_text()), [[["ا", "يك"], ["ب", "دو"]], [["ج", "سه"]]])
            self.assertEqual(json.loads((Path(d) / "wbw" / "2.json").read_text()), [[["د", "چهار"]]])

    def test_the_download_is_checked(self):
        with tempfile.TemporaryDirectory() as d:
            dest = Path(d) / "x.zip"
            dest.write_bytes(b"not the release")
            with self.assertRaises(ValueError):
                wbw.fetch(dest)


if __name__ == "__main__":
    unittest.main()
