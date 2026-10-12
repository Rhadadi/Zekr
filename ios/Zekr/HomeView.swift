import SwiftUI
import ZekrKit

struct HomeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let today = model.today {
                    Button {
                        model.open(surah: today.surah.id, ayah: today.ayahNumber)
                    } label: {
                        TodayCard(display: today, language: model.language)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text(model.loadError ?? Str.couldNotLoad.text(language: model.language))
                        .foregroundStyle(.secondary)
                }
                WidgetHelpCard(language: model.language)
            }
            .padding()
        }
        .navigationTitle(Str.appName.text(language: model.language))
    }
}

private struct TodayCard: View {
    let display: AyahDisplay
    let language: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(Str.ayahOfTheDay.text(language: language))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.tint)
            Text(display.arabic)
                .font(.custom("AmiriQuran-Regular", size: 28))
                .lineSpacing(10)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .environment(\.layoutDirection, .rightToLeft)
            if let persian = display.persian, !persian.isEmpty {
                Text(persian)
                    .font(.body)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .environment(\.layoutDirection, .rightToLeft)
            }
            Text(LocalizedText.header(surah: display.surah, ayah: display.ayahNumber, language: language))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct WidgetHelpCard: View {
    let language: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Str.addWidgetTitle.text(language: language)).font(.headline)
            Text(Str.addWidgetSteps.text(language: language)).font(.subheadline)
            Text(Str.widgetNote.text(language: language)).font(.footnote).foregroundStyle(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}
