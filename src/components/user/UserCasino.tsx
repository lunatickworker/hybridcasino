import { useState, useEffect, useRef, useMemo } from "react";
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
  Star,
  Clock,
  Trophy
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { User } from "../../types";
import { gameApi } from "../../lib/gameApi";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../contexts/LanguageContext";

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

export function UserCasino({ user, onRouteChange }: UserCasinoProps) {
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
  const [games, setGames] = useState<CasinoGame[]>([]);
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
      loadCasinoGames(parseInt(selectedProvider));
    } else if (selectedProvider === "all") {
      loadAllCasinoGames();
    }
  }, [selectedProvider]);

  const initializeData = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);
      
      // ✅ 1. 제공사만 먼저 빠르게 로드 (userId 전달)
      const providersData = await gameApi.getUserVisibleProviders({ 
        type: 'casino',
        userId: user.id // 🆕 사용자 ID 전달
      });
      
      if (isMountedRef.current) {
        setProviders(providersData);
        
        // ✅ 2. 첫 번째 제공사를 기본 선택
        if (providersData.length > 0) {
          setSelectedProvider(providersData[0].id.toString());
          // ✅ 3. 첫 번째 제공사의 게임만 로드
          await loadCasinoGames(providersData[0].id);
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

  const loadCasinoGames = async (providerId: number) => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);

      // ✅ gameApi.getUserVisibleGames 사용 (HonorAPI 지원)
      const gamesData = await gameApi.getUserVisibleGames({
        type: 'casino',
        provider_id: providerId,
        userId: user.id // 🆕 사용자 ID 전달
      });

      console.log(`🎰 [카지노 게임 로드] Provider ID ${providerId}: ${gamesData?.length || 0}개 게임`);

      const formattedGames = gamesData?.map(game => ({
        game_id: game.id,
        provider_id: game.provider_id,
        provider_name: game.provider_name || 'Unknown',
        provider_logo: (game as any).game_providers?.logo_url,
        game_name: game.name,
        game_type: game.type,
        image_url: game.image_url,
        is_featured: game.is_featured || false,
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
        toast.error('카지노 게임을 불러오는데 실패했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const loadAllCasinoGames = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);

      // ✅ gameApi.getUserVisibleGames 사용 (HonorAPI 지원)
      const gamesData = await gameApi.getUserVisibleGames({
        type: 'casino'
      });

      console.log(`🎰 [카지노 게임 전체 로드] 총 ${gamesData?.length || 0}개 게임`);

      const formattedGames = gamesData?.map(game => ({
        game_id: game.id,
        provider_id: game.provider_id,
        provider_name: game.provider_name || 'Unknown',
        provider_logo: (game as any).game_providers?.logo_url,
        game_name: game.name,
        game_type: game.type,
        image_url: game.image_url,
        is_featured: game.is_featured || false,
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
      
      // ⭐ 0. 세션 종료 중(ending)인지 체크 - 게임 실행 차단
      if (activeSession?.isActive && activeSession.status === 'ending') {
        console.log('⏳ [게임 실행 차단] 이전 세션 종료 중...');
        toast.warning('이전 게임 종료 중입니다. 잠시 후 다시 시도해주세요.', { duration: 3000 });
        setLaunchingGameId(null);
        setIsProcessing(false);
        return;
      }
      
      // ⭐ 1. 다른 API 게임이 실행 중인지 체크
      if (activeSession?.isActive && activeSession.status === 'active' && activeSession.api_type !== game.api_type) {
        toast.error('잠시 후 다시 시도해주세요.');
        
        setLaunchingGameId(null);
        setIsProcessing(false); // 🆕 프로세스 종료
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

      // ⭐ 3. 같은 게임의 active 세션이 있는지 체크 (중복 실행 방지)
      if (activeSession?.isActive && 
          activeSession.game_id === game.game_id && 
          activeSession.status === 'active' && 
          activeSession.launch_url) {
        
        console.log('🔄 [카지노 입장] active 세션 재사용 - 기존 URL 사용:', activeSession.session_id);
        
        // 기존 launch_url로 게임창 오픈
        const gameWindow = window.open(
          activeSession.launch_url,
          '_blank',
          'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
        );

        if (!gameWindow) {
          // ⭐ 팝업 차단 시나리오
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
            
          console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료 (active 세션 재사용)');
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
    // ✅ 검색어 필터링만 수행 (제공사 필터링은 loadCasinoGames에서 처리)
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
      
      <div className="relative min-h-screen overflow-x-hidden" style={{ fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif' }}>
        {/* 로즈 골드 그라디언트 배경 */}
        <div 
          className="fixed inset-0 z-0 w-full h-full"
          style={{
            background: 'linear-gradient(135deg, #0f0c1a 0%, #1a1526 25%, #1e1830 50%, #1a1526 75%, #0f0c1a 100%)',
          }}
        />
        
        {/* 추가 오버레이 효과 */}
        <div 
          className="fixed inset-0 z-0 w-full h-full opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(193, 154, 107, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(166, 124, 82, 0.15) 0%, transparent 50%)'
          }}
        />
        
        <div className="relative z-10 space-y-8 p-4 sm:p-6 lg:p-8 pb-24">
          {/* 헤더 */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-4 mb-4">
              <Crown className="w-12 h-12 drop-shadow-[0_0_15px_rgba(193,154,107,0.6)]" style={{ color: '#C19A6B' }} />
              <h1 className="text-5xl lg:text-6xl font-bold" style={{
                background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 50%, #A67C52 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 20px rgba(193, 154, 107, 0.3))'
              }}>
                {t.user.casinoTitle}
              </h1>
              <Crown className="w-12 h-12 drop-shadow-[0_0_15px_rgba(193,154,107,0.6)]" style={{ color: '#C19A6B' }} />
            </div>
            <p className="text-xl" style={{ color: '#E6C9A8' }}>
              {t.user.casinoSubtitle}
            </p>
            <div className="flex items-center justify-center gap-6 text-slate-400 text-base">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#C19A6B' }} />
                <span>{t.user.realTimeLive}</span>
              </div>
              <div className="w-px h-5 bg-slate-700" />
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>{t.user.available24h}</span>
              </div>
              <div className="w-px h-5 bg-slate-700" />
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                <span>{t.user.vipExclusive}</span>
              </div>
            </div>
          </div>

          {/* 검색 */}
          <div className="flex flex-col lg:flex-row gap-5 items-center justify-between max-w-7xl mx-auto">
            <div className="relative flex-1 max-w-xl w-full">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#C19A6B' }} />
              <Input
                type="text"
                placeholder={t.user.searchGame}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 text-base text-white border-0"
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(193, 154, 107, 0.2)'
                }}
              />
            </div>
          </div>

          {/* 제공사 선택 */}
          <div className="max-w-7xl mx-auto">
            <GameProviderSelector
              selectedProvider={selectedProvider}
              onProviderChange={setSelectedProvider}
              gameType="casino"
              providers={providers}
            />
          </div>

          {/* 카지노 게임 목록 - 4칸 정렬 */}
          {isInitialLoad && loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="animate-pulse border-0" style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(193, 154, 107, 0.2)'
                }}>
                  <div className="aspect-[3/4] bg-gradient-to-br from-slate-800 to-slate-900 rounded-t-lg" />
                  <div className="p-4 space-y-2">
                    <div className="h-5 bg-slate-700 rounded w-3/4" />
                    <div className="h-4 bg-slate-800 rounded w-1/2" />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
              {filteredGames.map((game) => (
                <Card 
                  key={game.game_id} 
                  className={`group cursor-pointer border-0 overflow-hidden transition-all duration-300 hover:scale-[1.02] ${
                    launchingGameId === game.game_id ? 'opacity-50' : ''
                  }`}
                  style={{
                    background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.08) 0%, rgba(166, 124, 82, 0.05) 100%)',
                    border: '1px solid rgba(193, 154, 107, 0.2)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                  }}
                  onClick={() => handleGameClick(game)}
                >
                  <div className="aspect-[3/4] relative overflow-hidden" style={{ borderRadius: '12px 12px 0 0' }}>
                    <ImageWithFallback
                      src={game.image_url}
                      alt={game.game_name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    
                    {/* 그라디언트 오버레이 */}
                    <div 
                      className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity"
                      style={{
                        background: 'linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.4) 50%, rgba(0, 0, 0, 0.9) 100%)'
                      }}
                    />
                    
                    {/* 배지들 */}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <Badge className="text-white border-0 text-xs backdrop-blur-sm px-2 py-1" style={{
                        background: 'rgba(239, 68, 68, 0.9)'
                      }}>
                        <div className="w-1.5 h-1.5 bg-white rounded-full mr-1 animate-pulse" />
                        LIVE
                      </Badge>
                    </div>

                    {game.is_featured && (
                      <div className="absolute top-3 right-3">
                        <Badge className="border-0 text-xs backdrop-blur-sm px-2 py-1" style={{
                          background: 'rgba(193, 154, 107, 0.95)',
                          color: '#fff'
                        }}>
                          <Star className="w-3 h-3 mr-1 fill-current" />
                          VIP
                        </Badge>
                      </div>
                    )}

                    {/* 호버 플레이 버튼 */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      {launchingGameId === game.game_id ? (
                        <div className="flex flex-col items-center gap-2 text-white">
                          <Loader className="w-12 h-12 animate-spin" style={{ color: '#C19A6B' }} />
                          <span className="text-sm font-semibold">{t.user.entering}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-20 h-20 rounded-full backdrop-blur-md flex items-center justify-center" style={{
                            background: 'rgba(193, 154, 107, 0.2)',
                            border: '2px solid rgba(193, 154, 107, 0.6)'
                          }}>
                            <Play className="w-10 h-10 fill-current" style={{ color: '#E6C9A8' }} />
                          </div>
                          <span className="text-white font-bold text-base drop-shadow-lg">{t.user.enterCasino}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* 카드 정보 */}
                  <div className="p-4" style={{ background: 'rgba(0, 0, 0, 0.4)' }}>
                    <h3 className="font-bold text-white text-lg mb-2 truncate" style={{
                      textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)'
                    }}>
                      {game.game_name}
                    </h3>
                    <div className="flex items-center justify-between text-sm">
                      <p className="truncate flex-1" style={{ color: '#C19A6B' }}>
                        {game.provider_name}
                      </p>
                      <div className="flex items-center gap-1 text-green-400 ml-2">
                        <Clock className="w-3.5 h-3.5" />
                        <span>24H</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {filteredGames.length === 0 && !loading && (
            <div className="text-center py-16 rounded-2xl max-w-2xl mx-auto" style={{
              background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
              border: '1px solid rgba(193, 154, 107, 0.2)'
            }}>
              <div className="mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-6" style={{
                background: 'rgba(193, 154, 107, 0.2)'
              }}>
                <Crown className="w-12 h-12" style={{ color: '#C19A6B' }} />
              </div>
              <h3 className="text-2xl font-bold mb-2" style={{
                background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                {t.user.noGamesFound}
              </h3>
              <p className="text-slate-400 text-base mb-4">
                {searchQuery ? t.user.noGamesMessage.replace('{{query}}', searchQuery) : 
                 selectedProvider !== 'all' ? t.user.noGamesProvider :
                 t.user.noGamesAvailable}
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
                  className="border-0 text-white"
                  style={{
                    background: 'rgba(193, 154, 107, 0.2)',
                    border: '1px solid rgba(193, 154, 107, 0.3)'
                  }}
                >
                  {t.user.viewAllGames}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedProvider && selectedProvider !== "all") {
                      loadCasinoGames(parseInt(selectedProvider));
                    } else {
                      loadAllCasinoGames();
                    }
                  }}
                  className="border-0 text-white"
                  style={{
                    background: 'rgba(193, 154, 107, 0.2)',
                    border: '1px solid rgba(193, 154, 107, 0.3)'
                  }}
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