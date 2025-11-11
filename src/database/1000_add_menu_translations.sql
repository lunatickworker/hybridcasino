-- ================================================
-- 메뉴 다국어 지원 테이블 스키마 업데이트
-- ================================================

-- 1. menu_permissions 테이블에 영문 컬럼 추가
ALTER TABLE menu_permissions 
ADD COLUMN IF NOT EXISTS menu_name_en VARCHAR(100),
ADD COLUMN IF NOT EXISTS parent_menu_en VARCHAR(100),
ADD COLUMN IF NOT EXISTS description_en TEXT;

-- 2. 먼저 모든 NULL 값을 기본값으로 채우기 (parent_menu가 없는 경우)
UPDATE menu_permissions 
SET parent_menu_en = NULL
WHERE parent_menu IS NULL;

-- 3. 메뉴 한글/영문 데이터 업데이트
UPDATE menu_permissions SET 
  menu_name_en = 'Dashboard',
  description_en = 'Main dashboard with statistics and overview'
WHERE menu_name = '대시보드';

UPDATE menu_permissions SET 
  menu_name_en = 'User Management',
  description_en = 'Manage user accounts, balances, and permissions'
WHERE menu_name = '회원 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'User List',
  parent_menu_en = 'User Management',
  description_en = 'View and manage all user accounts'
WHERE menu_name = '회원 목록';

UPDATE menu_permissions SET 
  menu_name_en = 'Blacklist',
  parent_menu_en = 'User Management',
  description_en = 'Manage blocked users and IP addresses'
WHERE menu_name = '블랙리스트';

UPDATE menu_permissions SET 
  menu_name_en = 'Point Management',
  parent_menu_en = 'User Management',
  description_en = 'Manage user points and rewards'
WHERE menu_name = '포인트 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Online Users',
  parent_menu_en = 'User Management',
  description_en = 'View currently online users'
WHERE menu_name = '접속자 현황';

UPDATE menu_permissions SET 
  menu_name_en = 'Activity Logs',
  parent_menu_en = 'User Management',
  description_en = 'View user activity and login history'
WHERE menu_name = '활동 로그';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner Management',
  description_en = 'Manage partner hierarchy and commissions'
WHERE menu_name = '파트너 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner List',
  parent_menu_en = 'Partner Management',
  description_en = 'View and manage all partners'
WHERE menu_name = '파트너 목록';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner Hierarchy',
  parent_menu_en = 'Partner Management',
  description_en = 'View partner organizational structure'
WHERE menu_name = '파트너 계층';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner Transactions',
  parent_menu_en = 'Partner Management',
  description_en = 'View partner transaction history'
WHERE menu_name = '파트너 거래';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner Online Status',
  parent_menu_en = 'Partner Management',
  description_en = 'View partner connection status'
WHERE menu_name = '파트너 접속 현황';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner Dashboard',
  parent_menu_en = 'Partner Management',
  description_en = 'Partner performance dashboard'
WHERE menu_name = '파트너 대시보드';

UPDATE menu_permissions SET 
  menu_name_en = 'Settlement Management',
  description_en = 'Manage settlements and commissions'
WHERE menu_name = '정산 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Commission Settlement',
  parent_menu_en = 'Settlement Management',
  description_en = 'Calculate and manage partner commissions'
WHERE menu_name = '수수료 정산';

UPDATE menu_permissions SET 
  menu_name_en = 'Integrated Settlement',
  parent_menu_en = 'Settlement Management',
  description_en = 'Comprehensive settlement overview'
WHERE menu_name = '통합 정산';

UPDATE menu_permissions SET 
  menu_name_en = 'Settlement History',
  parent_menu_en = 'Settlement Management',
  description_en = 'View past settlement records'
WHERE menu_name = '정산 내역';

UPDATE menu_permissions SET 
  menu_name_en = 'Transaction Management',
  description_en = 'Manage deposits and withdrawals'
WHERE menu_name = '입출금 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Transaction Approval',
  parent_menu_en = 'Transaction Management',
  description_en = 'Approve or reject deposit/withdrawal requests'
WHERE menu_name = '거래 승인';

UPDATE menu_permissions SET 
  menu_name_en = 'Game Management',
  description_en = 'Manage games and providers'
WHERE menu_name = '게임 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Game Lists',
  parent_menu_en = 'Game Management',
  description_en = 'View and configure game lists'
WHERE menu_name = '게임 목록';

UPDATE menu_permissions SET 
  menu_name_en = 'Betting Management',
  description_en = 'View and manage betting activities'
WHERE menu_name = '베팅 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Betting History',
  parent_menu_en = 'Betting Management',
  description_en = 'View betting transaction history'
WHERE menu_name = '베팅 내역';

UPDATE menu_permissions SET 
  menu_name_en = 'Call Cycle',
  parent_menu_en = 'Betting Management',
  description_en = 'Manage API call cycles and sync'
WHERE menu_name = '호출 주기';

UPDATE menu_permissions SET 
  menu_name_en = 'Customer Support',
  description_en = 'Handle customer inquiries and support'
WHERE menu_name = '고객지원';

UPDATE menu_permissions SET 
  menu_name_en = 'Support Tickets',
  parent_menu_en = 'Customer Support',
  description_en = 'Manage customer support tickets'
WHERE menu_name = '문의 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Announcements',
  parent_menu_en = 'Customer Support',
  description_en = 'Create and manage announcements'
WHERE menu_name = '공지사항';

UPDATE menu_permissions SET 
  menu_name_en = 'Message Center',
  parent_menu_en = 'Customer Support',
  description_en = 'Send and manage messages'
WHERE menu_name = '메시지 센터';

UPDATE menu_permissions SET 
  menu_name_en = 'System Settings',
  description_en = 'Configure system settings and preferences'
WHERE menu_name = '시스템 설정';

UPDATE menu_permissions SET 
  menu_name_en = 'System Configuration',
  parent_menu_en = 'System Settings',
  description_en = 'General system configuration'
WHERE menu_name = '시스템 구성';

UPDATE menu_permissions SET 
  menu_name_en = 'API Tester',
  parent_menu_en = 'System Settings',
  description_en = 'Test API endpoints and responses'
WHERE menu_name = 'API 테스터';

UPDATE menu_permissions SET 
  menu_name_en = 'Banner Management',
  parent_menu_en = 'System Settings',
  description_en = 'Manage promotional banners'
WHERE menu_name = '배너 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Menu Management',
  parent_menu_en = 'System Settings',
  description_en = 'Configure menu structure and permissions'
WHERE menu_name = '메뉴 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Auto Sync Monitor',
  parent_menu_en = 'System Settings',
  description_en = 'Monitor automatic synchronization status'
WHERE menu_name = '자동 동기화 모니터';

-- 3. 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_menu_permissions_name_en ON menu_permissions(menu_name_en);
CREATE INDEX IF NOT EXISTS idx_menu_permissions_parent_en ON menu_permissions(parent_menu_en);

-- 4. 코멘트 추가
COMMENT ON COLUMN menu_permissions.menu_name_en IS 'Menu name in English';
COMMENT ON COLUMN menu_permissions.parent_menu_en IS 'Parent menu name in English';
COMMENT ON COLUMN menu_permissions.description_en IS 'Menu description in English';

-- 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ Menu translation columns added and data updated successfully';
END $$;
