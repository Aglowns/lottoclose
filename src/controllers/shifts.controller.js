const supabase = require('../db/supabase');
const { recalculateAndCloseShift } = require('../services/shift.service');
const { sendPackActivated, sendShiftEdited, sendShiftStarted } = require('../services/notification.service');

// POST /shifts/open
async function openShift(req, res) {
  const { sub: userId, storeId } = req.user;

  // Reject if already has an open shift
  const { data: existing } = await supabase
    .from('shifts')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'You already have an open shift.' });
  }

  const { data: shift, error } = await supabase
    .from('shifts')
    .insert({
      store_id: storeId,
      user_id: userId,
      status: 'open',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Notify owner that cashier tapped Start Shift
  const { data: owner } = await supabase
    .from('users')
    .select('fcm_token')
    .eq('store_id', storeId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (owner?.fcm_token) {
    const { data: store } = await supabase
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .maybeSingle();

    const { data: cashier } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    sendShiftStarted({
      ownerFcmToken: owner.fcm_token,
      cashierName: cashier?.name ?? 'Cashier',
      storeName: store?.name ?? 'Your store',
    }).catch(() => {});
  }

  res.status(201).json(shift);
}

// GET /shifts/current
async function getCurrentShift(req, res) {
  const { sub: userId } = req.user;

  const { data: shift, error } = await supabase
    .from('shifts')
    .select('*, users(name), shift_scans(*, games(name, price))')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('started_at', { ascending: false })
    .maybeSingle();

  if (error) throw new Error(error.message);
  res.json(shift ?? null);
}

// GET /shifts/carryover
async function getCarryover(req, res) {
  const { storeId } = req.user;

  const { data, error } = await supabase
    .from('carryover')
    .select('*')
    .eq('store_id', storeId);

  if (error) throw new Error(error.message);
  res.json(data);
}

// POST /shifts/activate-pack
// Body: { gameId, packNumber, startingTicket? }
// Resets carryover for this (store, game) so subsequent end-scans calculate
// from this new pack's starting point. Default startingTicket = 1.
async function activatePack(req, res) {
  const { storeId } = req.user;
  const { gameId, packNumber, startingTicket } = req.body;

  // Confirm the game exists in this store
  const { data: game } = await supabase
    .from('games')
    .select('id, name')
    .eq('id', gameId)
    .eq('store_id', storeId)
    .maybeSingle();

  if (!game) {
    return res.status(404).json({ error: 'Game not found in your store.' });
  }

  // last_ticket_number = startingTicket - 1 so end-of-shift scan computes
  // tickets_sold = end - (start - 1) = end - start + 1, counting the first
  // ticket of the pack as one ticket sold.
  const start = startingTicket ?? 1;
  const lastTicket = Math.max(0, start - 1);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('carryover')
    .upsert(
      {
        store_id: storeId,
        game_id: gameId,
        pack_number: String(packNumber),
        last_ticket_number: lastTicket,
        last_shift_id: null,
        updated_at: now,
      },
      { onConflict: 'store_id,game_id' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Notify owner that a new pack was activated
  const { data: owner } = await supabase
    .from('users')
    .select('fcm_token, name')
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

  const { data: callerUser } = await supabase
    .from('users')
    .select('name')
    .eq('id', req.user.sub)
    .maybeSingle();

  if (owner?.fcm_token) {
    sendPackActivated({
      ownerFcmToken: owner.fcm_token,
      cashierName: callerUser?.name ?? 'Cashier',
      gameName: game.name,
      packNumber,
      storeName: store?.name ?? 'Your store',
    }).catch(() => {});
  }

  res.status(201).json(data);
}

// POST /shifts/:id/scan
async function addScan(req, res) {
  const { id: shiftId } = req.params;
  const { sub: userId, storeId } = req.user;
  const { gameId, packNumber, endTicket, scanMethod, isNewRoll } = req.body;

  const shift = await requireOwnOpenShift(shiftId, userId);

  // Look up game price
  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select('id, price, name')
    .eq('id', gameId)
    .eq('store_id', storeId)
    .maybeSingle();

  if (gameErr) throw new Error(gameErr.message);
  if (!game) return res.status(404).json({ error: 'Game not found in your store.' });

  // Determine startTicket from carryover (or 1 for brand-new game)
  let startTicket = 1;

  if (!isNewRoll) {
    const { data: carry } = await supabase
      .from('carryover')
      .select('last_ticket_number')
      .eq('store_id', storeId)
      .eq('game_id', gameId)
      .maybeSingle();

    startTicket = carry?.last_ticket_number ?? 1;
  }

  if (endTicket < startTicket) {
    return res.status(400).json({
      error: `End ticket (${endTicket}) must be ≥ start ticket (${startTicket}). Mark roll as finished if pack changed.`,
    });
  }

  const ticketsSold = endTicket - startTicket;
  const dollarAmount = parseFloat((ticketsSold * game.price).toFixed(2));

  const { data: scan, error: scanErr } = await supabase
    .from('shift_scans')
    .insert({
      shift_id: shiftId,
      game_id: gameId,
      pack_number: packNumber ?? '',
      start_ticket: startTicket,
      end_ticket: endTicket,
      tickets_sold: ticketsSold,
      dollar_amount: dollarAmount,
      is_new_roll: isNewRoll ?? false,
      scan_method: scanMethod ?? 'camera',
      scanned_at: new Date().toISOString(),
    })
    .select('*, games(name, price)')
    .single();

  if (scanErr) throw new Error(scanErr.message);
  res.status(201).json(scan);
}

// DELETE /shifts/:id/scan/:scanId
async function deleteScan(req, res) {
  const { id: shiftId, scanId } = req.params;
  const { sub: userId } = req.user;

  await requireOwnOpenShift(shiftId, userId);

  const { error } = await supabase
    .from('shift_scans')
    .delete()
    .eq('id', scanId)
    .eq('shift_id', shiftId);

  if (error) throw new Error(error.message);
  res.status(204).send();
}

// POST /shifts/:id/close
async function closeShift(req, res) {
  const { id: shiftId } = req.params;
  const { sub: userId } = req.user;
  const { cashInDrawer, cashToOwner, onlineLotterySales, drawerFloatUsed, notes } = req.body;

  const shift = await requireOwnOpenShift(shiftId, userId);

  const { data: callerUser } = await supabase
    .from('users')
    .select('name')
    .eq('id', userId)
    .single();

  const closedShift = await recalculateAndCloseShift(
    shift,
    cashInDrawer ?? null,
    cashToOwner ?? null,
    onlineLotterySales ?? null,
    drawerFloatUsed ?? null,
    notes ?? null,
    callerUser ?? { name: 'Cashier' },
  );

  res.json(closedShift);
}

// PATCH /shifts/:id/details
// Lets the cashier correct the closing numbers/notes after closing the shift.
// Recomputes over_short whenever cashInDrawer/cashToOwner/onlineLotterySales change.
async function updateShiftDetails(req, res) {
  const { id: shiftId } = req.params;
  const { sub: userId } = req.user;
  const { cashInDrawer, cashToOwner, onlineLotterySales, notes } = req.body;

  const { data: shift, error: fetchErr } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!shift) return res.status(404).json({ error: 'Shift not found.' });

  const { role, storeId } = req.user;
  // Owners can edit any shift in their store; cashiers can only edit their own.
  const isOwner = role === 'owner' && shift.store_id === storeId;
  if (!isOwner && shift.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const nextCashInDrawer = cashInDrawer !== undefined ? cashInDrawer : shift.cash_in_drawer;
  const nextCashToOwner = cashToOwner !== undefined ? cashToOwner : shift.cash_to_owner;
  const nextOnline = onlineLotterySales !== undefined
    ? onlineLotterySales
    : shift.online_lottery_sales;

  const totalRevenue = parseFloat(shift.total_sales ?? 0) + parseFloat(nextOnline ?? 0);
  const expectedToOwner = nextCashInDrawer != null
    ? parseFloat((totalRevenue - nextCashInDrawer).toFixed(2))
    : null;
  // Suppress over/short when expected is negative (data entry issue).
  const overShort = (nextCashToOwner != null && expectedToOwner != null && expectedToOwner >= 0)
    ? parseFloat((nextCashToOwner - expectedToOwner).toFixed(2))
    : null;

  const updates = {
    cash_in_drawer: nextCashInDrawer,
    cash_to_owner: nextCashToOwner,
    online_lottery_sales: nextOnline,
    over_short: overShort,
  };
  if (notes !== undefined) updates.notes = notes;

  const { error: updateErr } = await supabase
    .from('shifts')
    .update(updates)
    .eq('id', shiftId);
  if (updateErr) throw new Error(updateErr.message);

  const { data: full, error: refetchErr } = await supabase
    .from('shifts')
    .select('*, users(name), shift_scans(*, games(name, price))')
    .eq('id', shiftId)
    .single();
  if (refetchErr) throw new Error(refetchErr.message);

  // Notify owner when a cashier edits their own closed shift
  const editedByOwner = role === 'owner';
  if (!editedByOwner) {
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

    const { data: callerUser } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    if (owner?.fcm_token) {
      sendShiftEdited({
        ownerFcmToken: owner.fcm_token,
        cashierName: callerUser?.name ?? 'Cashier',
        storeName: store?.name ?? 'Your store',
        shiftId,
        newOverShort: overShort,
      }).catch(() => {});
    }
  }

  res.json(full);
}

// GET /shifts/:id
async function getShift(req, res) {
  const { id: shiftId } = req.params;
  const { sub: userId, storeId, role } = req.user;

  const { data: shift, error } = await supabase
    .from('shifts')
    .select('*, users(name), shift_scans(*, games(name, price))')
    .eq('id', shiftId)
    .single();

  if (error || !shift) return res.status(404).json({ error: 'Shift not found.' });

  if (shift.store_id !== storeId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  if (role === 'cashier' && shift.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  res.json(shift);
}

// GET /shifts
async function listShifts(req, res) {
  const { sub: userId, storeId, role } = req.user;
  const { userId: queryUserId, dateFrom, dateTo, limit = 30 } = req.query;

  let query = supabase
    .from('shifts')
    .select('*, users(name), shift_scans(*, games(name, price))')
    .eq('store_id', storeId)
    .order('started_at', { ascending: false })
    .limit(parseInt(limit, 10));

  // Cashiers can only see their own shifts
  if (role === 'cashier') {
    query = query.eq('user_id', userId);
  } else if (queryUserId) {
    query = query.eq('user_id', queryUserId);
  }

  if (dateFrom) query = query.gte('started_at', dateFrom);
  if (dateTo) query = query.lte('started_at', dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  res.json(data);
}

// ── Shared helper ─────────────────────────────────────────────────────────────

async function requireOwnOpenShift(shiftId, userId) {
  const { data: shift, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!shift) throw Object.assign(new Error('Shift not found.'), { status: 404 });
  if (shift.user_id !== userId) {
    throw Object.assign(new Error('Forbidden.'), { status: 403 });
  }
  if (shift.status !== 'open') {
    throw Object.assign(new Error('Shift is already closed.'), { status: 409 });
  }
  return shift;
}

module.exports = {
  openShift,
  getCurrentShift,
  getCarryover,
  activatePack,
  addScan,
  deleteScan,
  closeShift,
  updateShiftDetails,
  getShift,
  listShifts,
};
