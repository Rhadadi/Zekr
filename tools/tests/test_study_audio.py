"""Synthetic source text and media only; never quotes the book."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from study_audio import load_audio, install, fingerprint, stage_files
from study_fixture import build


class StudyAudioTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = build(self.root / 'source.sqlite')
        with closing(sqlite3.connect(self.source)) as db:
            self.eid, self.text = db.execute('SELECT id,text FROM tafsir_entry WHERE surah_id=12 ORDER BY source_order LIMIT 1').fetchone()
        self.folder = self.root / 'recording'
        self.folder.mkdir()
        self.media = self.folder / 'sample.mp3'
        self.media.write_bytes(b'ID3\x00synthetic-media-fixture')
        self.hash = hashlib.sha256(self.media.read_bytes()).hexdigest()
        text_hash = hashlib.sha256(self.text.encode()).hexdigest()
        self.manifest = {'surah': 12, 'summary': {'all_audio_complete': True},
                         'voice': {'name': 'Fixture narrator', 'model': 'fixture-model'},
                         'entries': [{'id': self.eid, 'ayahs': [1, 2, 3, 4, 5], 'text_sha256': text_hash,
                                      'audio': {'path': 'sample.mp3', 'input_sha256': text_hash,
                                                'file_sha256': self.hash, 'duration_seconds': 4}}]}
        self.write()

    def write(self):
        (self.folder / 'manifest.json').write_text(json.dumps(self.manifest))

    def test_installs_one_shared_asset_and_joins_it_to_both_ayahs(self):
        assets = load_audio([self.folder], self.source)
        dest = self.root / 'ios' / 'quran.sqlite'
        dest.parent.mkdir()
        with closing(sqlite3.connect(dest)) as db, db:
            db.executescript('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE tafsir_entry(id TEXT PRIMARY KEY);')
            db.execute('INSERT INTO tafsir_entry VALUES(?)', (self.eid,))
        web = self.root / 'web'
        path = web / 'tafsir' / 'study_quran' / '12.json'
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({'entries': [{'id': self.eid}], 'byAyah': {'1597': [self.eid], '1598': [self.eid]}}))
        (web / 'meta.json').write_text(json.dumps({'studyQuran': {'id': 'study_quran'}}))
        install(assets, dest, web)
        data = json.loads(path.read_text())
        self.assertEqual(data['byAyah']['1597'], data['byAyah']['1598'])
        self.assertEqual(data['entries'][0]['audio']['file'], self.hash + '.mp3')
        self.assertEqual(len(list((web / 'commentary-audio').glob('*.mp3'))), 1)
        self.assertTrue((dest.parent / 'StudyQuranAudio' / (self.hash + '.mp3')).exists())
        with closing(sqlite3.connect(dest)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM study_audio').fetchone()[0], 1)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertEqual(json.loads((web / 'meta.json').read_text())['studyQuran']['audio']['surahs'], [12])

    def test_rejects_changed_text_and_changed_ayah_links(self):
        entry = self.manifest['entries'][0]
        entry['audio']['input_sha256'] = 'bad'
        self.write()
        with self.assertRaisesRegex(ValueError, 'does not match'):
            load_audio([self.folder], self.source)
        entry['audio']['input_sha256'] = entry['text_sha256']
        entry['ayahs'] = [1]
        self.write()
        with self.assertRaisesRegex(ValueError, 'does not match'):
            load_audio([self.folder], self.source)

    def test_rejects_media_tampering_and_path_traversal(self):
        self.media.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            load_audio([self.folder], self.source)
        self.manifest['entries'][0]['audio']['path'] = '../outside.mp3'
        self.write()
        with self.assertRaisesRegex(ValueError, 'Invalid commentary audio file'):
            load_audio([self.folder], self.source)

    def test_rejects_duplicates_and_incomplete_generation(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            load_audio([self.folder, self.folder], self.source)
        self.manifest['summary']['all_audio_complete'] = False
        self.write()
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            load_audio([self.folder], self.source)

    def test_data_fingerprint_changes_with_recording_and_cleanup_is_scoped(self):
        assets = load_audio([self.folder], self.source)
        first = fingerprint(assets)
        assets[self.eid]['voice'] = 'Another fixture narrator'
        self.assertNotEqual(first, fingerprint(assets))
        media_dir = self.root / 'generated'
        stage_files(assets, media_dir)
        keep = self.root / 'keep.txt'
        keep.write_text('unrelated')
        stage_files({}, media_dir)
        self.assertFalse(media_dir.exists())
        self.assertEqual(keep.read_text(), 'unrelated')
