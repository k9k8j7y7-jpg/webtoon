-- step17_down: 'expressions' 제거 (해당 행 먼저 삭제 필요)
DELETE FROM character_images WHERE `type` = 'expressions';
ALTER TABLE character_images
  MODIFY COLUMN `type` ENUM('front','side','expression') NOT NULL;
