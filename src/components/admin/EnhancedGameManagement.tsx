import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { ScrollArea } from "../ui/scroll-area";
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
  Store,
  User as UserIcon,
  List,
} from "lucide-react";
import { Partner, User } from "../../types";
import { gameApi, Game, GameProvider } from "../../lib/gameApi";
import { useBalance } from "../../contexts/BalanceContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { supabase } from "../../lib/supabase";

interface EnhancedGameManagementProps {
  user: Partner;
}

type ApiType = "invest" | "oroplay" | "familyapi" | "honorapi";
type GameType = "all" | "casino" | "slot" | "minigame";
type TabType = "games" | "stores" | "users";

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
      return <AlertTriangle className="w-4 h-4 text-orange-400" />;
    } else if (!game.is_visible || game.status === "hidden") {
      return <EyeOff className="w-4 h-4 text-slate-400" />;
    } else {
      return <Eye className="w-4 h-4 text-green-400" />;
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
      <div className="absolute top-2 left-2 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          className="bg-slate-900/90 border-slate-600 h-5 w-5"
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
  onToggleProviderStatus: (status: "visible" | "maintenance" | "hidden", apiType: "invest" | "oroplay" | "familyapi" | "honorapi") => void;
  selectedGameIds: Set<number>;
  onToggleGameSelection: (gameId: number) => void;
  onToggleGameFeatured: (gameId: number) => void;
  onChangeGameStatus: (gameId: number, status: "visible" | "maintenance" | "hidden", apiType: "invest" | "oroplay" | "familyapi" | "honorapi") => void;
  userLevel: number;
  isBlocked?: boolean; // Lv2+에서 partner_game_access에 의해 차단된 제공사인지 여부
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
  userLevel,
  isBlocked = false,
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
    // Lv2~Lv7: partner_game_access 차단 상태 확인 (블랙리스트 방식)
    if (isBlocked) {
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
              <ChevronDown className="w-6 h-6 text-white" />
            ) : (
              <ChevronRight className="w-6 h-6 text-white" />
            )}
          </Button>

          <Building2 className="w-6 h-6 text-slate-300" />
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{provider.name}</span>
              {getProviderStatusIcon()}
              <Badge variant="outline" className="text-sm font-semibold border-slate-600">
                {provider.api_type.toUpperCase()}
              </Badge>
            </div>
            <div className="text-sm text-slate-300 mt-1 font-medium">
              총 {stats.total}개 게임 · 노출 {stats.visible}개 · 점검 {stats.maintenance}개 · 숨김 {stats.hidden}개
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={isBlocked ? "hidden" : "visible"}
            onValueChange={(value: "visible" | "maintenance" | "hidden") =>
              onToggleProviderStatus(value, provider.api_type)
            }
          >
            <SelectTrigger className="h-9 w-32 text-sm font-semibold bg-slate-900 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visible">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Eye className="w-4 h-4" />
                  {t.gameManagement.visible}
                </div>
              </SelectItem>
              {/* Lv2~Lv7: 노출/숨김만 사용 (점검중 없음) */}
              <SelectItem value="hidden">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <EyeOff className="w-4 h-4" />
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
            <div className="text-center py-8 text-base font-medium text-slate-300">
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
                  onChangeStatus={(status) => onChangeGameStatus(game.id, status, game.api_type)}
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

  // 탭 상태
  const [activeTab, setActiveTab] = useState<TabType>("games");

  // Lv2+ 파트너의 차단된 제공사 목록 (partner_game_access)
  const [blockedProviderIds, setBlockedProviderIds] = useState<Set<number>>(new Set());

  // 매장별 게임 설정 상태
  const [stores, setStores] = useState<Partner[]>([]);
  const [selectedStore, setSelectedStore] = useState<Partner | null>(null);
  const [storeBlockedGames, setStoreBlockedGames] = useState<number[]>([]); // 차단된 게임 목록 (레코드 있음 = 차단)
  const [storeBlockedProviders, setStoreBlockedProviders] = useState<number[]>([]); // 차단된 제공사 목록
  const [loadingStores, setLoadingStores] = useState(false);
  const [storeSelectedApis, setStoreSelectedApis] = useState<ApiType[]>([]); // Lv2의 selected_apis

  // 사용자별 게임 설정 상태
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userBlockedGames, setUserBlockedGames] = useState<number[]>([]); // 차단된 게임 목록 (레코드 있음 = 차단)
  const [userBlockedProviders, setUserBlockedProviders] = useState<number[]>([]); // 차단된 제공사 목록
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedUserSearchTerm = useDebounce(userSearchTerm, 300);

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
    // ⚠️ 관리자 페이지: 숨김 상태 포함 모든 제공사 표시 (관리 목적)
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

      // ✅ Lv2~Lv7: selected_apis 기반으로 제공사 조회
      const providersData = await gameApi.getProviders({ 
        partner_id: user.id,
      });
      setProviders(providersData);

      // ✅ Lv2~Lv7: partner_game_access에서 차단된 제공사 목록 조회
      console.log(`🔍 [Lv${user.level}] 차단된 제공사 목록 조회 시작...`);
      const blocked = await gameApi.getPartnerBlockedProviders(user.id);
      setBlockedProviderIds(blocked);
      console.log(`📋 [Lv${user.level}] 차단된 제공사: ${blocked.size}개`);

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
      // ✅ 각 API별로 독립적인 제공사 및 게임 동기화
      toast.info(`${selectedApi.toUpperCase()} 제공사 및 게임 동기화 중...`);

      let result;
      
      if (selectedApi === "invest") {
        // ✅ Invest: 제공사 초기화 + 게임 동기화
        await gameApi.initializeInvestProviders();
        result = await gameApi.syncAllInvestGames();
        const totalAdded = result.results.reduce((sum: number, r: any) => sum + r.newGames, 0);
        const totalUpdated = result.results.reduce((sum: number, r: any) => sum + r.updatedGames, 0);
        toast.success(`Invest 동기화 완료: 신규 ${totalAdded}개, 업데이트 ${totalUpdated}개`);
      } else if (selectedApi === "oroplay") {
        // ✅ OroPlay: 제공사 동기화 + 게임 동기화
        await gameApi.syncOroPlayProviders();
        result = await gameApi.syncOroPlayGames();
        toast.success(`OroPlay 동기화 완료: 신규 ${result.newGames}개, 업데이트 ${result.updatedGames}개`);
      } else if (selectedApi === "familyapi") {
        // ✅ FamilyAPI: 제공사 동기화 + 게임 동기화
        await gameApi.syncFamilyApiProviders();
        result = await gameApi.syncFamilyApiGames();
        toast.success(`FamilyAPI 동기화 완료: 신규 ${result.newGames}개, 업데이트 ${result.updatedGames}개`);
      } else if (selectedApi === "honorapi") {
        // ✅ HonorAPI: 제공사 및 게임 통합 동기화
        result = await gameApi.syncHonorApiGames();
        toast.success(`HonorAPI 동기화 완료: 제공사 ${result.newProviders}개, 게임 신규 ${result.newGames}개`);
      }

      // ✅ 제공사 및 게임 목록 새로고침
      const providersData = await gameApi.getProviders({ partner_id: user.id });
      setProviders(providersData);
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

      await gameApi.updateGameFeatured(gameId, !game.is_featured, game.api_type);

      toast.success(
        game.is_featured
          ? "추천이 해제되었습니다."
          : "추천 게임으로 설정되었습니다."
      );
      
      // ✅ 데이터 새로고침 추가 (DB에서 최신 상태 가져오기)
      await initializeData();
    } catch (error) {
      console.error("❌ 추천 설정 실패:", error);
      toast.error("추천 설정 변경에 실패했습니다.");
    }
  };

  const handleChangeGameStatus = async (
    gameId: number,
    status: "visible" | "maintenance" | "hidden",
    apiType: "invest" | "oroplay" | "familyapi" | "honorapi"
  ) => {
    console.log(`🎮 handleChangeGameStatus 호출: gameId=${gameId}, status=${status}, apiType=${apiType}`);
    
    try {
      console.log(`🔄 gameApi.updateGameStatus 호출 시작...`);
      await gameApi.updateGameStatus(gameId, status, apiType);
      console.log(`✅ gameApi.updateGameStatus 완료`);

      const statusText = status === "visible" ? "노출" : status === "maintenance" ? "점검중" : "숨김";
      toast.success(`게임 상태가 ${statusText}로 변경되었습니다.`);
      
      // ✅ 데이터 새로고침 추가 (DB에서 최신 상태 가져오기)
      await initializeData();
    } catch (error) {
      console.error("❌ 상태 업데이트 실패:", error);
      toast.error("게임 상태 변경에 실패했습니다.");
    }
  };

  const handleToggleProviderStatus = async (
    providerId: number,
    status: "visible" | "maintenance" | "hidden",
    apiType: "invest" | "oroplay" | "familyapi" | "honorapi"
  ) => {
    console.log(`🏢 handleToggleProviderStatus 호출: providerId=${providerId}, status=${status}, apiType=${apiType}, userLevel=${user.level}`);
    
    try {
      // ✅ Lv2~Lv7: 모두 partner_game_access 테이블 사용 (블랙리스트 방식)
      console.log(`🔄 [Lv${user.level}] gameApi.updatePartnerProviderAccess 호출 시작...`);
      await gameApi.updatePartnerProviderAccess(
        user.id,
        providerId,
        apiType,
        status === "visible"
      );
      console.log(`✅ [Lv${user.level}] gameApi.updatePartnerProviderAccess 완료`);

      const statusText = status === "visible" ? "노출" : "숨김";
      toast.success(`제공사 상태가 ${statusText}로 변경되었습니다.`);
      
      // ✅ 데이터 새로고침 추가 (DB에서 최신 상태 가져오기)
      await initializeData();
    } catch (error) {
      console.error("❌ 제공사 상태 업데이트 실패:", error);
      toast.error("제공사 상태 변경에 실패했습니다.");
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
    console.log(`📦 handleBulkStatusChange 호출: ${selectedGameIds.size}개 게임, status=${status}`);
    
    if (selectedGameIds.size === 0) {
      toast.warning("게임을 선택해주세요.");
      return;
    }

    try {
      console.log(`🔄 gameApi.bulkUpdateStatus 호출 시작...`);
      await gameApi.bulkUpdateStatus(Array.from(selectedGameIds), status);
      console.log(`✅ gameApi.bulkUpdateStatus 완료`);

      const statusText = status === "visible" ? "노출" : status === "maintenance" ? "점검중" : "숨김";
      toast.success(`${selectedGameIds.size}개 게임 상태가 ${statusText}로 변경되었습니다.`);
      setSelectedGameIds(new Set());
      
      // ✅ 데이터 새로고침 추가 (DB에서 최신 상태 가져오기)
      await initializeData();
    } catch (error) {
      console.error("❌ 일괄 상태 업데이트 실패:", error);
      toast.error("일괄 상태 변경에 실패했습니다.");
    }
  };

  const handleExpandAll = () => {
    setExpandedProviderIds(new Set(currentProviders.map(p => p.id)));
  };

  const handleCollapseAll = () => {
    setExpandedProviderIds(new Set());
  };

  const handleBulkApiStatusChange = async (status: "visible" | "hidden") => {
    if (!selectedApi) {
      toast.warning("API를 선택해주세요.");
      return;
    }

    try {
      // 선택된 API의 모든 제공사 ID 추출
      const apiProviders = providers.filter(p => p.api_type === selectedApi);
      const providerIds = apiProviders.map(p => p.id);

      if (providerIds.length === 0) {
        toast.warning("제공사가 없습니다.");
        return;
      }

      console.log(`📦 handleBulkApiStatusChange: userLevel=${user.level}, api=${selectedApi}, providerIds=${providerIds.length}개, status=${status}`);

      // ✅ Lv2~Lv7: 모두 partner_game_access 테이블 사용 (블랙리스트 방식)
      console.log(`🔄 [Lv${user.level}] gameApi.updatePartnerApiAccess 호출...`);
      await gameApi.updatePartnerApiAccess(
        user.id,
        selectedApi as "invest" | "oroplay" | "familyapi" | "honorapi",
        providerIds,
        status === "visible"
      );
      console.log(`✅ [Lv${user.level}] gameApi.updatePartnerApiAccess 완료`);

      const statusText = status === "visible" ? "노출" : "숨김";
      toast.success(`${selectedApi.toUpperCase()} API의 모든 제공사가 ${statusText} 처리되었습니다.`);
      
      // ✅ 데이터 새로고침 추가 (DB에서 최신 상태 가져오기)
      await initializeData();
    } catch (error) {
      console.error("❌ API 일괄 상태 업데이트 실패:", error);
      toast.error("일괄 상태 변경에 실패했습니다.");
    }
  };

  // 매장별 게임 설정 함수들
  useEffect(() => {
    if (activeTab === "stores") {
      loadStores();
      // 매장별 탭에서도 게임 데이터 필요
      if (providers.length === 0) {
        initializeData();
      }
    }
    if (activeTab === "users") {
      loadStores(); // 사용자별 탭에서는 매장 목록을 먼저 로드
      // 사용자별 탭에서도 게임 데이터 필요
      if (providers.length === 0) {
        initializeData();
      }
    }
  }, [activeTab]);

  const loadStores = async () => {
    try {
      setLoadingStores(true);
      console.log("🔍 매장 목록 로드 시작, 현재 사용자:", user);
      
      // 모든 매장 조회
      const { data: allStores, error } = await supabase
        .from("partners")
        .select("*")
        .eq("level", 6)
        .order("username");

      if (error) {
        console.error("❌ 매장 조회 에러:", error);
        throw error;
      }
      
      console.log("📊 전체 매장 수:", allStores?.length || 0);
      
      // Lv1이면 모든 매장 표시
      if (user.level === 1) {
        console.log("✅ Lv1 사용자 - 모든 매장 표시");
        setStores(allStores || []);
        return;
      }
      
      // 현재 사용자의 하위 조직에 속한 매장만 필터링
      const filteredStores = [];
      
      for (const store of allStores || []) {
        console.log(`🔎 매장 확인: ${store.username} (ID: ${store.id}, parent_id: ${store.parent_id})`);
        
        // 매장의 상위 조직을 따라가며 현재 사용자가 포함되어 있는지 확인
        let currentPartnerId = store.parent_id;
        let isUnderCurrentUser = false;
        let depth = 0;
        const maxDepth = 10; // 무한 루프 방지
        
        while (currentPartnerId && depth < maxDepth) {
          console.log(`  ↑ 상위 체크 (depth ${depth}): ${currentPartnerId}`);
          
          if (currentPartnerId === user.id) {
            console.log(`  ✅ 현재 사용자 발견!`);
            isUnderCurrentUser = true;
            break;
          }
          
          const { data: parent, error: parentError } = await supabase
            .from("partners")
            .select("parent_id")
            .eq("id", currentPartnerId)
            .single();
          
          if (parentError || !parent) {
            console.log(`  ⚠️ 상위 파트너 조회 실패 또는 없음`);
            break;
          }
          
          currentPartnerId = parent?.parent_id;
          depth++;
        }
        
        if (isUnderCurrentUser) {
          console.log(`  ➕ 매장 추가: ${store.username}`);
          filteredStores.push(store);
        } else {
          console.log(`  ➖ 매장 제외: ${store.username}`);
        }
      }
      
      console.log("✅ 최종 매장 목록:", filteredStores.length, "개");
      setStores(filteredStores);
    } catch (error) {
      console.error("❌ 매장 목록 로드 실패:", error);
      toast.error("매장 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoadingStores(false);
    }
  };

  const loadStoreGameAccess = async (storeId: string) => {
    try {
      // partner_game_access에서 해당 매장의 차단된 제공사 및 게임 조회
      // 로직 반전: 레코드 있음 = 차단, 레코드 없음 = 허용(기본)
      const { data, error } = await supabase
        .from("partner_game_access")
        .select("game_id, game_provider_id, access_type")
        .eq("partner_id", storeId)
        .is("user_id", null); // 매장 전체 설정 (사용자별 아님)

      if (error) throw error;

      // 1. 제공사 차단 확인 (access_type: 'provider')
      const blockedProviderIds = (data || [])
        .filter(access => access.access_type === 'provider' && access.game_provider_id)
        .map(access => parseInt(access.game_provider_id))
        .filter(id => !isNaN(id));

      // 2. 개별 게임 차단 확인 (access_type: 'game')
      const blockedGameIds = (data || [])
        .filter(access => access.access_type === 'game' && access.game_id)
        .map(access => parseInt(access.game_id))
        .filter(id => !isNaN(id));

      // 3. 차단된 제공사의 모든 게임도 차단 목록에 추가
      const providerGames = games.filter(g => blockedProviderIds.includes(g.provider_id));
      const providerBlockedGameIds = providerGames.map(g => g.id);

      // 최종 차단 목록 = 개별 게임 + 제공사 전체 게임
      const allBlockedGameIds = [...new Set([...blockedGameIds, ...providerBlockedGameIds])];

      console.log("✅ 매장 차단 설정 로드:");
      console.log("  - 차단된 제공사:", blockedProviderIds.length, "개", blockedProviderIds);
      console.log("  - 차단된 개별 게임:", blockedGameIds.length, "개");
      console.log("  - 제공사로 인한 차단 게임:", providerBlockedGameIds.length, "개");
      console.log("  - 총 차단 게임:", allBlockedGameIds.length, "개");
      
      setStoreBlockedProviders(blockedProviderIds);
      setStoreBlockedGames(allBlockedGameIds);
    } catch (error) {
      console.error("❌ 매장 차단 게임 로드 실패:", error);
      toast.error("게임 설정을 불러오는데 실패했습니다.");
    }
  };

  const handleStoreSelect = async (store: Partner) => {
    console.log("🏪 매장 선택:", store);
    setSelectedStore(store);
    
    // 사용자별 게임 탭에서 호출된 경우 매장의 사용자 로드
    if (activeTab === "users") {
      setSelectedUser(null); // 사용자 선택 초기화
      await loadUsersForStore(store.id);
      return; // 사용자별 탭에서는 여기서 종료
    }
    
    // 매장의 상위 Lv2 찾기 및 selected_apis 로드
    try {
      let currentPartnerId = store.parent_id;
      let lv2Partner = null;
      
      // 상위로 올라가면서 Lv2 찾기
      while (currentPartnerId) {
        const { data: partner } = await supabase
          .from("partners")
          .select("*")
          .eq("id", currentPartnerId)
          .single();
        
        if (partner && partner.level === 2) {
          lv2Partner = partner;
          break;
        }
        
        currentPartnerId = partner?.parent_id;
      }
      
      console.log("🔍 Lv2 파트너:", lv2Partner);
      
      // Lv2의 selected_apis 설정
      if (lv2Partner && lv2Partner.selected_apis && Array.isArray(lv2Partner.selected_apis)) {
        setStoreSelectedApis(lv2Partner.selected_apis);
        console.log("📋 선택된 APIs:", lv2Partner.selected_apis);
        
        // 첫 번째 API 자동 선택 및 게임 로드
        if (lv2Partner.selected_apis.length > 0) {
          const firstApi = lv2Partner.selected_apis[0];
          setSelectedApi(firstApi);
          console.log("🎮 API 선택:", firstApi);
          
          // 해당 API의 게임이 없으면 로드
          const apiGames = games.filter(g => g.api_type === firstApi);
          console.log(`📊 ${firstApi} 게임 수:`, apiGames.length);
          
          if (apiGames.length === 0) {
            console.log("⬇️ 게임 로드 중...");
            await loadGamesForApi(firstApi);
          }
        } else {
          setSelectedApi(null);
        }
      } else {
        // selected_apis가 없으면 전체 API 사용
        setStoreSelectedApis([]);
        const firstApi = availableApis.length > 0 ? availableApis[0].value : null;
        setSelectedApi(firstApi);
        console.log("🎮 기본 API 선택:", firstApi);
        
        // 게임 로드
        if (firstApi) {
          const apiGames = games.filter(g => g.api_type === firstApi);
          console.log(`📊 ${firstApi} 게임 수:`, apiGames.length);
          
          if (apiGames.length === 0) {
            console.log("⬇️ 게임 로드 중...");
            await loadGamesForApi(firstApi);
          }
        }
      }
    } catch (error) {
      console.error("❌ Lv2 조회 실패:", error);
      setStoreSelectedApis([]);
    }
    
    await loadStoreGameAccess(store.id);
  };

  const handleToggleStoreGame = async (gameId: number) => {
    if (!selectedStore) return;

    // 로직 반전: 레코드 없음 = 허용(기본), 레코드 있음 = 차단
    const isCurrentlyBlocked = storeBlockedGames.includes(gameId);
    const newBlockedStatus = !isCurrentlyBlocked;
    const game = games.find(g => g.id === gameId);
    if (!game) return;

    try {
      if (newBlockedStatus) {
        // 게임 차단: 레코드 생성
        const { error } = await supabase
          .from("partner_game_access")
          .insert({
            partner_id: selectedStore.id,
            api_provider: game.api_type,
            game_id: String(gameId),
            access_type: "game",
          });

        if (error) throw error;
      } else {
        // 게임 허용: 레코드 삭제
        const { error } = await supabase
          .from("partner_game_access")
          .delete()
          .eq("partner_id", selectedStore.id)
          .is("user_id", null)
          .eq("game_id", String(gameId))
          .eq("access_type", "game");

        if (error) throw error;
      }

      // 로컬 상태 업데이트
      setStoreBlockedGames(prev =>
        newBlockedStatus
          ? [...prev, gameId]
          : prev.filter(id => id !== gameId)
      );

      toast.success(newBlockedStatus ? "게임을 차단했습니다." : "게임 차단을 해제했습니다.");
    } catch (error) {
      console.error("❌ 게임 접근 권한 업데이트 실패:", error);
      toast.error("게임 접근 권한 업데이트에 실패했습니다.");
    }
  };

  const handleBulkStoreGameAccess = async (allow: boolean) => {
    if (!selectedStore || !selectedApi) {
      toast.warning("매장과 API를 선택해주세요.");
      return;
    }

    try {
      // 현재 필터된 게임 목록 (API + 게임타입)
      const filteredGames = games.filter(g =>
        g.api_type === selectedApi && g.type === selectedGameType
      );

      if (filteredGames.length === 0) {
        toast.warning("게임이 없습니다.");
        return;
      }

      if (allow) {
        // 게임 접근 허용: 레코드 생성
        const accessRecords = filteredGames.map(game => ({
          partner_id: selectedStore.id,
          api_provider: game.api_type,
          game_id: String(game.id),
          access_type: "game",
        }));

        const { error } = await supabase
          .from("partner_game_access")
          .insert(accessRecords);

        if (error) throw error;
      } else {
        // 게임 접근 차단: 레코드 삭제
        const gameIdsToRemove = filteredGames.map(g => String(g.id));
        const { error } = await supabase
          .from("partner_game_access")
          .delete()
          .eq("partner_id", selectedStore.id)
          .in("game_id", gameIdsToRemove)
          .eq("access_type", "game");

        if (error) throw error;
      }

      // 로컬 상태 업데이트
      if (allow) {
        const newGameIds = filteredGames.map(g => g.id);
        setStoreGames(prev => [...new Set([...prev, ...newGameIds])]);
      } else {
        const gameIdsToRemove = new Set(filteredGames.map(g => g.id));
        setStoreGames(prev => prev.filter(id => !gameIdsToRemove.has(id)));
      }

      toast.success(
        allow
          ? `${filteredGames.length}개 게임 접근이 허용되었습니다.`
          : `${filteredGames.length}개 게임 접근이 차단되었습니다.`
      );
    } catch (error) {
      console.error("❌ 일괄 게임 접근 권한 업데이트 실패:", error);
      toast.error("일괄 업데이트에 실패했습니다.");
    }
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      console.log("🔍 사용자 목록 로드 시작, 현재 사용자:", user);
      
      // 사용자별 게임 탭에서는 일단 비워둠 (매장 선택 후 로드)
      setUsers([]);
    } catch (error) {
      console.error("❌ 사용자 목록 로드 실패:", error);
      toast.error("사용자 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadUsersForStore = async (storeId: string) => {
    try {
      setLoadingUsers(true);
      console.log("🔍 매장의 사용자 목록 로드 시작, 매장 ID:", storeId);
      
      // users 테이블에서 referrer_id가 선택된 매장인 사용자 조회
      const { data: storeUsers, error } = await supabase
        .from("users")
        .select("*")
        .eq("referrer_id", storeId)
        .order("username");

      if (error) {
        console.error("❌ 사용자 조회 에러:", error);
        throw error;
      }
      
      console.log("✅ 매장의 사용자 목록:", storeUsers?.length || 0, "개");
      console.log("📋 사용자 데이터:", storeUsers);
      setUsers(storeUsers || []);
    } catch (error) {
      console.error("❌ 사용자 목록 로드 실패:", error);
      toast.error("사용자 목록을 불러오는데 실패했습니다.");
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadUserGameAccess = async (userId: string) => {
    try {
      if (!selectedStore) return;
      
      // partner_game_access에서 해당 사용자의 차단된 제공사 및 게임 조회
      // 로직 반전: 레코드 있음 = 차단, 레코드 없음 = 허용(기본)
      const { data, error } = await supabase
        .from("partner_game_access")
        .select("game_id, game_provider_id, access_type")
        .eq("partner_id", selectedStore.id)
        .eq("user_id", userId);

      if (error) throw error;

      // 1. 제공사 차단 확인 (access_type: 'provider')
      const blockedProviderIds = (data || [])
        .filter(access => access.access_type === 'provider' && access.game_provider_id)
        .map(access => parseInt(access.game_provider_id))
        .filter(id => !isNaN(id));

      // 2. 개별 게임 차단 확인 (access_type: 'game')
      const blockedGameIds = (data || [])
        .filter(access => access.access_type === 'game' && access.game_id)
        .map(access => parseInt(access.game_id))
        .filter(id => !isNaN(id));

      // 3. 차단된 제공사의 모든 게임도 차단 목록에 추가
      const providerGames = games.filter(g => blockedProviderIds.includes(g.provider_id));
      const providerBlockedGameIds = providerGames.map(g => g.id);

      // 최종 차단 목록 = 개별 게임 + 제공사 전체 게임
      const allBlockedGameIds = [...new Set([...blockedGameIds, ...providerBlockedGameIds])];

      console.log("✅ 사용자 차단 설정 로드:");
      console.log("  - 차단된 제공사:", blockedProviderIds.length, "개", blockedProviderIds);
      console.log("  - 차단된 개별 게임:", blockedGameIds.length, "개");
      console.log("  - 제공사로 인한 차단 게임:", providerBlockedGameIds.length, "개");
      console.log("  - 총 차단 게임:", allBlockedGameIds.length, "개");
      
      setUserBlockedProviders(blockedProviderIds);
      setUserBlockedGames(allBlockedGameIds);
    } catch (error) {
      console.error("❌ 사용자 차단 게임 로드 실패:", error);
      toast.error("게임 설정을 불러오는데 실패했습니다.");
    }
  };

  const handleUserSelect = async (selectedUser: User) => {
    console.log("👤 사용자 선택:", selectedUser);
    setSelectedUser(selectedUser);
    
    // 선택된 매장의 게임 로드
    if (selectedStore) {
      await loadStoreGameAccess(selectedStore.id);
      
      // 매장의 상위 Lv2 찾기 및 selected_apis 로드
      try {
        let currentPartnerId = selectedStore.parent_id;
        let lv2Partner = null;
        
        // 상위로 올라가면서 Lv2 찾기
        while (currentPartnerId) {
          const { data: partner } = await supabase
            .from("partners")
            .select("*")
            .eq("id", currentPartnerId)
            .single();
          
          if (partner && partner.level === 2) {
            lv2Partner = partner;
            break;
          }
          
          currentPartnerId = partner?.parent_id;
        }
        
        console.log("🔍 Lv2 파트너:", lv2Partner);
        
        // Lv2의 selected_apis 설정
        if (lv2Partner && lv2Partner.selected_apis && Array.isArray(lv2Partner.selected_apis)) {
          setStoreSelectedApis(lv2Partner.selected_apis);
          console.log("📋 선택된 APIs:", lv2Partner.selected_apis);
          
          // 첫 번째 API 자동 선택 및 게임 로드
          if (lv2Partner.selected_apis.length > 0) {
            const firstApi = lv2Partner.selected_apis[0];
            setSelectedApi(firstApi);
            console.log("🎮 API 선택:", firstApi);
            
            // 해당 API의 게임이 없으면 로드
            const apiGames = games.filter(g => g.api_type === firstApi);
            console.log(`📊 ${firstApi} 게임 수:`, apiGames.length);
            
            if (apiGames.length === 0) {
              console.log("⬇️ 게임 로드 중...");
              await loadGamesForApi(firstApi);
            }
          } else {
            setSelectedApi(null);
          }
        } else {
          // selected_apis가 없으면 전체 API 사용
          setStoreSelectedApis([]);
          const firstApi = availableApis.length > 0 ? availableApis[0].value : null;
          setSelectedApi(firstApi);
          console.log("🎮 기본 API 선택:", firstApi);
          
          // 게임 로드
          if (firstApi) {
            const apiGames = games.filter(g => g.api_type === firstApi);
            console.log(`📊 ${firstApi} 게임 수:`, apiGames.length);
            
            if (apiGames.length === 0) {
              console.log("⬇️ 게임 로드 중...");
              await loadGamesForApi(firstApi);
            }
          }
        }
      } catch (error) {
        console.error("❌ Lv2 조회 실패:", error);
        setStoreSelectedApis([]);
      }
    }
    
    // 사용자의 게임 접근 권한 로드
    await loadUserGameAccess(selectedUser.id);
  };

  const handleToggleUserGame = async (gameId: number) => {
    if (!selectedUser || !selectedStore) return;

    // 로직 반전: 레코드 없음 = 허용(기본), 레코드 있음 = 차단
    const isCurrentlyBlocked = userBlockedGames.includes(gameId);
    const newBlockedStatus = !isCurrentlyBlocked;
    const game = games.find(g => g.id === gameId);
    if (!game) return;

    try {
      if (newBlockedStatus) {
        // 게임 차단: 레코드 생성
        const { error } = await supabase
          .from("partner_game_access")
          .insert({
            partner_id: selectedStore.id,
            user_id: selectedUser.id,
            api_provider: game.api_type,
            game_id: String(gameId),
            access_type: "game",
          });

        if (error) throw error;
      } else {
        // 게임 허용: 레코드 삭제
        const { error } = await supabase
          .from("partner_game_access")
          .delete()
          .eq("partner_id", selectedStore.id)
          .eq("user_id", selectedUser.id)
          .eq("game_id", String(gameId))
          .eq("access_type", "game");

        if (error) throw error;
      }

      // 로컬 상태 업데이트
      setUserBlockedGames(prev =>
        newBlockedStatus
          ? [...prev, gameId]
          : prev.filter(id => id !== gameId)
      );

      toast.success(newAllowedStatus ? "게임 접근이 허용되었습니다." : "게임 접근이 차단되었습니다.");
    } catch (error) {
      console.error("❌ 사용자 게임 접근 권한 업데이트 실패:", error);
      toast.error("게임 접근 권한 업데이트에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <div className="flex items-center gap-2 border-b border-slate-700">
        <Button
          variant="ghost"
          onClick={() => setActiveTab("games")}
          className={`rounded-none border-b-2 transition-colors px-6 py-3 text-base font-bold ${
            activeTab === "games"
              ? "border-purple-500 bg-purple-900/20 text-white"
              : "border-transparent text-white hover:bg-slate-800/50"
          }`}
        >
          <List className="w-4 h-4 mr-2" />
          게임 관리
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveTab("stores")}
          className={`rounded-none border-b-2 transition-colors px-6 py-3 text-base font-bold ${
            activeTab === "stores"
              ? "border-purple-500 bg-purple-900/20 text-white"
              : "border-transparent text-white hover:bg-slate-800/50"
          }`}
        >
          <Store className="w-4 h-4 mr-2" />
          매장별 게임
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveTab("users")}
          className={`rounded-none border-b-2 transition-colors px-6 py-3 text-base font-bold ${
            activeTab === "users"
              ? "border-purple-500 bg-purple-900/20 text-white"
              : "border-transparent text-white hover:bg-slate-800/50"
          }`}
        >
          <UserIcon className="w-4 h-4 mr-2" />
          사용자별 게임
        </Button>
      </div>

      {/* 매장별 게임 탭 */}
      {activeTab === "stores" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 왼쪽: 매장 목록 */}
          <Card className="bg-slate-800/30 border-slate-700 lg:col-span-1">
            <CardContent className="p-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">매장 목록</h3>
                  <p className="text-sm text-slate-400">매장을 선택하세요</p>
                </div>

                {loadingStores ? (
                  <div className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-400">로딩 중...</p>
                  </div>
                ) : stores.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Store className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">매장이 없습니다</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-2">
                      {stores.map((store) => (
                        <button
                          key={store.id}
                          onClick={() => handleStoreSelect(store)}
                          className={`w-full p-3 rounded-lg text-left transition-all ${
                            selectedStore?.id === store.id
                              ? "bg-purple-900/40 border-2 border-purple-500"
                              : "bg-slate-700/30 border border-slate-600 hover:bg-slate-700/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-slate-300" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {store.username}
                              </p>
                              {store.store_name && (
                                <p className="text-xs text-slate-400 truncate">
                                  {store.store_name}
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

          {/* 오른쪽: 게임 설정 */}
          <Card className="bg-slate-800/30 border-slate-700 lg:col-span-3">
            <CardContent className="p-6">
              {!selectedStore ? (
                <div className="text-center py-12 text-slate-400">
                  <Store className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-xl font-semibold text-white mb-2">매장을 선택하세요</p>
                  <p>왼쪽에서 매장을 선택하면 게임 접근 권한을 설정할 수 있습니다.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* API 탭 선택 */}
                  <div className="flex gap-2 border-b border-slate-700">
                    {availableApis
                      .filter(api => 
                        storeSelectedApis.length === 0 || storeSelectedApis.includes(api.value)
                      )
                      .map(api => (
                        <Button
                          key={api.value}
                          variant="ghost"
                          onClick={() => setSelectedApi(api.value)}
                          className={`rounded-none border-b-2 transition-colors px-6 py-3 text-base font-bold ${
                            selectedApi === api.value
                              ? "border-purple-500 bg-purple-900/20 text-white"
                              : "border-transparent text-white hover:bg-slate-800/50"
                          }`}
                        >
                          {api.label}
                        </Button>
                      ))}
                  </div>

                  {!selectedApi ? (
                    <div className="text-center py-12 text-slate-400">
                      <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                      <p className="text-xl font-semibold text-white mb-2">API를 선택하세요</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* 검색 및 필터 */}
                      <div className="flex gap-4">
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            placeholder="게임 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 bg-slate-900/50 border-slate-700 text-white"
                          />
                        </div>
                        <Select
                          value={selectedGameType}
                          onValueChange={(value: GameType) => setSelectedGameType(value)}
                        >
                          <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-700 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">전체</SelectItem>
                            <SelectItem value="casino">카지노</SelectItem>
                            <SelectItem value="slot">슬롯</SelectItem>
                            <SelectItem value="minigame">미니게임</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 게임 목록 */}
                      <ScrollArea className="h-[600px]">
                        <div className="space-y-4">
                          {(() => {
                            // ✅ Lv2가 노출 설정한 제공사만 표시 (매장별 게임 탭)
                            const filteredProviders = providers.filter(p => {
                              // 선택된 API와 일치해야 함
                              if (p.api_type !== selectedApi) return false;
                              
                              // 제공사가 visible 상태여야 함
                              if (p.is_visible !== true) return false;
                              
                              // ✅ 게임 타입 필터링: 카지노/슬롯/미니게임별로 제공사 필터링
                              if (selectedGameType !== "all" && p.type !== selectedGameType) return false;
                              
                              return true;
                            });
                            
                            if (filteredProviders.length === 0) {
                              return (
                                <div className="text-center py-12 text-slate-400">
                                  <Building2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                  <p>노출된 게임사가 없습니다</p>
                                  <p className="text-sm mt-2">Lv2 게임관리에서 게임사를 먼저 노출 설정하세요.</p>
                                </div>
                              );
                            }

                            return filteredProviders.map(provider => {
                              const providerGames = games.filter(g => 
                                g.provider_id === provider.id &&
                                (selectedGameType === "all" || g.type === selectedGameType) &&
                                (!debouncedSearchTerm || g.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
                              );

                              if (providerGames.length === 0 && debouncedSearchTerm) {
                                return null;
                              }

                              const isExpanded = expandedProviderIds.has(provider.id);
                              const blockedCount = providerGames.filter(g => storeBlockedGames.includes(g.id)).length;

                              return (
                                <div key={provider.id} className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/30">
                                  {/* 제공사 헤더 */}
                                  <div className="p-4 bg-slate-800/50 flex items-center justify-between hover:bg-slate-800/70 transition-colors">
                                    <div className="flex items-center gap-3 flex-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setExpandedProviderIds(prev => {
                                            const next = new Set(prev);
                                            if (next.has(provider.id)) {
                                              next.delete(provider.id);
                                            } else {
                                              next.add(provider.id);
                                            }
                                            return next;
                                          });
                                        }}
                                        className="p-1 h-auto hover:bg-slate-700"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="w-6 h-6 text-white" />
                                        ) : (
                                          <ChevronRight className="w-6 h-6 text-white" />
                                        )}
                                      </Button>

                                      <Building2 className="w-6 h-6 text-slate-300" />
                                      
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-lg font-bold text-white">{provider.name}</span>
                                          {storeBlockedProviders.includes(provider.id) ? (
                                            <EyeOff className="w-5 h-5 text-red-400" />
                                          ) : (
                                            <Eye className="w-5 h-5 text-emerald-400" />
                                          )}
                                          <Badge variant="outline" className="text-sm font-semibold border-slate-600">
                                            {provider.api_type.toUpperCase()}
                                          </Badge>
                                        </div>
                                        <div className="text-sm text-slate-300 mt-1 font-medium">
                                          총 {providerGames.length}개 게임 · 차단 {blockedCount}개
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          if (!selectedStore) return;
                                          try {
                                            // 해당 제공사의 모든 게임 ID
                                            const allProviderGameIds = games
                                              .filter(g => g.provider_id === provider.id)
                                              .map(g => String(g.id));
                                            
                                            if (allProviderGameIds.length === 0) {
                                              toast.error("게임이 없습니다.");
                                              return;
                                            }

                                            console.log("✅ 매장별 전체 허용:", { 
                                              provider: provider.name, 
                                              providerId: provider.id,
                                              storeId: selectedStore.id
                                            });

                                            // 전체 허용 = 제공사 차단 레코드 삭제
                                            const { error } = await supabase
                                              .from("partner_game_access")
                                              .delete()
                                              .eq("partner_id", selectedStore.id)
                                              .is("user_id", null)
                                              .eq("game_provider_id", String(provider.id))
                                              .eq("access_type", "provider");
                                            
                                            if (error) {
                                              console.error("❌ 삭제 오류:", error);
                                              throw error;
                                            }
                                            
                                            console.log("✅ 차단 해제 완료");
                                            
                                            await loadStoreGameAccess(selectedStore.id);
                                            toast.success(`${provider.name}의 모든 게임을 허용했습니다.`);
                                          } catch (error) {
                                            console.error("❌ 전체 허용 실패:", error);
                                            toast.error("일괄 허용에 실패했습니다.");
                                          }
                                        }}
                                        className="bg-emerald-900/20 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/40"
                                      >
                                        <Eye className="w-4 h-4 mr-1" />
                                        전체 허용
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          if (!selectedStore) return;
                                          try {
                                            // 해당 제공사의 모든 게임 ID
                                            const allProviderGameIds = games
                                              .filter(g => g.provider_id === provider.id)
                                              .map(g => String(g.id));
                                            
                                            if (allProviderGameIds.length === 0) {
                                              toast.error("게임이 없습니다.");
                                              return;
                                            }

                                            console.log("🚫 매장별 전체 차단:", { 
                                              provider: provider.name, 
                                              providerId: provider.id,
                                              storeId: selectedStore.id
                                            });

                                            // 전체 차단 = 제공사 단위로 차단 레코드 생성 (access_type: 'provider')
                                            const providerAccessRecord = {
                                              partner_id: selectedStore.id,
                                              api_provider: provider.api_type,
                                              game_provider_id: String(provider.id),
                                              access_type: "provider",
                                            };

                                            // 먼저 기존 제공사 차단 레코드 삭제 (중복 방지)
                                            await supabase
                                              .from("partner_game_access")
                                              .delete()
                                              .eq("partner_id", selectedStore.id)
                                              .is("user_id", null)
                                              .eq("game_provider_id", String(provider.id))
                                              .eq("access_type", "provider");

                                            const { error } = await supabase
                                              .from("partner_game_access")
                                              .insert([providerAccessRecord]);
                                            
                                            if (error) {
                                              console.error("❌ 생성 오류:", error);
                                              throw error;
                                            }
                                            
                                            console.log("✅ 차단 완료");
                                            
                                            await loadStoreGameAccess(selectedStore.id);
                                            toast.success(`${provider.name}의 모든 게임을 차단했습니다.`);
                                          } catch (error) {
                                            console.error("❌ 전체 차단 실패:", error);
                                            toast.error("일괄 차단에 실패했습니다.");
                                          }
                                        }}
                                        className="bg-red-900/20 border-red-600/50 text-red-300 hover:bg-red-900/40"
                                      >
                                        <EyeOff className="w-4 h-4 mr-1" />
                                        전체 차단
                                      </Button>
                                    </div>
                                  </div>

                                  {/* 게임 그리드 */}
                                  {isExpanded && (
                                    <div className="p-4">
                                      {providerGames.length === 0 ? (
                                        <div className="text-center py-8 text-base font-medium text-slate-300">
                                          게임이 없습니다.
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                          {providerGames.map((game) => {
                                            const isBlocked = storeBlockedGames.includes(game.id);
                                            return (
                                              <div
                                                key={game.id}
                                                className={`group relative bg-slate-900/50 border rounded-md overflow-hidden transition-all hover:shadow-md hover:shadow-blue-500/20 ${
                                                  isBlocked
                                                    ? "border-red-500 ring-1 ring-red-500/50 opacity-60"
                                                    : "border-slate-700 hover:border-slate-600"
                                                }`}
                                              >
                                                <div className="absolute top-2 left-2 z-10">
                                                  <Checkbox
                                                    checked={isBlocked}
                                                    onCheckedChange={() => handleToggleStoreGame(game.id)}
                                                    className="bg-slate-900/90 border-slate-600 h-5 w-5"
                                                  />
                                                </div>

                                                <div className="aspect-[3/2] bg-slate-800 relative overflow-hidden">
                                                  {game.image_url ? (
                                                    <img
                                                      src={game.image_url}
                                                      alt={game.name}
                                                      loading="lazy"
                                                      className="w-full h-full object-cover"
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
                                                </div>

                                                <div className="p-2">
                                                  <div className="min-h-[32px] flex items-center">
                                                    <div
                                                      className="text-xs text-slate-200 line-clamp-2 leading-tight"
                                                      title={game.name}
                                                    >
                                                      {game.name}
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            }).filter(Boolean);
                          })()}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 사용자별 게임 탭 */}
      {activeTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 왼쪽: 매장 목록 */}
          <Card className="bg-slate-800/30 border-slate-700 lg:col-span-3">
            <CardContent className="p-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">매장 목록</h3>
                  <p className="text-sm text-slate-400">매장을 선택하세요</p>
                </div>

                {loadingStores ? (
                  <div className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-400">로딩 중...</p>
                  </div>
                ) : stores.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Store className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">매장이 없습니다</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-2">
                      {stores.map((store) => (
                        <button
                          key={store.id}
                          onClick={() => handleStoreSelect(store)}
                          className={`w-full p-3 rounded-lg text-left transition-all ${
                            selectedStore?.id === store.id
                              ? "bg-purple-900/40 border-2 border-purple-500"
                              : "bg-slate-700/30 border border-slate-600 hover:bg-slate-700/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-slate-300" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {store.username}
                              </p>
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

          {/* 중간: 사용자 목록 */}
          <Card className="bg-slate-800/30 border-slate-700 lg:col-span-3">
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-white">사용자 목록</h3>
                  <div className="flex-1 relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <Input
                      placeholder="검색..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="pl-7 h-8 text-sm bg-slate-900/50 border-slate-700 text-white"
                    />
                  </div>
                </div>

                {!selectedStore ? (
                  <div className="text-center py-8 text-slate-400">
                    <Store className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">매장을 먼저 선택하세요</p>
                  </div>
                ) : loadingUsers ? (
                  <div className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-400">로딩 중...</p>
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <UserIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">사용자가 없습니다</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-2">
                      {users
                        .filter(u => 
                          !debouncedUserSearchTerm || 
                          u.username.toLowerCase().includes(debouncedUserSearchTerm.toLowerCase())
                        )
                        .map((targetUser) => (
                        <button
                          key={targetUser.id}
                          onClick={() => handleUserSelect(targetUser)}
                          className={`w-full p-3 rounded-lg text-left transition-all ${
                            selectedUser?.id === targetUser.id
                              ? "bg-purple-900/40 border-2 border-purple-500"
                              : "bg-slate-700/30 border border-slate-600 hover:bg-slate-700/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4 text-slate-300" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {targetUser.username}
                              </p>
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

          {/* 오른쪽: 게임 설정 */}
          <Card className="bg-slate-800/30 border-slate-700 lg:col-span-6">
            <CardContent className="p-6">
              {!selectedUser ? (
                <div className="text-center py-12 text-slate-400">
                  <UserIcon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-xl font-semibold text-white mb-2">사용자를 선택하세요</p>
                  <p>왼쪽에서 사용자를 선택하면 게임 접근 권한을 설정할 수 있습니다.</p>
                  <p className="text-sm mt-2 text-amber-400">※ 해당 사용자가 속한 매장에서 노출된 게임만 선택 가능합니다.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* API 탭 선택 */}
                  <div className="flex gap-2 border-b border-slate-700">
                    {availableApis
                      .filter(api => 
                        storeSelectedApis.length === 0 || storeSelectedApis.includes(api.value)
                      )
                      .map(api => (
                        <Button
                          key={api.value}
                          variant="ghost"
                          onClick={() => setSelectedApi(api.value)}
                          className={`rounded-none border-b-2 transition-colors px-6 py-3 text-base font-bold ${
                            selectedApi === api.value
                              ? "border-purple-500 bg-purple-900/20 text-white"
                              : "border-transparent text-white hover:bg-slate-800/50"
                          }`}
                        >
                          {api.label}
                        </Button>
                      ))}
                  </div>

                  {!selectedApi ? (
                    <div className="text-center py-12 text-slate-400">
                      <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                      <p className="text-xl font-semibold text-white mb-2">API를 선택하세요</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* 검색 및 필터 */}
                      <div className="flex gap-4">
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            placeholder="게임 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 bg-slate-900/50 border-slate-700 text-white"
                          />
                        </div>
                        <Select
                          value={selectedGameType}
                          onValueChange={(value: GameType) => setSelectedGameType(value)}
                        >
                          <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-700 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">전체</SelectItem>
                            <SelectItem value="casino">카지노</SelectItem>
                            <SelectItem value="slot">슬롯</SelectItem>
                            <SelectItem value="minigame">미니게임</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 게임 목록 */}
                      <ScrollArea className="h-[600px]">
                        <div className="space-y-4">
                          {(() => {
                            // ✅ Lv2가 노출 설정한 제공사만 표시 (사용자별 게임 탭)
                            const filteredProviders = providers.filter(p => {
                              // 선택된 API와 일치해야 함
                              if (p.api_type !== selectedApi) return false;
                              
                              // 제공사가 visible 상태여야 함
                              if (p.is_visible !== true) return false;
                              
                              // ✅ 게임 타입 필터링: 카지노/슬롯/미니게임별로 제공사 필터링
                              if (selectedGameType !== "all" && p.type !== selectedGameType) return false;
                              
                              return true;
                            });
                            
                            if (filteredProviders.length === 0) {
                              return (
                                <div className="text-center py-12 text-slate-400">
                                  <Building2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                  <p>노출된 게임사가 없습니다</p>
                                  <p className="text-sm mt-2">Lv2 게임관리에서 게임사를 먼저 노출 설정하세요.</p>
                                </div>
                              );
                            }

                            return filteredProviders.map(provider => {
                              // 매장에서 차단되지 않은 게임만 필터링 (로직 반전)
                              const providerGames = games.filter(g => 
                                g.provider_id === provider.id &&
                                (selectedGameType === "all" || g.type === selectedGameType) &&
                                (!debouncedSearchTerm || g.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) &&
                                !storeBlockedGames.includes(g.id) // 매장에서 차단되지 않은 게임만
                              );

                              if (providerGames.length === 0 && debouncedSearchTerm) {
                                return null;
                              }

                              const isExpanded = expandedProviderIds.has(provider.id);
                              const blockedCount = providerGames.filter(g => userBlockedGames.includes(g.id)).length;

                              return (
                                <div key={provider.id} className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/30">
                                  {/* 제공사 헤더 */}
                                  <div className="p-4 bg-slate-800/50 flex items-center justify-between hover:bg-slate-800/70 transition-colors">
                                    <div className="flex items-center gap-3 flex-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setExpandedProviderIds(prev => {
                                            const next = new Set(prev);
                                            if (next.has(provider.id)) {
                                              next.delete(provider.id);
                                            } else {
                                              next.add(provider.id);
                                            }
                                            return next;
                                          });
                                        }}
                                        className="p-1 h-auto hover:bg-slate-700"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="w-6 h-6 text-white" />
                                        ) : (
                                          <ChevronRight className="w-6 h-6 text-white" />
                                        )}
                                      </Button>

                                      <Building2 className="w-6 h-6 text-slate-300" />
                                      
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-lg font-bold text-white">{provider.name}</span>
                                          {userBlockedProviders.includes(provider.id) ? (
                                            <EyeOff className="w-5 h-5 text-red-400" />
                                          ) : (
                                            <Eye className="w-5 h-5 text-emerald-400" />
                                          )}
                                          <Badge variant="outline" className="text-sm font-semibold border-slate-600">
                                            {provider.api_type.toUpperCase()}
                                          </Badge>
                                        </div>
                                        <div className="text-sm text-slate-300 mt-1 font-medium">
                                          매장 허용 {providerGames.length}개 · 사용자 차단 {blockedCount}개
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          if (!selectedUser || !selectedStore) return;
                                          try {
                                            // 해당 제공사의 모든 게임 ID
                                            const allProviderGameIds = games
                                              .filter(g => g.provider_id === provider.id)
                                              .map(g => String(g.id));

                                            if (allProviderGameIds.length === 0) {
                                              toast.error("게임이 없습니다.");
                                              return;
                                            }

                                            console.log("✅ 사용자별 전체 허용:", { 
                                              provider: provider.name, 
                                              providerId: provider.id,
                                              storeId: selectedStore.id,
                                              userId: selectedUser.id 
                                            });
                                            
                                            // 전체 허용 = 제공사 차단 레코드 삭제
                                            const { error } = await supabase
                                              .from("partner_game_access")
                                              .delete()
                                              .eq("partner_id", selectedStore.id)
                                              .eq("user_id", selectedUser.id)
                                              .eq("game_provider_id", String(provider.id))
                                              .eq("access_type", "provider");
                                            
                                            if (error) {
                                              console.error("❌ 삭제 오류:", error);
                                              throw error;
                                            }
                                            
                                            console.log("✅ 차단 해제 완료");
                                            
                                            await loadUserGameAccess(selectedUser.id);
                                            toast.success(`${provider.name}의 모든 게임을 허용했습니다.`);
                                          } catch (error) {
                                            console.error("❌ 전체 허용 실패:", error);
                                            toast.error("일괄 허용에 실패했습니다.");
                                          }
                                        }}
                                        className="bg-emerald-900/20 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/40"
                                      >
                                        <Eye className="w-4 h-4 mr-1" />
                                        전체 허용
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          if (!selectedUser || !selectedStore) return;
                                          try {
                                            // 해당 제공사의 모든 게임 ID
                                            const allProviderGameIds = games
                                              .filter(g => g.provider_id === provider.id)
                                              .map(g => String(g.id));
                                            
                                            if (allProviderGameIds.length === 0) {
                                              toast.error("게임이 없습니다.");
                                              return;
                                            }

                                            console.log("🚫 사용자별 전체 차단:", { 
                                              provider: provider.name, 
                                              providerId: provider.id,
                                              storeId: selectedStore.id,
                                              userId: selectedUser.id 
                                            });

                                            // 전체 차단 = 제공사 단위로 차단 레코드 생성 (access_type: 'provider')
                                            const providerAccessRecord = {
                                              partner_id: selectedStore.id,
                                              user_id: selectedUser.id,
                                              api_provider: provider.api_type,
                                              game_provider_id: String(provider.id),
                                              access_type: "provider",
                                            };

                                            // 먼저 기존 제공사 차단 레코드 삭제 (중복 방지)
                                            await supabase
                                              .from("partner_game_access")
                                              .delete()
                                              .eq("partner_id", selectedStore.id)
                                              .eq("user_id", selectedUser.id)
                                              .eq("game_provider_id", String(provider.id))
                                              .eq("access_type", "provider");

                                            const { error } = await supabase
                                              .from("partner_game_access")
                                              .insert([providerAccessRecord]);
                                            
                                            if (error) {
                                              console.error("❌ 생성 오류:", error);
                                              throw error;
                                            }
                                            
                                            console.log("✅ 차단 완료");
                                            
                                            await loadUserGameAccess(selectedUser.id);
                                            toast.success(`${provider.name}의 모든 게임을 차단했습니다.`);
                                          } catch (error) {
                                            console.error("❌ 전체 차단 실패:", error);
                                            toast.error("일괄 차단에 실패했습니다.");
                                          }
                                        }}
                                        className="bg-red-900/20 border-red-600/50 text-red-300 hover:bg-red-900/40"
                                      >
                                        <EyeOff className="w-4 h-4 mr-1" />
                                        전체 차단
                                      </Button>
                                    </div>
                                  </div>

                                  {/* 게임 그리드 */}
                                  {isExpanded && (
                                    <div className="p-4">
                                      {providerGames.length === 0 ? (
                                        <div className="text-center py-8 text-base font-medium text-slate-300">
                                          매장에서 허용된 게임이 없습니다.
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                          {providerGames.map((game) => {
                                            const isBlocked = userBlockedGames.includes(game.id);
                                            return (
                                              <div
                                                key={game.id}
                                                className={`group relative bg-slate-900/50 border rounded-md overflow-hidden transition-all hover:shadow-md hover:shadow-blue-500/20 ${
                                                  isBlocked
                                                    ? "border-red-500 shadow-red-500/30 opacity-60"
                                                    : "border-slate-700"
                                                }`}
                                              >
                                                {/* 게임 이미지 */}
                                                <div className="aspect-square bg-slate-800/50 flex items-center justify-center relative">
                                                  {game.image ? (
                                                    <img
                                                      src={game.image}
                                                      alt={game.name}
                                                      className="w-full h-full object-cover"
                                                    />
                                                  ) : (
                                                    <Gamepad2 className="w-8 h-8 text-slate-600" />
                                                  )}
                                                  
                                                  {/* 체크박스 오버레이 */}
                                                  <div
                                                    className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                                    onClick={() => handleToggleUserGame(game.id)}
                                                  >
                                                    <div
                                                      className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                                                        isBlocked
                                                          ? "bg-red-500 border-red-500"
                                                          : "bg-slate-700/80 border-slate-500"
                                                      }`}
                                                    >
                                                      {isBlocked && (
                                                        <EyeOff className="w-4 h-4 text-white" />
                                                      )}
                                                    </div>
                                                  </div>

                                                  {/* 차단 상태 뱃지 */}
                                                  {isBlocked && (
                                                    <div className="absolute top-1 right-1">
                                                      <div className="bg-red-500 rounded-full p-1">
                                                        <EyeOff className="w-3 h-3 text-white" />
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 게임 이름 */}
                                                <div className="p-2 bg-slate-800/80">
                                                  <div className="min-h-[32px] flex items-center">
                                                    <div
                                                      className="text-xs text-slate-200 line-clamp-2 leading-tight"
                                                      title={game.name}
                                                    >
                                                      {game.name}
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            }).filter(Boolean);
                          })()}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 게임 관리 탭 */}
      {activeTab === "games" && (
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
                        className={`
                          rounded-none
                          ${selectedApi === api.value
                            ? `bg-gradient-to-r ${api.color} text-white border-0 hover:opacity-90`
                            : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                          }
                        `}
                      >
                        {api.label}
                      </Button>
                    ))}
                  </div>
                  {/* API 전체 노출/숨김 버튼 */}
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
                        className={`
                          rounded-none
                          ${selectedGameType === type.value
                            ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-0 hover:opacity-90'
                            : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                          }
                        `}
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
                    placeholder={t.gameManagement.searchGames}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-11 text-base font-medium bg-slate-800/50 border-slate-700/50 focus:border-blue-500/50 focus:ring-blue-500/20 text-white placeholder:text-slate-400"
                  />
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
                currentProviders.map(provider => (
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
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}