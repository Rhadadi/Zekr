import SwiftUI
import WidgetKit

struct AyahWidget: Widget {
    let kind = "AyahWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: ConfigurationIntent.self, provider: Provider()) { entry in
            AyahWidgetView(entry: entry)
        }
        .configurationDisplayName("Ayah")
        .description("A new ayah every hour or every day, in Arabic with a translation.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .systemSmall, .systemMedium])
    }
}

@main
struct ZekrWidgetBundle: WidgetBundle {
    var body: some Widget {
        AyahWidget()
    }
}
