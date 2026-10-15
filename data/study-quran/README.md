# Study Quran database package

The owner requested this database upload to the public Zekr repository on October 15, 2026, so a cloud reviewer can access the actual package. This supersedes the earlier instruction to keep the database only on the Mac for this upload. It does not change the optional app build or deploy the book to the website.

`study_quran.sqlite.gz` contains the full SQLite database (42,315,776 bytes uncompressed; 9,849,372 bytes compressed). Decompress after cloning this branch:

```sh
gzip -dk data/study-quran/study_quran.sqlite.gz
python3 tools/build_data.py --study-quran data/study-quran/study_quran.sqlite
STUDY_QURAN_DB="$PWD/data/study-quran/study_quran.sqlite" python3 -m unittest discover -s tools/tests -v
```

SHA-256 of the decompressed `study_quran.sqlite`:

```text
2dcd62662336ea9686b05ff881658900e703c02c6a78c98676c7b0881901b9cd
```

Includes 114 surahs, 6,236 English verse translations, 114 introductions and 5,048 tafsir entries, with source locations, cross-references and shared ayah links. Read `docs/study-quran.md` and `docs/study-quran-review.md` for implementation notes and verification limits. The PDF is not included. This upload does not grant redistribution rights to the book.
