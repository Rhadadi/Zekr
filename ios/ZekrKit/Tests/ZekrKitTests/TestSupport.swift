import Foundation
import XCTest

enum Repo {
    /// The repository root, found from this file's location (ios/ZekrKit/Tests/ZekrKitTests/).
    static let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    static func url(_ path: String) -> URL { root.appendingPathComponent(path) }

    /// A database built by tools/build_data.py; the test is skipped when it has not been generated.
    static func database(_ path: String) throws -> URL {
        let url = Repo.url(path)
        try XCTSkipUnless(FileManager.default.fileExists(atPath: url.path), "run `python3 tools/build_data.py` first")
        return url
    }

    static let widgetDB = "ios/ZekrWidgets/Resources/widget.sqlite"
    static let fullDB = "ios/Zekr/Resources/quran.sqlite"
}
