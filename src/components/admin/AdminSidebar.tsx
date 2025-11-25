import { useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../contexts/LanguageContext";
import { Partner } from "../../types";
import {
  LayoutDashboard,
  Users,
  Shield,
  TrendingUp,
  Activity,
  Building2,
  CreditCard,
  Calculator,
  Database,
  Gamepad2,
  RefreshCw,
  HelpCircle,
  Bell,
  MessageSquare,
  Settings,
  Image,
  Menu,
  ChevronDown,
  ChevronRight,
  History,
} from "lucide-react";

interface MenuItem {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  path?: string;
  minLevel?: number;
  children?: MenuItem[];
  parent_menu?: string;
}

interface DbMenuItem {
  menu_id: string;
  menu_name: string;           // 한국어 메뉴명
  menu_name_en?: string;        // 영문 메뉴명
  menu_path: string;
  parent_menu: string | null;   // 한국어 그룹명
  parent_menu_en?: string;      // 영문 그룹명
  display_order: number;
}

const iconMap: Record<string, React.ComponentType<any>> = {
  '/admin/dashboard': LayoutDashboard,
  '/admin/realtime': Activity,
  '/admin/users': Users,
  '/admin/user-management': Users,
  '/admin/blacklist': Shield,
  '/admin/points': TrendingUp,
  '/admin/online': Activity,
  '/admin/online-users': Activity,
  '/admin/online-status': Activity,
  '/admin/logs': Database,
  '/admin/head-office': Building2,
  '/admin/partners/master': Building2,
  '/admin/partners': Building2,
  '/admin/partner-creation': Building2,
  '/admin/partner-hierarchy': Building2,
  '/admin/partner-transactions': CreditCard,
  '/admin/partners/transactions': CreditCard,
  '/admin/partner-connection-status': Activity,
  '/admin/partner-online': Activity,
  '/admin/partner-status': Activity,
  '/admin/partner-dashboard': LayoutDashboard,
  '/admin/partners/dashboard': LayoutDashboard,
  '/admin/settlement': Calculator,
  '/admin/commission-settlement': Calculator,
  '/admin/settlement/commission': Calculator,
  '/admin/integrated-settlement': Database,
  '/admin/settlement/integrated': Database,
  '/admin/settlement-history': History,
  '/admin/settlement/history': History,
  '/admin/transactions': CreditCard,
  '/admin/transaction-approval': CreditCard,
  '/admin/games': Gamepad2,
  '/admin/game-lists': Gamepad2,
  '/admin/betting': TrendingUp,
  '/admin/betting-history': TrendingUp,
  '/admin/betting-management': TrendingUp,
  '/admin/call-cycle': RefreshCw,
  '/admin/communication': MessageSquare,
  '/admin/customer-service': HelpCircle,
  '/admin/support': HelpCircle,
  '/admin/announcements': Bell,
  '/admin/messages': MessageSquare,
  '/admin/settings': Settings,
  '/admin/system-settings': Settings,
  '/admin/system': Activity,
  '/admin/system-info': Activity,
  '/admin/api-tester': Settings,
  '/admin/banners': Image,
  '/admin/menu-management': Menu,
  '/admin/auto-sync-monitor': RefreshCw,
};

const getGroupIcon = (groupName: string): React.ComponentType<any> => {
  const lowerName = groupName.toLowerCase();
  // Support both Korean and English
  if (lowerName.includes('회원') || lowerName.includes('user')) return Users;
  if (lowerName.includes('파트너') || lowerName.includes('partner')) return Building2;
  if (lowerName.includes('정산') || lowerName.includes('거래') || lowerName.includes('settlement') || lowerName.includes('transaction')) return Calculator;
  if (lowerName.includes('게임') || lowerName.includes('game')) return Gamepad2;
  if (lowerName.includes('커뮤') || lowerName.includes('메시지') || lowerName.includes('message') || lowerName.includes('communication')) return MessageSquare;
  if (lowerName.includes('시스템') || lowerName.includes('설정') || lowerName.includes('system') || lowerName.includes('setting')) return Settings;
  return Settings;
};

// DB에서 언어별 값을 직접 사용 (번역 매핑 로직 완전 제거)

interface AdminSidebarProps {
  user: Partner;
  className?: string;
  onNavigate?: (route: string) => void;
  currentRoute?: string;
}

export function AdminSidebar({ user, className, onNavigate, currentRoute }: AdminSidebarProps) {
  const { language, t } = useLanguage();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenus, setLoadingMenus] = useState(true);

  useEffect(() => {
    loadMenusFromDB();
    
    // ✅ Realtime 구독: 메뉴 권한 변경 감지
    const channel = supabase
      .channel('menu_permissions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'partner_menu_permissions',
          filter: `partner_id=eq.${user.id}`
        },
        (payload) => {
          console.log('🔄 메뉴 권한 변경 감지:', payload);
          // 메뉴 다시 로드
          loadMenusFromDB();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id, language]);

  const loadMenusFromDB = async () => {
    if (!user?.id) return;
    
    setLoadingMenus(true);
    try {
      // ✅ 1단계: partner_menu_permissions에서 활성화된 메뉴만 조회
      const { data: partnerMenus, error: menuError } = await supabase
        .from('partner_menu_permissions')
        .select(`
          menu_permission_id,
          is_enabled,
          menu_permission:menu_permissions(
            id,
            menu_name,
            menu_name_en,
            menu_path,
            parent_menu,
            parent_menu_en,
            display_order,
            partner_level
          )
        `)
        .eq('partner_id', user.id)
        .eq('is_enabled', true);

      if (menuError) {
        console.error('메뉴 권한 조회 오류:', menuError);
        // 오류 발생 시 기본 대시보드만 표시
        setMenuItems([{
          id: 'dashboard',
          title: t.menu.dashboard,
          icon: LayoutDashboard,
          path: '/admin/dashboard',
          minLevel: 6
        }]);
        setLoadingMenus(false);
        return;
      }

      // ✅ 2단계: DB 조회 결과가 없으면 하드코딩된 메뉴 사용
      if (!partnerMenus || partnerMenus.length === 0) {
        console.log('⚠️ DB에 메뉴 권한이 없습니다. 하드코딩 메뉴 사용');
        
        // 전체 메뉴 구조 (menufunction.md 기준)
        const hardcodedMenus: DbMenuItem[] = [
          // 1. 대시보드 (root)
          { menu_id: 'dashboard', menu_name: '대시보드', menu_name_en: 'Dashboard', menu_path: '/admin/dashboard', parent_menu: null, parent_menu_en: null, display_order: 1 },
          
          // 2. 회원 관리 그룹
          { menu_id: 'users', menu_name: '회원 관리', menu_name_en: 'User Management', menu_path: '/admin/users', parent_menu: '회원 관리', parent_menu_en: 'User Management', display_order: 2 },
          { menu_id: 'blacklist', menu_name: '블랙회원 관리', menu_name_en: 'Blacklist Management', menu_path: '/admin/blacklist', parent_menu: '회원 관리', parent_menu_en: 'User Management', display_order: 3 },
          { menu_id: 'points', menu_name: '포인트 관리', menu_name_en: 'Point Management', menu_path: '/admin/points', parent_menu: '회원 관리', parent_menu_en: 'User Management', display_order: 4 },
          { menu_id: 'online', menu_name: '온라인 현황', menu_name_en: 'Online Users', menu_path: '/admin/online-users', parent_menu: '회원 관리', parent_menu_en: 'User Management', display_order: 5 },
          { menu_id: 'logs', menu_name: '로그 관리', menu_name_en: 'Log Management', menu_path: '/admin/logs', parent_menu: '회원 관리', parent_menu_en: 'User Management', display_order: 6 },
          
          // 3. 파트너 관리 그룹
          { menu_id: 'partner-creation', menu_name: '파트너생성관리', menu_name_en: 'Partner Creation', menu_path: '/admin/partner-creation', parent_menu: '파트너 관리', parent_menu_en: 'Partner Management', display_order: 7 },
          { menu_id: 'partner-hierarchy', menu_name: '파트너 계층 관리', menu_name_en: 'Partner Hierarchy', menu_path: '/admin/partner-hierarchy', parent_menu: '파트너 관리', parent_menu_en: 'Partner Management', display_order: 8 },
          { menu_id: 'partner-transactions', menu_name: '파트너 입출금 관리', menu_name_en: 'Partner Transaction Management', menu_path: '/admin/partners/transactions', parent_menu: '파트너 관리', parent_menu_en: 'Partner Management', display_order: 9 },
          { menu_id: 'partner-status', menu_name: '파트너별 접속 현황', menu_name_en: 'Partner Connection Status', menu_path: '/admin/partner-connection-status', parent_menu: '파트너 관리', parent_menu_en: 'Partner Management', display_order: 10 },
          
          // 4. 정산 및 거래 그룹
          { menu_id: 'settlement', menu_name: '수수료 정산', menu_name_en: 'Commission Settlement', menu_path: '/admin/settlement/commission', parent_menu: '정산 및 거래', parent_menu_en: 'Settlement & Transactions', display_order: 11 },
          { menu_id: 'integrated-settlement', menu_name: '통합 정산', menu_name_en: 'Integrated Settlement', menu_path: '/admin/settlement/integrated', parent_menu: '정산 및 거래', parent_menu_en: 'Settlement & Transactions', display_order: 12 },
          { menu_id: 'settlement-history', menu_name: '정산 내역', menu_name_en: 'Settlement History', menu_path: '/admin/settlement/history', parent_menu: '정산 및 거래', parent_menu_en: 'Settlement & Transactions', display_order: 13 },
          { menu_id: 'transactions', menu_name: '입출금 관리', menu_name_en: 'Transaction Management', menu_path: '/admin/transactions', parent_menu: '정산 및 거래', parent_menu_en: 'Settlement & Transactions', display_order: 14 },
          
          // 5. 게임 관리 그룹
          { menu_id: 'games', menu_name: '게임 리스트', menu_name_en: 'Game Lists', menu_path: '/admin/games', parent_menu: '게임 관리', parent_menu_en: 'Game Management', display_order: 15 },
          { menu_id: 'betting', menu_name: '베팅 내역', menu_name_en: 'Betting History', menu_path: '/admin/betting-history', parent_menu: '게임 관리', parent_menu_en: 'Game Management', display_order: 16 },
          { menu_id: 'call-cycle', menu_name: '콜 주기', menu_name_en: 'Call Cycle', menu_path: '/admin/call-cycle', parent_menu: '게임 관리', parent_menu_en: 'Game Management', display_order: 17 },
          { menu_id: 'auto-sync', menu_name: '자동 동기화', menu_name_en: 'Auto Sync Monitor', menu_path: '/admin/auto-sync-monitor', parent_menu: '게임 관리', parent_menu_en: 'Game Management', display_order: 18 },
          
          // 6. 커뮤니케이션 그룹
          { menu_id: 'support', menu_name: '고객 센터', menu_name_en: 'Customer Support', menu_path: '/admin/support', parent_menu: '커뮤니케이션', parent_menu_en: 'Communication', display_order: 19 },
          { menu_id: 'announcements', menu_name: '공지사항', menu_name_en: 'Announcements', menu_path: '/admin/announcements', parent_menu: '커뮤니케이션', parent_menu_en: 'Communication', display_order: 20 },
          { menu_id: 'messages', menu_name: '메시지 센터', menu_name_en: 'Message Center', menu_path: '/admin/messages', parent_menu: '커뮤니케이션', parent_menu_en: 'Communication', display_order: 21 },
          { menu_id: 'banners', menu_name: '배너 관리', menu_name_en: 'Banner Management', menu_path: '/admin/banners', parent_menu: '커뮤니케이션', parent_menu_en: 'Communication', display_order: 22 },
          
          // 7. 시스템 설정 그룹
          { menu_id: 'settings', menu_name: '설정', menu_name_en: 'Settings', menu_path: '/admin/settings', parent_menu: '시스템 설정', parent_menu_en: 'System Settings', display_order: 23 },
          { menu_id: 'system-info', menu_name: '시스템 정보', menu_name_en: 'System Info', menu_path: '/admin/system-info', parent_menu: '시스템 설정', parent_menu_en: 'System Settings', display_order: 24 },
          { menu_id: 'api-tester', menu_name: 'API 테스터', menu_name_en: 'API Tester', menu_path: '/admin/api-tester', parent_menu: '시스템 설정', parent_menu_en: 'System Settings', display_order: 25 },
          { menu_id: 'menu-management', menu_name: '메뉴 관리', menu_name_en: 'Menu Management', menu_path: '/admin/menu-management', parent_menu: '시스템 설정', parent_menu_en: 'System Settings', display_order: 26 }
        ];

        const converted = convertDbMenusToMenuItems(hardcodedMenus);
        const hasDashboard = converted.some(m => m.path === '/admin/dashboard');
        const dashboardMenu: MenuItem = {
          id: 'dashboard',
          title: t.menu.dashboard,
          icon: LayoutDashboard,
          path: '/admin/dashboard',
          minLevel: 6
        };
        setMenuItems(hasDashboard ? converted : [dashboardMenu, ...converted]);
        setLoadingMenus(false);
        return;
      }

      // ✅ 3단계: DB에서 조회한 활성화된 메뉴만 변환
      console.log(`✅ ${user.nickname} - 활성화된 메뉴 ${partnerMenus.length}개 로드`);
      
      const dbMenus: DbMenuItem[] = partnerMenus
        .filter(pm => pm.menu_permission) // menu_permission이 있는 것만
        .map(pm => {
          const menu = Array.isArray(pm.menu_permission) ? pm.menu_permission[0] : pm.menu_permission;
          return {
            menu_id: menu.id,
            menu_name: menu.menu_name,
            menu_name_en: menu.menu_name_en || menu.menu_name,
            menu_path: menu.menu_path,
            parent_menu: menu.parent_menu,
            parent_menu_en: menu.parent_menu_en || menu.parent_menu,
            display_order: menu.display_order || 999
          };
        });

      const converted = convertDbMenusToMenuItems(dbMenus);
      
      // 대시보드가 없으면 강제로 추가 (기본 메뉴)
      const hasDashboard = converted.some(m => m.path === '/admin/dashboard');
      if (!hasDashboard) {
        converted.unshift({
          id: 'dashboard',
          title: t.menu.dashboard,
          icon: LayoutDashboard,
          path: '/admin/dashboard',
          minLevel: 6
        });
      }
      
      setMenuItems(converted);
    } catch (error) {
      console.error('메뉴 로드 실패:', error);
      setMenuItems([{
        id: 'dashboard',
        title: t.menu.dashboard,
        icon: LayoutDashboard,
        path: '/admin/dashboard',
        minLevel: 6
      }]);
    } finally {
      setLoadingMenus(false);
    }
  };

  const convertDbMenusToMenuItems = (dbMenus: DbMenuItem[]): MenuItem[] => {
    const groupedByParent = dbMenus.reduce((acc, menu) => {
      // DB에서 언어별 parent_menu 직접 사용 (번역 없음)
      const parentKey = language === 'en' 
        ? (menu.parent_menu_en || menu.parent_menu || 'root')
        : (menu.parent_menu || 'root');
      
      if (!acc[parentKey]) acc[parentKey] = [];
      acc[parentKey].push(menu);
      return acc;
    }, {} as Record<string, DbMenuItem[]>);

    const rootMenus = (groupedByParent['root'] || []).sort((a, b) => a.display_order - b.display_order);
    
    const groupOrderMap: Record<string, number> = {};
    Object.keys(groupedByParent).forEach(groupName => {
      if (groupName !== 'root') {
        const menus = groupedByParent[groupName];
        groupOrderMap[groupName] = Math.min(...menus.map(m => m.display_order));
      }
    });

    const allItems: Array<{ type: 'group' | 'single', order: number, item: MenuItem }> = [];

    rootMenus.forEach(menu => {
      // DB에서 언어별 메뉴명 직접 사용 (번역 없음)
      const menuName = language === 'en' 
        ? (menu.menu_name_en || menu.menu_name)
        : menu.menu_name;
        
      allItems.push({
        type: 'single',
        order: menu.display_order,
        item: {
          id: menu.menu_id,
          title: menuName,
          icon: iconMap[menu.menu_path] || Settings,
          path: menu.menu_path,
          minLevel: 6
        }
      });
    });

    const processedGroups = new Set<string>();
    
    Object.keys(groupedByParent).forEach(groupName => {
      if (groupName !== 'root' && !processedGroups.has(groupName)) {
        processedGroups.add(groupName);
        
        const childrenMenus = groupedByParent[groupName].sort((a, b) => a.display_order - b.display_order);
        const children: MenuItem[] = childrenMenus.map(child => {
          // DB에서 언어별 메뉴명 직접 사용 (번역 없음)
          const childMenuName = language === 'en'
            ? (child.menu_name_en || child.menu_name)
            : child.menu_name;
            
          return {
            id: child.menu_id,
            title: childMenuName,
            icon: iconMap[child.menu_path] || Settings,
            path: child.menu_path,
            minLevel: 6,
            parent_menu: child.parent_menu || undefined
          };
        });

        // 그룹명도 DB에서 직접 사용 (번역 없음)
        const groupTitle = groupName === 'root' 
          ? (language === 'ko' ? '기본 메뉴' : 'Main Menu')
          : groupName;

        allItems.push({
          type: 'group',
          order: groupOrderMap[groupName] || 999,
          item: {
            id: `group-${groupName}`,
            title: groupTitle,
            icon: getGroupIcon(groupName),
            minLevel: 6,
            children: children
          }
        });
      }
    });

    return allItems.sort((a, b) => a.order - b.order).map(item => item.item);
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const renderMenuItem = (item: MenuItem, depth: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.id);
    const isActive = currentRoute === item.path;
    const Icon = item.icon;

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.id);
            } else {
              if (item.path && onNavigate) {
                onNavigate(item.path);
              }
            }
          }}
          className={cn(
            "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200",
            "text-base group relative",
            depth === 0 ? "w-full" : "w-[calc(100%-12px)]", // 서브메뉴는 오른쪽 여백 추가
            isActive
              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]"
              : "text-slate-300 hover:bg-slate-800/50 hover:text-white hover:scale-[1.01]",
            depth > 0 && "ml-6"
          )}
        >
          <Icon className={cn(
            "w-5 h-5 flex-shrink-0",
            isActive ? "text-white" : "text-slate-400 group-hover:text-blue-400"
          )} />
          <span className={cn(
            "flex-1 text-left font-medium",
            isActive && "font-semibold"
          )}>
            {item.title}
          </span>
          {hasChildren && (
            isExpanded ? (
              <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
            )
          )}
        </button>

        {hasChildren && isExpanded && (
          <div className="ml-2 mt-1 space-y-1">
            {item.children!.map(child => renderMenuItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col h-full bg-[#0f1419] overflow-hidden", className)}>
      <div className="p-4 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">G</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold truncate">GMS</h1>
            <p className="text-xs text-slate-400 truncate">{user.nickname}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1">
        {loadingMenus ? (
          <div className="text-center py-8">
            <div className="loading-premium mx-auto"></div>
            <p className="text-xs text-slate-400 mt-2">{language === 'en' ? 'Loading menu...' : '메뉴 로딩 중...'}</p>
          </div>
        ) : (
          menuItems.map(item => renderMenuItem(item))
        )}
      </div>

      <div className="p-3 border-t border-slate-700/50 flex-shrink-0">
        <button
          onClick={() => {
            window.location.hash = '#/user';
          }}
          className="w-full text-xs text-slate-500 hover:text-slate-300 text-center truncate transition-colors cursor-pointer"
        >
          GMS v1.0
        </button>
      </div>
    </div>
  );
}