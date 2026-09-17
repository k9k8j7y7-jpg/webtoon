-- step26: generation_logs.kind ENUM에 'product' 추가 (광고 제품 시트 생성 로그)
ALTER TABLE generation_logs
  MODIFY COLUMN kind ENUM('cut','character','location','product') NOT NULL;
