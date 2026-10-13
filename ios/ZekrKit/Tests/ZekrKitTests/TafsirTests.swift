import Foundation
import XCTest
@testable import ZekrKit

final class TafsirTests: XCTestCase {
    func testDecodesBlocksRunsAndNotes() throws {
        let json = #"{"blocks":[{"t":"h","r":[["بیان آیات"]]},{"t":"p","r":[["کلمه "],["هو","e"],[" در "],["قل هو","q"],[1,"n"],["حدیث","d"]]},{"t":"x","r":[]}],"notes":["منبع"]}"#
        let body = try TafsirSection.decodeBody(json)
        XCTAssertEqual(body.notes, ["منبع"])
        XCTAssertEqual(body.blocks.count, 2, "unknown block kinds are skipped")
        XCTAssertEqual(body.blocks[0], .init(kind: .part, runs: [.text("بیان آیات", .plain)]))
        XCTAssertEqual(body.blocks[1].runs, [
            .text("کلمه ", .plain), .text("هو", .word), .text(" در ", .plain), .text("قل هو", .quran), .footnote(1), .text("حدیث", .hadith),
        ])
    }

    func testBrokenBodyThrows() {
        XCTAssertThrowsError(try TafsirSection.decodeBody("[]"))
    }

    /// Runs when the database was built (`python3 tools/build_data.py --almizan`).
    func testBuiltDatabaseFindsTheSectionOfAnAyah() throws {
        let url = Repo.url("ios/Zekr/Resources/almizan.sqlite")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: url.path), "built with --almizan only")
        let tafsir = try TafsirStore(databaseURL: url)
        let quran = try QuranStore(databaseURL: try Repo.database(Repo.fullDB))
        let section = try XCTUnwrap(tafsir.section(forAyahID: quran.ayahID(surah: 19, ayah: 7)))
        XCTAssertEqual(section.id, "19_1-15")
        XCTAssertEqual(section.title, "سوره مریم آیه‌های ۱ تا ۱۵")
        XCTAssertTrue(section.blocks.contains { $0.kind == .part && $0.runs.first == .text("بحث روایتی", .plain) })
        XCTAssertFalse(section.notes.isEmpty)
        for id in [1, 7, 8, 6236] {
            XCTAssertNotNil(try tafsir.section(forAyahID: id), "ayah \(id)")
        }
        XCTAssertFalse(tafsir.source.isEmpty)
    }
}
