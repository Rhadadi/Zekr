import Foundation
import XCTest
@testable import ZekrKit

/// The same cases as web/src/playback.test.ts.
final class PlaybackTests: XCTestCase {
    private func run(_ start: PlaybackCursor, _ plan: PlaybackPlan) -> [PlaybackCursor] {
        var seq = [start]
        var next = Playback.afterEnded(start, plan: plan)
        while let c = next {
            seq.append(c)
            XCTAssertLessThan(seq.count, 200, "did not stop")
            if seq.count >= 200 { break }
            next = Playback.afterEnded(c, plan: plan)
        }
        return seq
    }

    func testPlaysAyahsInOrderUpToTheEnd() {
        let seq = run(PlaybackCursor(ayahID: 1, phase: .ayah, repeatLeft: 1), PlaybackPlan(end: 3))
        XCTAssertEqual(seq.map(\.ayahID), [1, 2, 3])
    }

    func testRepeatsEachAyah() {
        let plan = PlaybackPlan(end: 2, repeatCount: 2)
        let seq = run(PlaybackCursor(ayahID: 1, phase: .ayah, repeatLeft: 2), plan)
        XCTAssertEqual(seq.map(\.ayahID), [1, 1, 2, 2])
    }

    func testTranslationRecordingComesAfterEachAyahBeforeRepeating() {
        let plan = PlaybackPlan(end: 6, repeatCount: 2, translation: true)
        let seq = run(PlaybackCursor(ayahID: 5, phase: .ayah, repeatLeft: 2), plan)
        let label = seq.map { "\($0.ayahID)\($0.phase == .ayah ? "a" : "t")" }
        XCTAssertEqual(label, ["5a", "5t", "5a", "5t", "6a", "6t", "6a", "6t"])
    }

    func testBasmalaFirstAndOnce() {
        let plan = PlaybackPlan(end: 9, repeatCount: 2)
        let start = Playback.start(location: AyahLocation(surah: 2, ayah: 1), ayahID: 8, plan: plan, withBasmala: true)
        XCTAssertEqual(start.phase, .basmala)
        XCTAssertEqual(run(start, plan).map(\.phase), [.basmala, .ayah, .ayah, .ayah, .ayah])
    }

    func testBasmalaRule() {
        XCTAssertFalse(Playback.hasBasmalaBefore(surah: 1, ayah: 1))
        XCTAssertFalse(Playback.hasBasmalaBefore(surah: 9, ayah: 1))
        XCTAssertTrue(Playback.hasBasmalaBefore(surah: 2, ayah: 1))
        XCTAssertFalse(Playback.hasBasmalaBefore(surah: 2, ayah: 2))
        let plan = PlaybackPlan(end: 9)
        XCTAssertEqual(Playback.start(location: AyahLocation(surah: 2, ayah: 1), ayahID: 8, plan: plan, withBasmala: false).phase, .ayah)
    }

    func testSingleAyahStops() {
        XCTAssertEqual(run(PlaybackCursor(ayahID: 7, phase: .ayah, repeatLeft: 1), PlaybackPlan(end: 7)).count, 1)
    }

    func testSkipping() {
        let plan = PlaybackPlan(end: 20)
        let c = PlaybackCursor(ayahID: 10, phase: .translation, repeatLeft: 1)
        XCTAssertEqual(Playback.skipNext(c, plan: plan)?.ayahID, 11)
        XCTAssertEqual(Playback.skipPrevious(c, plan: plan)?.phase, .ayah)
        XCTAssertNil(Playback.skipNext(PlaybackCursor(ayahID: totalAyahs, phase: .ayah, repeatLeft: 1), plan: plan))
        XCTAssertNil(Playback.skipPrevious(PlaybackCursor(ayahID: 1, phase: .ayah, repeatLeft: 1), plan: plan))
    }

    func testRecordingURLs() {
        let reciter = Reciter.minshawi
        let loc = AyahLocation(surah: 17, ayah: 24)
        let tr = AudioTranslation.all[0]
        func url(_ phase: PlaybackPhase, _ t: AudioTranslation?) -> String {
            Playback.url(for: PlaybackCursor(ayahID: 2024, phase: phase, repeatLeft: 1), location: loc, reciter: reciter, translation: t).absoluteString
        }
        XCTAssertEqual(url(.ayah, nil), "https://everyayah.com/data/Minshawy_Murattal_128kbps/017024.mp3")
        XCTAssertEqual(url(.basmala, nil), "https://everyayah.com/data/Minshawy_Murattal_128kbps/001001.mp3")
        XCTAssertEqual(url(.translation, tr), "https://everyayah.com/data/translations/Fooladvand_Hedayatfar_40Kbps/017024.mp3")
    }
}

final class ReaderSettingsTests: XCTestCase {
    func testDefaultsMatchTheWebApp() {
        let s = ReaderSettings()
        XCTAssertEqual(s.translations, ["fa.safavi"])
        XCTAssertEqual(s.reciter, .minshawi)
        XCTAssertEqual(s.playTo, .surah)
        XCTAssertNil(s.audioTranslation)
        XCTAssertEqual(s.script, .uthmani)
    }

    func testSavesAndLoads() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "zekr.tests.\(UUID().uuidString)"))
        var s = ReaderSettings()
        s.translations = ["fa.fooladvand", "en.sahih"]
        s.repeatCount = 3
        s.playTo = .juz
        s.audioTranslationID = "en.sahih"
        s.save(to: defaults)
        XCTAssertEqual(ReaderSettings.load(from: defaults), s)
        XCTAssertEqual(ReaderSettings.load(from: defaults).audioTranslation?.id, "en.sahih")
    }

    func testMissingKeysFallBackToDefaults() throws {
        let json = #"{"arabicSize": 40, "futureSetting": true}"#.data(using: .utf8)!
        let s = try JSONDecoder().decode(ReaderSettings.self, from: json)
        XCTAssertEqual(s.arabicSize, 40)
        XCTAssertEqual(s.translations, ["fa.safavi"])
    }

    func testUnknownReciterFallsBackToMinshawi() throws {
        var s = ReaderSettings()
        s.reciterID = "nobody"
        XCTAssertEqual(s.reciter, .minshawi)
    }

    func testBrokenSavedDataFallsBackToDefaults() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "zekr.tests.\(UUID().uuidString)"))
        defaults.set(Data("not json".utf8), forKey: ReaderSettings.defaultsKey)
        XCTAssertEqual(ReaderSettings.load(from: defaults), ReaderSettings())
    }
}

final class TranslationAudioToggleTests: XCTestCase {
    func testFirstTimePicksByLanguage() {
        var fa = ReaderSettings()
        fa.toggleTranslationAudio(language: "fa")
        XCTAssertEqual(fa.audioTranslationID, "fa.fooladvand")
        var en = ReaderSettings()
        en.toggleTranslationAudio(language: "en")
        XCTAssertEqual(en.audioTranslationID, "en.sahih")
    }

    func testOffAndBackOnRemembersTheChoice() {
        var s = ReaderSettings()
        s.audioTranslationID = "fa.makarem"
        s.toggleTranslationAudio(language: "en")
        XCTAssertNil(s.audioTranslationID)
        XCTAssertEqual(s.lastAudioTranslationID, "fa.makarem")
        s.toggleTranslationAudio(language: "en")
        XCTAssertEqual(s.audioTranslationID, "fa.makarem")
    }

    func testUnknownRememberedChoiceFallsBack() {
        var s = ReaderSettings()
        s.lastAudioTranslationID = "gone"
        s.toggleTranslationAudio(language: "fa")
        XCTAssertEqual(s.audioTranslationID, "fa.fooladvand")
    }
}
