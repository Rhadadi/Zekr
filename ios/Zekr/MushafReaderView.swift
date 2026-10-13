import SwiftUI
import UIKit
import ZekrKit

/// The Quran as mushaf pages: flowing Arabic text, page by page. Tap or press an ayah for its translation
/// and actions; tap the page for reading options; swipe right for the next page (a right-to-left book).
/// Same behaviour as the web page view.
struct MushafReaderView: View {
    @Environment(AppModel.self) private var model
    @State private var page: Int
    /// The ayah in the panel. While the panel is open during a recitation, it follows the ayah being recited.
    @State private var selectedID: Int?
    @State private var panel: Panel?
    @State private var forward = true
    @State private var jumping = false
    @State private var jumpText = ""

    enum Panel: String, Identifiable {
        case ayah
        case options
        var id: String { rawValue }
    }

    init(page: Int, focus: Int?) {
        _page = State(initialValue: min(max(page, 1), MushafPage.count))
        _selectedID = State(initialValue: focus)
        _panel = State(initialValue: focus == nil ? nil : .ayah)
    }

    /// One highlight at a time: the ayah in the open panel, otherwise the one being recited.
    private var highlighted: Int? { panel == .ayah ? selectedID : model.player.playingAyahID }

    var body: some View {
        let settings = model.settings.settings
        let content = try? model.store?.page(page, script: settings.script)
        ZStack {
            if let content {
                MushafPageView(
                    page: content,
                    highlighted: highlighted,
                    onAyah: { id in
                        selectedID = id
                        panel = .ayah
                    },
                    onPage: { panel = panel == nil ? .options : nil },
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
                    model.switchReadMode(to: .verse, at: selectedID ?? content?.ayahIDs.lowerBound ?? 1)
                } label: {
                    Image(systemName: "list.bullet")
                }
                .accessibilityLabel(model.text(.viewVerseFull))
            }
        }
        .sheet(item: $panel) { which in
            Group {
                switch which {
                case .ayah:
                    if let selectedID { AyahSheet(ayahID: selectedID) }
                case .options:
                    PageOptionsSheet(page: page, juz: content?.juz ?? 1) {
                        panel = nil
                        if let first = content?.ayahIDs.lowerBound { model.player.play(from: first) }
                    } onVerseView: {
                        panel = nil
                        model.switchReadMode(to: .verse, at: content?.ayahIDs.lowerBound ?? 1)
                    }
                }
            }
            .environment(model)
            .presentationDetents([.medium, .large])
            .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        }
        .alert(model.text(.goToPage), isPresented: $jumping) {
            TextField("1–604", text: $jumpText).keyboardType(.numberPad)
            Button(model.text(.goTo)) {
                if let n = Int(jumpText.trimmingCharacters(in: .whitespaces)) { turn(to: n) }
            }
            Button(model.text(.cancel), role: .cancel) {}
        }
        .onAppear { model.saveLastRead(page: content) }
        .onChange(of: page) { _, _ in model.saveLastRead(page: try? model.store?.page(page)) }
        // While reciting: an open ayah panel moves on with the recitation, and the page turns when the
        // recitation moves past it (if the reader was on the page being recited).
        .onChange(of: model.player.playingAyahID) { old, new in
            guard let new else { return }
            if panel == .ayah { selectedID = new }
            guard let old, let store = model.store,
                  let oldPage = try? store.pageNumber(ofAyahID: old), let newPage = try? store.pageNumber(ofAyahID: new),
                  oldPage == page, newPage != page else { return }
            turn(to: newPage, keepPanel: true)
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

    private func turn(to n: Int, keepPanel: Bool = false) {
        guard (1...MushafPage.count).contains(n), n != page else { return }
        if !keepPanel { panel = nil }
        forward = n > page
        withAnimation(.easeInOut(duration: 0.25)) { page = n }
    }
}

/// One page: banners, basmala and the ayahs as one flowing, justified paragraph per surah.
private struct MushafPageView: View {
    let page: MushafPage
    let highlighted: Int?
    let onAyah: (Int) -> Void
    let onPage: () -> Void
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
                            .contentShape(Rectangle())
                            .onTapGesture(perform: onPage)
                            .accessibilityAddTraits(.isHeader)
                    case let .basmala(text):
                        Text(text)
                            .font(.quran(settings.quranFont, size: size))
                            .frame(maxWidth: .infinity)
                            .contentShape(Rectangle())
                            .onTapGesture(perform: onPage)
                    case let .ayahs(run):
                        MushafTextView(ayahs: run, font: settings.quranFont, size: size, highlighted: highlighted, onAyah: onAyah, onPage: onPage)
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

/// The ayahs of one surah on a page, as a justified right-to-left paragraph. A plain (non-selectable) text view,
/// so a tap or a long press goes to Zekr (the ayah's panel, or the reading options) instead of iOS menus.
private struct MushafTextView: UIViewRepresentable {
    let ayahs: [MushafPage.Ayah]
    let font: QuranFont
    let size: Double
    let highlighted: Int?
    let onAyah: (Int) -> Void
    let onPage: () -> Void

    static let ayahKey = NSAttributedString.Key("zekr.ayah")

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView(usingTextLayoutManager: false)
        view.isEditable = false
        view.isSelectable = false
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.semanticContentAttribute = .forceRightToLeft
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.addGestureRecognizer(UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:))))
        let press = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:)))
        press.minimumPressDuration = 0.4
        view.addGestureRecognizer(press)
        view.isAccessibilityElement = true
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        view.attributedText = text()
        view.accessibilityLabel = ayahs.map(\.arabic).joined(separator: " ")
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let width = proposal.width ?? uiView.window?.windowScene?.screen.bounds.width ?? 390
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: ceil(fitted.height))
    }

    private func text() -> NSAttributedString {
        let uiFont = UIFont(name: font.postScriptName, size: size * font.scale) ?? .systemFont(ofSize: size)
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .justified
        paragraph.baseWritingDirection = .rightToLeft
        paragraph.lineSpacing = size * 0.55
        let base: [NSAttributedString.Key: Any] = [.font: uiFont, .paragraphStyle: paragraph, .foregroundColor: UIColor.label]
        let accent = UIColor(named: "AccentColor") ?? .systemGreen
        let out = NSMutableAttributedString()
        for ayah in ayahs {
            var words = base
            words[Self.ayahKey] = ayah.id
            if ayah.id == highlighted { words[.backgroundColor] = UIColor.systemYellow.withAlphaComponent(0.3) }
            out.append(NSAttributedString(string: ayah.arabic, attributes: words))
            var mark = base
            mark[Self.ayahKey] = ayah.id
            mark[.foregroundColor] = accent
            out.append(NSAttributedString(string: " " + MushafPage.marker(ayah.number) + " ", attributes: mark))
        }
        return out
    }

    final class Coordinator: NSObject {
        var parent: MushafTextView

        init(_ parent: MushafTextView) { self.parent = parent }

        @objc func tapped(_ gesture: UIGestureRecognizer) {
            guard let view = gesture.view as? UITextView else { return }
            if let press = gesture as? UILongPressGestureRecognizer, press.state != .began { return }
            if let id = ayahID(at: gesture.location(in: view), in: view) {
                parent.onAyah(id)
            } else {
                parent.onPage()
            }
        }

        /// The ayah under a point, or nil for the blank space around the text.
        private func ayahID(at point: CGPoint, in view: UITextView) -> Int? {
            let layout = view.layoutManager
            let container = view.textContainer
            let glyph = layout.glyphIndex(for: point, in: container)
            guard glyph < layout.numberOfGlyphs,
                  layout.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container).insetBy(dx: -6, dy: -6).contains(point)
            else { return nil }
            let index = layout.characterIndexForGlyph(at: glyph)
            return view.textStorage.attribute(MushafTextView.ayahKey, at: index, effectiveRange: nil) as? Int
        }
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

/// What tapping the page shows: play from here, the Quran font and size, and the way to verse by verse.
private struct PageOptionsSheet: View {
    let page: Int
    let juz: Int
    let onPlay: () -> Void
    let onVerseView: () -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let settings = model.settings
        NavigationStack {
            Form {
                Section {
                    Button(action: onPlay) { Label(model.text(.playFromPage), systemImage: "play.fill") }
                    Button(action: onVerseView) { Label(model.text(.viewVerseFull), systemImage: "list.bullet") }
                }
                Section {
                    Picker(model.text(.quranFont), selection: settings.binding(\.quranFontID)) {
                        ForEach(QuranFont.all) { Text($0.name).tag($0.id) }
                    }
                    VStack(alignment: .leading) {
                        Text(model.text(.arabicSize))
                        Slider(value: settings.binding(\.arabicSize), in: 22...48, step: 1)
                    }
                }
            }
            .navigationTitle("\(LocalizedText.pageTitle(page, language: model.language)) · \(LocalizedText.juzTitle(juz, language: model.language))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(model.text(.close)) { dismiss() }
                }
            }
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
