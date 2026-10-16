import SwiftUI
import ZekrKit

/// A mini player above the tab bar while a recitation is loaded.
struct PlayerBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let player = model.player
        if let cursor = player.cursor, let store = model.store, let location = try? store.location(ofAyahID: cursor.ayahID) {
            VStack(spacing: 0) {
              HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(LocalizedText.header(surah: store.surah(location.surah), ayah: location.ayah, language: model.language))
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(player.failed ? model.text(.audioError) : player.commentary.map { "\(model.text(.commentaryAudio)) · \($0.audio?.voice ?? "")" } ?? model.settings.settings.reciter.name(language: model.language))
                        .font(.caption)
                        .foregroundStyle(player.failed ? Color.red : Color.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Button { player.previous() } label: { Image(systemName: "backward.fill").frame(minWidth: 44, minHeight: 44) }
                    .accessibilityLabel(model.text(.previousAudio))
                Button { player.togglePause() } label: {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").font(.title2).frame(width: 36)
                }
                .accessibilityLabel(model.text(player.isPlaying ? .pause : .play))
                .frame(minWidth: 44, minHeight: 44)
                Button { player.next() } label: { Image(systemName: "forward.fill").frame(minWidth: 44, minHeight: 44) }
                    .accessibilityLabel(model.text(.nextAudio))
                if player.commentary == nil {
                Button {
                    model.settings.update { $0.toggleTranslationAudio(language: model.language) }
                } label: {
                    Image(systemName: model.settings.settings.audioTranslationID == nil ? "text.bubble" : "text.bubble.fill")
                        .foregroundStyle(model.settings.settings.audioTranslationID == nil ? Color.secondary : Color.accentColor)
                }
                .accessibilityLabel(model.text(.translationAudio))
                .accessibilityAddTraits(model.settings.settings.audioTranslationID == nil ? [] : .isSelected)
                }
                Button { player.stop() } label: { Image(systemName: "xmark").frame(minWidth: 44, minHeight: 44) }
                    .accessibilityLabel(model.text(.stopAudio))
              }
              if player.commentary != nil {
                  HStack(spacing: 8) {
                      Text(time(player.elapsed)).font(.caption.monospacedDigit())
                      Slider(value: Binding(get: { player.elapsed }, set: { player.seekCommentary(to: $0) }), in: 0...max(1, player.duration))
                          .accessibilityLabel(model.text(.playbackPosition))
                          .frame(minHeight: 44)
                      Text(time(player.duration)).font(.caption.monospacedDigit())
                  }
              }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.regularMaterial)
            .environment(\.layoutDirection, .leftToRight)
        }
    }

    private func time(_ seconds: Double) -> String {
        let n = Int(max(0, seconds))
        return String(format: "%d:%02d", n / 60, n % 60)
    }
}

extension View {
    func withPlayerBar() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) { PlayerBar() }
    }
}
