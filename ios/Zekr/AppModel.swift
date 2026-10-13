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

/// A screen in the Quran tab: a surah verse by verse, or a mushaf page (optionally with one ayah's translation open).
enum QuranRoute: Hashable {
    case verses(ReaderRoute)
    case page(Int, focus: Int?)
}

@Observable
final class AppModel {
    /// The app opens on the Quran, where you left off.
    var tab: AppTab = .quran
    var quranPath: [QuranRoute] = []

    let language = LocalizedText.deviceLanguage
    let settings = SettingsStore()
    let bookmarks = BookmarkStore()
    let player = AyahPlayer()
    /// Al-Mizan, when this build includes it (`build_data.py --almizan`).
    let tafsir = TafsirStore(resource: "almizan", in: .main)

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
            let last = Self.loadLastRead()
            quranPath = [route(surah: last.surah, ayah: last.ayah > 1 ? last.ayah : nil, select: false)]
        } catch {
            loadError = "\(error)"
        }
    }

    // MARK: Where you left off

    private static let lastReadKey = "zekr.lastRead"

    private static func loadLastRead() -> AyahLocation {
        let saved = UserDefaults.standard.array(forKey: lastReadKey) as? [Int] ?? []
        guard saved.count == 2, (1...114).contains(saved[0]), saved[1] >= 1 else { return AyahLocation(surah: 1, ayah: 1) }
        return AyahLocation(surah: saved[0], ayah: saved[1])
    }

    func saveLastRead(surah: Int, ayah: Int) {
        UserDefaults.standard.set([surah, ayah], forKey: Self.lastReadKey)
    }

    /// A page counts as read from its first ayah.
    func saveLastRead(page: MushafPage?) {
        guard let page, let store, let location = try? store.location(ofAyahID: page.ayahIDs.lowerBound) else { return }
        saveLastRead(surah: location.surah, ayah: location.ayah)
    }

    func open(surah: Int, ayah: Int?) {
        tab = .quran
        quranPath = [route(surah: surah, ayah: ayah)]
    }

    /// Where a surah (or an ayah in it) opens, in the reading view chosen in Settings.
    /// On a page, `select` opens that ayah's translation.
    func route(surah: Int, ayah: Int?, select: Bool = true) -> QuranRoute {
        if settings.settings.readMode == .page, let store {
            let id = store.ayahID(surah: surah, ayah: ayah ?? 1)
            if let page = try? store.pageNumber(ofAyahID: id) {
                return .page(page, focus: (select && ayah != nil) ? id : nil)
            }
        }
        return .verses(ReaderRoute(surah: surah, ayah: ayah))
    }

    /// Switches between verse-by-verse and page view at an ayah, and remembers the choice.
    func switchReadMode(to mode: ReadMode, at ayahID: Int) {
        settings.update { $0.readMode = mode }
        guard let store, let location = try? store.location(ofAyahID: ayahID) else { return }
        let route: QuranRoute = mode == .page
            ? .page((try? store.pageNumber(ofAyahID: ayahID)) ?? 1, focus: nil)
            : .verses(ReaderRoute(surah: location.surah, ayah: location.ayah))
        if quranPath.isEmpty { quranPath = [route] } else { quranPath[quranPath.count - 1] = route }
    }

    /// Handles `zekr://ayah/17/24` (from the widget, for example).
    func open(_ url: URL) {
        guard case let .ayah(surah, ayah)? = DeepLink(url: url) else { return }
        open(surah: surah, ayah: ayah)
    }

    func text(_ key: Str) -> String { key.text(language: language) }
}
