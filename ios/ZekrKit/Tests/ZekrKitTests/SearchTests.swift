import XCTest
@testable import ZekrKit

final class SearchTests: XCTestCase {
    func testNormalizeDropsMarksAndUnifiesLetters() {
        XCTAssertEqual(SearchText.normalize("ٱلرَّحْمَٰنِ"), "الرحمن")
        XCTAssertEqual(SearchText.normalize("رحيم", persian: false), "رحيم")
        XCTAssertEqual(SearchText.normalize("رحیم", persian: false), "رحيم")
        XCTAssertEqual(SearchText.normalize("كتاب"), "کتاب")
        XCTAssertEqual(SearchText.normalize("علي"), "علی")
        XCTAssertEqual(SearchText.normalize("١٢٣"), "۱۲۳")
    }

    func testWordsSplitOnSpaces() {
        XCTAssertEqual(SearchText.words("  رحمت   پروردگار "), ["رحمت", "پروردگار"])
        XCTAssertEqual(SearchText.words(""), [])
    }

    func testFindsAyahsByArabicAndByTranslation() throws {
        let store = try QuranStore(databaseURL: Repo.database(Repo.fullDB))
        let arabic = try store.search("الرحمن الرحيم", translationIDs: [])
        XCTAssertTrue(arabic.contains(3), "1:3 is 'the Entirely Merciful, the Especially Merciful'")
        let persian = try store.search("مهربان", translationIDs: ["fa.safavi"])
        XCTAssertFalse(persian.isEmpty)
        XCTAssertEqual(persian, persian.sorted())
        XCTAssertLessThanOrEqual(try store.search("الله", translationIDs: [], limit: 5).count, 5)
        XCTAssertEqual(try store.search("   ", translationIDs: ["fa.safavi"]), [])
        XCTAssertEqual(try store.search("zzzzqqqq", translationIDs: ["fa.safavi"]), [])
    }

    func testPercentAndUnderscoreAreLiteral() throws {
        let store = try QuranStore(databaseURL: Repo.database(Repo.fullDB))
        XCTAssertEqual(try store.search("%", translationIDs: ["fa.safavi"]), [])
        XCTAssertEqual(try store.search("_", translationIDs: ["fa.safavi"]), [])
    }
}
