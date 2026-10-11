-- step32 rollback
ALTER TABLE users DROP COLUMN notify_prefs;

DROP TABLE IF EXISTS push_subscriptions;
