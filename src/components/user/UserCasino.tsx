import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { GameProviderSelector } from "./GameProviderSelector";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { GamePreparingDialog } from "./GamePreparingDialog";
import { 
  Play, 
  Users, 
  Loader, 
  Search, 
  Crown,
  Zap,
  Star,
  Clock,
  Trophy,
  Sparkles,
  Target,
  Dice6
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { User } from "../../types";
import { gameApi } from "../../lib/gameApi";
import { supabase } from "../../lib/supabase";

interface CasinoGame {
  game_id: number;
  provider_id: number;
  provider_name: string;
  provider_logo?: string;
  game_name: string;
  game_type: string;
  image_url?: string;
  is_featured: boolean;
  status: string;
  priority: number;
  api_type?: string;
}

interface UserCasinoProps {
  user: User;
  onRouteChange: (route: string) => void;
}

const gameCategories = [
  { id: 'all', name: '전체', icon: Crown, gradient: 'from-yellow-500 to-amber-600' },
  { id: 'evolution', name: '에볼루션', icon: Target, gradient: 'from-red-500 to-red-600' },
  { id: 'pragmatic', name: '프라그마틱', icon: Zap, gradient: 'from-blue-500 to-blue-600' },
  { id: 'baccarat', name: '바카라', icon: Sparkles, gradient: 'from-purple-500 to-purple-600' },
  { id: 'blackjack', name: '블랙잭', icon: Dice6, gradient: 'from-green-500 to-green-600' },
  { id: 'roulette', name: '룰렛', icon: Trophy, gradient: 'from-orange-500 to-orange-600' }
];

export function UserCasino({ user, onRouteChange }: UserCasinoProps) {
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [games, setGames] = useState<CasinoGame[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<number | null>(null);
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'deposit' | 'launch' | 'withdraw' | 'switch_deposit'>('launch');
  const isMountedRef = useRef(true);

  useEffect(() => {
    initializeData();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isMountedRef.current) {
      loadCasinoGames();
    }
  }, [selectedProvider, selectedCategory]);

  const initializeData = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);
      
      const providersData = await gameApi.getUserVisibleProviders({ type: 'casino' });
      
      if (isMountedRef.current) {
        setProviders(providersData);
      }
      
      await loadCasinoGames();
      
    } catch (error) {
      if (isMountedRef.current) {
        console.error('초기화 오류:', error);
        toast.error('데이터를 불러오는데 실패했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const loadCasinoGames = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);

      // ✅ Sample1처럼 간단한 쿼리로 변경
      let query = supabase
        .from('games')
        .select(`
          id,
          provider_id,
          name,
          type,
          status,
          image_url,
          is_featured,
          priority,
          api_type
        `)
        .eq('type', 'casino')
        .eq('status', 'visible');

      // 제공사 필터링 (all이 아닐 때만)
      if (selectedProvider !== 'all') {
        query = query.eq('provider_id', parseInt(selectedProvider));
      }

      const { data: gamesData, error } = await query.order('priority', { ascending: false });

      if (error) throw error;

      // 게임 제공사 정보를 별도로 조회
      const providerIds = [...new Set(gamesData?.map(g => g.provider_id) || [])];
      const { data: providersData } = await supabase
        .from('game_providers')
        .select('id, name, logo_url')
        .in('id', providerIds);

      // 제공사 정보를 맵으로 변환
      const providerMap = new Map(providersData?.map(p => [p.id, p]) || []);

      const formattedGames = gamesData?.map(game => {
        const provider = providerMap.get(game.provider_id);
        return {
          game_id: game.id,
          provider_id: game.provider_id,
          provider_name: provider?.name || 'Unknown',
          provider_logo: provider?.logo_url,
          game_name: game.name,
          game_type: game.type,
          image_url: game.image_url,
          is_featured: game.is_featured,
          status: game.status,
          priority: game.priority || 0,
          api_type: game.api_type
        };
      }) || [];

      const sortedGames = formattedGames.sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return b.priority - a.priority;
      });

      if (isMountedRef.current) {
        setGames(sortedGames);
      }
      
    } catch (error) {
      if (isMountedRef.current) {
        console.error('게임 로드 실패:', error);
        toast.error('카지노 게임을 불러오는데 실패했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleGameClick = async (game: CasinoGame) => {
    if (launchingGameId === game.game_id) return;

    setLaunchingGameId(game.game_id);
    
    try {
      const activeSession = await gameApi.checkActiveSession(user.id);
      
      // ⭐ 1. 다른 API 게임이 실행 중인지 체크
      if (activeSession?.isActive && activeSession.api_type !== game.api_type) {
        const apiNames = {
          invest: 'Invest API',
          oroplay: 'OroPlay API'
        };
        
        toast.error(
          `${apiNames[activeSession.api_type!]} 게임이 실행 중입니다.\\n` +
          `현재 게임: ${activeSession.game_name}\\n\\n` +
          `다른 API 게임을 실행하려면 현재 게임을 종료해주세요.`,
          { duration: 5000 }
        );
        
        setLaunchingGameId(null);
        return;
      }

      // ⭐ 2. 같은 API 내에서 다른 게임으로 전환 시 기존 게임 출금
      if (activeSession?.isActive && 
          activeSession.api_type === game.api_type && 
          activeSession.game_id !== game.game_id) {
        
        console.log('🔄 [게임 전환] 기존 게임 출금 후 새 게임 실행:', {
          oldGameId: activeSession.game_id,
          newGameId: game.game_id
        });
        
        setLoadingStage('withdraw');
        setShowLoadingPopup(true);
        
        // 기존 게임 출금 + 보유금 동기화
        const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
        await syncBalanceOnSessionEnd(user.id, activeSession.api_type);
        
        console.log('✅ [게임 전환] 기존 게임 출금 완료, 새 게임 실행 시작');
        
        // 이후 새 게임 실행 로직으로 진행 (break 없이 계속)
      }

      // ⭐ 3. 같은 게임의 ready 세션이 있는지 체크 (입금 API 중복 호출 방지)
      if (activeSession?.isActive && 
          activeSession.game_id === game.game_id && 
          activeSession.status === 'ready' && 
          activeSession.launch_url) {
        
        console.log('🔄 [카지노 입장] ready 세션 재사용 - 기존 URL 사용 (입금 API 호출 안함):', activeSession.session_id);
        
        // 기존 launch_url로 게임창 오픈 (중복 입금 없음)
        const gameWindow = window.open(
          activeSession.launch_url,
          '_blank',
          'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
        );

        if (!gameWindow) {
          // ⭐ 팝업 차단 시나리오 (ready 세션 재사용 시)
          toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          const sessionId = activeSession.session_id!;
          
          // ready_status를 'popup_blocked'로 업데이트 (세션은 유지)
          await supabase
            .from('game_launch_sessions')
            .update({ 
              ready_status: 'popup_blocked',
              last_activity_at: new Date().toISOString()
            })
            .eq('id', sessionId);
            
          console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료 (ready 세션 재사용)');
        } else {
          // ⭐ 팝업 오픈 성공: ready_status를 'popup_opened'로 업데이트
          toast.success(`${game.game_name} 카지노에 입장했습니다.`);
          
          const sessionId = activeSession.session_id!;
          
          await supabase
            .from('game_launch_sessions')
            .update({ 
              ready_status: 'popup_opened',
              last_activity_at: new Date().toISOString()
            })
            .eq('id', sessionId);
          
          if (!(window as any).gameWindows) {
            (window as any).gameWindows = new Map();
          }
          (window as any).gameWindows.set(sessionId, gameWindow);
          
          if (!(window as any).gameWindowCheckers) {
            (window as any).gameWindowCheckers = new Map();
          }
          
          let isProcessing = false;
          const handleGameWindowClose = async () => {
            if (isProcessing) return;
            isProcessing = true;
            
            setLoadingStage('withdraw');
            setShowLoadingPopup(true);
            
            const checker = (window as any).gameWindowCheckers?.get(sessionId);
            if (checker) {
              clearInterval(checker);
              (window as any).gameWindowCheckers?.delete(sessionId);
            }
            
            (window as any).gameWindows?.delete(sessionId);
            await (window as any).syncBalanceAfterGame?.(sessionId);
            
            setTimeout(() => {
              setShowLoadingPopup(false);
            }, 500);
          };
          
          const checkGameWindow = setInterval(() => {
            try {
              if (gameWindow.closed) {
                handleGameWindowClose();
              }
            } catch (error) {
              // 무시
            }
          }, 1000);
          
          (window as any).gameWindowCheckers.set(sessionId, checkGameWindow);
        }
        
        setLaunchingGameId(null);
        return;
      }
      
      // ⭐ 4. 새로운 게임 실행 (API 입금 포함)
      setLoadingStage('launch');
      setShowLoadingPopup(true);
      
      const result = await gameApi.generateGameLaunchUrl(user.id, game.game_id);
      
      // ⭐ 팝업 자동 닫힘
      setShowLoadingPopup(false);
      
      if (result.success && result.launchUrl) {
        const sessionId = result.sessionId;
        
        const gameWindow = window.open(
          result.launchUrl,
          '_blank',
          'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
        );

        if (!gameWindow) {
          // ⭐ 팝업 차단 시나리오: 세션 종료하지 않고 ready_status만 업데이트
          toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          if (sessionId && typeof sessionId === 'number') {
            // ready_status를 'popup_blocked'로 업데이트 (세션은 유지)
            await supabase
              .from('game_launch_sessions')
              .update({ 
                ready_status: 'popup_blocked',
                last_activity_at: new Date().toISOString()
              })
              .eq('id', sessionId);
              
            console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료. 재클릭 시 기존 URL 재사용됩니다.');
          }
        } else {
          // ⭐ 팝업 오픈 성공: ready_status를 'popup_opened'로 업데이트
          toast.success(`${game.game_name} 카지노에 입장했습니다.`);
          
          if (sessionId && typeof sessionId === 'number') {
            await supabase
              .from('game_launch_sessions')
              .update({ 
                ready_status: 'popup_opened',
                last_activity_at: new Date().toISOString()
              })
              .eq('id', sessionId);
              
            if (!(window as any).gameWindows) {
              (window as any).gameWindows = new Map();
            }
            (window as any).gameWindows.set(sessionId, gameWindow);
          }
          
          if (sessionId && typeof sessionId === 'number') {
            if (!(window as any).gameWindowCheckers) {
              (window as any).gameWindowCheckers = new Map();
            }
            
            let isProcessing = false;
            const handleGameWindowClose = async () => {
              if (isProcessing) return;
              isProcessing = true;
              
              // ⭐ 게임 종료 팝업 표시
              setLoadingStage('withdraw');
              setShowLoadingPopup(true);
              
              const checker = (window as any).gameWindowCheckers?.get(sessionId);
              if (checker) {
                clearInterval(checker);
                (window as any).gameWindowCheckers?.delete(sessionId);
              }
              
              (window as any).gameWindows?.delete(sessionId);
              
              // withdrawal API 호출 (syncBalanceAfterGame 내부에서 처리)
              await (window as any).syncBalanceAfterGame?.(sessionId);
              
              // ⭐ 종료 팝업 자동 닫힘 (0.5초 후)
              setTimeout(() => {
                setShowLoadingPopup(false);
              }, 500);
            };
            
            const checkGameWindow = setInterval(() => {
              try {
                if (gameWindow.closed) {
                  handleGameWindowClose();
                }
              } catch (error) {
                // 무시
              }
            }, 1000);
            
            (window as any).gameWindowCheckers.set(sessionId, checkGameWindow);
          }
        }
      } else {
        toast.error(`카지노 입장 실패: ${result.error || '알 수 없는 오류가 발생했습니다.'}`);
      }
    } catch (error) {
      console.error('카지노 실행 오류:', error);
      toast.error(`카지노 입장 중 오류: ${error instanceof Error ? error.message : '시스템 오류가 발생했습니다.'}`);
      setShowLoadingPopup(false);
    } finally {
      setLaunchingGameId(null);
    }
  };

  const filteredGames = games.filter(game => {
    const matchesSearch = searchQuery === '' || 
                         game.game_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         game.provider_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesCategory = true;
    if (selectedCategory !== 'all') {
      const gameName = game.game_name.toLowerCase();
      const providerName = game.provider_name.toLowerCase();
      
      switch (selectedCategory) {
        case 'evolution':
          matchesCategory = providerName.includes('evolution') || providerName.includes('에볼루션');
          break;
        case 'pragmatic':
          matchesCategory = providerName.includes('pragmatic') || providerName.includes('프라그마틱');
          break;
        case 'baccarat':
          matchesCategory = gameName.includes('baccarat') || gameName.includes('바카라');
          break;
        case 'blackjack':
          matchesCategory = gameName.includes('blackjack') || gameName.includes('블랙잭');
          break;
        case 'roulette':
          matchesCategory = gameName.includes('roulette') || gameName.includes('룰렛');
          break;
      }
    }
    
    let matchesProvider = true;
    if (selectedProvider !== 'all') {
      matchesProvider = game.provider_id === parseInt(selectedProvider);
    }
    
    return matchesSearch && matchesCategory && matchesProvider;
  });

  return (
    <>
      {/* ⭐ 게임 준비 다이얼로그 */}
      <GamePreparingDialog show={showLoadingPopup} stage={loadingStage} />
      
      <div className="relative min-h-screen overflow-x-hidden">
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.8)), url('https://images.unsplash.com/photo-1680191741548-1a9321688cc3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBjYXNpbm8lMjBpbnRlcmlvciUyMGJhY2tncm91bmR8ZW58MXx8fHwxNzU5NzIwMzYzfDA&ixlib=rb-4.1.0&q80&w=1080&utm_source=figma&utm_medium=referral')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      />
      
      <div className="relative z-10 space-y-8 p-4 sm:p-6 lg:p-8">
        {/* VIP 헤더 */}
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center gap-4 mb-6">
            <Crown className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]" />
            <h1 className="text-6xl lg:text-7xl font-bold gold-text neon-glow">
              VIP 라이브 카지노
            </h1>
            <Crown className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]" />
          </div>
          <p className="text-3xl text-yellow-100 tracking-wide">
            세계 최고의 딜러와 함께하는 프리미엄 게임 경험
          </p>
          <div className="flex items-center justify-center gap-6 text-yellow-300/80 text-lg">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span>실시간 라이브</span>
            </div>
            <div className="w-px h-6 bg-yellow-600/50" />
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <span>24시간 운영</span>
            </div>
            <div className="w-px h-6 bg-yellow-600/50" />
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              <span>VIP 전용</span>
            </div>
          </div>
        </div>

        {/* 검색 및 필터 */}
        <div className="flex flex-col lg:flex-row gap-5 items-center justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-yellow-400" />
            <Input
              type="text"
              placeholder="게임 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 text-lg bg-black/50 border-yellow-600/30 text-white placeholder:text-yellow-200/50 focus:border-yellow-500"
            />
          </div>
          
          {/* 카테고리 선택 */}
          <div className="flex flex-wrap gap-3">
            {gameCategories.map((category) => {
              const Icon = category.icon;
              const isActive = selectedCategory === category.id;
              return (
                <Button
                  key={category.id}
                  variant="ghost"
                  onClick={() => setSelectedCategory(category.id)}
                  className={`
                    relative px-6 py-4 text-lg font-bold transition-all duration-300
                    ${isActive 
                      ? `bg-gradient-to-r ${category.gradient} text-white shadow-lg shadow-yellow-500/50 scale-105` 
                      : 'text-yellow-200/80 hover:text-yellow-100 hover:bg-yellow-900/20'
                    }
                  `}
                >
                  <Icon className="w-5 h-5 mr-2" />
                  {category.name}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-300 to-transparent" />
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        {/* 제공사 선택 */}
        <GameProviderSelector
          selectedProvider={selectedProvider}
          onProviderChange={setSelectedProvider}
          gameType="casino"
          providers={providers}
        />

        {/* 카지노 게임 목록 */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="luxury-card animate-pulse border-yellow-600/20">
                <div className="aspect-[4/3] bg-gradient-to-br from-slate-700 to-slate-800 rounded-t-xl" />
                <CardContent className="p-4 space-y-3">
                  <div className="h-5 bg-gradient-to-r from-yellow-600/20 to-yellow-400/20 rounded" />
                  <div className="h-4 bg-gradient-to-r from-yellow-600/20 to-yellow-400/20 rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredGames.map((game) => (
              <Card 
                key={game.game_id} 
                className={`luxury-card group cursor-pointer border-2 border-yellow-600/20 hover:border-yellow-500/60 transition-all game-card-hover overflow-hidden ${
                  launchingGameId === game.game_id ? 'opacity-50' : ''
                }`}
                onClick={() => handleGameClick(game)}
              >
                <div className="aspect-[4/3] relative overflow-hidden">
                  <ImageWithFallback
                    src={game.image_url}
                    alt={game.game_name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-red-500 text-white border-0 animate-pulse shadow-lg">
                      <div className="w-2 h-2 bg-white rounded-full mr-1" />
                      LIVE
                    </Badge>
                  </div>

                  {game.is_featured && (
                    <div className="absolute top-3 right-3">
                      <Badge className="vip-badge text-white border-0">
                        <Star className="w-3 h-3 mr-1" />
                        VIP
                      </Badge>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
                    {launchingGameId === game.game_id ? (
                      <div className="flex flex-col items-center gap-2 text-white">
                        <Loader className="w-8 h-8 animate-spin" />
                        <span className="text-sm font-semibold">입장 중...</span>
                      </div>
                    ) : (
                      <Button 
                        size="lg" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-black font-bold shadow-lg shadow-yellow-500/40"
                      >
                        <Play className="w-5 h-5 mr-2" />
                        VIP 입장
                      </Button>
                    )}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                    <h3 className="font-bold text-lg mb-1 truncate neon-glow">
                      {game.game_name}
                    </h3>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-yellow-300 truncate">
                        {game.provider_name}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-green-400">
                        <Clock className="w-3 h-3" />
                        <span>24H</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {filteredGames.length === 0 && !loading && (
          <div className="text-center py-16 luxury-card rounded-2xl border-2 border-yellow-600/20">
            <div className="mx-auto w-24 h-24 bg-gradient-to-br from-yellow-500/20 to-amber-600/20 rounded-full flex items-center justify-center mb-6">
              <Crown className="w-12 h-12 text-yellow-400" />
            </div>
            <h3 className="text-2xl font-bold gold-text mb-2">
              게임을 찾을 수 없습니다
            </h3>
            <p className="text-yellow-200/80 text-lg mb-4">
              {searchQuery ? `"${searchQuery}"에 대한 검색 결과가 없습니다.` : 
               selectedCategory !== 'all' ? '선택한 카테고리의 게임이 없습니다.' : 
               selectedProvider !== 'all' ? '선택한 제공사의 게임이 없습니다.' :
               '사용 가능한 카지노 게임이 없습니다.'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedProvider('all');
                }}
                className="border-yellow-600/30 text-yellow-300 hover:bg-yellow-900/20"
              >
                전체 게임 보기
              </Button>
              <Button
                variant="outline"
                onClick={() => loadCasinoGames()}
                className="border-yellow-600/30 text-yellow-300 hover:bg-yellow-900/20"
              >
                새로고침
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}