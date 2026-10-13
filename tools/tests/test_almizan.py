import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import almizan  # noqa: E402

# Ayah counts of the 114 surahs (Tanzil metadata).
AYAH_COUNTS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227,
    93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96,
    29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17,
    19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]

# Made-up text in the source's markup (not from Al-Mizan).
SAMPLE = (
    '<h2 class="sura">سوره نمونه 12 آیه</h2><h3 class="ayas">سوره نمونه آیه‌های ۱ تا ۲</h3><code class="section" rel="99_1-2"/>'
    '<h3>ترجمه آیات</h3> <p> <span class="trans" rel="99_1">یک.  «۱» </span><span class="trans" rel="99_2">دو. <code class="page" rel="1,2"/> «۲» </span></p>'
    '<h3>بیان آیات‌ <span class="title" rel="99_1 99_2">موضوع <span class="aya" rel="99_1" data-words="1-2">قل هو</span></span> </h3>'
    '<p> کلمه <em rel="x" data-sentence="1:2">هو</em> در اینجا<span class="footnote" rel="1" title="کتاب &lt;em&gt;الف&lt;/em&gt;، ج ۱">*</span>   معنا دارد. </p>'
    '<p><code class="aya" rel="99_2"/> <span class="phrase">و در حدیث: <span class="hadith"><span class="from">از امام</span> متن حدیث</span>'
    '<span class="footnote" rel="2" title="منبع دوم">*</span>.</span></p>'
    '<h3> <span class="title" rel="99_2">موضوع دوم</span> </h3><p>متن</p>'
)


class Sections(unittest.TestCase):
    def test_vendored_list_covers_every_ayah_once(self):
        sections = almizan.load_sections()
        self.assertEqual(len(sections), 594)
        self.assertEqual(almizan.check_coverage(sections, AYAH_COUNTS), [])
        self.assertEqual(sections[0], ("1_1-5", 1, 1, 5))
        self.assertEqual(sections[-1], ("114_1-6", 114, 1, 6))

    def test_coverage_finds_gaps_and_overlaps(self):
        counts = [7]
        self.assertEqual(almizan.check_coverage([("1_1-5", 1, 1, 5), ("1_6-7", 1, 6, 7)], counts), [])
        self.assertTrue(almizan.check_coverage([("1_1-4", 1, 1, 4), ("1_6-7", 1, 6, 7)], counts))
        self.assertTrue(almizan.check_coverage([("1_1-5", 1, 1, 5), ("1_5-7", 1, 5, 7)], counts))
        self.assertTrue(almizan.check_coverage([("1_1-5", 1, 1, 5)], counts))


class Parse(unittest.TestCase):
    def setUp(self):
        self.sec = almizan.parse_section("99_1-2", SAMPLE)

    def test_title_and_range(self):
        self.assertEqual((self.sec["surah"], self.sec["from"], self.sec["to"]), (99, 1, 2))
        self.assertEqual(self.sec["title"], "سوره نمونه آیه‌های ۱ تا ۲")

    def test_blocks(self):
        kinds = [b["t"] for b in self.sec["blocks"]]
        self.assertEqual(kinds, ["s", "h", "p", "h", "t", "p", "p", "t", "p"])
        self.assertEqual(self.sec["blocks"][2]["r"], [["یک. «۱» دو. «۲»"]])
        self.assertEqual(self.sec["blocks"][3]["r"], [["بیان آیات"]], "part name, without the trailing ZWNJ")
        self.assertEqual(self.sec["blocks"][4]["r"], [["موضوع "], ["قل هو", "q"]])

    def test_inline_styles_and_footnotes(self):
        self.assertEqual(self.sec["blocks"][5]["r"], [["کلمه "], ["هو", "e"], [" در اینجا"], [1, "n"], [" معنا دارد."]])
        self.assertEqual(self.sec["blocks"][6]["r"], [["و در حدیث: "], ["از امام متن حدیث", "d"], [2, "n"], ["."]])
        self.assertEqual(self.sec["notes"], ["کتاب الف، ج ۱", "منبع دوم"])

    def test_persian_digits(self):
        self.assertEqual(self.sec["blocks"][0]["r"], [["سوره نمونه ۱۲ آیه"]])

    def test_plain_length(self):
        self.assertGreater(almizan.plain_length(self.sec), 40)


if __name__ == "__main__":
    unittest.main()
