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
  is_visible: boolean;          // 메뉴 표시 여부
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
  '/admin/new-integrated-settlement': Database,
  '/admin/settlement/history': History,
  '/admin/transactions': CreditCard,
  '/admin/transaction-approval': CreditCard,
  '/admin/games': Gamepad2,
  '/admin/game-lists': Gamepad2,
  '/admin/game-list-management': Gamepad2,
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
  const { t, language } = useLanguage();
  
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    const saved = localStorage.getItem('admin-sidebar-expanded');
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenus, setLoadingMenus] = useState(true);

  // ✅ 현재 경로의 메뉴가 속한 그룹을 자동으로 펼치기 (중복 방지)
  useEffect(() => {
    if (currentRoute && menuItems.length > 0) {
      const routeWithoutHash = currentRoute.split('#')[0];

      // 현재 경로와 일치하는 메뉴의 부모 그룹 찾기
      const findParentGroup = (items: MenuItem[]): string | null => {
        for (const item of items) {
          if (item.children && item.children.length > 0) {
            const hasMatchingChild = item.children.some(child => child.path === routeWithoutHash);
            if (hasMatchingChild) {
              return item.id;
            }
          }
        }
        return null;
      };

      const parentGroupId = findParentGroup(menuItems);
      if (parentGroupId && !expandedItems.includes(parentGroupId)) {
        console.log('🔄 자동 메뉴 펼침:', parentGroupId);
        setExpandedItems(prev => [...prev, parentGroupId]);
      }
    }
  }, [currentRoute, menuItems.length]); // menuItems.length 변경만 감지

  // ✅ 초기 메뉴 로드 (한 번만 실행)
  useEffect(() => {
    loadMenusFromDB();
  }, [user.id]);

  // ✅ 언어 변경 시 메뉴 다시 렌더링 (메뉴 아이템 자체는 리로드하지 않음)
  useEffect(() => {
    if (menuItems.length > 0) {
      setMenuItems([...menuItems]); // 리렌더링 트리거
    }
  }, [language]);

  // ✅ Realtime 구독: partners 테이블의 menu_permissions 변경만 감지
  // (불필요한 구독 제거 - menu_master_changes는 모든 메뉴 업데이트 감지하므로 깜박임 유발)
  useEffect(() => {
    const partnersChannel = supabase
      .channel(`partners_menu_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'partners',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          // 메뉴 권한 변경 감지 시 다시 로드
          loadMenusFromDB();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(partnersChannel);
    };
  }, [user.id]);

  const loadMenusFromDB = async () => {
    if (!user?.id) return;
    
    try {
      
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('menu_permissions')
        .eq('id', user.id)
        .single();
      
      if (partnerError) {
        console.error('❌ 파트너 메뉴 권한 조회 실패:', partnerError);
      }
      
      const allowedMenuPaths = partnerData?.menu_permissions || [];
      
      // ✅ DB에서 메뉴 데이터 조회 (is_visible = true인 메뉴만)
      const { data: dbMenus, error: menuError } = await supabase
        .from('menu_permissions')
        .select('*')
        .eq('is_visible', true)
        .order('display_order', { ascending: true });
      
      if (menuError) {
        console.error('❌ 메뉴 조회 실패:', menuError);
        throw menuError;
      }
      
      if (!dbMenus || dbMenus.length === 0) {
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
      
      
      // ✅ 필터링: 허용된 메뉴만 표시
      const filteredMenus = allowedMenuPaths && allowedMenuPaths.length > 0
        ? dbMenus.filter(menu => allowedMenuPaths.includes(menu.menu_path))
        : dbMenus;
      
      const converted = convertDbMenusToMenuItems(filteredMenus);
      const hasDashboard = converted.some(m => m.path === '/admin/dashboard');
      const dashboardMenu: MenuItem = {
        id: 'dashboard',
        title: t.menu.dashboard,
        icon: LayoutDashboard,
        path: '/admin/dashboard',
        minLevel: 6
      };
      
      // ✅ 새로운 메뉴가 기존 메뉴와 다를 때만 업데이트
      const newMenuItems = hasDashboard ? converted : [dashboardMenu, ...converted];
      const hasChanged = JSON.stringify(menuItems) !== JSON.stringify(newMenuItems);
      
      if (hasChanged) {
        setMenuItems(newMenuItems);
      }
      
      setLoadingMenus(false);
    } catch (error) {
      console.error('❌ 메뉴 로드 실패:', error);
      setMenuItems([{
        id: 'dashboard',
        title: t.menu.dashboard,
        icon: LayoutDashboard,
        path: '/admin/dashboard',
        minLevel: 6
      }]);
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
    setExpandedItems(prev => {
      const newValue = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      localStorage.setItem('admin-sidebar-expanded', JSON.stringify(newValue));
      return newValue;
    });
  };

  const renderMenuItem = (item: MenuItem, depth: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.id);
    // ✅ URL 해시 제거 후 경로 매칭 (예: /admin/transactions#deposit-request -> /admin/transactions)
    const routeWithoutHash = currentRoute?.split('#')[0];
    const isActive = routeWithoutHash === item.path;
    const Icon = item.icon;

    return (
      <div>
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
          style={{ fontSize: '1.152rem' }} // text-xl (1.25rem)의 96% = 1.2rem
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
            "group relative",
            depth === 0 ? "w-full" : "w-[calc(100%-12px)]", // 서브메뉴는 오른쪽 여백 추가
            isActive
              ? "bg-slate-800/80 text-white border border-blue-500/30 shadow-sm"
              : "text-slate-300 hover:bg-slate-800/50 hover:text-white hover:scale-[1.01]",
            depth > 0 && "ml-6"
          )}
        >
          <Icon className={cn(
            "w-7 h-7 flex-shrink-0",
            isActive ? "text-white" : "text-slate-400 group-hover:text-blue-400"
          )} />
          <span className={cn(
            "flex-1 text-left font-medium",
            isActive && "font-semibold"
          )}
          style={{ fontFamily: 'AsiHead, Arial, sans-serif' }}>
            {item.title}
          </span>
          {hasChildren && (
            isExpanded ? (
              <ChevronDown className="w-7 h-7 text-slate-400 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-7 h-7 text-slate-400 flex-shrink-0" />
            )
          )}
        </button>

        {hasChildren && isExpanded && (
          <div className="ml-2 mt-1 space-y-1">
            {item.children!.map((child, idx) => (
              <div key={`${child.id}-${idx}`}>
                {renderMenuItem(child, depth + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}
      style={{
        background: '#0b0b0b'
      }}>
      <div className="py-2 px-3 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center justify-center">
          <img 
            src="https://iqkgwsdgxmxxvpydrlrm.supabase.co/storage/v1/object/public/casino/images/gms_logo_v1.png" 
            alt="GMS Logo"
            className="w-[70%] object-contain"
            style={{ height: '68px' }}  // 🆕 높이 조절 (조절 가능: 60px, 80px, 100px 등)
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1">
        {loadingMenus ? (
          <div className="text-center py-8">
            <div className="loading-premium mx-auto"></div>
            <p className="text-xs text-slate-400 mt-2" style={{ fontFamily: 'AsiHead, Arial, sans-serif' }}>{language === 'en' ? 'Loading menu...' : '메뉴 로딩 중...'}</p>
          </div>
        ) : (
          <>
            {menuItems.map((item, idx) => (
              <div key={`${item.id}-${idx}`}>
                {renderMenuItem(item)}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="p-3 border-t border-slate-700/50 flex-shrink-0">
        <div 
          className="w-full text-xs text-slate-500 text-center truncate cursor-pointer hover:text-slate-400 transition-colors" 
          style={{ fontFamily: 'AsiHead, Arial, sans-serif' }}
          onClick={() => window.location.href = '#/benz'}
          title="임시: 벤츠 페이지로 이동"
        >
          GMS v1.0
        </div>
      </div>
    </div>
  );
}
