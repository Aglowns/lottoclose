-- Add online lottery sales (Powerball, Mega Millions, etc.) to shift reconciliation.
-- Cashier reads this number from the lottery terminal's end-of-shift slip and
-- enters it manually. Included in over_short calc:
--   over_short = cash_in_drawer - (total_sales + online_lottery_sales)

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS online_lottery_sales DECIMAL(10,2);
