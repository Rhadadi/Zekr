import SwiftUI
import UIKit
import ZekrKit

/// The mushaf as one scrolling text, page after page. Tap an ayah for its translation (in a box at the side,
/// or a card over the page, as chosen in Settings); tap the page for reading options. While reciting, the
/// ayah being recited is highlighted and its page kept on screen. Same behaviour as the web page view.
struct MushafReaderView: View {
    @Environment(AppModel.self) private var model
    private let startPage: Int
    /// The page at the top of the screen.
    @State private var visiblePage: Int?
    /// The ayah being shown. While shown during a recitation, it follows the ayah being recited.
    @State private var selectedID: Int?
    @State private var panel: Panel?
    /// Where the ayah was tapped, for the card over the page.
    @State private var tapPoint: CGPoint?
    /// A tap in the lower half of the screen would put the bottom box over the ayah, so the box goes to the top.
    @State private var boxAtTop = false
    @State private var jumping = false
    @State private var jumpText = ""

    enum Panel {
        case ayah
        case options
    }

    init(page: Int, focus: Int?) {
        startPage = min(max(page, 1), MushafPage.count)
        _visiblePage = State(initialValue: startPage)
        _selectedID = State(initialValue: focus)
        _panel = State(initialValue: focus == nil ? nil : .ayah)
    }

    private var currentPage: Int { visiblePage ?? startPage }

    /// One highlight at a time: the ayah being shown, otherwise the one being recited.
    private var highlighted: Int? { panel == .ayah ? selectedID : model.player.playingAyahID }

    var body: some View {
        GeometryReader { geo in
            // The text keeps the full width; the translation is a card under the tapped ayah
            // (there is no side box on the phone), and reading options are a card near the top.
            let bottomMode = model.settings.settings.pageBox == .bottom
            pages
                .environment(\.layoutDirection, .leftToRight)
                // the translation in a box at the bottom (the default); the text scrolls clear of it
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if (panel == .ayah && bottomMode && !boxAtTop), let selectedID {
                        card { AyahBox(ayahID: selectedID, onClose: close) }.padding(.bottom, 8)
                    } else if panel == .options {
                        card { optionsBox }.padding(.bottom, 8)
                    }
                }
                .overlay(alignment: .top) {
                    if panel == .ayah, let selectedID {
                        if !bottomMode {
                            card { AyahBox(ayahID: selectedID, onClose: close) }
                                .offset(y: cardOffset(geo))
                        } else if boxAtTop {
                            card { AyahBox(ayahID: selectedID, onClose: close) }
                                .offset(y: 8)
                        }
                    }
                }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { header }
            ToolbarItem(placement: .topBarLeading) { MainMenu() }
        }
        .alert(model.text(.goToPage), isPresented: $jumping) {
            TextField("1–604", text: $jumpText).keyboardType(.numberPad)
            Button(model.text(.goTo)) {
                if let n = Int(jumpText.trimmingCharacters(in: .whitespaces)), (1...MushafPage.count).contains(n) {
                    withAnimation { visiblePage = n }
                }
            }
            Button(model.text(.cancel), role: .cancel) {}
        }
        .onChange(of: visiblePage) { _, page in
            if let page { model.saveLastRead(page: try? model.store?.page(page)) }
        }
        // While reciting: a shown ayah moves on with the recitation, and (unless turned off in Settings) the
        // page of the ayah being recited is brought on screen, even after scrolling elsewhere.
        .onChange(of: model.player.playingAyahID) { _, new in
            guard let new else { return }
            if panel == .ayah { selectedID = new }
            guard model.settings.settings.followRecitation, let page = try? model.store?.pageNumber(ofAyahID: new),
                  !isOnScreen(page) else { return }
            withAnimation { visiblePage = page }
        }
    }

    /// The pages, in one scroll view. Each page is laid out when it comes near the screen.
    private var pages: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(1...MushafPage.count, id: \.self) { n in
                        MushafPageView(
                            number: n,
                            highlighted: highlighted,
                            onAyah: { id, point in
                                selectedID = id
                                tapPoint = point
                                boxAtTop = point.y > UIScreen.main.bounds.height * 0.5
                                panel = .ayah
                            },
                            onPage: { panel = panel == nil ? .options : nil }
                        )
                        .id(n)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollPosition(id: $visiblePage, anchor: .top)
            .onAppear { proxy.scrollTo(startPage, anchor: .top) }
        }
    }

    private var optionsBox: some View {
        PageOptionsBox(page: currentPage) {
            panel = nil
            if let first = try? model.store?.page(currentPage).ayahIDs.lowerBound { model.player.play(from: first) }
        } onVerseView: {
            panel = nil
            model.switchReadMode(to: .verse, at: (try? model.store?.page(currentPage).ayahIDs.lowerBound) ?? 1)
        } onClose: { panel = nil }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .frame(maxWidth: 460, maxHeight: 340)
            .padding(12)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            .shadow(radius: 8)
            .padding(.horizontal, 12)
    }

    /// The card goes under the tapped line, or above it near the bottom of the screen.
    private func cardOffset(_ geo: GeometryProxy) -> CGFloat {
        let frame = geo.frame(in: .global)
        let y = (tapPoint?.y ?? frame.midY) - frame.minY
        return y + 340 < frame.height ? y + 24 : max(0, y - 360)
    }

    private func close() {
        panel = nil
    }

    private func isOnScreen(_ page: Int) -> Bool { page == currentPage }

    private var header: some View {
        let page = try? model.store?.page(currentPage)
        return Button {
            jumpText = ""
            jumping = true
        } label: {
            VStack(spacing: 0) {
                Text("سورة \(model.store?.surah(page?.surah ?? 1).nameArabic ?? "")")
                    .font(.quran(model.settings.settings.quranFont, size: 17))
                    .lineLimit(1)
                Text("\(LocalizedText.pageTitle(currentPage, language: model.language)) · \(LocalizedText.juzTitle(page?.juz ?? 1, language: model.language))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(LocalizedText.pageTitle(currentPage, language: model.language)), \(model.text(.goToPage))")
    }
}

/// One page: banners, basmala and the ayahs as one justified paragraph per surah, then the page number.
private struct MushafPageView: View {
    let number: Int
    let highlighted: Int?
    let onAyah: (Int, CGPoint) -> Void
    let onPage: () -> Void
    @Environment(AppModel.self) private var model

    var body: some View {
        let settings = model.settings.settings
        let size = (settings.arabicSize * 0.85).rounded()
        VStack(spacing: 14) {
            if let page = try? model.store?.page(number, script: settings.script) {
                ForEach(Array(page.blocks.enumerated()), id: \.offset) { _, block in
                    switch block {
                    case let .banner(surah):
                        SurahBanner(name: model.store?.surah(surah).nameArabic ?? "", font: settings.quranFont)
                            .padding(.top, 8)
                            .contentShape(Rectangle())
                            .onTapGesture(perform: onPage)
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
            }
            HStack {
                VStack { Divider() }
                Text(LocalizedText.digits(String(number), language: model.language))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                VStack { Divider() }
            }
            .padding(.vertical, 10)
            .accessibilityHidden(true)
        }
        .padding(.horizontal, 10)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

/// The ayahs of one surah on a page, as a justified right-to-left paragraph. A plain (non-selectable) text view,
/// so a tap or a long press goes to Zekr (the ayah's panel, or the reading options) instead of iOS menus.
private struct MushafTextView: UIViewRepresentable {
    let ayahs: [MushafPage.Ayah]
    let font: QuranFont
    let size: Double
    let highlighted: Int?
    /// The ayah, and where it was tapped (in screen coordinates).
    let onAyah: (Int, CGPoint) -> Void
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
        // room for the glyphs that overhang the edge of a justified line (the last word was cut off)
        view.textContainer.lineFragmentPadding = 6
        view.clipsToBounds = false
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
                parent.onAyah(id, gesture.location(in: nil))
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

/// An ayah's translations and actions, compact enough for the side box or the card over the page.
private struct AyahBox: View {
    let ayahID: Int
    let onClose: () -> Void
    @Environment(AppModel.self) private var model
    @State private var showingTafsir = false

    var body: some View {
        let settings = model.settings.settings
        let store = model.store
        let location = try? store?.location(ofAyahID: ayahID)
        let available = (try? store?.translations()) ?? []
        let translations = settings.translations.compactMap { id -> (info: TranslationInfo, text: String)? in
            guard let info = available.first(where: { $0.id == id }), let text = try? store?.translation(ayahID: ayahID, translationID: id) else { return nil }
            return (info, text)
        }
        let playing = model.player.playingAyahID == ayahID && model.player.isPlaying
        let saved = model.bookmarks.contains(ayahID)
        VStack(alignment: .leading, spacing: 8) {
            if let store, let location {
                Text(LocalizedText.header(surah: store.surah(location.surah), ayah: location.ayah, language: model.language))
                    .font(.subheadline.weight(.semibold))
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 34), spacing: 2)], alignment: .leading, spacing: 2) {
                Button { model.player.toggle(ayahID: ayahID) } label: { icon(playing ? "pause.fill" : "play.fill") }
                    .accessibilityLabel(playing ? model.text(.pause) : model.text(.play))
                Button { model.bookmarks.toggle(ayahID) } label: { icon(saved ? "bookmark.fill" : "bookmark") }
                    .accessibilityLabel(saved ? model.text(.removeBookmark) : model.text(.bookmark))
                ShareLink(item: shareText(translations)) { icon("square.and.arrow.up") }
                    .accessibilityLabel(model.text(.share))
                Button { UIPasteboard.general.string = shareText(translations) } label: { icon("doc.on.doc") }
                    .accessibilityLabel(model.text(.copy))
                if model.tafsir != nil {
                    Button { showingTafsir = true } label: { icon("text.book.closed") }
                        .accessibilityLabel("\(model.text(.tafsir)): \(model.text(.almizan))")
                }
                Button { model.switchReadMode(to: .verse, at: ayahID) } label: { icon("list.bullet") }
                    .accessibilityLabel(model.text(.viewVerseFull))
                Button(action: onClose) { icon("xmark") }
                    .accessibilityLabel(model.text(.close))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    StudyChips(ayahID: ayahID, all: true)
                    ForEach(translations, id: \.info.id) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            if translations.count > 1 {
                                Text(item.info.name).font(.caption).foregroundStyle(.secondary)
                            }
                            Text(item.text.isEmpty ? model.text(.mergedTranslation) : item.text)
                                .font(.system(size: settings.translationSize - 1))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .environment(\.layoutDirection, item.info.isRightToLeft ? .rightToLeft : .leftToRight)
                        }
                    }
                }
            }
        }
        .environment(\.layoutDirection, model.language == "fa" ? .rightToLeft : .leftToRight)
        .sheet(isPresented: $showingTafsir) {
            TafsirView(ayahID: ayahID).environment(model)
        }
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name).frame(width: 34, height: 34)
    }

    private func shareText(_ translations: [(info: TranslationInfo, text: String)]) -> String {
        guard let store = model.store, let location = try? store.location(ofAyahID: ayahID) else { return "" }
        var parts = [(try? store.arabic(ayahID: ayahID, script: model.settings.settings.script)) ?? ""]
        parts += translations.map { $0.text.isEmpty ? model.text(.mergedTranslation) : $0.text }
        parts.append("— " + LocalizedText.header(surah: store.surah(location.surah), ayah: location.ayah, language: model.language))
        return parts.joined(separator: "\n\n")
    }
}

/// What tapping the page shows in the side box: play from here, where translations show, following the
/// recitation, the Quran font and size, and verse view.
private struct PageOptionsBox: View {
    let page: Int
    let onPlay: () -> Void
    let onVerseView: () -> Void
    let onClose: () -> Void
    @Environment(AppModel.self) private var model

    var body: some View {
        let settings = model.settings
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(LocalizedText.pageTitle(page, language: model.language)).font(.subheadline.weight(.semibold))
                    Spacer()
                    Button(action: onClose) { Image(systemName: "xmark") }
                        .accessibilityLabel(model.text(.close))
                }
                Button(action: onPlay) { Label(model.text(.playFromPage), systemImage: "play.fill") }
                    .buttonStyle(.borderedProminent)
                Button(action: onVerseView) { Label(model.text(.viewVerseFull), systemImage: "list.bullet") }
                    .buttonStyle(.bordered)
                Toggle(model.text(.followRecitation), isOn: settings.binding(\.followRecitation))
                    .font(.subheadline)
                Text(model.text(.quranFont)).font(.caption).foregroundStyle(.secondary)
                Picker(model.text(.quranFont), selection: settings.binding(\.quranFontID)) {
                    ForEach(QuranFont.all) { Text($0.name).tag($0.id) }
                }
                .pickerStyle(.menu)
                Text(model.text(.arabicSize)).font(.caption).foregroundStyle(.secondary)
                Slider(value: settings.binding(\.arabicSize), in: 22...48, step: 1)
            }
        }
        .environment(\.layoutDirection, model.language == "fa" ? .rightToLeft : .leftToRight)
    }
}
