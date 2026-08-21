-- step11.sql — P2: series + episode_characters + characters 프로젝트 소속 이전
-- 실행 전 반드시 mysqldump 백업 수행
-- 실행 방법: mariadb -u root -p project_t < step11.sql

USE project_t;

-- ============================================================
-- UP 시작
-- ============================================================

-- 0. schema_migrations 테이블 신설 (버전 추적)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(50)  NOT NULL PRIMARY KEY,
  applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. series 테이블 신설
CREATE TABLE IF NOT EXISTS series (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  project_id  BIGINT NOT NULL,
  title       VARCHAR(200) NOT NULL,
  bible       JSON,
  outline     JSON,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_series_project FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX idx_series_project ON series(project_id);

-- 2. episodes 확장: series_id (nullable FK)
ALTER TABLE episodes
  ADD COLUMN series_id BIGINT NULL AFTER project_id,
  ADD CONSTRAINT fk_episodes_series FOREIGN KEY (series_id) REFERENCES series(id);

-- 3. characters 확장: project_id + user_id
ALTER TABLE characters
  ADD COLUMN project_id BIGINT NULL AFTER episode_id,
  ADD COLUMN user_id    BIGINT NULL AFTER project_id,
  ADD CONSTRAINT fk_characters_project FOREIGN KEY (project_id) REFERENCES projects(id);
CREATE INDEX idx_characters_project ON characters(project_id);

-- 4. episode_characters 연결 테이블 신설
CREATE TABLE IF NOT EXISTS episode_characters (
  episode_id    BIGINT NOT NULL,
  character_id  BIGINT NOT NULL,
  PRIMARY KEY (episode_id, character_id),
  CONSTRAINT fk_ec_episode   FOREIGN KEY (episode_id)   REFERENCES episodes(id),
  CONSTRAINT fk_ec_character FOREIGN KEY (character_id) REFERENCES characters(id)
);

-- 5. 데이터 이전: characters.project_id ← episodes.project_id
UPDATE characters c
  JOIN episodes e ON c.episode_id = e.id
  SET c.project_id = e.project_id;

-- 6. 데이터 이전: episode_characters에 기존 1:1 연결 삽입
INSERT INTO episode_characters (episode_id, character_id)
  SELECT episode_id, id FROM characters;

-- ============================================================
-- 검증 쿼리 (실행 후 확인용 — SELECT만)
-- ============================================================

-- V1: characters.project_id NULL이 0건이어야 함
SELECT 'V1: project_id NULL count' AS test,
       COUNT(*) AS null_count,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM characters WHERE project_id IS NULL;

-- V2: episode_characters 행수 == characters 행수
SELECT 'V2: episode_characters vs characters count' AS test,
       (SELECT COUNT(*) FROM episode_characters) AS ec_count,
       (SELECT COUNT(*) FROM characters) AS char_count,
       CASE WHEN (SELECT COUNT(*) FROM episode_characters) = (SELECT COUNT(*) FROM characters)
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- V3: episode_characters JOIN 결과 == 기존 episode_id 직접 조회 결과 (에피소드별)
SELECT 'V3: JOIN equivalence per episode' AS test,
       e.id AS episode_id,
       (SELECT COUNT(*) FROM characters WHERE episode_id = e.id) AS direct_count,
       (SELECT COUNT(*) FROM episode_characters ec
          JOIN characters c ON ec.character_id = c.id
         WHERE ec.episode_id = e.id) AS join_count,
       CASE WHEN (SELECT COUNT(*) FROM characters WHERE episode_id = e.id) =
                 (SELECT COUNT(*) FROM episode_characters ec
                    JOIN characters c ON ec.character_id = c.id
                   WHERE ec.episode_id = e.id)
            THEN 'PASS' ELSE 'FAIL' END AS result
  FROM episodes e WHERE e.deleted_at IS NULL;

-- V4: series 테이블 존재 확인
SELECT 'V4: series table exists' AS test,
       CASE WHEN COUNT(*) >= 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM series WHERE 1=0;

-- V5: schema_migrations 테이블 존재 확인
SELECT 'V5: schema_migrations table exists' AS test,
       CASE WHEN COUNT(*) >= 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM schema_migrations WHERE 1=0;

-- ============================================================
-- 버전 기록
-- ============================================================
INSERT INTO schema_migrations (version) VALUES ('step11');

-- ============================================================
-- UP 끝
-- ============================================================


-- DOWN은 step11_down.sql 별도 파일 참조
