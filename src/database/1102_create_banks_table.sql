-- ============================================
-- 은행 정보 테이블 생성 및 다국어 지원
-- ============================================
-- 작성일: 2025-01-11
-- 목적: 은행 정보를 별도 테이블로 관리하고 다국어 지원

-- ============================================
-- 1. 기존 banks 테이블 삭제 (있다면)
-- ============================================
DROP TABLE IF EXISTS banks CASCADE;

-- ============================================
-- 2. banks 테이블 생성
-- ============================================
CREATE TABLE banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 은행 코드 (한국 은행 표준 코드)
  bank_code TEXT NOT NULL UNIQUE,
  
  -- 은행 이름 (다국어)
  name TEXT NOT NULL,                    -- 기본 이름 (한국어, 호환성)
  name_ko TEXT NOT NULL,                 -- 한국어 이름
  name_en TEXT,                          -- 영어 이름
  
  -- 은행 정보
  short_name TEXT,                       -- 짧은 이름 (예: KB, 신한)
  logo_url TEXT,                         -- 은행 로고 URL
  
  -- 상태
  status TEXT DEFAULT 'active',          -- 'active' | 'inactive'
  display_order INTEGER DEFAULT 0,       -- 표시 순서
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_banks_bank_code ON banks(bank_code);
CREATE INDEX IF NOT EXISTS idx_banks_status ON banks(status);
CREATE INDEX IF NOT EXISTS idx_banks_display_order ON banks(display_order);
CREATE INDEX IF NOT EXISTS idx_banks_name_ko ON banks(name_ko);
CREATE INDEX IF NOT EXISTS idx_banks_name_en ON banks(name_en);

COMMENT ON TABLE banks IS '은행 정보 (다국어 지원)';
COMMENT ON COLUMN banks.bank_code IS '은행 코드 (한국 은행 표준 코드)';
COMMENT ON COLUMN banks.name IS '은행 이름 (기본값, 호환성 유지)';
COMMENT ON COLUMN banks.name_ko IS '은행 이름 (한국어)';
COMMENT ON COLUMN banks.name_en IS '은행 이름 (영어)';
COMMENT ON COLUMN banks.short_name IS '짧은 이름 (예: KB, 신한)';
COMMENT ON COLUMN banks.logo_url IS '은행 로고 URL';

-- ============================================
-- 3. 기본 은행 데이터 삽입
-- ============================================
INSERT INTO banks (bank_code, name, name_ko, name_en, short_name, display_order) VALUES
  ('001', '한국은행', '한국은행', 'Bank of Korea', 'BOK', 1),
  ('002', 'KDB산업은행', 'KDB산업은행', 'Korea Development Bank', 'KDB', 2),
  ('003', 'IBK기업은행', 'IBK기업은행', 'Industrial Bank of Korea', 'IBK', 3),
  ('004', 'KB국민은행', 'KB국민은행', 'KB Kookmin Bank', 'KB', 4),
  ('005', 'KEB하나은행', 'KEB하나은행', 'KEB Hana Bank', '하나', 5),
  ('007', '수협은행', '수협은행', 'Suhyup Bank', '수협', 6),
  ('008', '수출입은행', '수출입은행', 'Export-Import Bank of Korea', '수출입', 7),
  ('011', 'NH농협은행', 'NH농협은행', 'NH Nonghyup Bank', 'NH', 8),
  ('012', '지역농축협', '지역농축협', 'Local Agricultural Cooperatives', '농축협', 9),
  ('020', '우리은행', '우리은행', 'Woori Bank', '우리', 10),
  ('023', 'SC제일은행', 'SC제일은행', 'SC First Bank', 'SC', 11),
  ('027', '한국씨티은행', '한국씨티은행', 'Citibank Korea', '씨티', 12),
  ('031', '대구은행', '대구은행', 'Daegu Bank', 'DGB', 13),
  ('032', '부산은행', '부산은행', 'Busan Bank', 'BNK부산', 14),
  ('034', '광주은행', '광주은행', 'Gwangju Bank', '광주', 15),
  ('035', '제주은행', '제주은행', 'Jeju Bank', '제주', 16),
  ('037', '전북은행', '전북은행', 'Jeonbuk Bank', '전북', 17),
  ('039', '경남은행', '경남은행', 'Kyongnam Bank', 'BNK경남', 18),
  ('045', '새마을금고', '새마을금고', 'Korea Federation of Community Credit Cooperatives', '새마을', 19),
  ('048', '신협', '신협', 'National Credit Union Federation of Korea', '신협', 20),
  ('050', '저축은행', '저축은행', 'Savings Bank', '저축', 21),
  ('052', '모건스탠리은행', '모건스탠리은행', 'Morgan Stanley Bank', 'MS', 22),
  ('054', 'HSBC은행', 'HSBC은행', 'HSBC Bank', 'HSBC', 23),
  ('055', '도이치은행', '도이치은행', 'Deutsche Bank', 'Deutsche', 24),
  ('056', 'ABN암로은행', 'ABN암로은행', 'ABN AMRO Bank', 'ABN', 25),
  ('057', 'JP모간체이스은행', 'JP모간체이스은행', 'JP Morgan Chase Bank', 'JP모간', 26),
  ('058', '미즈호은행', '미즈호은행', 'Mizuho Bank', 'Mizuho', 27),
  ('059', '미쓰비시UFJ은행', '미쓰비시UFJ은행', 'MUFG Bank', 'MUFG', 28),
  ('060', 'BOA은행', 'BOA은행', 'Bank of America', 'BOA', 29),
  ('061', '비엔피파리바은행', '비엔피파리바은행', 'BNP Paribas', 'BNP', 30),
  ('062', '중국공상은행', '중국공상은행', 'Industrial and Commercial Bank of China', 'ICBC', 31),
  ('063', '중국은행', '중국은행', 'Bank of China', 'BOC', 32),
  ('064', '산림조합중앙회', '산림조합중앙회', 'National Forestry Cooperatives Federation', '산림', 33),
  ('065', '대화은행', '대화은행', 'DaHua Bank', '대화', 34),
  ('066', '교통은행', '교통은행', 'Bank of Communications', '교통', 35),
  ('067', '중국건설은행', '중국건설은행', 'China Construction Bank', 'CCB', 36),
  ('071', '우체국', '우체국', 'Korea Post', '우체국', 37),
  ('076', '신용보증기금', '신용보증기금', 'Korea Credit Guarantee Fund', 'KODIT', 38),
  ('077', '기술보증기금', '기술보증기금', 'Korea Technology Finance Corporation', 'KIBO', 39),
  ('081', 'KEB하나은행', 'KEB하나은행', 'KEB Hana Bank', 'KEB', 40),
  ('088', '신한은행', '신한은행', 'Shinhan Bank', '신한', 41),
  ('089', '케이뱅크', '케이뱅크', 'K bank', '케이뱅크', 42),
  ('090', '카카오뱅크', '카카오뱅크', 'Kakao Bank', '카카오', 43),
  ('092', '토스뱅크', '토스뱅크', 'Toss Bank', '토스', 44)
ON CONFLICT (bank_code) DO UPDATE SET
  name = EXCLUDED.name,
  name_ko = EXCLUDED.name_ko,
  name_en = EXCLUDED.name_en,
  short_name = EXCLUDED.short_name,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- ============================================
-- 4. 헬퍼 함수: 언어별 은행 이름 반환
-- ============================================
CREATE OR REPLACE FUNCTION get_bank_name(
  p_bank_code TEXT,
  p_language TEXT DEFAULT 'ko'
)
RETURNS TEXT AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF p_language = 'en' THEN
    SELECT COALESCE(name_en, name, name_ko) INTO v_name
    FROM banks
    WHERE bank_code = p_bank_code;
  ELSE
    SELECT COALESCE(name_ko, name, name_en) INTO v_name
    FROM banks
    WHERE bank_code = p_bank_code;
  END IF;
  
  RETURN v_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_bank_name IS '언어별 은행 이름 반환 (ko/en)';

-- ============================================
-- 5. 뷰 생성: 다국어 은행 목록
-- ============================================
CREATE OR REPLACE VIEW v_banks_i18n AS
SELECT 
  id,
  bank_code,
  COALESCE(name_ko, name) as name_ko,
  COALESCE(name_en, name) as name_en,
  COALESCE(name_ko, name) as name,
  short_name,
  logo_url,
  status,
  display_order,
  created_at,
  updated_at
FROM banks
WHERE status = 'active'
ORDER BY display_order, name_ko;

COMMENT ON VIEW v_banks_i18n IS '다국어 지원 은행 목록 뷰 (활성 은행만, 정렬됨)';

-- ============================================
-- 완료 메시지
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 은행 정보 테이블 생성 완료';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 banks 테이블:';
  RAISE NOTICE '   ✅ 44개 주요 은행 데이터 삽입 완료';
  RAISE NOTICE '   ✅ name_ko, name_en 컬럼 (다국어 지원)';
  RAISE NOTICE '   ✅ bank_code (표준 은행 코드)';
  RAISE NOTICE '';
  RAISE NOTICE '📋 헬퍼 함수:';
  RAISE NOTICE '   ✅ get_bank_name(bank_code, language)';
  RAISE NOTICE '';
  RAISE NOTICE '📋 뷰:';
  RAISE NOTICE '   ✅ v_banks_i18n (활성 은행 목록)';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '사용 방법:';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '1️⃣  프론트엔드에서 은행 목록 조회:';
  RAISE NOTICE '   SELECT * FROM v_banks_i18n;';
  RAISE NOTICE '';
  RAISE NOTICE '2️⃣  언어별 은행 이름 조회:';
  RAISE NOTICE '   const { language } = useLanguage();';
  RAISE NOTICE '   const bankName = language === ''en'' ? bank.name_en : bank.name_ko;';
  RAISE NOTICE '';
  RAISE NOTICE '3️⃣  SQL 함수 사용:';
  RAISE NOTICE '   SELECT get_bank_name(''004'', ''en''); -- KB Kookmin Bank';
  RAISE NOTICE '';
  RAISE NOTICE '💡 참고: partners/users 테이블의 bank_name 컬럼은';
  RAISE NOTICE '   향후 bank_code로 변경하여 banks 테이블과 연결 권장';
  RAISE NOTICE '';
END $$;
