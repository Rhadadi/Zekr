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
        let translations = try store.translations()
        XCTAssertEqual(translations.count, store.hasStudyQuran ? 11 : 10)
        XCTAssertEqual(translations.contains { $0.id == "en.study_quran" }, store.hasStudyQuran)
    }

    func testMissingDatabaseThrows() {
        XCTAssertThrowsError(try QuranStore(databaseURL: URL(fileURLWithPath: "/nonexistent/db.sqlite")))
    }
}

final class StudyQuranQueriesTests: XCTestCase {
    /// Runs on the private package or on the made-up one from tools/tests/study_fixture.py.
    private func privateStore() throws -> QuranStore {
        let store = try QuranStore(databaseURL: try Repo.database(Repo.fullDB))
        guard store.hasStudyQuran else { throw XCTSkip("Private Study Quran content is not supplied") }
        return store
    }

    func testVerseTranslationAndIntroduction() throws {
        let store = try privateStore()
        let id = store.ayahID(surah: 2, ayah: 255)
        // Structure only: the exact wording of the book is checked privately, never in this public repository.
        let study = try store.translation(ayahID: id, translationID: "en.study_quran")
        XCTAssertFalse(study.isEmpty)
        XCTAssertNotEqual(study, try store.translation(ayahID: id, translationID: "en.sahih"), "the book is its own translation")
        XCTAssertFalse(try XCTUnwrap(store.studyQuranIntroduction(surahID: 114)).isEmpty)
    }

    func testSharedAndOverlappingCommentary() throws {
        let store = try privateStore()
        let a = try store.studyQuranEntries(ayahID: store.ayahID(surah: 2, ayah: 11))
        let b = try store.studyQuranEntries(ayahID: store.ayahID(surah: 2, ayah: 12))
        XCTAssertFalse(a.isEmpty)
        XCTAssertEqual(a.map(\.id), b.map(\.id))
        let notes = try store.studyQuranEntries(ayahID: store.ayahID(surah: 2, ayah: 275))
        XCTAssertEqual(Set(notes.map(\.lastAyah)), Set([275, 281]))
    }

    func testSearchAndSourceExceptions() throws {
        let store = try privateStore()
        XCTAssertTrue(try store.searchStudyQuran("usury").contains { $0.surah == 2 && $0.firstAyah == 275 })
        XCTAssertTrue(try store.studyQuranEntries(ayahID: store.ayahID(surah: 26, ayah: 110)).isEmpty)
        XCTAssertTrue(try store.studyQuranEntries(ayahID: store.ayahID(surah: 38, ayah: 5)).contains { $0.coverageKind == "quoted_header" })
    }

    func testWidgetHasNoPrivateContentAndDoesNotQueryMissingTables() throws {
        let store = try QuranStore(databaseURL: try Repo.database(Repo.widgetDB))
        XCTAssertFalse(store.hasStudyQuran)
        XCTAssertTrue(try store.studyQuranEntries(ayahID: 1).isEmpty)
        XCTAssertNil(try store.studyQuranIntroduction(surahID: 1))
        XCTAssertTrue(try store.searchStudyQuran("mercy").isEmpty)
    }
}

final class ReadingQueriesTests: XCTestCase {
    private func store() throws -> QuranStore { try QuranStore(databaseURL: try Repo.database(Repo.fullDB)) }

    func testSurahAyahsAndTranslations() throws {
        let s = try store()
        let rows = try s.ayahs(inSurah: 17)
        XCTAssertEqual(rows.count, 111)
        XCTAssertEqual(rows.first?.number, 1)
        XCTAssertEqual(rows.map(\.id), Array(s.surah(17).firstAyahID..<(s.surah(17).firstAyahID + 111)))
        XCTAssertTrue(rows[23].arabic.contains("رَّبِّ"))
        let safavi = try s.translationTexts(inSurah: 17, translationID: "fa.safavi")
        XCTAssertEqual(safavi.count, 111)
        XCTAssertEqual(safavi[23], try s.translation(ayahID: rows[23].id, translationID: "fa.safavi"))
        XCTAssertEqual(try s.ayahs(inSurah: 1, script: .simple).count, 7)
    }

    func testJuzStarts() throws {
        let s = try store()
        let starts = try s.juzStarts()
        XCTAssertEqual(starts.map(\.juz), Array(1...30))
        XCTAssertEqual(starts[0].ayahID, 1)
        XCTAssertEqual(starts[15].ayahID, s.ayahID(surah: 18, ayah: 75)) // juz 16 starts at 18:75
    }

    func testPagesMatchTheMadaniMushaf() throws {
        let s = try store()
        let first = s.ayahID(surah: 19, ayah: 1)
        XCTAssertEqual(try s.number(of: .page, ayahID: first), 305)
        XCTAssertEqual(try s.number(of: .juz, ayahID: first), 16)
        XCTAssertEqual(try s.lastAyahID(inSame: .page, as: first), s.ayahID(surah: 19, ayah: 11))
        XCTAssertEqual(try s.number(of: .page, ayahID: totalAyahs), 604)
    }

    func testEndOfPlayback() throws {
        let s = try store()
        let id = s.ayahID(surah: 19, ayah: 3)
        XCTAssertEqual(try s.endOfPlayback(from: id, to: .ayah), id)
        XCTAssertEqual(try s.endOfPlayback(from: id, to: .page), s.ayahID(surah: 19, ayah: 11))
        XCTAssertEqual(try s.endOfPlayback(from: id, to: .surah), s.ayahID(surah: 19, ayah: 98))
        XCTAssertEqual(try s.endOfPlayback(from: id, to: .quran), totalAyahs)
        let juzEnd = try s.endOfPlayback(from: id, to: .juz)
        XCTAssertEqual(try s.number(of: .juz, ayahID: juzEnd), 16)
        XCTAssertEqual(try s.number(of: .juz, ayahID: juzEnd + 1), 17)
        let rub = try s.endOfPlayback(from: id, to: .rub)
        XCTAssertGreaterThanOrEqual(rub, id)
        XCTAssertLessThan(rub, juzEnd + 1)
    }
}
