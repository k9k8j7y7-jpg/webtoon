-- Step 18 rollback
ALTER TABLE generation_logs DROP COLUMN packets_charged;
DROP TABLE IF EXISTS packet_transactions;
DROP TABLE IF EXISTS packet_balances;
DROP TABLE IF EXISTS notices;
DELETE FROM schema_migrations WHERE version = 'step18';
