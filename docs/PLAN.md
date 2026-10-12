# Zekr: Plan

Zekr is an iPhone app for reading, listening to and understanding the Quran. It has the Arabic text, Persian and English translations, recitation and tafsir. It also has a Lock Screen widget that shows a new ayah every hour or every day, like the widget in the bottom-left corner of the screenshot.

*Status: proposal for review. Last updated 2026-10-12.*

---

## 1. Features

### Lock Screen widget (the main feature)

- **Layout:** the same as the screenshot. A header with the surah name and ayah number, one line of Arabic, and the translation underneath.
- **Placement:** the bottom of the iOS 26 Lock Screen (where yours is now), under the clock, on the Home Screen, or in StandBy.
- **Settings for each widget** (long-press, then Edit Widget):
  - **Changes:** every hour, every 3 hours, or daily
  - **Shows:** Arabic + English, Arabic + Persian, Arabic only, or translation only
  - **Draws from:** short ayahs that fit in full, Quranic duas, or my favorites
- **Tapping it** opens Zekr on that ayah, with the full text, a play button and the tafsir.

### The app

- **Reader:**
  - Index by Surah, Juz or Hizb, like Quran Hadi's فهرست screen.
  - Verse-by-verse view with the Arabic and up to two translations.
  - Font size, and light, sepia or dark themes.
  - Remembers where you stopped reading, has "go to ayah", and has search. Search works on Arabic without diacritics and on the translations.
- **Translations:**
  - 13 Persian: Makarem Shirazi, Fooladvand, Ansarian, Gharaati, Elahi Ghomshei, Khorramshahi, Ayati, Bahrampour, Khorramdel, Mojtabavi, Moezzi, Sadeqi Tehrani, Safavi.
  - 16 English: Saheeh International, Qarai, Shakir, Pickthall, Yusuf Ali, Arberry, and others. A transliteration is also available.
- **Recitation:**
  - About 50 recitations, including Minshawi (Murattal and Mujawwad), Husary, Abdul Basit, Tablawi, Parhizgar, Karim Mansoori and Alafasy.
  - Play one ayah, to the end of the surah, to the end of the juz, or a range you choose.
  - Repeat an ayah or a range N times, and change the speed.
  - The current ayah is highlighted and the view scrolls with it.
  - Playback continues in the background, with controls on the Lock Screen.
  - Surahs can be downloaded for offline listening.
- **Audio translation after each ayah:** like Quran Hadi's "پخش قرائت و ترجمه گویا".
  - Persian: Makarem (read by Kabiri), Fooladvand (read by Hedayatfar)
  - English: Saheeh International (read by Ibrahim Walk)
- **Tafsir for each ayah:** see [§4](#4-content-sources-and-licenses) for what's available.
- **Other:**
  - Bookmarks, favorites and notes.
  - An "Ayah of the day" notification at a time you pick. It shows the same ayah as the daily widget.
- **App language:** Persian (right to left, Persian digits) and English. It follows the phone's language by default.

Everything except streaming audio works offline. There's no account, no ads and no tracking.

---

## 2. How the widget works

- **WidgetKit.** Lock Screen widgets have to be built with Apple's WidgetKit. Zekr will offer:
  - `accessoryRectangular`, the shape in the screenshot
  - `accessoryInline`, the one-line slot next to the date
  - the Home Screen sizes
- **Changing on time.** iOS only lets a widget reload about 40–70 times a day, so the changes can't rely on reloads. Instead, the widget gives iOS a schedule (a "timeline") of the next 24–48 ayahs, each with its own start time. iOS switches to the next one on the hour, or at midnight. One reload a day is enough.
- **Choosing the ayah.** The ayah for each time slot is picked by a fixed rule: a seeded shuffle of the pool, keyed by the time slot. This has three effects:
  - the widget, the app and the daily notification always show the same ayah
  - no ayah repeats until the whole pool has been shown
  - no server is needed
- **Space is tight.** The widget holds one line of Arabic and two lines of translation. I measured this against the real text:
  - about **1,700 ayahs (27%) fit in full** with Saheeh International, and about the same number with Makarem
  - that's about 70 days of hourly ayahs, or about 4.5 years of daily ones, before any repeat
  - all numbers are estimates until they're checked on a real device
- **Duas pool.** Your current widget shows only part of 17:24, the dua «وَقُل رَّبِّ ٱرْحَمْهُمَا كَمَا رَبَّيَانِى صَغِيرًا» / "My Lord, have mercy upon them as they brought me up [when I was] small". It doesn't show the whole ayah. Zekr's "Quranic duas" pool does the same thing using a hand-picked list of excerpts. Each excerpt stores the Arabic word range and the matching English and Persian translation. **You would review the list** before it ships.
- **Settings and data access:**
  - The widget's settings are stored in the widget itself (iOS 17 "App Intent configuration"), so the core widget works even with a free Apple ID.
  - The "my favorites" pool reads the app's saved favorites through a shared App Group container.

---

## 3. Technical approach

- **Native Swift + SwiftUI, iOS 17 or later.** Your phone is on iOS 26.
  - Lock Screen widgets have to be written in SwiftUI/WidgetKit anyway.
  - Native code gives the best background audio, widgets and Siri support.
  - Flutter or React Native would add a layer and still need the Swift widget.
- **Project structure:**
  - `Zekr`: the app
  - `ZekrWidgets`: the widget extension
  - `ZekrKit`: a shared Swift package. It holds the data models, the read-only Quran database, the ayah-choosing logic, deep links, and the audio URLs and play queue.
  - unit tests for `ZekrKit`, covering ayah choice, data checks, and ranges and repeats
- **XcodeGen.** The Xcode project file is generated from a short `project.yml`. It's easy to read, causes no merge conflicts, and I can write it without Xcode.
- **Content data:**
  - `tools/build_db.py` downloads the Tanzil text, metadata and translations, plus the chosen tafsirs.
  - It checks the data (114 surahs, 6,236 ayahs, with every translation complete).
  - It builds `quran.sqlite` with full-text search.
  - The database ships inside the app, so the app works offline.
- **User data:** bookmarks, favorites, notes and last-read position are stored with SwiftData in the App Group, so the widget can read favorites. iCloud sync can come later.
- **Audio:**
  - Uses AVQueuePlayer to play a separate MP3 for each ayah from EveryAyah (`everyayah.com/data/<reciter>/SSSAAA.mp3`). I checked this works for Minshawi, Husary, Parhizgar, Mansoori and the Persian and English audio translations.
  - It loads the next few ayahs early, so there's almost no gap between them.
  - Downloaded surahs play from the phone.
  - Lock Screen controls use Now Playing.
- **Fonts:** all are free to bundle.
  - Arabic: a Quran font. KFGQPC Uthmanic Hafs if its license allows, otherwise Amiri Quran or Scheherazade New (both under the SIL Open Font License).
  - Persian: Vazirmatn (SIL Open Font License).
- **Deep links:** `zekr://ayah/17/24`, used by the widget, notifications and Shortcuts.
- **CI:** GitHub Actions on macOS runs `xcodegen`, builds the app and runs the tests on every pull request. I can't build iOS apps in this Linux environment, so CI is how each change gets checked.

---

## 4. Content sources and licenses

| Content | Source | Terms |
|---|---|---|
| Arabic text (Uthmani & Simple), surah/juz/hizb/page data | [Tanzil](https://tanzil.net/download/) | Exact copies only. Credit Tanzil and link to tanzil.net |
| 13 Persian + 16 English translations | [Tanzil](https://tanzil.net/trans/) | Non-commercial use only; other uses need the translator's or publisher's permission. Link back if more than 3 are used |
| Recitations + audio translations | [EveryAyah](https://everyayah.com) | Free to download; streamed from their server |
| Tafsir, English | Quran.com / [QUL](https://qul.tarteel.ai): Ibn Kathir (abridged), Ma'arif al-Qur'an, Tazkirul Quran | Each resource has its own license |
| Tafsir, Persian | QUL: Al-Mukhtasar (Persian), As-Sa'di (Persian) | Each resource has its own license. A free QUL account is needed to download |
| Tafsir, Arabic | Quran.com / QUL: Muyassar, Ibn Kathir, Tabari, Qurtubi, Sa'di, Baghawi, Wasit | Each resource has its own license |
| Persian word-by-word (later) | QUL | Free QUL account needed |

**Not available from open sources:**
- Tafsir Nemooneh (which you use in Quran Hadi), Al-Mizan and Tafsir Noor
- These translations from Quran Hadi: Markaz-e Tab' va Nashr, Garmaroudi, Maleki and Shirvani
- The Iranian-style script Quran Hadi uses (Zekr offers the Uthmani and Simple scripts instead)

Any of these would need a source and permission.

These terms are fine for a free personal or family app. **Publishing on the App Store, especially as a paid app, needs a license review first.**

---

## 5. Milestones

Each milestone is one pull request you can review.

| # | Milestone | What you get |
|---|---|---|
| **M0** | Foundation | Project skeleton (app + widget + ZekrKit); data script and `quran.sqlite` (Arabic, Saheeh, Makarem); CI passing; credits page |
| **M1** | Widget | Lock Screen and Home Screen widget that changes hourly or daily, with its settings. Tapping opens a simple ayah screen with audio |
| **M2** | Reader | Index (surah/juz/hizb), verse view with translations, translator picker, search, bookmarks and favorites, Persian and English UI |
| **M3** | Player | Reciters, ranges, repeats, speed, highlighting, background playback with Lock Screen controls, offline downloads, audio translation |
| **M4** | Tafsir and extras | Tafsir panel, "Ayah of the day" notification, notes, Siri and Shortcuts |
| **M5** | Release | Polish, accessibility, app icon, TestFlight (App Store optional) |

The widget comes right after the foundation because it's what you asked for most.

**Later:**
- Mushaf page view: the 604-page layout with the translation under each line, like Quran Hadi
- Word-by-word meanings
- Khatm and reading plans
- iCloud sync
- Apple Watch
- A "next ayah" button on the Home Screen widget
- A sequential widget mode for memorization (one ayah of a surah after another)
- Optional AI Q&A that only answers from real tafsir text

---

## 6. Getting it on your iPhone

iOS apps can only be built on a Mac, so one of these is needed:

- **A: You have a Mac with Xcode.**
  1. Run `brew install xcodegen && xcodegen && open Zekr.xcodeproj`.
  2. Connect the iPhone and press Run.

  A free Apple ID works, but the app has to be reinstalled from Xcode every 7 days. The Apple Developer Program ($99 a year) removes that limit and allows TestFlight.
- **B: You don't have a Mac.**
  1. Join the Apple Developer Program.
  2. Create an App Store Connect API key and save it as GitHub repository secrets.
  3. CI builds each merged change and uploads it to TestFlight. You install it from the TestFlight app on your iPhone.

  Because the repo is private, each minute of macOS CI counts as 10 minutes of GitHub's free allowance. So CI runs only on pull requests.

---

## 7. Decisions

**I need these from you:**
1. Do you have a Mac, and are you in the Apple Developer Program? This decides path A or B.
2. Is the app just for you and your family, or for the App Store?
3. Which tafsir(s) matter most to you? Nemooneh isn't openly available. Do you have a source for it?

**Defaults I'll use unless you say otherwise:**

| Setting | Default |
|---|---|
| English translation | Saheeh International (what your current widget uses) |
| Persian translation | Makarem Shirazi |
| Reciter | Minshawi Murattal (your choice in Quran Hadi) |
| Arabic script | Uthmani |
| App language | Follows the phone (English or Persian) |
| Minimum iOS | 17 |
| Bundle ID | `com.<you>.zekr` |
