import Foundation
import XCTest
@testable import ZekrKit

/// Runs the shared test cases (shared/test-vectors/rotation.json) that web/src/rotation.ts also passes.
final class RotationTests: XCTestCase {
    private var vectors: [String: Any]!

    override func setUpWithError() throws {
        let data = try Data(contentsOf: Repo.url("shared/test-vectors/rotation.json"))
        vectors = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func pool(_ name: String) throws -> [Int] {
        let pools = try XCTUnwrap(vectors["pools"] as? [String: Any])
        let value = try XCTUnwrap(pools[name])
        if let list = value as? [Int] { return list }
        let range = try XCTUnwrap((value as? [String: Any])?["range"] as? [Int])
        return Array(range[0]...range[1])
    }

    func testMulberry32MatchesSharedVectors() throws {
        for case let v as [String: Any] in try XCTUnwrap(vectors["mulberry32"] as? [Any]) {
            var rng = Mulberry32(seed: UInt32(try XCTUnwrap(v["seed"] as? Int)))
            let expected = try XCTUnwrap(v["first"] as? [Int])
            XCTAssertEqual(expected.map { _ in Int(rng.next()) }, expected, "seed \(v["seed"] ?? "")")
        }
    }

    func testShuffleOrdersMatchSharedVectors() throws {
        for case let v as [String: Any] in try XCTUnwrap(vectors["orders"] as? [Any]) {
            let n = try pool(try XCTUnwrap(v["pool"] as? String)).count
            let order = Rotation.order(count: n, cycle: try XCTUnwrap(v["cycle"] as? Int), salt: UInt32(try XCTUnwrap(v["salt"] as? Int)))
            XCTAssertEqual(order, try XCTUnwrap(v["order"] as? [Int]))
        }
    }

    func testAyahForSlotMatchesSharedVectors() throws {
        let cases = try XCTUnwrap(vectors["ayahs"] as? [Any])
        XCTAssertGreaterThan(cases.count, 20)
        for case let v as [String: Any] in cases {
            let name = try XCTUnwrap(v["pool"] as? String)
            let slot = try XCTUnwrap(v["slot"] as? Int)
            let salt = UInt32(try XCTUnwrap(v["salt"] as? Int))
            XCTAssertEqual(Rotation.ayah(pool: try pool(name), slot: slot, salt: salt), try XCTUnwrap(v["ayah"] as? Int), "\(name) salt \(salt) slot \(slot)")
        }
    }

    func testSlotFromTimeMatchesSharedVectors() throws {
        for case let v as [String: Any] in try XCTUnwrap(vectors["slots"] as? [Any]) {
            let slot = Rotation.slot(
                unixSeconds: try XCTUnwrap(v["t"] as? Int), utcOffsetSeconds: try XCTUnwrap(v["offset"] as? Int), period: try XCTUnwrap(v["period"] as? Int)
            )
            XCTAssertEqual(slot, try XCTUnwrap(v["slot"] as? Int))
        }
    }

    func testEveryAyahOncePerCycle() {
        let pool = Array(1...40)
        let shown = (80..<120).map { Rotation.ayah(pool: pool, slot: $0) }
        XCTAssertEqual(shown.sorted(), pool)
    }

    func testFloorDivisionForNegativeSlots() {
        XCTAssertEqual(Rotation.floorDiv(-1, 10), -1)
        XCTAssertEqual(Rotation.floorDiv(-10, 10), -1)
        XCTAssertEqual(Rotation.floorDiv(-11, 10), -2)
        XCTAssertEqual(Rotation.floorDiv(11, 10), 1)
    }
}
