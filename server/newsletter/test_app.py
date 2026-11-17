"""Tests for the ayah by email, with made-up data in place of the site and a mailer that keeps what it is given.

    cd server/newsletter && python3 -m unittest -v
"""
import io
import json
import re
import tempfile
import unittest
from datetime import datetime, timezone
from email import message_from_bytes, policy
from pathlib import Path
from unittest import mock

from PIL import Image, ImageDraw

import app

REPO = Path(__file__).resolve().parents[2]


def page_png() -> bytes:
    """A made-up printed page: paper, three lines of 'ink', a ruled frame down the left."""
    im = Image.new("RGB", (654, 935), (232, 244, 250))
    d = ImageDraw.Draw(im)
    for y in (180, 235, 290):
        d.rectangle((120, y + 12, 560, y + 40), fill=(20, 20, 20))
    d.line((112, 100, 112, 900), fill=(0, 0, 0), width=3)
    buf = io.BytesIO()
    im.save(buf, "WEBP")
    return buf.getvalue()


SURAHS = [{"id": 1, "first": 1, "ayahs": 7, "ar": "الفاتحة", "fa": "فاتحه", "tr": "Al-Faatiha", "en": "The Opening"},
          {"id": 2, "first": 8, "ayahs": 286, "ar": "البقرة", "fa": "بقره", "tr": "Al-Baqara", "en": "The Cow"}]
FILES = {
    "meta.json": json.dumps({"version": "v1", "surahs": SURAHS, "mushaf": {"v": "m1"}, "translations": [
        {"id": "fa.safavi", "lang": "fa", "name": "صفوی", "translator": "Safavi", "dir": "rtl"},
        {"id": "en.sahih", "lang": "en", "name": "Sahih International", "translator": "Saheeh International", "dir": "ltr"}]}).encode(),
    "pools.json": json.dumps({"pools": {"all": [1, 2, 9, 10, 262]}}).encode(),
    "text/uthmani.json": json.dumps([f"آية {i}" for i in range(1, 300)]).encode(),
    "tr/fa.safavi.json": json.dumps([f"ترجمهٔ {i}" for i in range(1, 300)]).encode(),
    "tr/en.sahih.json": json.dumps([f"Translation {i} <b>" for i in range(1, 300)]).encode(),
    "mushaf/map.json": json.dumps({"pages": [{"n": 1, "first": 1, "w": 654, "h": 935, "a": [[[180, 190, 680, 56]]] * 7},
                                             {"n": 2, "first": 8, "w": 654, "h": 935,
                                              "a": [[[180, 190, 680, 56], [180, 250, 680, 56], [500, 309, 360, 56]]] * 290}]}).encode(),
    "mushaf/001.webp": page_png(),
    "mushaf/002.webp": page_png(),
}


def fake_get(url: str) -> bytes:
    if url.endswith(".mp3"):
        return b"ID3 not really an mp3"
    path = url.split("/data/", 1)[1].split("?")[0]
    return FILES[path]


class Kept(app.Mailer):
    def __init__(self):
        self.sent = []

    def send(self, msg):
        self.sent.append(message_from_bytes(msg.as_bytes(), policy=policy.default))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp = Path(self.tmp.name)
        patches = [mock.patch.object(app, "DATA_URL", "https://example.org/data/"), mock.patch.object(app, "SMTP_USER", "ayah@example.org"),
                   mock.patch.object(app, "SMTP_PASS", "x"), mock.patch.object(app, "PUBLIC_URL", "https://example.org/newsletter")]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.lib = app.Library(tmp / "cache", get=fake_get)
        self.mail = Kept()
        self.svc = app.Service(app.Store(tmp / "db.sqlite"), self.lib, self.mail, get=fake_get)

    def tearDown(self):
        self.svc.store.db.close()
        self.tmp.cleanup()

    def html_of(self, msg) -> str:
        return msg.get_body(preferencelist=("html",)).get_content()


class RotationTest(unittest.TestCase):
    def test_matches_the_shared_vectors(self):
        v = json.loads((REPO / "shared/test-vectors/rotation.json").read_text())
        pools = {k: (list(range(p["range"][0], p["range"][1] + 1)) if isinstance(p, dict) else p) for k, p in v["pools"].items()}
        for c in v["ayahs"]:
            self.assertEqual(app.ayah_for_slot(pools[c["pool"]], c["slot"], c["salt"]), c["ayah"], c)
        for c in v["slots"]:
            self.assertEqual(app.slot_for(c["t"], c["offset"], c["period"]), c["slot"], c)

    def test_persian_date(self):
        self.assertEqual(app.jalali(2026, 11, 17), (1405, 8, 26))
        self.assertEqual(app.jalali(2026, 3, 21), (1405, 1, 1))
        self.assertEqual(app.date_line(datetime(2026, 11, 17), "fa"), "سه‌شنبه ۲۶ آبان ۱۴۰۵")

    def test_reciters_are_the_apps(self):
        ts = (REPO / "web/src/reciters.ts").read_text()
        apps = dict(re.findall(r"\{ id: '([\w-]+)', folder: '([^']+)'", ts))
        for rid, (folder, _, _) in app.RECITERS.items():
            self.assertEqual(apps.get(rid), folder, rid)
        self.assertEqual(set(a for a in apps if not a.startswith(("fa.", "en."))), set(app.RECITERS))


class PictureTest(unittest.TestCase):
    def test_rules_and_neighbouring_tips_are_painted_over(self):
        im = Image.new("RGB", (300, 50), (240, 240, 240))
        d = ImageDraw.Draw(im)
        d.line((3, 0, 3, 49), fill=(0, 0, 0), width=2)  # the frame
        d.rectangle((100, 0, 110, 4), fill=(0, 0, 0))  # a tip from the line above
        d.rectangle((150, 10, 200, 40), fill=(0, 0, 0))  # this line's ink
        d.rectangle((210, 5, 214, 49), fill=(0, 0, 0))  # a descender of this line, down to the edge
        out = app.clean_line(im, (240, 240, 240))
        self.assertEqual(out.getpixel((3, 25)), (240, 240, 240))
        self.assertEqual(out.getpixel((105, 2)), (240, 240, 240))
        self.assertEqual(out.getpixel((175, 25)), (0, 0, 0))
        self.assertEqual(out.getpixel((212, 48)), (0, 0, 0))


class IssueTest(Base):
    def test_issue_has_the_picture_translation_audio_and_links(self):
        issue = app.build_issue(self.lib, 262, "en", "en.sahih", "husary", "daily", datetime(2026, 11, 17), get=fake_get)
        self.assertEqual(issue.subject, "Ayah of the day · Al-Baqara 2:255")
        self.assertIn("ayah", issue.images)
        pic = Image.open(io.BytesIO(issue.images["ayah"]))
        self.assertGreater(pic.height, 3 * 56)  # three lines, framed
        self.assertIn("Translation 262 &lt;b&gt;", issue.html)  # escaped
        self.assertIn("#/ayah/2/255", issue.html)
        self.assertEqual([n for n, _ in issue.files], ["002-255 Al-Baqara 255 (recitation).mp3", "002-255 Al-Baqara 255 (translation).mp3"])
        # said once: the recitation is attached, so no Listen link; the translator and reciter share one line
        self.assertNotIn("Husary_128kbps/002255.mp3", issue.html)
        self.assertIn("Translation: Saheeh International · Recitation by Al-Husary and the recorded translation attached", issue.html)
        self.assertEqual(issue.html.count("The Cow"), 1)
        self.assertNotIn("Ayah of the day", issue.html)  # it is in the subject
        self.assertNotIn("Ghazali", issue.html)  # only in the welcome

    def test_without_the_attachment_the_recitation_is_a_link(self):
        def no_audio(url):
            if url.endswith(".mp3"):
                raise OSError("unreachable")
            return fake_get(url)
        issue = app.build_issue(self.lib, 262, "en", "en.sahih", "husary", "daily", datetime(2026, 11, 17), get=no_audio)
        self.assertEqual(issue.files, [])
        self.assertIn("Husary_128kbps/002255.mp3", issue.html)
        self.assertIn("Husary_128kbps/002255.mp3", issue.text)
        self.assertNotIn("attached", issue.html)

    def test_persian_issue(self):
        issue = app.build_issue(self.lib, 1, "fa", "fa.safavi", "nobody", "weekly", datetime(2026, 11, 20), get=fake_get)
        self.assertEqual(issue.subject, "آیهٔ هفته · فاتحه ۱:۱")
        self.assertIn('dir="rtl"', issue.html)
        self.assertIn("جمعه ۲۹ آبان ۱۴۰۵", issue.html)
        self.assertIn("منشاوی", issue.html)  # an unknown reciter falls back to the default
        self.assertEqual(issue.html.count("فاتحه"), 1)  # one heading, no second name in Arabic
        self.assertNotIn("﴿۱﴾", issue.html.split("cid:ayah")[-1])  # the number is in the picture, not after the translation
        welcome = app.build_issue(self.lib, 1, "fa", "fa.safavi", "", "daily", datetime(2026, 11, 20), welcome=True, get=fake_get)
        self.assertIn("جواهر القرآن", welcome.html)


class FlowTest(Base):
    def test_web_sign_up_confirm_send_and_leave(self):
        self.assertEqual(self.svc.subscribe("Reader@Example.com", "daily", "fa", "fa.safavi", "", "Asia/Tehran"), "pending")
        (confirm,) = self.mail.sent
        token = self.svc.store.by_email("reader@example.com")["token"]
        self.assertIn(f"[ref:{token}]", confirm["Subject"])
        self.assertIn(f"/confirm?t={token}", self.html_of(confirm))
        # asking again within ten minutes does not send another
        self.svc.subscribe("reader@example.com", "daily", "fa")
        self.assertEqual(len(self.mail.sent), 1)

        self.svc.confirm(self.svc.store.by_token(token))
        welcome = self.mail.sent[-1]
        self.assertIn("خوش آمدید", self.html_of(welcome))
        self.assertIn(f"/unsubscribe?t={token}", welcome["List-Unsubscribe"])
        self.assertEqual(welcome["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click")
        kinds = [p.get_content_type() for p in welcome.walk()]
        self.assertIn("image/png", kinds)
        self.assertIn("audio/mpeg", kinds)

        # no second email the same day; one the next morning in Tehran, the ayah the app shows that day
        sub = self.svc.store.by_email("reader@example.com")
        slot = sub["last_slot"]
        now = datetime.fromtimestamp((slot + 1) * 86400 - 12600 + 5 * 3600, timezone.utc)  # 05:00 the next day, Tehran
        with mock.patch.object(app.time, "sleep"):
            self.svc.tick(now)
            self.assertEqual(len(self.mail.sent), 2)  # not before six
            self.svc.tick(datetime.fromtimestamp(now.timestamp() + 3600, timezone.utc))
        self.assertEqual(len(self.mail.sent), 3)
        expected = app.ayah_for_slot(self.lib.pool(), slot + 1)
        s, n = self.lib.locate(expected)
        self.assertIn(f"#/ayah/{s['id']}/{n}", self.html_of(self.mail.sent[-1]))

        self.svc.unsubscribe(self.svc.store.by_token(token))
        with mock.patch.object(app.time, "sleep"):
            self.svc.tick(datetime.fromtimestamp(now.timestamp() + 86400 * 2, timezone.utc))
        self.assertEqual(len(self.mail.sent), 3)

    def test_weekly_comes_on_friday(self):
        self.svc.subscribe("w@example.com", "weekly", "en", tz="UTC", verified=True)
        sent = len(self.mail.sent)
        with mock.patch.object(app.time, "sleep"):
            self.svc.tick(datetime(2026, 11, 19, 7, tzinfo=timezone.utc))  # Thursday
            self.assertEqual(len(self.mail.sent), sent)
            self.svc.tick(datetime(2026, 11, 20, 7, tzinfo=timezone.utc))  # Friday
        self.assertEqual(len(self.mail.sent), sent + 1)
        self.assertTrue(self.mail.sent[-1]["Subject"].startswith("Ayah of the week"))

    def test_by_email(self):
        def mail(frm, subject, body="", auth="mx.google.com; dkim=pass; spf=pass; dmarc=pass"):
            m = app.EmailMessage()
            m["From"], m["Subject"], m["Authentication-Results"] = frm, subject, auth
            m.set_content(body)
            return message_from_bytes(m.as_bytes(), policy=policy.default)

        self.svc.handle_mail(mail("Someone <a@example.com>", "عضویت", "روزانه لطفا"))
        a = self.svc.store.by_email("a@example.com")
        self.assertEqual((a["status"], a["lang"], a["freq"]), ("active", "fa", "daily"))
        self.svc.handle_mail(mail("a@example.com", "Re: آیهٔ روز", "هفتگی\n\nOn Tue someone wrote:\n> daily"))
        self.assertEqual(self.svc.store.by_email("a@example.com")["freq"], "weekly")
        self.svc.handle_mail(mail("a@example.com", "unsubscribe"))
        self.assertEqual(self.svc.store.by_email("a@example.com")["status"], "unsubscribed")

        # a sender nobody vouches for is asked to confirm, and a reply to that email confirms
        self.svc.handle_mail(mail("b@example.com", "weekly", auth="none"))
        b = self.svc.store.by_email("b@example.com")
        self.assertEqual(b["status"], "pending")
        self.svc.handle_mail(mail("b@example.com", f"Re: Confirm your Ayesheno subscription [ref:{b['token']}]", "ok", auth="none"))
        self.assertEqual(self.svc.store.by_email("b@example.com")["status"], "active")

        bounce = app.EmailMessage()
        bounce["From"], bounce["X-Failed-Recipients"], bounce["Subject"] = "mailer-daemon@googlemail.com", "b@example.com", "Delivery failure"
        bounce.set_content("x")
        self.assertTrue(self.svc.handle_mail(message_from_bytes(bounce.as_bytes(), policy=policy.default)))
        self.assertEqual(self.svc.store.by_email("b@example.com")["status"], "bounced")

        # what is not the newsletter's stays unread in a personal inbox
        del bounce["X-Failed-Recipients"]
        bounce["X-Failed-Recipients"] = "stranger@example.com"
        self.assertFalse(self.svc.handle_mail(message_from_bytes(bounce.as_bytes(), policy=policy.default)))
        self.assertFalse(self.svc.handle_mail(mail("ayah@example.org", "Ayah of the day")))
        self.assertTrue(self.svc.handle_mail(mail("c@example.com", "hello")))

    def test_replies_go_to_the_list_address(self):
        with mock.patch.object(app, "LIST_ADDRESS", "ayah+list@example.org"):
            msg = app.message("a@example.com", "s", "<p>x</p>", "x", {}, unsub="https://example.org/u")
            self.assertEqual(msg["Reply-To"], "ayah+list@example.org")
            self.assertIn("mailto:ayah+list@example.org", msg["List-Unsubscribe"])
        self.assertIsNone(app.message("a@example.com", "s", "<p>x</p>", "x", {})["Reply-To"])

    def test_commands(self):
        self.assertEqual(app.mail_command("Re: Ayah of the day", "please stop"), "unsubscribe")
        self.assertEqual(app.mail_command("", "هفتگی"), "weekly")
        self.assertEqual(app.mail_command("Re: Confirm your Ayesheno subscription [ref:abcdefghijk]", "thanks"), None)
        self.assertIsNone(app.mail_command("hello", "a stopwatch"))


if __name__ == "__main__":
    unittest.main()
