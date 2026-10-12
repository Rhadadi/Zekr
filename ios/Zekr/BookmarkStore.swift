import Foundation
import Observation

/// Saved ayahs (global ayah ids), newest first.
@Observable
final class BookmarkStore {
    private(set) var ids: [Int]
    private let key = "zekr.bookmarks"

    init() {
        ids = UserDefaults.standard.array(forKey: "zekr.bookmarks") as? [Int] ?? []
    }

    func contains(_ id: Int) -> Bool { ids.contains(id) }

    func toggle(_ id: Int) {
        if let index = ids.firstIndex(of: id) {
            ids.remove(at: index)
        } else {
            ids.insert(id, at: 0)
        }
        save()
    }

    func remove(at offsets: IndexSet) {
        for index in offsets.sorted(by: >) { ids.remove(at: index) }
        save()
    }

    private func save() {
        UserDefaults.standard.set(ids, forKey: key)
    }
}
