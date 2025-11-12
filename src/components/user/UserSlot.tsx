import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { GameProviderSelector } from "./GameProviderSelector";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { GamePreparingDialog } from "./GamePreparingDialog";
import { 
  Search, 
  Play, 
  Star, 
  Loader, 
  Crown,
  Sparkles,
  Trophy,
  Target,
  Gem,
  Coins
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { User } from "../../types";
import { gameApi } from "../../lib/gameApi";
import { supabase } from "../../lib/supabase";

interface Game {
  game_id: number;
  provider_id: number;
  provider_name: string;
  provider_logo?: string;
  game_name: string;
  game_type: string;
  image_url?: string;
  is_featured: boolean;
  rtp?: number;
  status: string;
  priority: number;
  api_type?: string;
}

interface UserSlotProps {
  user: User;
  onRouteChange: (route: string) => void;
}

const slotCategories = [
  { id: 'all', name: '전체', icon: Crown, gradient: 'from-yellow-500 to-amber-600' },
  { id: 'featured', name: '인기', icon: Star, gradient: 'from-red-500 to-pink-600' },
  { id: 'new', name: '신규', icon: Sparkles, gradient: 'from-blue-500 to-cyan-600' },
  { id: 'jackpot', name: '잭팟', icon: Trophy, gradient: 'from-purple-500 to-purple-600' },
  { id: 'bonus', name: '보너스', icon: Gem, gradient: 'from-green-500 to-emerald-600' },
  { id: 'high-rtp', name: '고수익', icon: Target, gradient: 'from-orange-500 to-red-600' }
];

export function UserSlot({ user, onRouteChange }: UserSlotProps) {
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [games, setGames] = useState<Game[]>([]);
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
      loadSlotGames();
    }
  }, [selectedProvider, selectedCategory]);

  const initializeData = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);
      
      const providersData = await gameApi.getUserVisibleProviders({ type: 'slot' });
      
      if (isMountedRef.current) {
        setProviders(providersData);
      }
      
      await loadSlotGames();
      
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

  const loadSlotGames = async () => {
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
          rtp,
          api_type
        `)
        .eq('type', 'slot')
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
          is_featured: game.is_featured || false,
          rtp: game.rtp,
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
        toast.error('슬롯 게임을 불러오는데 실패했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleGameClick = async (game: Game) => {
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
        
        console.log('🔄 [슬롯 실행] ready 세션 재사용 - 기존 URL 사용 (입금 API 호출 안함):', activeSession.session_id);
        
        // 기존 launch_url로 게임창 오픈 (중복 입금 없음)
        const gameWindow = window.open(
          activeSession.launch_url,
          '_blank',
          'width=1280,height=720,scrollbars=yes,resizable=yes'
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
          toast.success(`${game.game_name} 게임을 시작합니다.`);
          
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
          
          // 게임창 닫힘 감지 설정
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
          'width=1280,height=720,scrollbars=yes,resizable=yes'
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
          toast.success(`${game.game_name} 게임을 시작합니다.`);
          
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
        toast.error(`게임 실행 실패: ${result.error || '알 수 없는 오류가 발생했습니다.'}`);
      }
    } catch (error) {
      console.error('게임 실행 오류:', error);
      toast.error(`게임 실행 중 오류: ${error instanceof Error ? error.message : '시스템 오류가 발생했습니다.'}`);
      setShowLoadingPopup(false);
    } finally {
      setLaunchingGameId(null);
    }
  };

  const filteredGames = games.filter(game => {
    const matchesSearch = searchTerm === '' || 
                         game.game_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         game.provider_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesCategory = true;
    if (selectedCategory !== 'all') {
      const gameName = game.game_name.toLowerCase();
      
      switch (selectedCategory) {
        case 'featured':
          matchesCategory = game.is_featured;
          break;
        case 'new':
          matchesCategory = true; // 신규 게임 로직 (created_at 기반 필터링 가능)
          break;
        case 'jackpot':
          matchesCategory = gameName.includes('jackpot') || gameName.includes('잭팟');
          break;
        case 'bonus':
          matchesCategory = gameName.includes('bonus') || gameName.includes('보너스');
          break;
        case 'high-rtp':
          matchesCategory = (game.rtp || 0) >= 96;
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
    <div className="relative min-h-screen overflow-x-hidden">
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.8)), url('https://images.unsplash.com/photo-1511882150382-421056c89033?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzbG90JTIwbWFjaGluZSUyMGdhbWVzfGVufDF8fHx8MTc1OTcyMDM2M3ww&ixlib=rb-4.1.0&q80&w=1080&utm_source=figma&utm_medium=referral')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      />
      
      <div className="relative z-10 space-y-8 p-4 sm:p-6 lg:p-8">
        {/* 슬롯 헤더 */}
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center gap-4 mb-6">
            <Coins className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]" />
            <h1 className="text-6xl lg:text-7xl font-bold gold-text neon-glow">
              VIP 슬롯 게임
            </h1>
            <Coins className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]" />
          </div>
          <p className="text-3xl text-yellow-100 tracking-wide">
            화려한 잭팟과 함께하는 프리미엄 슬롯 경험
          </p>
        </div>

        {/* 검색 및 필터 */}
        <div className="flex flex-col lg:flex-row gap-5 items-center justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-yellow-400" />
            <Input
              type="text"
              placeholder="게임 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-14 text-lg bg-black/50 border-yellow-600/30 text-white placeholder:text-yellow-200/50 focus:border-yellow-500"
            />
          </div>
          
          {/* 카테고리 선택 */}
          <div className="flex flex-wrap gap-3">
            {slotCategories.map((category) => {
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
          gameType="slot"
          providers={providers}
        />

        {/* 슬롯 게임 목록 */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card key={i} className="luxury-card animate-pulse border-yellow-600/20">
                <div className="aspect-[3/4] bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
            {filteredGames.map((game) => (
              <Card 
                key={game.game_id} 
                className={`group cursor-pointer bg-slate-900/80 border border-slate-700/50 hover:border-yellow-500/50 transition-all duration-300 overflow-hidden rounded-xl hover:shadow-xl hover:shadow-yellow-500/20 ${
                  launchingGameId === game.game_id ? 'opacity-50' : ''
                }`}
                onClick={() => handleGameClick(game)}
              >
                <div className="aspect-[3/4] relative overflow-hidden bg-slate-800">
                  <ImageWithFallback
                    src={game.image_url}
                    alt={game.game_name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  
                  {/* 오버레이 */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                  
                  {/* 배지 */}
                  {game.is_featured && (
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-yellow-500/90 text-black border-0 text-xs backdrop-blur-sm">
                        <Star className="w-3 h-3 mr-1 fill-current" />
                        인기
                      </Badge>
                    </div>
                  )}

                  {/* 호버 플레이 버튼 */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {launchingGameId === game.game_id ? (
                      <div className="flex flex-col items-center gap-2 text-white">
                        <Loader className="w-10 h-10 animate-spin" />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-yellow-500/20 backdrop-blur-md flex items-center justify-center border-2 border-yellow-500/50">
                          <Play className="w-8 h-8 text-yellow-400 fill-current" />
                        </div>
                        <span className="text-white font-bold text-sm">플레이</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* 카드 정보 */}
                <div className="p-3 bg-slate-900/90">
                  <h3 className="font-bold text-white text-base mb-1 truncate">
                    {game.game_name}
                  </h3>
                  <div className="flex items-center justify-between text-xs">
                    <p className="text-yellow-400/80 truncate flex-1">
                      {game.provider_name}
                    </p>
                    {game.rtp && (
                      <div className="text-green-400 ml-2">
                        RTP: {game.rtp}%
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {filteredGames.length === 0 && !loading && (
          <div className="text-center py-16 luxury-card rounded-2xl border-2 border-yellow-600/20">
            <div className="mx-auto w-24 h-24 bg-gradient-to-br from-yellow-500/20 to-amber-600/20 rounded-full flex items-center justify-center mb-6">
              <Coins className="w-12 h-12 text-yellow-400" />
            </div>
            <h3 className="text-2xl font-bold gold-text mb-2">
              게임을 찾을 수 없습니다
            </h3>
            <p className="text-yellow-200/80 text-lg mb-4">
              {searchTerm ? `"${searchTerm}"에 대한 검색 결과가 없습니다.` : 
               selectedCategory !== 'all' ? '선택한 카테고리의 ���임이 없습니다.' : 
               selectedProvider !== 'all' ? '선택한 제공사의 게임이 없습니다.' :
               '사용 가능한 슬롯 게임이 없습니다.'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('all');
                  setSelectedProvider('all');
                }}
                className="border-yellow-600/30 text-yellow-300 hover:bg-yellow-900/20"
              >
                전체 게임 보기
              </Button>
              <Button
                variant="outline"
                onClick={() => loadSlotGames()}
                className="border-yellow-600/30 text-yellow-300 hover:bg-yellow-900/20"
              >
                새로고침
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* 게임 로딩 팝업 */}
      <GamePreparingDialog
        show={showLoadingPopup}
        stage={loadingStage}
      />
    </div>
  );
}