import Foundation

public struct Surah: Hashable, Sendable {
    public let id: Int
    public let ayahCount: Int
    /// Global id of the surah's first ayah (ids run 1...6236).
    public let firstAyahID: Int
    public let nameArabic: String
    public let nameFarsi: String
    public let nameTransliteration: String
    public let nameEnglish: String
    public let isMeccan: Bool

    /// The surah's name in the given language code ("fa" → Persian, anything else → transliteration).
    public func name(language: String) -> String {
        language == "fa" ? nameFarsi : nameTransliteration
    }
}

public struct AyahLocation: Hashable, Sendable {
    public let surah: Int
    public let ayah: Int

    public init(surah: Int, ayah: Int) {
        self.surah = surah
        self.ayah = ayah
    }
}

public struct TranslationInfo: Hashable, Sendable {
    public let id: String
    public let language: String
    public let name: String
    public let translator: String
    public var isRightToLeft: Bool { language == "fa" }
}

public enum ArabicScript: Sendable {
    case uthmani
    case simple
}

public let totalAyahs = 6236
