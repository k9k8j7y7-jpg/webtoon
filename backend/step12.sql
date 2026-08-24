-- step12.sql — P3 보완: characters.style 컬럼 추가 + 백필
-- 실행 전 반드시 mysqldump 백업 수행
-- 실행 방법: mariadb -u root -p project_t < step12.sql

USE project_t;

-- ============================================================
-- UP 시작
-- ============================================================

-- 1. characters에 style 컬럼 추가 (에피소드 스타일의 preset_key)
ALTER TABLE characters
  ADD COLUMN style VARCHAR(50) NULL AFTER detail_notes;

-- 2. 백필: 기존 캐릭터에 원 소속 에피소드의 스타일 UPDATE
--    characters.episode_id → styles.episode_id → preset_key
UPDATE characters c
  JOIN styles s ON c.episode_id = s.episode_id
  SET c.style = s.preset_key;

-- ============================================================
-- 검증 쿼리 (실행 후 확인용 — SELECT만)
-- ============================================================

-- V1: style 컬럼 존재 확인
SELECT 'V1: style column exists' AS test,
       CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'characters'
   AND COLUMN_NAME = 'style';

-- V2: 스타일이 설정된 에피소드의 캐릭터는 전부 백필 되었는지
SELECT 'V2: backfill coverage' AS test,
       (SELECT COUNT(*) FROM characters c
          JOIN styles s ON c.episode_id = s.episode_id
         WHERE c.style IS NULL) AS missed_count,
       CASE WHEN (SELECT COUNT(*) FROM characters c
                    JOIN styles s ON c.episode_id = s.episode_id
                   WHERE c.style IS NULL) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- V3: style 값 분포 확인
SELECT 'V3: style distribution' AS test, style, COUNT(*) AS cnt
  FROM characters
 GROUP BY style;

-- ============================================================
-- 버전 기록
-- ============================================================
INSERT INTO schema_migrations (version) VALUES ('step12');

-- ============================================================
-- UP 끝
-- ============================================================

-- DOWN은 step12_down.sql 별도 파일 참조
