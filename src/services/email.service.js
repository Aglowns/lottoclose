const { Resend } = require('resend');

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — emails disabled.');
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = process.env.EMAIL_FROM ?? 'LottoClose <onboarding@resend.dev>';

async function send({ to, subject, html }) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body { margin:0; padding:0; background:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
    .wrap { max-width:560px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.08); }
    .header { background:#1D6B3F; padding:28px 32px; }
    .header h1 { margin:0; color:#fff; font-size:22px; font-weight:700; letter-spacing:-0.3px; }
    .body { padding:28px 32px; color:#1a1a1a; font-size:15px; line-height:1.6; }
    .body h2 { margin:0 0 12px; font-size:18px; }
    .stat { background:#f0faf4; border-left:4px solid #1D6B3F; border-radius:4px; padding:14px 18px; margin:16px 0; }
    .stat .label { font-size:12px; color:#666; text-transform:uppercase; letter-spacing:.5px; }
    .stat .value { font-size:22px; font-weight:700; color:#1D6B3F; margin-top:2px; }
    .alert { background:#fff5f5; border-left:4px solid #e53e3e; border-radius:4px; padding:14px 18px; margin:16px 0; }
    .alert .value { color:#e53e3e; }
    .footer { padding:16px 32px; background:#f9fafb; color:#999; font-size:12px; border-top:1px solid #eee; }
    a.btn { display:inline-block; background:#1D6B3F; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600; font-size:14px; margin-top:8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header"><h1>🎟 LottoClose</h1></div>
    <div class="body">${content}</div>
    <div class="footer">LottoClose · You're receiving this because you own a store on LottoClose.</div>
  </div>
</body>
</html>`;
}

// ── Email functions ────────────────────────────────────────────────────────────

async function sendWelcome({ to, ownerName, storeName }) {
  await send({
    to,
    subject: `Welcome to LottoClose, ${ownerName}!`,
    html: baseTemplate(`
      <h2>You're all set, ${ownerName}! 🎉</h2>
      <p>Your store <strong>${storeName}</strong> is ready on LottoClose. Here's how to get started:</p>
      <ol style="padding-left:20px;line-height:2">
        <li>Open the app and complete the game setup</li>
        <li>Invite your cashiers using the Team tab</li>
        <li>Your cashiers scan tickets at the end of each shift</li>
        <li>You get notified instantly of any shortages</li>
      </ol>
      <p>You have a <strong>7-day free trial</strong> — no credit card needed yet.</p>
      <p style="margin-top:24px;color:#666;font-size:13px;">Questions? Just reply to this email.</p>
    `),
  });
}

async function sendShortageAlertEmail({ to, ownerName, cashierName, storeName, amount, totalSales, shiftId }) {
  const shortAmount = Math.abs(amount).toFixed(2);
  await send({
    to,
    subject: `⚠️ Shortage Alert — ${cashierName} at ${storeName}`,
    html: baseTemplate(`
      <h2>Shortage detected</h2>
      <p>A shift just closed with a shortage at <strong>${storeName}</strong>.</p>
      <div class="alert">
        <div class="label">Cashier</div>
        <div class="value" style="font-size:18px;font-weight:700;">${cashierName}</div>
      </div>
      <div class="alert">
        <div class="label">Shortage Amount</div>
        <div class="value">-$${shortAmount}</div>
      </div>
      <div class="stat">
        <div class="label">Total Sales This Shift</div>
        <div class="value">$${Number(totalSales).toFixed(2)}</div>
      </div>
      <p>Open the LottoClose app to review the full shift details.</p>
    `),
  });
}

async function sendDailySummaryEmail({ to, ownerName, storeName, totalSales, shiftCount, shortageCount }) {
  const shortageNote = shortageCount > 0
    ? `<div class="alert"><div class="label">Shortages</div><div class="value">${shortageCount} shift${shortageCount > 1 ? 's' : ''} with shortage</div></div>`
    : `<div class="stat"><div class="label">Shortages</div><div class="value" style="color:#1D6B3F;">None ✅</div></div>`;

  await send({
    to,
    subject: `Daily Summary — ${storeName} · $${Number(totalSales).toFixed(2)}`,
    html: baseTemplate(`
      <h2>Here's your day, ${ownerName}</h2>
      <div class="stat">
        <div class="label">Total Scratch-Off Sales</div>
        <div class="value">$${Number(totalSales).toFixed(2)}</div>
      </div>
      <div class="stat">
        <div class="label">Shifts Closed</div>
        <div class="value">${shiftCount}</div>
      </div>
      ${shortageNote}
      <p style="margin-top:20px;color:#666;font-size:13px;">Open the app to view full shift details and cashier breakdowns.</p>
    `),
  });
}

async function sendCashierJoinedEmail({ to, ownerName, cashierName, storeName }) {
  await send({
    to,
    subject: `${cashierName} joined ${storeName}`,
    html: baseTemplate(`
      <h2>New team member!</h2>
      <p>Hi ${ownerName}, <strong>${cashierName}</strong> just joined your store <strong>${storeName}</strong> using an invite code.</p>
      <p>They can now log in with their PIN and start scanning shifts.</p>
      <p style="margin-top:20px;color:#666;font-size:13px;">If you didn't invite this person, you can remove them from the Team tab in the app.</p>
    `),
  });
}

module.exports = { sendWelcome, sendShortageAlertEmail, sendDailySummaryEmail, sendCashierJoinedEmail };
