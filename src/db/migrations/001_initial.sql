-- LottoClose initial schema
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  address VARCHAR(255),
  subscription_tier VARCHAR(20) DEFAULT 'trial',
  trial_ends_at TIMESTAMP,
  commission_rate DECIMAL(4,2) DEFAULT 7.00,
  stripe_customer_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  email VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255),
  name VARCHAR(80) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('owner', 'cashier')),
  pin VARCHAR(255),
  fcm_token TEXT,
  status VARCHAR(15) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  code VARCHAR(7) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL,
  used_by UUID REFERENCES users(id),
  used_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),  -- NULL for library games
  game_number INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(5,2) NOT NULL,
  state VARCHAR(2) NOT NULL,
  status VARCHAR(10) DEFAULT 'active',
  source VARCHAR(10) DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(10) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  started_at TIMESTAMP NOT NULL,
  closed_at TIMESTAMP,
  total_tickets_sold INTEGER DEFAULT 0,
  total_sales DECIMAL(10,2) DEFAULT 0.00,
  cash_in_drawer DECIMAL(10,2),
  over_short DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shift_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id),
  pack_number VARCHAR(20) NOT NULL DEFAULT '',
  start_ticket INTEGER NOT NULL,
  end_ticket INTEGER NOT NULL,
  tickets_sold INTEGER NOT NULL,
  dollar_amount DECIMAL(8,2) NOT NULL,
  is_new_roll BOOLEAN DEFAULT false,
  scan_method VARCHAR(10) DEFAULT 'camera',
  scanned_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carryover (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  game_id UUID NOT NULL REFERENCES games(id),
  pack_number VARCHAR(20) NOT NULL DEFAULT '',
  last_ticket_number INTEGER NOT NULL,
  last_shift_id UUID REFERENCES shifts(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (store_id, game_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_shifts_store_date ON shifts(store_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_scans_shift ON shift_scans(shift_id);
CREATE INDEX IF NOT EXISTS idx_games_store ON games(store_id, status);
CREATE INDEX IF NOT EXISTS idx_carryover_store_game ON carryover(store_id, game_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_code ON invite_codes(code);
