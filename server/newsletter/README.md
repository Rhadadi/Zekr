# Ayah by email

The app's ayah of the day by email, daily (each morning at six, the subscriber's time) or weekly (Friday morning): the
ayah as printed in the mushaf, its translation, and its recitation attached. It runs on the home server behind Caddy at
`https://ayesheno.duckdns.org/newsletter/`; sign-up is the folded "Ayah by email" section at the bottom of the app's
menu, or an email to the newsletter's address with "daily" or "weekly" (duckdns.org cannot be reached from Iran, Gmail
can). Replies "weekly", "daily" or "unsubscribe" do what they say.

    python3 -m unittest -v              tests (needs Pillow)
    python3 app.py preview 2:255 fa     one issue as preview.html, from the live site's data
    docker compose up -d --build        on the server; .env holds SMTP_USER, SMTP_PASS (a Gmail app password) and LIST_ADDRESS

The subscribers are in the `newsletter-data` volume (SQLite). Nothing else is kept: no opens or clicks are tracked.
