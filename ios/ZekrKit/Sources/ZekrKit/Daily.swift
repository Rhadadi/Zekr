import Foundation

public enum Period: Int, Sendable, CaseIterable {
    case hourly = 3600
    case every3Hours = 10800
    case daily = 86400
}

public enum PoolChoice: Sendable {
    /// Every ayah; long ones are trimmed by the view.
    case all
    /// Only ayahs that fit in full in the widget (for the translation shown).
    case fitsInFull
}

public enum Show: Sendable {
    case arabicAndPersian
    case arabicAndEnglish
    case arabicOnly
    case persianOnly
    case englishOnly
}

/// What the widget (and the app's ayah of the day) shows and how it rotates.
public struct DailyConfig: Equatable, Sendable {
    public var period: Period
    public var pool: PoolChoice
    public var show: Show
    public var persianTranslationID: String
    public var englishTranslationID: String
    public var salt: UInt32

    public init(
        period: Period = .daily, pool: PoolChoice = .all, show: Show = .arabicAndPersian,
        persianTranslationID: String = "fa.safavi", englishTranslationID: String = "en.sahih", salt: UInt32 = 0
    ) {
        self.period = period
        self.pool = pool
        self.show = show
        self.persianTranslationID = persianTranslationID
        self.englishTranslationID = englishTranslationID
        self.salt = salt
    }

    public var showsPersian: Bool { show == .arabicAndPersian || show == .persianOnly }
    public var showsEnglish: Bool { show == .arabicAndEnglish || show == .englishOnly }
    public var showsArabic: Bool { show != .persianOnly && show != .englishOnly }

    /// Name of the pool in the database: "all", or the ayahs that fit for the translation being shown.
    public var poolName: String {
        guard pool == .fitsInFull else { return "all" }
        if showsPersian { return "fits.\(persianTranslationID)" }
        if showsEnglish { return "fits.\(englishTranslationID)" }
        return "all"
    }
}

extension PoolChoice: Equatable {}
extension Show: Equatable {}

/// One time slot of the rotation.
public struct DailyEntry: Equatable, Sendable {
    public let slot: Int
    public let start: Date
    public let end: Date
    public let ayahID: Int
    public let location: AyahLocation
}

/// Text for showing an entry.
public struct AyahDisplay: Equatable, Sendable {
    public let ayahID: Int
    public let surah: Surah
    public let ayahNumber: Int
    public let arabic: String
    public let persian: String?
    public let english: String?
}

public struct DailyAyahProvider {
    public let store: QuranStore

    public init(store: QuranStore) { self.store = store }

    /// Entries for `count` consecutive slots, the first being the slot that contains `now`.
    public func entries(config: DailyConfig, from now: Date, count: Int, timeZone: TimeZone = .current) throws -> [DailyEntry] {
        let pool = try store.pool(named: config.poolName)
        let period = config.period.rawValue
        let firstSlot = Rotation.slot(
            unixSeconds: Int(now.timeIntervalSince1970.rounded(.down)),
            utcOffsetSeconds: timeZone.secondsFromGMT(for: now),
            period: period
        )
        var result: [DailyEntry] = []
        for slot in firstSlot..<(firstSlot + count) {
            let id = Rotation.ayah(pool: pool, slot: slot, salt: config.salt)
            let entry = DailyEntry(
                slot: slot,
                start: Self.start(ofSlot: slot, period: period, timeZone: timeZone),
                end: Self.start(ofSlot: slot + 1, period: period, timeZone: timeZone),
                ayahID: id,
                location: try store.location(ofAyahID: id)
            )
            // A clock change can make two slots start at the same instant (the skipped hour): keep the later one.
            if let last = result.last, last.start >= entry.start { result.removeLast() }
            result.append(entry)
        }
        return result
    }

    public func display(ayahID: Int, config: DailyConfig, script: ArabicScript = .simple) throws -> AyahDisplay {
        let location = try store.location(ofAyahID: ayahID)
        return AyahDisplay(
            ayahID: ayahID,
            surah: store.surah(location.surah),
            ayahNumber: location.ayah,
            arabic: try store.arabic(ayahID: ayahID, script: script),
            persian: config.showsPersian ? try store.translation(ayahID: ayahID, translationID: config.persianTranslationID) : nil,
            english: config.showsEnglish ? try store.translation(ayahID: ayahID, translationID: config.englishTranslationID) : nil
        )
    }

    /// When a slot starts, in local time (daily slots start at local midnight, hourly ones on the hour).
    static func start(ofSlot slot: Int, period: Int, timeZone: TimeZone) -> Date {
        let localSeconds = TimeInterval(slot * period)
        var guess = Date(timeIntervalSince1970: localSeconds)
        for _ in 0..<2 {
            guess = Date(timeIntervalSince1970: localSeconds - TimeInterval(timeZone.secondsFromGMT(for: guess)))
        }
        return guess
    }
}
