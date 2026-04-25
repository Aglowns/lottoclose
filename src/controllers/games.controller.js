const supabase = require('../db/supabase');

// GET /games
async function listGames(req, res) {
  const { storeId } = req.user;
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('name');

  if (error) throw new Error(error.message);
  res.json(data);
}

// GET /games/library/:state
async function getLibrary(req, res) {
  const { state } = req.params;
  // Library games are store_id = null (shared rows)
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .is('store_id', null)
    .eq('state', state.toUpperCase())
    .eq('status', 'active')
    .order('name');

  if (error) throw new Error(error.message);
  res.json(data);
}

// POST /games
async function addGame(req, res) {
  const { storeId } = req.user;
  const { gameNumber, name, price } = req.body;

  const { data, error } = await supabase
    .from('games')
    .insert({
      store_id: storeId,
      game_number: gameNumber,
      name,
      price,
      state: req.user.state ?? 'US',
      source: 'manual',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Game number already exists in your store.' });
    }
    throw new Error(error.message);
  }

  res.status(201).json(data);
}

// POST /games/bulk
async function bulkAddGames(req, res) {
  const { storeId } = req.user;
  const { gameIds } = req.body; // array of game ids from library

  // Fetch library games
  const { data: libraryGames, error: fetchErr } = await supabase
    .from('games')
    .select('*')
    .in('id', gameIds)
    .is('store_id', null);

  if (fetchErr) throw new Error(fetchErr.message);

  const rows = libraryGames.map(({ id: _id, ...g }) => ({
    ...g,
    store_id: storeId,
    source: 'scraped',
  }));

  const { data, error } = await supabase.from('games').insert(rows).select();
  if (error) throw new Error(error.message);
  res.status(201).json(data);
}

// PUT /games/:id
async function updateGame(req, res) {
  const { storeId } = req.user;
  const { id } = req.params;
  const { name, price, status } = req.body;

  const { data, error } = await supabase
    .from('games')
    .update({ name, price, status })
    .eq('id', id)
    .eq('store_id', storeId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) return res.status(404).json({ error: 'Game not found.' });
  res.json(data);
}

// DELETE /games/:id
async function deactivateGame(req, res) {
  const { storeId } = req.user;
  const { id } = req.params;

  const { error } = await supabase
    .from('games')
    .update({ status: 'inactive' })
    .eq('id', id)
    .eq('store_id', storeId);

  if (error) throw new Error(error.message);
  res.status(204).send();
}

module.exports = { listGames, getLibrary, addGame, bulkAddGames, updateGame, deactivateGame };
