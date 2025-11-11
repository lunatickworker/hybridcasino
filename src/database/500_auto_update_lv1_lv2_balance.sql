-- Lv1/Lv2의 balance를 invest_balance + oroplay_balance로 자동 계산
-- Lv3는 balance만 사용하므로 자동 계산 제외

-- 1. 트리거 함수: Lv1/Lv2의 balance 자동 계산 (API 설정 반영)
CREATE OR REPLACE FUNCTION auto_update_lv1_lv2_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_use_invest_api BOOLEAN;
  v_use_oroplay_api BOOLEAN;
BEGIN
  -- Lv1, Lv2 파트너인 경우에만 balance를 자동 계산
  IF NEW.level IN (1, 2) THEN
    -- Lv1의 API 설정 조회 (시스템 전체 설정)
    SELECT ac.use_invest_api, ac.use_oroplay_api
    INTO v_use_invest_api, v_use_oroplay_api
    FROM partners p
    INNER JOIN api_configs ac ON ac.partner_id = p.id
    WHERE p.level = 1
    LIMIT 1;
    
    -- 기본값 설정 (조회 실패 시)
    v_use_invest_api := COALESCE(v_use_invest_api, true);
    v_use_oroplay_api := COALESCE(v_use_oroplay_api, true);
    
    -- balance 계산 (활성화된 API만 합산)
    NEW.balance := 0;
    
    IF v_use_invest_api THEN
      NEW.balance := NEW.balance + COALESCE(NEW.invest_balance, 0);
    END IF;
    
    IF v_use_oroplay_api THEN
      NEW.balance := NEW.balance + COALESCE(NEW.oroplay_balance, 0);
    END IF;
    
    RAISE NOTICE 'Lv% balance 계산: invest=%, oroplay=%, total=% (use_invest=%, use_oroplay=%)', 
      NEW.level, NEW.invest_balance, NEW.oroplay_balance, NEW.balance, v_use_invest_api, v_use_oroplay_api;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 기존 트리거 삭제 및 새 트리거 생성
DROP TRIGGER IF EXISTS trigger_auto_update_lv2_balance ON partners;
DROP TRIGGER IF EXISTS trigger_auto_update_lv1_lv2_balance ON partners;
DROP TRIGGER IF EXISTS trigger_update_lv2_lv3_balance ON partners;
DROP TRIGGER IF EXISTS trigger_update_lv3_balance ON partners;

CREATE TRIGGER trigger_auto_update_lv1_lv2_balance
  BEFORE INSERT OR UPDATE OF invest_balance, oroplay_balance, level
  ON partners
  FOR EACH ROW
  WHEN (NEW.level IN (1, 2))
  EXECUTE FUNCTION auto_update_lv1_lv2_balance();

-- 3. 기존 Lv1, Lv2 데이터 balance 재계산 (API 설정 반영)
DO $$
DECLARE
  v_use_invest_api BOOLEAN;
  v_use_oroplay_api BOOLEAN;
BEGIN
  -- Lv1의 API 설정 조회
  SELECT ac.use_invest_api, ac.use_oroplay_api
  INTO v_use_invest_api, v_use_oroplay_api
  FROM partners p
  INNER JOIN api_configs ac ON ac.partner_id = p.id
  WHERE p.level = 1
  LIMIT 1;
  
  -- 기본값 설정
  v_use_invest_api := COALESCE(v_use_invest_api, true);
  v_use_oroplay_api := COALESCE(v_use_oroplay_api, true);
  
  -- Lv1, Lv2 balance 재계산
  IF v_use_invest_api AND v_use_oroplay_api THEN
    -- 두 API 모두 활성화
    UPDATE partners
    SET balance = COALESCE(invest_balance, 0) + COALESCE(oroplay_balance, 0),
        updated_at = NOW()
    WHERE level IN (1, 2);
  ELSIF v_use_invest_api THEN
    -- Invest만 활성화
    UPDATE partners
    SET balance = COALESCE(invest_balance, 0),
        updated_at = NOW()
    WHERE level IN (1, 2);
  ELSIF v_use_oroplay_api THEN
    -- OroPlay만 활성화
    UPDATE partners
    SET balance = COALESCE(oroplay_balance, 0),
        updated_at = NOW()
    WHERE level IN (1, 2);
  END IF;
  
  RAISE NOTICE 'Lv1, Lv2 balance 재계산 완료 (use_invest=%, use_oroplay=%)', v_use_invest_api, v_use_oroplay_api;
END $$;

-- 4. API 설정 변경 시 Lv1, Lv2 balance 재계산 트리거 함수
CREATE OR REPLACE FUNCTION recalculate_lv1_lv2_balance_on_api_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Lv1의 API 설정 변경 시 모든 Lv1, Lv2 파트너의 balance 재계산
  IF EXISTS (SELECT 1 FROM partners WHERE id = NEW.partner_id AND level = 1) THEN
    -- Lv1, Lv2 balance 재계산
    IF NEW.use_invest_api AND NEW.use_oroplay_api THEN
      -- 두 API 모두 활성화
      UPDATE partners
      SET balance = COALESCE(invest_balance, 0) + COALESCE(oroplay_balance, 0),
          updated_at = NOW()
      WHERE level IN (1, 2);
    ELSIF NEW.use_invest_api THEN
      -- Invest만 활성화
      UPDATE partners
      SET balance = COALESCE(invest_balance, 0),
          updated_at = NOW()
      WHERE level IN (1, 2);
    ELSIF NEW.use_oroplay_api THEN
      -- OroPlay만 활성화
      UPDATE partners
      SET balance = COALESCE(oroplay_balance, 0),
          updated_at = NOW()
      WHERE level IN (1, 2);
    END IF;
    
    RAISE NOTICE 'API 설정 변경으로 Lv1, Lv2 balance 재계산 완료 (use_invest=%, use_oroplay=%)', 
      NEW.use_invest_api, NEW.use_oroplay_api;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. API 설정 변경 시 트리거 생성
DROP TRIGGER IF EXISTS trigger_recalculate_lv2_lv3_balance ON api_configs;
DROP TRIGGER IF EXISTS trigger_recalculate_lv1_lv2_balance ON api_configs;

CREATE TRIGGER trigger_recalculate_lv1_lv2_balance
  AFTER UPDATE OF use_invest_api, use_oroplay_api
  ON api_configs
  FOR EACH ROW
  WHEN (OLD.use_invest_api IS DISTINCT FROM NEW.use_invest_api OR 
        OLD.use_oroplay_api IS DISTINCT FROM NEW.use_oroplay_api)
  EXECUTE FUNCTION recalculate_lv1_lv2_balance_on_api_change();

-- 6. 주석 추가
COMMENT ON FUNCTION auto_update_lv1_lv2_balance() IS 'Lv1/Lv2의 balance를 활성화된 API 보유금만 합산하여 자동 계산 (Lv3 제외)';
COMMENT ON TRIGGER trigger_auto_update_lv1_lv2_balance ON partners IS 'Lv1/Lv2 파트너의 API 보유금 변경 시 balance 자동 업데이트 (API 설정 반영)';
COMMENT ON FUNCTION recalculate_lv1_lv2_balance_on_api_change() IS 'API 설정 변경 시 Lv1/Lv2 balance 재계산 (Lv3 제외)';
COMMENT ON TRIGGER trigger_recalculate_lv1_lv2_balance ON api_configs IS 'API 설정 변경 시 Lv1/Lv2 balance 재계산 (Lv3 제외)';

-- 7. 검증 쿼리 (실행 후 확인용)
-- SELECT p.id, p.username, p.level, p.invest_balance, p.oroplay_balance, p.balance,
--        ac.use_invest_api, ac.use_oroplay_api
-- FROM partners p
-- LEFT JOIN api_configs ac ON ac.partner_id = (SELECT id FROM partners WHERE level = 1 LIMIT 1)
-- WHERE p.level IN (1, 2)
-- ORDER BY p.level, p.created_at;
