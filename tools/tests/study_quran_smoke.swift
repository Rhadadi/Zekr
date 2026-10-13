import Foundation
import ZekrKit

let store = try QuranStore(databaseURL: URL(fileURLWithPath: CommandLine.arguments[1]))
precondition(store.hasStudyQuran)
let id = store.ayahID(surah: 2, ayah: 255)
let translated = try store.translation(ayahID: id, translationID: "en.study_quran")
precondition(translated.hasPrefix("God, there is no god but He"))
let sharedA = try store.studyQuranEntries(ayahID: store.ayahID(surah: 2, ayah: 11))
let sharedB = try store.studyQuranEntries(ayahID: store.ayahID(surah: 2, ayah: 12))
precondition(sharedA.first?.id == sharedB.first?.id && !sharedA.isEmpty)
let intro = try store.studyQuranIntroduction(surahID: 114)
let found = try store.searchStudyQuran("usury")
precondition(intro != nil)
precondition(!found.isEmpty)
print("Swift SQLite reader: translation, shared tafsir, introduction, and search passed")
