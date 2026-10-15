import Foundation
import Observation
import ZekrKit

/// A surah to read in the Study view, optionally scrolled to an ayah.
struct ReaderRoute: Hashable {
    let surah: Int
    let ayah: Int?
}

/// A screen that opens over the mushaf and closes back to the same page. The mushaf is the only reading screen.
enum Layer: Hashable, Identifiable {
    case index
    case today
    case search
    case saved
    case settings
    case study(ReaderRoute)

    var id: String {
        switch self {
        case .index: return "index"
        case .today: return "today"
        case .search: return "search"
        case .saved: return "saved"
        case .settings: return "settings"
        case let .study(route): return "study-\(route.surah)-\(route.ayah ?? 0)"
        }
    }
}

/// Where the mushaf is asked to go. A new value (a new `id`) moves it even when the page is the same one.
struct MushafTarget: Equatable {
    let id = UUID()
    var page: Int
    /// The ayah whose panel opens on arrival.
    var focus: Int?
}

@Observable
final class AppModel {
    /// The app opens on the mushaf, where you left off; a layer (Quran index, Today, Search, Saved, Settings, the Study
    /// view) opens over it.
    var layer: Layer?
    var mushafTarget = MushafTarget(page: 1, focus: nil)
    var drawerOpen = false
    /// Whether the mushaf's ayah panel (a sheet) is open, so a layer can wait for it to close.
    var panelOpen = false
    /// Whether this build has the printed mushaf page pictures (`tools/mushaf_pages.py --ios-dir`).
    let printedPages = PrintedPages.available

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
            mushafTarget = target(surah: last.surah, ayah: last.ayah, select: false)
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

    /// Shows the mushaf at a surah or an ayah (closing any layer), with that ayah's panel open.
    func open(surah: Int, ayah: Int?, select: Bool = true) {
        drawerOpen = false
        layer = nil
        mushafTarget = target(surah: surah, ayah: ayah, select: select)
    }

    /// The mushaf page of an ayah (the first of the surah when `ayah` is nil). `select` opens that ayah's panel.
    func target(surah: Int, ayah: Int?, select: Bool) -> MushafTarget {
        guard let store else { return MushafTarget(page: 1, focus: nil) }
        let id = store.ayahID(surah: surah, ayah: ayah ?? 1)
        let page = (try? store.pageNumber(ofAyahID: id)) ?? 1
        return MushafTarget(page: page, focus: (select && ayah != nil) ? id : nil)
    }

    /// The Study view: one surah ayah by ayah with translations, over the mushaf.
    func openStudy(at ayahID: Int) {
        guard let store, let location = try? store.location(ofAyahID: ayahID) else { return }
        drawerOpen = false
        layer = .study(ReaderRoute(surah: location.surah, ayah: location.ayah))
    }

    /// Handles `zekr://ayah/17/24` (from the widget, for example).
    func open(_ url: URL) {
        guard case let .ayah(surah, ayah)? = DeepLink(url: url) else { return }
        open(surah: surah, ayah: ayah)
    }

    func text(_ key: Str) -> String { key.text(language: language) }
}
