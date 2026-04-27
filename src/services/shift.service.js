const supabase = require('../db/supabase');
const { sendShortageAlert } = require('./notification.service');

async function recalculateAndCloseShift(shift, cashInDrawer, onlineLotterySales, drawerFloatUsed, notes, callerUser) {
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

  // cashInDrawer represents the cash the cashier handed in to the owner
  // (after they separated and kept the float for the next shift).
  // expectedCash = lotteryTotal + onlineLotterySales.
  // overShort = cashInDrawer - expectedCash (negative = short, positive = over).
  const expectedCash = totalSales + (onlineLotterySales ?? 0);
  const overShort = cashInDrawer != null
    ? parseFloat((cashInDrawer - expectedCash).toFixed(2))
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

  // Send shortage notification if over_short < -5.00
  if (overShort !== null && overShort < -5.0) {
    const { data: owner } = await supabase
      .from('users')
      .select('fcm_token, name')
      .eq('store_id', storeId)
      .eq('role', 'owner')
      .eq('status', 'active')
      .limit(1)
      .single();

    const { data: store } = await supabase
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .single();

    if (owner?.fcm_token) {
      await sendShortageAlert({
        ownerFcmToken: owner.fcm_token,
        cashierName: callerUser.name,
        amount: overShort,
        storeName: store?.name ?? 'Your store',
      });
    }
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
