import Foundation
import XCTest
@testable import ZekrKit

final class StoreTests: XCTestCase {
    func testWidgetDatabase() throws {
        let store = try QuranStore(databaseURL: try Repo.database(Repo.widgetDB))
        XCTAssertEqual(store.surahs.count, 114)
        XCTAssertEqual(store.surah(17).nameFarsi, "اسراء")
        XCTAssertEqual(store.surah(1).ayahCount, 7)
        XCTAssertEqual(store.surahs.map(\.ayahCount).reduce(0, +), totalAyahs)

        let id = store.ayahID(surah: 17, ayah: 24)
        XCTAssertEqual(try store.location(ofAyahID: id), AyahLocation(surah: 17, ayah: 24))
        XCTAssertTrue(try store.arabic(ayahID: id).contains("وَقُل رَّبِّ ارْحَمْهُمَا"))
        XCTAssertTrue(try store.translation(ayahID: id, translationID: "fa.safavi").contains("بال فروتنی را برای آن دو بگستر"))
        XCTAssertTrue(try store.translation(ayahID: id, translationID: "en.sahih").contains("My Lord, have mercy upon them"))
        XCTAssertEqual(try store.translations().map(\.id), ["fa.safavi", "fa.fooladvand", "en.sahih", "en.qarai"])
    }

    func testLocationBoundaries() throws {
        let store = try QuranStore(databaseURL: try Repo.database(Repo.widgetDB))
        XCTAssertEqual(try store.location(ofAyahID: 1), AyahLocation(surah: 1, ayah: 1))
        XCTAssertEqual(try store.location(ofAyahID: 7), AyahLocation(surah: 1, ayah: 7))
        XCTAssertEqual(try store.location(ofAyahID: 8), AyahLocation(surah: 2, ayah: 1))
        XCTAssertEqual(try store.location(ofAyahID: totalAyahs), AyahLocation(surah: 114, ayah: 6))
        XCTAssertThrowsError(try store.location(ofAyahID: 0))
        XCTAssertThrowsError(try store.location(ofAyahID: totalAyahs + 1))
    }

    func testBasmalaIsNotPartOfTheFirstAyah() throws {
        let store = try QuranStore(databaseURL: try Repo.database(Repo.widgetDB))
        XCTAssertEqual(try store.arabic(ayahID: store.ayahID(surah: 2, ayah: 1)), "الم")
        XCTAssertTrue(try store.arabic(ayahID: 1).hasPrefix("بِسْمِ")) // 1:1 is the basmala itself
    }

    func testMergedTranslationIsEmpty() throws {
        let store = try QuranStore(databaseURL: try Repo.database(Repo.widgetDB))
        XCTAssertEqual(try store.translation(ayahID: store.ayahID(surah: 80, ayah: 39), translationID: "fa.safavi"), "")
    }

    func testPools() throws {
        let store = try QuranStore(databaseURL: try Repo.database(Repo.widgetDB))
        let all = try store.pool(named: "all")
        XCTAssertEqual(all, Array(1...totalAyahs))
        let fits = try store.pool(named: "fits.fa.safavi")
        XCTAssertTrue((1000..<3000).contains(fits.count), "\(fits.count)")
        XCTAssertEqual(fits, fits.sorted())
        for id in fits.prefix(200) {
            XCTAssertLessThanOrEqual(try store.translation(ayahID: id, translationID: "fa.safavi").count, 80)
        }
        XCTAssertThrowsError(try store.pool(named: "fits.nonexistent"))
    }

    func testFullDatabaseHasUthmaniAndSearchIndex() throws {
        let store = try QuranStore(databaseURL: try Repo.database(Repo.fullDB))
        let id = store.ayahID(surah: 17, ayah: 24)
        XCTAssertTrue(try store.arabic(ayahID: id, script: .uthmani).contains("ٱرْحَمْهُمَا"))
        XCTAssertTrue(try store.arabic(ayahID: id, script: .simple).contains("ارْحَمْهُمَا"))
        XCTAssertEqual(try store.translations().count, 10)
    }

    func testMissingDatabaseThrows() {
        XCTAssertThrowsError(try QuranStore(databaseURL: URL(fileURLWithPath: "/nonexistent/db.sqlite")))
    }
}
