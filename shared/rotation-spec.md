# Ayah rotation rule

The widget, the web "ayah of the day" page and the daily notification must show the
same ayah at the same time. This file is the single definition. Every implementation
(`ios/ZekrKit`, `web/src/rotation.ts`) must produce exactly the results in
`test-vectors/rotation.json`, which `tools/gen_rotation_vectors.py` generates from the
reference implementation. `tools/tests/test_rotation_vectors.py` checks that the file
is up to date.

## Inputs

- **pool**: a list of distinct ayah ids in ascending order, length `N >= 1`.
  Ayah ids are global, 1 to 6236 (`first ayah of a surah = surah.first_ayah_id`).
  Pools come from `build_data.py` (`all`, `fits.<translation id>`), never computed
  by the apps.
- **period**: seconds per slot: `3600` (hourly), `10800` (every 3 hours) or `86400` (daily).
- **time**: Unix time `t` in seconds and the device's UTC offset `o` in seconds at that moment.
- **salt**: an unsigned 32-bit integer, default `0`. Different salts give different sequences.

## Slot

Slots follow local time, so a daily ayah changes at local midnight and an hourly one at
the top of the local hour:

    slot = floor((t + o) / period)

## Ayah for a slot

    cycle = floor(slot / N)
    pos   = slot mod N
    seed  = (cycle XOR salt) as an unsigned 32-bit integer
    order = [0, 1, ..., N-1]
    rng   = mulberry32(seed)
    for i from N-1 down to 1:
        j = (rng() * (i + 1)) >> 32        # integer arithmetic, no floating point
        swap order[i] and order[j]
    ayah  = pool[order[pos]]

Every ayah in the pool is shown once per cycle, in a different order each cycle.

## mulberry32

State and output are unsigned 32-bit integers; all arithmetic wraps modulo 2^32.

    next():
        state = state + 0x6D2B79F5
        t = state
        t = (t XOR (t >> 15)) * (t OR 1)
        t = t XOR (t + ((t XOR (t >> 7)) * (t OR 61)))
        return t XOR (t >> 14)

`rng()` above is the value returned by `next()` (an integer from 0 to 2^32 - 1), so
`(rng() * (i + 1)) >> 32` needs 64-bit (or exact double) arithmetic: the product is
below 2^45.

## Empty translations

Some translations leave an ayah empty because it is translated together with the
previous ayah (Safavi 80:39). The apps show a placeholder ("translated together with
the previous ayah") instead of blank text.
