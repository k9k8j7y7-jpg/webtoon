-- step12_down.sql — P3 보완 롤백: characters.style 컬럼 제거
-- 실행 전 반드시 현재 상태 백업 수행
-- 실행 방법: mariadb -u root -p project_t < step12_down.sql

USE project_t;

-- 1. 버전 기록 삭제
DELETE FROM schema_migrations WHERE version = 'step12';

-- 2. style 컬럼 제거
ALTER TABLE characters DROP COLUMN style;
