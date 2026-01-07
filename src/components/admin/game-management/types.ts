import { Partner, User } from "../../../types";
import { Game, GameProvider } from "../../../lib/gameApi";

// API 타입
export type ApiType = "invest" | "oroplay" | "familyapi" | "honorapi";

// 게임 타입
export type GameType = "all" | "casino" | "slot" | "minigame";

// 탭 타입
export type TabType = "games" | "stores" | "users";

// 게임 상태 타입
export type GameStatus = "visible" | "maintenance" | "hidden";

// 메인 컴포넌트 Props
export interface EnhancedGameManagementProps {
  user: Partner;
}

// 게임 카드 Props
export interface GameCardProps {
  game: Game;
  isSelected: boolean;
  onToggleSelection: () => void;
  onToggleFeatured: () => void;
  onChangeStatus: (status: GameStatus) => void;
  isBlocked?: boolean; // Lv2+에서 partner_game_access에 의해 차단된 게임인지 여부
  userLevel: number;
}

// 제공사 섹션 Props
export interface ProviderSectionProps {
  provider: GameProvider;
  games: Game[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleProviderStatus: (status: GameStatus, apiType: ApiType) => void;
  selectedGameIds: Set<number>;
  onToggleGameSelection: (gameId: number) => void;
  onToggleGameFeatured: (gameId: number) => void;
  onChangeGameStatus: (gameId: number, status: GameStatus, apiType: ApiType) => void;
  userLevel: number;
  isBlocked?: boolean; // Lv2+에서 partner_game_access에 의해 차단된 제공사인지 여부
  blockedGameIds?: Set<number>; // Lv2+에서 partner_game_access에 의해 차단된 게임 목록
}

// 게임 통계 타입
export interface GameStats {
  total: number;
  visible: number;
  maintenance: number;
  hidden: number;
  featured?: number;
}

// API 메타데이터 타입
export interface ApiMetadata {
  label: string;
  color: string;
}

// 게임 타입 메타데이터
export interface GameTypeMetadata {
  value: GameType;
  label: string;
  icon: any; // lucide-react 아이콘
}

// 매장 차단 데이터
export interface StoreBlockedData {
  providers: number[];
  games: number[];
}

// 사용자 탭 Props
export interface UsersTabProps {
  user: Partner;
  users: User[];
  selectedUser: User | null;
  onSelectUser: (user: User | null) => void;
  userSearchTerm: string;
  onUserSearchChange: (term: string) => void;
  userBlockedGames: number[];
  userBlockedProviders: number[];
  storeBlockedForUser: StoreBlockedData;
  onToggleUserGameStatus: (gameId: number, providerId: number) => void;
  onToggleUserProviderStatus: (providerId: number) => void;
  loading: boolean;
  allGames: Game[];
  providers: GameProvider[];
}

// 매장 탭 Props
export interface StoresTabProps {
  user: Partner;
  stores: Partner[];
  selectedStore: Partner | null;
  onSelectStore: (store: Partner | null) => void;
  storeSelectedApis: ApiType[];
  storeBlockedGames: number[];
  storeBlockedProviders: number[];
  onToggleStoreGameStatus: (gameId: number, providerId: number) => void;
  onToggleStoreProviderStatus: (providerId: number) => void;
  loading: boolean;
  allGames: Game[];
  providers: GameProvider[];
}

// 게임 탭 Props
export interface GamesTabProps {
  user: Partner;
  providers: GameProvider[];
  games: Game[];
  selectedApi: ApiType | null;
  selectedGameType: GameType;
  searchTerm: string;
  selectedGameIds: Set<number>;
  expandedProviderIds: Set<number>;
  blockedProviderIds: Set<number>;
  blockedGameIds: Set<number>;
  onApiChange: (api: ApiType) => void;
  onGameTypeChange: (type: GameType) => void;
  onSearchChange: (term: string) => void;
  onToggleGameSelection: (gameId: number) => void;
  onToggleExpand: (providerId: number) => void;
  onToggleGameFeatured: (gameId: number) => void;
  onChangeGameStatus: (gameId: number, status: GameStatus, apiType: ApiType) => void;
  onToggleProviderStatus: (providerId: number, status: GameStatus, apiType: ApiType) => void;
  onBulkStatusChange: (status: GameStatus) => void;
  onBulkApiStatusChange: (status: GameStatus) => void;
  onSyncGames: () => void;
  loading: boolean;
  syncing: boolean;
  stats: GameStats;
  availableApis: Array<{ value: ApiType; label: string; color: string }>;
  availableGameTypes: GameTypeMetadata[];
}
