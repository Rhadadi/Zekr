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
    /// "Repeat this ayah" is on: the ayah being recited plays again and again until it is turned off.
    private(set) var isLooping = false
    private(set) var commentary: QuranStore.StudyEntry?
    private(set) var elapsed: Double = 0
    private(set) var duration: Double = 0
    @ObservationIgnored private var commentaryQueue: [QuranStore.StudyEntry] = []
    @ObservationIgnored private var commentaryIndex = 0
    @ObservationIgnored private var timeObserver: Any?

    var playingAyahID: Int? { cursor?.ayahID }

    private let player = AVPlayer()
    @ObservationIgnored private var plan = PlaybackPlan(end: 0)
    @ObservationIgnored private var store: QuranStore?
    @ObservationIgnored private var settings: SettingsStore?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var failObserver: NSObjectProtocol?
    @ObservationIgnored private var statusObserver: NSKeyValueObservation?
    @ObservationIgnored private var remoteCommandsReady = false

    deinit {
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        if let failObserver { NotificationCenter.default.removeObserver(failObserver) }
    }

    func configure(store: QuranStore, settings: SettingsStore) {
        self.store = store
        self.settings = settings
        settings.onChange = { [weak self] in self?.settingsChanged() }
        setUpRemoteCommands()
        if timeObserver == nil {
            timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] time in
                guard let self, self.commentary != nil else { return }
                self.elapsed = time.seconds.isFinite ? min(self.duration, max(0, time.seconds)) : 0
            }
        }
    }

    // MARK: Controls

    /// Start at `ayahID` and keep going until the end of `scope` (the setting, unless given).
    func play(from ayahID: Int, scope: PlayTo? = nil, withBasmala: Bool = false) {
        guard let store, let settings, let location = try? store.location(ofAyahID: ayahID) else { return }
        isLooping = false
        commentary = nil
        commentaryQueue = []
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
        if commentary == nil && cursor?.ayahID == ayahID {
            togglePause()
        } else {
            play(from: ayahID)
        }
    }

    /// A shared note is queued once, in the book's order, rather than once for every ayah it covers.
    func playCommentary(_ entry: QuranStore.StudyEntry) {
        guard entry.audio != nil, let store else { return }
        let queue = (try? store.narratedStudyQuranEntries(surahID: entry.surah)) ?? []
        commentaryQueue = queue.isEmpty ? [entry] : queue
        isLooping = false
        loadCommentary(commentaryQueue.firstIndex(where: { $0.id == entry.id }) ?? 0)
    }

    func seekCommentary(to seconds: Double) {
        guard commentary != nil, seconds.isFinite else { return }
        let target = max(0, min(duration, seconds))
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600))
        elapsed = target
    }

    /// Turns "repeat this ayah" on or off for `ayahID`. On: plays that ayah (from the start, unless it is the one
    /// playing) with an endless repeat, which the playback rules already honour. Off: the recording finishes, then
    /// playback carries on as planned, so the audio does not restart mid-word.
    func loop(ayahID: Int, on: Bool) {
        guard let settings else { return }
        if !on {
            isLooping = false
            plan = PlaybackPlan(end: plan.end, repeatCount: settings.settings.repeatCount, translation: plan.translation)
            if var c = cursor {
                c.repeatLeft = 1
                cursor = c
            }
            return
        }
        if commentary != nil { play(from: ayahID) }
        if cursor?.ayahID != ayahID || failed { play(from: ayahID) }
        isLooping = true
        plan = PlaybackPlan(end: plan.end, repeatCount: Int.max, translation: plan.translation)
        if var c = cursor {
            c.repeatLeft = Int.max
            cursor = c
        }
    }

    /// Skipping to another ayah ends "repeat this ayah": the new one plays as the settings say.
    private func endLoop() {
        guard isLooping, let settings else { return }
        isLooping = false
        plan = PlaybackPlan(end: plan.end, repeatCount: settings.settings.repeatCount, translation: plan.translation)
    }

    func togglePause() {
        if commentary != nil {
            if failed || player.currentItem == nil || elapsed >= duration - 0.1 { loadCommentary(commentaryIndex) }
            else if isPlaying { pause() }
            else { resume() }
            return
        }
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
        if commentary != nil { loadCommentary(commentaryIndex + 1); return }
        endLoop()
        guard let cursor, let c = Playback.skipNext(cursor, plan: plan) else { return }
        load(c)
    }

    func previous() {
        if commentary != nil { loadCommentary(commentaryIndex - 1); return }
        endLoop()
        guard let cursor, let c = Playback.skipPrevious(cursor, plan: plan) else { return }
        load(c)
    }

    func stop() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        removeObservers()
        cursor = nil
        isPlaying = false
        isLooping = false
        failed = false
        commentary = nil
        commentaryQueue = []
        elapsed = 0
        duration = 0
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
        startItem(url)
        updateNowPlaying(for: c, location: location)
    }

    private func loadCommentary(_ index: Int) {
        guard commentaryQueue.indices.contains(index), let store else { return }
        player.pause()
        removeObservers()
        let entry = commentaryQueue[index]
        commentaryIndex = index
        commentary = entry
        cursor = PlaybackCursor(ayahID: store.ayahID(surah: entry.surah, ayah: entry.firstAyah), phase: .ayah, repeatLeft: 1)
        elapsed = 0
        duration = entry.audio?.duration ?? 0
        failed = false
        guard let audio = entry.audio,
              let url = Bundle.main.url(forResource: (audio.file as NSString).deletingPathExtension, withExtension: "mp3") else {
            player.replaceCurrentItem(with: nil)
            fail()
            return
        }
        startItem(url)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: "The Study Quran · \(entry.surah):\(entry.firstAyah)\(entry.lastAyah == entry.firstAyah ? "" : "–\(entry.lastAyah)")",
            MPMediaItemPropertyArtist: audio.voice,
            MPMediaItemPropertyAlbumTitle: Str.commentaryAudio.text(language: LocalizedText.deviceLanguage),
            MPMediaItemPropertyPlaybackDuration: duration,
        ]
    }

    private func startItem(_ url: URL) {
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
        player.defaultRate = Float(settings?.settings.speed ?? 1)
        player.play()
        isPlaying = true
    }

    private func ended() {
        if commentary != nil {
            if commentaryIndex + 1 < commentaryQueue.count { loadCommentary(commentaryIndex + 1) }
            else { isPlaying = false; elapsed = duration }
            return
        }
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
        if commentary == nil, let cursor, let store {
            let end = (try? store.endOfPlayback(from: cursor.ayahID, to: s.playTo)) ?? cursor.ayahID
            plan = PlaybackPlan(end: end, repeatCount: isLooping ? Int.max : s.repeatCount, translation: s.audioTranslation != nil)
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
