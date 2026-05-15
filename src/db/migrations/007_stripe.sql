-- Stripe subscription state on stores.
-- `stripe_customer_id` and `subscription_tier` already exist from 001_initial.sql.
-- This adds the fields needed to mirror Stripe's view of the subscription so
-- the app can show status, renewal date, and gate access when past_due/canceled.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
