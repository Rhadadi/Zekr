import SwiftUI
import ZekrKit

struct StudyQuranView: View {
    var ayahID: Int? = nil
    var surahID: Int? = nil
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var entries: [QuranStore.StudyEntry] = []
    @State private var introduction: String?
    @State private var error: String?
    @State private var query = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    if let error {
                        Text(error).foregroundStyle(.secondary)
                        Button("Retry", action: load)
                    } else {
                        if let introduction { Text(introduction).textSelection(.enabled) }
                        ForEach(entries) { entry in
                            VStack(alignment: .leading, spacing: 8) {
                                let range = entry.firstAyah == entry.lastAyah ? "\(entry.firstAyah)" : "\(entry.firstAyah)–\(entry.lastAyah)"
                                Button("\(entry.coverageKind == "quoted_header" ? "Source passage" : "Commentary") · \(entry.surah):\(range)") {
                                    model.open(surah: entry.surah, ayah: entry.firstAyah)
                                    dismiss()
                                }
                                .font(.headline)
                                Text(entry.text).textSelection(.enabled)
                                Text("The Study Quran · PDF pages " + entry.pages.map(String.init).joined(separator: ", "))
                                    .font(.caption).foregroundStyle(.secondary)
                                ForEach(Array(entry.references.enumerated()), id: \.offset) { _, ref in
                                    Button(ref.raw) {
                                        model.open(surah: ref.surah, ayah: ref.kind == "introduction" ? nil : ref.ayah)
                                        dismiss()
                                    }.font(.caption)
                                }
                                Divider()
                            }
                        }
                        if entries.isEmpty && introduction == nil {
                            Text(query.isEmpty ? "No separately numbered commentary entry for this ayah in this source." : "No commentary entries found.")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .font(.system(size: model.settings.settings.translationSize))
                .padding()
                .environment(\.layoutDirection, .leftToRight)
            }
            .navigationTitle("The Study Quran")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Search The Study Quran tafsir")
            .onSubmit(of: .search, load)
            .onChange(of: query) { _, value in if value.isEmpty { load() } }
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { load() }
        }
    }

    private func load() {
        guard let store = model.store else { return }
        error = nil
        do {
            if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                introduction = nil
                entries = try store.searchStudyQuran(query)
            } else if let ayahID {
                introduction = nil
                entries = try store.studyQuranEntries(ayahID: ayahID)
            } else if let surahID {
                entries = []
                introduction = try store.studyQuranIntroduction(surahID: surahID)
            }
        } catch {
            self.error = "Could not load The Study Quran: \(error.localizedDescription)"
        }
    }
}
