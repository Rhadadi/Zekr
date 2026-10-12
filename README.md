# Zekr

A personal Quran app for iPhone and the web: Arabic text (verse by verse or as a mushaf page), Persian and English translations, recitation, tafsir (planned), and a Lock Screen widget that shows a new ayah every hour or every day.

- Plan, decisions and milestones: [docs/PLAN.md](docs/PLAN.md)
- Persian translations compared: [docs/research/persian-translations.html](docs/research/persian-translations.html)

## Layout

| Folder | What it is |
|---|---|
| `tools/` | `build_data.py` downloads and checks the Quran text and translations (Tanzil) and builds the databases the apps use |
| `shared/` | The ayah-of-the-day rule (`rotation-spec.md`) and the test cases both apps must pass |
| `web/` | The web app (Vite + Preact + TypeScript, installable, works offline) |
| `ios/` | The iPhone app, the Lock Screen widget and `ZekrKit` (shared Swift code) |

## First step: build the data

The generated files are not committed. Needs only Python 3 (already on a Mac):

```sh
python3 tools/build_data.py
```

This writes `web/public/data/`, `ios/Zekr/Resources/quran.sqlite` and `ios/ZekrWidgets/Resources/widget.sqlite`.

## Web app

```sh
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run e2e        # end-to-end tests (needs: npx playwright install chromium)
npm run build      # static site in web/dist, works on any host
```

## iPhone app

On a Mac with Xcode 16 or later:

```sh
brew install xcodegen
python3 tools/build_data.py
cp ios/Config/Signing.local.xcconfig.example ios/Config/Signing.local.xcconfig   # then put your Team ID in it
cd ios && xcodegen && open Zekr.xcodeproj
```

Plug in your iPhone (turn on Developer Mode in Settings > Privacy & Security), pick it as the run destination and press Run. With a free Apple ID the app stops opening after 7 days; press Run again to renew it. After the first run, trust the developer profile in Settings > General > VPN & Device Management.

Then add the widget: touch and hold the Lock Screen, Customize, Lock Screen, tap the widget area, search for Zekr and add "Ayah".

Tests for the shared Swift code (no Xcode project needed): `cd ios/ZekrKit && swift test`.

## Credits

Quran text and translations: [Tanzil Project](https://tanzil.net) (text unchanged; translations for non-commercial use). Recitation: [EveryAyah.com](https://everyayah.com). Fonts: Amiri Quran and Vazirmatn (SIL Open Font License).
