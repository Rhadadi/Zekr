import WidgetKit
import ZekrKit

/// One moment of the widget: what to show from `date` until the next entry.
struct AyahEntry: TimelineEntry {
    let date: Date
    /// "Surah Al-Israa, 17:24"
    let header: String
    /// One-line form for the inline widget: "Al-Israa 17:24"
    let shortHeader: String
    let arabic: String?
    let translation: String?
    let translationIsPersian: Bool
    let headerIsPersian: Bool
    let link: URL

    static let placeholder = AyahEntry(
        date: Date(), header: "Surah Al-Isra, 17:24", shortHeader: "Al-Isra 17:24",
        arabic: "وَقُل رَّبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا",
        translation: "My Lord, have mercy upon them as they brought me up [when I was] small.",
        translationIsPersian: false, headerIsPersian: false,
        link: DeepLink.ayah(surah: 17, ayah: 24).url
    )
}

struct Provider: AppIntentTimelineProvider {
    typealias Entry = AyahEntry
    typealias Intent = ConfigurationIntent

    func placeholder(in context: Context) -> AyahEntry { .placeholder }

    func snapshot(for configuration: ConfigurationIntent, in context: Context) async -> AyahEntry {
        (try? makeEntries(configuration.config, count: 1).first) ?? .placeholder
    }

    func timeline(for configuration: ConfigurationIntent, in context: Context) async -> Timeline<AyahEntry> {
        let config = configuration.config
        // iOS only refreshes a widget a few dozen times a day, so hand it the next stretch of ayahs in one go.
        let count: Int
        switch config.period {
        case .hourly: count = 24
        case .every3Hours: count = 16
        case .daily: count = 7
        }
        do {
            return Timeline(entries: try makeEntries(config, count: count), policy: .atEnd)
        } catch {
            return Timeline(entries: [.placeholder], policy: .after(Date().addingTimeInterval(15 * 60)))
        }
    }

    private func makeEntries(_ config: DailyConfig, count: Int) throws -> [AyahEntry] {
        let store = try QuranStore(resource: "widget", in: .main)
        let provider = DailyAyahProvider(store: store)
        let language = LocalizedText.deviceLanguage
        return try provider.entries(config: config, from: Date(), count: count).map { entry in
            let d = try provider.display(ayahID: entry.ayahID, config: config)
            let usePersian = config.showsPersian
            let shown = usePersian ? d.persian : d.english
            let digits = LocalizedText.digits("\(d.surah.id):\(d.ayahNumber)", language: language)
            return AyahEntry(
                date: entry.start,
                header: LocalizedText.header(surah: d.surah, ayah: d.ayahNumber, language: language),
                shortHeader: "\(d.surah.name(language: language)) \(digits)",
                arabic: config.showsArabic ? d.arabic : nil,
                translation: shown.map { $0.isEmpty ? "—" : $0 },
                translationIsPersian: usePersian,
                headerIsPersian: language == "fa",
                link: DeepLink.ayah(surah: d.surah.id, ayah: d.ayahNumber).url
            )
        }
    }
}
