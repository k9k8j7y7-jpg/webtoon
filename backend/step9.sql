-- Step 9: 장소 분위기 서술 필드 추가 (Gate3 Asset Revision - Bundle C)
ALTER TABLE locations
  ADD COLUMN mood_notes TEXT NULL AFTER description;
