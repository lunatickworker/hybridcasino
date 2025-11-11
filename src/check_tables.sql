-- 메뉴 관련 테이블 구조 확인

-- 1. 모든 메뉴 관련 테이블 찾기
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE '%menu%' OR table_name LIKE '%permission%')
ORDER BY table_name;

-- 2. 각 테이블의 컬럼 구조 확인
-- (위 결과를 보고 실제 테이블명을 사용해서 다시 조회)
