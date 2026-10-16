import Foundation

public enum StoreError: Error, CustomStringConvertible {
    case missing(String)

    public var description: String {
        switch self {
        case .missing(let what): return "Not found: \(what)"
        }
    }
}

/// Reads the Quran databases that `tools/build_data.py` builds (`quran.sqlite` for the app, `widget.sqlite` for the widget).
public final class QuranStore {
    private let db: SQLiteDatabase
    var database: SQLiteDatabase { db }
    var hasUthmaniText: Bool { hasUthmani }
    public let surahs: [Surah]
    private let hasUthmani: Bool
    public let hasStudyQuran: Bool
    public let hasStudyQuranAudio: Bool

    public init(databaseURL: URL) throws {
        db = try SQLiteDatabase(url: databaseURL)
        surahs = try db.query(
            "SELECT id, ayah_count, first_ayah_id, name_ar, name_fa, name_tr, name_en, revelation FROM surah ORDER BY id"
        ) { r in
            Surah(
                id: r.int(0), ayahCount: r.int(1), firstAyahID: r.int(2), nameArabic: r.text(3), nameFarsi: r.text(4),
                nameTransliteration: r.text(5), nameEnglish: r.text(6), isMeccan: r.text(7) == "Meccan"
            )
        }
        guard surahs.count == 114 else { throw StoreError.missing("114 surahs (found \(surahs.count))") }
        hasUthmani = try db.query("PRAGMA table_info(ayah)") { $0.text(1) }.contains("text_uthmani")
        hasStudyQuran = try db.query("SELECT value FROM meta WHERE key='study_quran'") { $0.text(0) }.first == "1"
        hasStudyQuranAudio = try db.query("SELECT value FROM meta WHERE key='study_quran_audio'") { $0.text(0) }.first == "1"
    }

    /// Opens a bundled database by resource name, e.g. `QuranStore(resource: "widget", in: .main)`.
    public convenience init(resource name: String, in bundle: Bundle) throws {
        guard let url = bundle.url(forResource: name, withExtension: "sqlite") else {
            throw StoreError.missing("\(name).sqlite in the app bundle")
        }
        try self.init(databaseURL: url)
    }

    public func surah(_ id: Int) -> Surah { surahs[id - 1] }

    public func ayahID(surah: Int, ayah: Int) -> Int { surahs[surah - 1].firstAyahID + ayah - 1 }

    public func location(ofAyahID id: Int) throws -> AyahLocation {
        guard (1...totalAyahs).contains(id) else { throw StoreError.missing("ayah id \(id)") }
        // surahs are in order of first ayah id: take the last one that starts at or before `id`
        let s = surahs.last(where: { $0.firstAyahID <= id })!
        return AyahLocation(surah: s.id, ayah: id - s.firstAyahID + 1)
    }

    /// Arabic text of an ayah. The widget database only has the simple script, so `.uthmani` falls back to it there.
    public func arabic(ayahID id: Int, script: ArabicScript = .uthmani) throws -> String {
        let column = (script == .uthmani && hasUthmani) ? "text_uthmani" : "text_simple"
        guard let text = try db.query("SELECT \(column) FROM ayah WHERE id = ?", [.int(id)], map: { $0.text(0) }).first else {
            throw StoreError.missing("ayah \(id)")
        }
        return text
    }

    /// A translation of an ayah. Empty where the translator merged two ayahs (Safavi 80:39).
    public func translation(ayahID id: Int, translationID: String) throws -> String {
        guard let text = try db.query(
            "SELECT text FROM translation_text WHERE translation_id = ? AND ayah_id = ?", [.text(translationID), .int(id)],
            map: { $0.text(0) }
        ).first else { throw StoreError.missing("translation \(translationID) for ayah \(id)") }
        return text
    }

    public func translations() throws -> [TranslationInfo] {
        try db.query("SELECT id, lang, name, translator FROM translation ORDER BY sort") {
            TranslationInfo(id: $0.text(0), language: $0.text(1), name: $0.text(2), translator: $0.text(3))
        }
    }

    /// Ayah ids a rotation draws from, ascending: "all" or "fits.<translation id>".
    public func pool(named name: String) throws -> [Int] {
        let ids = try db.query("SELECT ayah_id FROM pool WHERE name = ? ORDER BY position", [.text(name)]) { $0.int(0) }
        if ids.isEmpty { throw StoreError.missing("pool \(name)") }
        return ids
    }

    // MARK: Reading (the full database only; the widget database has no page or juz columns)

    public struct AyahRow: Equatable, Sendable {
        public let id: Int
        public let number: Int
        public let arabic: String
    }

    /// Every ayah of a surah, in order.
    public func ayahs(inSurah surah: Int, script: ArabicScript = .uthmani) throws -> [AyahRow] {
        let column = (script == .uthmani && hasUthmani) ? "text_uthmani" : "text_simple"
        return try db.query("SELECT id, number, \(column) FROM ayah WHERE surah = ? ORDER BY number", [.int(surah)]) {
            AyahRow(id: $0.int(0), number: $0.int(1), arabic: $0.text(2))
        }
    }

    /// One translation for every ayah of a surah, in order ('' where the translator merged two ayahs).
    public func translationTexts(inSurah surah: Int, translationID: String) throws -> [String] {
        try db.query(
            """
            SELECT t.text FROM translation_text t JOIN ayah a ON a.id = t.ayah_id
            WHERE t.translation_id = ? AND a.surah = ? ORDER BY a.number
            """,
            [.text(translationID), .int(surah)]
        ) { $0.text(0) }
    }

    /// The first ayah of each of the 30 juz.
    public func juzStarts() throws -> [(juz: Int, ayahID: Int)] {
        try db.query("SELECT juz, MIN(id) FROM ayah GROUP BY juz ORDER BY juz") { (juz: $0.int(0), ayahID: $0.int(1)) }
    }

    public enum Segment: String, Sendable {
        case page
        case juz
        case hizbQuarter = "hizb_quarter"
    }

    /// The segment number (page 1-604, juz 1-30, hizb quarter 1-240) an ayah is in.
    public func number(of segment: Segment, ayahID id: Int) throws -> Int {
        guard let n = try db.query("SELECT \(segment.rawValue) FROM ayah WHERE id = ?", [.int(id)], map: { $0.int(0) }).first else {
            throw StoreError.missing("ayah \(id)")
        }
        return n
    }

    /// The last ayah id in the same page, juz or hizb quarter as `id`.
    public func lastAyahID(inSame segment: Segment, as id: Int) throws -> Int {
        let n = try number(of: segment, ayahID: id)
        return try db.query("SELECT MAX(id) FROM ayah WHERE \(segment.rawValue) = ?", [.int(n)]) { $0.int(0) }.first ?? id
    }

    /// Last ayah id of the stretch of recitation that starts at `id`.
    public func endOfPlayback(from id: Int, to scope: PlayTo) throws -> Int {
        switch scope {
        case .ayah: return id
        case .quran: return totalAyahs
        case .surah:
            let s = surah(try location(ofAyahID: id).surah)
            return s.firstAyahID + s.ayahCount - 1
        case .page: return try lastAyahID(inSame: .page, as: id)
        case .juz: return try lastAyahID(inSame: .juz, as: id)
        case .rub: return try lastAyahID(inSame: .hizbQuarter, as: id)
        }
    }

    public func metaValue(_ key: String) throws -> String? {
        try db.query("SELECT value FROM meta WHERE key = ?", [.text(key)]) { $0.text(0) }.first
    }

    public struct StudyReference: Hashable, Sendable {
        public let raw: String
        public let kind: String
        public let surah: Int
        public let ayah: Int
    }

    public struct StudyEntry: Identifiable, Hashable, Sendable {
        public let id: String
        public let surah: Int
        public let firstAyah: Int
        public let lastAyah: Int
        public let coverageKind: String
        public let text: String
        public let pages: [Int]
        public let references: [StudyReference]
        public let audio: StudyAudio?
    }

    public struct StudyAudio: Hashable, Sendable {
        public let file: String
        public let duration: Double
        public let voice: String
    }

    private func studyEntry(_ id: String) throws -> StudyEntry? {
        let rows = try db.query("SELECT surah_id,first_ayah,last_ayah,coverage_kind,text FROM tafsir_entry WHERE id=?", [.text(id)]) {
            ($0.int(0), $0.int(1), $0.int(2), $0.text(3), $0.text(4))
        }
        guard let r = rows.first else { return nil }
        let pages = try db.query("SELECT DISTINCT pdf_page FROM source_span WHERE record_type='tafsir' AND record_id=? ORDER BY pdf_page", [.text(id)]) { $0.int(0) }
        let refs = try db.query("SELECT raw,target_kind,target_surah,COALESCE(first_ayah,0) FROM cross_reference WHERE record_type='tafsir' AND record_id=? ORDER BY char_start", [.text(id)]) {
            StudyReference(raw: $0.text(0), kind: $0.text(1), surah: $0.int(2), ayah: $0.int(3))
        }
        let audio = hasStudyQuranAudio ? try db.query("SELECT file,duration,voice FROM study_audio WHERE entry_id=?", [.text(id)]) {
            StudyAudio(file: $0.text(0), duration: Double($0.text(1)) ?? 0, voice: $0.text(2))
        }.first : nil
        return StudyEntry(id: id, surah: r.0, firstAyah: r.1, lastAyah: r.2, coverageKind: r.3, text: r.4, pages: pages, references: refs, audio: audio)
    }

    public func studyQuranEntries(ayahID: Int) throws -> [StudyEntry] {
        guard hasStudyQuran else { return [] }
        let ids = try db.query("SELECT e.id FROM tafsir_entry e JOIN tafsir_ayah a ON a.entry_id=e.id WHERE a.ayah_id=? ORDER BY e.source_order", [.int(ayahID)]) { $0.text(0) }
        return try ids.compactMap { try studyEntry($0) }
    }

    public func studyQuranIntroduction(surahID: Int) throws -> String? {
        guard hasStudyQuran else { return nil }
        return try db.query("SELECT text FROM surah_introduction WHERE source_id='study_quran' AND surah_id=?", [.int(surahID)]) { $0.text(0) }.first
    }

    /// Book order, one item per note even when a note covers several ayahs.
    public func narratedStudyQuranEntries(surahID: Int) throws -> [StudyEntry] {
        guard hasStudyQuranAudio else { return [] }
        let ids = try db.query("SELECT e.id FROM tafsir_entry e JOIN study_audio a ON a.entry_id=e.id WHERE e.surah_id=? ORDER BY e.source_order", [.int(surahID)]) { $0.text(0) }
        return try ids.compactMap { try studyEntry($0) }
    }

    public func searchStudyQuran(_ query: String) throws -> [StudyEntry] {
        guard hasStudyQuran else { return [] }
        let words = query.split(whereSeparator: { $0.isWhitespace }).map { "\"" + $0.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }
        guard !words.isEmpty else { return [] }
        let ids = try db.query("SELECT entry_id FROM tafsir_search WHERE tafsir_search MATCH ? ORDER BY rank LIMIT 50", [.text(words.joined(separator: " AND "))]) { $0.text(0) }
        return try ids.compactMap { try studyEntry($0) }
    }
}
