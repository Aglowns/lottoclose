-- Drawer float: the cash kept in the drawer at end of shift for the next
-- cashier to make change with. Cash earnings handed to the owner at end of
-- shift = drawer_count - drawer_float.
-- Default $0 means "no float" — drawer count is the earnings.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS drawer_float DECIMAL(10,2) DEFAULT 0;
