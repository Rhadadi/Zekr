# Quranic Arabic Corpus 0.4

The gzip contains the original, unchanged morphology file by Kais Dukes (2011), including its GNU GPL and Tanzil notices. The project is [Quranic Arabic Corpus](https://corpus.quran.com/).

The download came from the [Classical Language Toolkit mirror](https://github.com/cltk/arabic_morphology_quranic-corpus/blob/5b6ba1eab0e23673a6293812b105e0399011ec9a/quranic-corpus-morphology-0.4.txt), pinned to commit `5b6ba1eab0e23673a6293812b105e0399011ec9a`. The SHA-256 of the uncompressed bytes is `a1d12923815341face765083805d2148ed2d9f5cc3f7d6665219d887675d8c46`.

`tools/morphology.py` checks that checksum and all ayah locations before building the search index. It indexes the annotated roots and word forms, including forms without annotated prefixes. The displayed Quran text still comes from the existing Tanzil files. The web build publishes the original notices and credits the corpus in About.
