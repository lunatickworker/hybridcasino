import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner@2.0.3';
import { ChevronRight, Check, X, Gamepad2, Search, CheckSquare, Square } from 'lucide-react';

interface GameAccess {
  api_provider: string;
  game_provider_id?: string;
  game_id?: string;
  access_type: 'provider' | 'game';
}

interface GameAccessSelectorProps {
  availableApis: string[]; // Lv2의 selected_apis 또는 Lv6의 API 목록
  value: GameAccess[];
  onChange: (value: GameAccess[]) => void;
  parentGameAccess?: GameAccess[]; // Lv7일 때 Lv6의 제한사항
  restrictToParentProviders?: boolean; // Lv7(사용자)일 때만 true, Lv2는 false
}

interface Provider {
  id: number;
  name: string;
  name_ko?: string;
  api_type: string;
  type: string;
}

interface Game {
  id: number;
  name: string;
  name_ko?: string;
  provider_id: number;  // ✅ games 테이블에서는 provider_id 사용
  api_type: string;
}

export function GameAccessSelectorSimple({ availableApis, value, onChange, parentGameAccess, restrictToParentProviders }: GameAccessSelectorProps) {
  // State
  const [selectedApiTab, setSelectedApiTab] = useState<string>('');
  const [selectedProviderType, setSelectedProviderType] = useState<string>('all');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [gameSearch, setGameSearch] = useState('');

  const apiLabels: Record<string, string> = {
    invest: 'Invest',
    oroplay: 'OroPlay',
    familyapi: 'Family',
    honorapi: 'Honor',
  };

  // 디버깅: value 변경 감지
  useEffect(() => {
    console.log('🎮 [GameAccessSelector] value changed:', value);
  }, [value]);

  // 첫 번째 API를 기본 선택
  useEffect(() => {
    if (availableApis.length > 0 && !selectedApiTab) {
      setSelectedApiTab(availableApis[0]);
    }
  }, [availableApis]);

  // API 탭 변경 시 프로바이더 로드
  useEffect(() => {
    if (selectedApiTab) {
      loadProviders();
      setSelectedProvider(null);
      setGames([]);
    }
  }, [selectedApiTab]);

  // 프로바이더 로드
  const loadProviders = async () => {
    try {
      setLoading(true);
      
      let allProviders: Provider[] = [];
      
      if (selectedApiTab === 'honorapi') {
        const { data, error } = await supabase
          .from('honor_game_providers')
          .select('id, name, type')
          .eq('is_visible', true)
          .order('name');

        if (error) throw error;
        allProviders = data?.map(p => ({ ...p, api_type: 'honorapi' })) || [];
      } else {
        const { data, error } = await supabase
          .from('game_providers')
          .select('id, name, name_ko, type, api_type')
          .eq('api_type', selectedApiTab)
          .eq('is_visible', true)
          .order('name');

        if (error) throw error;
        allProviders = data || [];
      }
      
      // parentGameAccess가 있고 restrictToParentProviders가 true일 때만 필터링 (Lv7 사용자)
      if (restrictToParentProviders && parentGameAccess && parentGameAccess.length > 0) {
        const allowedProviderIds = new Set<number>();
        
        parentGameAccess.forEach(access => {
          if (access.api_provider === selectedApiTab && access.game_provider_id) {
            allowedProviderIds.add(Number(access.game_provider_id));
          }
        });
        
        allProviders = allProviders.filter(p => allowedProviderIds.has(p.id));
      }
      
      setProviders(allProviders);
    } catch (error) {
      console.error('프로바이더 로드 실패:', error);
      toast.error('게임 프로바이더를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 프로바이더 클릭 시 게임 로드
  const handleProviderClick = async (provider: Provider) => {
    setSelectedProvider(provider);
    
    try {
      setGamesLoading(true);
      
      let allGames: Game[] = [];
      
      if (provider.api_type === 'honorapi') {
        const { data, error } = await supabase
          .from('honor_games')
          .select('id, name, provider_id')
          .eq('provider_id', provider.id)
          .eq('is_visible', true)
          .order('name');

        if (error) throw error;
        allGames = data?.map(g => ({ ...g, api_type: 'honorapi' })) || [];
      } else {
        const { data, error } = await supabase
          .from('games')
          .select('id, name, provider_id, api_type')
          .eq('provider_id', provider.id)
          .eq('is_visible', true)
          .order('name');

        if (error) throw error;
        allGames = data || [];
      }
      
      // parentGameAccess가 있고 특정 게임만 허용하는 경우 필터링
      if (restrictToParentProviders && parentGameAccess && parentGameAccess.length > 0) {
        // 제공사 전체가 허용되었는지 확인
        const providerFullAccess = parentGameAccess.some(
          access =>
            access.api_provider === provider.api_type &&
            access.game_provider_id === String(provider.id) &&
            access.access_type === 'provider'
        );
        
        // 제공사 전체 접근이 아니면, 개별 게임만 필터링
        if (!providerFullAccess) {
          const allowedGameIds = new Set<number>();
          
          parentGameAccess.forEach(access => {
            if (
              access.api_provider === provider.api_type &&
              access.game_provider_id === String(provider.id) &&
              access.access_type === 'game' &&
              access.game_id
            ) {
              allowedGameIds.add(Number(access.game_id));
            }
          });
          
          allGames = allGames.filter(g => allowedGameIds.has(g.id));
        }
      }
      
      setGames(allGames);
    } catch (error) {
      console.error('게임 로드 실패:', error);
      toast.error('게임 목록을 불러오는데 실패했습니다.');
    } finally {
      setGamesLoading(false);
    }
  };

  // 프로바이더 선택 여부 확인 (모든 게임이 선택되어 있는지 확인)
  const isProviderSelected = (provider: Provider) => {
    // 해당 제공사의 선택된 게임 개수 확인
    const selectedGamesInProvider = value.filter(
      v =>
        v.api_provider === provider.api_type &&
        v.game_provider_id === String(provider.id) &&
        v.access_type === 'game'
    );
    
    // 선택된 게임이 있으면 true (전체 선택으로 간주)
    return selectedGamesInProvider.length > 0;
  };

  // 🆕 프로바이더의 게임 중 일부라도 선택되었는지 확인
  const hasSelectedGames = (provider: Provider) => {
    return value.some(
      v =>
        v.api_provider === provider.api_type &&
        v.game_provider_id === String(provider.id) &&
        v.access_type === 'game'
    );
  };

  // 게임 선택 여부 확인
  const isGameSelected = (game: Game) => {
    return value.some(
      v =>
        v.api_provider === game.api_type &&
        v.game_provider_id === String(game.provider_id) &&
        v.game_id === String(game.id) &&
        v.access_type === 'game'
    );
  };

  // 프로바이더 토글
  const toggleProvider = async (provider: Provider) => {
    const selected = isProviderSelected(provider);

    if (selected) {
      // 프로바이더와 해당 프로바이더의 모든 게임 제거
      onChange(
        value.filter(
          v =>
            !(
              v.api_provider === provider.api_type &&
              v.game_provider_id === String(provider.id)
            )
        )
      );
    } else {
      // ✅ 제공사 선택 시 모든 게임을 개별 항목으로 로드하여 저장
      try {
        setLoading(true);
        
        let allProviderGames: Game[] = [];
        
        if (provider.api_type === 'honorapi') {
          const { data, error } = await supabase
            .from('honor_games')
            .select('id, name, provider_id')
            .eq('provider_id', provider.id)
            .eq('is_visible', true);
          
          if (error) throw error;
          allProviderGames = data?.map(g => ({ ...g, api_type: 'honorapi' })) || [];
        } else {
          const { data, error } = await supabase
            .from('games')
            .select('id, name, provider_id, api_type')
            .eq('provider_id', provider.id)
            .eq('is_visible', true);
          
          if (error) throw error;
          allProviderGames = data || [];
        }
        
        // 해당 프로바이더의 기존 항목 제거
        const filtered = value.filter(
          v =>
            !(
              v.api_provider === provider.api_type &&
              v.game_provider_id === String(provider.id)
            )
        );
        
        // 모든 게임을 개별 항목으로 추가
        const newGameAccess = allProviderGames.map(game => ({
          api_provider: provider.api_type,
          game_provider_id: String(game.provider_id),
          game_id: String(game.id),
          access_type: 'game' as const,
        }));
        
        // ✅ 중복 제거: API 프로바이더가 다르면 같은 game_provider_id/game_id라도 별도 항목으로 삽입
        // 같은 API 프로바이더 내에서만 game_provider_id와 game_id가 같으면 중복으로 처리
        const existingKeys = new Set(
          filtered.map(v => `${v.api_provider}:${v.game_provider_id}:${v.game_id}:${v.access_type}`)
        );
        
        const uniqueNewAccess = newGameAccess.filter(
          access => !existingKeys.has(`${access.api_provider}:${access.game_provider_id}:${access.game_id}:${access.access_type}`)
        );
        
        onChange([...filtered, ...uniqueNewAccess]);
        toast.success(`${allProviderGames.length}개 게임이 선택되었습니다.`);
        
      } catch (error) {
        console.error('게임 로드 실패:', error);
        toast.error('게임 목록을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }
  };

  // 게임 토글
  const toggleGame = (game: Game) => {
    const selected = isGameSelected(game);
    const providerSelected = value.some(
      v =>
        v.api_provider === game.api_type &&
        v.game_provider_id === String(game.provider_id) &&
        v.access_type === 'provider'
    );

    if (selected) {
      // 게임 제거
      onChange(
        value.filter(
          v =>
            !(
              v.api_provider === game.api_type &&
              v.game_provider_id === String(game.provider_id) &&
              v.game_id === String(game.id) &&
              v.access_type === 'game'
            )
        )
      );
    } else {
      // 프로바이더 선택이 있으면 제거하고 게임 추가
      const filtered = providerSelected
        ? value.filter(
            v =>
              !(
                v.api_provider === game.api_type &&
                v.game_provider_id === String(game.provider_id) &&
                v.access_type === 'provider'
              )
          )
        : value;

      onChange([
        ...filtered,
        {
          api_provider: game.api_type,
          game_provider_id: String(game.provider_id),
          game_id: String(game.id),
          access_type: 'game',
        },
      ]);
    }
  };

  if (availableApis.length === 0) {
    return (
      <div className="p-6 bg-slate-800/30 rounded-lg border border-slate-700 text-center">
        <p className="text-slate-400">상위 파트너가 선택한 API가 없습니다.</p>
      </div>
    );
  }

  // 필터링된 제공사 목록
  const filteredProviders = providers.filter(provider => {
    // 타입 필터
    if (selectedProviderType !== 'all' && provider.type !== selectedProviderType) {
      return false;
    }
    // 검색 필터
    if (providerSearch) {
      const searchLower = providerSearch.toLowerCase();
      const nameMatch = provider.name?.toLowerCase().includes(searchLower);
      const nameKoMatch = provider.name_ko?.toLowerCase().includes(searchLower);
      return nameMatch || nameKoMatch;
    }
    return true;
  });

  // 필터링된 게임 목록
  const filteredGames = games.filter(game => {
    if (gameSearch) {
      const searchLower = gameSearch.toLowerCase();
      const nameMatch = game.name?.toLowerCase().includes(searchLower);
      const nameKoMatch = game.name_ko?.toLowerCase().includes(searchLower);
      return nameMatch || nameKoMatch;
    }
    return true;
  });

  // 🆕 현재 필터링된 모든 제공사 선택
  const handleSelectAllProviders = async () => {
    try {
      setLoading(true);
      
      // ✅ 수정: 현재 API + 현재 타입이 아닌 것들 모두 유지
      const otherAccess = value.filter(v => {
        // 다른 API는 모두 유지
        if (v.api_provider !== selectedApiTab) return true;
        
        // 같은 API인데 현재 선택된 타입(slot/casino/minigame)이 아닌 프로바이더의 게임은 유지
        // 현재 필터링된 프로바이더들 (현재 타입만)
        const currentProviderIds = new Set(filteredProviders.map(p => String(p.id)));
        
        // 현재 필터에 포함되지 않은 프로바이더의 게임은 유지
        if (v.game_provider_id && !currentProviderIds.has(v.game_provider_id)) {
          return true;
        }
        
        return false;
      });
      
      // 각 제공사의 모든 게임을 로드하여 저장
      const allNewGameAccess: GameAccess[] = [];
      
      for (const provider of filteredProviders) {
        let providerGames: Game[] = [];
        
        if (provider.api_type === 'honorapi') {
          const { data, error } = await supabase
            .from('honor_games')
            .select('id, name, provider_id')
            .eq('provider_id', provider.id)
            .eq('is_visible', true);
          
          if (error) throw error;
          providerGames = data?.map(g => ({ ...g, api_type: 'honorapi' })) || [];
        } else {
          const { data, error } = await supabase
            .from('games')
            .select('id, name, provider_id, api_type')
            .eq('provider_id', provider.id)
            .eq('is_visible', true);
          
          if (error) throw error;
          providerGames = data || [];
        }
        
        // 각 게임을 개별 항목으로 추가
        providerGames.forEach(game => {
          allNewGameAccess.push({
            api_provider: provider.api_type,
            game_provider_id: String(game.provider_id),
            game_id: String(game.id),
            access_type: 'game',
          });
        });
      }
      
      // ✅ 중복 제거: API 프로바이더가 다르면 같은 game_provider_id/game_id라도 별도 항목으로 삽입
      // 같은 API 프로바이더 내에서만 game_provider_id와 game_id가 같으면 중복으로 처리
      const existingKeys = new Set(
        otherAccess.map(v => `${v.api_provider}:${v.game_provider_id}:${v.game_id}:${v.access_type}`)
      );
      
      const uniqueNewAccess = allNewGameAccess.filter(
        access => !existingKeys.has(`${access.api_provider}:${access.game_provider_id}:${access.game_id}:${access.access_type}`)
      );
      
      onChange([...otherAccess, ...uniqueNewAccess]);
      toast.success(`${filteredProviders.length}개 제공사의 ${uniqueNewAccess.length}개 게임을 선택했습니다.`);
      
    } catch (error) {
      console.error('전체 선택 실패:', error);
      toast.error('전체 선택에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 🆕 현재 필터링된 모든 제공사 해제
  const handleDeselectAllProviders = () => {
    const filteredProviderIds = new Set(filteredProviders.map(p => String(p.id)));
    
    // 현재 API의 필터링된 제공사들과 관련된 모든 항목 제거
    const filtered = value.filter(v => {
      if (v.api_provider !== selectedApiTab) return true;
      if (v.game_provider_id && filteredProviderIds.has(v.game_provider_id)) {
        return false;
      }
      return true;
    });
    
    onChange(filtered);
    toast.success(`${filteredProviders.length}개 제공사를 해제했습니다.`);
  };

  // 🆕 현재 제공사의 모든 게임 선택
  const handleSelectAllGames = () => {
    if (!selectedProvider) return;
    
    // 기존 제공사 전체 선택 제거
    const filtered = value.filter(
      v =>
        !(
          v.api_provider === selectedProvider.api_type &&
          v.game_provider_id === String(selectedProvider.id)
        )
    );
    
    // 모든 게임 추가
    const newGameAccess = filteredGames.map(game => ({
      api_provider: game.api_type,
      game_provider_id: String(game.provider_id),
      game_id: String(game.id),
      access_type: 'game' as const,
    }));
    
    onChange([...filtered, ...newGameAccess]);
    toast.success(`${filteredGames.length}개 게임을 선택했습니다.`);
  };

  // 🆕 현재 제공사의 모든 게임 해제
  const handleDeselectAllGames = () => {
    if (!selectedProvider) return;
    
    const filtered = value.filter(
      v =>
        !(
          v.api_provider === selectedProvider.api_type &&
          v.game_provider_id === String(selectedProvider.id)
        )
    );
    
    onChange(filtered);
    toast.success('게임 선택을 모두 해제했습니다.');
  };

  // 🆕 현재 필터링된 제공사 중 선택된 개수
  const selectedFilteredProvidersCount = filteredProviders.filter(p => isProviderSelected(p)).length;
  const allFilteredProvidersSelected = filteredProviders.length > 0 && selectedFilteredProvidersCount === filteredProviders.length;

  // 🆕 현재 제공사의 게임 중 선택된 개수
  const selectedGamesCount = selectedProvider ? filteredGames.filter(g => isGameSelected(g)).length : 0;
  const providerFullySelected = selectedProvider ? isProviderSelected(selectedProvider) : false;
  const allGamesSelected = filteredGames.length > 0 && (selectedGamesCount === filteredGames.length || providerFullySelected);

  return (
    <div className="space-y-6 px-6">
      {/* 상속 안내 & 전체 상속 버튼 */}
      {parentGameAccess && parentGameAccess.length > 0 && (
        <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-500/30">
          <div className="flex items-center gap-3">
            <div className="w-1 h-12 bg-gradient-to-b from-blue-400 to-purple-400 rounded-full"></div>
            <div>
              <h4 className="font-semibold text-white text-lg">게임 상속 설정</h4>
              <p className="text-slate-300 text-sm mt-1">
                {value.length === 0 
                  ? '✅ 현재 상위의 모든 게임을 상속 중입니다.' 
                  : `🎮 ${value.length}개 게임을 개별 선택 중입니다.`}
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              onChange([]);
              toast.success('전체 상속으로 설정되었습니다. 저장하면 상위의 모든 게임을 사용할 수 있습니다.');
            }}
            disabled={value.length === 0}
            variant="outline"
            className="bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30 hover:text-blue-200 px-6 py-3 h-auto text-base"
          >
            <CheckSquare className="h-5 w-5 mr-2" />
            전체 상속으로 변경
          </Button>
        </div>
      )}

      {/* API 탭 */}
      <div className="flex gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        {availableApis.map(api => (
          <button
            key={api}
            onClick={() => setSelectedApiTab(api)}
            className={`flex-1 px-6 py-3 rounded-md font-semibold transition-all text-base ${
              selectedApiTab === api
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/70 bg-slate-800/60'
            }`}
          >
            {apiLabels[api]}
          </button>
        ))}
      </div>

      {/* 2단 레이아웃 */}
      <div className="grid grid-cols-12 gap-8">
        {/* 왼쪽: 제공사 리스트 */}
        <div className="col-span-4 border border-slate-700 rounded-lg bg-slate-800/50 overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-slate-700 bg-gradient-to-r from-purple-600/20 to-pink-600/20 flex-shrink-0 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="font-bold text-white text-base">게임 제공사</h3>
                <p className="text-xs text-slate-300 mt-1">클릭하여 게임 목록 보기</p>
              </div>
              
              {/* 🆕 제공사 일괄 선택/해제 버튼 */}
              <div className="flex gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSelectAllProviders}
                  disabled={loading || filteredProviders.length === 0 || allFilteredProvidersSelected}
                  className="h-7 px-2 text-xs bg-green-600/20 text-green-300 hover:bg-green-600/40 hover:text-white border border-green-500/30 disabled:opacity-50"
                  title="현재 보이는 모든 제공사 선택"
                >
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  전체
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDeselectAllProviders}
                  disabled={loading || selectedFilteredProvidersCount === 0}
                  className="h-7 px-2 text-xs bg-red-600/20 text-red-300 hover:bg-red-600/40 hover:text-white border border-red-500/30 disabled:opacity-50"
                  title="현재 보이는 모든 제공사 해제"
                >
                  <Square className="h-3.5 w-3.5 mr-1" />
                  해제
                </Button>
              </div>
            </div>
            
            {/* 타입 필터 */}
            <div className="flex gap-2">
              {[
                { key: 'all', label: '전체', icon: '🎯' },
                { key: 'slot', label: '슬롯', icon: '🎮' },
                { key: 'casino', label: '카지노', icon: '🎰' },
                { key: 'minigame', label: '미니', icon: '🎲' },
              ].map(type => (
                <button
                  key={type.key}
                  onClick={() => setSelectedProviderType(type.key)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    selectedProviderType === type.key
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <span className="mr-1">{type.icon}</span>
                  {type.label}
                </button>
              ))}
            </div>
            
            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="제공사 검색..."
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                className="pl-9 h-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-purple-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
              </div>
            ) : providers.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-slate-400">
                  <Gamepad2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium">제공사가 없습니다</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProviders.map(provider => {
                  const selected = isProviderSelected(provider);
                  const hasGames = hasSelectedGames(provider);
                  const isActive = selectedProvider?.id === provider.id;
                  
                  return (
                    <div
                      key={provider.id}
                      className={`group rounded-lg transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 border-2 border-purple-400 shadow-md shadow-purple-500/30'
                          : selected || hasGames
                          ? 'bg-blue-600/20 border-2 border-blue-400'
                          : 'border-2 border-slate-700 hover:border-purple-500/50 hover:bg-slate-700/50'
                      }`}
                      onClick={() => handleProviderClick(provider)}
                    >
                      <div className="flex items-start gap-3 p-4">
                        <Checkbox
                          checked={selected || hasGames}
                          onCheckedChange={() => toggleProvider(provider)}
                          onClick={(e) => e.stopPropagation()}
                          className={`flex-shrink-0 h-5 w-5 mt-0.5 ${hasGames && !selected ? 'opacity-70' : ''}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold mb-1 text-sm ${
                            isActive || selected || hasGames ? 'text-white' : 'text-slate-200'
                          }`}>
                            {provider.name}
                            {hasGames && !selected && (
                              <span className="ml-2 text-xs text-blue-300">(일부 게임)</span>
                            )}
                          </p>
                          <p className={`text-xs ${
                            isActive || selected || hasGames ? 'text-slate-300' : 'text-slate-400'
                          }`}>
                            {provider.type === 'casino' ? '🎰 카지노' : provider.type === 'slot' ? '🎮 슬롯' : '🎯 미니게임'}
                          </p>
                        </div>
                        <ChevronRight className={`h-5 w-5 flex-shrink-0 mt-0.5 transition-all ${
                          isActive ? 'text-purple-300' : 'text-slate-500 group-hover:text-slate-400'
                        }`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 게임 리스트 */}
        <div className="col-span-8 border border-slate-700 rounded-lg bg-slate-800/50 overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-slate-700 bg-gradient-to-r from-purple-600/20 to-pink-600/20 flex-shrink-0 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-bold text-white text-base">
                  {selectedProvider ? (selectedProvider.name_ko || selectedProvider.name) : '게임 목록'}
                </h3>
                {selectedProvider && (
                  <p className="text-xs text-slate-300 mt-1">
                    개별 게임 선택 가능 (제공사 전체 선택 시 모든 게임 포함)
                  </p>
                )}
              </div>
              
              {/* 🆕 게임 일괄 선택/해제 버튼 */}
              {selectedProvider && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSelectAllGames}
                    disabled={gamesLoading || filteredGames.length === 0 || allGamesSelected}
                    className="h-7 px-2 text-xs bg-green-600/20 text-green-300 hover:bg-green-600/40 hover:text-white border border-green-500/30 disabled:opacity-50"
                    title="현재 보이는 모든 게임 선택"
                  >
                    <CheckSquare className="h-3.5 w-3.5 mr-1" />
                    전체
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDeselectAllGames}
                    disabled={gamesLoading || (selectedGamesCount === 0 && !providerFullySelected)}
                    className="h-7 px-2 text-xs bg-red-600/20 text-red-300 hover:bg-red-600/40 hover:text-white border border-red-500/30 disabled:opacity-50"
                    title="제공사 및 게임 선택 모두 해제"
                  >
                    <Square className="h-3.5 w-3.5 mr-1" />
                    해제
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedProvider(null);
                      setGames([]);
                      setGameSearch('');
                    }}
                    className="h-7 px-2 text-slate-300 hover:text-white hover:bg-slate-700/70"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            
            {/* 게임 검색 */}
            {selectedProvider && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="게임 검색..."
                  value={gameSearch}
                  onChange={(e) => setGameSearch(e.target.value)}
                  className="pl-9 h-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-purple-500"
                />
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {!selectedProvider ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-slate-400">
                  <ChevronRight className="h-20 w-20 mx-auto mb-4 opacity-20" />
                  <p className="font-semibold mb-2 text-base text-slate-300">왼쪽에서 제공사를 선택하세요</p>
                  <p className="text-xs text-slate-500">제공사를 클릭하면 게임 목록이 표시됩니다</p>
                </div>
              </div>
            ) : gamesLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
              </div>
            ) : games.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-slate-400">
                  <Gamepad2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium">게임이 없습니다</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {filteredGames.map(game => {
                  const selected = isGameSelected(game);
                  
                  return (
                    <div
                      key={game.id}
                      className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all ${
                        selected
                          ? 'bg-blue-600/30 border-2 border-blue-400 shadow-md shadow-blue-500/30'
                          : 'border-2 border-slate-700 hover:border-purple-500/50 hover:bg-slate-700/50'
                      }`}
                      onClick={() => toggleGame(game)}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleGame(game)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0 h-4 w-4"
                      />
                      <p className={`text-sm flex-1 leading-tight font-medium ${
                        selected ? 'text-white' : 'text-slate-200'
                      }`}>{game.name}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 선택 요약 */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-600/10 to-blue-600/10 rounded-lg border border-green-500/30">
        <div className="flex items-center gap-3">
          <div className="bg-green-500/30 p-2 rounded-lg">
            <Check className="h-5 w-5 text-green-300" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">
              {(() => {
                // 선택된 게임 개수
                const selectedGamesCount = value.filter(v => v.access_type === 'game').length;
                
                // 선택된 게임이 속한 제공사 개수 (중복 제거)
                const selectedProviderIds = new Set(
                  value
                    .filter(v => v.access_type === 'game' && v.game_provider_id)
                    .map(v => `${v.api_provider}:${v.game_provider_id}`)
                );
                
                const selectedProvidersCount = selectedProviderIds.size;
                
                return (
                  <>
                    제공사 {selectedProvidersCount}개, {' '}
                    게임 {selectedGamesCount}개 선택됨
                  </>
                );
              })()}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              선택된 모든 게임이 개별적으로 포함됩니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}