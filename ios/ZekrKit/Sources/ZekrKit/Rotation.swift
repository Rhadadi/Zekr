import Foundation

/// The ayah-of-the-day rule. Defined in `shared/rotation-spec.md`; the test cases in
/// `shared/test-vectors/rotation.json` must pass here and in `web/src/rotation.ts`.

/// 32-bit PRNG (mulberry32). All arithmetic wraps modulo 2^32.
public struct Mulberry32 {
    private var state: UInt32

    public init(seed: UInt32) { state = seed }

    public mutating func next() -> UInt32 {
        state = state &+ 0x6D2B_79F5
        var t = state
        t = (t ^ (t >> 15)) &* (t | 1)
        t = t ^ (t &+ ((t ^ (t >> 7)) &* (t | 61)))
        return t ^ (t >> 14)
    }
}

public enum Rotation {
    /// A shuffled order of 0..<count for one cycle (Fisher–Yates, seeded by cycle XOR salt).
    public static func order(count n: Int, cycle: Int, salt: UInt32 = 0) -> [Int] {
        precondition(n > 0, "empty pool")
        var rng = Mulberry32(seed: UInt32(truncatingIfNeeded: cycle) ^ salt)
        var order = Array(0..<n)
        var i = n - 1
        while i > 0 {
            // (rng() * (i + 1)) >> 32, in integers
            let j = Int((UInt64(rng.next()) &* UInt64(i + 1)) >> 32)
            order.swapAt(i, j)
            i -= 1
        }
        return order
    }

    /// The ayah for a slot: every ayah in the pool is shown once per cycle, in a different order each cycle.
    public static func ayah(pool: [Int], slot: Int, salt: UInt32 = 0) -> Int {
        let n = pool.count
        let cycle = floorDiv(slot, n)
        let position = slot - cycle * n
        return pool[order(count: n, cycle: cycle, salt: salt)[position]]
    }

    /// Slot number for a Unix time in a time zone `utcOffsetSeconds` east of UTC.
    public static func slot(unixSeconds: Int, utcOffsetSeconds: Int, period: Int) -> Int {
        floorDiv(unixSeconds + utcOffsetSeconds, period)
    }

    static func floorDiv(_ a: Int, _ b: Int) -> Int {
        let q = a / b
        return (a % b != 0 && (a < 0) != (b < 0)) ? q - 1 : q
    }
}
