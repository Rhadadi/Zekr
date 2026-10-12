import Foundation
import Observation
import ZekrKit

enum AppTab: Hashable {
    case home
    case quran
    case saved
    case settings
}

/// A surah to read, optionally scrolled to an ayah.
struct ReaderRoute: Hashable {
    let surah: Int
    let ayah: Int?
}

@Observable
final class AppModel {
    var tab: AppTab = .home
    var quranPath: [ReaderRoute] = []

    let language = LocalizedText.deviceLanguage
    let settings = SettingsStore()
    let bookmarks = BookmarkStore()
    let player = AyahPlayer()

    private(set) var store: QuranStore?
    private(set) var today: AyahDisplay?
    private(set) var loadError: String?

    init() {
        do {
            let store = try QuranStore(resource: "quran", in: .main)
            self.store = store
            player.configure(store: store, settings: settings)
            let provider = DailyAyahProvider(store: store)
            let config = DailyConfig()
            if let entry = try provider.entries(config: config, from: Date(), count: 1).first {
                today = try provider.display(ayahID: entry.ayahID, config: config, script: settings.settings.script)
            }
        } catch {
            loadError = "\(error)"
        }
    }

    func open(surah: Int, ayah: Int?) {
        tab = .quran
        quranPath = [ReaderRoute(surah: surah, ayah: ayah)]
    }

    /// Handles `zekr://ayah/17/24` (from the widget, for example).
    func open(_ url: URL) {
        guard case let .ayah(surah, ayah)? = DeepLink(url: url) else { return }
        open(surah: surah, ayah: ayah)
    }

    func text(_ key: Str) -> String { key.text(language: language) }
}
