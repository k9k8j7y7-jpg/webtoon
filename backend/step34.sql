-- step34: products 테이블에 제품 분석 필드 추가
-- description: 자동 추출 요약 (색·라벨 글자·재질)
-- shape: bottle/can/box/tube/flat/pouch/other
-- size_hint: palm/one_hand/two_hands/tabletop/large
-- size_ratio: 제품 높이 ÷ 손 길이 (들고 사진에서)
-- holding_photo_url: 들고 찍은 사진 URL
-- label_text: 라벨에 적힌 글자 그대로

ALTER TABLE products
    ADD COLUMN description TEXT AFTER features,
    ADD COLUMN shape VARCHAR(20) AFTER description,
    ADD COLUMN size_hint VARCHAR(20) AFTER shape,
    ADD COLUMN size_ratio FLOAT NULL AFTER size_hint,
    ADD COLUMN holding_photo_url VARCHAR(500) NULL AFTER size_ratio,
    ADD COLUMN label_text TEXT AFTER holding_photo_url;
