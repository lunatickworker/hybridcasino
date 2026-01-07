// 매장별/사용자별 게임 관리 탭 UI 컴포넌트
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  Store,
  User as UserIcon,
  ChevronsDown,
  ChevronsUp,
} from 'lucide-react';
import { MergedProvider, Game, StoreOrUser } from './GameListManagementTypes';

interface GameTabsProps {
  // 상태
  storesOrUsers: StoreOrUser[];
  selectedEntity: StoreOrUser | null;
  stores: StoreOrUser[];
  selectedStore: StoreOrUser | null;
  loading: boolean;
  mergedProviders: MergedProvider[];
  expandedProviders: Set<string>;
  games: Map<string, Game[]>;
  selectedProviders: Set<string>;
  selectedGames: Set<number>;
  searchQuery: string;
  typeFilter: 'all' | 'slot' | 'casino' | 'minigame';
  apiFilter: 'all' | 'invest' | 'oroplay' | 'familyapi' | 'honorapi';
  filteredProviders: MergedProvider[];

  // 핸들러
  selectStore: (store: StoreOrUser) => void;
  selectUser: (user: StoreOrUser) => void;
  setSelectedStore: (store: StoreOrUser | null) => void;
  loadUsersForStore: (store: StoreOrUser) => void;
  loadProvidersForEntity: (entity: StoreOrUser) => void;
  setApiFilter: (filter: 'all' | 'invest' | 'oroplay' | 'familyapi' | 'honorapi') => void;
  setTypeFilter: (filter: 'all' | 'slot' | 'casino' | 'minigame') => void;
  setSearchQuery: (query: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  bulkToggleProviders: (status: 'visible' | 'hidden') => void;
  deselectAllProviders: () => void;

  // 드래그&드롭 컴포넌트
  DraggableProvider: any;
  moveProvider: (dragIndex: number, hoverIndex: number) => void;
  toggleProvider: (key: string) => void;
  toggleProviderSelection: (key: string) => void;
  toggleProviderStatus: (key: string, status: 'visible' | 'hidden' | 'maintenance') => void;
  toggleGameSelection: (gameId: number) => void;
  toggleGameVisibility: (gameId: number, providerKey: string, blocked: boolean) => void;
  moveGame: (dragIndex: number, hoverIndex: number, providerKey: string) => void;
}

export function Lv6Tab(props: GameTabsProps) {
  const {
    storesOrUsers,
    selectedEntity,
    loading,
    mergedProviders,
    expandedProviders,
    games,
    selectedProviders,
    selectedGames,
    searchQuery,
    typeFilter,
    apiFilter,
    filteredProviders,
    selectStore,
    loadProvidersForEntity,
    setApiFilter,
    setTypeFilter,
    setSearchQuery,
    expandAll,
    collapseAll,
    bulkToggleProviders,
    deselectAllProviders,
    DraggableProvider,
    moveProvider,
    toggleProvider,
    toggleProviderSelection,
    toggleProviderStatus,
    toggleGameSelection,
    toggleGameVisibility,
    moveGame,
  } = props;

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* 왼쪽: 매장 목록 */}
      <Card className="col-span-3 bg-slate-900 border-slate-700">
        <CardHeader className="border-b border-slate-700">
          <CardTitle className="text-lg">매장 목록</CardTitle>
          <p className="text-sm text-slate-400 mt-1">
            {storesOrUsers.length}개 매장
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[700px]">
            {loading && storesOrUsers.length === 0 ? (
              <div className="text-center text-slate-400 py-12">로딩 중...</div>
            ) : storesOrUsers.length === 0 ? (
              <div className="text-center text-slate-400 py-12">매장이 없습니다</div>
            ) : (
              <div className="p-2">
                {storesOrUsers.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => selectStore(store)}
                    className={`w-full text-left p-4 rounded-lg mb-2 transition-all ${
                      selectedEntity?.id === store.id
                        ? 'bg-blue-500/20 border-2 border-blue-500'
                        : 'bg-slate-800 border-2 border-transparent hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-white">
                          {store.nickname || store.username}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          @{store.username}
                        </div>
                      </div>
                      <Store className="w-5 h-5 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 오른쪽: 선택된 매장의 게임 관리 */}
      <Card className="col-span-9 bg-slate-900 border-slate-700">
        <CardHeader className="border-b border-slate-700">
          <div className="flex items-center justify-between gap-4">
            {selectedEntity ? (
              <>
                {/* 왼쪽: 선택된 매장 정보 */}
                <div>
                  <CardTitle className="text-lg">
                    {selectedEntity.nickname || selectedEntity.username} - 게임 관리
                  </CardTitle>
                  <p className="text-sm text-slate-400 mt-1">
                    매장의 게임 노출 설정
                  </p>
                </div>

                {/* 오른쪽: API/타입 필터 + 컨트롤 */}
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <Button
                      variant={apiFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setApiFilter('all')}
                    >
                      전체 API
                    </Button>
                    <Button
                      variant={apiFilter === 'oroplay' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setApiFilter('oroplay')}
                    >
                      Gaming API
                    </Button>
                    <Button
                      variant={apiFilter === 'honorapi' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setApiFilter('honorapi')}
                    >
                      Honor API
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={typeFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTypeFilter('all')}
                    >
                      전체
                    </Button>
                    <Button
                      variant={typeFilter === 'slot' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTypeFilter('slot')}
                    >
                      슬롯
                    </Button>
                    <Button
                      variant={typeFilter === 'casino' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTypeFilter('casino')}
                    >
                      카지노
                    </Button>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="검색..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-48"
                    />
                  </div>

                  <Button onClick={expandAll} variant="outline" size="sm">
                    <ChevronsDown className="w-4 h-4 mr-2" />
                    전체 펼치기
                  </Button>
                  <Button onClick={collapseAll} variant="outline" size="sm">
                    <ChevronsUp className="w-4 h-4 mr-2" />
                    전체 접기
                  </Button>

                  <Button onClick={() => loadProvidersForEntity(selectedEntity)} disabled={loading} size="sm">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center w-full text-slate-400 py-8">
                왼쪽에서 매장을 선택하세요
              </div>
            )}
          </div>

          {/* 일괄 선택 컨트롤 */}
          {selectedEntity && selectedProviders.size > 0 && (
            <div className="flex items-center gap-3 mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <span className="text-sm text-blue-400">
                {selectedProviders.size}개 게임사 선택됨
              </span>
              <Button size="sm" variant="outline" onClick={() => bulkToggleProviders('visible')}>
                <Eye className="w-4 h-4 mr-2" />
                선택 노출
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkToggleProviders('hidden')}>
                <EyeOff className="w-4 h-4 mr-2" />
                선택 숨김
              </Button>
              <Button size="sm" variant="outline" onClick={deselectAllProviders}>
                선택 해제
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[700px]">
            <div className="p-4">
              {!selectedEntity ? (
                <div className="text-center text-slate-400 py-12">
                  왼쪽에서 매장을 선택하세요
                </div>
              ) : loading && filteredProviders.length === 0 ? (
                <div className="text-center text-slate-400 py-12">로딩 중...</div>
              ) : filteredProviders.length === 0 ? (
                <div className="text-center text-slate-400 py-12">게임사가 없습니다</div>
              ) : (
                filteredProviders.map((provider, index) => (
                  <DraggableProvider
                    key={provider.mergedKey}
                    provider={provider}
                    index={index}
                    moveProvider={moveProvider}
                    isExpanded={expandedProviders.has(provider.mergedKey)}
                    selectedProviders={selectedProviders}
                    games={games.get(provider.mergedKey) || []}
                    onToggleProvider={toggleProvider}
                    onToggleProviderSelection={toggleProviderSelection}
                    onToggleProviderStatus={toggleProviderStatus}
                    onToggleGameSelection={toggleGameSelection}
                    onToggleGameVisibility={toggleGameVisibility}
                    selectedGames={selectedGames}
                    moveGame={moveGame}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export function Lv7Tab(props: GameTabsProps) {
  const {
    storesOrUsers,
    selectedEntity,
    stores,
    selectedStore,
    loading,
    mergedProviders,
    expandedProviders,
    games,
    selectedProviders,
    selectedGames,
    searchQuery,
    typeFilter,
    apiFilter,
    filteredProviders,
    selectUser,
    setSelectedStore,
    loadUsersForStore,
    loadProvidersForEntity,
    setApiFilter,
    setTypeFilter,
    setSearchQuery,
    expandAll,
    collapseAll,
    bulkToggleProviders,
    deselectAllProviders,
    DraggableProvider,
    moveProvider,
    toggleProvider,
    toggleProviderSelection,
    toggleProviderStatus,
    toggleGameSelection,
    toggleGameVisibility,
    moveGame,
  } = props;

  return (
    <div className="space-y-6">
      {/* 최상단: 매장 선택 */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg">매장 선택</CardTitle>
          <div className="flex items-center gap-4 mt-4">
            <Select
              value={selectedStore?.id || ''}
              onValueChange={(storeId) => {
                const store = stores.find((s) => s.id === storeId);
                if (store) {
                  setSelectedStore(store);
                  loadUsersForStore(store);
                }
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="매장을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.nickname || store.username} (@{store.username})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedStore && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Store className="w-4 h-4" />
                <span>{selectedStore.nickname || selectedStore.username}</span>
                <Badge variant="outline">{storesOrUsers.length}명 사용자</Badge>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* 매장 선택 후: 사용자 목록 + 게임 관리 */}
      {selectedStore && (
        <div className="grid grid-cols-12 gap-6">
          {/* 왼쪽: 사용자 목록 */}
          <Card className="col-span-3 bg-slate-900 border-slate-700">
            <CardHeader className="border-b border-slate-700">
              <CardTitle className="text-lg">사용자 목록</CardTitle>
              <p className="text-sm text-slate-400 mt-1">
                {storesOrUsers.length}명
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[700px]">
                {loading && storesOrUsers.length === 0 ? (
                  <div className="text-center text-slate-400 py-12">로딩 중...</div>
                ) : storesOrUsers.length === 0 ? (
                  <div className="text-center text-slate-400 py-12">사용자가 없습니다</div>
                ) : (
                  <div className="p-2">
                    {storesOrUsers.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => selectUser(user)}
                        className={`w-full text-left p-4 rounded-lg mb-2 transition-all ${
                          selectedEntity?.id === user.id
                            ? 'bg-blue-500/20 border-2 border-blue-500'
                            : 'bg-slate-800 border-2 border-transparent hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-white">
                              {user.nickname || user.username}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              @{user.username}
                            </div>
                          </div>
                          <UserIcon className="w-5 h-5 text-slate-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* 오른쪽: 선택된 사용자의 게임 관리 */}
          <Card className="col-span-9 bg-slate-900 border-slate-700">
            <CardHeader className="border-b border-slate-700">
              <div className="flex items-center justify-between gap-4">
                {selectedEntity ? (
                  <>
                    {/* 왼쪽: 선택된 사용자 정보 */}
                    <div>
                      <CardTitle className="text-lg">
                        {selectedEntity.nickname || selectedEntity.username} - 게임 관리
                      </CardTitle>
                      <p className="text-sm text-slate-400 mt-1">
                        사용자의 게임 노출 설정
                      </p>
                    </div>

                    {/* 오른쪽: API/타입 필터 + 컨트롤 */}
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2">
                        <Button
                          variant={apiFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setApiFilter('all')}
                        >
                          전체 API
                        </Button>
                        <Button
                          variant={apiFilter === 'oroplay' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setApiFilter('oroplay')}
                        >
                          Gaming API
                        </Button>
                        <Button
                          variant={apiFilter === 'honorapi' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setApiFilter('honorapi')}
                        >
                          Honor API
                        </Button>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant={typeFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTypeFilter('all')}
                        >
                          전체
                        </Button>
                        <Button
                          variant={typeFilter === 'slot' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTypeFilter('slot')}
                        >
                          슬롯
                        </Button>
                        <Button
                          variant={typeFilter === 'casino' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTypeFilter('casino')}
                        >
                          카지노
                        </Button>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="검색..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 w-48"
                        />
                      </div>

                      <Button onClick={expandAll} variant="outline" size="sm">
                        <ChevronsDown className="w-4 h-4 mr-2" />
                        전체 펼치기
                      </Button>
                      <Button onClick={collapseAll} variant="outline" size="sm">
                        <ChevronsUp className="w-4 h-4 mr-2" />
                        전체 접기
                      </Button>

                      <Button onClick={() => loadProvidersForEntity(selectedEntity)} disabled={loading} size="sm">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center w-full text-slate-400 py-8">
                    왼쪽에서 사용자를 선택하세요
                  </div>
                )}
              </div>

              {/* 일괄 선택 컨트롤 */}
              {selectedEntity && selectedProviders.size > 0 && (
                <div className="flex items-center gap-3 mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <span className="text-sm text-blue-400">
                    {selectedProviders.size}개 게임사 선택됨
                  </span>
                  <Button size="sm" variant="outline" onClick={() => bulkToggleProviders('visible')}>
                    <Eye className="w-4 h-4 mr-2" />
                    선택 노출
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => bulkToggleProviders('hidden')}>
                    <EyeOff className="w-4 h-4 mr-2" />
                    선택 숨김
                  </Button>
                  <Button size="sm" variant="outline" onClick={deselectAllProviders}>
                    선택 해제
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[700px]">
                <div className="p-4">
                  {!selectedEntity ? (
                    <div className="text-center text-slate-400 py-12">
                      왼쪽에서 사용자를 선택하세요
                    </div>
                  ) : loading && filteredProviders.length === 0 ? (
                    <div className="text-center text-slate-400 py-12">로딩 중...</div>
                  ) : filteredProviders.length === 0 ? (
                    <div className="text-center text-slate-400 py-12">게임사가 없습니다</div>
                  ) : (
                    filteredProviders.map((provider, index) => (
                      <DraggableProvider
                        key={provider.mergedKey}
                        provider={provider}
                        index={index}
                        moveProvider={moveProvider}
                        isExpanded={expandedProviders.has(provider.mergedKey)}
                        selectedProviders={selectedProviders}
                        games={games.get(provider.mergedKey) || []}
                        onToggleProvider={toggleProvider}
                        onToggleProviderSelection={toggleProviderSelection}
                        onToggleProviderStatus={toggleProviderStatus}
                        onToggleGameSelection={toggleGameSelection}
                        onToggleGameVisibility={toggleGameVisibility}
                        selectedGames={selectedGames}
                        moveGame={moveGame}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
