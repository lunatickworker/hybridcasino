-- ============================================
-- 게임 테이블 데이터 초기화
-- ============================================

-- games 테이블 데이터 삭제
TRUNCATE TABLE games CASCADE;

-- game_providers 테이블 데이터 삭제
TRUNCATE TABLE game_providers CASCADE;

-- game_status_logs 테이블 데이터 삭제 (파트너별 게임 설정)
TRUNCATE TABLE game_status_logs CASCADE;

-- 관련 시퀀스 초기화 (있는 경우)
-- ALTER SEQUENCE games_id_seq RESTART WITH 1;
-- ALTER SEQUENCE game_providers_id_seq RESTART WITH 1;

COMMENT ON TABLE games IS '게임 테이블 - 초기화 완료 (2025-01-11)';
COMMENT ON TABLE game_providers IS '게임 제공사 테이블 - 초기화 완료 (2025-01-11)';

-- 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ 게임 테이블 데이터 초기화 완료';
  RAISE NOTICE '   - games: 모든 데이터 삭제됨';
  RAISE NOTICE '   - game_providers: 모든 데이터 삭제됨';
  RAISE NOTICE '   - game_status_logs: 모든 데이터 삭제됨';
  RAISE NOTICE '';
  RAISE NOTICE '다음 단계:';
  RAISE NOTICE '   1. 관리자 페이지 접속';
  RAISE NOTICE '   2. "제공사 초기화" 버튼 클릭';
  RAISE NOTICE '   3. "Invest 동기화" 버튼 클릭';
  RAISE NOTICE '   4. "OroPlay 동기화" 버튼 클릭';
END $$;
