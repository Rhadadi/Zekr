"""Validate locally generated commentary and install it into optional app builds."""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
import math
import shutil
import sqlite3
import tempfile
from pathlib import Path

from study_quran import open_package, write_json


def load_audio(folders, package):
    """Tie every recording to the exact source text and ayah links, before copying."""
    assets = {}
    with closing(open_package(package)) as db:
        for folder in folders:
            folder = Path(folder).resolve()
            manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
            if not manifest.get("summary", {}).get("all_audio_complete"):
                raise ValueError(f"Incomplete commentary audio package: {folder.name}")
            for entry in manifest["entries"]:
                eid, audio = entry["id"], entry.get("audio")
                source = db.execute("SELECT surah_id,text FROM tafsir_entry WHERE id=?", (eid,)).fetchone()
                if not source or not audio or source["surah_id"] != manifest["surah"]:
                    raise ValueError(f"Unknown commentary audio entry: {eid}")
                text_hash = hashlib.sha256(source["text"].encode()).hexdigest()
                ayahs = [r[0] for r in db.execute("SELECT a.number FROM tafsir_ayah t JOIN ayah a ON a.id=t.ayah_id WHERE t.entry_id=? ORDER BY a.number", (eid,))]
                if audio.get("input_sha256") != text_hash or entry.get("text_sha256") != text_hash or entry["ayahs"] != ayahs:
                    raise ValueError(f"Commentary audio does not match the source: {eid}")
                file = (folder / audio["path"]).resolve()
                if not file.is_relative_to(folder) or file.suffix.lower() != ".mp3" or not file.is_file():
                    raise ValueError(f"Invalid commentary audio file: {eid}")
                digest = hashlib.sha256(file.read_bytes()).hexdigest()
                if audio.get("file_sha256") != digest:
                    raise ValueError(f"Commentary audio checksum mismatch: {eid}")
                duration = float(audio["duration_seconds"])
                if not math.isfinite(duration) or duration <= 0:
                    raise ValueError(f"Invalid commentary audio duration: {eid}")
                if eid in assets:
                    raise ValueError(f"Duplicate commentary audio entry: {eid}")
                assets[eid] = {"source": file, "surah": source["surah_id"], "file": digest + ".mp3",
                               "sha256": digest, "duration": duration, "voice": manifest["voice"]["name"],
                               "model": manifest["voice"]["model"]}
    return assets


def fingerprint(assets):
    public = {eid: {k: v for k, v in asset.items() if k != "source"} for eid, asset in sorted(assets.items())}
    return hashlib.sha256(json.dumps(public, sort_keys=True).encode()).hexdigest()


def stage_files(assets, folder):
    """Only this generated folder is replaced; raw API downloads stay untouched."""
    folder = Path(folder)
    folder.parent.mkdir(parents=True, exist_ok=True)
    if not assets:
        if folder.exists():
            shutil.rmtree(folder)
        return
    folder.mkdir(exist_ok=True)
    expected = {a["file"] for a in assets.values()}
    # Reuse identical files: replacing a whole iCloud-backed directory on every build
    # can produce conflict copies and needlessly re-upload all of its recordings.
    with tempfile.TemporaryDirectory(prefix=".study-audio-", dir=folder.parent) as temp:
        for asset in assets.values():
            target = folder / asset["file"]
            if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == asset["sha256"]:
                continue
            staged = Path(temp) / asset["file"]
            shutil.copyfile(asset["source"], staged)
            staged.replace(target)
    for stale in folder.iterdir():
        if stale.name not in expected:
            if stale.is_dir():
                shutil.rmtree(stale)
            else:
                stale.unlink()


def install(assets, ios_db, web_dir):
    """SQLite and JSON use the same entry IDs; filenames survive bundle flattening."""
    ios_db, web_dir = Path(ios_db), Path(web_dir)
    stage_files(assets, ios_db.parent / "StudyQuranAudio")
    stage_files(assets, web_dir / "commentary-audio")
    if not assets:
        return
    with closing(sqlite3.connect(ios_db)) as db, db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("""CREATE TABLE study_audio (
            entry_id TEXT PRIMARY KEY REFERENCES tafsir_entry(id), file TEXT NOT NULL,
            duration REAL NOT NULL, voice TEXT NOT NULL, model TEXT NOT NULL, sha256 TEXT NOT NULL)""")
        db.executemany("INSERT INTO study_audio VALUES(?,?,?,?,?,?)", [
            (eid, a["file"], a["duration"], a["voice"], a["model"], a["sha256"]) for eid, a in assets.items()])
        db.execute("INSERT OR REPLACE INTO meta VALUES('study_quran_audio','1')")
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Commentary audio links failed foreign-key validation")
    surahs = sorted({a["surah"] for a in assets.values()})
    for surah in surahs:
        path = web_dir / "tafsir" / "study_quran" / f"{surah}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for entry in data["entries"]:
            if asset := assets.get(entry["id"]):
                entry["audio"] = {k: asset[k] for k in ("file", "duration", "voice", "model", "sha256")}
        write_json(path, data)
    meta_path = web_dir / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sizes = {a["file"]: a["source"].stat().st_size for a in assets.values()}
    meta["studyQuran"]["audio"] = {"surahs": surahs, "entries": len(assets), "bytes": sum(sizes.values())}
    write_json(meta_path, meta)
