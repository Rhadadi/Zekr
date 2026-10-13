import SwiftUI
import ZekrKit

struct SavedView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.bookmarks.ids.isEmpty {
                Text(model.text(.savedEmpty))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding()
            } else {
                List {
                    ForEach(model.bookmarks.ids, id: \.self) { id in
                        if let store = model.store, let loc = try? store.location(ofAyahID: id) {
                            Button {
                                model.open(surah: loc.surah, ayah: loc.ayah)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(LocalizedText.header(surah: store.surah(loc.surah), ayah: loc.ayah, language: model.language))
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.tint)
                                    Text((try? store.arabic(ayahID: id, script: model.settings.settings.script)) ?? "")
                                        .font(.quran(model.settings.settings.quranFont, size: 22))
                                        .multilineTextAlignment(.leading)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .environment(\.layoutDirection, .rightToLeft)
                                    if let first = model.settings.settings.translations.first,
                                       let text = try? store.translation(ayahID: id, translationID: first), !text.isEmpty {
                                        Text(text)
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(3)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .onDelete { model.bookmarks.remove(at: $0) }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(model.text(.savedTitle))
        .mainMenu()
    }
}
