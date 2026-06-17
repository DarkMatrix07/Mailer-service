const nodemailer = require('nodemailer');

/**
 * HMD mailer — Netlify Function.
 *
 * Sends email via SMTP (Gmail with an app password by default). Netlify runs
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
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  // Auth — shared secret must match the caller (Laravel MAILER_SERVICE_SECRET).
  const secret = process.env.API_SECRET || '';
  const provided =
    event.headers['x-api-secret'] || event.headers['X-Api-Secret'] || '';
  if (!secret || provided !== secret) {
    return json(401, { error: 'unauthorized' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }

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
    return json(422, { error: 'At least one recipient (to) is required' });
  }
  if (!subject || (!html && !text)) {
    return json(422, { error: 'subject and (html or text) are required' });
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return json(500, { error: 'SMTP is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS)' });
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

    return json(200, { ok: true, messageId: info.messageId });
  } catch (err) {
    console.error('[hmd-mailer] send failed:', err);
    return json(500, { error: String((err && err.message) || err) });
  }
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload),
  };
}
