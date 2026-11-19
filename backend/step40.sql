-- step40: api_calls 원가 기록 + 단가표 + 환율 + 상태 점검
-- 2026-11-19

-- api_calls: 모든 외부 API 호출 기록
CREATE TABLE IF NOT EXISTS api_calls (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider      VARCHAR(20)  NOT NULL COMMENT 'openai / gemini / omni / other',
  model         VARCHAR(80)  NOT NULL,
  kind          VARCHAR(20)  NOT NULL COMMENT 'image / text / vision / video / other',
  purpose       VARCHAR(30)  NOT NULL COMMENT 'onecut_ad / instatoon_ad / brand_series / detail_page / story / character / motion / check / analysis',
  user_id       BIGINT       NULL,
  episode_id    BIGINT       NULL,
  cut_id        BIGINT       NULL,
  units_json    JSON         NULL     COMMENT '{"images":1} / {"tokens_in":800,"tokens_out":2000} / {"seconds":3}',
  cost_usd      DECIMAL(10,6) NULL,
  cost_krw      INT          NULL,
  duration_ms   INT          NULL,
  status        VARCHAR(10)  NOT NULL DEFAULT 'ok' COMMENT 'ok / error',
  error_code    VARCHAR(30)  NULL,
  INDEX idx_api_calls_created (created_at),
  INDEX idx_api_calls_purpose (purpose),
  INDEX idx_api_calls_user    (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- api_prices: 외부 API 단가표
CREATE TABLE IF NOT EXISTS api_prices (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(20)  NOT NULL,
  model         VARCHAR(80)  NOT NULL,
  kind          VARCHAR(20)  NOT NULL,
  unit          VARCHAR(30)  NOT NULL COMMENT 'image / 1k_tokens_in / 1k_tokens_out / second',
  usd_per_unit  DECIMAL(12,8) NOT NULL,
  note          VARCHAR(500) NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_price (provider, model, kind, unit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- exchange_rates: 일별 USD→KRW 환율
CREATE TABLE IF NOT EXISTS exchange_rates (
  date          DATE PRIMARY KEY,
  usd_krw       DECIMAL(10,2) NOT NULL,
  source        VARCHAR(50)   NULL COMMENT 'frankfurter / manual / default'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- admin_checks: 상태 점검 결과 (페이지·봇 공용)
CREATE TABLE IF NOT EXISTS admin_checks (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  run_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `key`         VARCHAR(30)  NOT NULL COMMENT 'disk / backup / failed_jobs / ...',
  status        VARCHAR(10)  NOT NULL COMMENT 'ok / warn / fail',
  value         VARCHAR(200) NULL     COMMENT '수치 요약',
  detail        TEXT         NULL     COMMENT '상세 메시지',
  source        VARCHAR(10)  NOT NULL DEFAULT 'page' COMMENT 'page / bot',
  INDEX idx_checks_run (run_at),
  INDEX idx_checks_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 초기 단가 데이터 (2026-11-19 공식 가격 기준)
INSERT INTO api_prices (provider, model, kind, unit, usd_per_unit, note) VALUES
  -- Gemini 2.5 Flash 텍스트: $0.30/$2.50 per 1M tok (aistudio.google.com/docs/pricing 2026-11-19)
  ('gemini', 'gemini-2.5-flash', 'text', '1k_tokens_in',  0.00030,  'Gemini 2.5 Flash input $0.30/1M, aistudio.google.com/docs/pricing 2026-11-19'),
  ('gemini', 'gemini-2.5-flash', 'text', '1k_tokens_out', 0.00250,  'Gemini 2.5 Flash output $2.50/1M, aistudio.google.com/docs/pricing 2026-11-19'),
  -- Gemini 2.5 Flash 비전 (이미지 입력 = 텍스트 토큰 단가)
  ('gemini', 'gemini-2.5-flash', 'vision', '1k_tokens_in',  0.00030, 'Vision = text input pricing'),
  ('gemini', 'gemini-2.5-flash', 'vision', '1k_tokens_out', 0.00250, 'Vision = text output pricing'),
  -- Gemini 이미지 생성: $0.0336/image 1K res (aistudio.google.com/docs/pricing 2026-11-19)
  ('gemini', 'gemini-3.1-flash-image', 'image', 'image', 0.03360, 'Gemini flash image 1K $0.0336/image, aistudio.google.com/docs/pricing 2026-11-19'),
  -- OpenAI GPT Image: 토큰 기반 — output $32/1M tok, 1024x1536 high ~2100tok ~$0.067
  --   text input $5/1M, image input $8/1M (developers.openai.com/api/docs/pricing 2026-11-19)
  ('openai', 'gpt-image-2.5-sunburst', 'image', '1k_tokens_out', 0.03200, 'GPT image output $32/1M tok, developers.openai.com/api/docs/pricing 2026-11-19'),
  ('openai', 'gpt-image-2.5-sunburst', 'image', '1k_tokens_in',  0.00500, 'GPT image text input $5/1M tok'),
  ('openai', 'gpt-image-2.5-sunburst', 'image', 'image_input',   0.00896, 'GPT image ref 1장 ~1120tok × $8/1M = $0.00896'),
  -- Gemini Omni Flash 영상: $0.07/sec (aistudio.google.com/docs/pricing 2026-11-19)
  ('gemini', 'gemini-omni-1.2-flash', 'video', 'second', 0.07000, 'Gemini omni video $0.07/sec, aistudio.google.com/docs/pricing 2026-11-19')
ON DUPLICATE KEY UPDATE usd_per_unit=VALUES(usd_per_unit), note=VALUES(note), updated_at=CURRENT_TIMESTAMP;
