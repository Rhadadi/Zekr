#!/usr/bin/env python3
"""Import a locally supplied Study Quran PDF into a private, source-linked database.

The optional PDF reader is pypdfium2. The normal Zekr build does not require it.
Never download or publish the book from this script. See docs/study-quran.md.
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import html
import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

SOURCE = "study_quran"
TRANSLATION = "en.study_quran"
IMPORT_VERSION = "2"
EXTRACTION_VERSION = "4"
BASMALA = "In the Name of God, the Compassionate, the Merciful"
ROOT = Path(__file__).resolve().parent.parent


def range_end(first, last):
    """The book abbreviates range endings: 122–23 means 122–123."""
    n = int(last)
    if n < first:
        scale = 10**len(last)
        n += first//scale*scale
        if n < first:
            n += scale
    return n


SCHEMA = """
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
"""


@dataclass
class Line:
    page: int
    start: int
    end: int
    x: float
    y: float
    size: float
    runs: list[tuple[str, str]]
    markers: list[tuple[int, str]]
    note_start: bool = False

    @property
    def text(self):
        return "".join(s for s, _ in self.runs)

    def cut(self, start=0, end=None):
        end = len(self.text) if end is None else end
        pos, runs = 0, []
        for s, style in self.runs:
            a, b = max(start-pos, 0), min(end-pos, len(s))
            if a < b:
                runs.append((s[a:b], style))
            pos += len(s)
        return Line(self.page, self.start, self.end, self.x, self.y, self.size,
                    runs, [(p-start, g) for p, g in self.markers if start <= p < end], self.note_start and start == 0)


def page_lines(doc, number):
    """Use PDF font identity, glyph order, and baselines; retain exact source indices."""
    import pypdfium2 as pdfium
    page = doc[number-1]
    tp = page.get_textpage()
    buf, flags = ctypes.create_string_buffer(128), ctypes.c_int()
    x, y = ctypes.c_double(), ctypes.c_double()
    lines, current, pending_break = [], None, False
    previous_style, previous_right = "", 0.0
    try:
        for idx in range(tp.count_chars()):
            code = pdfium.raw.FPDFText_GetUnicode(tp.raw, idx)
            if code in (10, 13):
                pending_break = True
                continue
            if code == 0:
                continue
            c = "-" if pdfium.raw.FPDFText_IsHyphen(tp.raw, idx) == 1 else chr(code)
            if c.isspace():
                if current and current.text and not current.text.endswith(" "):
                    current.runs.append((" ", ""))
                continue
            pdfium.raw.FPDFText_GetCharOrigin(tp.raw, idx, ctypes.byref(x), ctypes.byref(y))
            pdfium.raw.FPDFText_GetFontInfo(tp.raw, idx, buf, len(buf), ctypes.byref(flags))
            font = buf.value.decode("utf-8", errors="strict")
            size = pdfium.raw.FPDFText_GetFontSize(tp.raw, idx)
            new_line = current is None or y.value < current.y-9 or y.value > current.y+35
            if new_line:
                if current:
                    lines.append(current)
                current = Line(number, idx, idx+1, x.value, y.value, size, [], [])
                if c.isdigit() and round(size) == 20:
                    rgba = [ctypes.c_uint() for _ in range(4)]
                    pdfium.raw.FPDFText_GetFillColor(tp.raw,idx,*[ctypes.byref(v) for v in rgba])
                    current.note_start = rgba[0].value > 150 and rgba[1].value < 50 and rgba[2].value < 50
            elif pending_break and current.text and not current.text.endswith(" ") and c not in ",.;:!?)]}’”":
                current.runs.append((" ", ""))
            pending_break = False
            if "MedallionNumbers" in font:
                current.markers.append((len(current.text), c))
            style = "i" if "Italic" in font or "HCSQ-It" in font else ("b" if "Bold" in font else "")
            # PDFium can omit a word space where ordinary text meets italic text.
            # Resolve it from the glyph geometry, not from a word dictionary.
            loose = tp.get_charbox(idx,loose=True)
            if (not new_line and current.text and
                current.text[-1] not in " -([‘“" and c.isalpha() and
                loose[0]-previous_right >= (1.0 if style != previous_style else 1.3)):
                current.runs.append((" ",""))
            if current.runs and current.runs[-1][1] == style:
                s, _ = current.runs[-1]
                current.runs[-1] = (s+c, style)
            else:
                current.runs.append((c, style))
            current.end = idx+1
            previous_style, previous_right = style, loose[2]
        if current:
            lines.append(current)
        # Footer is identified by BOTH its location and its page number.
        return [l for l in lines if not (l.y < 35 and l.text.strip() == str(number))]
    finally:
        tp.close()
        page.close()


def paragraphs(lines, intro=False):
    texts, markup, spans = [], [], []
    for l in lines:
        text = l.text.strip()
        if not text:
            continue
        rich = "".join(f"<{style}>{html.escape(s)}</{style}>" if style else html.escape(s)
                       for s, style in l.runs).strip()
        indent = l.x > (115 if intro else 65)
        if texts and indent:
            sep = "\n\n"
        elif texts and texts[-1].endswith("-"):
            sep = ""
        else:
            sep = " " if texts else ""
        texts.append(sep+text)
        markup.append(("</p><p>" if sep == "\n\n" else sep)+rich)
        spans.append((l.page, l.start, l.end))
    return "".join(texts), "<p>"+"".join(markup)+"</p>", spans


def references(text, surah, counts):
    """Resolve explicit Quran references and local v./vv. references; preserve offsets."""
    pat = re.compile(r"\b(?:(\d{1,3}):|v{1,2}\.\s*)(\d{1,3})(?:[–-](\d{1,3}))?(c)?")
    bible = re.compile(r"\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of (?:Solomon|Songs)|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)(?:[\d\s:;,–-]|and)*$",re.I)
    for m in pat.finditer(text):
        if m[1] and bible.search(text[max(0,m.start()-160):m.start()]):
            # Identified Biblical passages use the same chapter:verse notation.
            continue
        s, a = int(m[1] or surah), int(m[2])
        b = range_end(a,m[3]) if m[3] else a
        if s in counts and 1 <= a <= b <= counts[s]:
            yield (m.start(), m.end(), m[0], "commentary" if m[4] else "ayah", s, a, b)
            # The same surah is implied in e.g. 2:168, 208, 215–216c.
            offset = m.end()
            while tail := re.match(r",\s*(\d{1,3})(?:[–-](\d{1,3}))?(c)?", text[offset:]):
                a = int(tail[1])
                b = range_end(a,tail[2]) if tail[2] else a
                if not 1 <= a <= b <= counts[s]:
                    break
                yield (offset, offset+tail.end(), tail[0], "commentary" if tail[3] else "ayah", s, a, b)
                offset += tail.end()
    for m in re.finditer(r"\bintroduction to S[ūu]rah\s+(\d{1,3})", text):
        if int(m[1]) in counts:
            yield (m.start(), m.end(), m[0], "introduction", int(m[1]), None, None)


def metadata(path):
    if not path.exists():
        import urllib.request
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen("https://tanzil.net/res/text/metadata/quran-data.xml", timeout=60) as r:
            path.write_bytes(r.read())
    data = ET.fromstring(path.read_bytes())
    return {int(e.attrib["index"]): {"count": int(e.attrib["ayas"]),
            "first": int(e.attrib["start"])+1} for e in data.find("suras")}


def boundaries(doc):
    found = {}
    for idx in range(54, len(doc)):
        page = doc[idx]
        tp = page.get_textpage()
        try:
            text = tp.get_text_range()
            m = re.match(r"^(\d{1,3})\r?\n", text)
            if m and int(m[1]) == len(found)+1 and pdf_size(tp, 0) == 33:
                found[int(m[1])] = idx+1
            if len(found) == 114 and text.startswith("ESSAYS"):
                return found, idx+1
        finally:
            tp.close()
            page.close()
    raise ValueError(f"Could not locate complete core section: found {len(found)} surahs")


def pdf_size(tp, idx):
    import pypdfium2 as p
    return round(p.raw.FPDFText_GetFontSize(tp.raw, idx))


def parse_surah(lines, number, count, glyph_map):
    # Chapter number and its two title lines precede the intro's smaller text.
    assert lines[0].text.strip() == str(number), (number, lines[0].text)
    header_end = next(i for i, l in enumerate(lines[1:], 1) if l.x < 150)
    titles = [l.text.strip() for l in lines[1:header_end]]
    if len(titles) < 2:
        raise ValueError(f"Surah {number}: missing titles")
    intro, verses, commentary, opening = [], [], [], None
    phase, current, started = "intro", [], False
    for l in lines[header_end:]:
        if l.text.strip() == "Commentary":
            if phase != "translation":
                raise ValueError(f"Surah {number}: unexpected commentary boundary")
            if current:
                verses.append(current)
                current = []
            phase = "commentary"
            continue
        if phase == "commentary":
            commentary.append(l)
            continue
        if l.markers:
            if phase == "intro":
                phase = "translation"
                if intro and intro[-1].text.strip().rstrip(".") == BASMALA:
                    opening = intro.pop()
            start = 0
            for pos, glyph in l.markers:
                if pos > start:
                    fragment = l.cut(start, pos)
                    if started:
                        current.append(fragment)
                    elif fragment.text.strip():
                        raise ValueError(f"Surah {number}: text before first numbered ayah at page {l.page}: {fragment.text!r}; phase {phase}; markers {l.markers}")
                if current:
                    verses.append(current)
                expected = len(verses)+1
                if glyph in glyph_map and glyph_map[glyph] != expected:
                    raise ValueError(f"Surah {number}: inconsistent glyph {glyph!r}: expected {expected}, known {glyph_map[glyph]}")
                glyph_map[glyph] = expected
                current, start = [], pos+1
                started = True
            if start < len(l.text):
                current.append(l.cut(start))
        elif phase == "intro":
            intro.append(l)
        elif phase == "translation":
            current.append(l)
    if phase != "commentary" or len(verses) != count:
        raise ValueError(f"Surah {number}: found {len(verses)} verses, expected {count}, phase {phase}")

    entries, group, issues = [], [], []
    def finish():
        if not group:
            return
        body_start = next((i for i, l in enumerate(group) if l.note_start), None)
        coverage_kind = "explicit_note"
        if body_start is None:
            body_start = next((i for i,l in enumerate(group) if round(l.size)==20),None)
            if body_start is None:
                raise ValueError(f"Surah {number}: verse header without commentary on page {group[0].page}")
            coverage_kind = "quoted_header"
        lemma, body = group[:body_start], group[body_start:]
        markers = [glyph_map[g] for l in lemma for _, g in l.markers]
        m = re.match(r"^\s*(\d+)(?:[–-](\d+))?\s*", body[0].text) if coverage_kind=="explicit_note" else None
        if m:
            first = int(m[1])
            last = range_end(first,m[2]) if m[2] else first
            label = m[0].strip()
        else:
            if not markers:
                raise ValueError(f"Surah {number}: unlabelled commentary has no quoted header on page {group[0].page}")
            first,last,label=min(markers),max(markers),""
            issues.append(f"Unnumbered commentary under quoted ayahs {markers} (PDF page {group[0].page}); association is marked quoted_header, not an explicit numbered note.")
        if markers and any(not first <= a <= last for a in markers):
            issues.append(f"Source header quotes {markers}, but red note label is {label} (PDF page {group[0].page}); ayah links follow the explicit note label.")
        if not 1 <= first <= last <= count:
            raise ValueError(f"Surah {number}: note out of bounds {label}")
        # Keep the displayed verse header separate from the commentary body.
        lemma_text = []
        for l in lemma:
            text = l.text
            for pos, g in reversed(l.markers):
                text = text[:pos]+str(glyph_map[g])+text[pos+1:]
            lemma_text.append(text.strip())
        if m:
            body[0] = body[0].cut(m.end())
        entries.append({"first": first, "last": last, "label": label,
                        "lemma": " ".join(lemma_text), "quoted_ayahs":markers,"coverage_kind":coverage_kind,"body": paragraphs(body),
                        "spans": [(l.page,l.start,l.end) for l in group]})
    for l in commentary:
        if l.text.strip() == "***":
            finish()
            group = []
        else:
            if l.note_start and any(x.note_start for x in group):
                # General passage notes and individual verse notes may share one header.
                finish()
                group = []
            group.append(l)
    finish()
    covered = {a for e in entries for a in range(e["first"], e["last"]+1)}
    if covered != set(range(1, count+1)):
        issues.append(f"No separately numbered commentary entry for ayahs {sorted(set(range(1,count+1))-covered)}; no commentary was invented.")
    return {"name_en": " ".join(titles[:-1]), "name_tr": titles[-1],
            "intro": paragraphs(intro, intro=True), "opening": opening,
            "verses": [paragraphs(v) for v in verses], "entries": entries,"issues":issues}


def write_database(path, parsed, meta, starts, end, source_path, pdf_hash, complete):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".building.sqlite")
    temp.unlink(missing_ok=True)
    db = sqlite3.connect(temp)
    db.executescript(SCHEMA)
    db.execute("INSERT INTO source VALUES(?,?,?,?,?,?,?,?)", (SOURCE,"The Study Quran","en",pdf_hash,
               source_path.name,IMPORT_VERSION,"Egyptian (Zekr/Tanzil)",int(complete)))
    db.execute("INSERT INTO translation VALUES(?,?,?,?,?)", (TRANSLATION,SOURCE,"en","The Study Quran",
               "Seyyed Hossein Nasr (editor-in-chief) and editorial team"))
    counts = {s:i["count"] for s,i in meta.items()}
    def content(kind, rid, surah, data, spans=None):
        text, rich, source_spans = data
        if not text.strip():
            raise ValueError(f"Empty {kind} {rid}")
        if any(ord(c)<32 and c not in "\n\t" for c in text) or "\ufffe" in text or "\ufffd" in text:
            raise ValueError(f"Unresolved character in {kind} {rid}")
        db.executemany("INSERT INTO source_span(source_id,record_type,record_id,pdf_page,char_start,char_end) VALUES(?,?,?,?,?,?)",
                       [(SOURCE,kind,rid,p,a,b) for p,a,b in (spans or source_spans)])
        db.executemany("INSERT INTO cross_reference(record_type,record_id,char_start,char_end,raw,target_kind,target_surah,first_ayah,last_ayah) VALUES(?,?,?,?,?,?,?,?,?)",
                       [(kind,rid,*r) for r in references(text,surah,counts)])
        db.execute("INSERT INTO content_search VALUES(?,?,?,?)",(kind,rid,surah,text))
        return text, rich
    for s, info in parsed.items():
        last_page = starts.get(s+1,end)-1
        db.execute("INSERT INTO surah VALUES(?,?,?,?,?,?,?)", (s,meta[s]["count"],meta[s]["first"],
                   info["name_en"],info["name_tr"],starts[s],last_page))
        db.executemany("INSERT INTO import_issue(severity,surah_id,message) VALUES('source_note',?,?)",[(s,m) for m in info["issues"]])
        intro_text, intro_html = content("introduction",str(s),s,info["intro"])
        db.execute("INSERT INTO surah_introduction VALUES(?,?,?,?)",(SOURCE,s,intro_text,intro_html))
        if opening := info["opening"]:
            db.execute("INSERT INTO surah_opening VALUES(?,?,?)",(SOURCE,s,opening.text.strip()))
            content("opening",str(s),s,paragraphs([opening]))
        for n, data in enumerate(info["verses"],1):
            aid = meta[s]["first"]+n-1
            db.execute("INSERT INTO ayah VALUES(?,?,?)",(aid,s,n))
            text,rich = content("translation",str(aid),s,data)
            db.execute("INSERT INTO translation_text VALUES(?,?,?,?)",(TRANSLATION,aid,text,rich))
        for order, e in enumerate(info["entries"],1):
            rid = f"{SOURCE}:{s}:{e['label']}:{order}"
            text,rich = content("tafsir",rid,s,e["body"],spans=e["spans"])
            db.execute("INSERT INTO tafsir_entry VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(rid,SOURCE,s,e["label"],
                       e["first"],e["last"],order,e["lemma"],json.dumps(e["quoted_ayahs"]),e["coverage_kind"],text,rich))
            db.executemany("INSERT INTO tafsir_ayah VALUES(?,?)",[(rid,meta[s]["first"]+n-1)
                           for n in range(e["first"],e["last"]+1)])
    db.commit()
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.close()
    temp.replace(path)


def run(args):
    import pypdfium2 as p
    meta = metadata(args.metadata)
    if len(meta)!=114 or sum(x["count"] for x in meta.values())!=6236:
        raise ValueError("Unexpected Zekr numbering metadata")
    source_hash = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    doc = p.PdfDocument(args.pdf)
    starts, end = boundaries(doc)
    selected = [int(n) for n in args.surahs.split(",")] if args.surahs else list(meta)
    parsed, glyph_map = {}, {}
    args.output.mkdir(parents=True,exist_ok=True)
    cached = {}
    audit_path = args.output/"page-lines.jsonl"
    if args.reuse_extraction and audit_path.exists():
        for raw in audit_path.read_text(encoding="utf-8").splitlines():
            item = json.loads(raw)
            if item.get("source_sha256") == source_hash and item.get("extraction_version") == EXTRACTION_VERSION:
                cached[item["page"]] = [Line(**l) for l in item["lines"]]
    with (args.output/"page-lines.jsonl").open("w",encoding="utf-8") as audit:
        for s in selected:
            all_lines = []
            for page in range(starts[s],starts.get(s+1,end)):
                lines = cached.get(page) or page_lines(doc,page)
                audit.write(json.dumps({"page":page,"source_sha256":source_hash,"extraction_version":EXTRACTION_VERSION,"lines":[l.__dict__ for l in lines]},ensure_ascii=False)+"\n")
                all_lines.extend(lines)
            parsed[s] = parse_surah(all_lines,s,meta[s]["count"],glyph_map)
            print(f"Surah {s}: {len(parsed[s]['verses'])} ayahs, {len(parsed[s]['entries'])} commentary entries",flush=True)
    doc.close()
    complete = set(selected)==set(meta)
    write_database(args.output/"study_quran.sqlite",parsed,meta,starts,end,args.pdf,source_hash,complete)
    (args.output/"schema.sql").write_text(SCHEMA,encoding="utf-8")
    report = {"status":"structurally_validated", "complete":complete,"pdf_sha256":source_hash,
              "surahs":len(parsed),"ayahs":sum(len(x["verses"]) for x in parsed.values()),
              "tafsir_entries":sum(len(x["entries"]) for x in parsed.values()),
              "source_notes":[{"surah":s,"message":m} for s,x in parsed.items() for m in x["issues"]],
              "glyph_map":{str(v):k for k,v in sorted(glyph_map.items(),key=lambda kv:kv[1])},
              "checks":["surah boundaries","verse counts","consistent marker decoding",
                        "red commentary labels decoded; source header discrepancies reported","commentary coverage audited without inventing notes",
                        "no unresolved control/replacement characters","SQLite integrity and foreign keys"],
              "text_review":"Layout-normalized PDF text; structural checks do not certify every word. Visual review is recorded separately."}
    (args.output/"validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k not in ("glyph_map","checks")},ensure_ascii=False),flush=True)


if __name__ == "__main__":
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pdf",type=Path,required=True)
    ap.add_argument("--output",type=Path,required=True)
    ap.add_argument("--metadata",type=Path,default=ROOT/"data/raw/quran-data.xml")
    ap.add_argument("--surahs",help="Pilot only, e.g. 1,2,114. Complete imports omit this option.")
    ap.add_argument("--reuse-extraction",action="store_true",help="Reuse an existing page-lines audit cache.")
    run(ap.parse_args())
