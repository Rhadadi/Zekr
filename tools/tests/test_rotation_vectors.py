import subprocess
import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
import gen_rotation_vectors as g  # noqa: E402


class RotationReference(unittest.TestCase):
    def test_vector_file_is_up_to_date(self):
        self.assertEqual(subprocess.run([sys.executable, "-I", str(TOOLS / "gen_rotation_vectors.py"), "--check"]).returncode, 0,
                         "run: python3 tools/gen_rotation_vectors.py")

    def test_every_ayah_once_per_cycle(self):
        pool = list(range(1, 51))
        for cycle in range(3):
            shown = [g.ayah_for_slot(pool, cycle * 50 + i) for i in range(50)]
            self.assertEqual(sorted(shown), pool)

    def test_cycles_differ(self):
        pool = list(range(1, 51))
        a = [g.ayah_for_slot(pool, i) for i in range(50)]
        b = [g.ayah_for_slot(pool, 50 + i) for i in range(50)]
        self.assertNotEqual(a, b)

    def test_slot_is_local_time(self):
        # 22:00 UTC on day D is already day D+1 in UTC+3:30
        t = 1760306400  # 2025-10-12 22:00:00 UTC
        self.assertEqual(g.slot_for(t, 12600, 86400), g.slot_for(t, 0, 86400) + 1)


if __name__ == "__main__":
    unittest.main()
