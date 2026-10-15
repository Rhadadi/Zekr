import SwiftUI
import UIKit
import ZekrKit

/// The mushaf as one scrolling run of pages. Tap an ayah for its panel (a sheet on a phone, a column beside the text on
/// an iPad, or a card over the page, as chosen in Settings); tap the page for reading options. While reciting, the ayah
/// being recited is highlighted and its page kept on screen. The same behaviour as the web app.
struct MushafReaderView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var sizeClass
    /// The page at the top of the screen.
    @State private var visiblePage: Int?
    /// The ayah being shown. While shown during a recitation, it follows the ayah being recited.
    @State private var selectedID: Int?
    @State private var panel: Panel?
    /// Where the ayah was tapped, for the card over the page.
    @State private var tapPoint: CGPoint?
    @State private var jumping = false
    @State private var jumpText = ""
    @State private var started = false

    enum Panel {
        case ayah
        case options
    }

    private var currentPage: Int { visiblePage ?? model.mushafTarget.page }

    /// Where translations show. The printed pages are pictures, so there is nothing to put them under.
    private var place: TranslationPlace {
        let chosen = model.settings.settings.translationPlace
        return (chosen == .inline && model.printedPages) ? .panel : chosen
    }

    /// The ayah panel is a card (not a sheet or column) when translations are chosen to show over the page.
    private var panelIsCard: Bool { panel == .ayah && place == .card }

    /// One highlight at a time: the ayah being shown, otherwise the one being recited.
    private var highlighted: Int? { panel == .ayah ? selectedID : model.player.playingAyahID }

    var body: some View {
        GeometryReader { geo in
            pages
                .environment(\.layoutDirection, .leftToRight)
                .overlay(alignment: .top) {
                    if panelIsCard, let selectedID {
                        card { AyahBox(ayahID: selectedID, showTranslations: true, onClose: close) }
                            .offset(y: cardOffset(geo))
                    }
                }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { header }
            ToolbarItem(placement: .topBarLeading) {
                Button { model.drawerOpen = true } label: { Image(systemName: "line.3.horizontal") }
                    .accessibilityLabel(model.text(.menu))
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { panel = panel == .options ? nil : .options } label: { Image(systemName: "slider.horizontal.3") }
                    .accessibilityLabel(model.text(.readingOptions))
                    .accessibilityAddTraits(panel == .options ? .isSelected : [])
            }
        }
        .modifier(PanelPresenter(isPresented: Binding(
            get: { panel != nil && !panelIsCard },
            set: { if !$0 { panel = nil } }
        )) { panelContent })
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
        // a layer opening over the mushaf takes the sheet down first
        .onChange(of: model.layer) { _, layer in
            if layer != nil { panel = nil }
        }
        .onChange(of: panel) { _, _ in model.panelOpen = panel != nil && !panelIsCard }
        // While reciting: a shown ayah moves on with the recitation, and (unless turned off in Settings) the
        // page of the ayah being recited is brought on screen, even after scrolling elsewhere.
        .onChange(of: model.player.playingAyahID) { _, new in
            guard let new else { return }
            if panel == .ayah { selectedID = new }
            guard model.settings.settings.followRecitation, let page = try? model.store?.pageNumber(ofAyahID: new),
                  page != currentPage else { return }
            withAnimation { visiblePage = page }
        }
    }

    /// The pages, in one scroll view. Each page is laid out when it comes near the screen.
    private var pages: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(1...MushafPage.count, id: \.self) { n in
                        pageView(n).id(n)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollPosition(id: $visiblePage, anchor: .top)
            // room to scroll an ayah up above the sheet, without the page being pushed around when it opens
            .contentMargins(.bottom, sheetRoom, for: .scrollContent)
            .onAppear {
                guard !started else { return }
                started = true
                go(to: model.mushafTarget, proxy)
            }
            .onChange(of: model.mushafTarget) { _, target in go(to: target, proxy) }
        }
    }

    private var sheetRoom: CGFloat {
        panel != nil && !panelIsCard && sizeClass != .regular ? UIScreen.main.bounds.height * 0.45 : 0
    }

    /// A link, the index or a search result asks the mushaf to show a page (and, maybe, an ayah's panel).
    private func go(to target: MushafTarget, _ proxy: ScrollViewProxy) {
        visiblePage = target.page
        selectedID = target.focus
        panel = target.focus == nil ? nil : .ayah
        proxy.scrollTo(target.page, anchor: .top)
    }

    @ViewBuilder private func pageView(_ n: Int) -> some View {
        if model.printedPages {
            PrintedPageView(number: n, highlighted: highlighted, onAyah: select, onPage: tapPage)
        } else {
            MushafPageView(number: n, highlighted: highlighted, inline: place == .inline, onAyah: select, onPage: tapPage)
        }
    }

    private func select(_ id: Int, at point: CGPoint) {
        if panel == .ayah, selectedID == id {
            panel = nil
            return
        }
        selectedID = id
        tapPoint = point
        panel = .ayah
    }

    private func tapPage() { panel = panel == nil ? .options : nil }

    @ViewBuilder private var panelContent: some View {
        switch panel {
        case .ayah:
            if let selectedID {
                AyahBox(ayahID: selectedID, showTranslations: place == .panel || place == .card, onClose: close)
            }
        case .options:
            PageOptionsBox(
                page: currentPage,
                onPlay: {
                    panel = nil
                    if let first = try? model.store?.page(currentPage).ayahIDs.lowerBound { model.player.play(from: first) }
                },
                onJump: {
                    // the alert waits for the sheet to finish closing
                    panel = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        jumpText = ""
                        jumping = true
                    }
                },
                onStudy: { model.openStudy(at: (try? model.store?.page(currentPage).ayahIDs.lowerBound) ?? 1) },
                onSettings: { model.layer = .settings },
                onClose: { panel = nil }
            )
        case nil:
            EmptyView()
        }
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

    /// The text pages show the surah and page in the bar; the printed pages show their own.
    @ViewBuilder private var header: some View {
        if model.printedPages {
            EmptyView()
        } else {
            let page = try? model.store?.page(currentPage)
            Button {
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
}

/// Shows the panel as a sheet on a phone (two heights, with the mushaf still usable behind the lower one), or as an
/// inspector column beside the text where there is room (iPad).
private struct PanelPresenter<Panel: View>: ViewModifier {
    @Binding var isPresented: Bool
    @ViewBuilder let panel: () -> Panel
    @Environment(\.horizontalSizeClass) private var sizeClass

    func body(content: Content) -> some View {
        if sizeClass == .regular {
            content.inspector(isPresented: $isPresented) {
                panel().inspectorColumnWidth(min: 300, ideal: 340, max: 400)
            }
        } else {
            content.sheet(isPresented: $isPresented) {
                panel()
                    .padding(.top, 8)
                    .presentationDetents([.fraction(0.45), .large])
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.45)))
            }
        }
    }
}

/// One page: banners, basmala and the ayahs as one justified paragraph per surah, then the page number.
private struct MushafPageView: View {
    let number: Int
    let highlighted: Int?
    /// Translations under every ayah, in the text.
    let inline: Bool
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
                        MushafTextView(ayahs: run, font: settings.quranFont, size: size, highlighted: highlighted,
                                       inline: inline ? inlineTexts(for: run) : [:], inlineSize: (settings.translationSize * 0.9).rounded(),
                                       onAyah: onAyah, onPage: onPage)
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

    /// The chosen translations of each ayah of a run, for the inline placement.
    private func inlineTexts(for run: [MushafPage.Ayah]) -> [Int: [(text: String, rightToLeft: Bool)]] {
        guard let store = model.store else { return [:] }
        let available = (try? store.translations()) ?? []
        let chosen = model.settings.settings.translations.compactMap { id in available.first { $0.id == id } }
        var out: [Int: [(text: String, rightToLeft: Bool)]] = [:]
        for ayah in run {
            out[ayah.id] = chosen.compactMap { info in
                guard let text = try? store.translation(ayahID: ayah.id, translationID: info.id) else { return nil }
                return (text.isEmpty ? model.text(.mergedTranslation) : text, info.isRightToLeft)
            }
        }
        return out
    }
}

/// The ayahs of one surah on a page, as a justified right-to-left paragraph. A plain (non-selectable) text view,
/// so a tap or a long press goes to Zekr (the ayah's panel, or the reading options) instead of iOS menus.
private struct MushafTextView: UIViewRepresentable {
    let ayahs: [MushafPage.Ayah]
    let font: QuranFont
    let size: Double
    let highlighted: Int?
    /// Translations under every ayah ("inline" placement): per ayah id, one text per chosen translation.
    let inline: [Int: [(text: String, rightToLeft: Bool)]]
    let inlineSize: Double
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
            if let translations = inline[ayah.id] {
                // its own paragraphs, not justified, in the reading direction of each translation
                for item in translations {
                    let style = NSMutableParagraphStyle()
                    style.alignment = .natural
                    style.baseWritingDirection = item.rightToLeft ? .rightToLeft : .leftToRight
                    style.paragraphSpacing = size * 0.25
                    var attrs: [NSAttributedString.Key: Any] = [
                        .font: UIFont.systemFont(ofSize: inlineSize), .paragraphStyle: style, .foregroundColor: UIColor.secondaryLabel,
                    ]
                    attrs[Self.ayahKey] = ayah.id
                    out.append(NSAttributedString(string: "\n" + item.text + "\n", attributes: attrs))
                }
            }
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

/// An ayah's actions and translations: Play from here and Repeat this ayah as labelled buttons, then an icon row.
private struct AyahBox: View {
    let ayahID: Int
    /// False when translations show inline in the text, or not at all: the panel is then only the actions.
    let showTranslations: Bool
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
        let repeating = model.player.isLooping && model.player.playingAyahID == ayahID
        let saved = model.bookmarks.contains(ayahID)
        VStack(alignment: .leading, spacing: 10) {
            if let store, let location {
                Text(LocalizedText.header(surah: store.surah(location.surah), ayah: location.ayah, language: model.language))
                    .font(.subheadline.weight(.semibold))
            }
            HStack(spacing: 8) {
                Button { model.player.toggle(ayahID: ayahID) } label: {
                    Label(playing ? model.text(.pause) : model.text(.playFromHere), systemImage: playing ? "pause.fill" : "play.fill")
                        .frame(minHeight: 32)
                }
                .buttonStyle(.borderedProminent)
                Button { model.player.loop(ayahID: ayahID, on: !repeating) } label: {
                    Label(model.text(.repeatAyah), systemImage: "repeat").frame(minHeight: 32)
                }
                .buttonStyle(.bordered)
                .tint(repeating ? .accentColor : .secondary)
                .accessibilityAddTraits(repeating ? .isSelected : [])
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 44), spacing: 2)], alignment: .leading, spacing: 2) {
                Button { model.bookmarks.toggle(ayahID) } label: { icon(saved ? "bookmark.fill" : "bookmark") }
                    .accessibilityLabel(saved ? model.text(.removeBookmark) : model.text(.bookmark))
                Button { UIPasteboard.general.string = shareText(translations) } label: { icon("doc.on.doc") }
                    .accessibilityLabel(model.text(.copy))
                ShareLink(item: shareText(translations)) { icon("square.and.arrow.up") }
                    .accessibilityLabel(model.text(.share))
                if model.tafsir != nil {
                    Button { showingTafsir = true } label: { icon("text.book.closed") }
                        .accessibilityLabel("\(model.text(.tafsir)): \(model.text(.almizan))")
                }
                Button { model.openStudy(at: ayahID) } label: { icon("list.bullet") }
                    .accessibilityLabel(model.text(.studyView))
                Button(action: onClose) { icon("xmark") }
                    .accessibilityLabel(model.text(.close))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    StudyChips(ayahID: ayahID, all: true)
                    if showTranslations {
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
        }
        .padding(.horizontal, 16)
        .environment(\.layoutDirection, model.language == "fa" ? .rightToLeft : .leftToRight)
        .sheet(isPresented: $showingTafsir) {
            TafsirView(ayahID: ayahID).environment(model)
        }
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name).frame(width: 44, height: 44)
    }

    private func shareText(_ translations: [(info: TranslationInfo, text: String)]) -> String {
        guard let store = model.store, let location = try? store.location(ofAyahID: ayahID) else { return "" }
        var parts = [(try? store.arabic(ayahID: ayahID, script: model.settings.settings.script)) ?? ""]
        parts += translations.map { $0.text.isEmpty ? model.text(.mergedTranslation) : $0.text }
        parts.append("— " + LocalizedText.header(surah: store.surah(location.surah), ayah: location.ayah, language: model.language))
        return parts.joined(separator: "\n\n")
    }
}

/// What the options button shows: play from this page, go to a page, the Study view, and all settings. (The font,
/// size, translation place and following the recitation are in Settings, one tap away.)
private struct PageOptionsBox: View {
    let page: Int
    let onPlay: () -> Void
    let onJump: () -> Void
    let onStudy: () -> Void
    let onSettings: () -> Void
    let onClose: () -> Void
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(LocalizedText.pageTitle(page, language: model.language)).font(.subheadline.weight(.semibold))
                    Spacer()
                    Button(action: onClose) { Image(systemName: "xmark").frame(width: 44, height: 44) }
                        .accessibilityLabel(model.text(.close))
                }
                Button(action: onPlay) { Label(model.text(.playFromPage), systemImage: "play.fill").frame(maxWidth: .infinity, minHeight: 32) }
                    .buttonStyle(.borderedProminent)
                Button(action: onJump) { Label(model.text(.goToPage), systemImage: "number").frame(maxWidth: .infinity, minHeight: 32) }
                    .buttonStyle(.bordered)
                Button(action: onStudy) { Label(model.text(.studyView), systemImage: "list.bullet").frame(maxWidth: .infinity, minHeight: 32) }
                    .buttonStyle(.bordered)
                Button(action: onSettings) { Label(model.text(.allSettings), systemImage: "slider.horizontal.3").frame(maxWidth: .infinity, minHeight: 32) }
                    .buttonStyle(.bordered)
            }
            .padding(.horizontal, 16)
        }
        .environment(\.layoutDirection, model.language == "fa" ? .rightToLeft : .leftToRight)
    }
}
