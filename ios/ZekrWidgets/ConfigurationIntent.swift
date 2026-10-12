import AppIntents
import WidgetKit
import ZekrKit

enum PeriodOption: String, AppEnum {
    case hourly
    case every3Hours
    case daily

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Changes"
    static var caseDisplayRepresentations: [PeriodOption: DisplayRepresentation] = [
        .hourly: "Every hour",
        .every3Hours: "Every 3 hours",
        .daily: "Every day",
    ]

    var period: Period {
        switch self {
        case .hourly: return .hourly
        case .every3Hours: return .every3Hours
        case .daily: return .daily
        }
    }
}

enum ShowOption: String, AppEnum {
    case arabicAndPersian
    case arabicAndEnglish
    case arabicOnly
    case persianOnly
    case englishOnly

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Shows"
    static var caseDisplayRepresentations: [ShowOption: DisplayRepresentation] = [
        .arabicAndPersian: "Arabic + Persian",
        .arabicAndEnglish: "Arabic + English",
        .arabicOnly: "Arabic only",
        .persianOnly: "Persian only",
        .englishOnly: "English only",
    ]

    var show: Show {
        switch self {
        case .arabicAndPersian: return .arabicAndPersian
        case .arabicAndEnglish: return .arabicAndEnglish
        case .arabicOnly: return .arabicOnly
        case .persianOnly: return .persianOnly
        case .englishOnly: return .englishOnly
        }
    }
}

enum PersianOption: String, AppEnum {
    case safavi = "fa.safavi"
    case fooladvand = "fa.fooladvand"

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Persian translation"
    static var caseDisplayRepresentations: [PersianOption: DisplayRepresentation] = [
        .safavi: "Safavi (based on Al-Mizan)",
        .fooladvand: "Fooladvand",
    ]
}

enum EnglishOption: String, AppEnum {
    case sahih = "en.sahih"
    case qarai = "en.qarai"

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "English translation"
    static var caseDisplayRepresentations: [EnglishOption: DisplayRepresentation] = [
        .sahih: "Saheeh International",
        .qarai: "Qarai",
    ]
}

enum PoolOption: String, AppEnum {
    case all
    case fitsInFull

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Draws from"
    static var caseDisplayRepresentations: [PoolOption: DisplayRepresentation] = [
        .all: "All ayahs (long ones are trimmed)",
        .fitsInFull: "Ayahs that fit in full",
    ]

    var choice: PoolChoice { self == .all ? .all : .fitsInFull }
}

struct ConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Ayah settings"
    static var description = IntentDescription("Choose how often the ayah changes and what it shows.")

    @Parameter(title: "Changes", default: .daily)
    var period: PeriodOption

    @Parameter(title: "Shows", default: .arabicAndPersian)
    var show: ShowOption

    @Parameter(title: "Persian translation", default: .safavi)
    var persian: PersianOption

    @Parameter(title: "English translation", default: .sahih)
    var english: EnglishOption

    @Parameter(title: "Draws from", default: .all)
    var pool: PoolOption

    /// The same settings as the shared rotation rule uses.
    var config: DailyConfig {
        DailyConfig(
            period: period.period, pool: pool.choice, show: show.show,
            persianTranslationID: persian.rawValue, englishTranslationID: english.rawValue
        )
    }
}
