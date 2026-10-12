#!/usr/bin/env python3
"""Reference implementation of the ayah rotation rule (shared/rotation-spec.md) and
generator for shared/test-vectors/rotation.json.

    python3 tools/gen_rotation_vectors.py          write the file
    python3 tools/gen_rotation_vectors.py --check  exit 1 if the file is out of date
"""

import json
import sys
from pathlib import Path

M32 = 0xFFFFFFFF
OUT = Path(__file__).resolve().parent.parent / "shared" / "test-vectors" / "rotation.json"


def mulberry32(seed):
    state = seed & M32

    def nxt():
        nonlocal state
        state = (state + 0x6D2B79F5) & M32
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & M32
        t = t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & M32)) & M32)
        return (t ^ (t >> 14)) & M32

    return nxt


def order_for_cycle(n, cycle, salt=0):
    seed = (cycle ^ salt) & M32
    rng = mulberry32(seed)
    order = list(range(n))
    for i in range(n - 1, 0, -1):
        j = (rng() * (i + 1)) >> 32
        order[i], order[j] = order[j], order[i]
    return order


def ayah_for_slot(pool, slot, salt=0):
    n = len(pool)
    return pool[order_for_cycle(n, slot // n, salt)[slot % n]]


def slot_for(t, offset, period):
    return (t + offset) // period


def build():
    pools = {
        "range10": list(range(1, 11)),
        "sparse": [3, 17, 99, 1024, 2000, 3333, 4999, 6236],
        "single": [284],
        "all": list(range(1, 6237)),
    }
    vectors = {
        "mulberry32": [
            {"seed": s, "first": [(lambda r: [r() for _ in range(5)])(mulberry32(s))][0]}
            for s in (0, 1, 42, 2026, M32)
        ],
        "orders": [
            {"pool": "range10", "salt": salt, "cycle": c, "order": order_for_cycle(10, c, salt)}
            for salt in (0, 12345)
            for c in (0, 1, 2, 4000)
        ],
        "ayahs": [],
        "slots": [],
    }
    for name, salt, slots in [
        ("range10", 0, [0, 1, 2, 9, 10, 11, 19, 20, 12345]),
        ("range10", 12345, [0, 1, 9, 10, 25]),
        ("sparse", 0, [0, 1, 7, 8, 9, 100]),
        ("single", 0, [0, 1, 2, 500000]),
        ("all", 0, [0, 1, 2, 6235, 6236, 6237, 12471, 490000, 491000, 20000 * 24]),
    ]:
        for slot in slots:
            vectors["ayahs"].append({"pool": name, "salt": salt, "slot": slot, "ayah": ayah_for_slot(pools[name], slot, salt)})
    # (unix time, UTC offset, period) cases, including negative offsets and slot boundaries
    for t, o, p in [
        (0, 0, 3600),
        (3599, 0, 3600),
        (3600, 0, 3600),
        (1760270400, 0, 86400),           # 2025-10-12 12:00:00 UTC
        (1760270400, -25200, 86400),      # same instant in UTC-7
        (1760270400, 12600, 3600),        # UTC+3:30 (Tehran, no DST)
        (1760313599, -25200, 86400),      # 1 s before local midnight in UTC-7
        (1760313600, -25200, 86400),      # local midnight in UTC-7
        (1760270400, 12600, 10800),
        (1791806400, 3600, 10800),        # 2026-10-12 12:00:00 UTC
    ]:
        vectors["slots"].append({"t": t, "offset": o, "period": p, "slot": slot_for(t, o, p)})
    return {"pools": {k: (v if k != "all" else {"range": [1, 6236]}) for k, v in pools.items()}, **vectors}


def render():
    return json.dumps(build(), ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"


if __name__ == "__main__":
    text = render()
    if "--check" in sys.argv:
        sys.exit(0 if OUT.exists() and OUT.read_text(encoding="utf-8") == text else 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} ({len(text)} bytes)")
