-- ============================================
-- 게임 및 제공사 다국어 지원 컬럼 추가
-- ============================================
-- 작성일: 2025-01-11
-- 목적: API 응답의 영어 이름을 저장하고 다국어 시스템과 통합

-- ============================================
-- 1. game_providers 테이블에 영어 이름 컬럼 추가
-- ============================================
DO $$
BEGIN
  -- name_en 컬럼 추가 (영어 이름)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'game_providers' 
    AND column_name = 'name_en'
  ) THEN
    ALTER TABLE game_providers ADD COLUMN name_en TEXT;
    RAISE NOTICE '✅ game_providers.name_en 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  game_providers.name_en 컬럼이 이미 존재합니다';
  END IF;

  -- name_ko 컬럼 추가 (한국어 이름 - 명시적 구분)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'game_providers' 
    AND column_name = 'name_ko'
  ) THEN
    ALTER TABLE game_providers ADD COLUMN name_ko TEXT;
    RAISE NOTICE '✅ game_providers.name_ko 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  game_providers.name_ko 컬럼이 이미 존재합니다';
  END IF;
END $$;

-- 기존 name 컬럼의 데이터를 name_ko로 복사 (초기 데이터 마이그레이션)
UPDATE game_providers 
SET name_ko = name 
WHERE name_ko IS NULL AND name IS NOT NULL;

COMMENT ON COLUMN game_providers.name IS '제공사 이름 (기본값, 호환성 유지)';
COMMENT ON COLUMN game_providers.name_ko IS '제공사 이름 (한국어)';
COMMENT ON COLUMN game_providers.name_en IS '제공사 이름 (영어, API 응답에서 제공)';

-- ============================================
-- 2. games 테이블에 영어 이름 컬럼 추가
-- ============================================
DO $$
BEGIN
  -- name_en 컬럼 추가 (영어 이름)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'games' 
    AND column_name = 'name_en'
  ) THEN
    ALTER TABLE games ADD COLUMN name_en TEXT;
    RAISE NOTICE '✅ games.name_en 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  games.name_en 컬럼이 이미 존재합니다';
  END IF;

  -- name_ko 컬럼 추가 (한국어 이름 - 명시적 구분)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'games' 
    AND column_name = 'name_ko'
  ) THEN
    ALTER TABLE games ADD COLUMN name_ko TEXT;
    RAISE NOTICE '✅ games.name_ko 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  games.name_ko 컬럼이 이미 존재합니다';
  END IF;
END $$;

-- 기존 name 컬럼의 데이터를 name_ko로 복사 (초기 데이터 마이그레이션)
UPDATE games 
SET name_ko = name 
WHERE name_ko IS NULL AND name IS NOT NULL;

COMMENT ON COLUMN games.name IS '게임 이름 (기본값, 호환성 유지)';
COMMENT ON COLUMN games.name_ko IS '게임 이름 (한국어)';
COMMENT ON COLUMN games.name_en IS '게임 이름 (영어, API 응답에서 제공)';

-- ============================================
-- 3. 인덱스 추가 (검색 성능 최적화)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_game_providers_name_en ON game_providers(name_en);
CREATE INDEX IF NOT EXISTS idx_game_providers_name_ko ON game_providers(name_ko);
CREATE INDEX IF NOT EXISTS idx_games_name_en ON games(name_en);
CREATE INDEX IF NOT EXISTS idx_games_name_ko ON games(name_ko);

-- ============================================
-- 4. 헬퍼 함수: 언어별 이름 반환
-- ============================================

-- 게임 제공사 이름을 언어별로 반환하는 함수
CREATE OR REPLACE FUNCTION get_provider_name(
  p_provider_id UUID,
  p_language TEXT DEFAULT 'ko'
)
RETURNS TEXT AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF p_language = 'en' THEN
    SELECT COALESCE(name_en, name, name_ko) INTO v_name
    FROM game_providers
    WHERE id = p_provider_id;
  ELSE
    SELECT COALESCE(name_ko, name, name_en) INTO v_name
    FROM game_providers
    WHERE id = p_provider_id;
  END IF;
  
  RETURN v_name;
END;
$$ LANGUAGE plpgsql;

-- 게임 이름을 언어별로 반환하는 함수
CREATE OR REPLACE FUNCTION get_game_name(
  p_game_id UUID,
  p_language TEXT DEFAULT 'ko'
)
RETURNS TEXT AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF p_language = 'en' THEN
    SELECT COALESCE(name_en, name, name_ko) INTO v_name
    FROM games
    WHERE id = p_game_id;
  ELSE
    SELECT COALESCE(name_ko, name, name_en) INTO v_name
    FROM games
    WHERE id = p_game_id;
  END IF;
  
  RETURN v_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_provider_name IS '언어별 게임 제공사 이름 반환 (ko/en)';
COMMENT ON FUNCTION get_game_name IS '언어별 게임 이름 반환 (ko/en)';

-- ============================================
-- 5. 뷰 생성: 다국어 게임 목록
-- ============================================

-- 언어별 게임 제공사 뷰
CREATE OR REPLACE VIEW v_game_providers_i18n AS
SELECT 
  id,
  COALESCE(name_ko, name) as name_ko,
  COALESCE(name_en, name) as name_en,
  COALESCE(name_ko, name) as name,  -- 기본값은 한국어
  api_type,
  type,
  status,
  is_visible,
  logo_url,
  created_at,
  updated_at
FROM game_providers;

-- 언어별 게임 뷰
CREATE OR REPLACE VIEW v_games_i18n AS
SELECT 
  g.id,
  g.provider_id,
  COALESCE(g.name_ko, g.name) as name_ko,
  COALESCE(g.name_en, g.name) as name_en,
  COALESCE(g.name_ko, g.name) as name,  -- 기본값은 한국어
  COALESCE(gp.name_ko, gp.name) as provider_name_ko,
  COALESCE(gp.name_en, gp.name) as provider_name_en,
  g.api_type,
  g.type,
  g.status,
  g.is_visible,
  g.image_url,
  g.created_at,
  g.updated_at
FROM games g
LEFT JOIN game_providers gp ON g.provider_id = gp.id;

COMMENT ON VIEW v_game_providers_i18n IS '다국어 지원 게임 제공사 뷰 (한국어/영어)';
COMMENT ON VIEW v_games_i18n IS '다국어 지원 게임 뷰 (한국어/영어, 제공사 정보 포함)';

-- ============================================
-- 완료 메시지
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 게임 다국어 지원 스키마 업데이트 완료';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 game_providers 테이블:';
  RAISE NOTICE '   ✅ name_ko 컬럼 추가 (한국어 이름)';
  RAISE NOTICE '   ✅ name_en 컬럼 추가 (영어 이름)';
  RAISE NOTICE '   ✅ 기존 name → name_ko 데이터 복사';
  RAISE NOTICE '';
  RAISE NOTICE '📋 games 테이블:';
  RAISE NOTICE '   ✅ name_ko 컬럼 추가 (한국어 이름)';
  RAISE NOTICE '   ✅ name_en 컬럼 추가 (영어 이름)';
  RAISE NOTICE '   ✅ 기존 name → name_ko 데이터 복사';
  RAISE NOTICE '';
  RAISE NOTICE '📋 헬퍼 함수:';
  RAISE NOTICE '   ✅ get_provider_name(id, language) - 제공사 이름 반환';
  RAISE NOTICE '   ✅ get_game_name(id, language) - 게임 이름 반환';
  RAISE NOTICE '';
  RAISE NOTICE '📋 뷰:';
  RAISE NOTICE '   ✅ v_game_providers_i18n - 다국어 제공사 뷰';
  RAISE NOTICE '   ✅ v_games_i18n - 다국어 게임 뷰';
  RAISE NOTICE '';
  RAISE NOTICE '📋 인덱스:';
  RAISE NOTICE '   ✅ idx_game_providers_name_en';
  RAISE NOTICE '   ✅ idx_game_providers_name_ko';
  RAISE NOTICE '   ✅ idx_games_name_en';
  RAISE NOTICE '   ✅ idx_games_name_ko';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '사용 방법:';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '1️⃣  API 동기화 시 영어 이름 저장:';
  RAISE NOTICE '   UPDATE game_providers';
  RAISE NOTICE '   SET name_en = ''Evolution Gaming''';
  RAISE NOTICE '   WHERE provider_id = 41;';
  RAISE NOTICE '';
  RAISE NOTICE '2️⃣  프론트엔드에서 언어별 조회:';
  RAISE NOTICE '   const { language } = useLanguage();';
  RAISE NOTICE '   const name = language === ''en'' ? provider.name_en : provider.name_ko;';
  RAISE NOTICE '';
  RAISE NOTICE '3️⃣  SQL 함수 사용:';
  RAISE NOTICE '   SELECT get_provider_name(id, ''en'') FROM game_providers;';
  RAISE NOTICE '';
  RAISE NOTICE '4️⃣  뷰 사용:';
  RAISE NOTICE '   SELECT * FROM v_games_i18n;';
  RAISE NOTICE '';
END $$;
