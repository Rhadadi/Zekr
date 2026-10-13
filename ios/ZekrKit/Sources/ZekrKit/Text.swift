import Foundation

/// Text for headers and numbers in the device language.
public enum LocalizedText {
    private static let persianDigits = Array("۰۱۲۳۴۵۶۷۸۹")

    public static func digits(_ text: String, language: String) -> String {
        guard language == "fa" else { return text }
        return String(text.map { c in c.wholeNumberValue.map { persianDigits[$0] } ?? c })
    }

    /// "Surah Al-Isra, 17:24" / «سورهٔ اسراء، ۱۷:۲۴».
    public static func header(surah: Surah, ayah: Int, language: String) -> String {
        let ref = digits("\(surah.id):\(ayah)", language: language)
        return language == "fa"
            ? "سورهٔ \(surah.nameFarsi)، \(ref)"
            : "Surah \(surah.nameTransliteration), \(ref)"
    }

    public static func ayahCount(_ n: Int, language: String) -> String {
        language == "fa" ? "\(digits(String(n), language: language)) آیه" : (n == 1 ? "1 ayah" : "\(n) ayahs")
    }

    public static func juzTitle(_ n: Int, language: String) -> String {
        language == "fa" ? "جزء \(digits(String(n), language: language))" : "Juz \(n)"
    }

    public static func pageTitle(_ n: Int, language: String) -> String {
        language == "fa" ? "صفحهٔ \(digits(String(n), language: language))" : "Page \(n)"
    }

    /// The device's language code, "fa" or "en" (anything else counts as English).
    public static var deviceLanguage: String {
        let code = Locale.preferredLanguages.first.map { String($0.prefix(2)) } ?? "en"
        return code == "fa" ? "fa" : "en"
    }
}
