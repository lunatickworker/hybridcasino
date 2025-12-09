-- =====================================================
-- 파트너 커미션 시스템 확장: 카지노/슬롯 분리
-- =====================================================
-- 기존: commission_rolling, commission_losing (통합)
-- 변경: casino_rolling_commission, casino_losing_commission, 
--       slot_rolling_commission, slot_losing_commission (분리)
-- =====================================================

-- 1. partners 테이블에 새 컬럼 추가
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS casino_rolling_commission NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS casino_losing_commission NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS slot_rolling_commission NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS slot_losing_commission NUMERIC(5,2) DEFAULT 0;

-- 2. 기존 데이터 마이그레이션 (기존 값을 카지노/슬롯 양쪽에 복사)
UPDATE partners
SET 
  casino_rolling_commission = COALESCE(commission_rolling, 0),
  casino_losing_commission = COALESCE(commission_losing, 0),
  slot_rolling_commission = COALESCE(commission_rolling, 0),
  slot_losing_commission = COALESCE(commission_losing, 0)
WHERE casino_rolling_commission IS NULL 
   OR casino_losing_commission IS NULL
   OR slot_rolling_commission IS NULL
   OR slot_losing_commission IS NULL;

-- 3. NOT NULL 제약 조건 추가
ALTER TABLE partners
ALTER COLUMN casino_rolling_commission SET NOT NULL,
ALTER COLUMN casino_losing_commission SET NOT NULL,
ALTER COLUMN slot_rolling_commission SET NOT NULL,
ALTER COLUMN slot_losing_commission SET NOT NULL;

-- 4. 체크 제약 조건 추가 (0~100% 범위)
ALTER TABLE partners
ADD CONSTRAINT check_casino_rolling_commission_range 
  CHECK (casino_rolling_commission >= 0 AND casino_rolling_commission <= 100),
ADD CONSTRAINT check_casino_losing_commission_range 
  CHECK (casino_losing_commission >= 0 AND casino_losing_commission <= 100),
ADD CONSTRAINT check_slot_rolling_commission_range 
  CHECK (slot_rolling_commission >= 0 AND slot_rolling_commission <= 100),
ADD CONSTRAINT check_slot_losing_commission_range 
  CHECK (slot_losing_commission >= 0 AND slot_losing_commission <= 100);

-- 5. 인덱스 추가 (정산 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_partners_casino_commissions 
  ON partners(casino_rolling_commission, casino_losing_commission);
CREATE INDEX IF NOT EXISTS idx_partners_slot_commissions 
  ON partners(slot_rolling_commission, slot_losing_commission);

-- 6. 코멘트 추가
COMMENT ON COLUMN partners.casino_rolling_commission IS '카지노 게임 롤링 커미션 (%)';
COMMENT ON COLUMN partners.casino_losing_commission IS '카지노 게임 루징 커미션 (%)';
COMMENT ON COLUMN partners.slot_rolling_commission IS '슬롯 게임 롤링 커미션 (%)';
COMMENT ON COLUMN partners.slot_losing_commission IS '슬롯 게임 루징 커미션 (%)';

-- =====================================================
-- 기존 commission_rolling, commission_losing 컬럼은
-- 하위 호환성을 위해 유지하되, 향후 삭제 예정
-- =====================================================
