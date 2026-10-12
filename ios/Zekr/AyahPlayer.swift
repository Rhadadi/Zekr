import AVFoundation
import MediaPlayer
import Observation
import ZekrKit

/// Plays recitations ayah by ayah, following the rules in `ZekrKit.Playback` (basmala, repeat, translation audio),
/// with Lock Screen and Control Center controls.
@Observable
final class AyahPlayer {
    private(set) var cursor: PlaybackCursor?
    private(set) var isPlaying = false
    private(set) var failed = false

    var playingAyahID: Int? { cursor?.ayahID }

    private let player = AVPlayer()
    @ObservationIgnored private var plan = PlaybackPlan(end: 0)
    @ObservationIgnored private var store: QuranStore?
    @ObservationIgnored private var settings: SettingsStore?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var failObserver: NSObjectProtocol?
    @ObservationIgnored private var statusObserver: NSKeyValueObservation?
    @ObservationIgnored private var remoteCommandsReady = false

    func configure(store: QuranStore, settings: SettingsStore) {
        self.store = store
        self.settings = settings
        settings.onChange = { [weak self] in self?.settingsChanged() }
        setUpRemoteCommands()
    }

    // MARK: Controls

    /// Start at `ayahID` and keep going until the end of `scope` (the setting, unless given).
    func play(from ayahID: Int, scope: PlayTo? = nil, withBasmala: Bool = false) {
        guard let store, let settings, let location = try? store.location(ofAyahID: ayahID) else { return }
        let s = settings.settings
        let end = (try? store.endOfPlayback(from: ayahID, to: scope ?? s.playTo)) ?? ayahID
        plan = PlaybackPlan(end: end, repeatCount: s.repeatCount, translation: s.audioTranslation != nil)
        load(Playback.start(location: location, ayahID: ayahID, plan: plan, withBasmala: withBasmala))
    }

    func playSurah(_ surahID: Int) {
        guard let store else { return }
        play(from: store.surah(surahID).firstAyahID, scope: .surah, withBasmala: true)
    }

    /// The play button of an ayah: pause or resume if it is the current ayah, otherwise start there.
    func toggle(ayahID: Int) {
        if cursor?.ayahID == ayahID {
            togglePause()
        } else {
            play(from: ayahID)
        }
    }

    func togglePause() {
        guard let cursor else { return }
        if failed || player.currentItem == nil {
            load(PlaybackCursor(ayahID: cursor.ayahID, phase: .ayah, repeatLeft: plan.repeatCount))
        } else if isPlaying {
            pause()
        } else {
            resume()
        }
    }

    func next() {
        guard let cursor, let c = Playback.skipNext(cursor, plan: plan) else { return }
        load(c)
    }

    func previous() {
        guard let cursor, let c = Playback.skipPrevious(cursor, plan: plan) else { return }
        load(c)
    }

    func stop() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        removeObservers()
        cursor = nil
        isPlaying = false
        failed = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    // MARK: Playing

    private func pause() {
        player.pause()
        isPlaying = false
    }

    private func resume() {
        player.play()
        isPlaying = true
    }

    private func load(_ c: PlaybackCursor) {
        guard let store, let settings, let location = try? store.location(ofAyahID: c.ayahID) else { return }
        let s = settings.settings
        cursor = c
        failed = false
        let url = Playback.url(for: c, location: location, reciter: s.reciter, translation: s.audioTranslation)
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback)
        try? session.setActive(true)

        let item = AVPlayerItem(url: url)
        removeObservers()
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.ended()
        }
        failObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.fail()
        }
        statusObserver = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
            if observed.status == .failed { DispatchQueue.main.async { self?.fail() } }
        }
        player.replaceCurrentItem(with: item)
        player.defaultRate = Float(s.speed)
        player.play()
        isPlaying = true
        updateNowPlaying(for: c, location: location)
    }

    private func ended() {
        guard let cursor else { return }
        if let next = Playback.afterEnded(cursor, plan: plan) {
            load(next)
        } else {
            isPlaying = false
        }
    }

    private func fail() {
        failed = true
        isPlaying = false
    }

    private func removeObservers() {
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        if let failObserver { NotificationCenter.default.removeObserver(failObserver) }
        endObserver = nil
        failObserver = nil
        statusObserver = nil
    }

    private func settingsChanged() {
        guard let settings else { return }
        let s = settings.settings
        player.defaultRate = Float(s.speed)
        if isPlaying { player.rate = Float(s.speed) }
        if let cursor, let store {
            let end = (try? store.endOfPlayback(from: cursor.ayahID, to: s.playTo)) ?? cursor.ayahID
            plan = PlaybackPlan(end: end, repeatCount: s.repeatCount, translation: s.audioTranslation != nil)
        }
    }

    // MARK: Lock Screen

    private func updateNowPlaying(for c: PlaybackCursor, location: AyahLocation) {
        guard let store, let settings else { return }
        let language = LocalizedText.deviceLanguage
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: LocalizedText.header(surah: store.surah(location.surah), ayah: location.ayah, language: language),
            MPMediaItemPropertyArtist: settings.settings.reciter.name(language: language),
            MPMediaItemPropertyAlbumTitle: Str.appName.text(language: language),
        ]
    }

    private func setUpRemoteCommands() {
        guard !remoteCommandsReady else { return }
        remoteCommandsReady = true
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            if self?.isPlaying == false { self?.togglePause() }
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            if self?.isPlaying == true { self?.togglePause() }
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            self?.next()
            return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            self?.previous()
            return .success
        }
    }
}
