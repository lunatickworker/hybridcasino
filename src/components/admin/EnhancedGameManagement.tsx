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
  Play,
  Database,
} from "lucide-react";
import { Partner, User } from "../../types";
import { gameApi, Game, GameProvider } from "../../lib/gameApi";
import { useBalance } from "../../contexts/BalanceContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { supabase } from "../../lib/supabase";
import { ImageWithFallback } from "../figma/ImageWithFallback";

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
  isBlocked?: boolean; // Lv2+에서 partner_game_access에 의해 차단된 게임인지 여부
  userLevel: number;
}

function GameCard({
  game,
  isSelected,
  onToggleSelection,
  onToggleFeatured,
  onChangeStatus,
  isBlocked = false,
  userLevel,
}: GameCardProps) {
  const { t } = useLanguage();
  
  const getStatusIcon = () => {
    // Lv3~Lv7: partner_game_access 차단 상태 우선 확인 (블랙리스트 방식)
    if (isBlocked) {
      return <EyeOff className="w-4 h-4 text-slate-400" />;
    }
    
    // Lv1: status 컬럼 기준
    if (userLevel === 1) {
      if (game.status === "maintenance") {
        return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      } else if (game.status === "hidden") {
        return <EyeOff className="w-4 h-4 text-slate-400" />;
      } else {
        return <Eye className="w-4 h-4 text-green-400" />;
      }
    }
    
    // Lv2: is_visible 컬럼 기준
    if (userLevel === 2) {
      return game.is_visible 
        ? <Eye className="w-4 h-4 text-green-400" /> 
        : <EyeOff className="w-4 h-4 text-slate-400" />;
    }
    
    // 기본: is_visible과 status 모두 체크
    if (game.status === "maintenance") {
      return <AlertTriangle className="w-4 h-4 text-orange-400" />;
    } else if (!game.is_visible || game.status === "hidden") {
      return <EyeOff className="w-4 h-4 text-slate-400" />;
    } else {
      return <Eye className="w-4 h-4 text-green-400" />;
    }
  };

  return (
    <div className="group relative">
      {/* 체크박스 - 좌상단 */}
      <div className="absolute top-2 left-2 z-20">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          className="bg-black/80 border-slate-500 h-5 w-5"
        />
      </div>

      {/* Featured 별 - 우상단 */}
      {game.is_featured && (
        <div className="absolute top-2 right-2 z-20">
          <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-lg" />
        </div>
      )}

      <div className="relative aspect-square overflow-hidden rounded-2xl transition-all duration-500" style={{
        background: '#16161f',
        boxShadow: isSelected 
          ? '0 0 0 2px rgba(59, 130, 246, 0.8), 0 8px 32px rgba(0,0,0,0.4)' 
          : '0 8px 32px rgba(0,0,0,0.4)'
      }}>
        {/* 게임 이미지 */}
        {game.image_url ? (
          <ImageWithFallback
            src={game.image_url}
            alt={game.name}
            className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
            style={{ objectPosition: 'center 30%' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{
            background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)'
          }}>
            <Play className="w-16 h-16 text-white/20" />
          </div>
        )}
        
        {/* 그라디언트 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent opacity-70 group-hover:opacity-80 transition-opacity duration-500"></div>
        
        {/* 게임명 - 하단 고정 */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/50">
          <p className="text-white text-center line-clamp-2" style={{
            fontSize: '0.875rem',
            fontWeight: '700',
            textShadow: '0 2px 8px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.9)',
            letterSpacing: '-0.01em',
            lineHeight: '1.3'
          }}>
            {game.name_ko || game.name}
          </p>
          
          {/* RTP 표시 */}
          {game.rtp && (
            <p className="text-white/60 text-center mt-1" style={{
              fontSize: '0.625rem',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)'
            }}>
              RTP {game.rtp}%
            </p>
          )}
        </div>
        
        {/* 호버 시 로즈 골드 테두리 */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
          boxShadow: 'inset 0 0 0 2px rgba(193, 154, 107, 0.5)'
        }}></div>
        
        {/* 호버 시 관리 버튼 */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500">
          <div className="flex flex-col items-center gap-3">
            {/* Play 아이콘 */}
            <div className="w-16 h-16 rounded-full backdrop-blur-xl flex items-center justify-center transition-all duration-500" style={{
              background: 'rgba(193, 154, 107, 0.15)',
              boxShadow: '0 0 30px rgba(193, 154, 107, 0.3), inset 0 0 20px rgba(255,255,255,0.1)',
              border: '2px solid rgba(193, 154, 107, 0.4)'
            }}>
              <Play className="w-8 h-8" style={{ color: '#E6C9A8', fill: '#E6C9A8' }} />
            </div>
            
            {/* 버튼들 */}
            <div className="flex items-center gap-2">
              {/* Featured 버튼 */}
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFeatured();
                }}
                className={`h-7 px-3 border-0 text-white text-xs transition-all ${
                  game.is_featured
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-slate-700 hover:bg-slate-600"
                }`}
                title={game.is_featured ? t.gameManagement.removeFeatured : t.gameManagement.setFeatured}
              >
                <Star className={`w-3 h-3 ${game.is_featured ? "fill-white" : ""}`} />
              </Button>
              
              {/* 상태 변경 Select */}
              <Select
                value={
                  isBlocked 
                    ? "hidden" 
                    : userLevel === 2 
                      ? (game.is_visible ? "visible" : "hidden")
                      : game.status
                }
                onValueChange={(value: "visible" | "maintenance" | "hidden") => {
                  onChangeStatus(value);
                }}
              >
                <SelectTrigger 
                  className="h-7 w-24 text-xs bg-slate-800/90 border-slate-600 text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visible">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Eye className="w-3 h-3" />
                      {t.gameManagement.visible}
                    </div>
                  </SelectItem>
                  {/* Lv1만 점검중 옵션 사용 가능 */}
                  {userLevel === 1 && (
                    <SelectItem value="maintenance">
                      <div className="flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="w-3 h-3" />
                        {t.gameManagement.maintenance}
                      </div>
                    </SelectItem>
                  )}
                  <SelectItem value="hidden">
                    <div className="flex items-center gap-1.5 text-xs">
                      <EyeOff className="w-3 h-3" />
                      {t.gameManagement.hidden}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* 상태 아이콘 */}
            <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded">
              {getStatusIcon()}
            </div>
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
  blockedGameIds?: Set<number>; // Lv2+에서 partner_game_access에 의해 차단된 게임 목록
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
  blockedGameIds = new Set(),
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
    // Lv1: provider.status 기반 아이콘 표시
    if (userLevel === 1) {
      const status = provider.status || "visible";
      if (status === "visible") {
        return <Eye className="w-4 h-4 text-green-400" />;
      } else if (status === "maintenance") {
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      } else {
        return <EyeOff className="w-4 h-4 text-slate-400" />;
      }
    }
    
    // Lv2: provider.is_visible 기반 아이콘 표시
    if (userLevel === 2) {
      return provider.is_visible 
        ? <Eye className="w-4 h-4 text-green-400" /> 
        : <EyeOff className="w-4 h-4 text-slate-400" />;
    }
    
    // Lv3~Lv7: partner_game_access 차단 상태 확인 (블랙리스트 방식)
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
        <div className="flex items-center gap-3">
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
          
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{provider.name_ko || provider.name}</span>
            {getProviderStatusIcon()}
            <Badge variant="outline" className="text-sm font-semibold border-slate-600">
              {provider.api_type.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-base font-medium flex items-center gap-2">
            <span className="text-white">총 <span className="font-bold">{stats.total}</span>개 게임</span>
            <span className="text-slate-500">·</span>
            <span className="text-green-400">노출 <span className="font-bold">{stats.visible}</span>개</span>
            <span className="text-slate-500">·</span>
            <span className="text-yellow-400">점검 <span className="font-bold">{stats.maintenance}</span>개</span>
            <span className="text-slate-500">·</span>
            <span className="text-red-500">숨김 <span className="font-bold">{stats.hidden}</span>개</span>
          </div>
          
          <Select
            value={
              isBlocked 
                ? "hidden" 
                : userLevel === 2 
                  ? (provider.is_visible ? "visible" : "hidden")
                  : (provider.status || "visible")
            }
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
              {/* Lv1만 점검중 옵션 사용 가능 */}
              {userLevel === 1 && (
                <SelectItem value="maintenance">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    {t.gameManagement.maintenance}
                  </div>
                </SelectItem>
              )}
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              {games.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isSelected={selectedGameIds.has(game.id)}
                  onToggleSelection={() => onToggleGameSelection(game.id)}
                  onToggleFeatured={() => onToggleGameFeatured(game.id)}
                  onChangeStatus={(status) => onChangeGameStatus(game.id, status, game.api_type)}
                  isBlocked={blockedGameIds.has(game.id)}
                  userLevel={userLevel}
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
  const [allGames, setAllGames] = useState<Game[]>([]); // ⭐ 모든 API의 모든 게임 (차단 관리용)
  
  const [selectedApi, setSelectedApi] = useState<ApiType | null>(null);
  const [selectedGameType, setSelectedGameType] = useState<GameType>("casino");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGameIds, setSelectedGameIds] = useState<Set<number>>(new Set());
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<number>>(new Set());

  // 탭 상태
  const [activeTab, setActiveTab] = useState<TabType>("games");

  // 권한별 사용 가��한 탭 결정
  const availableTabs = useMemo(() => {
    const tabs: TabType[] = [];
    
    if (user.level === 1) {
      // Lv1: 게임 관리만
      tabs.push("games");
    } else if (user.level === 2) {
      // Lv2: 매장 게임 관리 + 사용자 게임 관리
      tabs.push("stores", "users");
    } else if (user.level === 6) {
      // Lv6: 매장별 게임 + 사용자별 게임 (Lv7 사용자 선택)
      tabs.push("stores", "users");
    }
    // Lv3~Lv5, Lv7은 빈 배열
    
    return tabs;
  }, [user.level]);

  // 권한에 따라 초기 탭 설정
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [availableTabs, activeTab]);

  // Lv2+ 파트너의 차단된 제공사 및 게임 목록 (partner_game_access)
  const [blockedProviderIds, setBlockedProviderIds] = useState<Set<number>>(new Set());
  const [blockedGameIds, setBlockedGameIds] = useState<Set<number>>(new Set());

  // 매장별 게임 설정 상태
  const [stores, setStores] = useState<Partner[]>([]);
  const [selectedStore, setSelectedStore] = useState<Partner | null>(null);
  const [storeBlockedGames, setStoreBlockedGames] = useState<number[]>([]); // 차단된 게임 목록 (레코드 있음 = 차단)
  const [storeBlockedProviders, setStoreBlockedProviders] = useState<number[]>([]); // 차단된 제공사 목록
  const [storeGameStatus, setStoreGameStatus] = useState<any[]>([]); // 매장별 게임 상태 (partner_game_access raw data)
  const [loadingStores, setLoadingStores] = useState(false);
  const [storeSelectedApis, setStoreSelectedApis] = useState<ApiType[]>([]); // Lv2의 selected_apis

  // 사용자별 게임 설정 상태
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userBlockedGames, setUserBlockedGames] = useState<number[]>([]); // 차단된 게임 목록 (레코드 있음 = 차단)
  const [userBlockedProviders, setUserBlockedProviders] = useState<number[]>([]); // 차단된 제공사 목록
  const [userGameStatus, setUserGameStatus] = useState<Map<number, 'visible' | 'maintenance' | 'hidden'>>(new Map()); // 게임별 상태
  const [storeBlockedForUser, setStoreBlockedForUser] = useState<{ providers: number[], games: number[] }>({ providers: [], games: [] }); // 매장에서 차단된 목록 (사용자 탭용)
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
    // ⭐⭐⭐ selectedApi가 null이면 빈 배열 리턴 (초기화 타이밍 이슈 방지)
    if (!selectedApi) {
      return [];
    }
    
    // 1. 선택한 API의 모든 제공사
    const apiProviders = providers.filter(p => p.api_type === selectedApi);
    
    // 2. 선택한 게임 타입의 게임을 보유한 제공사만 필터링
    const filteredProviders = apiProviders.filter(provider => {
      // ✅ Lv2+는 Lv1이 노출한 제공사만 볼 수 있음
      if (user.level > 1 && provider.status !== "visible") {
        return false;
      }
      
      // ⭐⭐⭐ 매장은 모든 게임사를 관리 목적으로 봐야 함 - 차단 필터링 제거!
      
      const hasGamesOfType = games.some(game => {
        if (game.provider_id !== provider.id) return false;
        if (game.api_type !== selectedApi) return false;
        
        // ✅ selectedGameType이 "all"이 아닐 때만 타입 필터링 적용
        if (selectedGameType !== "all" && game.type !== selectedGameType) {
          return false;
        }
        
        return true;
      });
      
      return hasGamesOfType;
    });
    
    console.log(`📊 [게임 관리 탭] 제공사 필터링 결과:`, {
      selectedApi,
      selectedGameType,
      userLevel: user.level,
      totalProviders: apiProviders.length,
      blockedProviderIds: Array.from(blockedProviderIds),
      filteredCount: filteredProviders.length,
      filteredProviders: filteredProviders.map(p => ({ id: p.id, name: p.name }))
    });
    
    return filteredProviders;
  }, [providers, selectedApi, selectedGameType, games, user.level, blockedProviderIds]);

  // 제공사별 게임 그룹화
  const providerGamesMap = useMemo(() => {
    const map = new Map<number, Game[]>();
    
    // ✅ 띄어쓰기 무시 검색
    const searchNormalized = debouncedSearchTerm.replace(/\s/g, '').toLowerCase();
    
    currentProviders.forEach(provider => {
      const providerNameNormalized = provider.name.replace(/\s/g, '').toLowerCase();
      
      const providerGames = games.filter(game => {
        const matchesProvider = game.provider_id === provider.id;
        const matchesApi = game.api_type === selectedApi;
        // ✅ selectedGameType이 "all"이 아닐 때만 타입 필터링 적용
        const matchesType = selectedGameType === "all" || game.type === selectedGameType;
        
        if (!matchesProvider || !matchesApi || !matchesType) {
          return false;
        }
        
        // ✅ Lv2+는 Lv1이 노출한 게임만 볼 수 있음
        if (user.level > 1 && game.status !== "visible") {
          return false;
        }
        
        // 검색어가 없으면 모든 게임 표시
        if (!searchNormalized) {
          return true;
        }
        
        // ✅ 띄어쓰기 무시하고 제공사명 또는 게임명에서 검색 (한 글자만 매핑되어도 검색)
        const gameNameNormalized = game.name.replace(/\s/g, '').toLowerCase();
        const gameNameKoNormalized = (game.name_ko || '').replace(/\s/g, '').toLowerCase();
        const matchesProviderName = providerNameNormalized.includes(searchNormalized);
        const matchesGameName = gameNameNormalized.includes(searchNormalized);
        const matchesGameNameKo = gameNameKoNormalized.includes(searchNormalized);
        
        return matchesProviderName || matchesGameName || matchesGameNameKo;
      });
      
      // 게임이 있는 제공사만 맵에 추가
      if (providerGames.length > 0) {
        map.set(provider.id, providerGames);
      }
    });
    
    return map;
  }, [games, currentProviders, selectedApi, selectedGameType, debouncedSearchTerm, user.level]);

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
    if (selectedApi && allGames.length > 0) {
      loadGames();
    }
  }, [selectedApi, allGames]);

  // ⚡ 최적화된 초기 데이터 로드
  const initializeData = async () => {
    try {
      // ⚡ 병렬로 모든 초기 데이터 조회
      console.log(`🔍 [Lv${user.level}] 초기 데이터 병렬 조회 시작...`);
      
      const [providersData, blockedProviders, blockedGames, allGamesData] = await Promise.all([
        gameApi.getProviders({ partner_id: user.id }),
        gameApi.getPartnerBlockedProviders(user.id),
        gameApi.getPartnerBlockedGames(user.id),
        gameApi.getGames({}) // 모든 API의 게임 로드 (차단 관리용)
      ]);

      // 상태 업데이트
      setProviders(providersData);
      setBlockedProviderIds(blockedProviders);
      setBlockedGameIds(blockedGames);
      setAllGames(allGamesData);
      
      console.log(`✅ [Lv${user.level}] 초기 데이터 로드 완료: 제공사 ${providersData.length}개, 차단된 제공사 ${blockedProviders.size}개, 차단된 게임 ${blockedGames.size}개, 전체 게임 ${allGamesData.length}개`);

      // 첫 번째 API 선택 및 게임 로드
      const uniqueApiTypes = [...new Set(providersData.map(p => p.api_type))];
      if (uniqueApiTypes.length > 0 && !selectedApi) {
        const firstApi = uniqueApiTypes[0];
        setSelectedApi(firstApi);
        
        // 첫 API의 게임만 필터링
        const apiGames = allGamesData.filter(g => g.api_type === firstApi);
        setGames(apiGames);
      }
    } catch (error) {
      console.error("❌ 초기 데이터 로드 실패:", error);
      toast.error(t.transactionManagement.loadDataFailed);
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

  // ⭐ 모든 API의 게임 로드 (차단 관리용)
  const loadAllGamesForBlocking = async () => {
    try {
      console.log('🔄 모든 API의 게임 로드 시작...');
      const allGamesData = await gameApi.getGames({}); // api_type 없이 모든 게임 조회
      setAllGames(allGamesData);
      console.log(`✅ 모든 게임 로드 완료: ${allGamesData.length}개`);
    } catch (error) {
      console.error('❌ 모든 게임 로드 실패:', error);
    }
  };

  // ⚡ API 변경 시 게임 로드 (로딩 없이)
  const loadGames = async () => {
    if (!selectedApi) {
      setGames([]);
      return;
    }

    // allGames에서 필터링
    const apiGames = allGames.filter(g => g.api_type === selectedApi);
    setGames(apiGames);
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
      
      // ✅ 게임 데이터도 다시 로드 (UI 업데이트를 위해)
      if (selectedApi) {
        await loadGamesForApi(selectedApi);
      }
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
    console.log(`🎮 handleChangeGameStatus 호출: gameId=${gameId}, status=${status}, apiType=${apiType}, userLevel=${user.level}`);
    
    try {
      if (user.level === 1) {
        // ✅ Lv1: games/honor_games 테이블의 status 컬럼 업데이트
        console.log(`🔄 [Lv1] gameApi.updateGameStatus 호출 시작...`);
        await gameApi.updateGameStatus(gameId, status, apiType);
        console.log(`✅ [Lv1] gameApi.updateGameStatus 완료`);

        const statusText = status === "visible" ? "노출" : status === "maintenance" ? "점검중" : "숨김";
        toast.success(`게임 상태가 ${statusText}로 변경되었습니다.`);
        
        // ✅ DB에서 최신 상태 다시 로드
        if (selectedApi) {
          await loadGamesForApi(selectedApi);
        }
      } else if (user.level === 2) {
        // ✅ Lv2: games/honor_games 테이블의 is_visible 컬럼 업데이트
        console.log(`🔄 [Lv2] gameApi.updateGameVisibility 호출 시작...`);
        await gameApi.updateGameVisibility(gameId, status === "visible", apiType);
        console.log(`✅ [Lv2] gameApi.updateGameVisibility 완료`);

        const statusText = status === "visible" ? "노출" : "숨김";
        toast.success(`게임 상태가 ${statusText}로 변경되었습니다.`);
        
        // ✅ DB에서 최신 상태 다시 로드
        if (selectedApi) {
          await loadGamesForApi(selectedApi);
        }
      } else {
        // ✅ Lv3~Lv7: partner_game_access 테이블 사용 (블랙리스트 방식)
        console.log(`🔄 [Lv${user.level}] gameApi.updatePartnerGameAccess 호출 시작...`);
        
        const game = games.find(g => g.id === gameId);
        if (!game) {
          toast.error("게임을 찾을 수 없습니다.");
          return;
        }
        
        await gameApi.updatePartnerGameAccess(
          user.id,
          gameId,
          apiType,
          game.provider_id,
          status === "visible"
        );
        console.log(`✅ [Lv${user.level}] gameApi.updatePartnerGameAccess 완료`);

        const statusText = status === "visible" ? "노출" : "숨김";
        toast.success(`게임 상태가 ${statusText}로 변경되었습니다.`);
        
        // ✅ 차단 목록 다시 로드
        const [blockedProviders, blockedGames] = await Promise.all([
          gameApi.getPartnerBlockedProviders(user.id),
          gameApi.getPartnerBlockedGames(user.id)
        ]);
        setBlockedProviderIds(blockedProviders);
        setBlockedGameIds(blockedGames);
      }
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
      if (user.level === 1) {
        // ✅ Optimistic Update: UI 즉시 반영
        const originalProviders = [...providers];
        setProviders(prev => prev.map(p => 
          p.id === providerId && p.api_type === apiType
            ? { ...p, status }
            : p
        ));

        // ✅ Lv1: games_provider/honor_games_provider 테이블의 status 컬럼 업데이트
        console.log(`🔄 [Lv1] gameApi.updateProviderStatus 호출 시작...`);
        try {
          await gameApi.updateProviderStatus(providerId, status, apiType);
          console.log(`✅ [Lv1] gameApi.updateProviderStatus 완료`);

          const statusText = status === "visible" ? "노출" : status === "maintenance" ? "점검중" : "숨김";
          toast.success(`제공사 상태가 ${statusText}로 변경되었습니다.`);
          
          // ✅ 해당 API의 게임 목록만 다시 로드 (깜박임 최소화)
          if (selectedApi === apiType) {
            await loadGamesForApi(apiType);
          }
        } catch (error) {
          // ❌ 실패 시 롤백
          console.error("❌ 제공사 상태 업데이트 실패:", error);
          setProviders(originalProviders);
          toast.error("제공사 상태 변경에 실패했습니다.");
        }
      } else if (user.level === 2) {
        // ✅ Optimistic Update: UI 즉시 반영
        const originalProviders = [...providers];
        setProviders(prev => prev.map(p => 
          p.id === providerId && p.api_type === apiType
            ? { ...p, is_visible: status === "visible" }
            : p
        ));

        // ✅ Lv2: games_provider/honor_games_provider 테이블의 is_visible 컬럼 업데이트
        console.log(`🔄 [Lv2] gameApi.updateProviderVisibility 호출 시작...`);
        try {
          await gameApi.updateProviderVisibility(providerId, status === "visible", apiType);
          console.log(`✅ [Lv2] gameApi.updateProviderVisibility 완료`);

          const statusText = status === "visible" ? "노출" : "숨김";
          toast.success(`제공사 상태가 ${statusText}로 변경되었습니다.`);
          
          // ✅ 해당 API의 게임 목록만 다시 로드 (깜박임 최소화)
          if (selectedApi === apiType) {
            await loadGamesForApi(apiType);
          }
        } catch (error) {
          // ❌ 실패 시 롤백
          console.error("❌ 제공사 상태 업데이트 실패:", error);
          setProviders(originalProviders);
          toast.error("제공사 상태 변경에 실패했습니다.");
        }
      } else {
        // ✅ Optimistic Update: 차단 목록 즉시 반영
        const originalBlockedProviders = new Set(blockedProviderIds);
        if (status === "visible") {
          setBlockedProviderIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(providerId);
            return newSet;
          });
        } else {
          setBlockedProviderIds(prev => new Set(prev).add(providerId));
        }

        // ✅ Lv3~Lv7: partner_game_access 테이블 사용 (블랙리스트 방식)
        console.log(`🔄 [Lv${user.level}] gameApi.updatePartnerProviderAccess 호출 시작...`);
        try {
          await gameApi.updatePartnerProviderAccess(
            user.id,
            providerId,
            apiType,
            status === "visible"
          );
          console.log(`✅ [Lv${user.level}] gameApi.updatePartnerProviderAccess 완료`);

          const statusText = status === "visible" ? "노출" : "숨김";
          toast.success(`제공사 상태가 ${statusText}로 변경되었습니다.`);
        } catch (error) {
          // ❌ 실패 시 롤백
          console.error("❌ 제공사 상태 업데이트 실패:", error);
          setBlockedProviderIds(originalBlockedProviders);
          toast.error("제공사 상태 변경에 실패했습니다.");
        }
      }
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
    console.log(`📦 handleBulkStatusChange 호출: ${selectedGameIds.size}개 게임, status=${status}, userLevel=${user.level}`);
    
    if (selectedGameIds.size === 0) {
      toast.warning("게임을 선택해주세요.");
      return;
    }

    try {
      if (user.level === 1) {
        // ✅ Lv1: games/honor_games 테이블 직접 일괄 업데이트
        console.log(`🔄 [Lv1] gameApi.bulkUpdateStatus 호출 시작...`);
        await gameApi.bulkUpdateStatus(Array.from(selectedGameIds), status);
        console.log(`✅ [Lv1] gameApi.bulkUpdateStatus 완료`);

        const statusText = status === "visible" ? "노출" : status === "maintenance" ? "점검중" : "숨김";
        toast.success(`${selectedGameIds.size}개 게임 상태가 ${statusText}로 변경되었습니다.`);
        
        // ✅ DB에서 최신 상태 다시 로드
        if (selectedApi) {
          await loadGamesForApi(selectedApi);
        }
      } else {
        // ✅ Lv2~Lv7: partner_game_access 테이블 사용 (블랙리스트 방식)
        console.log(`🔄 [Lv${user.level}] gameApi.updatePartnerGameAccess 일괄 호출 시작...`);
        
        const isVisible = status === "visible";
        const selectedGames = games.filter(g => selectedGameIds.has(g.id));
        
        for (const game of selectedGames) {
          await gameApi.updatePartnerGameAccess(
            user.id,
            game.id,
            game.api_type,
            game.provider_id,
            isVisible
          );
        }
        
        console.log(`✅ [Lv${user.level}] gameApi.updatePartnerGameAccess ���괄 완료`);

        const statusText = status === "visible" ? "노출" : "숨김";
        toast.success(`${selectedGameIds.size}개 게임 상태가 ${statusText}로 변경되었습니다.`);
        
        // ✅ 차단 목록 다시 로드
        const [blockedProviders, blockedGames] = await Promise.all([
          gameApi.getPartnerBlockedProviders(user.id),
          gameApi.getPartnerBlockedGames(user.id)
        ]);
        setBlockedProviderIds(blockedProviders);
        setBlockedGameIds(blockedGames);
      }
      
      setSelectedGameIds(new Set());
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

      if (user.level === 1) {
        // ✅ Optimistic Update: UI 즉시 반영
        const originalProviders = [...providers];
        setProviders(prev => prev.map(p => 
          providerIds.includes(p.id) && p.api_type === selectedApi
            ? { ...p, status }
            : p
        ));

        // ✅ Lv1: games_provider/honor_games_provider 테이블 직접 업데이트
        console.log(`🔄 [Lv1] 제공사 일괄 상태 업데이트 시작...`);
        
        try {
          // 각 제공사별로 상태 업데이트
          for (const providerId of providerIds) {
            await gameApi.updateProviderStatus(providerId, status, selectedApi);
          }
          
          console.log(`✅ [Lv1] ${providerIds.length}개 제공사 상태 업데이트 완료`);
          
          const statusText = status === "visible" ? "노출" : "숨김";
          toast.success(`${selectedApi.toUpperCase()} API의 ${providerIds.length}개 제공사가 ${statusText} 처리되었습니다.`);
          
          // ✅ 게임 데이터만 다시 로드 (깜박임 최소화)
          if (selectedApi) {
            await loadGamesForApi(selectedApi);
          }
        } catch (error) {
          // ❌ 실패 시 롤백
          console.error("❌ 제공사 일괄 업데이트 실패:", error);
          setProviders(originalProviders);
          toast.error("일괄 상태 변경에 실패했습니다.");
        }
      } else {
        // ✅ Optimistic Update: 차단 목록 즉시 반영
        const originalBlockedProviders = new Set(blockedProviderIds);
        if (status === "visible") {
          setBlockedProviderIds(prev => {
            const newSet = new Set(prev);
            providerIds.forEach(id => newSet.delete(id));
            return newSet;
          });
        } else {
          setBlockedProviderIds(prev => {
            const newSet = new Set(prev);
            providerIds.forEach(id => newSet.add(id));
            return newSet;
          });
        }

        // ✅ Lv2~Lv7: partner_game_access 테이블 사용 (블랙리스트 방식)
        console.log(`🔄 [Lv${user.level}] gameApi.updatePartnerApiAccess 호출...`);
        try {
          await gameApi.updatePartnerApiAccess(
            user.id,
            selectedApi as "invest" | "oroplay" | "familyapi" | "honorapi",
            providerIds,
            status === "visible"
          );
          console.log(`✅ [Lv${user.level}] gameApi.updatePartnerApiAccess 완료`);

          const statusText = status === "visible" ? "노출" : "숨김";
          toast.success(`${selectedApi.toUpperCase()} API의 모든 제공사가 ${statusText} 처리되었습니다.`);
        } catch (error) {
          // ❌ 실패 시 롤백
          console.error("❌ API 일괄 상태 업데이트 실패:", error);
          setBlockedProviderIds(originalBlockedProviders);
          toast.error("일괄 상태 변경에 실패했습니다.");
        }
      }
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
      console.log("👤 사용자 상세 - ID:", user.id, "Level:", user.level, "Username:", user.username);
      
      // ⭐ 모든 게임 로드 (차단 관리용)
      await loadAllGamesForBlocking();
      
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
      console.log("📋 전체 매장 목록:", allStores?.map(s => ({ 
        id: s.id, 
        username: s.username, 
        parent_id: s.parent_id 
      })));
      
      // Lv1이면 모든 매장 표시
      if (user.level === 1) {
        console.log("✅ Lv1 사용자 - 모든 매장 표시");
        setStores(allStores || []);
        return;
      }
      
      // Lv2~Lv5: 모든 하위 파트너 ID를 재귀적으로 가져오기
      const getAllChildPartnerIds = async (partnerId: string): Promise<string[]> => {
        const partnerIds: string[] = [];
        const queue: string[] = [partnerId];
        
        console.log("🔄 하위 파트너 조회 시작 - 시작 ID:", partnerId);

        while (queue.length > 0) {
          const currentId = queue.shift()!;
          console.log("  🔎 현재 처리 중:", currentId);
          
          // 직속 하위 파트너 조회
          const { data, error } = await supabase
            .from('partners')
            .select('id, username, level, parent_id')
            .eq('parent_id', currentId);
          
          console.log(`  📊 ${currentId}의 하위 파트너:`, data?.length || 0, "개");
          console.log(`  📋 상세:`, data?.map(p => ({ id: p.id, username: p.username, level: p.level })));

          if (!error && data) {
            for (const partner of data) {
              partnerIds.push(partner.id);
              queue.push(partner.id);
            }
          }
        }
        
        console.log("✅ 최종 하위 파트너 ID:", partnerIds);
        return partnerIds;
      };
      
      // 현재 사용자의 모든 하위 파트너 ID 가져오기
      const childPartnerIds = await getAllChildPartnerIds(user.id);
      console.log("📋 하위 파트너 ID 목록 (총 " + childPartnerIds.length + "개):", childPartnerIds);
      
      // 매장의 parent_id가 하위 파트너 목록에 포함되는지 확인
      const filteredStores = (allStores || []).filter(store => {
        const isChild = childPartnerIds.includes(store.parent_id);
        console.log(`🔎 매장: ${store.username} (parent_id: ${store.parent_id}) → ${isChild ? '✅ 포함' : '❌ 제외'}`);
        return isChild;
      });
      
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
      // ✅ is_allowed=false인 레코드만 차단 (블랙리스트 방식)
      const { data, error } = await supabase
        .from("partner_game_access")
        .select("game_id, game_provider_id, access_type, is_allowed, api_provider, game_status")
        .eq("partner_id", storeId)
        .is("user_id", null) // 매장 전체 설정 (사용자별 아님)
        .eq("is_allowed", false); // ✅ 차단된 항목만 조회

      if (error) throw error;

      console.log('🔍 [loadStoreGameAccess] DB 조회 결과:', data?.length || 0, '개');
      console.log('📋 [loadStoreGameAccess] 샘플 데이터:', data?.slice(0, 5));

      // 게임 상태 저장 (raw data)
      setStoreGameStatus(data || []);

      // 1. 제공사 차단 확인 (access_type: 'provider', is_allowed: false)
      const blockedProviderIds = (data || [])
        .filter(access => access.access_type === 'provider' && access.game_provider_id)
        .map(access => parseInt(access.game_provider_id))
        .filter(id => !isNaN(id));

      // 2. 개별 게임 차단 확인 (access_type: 'game', is_allowed: false)
      // ⭐ game_id를 그대로 사용 (숫자/문자열 모두 대응)
      const blockedGameIds = (data || [])
        .filter(access => access.access_type === 'game' && access.game_id)
        .map(access => {
          const gameId = access.game_id;
          // game_id가 숫자면 그대로, 문자열이면 파싱
          return typeof gameId === 'number' ? gameId : parseInt(gameId);
        })
        .filter(id => !isNaN(id));
      
      console.log('🎮 [loadStoreGameAccess] 차단된 게임 ID:', blockedGameIds.length, '개', blockedGameIds.slice(0, 10));

      // 3. 차단된 제공사의 모든 게임도 차단 목록에 추가
      // ⭐ 메모리상의 games 배열에서 직접 조회 (Supabase는 동기화 안 된 게임 못 찾음!)
      let providerBlockedGameIds: number[] = [];
      if (blockedProviderIds.length > 0) {
        console.log('🔍 [매장 차단] 차단된 제공사의 게임 조회 시작:', blockedProviderIds);
        
        // ✅ allGames 배열에서 직접 필터링 (모든 API의 게임 포함)
        providerBlockedGameIds = allGames
          .filter(g => blockedProviderIds.includes(g.provider_id))
          .map(g => g.id);
        
        console.log('✅ [매장 차단] 조회된 게임:', providerBlockedGameIds.length, '개');
        console.log('📋 [매장 차단] 게임 ID 샘플 (최대 10개):', providerBlockedGameIds.slice(0, 10));
      }

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
      setStoreBlockedForUser({ providers: [], games: [] }); // 매장 차단 목록 초기화
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
    // ✅ allGames에서 찾기 (모든 API의 게임 포함)
    const game = allGames.find(g => g.id === gameId);
    if (!game) {
      console.error(`❌ 게임 ID ${gameId}를 찾을 수 없습니다.`);
      return;
    }

    // ✅ Optimistic Update: UI에 즉시 반영
    const previousBlockedGames = storeBlockedGames;
    setStoreBlockedGames(prev =>
      newBlockedStatus
        ? [...prev, gameId]
        : prev.filter(id => id !== gameId)
    );

    try {
      if (newBlockedStatus) {
        // 게임 차단: 레코드 생성
        const { error } = await supabase
          .from("partner_game_access")
          .upsert({
            partner_id: selectedStore.id,
            api_provider: game.api_type,
            game_provider_id: null, // ⭐ 명시적으로 NULL 설정!
            game_id: gameId, // ✅ 숫자 타입으로 전달
            access_type: "game",
            is_allowed: false,
          }, {
            onConflict: 'partner_id,user_id,api_provider,game_provider_id,game_id,access_type',
            ignoreDuplicates: false
          });

        if (error) throw error;
      } else {
        // 게임 허용: 레코드 삭제
        const { error } = await supabase
          .from("partner_game_access")
          .delete()
          .eq("partner_id", selectedStore.id)
          .is("user_id", null)
          .eq("api_provider", game.api_type) // ⭐ API 제공사도 체크!
          .eq("game_id", gameId) // ✅ 숫자 타입으로 전달
          .eq("access_type", "game");

        if (error) throw error;
      }

      toast.success(newBlockedStatus ? "게임을 차단했습니다." : "게임 차단을 해제했습니다.");
    } catch (error) {
      console.error("❌ 게임 접근 권한 업데이트 실패:", error);
      toast.error("게임 접근 권한 업데이트에 실패했습니다.");
      
      // ✅ Rollback: 에러 발생 시 이전 상태로 복원
      setStoreBlockedGames(previousBlockedGames);
    }
  };

  // ✅ 매장관리: 개별 게임 상태 변경 (visible/maintenance/hidden)
  const handleChangeStoreGameStatus = async (gameId: number, status: 'visible' | 'maintenance' | 'hidden') => {
    if (!selectedStore) return;

    console.log('🎮 매장 게임 상태 변경:', { gameId, status, storeId: selectedStore.id });
    
    const game = allGames.find(g => g.id === gameId);
    if (!game) {
      console.error(`❌ 게임 ID ${gameId}를 찾을 수 없습니다.`);
      return;
    }

    try {
      if (status === 'visible') {
        // visible: 레코드 삭제 (기본값)
        const { error } = await supabase
          .from("partner_game_access")
          .delete()
          .eq("partner_id", selectedStore.id)
          .is("user_id", null)
          .eq("api_provider", game.api_type)
          .eq("game_id", gameId)
          .eq("access_type", "game");

        if (error) throw error;
        
        toast.success("게임이 노출되었습니다.");
      } else {
        // maintenance 또는 hidden: 레코드 생성/업데이트
        const { error } = await supabase
          .from("partner_game_access")
          .upsert({
            partner_id: selectedStore.id,
            user_id: null,
            api_provider: game.api_type,
            game_provider_id: null,
            game_id: gameId,
            access_type: "game",
            is_allowed: false,
            game_status: status,
          }, {
            onConflict: 'partner_id,user_id,api_provider,game_provider_id,game_id,access_type',
            ignoreDuplicates: false
          });

        if (error) throw error;
        
        const statusText = status === 'maintenance' ? '점검중' : '숨김';
        toast.success(`게임이 ${statusText} 상태로 변경되었습니다.`);
      }

      await loadStoreGameAccess(selectedStore.id);
    } catch (error) {
      console.error("❌ 매장 게임 상태 변경 실패:", error);
      toast.error("게임 상태 변경에 실패했습니다.");
    }
  };

  const handleBulkStoreGameAccess = async (allow: boolean) => {
    if (!selectedStore || !selectedApi) {
      toast.warning("매장과 API를 선택해주세요.");
      return;
    }

    // 현재 필터된 게임 목록 (API + 게임타입)
    const filteredGames = games.filter(g => {
      if (g.api_type !== selectedApi) return false;
      if (selectedGameType !== "all" && g.type !== selectedGameType) return false;
      return true;
    });

    if (filteredGames.length === 0) {
      toast.warning("게임이 없습니다.");
      return;
    }

    // ✅ Optimistic Update: UI에 즉시 반영
    const previousBlockedGames = storeBlockedGames;
    
    if (allow) {
      // 전체 노출: 차단 목록에서 제거
      const gameIdsToShow = new Set(filteredGames.map(g => g.id));
      setStoreBlockedGames(prev => prev.filter(id => !gameIdsToShow.has(id)));
    } else {
      // 전체 숨김: 차단 목록에 추가
      const newBlockedIds = filteredGames.map(g => g.id);
      setStoreBlockedGames(prev => [...new Set([...prev, ...newBlockedIds])]);
    }

    try {
      if (allow) {
        // 전체 노출: 차단 레코드 삭제 (블랙리스트에서 제거)
        const gameIdsToAllow = filteredGames
          .filter(g => previousBlockedGames.includes(g.id))
          .map(g => g.id);
        
        if (gameIdsToAllow.length > 0) {
          const { error } = await supabase
            .from("partner_game_access")
            .delete()
            .eq("partner_id", selectedStore.id)
            .is("user_id", null)
            .eq("api_provider", selectedApi)
            .eq("access_type", "game")
            .in("game_id", gameIdsToAllow);

          if (error) throw error;
        }
      } else {
        // 전체 숨김: 차단 레코드 추가 (블랙리스트에 추가)
        const accessRecords = filteredGames
          .filter(g => !previousBlockedGames.includes(g.id))
          .map(game => ({
            partner_id: selectedStore.id,
            api_provider: game.api_type,
            game_id: game.id,
            access_type: "game" as const,
            is_allowed: false,
            game_status: "hidden" as const,
          }));

        if (accessRecords.length > 0) {
          const { error } = await supabase
            .from("partner_game_access")
            .insert(accessRecords);

          if (error) throw error;
        }
      }

      toast.success(
        allow
          ? `${filteredGames.length}개 게임이 노출되었습니다.`
          : `${filteredGames.length}개 게임이 숨겨졌습니다.`
      );
    } catch (error) {
      console.error("❌ 일괄 게임 접근 권한 업데이트 실패:", error);
      toast.error("일괄 업데이트에 실패했습니다.");
      
      // ✅ Rollback: 에러 발생 시 이전 상태로 복원
      setStoreBlockedGames(previousBlockedGames);
    }
  };

  // ✅ 매장별 게임 탭: 전체 제공사 노출/숨김 (API + 게임타입별)
  const handleBulkStoreProviderAccess = async (showAll: boolean) => {
    if (!selectedApi) {
      toast.warning("API를 선택해주세요.");
      return;
    }

    try {
      // 현재 필터된 제공사 목록 (API + 게임타입)
      const filteredProviders = providers.filter(p => {
        if (p.api_type !== selectedApi) return false;
        if (selectedGameType !== "all" && p.type !== selectedGameType) return false;
        
        // 해당 제공사의 게임이 있는지 확인
        const hasGames = games.some(g => 
          g.provider_id === p.id &&
          g.api_type === selectedApi &&
          (selectedGameType === "all" || g.type === selectedGameType)
        );
        
        return hasGames;
      });

      if (filteredProviders.length === 0) {
        toast.warning("제공사가 없습니다.");
        return;
      }

      const apiLabel = selectedApi.toUpperCase();
      const typeLabel = selectedGameType === "all" ? "전체" : 
                       selectedGameType === "casino" ? "카지노" :
                       selectedGameType === "slot" ? "슬롯" : "미니게임";

      // ✅ Lv1: status 컬럼 업데이트
      if (user.level === 1) {
        const status = showAll ? "visible" : "hidden";
        
        for (const provider of filteredProviders) {
          await gameApi.updateProviderStatus(provider.id, status, provider.api_type);
        }
        
        toast.success(`${apiLabel} ${typeLabel} 제공사 ${filteredProviders.length}개를 전체 ${showAll ? "노출" : "숨김"}했습니다.`);
        
        // DB에서 최신 상태 다시 로드
        await loadGamesForApi(selectedApi);
        return;
      }

      // ✅ Lv2: is_visible 컬럼 업데이트
      if (user.level === 2) {
        const isVisible = showAll;
        
        console.log(`🔄 [Lv2] 전체 ${showAll ? "노출" : "숨김"} 시작:`, {
          filteredProviders: filteredProviders.length,
          isVisible,
          providerIds: filteredProviders.map(p => p.id)
        });
        
        for (const provider of filteredProviders) {
          console.log(`🔄 [Lv2] 제공사 ${provider.id} (${provider.name}) is_visible 업데이트: ${isVisible}`);
          await gameApi.updateProviderVisibility(provider.id, isVisible, provider.api_type, selectedStore?.id);
        }
        
        toast.success(`${apiLabel} ${typeLabel} 제공사 ${filteredProviders.length}개를 전체 ${showAll ? "노출" : "숨김"}했습니다.`);
        
        // DB에서 최신 상태 다시 로드
        await loadGamesForApi(selectedApi);
        return;
      }

      // ✅ Lv3~Lv7: partner_game_access 테이블 사용
      if (!selectedStore) {
        toast.warning("매장을 선택해주세요.");
        return;
      }

      // ✅ Optimistic Update: UI에 즉시 반영
      const previousBlockedProviders = storeBlockedProviders;
      if (showAll) {
        const providerIdsSet = new Set(filteredProviders.map(p => p.id));
        setStoreBlockedProviders(prev => prev.filter(id => !providerIdsSet.has(id)));
      } else {
        const newProviderIds = filteredProviders.map(p => p.id);
        setStoreBlockedProviders(prev => [...new Set([...prev, ...newProviderIds])]);
      }

      if (showAll) {
        // ✅ 새로운 방식: 제공사 레코드만 삭제!
        const providerIdsToRemove = filteredProviders.map(p => p.id);
        const { error } = await supabase
          .from("partner_game_access")
          .delete()
          .eq("partner_id", selectedStore.id)
          .is("user_id", null)
          .eq("access_type", "provider")
          .in("game_provider_id", providerIdsToRemove);

        if (error) {
          setStoreBlockedProviders(previousBlockedProviders);
          throw error;
        }

        toast.success(`${apiLabel} ${typeLabel} 제공사 ${filteredProviders.length}개를 전체 노출했습니다.`);
      } else {
        // ✅ 새로운 방식: 제공사 레코드만 생성!
        console.log('🔍 [제공사 차단] 선택된 API:', selectedApi);
        console.log('🔍 [제공사 차단] 필터링된 제공사:', filteredProviders.map(p => ({ id: p.id, name: p.name, api_type: p.api_type })));
        
        const providerRecords = filteredProviders.map(provider => ({
          partner_id: selectedStore.id,
          api_provider: provider.api_type,
          game_provider_id: provider.id,
          game_id: null,
          access_type: "provider" as const,
          is_allowed: false,
          game_status: "hidden" as const,
        }));
        
        console.log('✅ [제공사 차단] 생성할 레코드:', providerRecords.map(r => ({ api_provider: r.api_provider, game_provider_id: r.game_provider_id })));

        // 1단계: 기존 제공사 레코드 삭제
        const providerIdsToRemove = filteredProviders.map(p => p.id);
        await supabase
          .from("partner_game_access")
          .delete()
          .eq("partner_id", selectedStore.id)
          .is("user_id", null)
          .eq("api_provider", selectedApi)
          .eq("access_type", "provider")
          .in("game_provider_id", providerIdsToRemove);

        // 2단계: 새 제공사 레코드만 생성
        const { error } = await supabase
          .from("partner_game_access")
          .insert(providerRecords);

        if (error) {
          setStoreBlockedProviders(previousBlockedProviders);
          throw error;
        }

        toast.success(`${apiLabel} ${typeLabel} 제공사 ${filteredProviders.length}개를 전체 숨김했습니다.`);
      }

      // 게임 접근 설정 다시 로드
      await loadStoreGameAccess(selectedStore.id);
    } catch (error) {
      console.error("❌ 일괄 제공사 접근 권한 업데이트 실패:", error);
      toast.error("일괄 업데이트에 실패했습니다.");
    }
  };

  // ✅ Lv2 마이그레이션: is_visible=false인 제공사를 partner_game_access에 기록
  const migrateInvisibleProvidersToAccess = async () => {
    if (user.level !== 2) {
      toast.error("Lv2 권한자만 실행할 수 있습니다.");
      return;
    }

    if (!selectedStore) {
      toast.error("매장을 먼저 선택해주세요.");
      return;
    }

    try {
      setSyncing(true);
      toast.info(`${selectedStore.username} 매장의 마이그레이션 시작...`);

      // 1. game_providers에서 is_visible=false인 제공사 조회
      const { data: invisibleProviders, error: providerError } = await supabase
        .from('game_providers')
        .select('id, api_type')
        .eq('is_visible', false);

      if (providerError) throw providerError;

      // 2. honor_game_providers에서 is_visible=false인 제공사 조회
      const { data: invisibleHonorProviders, error: honorError } = await supabase
        .from('honor_game_providers')
        .select('id, api_type')
        .eq('is_visible', false);

      if (honorError) throw honorError;

      const allInvisibleProviders = [
        ...(invisibleProviders || []),
        ...(invisibleHonorProviders || [])
      ];

      console.log(`📋 is_visible=false인 제공사: ${allInvisibleProviders.length}개`);

      if (allInvisibleProviders.length === 0) {
        toast.success("마이그레이션할 제공사가 없습니다.");
        return;
      }

      // 3. 선택된 매장의 partner_game_access에 기록
      let insertedCount = 0;
      for (const provider of allInvisibleProviders) {
        // 기존 레코드 확인
        const { data: existing } = await supabase
          .from('partner_game_access')
          .select('id')
          .eq('partner_id', selectedStore.id)
          .eq('game_provider_id', provider.id)
          .eq('api_provider', provider.api_type)
          .eq('access_type', 'provider')
          .is('user_id', null)
          .single();

        if (!existing) {
          // 레코드가 없으면 삽입
          const { error: insertError } = await supabase
            .from('partner_game_access')
            .insert({
              partner_id: selectedStore.id,
              user_id: null,
              api_provider: provider.api_type,
              game_provider_id: provider.id,
              game_id: null,
              access_type: 'provider',
              is_allowed: false,
              game_status: 'hidden',
            });

          if (!insertError) {
            insertedCount++;
          } else {
            console.error(`❌ 제공사 ${provider.id} 삽입 실패:`, insertError);
          }
        }
      }

      toast.success(`✅ ${selectedStore.username} 매장 마이그레이션 완료: ${insertedCount}개 제공사 기록 추가`);
      
      // 최신 상태 새로고침
      await loadStoreGameAccess(selectedStore.id);
    } catch (error) {
      console.error('❌ 마이그레이션 실패:', error);
      toast.error('마이그레이션에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const loadUsers = async () => {
    // ⭐ 모든 게임 로드 (차단 관리용)
    await loadAllGamesForBlocking();
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
      
      // ✅ 1. 매장(partner_id)의 차단 설정 로드
      const { data: storeData, error: storeError } = await supabase
        .from("partner_game_access")
        .select("game_id, game_provider_id, access_type, api_provider, game_status")
        .eq("partner_id", selectedStore.id)
        .is("user_id", null); // 매장 설정

      if (storeError) throw storeError;

      console.log('🏪 [loadUserGameAccess] 매장 차단 설정:', storeData?.length || 0, '개');
      
      // 🏪 매장 차단 제공사/게임 추출
      const storeBlockedProviderIds = (storeData || [])
        .filter(access => access.access_type === 'provider' && access.game_provider_id)
        .map(access => parseInt(access.game_provider_id))
        .filter(id => !isNaN(id));
      
      const storeBlockedGameIds = (storeData || [])
        .filter(access => access.access_type === 'game' && access.game_id)
        .map(access => {
          const gameId = access.game_id;
          return typeof gameId === 'number' ? gameId : parseInt(gameId);
        })
        .filter(id => !isNaN(id));

      // 매장 차단 제공사의 모든 게임도 추가
      let storeProviderBlockedGameIds: number[] = [];
      if (storeBlockedProviderIds.length > 0) {
        storeProviderBlockedGameIds = allGames
          .filter(g => storeBlockedProviderIds.includes(g.provider_id))
          .map(g => g.id);
      }

      const allStoreBlockedGameIds = [...new Set([...storeBlockedGameIds, ...storeProviderBlockedGameIds])];

      // ✅ 매장 차단 목록 저장 (UI 필터링용)
      setStoreBlockedForUser({ 
        providers: storeBlockedProviderIds, 
        games: allStoreBlockedGameIds 
      });

      console.log('🏪 매장 차단:', storeBlockedProviderIds.length, '개 제공사,', allStoreBlockedGameIds.length, '개 게임');
      
      // ✅ 2. 사용자(user_id)의 추가 차단 설정 로드
      const { data: userData, error: userError } = await supabase
        .from("partner_game_access")
        .select("game_id, game_provider_id, access_type, api_provider, game_status")
        .is("partner_id", null) // 사용자별 설정
        .eq("user_id", userId);

      if (userError) throw userError;

      console.log('👤 [loadUserGameAccess] 사용자 추가 차단:', userData?.length || 0, '개');
      
      // ✅ 3. 사용자만의 차단 설정 추출 (UI 표시용)
      const userOnlyBlockedProviderIds = (userData || [])
        .filter(access => access.access_type === 'provider' && access.game_provider_id)
        .map(access => parseInt(access.game_provider_id))
        .filter(id => !isNaN(id));

      const userOnlyBlockedGameIds = (userData || [])
        .filter(access => access.access_type === 'game' && access.game_id)
        .map(access => {
          const gameId = access.game_id;
          return typeof gameId === 'number' ? gameId : parseInt(gameId);
        })
        .filter(id => !isNaN(id));
      
      console.log('🎮 [loadUserGameAccess] 사용자 추가 차단 게임 ID:', userOnlyBlockedGameIds.length, '개');

      // 4. 사용자 추가 차단 제공사의 모든 게임도 추가
      let userProviderBlockedGameIds: number[] = [];
      if (userOnlyBlockedProviderIds.length > 0) {
        console.log('🔍 [사용자 추가 차단] 차단된 제공사의 게임 조회 시작:', userOnlyBlockedProviderIds);
        
        // ✅ allGames 배열에서 직접 필터링 (모든 API의 게임 포함)
        userProviderBlockedGameIds = allGames
          .filter(g => userOnlyBlockedProviderIds.includes(g.provider_id))
          .map(g => g.id);
        
        console.log('✅ [사용자 추가 차단] 조회된 게임:', userProviderBlockedGameIds.length, '개');
      }

      // 사용자만의 차단 목록 (UI 표시용 - 매장 차단 제외)
      const userOnlyAllBlockedGameIds = [...new Set([...userOnlyBlockedGameIds, ...userProviderBlockedGameIds])];

      console.log("✅ 사용자 게임 관리 차단 설정:");
      console.log("  - 사용자 추가 차단 제공사:", userOnlyBlockedProviderIds.length, "개", userOnlyBlockedProviderIds);
      console.log("  - 사용자 추가 차단 게임:", userOnlyAllBlockedGameIds.length, "개");
      
      // ✅ game_status Map 생성 (사용자 설정만)
      const statusMap = new Map<number, 'visible' | 'maintenance' | 'hidden'>();
      (userData || []).forEach(access => {
        if (access.access_type === 'game' && access.game_id && access.game_status) {
          const gameId = typeof access.game_id === 'number' ? access.game_id : parseInt(access.game_id);
          if (!isNaN(gameId)) {
            statusMap.set(gameId, access.game_status as 'visible' | 'maintenance' | 'hidden');
          }
        }
      });
      console.log("  - 🎮 게임 상태 맵:", statusMap.size, "개");
      
      // ✅ UI에는 사용자 추가 차단만 표시 (매장 차단은 리스트에서 제외됨)
      setUserBlockedProviders(userOnlyBlockedProviderIds);
      setUserBlockedGames(userOnlyAllBlockedGameIds);
      setUserGameStatus(statusMap);
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

    console.log('🎮 사용자 게임 토글:', { gameId, selectedUser: selectedUser.id, selectedStore: selectedStore.id });

    // 로직 반전: 레코드 없음 = 허용(기본), 레코드 있음 = 차단
    const isCurrentlyBlocked = userBlockedGames.includes(gameId);
    const newBlockedStatus = !isCurrentlyBlocked;
    console.log('📊 차단 상태:', { isCurrentlyBlocked, newBlockedStatus });
    
    // ✅ allGames에서 찾기 (모든 API의 게임 포함)
    const game = allGames.find(g => g.id === gameId);
    if (!game) {
      console.error(`❌ 게임 ID ${gameId}를 찾을 수 없습니다. allGames 개수:`, allGames.length);
      return;
    }
    console.log('✅ 게임 찾음:', { id: game.id, name: game.name, api_type: game.api_type });

    // ✅ Optimistic Update: UI에 즉시 반영
    const previousBlockedGames = userBlockedGames;
    setUserBlockedGames(prev =>
      newBlockedStatus
        ? [...prev, gameId]
        : prev.filter(id => id !== gameId)
    );

    try {
      if (newBlockedStatus) {
        // 게임 차단: 레코드 생성 (사용자별 설정은 user_id만 사용)
        console.log('🔒 차단 레코드 생성:', {
          user_id: selectedUser.id,
          api_provider: game.api_type,
          game_id: gameId,
          access_type: "game",
          is_allowed: false,
        });
        
        const { error, data } = await supabase
          .from("partner_game_access")
          .upsert({
            partner_id: null, // ⭐ 사용자별 설정은 partner_id를 명시적으로 null
            user_id: selectedUser.id,
            api_provider: game.api_type,
            game_provider_id: String(game.provider_id), // ⭐ provider_id도 저장
            game_id: String(gameId),
            access_type: "game",
            is_allowed: false,
            game_status: "hidden",
          }, {
            onConflict: 'partner_id,user_id,api_provider,game_provider_id,game_id,access_type',
            ignoreDuplicates: false
          })
          .select();

        if (error) {
          console.error('❌ UPSERT 오류:', error);
          throw error;
        }
        console.log('✅ UPSERT 성공:', data);
        
        // ✅ games/game_providers 테이블 동기화
        const tableName = game.api_type === 'honorapi' ? 'honor_games' : 'games';
        await supabase
          .from(tableName)
          .update({ game_visible: 'hidden' })
          .eq('id', gameId);
      } else {
        // 게임 허용: 레코드 삭제
        console.log('🔓 허용 레코드 삭제:', {
          user_id: selectedUser.id,
          api_provider: game.api_type,
          game_id: gameId,
        });
        
        const { error } = await supabase
          .from("partner_game_access")
          .delete()
          .is("partner_id", null) // ✅ 사��자별 설정은 partner_id가 NULL
          .eq("user_id", selectedUser.id)
          .eq("api_provider", game.api_type) // ⭐ API 제공사도 체크!
          .eq("game_id", gameId)
          .eq("access_type", "game");

        if (error) {
          console.error('❌ DELETE 오류:', error);
          throw error;
        }
        console.log('✅ DELETE 성공');
        
        // ✅ games/game_providers 테이블 동기화
        const tableName = game.api_type === 'honorapi' ? 'honor_games' : 'games';
        await supabase
          .from(tableName)
          .update({ game_visible: 'visible' })
          .eq('id', gameId);
      }

      toast.success(newBlockedStatus ? "게임을 차단했습니다." : "게임 차단을 해제했습니다.");
    } catch (error) {
      console.error("❌ 사용자 게임 접근 권한 업데이트 실패:", error);
      toast.error("게임 접근 권한 업데이트에 실패했습니다.");
      
      // ✅ Rollback: 에러 발생 시 이전 상태로 복원
      setUserBlockedGames(previousBlockedGames);
    }
  };

  // ✅ 개별 게임 상태 변경 (visible/maintenance/hidden)
  const handleChangeUserGameStatus = async (gameId: number, status: 'visible' | 'maintenance' | 'hidden') => {
    if (!selectedUser || !selectedStore) return;

    console.log('🎮 사용자 게임 상태 변경:', { gameId, status, userId: selectedUser.id });
    
    const game = allGames.find(g => g.id === gameId);
    if (!game) {
      console.error(`❌ 게임 ID ${gameId}를 찾을 수 없습니다.`);
      return;
    }

    // ✅ Optimistic Update
    const previousStatus = userGameStatus.get(gameId);
    const previousBlockedGames = userBlockedGames;
    
    const newStatusMap = new Map(userGameStatus);
    if (status === 'visible') {
      newStatusMap.delete(gameId);
      setUserBlockedGames(prev => prev.filter(id => id !== gameId));
    } else {
      newStatusMap.set(gameId, status);
      if (status === 'hidden' && !userBlockedGames.includes(gameId)) {
        setUserBlockedGames(prev => [...prev, gameId]);
      }
    }
    setUserGameStatus(newStatusMap);

    try {
      if (status === 'visible') {
        // 노출: 레코드 삭제
        const { error } = await supabase
          .from("partner_game_access")
          .delete()
          .is("partner_id", null)
          .eq("user_id", selectedUser.id)
          .eq("api_provider", game.api_type)
          .eq("game_id", gameId)
          .eq("access_type", "game");

        if (error) throw error;
        
        // ✅ games/game_providers 테이블 동기화
        const tableName = game.api_type === 'honorapi' ? 'honor_games' : 'games';
        await supabase
          .from(tableName)
          .update({ game_visible: 'visible' })
          .eq('id', gameId);
        
        toast.success("게임이 노출되었습니다.");
      } else {
        // maintenance 또는 hidden: 레코드 생성/업데이트
        const { error } = await supabase
          .from("partner_game_access")
          .upsert({
            user_id: selectedUser.id,
            api_provider: game.api_type,
            game_provider_id: null,
            game_id: gameId,
            access_type: "game",
            is_allowed: false,
            game_status: status,
          }, {
            onConflict: 'partner_id,user_id,api_provider,game_provider_id,game_id,access_type',
            ignoreDuplicates: false
          });

        if (error) throw error;
        
        // ✅ games/game_providers 테이블 동기화
        const tableName = game.api_type === 'honorapi' ? 'honor_games' : 'games';
        await supabase
          .from(tableName)
          .update({ game_visible: status })
          .eq('id', gameId);
        
        const statusText = status === 'maintenance' ? '점검중' : '숨김';
        toast.success(`게임이 ${statusText} 상태로 변경되었습니다.`);
      }

      await loadUserGameAccess(selectedUser.id);
    } catch (error) {
      console.error("❌ 게임 상태 변경 실패:", error);
      toast.error("게임 상태 변경에 실패했습니다.");
      
      // Rollback
      const rollbackMap = new Map(userGameStatus);
      if (previousStatus) {
        rollbackMap.set(gameId, previousStatus);
      } else {
        rollbackMap.delete(gameId);
      }
      setUserGameStatus(rollbackMap);
      setUserBlockedGames(previousBlockedGames);
    }
  };

  const handleProviderGames = async (providerId: number, action: 'allow' | 'block' | 'maintenance') => {
    if (!selectedUser || !selectedStore || !selectedApi) return;

    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const providerGames = games.filter(g => 
      g.provider_id === providerId && 
      g.api_type === selectedApi &&
      g.status === "visible" &&
      !storeBlockedGames.includes(g.id)
    );

    if (providerGames.length === 0) {
      toast.warning("대상 게임이 없습니다.");
      return;
    }

    const previousBlockedGames = userBlockedGames;

    try {
      if (action === 'allow') {
        const gameIdsToAllow = providerGames.filter(g => previousBlockedGames.includes(g.id)).map(g => g.id);
        
        if (gameIdsToAllow.length > 0) {
          setUserBlockedGames(prev => prev.filter(id => !gameIdsToAllow.includes(id)));
          
          await supabase
            .from("partner_game_access")
            .delete()
            .is("partner_id", null)
            .eq("user_id", selectedUser.id)
            .eq("api_provider", selectedApi)
            .eq("access_type", "game")
            .in("game_id", gameIdsToAllow);
        }
        
        toast.success(`${provider.name}의 ${providerGames.length}개 게임을 허용했습니다.`);
      } else {
        const gameStatus = action === 'maintenance' ? 'maintenance' : 'hidden';
        const accessRecords = providerGames.map(game => ({
          user_id: selectedUser.id,
          api_provider: game.api_type,
          game_id: game.id,
          access_type: "game" as const,
          is_allowed: false,
          game_status: gameStatus as const,
        }));

        await supabase
          .from("partner_game_access")
          .upsert(accessRecords, {
            onConflict: 'partner_id,user_id,api_provider,game_provider_id,game_id,access_type',
          });

        if (action === 'block') {
          setUserBlockedGames(prev => [...new Set([...prev, ...providerGames.map(g => g.id)])]);
        }

        const actionText = action === 'maintenance' ? '점검' : '차단';
        toast.success(`${provider.name}의 ${providerGames.length}개 게임을 ${actionText} 처리했습니다.`);
      }

      await loadUserGameAccess(selectedUser.id);
    } catch (error) {
      console.error("❌ 게임 일괄 처리 실패:", error);
      toast.error("게임 일괄 처리에 실패했습니다.");
      setUserBlockedGames(previousBlockedGames);
    }
  };

  // ✅ 사용자별 게임 탭: 전체 점검중 (API + 게임타입별)
  const handleBulkUserGameMaintenance = async () => {
    if (!selectedUser || !selectedStore || !selectedApi) {
      toast.warning("사용자와 API를 선택해주세요.");
      return;
    }

    // 현재 필터된 게임 목록 (API + 게임타입 + 매장 허용)
    const filteredGames = games.filter(g => {
      if (g.api_type !== selectedApi) return false;
      if (selectedGameType !== "all" && g.type !== selectedGameType) return false;
      if (g.status !== "visible") return false; // Lv1에서 노출한 게임만
      if (storeBlockedGames.includes(g.id)) return false; // 매장에서 허용한 게임만
      return true;
    });

    if (filteredGames.length === 0) {
      toast.warning("대상 게임이 없습니다.");
      return;
    }

    console.log(`📦 사용자별 전체 점검중: ${filteredGames.length}개 게임`);

    try {
      // ✅ partner_game_access 테이블에 game_status='maintenance' 레코드 생성/업데이트
      const accessRecords = filteredGames.map(game => ({
        user_id: selectedUser.id,
        api_provider: game.api_type,
        game_provider_id: null,
        game_id: game.id,
        access_type: "game" as const,
        is_allowed: false,
        game_status: "maintenance" as const,
      }));

      if (accessRecords.length > 0) {
        const { error } = await supabase
          .from("partner_game_access")
          .upsert(accessRecords, {
            onConflict: 'partner_id,user_id,api_provider,game_provider_id,game_id,access_type',
            ignoreDuplicates: false
          });

        if (error) throw error;
        
        // ✅ games/game_providers 테이블 동기화
        const tableName = selectedApi === 'honorapi' ? 'honor_games' : 'games';
        const gameIds = filteredGames.map(g => g.id);
        await supabase
          .from(tableName)
          .update({ game_visible: 'maintenance' })
          .in('id', gameIds);
      }
      
      toast.success(`${filteredGames.length}개 게임이 점검 상태로 변경되었습니다.`);
      
      // ✅ 사용자 게임 접근 권한 다시 로드
      await loadUserGameAccess(selectedUser.id);
    } catch (error) {
      console.error("❌ 전체 점검중 실패:", error);
      toast.error("게임 점검 상태 변경에 실패했습니다.");
    }
  };

  // ✅ 사용자별 게임 탭: 전체 노출/숨김 (API + 게임타입별)
  const handleBulkUserGameAccess = async (showAll: boolean) => {
    if (!selectedUser || !selectedStore || !selectedApi) {
      toast.warning("사용자와 API를 선택해주세요.");
      return;
    }

    // 현재 필터된 게임 목록 (API + 게임타입 + Lv1 노출 + 매장 허용)
    const filteredGames = games.filter(g => {
      if (g.api_type !== selectedApi) return false;
      if (selectedGameType !== "all" && g.type !== selectedGameType) return false;
      if (g.status !== "visible") return false; // Lv1에서 노출한 게임만
      if (storeBlockedGames.includes(g.id)) return false; // 매장에서 허용한 게임만
      return true;
    });

    if (filteredGames.length === 0) {
      toast.warning("대상 게임이 없습니다.");
      return;
    }

    console.log(`📦 사용자별 전체 ${showAll ? '노출' : '숨김'}: ${filteredGames.length}개 게임`);

    // ✅ Optimistic Update: UI에 즉시 반영 (게임만)
    const previousBlockedGames = userBlockedGames;
    
    if (showAll) {
      setUserBlockedGames(prev => prev.filter(id => !filteredGames.some(g => g.id === id)));
    } else {
      const newBlockedGameIds = filteredGames.map(g => g.id);
      setUserBlockedGames(prev => [...new Set([...prev, ...newBlockedGameIds])]);
    }

    try {
      if (showAll) {
        // 전체 노출: 게임 레코드만 삭제
        const gameIdsToAllow = filteredGames
          .filter(g => previousBlockedGames.includes(g.id))
          .map(g => g.id);

        if (gameIdsToAllow.length > 0) {
          const { error } = await supabase
            .from("partner_game_access")
            .delete()
            .is("partner_id", null)
            .eq("user_id", selectedUser.id)
            .eq("api_provider", selectedApi)
            .eq("access_type", "game")
            .in("game_id", gameIdsToAllow);

          if (error) throw error;
          
          // ✅ games/game_providers 테이블 동기화
          const tableName = selectedApi === 'honorapi' ? 'honor_games' : 'games';
          await supabase
            .from(tableName)
            .update({ game_visible: 'visible' })
            .in('id', gameIdsToAllow);
        }

        toast.success(`${filteredGames.length}개 게임이 노출되었습니다.`);
      } else {
        // 전체 숨김: game_status='hidden'으로 게임 레코드만 생성
        const gamesToBlock = filteredGames.filter(g => !previousBlockedGames.includes(g.id));
        
        // 게임 레코드만 생성
        const gameRecords = gamesToBlock.map(g => ({
          user_id: selectedUser.id,
          api_provider: g.api_type,
          game_provider_id: null,
          game_id: g.id,
          access_type: "game" as const,
          is_allowed: false,
          game_status: "hidden" as const,
        }));

        // ✅ UPSERT로 변경 (중복 방지)
        if (gameRecords.length > 0) {
          const { error } = await supabase
            .from("partner_game_access")
            .upsert(gameRecords, {
              onConflict: 'partner_id,user_id,api_provider,game_provider_id,game_id,access_type',
              ignoreDuplicates: false
            });

          if (error) throw error;
          
          // ✅ games/game_providers 테이블 동기화
          const tableName = selectedApi === 'honorapi' ? 'honor_games' : 'games';
          const gameIds = gamesToBlock.map(g => g.id);
          await supabase
            .from(tableName)
            .update({ game_visible: 'hidden' })
            .in('id', gameIds);
        }

        toast.success(`${filteredGames.length}개 게임이 숨김 처리되었습니다.`);
      }

      // ✅ 사용자 게임 접근 권한 다시 로드
      await loadUserGameAccess(selectedUser.id);
    } catch (error) {
      console.error("❌ 게임 일괄 처리 실패:", error);
      toast.error("게임 일괄 처리에 실패했습니다.");
      
      // ✅ Rollback: 에러 발생 시 이전 상태로 복원
      setUserBlockedGames(previousBlockedGames);
    }
  };

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      {availableTabs.length > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-700">
          {availableTabs.includes("games") && (
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
          )}
          {availableTabs.includes("stores") && (
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
              매장 게임 관리
            </Button>
          )}
          {availableTabs.includes("users") && (
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
              사용자 게임 관리
            </Button>
          )}
        </div>
      )}

      {/* 매장별 게임 탭 */}
      {activeTab === "stores" && (
        <>
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
                                {store.username}
                              </p>
                              {store.store_name && (
                                <p className="text-sm text-slate-300 truncate mt-0.5">
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
          <Card className="bg-slate-800/30 border-slate-700 lg:col-span-4">
            <CardContent className="p-4">
              {!selectedStore ? (
                <div className="text-center py-12 text-slate-400">
                  <Store className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-2xl font-bold text-white mb-2">매장을 선택하세요</p>
                  <p className="text-base">왼쪽에서 매장을 선택하면 게임 접근 권한을 설정할 수 있습니다.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* API 탭 선택 */}
                  <div className="flex gap-2 border-b-2 border-slate-700">
                    {availableApis
                      .filter(api => 
                        storeSelectedApis.length === 0 || storeSelectedApis.includes(api.value)
                      )
                      .map(api => (
                        <Button
                          key={api.value}
                          variant="ghost"
                          onClick={async () => {
                            setSelectedApi(api.value);
                            // ✅ API 선택 시 해당 API의 게임이 없으면 로드
                            const apiGames = games.filter(g => g.api_type === api.value);
                            console.log(`📊 [매장별 게임] ${api.value} 게임 수:`, apiGames.length);
                            
                            if (apiGames.length === 0) {
                              console.log(`⬇️ [매장별 게임] ${api.value} 게임 로드 중...`);
                              await loadGamesForApi(api.value);
                            }
                          }}
                          className={`rounded-none border-b-3 transition-colors px-8 py-4 text-lg font-bold ${
                            selectedApi === api.value
                              ? "border-purple-400 bg-purple-600/20 text-white shadow-lg"
                              : "border-transparent text-slate-300 hover:bg-slate-700/50 hover:text-white"
                          }`}
                        >
                          {api.label}
                        </Button>
                      ))}
                  </div>

                  {!selectedApi ? (
                    <div className="text-center py-12 text-slate-400">
                      <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                      <p className="text-2xl font-bold text-white mb-2">API를 선택하세요</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* 검색 및 필터 */}
                      <div className="space-y-3">
                        {/* 검색 */}
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <Input
                            placeholder="게임 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-12 h-12 text-base bg-slate-900/50 border-slate-700 text-white"
                          />
                        </div>

                        {/* 게임타입 필터 + 전체 노출/숨김 버튼 */}
                        <div className="flex items-center justify-between gap-4">
                          {/* 왼쪽: 게임타입 필터 버튼 */}
                          <div className="flex gap-2">
                            <Button
                              variant={selectedGameType === "all" ? "default" : "outline"}
                              onClick={() => setSelectedGameType("all")}
                              className={`h-12 px-6 text-base font-semibold ${
                                selectedGameType === "all"
                                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                                  : "bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                              }`}
                            >
                              전체
                            </Button>
                            <Button
                              variant={selectedGameType === "casino" ? "default" : "outline"}
                              onClick={() => setSelectedGameType("casino")}
                              className={`h-12 px-6 text-base font-semibold ${
                                selectedGameType === "casino"
                                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                                  : "bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                              }`}
                            >
                              카지노
                            </Button>
                            <Button
                              variant={selectedGameType === "slot" ? "default" : "outline"}
                              onClick={() => setSelectedGameType("slot")}
                              className={`h-12 px-6 text-base font-semibold ${
                                selectedGameType === "slot"
                                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                                  : "bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                              }`}
                            >
                              슬롯
                            </Button>
                            <Button
                              variant={selectedGameType === "minigame" ? "default" : "outline"}
                              onClick={() => setSelectedGameType("minigame")}
                              className={`h-12 px-6 text-base font-semibold ${
                                selectedGameType === "minigame"
                                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                                  : "bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                              }`}
                            >
                              미니게임
                            </Button>
                          </div>

                          {/* 오른쪽: 새로고침 + 전체 노출/숨김 버튼 */}
                          <div className="flex gap-3">
                            <Button
                              variant="outline"
                              onClick={async () => {
                                await initializeData();
                                if (selectedApi) {
                                  await loadGamesForApi(selectedApi);
                                }
                              }}
                              className="px-4 py-3 h-12 text-base font-bold bg-blue-900/30 border-2 border-blue-600 text-blue-300 hover:bg-blue-900/50 hover:border-blue-500 hover:text-blue-200"
                            >
                              <RefreshCw className="w-5 h-5 mr-2" />
                              새로고침
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleBulkStoreProviderAccess(true)}
                              className="px-6 py-3 h-12 text-base font-bold bg-emerald-900/30 border-2 border-emerald-600 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-500 hover:text-emerald-200"
                            >
                              <Eye className="w-5 h-5 mr-2" />
                              전체 노출
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleBulkStoreProviderAccess(false)}
                              className="px-6 py-3 h-12 text-base font-bold bg-red-900/30 border-2 border-red-600 text-red-300 hover:bg-red-900/50 hover:border-red-500 hover:text-red-200"
                            >
                              <EyeOff className="w-5 h-5 mr-2" />
                              전체 숨김
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* 게임 목록 */}
                      <ScrollArea className="h-[700px]">
                        <div className="space-y-4">
                          {(() => {
                            // ✅ 매장별 게임 탭: 게임이 있는 제공사만 표시
                            const filteredProviders = providers.filter(p => {
                              // 선택된 API와 일치해야 함
                              if (p.api_type !== selectedApi) return false;
                              
                              // ✅ Lv1에서 노출한 제공사만 표시 (provider status='visible')
                              if (p.status !== "visible") return false;
                              
                              // ✅ 매장이 차단한 제공사도 표시 (허용/차단 토글 가능하도록)
                              
                              // ✅ 해당 제공사의 선택된 게임 타입의 게임이 있는지 확인
                              const hasGames = games.some(g => 
                                g.provider_id === p.id &&
                                g.api_type === selectedApi &&
                                (selectedGameType === "all" || g.type === selectedGameType)
                              );
                              
                              return hasGames;
                            });
                            
                            console.log(`📊 [매장별 게임 탭] 제공사 필터링 결과:`, {
                              selectedStore: selectedStore?.username,
                              selectedApi,
                              selectedGameType,
                              storeBlockedProviders,
                              filteredCount: filteredProviders.length,
                              filteredProviders: filteredProviders.map(p => ({ id: p.id, name: p.name }))
                            });
                            
                            if (filteredProviders.length === 0) {
                              return (
                                <div className="text-center py-12 text-slate-400">
                                  <Building2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                  <p>노출된 게임사가 없습니다</p>
                                </div>
                              );
                            }

                            return filteredProviders.map(provider => {
                              // ✅ 띄어쓰기 무시 검색: 제공사명 + 게임명 모두 검색
                              const searchNormalized = debouncedSearchTerm.replace(/\s/g, '').toLowerCase();
                              const providerNameNormalized = provider.name.replace(/\s/g, '').toLowerCase();
                              const isProviderMatch = !debouncedSearchTerm || providerNameNormalized.includes(searchNormalized);

                              const providerGames = games.filter(g => {
                                if (g.provider_id !== provider.id) return false;
                                if (selectedGameType !== "all" && g.type !== selectedGameType) return false;
                                
                                // ✅ Lv1에서 노출한 게임만 표시 (status='visible')
                                if (g.status !== "visible") return false;
                                
                                // ✅ 매장이 차단한 게임도 표시 (허용/차단 토글 가능하도록)
                                
                                // 제공사명이 매칭되면 모든 게임 표시
                                if (isProviderMatch) return true;
                                
                                // 게임명으로 검색 (띄어쓰기 무시, 한글명 포함)
                                const gameNameNormalized = g.name.replace(/\s/g, '').toLowerCase();
                                const gameNameKoNormalized = (g.name_ko || '').replace(/\s/g, '').toLowerCase();
                                return gameNameNormalized.includes(searchNormalized) || gameNameKoNormalized.includes(searchNormalized);
                              });

                              if (providerGames.length === 0 && debouncedSearchTerm) {
                                return null;
                              }

                              const isExpanded = expandedProviderIds.has(provider.id);
                              const blockedCount = providerGames.filter(g => storeBlockedGames.includes(g.id)).length;

                              return (
                                <div key={provider.id} className="border-2 border-slate-700 rounded-lg overflow-hidden bg-slate-900/40 hover:border-slate-600 transition-all">
                                  {/* 제공사 헤더 */}
                                  <div className="p-5 bg-slate-800/60 flex items-center justify-between hover:bg-slate-800/80 transition-colors">
                                    <div className="flex items-center gap-4 flex-1">
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
                                        className="p-1.5 h-auto hover:bg-slate-700 rounded"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="w-7 h-7 text-white" />
                                        ) : (
                                          <ChevronRight className="w-7 h-7 text-white" />
                                        )}
                                      </Button>

                                      <Building2 className="w-7 h-7 text-purple-400" />
                                      
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                          <span className="text-xl font-bold text-white">{provider.name}</span>
                                          {storeBlockedProviders.includes(provider.id) ? (
                                            <EyeOff className="w-6 h-6 text-red-400" />
                                          ) : (
                                            <Eye className="w-6 h-6 text-emerald-400" />
                                          )}
                                          <Badge variant="outline" className="text-base font-bold border-slate-500 px-3 py-1">
                                            {provider.api_type.toUpperCase()}
                                          </Badge>
                                        </div>
                                        <div className="text-base mt-1.5 font-semibold whitespace-nowrap">
                                          <span className="text-slate-300">전체 {providerGames.length}개</span>
                                          <span className="text-slate-500"> · </span>
                                          <span className="text-red-400">차단 {blockedCount}개</span>
                                          <span className="text-slate-500"> · </span>
                                          <span className="text-emerald-400">허용 {providerGames.length - blockedCount}개</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <Button
                                        variant="outline"
                                        onClick={async () => {
                                          try {
                                            // ✅ 모든 레벨: partner_game_access 사용 (is_visible 변경 안 함)
                                            if (!selectedStore) return;
                                            
                                            // 해당 제공사의 모든 게임 ID
                                            const allProviderGameIds = games
                                              .filter(g => g.provider_id === provider.id)
                                              .map(g => String(g.id));
                                            
                                            if (allProviderGameIds.length === 0) {
                                              toast.error("게임이 없습니다.");
                                              return;
                                            }

                                            console.log("✅ 매장별 전체 ���용:", { 
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
                                              .eq("api_provider", provider.api_type) // ⭐ 추가!
                                              .eq("game_provider_id", provider.id) // ✅ 숫자 타입으로 전달
                                              .eq("access_type", "provider");
                                            
                                            if (error) {
                                              console.error("❌ 삭제 오류:", error);
                                              throw error;
                                            }

                                            // ✅ 제공사의 모든 게임 레코드도 삭제
                                            const { error: gameError } = await supabase
                                              .from("partner_game_access")
                                              .delete()
                                              .eq("partner_id", selectedStore.id)
                                              .is("user_id", null)
                                              .eq("api_provider", provider.api_type) // ⭐ 추가!
                                              .eq("access_type", "game")
                                              .in("game_id", allProviderGameIds);

                                            if (gameError) {
                                              console.error("❌ 게임 레코드 삭제 오류:", gameError);
                                            }
                                            
                                            console.log("✅ 차단 해제 완료");
                                            
                                            await loadStoreGameAccess(selectedStore.id);
                                            toast.success(`${provider.name}의 모든 게임을 허용했습니다.`);
                                          } catch (error) {
                                            console.error("❌ 전체 허용 실패:", error);
                                            toast.error("일괄 허용에 실패했습니다.");
                                          }
                                        }}
                                        className="px-5 py-2.5 text-base font-bold bg-emerald-900/30 border-2 border-emerald-600 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-500"
                                      >
                                        <Eye className="w-5 h-5 mr-2" />
                                        전체 허용
                                      </Button>
                                      <Button
                                        variant="outline"
                                        onClick={async () => {
                                          try {
                                            // ✅ 모든 레벨: partner_game_access 사용 (is_visible 변경 안 함)
                                            if (!selectedStore) return;
                                            
                                            console.log("🚫 매장별 전체 차단:", { 
                                              provider: provider.name, 
                                              providerId: provider.id,
                                              storeId: selectedStore.id
                                            });

                                            // ✅ 새로운 방식: provider 레코드 1개만 생성!
                                            const providerAccessRecord = {
                                              partner_id: selectedStore.id,
                                              api_provider: provider.api_type,
                                              game_provider_id: provider.id,
                                              game_id: null,
                                              access_type: "provider",
                                              is_allowed: false,
                                              game_status: "hidden" as const,
                                            };

                                            // 1단계: 기존 제공사 레코드 삭제
                                            await supabase
                                              .from("partner_game_access")
                                              .delete()
                                              .eq("partner_id", selectedStore.id)
                                              .is("user_id", null)
                                              .eq("api_provider", provider.api_type)
                                              .eq("game_provider_id", provider.id)
                                              .eq("access_type", "provider");

                                            // 2단계: 새 provider 레코드 1개만 생성
                                            const { error } = await supabase
                                              .from("partner_game_access")
                                              .insert([providerAccessRecord]);
                                            
                                            if (error) {
                                              console.error("❌ 생성 오류:", error);
                                              throw error;
                                            }

                                            console.log("✅ 차단 완료 (provider 레코드 1개만 생성)");
                                            
                                            await loadStoreGameAccess(selectedStore.id);
                                            toast.success(`${provider.name}의 모든 게임을 차단했습니다.`);
                                          } catch (error) {
                                            console.error("❌ 전체 차단 실패:", error);
                                            toast.error("일괄 차단에 실패했습니다.");
                                          }
                                        }}
                                        className="px-5 py-2.5 text-base font-bold bg-red-900/30 border-2 border-red-600 text-red-300 hover:bg-red-900/50 hover:border-red-500"
                                      >
                                        <EyeOff className="w-5 h-5 mr-2" />
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
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                                          {providerGames.map((game) => {
                                            const isBlocked = storeBlockedGames.includes(game.id);
                                            return (
                                              <div
                                                key={game.id}
                                                className={`group relative bg-slate-900/50 border rounded-md overflow-hidden transition-all hover:shadow-md hover:shadow-blue-500/20 ${
                                                  isBlocked
                                                    ? "border-red-500 hover:border-red-400"
                                                    : "border-emerald-500 hover:border-emerald-400"
                                                }`}
                                              >
                                                {/* 왼쪽 상단 아이콘 */}
                                                <div className="absolute top-2 left-2 z-10">
                                                  {isBlocked ? (
                                                    <EyeOff className="w-5 h-5 text-red-400" />
                                                  ) : (
                                                    <Eye className="w-5 h-5 text-emerald-400" />
                                                  )}
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
                                                  
                                                  {/* 호버 시 토글 버튼 + 상태 드롭다운 */}
                                                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      onClick={() => handleToggleStoreGame(game.id)}
                                                      className={isBlocked 
                                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                                                        : "bg-red-600 hover:bg-red-700 text-white border-0"
                                                      }
                                                    >
                                                      {isBlocked ? (
                                                        <>
                                                          <Eye className="w-3 h-3 mr-1" />
                                                          허용
                                                        </>
                                                      ) : (
                                                        <>
                                                          <EyeOff className="w-3 h-3 mr-1" />
                                                          차단
                                                        </>
                                                      )}
                                                    </Button>
                                                    
                                                    {/* 상태 변경 드롭다운 */}
                                                    <Select
                                                      value={(() => {
                                                        // storeGameStatus에서 이 게임의 상태 조회
                                                        const accessData = storeGameStatus?.find(
                                                          (access: any) => access.game_id === game.id
                                                        );
                                                        return accessData?.game_status || 'visible';
                                                      })()}
                                                      onValueChange={(value: "visible" | "maintenance" | "hidden") => {
                                                        handleChangeStoreGameStatus(game.id, value);
                                                      }}
                                                    >
                                                      <SelectTrigger className="h-7 w-24 text-xs bg-slate-800 border-slate-600 text-white">
                                                        <SelectValue />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        <SelectItem value="visible">
                                                          <div className="flex items-center gap-1.5 text-xs">
                                                            <Eye className="w-3 h-3" />
                                                            노출
                                                          </div>
                                                        </SelectItem>
                                                        <SelectItem value="maintenance">
                                                          <div className="flex items-center gap-1.5 text-xs">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            점검중
                                                          </div>
                                                        </SelectItem>
                                                        <SelectItem value="hidden">
                                                          <div className="flex items-center gap-1.5 text-xs">
                                                            <EyeOff className="w-3 h-3" />
                                                            숨김
                                                          </div>
                                                        </SelectItem>
                                                      </SelectContent>
                                                    </Select>
                                                  </div>
                                                </div>

                                                <div className="p-2">
                                                  <div className="min-h-[32px] flex items-center">
                                                    <div
                                                      className="text-xs text-slate-200 line-clamp-2 leading-tight"
                                                      title={game.name_ko || game.name}
                                                    >
                                                      {game.name_ko || game.name}
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
        </>
      )}

      {/* 사용자별 게임 탭 */}
      {activeTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* 왼쪽: 매장 목록 */}
          <Card className="bg-slate-800/30 border-slate-700 lg:col-span-2">
            <CardContent className="p-3">
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">매장 목록</h3>
                  <p className="text-base text-slate-300">매장 선택</p>
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
                            <Store className="w-5 h-5 text-purple-400" />
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-white truncate">
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
          <Card className="bg-slate-800/30 border-slate-700 lg:col-span-2">
            <CardContent className="p-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-white">사용자 목록</h3>
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
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
                  <ScrollArea className="h-[700px]">
                    <div className="space-y-2">
                      {users
                        .filter(u => {
                          if (!debouncedUserSearchTerm) return true;
                          const searchNormalized = debouncedUserSearchTerm.replace(/\s/g, '').toLowerCase();
                          const usernameNormalized = u.username.replace(/\s/g, '').toLowerCase();
                          return usernameNormalized.includes(searchNormalized);
                        })
                        .map((targetUser) => (
                        <button
                          key={targetUser.id}
                          onClick={() => handleUserSelect(targetUser)}
                          className={`w-full p-4 rounded-lg text-left transition-all ${
                            selectedUser?.id === targetUser.id
                              ? "bg-purple-600/30 border-2 border-purple-400 shadow-lg shadow-purple-500/20"
                              : "bg-slate-700/40 border-2 border-slate-600 hover:bg-slate-700/60 hover:border-slate-500"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <UserIcon className="w-5 h-5 text-purple-400" />
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-white truncate">
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
          <Card className="bg-slate-800/30 border-slate-700 lg:col-span-8">
            <CardContent className="p-4">
              {!selectedUser ? (
                <div className="text-center py-12 text-slate-400">
                  <UserIcon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-2xl font-bold text-white mb-2">사용자를 선택하세요</p>
                  <p className="text-base">왼쪽에서 사용자를 선택하면 게임 접근 권한을 설정할 수 있습니다.</p>
                  <p className="text-base mt-2 text-amber-400 font-semibold">※ 해당 사용자가 속한 매장에서 노출된 게임만 선택 가능합니다.</p>
                </div>
              ) : (
                <div className="space-y-4">
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
                          onClick={async () => {
                            setSelectedApi(api.value);
                            // ✅ API 선택 시 해당 API의 게임이 없으면 로드
                            const apiGames = games.filter(g => g.api_type === api.value);
                            console.log(`📊 [사용자별 게임] ${api.value} 게임 수:`, apiGames.length);
                            
                            if (apiGames.length === 0) {
                              console.log(`⬇️ [사용자별 게임] ${api.value} 게임 로드 중...`);
                              await loadGamesForApi(api.value);
                            }
                          }}
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
                    <div className="space-y-4">
                      {/* 검색 */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="게임 검색..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 bg-slate-900/50 border-slate-700 text-white"
                        />
                      </div>

                      {/* 게임타입 필터 + 전체 노출/점검중/숨김 버튼 */}
                      <div className="flex items-center justify-between gap-4">
                        {/* 왼쪽: 게임타입 필터 버튼 */}
                        <div className="flex gap-2">
                          <Button
                            variant={selectedGameType === "all" ? "default" : "outline"}
                            onClick={() => setSelectedGameType("all")}
                            className={`h-12 px-6 text-base font-semibold ${
                              selectedGameType === "all"
                                ? "bg-purple-600 hover:bg-purple-700 text-white"
                                : "bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                            }`}
                          >
                            전체
                          </Button>
                          <Button
                            variant={selectedGameType === "casino" ? "default" : "outline"}
                            onClick={() => setSelectedGameType("casino")}
                            className={`h-12 px-6 text-base font-semibold ${
                              selectedGameType === "casino"
                                ? "bg-purple-600 hover:bg-purple-700 text-white"
                                : "bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                            }`}
                          >
                            카지노
                          </Button>
                          <Button
                            variant={selectedGameType === "slot" ? "default" : "outline"}
                            onClick={() => setSelectedGameType("slot")}
                            className={`h-12 px-6 text-base font-semibold ${
                              selectedGameType === "slot"
                                ? "bg-purple-600 hover:bg-purple-700 text-white"
                                : "bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                            }`}
                          >
                            슬롯
                          </Button>
                          <Button
                            variant={selectedGameType === "minigame" ? "default" : "outline"}
                            onClick={() => setSelectedGameType("minigame")}
                            className={`h-12 px-6 text-base font-semibold ${
                              selectedGameType === "minigame"
                                ? "bg-purple-600 hover:bg-purple-700 text-white"
                                : "bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                            }`}
                          >
                            미니게임
                          </Button>
                        </div>

                        {/* 오른쪽: 새로고침 + 전체 노출/점검중/숨김 버튼 */}
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            onClick={async () => {
                              await initializeData();
                              if (selectedApi) {
                                await loadGamesForApi(selectedApi);
                              }
                            }}
                            className="px-4 py-3 h-12 text-base font-bold bg-blue-900/30 border-2 border-blue-600 text-blue-300 hover:bg-blue-900/50 hover:border-blue-500 hover:text-blue-200"
                          >
                            <RefreshCw className="w-5 h-5 mr-2" />
                            새로고침
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleBulkUserGameAccess(true)}
                            className="px-6 py-3 h-12 text-base font-bold bg-emerald-900/30 border-2 border-emerald-600 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-500 hover:text-emerald-200"
                          >
                            <Eye className="w-5 h-5 mr-2" />
                            게임 전체 허용
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleBulkUserGameMaintenance}
                            className="px-6 py-3 h-12 text-base font-bold bg-orange-900/30 border-2 border-orange-600 text-orange-300 hover:bg-orange-900/50 hover:border-orange-500 hover:text-orange-200"
                          >
                            <AlertTriangle className="w-5 h-5 mr-2" />
                            게임 전체 점검
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleBulkUserGameAccess(false)}
                            className="px-6 py-3 h-12 text-base font-bold bg-red-900/30 border-2 border-red-600 text-red-300 hover:bg-red-900/50 hover:border-red-500 hover:text-red-200"
                          >
                            <EyeOff className="w-5 h-5 mr-2" />
                            게임 전체 차단
                          </Button>
                        </div>
                      </div>

                      {/* 게임 목록 */}
                      <ScrollArea className="h-[600px]">
                        <div className="space-y-4">
                          {(() => {
                            // ✅ 사용자별 게임 탭: 게임이 있는 제공사만 표시
                            const filteredProviders = providers.filter(p => {
                              // 선택된 API와 일치해야 함
                              if (p.api_type !== selectedApi) return false;
                              
                              // ✅ Lv1에서 노출한 제공사만 표시 (provider status='visible')
                              if (p.status !== "visible") return false;
                              
                              // ✅ Lv2에서 노출한 제공사만 표시 (is_visible=true)
                              if (!p.is_visible) return false;
                              
                              // ✅ 사용자 게임 관리: 매장에서 차단된 제공사는 리스트에서 제외
                              if (storeBlockedForUser.providers.includes(p.id)) return false;
                              
                              // ✅ 해당 제공사의 선택된 게임 타입의 게임이 있는지 확인
                              const hasGames = games.some(g => 
                                g.provider_id === p.id &&
                                g.api_type === selectedApi &&
                                (selectedGameType === "all" || g.type === selectedGameType)
                              );
                              
                              return hasGames;
                            });
                            
                            console.log(`📊 [사용자별 게임 탭] 제공사 필터링 결과:`, {
                              selectedUser: selectedUser?.username,
                              selectedApi,
                              selectedGameType,
                              storeBlockedForUserProviders: storeBlockedForUser.providers,
                              userBlockedProviders,
                              filteredCount: filteredProviders.length,
                              filteredProviders: filteredProviders.map(p => ({ id: p.id, name: p.name }))
                            });
                            
                            if (filteredProviders.length === 0) {
                              return (
                                <div className="text-center py-12 text-slate-400">
                                  <Building2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                  <p>노출된 게임사가 없습니다</p>
                                </div>
                              );
                            }

                            return filteredProviders.map(provider => {
                              // ✅ 띄어쓰기 무시 검색: 제공사명 + 게임명 모두 검색
                              const searchNormalized = debouncedSearchTerm.replace(/\s/g, '').toLowerCase();
                              const providerNameNormalized = provider.name.replace(/\s/g, '').toLowerCase();
                              const isProviderMatch = !debouncedSearchTerm || providerNameNormalized.includes(searchNormalized);

                              // ✅ 사용자 게임 관리: 매장에서 허용된 게임만 표시
                              const providerGames = games.filter(g => {
                                if (g.provider_id !== provider.id) return false;
                                if (selectedGameType !== "all" && g.type !== selectedGameType) return false;
                                
                                // ✅ Lv1에서 노출한 게임만 표시 (status='visible')
                                if (g.status !== "visible") return false;
                                
                                // ✅ Lv2에서 노출한 게임만 표시 (is_visible=true)
                                if (!g.is_visible) return false;
                                
                                // ✅ 매장에서 차단된 게임은 리스트에서 제외
                                if (storeBlockedForUser.games.includes(g.id)) return false;
                                
                                // ✅ 사용자가 차단한 게임은 리스트에서 제외 (화면에서 숨김)
                                if (userBlockedGames.includes(g.id)) return false;
                                
                                // 제공사명이 매칭되면 모든 게임 표시
                                if (isProviderMatch) return true;
                                
                                // 게임명으로 검색 (띄어쓰기 무시, 한글명 포함)
                                const gameNameNormalized = g.name.replace(/\s/g, '').toLowerCase();
                                const gameNameKoNormalized = (g.name_ko || '').replace(/\s/g, '').toLowerCase();
                                return gameNameNormalized.includes(searchNormalized) || gameNameKoNormalized.includes(searchNormalized);
                              });

                              if (providerGames.length === 0 && debouncedSearchTerm) {
                                return null;
                              }

                              const isExpanded = expandedProviderIds.has(provider.id);
                              // ✅ blockedCount는 전체 게임 중 차단된 게임 수 계산 (필터링 전 기준)
                              const allProviderGames = games.filter(g => 
                                g.provider_id === provider.id && 
                                g.status === "visible" &&
                                !storeBlockedForUser.games.includes(g.id)
                              );
                              const blockedCount = allProviderGames.filter(g => userBlockedGames.includes(g.id)).length;

                              return (
                                <div key={provider.id} className="border-2 border-slate-700 rounded-lg overflow-hidden bg-slate-900/40 hover:border-slate-600 transition-all">
                                  {/* 제공사 헤더 */}
                                  <div className="p-5 bg-slate-800/60 flex items-center justify-between hover:bg-slate-800/80 transition-colors">
                                    <div className="flex items-center gap-4 flex-1">
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
                                        className="p-1.5 h-auto hover:bg-slate-700 rounded"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="w-7 h-7 text-white" />
                                        ) : (
                                          <ChevronRight className="w-7 h-7 text-white" />
                                        )}
                                      </Button>

                                      <Building2 className="w-7 h-7 text-purple-400" />
                                      
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                          <span className="text-xl font-bold text-white">{provider.name}</span>
                                          {userBlockedProviders.includes(provider.id) ? (
                                            <EyeOff className="w-6 h-6 text-red-400" />
                                          ) : (
                                            <Eye className="w-6 h-6 text-emerald-400" />
                                          )}
                                          <Badge variant="outline" className="text-base font-bold border-slate-500 px-3 py-1">
                                            {provider.api_type.toUpperCase()}
                                          </Badge>
                                        </div>
                                        <div className="text-base mt-1.5 font-semibold whitespace-nowrap">
                                          <span className="text-slate-300">매장 허용 {providerGames.length}개</span>
                                          <span className="text-slate-500"> · </span>
                                          <span className="text-red-400">사용자 차단 {blockedCount}개</span>
                                          <span className="text-slate-500"> · </span>
                                          <span className="text-emerald-400">사용자 허용 {providerGames.length - blockedCount}개</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <Button
                                        variant="outline"
                                        onClick={() => handleProviderGames(provider.id, 'allow')}
                                        className="px-5 py-2.5 text-base font-bold bg-emerald-900/30 border-2 border-emerald-600 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-500"
                                      >
                                        <Eye className="w-5 h-5 mr-2" />
                                        게임 허용
                                      </Button>
                                      <Button
                                        variant="outline"
                                        onClick={() => handleProviderGames(provider.id, 'maintenance')}
                                        className="px-5 py-2.5 text-base font-bold bg-orange-900/30 border-2 border-orange-600 text-orange-300 hover:bg-orange-900/50 hover:border-orange-500"
                                      >
                                        <AlertTriangle className="w-5 h-5 mr-2" />
                                        게임 점검
                                      </Button>
                                      <Button
                                        variant="outline"
                                        onClick={() => handleProviderGames(provider.id, 'block')}
                                        className="px-5 py-2.5 text-base font-bold bg-red-900/30 border-2 border-red-600 text-red-300 hover:bg-red-900/50 hover:border-red-500"
                                      >
                                        <EyeOff className="w-5 h-5 mr-2" />
                                        게임 차단
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
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
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
                                                  
                                                  {/* 상태 변경 버튼 오버레이 */}
                                                  <div
                                                    className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                                                  >
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleChangeUserGameStatus(game.id, 'visible');
                                                      }}
                                                      className="w-full py-1 px-2 h-auto text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                                                    >
                                                      <Eye className="w-3 h-3 mr-1" />
                                                      노출
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleChangeUserGameStatus(game.id, 'maintenance');
                                                      }}
                                                      className="w-full py-1 px-2 h-auto text-xs bg-orange-600 hover:bg-orange-700 text-white border-0"
                                                    >
                                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                                      점검중
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleChangeUserGameStatus(game.id, 'hidden');
                                                      }}
                                                      className="w-full py-1 px-2 h-auto text-xs bg-red-600 hover:bg-red-700 text-white border-0"
                                                    >
                                                      <EyeOff className="w-3 h-3 mr-1" />
                                                      숨김
                                                    </Button>
                                                  </div>

                                                  {/* 상태 뱃지 */}
                                                  {(() => {
                                                    const gameStatus = userGameStatus.get(game.id);
                                                    if (gameStatus === 'maintenance') {
                                                      return (
                                                        <div className="absolute top-1 right-1">
                                                          <div className="bg-orange-500 rounded-full px-2 py-0.5 flex items-center gap-1">
                                                            <AlertTriangle className="w-3 h-3 text-white" />
                                                            <span className="text-xs text-white font-bold">점검중</span>
                                                          </div>
                                                        </div>
                                                      );
                                                    } else if (gameStatus === 'hidden' || isBlocked) {
                                                      return (
                                                        <div className="absolute top-1 right-1">
                                                          <div className="bg-red-500 rounded-full p-1">
                                                            <EyeOff className="w-3 h-3 text-white" />
                                                          </div>
                                                        </div>
                                                      );
                                                    }
                                                    return null;
                                                  })()}
                                                </div>

                                                {/* 게임 이름 */}
                                                <div className="p-2 bg-slate-800/80">
                                                  <div className="min-h-[32px] flex items-center">
                                                    <div
                                                      className="text-xs text-slate-200 line-clamp-2 leading-tight"
                                                      title={game.name_ko || game.name}
                                                    >
                                                      {game.name_ko || game.name}
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
                // ✅ 검색어로 필터링된 결과만 표시 (providerGamesMap에 있는 제공사만)
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
      )}
    </div>
  );
}