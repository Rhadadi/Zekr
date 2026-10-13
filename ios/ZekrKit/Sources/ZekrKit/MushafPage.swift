import Foundation

/// One page of the Madani mushaf (604 pages) as flowing text: a banner and basmala where a surah starts,
/// then its ayahs. Same layout as the web page view (web/src/views/PageReader.tsx).
public struct MushafPage: Equatable, Sendable {
    public static let count = 604

    public let number: Int
    public let juz: Int
    /// The surah the page starts in, for the header.
    public let surah: Int
    public let blocks: [Block]

    public enum Block: Equatable, Sendable {
        case banner(surah: Int)
        case basmala(String)
        /// A run of ayahs of one surah, read as one paragraph.
        case ayahs([Ayah])
    }

    public struct Ayah: Equatable, Sendable, Identifiable {
        public let id: Int
        public let surah: Int
        public let number: Int
        public let arabic: String
    }

    public var ayahIDs: ClosedRange<Int> {
        let ids = blocks.flatMap { block -> [Int] in
            if case let .ayahs(run) = block { return run.map(\.id) }
            return []
        }
        return ids.first! ... ids.last!
    }

    /// Lays out a page's ayahs (in order). The basmala goes before the first ayah of every surah but 1 (where it is ayah 1) and 9.
    public init(number: Int, juz: Int, ayahs: [Ayah], basmala: String) {
        self.number = number
        self.juz = juz
        surah = ayahs.first?.surah ?? 1
        var blocks: [Block] = []
        var run: [Ayah] = []
        for ayah in ayahs {
            if ayah.number == 1 {
                if !run.isEmpty { blocks.append(.ayahs(run)) }
                run = []
                blocks.append(.banner(surah: ayah.surah))
                if ayah.surah != 1 && ayah.surah != 9 { blocks.append(.basmala(basmala)) }
            }
            run.append(ayah)
        }
        if !run.isEmpty { blocks.append(.ayahs(run)) }
        self.blocks = blocks
    }

    private static let arabicIndicDigits = Array("٠١٢٣٤٥٦٧٨٩")

    /// The end-of-ayah mark printed after each ayah, e.g. ﴿١٢﴾ (Arabic-Indic digits, as in printed mushafs).
    public static func marker(_ n: Int) -> String {
        "﴿" + String(String(n).map { c in c.wholeNumberValue.map { arabicIndicDigits[$0] } ?? c }) + "﴾"
    }
}

extension QuranStore {
    /// Page 1-604 of the Madani mushaf.
    public func page(_ number: Int, script: ArabicScript = .uthmani) throws -> MushafPage {
        guard (1...MushafPage.count).contains(number) else { throw StoreError.missing("page \(number)") }
        let column = (script == .uthmani && hasUthmaniText) ? "text_uthmani" : "text_simple"
        let rows = try database.query("SELECT id, surah, number, \(column), juz FROM ayah WHERE page = ? ORDER BY id", [.int(number)]) {
            (ayah: MushafPage.Ayah(id: $0.int(0), surah: $0.int(1), number: $0.int(2), arabic: $0.text(3)), juz: $0.int(4))
        }
        guard let first = rows.first else { throw StoreError.missing("page \(number)") }
        let basmala = try metaValue(script == .uthmani && hasUthmaniText ? "basmala_uthmani" : "basmala_simple") ?? ""
        return MushafPage(number: number, juz: first.juz, ayahs: rows.map(\.ayah), basmala: basmala)
    }

    /// One ayah, as the verse-by-verse reader shows it.
    public func ayahRow(id: Int, script: ArabicScript = .uthmani) throws -> AyahRow {
        AyahRow(id: id, number: try location(ofAyahID: id).ayah, arabic: try arabic(ayahID: id, script: script))
    }

    /// The mushaf page an ayah is on.
    public func pageNumber(ofAyahID id: Int) throws -> Int { try number(of: .page, ayahID: id) }
}
