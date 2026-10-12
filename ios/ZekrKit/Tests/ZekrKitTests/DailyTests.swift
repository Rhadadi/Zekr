import Foundation
import XCTest
@testable import ZekrKit

final class DailyTests: XCTestCase {
    private func provider() throws -> DailyAyahProvider {
        DailyAyahProvider(store: try QuranStore(databaseURL: try Repo.database(Repo.widgetDB)))
    }

    private let utc = TimeZone(identifier: "UTC")!
    private let noon = Date(timeIntervalSince1970: 1_760_270_400) // 2025-10-12 12:00:00 UTC

    func testDailyEntriesFollowTheSharedRule() throws {
        let entries = try provider().entries(config: DailyConfig(), from: noon, count: 3, timeZone: utc)
        XCTAssertEqual(entries.map(\.slot), [20373, 20374, 20375])
        let all = Array(1...totalAyahs)
        for e in entries { XCTAssertEqual(e.ayahID, Rotation.ayah(pool: all, slot: e.slot)) }
        // daily slots start at local midnight
        XCTAssertEqual(entries[0].start, Date(timeIntervalSince1970: 1_760_227_200)) // 2025-10-12 00:00 UTC
        XCTAssertEqual(entries[0].end, entries[1].start)
        XCTAssertEqual(entries[1].start.timeIntervalSince(entries[0].start), 86400)
    }

    func testHourlyEntriesStartOnTheHour() throws {
        let config = DailyConfig(period: .hourly)
        let entries = try provider().entries(config: config, from: noon.addingTimeInterval(25 * 60), count: 5, timeZone: utc)
        XCTAssertEqual(entries.first?.start, noon)
        XCTAssertEqual(entries.map { $0.start.timeIntervalSince(noon) }, [0, 3600, 7200, 10800, 14400])
    }

    func testSlotsFollowLocalTime() throws {
        // 22:00 UTC is already the next day in Tehran (UTC+3:30)
        let late = Date(timeIntervalSince1970: 1_760_306_400)
        let tehran = TimeZone(identifier: "Asia/Tehran")!
        let a = try provider().entries(config: DailyConfig(), from: late, count: 1, timeZone: utc)[0]
        let b = try provider().entries(config: DailyConfig(), from: late, count: 1, timeZone: tehran)[0]
        XCTAssertEqual(b.slot, a.slot + 1)
    }

    func testDailySlotsStartAtLocalMidnightAcrossDaylightSavingChange() throws {
        let ny = TimeZone(identifier: "America/New_York")!
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = ny
        // US clocks go forward on 2026-03-08
        let from = calendar.date(from: DateComponents(year: 2026, month: 3, day: 6, hour: 15))!
        let entries = try provider().entries(config: DailyConfig(), from: from, count: 5, timeZone: ny)
        for e in entries {
            let c = calendar.dateComponents([.hour, .minute], from: e.start)
            XCTAssertEqual(c.hour, 0, "slot \(e.slot) starts at \(e.start)")
            XCTAssertEqual(c.minute, 0)
        }
        XCTAssertEqual(entries[2].end.timeIntervalSince(entries[2].start), 23 * 3600) // the short day
    }

    func testHourlyEntriesAreStrictlyIncreasingAcrossDaylightSavingChange() throws {
        let ny = TimeZone(identifier: "America/New_York")!
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = ny
        for (month, day) in [(3, 8), (11, 1)] { // clocks forward, clocks back (2026)
            let from = calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: 0, minute: 30))!
            let entries = try provider().entries(config: DailyConfig(period: .hourly), from: from, count: 8, timeZone: ny)
            for (a, b) in zip(entries, entries.dropFirst()) { XCTAssertLessThan(a.start, b.start, "\(month)/\(day)") }
        }
    }

    func testFitsPoolOnlyYieldsAyahsThatFit() throws {
        let p = try provider()
        let config = DailyConfig(period: .hourly, pool: .fitsInFull)
        XCTAssertEqual(config.poolName, "fits.fa.safavi")
        let entries = try p.entries(config: config, from: noon, count: 24, timeZone: utc)
        let fits = Set(try p.store.pool(named: config.poolName))
        for e in entries {
            XCTAssertTrue(fits.contains(e.ayahID))
            let text = try p.display(ayahID: e.ayahID, config: config)
            XCTAssertLessThanOrEqual(text.persian?.count ?? 0, 80)
        }
    }

    func testPoolNames() {
        XCTAssertEqual(DailyConfig(pool: .all).poolName, "all")
        XCTAssertEqual(DailyConfig(pool: .fitsInFull, show: .arabicAndEnglish).poolName, "fits.en.sahih")
        XCTAssertEqual(DailyConfig(pool: .fitsInFull, show: .arabicOnly).poolName, "all")
        XCTAssertEqual(DailyConfig(pool: .fitsInFull, show: .persianOnly, persianTranslationID: "fa.fooladvand").poolName, "fits.fa.fooladvand")
    }

    func testDisplayRespectsWhatToShow() throws {
        let p = try provider()
        let id = p.store.ayahID(surah: 17, ayah: 24)
        let fa = try p.display(ayahID: id, config: DailyConfig(show: .arabicAndPersian))
        XCTAssertNotNil(fa.persian)
        XCTAssertNil(fa.english)
        XCTAssertEqual(fa.surah.id, 17)
        XCTAssertEqual(fa.ayahNumber, 24)
        let en = try p.display(ayahID: id, config: DailyConfig(show: .arabicAndEnglish))
        XCTAssertNil(en.persian)
        XCTAssertTrue(en.english?.contains("have mercy upon them") ?? false)
        let ar = try p.display(ayahID: id, config: DailyConfig(show: .arabicOnly))
        XCTAssertNil(ar.persian)
        XCTAssertNil(ar.english)
    }
}
