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
