const cron = require('node-cron');
const { Resend } = require('resend');

// Instantiated lazily so missing env var doesn't crash on require
let _resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'aglonoop@gmail.com';
const API_BASE = process.env.API_BASE_URL ?? 'https://lottoclose-api.onrender.com';

// Runs on the 1st of every month at 9 AM Eastern (13:00 UTC)
function startGameLibraryReminderJob() {
  cron.schedule('0 13 1 * *', async () => {
    console.log('[GameLibraryReminder] Sending monthly library update reminder...');
    try {
      await sendReminderEmail();
    } catch (err) {
      console.error('[GameLibraryReminder] Failed:', err.message);
    }
  });
}

async function sendReminderEmail() {
  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  await getResend().emails.send({
    from: 'LottoClose <noreply@lottoclose.com>',
    to: ADMIN_EMAIL,
    subject: `[LottoClose] Monthly Game Library Update — ${month}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: #1D6B3F; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">LottoClose — Game Library Reminder</h1>
        </div>
        <div style="background: #f8f7f4; padding: 24px; border-radius: 0 0 12px 12px;">
          <p>It's the 1st of the month — time to check if NC Lottery has released any new scratch-off games.</p>

          <h3 style="color: #1D6B3F;">Steps to update:</h3>
          <ol>
            <li>Visit <a href="https://www.nclottery.com/Scratch-Offs">nclottery.com/Scratch-Offs</a> and note any new games or retired games.</li>
            <li>Prepare a JSON payload with the <strong>full current list</strong> of active games for NC.</li>
            <li>Send a POST request to the sync endpoint (see below).</li>
          </ol>

          <h3 style="color: #1D6B3F;">Sync endpoint</h3>
          <pre style="background:#eee;padding:16px;border-radius:8px;font-size:13px;overflow-x:auto;">
POST ${API_BASE}/api/v1/admin/library/sync
Headers:
  x-admin-secret: YOUR_ADMIN_SECRET
  Content-Type: application/json

Body:
{
  "state": "NC",
  "games": [
    { "gameNumber": 901, "name": "10X The Money", "price": 1 },
    { "gameNumber": 902, "name": "Gold Rush",     "price": 2 },
    ...
  ]
}
          </pre>

          <h3 style="color: #1D6B3F;">Response</h3>
          <pre style="background:#eee;padding:16px;border-radius:8px;font-size:13px;">
{ "added": 3, "updated": 1, "retired": 2, "total": 87 }
          </pre>

          <p style="color:#888;font-size:12px;margin-top:24px;">
            New games added to the library are automatically available to all store owners
            via their "Add from Library" screen. Retired games are marked inactive and
            hidden from new stores but kept in history records.
          </p>
        </div>
      </div>
    `,
  });

  console.log(`[GameLibraryReminder] Reminder sent to ${ADMIN_EMAIL}`);
}

module.exports = { startGameLibraryReminderJob };
