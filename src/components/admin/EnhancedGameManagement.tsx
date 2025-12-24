import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "sonner@2.0.3";
import {
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  Star,
  Zap,
  Gamepad2,
  AlertTriangle,
  Settings,
  ChevronDown,
  ChevronRight,
  Building2,
} from "lucide-react";
import { Partner } from "../../types";
import { gameApi, Game, GameProvider } from "../../lib/gameApi";
import { MetricCard } from "./MetricCard";
import { useBalance } from "../../contexts/BalanceContext";
import { useLanguage } from "../../contexts/LanguageContext";

interface EnhancedGameManagementProps {
  user: Partner;
}

type ApiType = "invest" | "oroplay" | "familyapi" | "honorapi";
type GameType = "all" | "casino" | "slot" | "minigame";

// 검색어 debounce를 위한 custom hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// 게임 카드 컴포넌트
interface GameCardProps {
  game: Game;
  isSelected: boolean;
  onToggleSelection: () => void;
  onToggleFeatured: () => void;
  onChangeStatus: (status: "visible" | "maintenance" | "hidden") => void;
}

function GameCard({
  game,
  isSelected,
  onToggleSelection,
  onToggleFeatured,
  onChangeStatus,
}: GameCardProps) {
  const { t } = useLanguage();
  
  const getStatusIcon = () => {
    if (game.status === "maintenance") {
      return <AlertTriangle className="w-3 h-3 text-orange-400" />;
    } else if (!game.is_visible || game.status === "hidden") {
      return <EyeOff className="w-3 h-3 text-slate-400" />;
    } else {
      return <Eye className="w-3 h-3 text-green-400" />;
    }
  };

  return (
    <div
      className={`group relative bg-slate-900/50 border rounded-md overflow-hidden transition-all hover:shadow-md hover:shadow-blue-500/20 ${
        isSelected
          ? "border-blue-500 ring-1 ring-blue-500/50"
          : "border-slate-700 hover:border-slate-600"
      }`}
    >
      <div className="absolute top-1 left-1 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          className="bg-slate-900/90 border-slate-600 h-4 w-4"
        />
      </div>

      <div className="aspect-[3/2] bg-slate-800 relative overflow-hidden">
        {game.image_url ? (
          <img
            src={game.image_url}
            alt={game.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="67"%3E%3Crect fill="%23334155" width="100" height="67"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-size="24" fill="%23475569"%3E🎮%3C/text%3E%3C/svg%3E';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">
            🎮
          </div>
        )}

        {game.is_featured && (
          <div className="absolute top-1 right-1">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-lg" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleFeatured}
            className={`h-7 px-2 border-0 text-white text-xs ${
              game.is_featured
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-slate-700 hover:bg-slate-600"
            }`}
            title={game.is_featured ? t.gameManagement.removeFeatured : t.gameManagement.setFeatured}
          >
            <Star className={`w-3 h-3 ${game.is_featured ? "fill-white" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="p-2 space-y-1">
        <div className="min-h-[32px] flex items-center">
          <div
            className="text-xs text-slate-200 line-clamp-2 leading-tight"
            title={game.name}
          >
            {game.name}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
          <div className="flex items-center gap-1">
            {getStatusIcon()}
            {game.rtp && (
              <span className="text-[10px] text-slate-400">RTP {game.rtp}%</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Select
              value={game.status}
              onValueChange={(value: "visible" | "maintenance" | "hidden") =>
                onChangeStatus(value)
              }
            >
              <SelectTrigger className="h-6 w-20 text-[10px] bg-slate-800 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="visible">
                  <div className="flex items-center gap-1 text-xs">
                    <Eye className="w-3 h-3" />
                    {t.gameManagement.visible}
                  </div>
                </SelectItem>
                <SelectItem value="maintenance">
                  <div className="flex items-center gap-1 text-xs">
                    <AlertTriangle className="w-3 h-3" />
                    {t.gameManagement.maintenance}
                  </div>
                </SelectItem>
                <SelectItem value="hidden">
                  <div className="flex items-center gap-1 text-xs">
                    <EyeOff className="w-3 h-3" />
                    {t.gameManagement.hidden}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

// 제공사 섹션 컴포넌트
interface ProviderSectionProps {
  provider: GameProvider;
  games: Game[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleProviderStatus: (status: "visible" | "maintenance" | "hidden") => void;
  selectedGameIds: Set<number>;
  onToggleGameSelection: (gameId: number) => void;
  onToggleGameFeatured: (gameId: number) => void;
  onChangeGameStatus: (gameId: number, status: "visible" | "maintenance" | "hidden") => void;
}

function ProviderSection({
  provider,
  games,
  isExpanded,
  onToggleExpand,
  onToggleProviderStatus,
  selectedGameIds,
  onToggleGameSelection,
  onToggleGameFeatured,
  onChangeGameStatus,
}: ProviderSectionProps) {
  const { t } = useLanguage();

  const stats = useMemo(() => {
    return {
      total: games.length,
      visible: games.filter(g => g.status === "visible").length,
      maintenance: games.filter(g => g.status === "maintenance").length,
      hidden: games.filter(g => g.status === "hidden").length,
    };
  }, [games]);

  const getProviderStatusIcon = () => {
    if (provider.status === "maintenance") {
      return <AlertTriangle className="w-4 h-4 text-orange-400" />;
    } else if (!provider.is_visible || provider.status === "hidden") {
      return <EyeOff className="w-4 h-4 text-slate-400" />;
    } else {
      return <Eye className="w-4 h-4 text-green-400" />;
    }
  };

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/30">
      {/* 제공사 헤더 */}
      <div className="p-4 bg-slate-800/50 flex items-center justify-between hover:bg-slate-800/70 transition-colors">
        <div className="flex items-center gap-3 flex-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            className="p-1 h-auto hover:bg-slate-700"
          >
            {isExpanded ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </Button>

          <Building2 className="w-5 h-5 text-slate-400" />
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{provider.name}</span>
              {getProviderStatusIcon()}
              <Badge variant="outline" className="text-xs">
                {provider.api_type.toUpperCase()}
              </Badge>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              총 {stats.total}개 게임 · 노출 {stats.visible}개 · 점검 {stats.maintenance}개 · 숨김 {stats.hidden}개
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={provider.status}
            onValueChange={(value: "visible" | "maintenance" | "hidden") =>
              onToggleProviderStatus(value)
            }
          >
            <SelectTrigger className="h-8 w-28 text-xs bg-slate-900 border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visible">
                <div className="flex items-center gap-1 text-xs">
                  <Eye className="w-3 h-3" />
                  {t.gameManagement.visible}
                </div>
              </SelectItem>
              <SelectItem value="maintenance">
                <div className="flex items-center gap-1 text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  {t.gameManagement.maintenance}
                </div>
              </SelectItem>
              <SelectItem value="hidden">
                <div className="flex items-center gap-1 text-xs">
                  <EyeOff className="w-3 h-3" />
                  {t.gameManagement.hidden}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 게임 그리드 */}
      {isExpanded && (
        <div className="p-4">
          {games.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              게임이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {games.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isSelected={selectedGameIds.has(game.id)}
                  onToggleSelection={() => onToggleGameSelection(game.id)}
                  onToggleFeatured={() => onToggleGameFeatured(game.id)}
                  onChangeStatus={(status) => onChangeGameStatus(game.id, status)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EnhancedGameManagement({ user }: EnhancedGameManagementProps) {
  const { t } = useLanguage();
  const { fetchBalances } = useBalance();

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  
  const [selectedApi, setSelectedApi] = useState<ApiType | null>(null);
  const [selectedGameType, setSelectedGameType] = useState<GameType>("casino");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGameIds, setSelectedGameIds] = useState<Set<number>>(new Set());
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<number>>(new Set());

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // API 메타데이터
  const apiMetadata = {
    invest: { label: "Invest API", color: "from-purple-600 to-pink-600" },
    oroplay: { label: "OroPlay API", color: "from-green-600 to-teal-600" },
    familyapi: { label: "Family API", color: "from-blue-600 to-cyan-600" },
    honorapi: { label: "Honor API", color: "from-red-600 to-rose-600" },
  };

  // providers에서 실제 활성화된 API만 추출
  const availableApis = useMemo(() => {
    // Lv2 권한자의 경우 selected_apis 필터링 적용
    let filteredProviders = providers;
    
    if (user.level === 2 && user.selected_apis && Array.isArray(user.selected_apis) && user.selected_apis.length > 0) {
      // selected_apis에 포함된 API만 필터링
      filteredProviders = providers.filter(p => 
        user.selected_apis.includes(p.api_type as string)
      );
    }
    
    const uniqueApiTypes = [...new Set(filteredProviders.map(p => p.api_type))];
    return uniqueApiTypes.map(apiType => ({
      value: apiType,
      label: apiMetadata[apiType]?.label || apiType.toUpperCase(),
      color: apiMetadata[apiType]?.color || "from-blue-600 to-cyan-600",
    }));
  }, [providers, user.level, user.selected_apis]);

  // API별 사용 가능한 게임 타입
  const getAvailableGameTypes = (api: ApiType) => {
    const allTypes = [
      { value: "casino" as GameType, label: "카지노", icon: Gamepad2 },
      { value: "slot" as GameType, label: "슬롯", icon: Gamepad2 },
      { value: "minigame" as GameType, label: "미니게임", icon: Gamepad2 },
    ];
    
    // Invest API와 FamilyAPI는 미니게임 제외 (OroPlay만 미니게임 지원)
    if (api === "invest" || api === "familyapi") {
      return allTypes.filter(type => type.value !== "minigame");
    }
    
    return allTypes;
  };

  const availableGameTypes = getAvailableGameTypes(selectedApi as ApiType);

  // API 변경 시 게임 타입 초기화
  useEffect(() => {
    const types = getAvailableGameTypes(selectedApi as ApiType);
    // 현재 선택된 타입이 사용 불가능하면 첫 번째 타입으로 변경
    if (!types.find(t => t.value === selectedGameType)) {
      setSelectedGameType(types[0].value);
    }
  }, [selectedApi]);

  // 초기 API 선택 (providers 로드 후)
  useEffect(() => {
    if (availableApis.length > 0 && !selectedApi) {
      const firstApi = availableApis[0].value;
      setSelectedApi(firstApi);
    }
  }, [availableApis]);

  // 현재 API의 제공사 필터링 - 선택한 게임 타입의 게임이 있는 제공사만 표시
  const currentProviders = useMemo(() => {
    // 1. 선택한 API의 모든 제공사
    const apiProviders = providers.filter(p => p.api_type === selectedApi);
    
    // 2. 선택한 게임 타입의 게임을 보유한 제공사만 필터링
    const filteredProviders = apiProviders.filter(provider => {
      const hasGamesOfType = games.some(game => 
        game.provider_id === provider.id &&
        game.api_type === selectedApi &&
        game.type === selectedGameType
      );
      
      return hasGamesOfType;
    });
    
    return filteredProviders;
  }, [providers, selectedApi, selectedGameType, games]);

  // 제공사별 게임 그룹화
  const providerGamesMap = useMemo(() => {
    const map = new Map<number, Game[]>();
    
    currentProviders.forEach(provider => {
      const providerGames = games.filter(game => {
        const matchesProvider = game.provider_id === provider.id;
        const matchesApi = game.api_type === selectedApi;
        const matchesType = game.type === selectedGameType;
        const matchesSearch = debouncedSearchTerm === "" || 
          game.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
        
        return matchesProvider && matchesApi && matchesType && matchesSearch;
      });
      
      // 게임이 있는 제공사만 맵에 추가
      if (providerGames.length > 0) {
        map.set(provider.id, providerGames);
      }
    });
    
    return map;
  }, [games, currentProviders, selectedApi, selectedGameType, debouncedSearchTerm]);

  // 통계 계산
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
    if (selectedApi && providers.length > 0) {
      loadGames();
    }
  }, [selectedApi, providers.length]);

  const initializeData = async () => {
    try {
      setLoading(true);

      const providersData = await gameApi.getProviders({ partner_id: user.id });
      setProviders(providersData);

      // 첫 번째 API 선택
      const uniqueApiTypes = [...new Set(providersData.map(p => p.api_type))];
      if (uniqueApiTypes.length > 0 && !selectedApi) {
        const firstApi = uniqueApiTypes[0];
        setSelectedApi(firstApi);
        
        // API 선택 후 게임 로드
        setTimeout(async () => {
          await loadGamesForApi(firstApi);
        }, 100);
      }
    } catch (error) {
      console.error("❌ 초기 데이터 로드 실패:", error);
      toast.error(t.transactionManagement.loadDataFailed);
    } finally {
      setLoading(false);
    }
  };

  const loadGamesForApi = async (apiType: string) => {
    try {
      const data = await gameApi.getGames({
        api_type: apiType,
      });

      setGames(data);
    } catch (error) {
      console.error(`❌ ${apiType} 게임 데이터 로드 실패:`, error);
      toast.error(t.gameManagement.loadGamesFailed);
    }
  };

  const loadGames = async () => {
    if (!selectedApi) {
      setGames([]);
      return;
    }

    setLoading(true);
    await loadGamesForApi(selectedApi);
    setLoading(false);
  };

  const handleInitializeProviders = async () => {
    try {
      setSyncing(true);
      toast.info(t.gameManagement.initializingProviders);

      await gameApi.syncAllProviders();

      toast.success(t.gameManagement.providerInitialized);

      const providersData = await gameApi.getProviders({ partner_id: user.id });
      setProviders(providersData);
    } catch (error) {
      console.error("❌ 공사 초기화 실패:", error);
      toast.error(t.gameManagement.providerInitializeFailed);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncGames = async () => {
    if (syncing) {
      toast.warning(t.gameManagement.syncAlreadyInProgress);
      return;
    }

    if (!selectedApi) {
      toast.warning("API를 선택해주세요.");
      return;
    }

    setSyncing(true);

    try {
      toast.info(`${selectedApi.toUpperCase()} 동기화 중...`);

      let result;
      
      if (selectedApi === "invest") {
        result = await gameApi.syncAllInvestGames();
        const totalAdded = result.results.reduce((sum: number, r: any) => sum + r.newGames, 0);
        const totalUpdated = result.results.reduce((sum: number, r: any) => sum + r.updatedGames, 0);
        toast.success(`Invest 동기화 완료: 신규 ${totalAdded}개, 업데이트 ${totalUpdated}개`);
      } else if (selectedApi === "oroplay") {
        result = await gameApi.syncOroPlayGames();
        toast.success(`OroPlay 동기화 완료: 신규 ${result.newGames}개, 업데이트 ${result.updatedGames}개`);
        
        await gameApi.syncOroPlayProviders();
        const providersData = await gameApi.getProviders({ partner_id: user.id });
        setProviders(providersData);
      } else if (selectedApi === "familyapi") {
        result = await gameApi.syncFamilyApiGames();
        toast.success(`FamilyAPI 동기화 완료: 신규 ${result.newGames}개, 업데이트 ${result.updatedGames}개`);
      } else if (selectedApi === "honorapi") {
        result = await gameApi.syncHonorApiGames();
        toast.success(`HonorAPI 동기화 완료: 신규 ${result.newGames}개, 업데이트 ${result.updatedGames}개`);
      }

      await loadGames();
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

      await gameApi.updateGameFeatured(gameId, !game.is_featured);
      
      setGames(prev =>
        prev.map(g => g.id === gameId ? { ...g, is_featured: !g.is_featured } : g)
      );

      toast.success(
        game.is_featured
          ? t.gameManagement.featuredRemoved
          : t.gameManagement.featuredSet
      );
    } catch (error) {
      console.error("❌ 추천 설정 실패:", error);
      toast.error(t.gameManagement.updateFailed);
    }
  };

  const handleChangeGameStatus = async (
    gameId: number,
    status: "visible" | "maintenance" | "hidden"
  ) => {
    try {
      await gameApi.updateGameStatus(gameId, status);
      
      setGames(prev =>
        prev.map(g => g.id === gameId ? { ...g, status } : g)
      );

      toast.success(t.gameManagement.statusUpdated);
    } catch (error) {
      console.error("❌ 상태 업데이트 실패:", error);
      toast.error(t.gameManagement.updateFailed);
    }
  };

  const handleToggleProviderStatus = async (
    providerId: number,
    status: "visible" | "maintenance" | "hidden"
  ) => {
    try {
      // updateProviderStatus 함수가 제공사와 하위 게임을 모두 일괄 업데이트하므로
      // 개별 게임 업데이트 호출 불필요 (중복 호출 방지)
      await gameApi.updateProviderStatus(providerId, status);
      
      setProviders(prev =>
        prev.map(p => p.id === providerId ? { ...p, status } : p)
      );

      // 로컬 상태만 업데이트 (DB는 이미 updateProviderStatus에서 일괄 처리됨)
      setGames(prev =>
        prev.map(g => g.provider_id === providerId ? { ...g, status } : g)
      );

      toast.success(`제공사 및 하위 게임 상태가 변경되었습니다.`);
    } catch (error) {
      console.error("❌ 제공사 상태 업데이트 실패:", error);
      toast.error(t.gameManagement.updateFailed);
    }
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

  const handleBulkStatusChange = async (status: "visible" | "maintenance" | "hidden") => {
    if (selectedGameIds.size === 0) {
      toast.warning("게임을 선택해주세요.");
      return;
    }

    try {
      await gameApi.bulkUpdateStatus(Array.from(selectedGameIds), status);
      
      setGames(prev =>
        prev.map(g => selectedGameIds.has(g.id) ? { ...g, status } : g)
      );

      toast.success(`${selectedGameIds.size}개 게임 상태가 변경되었습니다.`);
      setSelectedGameIds(new Set());
    } catch (error) {
      console.error("❌ 일괄 상태 업데이트 실패:", error);
      toast.error(t.gameManagement.updateFailed);
    }
  };

  const handleExpandAll = () => {
    setExpandedProviderIds(new Set(currentProviders.map(p => p.id)));
  };

  const handleCollapseAll = () => {
    setExpandedProviderIds(new Set());
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl">{t.gameManagement.title}</h1>
          <p className="text-sm text-slate-400">
            {t.gameManagement.subtitle}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {user.level === 1 && (
            <>
              <Button
                onClick={handleInitializeProviders}
                disabled={syncing || loading}
                variant="outline"
                className="border-slate-600 hover:bg-slate-700"
              >
                <Settings className="w-4 h-4 mr-2" />
                {t.gameManagement.initializeProviders}
              </Button>
              <Button
                onClick={handleSyncGames}
                disabled={syncing || loading || !selectedApi}
                className={`bg-gradient-to-r ${availableApis.find(a => a.value === selectedApi)?.color || 'from-blue-600 to-cyan-600'} hover:opacity-90 text-white`}
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    {t.gameManagement.syncInProgress}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    {selectedApi ? selectedApi.toUpperCase() : 'API'} {t.gameManagement.syncGames}
                  </>
                )}
              </Button>
            </>
          )}
          <Button
            onClick={() => loadGames()}
            disabled={loading}
            variant="outline"
            className="border-slate-600 hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title={t.gameManagement.totalGamesLabel}
          value={stats.total}
          subtitle={t.gameManagement.managementTarget}
          icon={Gamepad2}
          color="purple"
        />
        
        <MetricCard
          title={t.gameManagement.userVisible}
          value={stats.visible}
          subtitle={t.gameManagement.displayedOnScreen}
          icon={Eye}
          color="green"
        />
        
        <MetricCard
          title={t.gameManagement.maintenanceLabel}
          value={stats.maintenance}
          subtitle={t.gameManagement.serviceInterrupted}
          icon={AlertTriangle}
          color="amber"
        />
        
        <MetricCard
          title={t.gameManagement.userHidden}
          value={stats.hidden}
          subtitle={t.gameManagement.hiddenFromScreen}
          icon={EyeOff}
          color="blue"
        />
        
        <MetricCard
          title={t.gameManagement.featuredGames}
          value={stats.featured}
          subtitle={t.gameManagement.priorityDisplay}
          icon={Star}
          color="gold"
        />
      </div>

      {/* 메인 컨텐츠 */}
      <Card className="bg-slate-800/30 border-slate-700">
        <CardContent className="p-6">
          {/* 필터 영역 */}
          <div className="mb-6 bg-slate-900/30 border border-slate-700/50 rounded-lg p-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* API 제공사 선택 */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                  <span className="text-sm font-medium text-slate-300">API 제공사</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableApis.map(api => (
                    <button
                      key={api.value}
                      onClick={() => setSelectedApi(api.value)}
                      className={`
                        px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                        ${selectedApi === api.value
                          ? `bg-gradient-to-r ${api.color} text-white shadow-lg shadow-purple-500/30 scale-105`
                          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300 border border-slate-700/50'
                        }
                      `}
                    >
                      {api.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 구분선 */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="w-px h-full bg-gradient-to-b from-transparent via-slate-600 to-transparent"></div>
              </div>

              {/* 게임 타입 선택 */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full"></div>
                  <span className="text-sm font-medium text-slate-300">게임 타입</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableGameTypes.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setSelectedGameType(type.value)}
                      className={`
                        px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                        ${selectedGameType === type.value
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/30 scale-105'
                          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300 border border-slate-700/50'
                        }
                      `}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 구분선 */}
            <div className="my-4 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>

            {/* 검색 및 액션 영역 */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[250px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type="text"
                  placeholder={t.gameManagement.searchGames}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-800/50 border-slate-700/50 focus:border-blue-500/50 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExpandAll}
                  className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600 text-slate-300"
                >
                  <ChevronDown className="w-3 h-3 mr-1" />
                  전체 펼치기
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCollapseAll}
                  className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600 text-slate-300"
                >
                  <ChevronRight className="w-3 h-3 mr-1" />
                  전체 접기
                </Button>
              </div>

              {selectedGameIds.size > 0 && (
                <>
                  <div className="w-px h-6 bg-slate-700/50"></div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400 font-medium">
                      {selectedGameIds.size}개 선택됨
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkStatusChange("visible")}
                      className="bg-emerald-900/20 border-emerald-600/50 text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-500"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      일괄 노출
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkStatusChange("hidden")}
                      className="bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700/50 hover:border-slate-600"
                    >
                      <EyeOff className="w-3 h-3 mr-1" />
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
              currentProviders.map(provider => (
                <ProviderSection
                  key={provider.id}
                  provider={provider}
                  games={providerGamesMap.get(provider.id) || []}
                  isExpanded={expandedProviderIds.has(provider.id)}
                  onToggleExpand={() => handleToggleExpand(provider.id)}
                  onToggleProviderStatus={(status) => handleToggleProviderStatus(provider.id, status)}
                  selectedGameIds={selectedGameIds}
                  onToggleGameSelection={handleToggleGameSelection}
                  onToggleGameFeatured={handleToggleGameFeatured}
                  onChangeGameStatus={handleChangeGameStatus}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}