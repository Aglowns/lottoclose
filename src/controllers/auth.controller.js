const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');
const { signTokens } = require('../utils/jwt');
const { redeemInviteCode, markInviteUsed } = require('../services/invite.service');
const { sendCashierJoined } = require('../services/notification.service');
const { sendWelcome, sendCashierJoinedEmail } = require('../services/email.service');

// POST /auth/signup
async function signup(req, res) {
  const { storeName, state, email, password, name } = req.body;

  const passwordHash = await bcrypt.hash(password, 12);

  // Create store
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .insert({ name: storeName, state, trial_ends_at: trialEndsAt })
    .select()
    .single();

  if (storeErr) throw new Error(storeErr.message);

  // Create owner user
  const { data: user, error: userErr } = await supabase
    .from('users')
    .insert({
      store_id: store.id,
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      name: name ?? email.split('@')[0],
      role: 'owner',
    })
    .select()
    .single();

  if (userErr) {
    // Roll back store on duplicate email
    await supabase.from('stores').delete().eq('id', store.id);
    if (userErr.code === '23505') {
      return res.status(409).json({ error: 'Email already in use.' });
    }
    throw new Error(userErr.message);
  }

  // Auto-import the state's scratch-off library so the store has a working
  // price book on day one. Owner can deactivate games they don't sell from
  // the Price Book screen.
  await seedStoreFromLibrary(store.id, state);

  // Send welcome email (fire-and-forget)
  sendWelcome({
    to: email.toLowerCase().trim(),
    ownerName: user.name,
    storeName: store.name,
  }).catch(() => {});

  const tokens = signTokens(user);
  res.status(201).json({ ...tokens, user: formatUser(user), store });
}

async function seedStoreFromLibrary(storeId, stateCode) {
  const { data: library } = await supabase
    .from('games')
    .select('game_number, name, price, state, status, source')
    .is('store_id', null)
    .eq('state', stateCode.toUpperCase())
    .eq('status', 'active');

  if (!library || library.length === 0) return;

  const rows = library.map((g) => ({ ...g, store_id: storeId }));
  await supabase.from('games').insert(rows);
}

// POST /auth/login
async function login(req, res) {
  const { email, password } = req.body;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .eq('role', 'owner')
    .maybeSingle();

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Account deactivated.' });
  }

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', user.store_id)
    .single();

  const tokens = signTokens(user);
  res.json({ ...tokens, user: formatUser(user), store });
}

// POST /auth/pin-login
async function pinLogin(req, res) {
  const { userId, pin } = req.body;

  // Look up the ONE cashier being signed in and check the PIN against only
  // their hash. Previously this fetched every cashier in the store and
  // returned the first PIN match, so two cashiers who happened to pick the
  // same PIN could log into each other's account.
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .eq('role', 'cashier')
    .eq('status', 'active')
    .maybeSingle();

  if (!user || !user.pin || !(await bcrypt.compare(pin, user.pin))) {
    return res.status(401).json({ error: 'Incorrect PIN. Try again.' });
  }

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', user.store_id)
    .single();

  const tokens = signTokens(user);
  res.json({ ...tokens, user: formatUser(user), store });
}

// GET /auth/cashiers/:storeId
// Public list of a store's active cashiers (id + name only) so a returning
// cashier can pick who they are before entering their PIN. Never returns
// PINs, emails, or tokens.
async function storeCashiers(req, res) {
  const { storeId } = req.params;

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(storeId)) {
    return res.status(400).json({ error: 'Invalid store id.' });
  }

  const { data: cashiers } = await supabase
    .from('users')
    .select('id, name')
    .eq('store_id', storeId)
    .eq('role', 'cashier')
    .eq('status', 'active')
    .order('name');

  res.json({ cashiers: cashiers ?? [] });
}

// POST /auth/join
async function join(req, res) {
  const { code, name, pin } = req.body;

  const invite = await redeemInviteCode(code);

  const pinHash = await bcrypt.hash(pin, 12);

  const { data: user, error: userErr } = await supabase
    .from('users')
    .insert({
      store_id: invite.store_id,
      name: name.trim(),
      pin: pinHash,
      role: 'cashier',
    })
    .select()
    .single();

  if (userErr) throw new Error(userErr.message);

  await markInviteUsed(invite.id, user.id);

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', user.store_id)
    .single();

  // Notify owner (push + email) that a new cashier joined
  const { data: owner } = await supabase
    .from('users')
    .select('fcm_token, email, name')
    .eq('store_id', user.store_id)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  const storeName = store?.name ?? 'Your store';

  if (owner?.fcm_token) {
    sendCashierJoined({
      ownerFcmToken: owner.fcm_token,
      cashierName: user.name,
      storeName,
    }).catch(() => {});
  }

  if (owner?.email) {
    sendCashierJoinedEmail({
      to: owner.email,
      ownerName: owner.name ?? 'there',
      cashierName: user.name,
      storeName,
    }).catch(() => {});
  }

  const tokens = signTokens(user);
  res.status(201).json({ ...tokens, user: formatUser(user), store });
}

// POST /auth/refresh
async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required.' });

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }

  if (payload.type !== 'refresh') {
    return res.status(401).json({ error: 'Not a refresh token.' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', payload.sub)
    .maybeSingle();

  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'User not found or deactivated.' });
  }

  const tokens = signTokens(user);
  res.json(tokens);
}

// GET /auth/me
async function me(req, res) {
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user.sub)
    .maybeSingle();

  if (!user) return res.status(404).json({ error: 'User not found.' });

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', user.store_id)
    .single();

  res.json({ user: formatUser(user), store });
}

// DELETE /auth/account
// Lets a signed-in user delete their own account and data (App Store Guideline
// 5.1.1(v)). Owner => the whole store and everything under it. Cashier => just
// their own user and their shifts. FKs don't cascade (except shift_scans), so
// children are removed before parents.
async function deleteAccount(req, res) {
  const { sub: userId, storeId, role } = req.user;

  if (role === 'owner') {
    let r;
    r = await supabase.from('carryover').delete().eq('store_id', storeId);
    if (r.error) throw new Error(r.error.message);
    r = await supabase.from('shifts').delete().eq('store_id', storeId); // cascades shift_scans
    if (r.error) throw new Error(r.error.message);
    r = await supabase.from('games').delete().eq('store_id', storeId); // store games only (library rows have store_id null)
    if (r.error) throw new Error(r.error.message);
    r = await supabase.from('invite_codes').delete().eq('store_id', storeId);
    if (r.error) throw new Error(r.error.message);
    r = await supabase.from('users').delete().eq('store_id', storeId);
    if (r.error) throw new Error(r.error.message);
    r = await supabase.from('stores').delete().eq('id', storeId);
    if (r.error) throw new Error(r.error.message);
  } else {
    const { data: myShifts, error: sErr } = await supabase
      .from('shifts')
      .select('id')
      .eq('user_id', userId);
    if (sErr) throw new Error(sErr.message);
    const shiftIds = (myShifts ?? []).map((s) => s.id);

    let r;
    if (shiftIds.length) {
      r = await supabase
        .from('carryover')
        .update({ last_shift_id: null })
        .in('last_shift_id', shiftIds);
      if (r.error) throw new Error(r.error.message);
    }
    r = await supabase.from('shifts').delete().eq('user_id', userId); // cascades shift_scans
    if (r.error) throw new Error(r.error.message);
    r = await supabase.from('invite_codes').update({ used_by: null }).eq('used_by', userId);
    if (r.error) throw new Error(r.error.message);
    r = await supabase.from('users').delete().eq('id', userId);
    if (r.error) throw new Error(r.error.message);
  }

  res.json({ deleted: true });
}

function formatUser(user) {
  const { password_hash, pin, ...safe } = user;
  return safe;
}

module.exports = { signup, login, pinLogin, storeCashiers, join, refresh, me, deleteAccount };
