-- ============================================
-- 공지사항 및 배너 다국어 지원 컬럼 추가
-- ============================================
-- 작성일: 2025-01-11
-- 목적: 공지사항과 배너의 제목/내용을 다국어로 관리

-- ============================================
-- 1. announcements 테이블에 다국어 컬럼 추가
-- ============================================
DO $$
BEGIN
  -- title_en 컬럼 추가 (영어 제목)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'announcements' 
    AND column_name = 'title_en'
  ) THEN
    ALTER TABLE announcements ADD COLUMN title_en TEXT;
    RAISE NOTICE '✅ announcements.title_en 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  announcements.title_en 컬럼이 이미 존재합니다';
  END IF;

  -- title_ko 컬럼 추가 (한국어 제목)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'announcements' 
    AND column_name = 'title_ko'
  ) THEN
    ALTER TABLE announcements ADD COLUMN title_ko TEXT;
    RAISE NOTICE '✅ announcements.title_ko 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  announcements.title_ko 컬럼이 이미 존재합니다';
  END IF;

  -- content_en 컬럼 추가 (영어 내용)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'announcements' 
    AND column_name = 'content_en'
  ) THEN
    ALTER TABLE announcements ADD COLUMN content_en TEXT;
    RAISE NOTICE '✅ announcements.content_en 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  announcements.content_en 컬럼이 이미 존재합니다';
  END IF;

  -- content_ko 컬럼 추가 (한국어 내용)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'announcements' 
    AND column_name = 'content_ko'
  ) THEN
    ALTER TABLE announcements ADD COLUMN content_ko TEXT;
    RAISE NOTICE '✅ announcements.content_ko 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  announcements.content_ko 컬럼이 이미 존재합니다';
  END IF;
END $$;

-- 기존 데이터를 한국어 컬럼으로 복사
UPDATE announcements 
SET title_ko = title,
    content_ko = content
WHERE title_ko IS NULL AND title IS NOT NULL;

COMMENT ON COLUMN announcements.title IS '제목 (기본값, 호환성 유지)';
COMMENT ON COLUMN announcements.title_ko IS '제목 (한국어)';
COMMENT ON COLUMN announcements.title_en IS '제목 (영어)';
COMMENT ON COLUMN announcements.content IS '내용 (기본값, 호환성 유지)';
COMMENT ON COLUMN announcements.content_ko IS '내용 (한국어)';
COMMENT ON COLUMN announcements.content_en IS '내용 (영어)';

-- ============================================
-- 2. banners 테이블에 다국어 컬럼 추가
-- ============================================
DO $$
BEGIN
  -- title_en 컬럼 추가 (영어 제목)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banners' 
    AND column_name = 'title_en'
  ) THEN
    ALTER TABLE banners ADD COLUMN title_en TEXT;
    RAISE NOTICE '✅ banners.title_en 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  banners.title_en 컬럼이 이미 존재합니다';
  END IF;

  -- title_ko 컬럼 추가 (한국어 제목)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banners' 
    AND column_name = 'title_ko'
  ) THEN
    ALTER TABLE banners ADD COLUMN title_ko TEXT;
    RAISE NOTICE '✅ banners.title_ko 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  banners.title_ko 컬럼이 이미 존재합니다';
  END IF;

  -- content_en 컬럼 추가 (영어 내용)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banners' 
    AND column_name = 'content_en'
  ) THEN
    ALTER TABLE banners ADD COLUMN content_en TEXT;
    RAISE NOTICE '✅ banners.content_en 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  banners.content_en 컬럼이 이미 존재합니다';
  END IF;

  -- content_ko 컬럼 추가 (한국어 내용)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banners' 
    AND column_name = 'content_ko'
  ) THEN
    ALTER TABLE banners ADD COLUMN content_ko TEXT;
    RAISE NOTICE '✅ banners.content_ko 컬럼 추가 완료';
  ELSE
    RAISE NOTICE 'ℹ️  banners.content_ko 컬럼이 이미 존재합니다';
  END IF;
END $$;

-- 기존 데이터를 한국어 컬럼으로 복사
UPDATE banners 
SET title_ko = title,
    content_ko = content
WHERE title_ko IS NULL AND title IS NOT NULL;

COMMENT ON COLUMN banners.title IS '제목 (기본값, 호환성 유지)';
COMMENT ON COLUMN banners.title_ko IS '제목 (한국어)';
COMMENT ON COLUMN banners.title_en IS '제목 (영어)';
COMMENT ON COLUMN banners.content IS '내용 (기본값, 호환성 유지)';
COMMENT ON COLUMN banners.content_ko IS '내용 (한국어)';
COMMENT ON COLUMN banners.content_en IS '내용 (영어)';

-- ============================================
-- 3. 인덱스 추가 (검색 성능 최적화)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_announcements_title_ko ON announcements(title_ko);
CREATE INDEX IF NOT EXISTS idx_announcements_title_en ON announcements(title_en);
CREATE INDEX IF NOT EXISTS idx_banners_title_ko ON banners(title_ko);
CREATE INDEX IF NOT EXISTS idx_banners_title_en ON banners(title_en);

-- ============================================
-- 4. 헬퍼 함수: 언어별 제목/내용 반환
-- ============================================

-- 공지사항 제목을 언어별로 반환하는 함수
CREATE OR REPLACE FUNCTION get_announcement_title(
  p_announcement_id UUID,
  p_language TEXT DEFAULT 'ko'
)
RETURNS TEXT AS $$
DECLARE
  v_title TEXT;
BEGIN
  IF p_language = 'en' THEN
    SELECT COALESCE(title_en, title, title_ko) INTO v_title
    FROM announcements
    WHERE id = p_announcement_id;
  ELSE
    SELECT COALESCE(title_ko, title, title_en) INTO v_title
    FROM announcements
    WHERE id = p_announcement_id;
  END IF;
  
  RETURN v_title;
END;
$$ LANGUAGE plpgsql;

-- 공지사항 내용을 언어별로 반환하는 함수
CREATE OR REPLACE FUNCTION get_announcement_content(
  p_announcement_id UUID,
  p_language TEXT DEFAULT 'ko'
)
RETURNS TEXT AS $$
DECLARE
  v_content TEXT;
BEGIN
  IF p_language = 'en' THEN
    SELECT COALESCE(content_en, content, content_ko) INTO v_content
    FROM announcements
    WHERE id = p_announcement_id;
  ELSE
    SELECT COALESCE(content_ko, content, content_en) INTO v_content
    FROM announcements
    WHERE id = p_announcement_id;
  END IF;
  
  RETURN v_content;
END;
$$ LANGUAGE plpgsql;

-- 배너 제목을 언어별로 반환하는 함수
CREATE OR REPLACE FUNCTION get_banner_title(
  p_banner_id UUID,
  p_language TEXT DEFAULT 'ko'
)
RETURNS TEXT AS $$
DECLARE
  v_title TEXT;
BEGIN
  IF p_language = 'en' THEN
    SELECT COALESCE(title_en, title, title_ko) INTO v_title
    FROM banners
    WHERE id = p_banner_id;
  ELSE
    SELECT COALESCE(title_ko, title, title_en) INTO v_title
    FROM banners
    WHERE id = p_banner_id;
  END IF;
  
  RETURN v_title;
END;
$$ LANGUAGE plpgsql;

-- 배너 내용을 언어별로 반환하는 함수
CREATE OR REPLACE FUNCTION get_banner_content(
  p_banner_id UUID,
  p_language TEXT DEFAULT 'ko'
)
RETURNS TEXT AS $$
DECLARE
  v_content TEXT;
BEGIN
  IF p_language = 'en' THEN
    SELECT COALESCE(content_en, content, content_ko) INTO v_content
    FROM banners
    WHERE id = p_banner_id;
  ELSE
    SELECT COALESCE(content_ko, content, content_en) INTO v_content
    FROM banners
    WHERE id = p_banner_id;
  END IF;
  
  RETURN v_content;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_announcement_title IS '언어별 공지사항 제목 반환 (ko/en)';
COMMENT ON FUNCTION get_announcement_content IS '언어별 공지사항 내용 반환 (ko/en)';
COMMENT ON FUNCTION get_banner_title IS '언어별 배너 제목 반환 (ko/en)';
COMMENT ON FUNCTION get_banner_content IS '언어별 배너 내용 반환 (ko/en)';

-- ============================================
-- 5. 뷰 생성: 다국어 공지사항/배너 목록
-- ============================================

-- 언어별 공지사항 뷰
CREATE OR REPLACE VIEW v_announcements_i18n AS
SELECT 
  id,
  partner_id,
  COALESCE(title_ko, title) as title_ko,
  COALESCE(title_en, title) as title_en,
  COALESCE(title_ko, title) as title,
  COALESCE(content_ko, content) as content_ko,
  COALESCE(content_en, content) as content_en,
  COALESCE(content_ko, content) as content,
  image_url,
  is_popup,
  target_audience,
  target_level,
  status,
  display_order,
  view_count,
  start_date,
  end_date,
  created_at,
  updated_at
FROM announcements;

-- 언어별 배너 뷰
CREATE OR REPLACE VIEW v_banners_i18n AS
SELECT 
  id,
  partner_id,
  COALESCE(title_ko, title) as title_ko,
  COALESCE(title_en, title) as title_en,
  COALESCE(title_ko, title) as title,
  COALESCE(content_ko, content) as content_ko,
  COALESCE(content_en, content) as content_en,
  COALESCE(content_ko, content) as content,
  image_url,
  banner_type,
  target_audience,
  target_level,
  status,
  display_order,
  start_date,
  end_date,
  created_at,
  updated_at
FROM banners;

COMMENT ON VIEW v_announcements_i18n IS '다국어 지원 공지사항 뷰 (한국어/영어)';
COMMENT ON VIEW v_banners_i18n IS '다국어 지원 배너 뷰 (한국어/영어)';

-- ============================================
-- 완료 메시지
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 공지사항/배너 다국어 지원 스키마 업데이트 완료';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 announcements 테이블:';
  RAISE NOTICE '   ✅ title_ko, title_en 컬럼 추가';
  RAISE NOTICE '   ✅ content_ko, content_en 컬럼 추가';
  RAISE NOTICE '   ✅ 기존 데이터 → 한국어 컬럼 복사';
  RAISE NOTICE '';
  RAISE NOTICE '📋 banners 테이블:';
  RAISE NOTICE '   ✅ title_ko, title_en 컬럼 추가';
  RAISE NOTICE '   ✅ content_ko, content_en 컬럼 추가';
  RAISE NOTICE '   ✅ 기존 데이터 → 한국어 컬럼 복사';
  RAISE NOTICE '';
  RAISE NOTICE '📋 헬퍼 함수:';
  RAISE NOTICE '   ✅ get_announcement_title(id, language)';
  RAISE NOTICE '   ✅ get_announcement_content(id, language)';
  RAISE NOTICE '   ✅ get_banner_title(id, language)';
  RAISE NOTICE '   ✅ get_banner_content(id, language)';
  RAISE NOTICE '';
  RAISE NOTICE '📋 뷰:';
  RAISE NOTICE '   ✅ v_announcements_i18n';
  RAISE NOTICE '   ✅ v_banners_i18n';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '사용 방법:';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '1️⃣  프론트엔드에서 언어별 조회:';
  RAISE NOTICE '   const { language } = useLanguage();';
  RAISE NOTICE '   const title = language === ''en'' ? announcement.title_en : announcement.title_ko;';
  RAISE NOTICE '';
  RAISE NOTICE '2️⃣  SQL 함수 사용:';
  RAISE NOTICE '   SELECT get_announcement_title(id, ''en'') FROM announcements;';
  RAISE NOTICE '';
  RAISE NOTICE '3️⃣  뷰 사용:';
  RAISE NOTICE '   SELECT * FROM v_announcements_i18n;';
  RAISE NOTICE '';
END $$;
