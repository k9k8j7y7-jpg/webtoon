-- step13_down.sql — 롤백: appearance_en 컬럼 제거
-- 실행 전 반드시 현재 상태 백업 수행
-- 실행 방법: mariadb -u root -p project_t < step13_down.sql

USE project_t;

-- 1. 버전 기록 삭제
DELETE FROM schema_migrations WHERE version = 'step13';

-- 2. appearance_en 컬럼 제거
ALTER TABLE characters DROP COLUMN appearance_en;
