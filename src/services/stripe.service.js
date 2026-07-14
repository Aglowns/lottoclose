const Stripe = require('stripe');
const supabase = require('../db/supabase');

let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw Object.assign(new Error('Billing is not configured on this server.'), { status: 503 });
  }
  _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

async function getOrCreateCustomer(store, ownerEmail) {
  if (store.stripe_customer_id) return store.stripe_customer_id;

  const customer = await getStripe().customers.create({
    email: ownerEmail,
    name: store.name,
    metadata: { store_id: store.id },
  });

  const { error } = await supabase
    .from('stores')
    .update({ stripe_customer_id: customer.id })
    .eq('id', store.id);
  if (error) throw new Error(error.message);

  return customer.id;
}

async function createCheckoutSession({ customerId, storeId, successUrl, cancelUrl }) {
  return getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: successUrl ?? process.env.STRIPE_SUCCESS_URL,
    cancel_url: cancelUrl ?? process.env.STRIPE_CANCEL_URL,
    client_reference_id: storeId,
    metadata: { store_id: storeId },
  });
}

function constructWebhookEvent(rawBody, signature) {
  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );
}

async function syncSubscriptionToStore(subscription) {
  const storeId = subscription.metadata?.store_id;
  if (!storeId) return;

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const updates = {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    current_period_end: periodEnd,
    subscription_tier: subscription.status === 'active' || subscription.status === 'trialing'
      ? 'pro'
      : 'free',
  };

  const { error } = await supabase.from('stores').update(updates).eq('id', storeId);
  if (error) throw new Error(error.message);
}

module.exports = {
  getStripe,
  getOrCreateCustomer,
  createCheckoutSession,
  constructWebhookEvent,
  syncSubscriptionToStore,
};
