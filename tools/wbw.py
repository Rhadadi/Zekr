"""Word-by-word Persian meanings of the Quran, for the "under each word" reading.

Source: SakinaDevGroup/quran-word-by-word-farsi, release v1.0 (https://github.com/SakinaDevGroup/quran-word-by-word-farsi),
one Persian meaning per word for all 77,429 words of the 6,236 ayahs (one word falls back to English). The release does
not state a license; the owner decides whether to publish it (see docs/PLAN.md §4).

The web data gets one file per surah, data/wbw/<surah>.json: for each ayah, its words as [arabic, persian] pairs.
"""

from __future__ import annotations

import hashlib
import io
import json
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable

URL = "https://github.com/SakinaDevGroup/quran-word-by-word-farsi/releases/download/v1.0/quran.word.by.word.farsi.zip"
SHA256 = "e6c65ae2fb252642f17dc7a222f8549f01b1ee71e7292c367b2e2ecef3c2714d"
MEMBER = "quran_wbw_fa.json"

Words = dict[tuple[int, int], list[tuple[str, str]]]


def fetch(dest: Path, refresh: bool = False) -> bytes:
    """The release zip, downloaded once into data/raw and checked against its published checksum."""
    if dest.exists() and not refresh:
        data = dest.read_bytes()
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        last: Exception | None = None
        data = b""
        for attempt in range(4):
            try:
                req = urllib.request.Request(URL, headers={"User-Agent": "zekr-data-pipeline/1"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = r.read()
                break
            except Exception as e:  # noqa: BLE001 - retry on any download problem
                last = e
                time.sleep(2 * (attempt + 1))
        if not data:
            raise RuntimeError(f"could not download {URL}: {last}")
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError("word-by-word zip: checksum differs from the v1.0 release")
    dest.write_bytes(data)
    return data


def load(raw_zip: bytes, ayah_counts: list[int], normalize: Callable[[str], str]) -> Words:
    """Words per ayah, in order, as (arabic, persian). Raises ValueError if any ayah is missing or out of order."""
    with zipfile.ZipFile(io.BytesIO(raw_zip)) as z:
        rows = json.loads(z.read(MEMBER))
    words: Words = {}
    for w in rows:
        if w.get("char_type") != "word":
            continue
        key = (int(w["surah"]), int(w["ayah"]))
        got = words.setdefault(key, [])
        if int(w["position"]) != len(got) + 1:
            raise ValueError(f"word-by-word {key[0]}:{key[1]}: word {w['position']} out of order")
        got.append((w["arabic"].strip(), normalize(w["translation"] or "")))
    for s, count in enumerate(ayah_counts, start=1):
        for a in range(1, count + 1):
            if not words.get((s, a)):
                raise ValueError(f"word-by-word: no words for {s}:{a}")
    if len(words) != sum(ayah_counts):
        raise ValueError(f"word-by-word: {len(words)} ayahs, expected {sum(ayah_counts)}")
    return words


def build_web(out: Path, words: Words, ayah_counts: list[int]) -> None:
    d = out / "wbw"
    d.mkdir(parents=True, exist_ok=True)
    for s, count in enumerate(ayah_counts, start=1):
        per = [[list(p) for p in words[(s, a)]] for a in range(1, count + 1)]
        (d / f"{s}.json").write_text(json.dumps(per, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
