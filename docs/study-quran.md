# Private Study Quran content for Zekr

The optional content package adds the book's English verse translation, surah introductions and commentary to the iPhone app and local/private web builds. Zekr's existing ayah identifiers connect this text with Arabic and recitation.

## Import a local PDF

The PDF reader is an optional dependency. The standard Tanzil build uses only Python's standard library.

```sh
python3 -m venv /path/to/private/import-env
/path/to/private/import-env/bin/pip install -r tools/study-quran-requirements.txt
/path/to/private/import-env/bin/python tools/import_study_quran.py \
  --pdf /path/to/The_Study_Quran.pdf \
  --output /path/to/private/study-quran
```

For the pilot, add `--surahs 1,2,114` and choose a separate output directory. Pilot packages are marked incomplete and cannot enter the normal app build. `--reuse-extraction` reuses page extraction only when the PDF checksum and extraction version match.

The importer records the file checksum, decorative number font mapping, red commentary labels, original quoted headers, character/page spans, plain text and escaped HTML. It preserves hyphens at line wraps, joins layout lines, recovers word spaces from PDF glyph geometry, and preserves paragraph breaks and text emphasis. It does not paraphrase or generate missing commentary.

## Build both apps with the content

```sh
python3 tools/build_data.py --study-quran /path/to/private/study-quran/study_quran.sqlite
cd web
npm ci
npm run dev -- --host 127.0.0.1
```

The iPhone output is `ios/Zekr/Resources/quran.sqlite`. Build the app using the existing Xcode instructions. In either app's Settings, choose **The Study Quran** under English translations (the verse translation, kept separate from the commentary).

Where the commentary appears (same design on the website and the iPhone):

- **Verse view:** one chip, "Commentary on 2:1–5", under the first ayah of each note. A note shared by several ayahs shows once, not under every ayah; overlapping notes each get a chip. An ayah the book does not comment on separately shows nothing.
- **Ayah card** (tap an ayah in the page view): one chip for every note that covers that ayah.
- **Commentary screen** (`#/commentary/<surah>/<ayah>`, a sheet on the iPhone): the notes, a strip of the ayahs they explain, links from cross-references, and the neighbouring notes.
- **Surah introduction** (`#/intro/<surah>`): a row at the top of each surah in verse view opens it on its own screen. Existing recitation continues to use the same ayah IDs.

The web app loads notes by surah when opened. Search has an additional **Search The Study Quran tafsir** panel. **Download for offline** downloads the translations, all introductions and all commentary chapters, including installed commentary recordings. Recitation retains its existing streaming/download behavior. The iPhone commentary sheet also supports full-text search.

Run `python3 tools/build_data.py` without the flag for a normal build. This recreates the generated files without the optional package. Generated data and the raw input directory are already ignored by Git. The Pages workflow installs the text and the published Yasin/Yusuf narration packages under the owner's explicit publication instruction. Keep the PDF and import output outside source control.

## Optional commentary audio

Install completed, local narration packages alongside the exact source database:

```sh
python3 tools/build_data.py --study-quran /path/to/study_quran.sqlite \
  --study-quran-audio /path/to/yasin-audio \
  --study-quran-audio /path/to/yusuf-audio
```

Each package must contain `manifest.json` and its MP3 files. Before installing anything, the builder checks the source text hash, ayah links and audio file checksum for every note. The source database remains unchanged. The recordings are linked to notes, so a passage shared by several ayahs plays once.

In either app, open a narrated ayah's commentary and choose **Listen from here**. The existing player offers pause, seeking and previous/next notes, continuing through the remaining recorded notes in that surah. Starting recitation replaces commentary playback. The voice is identified as AI generated.

The Yasin and Yusuf packages contain 163 recordings covering 194 ayahs, about 144 MB altogether. The iPhone build bundles them under `ios/Zekr/Resources/StudyQuranAudio`; regenerate the Xcode project after installing them. The web build uses `web/public/data/commentary-audio` and stores complete downloaded files in a separate offline cache that supports range requests. Offline playback requires completing **Download for offline** first.

Both generated directories are ignored by Git. The 163 published source recordings and their minimal manifests live in `assets/study-quran-audio`, with the owner's explicit publication authorization on October 16, 2026. Pages and the iPhone CI build install these packages; the Pages guard checks their expected coverage and file count. Experimental samples, original generation receipts and API caches remain outside git. Building without `--study-quran-audio` removes only the managed installed copies, leaving the original packages and generation cache intact. Building or listening never calls a speech service or spends generation credits.

These initial recordings read the original source text, including citations. Any listening edition that omits citations or expands verse references must keep its separate speech text and provenance; it must not overwrite the book's stored text or mislabel modified speech as an exact reading.

## Schema and interoperability

The reusable database has separate `surah`, `ayah`, `translation`, `translation_text`, `surah_introduction`, `surah_opening`, `tafsir_entry`, `tafsir_ayah`, `source`, `source_span`, `cross_reference` and `import_issue` tables. `content_search` provides SQLite full-text search.

Ayah IDs match Zekr/Tanzil: `id = first_ayah_id + ayah_number - 1`. Explicit `(surah, number)` columns remain available for other apps. The translation ID is `en.study_quran`. Shared and overlapping commentary notes are stored once, with a many-to-many relationship to ayahs.

The app adapter places translations in Zekr's existing tables and ordered web array, adds the separate commentary/introduction tables to the full iPhone database, and writes per-surah web files. The compact widget database excludes this source in the first version. Source checksum and database hash participate in Zekr's data version so its offline cache updates when content changes.

Export independent JSON/CSV tables with:

```python
from pathlib import Path
import sys
sys.path.insert(0, "tools")
from study_quran import export_tables
export_tables(Path("/path/to/study_quran.sqlite"), Path("/path/to/tables"))
```

## Source fidelity and validation

This supplied ebook-converted PDF contains some quoted-header/note-label mismatches, an unnumbered commentary paragraph, and verses with no separately numbered commentary. Explicit red note labels determine `explicit_note` links. The unnumbered paragraph retains an empty label and is marked `quoted_header`. Original headers and their verse numbers remain in the database; source observations are recorded in `import_issue` and `validation.json`.

Identified Biblical citations remain readable text rather than being mislinked as Quran references. Quran references distinguish ayahs, commentary targets and introductions. Citations to traditional commentators remain part of the book's wording; they do not create invented classical commentary passages or author opinions.

Automated validation checks all 114 surahs, all 6,236 translation IDs, marker consistency, note labels, source coverage, HTML/plain-text agreement, SQLite integrity and foreign keys. Visual checks and source observations accompany the report. Structural checks and sampled visual review do not constitute a word-by-word verification of the entire book.

Local package tests:

```sh
STUDY_QURAN_DB=/path/to/study_quran.sqlite python3 -m unittest discover -s tools/tests -v
cd web && npm test && npm run build
```

The optional PDF import and private source package are not required for standard CI tests.
