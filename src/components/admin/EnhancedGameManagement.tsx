import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
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
} from "lucide-react";
import { Partner } from "../../types";
import { gameApi, Game, GameProvider } from "../../lib/gameApi";
import { MetricCard } from "./MetricCard";
import { useBalance } from "../../contexts/BalanceContext";
import { useLanguage } from "../../contexts/LanguageContext";

interface EnhancedGameManagementProps {
  user: Partner;
}

type GameTab =
  | "invest_casino"
  | "invest_slot"
  | "oroplay_casino"
  | "oroplay_slot"
  | "oroplay_minigame";

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
  
  // 상태별 색상
  const getStatusBadge = () => {
    if (game.status === "maintenance") {
      return (
        <Badge className="bg-orange-600/90 text-white border-0 text-xs">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {t.gameManagement.maintenance}
        </Badge>
      );
    } else if (!game.is_visible || game.status === "hidden") {
      return (
        <Badge className="bg-slate-600/90 text-white border-0 text-xs">
          <EyeOff className="w-3 h-3 mr-1" />
          {t.gameManagement.hidden}
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-green-600/90 text-white border-0 text-xs">
          <Eye className="w-3 h-3 mr-1" />
          {t.gameManagement.visible}
        </Badge>
      );
    }
  };

  return (
    <div
      className={`group relative bg-slate-900/50 border rounded-lg overflow-hidden transition-all hover:shadow-lg hover:shadow-blue-500/20 ${
        isSelected
          ? "border-blue-500 ring-2 ring-blue-500/50"
          : "border-slate-700 hover:border-slate-600"
      }`}
    >
      {/* 선택 체크박스 */}
      <div className="absolute top-2 left-2 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          className="bg-slate-900/90 border-slate-600"
        />
      </div>

      {/* 게임 이미지 */}
      <div className="aspect-[4/3] bg-slate-800 relative overflow-hidden">
        {game.image_url ? (
          <img
            src={game.image_url}
            alt={game.name}
            className="w-full h-full object-contain bg-slate-900 group-hover:scale-105 transition-transform p-2"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="150"%3E%3Crect fill="%23334155" width="200" height="150"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-size="48" fill="%23475569"%3E🎮%3C/text%3E%3C/svg%3E';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl opacity-30">
            🎮
          </div>
        )}

        {/* 추천 배지 */}
        {game.is_featured && (
          <div className="absolute top-2 right-2">
            <Star className="w-6 h-6 text-yellow-400 fill-yellow-400 drop-shadow-lg" />
          </div>
        )}

        {/* 상태 배지 */}
        <div className="absolute bottom-2 left-2">{getStatusBadge()}</div>

        {/* 호버 액션 */}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleFeatured}
            className={`border-0 text-white ${
              game.is_featured
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-slate-700 hover:bg-slate-600"
            }`}
            title={game.is_featured ? t.gameManagement.removeFeatured : t.gameManagement.setFeatured}
          >
            <Star className={`w-4 h-4 ${game.is_featured ? "fill-white" : ""}`} />
          </Button>
        </div>
      </div>

      {/* 게임 정보 */}
      <div className="p-3 space-y-3">
        {/* 게임명 */}
        <div className="min-h-[40px] flex items-center">
          <div
            className="text-sm text-slate-200 line-clamp-2 leading-tight"
            title={game.name}
          >
            {game.name}
          </div>
        </div>

        {/* 하단 정보 */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
          <div className="flex items-center gap-2">
            {game.rtp && (
              <span className="text-xs text-slate-400">RTP {game.rtp}%</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 상태 선택 드롭다운 */}
            <Select
              value={game.status}
              onValueChange={(value: "visible" | "maintenance" | "hidden") =>
                onChangeStatus(value)
              }
            >
              <SelectTrigger className="h-7 w-24 text-xs bg-slate-800 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="visible">
                  <div className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {t.gameManagement.visible}
                  </div>
                </SelectItem>
                <SelectItem value="maintenance">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {t.gameManagement.maintenance}
                  </div>
                </SelectItem>
                <SelectItem value="hidden">
                  <div className="flex items-center gap-1">
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

export function EnhancedGameManagement({ user }: EnhancedGameManagementProps) {
  const { t } = useLanguage();
  // ✅ API 활성화 상태 가져오기
  const { useInvestApi, useOroplayApi } = useBalance();

  const [activeTab, setActiveTab] = useState<GameTab>("invest_casino");
  const [games, setGames] = useState<Game[]>([]);
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedGames, setSelectedGames] = useState<Set<number>>(new Set());
  const [syncing, setSyncing] = useState(false);

  // 검색어 debounce 적용 (300ms)
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // 탭에서 API 타입과 게임 타입 추출
  const getApiAndGameType = (
    tab: GameTab
  ): { apiType: "invest" | "oroplay"; gameType: "slot" | "casino" | "minigame" } => {
    const [api, type] = tab.split("_");
    return {
      apiType: api as "invest" | "oroplay",
      gameType: type as "slot" | "casino" | "minigame",
    };
  };

  // 현재 탭의 제공사 목록 (API 활성화 상태 체크)
  const currentProviders = useMemo(() => {
    if (!providers || providers.length === 0) return [];

    const { apiType, gameType } = getApiAndGameType(activeTab);

    // ✅ API 비활성화 시 해당 제공사 숨김
    if (apiType === "invest" && !useInvestApi) return [];
    if (apiType === "oroplay" && !useOroplayApi) return [];

    return providers.filter(
      (p) => p.api_type === apiType && p.type === gameType
    );
  }, [providers, activeTab, useInvestApi, useOroplayApi]);

  // 필터링된 게임 목록
  const filteredGames = useMemo(() => {
    if (!games || games.length === 0) return [];

    const { apiType, gameType } = getApiAndGameType(activeTab);

    // ✅ API 비활성화 시 해당 게임 숨김
    if (apiType === "invest" && !useInvestApi) return [];
    if (apiType === "oroplay" && !useOroplayApi) return [];

    return games.filter((game) => {
      // API 타입과 게임 타입 필터
      if (game.api_type !== apiType || game.type !== gameType) return false;

      // 검색어 필터 (debounced)
      if (
        debouncedSearchTerm &&
        !game.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) &&
        !game.provider_name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      ) {
        return false;
      }

      // 제공사 필터
      if (selectedProvider !== null && game.provider_id !== selectedProvider) {
        return false;
      }

      // 상태 필터
      if (statusFilter === "visible" && game.status !== "visible") return false;
      if (statusFilter === "maintenance" && game.status !== "maintenance")
        return false;
      if (statusFilter === "hidden" && game.status !== "hidden") return false;

      return true;
    });
  }, [games, activeTab, debouncedSearchTerm, selectedProvider, statusFilter, useInvestApi, useOroplayApi]);

  // 제공사별 게임 그룹화
  const groupedGames = useMemo(() => {
    const groups: Record<string, Game[]> = {};

    filteredGames.forEach((game) => {
      const provider = game.provider_name || t.gameManagement.other;
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(game);
    });

    return groups;
  }, [filteredGames]);

  // 초기 데이터 로드
  useEffect(() => {
    initializeData();
  }, []);

  // 탭 변경 시 필터 초기화 및 게임 재로드
  useEffect(() => {
    setStatusFilter("all");
    setSearchTerm("");
    setSelectedGames(new Set());

    if (providers.length > 0) {
      // 첫 번째 제공사 자동 선택 (모든 상태 포함)
      const { apiType, gameType } = getApiAndGameType(activeTab);
      const firstProvider = providers.find(
        (p) => p.api_type === apiType && p.type === gameType
      );
      
      if (firstProvider) {
        setSelectedProvider(firstProvider.id);
      } else {
        setSelectedProvider(null);
      }
      
      loadGames();
    }
  }, [activeTab, providers]);

  // 초기 데이터 로드
  const initializeData = async () => {
    try {
      setLoading(true);

      console.log("🚀 초기 데이터 로드 시작...");

      // 제공사 목록 로드
      const providersData = await gameApi.getProviders();
      console.log("📊 제공사 로드 완료:", providersData.length);
      setProviders(providersData);

      // 첫 번째 탭의 게임 로드
      await loadGames("invest_casino");

      console.log("✅ 초기 데이터 로드 완료");
    } catch (error) {
      console.error("❌ 초기 데이터 로드 실패:", error);
      toast.error(t.transactionManagement.loadDataFailed);
    } finally {
      setLoading(false);
    }
  };

  // 게임 목록 로드
  const loadGames = async (tab?: GameTab) => {
    try {
      setLoading(true);

      const currentTab = tab || activeTab;
      const { apiType, gameType } = getApiAndGameType(currentTab);

      console.log("🎮 게임 로드 시작:", { tab: currentTab, apiType, gameType });

      const data = await gameApi.getGames({
        api_type: apiType,
        type: gameType,
      });

      console.log("✅ 게임 로드 완료:", data.length);
      setGames(data);
    } catch (error) {
      console.error("❌ 게임 데이터 로드 실패:", error);
      toast.error(t.gameManagement.loadGamesFailed);
    } finally {
      setLoading(false);
    }
  };

  // 제공사 초기화
  const handleInitializeProviders = async () => {
    try {
      setSyncing(true);
      toast.info(t.gameManagement.initializingProviders);

      await gameApi.initializeInvestProviders();
      await gameApi.syncOroPlayProviders();

      toast.success(t.gameManagement.providerInitialized);

      // 제공사 목록 새로고침
      const providersData = await gameApi.getProviders();
      setProviders(providersData);
    } catch (error) {
      console.error("❌ 제공사 초기화 실패:", error);
      toast.error(t.gameManagement.providerInitializeFailed);
    } finally {
      setSyncing(false);
    }
  };

  // Invest 게임 동기화
  const handleSyncInvestGames = async () => {
    if (syncing) {
      toast.warning(t.gameManagement.syncAlreadyInProgress);
      return;
    }

    setSyncing(true);

    try {
      console.log("🔄 Invest 게임 동기화 시작...");
      toast.info(t.gameManagement.investSyncStarting);

      const result = await gameApi.syncAllInvestGames();

      const totalAdded = result.results.reduce((sum, r) => sum + r.newGames, 0);
      const totalUpdated = result.results.reduce((sum, r) => sum + r.updatedGames, 0);

      console.log("✅ Invest 동기화 완료:", { totalAdded, totalUpdated });
      toast.success(`Invest API 동기화 완료: 신규 ${totalAdded}개, 업데이트 ${totalUpdated}개`);

      // 게임 목록 새로고침
      await loadGames();
    } catch (error) {
      console.error("❌ Invest 동기화 실패:", error);
      toast.error(t.gameManagement.investSyncFailed);
    } finally {
      setSyncing(false);
    }
  };

  // OroPlay 게임 동기화
  const handleSyncOroPlayGames = async () => {
    if (syncing) {
      toast.warning(t.gameManagement.syncAlreadyInProgress);
      return;
    }

    setSyncing(true);

    try {
      console.log("🔄 OroPlay 게임 동기화 시작...");
      toast.info(t.gameManagement.oroplaySyncStarting);

      const result = await gameApi.syncOroPlayGames();

      console.log("✅ OroPlay 동기화 완료:", result);
      toast.success(`OroPlay API 동기화 완료: 신규 ${result.newGames}개, 업데이트 ${result.updatedGames}개`);

      // 제공사 목록 새로고침 (새 제공사가 추가될 수 있음)
      await gameApi.syncOroPlayProviders();
      const providersData = await gameApi.getProviders();
      setProviders(providersData);

      // 게임 목록 새로고침
      await loadGames();
    } catch (error) {
      console.error("❌ OroPlay 동기화 실패:", error);
      toast.error(t.gameManagement.oroplaySyncFailed);
    } finally {
      setSyncing(false);
    }
  };

  // 게임 추천 토글
  const handleToggleFeatured = async (gameId: number) => {
    try {
      const game = games.find((g) => g.id === gameId);
      if (!game) return;

      await gameApi.updateGameFeatured(gameId, !game.is_featured);

      toast.success(
        game.is_featured ? t.gameManagement.featuredRemoved : t.gameManagement.featuredSet
      );
      await loadGames();
    } catch (error) {
      console.error("추천 설정 실패:", error);
      toast.error(t.gameManagement.setFeatured);
    }
  };

  // 게임 상태 변경
  const handleChangeStatus = async (
    gameId: number,
    status: "visible" | "maintenance" | "hidden"
  ) => {
    try {
      await gameApi.updateGameStatus(gameId, status);

      const statusText = {
        visible: t.gameManagement.visible,
        maintenance: t.gameManagement.maintenance,
        hidden: t.gameManagement.hidden,
      }[status];

      toast.success(`게임 상태가 "${statusText}"로 변경되었습니다`);
      
      // ✅ Optimistic Update: 로컬 상태만 업데이트 (전체 로딩 X)
      setGames(prevGames => 
        prevGames.map(game => 
          game.id === gameId 
            ? { ...game, status, is_visible: status === "visible" }
            : game
        )
      );
    } catch (error) {
      console.error("상태 변경 실패:", error);
      toast.error(t.gameManagement.updateStatus);
    }
  };

  // 제공사 상태 변경
  const handleChangeProviderStatus = async (
    providerId: number,
    status: "visible" | "maintenance" | "hidden"
  ) => {
    try {
      await gameApi.updateProviderStatus(providerId, status);

      const statusText = {
        visible: t.gameManagement.visible,
        maintenance: t.gameManagement.maintenance,
        hidden: t.gameManagement.hidden,
      }[status];

      toast.success(`제공사 상태가 "${statusText}"로 변경되었습니다`);
      
      // ✅ Optimistic Update: 제공사 로컬 상태만 업데이트
      setProviders(prevProviders =>
        prevProviders.map(provider =>
          provider.id === providerId
            ? { ...provider, status, is_visible: status === "visible" }
            : provider
        )
      );
      
      // ✅ 해당 제공사의 모든 게임도 상태 업데이트
      setGames(prevGames =>
        prevGames.map(game =>
          game.provider_id === providerId
            ? { ...game, status, is_visible: status === "visible" }
            : game
        )
      );
      
      // ✅ 현재 선택된 제공사는 유지 (selectedProvider 변경하지 않음)
    } catch (error) {
      console.error("제공사 상태 변경 실패:", error);
      toast.error(t.gameManagement.updateStatus);
    }
  };

  // 게임 선택 토글
  const toggleGameSelection = (gameId: number) => {
    setSelectedGames((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(gameId)) {
        newSet.delete(gameId);
      } else {
        newSet.add(gameId);
      }
      return newSet;
    });
  };

  // 전체 선택/해제
  const toggleSelectAll = () => {
    if (selectedGames.size === filteredGames.length) {
      setSelectedGames(new Set());
    } else {
      setSelectedGames(new Set(filteredGames.map((g) => g.id)));
    }
  };

  // 선택된 게임 일괄 상태 변경
  const handleBulkChangeStatus = async (status: "visible" | "maintenance" | "hidden") => {
    if (selectedGames.size === 0) {
      toast.warning(t.gameManagement.selectGames);
      return;
    }

    try {
      await gameApi.bulkUpdateStatus(Array.from(selectedGames), status);

      const statusText = {
        visible: t.gameManagement.visible,
        maintenance: t.gameManagement.maintenance,
        hidden: t.gameManagement.hidden,
      }[status];

      toast.success(`${selectedGames.size}개 게임 상태가 "${statusText}"로 변경되었습니다`);
      setSelectedGames(new Set());
      await loadGames();
    } catch (error) {
      console.error("일괄 상태 변경 실패:", error);
      toast.error(t.gameManagement.updateStatus);
    }
  };

  // 통계
  const stats = useMemo(() => {
    const { apiType, gameType } = getApiAndGameType(activeTab);
    const currentGames = games.filter(
      (g) => g.type === gameType && g.api_type === apiType
    );

    return {
      total: currentGames.length,
      visible: currentGames.filter((g) => g.status === "visible").length,
      maintenance: currentGames.filter((g) => g.status === "maintenance").length,
      hidden: currentGames.filter((g) => g.status === "hidden").length,
      featured: currentGames.filter((g) => g.is_featured).length,
    };
  }, [games, activeTab]);

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
          {/* Lv1 전용 버튼들 */}
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
                onClick={handleSyncOroPlayGames}
                disabled={syncing || loading}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    {t.gameManagement.syncInProgress}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    OroPlay {t.gameManagement.syncGames}
                  </>
                )}
              </Button>
              <Button
                onClick={handleSyncInvestGames}
                disabled={syncing || loading}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    {t.gameManagement.syncInProgress}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Invest {t.gameManagement.syncGames}
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
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as GameTab)}>
            {/* 탭 리스트 */}
            <TabsList className="grid w-full grid-cols-5 bg-slate-900/50 p-1 rounded-xl mb-6 border border-slate-700/50">
              <TabsTrigger
                value="invest_casino"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white rounded-lg"
              >
                {t.gameManagement.investCasino}
              </TabsTrigger>
              <TabsTrigger
                value="invest_slot"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white rounded-lg"
              >
                {t.gameManagement.investSlot}
              </TabsTrigger>
              <TabsTrigger
                value="oroplay_casino"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white rounded-lg"
              >
                {t.gameManagement.oroplayCasino}
              </TabsTrigger>
              <TabsTrigger
                value="oroplay_slot"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white rounded-lg"
              >
                {t.gameManagement.oroplaysSlot}
              </TabsTrigger>
              <TabsTrigger
                value="oroplay_minigame"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-emerald-600 data-[state=active]:text-white rounded-lg"
              >
                {t.gameManagement.oroplaysMinigame}
              </TabsTrigger>
            </TabsList>

            {/* 필터 및 검색 */}
            <div className="space-y-4 mb-6">
              {/* 제공사 선택 */}
              {currentProviders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-300">{t.gameManagement.selectProvider}</div>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-3 custom-scrollbar">
                    {/* 제공사 버튼들 */}
                    {currentProviders.map((provider) => {
                      const providerGameCount = games.filter(
                        (g) => g.provider_id === provider.id && 
                               g.api_type === getApiAndGameType(activeTab).apiType && 
                               g.type === getApiAndGameType(activeTab).gameType
                      ).length;

                      // 제공사 상태별 스타일
                      const getProviderStatusBadge = () => {
                        if (provider.status === 'maintenance') {
                          return (
                            <Badge className="absolute top-1 right-1 bg-orange-600/90 text-white border-0 text-[10px] px-1.5 py-0.5">
                              {t.gameManagement.maintenanceStatus}
                            </Badge>
                          );
                        } else if (provider.status === 'hidden' || !provider.is_visible) {
                          return (
                            <Badge className="absolute top-1 right-1 bg-slate-600/90 text-white border-0 text-[10px] px-1.5 py-0.5">
                              {t.gameManagement.hiddenStatus}
                            </Badge>
                          );
                        }
                        return null;
                      };

                      const getProviderBgClass = () => {
                        if (selectedProvider === provider.id) {
                          return "bg-gradient-to-br from-blue-600 to-cyan-600";
                        }
                        if (provider.status === 'maintenance') {
                          return "bg-gradient-to-br from-orange-700/60 to-orange-800/60 hover:from-orange-600/60 hover:to-orange-700/60";
                        }
                        if (provider.status === 'hidden' || !provider.is_visible) {
                          return "bg-gradient-to-br from-slate-700/40 to-slate-800/40 hover:from-slate-600/40 hover:to-slate-700/40";
                        }
                        return "bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700";
                      };

                      return (
                        <div
                          key={provider.id}
                          className="flex-shrink-0 group"
                        >
                          <button
                            onClick={() => setSelectedProvider(provider.id)}
                            className={`relative rounded-xl transition-all duration-300 ${
                              selectedProvider === provider.id
                                ? "ring-2 ring-blue-500 shadow-lg shadow-blue-500/30 scale-105"
                                : "hover:scale-105 hover:shadow-lg"
                            }`}
                          >
                            {getProviderStatusBadge()}
                            <div className={`w-32 h-32 p-4 flex flex-col items-center justify-center gap-2 rounded-xl ${getProviderBgClass()}`}>
                              {provider.logo_url ? (
                                <img
                                  src={provider.logo_url}
                                  alt={provider.name}
                                  className="w-12 h-12 object-contain"
                                />
                              ) : (
                                <Gamepad2 className="w-10 h-10 text-white" />
                              )}
                              <div className="text-center">
                                <div className="text-white text-xs line-clamp-1">
                                  {provider.name}
                                </div>
                                <div className="text-white/80 text-xs mt-1">
                                  {providerGameCount}개
                                </div>
                              </div>
                            </div>
                          </button>
                          {/* ✅ 제공사 상태 변경 드롭다운 - 항상 렌더링하여 깜박임 방지 */}
                          <div 
                            className={`mt-2 transition-opacity duration-200 ${
                              selectedProvider === provider.id 
                                ? 'opacity-100 visible' 
                                : 'opacity-0 invisible h-0 overflow-hidden'
                            }`}
                          >
                            <Select
                              value={provider.status}
                              onValueChange={(value: 'visible' | 'maintenance' | 'hidden') =>
                                handleChangeProviderStatus(provider.id, value)
                              }
                            >
                              <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-600">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="visible">
                                  <div className="flex items-center gap-1">
                                    <Eye className="w-3 h-3" />
                                    {t.gameManagement.visible}
                                  </div>
                                </SelectItem>
                                <SelectItem value="maintenance">
                                  <div className="flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    {t.gameManagement.maintenanceStatus}
                                  </div>
                                </SelectItem>
                                <SelectItem value="hidden">
                                  <div className="flex items-center gap-1">
                                    <EyeOff className="w-3 h-3" />
                                    {t.gameManagement.hiddenStatus}
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 검색 및 필터 */}
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder={t.gameManagement.searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-slate-900/50 border-slate-600"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40 bg-slate-900/50 border-slate-600">
                    <SelectValue placeholder={t.gameManagement.statusFilter} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.gameManagement.allStatus}</SelectItem>
                    <SelectItem value="visible">{t.gameManagement.visible}</SelectItem>
                    <SelectItem value="maintenance">{t.gameManagement.maintenanceStatus}</SelectItem>
                    <SelectItem value="hidden">{t.gameManagement.hiddenStatus}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 일괄 작업 */}
              {selectedGames.size > 0 && (
                <div className="flex items-center justify-between p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                  <div className="text-sm text-blue-300">
                    {t.gameManagement.selectedCount.replace('{{count}}', selectedGames.size.toString())}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkChangeStatus("visible")}
                      className="border-green-700 text-green-400 hover:bg-green-900/20"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      {t.gameManagement.visible}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkChangeStatus("maintenance")}
                      className="border-orange-700 text-orange-400 hover:bg-orange-900/20"
                    >
                      <AlertTriangle className="w-4 h-4 mr-1" />
                      {t.gameManagement.maintenanceStatus}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkChangeStatus("hidden")}
                      className="border-slate-700 text-slate-400 hover:bg-slate-900/20"
                    >
                      <EyeOff className="w-4 h-4 mr-1" />
                      {t.gameManagement.hiddenStatus}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedGames(new Set())}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      {t.common.deselectAll}
                    </Button>
                  </div>
                </div>
              )}

              {/* 전체 선택/해제 */}
              {filteredGames.length > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedGames.size === filteredGames.length}
                    onCheckedChange={toggleSelectAll}
                    className="border-slate-600"
                  />
                  <span className="text-sm text-slate-400">
                    {t.common.selectAll} ({filteredGames.length})
                  </span>
                </div>
              )}
            </div>

            {/* 게임 목록 */}
            <div className="space-y-6">
              {loading ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                  <p className="text-slate-400 mt-4">{t.common.loading}</p>
                </div>
              ) : filteredGames.length === 0 ? (
                <div className="text-center py-12">
                  <Gamepad2 className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                  <p className="text-slate-400">{t.gameManagement.noGamesFound}</p>
                  <p className="text-sm text-slate-500 mt-2">
                    {t.gameManagement.syncGames}
                  </p>
                </div>
              ) : (
                Object.entries(groupedGames).map(([providerName, providerGames]) => (
                  <div key={providerName} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg text-slate-200">{providerName}</h3>
                      <Badge variant="outline" className="text-slate-400">
                        {providerGames.length}개
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {providerGames.map((game) => (
                        <GameCard
                          key={game.id}
                          game={game}
                          isSelected={selectedGames.has(game.id)}
                          onToggleSelection={() => toggleGameSelection(game.id)}
                          onToggleFeatured={() => handleToggleFeatured(game.id)}
                          onChangeStatus={(status) => handleChangeStatus(game.id, status)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}