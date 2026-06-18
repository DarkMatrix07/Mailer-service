# HMD Mailer (Vercel)

A tiny **Vercel Serverless Function** that sends the HMD Architects emails
(meeting invites, Minutes-of-Meeting with the PDF attached) over **SMTP** —
defaulting to **Gmail with an App Password**.

## Why a serverless host (and not the VPS) for mail?
DigitalOcean droplets **block outbound SMTP ports (25/465/587)**, so the VPS
can't talk to `smtp.gmail.com` directly. Vercel runs functions on AWS Lambda,
which **allows** outbound SMTP — and sending **through Gmail's own SMTP** means
Google signs the message (SPF/DKIM/DMARC aligned), so it lands in the **inbox**,
not spam. The Laravel app (on the VPS) just calls this function over HTTPS.

```
Laravel app (VPS) ──HTTPS POST /send──▶ Vercel Function ──Gmail SMTP──▶ 📬 inbox
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

(`vercel.json` rewrites `/send`→`/api/send` and `/health`→`/api/health`, so the
URL matches the standalone `mailer-service` and the Laravel `hmd_http` transport
works unchanged.)

## Deploy to Vercel
1. Import this repo in Vercel (or `vercel --prod` with the CLI). No build step —
   it's just serverless functions under `api/`.
2. In **Vercel → Project → Settings → Environment Variables**, set:
   `API_SECRET`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`,
   `SMTP_USER=<your gmail>`, `SMTP_PASS=<gmail app password>`,
   `MAIL_FROM=HMD Architects <your gmail>` — then redeploy so they take effect.
3. Note your site URL, e.g. `https://mailer-service.vercel.app`.
4. Test: `GET https://<your-app>.vercel.app/health` → `{ "ok": true, "smtp": true }`.

## Point the Laravel app at it (on the VPS)
In the app `.env`:
```
MAIL_MAILER=hmd_http
MAILER_SERVICE_URL=https://<your-app>.vercel.app
MAILER_SERVICE_SECRET=<same value as API_SECRET>
MAIL_FROM_ADDRESS=<your gmail>
MAIL_FROM_NAME="HMD Architects"
```
then `php artisan config:cache`. The app's `hmd_http` transport POSTs to
`{MAILER_SERVICE_URL}/send`.

## Notes
- Gmail free accounts send ~500 emails/day (Workspace ~2000). Fine for MoMs.
- Vercel functions have a generous payload limit; the MoM PDF (~0.5 MB, base64) fits easily.
- Secrets live only in Vercel env vars — never commit `.env`.
