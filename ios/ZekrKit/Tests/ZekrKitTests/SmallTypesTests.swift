import Foundation
import XCTest
@testable import ZekrKit

final class SmallTypesTests: XCTestCase {
    func testDeepLinkRoundTrip() {
        let link = DeepLink.ayah(surah: 17, ayah: 24)
        XCTAssertEqual(link.url.absoluteString, "zekr://ayah/17/24")
        XCTAssertEqual(DeepLink(url: link.url), link)
    }

    func testDeepLinkRejectsBadLinks() {
        for bad in ["zekr://ayah/0/1", "zekr://ayah/115/1", "zekr://ayah/17", "zekr://ayah/17/0", "zekr://ayah/x/1", "https://ayah/17/24", "zekr://other/17/24"] {
            XCTAssertNil(DeepLink(url: URL(string: bad)!), bad)
        }
    }

    func testPersianDigits() {
        XCTAssertEqual(LocalizedText.digits("17:24", language: "fa"), "۱۷:۲۴")
        XCTAssertEqual(LocalizedText.digits("17:24", language: "en"), "17:24")
    }

    func testHeader() {
        let s = Surah(id: 17, ayahCount: 111, firstAyahID: 2024, nameArabic: "الإسراء", nameFarsi: "اسراء", nameTransliteration: "Al-Israa", nameEnglish: "The Night Journey", isMeccan: true)
        XCTAssertEqual(LocalizedText.header(surah: s, ayah: 24, language: "en"), "Surah Al-Israa, 17:24")
        XCTAssertEqual(LocalizedText.header(surah: s, ayah: 24, language: "fa"), "سورهٔ اسراء، ۱۷:۲۴")
    }

    func testAudioURLs() {
        XCTAssertEqual(Reciter.minshawi.url(surah: 17, ayah: 24).absoluteString, "https://everyayah.com/data/Minshawy_Murattal_128kbps/017024.mp3")
        XCTAssertEqual(Reciter.audioURL(folder: "x", surah: 1, ayah: 1).absoluteString, "https://everyayah.com/data/x/001001.mp3")
        XCTAssertEqual(Reciter.audioURL(folder: "x", surah: 114, ayah: 6).absoluteString, "https://everyayah.com/data/x/114006.mp3")
        XCTAssertEqual(Set(Reciter.all.map(\.id)).count, Reciter.all.count)
    }
}

final class StringsTests: XCTestCase {
    func testEveryStringExistsInBothLanguages() {
        for s in Str.allCases {
            XCTAssertFalse(s.text(language: "en").isEmpty, "\(s)")
            XCTAssertFalse(s.text(language: "fa").isEmpty, "\(s)")
            XCTAssertNotEqual(s.text(language: "en"), s.text(language: "fa"), "\(s)")
        }
    }
}

final class NumberTextTests: XCTestCase {
    func testAyahCountAndJuzTitle() {
        XCTAssertEqual(LocalizedText.ayahCount(7, language: "en"), "7 ayahs")
        XCTAssertEqual(LocalizedText.ayahCount(1, language: "en"), "1 ayah")
        XCTAssertEqual(LocalizedText.ayahCount(286, language: "fa"), "۲۸۶ آیه")
        XCTAssertEqual(LocalizedText.juzTitle(16, language: "en"), "Juz 16")
        XCTAssertEqual(LocalizedText.juzTitle(16, language: "fa"), "جزء ۱۶")
    }
}
