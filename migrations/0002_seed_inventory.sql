-- Launch inventory: everything opens as a Founder's Pre-Order with a capped Batch 01.
-- The founder adjusts caps / ship-by dates / modes from /admin/inventory.
INSERT INTO inventory (sku, mode, available, ships_by, active) VALUES
  ('SGL-BLK', 'preorder', 25, '2026-12-11', 1),
  ('SGL-OLV', 'preorder', 25, '2026-12-11', 1),
  ('SGL-KFT', 'preorder', 15, '2026-12-11', 1),
  ('SGL-BNE', 'preorder', 15, '2026-12-11', 1),
  ('PR-BLK', 'preorder', 10, '2026-12-11', 1),
  ('PR-OLV', 'preorder', 10, '2026-12-11', 1),
  ('PR-MIX', 'preorder', 10, '2026-12-11', 1),
  ('PR-KFT', 'preorder', 5, '2026-12-11', 1);
