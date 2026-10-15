import Foundation

/// Where the mushaf shows an ayah's translation: in the panel (the sheet on a phone, the inspector on an iPad), in a card
/// over the page, inline under every ayah, or not on the page at all.
public enum TranslationPlace: String, Codable, CaseIterable, Sendable {
    case panel
    case card
    case inline
    case off
}

/// The printed mushaf pages are recoloured with a filter; `blue` is the edition as printed.
public enum PageColor: String, Codable, CaseIterable, Sendable {
    case blue
    case green
    case purple
    case pink
    case dark
}

/// Reading and recitation settings, saved as JSON in UserDefaults. Missing keys fall back to the defaults,
/// so a newer app can add settings without losing the saved ones.
public struct ReaderSettings: Codable, Equatable, Sendable {
    /// Translation ids shown under each ayah, in this order.
    public var translations: [String] = ["fa.safavi"]
    public var translationPlace = TranslationPlace.panel
    public var pageColor = PageColor.blue
    /// While reciting, keep the ayah being recited on screen (even after scrolling elsewhere).
    public var followRecitation = true
    public var useUthmaniScript = true
    /// A `QuranFont` id.
    public var quranFontID = QuranFont.hafs.id
    public var arabicSize = 28.0
    public var translationSize = 17.0
    public var reciterID = Reciter.minshawi.id
    public var speed = 1.0
    public var repeatCount = 1
    public var playTo = PlayTo.surah
    /// An `AudioTranslation` id, or nil for none.
    public var audioTranslationID: String?
    /// The translation recording last switched on, so the quick switch brings it back.
    public var lastAudioTranslationID: String?

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case translations, translationPlace, pageBox, readMode, pageColor, followRecitation, useUthmaniScript, quranFontID, arabicSize, translationSize, reciterID, speed, repeatCount, playTo, audioTranslationID, lastAudioTranslationID
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = ReaderSettings()
        translations = try c.decodeIfPresent([String].self, forKey: .translations) ?? d.translations
        // Older versions saved a box position (and a reading view, which is gone: the mushaf is the only reading
        // screen). Over the page stays a card; every other box position becomes the panel.
        if let place = try? c.decodeIfPresent(TranslationPlace.self, forKey: .translationPlace) {
            translationPlace = place
        } else if let old = try? c.decodeIfPresent(String.self, forKey: .pageBox) {
            translationPlace = old == "popup" ? .card : .panel
        } else {
            translationPlace = d.translationPlace
        }
        pageColor = (try? c.decodeIfPresent(PageColor.self, forKey: .pageColor)) ?? d.pageColor
        followRecitation = try c.decodeIfPresent(Bool.self, forKey: .followRecitation) ?? d.followRecitation
        useUthmaniScript = try c.decodeIfPresent(Bool.self, forKey: .useUthmaniScript) ?? d.useUthmaniScript
        quranFontID = try c.decodeIfPresent(String.self, forKey: .quranFontID) ?? d.quranFontID
        arabicSize = try c.decodeIfPresent(Double.self, forKey: .arabicSize) ?? d.arabicSize
        translationSize = try c.decodeIfPresent(Double.self, forKey: .translationSize) ?? d.translationSize
        reciterID = try c.decodeIfPresent(String.self, forKey: .reciterID) ?? d.reciterID
        speed = try c.decodeIfPresent(Double.self, forKey: .speed) ?? d.speed
        repeatCount = try c.decodeIfPresent(Int.self, forKey: .repeatCount) ?? d.repeatCount
        playTo = (try? c.decodeIfPresent(PlayTo.self, forKey: .playTo)) ?? d.playTo
        audioTranslationID = try c.decodeIfPresent(String.self, forKey: .audioTranslationID)
        lastAudioTranslationID = try c.decodeIfPresent(String.self, forKey: .lastAudioTranslationID)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(translations, forKey: .translations)
        try c.encode(translationPlace, forKey: .translationPlace)
        try c.encode(pageColor, forKey: .pageColor)
        try c.encode(followRecitation, forKey: .followRecitation)
        try c.encode(useUthmaniScript, forKey: .useUthmaniScript)
        try c.encode(quranFontID, forKey: .quranFontID)
        try c.encode(arabicSize, forKey: .arabicSize)
        try c.encode(translationSize, forKey: .translationSize)
        try c.encode(reciterID, forKey: .reciterID)
        try c.encode(speed, forKey: .speed)
        try c.encode(repeatCount, forKey: .repeatCount)
        try c.encode(playTo, forKey: .playTo)
        try c.encodeIfPresent(audioTranslationID, forKey: .audioTranslationID)
        try c.encodeIfPresent(lastAudioTranslationID, forKey: .lastAudioTranslationID)
    }

    /// One tap to hear the translation after each ayah, one tap to stop. Brings back the recording chosen last;
    /// the first time, Fooladvand for Persian and Saheeh International for English.
    public mutating func toggleTranslationAudio(language: String) {
        if let current = audioTranslationID {
            lastAudioTranslationID = current
            audioTranslationID = nil
            return
        }
        if let last = lastAudioTranslationID, AudioTranslation.all.contains(where: { $0.id == last }) {
            audioTranslationID = last
        } else {
            audioTranslationID = language == "fa" ? "fa.fooladvand" : "en.sahih"
        }
    }

    public var script: ArabicScript { useUthmaniScript ? .uthmani : .simple }
    public var quranFont: QuranFont { QuranFont.named(quranFontID) }
    public var reciter: Reciter { Reciter.all.first { $0.id == reciterID } ?? .minshawi }
    public var audioTranslation: AudioTranslation? { AudioTranslation.all.first { $0.id == audioTranslationID } }

    public static let defaultsKey = "zekr.readerSettings"

    public static func load(from defaults: UserDefaults = .standard) -> ReaderSettings {
        guard let data = defaults.data(forKey: defaultsKey), let s = try? JSONDecoder().decode(ReaderSettings.self, from: data) else {
            return ReaderSettings()
        }
        return s
    }

    public func save(to defaults: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(self) { defaults.set(data, forKey: Self.defaultsKey) }
    }
}
