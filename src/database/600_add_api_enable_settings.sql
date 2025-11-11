-- API 활성화/비활성화 설정 컬럼 추가
-- Lv1 시스템관리자 전용 설정

ALTER TABLE api_configs 
ADD COLUMN IF NOT EXISTS use_invest_api BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS use_oroplay_api BOOLEAN DEFAULT true;

COMMENT ON COLUMN api_configs.use_invest_api IS 'Invest API 사용 여부 (Lv1 전용, 기본값: true)';
COMMENT ON COLUMN api_configs.use_oroplay_api IS 'OroPlay API 사용 여부 (Lv1 전용, 기본값: true)';

-- 인덱스 추가 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_api_configs_use_invest ON api_configs(partner_id, use_invest_api);
CREATE INDEX IF NOT EXISTS idx_api_configs_use_oroplay ON api_configs(partner_id, use_oroplay_api);

-- 기존 데이터에 기본값 설정 (NULL 방지)
UPDATE api_configs 
SET use_invest_api = true 
WHERE use_invest_api IS NULL;

UPDATE api_configs 
SET use_oroplay_api = true 
WHERE use_oroplay_api IS NULL;
