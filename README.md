# HMD Netlify Mailer

A tiny **Netlify Function** that sends the HMD Architects emails (meeting invites,
Minutes-of-Meeting with the PDF attached) over **SMTP** — defaulting to **Gmail
with an App Password**.

## Why Netlify (and not the VPS) for mail?
DigitalOcean droplets **block outbound SMTP ports (25/465/587)**, so the VPS
can't talk to `smtp.gmail.com` directly. Netlify Functions run on AWS Lambda,
which **allows** outbound SMTP — and sending **through Gmail's own SMTP** means
Google signs the message (SPF/DKIM/DMARC aligned), so it lands in the **inbox**,
not spam. The Laravel app (on the VPS) just calls this function over HTTPS.

```
Laravel app (VPS) ──HTTPS POST /send──▶ Netlify Function ──Gmail SMTP──▶ 📬 inbox
```

## Endpoints
- `POST /send` — auth: header `X-Api-Secret` must equal `API_SECRET` (else 401).
  Body (JSON):
  ```json
  {
    "to": ["a@example.com"], "cc": [], "bcc": [], "replyTo": [],
    "subject": "Minutes of Meeting — KG/Meeting / 01",
    "html": "<p>…</p>", "text": "…",
    "fromAddress": "…", "fromName": "HMD Architects",
    "attachments": [{ "filename": "MOM.pdf", "content": "<base64>", "contentType": "application/pdf" }]
  }
  ```
  → `200 { ok: true, messageId }` | `4xx/5xx { error }`
- `GET /health` → `{ ok: true, smtp: true|false }`

(This is the same contract as the standalone `mailer-service`, so the Laravel
`hmd_http` transport works unchanged.)

## Deploy to Netlify
1. Push this repo to GitHub/GitLab and **import it in Netlify** (New site → import),
   or run `netlify deploy --prod` with the Netlify CLI.
2. In **Netlify → Site settings → Environment variables**, set:
   `API_SECRET`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`,
   `SMTP_USER=<your gmail>`, `SMTP_PASS=<gmail app password>`,
   `MAIL_FROM=HMD Architects <your gmail>`.
3. Note your site URL, e.g. `https://hmd-mailer.netlify.app`.
4. Test: `GET https://hmd-mailer.netlify.app/health` → `{ "ok": true, "smtp": true }`.

## Point the Laravel app at it (on the VPS)
In `/var/www/hmd-portal/.env`:
```
MAIL_MAILER=hmd_http
MAILER_SERVICE_URL=https://hmd-mailer.netlify.app
MAILER_SERVICE_SECRET=<same value as API_SECRET>
MAIL_FROM_ADDRESS=<your gmail>
MAIL_FROM_NAME="HMD Architects"
```
then `php artisan config:cache`. The app's `hmd_http` transport POSTs to
`{MAILER_SERVICE_URL}/send`.

## Notes
- Gmail free accounts send ~500 emails/day (Workspace ~2000). Fine for MoMs.
- Netlify synchronous functions time out at ~10s; an SMTP send is ~1–3s.
- The MoM PDF (~0.5 MB) is sent as base64 and fits well within Netlify's payload limit.
