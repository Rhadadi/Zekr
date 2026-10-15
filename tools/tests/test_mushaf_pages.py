import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import mushaf_pages as m  # noqa: E402

try:
    import numpy as np
except ImportError:  # the page tool needs numpy and Pillow; the tests of its maths still run
    np = None


def marker_at(line: int, x: float) -> tuple[float, float]:
    return (x, m.LINE0 + m.PITCH * (line - 1))


LEFT, RIGHT = 40.0, 600.0  # text area, in output pixels


class LineTests(unittest.TestCase):
    def test_marker_height_gives_its_text_line(self):
        self.assertEqual(m.line_of(m.LINE0), 1)
        self.assertEqual(m.line_of(m.LINE0 + m.PITCH * 14 + 7), 15)
        self.assertEqual(m.line_of(10), 1)
        self.assertEqual(m.line_of(2000), 15)


class AyahRectTests(unittest.TestCase):
    def rects(self, marks, ayahs, lead=0):
        return m.ayah_rects(marks, ayahs, LEFT, RIGHT, lead=lead)

    def test_ayahs_run_right_to_left_and_across_lines(self):
        # ayah A ends mid line 1; B continues, fills line 2 and ends mid line 3 (markers: 400 on line 1, 250 on line 3)
        ayahs = [m.Ayah(5, False, 1), m.Ayah(6, False, 1)]
        marks = [marker_at(1, 400), marker_at(3, 250)]
        rects, used = self.rects(marks, ayahs)
        a, b = rects
        self.assertEqual(len(a), 1)
        self.assertEqual((a[0][0], a[0][0] + a[0][2]), (400 - 13, RIGHT))  # from its marker's left edge to the right edge
        self.assertEqual(len(b), 3)
        self.assertEqual(b[0][0] + b[0][2], 400 - 13)  # B starts just left of A's marker
        self.assertEqual((b[1][0], b[1][0] + b[1][2]), (LEFT, RIGHT))  # a whole line
        self.assertEqual(b[2][0], 250 - 13)
        self.assertEqual(used, {1, 2, 3})

    def test_a_marker_at_the_end_of_a_line_starts_the_next_ayah_on_the_next_line(self):
        ayahs = [m.Ayah(1, False, 1), m.Ayah(2, False, 1)]
        marks = [marker_at(1, 50), marker_at(2, 300)]  # 50 - 13 is within 14px of the text edge
        rects, _ = self.rects(marks, ayahs)
        self.assertEqual(rects[1][0][0] + rects[1][0][2], RIGHT)

    def test_a_new_surah_skips_its_banner_and_basmala(self):
        ayahs = [m.Ayah(7, False, 1), m.Ayah(1, True, 1)]
        marks = [marker_at(2, 300), marker_at(5, 400)]
        rects, used = self.rects(marks, ayahs)
        self.assertEqual(len(rects[1]), 1)  # lines 3 (banner) and 4 (basmala) are not part of the ayah; it is on line 5
        self.assertEqual(used, {1, 2, 3, 4, 5})

    def test_surah_9_has_no_basmala(self):
        ayahs = [m.Ayah(7, False, 1), m.Ayah(1, True, 0)]
        marks = [marker_at(2, 300), marker_at(4, 400)]
        _, used = self.rects(marks, ayahs)
        self.assertEqual(used, {1, 2, 3, 4})  # line 3 is the banner

    def test_a_banner_at_the_bottom_of_the_page_before_leaves_only_the_basmala_on_top(self):
        _, used = self.rects([marker_at(2, 300)], [m.Ayah(1, True, 1)], lead=1)
        self.assertEqual(used, {1, 2})  # line 1 basmala, line 2 the ayah

    def test_the_wrong_number_of_markers_is_an_error(self):
        with self.assertRaises(m.MushafError):
            self.rects([marker_at(1, 300)], [m.Ayah(1, False, 1), m.Ayah(2, False, 1)])

    def test_an_ayah_that_ends_before_it_starts_is_an_error(self):
        with self.assertRaises(m.MushafError):  # the banner and basmala push the ayah to line 5, but its marker is on line 3
            self.rects([marker_at(2, 300), marker_at(3, 300)], [m.Ayah(7, False, 1), m.Ayah(1, True, 1)])

    def test_the_opening_pages_have_one_box_set_per_ayah(self):
        self.assertEqual(len(m.opening_rects(1)), 7)
        self.assertEqual(len(m.opening_rects(2)), 5)


@unittest.skipUnless(np is not None, "needs numpy")
class MarkerFindingTests(unittest.TestCase):
    def page(self):
        a = np.full((1075, 750, 3), (230, 247, 254), dtype=int)
        a[:, 82:86] = (20, 120, 160)    # left frame lines
        a[:, 664:668] = (20, 120, 160)  # right frame lines
        return a

    def put_marker(self, a, cx, cy):
        a[cy - 7 : cy + 7, cx - 10 : cx + 11] = (195, 235, 252)  # the pale-blue fill

    def test_finds_markers_by_their_fill_and_ignores_the_rest(self):
        a = self.page()
        self.put_marker(a, 300, 300)
        self.put_marker(a, 500, 460)
        a[600:640, 200:208] = (195, 235, 252)  # a thin sliver of similar colour is not a marker
        left, right = m.find_frame(a)
        self.assertEqual((left, right), (82, 667))
        found = sorted(m.find_markers(a, left, right), key=lambda p: p[1])
        self.assertEqual(len(found), 2)
        for (x, y), (ex, ey) in zip(found, [(300, 300), (500, 460)]):
            self.assertAlmostEqual(x, ex, delta=2)
            self.assertAlmostEqual(y, ey, delta=2)


if __name__ == "__main__":
    unittest.main()
