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
                                if let audio = entry.audio {
                                    let active = model.player.commentary?.id == entry.id
                                    Button {
                                        if active { model.player.togglePause() }
                                        else { model.player.playCommentary(entry) }
                                    } label: {
                                        Label(model.text(active && model.player.isPlaying ? .pause : .listenCommentary),
                                              systemImage: active && model.player.isPlaying ? "pause.fill" : "play.fill")
                                            .frame(minHeight: 44)
                                    }
                                    .buttonStyle(.bordered)
                                    Text("\(model.text(.commentaryAudio)) · \(audio.voice) · \(model.text(.aiVoice))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
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
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if model.player.commentary != nil { PlayerBar() }
            }
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

/// Chips that open the commentary: one per note. On a verse row (`all` false) only at the first ayah of a note,
/// so a note shared by several ayahs shows once; in the ayah card (`all` true), every note covering the ayah.
struct StudyChips: View {
    let ayahID: Int
    var all = false
    @Environment(AppModel.self) private var model
    @State private var opened: Int?

    var body: some View {
        if let store = model.store, store.hasStudyQuran, let location = try? store.location(ofAyahID: ayahID) {
            let notes = ((try? store.studyQuranEntries(ayahID: ayahID)) ?? []).filter { all || $0.firstAyah == location.ayah }
            if !notes.isEmpty {
                FlowChips(items: notes) { note in
                    let range = note.firstAyah == note.lastAyah ? "\(note.firstAyah)" : "\(note.firstAyah)–\(note.lastAyah)"
                    Button {
                        opened = store.ayahID(surah: note.surah, ayah: note.firstAyah)
                    } label: {
                        Label("Commentary on \(note.surah):\(range)", systemImage: "text.bubble")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 14)
                            .frame(minHeight: 44)
                            .background(Color(.secondarySystemBackground), in: Capsule())
                            .overlay(Capsule().stroke(Color(.separator), lineWidth: 0.5))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.tint)
                }
                .sheet(item: Binding(get: { opened.map { OpenedAyah(id: $0) } }, set: { opened = $0?.id })) { item in
                    StudyQuranView(ayahID: item.id)
                }
            }
        }
    }

    private struct OpenedAyah: Identifiable { let id: Int }
}

/// Wraps its items onto new lines.
private struct FlowChips<Item: Identifiable, Content: View>: View {
    let items: [Item]
    @ViewBuilder let content: (Item) -> Content

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { ForEach(items) { content($0) } }
            VStack(alignment: .leading, spacing: 8) { ForEach(items) { content($0) } }
        }
    }
}

/// The row at the top of a surah that opens the introduction.
struct StudyIntroRow: View {
    let surahID: Int
    @State private var showing = false

    var body: some View {
        Button { showing = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "book").foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text("About this surah").font(.subheadline.weight(.semibold))
                    Text("The Study Quran").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.secondary)
            }
            .padding(12)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showing) { StudyQuranView(surahID: surahID) }
    }
}
