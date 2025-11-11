-- ============================================
-- DB 구조 확인: 메뉴 관련 테이블
-- ============================================

-- 1. menu_functions 테이블 구조 확인
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'menu_functions'
ORDER BY ordinal_position;

-- 2. partner_menu_permissions 테이블 구조 확인
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'partner_menu_permissions'
ORDER BY ordinal_position;

-- 3. 메뉴 관련 모든 테이블 목록 확인
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE '%menu%' OR table_name LIKE '%permission%')
ORDER BY table_name;

-- 4. 기존 RPC 함수 확인
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_name LIKE '%menu%'
ORDER BY routine_name;
