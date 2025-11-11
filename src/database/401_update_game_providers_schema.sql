-- ============================================
-- 게임 제공사 테이블 스키마 업데이트
-- ============================================

-- game_providers 테이블에 is_visible 컬럼 추가 (존재하지 않을 경우)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'game_providers' 
    AND column_name = 'is_visible'
  ) THEN
    ALTER TABLE game_providers ADD COLUMN is_visible BOOLEAN DEFAULT TRUE;
    RAISE NOTICE '✅ game_providers.is_visible 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  game_providers.is_visible 컬럼이 이미 존재합니다';
  END IF;
END $$;

-- status 컬럼 타입 확인 및 업데이트 (active/inactive → visible/maintenance/hidden)
DO $$
BEGIN
  -- 1. 기존 CHECK 제약 조건 삭제 (있는 경우)
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'game_providers' 
    AND constraint_name = 'game_providers_status_check'
  ) THEN
    ALTER TABLE game_providers DROP CONSTRAINT game_providers_status_check;
    RAISE NOTICE '✅ 기존 game_providers_status_check 제약 조건 삭제';
  END IF;
  
  -- 2. 기존 active 상태를 visible로 변경
  UPDATE game_providers SET status = 'visible' WHERE status = 'active';
  
  -- 3. 기존 inactive 상태를 hidden으로 변경
  UPDATE game_providers SET status = 'hidden' WHERE status = 'inactive';
  
  -- 4. 새로운 CHECK 제약 조건 추가
  ALTER TABLE game_providers 
  ADD CONSTRAINT game_providers_status_check 
  CHECK (status IN ('visible', 'maintenance', 'hidden'));
  
  RAISE NOTICE '✅ game_providers.status 데이터 마이그레이션 완료';
  RAISE NOTICE '✅ 새로운 CHECK 제약 조건 추가 (visible, maintenance, hidden)';
END $$;

-- is_visible 값 동기화 (status에 따라 자동 설정)
UPDATE game_providers 
SET is_visible = (status = 'visible')
WHERE is_visible IS NULL OR is_visible != (status = 'visible');

-- games 테이블 status 컬럼도 동일하게 처리
DO $$
BEGIN
  -- 1. games 테이블의 기존 CHECK 제약 조건 삭제 (있는 경우)
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'games' 
    AND constraint_name = 'games_status_check'
  ) THEN
    ALTER TABLE games DROP CONSTRAINT games_status_check;
    RAISE NOTICE '✅ 기존 games_status_check 제약 조건 삭제';
  END IF;
  
  -- 2. games 테이블 데이터 마이그레이션
  UPDATE games SET status = 'visible' WHERE status = 'active';
  UPDATE games SET status = 'hidden' WHERE status = 'inactive';
  
  -- 3. 새로운 CHECK 제약 조건 추가
  ALTER TABLE games 
  ADD CONSTRAINT games_status_check 
  CHECK (status IN ('visible', 'maintenance', 'hidden'));
  
  RAISE NOTICE '✅ games.status 데이터 마이그레이션 완료';
  RAISE NOTICE '✅ 새로운 CHECK 제약 조건 추가 (visible, maintenance, hidden)';
END $$;

-- games 테이블에 is_visible 컬럼 추가 (존재하지 않을 경우)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'games' 
    AND column_name = 'is_visible'
  ) THEN
    ALTER TABLE games ADD COLUMN is_visible BOOLEAN DEFAULT TRUE;
    RAISE NOTICE '✅ games.is_visible 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  games.is_visible 컬럼이 이미 존재합니다';
  END IF;
END $$;

-- games 테이블 is_visible 값 동기화
UPDATE games 
SET is_visible = (status = 'visible')
WHERE is_visible IS NULL OR is_visible != (status = 'visible');

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_game_providers_status ON game_providers(status);
CREATE INDEX IF NOT EXISTS idx_game_providers_is_visible ON game_providers(is_visible);
CREATE INDEX IF NOT EXISTS idx_game_providers_api_type_type ON game_providers(api_type, type);

CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_is_visible ON games(is_visible);
CREATE INDEX IF NOT EXISTS idx_games_provider_id_status ON games(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_games_api_type_type ON games(api_type, type);

-- 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 게임 테이블 스키마 업데이트 완료';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 game_providers 테이블:';
  RAISE NOTICE '   ✅ is_visible 컬럼 추가';
  RAISE NOTICE '   ✅ status 값 마이그레이션 (active→visible, inactive→hidden)';
  RAISE NOTICE '   ✅ CHECK 제약 조건 업데이트';
  RAISE NOTICE '   ✅ is_visible 값 동기화';
  RAISE NOTICE '';
  RAISE NOTICE '📋 games 테이블:';
  RAISE NOTICE '   ✅ is_visible 컬럼 추가';
  RAISE NOTICE '   ✅ status 값 마이그레이션 (active→visible, inactive→hidden)';
  RAISE NOTICE '   ✅ CHECK 제약 조건 업데이트';
  RAISE NOTICE '   ✅ is_visible 값 동기화';
  RAISE NOTICE '';
  RAISE NOTICE '📋 성능 최적화:';
  RAISE NOTICE '   ✅ 인덱스 추가 완료 (8개)';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '상태 관리 기능:';
  RAISE NOTICE '========================================';
  RAISE NOTICE '   🟢 visible: 노출 (사용자 페이지에 표시)';
  RAISE NOTICE '   🟡 maintenance: 점검중 (사용자 페이지에서 숨김)';
  RAISE NOTICE '   🔴 hidden: 숨김 (완전히 숨김)';
  RAISE NOTICE '';
END $$;
