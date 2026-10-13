import html
import hashlib
import os
from pathlib import Path
import re
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from import_study_quran import range_end, references
from study_quran import load_translation


class ReferenceTests(unittest.TestCase):
    def test_abbreviated_range_and_commentary_targets(self):
        refs = list(references('See 2:122–23c, 125; vv. 11–12; introduction to Sūrah 114.',2,{2:286,114:6}))
        self.assertEqual([(r[3],r[4],r[5],r[6]) for r in refs],
                         [('commentary',2,122,123),('ayah',2,125,125),('ayah',2,11,12),('introduction',114,None,None)])
        self.assertEqual(range_end(275,'81'),281)
        self.assertEqual(range_end(99,'102'),102)

    def test_out_of_range_citations_are_not_links(self):
        self.assertEqual(list(references('999:10 and 114:7',1,{1:7,114:6})),[])

    def test_identified_biblical_citations_are_not_quran_links(self):
        refs=list(references('Genesis 6:6; 7:4. Compare 2:37c and Matthew 23:37.',2,{2:286,6:165,7:206,23:118}))
        self.assertEqual([(r[3],r[4],r[5]) for r in refs],[('commentary',2,37)])


@unittest.skipUnless(os.environ.get('STUDY_QURAN_DB'),'Private source package not supplied')
class PrivatePackageTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(os.environ['STUDY_QURAN_DB'])
        self.addCleanup(self.db.close)

    def test_book_translation_against_visually_reviewed_opening(self):
        # A digest verifies the reviewed wording without committing the book text.
        got=[r[0] for r in self.db.execute('SELECT text FROM translation_text WHERE ayah_id<=7 ORDER BY ayah_id')]
        self.assertEqual(len(got),7)
        self.assertEqual(hashlib.sha256('\n'.join(got).encode()).hexdigest(),
                         '17813faf9c58c1500b2fed11508bc65c915dd7244ef52e450eae5f588567663d')

    def test_shared_and_overlapping_notes(self):
        refs=self.db.execute("SELECT a.number FROM tafsir_ayah t JOIN ayah a ON a.id=t.ayah_id JOIN tafsir_entry e ON e.id=t.entry_id WHERE e.surah_id=2 AND e.note_label='11–12' ORDER BY a.number").fetchall()
        self.assertEqual(refs,[(11,),(12,)])
        labels={r[0] for r in self.db.execute("SELECT e.note_label FROM tafsir_entry e JOIN tafsir_ayah t ON t.entry_id=e.id JOIN ayah a ON a.id=t.ayah_id WHERE a.surah=2 AND a.number=275")}
        self.assertEqual(labels,{'275–81','275'})

    def test_full_verse_identity_and_html_preservation(self):
        self.assertEqual(self.db.execute('SELECT count(*) FROM translation_text').fetchone()[0],6236)
        self.assertEqual(self.db.execute('SELECT count(*) FROM surah').fetchone()[0],114)
        self.assertEqual(self.db.execute('SELECT count(*) FROM surah_opening').fetchone()[0],112)
        for table in ['translation_text','tafsir_entry','surah_introduction']:
            for plain, rich in self.db.execute(f'SELECT text,html FROM {table}'):
                rendered=html.unescape(re.sub(r'</?(?:p|i|b)>','',rich))
                normalize=lambda s:re.sub(r'\s+',' ',s).strip()
                # Paragraph tags separate adjacent paragraphs.
                rendered=html.unescape(re.sub(r'</?(?:p|i|b)>','',rich.replace('</p><p>','\n\n')))
                self.assertEqual(normalize(plain),normalize(rendered))

    def test_source_anomalies_preserved_without_guessed_labels(self):
        row=self.db.execute("SELECT note_label,coverage_kind,first_ayah FROM tafsir_entry WHERE surah_id=38 AND coverage_kind='quoted_header'").fetchone()
        self.assertEqual(row,('', 'quoted_header',5))
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_pilot_cannot_be_used_as_a_complete_app_package(self):
        pilot=Path(os.environ['STUDY_QURAN_DB']).parent.parent/'pilot'/'study_quran.sqlite'
        if not pilot.exists():
            self.skipTest('Pilot artifact not present')
        with self.assertRaisesRegex(ValueError,'pilot/incomplete'):
            load_translation(pilot,[])


if __name__=='__main__':
    unittest.main()
