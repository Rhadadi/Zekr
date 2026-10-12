import Foundation
import Observation
import SwiftUI
import ZekrKit

/// The reader and recitation settings, saved as they change.
@Observable
final class SettingsStore {
    private(set) var settings: ReaderSettings

    /// Called after every change (the player uses it to pick up speed, repeat and so on).
    @ObservationIgnored var onChange: (() -> Void)?

    init() {
        settings = ReaderSettings.load()
    }

    func update(_ change: (inout ReaderSettings) -> Void) {
        var updated = settings
        change(&updated)
        settings = updated
        updated.save()
        onChange?()
    }

    func binding<Value>(_ keyPath: WritableKeyPath<ReaderSettings, Value>) -> Binding<Value> {
        Binding(
            get: { self.settings[keyPath: keyPath] },
            set: { newValue in self.update { $0[keyPath: keyPath] = newValue } }
        )
    }
}
