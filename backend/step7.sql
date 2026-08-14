-- Step 7: 말풍선 조판 — composed_image_url 컬럼 추가
ALTER TABLE cuts
  ADD COLUMN composed_image_url VARCHAR(500) AFTER image_url;
