-- step34 rollback: products 분석 필드 제거
ALTER TABLE products
    DROP COLUMN name_ko,
    DROP COLUMN description,
    DROP COLUMN shape,
    DROP COLUMN size_hint,
    DROP COLUMN size_ratio,
    DROP COLUMN holding_photo_url,
    DROP COLUMN label_text;
