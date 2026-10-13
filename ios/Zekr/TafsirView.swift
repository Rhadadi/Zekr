import SwiftUI
import ZekrKit

/// Al-Mizan on the group of ayahs an ayah belongs to, with a menu to jump between its parts
/// (Al-Mizan's own translation, the commentary, the hadith discussion ...) and its sources at the end.
struct TafsirView: View {
    let ayahID: Int
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var section: TafsirSection?
    @State private var failed = false

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    if let section {
                        content(section)
                    } else if failed {
                        Text(model.text(.couldNotLoad)).foregroundStyle(.secondary).padding()
                    } else {
                        ProgressView().padding(.top, 40)
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(model.text(.close)) { dismiss() }
                    }
                    if let section {
                        ToolbarItem(placement: .primaryAction) {
                            Menu {
                                ForEach(Array(section.blocks.enumerated()), id: \.offset) { index, block in
                                    if block.kind == .part {
                                        Button(plain(block)) { withAnimation { proxy.scrollTo(index, anchor: .top) } }
                                    }
                                }
                                Button(model.text(.sources)) { withAnimation { proxy.scrollTo("notes", anchor: .top) } }
                            } label: {
                                Image(systemName: "list.bullet.indent")
                            }
                            .accessibilityLabel(model.text(.tafsirParts))
                        }
                    }
                }
            }
            .navigationTitle(model.text(.almizan))
            .navigationBarTitleDisplayMode(.inline)
        }
        .task {
            do {
                section = try model.tafsir?.section(forAyahID: ayahID)
                failed = section == nil
            } catch {
                failed = true
            }
        }
    }

    private func content(_ section: TafsirSection) -> some View {
        let size = model.settings.settings.translationSize
        return LazyVStack(alignment: .leading, spacing: 12) {
            Text(section.title)
                .font(.title3.weight(.bold))
                .frame(maxWidth: .infinity)
            ForEach(Array(section.blocks.enumerated()), id: \.offset) { index, block in
                blockView(block, size: size).id(index)
            }
            if !section.notes.isEmpty {
                Divider().padding(.top, 8)
                Text(model.text(.sources)).font(.headline).id("notes")
                ForEach(Array(section.notes.enumerated()), id: \.offset) { index, note in
                    Text("\(persianDigits(index + 1)). \(note)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            Text(model.text(.almizanCredit))
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 8)
        }
        .padding()
        .environment(\.layoutDirection, .rightToLeft)
    }

    @ViewBuilder
    private func blockView(_ block: TafsirSection.Block, size: Double) -> some View {
        switch block.kind {
        case .surah:
            Text(attributed(block, size: size)).font(.system(size: size + 2, weight: .bold)).frame(maxWidth: .infinity)
        case .part:
            Text(attributed(block, size: size)).font(.system(size: size + 3, weight: .bold)).foregroundStyle(.tint).padding(.top, 10)
        case .topic:
            Text(attributed(block, size: size)).font(.system(size: size, weight: .semibold)).padding(.top, 4)
        case .paragraph:
            Text(attributed(block, size: size)).font(.system(size: size)).lineSpacing(size * 0.45)
        }
    }

    private func attributed(_ block: TafsirSection.Block, size: Double) -> AttributedString {
        var out = AttributedString()
        for run in block.runs {
            switch run {
            case let .text(text, style):
                var piece = AttributedString(text)
                switch style {
                case .plain: break
                case .quran: piece.foregroundColor = Color.accentColor
                case .word: piece.inlinePresentationIntent = .stronglyEmphasized
                case .hadith: piece.foregroundColor = Color.brown
                }
                out += piece
            case let .footnote(n):
                var mark = AttributedString(persianDigits(n))
                mark.font = .system(size: size * 0.65)
                mark.baselineOffset = size * 0.35
                mark.foregroundColor = Color.secondary
                out += mark
            }
        }
        return out
    }

    private func plain(_ block: TafsirSection.Block) -> String {
        block.runs.compactMap { if case let .text(t, _) = $0 { return t } else { return nil } }.joined()
    }

    private func persianDigits(_ n: Int) -> String { LocalizedText.digits(String(n), language: "fa") }
}
