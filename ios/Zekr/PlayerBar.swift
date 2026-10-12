import SwiftUI
import ZekrKit

/// A mini player above the tab bar while a recitation is loaded.
struct PlayerBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let player = model.player
        if let cursor = player.cursor, let store = model.store, let location = try? store.location(ofAyahID: cursor.ayahID) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(LocalizedText.header(surah: store.surah(location.surah), ayah: location.ayah, language: model.language))
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(player.failed ? model.text(.audioError) : model.settings.settings.reciter.name(language: model.language))
                        .font(.caption)
                        .foregroundStyle(player.failed ? Color.red : Color.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Button { player.previous() } label: { Image(systemName: "backward.fill") }
                Button { player.togglePause() } label: {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").font(.title2).frame(width: 36)
                }
                Button { player.next() } label: { Image(systemName: "forward.fill") }
                Button { player.stop() } label: { Image(systemName: "xmark") }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.regularMaterial)
            .environment(\.layoutDirection, .leftToRight)
        }
    }
}

extension View {
    func withPlayerBar() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) { PlayerBar() }
    }
}
