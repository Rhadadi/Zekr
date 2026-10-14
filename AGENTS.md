# Working in this repository (for any coding agent)

Zekr is a personal Quran app: an iPhone app (with a Lock Screen widget) and a web app (PWA). Read `docs/PLAN.md` for the product plan and `docs/DESIGN.md` for the navigation redesign that is **next in line** (planned, not started).

## Where things are

| Path | What |
|---|---|
| `tools/build_data.py` | Downloads the Quran text and translations (Tanzil) and builds the databases and web data. Run it first. Python standard library only. |
| `tools/almizan.py`, `tools/import_study_quran.py`, `tools/study_quran.py` | Optional **private** content (Al-Mizan, The Study Quran). |
| `tools/tests/` | Python tests, including a made-up Study Quran fixture (`study_fixture.py`). |
| `shared/` | The ayah-of-the-day rotation spec and golden test vectors used by Python, TypeScript and Swift. |
| `web/` | Vite + Preact + signals + TypeScript PWA. Unit tests: vitest. End to end: Playwright. |
| `ios/` | SwiftUI app and widget (`ios/Zekr`, `ios/ZekrWidgets`), XcodeGen project, and the `ZekrKit` Swift package (testable on Linux). |
| `.github/workflows/` | `ci.yml` (all tests, iPhone build) and `pages.yml` (GitHub Pages deploy). |

## Build and test

```sh
python3 tools/build_data.py                 # generated files are gitignored
python3 -m unittest discover -s tools/tests
cd web && npm ci && npm run typecheck && npm test && npx playwright test   # builds, serves and runs e2e
cd ios/ZekrKit && swift test                # needs Swift 6.1 (Linux or macOS)
```

- Playwright starts its own `vite preview` on port 4173 after `npm run build`. Rebuild before testing a change.
- The iPhone app can only be compiled on macOS. CI does it: `gh workflow run ci.yml --ref <branch>` (the `ios` job also runs on pull requests and on pushes that touch `ios/`).
- **Nothing has been run on a real iPhone.** Never claim it works on a phone; say "CI builds it".

## Hard rules

1. **Private content never goes in git or on the public site.** The Study Quran PDF and extracted text, and the Al-Mizan text, are copyrighted. `.gitignore` already excludes `*.pdf`, `study_quran.sqlite*`, `data/raw/`, and the generated databases. CI and the Pages deploy fail if `data/almizan`, `data/tafsir`, `data/intro`, a `studyQuran` or non-empty `tafsir` entry in `meta.json`, or a PDF is in a public build. If you add a new private data directory, add it to **both** guards (`ci.yml` and `pages.yml`). Tests must not quote the book; use the made-up fixture.
2. **Do not break the public deploy.** `main` deploys to GitHub Pages (https://rhadadi.github.io/Zekr/). Never merge to `main` without the owner asking.
3. **Be honest in reports.** If something was not run or not verified, say so. Describe what the owner will see, not the mechanism.
4. **Persian (RTL) is half the audience.** Check every UI change in both languages and in the light, sepia and dark themes.
5. **Accessibility is not optional.** Real `<button>`/`<a>`, 44px touch targets, labels, focus handling, `aria-current/expanded/pressed`. The axe suite (`web/e2e/a11y.spec.ts`) must pass on every route.
6. Licenses: Quran fonts and their terms are in `web/public/fonts/LICENSES.txt`; PDMS Saleem is excluded on purpose (no redistribution); Me-Quran is non-commercial only.

## Style

- Comments say *why*, briefly. Match the surrounding code's density and naming.
- Commit messages are prose: a short subject, a body that explains the change from the user's side. One logical change per commit.
- Prefer deleting code to adding it. Do not add dependencies without asking (no router library, no UI kit).
- When the owner gives feedback about how something looks, look at it: build, serve, screenshot at 390×844 and 1280×800. Passing tests does not mean it looks right.

## Branches and PRs

- `main` is the deployed branch. Work on a branch and open a PR only when the owner asks.
- `claude/study-quran-merge` carries the latest work (Study Quran integration, menu button, bottom translation box) and is ahead of `main`. `codex/study-quran` was the first, separate Study Quran branch and is already merged into it.
- Subscribe to CI before claiming a result: `gh api repos/Rhadadi/Zekr/commits/<sha>/check-runs`.

## Current state and next step

See `docs/PLAN.md` §9 for milestones and `docs/DESIGN.md` §10 for the numbered steps of the navigation redesign. Start at step 1 and go in order; each step is independently committable. The owner's decisions are in `docs/DESIGN.md` §2 and are fixed.
