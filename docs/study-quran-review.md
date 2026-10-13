# Review handoff

This branch contains the Study Quran importer, app adapters, iPhone/web UI, tests and schema. It does not contain the PDF or extracted book text. A cloud reviewer can review the code and run standard builds, but needs a private source package to reproduce the import or test actual book content.

## Local verification on October 12, 2026

- 114 surahs, 6,236 translations, 114 introductions, 112 unnumbered openings.
- 5,048 commentary entries and 6,704 ayah links; shared notes are stored once.
- 31,925 cross-references and 105,099 source spans.
- 28 Python tests, 45 web tests, and 63 Swift tests passed with private data.
- TypeScript checks and the production web build passed.
- Browser checks covered translation selection, shared notes, introductions, search, full offline download and offline reload.
- Xcode 27.0 built the app and widget for the generic iOS Simulator destination with signing disabled. No interactive iPhone/simulator check was performed.
- A default build without the optional package was checked to exclude Study Quran content.

Structural checks and sampled PDF review do not certify every word. There are 73 recorded source observations, including 43 ayahs without separately numbered commentary. Inspect `import_issue` in the private database; do not invent missing commentary.

## Private files on the owner's Mac

- Delivery and full verification report: `/Users/rhd/Documents/StudyQuran/README.md` and `output/full/validation.md`.
- Master package: `/Users/rhd/Documents/StudyQuran/output/full/study_quran.sqlite`.
- PDF is in the owner's iCloud Downloads folder; it is not in this repository.

## Follow-up work

Review against the latest Zekr changes (including PR #3 if still relevant). This branch starts from commit `d78354f`; preserve both integrations when resolving conflicts. Run the default build and public CI checks independently, then use private data for source fidelity and interactive iPhone checks. Keep the book text out of public GitHub and GitHub Pages. Choose a private hosting destination with the owner before publishing a private web build.

See [integration instructions](study-quran.md) and [schema](study-quran-schema.sql).

## Review notes (October 13, 2026)

Reviewed by a second Claude session in the cloud, **without the book**: code, structure, integration and tests only.

Done:
- Merged this branch with the latest Zekr (PR #3: continuous page view, Al-Mizan, fonts, surah header). Four conflicts (`build_data.py`, `data.ts`, `Reader.tsx`, `styles.css`) were additive; both integrations are kept. `build_data.py --study-quran` and `--almizan` / `--almizan-web` work together.
- **Design:** the per-ayah "Tafsir · The Study Quran" box repeated under every ayah, including each ayah of a shared note. Replaced with chips at the first ayah of a note, an ayah-card chip list, a commentary screen and an introduction screen (see study-quran.md). The details-panels are gone; the search panel is unchanged.
- **Book text kept out of the public repository:** two Swift tests, the smoke script and a Python fixture quoted sentences from the book. They are now structural checks (non-empty, differs from other translations, links, search finds a word) that run on any package. Verbatim wording is checked only against the private package, with digests.
- **Fixture:** `tools/tests/study_fixture.py` builds a complete made-up package (real schema, filler text, shared and overlapping notes, an ayah with no commentary, an unnumbered "quoted header" note). `test_study_integration.py` runs the adapter on it; the Swift tests that need a package run on it too.
- **Public build guards:** CI and the Pages deploy fail if `data/tafsir`, `data/intro`, `data/almizan`, a `studyQuran` entry in `meta.json`, or a PDF is in a public build.

Checked here: 41 Python tests (5 need the private package), 45 web unit tests, 69 web end-to-end tests (made-up text via mocked files), 65 Swift tests with the made-up package (61 without), public build free of study content.

Not checked, needs the Mac and the PDF: every word of the translation, introductions and commentary against the book; the 73 recorded source observations; real file sizes (search loads all 114 commentary files); the interactive iPhone app; offline use with the real data. Do not treat the structural checks as proof of fidelity.
