import Foundation
import Observation
import ZekrKit

/// An ayah to show, from a link or a tap.
struct AyahRoute: Hashable {
    let surah: Int
    let ayah: Int
}

@Observable
final class AppModel {
    var path: [AyahRoute] = []
    private(set) var store: QuranStore?
    private(set) var today: AyahDisplay?
    private(set) var loadError: String?
    let language = LocalizedText.deviceLanguage

    init() {
        do {
            let store = try QuranStore(resource: "quran", in: .main)
            self.store = store
            let provider = DailyAyahProvider(store: store)
            let config = DailyConfig()
            if let entry = try provider.entries(config: config, from: Date(), count: 1).first {
                today = try provider.display(ayahID: entry.ayahID, config: config, script: .uthmani)
            }
        } catch {
            loadError = "\(error)"
        }
    }

    /// Handles `zekr://ayah/17/24` (from the widget, for example).
    func open(_ url: URL) {
        guard case let .ayah(surah, ayah)? = DeepLink(url: url) else { return }
        path = [AyahRoute(surah: surah, ayah: ayah)]
    }
}
