import Foundation

/// Text normalised for searching: no Arabic marks (harakat, tatweel), alef wasla as a plain alef, and one form of yeh and
/// kaf: the Persian forms (the translations use those), or the Arabic forms (the Arabic text uses those).
public enum SearchText {
    public static func normalize(_ text: String, persian: Bool = true) -> String {
        var out = ""
        for scalar in text.unicodeScalars {
            switch scalar.value {
            case 0x064B...0x065F, 0x0670, 0x06D6...0x06ED, 0x0640: continue // marks, superscript alef, Quranic marks, tatweel
            case 0x0671: out.unicodeScalars.append("\u{0627}") // ٱ -> ا
            case 0x064A, 0x0649, 0x06CC: out.unicodeScalars.append(persian ? "\u{06CC}" : "\u{064A}") // ي ى ی
            case 0x0643, 0x06A9: out.unicodeScalars.append(persian ? "\u{06A9}" : "\u{0643}") // ك ک
            case 0x0660...0x0669 where persian: out.unicodeScalars.append(Unicode.Scalar(0x06F0 + scalar.value - 0x0660)!) // ٠-٩ -> ۰-۹
            default: out.unicodeScalars.append(scalar)
            }
        }
        return out
    }

    /// The words of a query, normalised.
    public static func words(_ query: String, persian: Bool = true) -> [String] {
        normalize(query, persian: persian).split(whereSeparator: { $0.isWhitespace }).map(String.init)
    }
}

extension QuranStore {
    /// The ayahs (ids, in order) whose plain Arabic text, or one of the chosen translations, contains every word of `query`.
    public func search(_ query: String, translationIDs: [String], limit: Int = 100) throws -> [Int] {
        let persianWords = SearchText.words(query)
        let arabicWords = SearchText.words(query, persian: false)
        guard !persianWords.isEmpty else { return [] }

        // The Arabic text keeps some marks, so it is compared in memory after normalising (6,236 short strings).
        var found = Set<Int>()
        for row in try database.query("SELECT id, text_simple FROM ayah ORDER BY id", map: { (id: $0.int(0), text: $0.text(1)) }) {
            let text = SearchText.normalize(row.text, persian: false)
            if arabicWords.allSatisfy({ text.contains($0) }) { found.insert(row.id) }
        }

        if !translationIDs.isEmpty {
            let marks = translationIDs.map { _ in "?" }.joined(separator: ",")
            let conditions = Array(repeating: "text LIKE ? ESCAPE '\\'", count: persianWords.count).joined(separator: " AND ")
            var binds: [Bind] = translationIDs.map { .text($0) }
            binds += persianWords.map { word in
                .text("%" + word.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "%", with: "\\%").replacingOccurrences(of: "_", with: "\\_") + "%")
            }
            let sql = "SELECT DISTINCT ayah_id FROM translation_text WHERE translation_id IN (\(marks)) AND \(conditions)"
            found.formUnion(try database.query(sql, binds) { $0.int(0) })
        }
        return Array(found.sorted().prefix(limit))
    }
}
