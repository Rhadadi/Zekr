import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import classical_tafsir  # noqa: E402

# A made-up surah of six ayahs, as Tanzil's simple-clean text has them (not from the Quran).
SURAH = ["كتبنا كتابا جديدا", "وقرانا فيه صفحة", "ثم جلسنا تحت شجرة كبيرة", "ونظرنا الى السماء", "فراينا نجما بعيدا", "وعدنا الى بيتنا"]

# Made-up sessions in the shape of Kashf al-Asrar on ganjoor.net (not Meybodi's text): [title, text] in order. The first
# round quotes the ayahs vowelled, phrase by phrase, each followed by its Persian.
SECTIONS = [
    ["بخش ۱ - ۱ - النوبة الاولى", "قوله تعالی: «کَتَبْنا کِتاباً جَدِیداً» نوشتیم نامه‌ای نو\n«وَ قَرَأْنا فِیهِ صَفْحَةً» و صفحه‌ای از آن خواندیم"],
    ["بخش ۲ - ۱ - النوبة الثانیة", "تفسیر یک و دو"],
    ["بخش ۳ - ۱ - النوبة الثالثة", "عرفانی یک و دو"],
    # the same round spelt with a Persian yeh
    ["بخش ۴ - ۲ - النوبة الاولی", "قوله تعالی: «ثُمَّ جَلَسْنا تَحْتَ شَجَرَةٍ» سپس زیر درختی نشستیم\n«وَ نَظَرْنا إِلَی السَّماءِ» و به آسمان نگریستیم"],
    ["بخش ۵ - ۲ - النوبة الثانیة", "تفسیر سه و چهار"],
    # quoted words that are not in the surah: this session stays with the one before
    ["بخش ۶ - ۳ - النوبة الاولى", "«کَلِماتٌ لَیْسَتْ هُنا أَبَداً» سخنانی که اینجا نیست"],
    ["بخش ۷ - ۳ - النوبة الثالثة", "عرفانی بی‌جا"],
    # the last session runs to the end of the surah
    ["بخش ۸ - ۴ - النوبة الاولى", "«فَرَأَیْنا نَجْماً بَعِیداً» ستاره‌ای دور دیدیم"],
    ["بخش ۹ - ۴ - النوبة الثالثة", "عرفانی باقی"],
]


class SessionsTest(unittest.TestCase):
    def test_each_ayah_has_the_whole_session_it_is_in(self):
        texts = classical_tafsir.read_sessions(SECTIONS, SURAH)
        self.assertEqual(sorted(texts), [1, 2, 3, 4, 5, 6])
        self.assertEqual(texts[1], texts[2])
        self.assertEqual(texts[1].split("\n"), [
            "# النوبة الاولی — ترجمه", "قوله تعالی: «کَتَبْنا کِتاباً جَدِیداً» نوشتیم نامه‌ای نو", "«وَ قَرَأْنا فِیهِ صَفْحَةً» و صفحه‌ای از آن خواندیم",
            "# النوبة الثانیة — تفسیر", "تفسیر یک و دو",
            "# النوبة الثالثة — تفسیر عرفانی", "عرفانی یک و دو",
        ])
        self.assertNotEqual(texts[2], texts[3])
        self.assertEqual(texts[3], texts[4])
        self.assertIn("تفسیر سه و چهار", texts[3])
        self.assertIn("عرفانی بی‌جا", texts[4])  # the session that could not be placed
        self.assertNotEqual(texts[4], texts[5])
        self.assertEqual(texts[5], texts[6])
        self.assertIn("عرفانی باقی", texts[6])

    def test_a_session_is_looked_for_after_the_one_before(self):
        surah = ["قل هو الحق", "ثم قل هو الحق مرة اخرى"]
        sections = [["النوبة الاولى", "«قُلْ هُوَ الْحَقُّ» بگو"], ["النوبة الاولى", "«قُلْ هُوَ الْحَقُّ مَرَّةً» بگو باز"]]
        texts = classical_tafsir.read_sessions(sections, surah)
        self.assertNotEqual(texts[1], texts[2])
        self.assertIn("باز", texts[2])


if __name__ == "__main__":
    unittest.main()
