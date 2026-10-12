import SwiftUI
import ZekrKit

@main
struct ZekrApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .onOpenURL { model.open($0) }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            NavigationStack {
                HomeView().withPlayerBar()
            }
            .tabItem { Label(model.text(.tabHome), systemImage: "house") }
            .tag(AppTab.home)

            NavigationStack(path: $model.quranPath) {
                QuranIndexView()
                    .withPlayerBar()
                    .navigationDestination(for: ReaderRoute.self) { route in
                        SurahReaderView(route: route).withPlayerBar()
                    }
            }
            .tabItem { Label(model.text(.tabQuran), systemImage: "book") }
            .tag(AppTab.quran)

            NavigationStack {
                SavedView().withPlayerBar()
            }
            .tabItem { Label(model.text(.tabSaved), systemImage: "bookmark") }
            .tag(AppTab.saved)

            NavigationStack {
                SettingsView().withPlayerBar()
            }
            .tabItem { Label(model.text(.tabSettings), systemImage: "slider.horizontal.3") }
            .tag(AppTab.settings)
        }
    }
}
