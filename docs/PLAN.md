# Zekr: Plan

Zekr is an iPhone app and a web app for reading, listening to and understanding the Quran. Both have the Arabic text, Persian and English translations, recitation and tafsir. The iPhone app also has a Lock Screen widget that shows a new ayah every hour or every day, like the widget in the bottom-left corner of the screenshot. The web app shows the same ayah of the day, so your phone, the web and your family's devices agree.

*Status: M0 (data, shared rule), M1 (web app, including the mushaf page view) and the first part of M3 (iPhone reader) are built. The iPhone widget and app compile on CI but haven't been run on a phone yet. See §9. Last updated 2026-10-12.*

---

## 1. Features

### Lock Screen widget (the main feature)

- **Layout:** the same as the screenshot. A header with the surah name and ayah number, one line of Arabic, and the translation underneath.
- **Placement:** the bottom of the iOS 26 Lock Screen (where yours is now), under the clock, on the Home Screen, or in StandBy.
- **Settings for each widget** (long-press, then Edit Widget):
  - **Changes:** every hour, every 3 hours, or daily
  - **Shows:** Arabic + English, Arabic + Persian, Arabic only, or translation only
  - **Draws from:** all ayahs (long ones are trimmed with “…”, as in your screenshot), only ayahs that fit in full, Quranic duas, or my favorites
- **Tapping it** opens Zekr on that ayah, with the full text, a play button and the tafsir.

### The app

- **Reader:**
  - Index by Surah, Juz or Hizb, like Quran Hadi's فهرست screen.
  - Verse-by-verse view with the Arabic and up to two translations.
  - Font size, and light, sepia or dark themes.
  - Remembers where you stopped reading, has "go to ayah", and has search. Search works on Arabic without diacritics and on the translations.
- **Translations:**
  - Persian: **Safavi** (default), Fooladvand, Khorramshahi, Ayati, Bahrampour, Ansarian, Makarem Shirazi. Mojtabavi is left out because Tanzil's copy has truncated ayahs (24 are one or two words, e.g. 48:29 is just «محمد»). The rest of Tanzil's list can be added later after the same check.
  - English: **Saheeh International** (default) and Qarai, with the rest of Tanzil's 16 available later. A transliteration is also available.
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

### The web version

A static website (no server, no login) that works on a phone, tablet or computer and can be added to the Home Screen as an app.

- **Same content and settings as the app:** reader, translations, recitation with repeat and speed, search, bookmarks, light/sepia/dark, Persian and English.
- **Ayah of the day:** a page that shows the current ayah and changes hourly or daily by the same rule as the widget (§2). It's also useful on a computer or a tablet, where there are no Lock Screen widgets.
- **Offline:** after the first visit, the text and translations work without internet.
- **Deep links:** `/#/ayah/17/24` opens that ayah.
- **What it can't do:** Lock Screen widgets (iOS only) and background audio controls as good as the app's.

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
  - about **1,350 ayahs (22%) fit in full** with Safavi, because his translation is more explanatory (about 1,800 with Saheeh International or Fooladvand)
  - by default the widget draws from all 6,236 ayahs and trims long ones with “…” like your screenshot. Tapping always opens the whole ayah
  - "Fits in full" is a setting. It gives about 56 days of hourly ayahs, or 3.7 years of daily ones, before any repeat
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
- **Repository layout:**
  - `tools/`: the data script (`build_data.py`)
  - `shared/`: the ayah-rotation rule and its test cases, used by both apps
  - `web/`: the web app
  - `ios/`: `Zekr` (the app), `ZekrWidgets` (the widget extension) and `ZekrKit` (a Swift package with the data models, the Quran database, the ayah-choosing logic, deep links, and the audio URLs and play queue)
  - unit tests for `ZekrKit`, covering ayah choice, data checks, and ranges and repeats
- **Web app:** Vite + TypeScript, a static site (works on any host), with a service worker for offline use.
- **One rule, two implementations.** The ayah-of-the-day rule (a seeded shuffle, §2) is written down once in `shared/rotation-spec.md`, with test cases in `shared/test-vectors/`. Both the Swift and the TypeScript code must pass the same test cases, so the web and the widget always agree.
- **XcodeGen.** The Xcode project file is generated from a short `project.yml`. It's easy to read, causes no merge conflicts, and I can write it without Xcode.
- **Content data:**
  - `tools/build_data.py` downloads the Tanzil text, metadata and translations (Python standard library only, so it runs on your Mac with nothing to install).
  - It fixes Arabic letter variants in the Persian translations (some use ي and ك instead of ی and ک), and checks the data (114 surahs, 6,236 ayahs, every translation complete).
  - It builds `quran.sqlite` with full-text search for the app, a smaller `widget.sqlite` for the widget, and JSON files for the web app.
  - The databases ship inside the app, so it works offline. The generated files are not committed; the script rebuilds them.
- **User data:** bookmarks, favorites, notes and last-read position are stored with SwiftData in the App Group, so the widget can read favorites. iCloud sync can come later.
- **Audio:**
  - Uses AVQueuePlayer to play a separate MP3 for each ayah from EveryAyah (`everyayah.com/data/<reciter>/SSSAAA.mp3`). I checked this works for Minshawi, Husary, Parhizgar, Mansoori and the Persian and English audio translations.
  - It loads the next few ayahs early, so there's almost no gap between them.
  - Downloaded surahs play from the phone.
  - Lock Screen controls use Now Playing.
- **Fonts:** all are free to bundle.
  - Arabic: a choice of Quran fonts, as on Tanzil: KFGQPC Hafs (default), KFGQPC Naskh, Me-Quran, Scheherazade New and Amiri Quran. PDMS Saleem is left out because its license forbids redistribution.
  - Persian: Vazirmatn (SIL Open Font License).
- **Deep links:** `zekr://ayah/17/24`, used by the widget, notifications and Shortcuts.
- **CI:** GitHub Actions checks every push. A Linux job runs the data script, the web build and tests, and the Swift tests for `ZekrKit`. A macOS job runs `xcodegen` and builds the app and widget. I can't run Xcode in this environment, so the macOS job is how I find compile errors in the iOS app before you do. It uses macOS minutes (10× on private repos), so it runs only when `ios/` changes.

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
| **M0** | Foundation | Data script and databases (Arabic, Saheeh, Qarai and the Persian translations above); the shared ayah-rotation rule with test cases; repo layout; CI |
| **M1** | Web app | Reader, translations, recitation (repeat, speed), ayah of the day, search, bookmarks, settings, offline. I can test this one fully here |
| **M2** | iPhone widget | Lock Screen and Home Screen widget that changes hourly or daily, with its settings. Tapping opens a simple ayah screen with audio |
| **M3** | iPhone reader | Index (surah/juz/hizb), verse view with translations, translator picker, search, bookmarks and favorites, Persian and English UI |
| **M4** | iPhone player | Reciters, ranges, repeats, speed, highlighting, background playback with Lock Screen controls, offline downloads, audio translation |
| **M5** | Tafsir and extras | Tafsir panel (iPhone and web), "Ayah of the day" notification, notes, Siri and Shortcuts |
| **M6** | Release | Polish, accessibility, app icon, TestFlight, App Store, and a web host |

The web app comes first because it's the one I can run and check completely in this environment. The iPhone widget follows right after, since it's what you asked for most.

**Later:**
- Mushaf page view on the iPhone (the web already has it: `#/page/305`). A line-exact Madani layout would need the KFGQPC page fonts; the web uses flowing text with the same page, juz and surah boundaries
- Word-by-word meanings
- Khatm and reading plans
- iCloud sync
- Apple Watch
- A "next ayah" button on the Home Screen widget
- A sequential widget mode for memorization (one ayah of a surah after another)
- Optional AI Q&A that only answers from real tafsir text

---

## 6. Getting it on your iPhone

You have a MacBook Air M1, so Zekr is built and installed from your Mac:

1. Install Xcode from the Mac App Store, then run `brew install xcodegen`.
2. In Xcode, open Settings → Accounts and add your Apple ID. This creates a free "Personal Team".
3. In the repo, run `xcodegen`, then `open Zekr.xcodeproj`.
4. Connect your iPhone, turn on Developer Mode (Settings → Privacy & Security), and press Run.

**Free Apple ID limits:**
- The app stops opening after 7 days. Pressing Run again in Xcode fixes it.
- Each phone has to be connected to your Mac to install the app. That makes sharing with family awkward.

**Joining the Apple Developer Program ($99 a year)** removes both limits. Family members install through TestFlight with no cable, and it's required for the App Store anyway. Join when you're ready to share it.

During development, the app uses a separate bundle ID (`com.rhadadi.zekr.dev`). That keeps the real ID free for the App Store release.

CI on GitHub checks every change. Because the repo is private, macOS minutes are limited, so the macOS build runs only when needed.

---

## 7. Decisions

**Your answers (2026-10-12):**
- **Build path:** your Mac with a free Apple ID for now. Join the Apple Developer Program before sharing with family or releasing.
- **Audience:** you and your family first, then the App Store. Because of the App Store goal, every text source needs permission before release (see §8).
- **Tafsir:** Al-Mizan (Tabatabai).
  - No open digital edition exists. I didn't find any JSON, SQLite or Tanzil/QUL version.
  - The Persian translation (Musavi Hamadani) is published by Daftar-e Entesharat-e Eslami (Jame'eh Modarresin, Qom). It's sold as an e-book (for example on Fidibo).
  - The English translation (Rizvi for volumes 1–13, Tawheed Institute Australia for 14–40) is partly on al-islam.org.
  - Plan: build the tafsir panel so it can show Al-Mizan by passage (it explains ayahs in groups). Then:
    - for personal and family use, import a copy we have the right to use
    - before the App Store, ask the publishers (Jame'eh Modarresin for Persian, Tawheed Institute for English) for permission
    - until permission is granted, the App Store build links to the passage online instead of including the text
- **Persian translation:** Safavi (not Makarem). The candidates are compared on real ayahs in [`research/persian-translations.html`](research/persian-translations.html):
  - **Safavi**, *ترجمه قرآن بر اساس المیزان*: a translation based on Al-Mizan's reading, and a winner of Iran's Book of the Year award. It's fluent and explains as it goes, but it's about 30% longer, so fewer ayahs fit the widget (about 1,350 compared with about 1,870).
  - **Fooladvand**: accurate and concise, widely used, and it has a matching Persian audio translation (read by Hedayatfar).
  - Also good: Khorramshahi (literary and concise) and Ayati (literary, no brackets).
  - **Decision (you): Safavi.** It's the default everywhere, because it matches Al-Mizan. You can switch to another in one tap.

**Defaults unless you say otherwise:**

| Setting | Default |
|---|---|
| English translation | Saheeh International (what your current widget uses); Qarai also included |
| Persian translation | Safavi (reader, widget and web). Fooladvand is the other pick, and it's what the Persian audio translation reads |
| Persian translations included | Safavi, Fooladvand, Khorramshahi, Ayati, Bahrampour, Ansarian, Makarem (Mojtabavi dropped: truncated source) |
| Reciter | Minshawi Murattal (your choice in Quran Hadi) |
| Arabic script | Uthmani in the reader; Simple in the widget (the same style as your current widget, and more compact) |
| App language | Follows the phone (English or Persian) |
| Minimum iOS | 17 |
| Bundle ID | `com.rhadadi.zekr.dev` while developing; `com.rhadadi.zekr` for the App Store |

---

## 8. Before the App Store

- **Tanzil translations:** they're for non-commercial use. Ask permission from each translator's publisher, or keep the app free with a clear credit and link to Tanzil.
- **Al-Mizan:** written permission from the publishers, or keep the link-out.
- **EveryAyah audio:** check the terms.
- **Fonts** (licenses in `web/public/fonts/LICENSES.txt`):
  - KFGQPC Hafs and Naskh may be used, copied and distributed free of charge, but not sold or modified. The files are Tanzil's builds of the King Fahd Complex fonts; before release, confirm with Tanzil or switch to files straight from the Complex (fonts.qurancomplex.gov.sa).
  - Me-Quran is free for non-commercial use only. Ask the author (meory@yahoo.com) or drop it before any paid or commercial release.
  - Scheherazade New and Amiri Quran: SIL Open Font License, no action needed.
- **Privacy:** no data collected, no tracking (App Store privacy label: "Data Not Collected").
- **The web version is public once hosted.** That means the Tanzil translations are served to anyone, which counts as redistribution. Fine for a private test site; for a public one, get permission or keep the site unlisted behind a login (Cloudflare Access is free). The Al-Mizan text must never be in the public web build unless the publishers agree.
- **Web hosting: GitHub Pages (decided).** `.github/workflows/pages.yml` builds and deploys the site; the steps are in the README. A private repo needs a paid GitHub plan for Pages; otherwise the repo has to be public. Cloudflare Pages or Netlify would also work with a private repo if that's ever easier. The site is public once deployed, with a `noindex` request to search engines.

---

## 9. Where things stand

| Milestone | State |
|---|---|
| **M0** Foundation | Done. `tools/build_data.py` (with 16 tests) builds the databases and web data; the shared rotation rule has a spec, a reference implementation and test cases |
| **M1** Web app | Done and tested here: 33 unit tests and 25 end-to-end tests at phone width, plus a check that real recitation plays. Not hosted yet (§8) |
| **M1b** Web page view | Done and tested: `#/page/N` with surah banner, ornate ayah markers, surah/page/juz header, tap an ayah for its translation, previous/next page, swipe, jump to page, page turns with the recitation. Page and juz data match the Madani mushaf (19:1-11 on page 305, juz 16) |
| **M2** iPhone widget | Written: `ZekrKit` (45 tests pass on Linux and on macOS, including the shared rotation cases and daylight-saving cases), the widget and the Xcode project definition. Built by CI on macOS (Xcode 16.4, iOS 18.5 SDK): the widget is embedded and has its App Intents metadata. Not yet run on a phone |
| **M3** iPhone reader | First part written and built by CI: surah and juz index with filter, surah reader with a choice of Quran fonts (KFGQPC Hafs by default) and selectable translations, per-ayah play/save/share/copy, saved ayahs, settings. Still to do: search, the page view, tafsir panel |
| **M4** iPhone player | The player is already in: queue, basmala, repeat, speed, translation audio, Lock Screen controls. Still to do: downloads for offline listening, and checking gaps between ayahs on a real phone |
| M5, M6 | Not started |

**Data findings worth knowing**
- Tanzil's text files put the basmala in front of the first ayah of every surah (except 1 and 9). The data script removes it, so 2:1 is just «الم». The apps show the basmala as a heading and play its recording first when you play a whole surah.
- Safavi's translation leaves 80:39 empty because it translates 80:38–39 together. The apps show "(translated together with the previous ayah)".
- Safavi is the most explanatory translation, so fewer ayahs fit the widget in full (1,385 of 6,236, against 1,923 for Fooladvand). The default pool is all ayahs, with long ones trimmed.

**What I haven't verified**
- Anything on a real iPhone: how the widget looks on your Lock Screen, whether the text fits as estimated, how the Quran font renders, whether recitation switches between ayahs without a noticeable gap, and the Lock Screen audio controls.
- Persian text in the widget on a device set to Persian.
