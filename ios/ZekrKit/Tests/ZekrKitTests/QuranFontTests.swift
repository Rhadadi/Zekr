import Foundation
import XCTest
@testable import ZekrKit
#if canImport(CoreText)
import CoreText
#endif

final class QuranFontTests: XCTestCase {
    func testDefaultIsHafsAndUnknownFallsBack() throws {
        XCTAssertEqual(ReaderSettings().quranFont, .hafs)
        let saved = try JSONDecoder().decode(ReaderSettings.self, from: Data(#"{"quranFontID": "gone"}"#.utf8))
        XCTAssertEqual(saved.quranFont, .hafs)
        let picked = try JSONDecoder().decode(ReaderSettings.self, from: Data(#"{"quranFontID": "meQuran"}"#.utf8))
        XCTAssertEqual(picked.quranFont, .meQuran)
    }

    func testSameFontsAsTheWebApp() throws {
        let web = try String(contentsOf: Repo.url("web/src/fonts.ts"), encoding: .utf8)
        let ids = web.matches(of: #/\{ id: '([A-Za-z]+)'/#).map { String($0.1) }
        XCTAssertEqual(ids, QuranFont.all.map(\.id))
    }

    func testEveryFontIsBundledAndListedInUIAppFonts() throws {
        let project = try String(contentsOf: Repo.url("ios/project.yml"), encoding: .utf8)
        for font in QuranFont.all {
            XCTAssertTrue(FileManager.default.fileExists(atPath: Repo.url("ios/Zekr/Fonts/\(font.fileName)").path), font.fileName)
            XCTAssertTrue(project.contains(font.fileName), "UIAppFonts lacks \(font.fileName)")
        }
    }

    #if canImport(CoreText)
    func testPostScriptNamesMatchTheFiles() throws {
        for font in QuranFont.all {
            let url = Repo.url("ios/Zekr/Fonts/\(font.fileName)")
            let descriptors = try XCTUnwrap(CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor], font.fileName)
            let name = CTFontDescriptorCopyAttribute(try XCTUnwrap(descriptors.first), kCTFontNameAttribute) as? String
            XCTAssertEqual(name, font.postScriptName)
        }
    }
    #endif
}
