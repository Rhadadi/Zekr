import SwiftUI
import ZekrKit

/// The Quran as mushaf pages: flowing Arabic text, page by page. Tap an ayah for its translation and actions;
/// swipe right for the next page (a right-to-left book). Same layout as the web page view.
struct MushafReaderView: View {
    @Environment(AppModel.self) private var model
    @State private var page: Int
    @State private var selected: SelectedAyah?
    @State private var forward = true
    @State private var jumping = false
    @State private var jumpText = ""

    struct SelectedAyah: Identifiable {
        let id: Int
    }

    init(page: Int, focus: Int?) {
        _page = State(initialValue: min(max(page, 1), MushafPage.count))
        _selected = State(initialValue: focus.map { SelectedAyah(id: $0) })
    }

    var body: some View {
        let settings = model.settings.settings
        let content = try? model.store?.page(page, script: settings.script)
        ZStack {
            if let content {
                MushafPageView(
                    page: content,
                    highlighted: selected?.id,
                    playing: model.player.playingAyahID,
                    onTap: { selected = SelectedAyah(id: $0) },
                    onNext: { turn(to: page + 1) },
                    onPrevious: { turn(to: page - 1) }
                )
                .id(page)
                .transition(.push(from: forward ? .leading : .trailing))
            } else {
                Text(model.loadError ?? model.text(.couldNotLoad)).foregroundStyle(.secondary)
            }
        }
        // Explicit left-to-right here, so the page slides in from the left for the next page in any app language.
        .environment(\.layoutDirection, .leftToRight)
        .simultaneousGesture(
            DragGesture(minimumDistance: 30).onEnded { drag in
                let dx = drag.translation.width
                guard abs(dx) > 70, abs(drag.translation.height) < 45 else { return }
                turn(to: page + (dx > 0 ? 1 : -1)) // right-to-left book: swipe right = next page
            }
        )
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                if let content { header(content) }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    model.switchReadMode(to: .verse, at: selected?.id ?? content?.ayahIDs.lowerBound ?? 1)
                } label: {
                    Image(systemName: "list.bullet")
                }
                .accessibilityLabel(model.text(.viewVerseFull))
            }
        }
        .sheet(item: $selected) { ayah in
            AyahSheet(ayahID: ayah.id)
                .environment(model)
                .presentationDetents([.medium, .large])
        }
        .alert(model.text(.goToPage), isPresented: $jumping) {
            TextField("1–604", text: $jumpText).keyboardType(.numberPad)
            Button(model.text(.goTo)) {
                if let n = Int(jumpText.trimmingCharacters(in: .whitespaces)) { turn(to: n) }
            }
            Button(model.text(.cancel), role: .cancel) {}
        }
        // While reciting, turn the page when the recitation moves on, if the reader was on the page being recited.
        .onChange(of: model.player.playingAyahID) { old, new in
            guard let old, let new, let store = model.store,
                  let oldPage = try? store.pageNumber(ofAyahID: old), let newPage = try? store.pageNumber(ofAyahID: new),
                  oldPage == page, newPage != page else { return }
            turn(to: newPage)
        }
    }

    private func header(_ content: MushafPage) -> some View {
        Button {
            jumpText = ""
            jumping = true
        } label: {
            VStack(spacing: 0) {
                Text("سورة \(model.store?.surah(content.surah).nameArabic ?? "")")
                    .font(.quran(model.settings.settings.quranFont, size: 17))
                    .lineLimit(1)
                Text("\(LocalizedText.pageTitle(content.number, language: model.language)) · \(LocalizedText.juzTitle(content.juz, language: model.language))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(LocalizedText.pageTitle(content.number, language: model.language)), \(model.text(.goToPage))")
    }

    private func turn(to n: Int) {
        guard (1...MushafPage.count).contains(n), n != page else { return }
        selected = nil
        forward = n > page
        withAnimation(.easeInOut(duration: 0.25)) { page = n }
    }
}

/// One page's text. Each ayah is a link (`zekr-ayah://<id>`) inside one paragraph per surah, so the text flows like a printed page.
private struct MushafPageView: View {
    let page: MushafPage
    let highlighted: Int?
    let playing: Int?
    let onTap: (Int) -> Void
    let onNext: () -> Void
    let onPrevious: () -> Void
    @Environment(AppModel.self) private var model

    var body: some View {
        let settings = model.settings.settings
        let size = (settings.arabicSize * 0.85).rounded()
        ScrollView {
            VStack(spacing: 14) {
                ForEach(Array(page.blocks.enumerated()), id: \.offset) { _, block in
                    switch block {
                    case let .banner(surah):
                        Text("سورة \(model.store?.surah(surah).nameArabic ?? "")")
                            .font(.quran(settings.quranFont, size: 24))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.accentColor, lineWidth: 1.5))
                            .padding(.top, 8)
                            .accessibilityAddTraits(.isHeader)
                    case let .basmala(text):
                        Text(text)
                            .font(.quran(settings.quranFont, size: size))
                            .frame(maxWidth: .infinity)
                    case let .ayahs(run):
                        Text(paragraph(run))
                            .font(.quran(settings.quranFont, size: size))
                            .lineSpacing(size * 0.55)
                            .tint(.primary)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                pager.padding(.top, 12)
                Text(model.text(.tapAyah))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .environment(\.layoutDirection, .rightToLeft)
        }
        .environment(\.openURL, OpenURLAction { url in
            guard url.scheme == "zekr-ayah", let id = Int(url.host() ?? "") else { return .systemAction }
            onTap(id)
            return .handled
        })
    }

    private func paragraph(_ run: [MushafPage.Ayah]) -> AttributedString {
        var text = AttributedString()
        for ayah in run {
            var words = AttributedString(ayah.arabic)
            words.link = URL(string: "zekr-ayah://\(ayah.id)")
            if ayah.id == highlighted {
                words.backgroundColor = Color.yellow.opacity(0.3)
            } else if ayah.id == playing {
                words.backgroundColor = Color.accentColor.opacity(0.18)
            }
            var mark = AttributedString(" " + MushafPage.marker(ayah.number) + " ")
            mark.foregroundColor = Color.accentColor
            text += words
            text += mark
        }
        return text
    }

    /// Next page on the left, as in a right-to-left book.
    private var pager: some View {
        HStack {
            Button(action: onPrevious) {
                Label(model.text(.prevPage), systemImage: "chevron.right")
            }
            .disabled(page.number <= 1)
            Spacer()
            Button(action: onNext) {
                Label(model.text(.nextPage), systemImage: "chevron.left")
                    .labelStyle(TrailingIconLabelStyle())
            }
            .disabled(page.number >= MushafPage.count)
        }
        .buttonStyle(.bordered)
        .font(.subheadline)
    }
}

private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.title
            configuration.icon
        }
    }
}

/// One ayah's translations and actions, over the page.
private struct AyahSheet: View {
    let ayahID: Int
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let settings = model.settings.settings
        NavigationStack {
            ScrollView {
                if let store = model.store, let row = try? store.ayahRow(id: ayahID, script: settings.script) {
                    let available = (try? store.translations()) ?? []
                    let translations = settings.translations.compactMap { id -> (info: TranslationInfo, text: String)? in
                        guard let info = available.first(where: { $0.id == id }),
                              let text = try? store.translation(ayahID: ayahID, translationID: id) else { return nil }
                        return (info, text)
                    }
                    AyahRowView(row: row, translations: translations, focused: false)
                        .padding(.horizontal)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(model.text(.close)) { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        dismiss()
                        model.switchReadMode(to: .verse, at: ayahID)
                    } label: {
                        Image(systemName: "list.bullet")
                    }
                    .accessibilityLabel(model.text(.viewVerseFull))
                }
            }
        }
    }

    private var title: String {
        guard let store = model.store, let location = try? store.location(ofAyahID: ayahID) else { return "" }
        return LocalizedText.header(surah: store.surah(location.surah), ayah: location.ayah, language: model.language)
    }
}
