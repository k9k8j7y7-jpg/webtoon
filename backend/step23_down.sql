-- step23_down: 롤백
DROP TABLE IF EXISTS product_price_logs;
DROP TABLE IF EXISTS packet_products;

DELETE FROM schema_migrations WHERE version = 'step23';
