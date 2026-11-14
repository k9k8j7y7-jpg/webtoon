-- step39 rollback (products.photo_url은 그대로 남아 있으므로 데이터 손실 없음 — 추가 업로드된 side/back/top/holding 사진 행만 사라짐)
DROP TABLE IF EXISTS product_photos;
