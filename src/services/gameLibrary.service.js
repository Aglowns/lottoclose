const supabase = require('../db/supabase');

/**
 * Syncs the global game library for a given state.
 *
 * - Games in `incoming` but NOT in library → inserted as active
 * - Games in BOTH → price/name updated if changed
 * - Games in library but NOT in `incoming` → marked inactive (retired)
 *
 * @param {string} stateCode  e.g. "NC"
 * @param {Array<{gameNumber: number, name: string, price: number}>} incoming
 * @returns {{ added: number, updated: number, retired: number }}
 */
async function syncGameLibrary(stateCode, incoming) {
  const state = stateCode.toUpperCase();

  // Load existing library rows for this state
  const { data: existing, error } = await supabase
    .from('games')
    .select('id, game_number, name, price, status')
    .is('store_id', null)
    .eq('state', state);

  if (error) throw new Error(`Failed to load library: ${error.message}`);

  const existingByNumber = new Map(
    (existing ?? []).map((g) => [String(g.game_number), g]),
  );
  const incomingByNumber = new Map(
    incoming.map((g) => [String(g.gameNumber), g]),
  );

  let added = 0;
  let updated = 0;
  let retired = 0;

  // ── Insert new games ───────────────────────────────────────────────
  const toInsert = [];
  for (const [num, game] of incomingByNumber) {
    if (!existingByNumber.has(num)) {
      toInsert.push({
        game_number: game.gameNumber,
        name: game.name,
        price: game.price,
        state,
        status: 'active',
        source: 'scraped',
        store_id: null,
      });
    }
  }
  if (toInsert.length) {
    const { error: insertErr } = await supabase.from('games').insert(toInsert);
    if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);
    added = toInsert.length;
  }

  // ── Update changed games & re-activate previously retired ones ─────
  for (const [num, existing_] of existingByNumber) {
    const incoming_ = incomingByNumber.get(num);
    if (!incoming_) continue; // handled in retire step

    const nameChanged = existing_.name !== incoming_.name;
    const priceChanged = parseFloat(existing_.price) !== parseFloat(incoming_.price);
    const wasRetired = existing_.status !== 'active';

    if (nameChanged || priceChanged || wasRetired) {
      await supabase
        .from('games')
        .update({
          name: incoming_.name,
          price: incoming_.price,
          status: 'active',
        })
        .eq('id', existing_.id);
      updated++;
    }
  }

  // ── Retire games no longer in the incoming list ────────────────────
  const toRetire = [];
  for (const [num, existing_] of existingByNumber) {
    if (!incomingByNumber.has(num) && existing_.status === 'active') {
      toRetire.push(existing_.id);
    }
  }
  if (toRetire.length) {
    const { error: retireErr } = await supabase
      .from('games')
      .update({ status: 'inactive' })
      .in('id', toRetire);
    if (retireErr) throw new Error(`Retire failed: ${retireErr.message}`);
    retired = toRetire.length;
  }

  console.log(
    `[GameLibrary] ${state} sync complete — +${added} added, ~${updated} updated, -${retired} retired`,
  );

  return { added, updated, retired };
}

module.exports = { syncGameLibrary };
