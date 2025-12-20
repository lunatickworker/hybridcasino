import { useState, useEffect, useRef, useMemo } from "react";
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
  Coins
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { User } from "../../types";
import { gameApi } from "../../lib/gameApi";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../contexts/LanguageContext";

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

export function UserSlot({ user, onRouteChange }: UserSlotProps) {
  // Guard against null user
  if (!user) {
    return (
      <Card className="bg-[#1a1f3a] border-purple-900/30 text-white">
        <CardContent className="p-8 text-center">
          <p className="text-gray-400">사용자 정보를 불러올 수 없습니다.</p>
        </CardContent>
      </Card>
    );
  }
  
  const [selectedProvider, setSelectedProvider] = useState(""); // ✅ 빈 문자열로 시작
  const [searchQuery, setSearchQuery] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<number | null>(null);
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'deposit' | 'launch' | 'withdraw' | 'switch_deposit'>('launch');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const isMountedRef = useRef(true);
  const { t } = useLanguage();

  useEffect(() => {
    initializeData();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // ✅ selectedProvider 변경 시 해당 제공사 게임 로드
    if (selectedProvider && selectedProvider !== "all") {
      loadSlotGames(parseInt(selectedProvider));
    } else if (selectedProvider === "all") {
      loadAllSlotGames();
    }
  }, [selectedProvider]);

  const initializeData = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);
      
      // ✅ 1. 제공사만 먼저 빠르게 로드
      const providersData = await gameApi.getUserVisibleProviders({ type: 'slot' });
      
      if (isMountedRef.current) {
        setProviders(providersData);
        
        // ✅ 2. 첫 번째 제공사를 기본 선택
        if (providersData.length > 0) {
          setSelectedProvider(providersData[0].id.toString());
          // ✅ 3. 첫 번째 제공사의 게임만 로드
          await loadSlotGames(providersData[0].id);
        }
      }
      
    } catch (error) {
      if (isMountedRef.current) {
        console.error('초기화 오류:', error);
        toast.error('데이터를 불러오는데 실패했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setIsInitialLoad(false);
      }
    }
  };

  const loadSlotGames = async (providerId: number) => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);

      // ✅ gameApi.getUserVisibleGames 사용 (HonorAPI 지원)
      const gamesData = await gameApi.getUserVisibleGames({
        type: 'slot',
        provider_id: providerId
      });

      console.log(`🎰 [슬롯 게임 로드] Provider ID ${providerId}: ${gamesData?.length || 0}개 게임`);

      const formattedGames = gamesData?.map(game => ({
        game_id: game.id,
        provider_id: game.provider_id,
        provider_name: (game as any).game_providers?.name || 'Unknown',
        provider_logo: (game as any).game_providers?.logo_url,
        game_name: game.name,
        game_type: game.type,
        image_url: game.image_url,
        is_featured: game.is_featured || false,
        rtp: game.rtp,
        status: game.status,
        priority: game.priority || 0,
        api_type: game.api_type
      })) || [];

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

  const loadAllSlotGames = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);

      // ✅ gameApi.getUserVisibleGames 사용 (HonorAPI 지원)
      const gamesData = await gameApi.getUserVisibleGames({
        type: 'slot'
      });

      console.log(`🎰 [슬롯 게임 전체 로드] 총 ${gamesData?.length || 0}개 게임`);

      const formattedGames = gamesData?.map(game => ({
        game_id: game.id,
        provider_id: game.provider_id,
        provider_name: game.provider_name || 'Unknown',
        provider_logo: (game as any).game_providers?.logo_url,
        game_name: game.name,
        game_type: game.type,
        image_url: game.image_url,
        is_featured: game.is_featured || false,
        rtp: game.rtp,
        status: game.status,
        priority: game.priority || 0,
        api_type: game.api_type
      })) || [];

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
      
      if (activeSession?.isActive && activeSession.api_type !== game.api_type) {
        const apiNames = {
          invest: 'Invest API',
          oroplay: 'OroPlay API',
          familyapi: 'FamilyAPI',
          honorapi: 'HonorAPI'
        };
        
        toast.error(
          `${apiNames[activeSession.api_type!] || activeSession.api_type} 게임이 실행 중입니다.\\n` +
          `현재 게임: ${activeSession.game_name}\\n\\n` +
          `다른 API 게임을 실행하려면 현재 게임을 종료해주세요.`,
          { duration: 5000 }
        );
        
        setLaunchingGameId(null);
        return;
      }

      if (activeSession?.isActive && 
          activeSession.api_type === game.api_type && 
          activeSession.game_id !== game.game_id) {
        
        console.log('🔄 [게임 전환] 기존 게임 출금 후 새 게임 실행:', {
          oldGameId: activeSession.game_id,
          newGameId: game.game_id
        });
        
        setLoadingStage('withdraw');
        setShowLoadingPopup(true);
        
        const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
        await syncBalanceOnSessionEnd(user.id, activeSession.api_type);
        
        console.log('✅ [게임 전환] 기존 게임 출금 완료, 새 게임 실행 시작');
      }

      if (activeSession?.isActive && 
          activeSession.game_id === game.game_id && 
          activeSession.status === 'active' && 
          activeSession.launch_url) {
        
        console.log('🔄 [슬롯 실행] active 세션 재사용 - 기존 URL 사용:', activeSession.session_id);
        
        const gameWindow = window.open(
          activeSession.launch_url,
          '_blank',
          'width=1280,height=720,scrollbars=yes,resizable=yes'
        );

        if (!gameWindow) {
          toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          const sessionId = activeSession.session_id!;
          
          await supabase
            .from('game_launch_sessions')
            .update({ 
              ready_status: 'popup_blocked',
              last_activity_at: new Date().toISOString()
            })
            .eq('id', sessionId);
            
          console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료 (active 세션 재사용)');
        } else {
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
      
      setLoadingStage('launch');
      setShowLoadingPopup(true);
      
      const result = await gameApi.generateGameLaunchUrl(user.id, game.game_id);
      
      setShowLoadingPopup(false);
      
      if (result.success && result.launchUrl) {
        const sessionId = result.sessionId;
        
        const gameWindow = window.open(
          result.launchUrl,
          '_blank',
          'width=1280,height=720,scrollbars=yes,resizable=yes'
        );

        if (!gameWindow) {
          toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          if (sessionId && typeof sessionId === 'number') {
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
    // ✅ 검색어 필터링만 수행 (제공사 필터링은 loadSlotGames에서 처리)
    if (searchQuery.trim()) {
      const search = searchQuery.toLowerCase();
      const matchesName = game.game_name.toLowerCase().includes(search);
      const matchesProvider = game.provider_name.toLowerCase().includes(search);
      if (!matchesName && !matchesProvider) {
        return false;
      }
    }

    return true;
  });

  return (
    <>
      {/* ⭐ 게임 준비 다이얼로그 */}
      <GamePreparingDialog show={showLoadingPopup} stage={loadingStage} />
      
      <div className="relative min-h-screen overflow-x-hidden">
        <div 
          className="fixed inset-0 z-0 w-full h-full"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.90)), url('https://images.unsplash.com/photo-1511882150382-421056c89033?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzbG90JTIwbWFjaGluZSUyMGdhbWVzfGVufDF8fHx8MTc1OTcyMDM2M3ww&ixlib=rb-4.1.0&q80&w=1080&utm_source=figma&utm_medium=referral')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat'
          }}
        />
        
        <div className="relative z-10 space-y-8 p-4 sm:p-6 lg:p-8">
          {/* 슬롯 헤더 */}
          <div className="text-center space-y-6">
            <div className="flex items-center justify-center gap-4 mb-6">
              <Coins className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]" />
              <h1 className="text-6xl lg:text-7xl font-bold gold-text neon-glow">
                {t.user.slotTitle}
              </h1>
              <Coins className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]" />
            </div>
            <p className="text-3xl text-yellow-100 tracking-wide">
              {t.user.slotSubtitle}
            </p>
          </div>

          {/* 검색 */}
          <div className="flex flex-col lg:flex-row gap-5 items-center justify-between">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-yellow-400" />
              <Input
                type="text"
                placeholder={t.user.searchGame}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-lg bg-black/50 border-yellow-600/30 text-white placeholder:text-yellow-200/50 focus:border-yellow-500"
              />
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
          {isInitialLoad && loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Card key={i} className="luxury-card animate-pulse border-yellow-600/20">
                  <div className="aspect-[4/3] bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredGames.map((game) => (
                <Card 
                  key={game.game_id} 
                  className={`group cursor-pointer bg-slate-900/80 border border-slate-700/50 hover:border-yellow-500/50 transition-all duration-300 overflow-hidden rounded-xl hover:shadow-xl hover:shadow-yellow-500/20 ${
                    launchingGameId === game.game_id ? 'opacity-50' : ''
                  }`}
                  onClick={() => handleGameClick(game)}
                >
                  <div className="aspect-[4/3] relative overflow-hidden bg-slate-800">
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
                {t.user.noGamesFound}
              </h3>
              <p className="text-yellow-200/80 text-lg mb-4">
                {searchQuery ? t.user.noGamesMessage.replace('{{query}}', searchQuery) : 
                 selectedProvider !== 'all' ? t.user.noGamesProvider :
                 t.user.noSlotGamesAvailable}
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    if (providers.length > 0) {
                      setSelectedProvider(providers[0].id.toString());
                    }
                  }}
                  className="border-yellow-600/30 text-yellow-300 hover:bg-yellow-900/20"
                >
                  {t.user.viewAllGames}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedProvider && selectedProvider !== "all") {
                      loadSlotGames(parseInt(selectedProvider));
                    } else {
                      loadAllSlotGames();
                    }
                  }}
                  className="border-yellow-600/30 text-yellow-300 hover:bg-yellow-900/20"
                >
                  {t.user.refresh}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}