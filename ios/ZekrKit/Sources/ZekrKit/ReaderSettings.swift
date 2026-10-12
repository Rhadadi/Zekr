import Foundation

/// Reading and recitation settings, saved as JSON in UserDefaults. Missing keys fall back to the defaults,
/// so a newer app can add settings without losing the saved ones.
public struct ReaderSettings: Codable, Equatable, Sendable {
    /// Translation ids shown under each ayah, in this order.
    public var translations: [String] = ["fa.safavi"]
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
        case translations, useUthmaniScript, quranFontID, arabicSize, translationSize, reciterID, speed, repeatCount, playTo, audioTranslationID, lastAudioTranslationID
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = ReaderSettings()
        translations = try c.decodeIfPresent([String].self, forKey: .translations) ?? d.translations
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
