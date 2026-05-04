-- Cash counted by the cashier to hand to the owner at end of shift.
-- Optional. Used to detect shortages independently of cash_in_drawer.
--   expected_to_owner = total_sales + online_lottery_sales - cash_in_drawer
--   over_short = cash_to_owner - expected_to_owner
-- cash_in_drawer now means "cash left in drawer for next shift" (varies per
-- shift — cashier decides how much float to leave).

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS cash_to_owner DECIMAL(10,2);
