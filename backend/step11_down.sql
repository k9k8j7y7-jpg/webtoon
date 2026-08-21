-- step11_down.sql — P2 롤백: step11.sql의 역순 삭제
-- 실행 전 반드시 현재 상태 백업 수행
-- 실행 방법: mariadb -u root -p project_t < step11_down.sql

USE project_t;

-- 1. 버전 기록 삭제
DELETE FROM schema_migrations WHERE version = 'step11';

-- 2. episode_characters 데이터 + 테이블 삭제
DROP TABLE IF EXISTS episode_characters;

-- 3. characters 확장 컬럼 제거
ALTER TABLE characters DROP FOREIGN KEY fk_characters_project;
ALTER TABLE characters DROP INDEX idx_characters_project;
ALTER TABLE characters DROP COLUMN user_id;
ALTER TABLE characters DROP COLUMN project_id;

-- 4. episodes.series_id 제거
ALTER TABLE episodes DROP FOREIGN KEY fk_episodes_series;
ALTER TABLE episodes DROP COLUMN series_id;

-- 5. series 테이블 삭제
DROP TABLE IF EXISTS series;

-- 6. schema_migrations 테이블 삭제
DROP TABLE IF EXISTS schema_migrations;
