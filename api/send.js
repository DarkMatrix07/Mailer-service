const nodemailer = require('nodemailer');

/**
 * HMD mailer — Vercel Serverless Function.
 *
 * Sends email via SMTP (Gmail with an app password by default). Vercel runs
 * functions on AWS Lambda, which (unlike DigitalOcean droplets) does NOT block
 * outbound SMTP ports — so Gmail SMTP works here, and because Google signs the
 * message (SPF/DKIM/DMARC aligned) it lands in the inbox, not spam.
 *
 * Contract matches the standalone mailer-service so the Laravel `hmd_http`
 * transport can POST here unchanged:
 *   POST /send   (header: X-Api-Secret)
 *   body: { to[], cc[], bcc[], replyTo[], subject, html, text,
 *           fromAddress, fromName, attachments:[{filename, content(base64), contentType}] }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth — shared secret must match the caller (Laravel MAILER_SERVICE_SECRET).
  const secret = process.env.API_SECRET || '';
  const provided = req.headers['x-api-secret'] || '';
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return res.status(400).json({ error: 'invalid JSON body' });
    }
  }
  body = body || {};

  const {
    to,
    cc,
    bcc,
    replyTo,
    subject,
    html,
    text,
    fromAddress,
    fromName,
    attachments,
  } = body;

  const toList = [].concat(to || []).filter(Boolean);
  if (toList.length === 0) {
    return res.status(422).json({ error: 'At least one recipient (to) is required' });
  }
  if (!subject || (!html && !text)) {
    return res.status(422).json({ error: 'subject and (html or text) are required' });
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(500).json({ error: 'SMTP is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS)' });
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    typeof process.env.SMTP_SECURE === 'string'
      ? process.env.SMTP_SECURE === 'true'
      : port === 465;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure, // true for 465 (implicit TLS), false for 587 (STARTTLS)
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const from = fromAddress
    ? { name: fromName || undefined, address: fromAddress }
    : process.env.MAIL_FROM;

  const mailAttachments = (attachments || []).map((a) => ({
    filename: a.filename,
    content: Buffer.from(a.content, 'base64'),
    contentType: a.contentType || undefined,
  }));

  try {
    const info = await transporter.sendMail({
      from,
      to: toList,
      cc: cc && cc.length ? cc : undefined,
      bcc: bcc && bcc.length ? bcc : undefined,
      replyTo: replyTo && replyTo.length ? replyTo : undefined,
      subject,
      html: html || undefined,
      text: text || undefined,
      attachments: mailAttachments,
    });

    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error('[hmd-mailer] send failed:', err);
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
};
