#!/usr/bin/env python3
"""Cut the owner's printed mushaf (a 624-page scanned PDF) into one image per page and a tap map.

PRIVATE: the scans are a publisher's artwork. The output goes to gitignored folders and must never be
committed or deployed publicly (docs/DESIGN.md §7, docs/PLAN.md §8). Needs poppler's `pdfimages`, numpy and Pillow.

    python3 tools/mushaf_pages.py ~/Downloads/big-quran.pdf            # web: web/public/data/mushaf/
    python3 tools/mushaf_pages.py big-quran.pdf --ios-dir ios/Zekr/Resources/mushaf

What it writes (per page n = 1..604; Quran page n is PDF page n + 3):
  NNN.webp   the page, cropped to its frame and scaled to 654x935 (pages 1 and 2: 674x935, as they are wider)
  map.json   {"v", "pages": [{"n", "first", "w", "h", "a": [[[x, y, w, h], ...] per ayah]}]}; rectangles are
             in thousandths of the page width / height; one ayah may span several line rectangles
  meta.json  (web only) `pages` replaced by this edition's page starts, and `mushaf` set

This edition does not break pages exactly where Tanzil does (from about page 120, and a lot near juz 30), so
the page of every ayah comes from the images themselves: the ayah-end markers on each page are counted, and
the counts must add up to all 6,236 ayahs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF_OFFSET = 3  # Quran page n is PDF page n + 3
PAGES = 604
OUT_W, OUT_H = 654, 935
MARGIN = 36  # kept outside the frame: the hizb and sajdah marks live there
CROP_TOP, CROP_BOTTOM = 70, 1005
OPENING = {1: (38, 70, 712, 1005), 2: (38, 70, 712, 1005)}  # the illuminated pages: (left, top, right, bottom)
LINES = 15
LINE0, PITCH = 164.0, 54.5  # centre of text line 1 and the line height, in source pixels
MARK_W, MARK_H = 21, 14  # the pale-blue fill of an ayah-end marker (the ring around it adds about 3px a side)
MARK_MIN = 100  # fill pixels in a MARK_W x MARK_H window: markers score 190-230, anything else under 60


class MushafError(Exception):
    pass


def _np():
    try:
        import numpy as np
        from PIL import Image
    except ImportError as e:  # pragma: no cover
        raise MushafError("needs numpy and Pillow: pip install numpy pillow") from e
    return np, Image


def find_frame(a) -> tuple[int, int]:
    """Left and right edge of the page frame (long vertical runs of dark or strong blue)."""
    np, _ = _np()
    cols = (a[..., 0] < 120)[150:900].sum(0)
    xs = np.nonzero(cols > 520)[0]
    if len(xs) < 2:
        raise MushafError("no page frame found")
    return int(xs[0]), int(xs[-1])


def _boxsum(np, m, h, w):
    c = np.cumsum(np.cumsum(np.pad(m.astype(np.int32), ((1, 0), (1, 0))), 0), 1)
    return c[h:, w:] - c[:-h, w:] - c[h:, :-w] + c[:-h, :-w]


def find_markers(a, left: int, right: int) -> list[tuple[float, float]]:
    """Centres (x, y) of the ayah-end markers on a regular page, in source pixels."""
    np, _ = _np()
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (r >= 170) & (r <= 214) & (g >= 222) & (b >= 234) & ((g - r) >= 28) & ((b - r) >= 42)
    m[:125] = False
    m[985:] = False
    m[:, : left + 29] = False
    m[:, right - 29 :] = False
    s = _boxsum(np, m, MARK_H, MARK_W)
    third = MARK_W // 3
    part = _boxsum(np, m, MARK_H, third)
    # a marker is wide: it fills both ends of the window, which a thin sliver of a similar colour does not
    wide = (part[:, : s.shape[1]] >= 25) & (part[:, 2 * third : 2 * third + s.shape[1]] >= 25)
    ys, xs = np.nonzero((s >= MARK_MIN) & wide)
    taken: list[tuple[int, int, int]] = []
    for k in np.argsort(-s[ys, xs], kind="stable"):
        y, x = int(ys[k]), int(xs[k])
        if any(abs(x - tx) < 18 and abs(y - ty) < 14 for tx, ty, _ in taken):
            continue
        taken.append((x, y, int(s[y, x])))
    return [(x + MARK_W / 2, y + MARK_H / 2) for x, y, _ in taken]


def line_of(yc: float) -> int:
    """1-based text line of a marker centre."""
    k = round((yc - LINE0) / PITCH) + 1
    return min(max(k, 1), LINES)


class Ayah:
    """What the layout needs to know about the ayah ending at a marker."""

    def __init__(self, ayah: int, first_of_surah: bool, basmala_lines: int):
        self.ayah = ayah
        self.first_of_surah = first_of_surah
        self.basmala_lines = basmala_lines  # 0 for surah 9, otherwise 1 (a banner line comes before)


def ayah_rects(markers: list[tuple[float, float]], ayahs: list[Ayah], text_left: float, text_right: float,
               scale_x: float = 1.0, scale_y: float = 1.0, shift_x: float = 0.0, shift_y: float = 0.0, lead: int = 0):
    """One list of line rectangles per ayah, in output pixels, plus the set of lines the page's text fills.

    `markers` are in source pixels and become output pixels through the scale and shift. An ayah runs
    from just after the previous marker (to its left, text reads right to left) to its own marker.
    `lead` is how many lines at the top of the page hold the banner and basmala of a surah whose first
    ayah is the page's first (the banner may sit at the bottom of the page before).
    """
    ordered = sorted(markers, key=lambda p: (line_of(p[1]), -p[0]))
    if len(ordered) != len(ayahs):
        raise MushafError(f"{len(ordered)} markers for {len(ayahs)} ayahs")
    half_w, half_h = 13.0, PITCH / 2 - 1.2

    def band(line: int) -> tuple[float, float]:
        centre = (LINE0 + PITCH * (line - 1) - shift_y) * scale_y
        return centre - half_h * scale_y, 2 * half_h * scale_y

    rects: list[list[list[float]]] = []
    used: set[int] = set()
    prev_line, prev_left = 0, None  # the line and left edge of the previous marker
    for (mx, my), ay in zip(ordered, ayahs):
        el = line_of(my)
        ml = (mx - half_w - shift_x) * scale_x
        if ay.first_of_surah and prev_left is None:
            used.update(range(1, lead + 1))
            sl, right = lead + 1, text_right
        elif ay.first_of_surah:
            used.update(range(prev_line + 1, prev_line + 2 + ay.basmala_lines))
            sl, right = prev_line + 2 + ay.basmala_lines, text_right
        elif prev_left is None:
            sl, right = 1, text_right
        elif prev_left - text_left < 14:  # the previous marker ended its line
            sl, right = prev_line + 1, text_right
        else:
            sl, right = prev_line, prev_left
        if sl > el or (sl == el and right - ml < 6):
            raise MushafError(f"ayah {ay.ayah}: starts on line {sl}, ends on line {el}")
        segs = []
        for line in range(sl, el + 1):
            x0 = ml if line == el else text_left
            x1 = right if line == sl else text_right
            y, h = band(line)
            segs.append([x0, y, x1 - x0, h])
            used.add(line)
        rects.append(segs)
        prev_line, prev_left = el, ml
    return rects, used


def _pdfimages(pdf: Path, out: Path) -> list[Path]:
    exe = shutil.which("pdfimages")
    if not exe:
        raise MushafError("pdfimages (poppler-utils) is not installed")
    first, last = 1 + PDF_OFFSET, PAGES + PDF_OFFSET
    subprocess.run([exe, "-p", "-j", "-f", str(first), "-l", str(last), str(pdf), str(out / "pg")], check=True)
    files = sorted(out.glob("pg-*.jpg"))
    if len(files) != PAGES:
        raise MushafError(f"expected one image per page, found {len(files)} files")
    return files


def build(pdf: Path, meta_path: Path, out_dirs: list[Path], patch_meta: Path | None, check: bool = False) -> int:
    np, Image = _np()
    meta = json.loads(meta_path.read_text())
    surahs = meta["surahs"]
    tanzil = list(meta["pages"])

    def ayah_info(i: int) -> Ayah:
        s = next(x for x in surahs if x["first"] <= i < x["first"] + x["ayahs"])
        first = i == s["first"] and s["id"] != 1
        return Ayah(i - s["first"] + 1, first, 0 if s["id"] == 9 else 1)

    with tempfile.TemporaryDirectory() as tmp:
        files = _pdfimages(pdf, Path(tmp))
        counts: dict[int, int] = {1: 7, 2: 5}
        detected: dict[int, tuple] = {}
        images: dict[int, "Image.Image"] = {}
        for n, f in enumerate(files, 1):
            im = Image.open(f).convert("RGB")
            if n in OPENING:
                images[n] = im.crop(OPENING[n])
                continue
            im_full = im
            a = np.asarray(im).astype(int)
            left, right = find_frame(a)
            marks = find_markers(a, left, right)
            counts[n] = len(marks)
            detected[n] = (left, right, marks)
            box = (left - MARGIN, CROP_TOP, right + MARGIN, CROP_BOTTOM)
            images[n] = Image.new('RGB', (OUT_W, OUT_H)) if check else im_full.crop(box).resize((OUT_W, OUT_H), Image.LANCZOS)
        total = sum(counts.values())
        if total != 6236:
            raise MushafError(f"the page markers add up to {total} ayahs, not 6,236")
        first = {1: 1}
        for n in range(2, PAGES + 1):
            first[n] = first[n - 1] + counts[n - 1]

        last_line = {n: max(line_of(y) for _, y in detected[n][2]) for n in detected}
        pages = []
        problems = []
        for n in range(1, PAGES + 1):
            im = images[n]
            entry = {"n": n, "first": first[n], "w": im.width, "h": im.height, "a": []}
            if n in OPENING:
                entry["a"] = opening_rects(n, im.width, im.height)
            else:
                left, right, marks = detected[n]
                sx, sy = OUT_W / (right - left + 2 * MARGIN), OUT_H / (CROP_BOTTOM - CROP_TOP)
                ays = [ayah_info(first[n] + k) for k in range(counts[n])]
                tail = LINES - last_line[n - 1] if n - 1 in last_line else 0  # banner/basmala lines left on the page before
                lead = max(0, 1 + ays[0].basmala_lines - tail) if ays[0].first_of_surah else 0
                if not ays[0].first_of_surah and tail:
                    problems.append(f"page {n - 1}: its last marker is on line {last_line[n - 1]}, but no surah starts on page {n}")
                try:
                    rects, used = ayah_rects(marks, ays, (left + 30 - (left - MARGIN)) * sx, (right - 30 - (left - MARGIN)) * sx,
                                             sx, sy, left - MARGIN, CROP_TOP, lead)
                except MushafError as e:
                    problems.append(f"page {n}: {e}")
                    continue
                used |= set(range(last_line[n] + 1, LINES + 1))  # the next surah's banner and basmala
                if used != set(range(1, LINES + 1)):
                    problems.append(f"page {n}: text lines {sorted(set(range(1, LINES + 1)) - used)} have no ayah")
                entry["a"] = [[[round(x / im.width * 1000), round(y / im.height * 1000), round(w / im.width * 1000), round(h / im.height * 1000)]
                               for x, y, w, h in segs] for segs in rects]
            pages.append(entry)
        for p in problems:
            print("warning:", p, file=sys.stderr)
        if problems:
            print(f"{len(problems)} pages need a look (see warnings); writing what is known", file=sys.stderr)

        version = hashlib.sha256(json.dumps(pages, sort_keys=True).encode()).hexdigest()[:10]
        for d in [] if check else out_dirs:
            d.mkdir(parents=True, exist_ok=True)
            for n, im in images.items():
                im.save(d / f"{n:03d}.webp", "WEBP", quality=86, method=6)
            (d / "map.json").write_text(json.dumps({"v": version, "pages": pages}, separators=(",", ":")))
        if patch_meta and not check:
            meta["pages"] = [first[n] for n in range(1, PAGES + 1)]
            meta["mushaf"] = {"v": version, "w": OUT_W, "h": OUT_H}
            patch_meta.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
        differs = sum(1 for n in range(1, PAGES + 1) if first[n] != tanzil[n - 1])
        print(f"ok: {PAGES} pages, {total} ayahs, version {version}; {differs} pages start differently from Tanzil's split")
        return 1 if problems else 0


# Pages 1 and 2 are drawn round, so their ayahs are placed by hand, in pixels of the 674x935 image: for each
# ayah a list of (line, x_left, x_right) (text reads right to left; an ayah runs from just after the previous
# marker to its own). Seven lines in the circle, centred at these heights.
OPENING_LINES = [368.75, 398.75, 433.0, 468.0, 503.75, 540.0, 573.75]
OPENING_SEGMENTS = {
    1: [
        [(1, 264, 415)],
        [(2, 235, 440)],
        [(3, 349, 464)],
        [(3, 208, 349)],
        [(4, 255, 466)],
        [(4, 204, 255), (5, 325, 464)],
        [(5, 211, 325), (6, 242, 438), (7, 279, 399)],
    ],
    2: [
        [(2, 400, 440)],
        [(2, 234, 400), (3, 399, 468)],
        [(3, 206, 399), (4, 327, 470)],
        [(4, 205, 327), (5, 205, 462)],
        [(6, 239, 438), (7, 274, 398)],
    ],
}


def opening_rects(n: int, w: int = 674, h: int = 935) -> list:
    half = 16.0
    return [[[round(x0 / w * 1000), round((OPENING_LINES[line - 1] - half) / h * 1000),
              round((x1 - x0) / w * 1000), round(2 * half / h * 1000)] for line, x0, x1 in ayah]
            for ayah in OPENING_SEGMENTS[n]]


def apply_built(src: Path, web_dir: Path, meta_path: Path) -> int:
    """Use pages built earlier (`assets/mushaf`, committed for the public site): copy them next to the web data and
    tell meta.json where each page starts. No PDF needed."""
    built = json.loads((src / "map.json").read_text())
    pages = built["pages"]
    if len(pages) != PAGES or sum(1 for _ in src.glob("[0-9][0-9][0-9].webp")) != PAGES:
        print(f"ERROR: {src} does not hold {PAGES} pages", file=sys.stderr)
        return 1
    web_dir.mkdir(parents=True, exist_ok=True)
    for f in src.iterdir():
        shutil.copy2(f, web_dir / f.name)
    meta = json.loads(meta_path.read_text())
    meta["pages"] = [p["first"] for p in pages]
    meta["mushaf"] = {"v": built["v"], "w": OUT_W, "h": OUT_H}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    print(f"ok: {PAGES} printed pages applied, version {built['v']}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path, nargs="?", help="the scanned mushaf PDF (624 pages; Quran page 1 is PDF page 4)")
    ap.add_argument("--apply", type=Path, metavar="DIR", help="use pages built earlier (no PDF): copy DIR to --web-dir and patch meta.json")
    ap.add_argument("--meta", type=Path, default=ROOT / "web" / "public" / "data" / "meta.json")
    ap.add_argument("--web-dir", type=Path, default=ROOT / "web" / "public" / "data" / "mushaf")
    ap.add_argument("--ios-dir", type=Path, help="also write the pages for the iPhone app")
    ap.add_argument("--check", action="store_true", help="find the markers and report problems; write nothing")
    ap.add_argument("--no-meta", action="store_true", help="do not change meta.json")
    args = ap.parse_args(argv)
    if args.apply:
        return apply_built(args.apply, args.web_dir, args.meta)
    if not args.pdf:
        ap.error("give the PDF, or --apply DIR")
    try:
        dirs = [args.web_dir] + ([args.ios_dir] if args.ios_dir else [])
        return build(args.pdf, args.meta, dirs, None if args.no_meta else args.meta, args.check)
    except (MushafError, subprocess.CalledProcessError) as e:
        print("ERROR:", e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
