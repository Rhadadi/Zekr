import SwiftUI
import ZekrKit

/// Search the Quran: the Arabic text and the translations chosen in Settings. A result opens the mushaf at that ayah.
struct SearchView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var results: [Int] = []
    @State private var searched = false

    var body: some View {
        List {
            if searched && results.isEmpty {
                Text(model.text(.noResults)).foregroundStyle(.secondary)
            }
            ForEach(results, id: \.self) { id in
                if let store = model.store, let location = try? store.location(ofAyahID: id) {
                    Button { model.open(surah: location.surah, ayah: location.ayah) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(LocalizedText.header(surah: store.surah(location.surah), ayah: location.ayah, language: model.language))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.tint)
                            Text((try? store.arabic(ayahID: id, script: model.settings.settings.script)) ?? "")
                                .font(.quran(model.settings.settings.quranFont, size: 20))
                                .lineLimit(3)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                                .environment(\.layoutDirection, .rightToLeft)
                            ForEach(model.settings.settings.translations, id: \.self) { tid in
                                if let text = try? store.translation(ayahID: id, translationID: tid), !text.isEmpty {
                                    Text(text).font(.footnote).foregroundStyle(.secondary).lineLimit(3)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .listStyle(.plain)
        .searchable(text: $query, prompt: model.text(.searchPrompt))
        .navigationTitle(model.text(.tabSearch))
        // a short wait after the last keystroke, so typing does not search for every letter
        .task(id: query) {
            let q = query.trimmingCharacters(in: .whitespaces)
            guard !q.isEmpty else {
                results = []
                searched = false
                return
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
            if Task.isCancelled { return }
            results = (try? model.store?.search(q, translationIDs: model.settings.settings.translations)) ?? []
            searched = true
        }
    }
}
