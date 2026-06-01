const supabase = require('../db/supabase');
const { sendShiftClosed } = require('./notification.service');

async function recalculateAndCloseShift(shift, cashInDrawer, cashToOwner, onlineLotterySales, drawerFloatUsed, notes, callerUser) {
  const shiftId = shift.id;
  const storeId = shift.store_id;

  // Fetch all scans with joined game price
  const { data: scans, error: scansErr } = await supabase
    .from('shift_scans')
    .select('*, games(price, name)')
    .eq('shift_id', shiftId);

  if (scansErr) throw new Error(scansErr.message);

  // Recalculate totals per scan
  let totalSales = 0;
  let totalTicketsSold = 0;

  const updatedScans = scans.map((scan) => {
    const gamePrice = scan.games?.price ?? 0;
    const ticketsSold = scan.end_ticket - scan.start_ticket;
    const dollarAmount = ticketsSold * gamePrice;
    totalSales += dollarAmount;
    totalTicketsSold += ticketsSold;
    return { id: scan.id, tickets_sold: ticketsSold, dollar_amount: dollarAmount };
  });

  // Patch each scan with recalculated values
  for (const s of updatedScans) {
    await supabase
      .from('shift_scans')
      .update({ tickets_sold: s.tickets_sold, dollar_amount: s.dollar_amount })
      .eq('id', s.id);
  }

  // cashInDrawer = cash the cashier left in the drawer for the next shift
  // (varies per shift — cashier decides). cashToOwner = cash physically counted
  // to hand to the owner. Reconciliation:
  //   expectedToOwner = totalSales + onlineLotterySales - cashInDrawer
  //   overShort = cashToOwner - expectedToOwner (only when cashToOwner given).
  const totalRevenue = totalSales + (onlineLotterySales ?? 0);
  const expectedToOwner = cashInDrawer != null
    ? parseFloat((totalRevenue - cashInDrawer).toFixed(2))
    : null;
  // Suppress over/short when expected is negative (cashier left more cash than
  // the shift earned — data entry issue, not a real shortage).
  const overShort = (cashToOwner != null && expectedToOwner != null && expectedToOwner >= 0)
    ? parseFloat((cashToOwner - expectedToOwner).toFixed(2))
    : null;

  const now = new Date().toISOString();

  // Close the shift
  const { error: closeErr } = await supabase
    .from('shifts')
    .update({
      status: 'closed',
      closed_at: now,
      total_tickets_sold: totalTicketsSold,
      total_sales: parseFloat(totalSales.toFixed(2)),
      cash_in_drawer: cashInDrawer ?? null,
      cash_to_owner: cashToOwner ?? null,
      online_lottery_sales: onlineLotterySales ?? null,
      over_short: overShort,
      notes: notes ?? null,
    })
    .eq('id', shiftId)
    .select()
    .single();

  if (closeErr) throw new Error(closeErr.message);

  // Upsert carryover for each game scanned
  for (const scan of scans) {
    await supabase.from('carryover').upsert(
      {
        store_id: storeId,
        game_id: scan.game_id,
        pack_number: scan.pack_number,
        last_ticket_number: scan.end_ticket,
        last_shift_id: shiftId,
        updated_at: now,
      },
      { onConflict: 'store_id,game_id' },
    );
  }

  // Fetch owner FCM token + store name once for all notifications below.
  const { data: owner } = await supabase
    .from('users')
    .select('fcm_token')
    .eq('store_id', storeId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  const { data: store } = await supabase
    .from('stores')
    .select('name')
    .eq('id', storeId)
    .maybeSingle();

  const storeName = store?.name ?? 'Your store';

  // Notify owner — single rich notification covering both closed + shortage.
  if (owner?.fcm_token) {
    await sendShiftClosed({
      ownerFcmToken: owner.fcm_token,
      cashierName: callerUser.name,
      totalSales: parseFloat(totalSales.toFixed(2)),
      storeName,
      shiftId,
      packCount: scans.length,
      overShort,
    });
  }

  // Return full shift with scans
  const { data: fullShift, error: fetchErr } = await supabase
    .from('shifts')
    .select('*, shift_scans(*, games(name, price))')
    .eq('id', shiftId)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);
  return fullShift;
}

module.exports = { recalculateAndCloseShift };
