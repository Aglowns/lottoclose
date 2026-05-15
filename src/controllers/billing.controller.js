const supabase = require('../db/supabase');
const {
  getStripe,
  getOrCreateCustomer,
  createCheckoutSession,
  constructWebhookEvent,
  syncSubscriptionToStore,
} = require('../services/stripe.service');

// POST /billing/checkout-session  (owner-only)
async function startCheckout(req, res) {
  const { storeId, sub: userId } = req.user;

  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, name, stripe_customer_id')
    .eq('id', storeId)
    .single();
  if (storeErr) throw new Error(storeErr.message);

  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();
  if (ownerErr) throw new Error(ownerErr.message);

  const customerId = await getOrCreateCustomer(store, owner.email);
  const session = await createCheckoutSession({ customerId, storeId });

  res.json({ url: session.url, sessionId: session.id });
}

// GET /billing/status
async function getStatus(req, res) {
  const { storeId } = req.user;
  const { data, error } = await supabase
    .from('stores')
    .select('subscription_tier, subscription_status, trial_ends_at, current_period_end')
    .eq('id', storeId)
    .single();
  if (error) throw new Error(error.message);

  res.json({
    tier: data.subscription_tier,
    status: data.subscription_status,
    trialEndsAt: data.trial_ends_at,
    currentPeriodEnd: data.current_period_end,
  });
}

// POST /billing/webhook  (Stripe → server; signature-verified, no auth middleware)
async function handleWebhook(req, res) {
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.subscription) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          // Stripe Checkout doesn't always copy session metadata onto the subscription,
          // so stamp store_id from the session if missing before we sync.
          if (!sub.metadata?.store_id && session.metadata?.store_id) {
            await stripe.subscriptions.update(sub.id, {
              metadata: { store_id: session.metadata.store_id },
            });
            sub.metadata = { ...sub.metadata, store_id: session.metadata.store_id };
          }
          await syncSubscriptionToStore(sub);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.created': {
        await syncSubscriptionToStore(event.data.object);
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { startCheckout, getStatus, handleWebhook };
