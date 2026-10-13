import SwiftUI
import ZekrKit

/// One tap to hear a recorded translation after each ayah; shows which one is on.
struct TranslationAudioButton: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let current = model.settings.settings.audioTranslation
        Button {
            model.settings.update { $0.toggleTranslationAudio(language: model.language) }
        } label: {
            Label(
                current.map { "\(model.text(.translationAudio)): \($0.name(language: model.language))" } ?? model.text(.translationAudio),
                systemImage: current == nil ? "text.bubble" : "text.bubble.fill"
            )
            .font(.subheadline)
        }
        .buttonStyle(.bordered)
        .tint(current == nil ? Color.secondary : Color.accentColor)
        .accessibilityAddTraits(current == nil ? [] : .isSelected)
    }
}
