-- Step 8: 캐릭터 조건 입력 필드 추가 (Gate3 Asset Revision - Bundle B)
ALTER TABLE characters
  ADD COLUMN gender       VARCHAR(20)  NULL AFTER name,
  ADD COLUMN age_group    VARCHAR(20)  NULL AFTER gender,
  ADD COLUMN hair_style   VARCHAR(50)  NULL AFTER age_group,
  ADD COLUMN hair_color   VARCHAR(50)  NULL AFTER hair_style,
  ADD COLUMN body_type    VARCHAR(30)  NULL AFTER hair_color,
  ADD COLUMN mood         VARCHAR(50)  NULL AFTER body_type,
  ADD COLUMN detail_notes TEXT         NULL AFTER mood;
