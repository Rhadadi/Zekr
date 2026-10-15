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

/// The mushaf is the one reading screen. Everything else (the Quran index, Today, Search, Saved, Settings, the Study
/// view) is a layer that opens over it and closes back to the same page; the drawer from the burger switches between them.
struct RootView: View {
    @Environment(AppModel.self) private var model
    /// The layer on screen. It follows `model.layer`, but waits while the mushaf's ayah sheet is still closing.
    @State private var shown: Layer?

    var body: some View {
        ZStack(alignment: .leading) {
            NavigationStack {
                Group {
                    if model.store != nil {
                        MushafReaderView()
                    } else {
                        Text(model.loadError ?? Str.couldNotLoad.text(language: model.language))
                            .foregroundStyle(.secondary)
                            .padding()
                    }
                }
                .withPlayerBar()
            }
            .accessibilityHidden(model.drawerOpen)
            DrawerView()
        }
        .fullScreenCover(item: $shown) { layer in
            LayerView(layer: layer).environment(model)
        }
        .onChange(of: model.layer) { _, new in
            guard let new else {
                shown = nil
                return
            }
            if model.panelOpen {
                // two presentations cannot overlap: let the sheet finish closing first
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    if model.layer == new { shown = new }
                }
            } else {
                shown = new
            }
        }
    }
}

/// A screen over the mushaf, with its own bar and a close button.
struct LayerView: View {
    let layer: Layer
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            content
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { model.layer = nil } label: { Image(systemName: "xmark") }
                            .accessibilityLabel(model.text(.close))
                    }
                }
                .withPlayerBar()
        }
    }

    @ViewBuilder private var content: some View {
        switch layer {
        case .index: QuranIndexView()
        case .today: HomeView()
        case .search: SearchView()
        case .saved: SavedView()
        case .settings: SettingsView()
        case let .study(route): SurahReaderView(route: route)
        }
    }
}

/// The navigation drawer from the burger: Quran, Today, Search, Saved, Settings. It opens from the leading edge (the
/// right in Persian) and closes on a tap outside it, on a choice, and on the VoiceOver escape gesture.
struct DrawerView: View {
    @Environment(AppModel.self) private var model

    private struct Item: Identifiable {
        let layer: Layer
        let title: Str
        let symbol: String
        var id: String { layer.id }
    }

    private let items = [
        Item(layer: .index, title: .tabQuran, symbol: "book"),
        Item(layer: .today, title: .tabToday, symbol: "sun.max"),
        Item(layer: .search, title: .tabSearch, symbol: "magnifyingglass"),
        Item(layer: .saved, title: .tabSaved, symbol: "bookmark"),
        Item(layer: .settings, title: .tabSettings, symbol: "slider.horizontal.3"),
    ]

    var body: some View {
        ZStack(alignment: .leading) {
            if model.drawerOpen {
                Color.black.opacity(0.35)
                    .ignoresSafeArea()
                    .onTapGesture { model.drawerOpen = false }
                    .accessibilityHidden(true)
                    .transition(.opacity)
                panel
                    .transition(.move(edge: .leading))
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.drawerOpen)
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(model.text(.appName)).font(.title3.weight(.bold))
                Spacer()
                Button { model.drawerOpen = false } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                    .accessibilityLabel(model.text(.close))
            }
            .padding(.leading, 8)
            ForEach(items) { item in
                Button {
                    model.drawerOpen = false
                    model.layer = item.layer
                } label: {
                    Label(model.text(item.title), systemImage: item.symbol)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .padding(.horizontal, 8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.top, 12)
        .frame(width: 300)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(.regularMaterial)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { model.drawerOpen = false }
    }
}
