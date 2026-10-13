import SwiftUI
import UIKit
import ZekrKit

/// One ayah: number and actions, Arabic, then each chosen translation.
struct AyahRowView: View {
    let row: QuranStore.AyahRow
    let translations: [(info: TranslationInfo, text: String)]
    let focused: Bool
    @Environment(AppModel.self) private var model
    @State private var showingTafsir = false

    private var playing: Bool { model.player.playingAyahID == row.id }

    private var shareText: String {
        var parts = [row.arabic]
        parts += translations.map { $0.text.isEmpty ? model.text(.mergedTranslation) : $0.text }
        if let store = model.store, let loc = try? store.location(ofAyahID: row.id) {
            parts.append("— " + LocalizedText.header(surah: store.surah(loc.surah), ayah: loc.ayah, language: model.language))
        }
        return parts.joined(separator: "\n\n")
    }

    var body: some View {
        let settings = model.settings.settings
        let saved = model.bookmarks.contains(row.id)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(LocalizedText.digits(String(row.number), language: model.language))
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.tint)
                    .frame(minWidth: 32, minHeight: 32)
                    .overlay(Circle().stroke(Color.accentColor, lineWidth: 1.5))
                Spacer()
                Button { model.player.toggle(ayahID: row.id) } label: {
                    Image(systemName: playing && model.player.isPlaying ? "pause.fill" : "play.fill").frame(width: 36, height: 36)
                }
                .accessibilityLabel(playing && model.player.isPlaying ? model.text(.pause) : model.text(.play))
                Button { model.bookmarks.toggle(row.id) } label: {
                    Image(systemName: saved ? "bookmark.fill" : "bookmark").frame(width: 36, height: 36)
                }
                .accessibilityLabel(saved ? model.text(.removeBookmark) : model.text(.bookmark))
                ShareLink(item: shareText) {
                    Image(systemName: "square.and.arrow.up").frame(width: 36, height: 36)
                }
                .accessibilityLabel(model.text(.share))
                Button { UIPasteboard.general.string = shareText } label: {
                    Image(systemName: "doc.on.doc").frame(width: 36, height: 36)
                }
                .accessibilityLabel(model.text(.copy))
                if model.tafsir != nil {
                    Button { showingTafsir = true } label: {
                        Image(systemName: "text.book.closed").frame(width: 36, height: 36)
                    }
                    .accessibilityLabel("\(model.text(.tafsir)): \(model.text(.almizan))")
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)

            Text(row.arabic)
                .font(.quran(settings.quranFont, size: settings.arabicSize))
                .lineSpacing(settings.arabicSize * 0.5)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .environment(\.layoutDirection, .rightToLeft)

            ForEach(translations, id: \.info.id) { item in
                VStack(alignment: .leading, spacing: 2) {
                    if translations.count > 1 {
                        Text(item.info.name).font(.caption).foregroundStyle(.secondary)
                    }
                    Text(item.text.isEmpty ? model.text(.mergedTranslation) : item.text)
                        .font(.system(size: settings.translationSize))
                        .foregroundStyle(item.text.isEmpty ? Color.secondary : Color.primary)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .environment(\.layoutDirection, item.info.isRightToLeft ? .rightToLeft : .leftToRight)
                }
            }
            if model.store?.hasStudyQuran == true {
                Button("Tafsir · The Study Quran") { showingTafsir = true }
                    .font(.footnote)
                    .sheet(isPresented: $showingTafsir) { StudyQuranView(ayahID: row.id) }
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, (playing || focused) ? 10 : 0)
        .background((playing || focused) ? Color.accentColor.opacity(0.12) : Color.clear, in: RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .top) { Divider() }
        .sheet(isPresented: $showingTafsir) {
            TafsirView(ayahID: row.id).environment(model)
        }
    }
}
