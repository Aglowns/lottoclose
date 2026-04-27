const supabase = require('../db/supabase');
const { createInviteCode } = require('../services/invite.service');

// GET /store
async function getStore(req, res) {
  const { storeId } = req.user;
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .single();

  if (error) throw new Error(error.message);
  res.json(data);
}

// PUT /store
async function updateStore(req, res) {
  const { storeId } = req.user;
  const { name, address, drawerFloat } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (drawerFloat !== undefined) updates.drawer_float = drawerFloat;

  const { data, error } = await supabase
    .from('stores')
    .update(updates)
    .eq('id', storeId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  res.json(data);
}

// GET /store/employees
async function listEmployees(req, res) {
  const { storeId } = req.user;
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, status, created_at')
    .eq('store_id', storeId)
    .order('created_at');

  if (error) throw new Error(error.message);
  res.json(data);
}

// POST /store/employees/invite
async function createInvite(req, res) {
  const { storeId, sub: userId } = req.user;
  const invite = await createInviteCode(storeId, userId);
  res.status(201).json(invite);
}

// DELETE /store/employees/:id
async function deactivateEmployee(req, res) {
  const { storeId } = req.user;
  const { id } = req.params;

  const { error } = await supabase
    .from('users')
    .update({ status: 'inactive' })
    .eq('id', id)
    .eq('store_id', storeId)
    .eq('role', 'cashier'); // owners cannot be deactivated this way

  if (error) throw new Error(error.message);
  res.status(204).send();
}

// PUT /store/fcm-token  (owner registers their device token for push notifications)
async function updateFcmToken(req, res) {
  const { sub: userId } = req.user;
  const { fcmToken } = req.body;

  const { error } = await supabase
    .from('users')
    .update({ fcm_token: fcmToken })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  res.status(204).send();
}

module.exports = {
  getStore,
  updateStore,
  listEmployees,
  createInvite,
  deactivateEmployee,
  updateFcmToken,
};
