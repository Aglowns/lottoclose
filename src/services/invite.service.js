const supabase = require('../db/supabase');
const { generateInviteCode } = require('../utils/codeGenerator');

async function createInviteCode(storeId, createdBy) {
  let code;
  let attempts = 0;

  // Retry on the rare collision
  while (attempts < 5) {
    code = generateInviteCode();
    const { data: existing } = await supabase
      .from('invite_codes')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (!existing) break;
    attempts++;
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('invite_codes')
    .insert({ store_id: storeId, code, created_by: createdBy, expires_at: expiresAt })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function redeemInviteCode(code) {
  const { data: invite, error } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!invite) throw Object.assign(new Error('Invalid invite code.'), { status: 400 });
  if (invite.used_by) throw Object.assign(new Error('Invite code already used.'), { status: 400 });
  if (new Date(invite.expires_at) < new Date()) {
    throw Object.assign(new Error('Invite code has expired.'), { status: 400 });
  }

  return invite;
}

async function markInviteUsed(inviteId, userId) {
  await supabase
    .from('invite_codes')
    .update({ used_by: userId, used_at: new Date().toISOString() })
    .eq('id', inviteId);
}

module.exports = { createInviteCode, redeemInviteCode, markInviteUsed };
