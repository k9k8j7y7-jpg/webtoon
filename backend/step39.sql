-- step39: product_photos — 제품 다중 사진 (상세페이지 트랙)
-- kind: front(정면, 필수) / side / back / top / holding(손에 든 사진 — 크기 비율용)
-- 기존 products.photo_url → front 1행 복사 (첫 장 = 기존 경로, 호환)
-- products.photo_url·holding_photo_url 컬럼은 유지 (기존 코드 경로 불변)

CREATE TABLE IF NOT EXISTS product_photos (
  id BIGINT(20) NOT NULL AUTO_INCREMENT,
  product_id BIGINT(20) NOT NULL,
  kind ENUM('front','side','back','top','holding') NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_product_photos_product (product_id, sort),
  CONSTRAINT fk_product_photos_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 기존 사진 → front 복사 (재실행해도 중복 없음)
INSERT INTO product_photos (product_id, kind, image_url, sort, created_at)
SELECT p.id, 'front', p.photo_url, 0, p.created_at
FROM products p
WHERE p.photo_url IS NOT NULL AND p.photo_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM product_photos pp WHERE pp.product_id = p.id AND pp.kind = 'front'
  );
