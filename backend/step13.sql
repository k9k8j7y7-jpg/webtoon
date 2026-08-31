-- step13.sql — 캐릭터 외형 명세(영문): appearance_en 컬럼 추가
-- 실행 전 반드시 mysqldump 백업 수행
-- 실행 방법: mariadb -u root -p project_t < step13.sql

USE project_t;

-- ============================================================
-- UP 시작
-- ============================================================

-- 1. characters에 appearance_en 컬럼 추가 (영문 외형 명세, 컷 프롬프트 주입용)
ALTER TABLE characters
  ADD COLUMN appearance_en VARCHAR(500) NULL AFTER style;

-- ============================================================
-- 검증 쿼리 (실행 후 확인용 — SELECT만)
-- ============================================================

-- V1: appearance_en 컬럼 존재 확인
SELECT 'V1: appearance_en column exists' AS test,
       CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'characters'
   AND COLUMN_NAME = 'appearance_en';

-- V2: 기존 캐릭터 수 확인 (백필 대상)
SELECT 'V2: characters to backfill' AS test,
       COUNT(*) AS total,
       SUM(CASE WHEN appearance_en IS NULL THEN 1 ELSE 0 END) AS null_count
  FROM characters;

-- ============================================================
-- 버전 기록
-- ============================================================
INSERT INTO schema_migrations (version) VALUES ('step13');

-- ============================================================
-- UP 끝
-- ============================================================

-- DOWN은 step13_down.sql 별도 파일 참조
