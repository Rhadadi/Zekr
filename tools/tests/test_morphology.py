import gzip
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import morphology


ROWS = "\n".join([
    "(1:1:1:1)\twa\tCONJ\tPREFIX|w:CONJ+",
    "(1:1:1:2)\tDarabo\tV\tSTEM|POS:V|LEM:Daraba|ROOT:Drb",
    "(1:1:1:3)\ttum\tPRON\tSUFFIX|PRON:2MP",
    "(1:2:1:1)\tkitaAb\tN\tSTEM|POS:N|LEM:kitaAb|ROOT:ktb",
    "(2:1:1:1)\tyaDoribu\tV\tSTEM|POS:V|LEM:Daraba|ROOT:Drb",
])


class MorphologyTests(unittest.TestCase):
    def test_inflections_and_prefix_free_forms_share_the_annotated_root(self):
        data = morphology.parse(ROWS, [2, 1])
        for word in ("وضربتم", "ضربتم", "يضرب", "ضرب"):
            roots = [data["roots"][i] for i in data["forms"][word]]
            self.assertEqual(roots, ["ضرب"])
        self.assertEqual([data["roots"][i] for i in data["forms"][morphology.fold("کتاب")]], ["كتب"])
        self.assertEqual(data["ayahs"][0], data["ayahs"][2])
        self.assertNotEqual(data["ayahs"][0], data["ayahs"][1])

    def test_missing_ayah_and_out_of_order_segments_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing ayahs"):
            morphology.parse(ROWS, [2, 2])
        with self.assertRaisesRegex(ValueError, "out-of-order"):
            morphology.parse(ROWS.replace("(1:1:1:2)", "(1:1:1:4)"), [2, 1])
        with self.assertRaisesRegex(ValueError, "outside"):
            morphology.parse(ROWS.replace("(2:1:1:1)", "(3:1:1:1)"), [2, 1])

    def test_source_tampering_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            (path / "quranic-corpus-morphology-0.4.txt.gz").write_bytes(gzip.compress(ROWS.encode()))
            with self.assertRaisesRegex(ValueError, "checksum"):
                morphology.load([2, 1], path)

    def test_pinned_source_covers_the_whole_quran(self):
        raw = gzip.decompress((morphology.SOURCE / "quranic-corpus-morphology-0.4.txt.gz").read_bytes()).decode()
        counts = {}
        records = 0
        for line in raw.splitlines():
            if line.startswith("("):
                s, a, _, _ = map(int, line.split("\t")[0].strip("()").split(":"))
                counts[s] = max(counts.get(s, 0), a)
                records += 1
        self.assertEqual(records, 128219)
        self.assertEqual(len(counts), 114)
        self.assertEqual(sum(counts.values()), 6236)
        data = morphology.load([counts[s] for s in range(1, 115)])
        roots = data["forms"]["ضربتم"]
        self.assertEqual([data["roots"][i] for i in roots], ["ضرب"])
        self.assertEqual(sum(bool(set(roots) & set(row)) for row in data["ayahs"]), 54)
