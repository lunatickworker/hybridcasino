import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "../../ui/card";
import { ScrollArea } from "../../ui/scroll-area";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Store, RefreshCw, Search, ChevronDown, ChevronRight, Ban, Check } from "lucide-react";
import { Partner } from "../../../types";
import { gameApi, GameProvider, Game } from "../../../lib/gameApi";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../../lib/supabase";
import type { ApiType, GameType } from "../game-management/types";
import { API_METADATA, getAvailableGameTypes, DEFAULT_GAME_TYPE, DEBOUNCE_DELAY } from "../game-management/constants";
import { useDebounce } from "../game-management/hooks/useDebounce";

interface StoresTabProps {
  user: Partner;
}

export function StoresTab({ user }: StoresTabProps) {
  const [stores, setStores] = useState<Partner[]>([]);
  const [selectedStore, setSelectedStore] = useState<Partner | null>(null);
  const [loadingStores, setLoadingStores] = useState(false);
  
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [allGames, setAllGames] = useState<Game[]>([]);
  
  const [selectedApi, setSelectedApi] = useState<ApiType | null>(null);
  const [selectedGameType, setSelectedGameType] = useState<GameType>(DEFAULT_GAME_TYPE);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<number>>(new Set());

  const [storeBlockedProviders, setStoreBlockedProviders] = useState<Set<number>>(new Set());
  const [storeBlockedGames, setStoreBlockedGames] = useState<Set<number>>(new Set());
  const [loadingBlockedData, setLoadingBlockedData] = useState(false);
  const [storeProviderVisibility, setStoreProviderVisibility] = useState<Map<number, 'visible' | 'maintenance' | 'hidden'>>(new Map());

  const debouncedSearchTerm = useDebounce(searchTerm, DEBOUNCE_DELAY);

  useEffect(() => {
    loadStores();
    loadProvidersAndGames();
  }, []);

  useEffect(() => {
    if (selectedStore) {
      loadStoreBlockedData();
      // 매장이 선택되면 해당 매장의 API로 게임 필터링
      if (allGames.length > 0 && selectedApi) {
        const apiGames = allGames.filter(g => g.api_type === selectedApi);
        setGames(apiGames);
      }
    }
  }, [selectedStore]);

  useEffect(() => {
    if (selectedApi && allGames.length > 0) {
      const apiGames = allGames.filter(g => g.api_type === selectedApi);
      setGames(apiGames);
    }
  }, [selectedApi, allGames]);

  const loadStores = async () => {
    try {
      setLoadingStores(true);
      
      console.log('🔍 [StoresTab] 매장 조회 시작');
      console.log('  - user.id:', user.id);
      console.log('  - user.username:', user.username);
      console.log('  - user.level:', user.level);
      
      // ✅ 조직격리: 재귀적으로 하위 조직 조회 (Lv6 매장만)
      const getAllDescendants = async (partnerId: string): Promise<Partner[]> => {
        const { data: children } = await supabase
          .from('partners')
          .select('*')
          .eq('parent_id', partnerId)
          .eq('status', 'active')
          .order('level', { ascending: true })
          .order('created_at', { ascending: true });

        if (!children || children.length === 0) return [];

        // 각 자식의 하위 조직도 재귀 조회
        const allDescendants = [...children];
        for (const child of children) {
          const grandChildren = await getAllDescendants(child.id);
          allDescendants.push(...grandChildren);
        }

        return allDescendants;
      };

      // Lv1: 모든 매장 조회
      if (user.level === 1) {
        const { data: allStoresData, error } = await supabase
          .from('partners')
          .select('*')
          .eq('level', 6) // 매장만
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('❌ 매장 목록 조회 실패:', error);
          throw error;
        }

        console.log(`✅ [Lv1] 전체 매장: ${allStoresData?.length || 0}개`);
        setStores(allStoresData || []);
        return;
      }

      // Lv2~Lv5: 하위 조직 중 Lv6 매장만 필터링
      const descendants = await getAllDescendants(user.id);
      const stores = descendants.filter(partner => partner.level === 6);
      
      console.log(`✅ [Lv${user.level}] 하위 조직: ${descendants.length}개`);
      console.log(`✅ 매장 목록 로드 완료: ${stores.length}개`);
      console.log('📋 매장 데이터:', stores);
      
      setStores(stores);
    } catch (error) {
      console.error("❌ 매장 목록 로드 실패:", error);
      toast.error("매장 목록 로드에 실패했습니다.");
    } finally {
      setLoadingStores(false);
    }
  };

  const loadProvidersAndGames = async () => {
    try {
      const [providersData, allGamesData] = await Promise.all([
        gameApi.getProviders({ partner_id: user.id }),
        gameApi.getGames({})
      ]);

      setProviders(providersData);
      setAllGames(allGamesData);

      const uniqueApiTypes = [...new Set(providersData.map(p => p.api_type))];
      if (uniqueApiTypes.length > 0 && !selectedApi) {
        const firstApi = uniqueApiTypes[0];
        setSelectedApi(firstApi);
        const apiGames = allGamesData.filter(g => g.api_type === firstApi);
        setGames(apiGames);
      }
    } catch (error) {
      console.error("❌ 제공사/게임 로드 실패:", error);
    }
  };

  const loadStoreBlockedData = async () => {
    if (!selectedStore) return;

    try {
      setLoadingBlockedData(true);
      
      // 🆕 게임 제공사/게임 테이블에서 game_visible 컬럼 조회
      const visibilityMap = new Map<number, 'visible' | 'maintenance' | 'hidden'>();
      const blockedProviderIds = new Set<number>();
      const blockedGameIds = new Set<number>();
      const gameVisibilityMap = new Map<number, 'visible' | 'maintenance' | 'hidden'>();

      // Honor API: 별도 테이블에서 game_visible 조회
      const { data: honorProviders } = await supabase
        .from('honor_game_providers')
        .select('id, game_visible');
      
      honorProviders?.forEach(p => {
        const gameVisible = p.game_visible || 'visible';
        visibilityMap.set(p.id, gameVisible);
        if (gameVisible === 'hidden') {
          blockedProviderIds.add(p.id);
        }
      });
      
      const { data: honorGames } = await supabase
        .from('honor_games')
        .select('id, game_visible');
      
      honorGames?.forEach(g => {
        const gameVisible = g.game_visible || 'visible';
        gameVisibilityMap.set(g.id, gameVisible);
        if (gameVisible === 'hidden') {
          blockedGameIds.add(g.id);
        }
      });

      // 나머지 API (invest, oroplay, familyapi): 공통 테이블에서 game_visible 조회
      const { data: commonProviders } = await supabase
        .from('game_providers')
        .select('id, game_visible');
      
      commonProviders?.forEach(p => {
        const gameVisible = p.game_visible || 'visible';
        visibilityMap.set(p.id, gameVisible);
        if (gameVisible === 'hidden') {
          blockedProviderIds.add(p.id);
        }
      });
      
      const { data: commonGames } = await supabase
        .from('games')
        .select('id, game_visible');
      
      commonGames?.forEach(g => {
        const gameVisible = g.game_visible || 'visible';
        gameVisibilityMap.set(g.id, gameVisible);
        if (gameVisible === 'hidden') {
          blockedGameIds.add(g.id);
        }
      });

      setStoreProviderVisibility(visibilityMap);
      setStoreBlockedProviders(blockedProviderIds);
      setStoreBlockedGames(blockedGameIds);
      
      console.log(`✅ 매장 게임 관리 데이터 로드:`);
      console.log(`  - 제공사 game_visible 설정: ${visibilityMap.size}개`);
      console.log(`  - 게임 game_visible 설정: ${gameVisibilityMap.size}개`);
      console.log(`  - 비노출(hidden) 제공사: ${blockedProviderIds.size}개`);
      console.log(`  - 비노출(hidden) 게임: ${blockedGameIds.size}개`);
    } catch (error) {
      console.error("❌ 매장 게임 관리 데이터 로드 실패:", error);
      toast.error("매장 게임 관리 데이터 로드에 실패했습니다.");
    } finally {
      setLoadingBlockedData(false);
    }
  };

  const handleStoreSelect = (store: Partner) => {
    setSelectedStore(store);
    setSearchTerm("");
    setExpandedProviderIds(new Set());
    
    // 매장의 첫 번째 사용 가능한 API를 자동 선택
    let filteredProviders = providers;
    if (store.selected_apis && Array.isArray(store.selected_apis) && store.selected_apis.length > 0) {
      filteredProviders = providers.filter(p => 
        store.selected_apis.includes(p.api_type as string)
      );
    }
    
    const uniqueApiTypes = [...new Set(filteredProviders.map(p => p.api_type))];
    if (uniqueApiTypes.length > 0) {
      const firstApi = uniqueApiTypes[0];
      setSelectedApi(firstApi);
    } else {
      setSelectedApi(null);
    }
  };

  const handleToggleProvider = async (providerId: number) => {
    if (!selectedStore) return;

    try {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) return;
      
      // 현재 game_visible 상태 가져오기
      const currentVisibility = storeProviderVisibility.get(providerId) || 'visible';
      
      // 토글 로직: visible ↔ hidden
      let newVisibility: 'visible' | 'maintenance' | 'hidden';
      if (currentVisibility === 'hidden') {
        newVisibility = 'visible'; // 비노출 → 노출
      } else {
        newVisibility = 'hidden'; // 노출/점검중 → 비노출
      }
      
      // honor만 별도 테이블, 나머지는 모두 game_providers
      const tableName = provider.api_type === 'honorapi' ? 'honor_game_providers' : 'game_providers';
      
      const { error } = await supabase
        .from(tableName)
        .update({ game_visible: newVisibility })
        .eq('id', providerId);

      if (error) throw error;
      
      if (newVisibility === 'visible') {
        toast.success("제공사가 노출로 변경되었습니다.");
      } else {
        toast.success("제공사가 비노출로 변경되었습니다.");
      }
      
      // ✅ 데이터 재로드
      await loadStoreBlockedData();
    } catch (error) {
      console.error("❌ 제공사 노출/비노출 변경 실패:", error);
      toast.error("제공사 노출/비노출 변경에 실패했습니다.");
    }
  };

  const handleToggleGame = async (gameId: number) => {
    if (!selectedStore) return;

    try {
      const isBlocked = storeBlockedGames.has(gameId);
      const game = games.find(g => g.id === gameId);
      if (!game) return;
      
      // 🆕 게임 테이블의 game_visible 필드 직접 업데이트
      // isBlocked=true (game_visible='hidden') → 노출로 변경 → newVisibility='visible'
      // isBlocked=false (game_visible='visible') → 비노출로 변경 → newVisibility='hidden'
      const newVisibility: 'visible' | 'hidden' = isBlocked ? 'visible' : 'hidden';
      
      // honor만 별도 테이블, 나머지는 모두 games
      const tableName = game.api_type === 'honorapi' ? 'honor_games' : 'games';
      
      const { error } = await supabase
        .from(tableName)
        .update({ game_visible: newVisibility })
        .eq('id', gameId);

      if (error) throw error;
      
      if (newVisibility === 'visible') {
        toast.success("게임이 노출로 변경되었습니다.");
      } else {
        toast.success("게임이 비노출로 변경되었습니다.");
      }
      
      // ✅ 데이터 재로드
      await loadStoreBlockedData();
    } catch (error) {
      console.error("❌ 게임 노출/비노출 변경 실패:", error);
      toast.error("게임 노출/비노출 변경에 실패했습니다.");
    }
  };

  const availableApis = useMemo(() => {
    if (!selectedStore) return [];
    
    let filteredProviders = providers;
    
    // 선택된 매장의 selected_apis 기준으로 필터링
    if (selectedStore.selected_apis && Array.isArray(selectedStore.selected_apis) && selectedStore.selected_apis.length > 0) {
      filteredProviders = providers.filter(p => 
        selectedStore.selected_apis.includes(p.api_type as string)
      );
    }
    
    const uniqueApiTypes = [...new Set(filteredProviders.map(p => p.api_type))] as ApiType[];
    return uniqueApiTypes.map(apiType => ({
      value: apiType,
      label: API_METADATA[apiType]?.label || apiType.toUpperCase(),
      color: API_METADATA[apiType]?.color || "from-blue-600 to-cyan-600",
    }));
  }, [providers, selectedStore]);

  const availableGameTypes = getAvailableGameTypes(selectedApi);

  const currentProviders = useMemo(() => {
    if (!selectedApi) return [];
    
    const apiProviders = providers.filter(p => p.api_type === selectedApi && p.status === "visible");
    
    return apiProviders.filter(provider => {
      return games.some(game => {
        if (game.provider_id !== provider.id) return false;
        if (game.api_type !== selectedApi) return false;
        if (game.status !== "visible") return false;
        if (selectedGameType !== "all" && game.type !== selectedGameType) return false;
        return true;
      });
    });
  }, [providers, selectedApi, selectedGameType, games]);

  const providerGamesMap = useMemo(() => {
    const map = new Map<number, Game[]>();
    const searchNormalized = debouncedSearchTerm.replace(/\s/g, '').toLowerCase();
    
    currentProviders.forEach(provider => {
      const providerNameNormalized = provider.name.replace(/\s/g, '').toLowerCase();
      
      const providerGames = games.filter(game => {
        if (game.provider_id !== provider.id) return false;
        if (game.api_type !== selectedApi) return false;
        if (game.status !== "visible") return false;
        if (selectedGameType !== "all" && game.type !== selectedGameType) return false;
        
        if (!searchNormalized) return true;
        
        const gameNameNormalized = game.name.replace(/\s/g, '').toLowerCase();
        const gameNameKoNormalized = (game.name_ko || '').replace(/\s/g, '').toLowerCase();
        
        return providerNameNormalized.includes(searchNormalized) ||
               gameNameNormalized.includes(searchNormalized) ||
               gameNameKoNormalized.includes(searchNormalized);
      });
      
      if (providerGames.length > 0) {
        map.set(provider.id, providerGames);
      }
    });
    
    return map;
  }, [games, currentProviders, selectedApi, selectedGameType, debouncedSearchTerm]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* 왼쪽: 매장 목록 */}
      <Card className="bg-slate-800/30 border-slate-700 lg:col-span-1">
        <CardContent className="p-3">
          <div className="space-y-3">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">매장 목록</h3>
              <p className="text-base text-slate-300">매장을 선택하세요</p>
            </div>

            {loadingStores ? (
              <div className="text-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                <p className="text-base text-slate-400">로딩 중...</p>
              </div>
            ) : stores.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Store className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-base">매장이 없습니다</p>
              </div>
            ) : (
              <ScrollArea className="h-[700px]">
                <div className="space-y-2">
                  {stores.map((store) => (
                    <button
                      key={store.id}
                      onClick={() => handleStoreSelect(store)}
                      className={`w-full p-4 rounded-lg text-left transition-all ${
                        selectedStore?.id === store.id
                          ? "bg-purple-600/30 border-2 border-purple-400 shadow-lg shadow-purple-500/20"
                          : "bg-slate-700/40 border-2 border-slate-600 hover:bg-slate-700/60 hover:border-slate-500"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Store className="w-5 h-5 text-purple-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-bold text-white truncate">
                            {store.nickname || store.username}
                          </p>
                          {store.nickname && (
                            <p className="text-sm text-slate-400 truncate">
                              {store.username}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 오른쪽: 매장 게임 관리 */}
      <Card className="bg-slate-800/30 border-slate-700 lg:col-span-4">
        <CardContent className="p-6">
          {!selectedStore ? (
            <div className="text-center py-12 text-slate-400">
              <Store className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">매장을 선택하세요</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 헤더 */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {selectedStore.username} - 게임 관리
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    차단된 게임은 해당 매장에서 플레이할 수 없습니다
                  </p>
                </div>
              </div>

              {/* 필터 영역 */}
              <div className="bg-slate-900/30 border border-slate-700/50 rounded-lg p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* API 선택 */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-white">API 제공사</label>
                    <div className="flex flex-wrap gap-2">
                      {availableApis.map(api => (
                        <Button
                          key={api.value}
                          size="sm"
                          variant={selectedApi === api.value ? "default" : "outline"}
                          onClick={() => setSelectedApi(api.value)}
                          className={`rounded-none ${
                            selectedApi === api.value
                              ? `bg-gradient-to-r ${api.color} text-white border-0`
                              : 'bg-slate-800/50 border-slate-600 text-slate-300'
                          }`}
                        >
                          {api.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* 게임 타입 */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-white">게임 타입</label>
                    <div className="flex flex-wrap gap-2">
                      {availableGameTypes.map(type => (
                        <Button
                          key={type.value}
                          size="sm"
                          variant={selectedGameType === type.value ? "default" : "outline"}
                          onClick={() => setSelectedGameType(type.value)}
                          className={`rounded-none ${
                            selectedGameType === type.value
                              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-0'
                              : 'bg-slate-800/50 border-slate-600 text-slate-300'
                          }`}
                        >
                          {type.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 검색 */}
                <div className="mt-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="게임 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-11 bg-slate-800/50 border-slate-700/50 text-white"
                  />
                </div>
              </div>

              {/* 게임 목록 */}
              {loadingBlockedData ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-400" />
                  <p className="text-slate-400">로딩 중...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentProviders.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      제공사가 없습니다
                    </div>
                  ) : (
                    currentProviders
                      .filter(provider => providerGamesMap.has(provider.id))
                      .map(provider => {
                        const isExpanded = expandedProviderIds.has(provider.id);
                        const providerGames = providerGamesMap.get(provider.id) || [];
                        const isProviderBlocked = storeBlockedProviders.has(provider.id);

                        return (
                          <div key={provider.id} className="bg-slate-900/50 border border-slate-700/50 rounded-lg overflow-hidden">
                            {/* 제공사 헤더 */}
                            <div className="flex items-center justify-between p-4 bg-slate-800/50">
                              <div className="flex items-center gap-3 flex-1">
                                <button
                                  onClick={() => {
                                    setExpandedProviderIds(prev => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(provider.id)) {
                                        newSet.delete(provider.id);
                                      } else {
                                        newSet.add(provider.id);
                                      }
                                      return newSet;
                                    });
                                  }}
                                  className="text-slate-400 hover:text-white"
                                >
                                  {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                </button>
                                <h4 className="text-lg font-bold text-white">{provider.name}</h4>
                                <span className="text-sm text-slate-400">
                                  ({providerGames.length}개 게임)
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleProvider(provider.id)}
                                className={`${
                                  isProviderBlocked
                                    ? 'bg-red-900/20 border-red-600/50 text-red-300 hover:bg-red-900/40'
                                    : 'bg-emerald-900/20 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/40'
                                }`}
                              >
                                {isProviderBlocked ? (
                                  <>
                                    <Ban className="w-4 h-4 mr-1.5" />
                                    비노출
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-4 h-4 mr-1.5" />
                                    노출
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* 게임 목록 */}
                            {isExpanded && (
                              <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {providerGames.map(game => {
                                  const isGameBlocked = storeBlockedGames.has(game.id);
                                  
                                  return (
                                    <div
                                      key={game.id}
                                      className={`relative border-2 rounded-lg p-3 transition-all ${
                                        isGameBlocked
                                          ? 'bg-red-900/10 border-red-600/30'
                                          : 'bg-slate-800/50 border-slate-700/50'
                                      }`}
                                    >
                                      <div className="aspect-video bg-slate-900/50 rounded mb-2 flex items-center justify-center">
                                        <span className="text-xs text-slate-500">No Image</span>
                                      </div>
                                      <p className="text-sm font-semibold text-white truncate mb-2">
                                        {game.name_ko || game.name}
                                      </p>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleToggleGame(game.id)}
                                        className={`w-full text-xs ${
                                          isGameBlocked
                                            ? 'bg-red-900/20 border-red-600/50 text-red-300'
                                            : 'bg-emerald-900/20 border-emerald-600/50 text-emerald-300'
                                        }`}
                                      >
                                        {isGameBlocked ? (
                                          <>
                                            <Ban className="w-3 h-3 mr-1" />
                                            비노출
                                          </>
                                        ) : (
                                          <>
                                            <Check className="w-3 h-3 mr-1" />
                                            노출
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}