import SwiftUI
import ZekrKit

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var translations: [TranslationInfo] = []

    private var settings: SettingsStore { model.settings }

    var body: some View {
        let s = settings.settings
        Form {
            Section(model.text(.translations)) {
                ForEach(translations, id: \.id) { info in
                    Toggle(isOn: Binding(
                        get: { settings.settings.translations.contains(info.id) },
                        set: { on in
                            settings.update { value in
                                if on, !value.translations.contains(info.id) { value.translations.append(info.id) }
                                if !on { value.translations.removeAll { $0 == info.id } }
                            }
                        }
                    )) {
                        VStack(alignment: .leading) {
                            Text(info.name)
                            if !info.translator.isEmpty, info.translator != info.name {
                                Text(info.translator).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Text(model.text(.translationsHint)).font(.footnote).foregroundStyle(.secondary)
            }

            Section(model.text(.reading)) {
                Picker(model.text(.readingView), selection: settings.binding(\.readMode)) {
                    Text(model.text(.viewPageFull)).tag(ReadMode.page)
                    Text(model.text(.viewVerseFull)).tag(ReadMode.verse)
                }
                Toggle(model.text(.followRecitation), isOn: settings.binding(\.followRecitation))
                Picker(model.text(.script), selection: settings.binding(\.useUthmaniScript)) {
                    Text(model.text(.scriptUthmani)).tag(true)
                    Text(model.text(.scriptSimple)).tag(false)
                }
                Picker(model.text(.quranFont), selection: settings.binding(\.quranFontID)) {
                    ForEach(QuranFont.all) { font in
                        Text(font.name).tag(font.id)
                    }
                }
                VStack(alignment: .leading) {
                    Text(model.text(.arabicSize))
                    Slider(value: settings.binding(\.arabicSize), in: 22...48, step: 1)
                }
                VStack(alignment: .leading) {
                    Text(model.text(.translationSize))
                    Slider(value: settings.binding(\.translationSize), in: 14...26, step: 1)
                }
                Text("بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ")
                    .font(.quran(s.quranFont, size: s.arabicSize))
                    .frame(maxWidth: .infinity)
            }

            Section(model.text(.recitation)) {
                Picker(model.text(.reciter), selection: settings.binding(\.reciterID)) {
                    ForEach(Reciter.all, id: \.id) { Text($0.name(language: model.language)).tag($0.id) }
                }
                Picker(model.text(.playTo), selection: settings.binding(\.playTo)) {
                    ForEach(PlayTo.allCases, id: \.self) { Text(label($0)).tag($0) }
                }
                Picker(model.text(.speed), selection: settings.binding(\.speed)) {
                    ForEach([0.75, 1.0, 1.25, 1.5, 2.0], id: \.self) { Text("\($0, specifier: "%g")×").tag($0) }
                }
                Picker(model.text(.repeatEach), selection: settings.binding(\.repeatCount)) {
                    ForEach([1, 2, 3, 5, 10], id: \.self) { Text("\($0)×").tag($0) }
                }
                Picker(model.text(.audioTranslation), selection: Binding(
                    get: { settings.settings.audioTranslationID ?? "" },
                    set: { id in settings.update { $0.audioTranslationID = id.isEmpty ? nil : id } }
                )) {
                    Text(model.text(.off)).tag("")
                    ForEach(AudioTranslation.all, id: \.id) { Text($0.name(language: model.language)).tag($0.id) }
                }
            }

            Section(model.text(.about)) {
                Text(model.text(.credits)).font(.footnote)
                Link("tanzil.net", destination: URL(string: "https://tanzil.net")!)
                Link("everyayah.com", destination: URL(string: "https://everyayah.com")!)
            }
        }
        .navigationTitle(model.text(.settingsTitle))
        .task {
            translations = (try? model.store?.translations()) ?? []
        }
    }

    private func label(_ scope: PlayTo) -> String {
        switch scope {
        case .ayah: return model.text(.toAyah)
        case .page: return model.text(.toPage)
        case .surah: return model.text(.toSurah)
        case .juz: return model.text(.toJuz)
        case .rub: return model.text(.toRub)
        case .quran: return model.text(.toQuran)
        }
    }
}
