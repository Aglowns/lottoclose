const cron = require('node-cron');
const supabase = require('../db/supabase');
const { sendDailySummary } = require('../services/notification.service');
const { sendDailySummaryEmail } = require('../services/email.service');

// Runs every day at 11 PM Eastern (03:00 UTC)
function startDailySummaryJob() {
  cron.schedule('0 3 * * *', async () => {
    console.log('[DailySummary] Running end-of-day summary job...');
    try {
      await sendSummariesToAllStores();
    } catch (err) {
      console.error('[DailySummary] Job failed:', err.message);
    }
  });
}

async function sendSummariesToAllStores() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Get all stores with an owner FCM token
  const { data: owners } = await supabase
    .from('users')
    .select('store_id, fcm_token, email, name, stores(name)')
    .eq('role', 'owner')
    .eq('status', 'active');

  if (!owners?.length) return;

  for (const owner of owners) {
    const storeName = owner.stores?.name ?? 'Your store';

    // Get today's closed shifts for this store
    const { data: shifts } = await supabase
      .from('shifts')
      .select('total_sales, over_short')
      .eq('store_id', owner.store_id)
      .eq('status', 'closed')
      .gte('closed_at', todayStart.toISOString())
      .lte('closed_at', todayEnd.toISOString());

    if (!shifts?.length) continue;

    const totalSales = shifts.reduce((sum, s) => sum + parseFloat(s.total_sales ?? 0), 0);
    const shortageCount = shifts.filter((s) => s.over_short !== null && s.over_short < -5).length;

    if (owner.fcm_token) {
      await sendDailySummary({
        ownerFcmToken: owner.fcm_token,
        storeName,
        totalSales,
        shiftCount: shifts.length,
        shortageCount,
      });
    }

    if (owner.email) {
      await sendDailySummaryEmail({
        to: owner.email,
        ownerName: owner.name ?? 'there',
        storeName,
        totalSales,
        shiftCount: shifts.length,
        shortageCount,
      });
    }
  }
}

module.exports = { startDailySummaryJob };
