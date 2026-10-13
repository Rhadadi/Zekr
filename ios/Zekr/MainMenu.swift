import SwiftUI
import ZekrKit

/// The one small button at the top left that replaces the tab bar: Quran, Today, Saved and Settings.
struct MainMenu: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Menu {
            item(.quran, model.text(.tabQuran), "book") {
                if model.tab == .quran { model.quranPath = [] }
            }
            item(.home, model.text(.tabToday), "sun.max")
            item(.saved, model.text(.tabSaved), "bookmark")
            item(.settings, model.text(.tabSettings), "slider.horizontal.3")
        } label: {
            Image(systemName: "line.3.horizontal")
        }
        .accessibilityLabel(model.text(.menu))
    }

    private func item(_ tab: AppTab, _ title: String, _ symbol: String, also: (() -> Void)? = nil) -> some View {
        Button {
            also?()
            model.tab = tab
        } label: {
            if model.tab == tab { Label(title, systemImage: "checkmark") } else { Label(title, systemImage: symbol) }
        }
    }
}

extension View {
    /// Puts the menu button at the top left of a screen.
    func mainMenu() -> some View {
        toolbar { ToolbarItem(placement: .topBarLeading) { MainMenu() } }
    }
}
