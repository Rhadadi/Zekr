
PRAGMA foreign_keys=ON;
CREATE TABLE source(id TEXT PRIMARY KEY, title TEXT NOT NULL, language TEXT NOT NULL,
 pdf_sha256 TEXT NOT NULL, filename TEXT NOT NULL, import_version TEXT NOT NULL,
 numbering TEXT NOT NULL, complete INTEGER NOT NULL);
CREATE TABLE surah(id INTEGER PRIMARY KEY, ayah_count INTEGER NOT NULL,
 first_ayah_id INTEGER NOT NULL, name_en TEXT NOT NULL, name_tr TEXT NOT NULL,
 pdf_start INTEGER NOT NULL, pdf_end INTEGER NOT NULL);
CREATE TABLE ayah(id INTEGER PRIMARY KEY, surah INTEGER NOT NULL REFERENCES surah,
 number INTEGER NOT NULL, UNIQUE(surah,number));
CREATE TABLE translation(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES source,
 lang TEXT NOT NULL, name TEXT NOT NULL, translator TEXT NOT NULL);
CREATE TABLE translation_text(translation_id TEXT NOT NULL REFERENCES translation,
 ayah_id INTEGER NOT NULL REFERENCES ayah, text TEXT NOT NULL, html TEXT NOT NULL,
 PRIMARY KEY(translation_id,ayah_id));
CREATE TABLE surah_introduction(source_id TEXT NOT NULL REFERENCES source,
 surah_id INTEGER NOT NULL REFERENCES surah, text TEXT NOT NULL, html TEXT NOT NULL,
 PRIMARY KEY(source_id,surah_id));
CREATE TABLE surah_opening(source_id TEXT NOT NULL REFERENCES source,
 surah_id INTEGER NOT NULL REFERENCES surah, text TEXT NOT NULL,
 PRIMARY KEY(source_id,surah_id));
CREATE TABLE tafsir_entry(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES source,
 surah_id INTEGER NOT NULL REFERENCES surah, note_label TEXT NOT NULL,
 first_ayah INTEGER NOT NULL, last_ayah INTEGER NOT NULL, source_order INTEGER NOT NULL,
 lemma_text TEXT NOT NULL, quoted_ayahs TEXT NOT NULL, coverage_kind TEXT NOT NULL,
 text TEXT NOT NULL, html TEXT NOT NULL);
CREATE TABLE tafsir_ayah(entry_id TEXT NOT NULL REFERENCES tafsir_entry,
 ayah_id INTEGER NOT NULL REFERENCES ayah, PRIMARY KEY(entry_id,ayah_id));
CREATE INDEX tafsir_by_ayah ON tafsir_ayah(ayah_id,entry_id);
CREATE TABLE source_span(id INTEGER PRIMARY KEY, source_id TEXT NOT NULL REFERENCES source,
 record_type TEXT NOT NULL, record_id TEXT NOT NULL, pdf_page INTEGER NOT NULL,
 char_start INTEGER NOT NULL, char_end INTEGER NOT NULL);
CREATE INDEX span_by_record ON source_span(record_type,record_id);
CREATE TABLE cross_reference(id INTEGER PRIMARY KEY, record_type TEXT NOT NULL,
 record_id TEXT NOT NULL, char_start INTEGER NOT NULL, char_end INTEGER NOT NULL,
 raw TEXT NOT NULL, target_kind TEXT NOT NULL, target_surah INTEGER NOT NULL,
 first_ayah INTEGER, last_ayah INTEGER);
CREATE TABLE import_issue(id INTEGER PRIMARY KEY, severity TEXT NOT NULL,
 surah_id INTEGER, message TEXT NOT NULL);
CREATE VIRTUAL TABLE content_search USING fts5(kind UNINDEXED, record_id UNINDEXED,
 surah UNINDEXED, text, tokenize='unicode61 remove_diacritics 2');
