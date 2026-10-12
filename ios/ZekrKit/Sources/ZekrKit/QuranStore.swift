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
    public let surahs: [Surah]
    private let hasUthmani: Bool

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

    public func metaValue(_ key: String) throws -> String? {
        try db.query("SELECT value FROM meta WHERE key = ?", [.text(key)]) { $0.text(0) }.first
    }
}
