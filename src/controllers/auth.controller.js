const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');
const { signTokens } = require('../utils/jwt');
const { redeemInviteCode, markInviteUsed } = require('../services/invite.service');

// POST /auth/signup
async function signup(req, res) {
  const { storeName, state, email, password, name } = req.body;

  const passwordHash = await bcrypt.hash(password, 12);

  // Create store
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .insert({ name: storeName, state })
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

  const tokens = signTokens(user);
  res.status(201).json({ ...tokens, user: formatUser(user), store });
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
  const { storeId, name, pin } = req.body;

  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('store_id', storeId)
    .eq('role', 'cashier')
    .eq('status', 'active')
    .ilike('name', name.trim());

  if (!users?.length) {
    return res.status(401).json({ error: 'No cashier found with that name.' });
  }

  let user = null;
  for (const u of users) {
    if (await bcrypt.compare(pin, u.pin)) {
      user = u;
      break;
    }
  }

  if (!user) return res.status(401).json({ error: 'Invalid name or PIN.' });

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', user.store_id)
    .single();

  const tokens = signTokens(user);
  res.json({ ...tokens, user: formatUser(user), store });
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

function formatUser(user) {
  const { password_hash, pin, ...safe } = user;
  return safe;
}

module.exports = { signup, login, pinLogin, join, refresh, me };
