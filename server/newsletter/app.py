#!/usr/bin/env python3
"""Ayesheno's ayah by email: the app's ayah of the day, daily or weekly, as printed in the mushaf (a picture of its
lines), with its translation and its recitation attached.

    python3 app.py serve                      the sign-up endpoints and the sending loop (what the container runs)
    python3 app.py preview 2:255 [fa|en]      write one issue to preview.html, its pictures inline

Everything the email shows comes from the public site (DATA_URL), so it is the same data and the same rotation as the
app (shared/rotation-spec.md): a subscriber gets the ayah the app shows that day in their time zone. Sign-up is double
opt-in, by the form in the app's menu or by an email to the newsletter's address (duckdns.org is blocked in Iran; Gmail
is not), and every issue can be left by a link, by Gmail's own unsubscribe button or by replying "unsubscribe".

Settings come from the environment: SMTP_USER and SMTP_PASS (a Gmail address and an app password) are required to send;
IMAP reads the replies with the same account. Without them the service starts but does not accept sign-ups.
LIST_ADDRESS (say name+ayah@gmail.com) is where replies and sign-ups go; with it, a personal inbox can send the
newsletter, since only mail to that address and bounces are read.
"""
import email
import email.policy
import email.utils
import html
import imaplib
import io
import json
import os
import re
import secrets
import smtplib
import sqlite3
import sys
import threading
import time
import traceback
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from PIL import Image, ImageDraw

ENV = os.environ.get
DATA_URL = ENV("DATA_URL", "https://rhadadi.github.io/Zekr/data/")
SITE_URL = ENV("SITE_URL", "https://rhadadi.github.io/Zekr/")
PUBLIC_URL = ENV("PUBLIC_URL", "https://ayesheno.duckdns.org/newsletter").rstrip("/")
STATE = Path(ENV("STATE_DIR", "/data"))
SMTP_HOST, SMTP_PORT = ENV("SMTP_HOST", "smtp.gmail.com"), int(ENV("SMTP_PORT", "465"))
IMAP_HOST = ENV("IMAP_HOST", "imap.gmail.com")
SMTP_USER, SMTP_PASS = ENV("SMTP_USER", ""), ENV("SMTP_PASS", "")
LIST_ADDRESS = ENV("LIST_ADDRESS", "")
SEND_HOUR = int(ENV("SEND_HOUR", "6"))  # local time of the subscriber
FRIDAY = 4
HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------------------------------------------
# the rotation (shared/rotation-spec.md; tools/gen_rotation_vectors.py is the reference)

M32 = 0xFFFFFFFF


def mulberry32(seed):
    state = seed & M32

    def nxt():
        nonlocal state
        state = (state + 0x6D2B79F5) & M32
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & M32
        t = t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & M32)) & M32)
        return (t ^ (t >> 14)) & M32

    return nxt


def ayah_for_slot(pool, slot, salt=0):
    n = len(pool)
    rng = mulberry32(((slot // n) ^ salt) & M32)
    order = list(range(n))
    for i in range(n - 1, 0, -1):
        j = (rng() * (i + 1)) >> 32
        order[i], order[j] = order[j], order[i]
    return pool[order[slot % n]]


def slot_for(t, offset, period=86400):
    return (t + offset) // period


# ---------------------------------------------------------------------------------------------------------------
# words

FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
FA_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]
FA_DAYS = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"]


def fa_num(n) -> str:
    return str(n).translate(FA_DIGITS)


def jalali(gy, gm, gd):
    """Gregorian date to the Persian (solar hijri) calendar."""
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + g_d_m[gm - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        return jy, 1 + days // 31, 1 + days % 31
    return jy, 7 + (days - 186) // 30, 1 + (days - 186) % 30


def date_line(d: datetime, lang: str) -> str:
    if lang == "fa":
        y, m, day = jalali(d.year, d.month, d.day)
        return f"{FA_DAYS[d.weekday()]} {fa_num(day)} {FA_MONTHS[m - 1]} {fa_num(y)}"
    return f"{d:%A}, {d.day} {d:%B %Y}"


T = {
    "fa": {
        "daily": "آیهٔ روز", "weekly": "آیهٔ هفته", "surah": "سورهٔ", "ayah": "آیهٔ",
        "read": "خواندن در آیه شنو", "study": "تفسیر و شرح", "listen": "شنیدن تلاوت",
        "attached": "تلاوت {reciter} پیوست این ایمیل است.", "attached2": "تلاوت {reciter} و ترجمهٔ گویا پیوست این ایمیل است.",
        "ghazali": "از گزیدهٔ امام محمد غزالی در «جواهر القرآن»",
        "footer_daily": "شما آیهٔ روز را هر بامداد دریافت می‌کنید.", "footer_weekly": "شما آیهٔ هفته را هر جمعه دریافت می‌کنید.",
        "to_weekly": "هفته‌ای یک بار", "to_daily": "هر روز", "unsub": "لغو اشتراک",
        "reply": "یا به همین ایمیل پاسخ دهید: «هفتگی»، «روزانه» یا «لغو».",
        "welcome": "خوش آمدید. این آیهٔ امروز است؛ از این پس {when} آیه‌ای تازه می‌رسد.",
        "when_daily": "هر بامداد", "when_weekly": "هر جمعه",
        "confirm_subject": "تأیید اشتراک آیه شنو", "confirm_title": "یک گام مانده است",
        "confirm_body": "برای دریافت {what} با ایمیل، اشتراک خود را تأیید کنید.", "confirm_button": "تأیید اشتراک",
        "confirm_reply": "اگر پیوند باز نمی‌شود، کافی است به همین ایمیل پاسخ دهید.",
        "confirm_ignore": "اگر شما درخواست نداده‌اید، این ایمیل را نادیده بگیرید.",
        "done_confirmed": "اشتراک شما فعال شد. آیهٔ امروز در راه است.", "done_unsub": "اشتراک شما لغو شد. خدا نگهدار.",
        "done_switched": "از این پس {what} را دریافت می‌کنید.", "bad_link": "این پیوند معتبر نیست یا پیش‌تر به کار رفته است.",
        "ask_confirm": "تأیید اشتراک", "ask_unsub": "لغو اشتراک", "ask_switch": "تغییر به {what}",
        "translation": "ترجمهٔ {name}",
    },
    "en": {
        "daily": "Ayah of the day", "weekly": "Ayah of the week", "surah": "Surah", "ayah": "Ayah",
        "read": "Read in Ayesheno", "study": "Commentary", "listen": "Listen",
        "attached": "The recitation by {reciter} is attached.", "attached2": "The recitation by {reciter} and the recorded translation are attached.",
        "ghazali": "From Imam al-Ghazali's selection in Jawahir al-Qur'an",
        "footer_daily": "You receive the ayah of the day each morning.", "footer_weekly": "You receive the ayah of the week each Friday.",
        "to_weekly": "Weekly instead", "to_daily": "Daily instead", "unsub": "Unsubscribe",
        "reply": "Or reply to this email with “weekly”, “daily” or “unsubscribe”.",
        "welcome": "Welcome. This is today's ayah; a new one will come {when}.",
        "when_daily": "each morning", "when_weekly": "each Friday",
        "confirm_subject": "Confirm your Ayesheno subscription", "confirm_title": "One step left",
        "confirm_body": "Confirm your subscription to receive the {what} by email.", "confirm_button": "Confirm",
        "confirm_reply": "If the link does not open, just reply to this email.",
        "confirm_ignore": "If you did not ask for this, ignore this email.",
        "done_confirmed": "You are subscribed. Today's ayah is on its way.", "done_unsub": "You are unsubscribed. Peace be with you.",
        "done_switched": "From now on you receive the {what}.", "bad_link": "This link is not valid, or was already used.",
        "ask_confirm": "Confirm subscription", "ask_unsub": "Unsubscribe", "ask_switch": "Switch to the {what}",
        "translation": "Translation: {name}",
    },
}

# web/src/reciters.ts (test_app checks they agree)
RECITERS = {
    "minshawi-murattal": ("Minshawy_Murattal_128kbps", "منشاوی", "Al-Minshawi"),
    "minshawi-mujawwad": ("Minshawy_Mujawwad_192kbps", "منشاوی", "Al-Minshawi"),
    "husary": ("Husary_128kbps", "حصری", "Al-Husary"),
    "husary-mujawwad": ("Husary_128kbps_Mujawwad", "حصری", "Al-Husary"),
    "husary-muallim": ("Husary_Muallim_128kbps", "حصری", "Al-Husary"),
    "abdulbasit-murattal": ("Abdul_Basit_Murattal_192kbps", "عبدالباسط", "Abdul Basit"),
    "abdulbasit-mujawwad": ("Abdul_Basit_Mujawwad_128kbps", "عبدالباسط", "Abdul Basit"),
    "tablawi": ("Mohammad_al_Tablaway_128kbps", "محمد الطبلاوی", "Mohammad al-Tablawi"),
    "parhizgar": ("Parhizgar_48kbps", "پرهیزگار", "Parhizgar"),
    "mansoori": ("Karim_Mansoori_40kbps", "کریم منصوری", "Karim Mansoori"),
    "alafasy": ("Alafasy_128kbps", "مشاری العفاسی", "Mishary Alafasy"),
    "sudais": ("Abdurrahmaan_As-Sudais_192kbps", "السدیس", "Abdurrahman As-Sudais"),
    "shuraym": ("Saood_ash-Shuraym_128kbps", "الشریم", "Saud Ash-Shuraym"),
    "maher": ("MaherAlMuaiqly128kbps", "ماهر المعیقلی", "Maher Al-Muaiqly"),
    "ghamadi": ("Ghamadi_40kbps", "سعد الغامدی", "Saad Al-Ghamdi"),
    "hudhaify": ("Hudhaify_128kbps", "الحذیفی", "Ali Al-Hudhaify"),
    "basfar": ("Abdullah_Basfar_192kbps", "عبدالله بصفر", "Abdullah Basfar"),
    "ajamy": ("ahmed_ibn_ali_al_ajamy_128kbps", "احمد العجمی", "Ahmed Al-Ajamy"),
    "rifai": ("Hani_Rifai_192kbps", "هانی الرفاعی", "Hani Ar-Rifai"),
    "budair": ("Salah_Al_Budair_128kbps", "صلاح البدیر", "Salah Al-Budair"),
    "shaatree": ("Abu_Bakr_Ash-Shaatree_128kbps", "ابوبکر الشاطری", "Abu Bakr Ash-Shaatree"),
    "ayyoub": ("Muhammad_Ayyoub_128kbps", "محمد ایوب", "Muhammad Ayyoub"),
    "jibreel": ("Muhammad_Jibreel_128kbps", "محمد جبریل", "Muhammad Jibreel"),
    "sowaid": ("Ayman_Sowaid_64kbps", "ایمن سویّد", "Ayman Sowaid"),
}
DEFAULT_RECITER = "minshawi-murattal"
SPOKEN = {
    "fa.fooladvand": "translations/Fooladvand_Hedayatfar_40Kbps",
    "fa.makarem": "translations/Makarem_Kabiri_16Kbps",
    "en.sahih": "English/Sahih_Intnl_Ibrahim_Walk_192kbps",
}


def audio_url(folder, surah, ayah):
    return f"https://everyayah.com/data/{folder}/{surah:03}{ayah:03}.mp3"


# ---------------------------------------------------------------------------------------------------------------
# the public data, cached by version


def http_get(url: str, timeout=60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Ayesheno newsletter"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except OSError:
            if attempt == 2:
                raise
            time.sleep(3 + 5 * attempt)
    raise AssertionError


class Library:
    """The site's data files, fetched once per data version and kept on disk."""

    def __init__(self, cache: Path, get=http_get):
        self.cache, self.get = cache, get
        self.lock = threading.Lock()
        self.meta: dict | None = None
        self.checked = 0.0
        self.mem: dict[str, object] = {}

    def refresh(self, every=6 * 3600):
        with self.lock:
            if self.meta and time.time() - self.checked < every:
                return
            meta = json.loads(self.get(DATA_URL + "meta.json"))
            if not self.meta or meta.get("version") != self.meta.get("version"):
                self.mem.clear()
            self.meta, self.checked = meta, time.time()

    def file(self, path: str, v: str) -> bytes:
        local = self.cache / v / path
        if not local.exists():
            data = self.get(f"{DATA_URL}{path}?v={v}")
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(data)
        return local.read_bytes()

    def json(self, path: str, v: str | None = None):
        self.refresh()
        v = v or self.meta["version"]
        key = f"{v}/{path}"
        if key not in self.mem:
            self.mem[key] = json.loads(self.file(path, v))
        return self.mem[key]

    def pool(self) -> list[int]:
        return self.json("pools.json")["pools"]["all"]

    def arabic(self, id_: int) -> str:
        return self.json("text/uthmani.json")[id_ - 1]

    def translation(self, tr: str, id_: int) -> str:
        return self.json(f"tr/{tr}.json")[id_ - 1]

    def translations(self) -> dict[str, dict]:
        self.refresh()
        return {t["id"]: t for t in self.meta["translations"]}

    def locate(self, id_: int) -> tuple[dict, int]:
        self.refresh()
        s = max((s for s in self.meta["surahs"] if s["first"] <= id_), key=lambda s: s["first"])
        return s, id_ - s["first"] + 1

    def printed(self, id_: int) -> list[tuple[Image.Image, list]] | None:
        """The pages the ayah is on, each with the ayah's line rectangles (thousandths of the picture)."""
        self.refresh()
        mushaf = self.meta.get("mushaf")
        if not mushaf:
            return None
        v = str(mushaf.get("v", ""))
        out = []
        for pg in self.json("mushaf/map.json", v)["pages"]:
            k = id_ - pg["first"]
            if 0 <= k < len(pg["a"]) and pg["a"][k]:
                im = Image.open(io.BytesIO(self.file(f"mushaf/{pg['n']:03}.webp", v))).convert("RGB")
                out.append((im, pg["a"][k]))
        return out or None


# ---------------------------------------------------------------------------------------------------------------
# pictures

GOLD = (176, 138, 66)
BRAND = (30, 80, 68)
CARD = (255, 253, 247)  # the email's card, #fffdf7


def paper_of(lines: list[Image.Image]) -> tuple[int, int, int]:
    """The colour of the paper: the lighter half of the lines' pixels, averaged."""
    px = []
    for im in lines:
        b = im.reduce(3).tobytes()
        px.extend(zip(b[0::3], b[1::3], b[2::3]))
    px.sort(key=sum)
    light = px[len(px) // 2:] or [(250, 246, 236)]
    return tuple(sum(p[i] for p in light) // len(light) for i in range(3))


def clean_line(im: Image.Image, paper) -> Image.Image:
    """Only this line's ink. The page's ruled frame (or the edge of a neighbouring medallion) can fall inside a line's
    rectangle: a column near either end that is dark almost all the way down is a rule, not a letter. And the tips of
    the letters of the lines above and below reach in: ink touching the top or bottom edge that stays near it."""
    g = im.convert("L")
    w, h = g.size
    px = g.load()
    out = im.copy()
    d = ImageDraw.Draw(out)
    edge = max(3, w * 6 // 100)
    for x in [*range(edge), *range(w - edge, w)]:
        if sum(1 for y in range(h) if px[x, y] < 150) > 0.8 * h:
            d.rectangle((x - 2, 0, x + 2, h), fill=paper)
    band = max(2, h * 15 // 100)
    seen = set()
    for y0 in (0, h - 1):
        for x0 in range(w):
            if (x0, y0) in seen or px[x0, y0] >= 170:
                continue
            blob, todo = [], [(x0, y0)]
            seen.add((x0, y0))
            while todo:
                x, y = todo.pop()
                blob.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny] < 170:
                        seen.add((nx, ny))
                        todo.append((nx, ny))
            ys = [y for _, y in blob]
            if (max(ys) < band) if y0 == 0 else (min(ys) >= h - band):
                for x, y in blob:
                    d.point((x, y), fill=paper)
    return out


def ayah_picture(printed: list[tuple[Image.Image, list]], scale=2) -> bytes:
    """The ayah's lines cut from the printed pages and set one under another, each from the right margin as printed
    (one short line is centred), on the page's own paper in a thin gold frame."""
    lines = []
    for im, rects in printed:
        W, H = im.size
        for x, y, w, h in sorted(rects, key=lambda r: (r[1], -r[0])):
            box = (round(x * W / 1000), round(y * H / 1000), round((x + w) * W / 1000), round((y + h) * H / 1000))
            lines.append(im.crop(box))
    paper = paper_of(lines)
    lines = [clean_line(im, paper) for im in lines]
    lines = [im.resize((im.width * scale, im.height * scale), Image.LANCZOS) for im in lines]
    pad, gap = 40 * scale, 2 * scale
    cw = max(im.width for im in lines)
    width, height = cw + 2 * pad, sum(im.height for im in lines) + gap * (len(lines) - 1) + 2 * pad
    out = Image.new("RGB", (width, height), CARD)
    d = ImageDraw.Draw(out)
    o, i = 12 * scale, 18 * scale
    d.rounded_rectangle((o, o, width - 1 - o, height - 1 - o), radius=10 * scale, fill=paper)
    y = pad
    for im in lines:
        x = (width - im.width) // 2 if len(lines) == 1 else width - pad - im.width
        out.paste(im, (x, y))
        y += im.height + gap
    d.rounded_rectangle((o, o, width - 1 - o, height - 1 - o), radius=10 * scale, outline=GOLD, width=max(2, scale + 1))
    d.rounded_rectangle((i, i, width - 1 - i, height - 1 - i), radius=6 * scale, outline=GOLD + (0,), width=1)
    for cy in (o, height - 1 - o):  # a small lozenge at the middle of the top and bottom rules
        cx, r = width // 2, 6 * scale
        d.polygon([(cx - r * 2, cy), (cx, cy - r), (cx + r * 2, cy), (cx, cy + r)], fill=paper, outline=GOLD, width=max(2, scale))
        d.polygon([(cx - r, cy), (cx, cy - r // 2), (cx + r, cy), (cx, cy + r // 2)], fill=GOLD)
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def logo_picture() -> bytes:
    """The wordmark in the app's colours, from the masks the app uses."""
    art = HERE / "logo"
    word, waves = (Image.open(art / f).convert("LA").getchannel("A") for f in ("ayesheno-logo.png", "ayesheno-waves.png"))
    out = Image.new("RGBA", word.size, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", word.size, BRAND + (255,)), mask=word)
    out.paste(Image.new("RGBA", word.size, GOLD + (255,)), mask=waves)
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()


# ---------------------------------------------------------------------------------------------------------------
# the email


@dataclass
class Issue:
    subject: str
    html: str  # with @@unsub@@, @@switch@@ and @@switch_label@@ left for each subscriber
    text: str
    images: dict[str, bytes] = field(default_factory=dict)  # cid -> png
    files: list[tuple[str, bytes]] = field(default_factory=list)  # mp3 attachments


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def button(href: str, label: str, primary=False) -> str:
    bg, fg, bd = ("#1e5044", "#ffffff", "#1e5044") if primary else ("#fffdf7", "#1e5044", "#c9b78f")
    return (f'<a href="{esc(href)}" style="display:inline-block;margin:4px 5px;padding:11px 20px;border-radius:999px;'
            f'background:{bg};color:{fg};border:1px solid {bd};text-decoration:none;font-weight:600;font-size:14px">{esc(label)}</a>')


def page_shell(inner: str, lang: str, preheader="") -> str:
    rtl = lang == "fa"
    font = "Vazirmatn,'Segoe UI',Tahoma,sans-serif" if rtl else "Georgia,'Iowan Old Style','Times New Roman',serif"
    return f"""<!doctype html>
<html lang="{lang}" dir="{'rtl' if rtl else 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600&display=swap" rel="stylesheet">
<title>Ayesheno</title></head>
<body style="margin:0;padding:0;background:#efe8d8;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe8d8">
<tr><td align="center" style="padding:28px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fffdf7;border:1px solid #e2d6bb;border-radius:20px;font-family:{font};color:#24302b">
{inner}
</table>
<div style="font-family:{font};font-size:11px;color:#8b8068;padding:14px 8px 0">آیه شنو · Ayesheno</div>
</td></tr></table></body></html>"""


def build_issue(lib: Library, id_: int, lang: str, tr: str, reciter: str, freq: str, day: datetime,
                welcome=False, get=http_get) -> Issue:
    w = T[lang]
    surah, n = lib.locate(id_)
    trs = lib.translations()
    tr = tr if tr in trs else ("fa.safavi" if lang == "fa" else "en.sahih")
    meta_tr = trs[tr]
    rtl_tr = meta_tr.get("dir") == "rtl"
    arabic, text = lib.arabic(id_), lib.translation(tr, id_)
    folder, rec_fa, rec_en = RECITERS.get(reciter, RECITERS[DEFAULT_RECITER])
    rec_name = rec_fa if lang == "fa" else rec_en
    num = fa_num if lang == "fa" else str
    name = surah["fa"] if lang == "fa" else f"{surah['tr']} ({surah['en']})"
    ref = f"{w['surah']} {name} · {w['ayah']} {num(n)}" if lang == "fa" else f"{name} · {surah['id']}:{n}"
    kind = w["weekly" if freq == "weekly" else "daily"]
    subject = f"{kind} · {surah['fa'] if lang == 'fa' else surah['tr']} {num(surah['id'])}:{num(n)}"

    issue = Issue(subject=subject, html="", text="")
    issue.images["logo"] = logo_picture()
    printed = lib.printed(id_)
    if printed:
        issue.images["ayah"] = ayah_picture(printed)
        img = Image.open(io.BytesIO(issue.images["ayah"]))
        shown = min(552, img.width // 2)
        arabic_html = (f'<img src="cid:ayah" width="{shown}" alt="{esc(arabic)}" '
                       f'style="display:block;width:100%;max-width:{shown}px;height:auto;margin:0 auto;border:0">')
    else:
        arabic_html = (f'<div dir="rtl" lang="ar" style="font-family:\'KFGQPC Uthmanic Script HAFS\',\'Amiri Quran\',\'Noto Naskh Arabic\',serif;'
                       f'font-size:30px;line-height:2.1;text-align:center;color:#1d2320">{esc(arabic)} ﴿{fa_num(n)}﴾</div>')

    for url, label in [(audio_url(folder, surah["id"], n), "recitation"), *(
            [(audio_url(SPOKEN[tr], surah["id"], n), "translation")] if tr in SPOKEN else [])]:
        try:
            data = get(url)
            if len(data) < 8 * 1024 * 1024:
                issue.files.append((f"{surah['id']:03}-{n:03} {surah['tr']} {n} ({label}).mp3", data))
        except OSError:
            pass  # the email still has the link
    has_rec = any("(recitation)" in f for f, _ in issue.files)
    has_both = has_rec and any("(translation)" in f for f, _ in issue.files)

    tr_name = meta_tr["name"] if lang == "fa" else meta_tr.get("translator", meta_tr["name"])
    marker = f"﴿{fa_num(n)}﴾" if rtl_tr else f"({n})"
    tr_font = "Vazirmatn,'Segoe UI',Tahoma,sans-serif" if rtl_tr else "Georgia,'Iowan Old Style',serif"
    read = f"{SITE_URL}#/ayah/{surah['id']}/{n}"
    study = f"{SITE_URL}#/verse/{surah['id']}/{n}"
    listen = audio_url(folder, surah["id"], n)
    note = w["attached2" if has_both else "attached"].format(reciter=rec_name) if has_rec else ""
    welcome_html = (f'<tr><td style="padding:0 36px 8px"><div style="background:#f3ecdc;border-radius:12px;padding:12px 16px;'
                    f'font-size:14px;line-height:1.8;color:#4a4232;text-align:center">'
                    f'{esc(w["welcome"].format(when=w["when_" + freq]))}</div></td></tr>') if welcome else ""
    footer = w["footer_weekly" if freq == "weekly" else "footer_daily"]
    inner = f"""
<tr><td style="padding:26px 32px 4px;text-align:center">
  <a href="{esc(SITE_URL)}"><img src="cid:logo" width="94" height="50" alt="آیه شنو · Ayesheno" style="display:inline-block;border:0"></a>
</td></tr>
<tr><td style="padding:2px 32px 0;text-align:center">
  <div style="font-size:12px;letter-spacing:{'0' if lang == 'fa' else '.16em'};text-transform:uppercase;color:#8a6a2c;font-weight:600">{esc(kind)}</div>
  <div style="font-size:13px;color:#7b7462;padding-top:4px">{esc(date_line(day, lang))}</div>
</td></tr>
{welcome_html}
<tr><td style="padding:18px 32px 6px;text-align:center">
  <div style="font-size:21px;color:#1e5044;font-weight:600">{esc(ref)}</div>
  <div dir="rtl" lang="ar" style="font-size:15px;color:#8a6a2c;padding-top:2px">سورة {esc(surah['ar'])}</div>
</td></tr>
<tr><td style="padding:10px 22px 4px">{arabic_html}</td></tr>
<tr><td style="padding:10px 32px 0;text-align:center;color:#b08a42;font-size:18px">۞</td></tr>
<tr><td dir="{'rtl' if rtl_tr else 'ltr'}" lang="{esc(meta_tr['lang'])}" style="padding:8px 40px 4px;font-family:{tr_font};font-size:{17 if rtl_tr else 18}px;line-height:{2 if rtl_tr else 1.75};color:#26302c;text-align:justify">
  {esc(text)} <span style="color:#8a6a2c;white-space:nowrap">{marker}</span>
</td></tr>
<tr><td style="padding:2px 40px 0;font-size:12px;color:#8b8068;text-align:{'left' if rtl_tr else 'right'}">{esc(w['translation'].format(name=tr_name))}</td></tr>
<tr><td style="padding:22px 24px 6px;text-align:center">
  {button(read, w['read'], primary=True)}{button(listen, '▶ ' + w['listen'])}{button(study, w['study'])}
</td></tr>
{f'<tr><td style="padding:6px 32px 0;text-align:center;font-size:13px;color:#6f6754">🎧 {esc(note)}</td></tr>' if note else ''}
<tr><td style="padding:22px 32px 0"><div style="border-top:1px solid #e8dfca"></div></td></tr>
<tr><td style="padding:14px 32px 0;text-align:center;font-size:12px;color:#8a6a2c">{esc(w['ghazali'])}</td></tr>
<tr><td style="padding:10px 32px 26px;text-align:center;font-size:12px;line-height:1.9;color:#8b8068">
  {esc(footer)}<br>
  <a href="@@switch@@" style="color:#1e5044">@@switch_label@@</a> · <a href="@@unsub@@" style="color:#1e5044">{esc(w['unsub'])}</a><br>
  {esc(w['reply'])}
</td></tr>"""
    issue.html = page_shell(inner, lang, preheader=text[:140])
    issue.text = "\n\n".join([
        f"{kind} · {date_line(day, lang)}", ref, arabic, f"{text} {marker}", w["translation"].format(name=tr_name),
        f"{w['read']}: {read}", f"{w['listen']}: {listen}", w["ghazali"],
        f"{footer}\n{w['unsub']}: @@unsub@@\n{w['reply']}",
    ])
    return issue


def fill(s: str, links: dict[str, str], html_=False) -> str:
    for k, v in links.items():
        s = s.replace(f"@@{k}@@", esc(v) if html_ else v)
    return s


def confirm_mail(lang: str, freq: str, token: str) -> tuple[str, str, str]:
    w = T[lang]
    url = f"{PUBLIC_URL}/confirm?t={token}"
    what = w["weekly" if freq == "weekly" else "daily"]
    inner = f"""
<tr><td style="padding:28px 32px 6px;text-align:center"><img src="cid:logo" width="94" height="50" alt="آیه شنو · Ayesheno" style="border:0"></td></tr>
<tr><td style="padding:8px 36px 0;text-align:center;font-size:22px;color:#1e5044;font-weight:600">{esc(w['confirm_title'])}</td></tr>
<tr><td style="padding:10px 36px 0;text-align:center;font-size:15px;line-height:1.9">{esc(w['confirm_body'].format(what=what))}</td></tr>
<tr><td style="padding:20px 36px 6px;text-align:center">{button(url, w['confirm_button'], primary=True)}</td></tr>
<tr><td style="padding:8px 36px 0;text-align:center;font-size:13px;color:#6f6754;line-height:1.8">{esc(w['confirm_reply'])}</td></tr>
<tr><td style="padding:8px 36px 28px;text-align:center;font-size:12px;color:#8b8068">{esc(w['confirm_ignore'])}</td></tr>"""
    text = f"{w['confirm_body'].format(what=what)}\n\n{url}\n\n{w['confirm_reply']}\n{w['confirm_ignore']}"
    # the reference in the subject lets a reply confirm (from Iran the link's host cannot be reached)
    return f"{w['confirm_subject']} [ref:{token}]", page_shell(inner, lang), text


# ---------------------------------------------------------------------------------------------------------------
# subscribers

SCHEMA = """create table if not exists subscribers(
  email text primary key, freq text not null, lang text not null, tr text not null, reciter text not null,
  tz text not null, token text not null unique, status text not null, created integer not null,
  confirmed integer, last_slot integer not null default -1, confirm_sent integer not null default 0,
  confirm_count integer not null default 0, source text not null default 'web')"""

EMAIL_RE = re.compile(r"^[^@\s<>\"',;]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")


def valid_tz(tz: str | None, lang: str) -> str:
    try:
        ZoneInfo(tz or "")
        return tz
    except (ZoneInfoNotFoundError, ValueError):
        return "Asia/Tehran" if lang == "fa" else "UTC"


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        self.db.execute("pragma journal_mode=wal")
        self.db.execute(SCHEMA)

    def q(self, sql, *args):
        with self.lock:
            return self.db.execute(sql, args).fetchall()

    def by_email(self, addr):
        r = self.q("select * from subscribers where email=?", addr.lower())
        return r[0] if r else None

    def by_token(self, token):
        r = self.q("select * from subscribers where token=?", token or "")
        return r[0] if r else None

    def upsert(self, addr, freq, lang, tr, reciter, tz, source) -> sqlite3.Row:
        addr = addr.lower()
        now = int(time.time())
        if self.by_email(addr):
            self.q("update subscribers set freq=?, lang=?, tr=?, reciter=?, tz=? where email=?", freq, lang, tr, reciter, tz, addr)
        else:
            self.q("insert into subscribers(email,freq,lang,tr,reciter,tz,token,status,created,source) values(?,?,?,?,?,?,?,?,?,?)",
                   addr, freq, lang, tr, reciter, tz, secrets.token_urlsafe(18), "pending", now, source)
        return self.by_email(addr)


# ---------------------------------------------------------------------------------------------------------------
# sending


class Mailer:
    def send(self, msg: EmailMessage):
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=60) as s:
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)


def list_address() -> str:
    return LIST_ADDRESS or SMTP_USER


def message(to: str, subject: str, html_body: str, text: str, images: dict[str, bytes], files=(), unsub: str | None = None) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = email.utils.formataddr(("آیه شنو · Ayesheno", SMTP_USER or "ayesheno@example.org"))
    msg["To"] = to
    if list_address() != SMTP_USER:
        msg["Reply-To"] = list_address()
    msg["Subject"] = subject
    msg["Date"] = email.utils.formatdate(localtime=False)
    msg["Message-ID"] = email.utils.make_msgid(domain="ayesheno")
    if unsub:
        msg["List-Unsubscribe"] = f"<{unsub}>, <mailto:{list_address()}?subject=unsubscribe>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg["List-Id"] = "Ayesheno ayah <ayah.ayesheno>"
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")
    related = msg.get_payload()[1]
    for cid, data in images.items():
        related.add_related(data, "image", "png", cid=f"<{cid}>", filename=f"{cid}.png")
    for name, data in files:
        msg.add_attachment(data, maintype="audio", subtype="mpeg", filename=name)
    return msg


class Service:
    def __init__(self, store: Store, lib: Library, mailer: Mailer, get=http_get):
        self.store, self.lib, self.mailer, self.get = store, lib, mailer, get
        self.issues: dict[tuple, Issue] = {}
        self.hits: dict[str, list[float]] = {}

    @property
    def open(self):
        return bool(SMTP_USER and SMTP_PASS)

    def links(self, sub) -> dict[str, str]:
        other = "daily" if sub["freq"] == "weekly" else "weekly"
        return {
            "unsub": f"{PUBLIC_URL}/unsubscribe?t={sub['token']}",
            "switch": f"{PUBLIC_URL}/switch?t={sub['token']}&f={other}",
            "switch_label": T[sub["lang"]][f"to_{other}"],
        }

    def issue_for(self, sub, id_, day, welcome=False) -> Issue:
        key = (id_, sub["lang"], sub["tr"], sub["reciter"], sub["freq"], day.date(), welcome)
        if key not in self.issues:
            if len(self.issues) > 64:
                self.issues.clear()
            self.issues[key] = build_issue(self.lib, id_, sub["lang"], sub["tr"], sub["reciter"], sub["freq"], day, welcome, self.get)
        return self.issues[key]

    def send_issue(self, sub, slot, day, welcome=False):
        id_ = ayah_for_slot(self.lib.pool(), slot)
        issue = self.issue_for(sub, id_, day, welcome)
        links = self.links(sub)
        msg = message(sub["email"], issue.subject, fill(issue.html, links, html_=True), fill(issue.text, links),
                      issue.images, issue.files, unsub=links["unsub"])
        self.mailer.send(msg)
        self.store.q("update subscribers set last_slot=? where email=?", slot, sub["email"])

    def today(self, sub, now: datetime) -> tuple[int, datetime]:
        local = now.astimezone(ZoneInfo(sub["tz"]))
        return slot_for(int(now.timestamp()), int(local.utcoffset().total_seconds())), local

    def due(self, sub, now: datetime) -> tuple[int, datetime] | None:
        slot, local = self.today(sub, now)
        if local.hour < SEND_HOUR or slot <= sub["last_slot"]:
            return None
        if sub["freq"] == "weekly" and local.weekday() != FRIDAY:
            return None
        return slot, local

    def tick(self, now: datetime | None = None):
        now = now or datetime.now(timezone.utc)
        for sub in self.store.q("select * from subscribers where status='active'"):
            d = self.due(sub, now)
            if not d:
                continue
            try:
                self.send_issue(sub, *d)
            except smtplib.SMTPRecipientsRefused:
                self.store.q("update subscribers set status='bounced' where email=?", sub["email"])
            except Exception:
                traceback.print_exc()
            time.sleep(1.5)  # gently, under Gmail's rate

    def ask_confirm(self, sub) -> bool:
        now = int(time.time())
        if now - sub["confirm_sent"] < 600 or sub["confirm_count"] >= 5:
            return False
        subject, body, text = confirm_mail(sub["lang"], sub["freq"], sub["token"])
        self.mailer.send(message(sub["email"], subject, body, text, {"logo": logo_picture()}))
        self.store.q("update subscribers set confirm_sent=?, confirm_count=confirm_count+1 where email=?", now, sub["email"])
        return True

    def subscribe(self, addr, freq="daily", lang="fa", tr="", reciter="", tz="", source="web", verified=False):
        lang = lang if lang in T else "fa"
        freq = freq if freq in ("daily", "weekly") else "daily"
        reciter = reciter if reciter in RECITERS else DEFAULT_RECITER
        tr = tr if tr in self.lib.translations() and tr.split(".")[0] == lang else ("fa.safavi" if lang == "fa" else "en.sahih")
        sub = self.store.upsert(addr, freq, lang, tr, reciter, valid_tz(tz, lang), source)
        if sub["status"] == "active":
            return "active"
        if verified:
            self.confirm(sub)
            return "confirmed"
        self.store.q("update subscribers set status='pending' where email=?", sub["email"])
        self.ask_confirm(self.store.by_email(addr))
        return "pending"

    def confirm(self, sub):
        if sub["status"] == "active":
            return
        self.store.q("update subscribers set status='active', confirmed=? where email=?", int(time.time()), sub["email"])
        sub = self.store.by_email(sub["email"])
        slot, local = self.today(sub, datetime.now(timezone.utc))
        try:
            self.send_issue(sub, slot, local, welcome=True)  # today's ayah now, the next one tomorrow (or Friday)
        except Exception:
            traceback.print_exc()

    def unsubscribe(self, sub):
        self.store.q("update subscribers set status='unsubscribed' where email=?", sub["email"])

    def switch(self, sub, freq):
        if freq in ("daily", "weekly"):
            self.store.q("update subscribers set freq=? where email=?", freq, sub["email"])

    def limited(self, key: str, n=8, window=3600) -> bool:
        now = time.time()
        hits = [t for t in self.hits.get(key, []) if now - t < window]
        self.hits[key] = hits + [now]
        return len(hits) >= n

    # -- replies, read from the inbox

    def read_inbox(self):
        if not self.open:
            return
        with imaplib.IMAP4_SSL(IMAP_HOST) as m:
            m.login(SMTP_USER, SMTP_PASS)
            m.select("INBOX")
            if list_address() == SMTP_USER:
                _, ids = m.search(None, "UNSEEN")
            else:  # the rest of the inbox is someone's own mail
                _, ids = m.search(None, "X-GM-RAW", f'"is:unread {{deliveredto:{list_address()} from:mailer-daemon}}"')
            for num in ids[0].split()[:50]:
                _, data = m.fetch(num, "(BODY.PEEK[])")
                try:
                    ours = self.handle_mail(email.message_from_bytes(data[0][1], policy=email.policy.default))
                except Exception:
                    traceback.print_exc()
                    ours = True
                if ours:
                    m.store(num, "+FLAGS", "\\Seen")

    def handle_mail(self, msg) -> bool:
        """Acts on one email; False when it was not the newsletter's, so it stays unread."""
        failed = msg.get("X-Failed-Recipients")
        if failed:  # a bounce
            ours = False
            for addr in re.split(r"[,\s]+", failed.strip()):
                if self.store.by_email(addr):
                    self.store.q("update subscribers set status='bounced' where email=?", addr.lower())
                    ours = True
            return ours
        addr = email.utils.parseaddr(msg.get("From", ""))[1].lower()
        auto = msg.get("Auto-Submitted", "no").lower() != "no" or msg.get("Precedence", "").lower() in ("bulk", "junk", "list")
        if addr in (SMTP_USER.lower(), list_address().lower()) or "mailer-daemon" in addr:
            return False
        if not EMAIL_RE.match(addr) or auto:
            return True
        subject = str(msg.get("Subject", ""))
        part = msg.get_body(preferencelist=("plain", "html"))
        body = part.get_content() if part else ""
        body = re.split(r"\n\s*(On .{0,200}wrote:|>)", body, maxsplit=1)[0][:2000]  # not the quoted email
        cmd = mail_command(subject, body)
        ref = re.search(r"\[ref:([\w-]{10,})\]", subject)
        sub = self.store.by_email(addr)
        if cmd == "unsubscribe":
            if sub:
                self.unsubscribe(sub)
            return True
        if ref and sub and sub["token"] == ref.group(1) and cmd is None:
            self.confirm(sub)
            return True
        if cmd in ("daily", "weekly"):
            if sub and sub["status"] == "active":
                self.switch(sub, cmd)
                return True
            lang = "fa" if re.search(r"[؀-ۿ]", subject + body) else "en"
            # Gmail and most providers vouch for the sender: then the email itself is the confirmation
            verified = "dmarc=pass" in str(msg.get("Authentication-Results", "")).lower()
            self.subscribe(addr, cmd, lang, source="email", verified=verified)
        return True


WORDS = {
    "unsubscribe": ["unsubscribe", "stop", "cancel", "لغو", "توقف", "انصراف"],
    "weekly": ["weekly", "week", "هفتگی", "هفته"],
    "daily": ["daily", "subscribe", "join", "روزانه", "عضویت", "اشتراک", "هر روز"],
}


def mail_command(subject: str, body: str) -> str | None:
    """What an email asks for: unsubscribe, weekly or daily (or nothing: a reply that only confirms)."""
    text = re.sub(r"\[ref:[\w-]+\]|^(re|fwd?|پاسخ)\s*:\s*", " ", f"{subject}\n{body}", flags=re.I).lower()
    text = re.sub(r"(confirm your ayesheno subscription|تأیید اشتراک آیه شنو)", " ", text)
    for cmd in ("unsubscribe", "weekly", "daily"):
        if any(re.search(rf"(?<![\w]){re.escape(w)}(?![\w])", text) for w in WORDS[cmd]):
            return cmd
    return None


# ---------------------------------------------------------------------------------------------------------------
# the web side

ORIGINS = {"https://rhadadi.github.io", "https://ayesheno.duckdns.org", "http://localhost:4173", "http://localhost:5173"}


def small_page(lang: str, message_: str, form: tuple[str, str] | None = None) -> str:
    w = T[lang]
    action = ""
    if form:
        url, label = form
        action = (f'<form method="post" action="{esc(url)}" style="margin:18px 0 4px">'
                  f'<button style="font:inherit;font-weight:600;padding:12px 26px;border-radius:999px;border:0;background:#1e5044;color:#fff;cursor:pointer">{esc(label)}</button></form>')
    inner = f"""<tr><td style="padding:30px 32px 6px;text-align:center"><a href="{esc(SITE_URL)}" style="font-size:24px;color:#1e5044;text-decoration:none;font-weight:600">آیه شنو · Ayesheno</a></td></tr>
<tr><td style="padding:8px 36px 30px;text-align:center;font-size:16px;line-height:1.9">{esc(message_)}{action}
<div style="margin-top:14px"><a href="{esc(SITE_URL)}" style="color:#1e5044;font-size:14px">{esc(w['read'])}</a></div></td></tr>"""
    return page_shell(inner, lang)


class Handler(BaseHTTPRequestHandler):
    service: Service

    def log_message(self, fmt, *args):
        pass  # no addresses in the logs

    def client(self):
        return (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()

    def send(self, code, body: str, ctype="text/html; charset=utf-8"):
        data = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(data)

    def route(self):
        u = urllib.parse.urlsplit(self.path)
        return re.sub(r"^/newsletter", "", u.path) or "/", dict(urllib.parse.parse_qsl(u.query))

    def do_OPTIONS(self):
        self.send_response(204)
        origin = self.headers.get("Origin", "")
        if origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "POST, GET")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        path, q = self.route()
        s = self.service
        if path == "/status":
            return self.send(200, json.dumps({"open": s.open}), "application/json")
        sub = s.store.by_token(q.get("t"))
        lang = sub["lang"] if sub else "fa"
        w = T[lang]
        if path in ("/confirm", "/unsubscribe", "/switch"):
            if not sub:
                return self.send(404, small_page(lang, w["bad_link"]))
            if path == "/confirm":
                if sub["status"] == "active":
                    return self.send(200, small_page(lang, w["done_confirmed"]))
                return self.send(200, small_page(lang, w["confirm_body"].format(what=w[sub["freq"]]), (self.path, w["ask_confirm"])))
            if path == "/unsubscribe":
                return self.send(200, small_page(lang, w["footer_" + sub["freq"]], (self.path, w["ask_unsub"])))
            f = q.get("f", "weekly")
            return self.send(200, small_page(lang, w["footer_" + sub["freq"]], (self.path, w["ask_switch"].format(what=w.get(f, f)))))
        self.send(404, small_page("fa", T["fa"]["bad_link"]))

    def do_POST(self):
        path, q = self.route()
        s = self.service
        n = min(int(self.headers.get("Content-Length") or 0), 4096)
        raw = self.rfile.read(n).decode("utf-8", "replace")
        if path == "/subscribe":
            if not s.open:
                return self.send(503, json.dumps({"error": "closed"}), "application/json")
            try:
                body = json.loads(raw)
            except ValueError:
                return self.send(400, json.dumps({"error": "bad"}), "application/json")
            addr = str(body.get("email", "")).strip()
            if not EMAIL_RE.match(addr):
                return self.send(400, json.dumps({"error": "email"}), "application/json")
            if s.limited("ip:" + self.client()) or s.limited("to:" + addr.lower(), n=4, window=86400):
                return self.send(429, json.dumps({"error": "later"}), "application/json")
            state = s.subscribe(addr, str(body.get("freq", "daily")), str(body.get("lang", "fa")), str(body.get("tr", "")),
                                str(body.get("reciter", "")), str(body.get("tz", "")))
            return self.send(200, json.dumps({"state": state}), "application/json")
        sub = s.store.by_token(q.get("t"))
        if not sub:
            return self.send(404, small_page("fa", T["fa"]["bad_link"]))
        w = T[sub["lang"]]
        if path == "/confirm":
            s.confirm(sub)
            return self.send(200, small_page(sub["lang"], w["done_confirmed"]))
        if path == "/unsubscribe":  # also Gmail's one-click button (RFC 8058)
            s.unsubscribe(sub)
            return self.send(200, small_page(sub["lang"], w["done_unsub"]))
        if path == "/switch":
            f = q.get("f", "weekly")
            s.switch(sub, f)
            return self.send(200, small_page(sub["lang"], w["done_switched"].format(what=w.get(f, f))))
        self.send(404, small_page(sub["lang"], w["bad_link"]))


def loop(service: Service):
    last_inbox = 0.0
    while True:
        try:
            if service.store.q("select 1 from subscribers where status='active' limit 1"):
                service.tick()
            if service.open and time.time() - last_inbox > 120:
                last_inbox = time.time()
                service.read_inbox()
        except Exception:
            traceback.print_exc()
        time.sleep(60)


def main(argv):
    lib = Library(STATE / "cache")
    if argv[:1] == ["preview"]:
        surah, ayah = map(int, argv[1].split(":"))
        lang = argv[2] if len(argv) > 2 else "fa"
        lib.refresh()
        id_ = next(s for s in lib.meta["surahs"] if s["id"] == surah)["first"] + ayah - 1
        issue = build_issue(lib, id_, lang, "fa.safavi" if lang == "fa" else "en.sahih", DEFAULT_RECITER, "daily",
                            datetime.now(ZoneInfo("Asia/Tehran")), welcome="--welcome" in argv)
        out = fill(issue.html, {"unsub": "#", "switch": "#", "switch_label": T[lang]["to_weekly"]}, html_=True)
        import base64
        for cid, data in issue.images.items():
            out = out.replace(f"cid:{cid}", "data:image/png;base64," + base64.b64encode(data).decode())
        Path("preview.html").write_text(out, encoding="utf-8")
        print(f"preview.html: {issue.subject}; {len(issue.files)} audio file(s), {sum(len(d) for _, d in issue.files) // 1024} KB")
        return 0
    service = Service(Store(STATE / "newsletter.db"), lib, Mailer())
    if argv[:1] == ["send"]:  # today's issue to one address, as a sample: python3 app.py send to@example.com fa
        lang = argv[2] if len(argv) > 2 else "fa"
        sub = {"email": argv[1], "lang": lang, "tr": "fa.safavi" if lang == "fa" else "en.sahih", "reciter": DEFAULT_RECITER,
               "freq": "daily", "token": "sample", "tz": "Asia/Tehran"}
        lib.refresh()
        service.send_issue(sub, *service.today(sub, datetime.now(timezone.utc)), welcome="--welcome" in argv)
        print(f"sent to {argv[1]}")
        return 0
    Handler.service = service
    threading.Thread(target=loop, args=(service,), daemon=True).start()
    port = int(ENV("PORT", "8090"))
    print(f"newsletter on :{port}; sending {'on' if service.open else 'off (no SMTP_USER/SMTP_PASS)'}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["serve"]))
