import SwiftUI
import ZekrKit

struct QuranIndexView: View {
    @Environment(AppModel.self) private var model
    @State private var segment = 0
    @State private var filter = ""
    @State private var juzRows: [JuzRow] = []

    struct JuzRow: Identifiable {
        let juz: Int
        let ayahID: Int
        var id: Int { juz }
    }

    private var surahs: [Surah] {
        guard let all = model.store?.surahs else { return [] }
        let q = filter.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { return all }
        return all.filter { s in
            String(s.id) == q
                || s.nameFarsi.localizedStandardContains(q)
                || s.nameTransliteration.localizedStandardContains(q)
                || s.nameEnglish.localizedStandardContains(q)
                || s.nameArabic.localizedStandardContains(q)
        }
    }

    var body: some View {
        List {
            Picker("", selection: $segment) {
                Text(model.text(.surahs)).tag(0)
                Text(model.text(.juz)).tag(1)
            }
            .pickerStyle(.segmented)
            .listRowSeparator(.hidden)

            if segment == 0 {
                ForEach(surahs, id: \.id) { surah in
                    NavigationLink(value: model.route(surah: surah.id, ayah: nil)) {
                        SurahRow(surah: surah, language: model.language)
                    }
                }
            } else {
                ForEach(juzRows) { row in
                    if let store = model.store, let location = try? store.location(ofAyahID: row.ayahID) {
                        NavigationLink(value: model.route(surah: location.surah, ayah: location.ayah, select: false)) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(LocalizedText.juzTitle(row.juz, language: model.language)).font(.headline)
                                Text("\(store.surah(location.surah).name(language: model.language)) \(LocalizedText.digits("\(location.surah):\(location.ayah)", language: model.language))")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .searchable(text: $filter, prompt: model.text(.filterSurahs))
        .navigationTitle(model.text(.tabQuran))
        .task {
            if let starts = try? model.store?.juzStarts() {
                juzRows = starts.map { JuzRow(juz: $0.juz, ayahID: $0.ayahID) }
            }
        }
    }
}

private struct SurahRow: View {
    @Environment(AppModel.self) private var model
    let surah: Surah
    let language: String

    var body: some View {
        HStack(spacing: 12) {
            Text(LocalizedText.digits(String(surah.id), language: language))
                .font(.subheadline.weight(.bold))
                .frame(width: 38, height: 38)
                .background(Color.accentColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(surah.name(language: language)).font(.headline)
                Text("\(language == "fa" ? surah.nameTransliteration : surah.nameEnglish) · \(surah.isMeccan ? Str.meccan.text(language: language) : Str.medinan.text(language: language)) · \(LocalizedText.ayahCount(surah.ayahCount, language: language))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text(surah.nameArabic)
                .font(.quran(model.settings.settings.quranFont, size: 22))
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}
