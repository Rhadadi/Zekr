import SwiftUI
import ZekrKit

/// One surah, ayah by ayah, with the translations chosen in Settings.
struct SurahReaderView: View {
    let route: ReaderRoute
    @Environment(AppModel.self) private var model
    @State private var content: SurahContent?
    @State private var focusedID: Int?
    @State private var showingIntroduction = false

    struct SurahContent {
        let rows: [QuranStore.AyahRow]
        let translations: [(info: TranslationInfo, texts: [String])]
        let basmala: String?
    }

    private var surah: Surah? { model.store?.surah(route.surah) }

    var body: some View {
        let settings = model.settings.settings
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if let surah { header(surah) }
                    if let content {
                        if let basmala = content.basmala {
                            Text(basmala)
                                .font(.quran(settings.quranFont, size: settings.arabicSize))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                        }
                        ForEach(content.rows, id: \.id) { row in
                            AyahRowView(
                                row: row,
                                translations: content.translations.map { (info: $0.info, text: $0.texts[row.number - 1]) },
                                focused: focusedID == row.id
                            )
                            .id(row.id)
                        }
                    }
                }
                .padding(.horizontal)
            }
            .task(id: settings.translations.joined(separator: ",") + (settings.useUthmaniScript ? "u" : "s")) {
                load()
                if let ayah = route.ayah, let id = model.store?.ayahID(surah: route.surah, ayah: ayah) {
                    focusedID = id
                    try? await Task.sleep(nanoseconds: 250_000_000)
                    proxy.scrollTo(id, anchor: .top)
                    try? await Task.sleep(nanoseconds: 2_500_000_000)
                    focusedID = nil
                }
            }
            .onAppear { model.saveLastRead(surah: route.surah, ayah: route.ayah ?? 1) }
            .onChange(of: model.player.playingAyahID) { _, newID in
                guard let newID, model.settings.settings.followRecitation, let surah, newID >= surah.firstAyahID, newID < surah.firstAyahID + surah.ayahCount else { return }
                withAnimation { proxy.scrollTo(newID, anchor: .center) }
            }
        }
        .navigationTitle(surah.map { $0.name(language: model.language) } ?? "")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func header(_ surah: Surah) -> some View {
        VStack(spacing: 6) {
            SurahBanner(name: surah.nameArabic, font: model.settings.settings.quranFont)
            Text("\(surah.isMeccan ? model.text(.meccan) : model.text(.medinan)) · \(LocalizedText.ayahCount(surah.ayahCount, language: model.language))")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Button {
                model.player.playSurah(surah.id)
            } label: {
                Label(model.text(.playSurah), systemImage: "play.fill")
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 4)
            TranslationAudioButton()
            if model.store?.hasStudyQuran == true {
                Button("Surah introduction · The Study Quran") { showingIntroduction = true }
                    .font(.footnote)
                    .sheet(isPresented: $showingIntroduction) { StudyQuranView(surahID: surah.id) }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
    }

    private func load() {
        guard let store = model.store else { return }
        let settings = model.settings.settings
        guard let rows = try? store.ayahs(inSurah: route.surah, script: settings.script) else { return }
        let available = (try? store.translations()) ?? []
        let translations = settings.translations.compactMap { id -> (info: TranslationInfo, texts: [String])? in
            guard let info = available.first(where: { $0.id == id }),
                  let texts = try? store.translationTexts(inSurah: route.surah, translationID: id), texts.count == rows.count else { return nil }
            return (info, texts)
        }
        let basmala = (route.surah == 1 || route.surah == 9) ? nil
            : try? store.metaValue(settings.useUthmaniScript ? "basmala_uthmani" : "basmala_simple")
        content = SurahContent(rows: rows, translations: translations, basmala: basmala)
    }
}
