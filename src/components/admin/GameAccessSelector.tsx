import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner@2.0.3';
import { Check, ChevronRight, Search, X } from 'lucide-react';

interface GameProvider {
  id: number;
  name: string;
  type: string;
  logo_url?: string;
  api_type: string;
}

interface Game {
  id: number;
  name: string;
  provider_id: number;
  type: string;
  image_url?: string;
}

interface GameAccess {
  api_provider: string;
  game_provider_id?: string;
  game_id?: string;
  access_type: 'provider' | 'game';
}

interface GameAccessSelectorProps {
  partnerId?: string; // 수정 시 기존 파트너 ID
  availableApis: string[]; // Lv2에서 선택된 API 목록
  parentAccess?: GameAccess[]; // Lv7 생성 시 Lv6의 접근 권한
  value: GameAccess[];
  onChange: (access: GameAccess[]) => void;
  disabled?: boolean;
}

export function GameAccessSelector({
  partnerId,
  availableApis,
  parentAccess,
  value,
  onChange,
  disabled = false,
}: GameAccessSelectorProps) {
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGameModal, setShowGameModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<GameProvider | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadProvidersAndGames();
  }, [availableApis]);

  const loadProvidersAndGames = async () => {
    try {
      setLoading(true);

      // 각 API별로 프로바이더와 게임 로드
      const allProviders: GameProvider[] = [];
      const allGames: Game[] = [];

      for (const api of availableApis) {
        if (api === 'honorapi') {
          // HonorAPI 프로바이더
          const { data: honorProviders } = await supabase
            .from('honor_game_providers')
            .select('id, name, type, logo_url')
            .eq('is_visible', true)
            .order('name');

          if (honorProviders) {
            allProviders.push(
              ...honorProviders.map(p => ({ ...p, api_type: 'honorapi' }))
            );
          }

          // HonorAPI 게임
          const { data: honorGames } = await supabase
            .from('honor_games')
            .select('id, name, provider_id, type, image_url')
            .eq('is_visible', true)
            .order('name');

          if (honorGames) {
            allGames.push(...honorGames);
          }
        } else {
          // Invest, OroPlay, FamilyAPI 프로바이더
          const { data: regularProviders } = await supabase
            .from('game_providers')
            .select('id, name, type, logo_url, api_type')
            .eq('api_type', api)
            .eq('is_visible', true)
            .order('name');

          if (regularProviders) {
            allProviders.push(...regularProviders);
          }

          // 일반 게임
          const { data: regularGames } = await supabase
            .from('games')
            .select('id, name, provider_id, type, image_url')
            .eq('api_type', api)
            .eq('is_visible', true)
            .order('name');

          if (regularGames) {
            allGames.push(...regularGames);
          }
        }
      }

      setProviders(allProviders);
      setGames(allGames);
    } catch (error) {
      console.error('게임 데이터 로드 실패:', error);
      toast.error('게임 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 프로바이더가 선택되었는지 확인
  const isProviderSelected = (providerId: number, apiType: string) => {
    return value.some(
      access =>
        access.api_provider === apiType &&
        access.access_type === 'provider' &&
        access.game_provider_id === String(providerId)
    );
  };

  // 개별 게임이 선택되었는지 확인
  const isGameSelected = (gameId: number) => {
    return value.some(
      access =>
        access.access_type === 'game' &&
        access.game_id === String(gameId)
    );
  };

  // 프로바이더 전체 선택/해제
  const toggleProvider = (provider: GameProvider) => {
    if (disabled) return;

    const isSelected = isProviderSelected(provider.id, provider.api_type);
    
    if (isSelected) {
      // 프로바이더 제거 (해당 프로바이더의 개별 게임도 모두 제거)
      onChange(
        value.filter(
          access =>
            !(
              access.api_provider === provider.api_type &&
              (
                (access.access_type === 'provider' && access.game_provider_id === String(provider.id)) ||
                (access.access_type === 'game' && games.find(g => g.id === Number(access.game_id))?.provider_id === provider.id)
              )
            )
        )
      );
    } else {
      // 프로바이더 추가 (개별 게임 선택은 제거)
      const newValue = value.filter(
        access =>
          !(access.api_provider === provider.api_type &&
            access.access_type === 'game' &&
            games.find(g => g.id === Number(access.game_id))?.provider_id === provider.id)
      );
      
      onChange([
        ...newValue,
        {
          api_provider: provider.api_type,
          game_provider_id: String(provider.id),
          access_type: 'provider',
        },
      ]);
    }
  };

  // 개별 게임 선택/해제
  const toggleGame = (game: Game, provider: GameProvider) => {
    if (disabled) return;

    const isSelected = isGameSelected(game.id);
    
    if (isSelected) {
      // 게임 제거
      onChange(
        value.filter(
          access =>
            !(access.access_type === 'game' && access.game_id === String(game.id))
        )
      );
    } else {
      // 프로바이더 전체 선택이 되어있으면 먼저 제거
      const newValue = value.filter(
        access =>
          !(
            access.api_provider === provider.api_type &&
            access.access_type === 'provider' &&
            access.game_provider_id === String(provider.id)
          )
      );

      // 게임 추가
      onChange([
        ...newValue,
        {
          api_provider: provider.api_type,
          game_provider_id: String(provider.id),
          game_id: String(game.id),
          access_type: 'game',
        },
      ]);
    }
  };

  // API별로 프로바이더 그룹화
  const groupedProviders = providers.reduce((acc, provider) => {
    if (!acc[provider.api_type]) {
      acc[provider.api_type] = [];
    }
    acc[provider.api_type].push(provider);
    return acc;
  }, {} as Record<string, GameProvider[]>);

  // 선택된 항목 개수
  const getSelectedCount = (providerId: number, apiType: string) => {
    const providerGames = games.filter(g => g.provider_id === providerId);
    const selectedGames = value.filter(
      access =>
        access.api_provider === apiType &&
        access.access_type === 'game' &&
        providerGames.some(g => g.id === Number(access.game_id))
    );
    return selectedGames.length;
  };

  // 게임 검색 필터
  const filteredGames = selectedProvider
    ? games.filter(
        g =>
          g.provider_id === selectedProvider.id &&
          g.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const apiLabels: Record<string, string> = {
    invest: 'Invest API',
    oroplay: 'OroPlay API',
    familyapi: 'Family API',
    honorapi: 'Honor API',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-400">게임 데이터 로딩 중...</div>
      </div>
    );
  }

  if (availableApis.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        선택 가능한 API가 없습니다. 상위 파트너의 API 설정을 확인하세요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(groupedProviders).map(([apiType, apiProviders]) => (
        <div key={apiType} className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-700" />
            <Label className="text-sm font-medium text-slate-300">
              {apiLabels[apiType]}
            </Label>
            <div className="h-px flex-1 bg-slate-700" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {apiProviders.map(provider => {
              const isSelected = isProviderSelected(provider.id, provider.api_type);
              const selectedGameCount = getSelectedCount(provider.id, provider.api_type);
              const providerGamesCount = games.filter(g => g.provider_id === provider.id).length;

              return (
                <Card
                  key={`${provider.api_type}-${provider.id}`}
                  className={`p-4 cursor-pointer transition-all border-2 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500/10'
                      : selectedGameCount > 0
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => !disabled && toggleProvider(provider)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {isSelected && (
                          <div className="flex-shrink-0 w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        <h4 className="font-medium text-slate-200 truncate">
                          {provider.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="text-xs">
                          {provider.type === 'casino' ? '카지노' : provider.type === 'slot' ? '슬롯' : '미니게임'}
                        </Badge>
                        {isSelected ? (
                          <span className="text-blue-400 font-medium">
                            전체 선택 ({providerGamesCount}개)
                          </span>
                        ) : selectedGameCount > 0 ? (
                          <span className="text-purple-400 font-medium">
                            {selectedGameCount}/{providerGamesCount}개 선택
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            {providerGamesCount}개 게임
                          </span>
                        )}
                      </div>
                    </div>

                    {!disabled && !isSelected && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-shrink-0 h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProvider(provider);
                          setShowGameModal(true);
                          setSearchQuery('');
                        }}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* 선택 요약 */}
      {value.length > 0 && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">선택된 항목</Label>
            {!disabled && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange([])}
                className="h-7 text-xs text-red-400 hover:text-red-300"
              >
                <X className="w-3 h-3 mr-1" />
                모두 제거
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {value.map((access, idx) => {
              const provider = providers.find(
                p => p.id === Number(access.game_provider_id) && p.api_type === access.api_provider
              );
              const game = games.find(g => g.id === Number(access.game_id));

              return (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {provider?.name || 'Unknown'}
                  {access.access_type === 'game' && game && ` - ${game.name}`}
                  {access.access_type === 'provider' && ' (전체)'}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* 개별 게임 선택 모달 */}
      <Dialog open={showGameModal} onOpenChange={setShowGameModal}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedProvider?.name} - 게임 선택</span>
              <Badge variant="outline">
                {filteredGames.filter(g => isGameSelected(g.id)).length}/{filteredGames.length}개 선택
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="게임 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 게임 목록 */}
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-2 gap-3">
                {filteredGames.map(game => {
                  const isSelected = isGameSelected(game.id);
                  return (
                    <Card
                      key={game.id}
                      className={`p-3 cursor-pointer transition-all border ${
                        isSelected
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                      onClick={() => selectedProvider && toggleGame(game, selectedProvider)}
                    >
                      <div className="flex items-start gap-3">
                        {isSelected && (
                          <div className="flex-shrink-0 w-5 h-5 bg-purple-500 rounded flex items-center justify-center mt-0.5">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">
                            {game.name}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {game.type === 'casino' ? '카지노' : game.type === 'slot' ? '슬롯' : '미니게임'}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {filteredGames.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  {searchQuery ? '검색 결과가 없습니다.' : '게임이 없습니다.'}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGameModal(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
