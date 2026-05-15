const supabase = require('../db/supabase');

// Gates any route behind an active subscription.
// Passes through if:
//   - store is on an active paid subscription (subscription_tier = 'pro')
//   - store is within their free trial window
// Returns 402 if trial has expired and tier is not pro.
// Cashiers inherit their store's subscription state — if the owner's trial
// is expired, cashiers are also blocked until the owner upgrades.
async function requireActiveSubscription(req, res, next) {
  const { storeId } = req.user;

  const { data: store, error } = await supabase
    .from('stores')
    .select('subscription_tier, trial_ends_at')
    .eq('id', storeId)
    .single();

  if (error) return next(new Error(error.message));

  // Pro subscribers always pass.
  if (store.subscription_tier === 'pro') return next();

  // Trial stores pass if trial hasn't expired.
  if (store.trial_ends_at) {
    const trialEnd = new Date(store.trial_ends_at);
    if (trialEnd > new Date()) return next();
  }

  return res.status(402).json({
    error: 'Your free trial has ended. Please upgrade to continue using LottoClose.',
    code: 'SUBSCRIPTION_REQUIRED',
  });
}

module.exports = requireActiveSubscription;
