import SwiftUI
import ZekrKit

struct AyahDetailView: View {
    @Environment(AppModel.self) private var model
    let route: AyahRoute
    @State private var player = AyahPlayer()

    var body: some View {
        ScrollView {
            if let store = model.store, let content = content(store) {
                VStack(alignment: .leading, spacing: 16) {
                    Text(content.arabic)
                        .font(.system(size: 30))
                        .lineSpacing(12)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .environment(\.layoutDirection, .rightToLeft)
                    ForEach(content.translations) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.info.name).font(.caption).foregroundStyle(.secondary)
                            Text(item.text.isEmpty ? "—" : item.text)
                                .font(.body)
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .environment(\.layoutDirection, item.info.isRightToLeft ? .rightToLeft : .leftToRight)
                        }
                    }
                    Button {
                        player.toggle(ayahID: content.id, surah: route.surah, ayah: route.ayah)
                    } label: {
                        let playing = player.playingAyahID == content.id && player.isPlaying
                        Label(
                            playing ? Str.pause.text(language: model.language) : Str.play.text(language: model.language),
                            systemImage: playing ? "pause.fill" : "play.fill"
                        )
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding()
            } else {
                Text(Str.ayahNotFound.text(language: model.language))
                    .foregroundStyle(.secondary)
                    .padding()
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { player.stop() }
    }

    private var title: String {
        guard let store = model.store, (1...114).contains(route.surah) else { return Str.appName.text(language: model.language) }
        return LocalizedText.header(surah: store.surah(route.surah), ayah: route.ayah, language: model.language)
    }

    private struct TranslationItem: Identifiable {
        let info: TranslationInfo
        let text: String
        var id: String { info.id }
    }

    private struct Content {
        let id: Int
        let arabic: String
        let translations: [TranslationItem]
    }

    private func content(_ store: QuranStore) -> Content? {
        guard (1...114).contains(route.surah), (1...store.surah(route.surah).ayahCount).contains(route.ayah) else { return nil }
        let id = store.ayahID(surah: route.surah, ayah: route.ayah)
        guard let arabic = try? store.arabic(ayahID: id, script: .uthmani),
              let infos = try? store.translations() else { return nil }
        let wanted = ["fa.safavi", "en.sahih"]
        let translations = infos.filter { wanted.contains($0.id) }.compactMap { info -> TranslationItem? in
            guard let text = try? store.translation(ayahID: id, translationID: info.id) else { return nil }
            return TranslationItem(info: info, text: text)
        }
        return Content(id: id, arabic: arabic, translations: translations)
    }
}
