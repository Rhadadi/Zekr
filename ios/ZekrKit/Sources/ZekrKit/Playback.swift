import Foundation

// What plays next. The rules match web/src/playback.ts; the app's player does the playing.

public enum PlaybackPhase: Equatable, Sendable {
    case basmala
    case ayah
    case translation
}

public struct PlaybackCursor: Equatable, Sendable {
    public var ayahID: Int
    public var phase: PlaybackPhase
    /// Plays of this ayah still to come, including the current one.
    public var repeatLeft: Int

    public init(ayahID: Int, phase: PlaybackPhase, repeatLeft: Int) {
        self.ayahID = ayahID
        self.phase = phase
        self.repeatLeft = repeatLeft
    }
}

public struct PlaybackPlan: Equatable, Sendable {
    /// Last ayah id to play.
    public var end: Int
    /// Times each ayah plays.
    public var repeatCount: Int
    /// Play a translation recording after each ayah.
    public var translation: Bool

    public init(end: Int, repeatCount: Int = 1, translation: Bool = false) {
        self.end = end
        self.repeatCount = max(1, repeatCount)
        self.translation = translation
    }
}

/// How far playback runs on from the ayah that was tapped.
public enum PlayTo: String, Codable, CaseIterable, Sendable {
    case ayah
    case page
    case surah
    case juz
    case rub
    case quran
}

/// A recorded translation that can play after each ayah.
public struct AudioTranslation: Hashable, Sendable {
    public let id: String
    public let folder: String
    public let nameFarsi: String
    public let nameEnglish: String

    public func name(language: String) -> String { language == "fa" ? nameFarsi : nameEnglish }

    public static let all: [AudioTranslation] = [
        AudioTranslation(id: "fa.fooladvand", folder: "translations/Fooladvand_Hedayatfar_40Kbps", nameFarsi: "فولادوند (هدایت‌فر)", nameEnglish: "Persian: Fooladvand, read by Hedayatfar"),
        AudioTranslation(id: "fa.makarem", folder: "translations/Makarem_Kabiri_16Kbps", nameFarsi: "مکارم (کبیری)", nameEnglish: "Persian: Makarem, read by Kabiri"),
        AudioTranslation(id: "en.sahih", folder: "English/Sahih_Intnl_Ibrahim_Walk_192kbps", nameFarsi: "انگلیسی: صحیح اینترنشنال (ابراهیم واک)", nameEnglish: "English: Saheeh International, read by Ibrahim Walk"),
    ]
}

public enum Playback {
    /// The first ayah of every surah except 1 (where it is the basmala) and 9 (which has none) is preceded by the basmala.
    public static func hasBasmalaBefore(surah: Int, ayah: Int) -> Bool {
        ayah == 1 && surah != 1 && surah != 9
    }

    public static func start(location: AyahLocation, ayahID: Int, plan: PlaybackPlan, withBasmala: Bool) -> PlaybackCursor {
        let basmala = withBasmala && hasBasmalaBefore(surah: location.surah, ayah: location.ayah)
        return PlaybackCursor(ayahID: ayahID, phase: basmala ? .basmala : .ayah, repeatLeft: plan.repeatCount)
    }

    /// The cursor after the current recording finishes, or nil when the plan is done.
    public static func afterEnded(_ cur: PlaybackCursor, plan: PlaybackPlan) -> PlaybackCursor? {
        if cur.phase == .basmala { return PlaybackCursor(ayahID: cur.ayahID, phase: .ayah, repeatLeft: cur.repeatLeft) }
        if cur.phase == .ayah && plan.translation { return PlaybackCursor(ayahID: cur.ayahID, phase: .translation, repeatLeft: cur.repeatLeft) }
        if cur.repeatLeft > 1 { return PlaybackCursor(ayahID: cur.ayahID, phase: .ayah, repeatLeft: cur.repeatLeft - 1) }
        if cur.ayahID < plan.end { return PlaybackCursor(ayahID: cur.ayahID + 1, phase: .ayah, repeatLeft: plan.repeatCount) }
        return nil
    }

    public static func skipNext(_ cur: PlaybackCursor, plan: PlaybackPlan) -> PlaybackCursor? {
        cur.ayahID < totalAyahs ? PlaybackCursor(ayahID: cur.ayahID + 1, phase: .ayah, repeatLeft: plan.repeatCount) : nil
    }

    public static func skipPrevious(_ cur: PlaybackCursor, plan: PlaybackPlan) -> PlaybackCursor? {
        cur.ayahID > 1 ? PlaybackCursor(ayahID: cur.ayahID - 1, phase: .ayah, repeatLeft: plan.repeatCount) : nil
    }

    /// The recording for a cursor: the reciter's ayah (or the basmala from 1:1), or the translation recording.
    public static func url(for cursor: PlaybackCursor, location: AyahLocation, reciter: Reciter, translation: AudioTranslation?) -> URL {
        switch cursor.phase {
        case .basmala: return reciter.url(surah: 1, ayah: 1)
        case .translation:
            if let translation { return Reciter.audioURL(folder: translation.folder, surah: location.surah, ayah: location.ayah) }
            return reciter.url(surah: location.surah, ayah: location.ayah)
        case .ayah: return reciter.url(surah: location.surah, ayah: location.ayah)
        }
    }
}
