import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { 
  Settings, 
  RefreshCw, 
  CheckCircle, 
  Menu as MenuIcon,
  Search,
  Save,
  ChevronRight,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  Users
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { getPartnerLevelText } from "../../lib/utils";

interface MenuPermission {
  id: string;
  menu_name: string;
  menu_path: string;
  partner_level: number;
  is_visible: boolean;
  display_order: number;
  parent_menu?: string;
  description?: string;
}

interface MenuManagementProps {
  user: Partner;
}

interface GroupedMenus {
  [key: string]: {
    menu: MenuPermission;
    isEnabled: boolean;
  }[];
}

export function MenuManagement({ user }: MenuManagementProps) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [allMenus, setAllMenus] = useState<MenuPermission[]>([]);
  const [enabledMenuPaths, setEnabledMenuPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [showHiddenMenus, setShowHiddenMenus] = useState(false);

  // 파트너 목록 로드 (조직 계층 구조 적용)
  const loadPartners = useCallback(async () => {
    try {
      setLoading(true);

      let partnersData: Partner[] = [];

      if (user.level === 1) {
        // Lv1: 모든 파트너 조회 (제한 없음)
        const { data, error } = await supabase
          .from('partners')
          .select('*')
          .eq('status', 'active')
          .gt('level', 1)  // 시스템 관리자 제외
          .order('level', { ascending: true })
          .order('nickname', { ascending: true });

        if (error) throw error;
        partnersData = data || [];
      } else {
        // Lv2+: BFS 방식으로 조직 내 하위 파트너만 조회
        
        // 1. BFS로 모든 하위 파트너 ID 수집
        const myDescendantIds: string[] = [];
        const queue = [user.id];
        
        while (queue.length > 0) {
          const currentBatch = queue.splice(0, queue.length);
          
          const { data: children } = await supabase
            .from('partners')
            .select('id, level')
            .in('parent_id', currentBatch)
            .eq('status', 'active');
          
          if (children && children.length > 0) {
            const childIds = children.map(c => c.id);
            myDescendantIds.push(...childIds);
            queue.push(...childIds);
          }
        }

        // 2. 하위 파트너들 조회 (자신보다 레벨이 높은 것만)
        if (myDescendantIds.length > 0) {
          const { data, error } = await supabase
            .from('partners')
            .select('*')
            .in('id', myDescendantIds)
            .eq('status', 'active')
            .gt('level', user.level)  // 자기보다 레벨이 높은 것만
            .order('level', { ascending: true })
            .order('nickname', { ascending: true });

          if (error) throw error;
          partnersData = data || [];
        }
      }

      setPartners(partnersData);
    } catch (error: any) {
      console.error('파트너 목록 로드 실패:', error);
      toast.error('파트너 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 현재 로그인한 계정의 메뉴 권한 로드 (하위 파트너 설정 시 기준이 됨)
  const loadUserMenuPermissions = useCallback(async () => {
    try {
      // Lv1: 모든 메뉴 표시 (menu_permissions가 null이어도 전체 메뉴 표시)
      if (user.level === 1) {
        let query = supabase
          .from('menu_permissions')
          .select('*')
          .eq('is_visible', true)
          .order('display_order', { ascending: true })
          .order('menu_name', { ascending: true });

        const { data: menus, error: menuError } = await query;
        if (menuError) throw menuError;
        setAllMenus(menus || []);
        return;
      }

      // Lv2+: 현재 사용자의 menu_permissions 기준으로 메뉴 표시
      const { data, error } = await supabase
        .from('partners')
        .select('menu_permissions')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      // 현재 사용자의 메뉴 권한 ID 배열
      const userMenuPermissions = (data?.menu_permissions || []) as string[];
      
      // menu_permissions 테이블에서 현재 사용자에게 허용된 메뉴만 조회
      if (userMenuPermissions.length > 0) {
        const { data: menus, error: menuError } = await supabase
          .from('menu_permissions')
          .select('*')
          .in('menu_path', userMenuPermissions)
          .eq('is_visible', true)
          .order('display_order', { ascending: true })
          .order('menu_name', { ascending: true });

        if (menuError) throw menuError;
        setAllMenus(menus || []);
      } else {
        // 메뉴 권한이 없으면 빈 배열
        setAllMenus([]);
      }
    } catch (error: any) {
      console.error('사용자 메뉴 권한 로드 실패:', error);
      toast.error('메뉴 목록을 불러오는데 실패했습니다.');
    }
  }, [user.id, user.level]);

  // 선택된 파트너의 메뉴 권한 로드
  const loadPartnerMenus = useCallback(async (partnerId: string) => {
    if (!partnerId) {
      setEnabledMenuPaths([]);
      setSelectedPartner(null);
      return;
    }

    try {
      setLoading(true);
      
      const partner = partners.find(p => p.id === partnerId);
      setSelectedPartner(partner || null);

      // partners 테이블에서 menu_permissions JSONB 컬럼 조회
      const { data, error } = await supabase
        .from('partners')
        .select('menu_permissions')
        .eq('id', partnerId)
        .single();

      if (error) throw error;

      // JSONB에서 메뉴 ID 배열 추출
      const menuPermissions = data?.menu_permissions || [];
      setEnabledMenuPaths(Array.isArray(menuPermissions) ? menuPermissions : []);
      setHasChanges(false);
    } catch (error: any) {
      console.error('파트너 메뉴 권한 로드 실패:', error);
      toast.error('파트너 메뉴 권한을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [partners]);

  // 메뉴 권한 토글
  const toggleMenuPermission = (menuPath: string, enabled: boolean) => {
    setEnabledMenuPaths(prev => {
      if (enabled) {
        return [...prev, menuPath];
      } else {
        return prev.filter(path => path !== menuPath);
      }
    });
    setHasChanges(true);
  };

  // 메뉴 노출/비노출 토글 (Lv1만 가능)
  const toggleMenuVisibility = async (menuId: string, visible: boolean) => {
    if (user.level !== 1) {
      toast.error('시스템 관리자만 메뉴 노출 설정을 변경할 수 있습니다.');
      return;
    }

    try {
      const { error } = await supabase
        .from('menu_permissions')
        .update({ is_visible: visible })
        .eq('id', menuId);

      if (error) throw error;

      toast.success(`메뉴가 ${visible ? '노출' : '비노출'} 상태로 변경되었습니다.`);
      loadUserMenuPermissions();
      
      // 현재 선택된 파트너 메뉴도 다시 로드
      if (selectedPartnerId) {
        loadPartnerMenus(selectedPartnerId);
      }
    } catch (error: any) {
      console.error('메뉴 노출 설정 변경 실패:', error);
      toast.error('메뉴 노출 설정 변경에 실패했습니다.');
    }
  };

  // 전체 선택/해제
  const toggleAllMenus = (enabled: boolean) => {
    if (enabled) {
      setEnabledMenuPaths(allMenus.map(m => m.menu_path));
    } else {
      setEnabledMenuPaths([]);
    }
    setHasChanges(true);
  };

  // 그룹별 선택/해제
  const toggleGroupMenus = (groupName: string, enabled: boolean) => {
    const groupMenus = allMenus.filter(m => (m.parent_menu || '기본 메뉴') === groupName);
    const groupMenuPaths = groupMenus.map(m => m.menu_path);

    if (enabled) {
      setEnabledMenuPaths(prev => {
        const newPaths = [...prev];
        groupMenuPaths.forEach(path => {
          if (!newPaths.includes(path)) {
            newPaths.push(path);
          }
        });
        return newPaths;
      });
    } else {
      setEnabledMenuPaths(prev => prev.filter(path => !groupMenuPaths.includes(path)));
    }
    setHasChanges(true);
  };

  // 저장
  const saveChanges = async () => {
    if (!selectedPartnerId) {
      toast.error('파트너를 선택해주세요.');
      return;
    }

    try {
      setSaving(true);

      // partners 테이블의 menu_permissions JSONB 컬럼 업데이트
      const { error } = await supabase
        .from('partners')
        .update({ 
          menu_permissions: enabledMenuPaths,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedPartnerId);

      if (error) throw error;

      toast.success('메뉴 권한이 저장되었습니다.');
      setHasChanges(false);
    } catch (error: any) {
      console.error('메뉴 권한 저장 실패:', error);
      toast.error('메뉴 권한 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 메뉴 그룹화
  const groupedMenus: GroupedMenus = allMenus.reduce((acc, menu) => {
    const groupName = menu.parent_menu || '기본 메뉴';
    if (!acc[groupName]) {
      acc[groupName] = [];
    }

    acc[groupName].push({
      menu,
      isEnabled: enabledMenuPaths.includes(menu.menu_path)
    });

    return acc;
  }, {} as GroupedMenus);

  // 필터링된 파트너
  const filteredPartners = partners.filter(p => 
    p.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.nickname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 통계
  const stats = {
    totalMenus: allMenus.length,
    enabledMenus: enabledMenuPaths.length,
  };

  useEffect(() => {
    loadPartners();
    loadUserMenuPermissions();
  }, [loadPartners, loadUserMenuPermissions]);

  useEffect(() => {
    if (selectedPartnerId && allMenus.length > 0) {
      loadPartnerMenus(selectedPartnerId);
    }
  }, [selectedPartnerId, allMenus, loadPartnerMenus]);

  return (
    <div className="space-y-6 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl flex items-center gap-2">
            <Settings className="w-6 h-6" />
            메뉴 관리
          </h1>
          <p className="text-gray-400 mt-1">하위 파트너의 메뉴 노출 권한을 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          {user.level === 1 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-700 rounded-lg">
              <Switch
                checked={showHiddenMenus}
                onCheckedChange={setShowHiddenMenus}
              />
              <span className="text-sm">비노출 메뉴 표시</span>
            </div>
          )}
          <Button onClick={() => { loadPartners(); loadUserMenuPermissions(); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 왼쪽: 파트너 목록 */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="w-5 h-5" />
                파트너 선택
              </CardTitle>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="파트너 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-700 border-slate-600"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="text-center py-8 text-gray-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  로딩 중...
                </div>
              ) : filteredPartners.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  파트너가 없습니다
                </div>
              ) : (
                filteredPartners.map(partner => (
                  <button
                    key={partner.id}
                    onClick={() => setSelectedPartnerId(partner.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      selectedPartnerId === partner.id
                        ? 'bg-purple-600/20 border-purple-500'
                        : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{partner.username}</span>
                          <Badge variant="outline" className="text-xs">
                            {getPartnerLevelText(partner.level)}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-400 mt-1">{partner.nickname}</div>
                      </div>
                      {selectedPartnerId === partner.id && (
                        <ChevronRight className="w-5 h-5 text-purple-400" />
                      )}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽: 메뉴 권한 관리 */}
        <div className="col-span-12 lg:col-span-8">
          {!selectedPartner ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <MenuIcon className="w-16 h-16 text-gray-600 mb-4" />
                <p className="text-gray-400 text-lg">왼쪽에서 파트너를 선택해주세요</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* 통계 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-blue-600 to-blue-700 border-0">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <MenuIcon className="w-10 h-10 text-blue-100" />
                      <div>
                        <div className="text-sm text-blue-100">전체 메뉴</div>
                        <div className="text-3xl text-white">{stats.totalMenus}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-600 to-green-700 border-0">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <Eye className="w-10 h-10 text-green-100" />
                      <div>
                        <div className="text-sm text-green-100">활성화된 메뉴</div>
                        <div className="text-3xl text-white">{stats.enabledMenus}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-gray-600 to-gray-700 border-0">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <EyeOff className="w-10 h-10 text-gray-100" />
                      <div>
                        <div className="text-sm text-gray-100">비활성화된 메뉴</div>
                        <div className="text-3xl text-white">{stats.totalMenus - stats.enabledMenus}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 메뉴 권한 */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MenuIcon className="w-5 h-5" />
                        {selectedPartner.nickname} - 메뉴 권한 설정
                      </CardTitle>
                      <p className="text-sm text-gray-400 mt-1">
                        체크된 메뉴만 해당 파트너에게 표시됩니다
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAllMenus(true)}
                        disabled={loading}
                      >
                        <CheckSquare className="w-4 h-4 mr-2" />
                        전체 선택
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAllMenus(false)}
                        disabled={loading}
                      >
                        <Square className="w-4 h-4 mr-2" />
                        전체 해제
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {loading ? (
                    <div className="text-center py-8 text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      메뉴 로딩 중...
                    </div>
                  ) : Object.keys(groupedMenus).length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      메뉴 데이터가 없습니다
                    </div>
                  ) : (
                    Object.entries(groupedMenus).map(([groupName, menus]) => {
                      const allEnabled = menus.every(m => m.isEnabled);
                      const someEnabled = menus.some(m => m.isEnabled) && !allEnabled;

                      return (
                        <div key={groupName} className="space-y-3">
                          {/* 그룹 헤더 */}
                          <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-purple-400">{groupName}</h3>
                              <Badge variant="outline" className="text-xs">
                                {menus.filter(m => m.isEnabled).length} / {menus.length}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleGroupMenus(groupName, !allEnabled)}
                              className="text-xs"
                            >
                              {allEnabled ? (
                                <>
                                  <Square className="w-3 h-3 mr-1" />
                                  그룹 해제
                                </>
                              ) : (
                                <>
                                  <CheckSquare className="w-3 h-3 mr-1" />
                                  그룹 선택
                                </>
                              )}
                            </Button>
                          </div>

                          {/* 메뉴 목록 */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {menus.map(({ menu, isEnabled }) => (
                              <div
                                key={menu.id}
                                className={`p-4 rounded-lg border transition-all ${
                                  isEnabled
                                    ? 'bg-green-500/10 border-green-500/50'
                                    : 'bg-slate-700/30 border-slate-600'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm">
                                        {menu.menu_name}
                                      </span>
                                      {!menu.is_visible && (
                                        <Badge variant="outline" className="text-xs bg-red-500/20 border-red-500">
                                          비노출
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                      {menu.menu_path}
                                    </div>
                                    {menu.description && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {menu.description}
                                      </div>
                                    )}
                                    {user.level === 1 && (
                                      <div className="flex items-center gap-2 mt-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-xs"
                                          onClick={() => toggleMenuVisibility(menu.id, !menu.is_visible)}
                                        >
                                          {menu.is_visible ? (
                                            <>
                                              <EyeOff className="w-3 h-3 mr-1" />
                                              숨기기
                                            </>
                                          ) : (
                                            <>
                                              <Eye className="w-3 h-3 mr-1" />
                                              표시
                                            </>
                                          )}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <Switch
                                    checked={isEnabled}
                                    onCheckedChange={(checked) => 
                                      toggleMenuPermission(menu.menu_path, checked)
                                    }
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {/* 저장 버튼 */}
              {hasChanges && (
                <div className="flex items-center justify-end gap-4 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <CheckCircle className="w-5 h-5" />
                    <span>변경사항이 있습니다</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => loadPartnerMenus(selectedPartnerId)}
                      disabled={saving}
                    >
                      취소
                    </Button>
                    <Button
                      onClick={saveChanges}
                      disabled={saving}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {saving ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          저장
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MenuManagement;
