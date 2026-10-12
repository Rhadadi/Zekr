import SwiftUI
import WidgetKit

/// Text laid out in its own direction (Arabic and Persian right to left), whatever the device's layout direction is.
private struct DirectionalText: View {
    let text: String
    let rightToLeft: Bool

    var body: some View {
        Text(text)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .environment(\.layoutDirection, rightToLeft ? .rightToLeft : .leftToRight)
    }
}

struct AyahWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AyahEntry

    private var isAccessory: Bool {
        family == .accessoryRectangular || family == .accessoryInline || family == .accessoryCircular
    }

    var body: some View {
        content
            .widgetURL(entry.link)
            .containerBackground(for: .widget) {
                if isAccessory { Color.clear } else { Color(uiColor: .secondarySystemBackground) }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryInline:
            Text("\(entry.shortHeader) · \(entry.arabic ?? entry.translation ?? "")")
        case .systemSmall:
            home(arabicSize: 18, arabicLines: 4, translationSize: 11, translationLines: 3)
        case .systemMedium, .systemLarge, .systemExtraLarge:
            home(arabicSize: 22, arabicLines: 3, translationSize: 13, translationLines: 4)
        default:
            rectangular
        }
    }

    /// The Lock Screen shape: a header, one line of Arabic and two lines of translation.
    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            DirectionalText(text: entry.header, rightToLeft: entry.headerIsPersian)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
            if let arabic = entry.arabic {
                DirectionalText(text: arabic, rightToLeft: true)
                    .font(.system(size: 14))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            if let translation = entry.translation {
                DirectionalText(text: translation, rightToLeft: entry.translationIsPersian)
                    .font(.system(size: 10.5))
                    .lineLimit(entry.arabic == nil ? 3 : 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func home(arabicSize: CGFloat, arabicLines: Int, translationSize: CGFloat, translationLines: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            DirectionalText(text: entry.header, rightToLeft: entry.headerIsPersian)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            if let arabic = entry.arabic {
                DirectionalText(text: arabic, rightToLeft: true)
                    .font(.system(size: arabicSize))
                    .lineLimit(arabicLines)
                    .minimumScaleFactor(0.8)
            }
            if let translation = entry.translation {
                DirectionalText(text: translation, rightToLeft: entry.translationIsPersian)
                    .font(.system(size: translationSize))
                    .foregroundStyle(.secondary)
                    .lineLimit(entry.arabic == nil ? translationLines + 3 : translationLines)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
