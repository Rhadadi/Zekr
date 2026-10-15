# Zekr

A personal Quran app for iPhone and the web: Arabic text (verse by verse or as a mushaf page), Persian and English translations, recitation, the Al-Mizan tafsir (Persian, on the iPhone), and a Lock Screen widget that shows a new ayah every hour or every day.

- Plan, decisions and milestones: [docs/PLAN.md](docs/PLAN.md)
- Persian translations compared: [docs/research/persian-translations.html](docs/research/persian-translations.html)

Working on this repository (human or agent)? Start with [`AGENTS.md`](AGENTS.md); the navigation redesign is described in [`docs/DESIGN.md`](docs/DESIGN.md).

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

## Publishing the web app on GitHub Pages

The site ends up at `https://<your-user>.github.io/Zekr/`. It works from that sub-path (a test serves the build under `/Zekr/` and checks it, including offline use).

1. Repo Settings > Pages > Build and deployment > Source: **GitHub Actions**.
   - GitHub Pages on a **private** repo needs a paid plan (Pro, Team or Enterprise). On the free plan, make the repo public first (Settings > General > Danger Zone), which also makes the code public.
2. The workflow `.github/workflows/pages.yml` has to be on `main`. It deploys on every push to `main`, or run it by hand from the Actions tab (Deploy web to GitHub Pages > Run workflow). By default the `github-pages` environment only accepts deployments from `main`.
3. Open the URL from the finished run.

The site is public to anyone who has the link. It asks search engines not to index it (`robots.txt` and a `noindex` tag), which is a request, not protection. It serves Tanzil's translations, which are for non-commercial use; the About page credits and links Tanzil.

## iPhone app

On a Mac with Xcode 16 or later:

```sh
brew install xcodegen
python3 tools/build_data.py --almizan   # --almizan adds the Al-Mizan tafsir (about 10 minutes the first time)
cp ios/Config/Signing.local.xcconfig.example ios/Config/Signing.local.xcconfig   # then put your Team ID in it
cd ios && xcodegen && open Zekr.xcodeproj
```

Plug in your iPhone (turn on Developer Mode in Settings > Privacy & Security), pick it as the run destination and press Run. With a free Apple ID the app stops opening after 7 days; press Run again to renew it. After the first run, trust the developer profile in Settings > General > VPN & Device Management.

Then add the widget: touch and hold the Lock Screen, Customize, Lock Screen, tap the widget area, search for Zekr and add "Ayah".

Tests for the shared Swift code (no Xcode project needed): `cd ios/ZekrKit && swift test`.

### Al-Mizan

`--almizan` downloads Al-Mizan in the Persian translation of Mousavi Hamadani from the [Zolal](https://github.com/roshan-research/zolal) project (built with CRCIS Noor) into `data/raw/almizan_fa/`, then builds `ios/Zekr/Resources/almizan.sqlite`. Every ayah has a book button that opens the section of Al-Mizan that explains it. Without the flag the app works the same, minus that button.

The text is copyrighted, so it is for personal and family use: it is not committed to this repository, and the public website never has it. For a private web build (one only your family can reach), `python3 tools/build_data.py --almizan-web` puts it in the web data too; never deploy that build to the public GitHub Pages site.

### The printed mushaf pages

For the pages to look exactly like a printed Madani mushaf (page border, surah and juz tabs, round ayah numbers, the decorated first two pages, several surahs on a page), the web app can show the pages of a scanned PDF as pictures, with every ayah still tappable and highlighted while it is recited. The owner's edition is `https://www.pdfquran.com/download/big/big-quran.pdf` (Quran page n is PDF page n + 3). You need `pdfimages` (poppler), numpy and Pillow:

```sh
python3 tools/build_data.py                      # the usual data first
python3 tools/mushaf_pages.py ~/Downloads/big-quran.pdf     # about 3 minutes; writes web/public/data/mushaf/ (about 90 MB) and updates meta.json
cd web && npm run build && npx vite preview      # try it
```

The tool counts the ayah-end markers on every page and stops unless they add up to the 6,236 ayahs and cover every text line. This edition breaks pages in different places from Tanzil's data in 25 places, so the page of every ayah comes from the pictures. The pictures are the publisher's artwork: they are never committed, the public Pages build refuses them (the deploy fails if `data/mushaf` or a `mushaf` entry in `meta.json` is in it), and a build that has them is for your own private web hosting and, later, your iPhone. Settings then has a **Page colour** (blue as printed, green, purple, pink, dark), which recolours the picture with a filter.

## Credits

Quran text and translations: [Tanzil Project](https://tanzil.net) (text unchanged; translations for non-commercial use). Recitation: [EveryAyah.com](https://everyayah.com). Tafsir: Al-Mizan (Allameh Tabatabaei), Persian translation by Mousavi Hamadani, text from the Zolal project (CRCIS Noor), for personal use. Fonts: KFGQPC Hafs and Naskh (King Fahd Glorious Quran Printing Complex, via Tanzil), Me-Quran (Meor Ridzuan, non-commercial use), Scheherazade New, Amiri Quran and Vazirmatn (SIL Open Font License); see `web/public/fonts/LICENSES.txt`.
