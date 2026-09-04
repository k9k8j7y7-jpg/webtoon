-- step17: character_images.type ENUM에 'expressions' 추가
ALTER TABLE character_images
  MODIFY COLUMN `type` ENUM('front','side','expression','expressions') NOT NULL;
