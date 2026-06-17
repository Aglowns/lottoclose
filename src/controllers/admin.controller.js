const supabase = require('../db/supabase');
const { syncGameLibrary } = require('../services/gameLibrary.service');

// POST /api/v1/admin/library/sync
// Body: { state: "NC", games: [{ gameNumber, name, price }] }
async function syncLibrary(req, res) {
  const { state, games } = req.body;

  if (!state || !Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: 'state and games[] are required.' });
  }

  // Basic validation on each game entry
  const invalid = games.filter(
    (g) =>
      typeof g.gameNumber !== 'number' ||
      typeof g.name !== 'string' ||
      !g.name.trim() ||
      typeof g.price !== 'number' ||
      g.price <= 0,
  );
  if (invalid.length) {
    return res.status(400).json({
      error: `${invalid.length} game(s) have invalid fields. Each needs: gameNumber (int), name (string), price (number > 0).`,
      sample: invalid[0],
    });
  }

  const result = await syncGameLibrary(state, games);

  // Count total active library games for the state
  const { count } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .is('store_id', null)
    .eq('state', state.toUpperCase())
    .eq('status', 'active');

  res.json({ ...result, total: count ?? 0 });
}

// GET /api/v1/admin/library/status
async function libraryStatus(req, res) {
  const { data, error } = await supabase
    .from('games')
    .select('state, status, updated_at')
    .is('store_id', null)
    .order('state');

  if (error) throw new Error(error.message);

  // Group by state
  const summary = {};
  for (const g of data ?? []) {
    if (!summary[g.state]) summary[g.state] = { active: 0, inactive: 0, lastUpdated: null };
    summary[g.state][g.status === 'active' ? 'active' : 'inactive']++;
    const t = g.updated_at ?? g.created_at;
    if (t && (!summary[g.state].lastUpdated || t > summary[g.state].lastUpdated)) {
      summary[g.state].lastUpdated = t;
    }
  }

  res.json(summary);
}

module.exports = { syncLibrary, libraryStatus };
