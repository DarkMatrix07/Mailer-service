module.exports = async (_req, res) => {
  res.status(200).json({
    ok: true,
    smtp: Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
    ),
  });
};
