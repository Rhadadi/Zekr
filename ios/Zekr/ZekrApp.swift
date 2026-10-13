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
                    .navigationDestination(for: QuranRoute.self) { route in
                        switch route {
                        case let .verses(reader):
                            SurahReaderView(route: reader).withPlayerBar()
                        case let .page(page, focus):
                            MushafReaderView(page: page, focus: focus).withPlayerBar()
                        }
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
