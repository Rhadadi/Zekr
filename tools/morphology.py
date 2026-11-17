"""Root-search data from the unchanged Quranic Arabic Corpus 0.4.

The source and its original notices live in assets/quran-morphology. Search
normalization never changes the Quran text displayed by the application.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import re
import shutil
import unicodedata
from collections import defaultdict
from pathlib import Path

SOURCE = Path(__file__).resolve().parent.parent / "assets/quran-morphology"
SHA256 = "a1d12923815341face765083805d2148ed2d9f5cc3f7d6665219d887675d8c46"
URL = "https://corpus.quran.com/"
MIRROR_COMMIT = "5b6ba1eab0e23673a6293812b105e0399011ec9a"
BW = {
    "'": "ء", "|": "آ", ">": "أ", "&": "ؤ", "<": "إ", "}": "ئ", "A": "ا", "{": "ا",
    "b": "ب", "p": "ة", "t": "ت", "v": "ث", "j": "ج", "H": "ح", "x": "خ", "d": "د", "*": "ذ",
    "r": "ر", "z": "ز", "s": "س", "$": "ش", "S": "ص", "D": "ض", "T": "ط", "Z": "ظ", "E": "ع", "g": "غ",
    "f": "ف", "q": "ق", "k": "ك", "l": "ل", "m": "م", "n": "ن", "h": "ه", "w": "و", "Y": "ى", "y": "ي",
}
FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ی": "ي", "ئ": "ي", "ک": "ك", "ة": "ه", "ؤ": "و"})


def arabic(text: str) -> str:
    return "".join(BW[c] for c in text if c in BW)


def fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKC", text) if unicodedata.category(c) != "Mn").translate(FOLD)


def load(ayah_counts: list[int], source: Path = SOURCE) -> dict:
    raw = gzip.decompress((source / "quranic-corpus-morphology-0.4.txt.gz").read_bytes())
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise ValueError("Quranic Arabic Corpus 0.4: source checksum differs")
    return parse(raw.decode("utf-8"), ayah_counts)


def parse(text: str, ayah_counts: list[int]) -> dict:
    words: dict[tuple[int, int, int], dict] = {}
    positions: dict[tuple[int, int], set[int]] = defaultdict(set)
    for line in text.splitlines():
        if not line.startswith("("):
            continue
        fields = line.split("\t")
        if len(fields) != 4:
            raise ValueError("Morphology: malformed record")
        location = re.fullmatch(r"\((\d+):(\d+):(\d+):(\d+)\)", fields[0])
        if not location:
            raise ValueError("Morphology: malformed location")
        s, a, w, segment = map(int, location.groups())
        if not (1 <= s <= len(ayah_counts) and 1 <= a <= ayah_counts[s - 1] and w > 0):
            raise ValueError("Morphology: location outside the Quran")
        word = words.setdefault((s, a, w), {"parts": [], "base": [], "roots": set(), "forms": set()})
        if segment != len(word["parts"]) + 1:
            raise ValueError("Morphology: duplicate or out-of-order segment")
        word["parts"].append(arabic(fields[1]))
        if not fields[3].startswith("PREFIX"):
            word["base"].append(arabic(fields[1]))
        roots = re.findall(r"(?:^|\|)ROOT:([^|]+)", fields[3])
        if roots:
            word["roots"].update(arabic(root) for root in roots)
            word["forms"].add(arabic(fields[1]))
            word["forms"].update(arabic(lemma) for lemma in re.findall(r"(?:^|\|)LEM:([^|]+)", fields[3]))
        positions[(s, a)].add(w)
    expected = {(s, a) for s, count in enumerate(ayah_counts, 1) for a in range(1, count + 1)}
    if positions.keys() != expected:
        raise ValueError("Morphology: missing ayahs")
    for ws in positions.values():
        if sorted(ws) != list(range(1, len(ws) + 1)):
            raise ValueError("Morphology: missing word positions")
    roots = sorted({root for word in words.values() for root in word["roots"]})
    indices = {root: i for i, root in enumerate(roots)}
    forms: dict[str, set[int]] = defaultdict(set)
    ayahs = {at: set() for at in sorted(expected)}
    for (s, a, _), word in words.items():
        ids = {indices[root] for root in word["roots"]}
        ayahs[(s, a)].update(ids)
        for form in word["forms"] | {"".join(word["parts"]), "".join(word["base"])}:
            if form and ids:
                forms[fold(form)].update(ids)
    for root, i in indices.items():
        forms[fold(root)].add(i)
    result = {
        "source": URL,
        "copyright": "Copyright (C) 2011 Kais Dukes; GNU General Public License. See NOTICE.txt.",
        "roots": roots,
        "forms": {form: sorted(ids) for form, ids in sorted(forms.items())},
        "ayahs": [sorted(ids) for ids in ayahs.values()],
    }
    result["version"] = hashlib.sha256(json.dumps(result, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
    return result


def build_web(out: Path, data: dict) -> None:
    target = out / "search"
    target.mkdir(parents=True, exist_ok=True)
    (target / "morphology.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shutil.copyfile(SOURCE / "NOTICE.txt", target / "NOTICE.txt")
    meta_path = out / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["morphology"] = {"version": data["version"], "source": URL}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
