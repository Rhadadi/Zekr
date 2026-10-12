import AVFoundation
import Observation
import ZekrKit

/// Plays one ayah's recitation (the full player with queues, repeat and background controls comes later).
@Observable
final class AyahPlayer {
    private(set) var playingAyahID: Int?
    private(set) var isPlaying = false
    private var player: AVPlayer?
    private var endObserver: NSObjectProtocol?

    func toggle(ayahID: Int, surah: Int, ayah: Int, reciter: Reciter = .minshawi) {
        if playingAyahID == ayahID, let player {
            if isPlaying {
                player.pause()
            } else {
                player.play()
            }
            isPlaying.toggle()
            return
        }
        stop()
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback)
        try? session.setActive(true)
        let item = AVPlayerItem(url: reciter.url(surah: surah, ayah: ayah))
        let newPlayer = AVPlayer(playerItem: item)
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            self?.isPlaying = false
        }
        player = newPlayer
        playingAyahID = ayahID
        isPlaying = true
        newPlayer.play()
    }

    func stop() {
        player?.pause()
        player = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        playingAyahID = nil
        isPlaying = false
    }

    deinit { stop() }
}
