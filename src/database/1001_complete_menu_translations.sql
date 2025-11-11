-- ================================================
-- 전체 메뉴 영문 번역 완료 (모든 메뉴 항목)
-- ================================================

-- ============================================
-- 1단계: 최상위 메뉴 (Parent가 없는 메뉴)
-- ============================================

-- 대시보드
UPDATE menu_permissions SET 
  menu_name_en = 'Dashboard',
  description_en = 'Main dashboard with statistics and overview'
WHERE menu_name = '대시보드' AND parent_menu IS NULL;

-- 회원 관리
UPDATE menu_permissions SET 
  menu_name_en = 'User Management',
  description_en = 'Manage user accounts, balances, and permissions'
WHERE menu_name = '회원 관리' AND parent_menu IS NULL;

-- 파트너 관리
UPDATE menu_permissions SET 
  menu_name_en = 'Partner Management',
  description_en = 'Manage partner hierarchy and commissions'
WHERE menu_name = '파트너 관리' AND parent_menu IS NULL;

-- 정산 관리
UPDATE menu_permissions SET 
  menu_name_en = 'Settlement Management',
  description_en = 'Manage settlements and commissions'
WHERE menu_name = '정산 관리' AND parent_menu IS NULL;

-- 입출금 관리
UPDATE menu_permissions SET 
  menu_name_en = 'Transaction Management',
  description_en = 'Manage deposits and withdrawals'
WHERE menu_name = '입출금 관리' AND parent_menu IS NULL;

-- 거래 관리
UPDATE menu_permissions SET 
  menu_name_en = 'Transaction Management',
  description_en = 'Manage financial transactions'
WHERE menu_name = '거래 관리' AND parent_menu IS NULL;

-- 게임 관리
UPDATE menu_permissions SET 
  menu_name_en = 'Game Management',
  description_en = 'Manage games and providers'
WHERE menu_name = '게임 관리' AND parent_menu IS NULL;

-- 베팅 관리
UPDATE menu_permissions SET 
  menu_name_en = 'Betting Management',
  description_en = 'View and manage betting activities'
WHERE menu_name = '베팅 관리' AND parent_menu IS NULL;

-- 고객지원
UPDATE menu_permissions SET 
  menu_name_en = 'Customer Support',
  description_en = 'Handle customer inquiries and support'
WHERE menu_name = '고객지원' AND parent_menu IS NULL;

-- 커뮤니케이션
UPDATE menu_permissions SET 
  menu_name_en = 'Communication',
  description_en = 'Communication and messaging tools'
WHERE menu_name = '커뮤니케이션' AND parent_menu IS NULL;

-- 시스템 설정
UPDATE menu_permissions SET 
  menu_name_en = 'System Settings',
  description_en = 'Configure system settings and preferences'
WHERE menu_name = '시스템 설정' AND parent_menu IS NULL;

-- 시스템
UPDATE menu_permissions SET 
  menu_name_en = 'System',
  description_en = 'System management and monitoring'
WHERE menu_name = '시스템' AND parent_menu IS NULL;

-- ============================================
-- 2단계: 회원 관리 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'User List',
  parent_menu_en = 'User Management',
  description_en = 'View and manage all user accounts'
WHERE menu_name = '회원 목록' AND parent_menu = '회원 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Blacklist',
  parent_menu_en = 'User Management',
  description_en = 'Manage blocked users and IP addresses'
WHERE menu_name = '블랙리스트' AND parent_menu = '회원 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Point Management',
  parent_menu_en = 'User Management',
  description_en = 'Manage user points and rewards'
WHERE menu_name = '포인트 관리' AND parent_menu = '회원 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Online Users',
  parent_menu_en = 'User Management',
  description_en = 'View currently online users'
WHERE menu_name = '접속자 현황' AND parent_menu = '회원 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Online Status',
  parent_menu_en = 'User Management',
  description_en = 'Monitor user online status'
WHERE menu_name = '온라인 현황' AND parent_menu = '회원 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Activity Logs',
  parent_menu_en = 'User Management',
  description_en = 'View user activity and login history'
WHERE menu_name = '활동 로그' AND parent_menu = '회원 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'User Management',
  parent_menu_en = 'User Management',
  description_en = 'Comprehensive user account management'
WHERE menu_name = '회원 관리' AND parent_menu = '회원 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'User Statistics',
  parent_menu_en = 'User Management',
  description_en = 'View user statistics and analytics'
WHERE menu_name = '회원 통계' AND parent_menu = '회원 관리';

-- ============================================
-- 3단계: 파트너 관리 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'Partner List',
  parent_menu_en = 'Partner Management',
  description_en = 'View and manage all partners'
WHERE menu_name = '파트너 목록' AND parent_menu = '파트너 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Master Agent',
  parent_menu_en = 'Partner Management',
  description_en = 'Manage master agent accounts'
WHERE menu_name = '대본사' AND parent_menu = '파트너 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Head Office',
  parent_menu_en = 'Partner Management',
  description_en = 'Manage head office accounts'
WHERE menu_name = '본사' AND parent_menu = '파트너 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner Hierarchy',
  parent_menu_en = 'Partner Management',
  description_en = 'View partner organizational structure'
WHERE menu_name = '파트너 계층' AND parent_menu = '파트너 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner Transactions',
  parent_menu_en = 'Partner Management',
  description_en = 'View partner transaction history'
WHERE menu_name = '파트너 거래' AND parent_menu = '파트너 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner Online Status',
  parent_menu_en = 'Partner Management',
  description_en = 'View partner connection status'
WHERE menu_name = '파트너 접속 현황' AND parent_menu = '파트너 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Partner Dashboard',
  parent_menu_en = 'Partner Management',
  description_en = 'Partner performance dashboard'
WHERE menu_name = '파트너 대시보드' AND parent_menu = '파트너 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Connection Status',
  parent_menu_en = 'Partner Management',
  description_en = 'Monitor partner connection status'
WHERE menu_name = '접속 현황' AND parent_menu = '파트너 관리';

-- ============================================
-- 4단계: 정산 관리 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'Commission Settlement',
  parent_menu_en = 'Settlement Management',
  description_en = 'Calculate and manage partner commissions'
WHERE menu_name = '수수료 정산' AND parent_menu = '정산 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Integrated Settlement',
  parent_menu_en = 'Settlement Management',
  description_en = 'Comprehensive settlement overview'
WHERE menu_name = '통합 정산' AND parent_menu = '정산 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Settlement History',
  parent_menu_en = 'Settlement Management',
  description_en = 'View past settlement records'
WHERE menu_name = '정산 내역' AND parent_menu = '정산 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Settlement Reports',
  parent_menu_en = 'Settlement Management',
  description_en = 'Generate settlement reports'
WHERE menu_name = '정산 리포트' AND parent_menu = '정산 관리';

-- ============================================
-- 5단계: 입출금/거래 관리 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'Transaction Approval',
  parent_menu_en = 'Transaction Management',
  description_en = 'Approve or reject deposit/withdrawal requests'
WHERE menu_name = '거래 승인' AND parent_menu IN ('입출금 관리', '거래 관리');

UPDATE menu_permissions SET 
  menu_name_en = 'Deposit Management',
  parent_menu_en = 'Transaction Management',
  description_en = 'Manage deposit transactions'
WHERE menu_name = '입금 관리' AND parent_menu IN ('입출금 관리', '거래 관리');

UPDATE menu_permissions SET 
  menu_name_en = 'Withdrawal Management',
  parent_menu_en = 'Transaction Management',
  description_en = 'Manage withdrawal transactions'
WHERE menu_name = '출금 관리' AND parent_menu IN ('입출금 관리', '거래 관리');

UPDATE menu_permissions SET 
  menu_name_en = 'Transaction History',
  parent_menu_en = 'Transaction Management',
  description_en = 'View complete transaction history'
WHERE menu_name = '거래 내역' AND parent_menu IN ('입출금 관리', '거래 관리');

UPDATE menu_permissions SET 
  menu_name_en = 'Transaction Management',
  parent_menu_en = 'Transaction Management',
  description_en = 'Comprehensive transaction management'
WHERE menu_name = '입출금 관리' AND parent_menu = '입출금 관리';

-- ============================================
-- 6단계: 게임 관리 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'Game Lists',
  parent_menu_en = 'Game Management',
  description_en = 'View and configure game lists'
WHERE menu_name = '게임 목록' AND parent_menu = '게임 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Provider Management',
  parent_menu_en = 'Game Management',
  description_en = 'Manage game providers'
WHERE menu_name = '제공사 관리' AND parent_menu = '게임 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Game Settings',
  parent_menu_en = 'Game Management',
  description_en = 'Configure game settings and options'
WHERE menu_name = '게임 설정' AND parent_menu = '게임 관리';

-- ============================================
-- 7단계: 베팅 관리 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'Betting History',
  parent_menu_en = 'Betting Management',
  description_en = 'View betting transaction history'
WHERE menu_name = '베팅 내역' AND parent_menu = '베팅 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Call Cycle',
  parent_menu_en = 'Betting Management',
  description_en = 'Manage API call cycles and sync'
WHERE menu_name = '호출 주기' AND parent_menu = '베팅 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Betting Statistics',
  parent_menu_en = 'Betting Management',
  description_en = 'View betting statistics and analytics'
WHERE menu_name = '베팅 통계' AND parent_menu = '베팅 관리';

UPDATE menu_permissions SET 
  menu_name_en = 'Betting Monitoring',
  parent_menu_en = 'Betting Management',
  description_en = 'Real-time betting monitoring'
WHERE menu_name = '베팅 모니터링' AND parent_menu = '베팅 관리';

-- ============================================
-- 8단계: 고객지원 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'Support Tickets',
  parent_menu_en = 'Customer Support',
  description_en = 'Manage customer support tickets'
WHERE menu_name = '문의 관리' AND parent_menu = '고객지원';

UPDATE menu_permissions SET 
  menu_name_en = 'Customer Service',
  parent_menu_en = 'Customer Support',
  description_en = 'Customer service management'
WHERE menu_name = '고객 서비스' AND parent_menu = '고객지원';

UPDATE menu_permissions SET 
  menu_name_en = 'Announcements',
  parent_menu_en = 'Customer Support',
  description_en = 'Create and manage announcements'
WHERE menu_name = '공지사항' AND parent_menu = '고객지원';

UPDATE menu_permissions SET 
  menu_name_en = 'Message Center',
  parent_menu_en = 'Customer Support',
  description_en = 'Send and manage messages'
WHERE menu_name = '메시지 센터' AND parent_menu = '고객지원';

UPDATE menu_permissions SET 
  menu_name_en = 'FAQ Management',
  parent_menu_en = 'Customer Support',
  description_en = 'Manage frequently asked questions'
WHERE menu_name = 'FAQ 관리' AND parent_menu = '고객지원';

-- ============================================
-- 9단계: 커뮤니케이션 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'Messages',
  parent_menu_en = 'Communication',
  description_en = 'Internal messaging system'
WHERE menu_name = '메시지' AND parent_menu = '커뮤니케이션';

UPDATE menu_permissions SET 
  menu_name_en = 'Notifications',
  parent_menu_en = 'Communication',
  description_en = 'Push notification management'
WHERE menu_name = '알림' AND parent_menu = '커뮤니케이션';

UPDATE menu_permissions SET 
  menu_name_en = 'Broadcast',
  parent_menu_en = 'Communication',
  description_en = 'Send broadcast messages'
WHERE menu_name = '방송' AND parent_menu = '커뮤니케이션';

-- ============================================
-- 10단계: 시스템 설정 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'System Configuration',
  parent_menu_en = 'System Settings',
  description_en = 'General system configuration'
WHERE menu_name = '시스템 구성' AND parent_menu = '시스템 설정';

UPDATE menu_permissions SET 
  menu_name_en = 'API Settings',
  parent_menu_en = 'System Settings',
  description_en = 'Configure API settings and credentials'
WHERE menu_name = 'API 설정' AND parent_menu = '시스템 설정';

UPDATE menu_permissions SET 
  menu_name_en = 'API Tester',
  parent_menu_en = 'System Settings',
  description_en = 'Test API endpoints and responses'
WHERE menu_name = 'API 테스터' AND parent_menu = '시스템 설정';

UPDATE menu_permissions SET 
  menu_name_en = 'Banner Management',
  parent_menu_en = 'System Settings',
  description_en = 'Manage promotional banners'
WHERE menu_name = '배너 관리' AND parent_menu = '시스템 설정';

UPDATE menu_permissions SET 
  menu_name_en = 'Menu Management',
  parent_menu_en = 'System Settings',
  description_en = 'Configure menu structure and permissions'
WHERE menu_name = '메뉴 관리' AND parent_menu = '시스템 설정';

UPDATE menu_permissions SET 
  menu_name_en = 'Auto Sync Monitor',
  parent_menu_en = 'System Settings',
  description_en = 'Monitor automatic synchronization status'
WHERE menu_name = '자동 동기화 모니터' AND parent_menu = '시스템 설정';

UPDATE menu_permissions SET 
  menu_name_en = 'System Information',
  parent_menu_en = 'System Settings',
  description_en = 'View system information and status'
WHERE menu_name = '시스템 정보' AND parent_menu = '시스템 설정';

UPDATE menu_permissions SET 
  menu_name_en = 'Security Settings',
  parent_menu_en = 'System Settings',
  description_en = 'Configure security and authentication'
WHERE menu_name = '보안 설정' AND parent_menu = '시스템 설정';

UPDATE menu_permissions SET 
  menu_name_en = 'Backup Settings',
  parent_menu_en = 'System Settings',
  description_en = 'Configure backup and restore options'
WHERE menu_name = '백업 설정' AND parent_menu = '시스템 설정';

-- ============================================
-- 11단계: 시스템 하위 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'System Monitor',
  parent_menu_en = 'System',
  description_en = 'Monitor system performance and health'
WHERE menu_name = '시스템 모니터' AND parent_menu = '시스템';

UPDATE menu_permissions SET 
  menu_name_en = 'System Logs',
  parent_menu_en = 'System',
  description_en = 'View system logs and errors'
WHERE menu_name = '시스템 로그' AND parent_menu = '시스템';

UPDATE menu_permissions SET 
  menu_name_en = 'Database Management',
  parent_menu_en = 'System',
  description_en = 'Manage database and tables'
WHERE menu_name = '데이터베이스 관리' AND parent_menu = '시스템';

-- ============================================
-- 12단계: 기타 독립 메뉴
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'Real-time Monitoring',
  description_en = 'Real-time system and user monitoring'
WHERE menu_name = '실시간 모니터링' AND parent_menu IS NULL;

UPDATE menu_permissions SET 
  menu_name_en = 'Statistics',
  description_en = 'View comprehensive statistics'
WHERE menu_name = '통계' AND parent_menu IS NULL;

UPDATE menu_permissions SET 
  menu_name_en = 'Reports',
  description_en = 'Generate and view reports'
WHERE menu_name = '리포트' AND parent_menu IS NULL;

UPDATE menu_permissions SET 
  menu_name_en = 'Audit Logs',
  description_en = 'View audit trail and changes'
WHERE menu_name = '감사 로그' AND parent_menu IS NULL;

-- ============================================
-- 13단계: 경로별 메뉴 추가 업데이트
-- ============================================

UPDATE menu_permissions SET 
  menu_name_en = 'Realtime',
  description_en = 'Real-time monitoring dashboard'
WHERE menu_path = '/admin/realtime';

UPDATE menu_permissions SET 
  menu_name_en = 'Users',
  description_en = 'User account management'
WHERE menu_path = '/admin/users';

UPDATE menu_permissions SET 
  menu_name_en = 'Online',
  description_en = 'Online users monitoring'
WHERE menu_path = '/admin/online';

UPDATE menu_permissions SET 
  menu_name_en = 'Logs',
  description_en = 'System and activity logs'
WHERE menu_path = '/admin/logs';

UPDATE menu_permissions SET 
  menu_name_en = 'Partners',
  description_en = 'Partner management'
WHERE menu_path = '/admin/partners';

UPDATE menu_permissions SET 
  menu_name_en = 'Settlement',
  description_en = 'Settlement management'
WHERE menu_path = '/admin/settlement';

UPDATE menu_permissions SET 
  menu_name_en = 'Transactions',
  description_en = 'Transaction management'
WHERE menu_path = '/admin/transactions';

UPDATE menu_permissions SET 
  menu_name_en = 'Games',
  description_en = 'Game management'
WHERE menu_path = '/admin/games';

UPDATE menu_permissions SET 
  menu_name_en = 'Betting',
  description_en = 'Betting management'
WHERE menu_path = '/admin/betting';

UPDATE menu_permissions SET 
  menu_name_en = 'Support',
  description_en = 'Customer support'
WHERE menu_path = '/admin/support';

UPDATE menu_permissions SET 
  menu_name_en = 'Settings',
  description_en = 'System settings'
WHERE menu_path = '/admin/settings';

-- ============================================
-- 최종: NULL 값 체크 및 기본값 설정
-- ============================================

-- menu_name_en이 여전히 NULL인 경우 menu_name을 그대로 사용
UPDATE menu_permissions 
SET menu_name_en = menu_name
WHERE menu_name_en IS NULL;

-- parent_menu_en이 NULL이지만 parent_menu가 있는 경우
UPDATE menu_permissions mp1
SET parent_menu_en = (
  SELECT mp2.menu_name_en 
  FROM menu_permissions mp2 
  WHERE mp2.menu_name = mp1.parent_menu 
  AND mp2.parent_menu IS NULL
  LIMIT 1
)
WHERE mp1.parent_menu IS NOT NULL 
AND mp1.parent_menu_en IS NULL;

-- description_en이 NULL인 경우 기본 설명 추가
UPDATE menu_permissions 
SET description_en = 'Menu item: ' || menu_name_en
WHERE description_en IS NULL;

-- 3. 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_menu_permissions_name_en ON menu_permissions(menu_name_en);
CREATE INDEX IF NOT EXISTS idx_menu_permissions_parent_en ON menu_permissions(parent_menu_en);

-- 4. 코멘트 추가
COMMENT ON COLUMN menu_permissions.menu_name_en IS 'Menu name in English';
COMMENT ON COLUMN menu_permissions.parent_menu_en IS 'Parent menu name in English';
COMMENT ON COLUMN menu_permissions.description_en IS 'Menu description in English';

-- 완료 메시지
DO $$
DECLARE
  total_count INTEGER;
  translated_count INTEGER;
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM menu_permissions;
  SELECT COUNT(*) INTO translated_count FROM menu_permissions WHERE menu_name_en IS NOT NULL;
  SELECT COUNT(*) INTO null_count FROM menu_permissions WHERE menu_name_en IS NULL;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Menu translation completed successfully';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total menus: %', total_count;
  RAISE NOTICE 'Translated: %', translated_count;
  RAISE NOTICE 'Remaining NULL: %', null_count;
  RAISE NOTICE '========================================';
END $$;
