import Foundation

/// One section of Al-Mizan: the commentary on a group of ayahs (e.g. Maryam 1-15), as tools/almizan.py builds it.
public struct TafsirSection: Equatable, Sendable {
    public let id: String
    public let surah: Int
    public let firstAyah: Int
    public let lastAyah: Int
    /// e.g. «سوره مریم آیه‌های ۱ تا ۱۵».
    public let title: String
    public let blocks: [Block]
    /// Footnotes (source citations); `Run.footnote(n)` points at `notes[n - 1]`.
    public let notes: [String]

    public struct Block: Equatable, Sendable {
        public enum Kind: String, Sendable {
            /// The surah's opening line.
            case surah = "s"
            /// A part: ترجمه آیات, بیان آیات, بحث روایتی ...
            case part = "h"
            /// A topic heading within a part.
            case topic = "t"
            case paragraph = "p"
        }

        public let kind: Kind
        public let runs: [Run]
    }

    public enum Run: Equatable, Sendable {
        case text(String, Style)
        case footnote(Int)
    }

    public enum Style: String, Sendable {
        case plain = ""
        /// Quoted Quran text.
        case quran = "q"
        /// A word under discussion.
        case word = "e"
        case hadith = "d"
    }

    /// Reads the stored body: `{"blocks": [{"t": "p", "r": [["text"], ["quote", "q"], [3, "n"]]}], "notes": [...]}`.
    public static func decodeBody(_ json: String) throws -> (blocks: [Block], notes: [String]) {
        guard let object = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
              let rawBlocks = object["blocks"] as? [[String: Any]] else { throw StoreError.missing("tafsir body") }
        let notes = object["notes"] as? [String] ?? []
        let blocks = rawBlocks.compactMap { raw -> Block? in
            guard let kind = (raw["t"] as? String).flatMap(Block.Kind.init(rawValue:)), let runs = raw["r"] as? [[Any]] else { return nil }
            return Block(kind: kind, runs: runs.compactMap { run in
                let style = run.count > 1 ? run[1] as? String ?? "" : ""
                if style == "n" {
                    return (run.first as? NSNumber).map { .footnote($0.intValue) }
                }
                guard let text = run.first as? String else { return nil }
                return .text(text, Style(rawValue: style) ?? .plain)
            })
        }
        return (blocks, notes)
    }
}

/// The Al-Mizan database (almizan.sqlite). It is only in builds made with `build_data.py --almizan`.
public final class TafsirStore {
    private let db: SQLiteDatabase
    /// Where the text comes from, for the credits.
    public let source: String

    public init(databaseURL: URL) throws {
        db = try SQLiteDatabase(url: databaseURL)
        source = try db.query("SELECT value FROM meta WHERE key = 'source'") { $0.text(0) }.first ?? ""
    }

    /// Opens the bundled database, or returns nil when this build has no tafsir.
    public convenience init?(resource name: String, in bundle: Bundle) {
        guard let url = bundle.url(forResource: name, withExtension: "sqlite") else { return nil }
        try? self.init(databaseURL: url)
    }

    /// The section that explains an ayah (every ayah is in exactly one).
    public func section(forAyahID id: Int) throws -> TafsirSection? {
        try db.query(
            "SELECT id, surah, ayah_from, ayah_to, title, body FROM section WHERE first_id <= ? AND last_id >= ? LIMIT 1",
            [.int(id), .int(id)]
        ) { row in
            let body = try TafsirSection.decodeBody(row.text(5))
            return TafsirSection(
                id: row.text(0), surah: row.int(1), firstAyah: row.int(2), lastAyah: row.int(3), title: row.text(4),
                blocks: body.blocks, notes: body.notes
            )
        }.first
    }
}
