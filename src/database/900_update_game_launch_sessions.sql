-- ============================================
-- game_launch_sessions 테이블 스키마 업데이트
-- 최종 플로우 확정에 따른 컬럼 추가
-- ============================================

-- 0. 기본 타임스탬프 컬럼 추가 (없는 경우)
ALTER TABLE game_launch_sessions 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE game_launch_sessions 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 1. 시간 관리 컬럼 추가 (FINAL_FLOW_CONFIRMED.md 기준)
-- ✅ launched_at: 기존 컬럼 재사용 (이미 있으면 스킵)
ALTER TABLE game_launch_sessions 
ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ DEFAULT NOW();

-- ❌ ready_at: 신규 추가 필수 (ready 타임아웃 계산용)
ALTER TABLE game_launch_sessions 
ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ DEFAULT NOW();

-- ✅ last_activity_at: 기존 컬럼 재사용 (이미 있으면 스킵)
ALTER TABLE game_launch_sessions 
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- ❌ last_bet_at: 신규 추가 필수 (active 상태 관리용)
ALTER TABLE game_launch_sessions 
ADD COLUMN IF NOT EXISTS last_bet_at TIMESTAMPTZ;

-- ✅ last_bet_checked_at: betting_sync_attempted_at 재사용 가능
-- 기존 betting_sync_attempted_at이 있으면 그대로 사용, 없으면 추가
ALTER TABLE game_launch_sessions 
ADD COLUMN IF NOT EXISTS last_bet_checked_at TIMESTAMPTZ;

-- ✅ ended_at: 기존 컬럼 재사용 (이미 있으면 스킵)
ALTER TABLE game_launch_sessions 
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- 2. ready 상태 세부 분류 컬럼 추가
ALTER TABLE game_launch_sessions 
ADD COLUMN IF NOT EXISTS ready_status TEXT;

-- 3. 기존 레코드 업데이트
-- launched_at이 NULL인 경우 created_at 또는 NOW()로 설정
UPDATE game_launch_sessions 
SET launched_at = COALESCE(launched_at, created_at, NOW())
WHERE launched_at IS NULL;

-- ready_at이 NULL인 경우 launched_at 또는 NOW()로 설정
UPDATE game_launch_sessions 
SET ready_at = COALESCE(ready_at, launched_at, created_at, NOW())
WHERE ready_at IS NULL;

-- last_activity_at이 NULL인 경우 updated_at 또는 NOW()로 설정
UPDATE game_launch_sessions 
SET last_activity_at = COALESCE(last_activity_at, updated_at, created_at, NOW())
WHERE last_activity_at IS NULL;

-- 4. 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_game_launch_sessions_launched_at 
ON game_launch_sessions(launched_at);

CREATE INDEX IF NOT EXISTS idx_game_launch_sessions_ready_at 
ON game_launch_sessions(ready_at);

CREATE INDEX IF NOT EXISTS idx_game_launch_sessions_last_activity_at 
ON game_launch_sessions(last_activity_at);

CREATE INDEX IF NOT EXISTS idx_game_launch_sessions_last_bet_at 
ON game_launch_sessions(last_bet_at);

CREATE INDEX IF NOT EXISTS idx_game_launch_sessions_ended_at 
ON game_launch_sessions(ended_at);

-- 5. 기존 인덱스도 확인
CREATE INDEX IF NOT EXISTS idx_game_launch_sessions_user_id 
ON game_launch_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_game_launch_sessions_status 
ON game_launch_sessions(status);

CREATE INDEX IF NOT EXISTS idx_game_launch_sessions_api_type 
ON game_launch_sessions(api_type);

-- 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ game_launch_sessions 테이블 업데이트 완료';
  RAISE NOTICE '   - 기존 컬럼 재사용: launched_at, ended_at, last_activity_at';
  RAISE NOTICE '   - 신규 컬럼 추가: ready_at, last_bet_at, ready_status';
  RAISE NOTICE '   - 시간 관리 컬럼 6개 확인 완료';
  RAISE NOTICE '     * launched_at (재사용)';
  RAISE NOTICE '     * ready_at (신규)';
  RAISE NOTICE '     * last_activity_at (재사용)';
  RAISE NOTICE '     * last_bet_at (신규)';
  RAISE NOTICE '     * last_bet_checked_at (신규)';
  RAISE NOTICE '     * ended_at (재사용)';
  RAISE NOTICE '   - ready_status 컬럼 추가 (신규)';
  RAISE NOTICE '   - 인덱스 8개 추가/확인';
  RAISE NOTICE '   - 기존 레코드 업데이트 완료';
END $$;