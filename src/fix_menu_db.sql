-- ============================================
-- 즉시 실행: 메뉴 시스템 완전 수정
-- ============================================

-- Step 1: 기존 RPC 함수 완전 삭제
DROP FUNCTION IF EXISTS get_partner_enabled_menus(uuid);

-- Step 2: menu_functions 테이블에서 데이터 조회하는 새 함수 생성
CREATE OR REPLACE FUNCTION get_partner_enabled_menus(p_partner_id uuid)
RETURNS TABLE (
  menu_id text,
  menu_name text,
  menu_name_en text,
  menu_path text,
  parent_menu text,
  parent_menu_en text,
  display_order integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mf.menu_id,
    mf.menu_name,
    COALESCE(mf.menu_name_en, mf.menu_name) as menu_name_en,
    mf.menu_path,
    mf.parent_menu,
    COALESCE(mf.parent_menu_en, mf.parent_menu) as parent_menu_en,
    mf.display_order
  FROM menu_functions mf
  INNER JOIN partner_menu_permissions pmp ON mf.menu_id = pmp.menu_id
  WHERE pmp.partner_id = p_partner_id
    AND pmp.is_enabled = true
  ORDER BY mf.display_order ASC;
END;
$$;

-- Step 3: 권한 부여
GRANT EXECUTE ON FUNCTION get_partner_enabled_menus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_partner_enabled_menus(uuid) TO anon;

-- Step 4: 테이블 존재 확인 및 생성 (필요시)
-- menu_functions 테이블이 없으면 생성
CREATE TABLE IF NOT EXISTS menu_functions (
  menu_id text PRIMARY KEY,
  menu_name text NOT NULL,
  menu_name_en text,
  menu_path text NOT NULL,
  parent_menu text,
  parent_menu_en text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- partner_menu_permissions 테이블이 없으면 생성
CREATE TABLE IF NOT EXISTS partner_menu_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  menu_id text NOT NULL REFERENCES menu_functions(menu_id) ON DELETE CASCADE,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(partner_id, menu_id)
);

-- Step 5: 기본 메뉴 데이터 삽입 (중복 방지)
INSERT INTO menu_functions (menu_id, menu_name, menu_name_en, menu_path, parent_menu, parent_menu_en, display_order)
VALUES
  ('dashboard', '대시보드', 'Dashboard', '/admin/dashboard', NULL, NULL, 1),
  ('users', '회원 관리', 'User Management', '/admin/users', NULL, NULL, 2),
  ('blacklist', '블랙회원 관리', 'Blacklist Management', '/admin/blacklist', '회원 관리', 'User Management', 3),
  ('points', '포인트 관리', 'Point Management', '/admin/points', '회원 관리', 'User Management', 4),
  ('online', '온라인 현황', 'Online Users', '/admin/online-users', '회원 관리', 'User Management', 5),
  ('partners', '파트너 관리', 'Partner Management', '/admin/partners', NULL, NULL, 6),
  ('partner-transactions', '파트너 입출금', 'Partner Transactions', '/admin/partners/transactions', '파트너 관리', 'Partner Management', 7),
  ('settlement', '수수료 정산', 'Commission Settlement', '/admin/settlement/commission', '정산 및 거래', 'Settlement & Transactions', 8),
  ('integrated-settlement', '통합 정산', 'Integrated Settlement', '/admin/settlement/integrated', '정산 및 거래', 'Settlement & Transactions', 9),
  ('transactions', '입출금 관리', 'Transaction Management', '/admin/transactions', '정산 및 거래', 'Settlement & Transactions', 10),
  ('games', '게임 리스트', 'Game Lists', '/admin/games', '게임 관리', 'Game Management', 11),
  ('betting', '베팅 내역', 'Betting History', '/admin/betting-history', '게임 관리', 'Game Management', 12),
  ('support', '고객 센터', 'Customer Support', '/admin/support', '커뮤니케이션', 'Communication', 13),
  ('announcements', '공지사항', 'Announcements', '/admin/announcements', '커뮤니케이션', 'Communication', 14),
  ('messages', '메시지 센터', 'Message Center', '/admin/messages', '커뮤니케이션', 'Communication', 15),
  ('settings', '설정', 'Settings', '/admin/settings', '시스템 설정', 'System Settings', 16),
  ('banners', '배너 관리', 'Banner Management', '/admin/banners', '시스템 설정', 'System Settings', 17),
  ('menu-management', '메뉴 관리', 'Menu Management', '/admin/menu-management', '시스템 설정', 'System Settings', 18)
ON CONFLICT (menu_id) DO UPDATE SET
  menu_name_en = EXCLUDED.menu_name_en,
  parent_menu_en = EXCLUDED.parent_menu_en;

-- Step 6: 모든 파트너에게 기본 메뉴 권한 부여
INSERT INTO partner_menu_permissions (partner_id, menu_id, is_enabled)
SELECT 
  p.id,
  mf.menu_id,
  true
FROM partners p
CROSS JOIN menu_functions mf
ON CONFLICT (partner_id, menu_id) DO NOTHING;

-- ============================================
-- 완료 메시지
-- ============================================
SELECT 'Menu system fixed successfully!' as status;
