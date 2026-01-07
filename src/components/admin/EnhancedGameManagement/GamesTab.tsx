import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import {
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { Partner } from "../../../types";
import { gameApi, Game, GameProvider } from "../../../lib/gameApi";
import { useLanguage } from "../../../contexts/LanguageContext";
import { toast } from "sonner@2.0.3";

// 모듈화된 리소스 import
import type { ApiType, GameType, GameStatus } from "../game-management/types";
import {
  API_METADATA,
  getAvailableGameTypes,
  DEBOUNCE_DELAY,
  DEFAULT_GAME_TYPE,
} from "../game-management/constants";
import { useDebounce } from "../game-management/hooks/useDebounce";
import { ProviderSection } from "../game-management/components/ProviderSection";

interface GamesTabProps {
  user: Partner;
}

export function GamesTab({ user }: GamesTabProps) {
  const { t } = useLanguage();

  // State
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [allGames, setAllGames] = useState<Game[]>([]);
  
  const [selectedApi, setSelectedApi] = useState<ApiType | null>(null);
  const [selectedGameType, setSelectedGameType] = useState<GameType>(DEFAULT_GAME_TYPE);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGameIds, setSelectedGameIds] = useState<Set<number>>(new Set());
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<number>>(new Set());

  const [blockedProviderIds, setBlockedProviderIds] = useState<Set<number>>(new Set());
  const [blockedGameIds, setBlockedGameIds] = useState<Set<number>>(new Set());

  const debouncedSearchTerm = useDebounce(searchTerm, DEBOUNCE_DELAY);

  // 사용 가능한 API 목록
  const availableApis = useMemo(() => {
    let filteredProviders = providers;
    
    if (user.level === 2 && user.selected_apis && Array.isArray(user.selected_apis) && user.selected_apis.length > 0) {
      filteredProviders = providers.filter(p => 
        user.selected_apis.includes(p.api_type as string)
      );
    }
    
    const uniqueApiTypes = [...new Set(filteredProviders.map(p => p.api_type))] as ApiType[];
    return uniqueApiTypes.map(apiType => ({
      value: apiType,
      label: API_METADATA[apiType]?.label || apiType.toUpperCase(),
      color: API_METADATA[apiType]?.color || "from-blue-600 to-cyan-600",
    }));
  }, [providers, user.level, user.selected_apis]);

  const availableGameTypes = getAvailableGameTypes(selectedApi);

  // 현재 API의 제공사 필터링
  const currentProviders = useMemo(() => {
    if (!selectedApi) return [];
    
    const apiProviders = providers.filter(p => p.api_type === selectedApi);
    
    const filteredProviders = apiProviders.filter(provider => {
      if (user.level > 1 && provider.status !== "visible") {
        return false;
      }
      
      const hasGamesOfType = games.some(game => {
        if (game.provider_id !== provider.id) return false;
        if (game.api_type !== selectedApi) return false;
        if (selectedGameType !== "all" && game.type !== selectedGameType) {
          return false;
        }
        return true;
      });
      
      return hasGamesOfType;
    });
    
    return filteredProviders;
  }, [providers, selectedApi, selectedGameType, games, user.level]);

  // 제공사별 게임 그룹화
  const providerGamesMap = useMemo(() => {
    const map = new Map<number, Game[]>();
    const searchNormalized = debouncedSearchTerm.replace(/\\s/g, '').toLowerCase();
    
    currentProviders.forEach(provider => {
      const providerNameNormalized = provider.name.replace(/\\s/g, '').toLowerCase();
      
      const providerGames = games.filter(game => {
        const matchesProvider = game.provider_id === provider.id;
        const matchesApi = game.api_type === selectedApi;
        const matchesType = selectedGameType === "all" || game.type === selectedGameType;
        
        if (!matchesProvider || !matchesApi || !matchesType) return false;
        if (user.level > 1 && game.status !== "visible") return false;
        if (!searchNormalized) return true;
        
        const gameNameNormalized = game.name.replace(/\\s/g, '').toLowerCase();
        const gameNameKoNormalized = (game.name_ko || '').replace(/\\s/g, '').toLowerCase();
        const matchesProviderName = providerNameNormalized.includes(searchNormalized);
        const matchesGameName = gameNameNormalized.includes(searchNormalized);
        const matchesGameNameKo = gameNameKoNormalized.includes(searchNormalized);
        
        return matchesProviderName || matchesGameName || matchesGameNameKo;
      });
      
      if (providerGames.length > 0) {
        map.set(provider.id, providerGames);
      }
    });
    
    return map;
  }, [games, currentProviders, selectedApi, selectedGameType, debouncedSearchTerm, user.level]);

  // 통계
  const stats = useMemo(() => {
    const currentGames = games.filter(g => 
      g.api_type === selectedApi &&
      g.type === selectedGameType
    );

    return {
      total: currentGames.length,
      visible: currentGames.filter(g => g.status === "visible").length,
      maintenance: currentGames.filter(g => g.status === "maintenance").length,
      hidden: currentGames.filter(g => g.status === "hidden").length,
      featured: currentGames.filter(g => g.is_featured).length,
    };
  }, [games, selectedApi, selectedGameType]);

  // 초기 데이터 로드
  useEffect(() => {
    initializeData();
  }, []);

  // API 변경 시 게임 재로드
  useEffect(() => {
    if (selectedApi && allGames.length > 0) {
      const apiGames = allGames.filter(g => g.api_type === selectedApi);
      setGames(apiGames);
    }
  }, [selectedApi, allGames]);

  // API 변경 시 게임 타입 초기화
  useEffect(() => {
    const types = getAvailableGameTypes(selectedApi);
    if (!types.find(t => t.value === selectedGameType)) {
      setSelectedGameType(types[0].value);
    }
  }, [selectedApi, selectedGameType]);

  // 초기 API 선택
  useEffect(() => {
    if (availableApis.length > 0 && !selectedApi) {
      setSelectedApi(availableApis[0].value);
    }
  }, [availableApis]);

  const initializeData = async () => {
    try {
      setLoading(true);
      
      const [providersData, blockedProviders, blockedGames, allGamesData] = await Promise.all([
        gameApi.getProviders({ partner_id: user.id }),
        gameApi.getPartnerBlockedProviders(user.id),
        gameApi.getPartnerBlockedGames(user.id),
        gameApi.getGames({})
      ]);

      setProviders(providersData);
      setBlockedProviderIds(blockedProviders);
      setBlockedGameIds(blockedGames);
      setAllGames(allGamesData);

      const uniqueApiTypes = [...new Set(providersData.map(p => p.api_type))];
      if (uniqueApiTypes.length > 0 && !selectedApi) {
        const firstApi = uniqueApiTypes[0];
        setSelectedApi(firstApi);
        const apiGames = allGamesData.filter(g => g.api_type === firstApi);
        setGames(apiGames);
      }
    } catch (error) {
      console.error("❌ 초기 데이터 로드 실패:", error);
      toast.error("데이터 로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncGames = async () => {
    if (syncing || !selectedApi) {
      toast.warning(syncing ? "동기화가 이미 진행 중입니다." : "API를 선택해주세요.");
      return;
    }

    setSyncing(true);
    try {
      toast.info(`${selectedApi.toUpperCase()} 제공사 및 게임 동기화 중...`);

      let result;
      
      if (selectedApi === "invest") {
        await gameApi.initializeInvestProviders();
        result = await gameApi.syncAllInvestGames();
        const totalAdded = result.results.reduce((sum: number, r: any) => sum + r.newGames, 0);
        const totalUpdated = result.results.reduce((sum: number, r: any) => sum + r.updatedGames, 0);
        toast.success(`Invest 동기화 완료: 신규 ${totalAdded}개, 업데이트 ${totalUpdated}개`);
      } else if (selectedApi === "oroplay") {
        await gameApi.syncOroPlayProviders();
        result = await gameApi.syncOroPlayGames();
        toast.success(`OroPlay 동기화 완료: 신규 ${result.newGames}개, 업데이트 ${result.updatedGames}개`);
      } else if (selectedApi === "familyapi") {
        await gameApi.syncFamilyApiProviders();
        result = await gameApi.syncFamilyApiGames();
        toast.success(`FamilyAPI 동기화 완료: 신규 ${result.newGames}개, 업데이트 ${result.updatedGames}개`);
      } else if (selectedApi === "honorapi") {
        result = await gameApi.syncHonorApiGames();
        toast.success(`HonorAPI 동기화 완료: 제공사 ${result.newProviders}개, 게임 신규 ${result.newGames}개`);
      }

      const providersData = await gameApi.getProviders({ partner_id: user.id });
      setProviders(providersData);
      
      const allGamesData = await gameApi.getGames({});
      setAllGames(allGamesData);
      const apiGames = allGamesData.filter(g => g.api_type === selectedApi);
      setGames(apiGames);
    } catch (error) {
      console.error(`❌ ${selectedApi} 동기화 실패:`, error);
      toast.error(`${selectedApi.toUpperCase()} 동기화 실패`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleGameFeatured = async (gameId: number) => {
    try {
      const game = games.find(g => g.id === gameId);
      if (!game) return;

      await gameApi.updateGameFeatured(gameId, !game.is_featured, game.api_type);
      toast.success(game.is_featured ? "추천이 해제되었습니다." : "추천 게임으로 설정되었습니다.");
      
      await initializeData();
    } catch (error) {
      console.error("❌ 추천 설정 실패:", error);
      toast.error("추천 설정 변경에 실패했습니다.");
    }
  };

  const handleChangeGameStatus = async (
    gameId: number,
    status: GameStatus,
    apiType: ApiType
  ) => {
    try {
      if (user.level === 1) {
        await gameApi.updateGameStatus(gameId, status, apiType);
        const statusText = status === "visible" ? "노출" : status === "maintenance" ? "점검중" : "숨김";
        toast.success(`게임이 ${statusText} 상태로 변경되었습니다.`);
      } else if (user.level === 2) {
        await gameApi.updateGameVisibility(gameId, status === "visible", apiType);
        toast.success(`게임 노출 상태가 변경되었습니다.`);
      }
      
      await initializeData();
    } catch (error) {
      console.error("❌ 게임 상태 변경 실패:", error);
      toast.error("게임 상태 변경에 실패했습니다.");
    }
  };

  const handleToggleProviderStatus = async (
    providerId: number,
    status: GameStatus,
    apiType: ApiType
  ) => {
    try {
      // 🆕 통합 제공사인 경우, 모든 원본 provider ID 찾기
      const provider = currentProviders.find(p => p.id === providerId);
      
      if (provider?.multi_api && provider.source_provider_ids) {
        // 통합 제공사인 경우: 모든 원본 provider ID를 업데이트
        console.log(`🔗 통합 제공사 상태 변경: ${provider.name}, IDs: ${provider.source_provider_ids.join(', ')}, status: ${status}`);
        
        for (let i = 0; i < provider.source_provider_ids.length; i++) {
          const sourceProviderId = provider.source_provider_ids[i];
          const sourceApiType = provider.source_apis![i] as ApiType;
          await gameApi.updateProviderStatus(sourceProviderId, status, sourceApiType);
        }
      } else {
        // 일반 제공사: 하나만 업데이트
        await gameApi.updateProviderStatus(providerId, status, apiType);
      }
      
      toast.success(`제공사 상태가 변경되었습니다.`);
      await initializeData();
    } catch (error) {
      console.error("❌ 제공사 상태 변경 실패:", error);
      toast.error("제공사 상태 변경에 실패했습니다.");
    }
  };

  const handleToggleGameSelection = (gameId: number) => {
    setSelectedGameIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(gameId)) {
        newSet.delete(gameId);
      } else {
        newSet.add(gameId);
      }
      return newSet;
    });
  };

  const handleToggleExpand = (providerId: number) => {
    setExpandedProviderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(providerId)) {
        newSet.delete(providerId);
      } else {
        newSet.add(providerId);
      }
      return newSet;
    });
  };

  const handleExpandAll = () => {
    setExpandedProviderIds(new Set(currentProviders.map(p => p.id)));
  };

  const handleCollapseAll = () => {
    setExpandedProviderIds(new Set());
  };

  const handleBulkStatusChange = async (status: GameStatus) => {
    if (selectedGameIds.size === 0) return;

    try {
      const selectedGames = games.filter(g => selectedGameIds.has(g.id));
      
      await Promise.all(
        selectedGames.map(game =>
          user.level === 1
            ? gameApi.updateGameStatus(game.id, status, game.api_type as ApiType)
            : gameApi.updateGameVisibility(game.id, status === "visible", game.api_type as ApiType)
        )
      );

      toast.success(`${selectedGameIds.size}개 게임 상태가 변경되었습니다.`);
      setSelectedGameIds(new Set());
      await initializeData();
    } catch (error) {
      console.error("❌ 일괄 상태 변경 실패:", error);
      toast.error("일괄 상태 변경에 실패했습니다.");
    }
  };

  const handleBulkApiStatusChange = async (status: GameStatus) => {
    if (!selectedApi) return;

    try {
      const apiGames = games.filter(g => g.api_type === selectedApi && g.type === selectedGameType);
      
      await Promise.all(
        apiGames.map(game =>
          user.level === 1
            ? gameApi.updateGameStatus(game.id, status, game.api_type as ApiType)
            : gameApi.updateGameVisibility(game.id, status === "visible", game.api_type as ApiType)
        )
      );

      toast.success(`${selectedApi.toUpperCase()} ${selectedGameType} 전체 게임 상태가 변경되었습니다.`);
      await initializeData();
    } catch (error) {
      console.error("❌ API 전체 상태 변경 실패:", error);
      toast.error("API 전체 상태 변경에 실패했습니다.");
    }
  };

  return (
    <Card className="bg-slate-800/30 border-slate-700">
      <CardContent className="p-6">
        {/* 필터 영역 */}
        <div className="mb-6 bg-slate-900/30 border border-slate-700/50 rounded-lg p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* API 제공사 선택 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                <span className="text-base font-bold text-white">API 제공사</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableApis.map(api => (
                  <Button
                    key={api.value}
                    size="sm"
                    variant={selectedApi === api.value ? "default" : "outline"}
                    onClick={() => setSelectedApi(api.value)}
                    className={`rounded-none ${
                      selectedApi === api.value
                        ? `bg-gradient-to-r ${api.color} text-white border-0 hover:opacity-90`
                        : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {api.label}
                  </Button>
                ))}
              </div>
              {selectedApi && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkApiStatusChange("visible")}
                    className="flex-1 bg-emerald-900/20 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-500 text-sm font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    전체 노출
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkApiStatusChange("hidden")}
                    className="flex-1 bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50 hover:border-slate-600 text-sm font-semibold"
                  >
                    <EyeOff className="w-3.5 h-3.5 mr-1.5" />
                    전체 숨김
                  </Button>
                </div>
              )}
            </div>

            {/* 구분선 */}
            <div className="hidden lg:flex items-center justify-center">
              <div className="w-px h-full bg-gradient-to-b from-transparent via-slate-600 to-transparent"></div>
            </div>

            {/* 게임 타입 선택 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full"></div>
                <span className="text-base font-bold text-white">게임 타입</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableGameTypes.map(type => (
                  <Button
                    key={type.value}
                    size="sm"
                    variant={selectedGameType === type.value ? "default" : "outline"}
                    onClick={() => setSelectedGameType(type.value)}
                    className={`rounded-none ${
                      selectedGameType === type.value
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-0 hover:opacity-90'
                        : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* 구분선 */}
          <div className="my-4 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>

          {/* 검색 및 액션 영역 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="게임 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 pr-10 text-base font-medium bg-slate-800/50 border-slate-700/50 focus:border-blue-500/50 focus:ring-blue-500/20 text-white placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExpandAll}
                className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600 text-white text-base font-semibold px-4 py-2"
              >
                <ChevronDown className="w-4 h-4 mr-1.5" />
                전체 펼치기
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCollapseAll}
                className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600 text-white text-base font-semibold px-4 py-2"
              >
                <ChevronRight className="w-4 h-4 mr-1.5" />
                전체 접기
              </Button>
            </div>

            {selectedGameIds.size > 0 && (
              <>
                <div className="w-px h-6 bg-slate-700/50"></div>
                <div className="flex items-center gap-2">
                  <span className="text-base text-white font-bold">
                    {selectedGameIds.size}개 선택됨
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusChange("visible")}
                    className="bg-emerald-900/20 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-500 text-base font-semibold px-4 py-2"
                  >
                    <Eye className="w-4 h-4 mr-1.5" />
                    일괄 노출
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusChange("hidden")}
                    className="bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50 hover:border-slate-600 text-base font-semibold px-4 py-2"
                  >
                    <EyeOff className="w-4 h-4 mr-1.5" />
                    일괄 숨김
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 제공사별 게임 목록 */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              로딩 중...
            </div>
          ) : currentProviders.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              제공사가 없습니다.
            </div>
          ) : (
            currentProviders
              .filter(provider => providerGamesMap.has(provider.id))
              .map(provider => (
                <ProviderSection
                  key={provider.id}
                  provider={provider}
                  games={providerGamesMap.get(provider.id) || []}
                  isExpanded={expandedProviderIds.has(provider.id)}
                  onToggleExpand={() => handleToggleExpand(provider.id)}
                  onToggleProviderStatus={(status, apiType) => handleToggleProviderStatus(provider.id, status, apiType)}
                  selectedGameIds={selectedGameIds}
                  onToggleGameSelection={handleToggleGameSelection}
                  onToggleGameFeatured={handleToggleGameFeatured}
                  onChangeGameStatus={handleChangeGameStatus}
                  userLevel={user.level}
                  isBlocked={blockedProviderIds.has(provider.id)}
                  blockedGameIds={blockedGameIds}
                />
              ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}