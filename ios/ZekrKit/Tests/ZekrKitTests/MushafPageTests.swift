import Foundation
import XCTest
@testable import ZekrKit

final class MushafPageTests: XCTestCase {
    private func store() throws -> QuranStore { try QuranStore(databaseURL: try Repo.database(Repo.fullDB)) }

    private func runs(_ page: MushafPage) -> [[MushafPage.Ayah]] {
        page.blocks.compactMap { if case let .ayahs(run) = $0 { return run } else { return nil } }
    }

    func testPage305IsMaryam1To11InJuz16() throws {
        let page = try store().page(305)
        XCTAssertEqual(page.juz, 16)
        XCTAssertEqual(page.surah, 19)
        guard page.blocks.count == 3, case .banner(19) = page.blocks[0], case let .basmala(b) = page.blocks[1] else {
            return XCTFail("expected banner, basmala, ayahs: \(page.blocks.count) blocks")
        }
        XCTAssertTrue(b.hasPrefix("بِسْمِ"))
        XCTAssertEqual(runs(page).first?.map(\.number), Array(1...11))
        XCTAssertTrue(runs(page).first?.first?.arabic.contains("كٓهيعٓصٓ") ?? false)
    }

    func testPageThatStartsMidSurahHasNoBanner() throws {
        let page = try store().page(306)
        guard case .ayahs = page.blocks.first else { return XCTFail("starts with \(String(describing: page.blocks.first))") }
        XCTAssertEqual(page.surah, 19)
        XCTAssertEqual(page.ayahIDs.lowerBound, try store().ayahID(surah: 19, ayah: 12))
    }

    func testAlFatihaAndAtTawbaHaveNoSeparateBasmala() throws {
        let s = try store()
        let first = try s.page(1)
        XCTAssertEqual(first.blocks.count, 2)
        XCTAssertEqual(runs(first).first?.count, 7)
        let tawbaPage = try s.pageNumber(ofAyahID: s.ayahID(surah: 9, ayah: 1))
        let tawba = try s.page(tawbaPage)
        XCTAssertFalse(tawba.blocks.contains { if case .basmala = $0 { return true } else { return false } })
        XCTAssertTrue(tawba.blocks.contains(.banner(surah: 9)))
    }

    func testLastPageHasThreeSurahsEachWithBasmala() throws {
        let page = try store().page(604)
        XCTAssertEqual(page.blocks.filter { if case .banner = $0 { return true } else { return false } }.count, 3)
        XCTAssertEqual(page.blocks.filter { if case .basmala = $0 { return true } else { return false } }.count, 3)
        XCTAssertEqual(page.ayahIDs.upperBound, totalAyahs)
    }

    func testEveryAyahIsOnExactlyOnePage() throws {
        let s = try store()
        var next = 1
        for n in 1...MushafPage.count {
            let ids = try s.page(n, script: .simple).ayahIDs
            XCTAssertEqual(ids.lowerBound, next, "page \(n)")
            next = ids.upperBound + 1
        }
        XCTAssertEqual(next, totalAyahs + 1)
        XCTAssertThrowsError(try s.page(605))
    }

    func testMarkerUsesArabicIndicDigits() {
        XCTAssertEqual(MushafPage.marker(12), "﴿١٢﴾")
        XCTAssertEqual(MushafPage.marker(286), "﴿٢٨٦﴾")
    }

    func testReadModeDefaultsToPageAndIsSaved() throws {
        XCTAssertEqual(ReaderSettings().readMode, .page)
        let old = try JSONDecoder().decode(ReaderSettings.self, from: Data(#"{"arabicSize": 30}"#.utf8))
        XCTAssertEqual(old.readMode, .page)
        let verse = try JSONDecoder().decode(ReaderSettings.self, from: Data(#"{"readMode": "verse"}"#.utf8))
        XCTAssertEqual(verse.readMode, .verse)
        XCTAssertTrue(old.followRecitation)
        XCTAssertEqual(old.pageBox, .bottom)
        let saved = try JSONDecoder().decode(ReaderSettings.self, from: Data(#"{"followRecitation": false}"#.utf8))
        XCTAssertFalse(saved.followRecitation)
    }
}
