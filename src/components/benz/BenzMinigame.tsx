import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { ChevronLeft, Sparkles, Play } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { motion } from "motion/react";
import { toast } from "sonner@2.0.3";

interface BenzMinigameProps {
  user: any;
  onRouteChange: (route: string) => void;
}

interface GameProvider {
  id: number;
  name: string;
  name_ko?: string;
  type: string;
  logo_url?: string;
  thumbnail_url?: string;
  status: string;
  vendor_code?: string;
  api_type?: string;
}

interface Game {
  id: string;
  name: string;
  name_ko?: string;
  game_code: string;
  image_url?: string;
  provider_id: number;
  api_type?: string;
}

const FALLBACK_MINI_IMAGES = [
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/powerball.png',
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/powerladder.png',
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/speedkino.png',
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/kinoladder.png',
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/roulette.png',
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/oddeven.png',
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/mini1.png',
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/mini2.png',
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/mini3.png',
  'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/mini4.png',
];

// 랜덤 이미지 선택 함수
const getRandomMiniImage = () => {
  const randomIndex = Math.floor(Math.random() * FALLBACK_MINI_IMAGES.length);
  return FALLBACK_MINI_IMAGES[randomIndex];
};

export function BenzMinigame({ user, onRouteChange }: BenzMinigameProps) {
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<GameProvider | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // 🆕 백엔드 처리 중 상태
  const isMountedRef = useRef(true);
  const selectedProviderRef = useRef<GameProvider | null>(null); // ⚡ 최신 selectedProvider 추적

  // ⚡ selectedProvider 변경 시 ref 업데이트
  useEffect(() => {
    selectedProviderRef.current = selectedProvider;
  }, [selectedProvider]);

  useEffect(() => {
    console.log('🎲 [BenzMinigame] useEffect 시작 - Realtime 구독 설정 중...');
    loadProviders();
    
    // ⚡ Realtime: games, game_providers, honor_games, honor_games_provider, partner_game_access 테이블 변경 감지
    const gamesChannel = supabase
      .channel('benz_minigame_games_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games' },
        (payload) => {
          console.log('🔄 [BenzMinigame] games 테이블 UPDATE 감지:', payload);
          loadProviders();
          // ⚡ ref로 최신 selectedProvider 참조
          if (selectedProviderRef.current) {
            console.log('🔄 [BenzMinigame] 게임 목록 새로고침 시작...');
            loadGames(selectedProviderRef.current);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_providers' },
        (payload) => {
          console.log('🔄 [BenzMinigame] game_providers 테이블 UPDATE 감지:', payload);
          loadProviders();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'honor_games' },
        (payload) => {
          console.log('🔄 [BenzMinigame] honor_games 테이블 UPDATE 감지:', payload);
          loadProviders();
          // ⚡ ref로 최신 selectedProvider 참조
          if (selectedProviderRef.current) {
            console.log('🔄 [BenzMinigame] 게임 목록 새로고침 시작...');
            loadGames(selectedProviderRef.current);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'honor_games_provider' },
        (payload) => {
          console.log('🔄 [BenzMinigame] honor_games_provider 테이블 UPDATE 감지:', payload);
          loadProviders();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partner_game_access' },
        (payload) => {
          console.log('🔄🔄🔄 [BenzMinigame] partner_game_access 테이블 변경 감지!!!', payload);
          console.log('🎮 [BenzMinigame] 게임 스위칭 설정 변경 감지! 즉시 새로고침...');
          loadProviders();
          if (selectedProviderRef.current) {
            console.log('🔄 [BenzMinigame] 게임 목록 새로고침 시작...');
            loadGames(selectedProviderRef.current);
          }
        }
      )
      .subscribe((status, err) => {
        console.log('📡📡📡 [BenzMinigame] Realtime 구독 상태:', status);
        if (err) {
          console.error('❌❌❌ [BenzMinigame] Realtime 구독 에러:', err);
        }
        if (status === 'SUBSCRIBED') {
          console.log('✅✅✅ [BenzMinigame] Realtime 구독 성공! partner_game_access 테이블 감지 중...');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('❌❌❌ [BenzMinigame] Realtime 구독 실패:', status);
        }
      });
    
    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(gamesChannel);
    };
  }, []);

  const loadProviders = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // ⭐⭐⭐ 새로운 노출 로직 사용
      const { filterVisibleProviders } = await import('../../lib/benzGameVisibility');
      const allProviders = await gameApi.getProviders({ type: 'minigame' });
      const providersData = await filterVisibleProviders(allProviders, user.id);
      
      console.log('🎲 [BenzMinigame] 노출 제공사:', providersData.length, '개');
      
      if (providersData.length > 0) {
        setProviders(providersData);
        // ⭐ 제공사 목록을 먼저 보여주도록 변경 (자동 로드 제거)
        // handleProviderClick(providersData[0]); // 제거됨
      } else {
        setProviders([]);
      }
    } catch (error) {
      console.error('❌ 제공사 로드 오류:', error);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderClick = async (provider: GameProvider) => {
    setSelectedProvider(provider);
    await loadGames(provider);
  };

  // ⚡ 게임 목록 로드 함수 (Realtime 콜백에서도 사용)
  const loadGames = async (provider: GameProvider) => {
    try {
      setGamesLoading(true);

      const gamesData = await gameApi.getUserVisibleGames({
        type: 'minigame',
        provider_id: provider.id,
        userId: user.id // 🆕 userId 추가
      });

      // ⭐⭐⭐ benzGameVisibility로 점검중/차단 상태 추가 필터링
      const { filterVisibleGames } = await import('../../lib/benzGameVisibility');
      const gamesWithStatus = await filterVisibleGames(gamesData || [], user.id);

      setGames(gamesWithStatus);
    } catch (error) {
      console.error('게임 로드 오류:', error);
      setGames([]);
    } finally {
      setGamesLoading(false);
    }
  };

  const handleBackToProviders = () => {
    // 🆕 백그라운드 프로세스 중 또는 게임 실행 중 클릭 방지
    if (isProcessing || launchingGameId) {
      toast.error('잠시 후 다시 시도해주세요.');
      return;
    }

    setSelectedProvider(null);
    setGames([]);
  };

  const handleGameClick = async (game: Game) => {
    // 🚫 점검중인 게임은 클릭 불가
    if ((game as any).status === 'maintenance') {
      toast.warning('현재 점검 중인 게임입니다.');
      return;
    }

    // 🆕 백그라운드 프로세스 중 또는 게임 실행 중 클릭 방지
    if (isProcessing || launchingGameId) {
      toast.error('잠시 후 다시 시도해주세요.');
      return;
    }

    setLaunchingGameId(game.id);
    setIsProcessing(true); // 🆕 프로세스 시작
    
    try {
      const activeSession = await gameApi.checkActiveSession(user.id);
      
      // ⭐ 1. 다른 API 게임이 실행 중인지 체크
      if (activeSession?.isActive && activeSession.api_type !== game.api_type) {
        toast.error('잠시 후 다시 시도해주세요.');
        
        setLaunchingGameId(null);
        setIsProcessing(false); // 🆕 프로세스 종료
        return;
      }

      // ⭐ 2. 같은 API 내에서 다른 게임으로 전환 시 기존 게임 출금
      if (activeSession?.isActive && 
          activeSession.api_type === game.api_type && 
          activeSession.game_id !== parseInt(game.id)) {
        
        console.log('🔄 [게임 전환] 기존 게임 출금 후 새 게임 실행:', {
          oldGameId: activeSession.game_id,
          newGameId: game.id
        });
        
        // 기존 게임 출금 + 보유금 동기화
        const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
        await syncBalanceOnSessionEnd(user.id, activeSession.api_type);
        
        console.log('✅ [게임 전환] 기존 게임 출금 완료, 새 게임 실행 시작');
        
        // 이후 새 게임 실행 로직으로 진행 (break 없이 계속)
      }

      // ⭐ 3. 같은 게임의 active 세션이 있는지 체크 (중복 실행 방지)
      if (activeSession?.isActive && 
          activeSession.game_id === parseInt(game.id) && 
          activeSession.status === 'active' && 
          activeSession.launch_url) {
        
        console.log('🔄 [미니게임 입장] active 세션 재사용 - 기존 URL 사용:', activeSession.session_id);
        
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
          toast.success(`${game.name} 미니게임에 입장했습니다.`);
          
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
            
            const checker = (window as any).gameWindowCheckers?.get(sessionId);
            if (checker) {
              clearInterval(checker);
              (window as any).gameWindowCheckers?.delete(sessionId);
            }
            
            (window as any).gameWindows?.delete(sessionId);
            await (window as any).syncBalanceAfterGame?.(sessionId);
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
        setIsProcessing(false); // 🆕 프로세스 종료
        return;
      }
      
      // ⭐ 4. 새로운 게임 실행 (API 입금 포함)
      const result = await gameApi.generateGameLaunchUrl(user.id, parseInt(game.id));
      
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
          toast.success(`${game.name} 미니게임에 입장했습니다.`);
          
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
              
              const checker = (window as any).gameWindowCheckers?.get(sessionId);
              if (checker) {
                clearInterval(checker);
                (window as any).gameWindowCheckers?.delete(sessionId);
              }
              
              (window as any).gameWindows?.delete(sessionId);
              
              // withdrawal API 호출 (syncBalanceAfterGame 내부에서 처리)
              await (window as any).syncBalanceAfterGame?.(sessionId);
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
        // 에러 메시지를 더 친절하게 표시
        const errorMessage = result.error || '게임을 실행할 수 없습니다.';
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('게임 실행 오류:', error);
      // catch 블록에서도 친절한 메시지 표시
      const errorMessage = error instanceof Error ? error.message : '게임을 실행할 수 없습니다.';
      if (errorMessage.includes('보유금')) {
        toast.error(errorMessage);
      } else {
        toast.error('게임을 실행할 수 없습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setLaunchingGameId(null);
      setIsProcessing(false); // 🆕 프로세스 종료
    }
  };

  return (
    <div className="p-6 space-y-6" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedProvider && (
            <Button
              onClick={handleBackToProviders}
              variant="ghost"
              className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
            >
              <ChevronLeft className="w-5 h-5 mr-2" />
              제공사 목록
            </Button>
          )}
          <div className="flex items-center gap-4">
            <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-cyan-500"></div>
            <h1 className="text-3xl font-black">
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                {selectedProvider ? selectedProvider.name_ko || selectedProvider.name : '미니 게임'}
              </span>
            </h1>
          </div>
        </div>
      </div>

      {/* ⭐ 제공사 목록 (항상 표시하되 selectedProvider가 없을 때만) */}
      {!selectedProvider && providers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {loading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="aspect-[4/3] bg-gray-800 animate-pulse"></div>
            ))
          ) : (
            providers.map((provider, index) => (
              <motion.div
                key={provider.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="cursor-pointer"
                onClick={() => handleProviderClick(provider)}
              >
                <div className="relative aspect-[4/3] overflow-hidden group">
                  {/* 제공사 이미지 - DB의 logo_url 사용 */}
                  <ImageWithFallback
                    src={provider.logo_url || "https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/mini/1.png"}
                    alt={provider.name}
                    className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
                  />
                  
                  {/* 제공사명 오버레이 - 하단 그라디언트 배경 */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent py-6 px-4">
                    <p className="text-xl font-black text-center text-white tracking-wide" style={{
                      textShadow: '0 0 12px rgba(0, 0, 0, 1), 0 2px 8px rgba(0, 0, 0, 0.9), 0 4px 16px rgba(59, 130, 246, 0.6)'
                    }}>
                      {provider.name_ko || provider.name}
                    </p>
                  </div>
                  
                  {/* 호버 효과 */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300"></div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* 게임 목록 */}
      {selectedProvider && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {gamesLoading ? (
            Array(12).fill(0).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-gray-800 animate-pulse"></div>
            ))
          ) : games.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-400">게임이 없습니다.</p>
            </div>
          ) : (
            games.map((game, index) => {
              const isMaintenance = (game as any).status === 'maintenance';
              
              return (
              <motion.div
                key={game.id}
                whileHover={{ scale: isMaintenance ? 1 : 1.05 }}
                whileTap={{ scale: isMaintenance ? 1 : 0.95 }}
                className={isMaintenance ? 'cursor-not-allowed' : 'cursor-pointer'}
                onClick={() => !isMaintenance && handleGameClick(game)}
              >
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden group shadow-lg hover:shadow-blue-500/30 transition-all duration-300">
                  {/* 게임 이미지 - DB의 image_url 사용 */}
                  {game.image_url ? (
                    <ImageWithFallback
                      src={game.image_url}
                      alt={game.name}
                      className={`w-full h-full object-cover transition-all duration-500 ${isMaintenance ? 'filter grayscale brightness-50' : 'group-hover:scale-110'}`}
                      style={{ objectPosition: 'center 30%' }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-900/30 to-cyan-900/30 flex items-center justify-center">
                      <Play className="w-12 h-12 text-blue-500/50" />
                    </div>
                  )}
                  
                  {/* 🚧 점검중 오버레이 */}
                  {isMaintenance && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10">
                      <div className="bg-orange-500/20 border-2 border-orange-500 rounded-lg px-6 py-3 backdrop-blur-sm">
                        <p className="text-orange-400 font-black text-lg tracking-wide">점검중</p>
                      </div>
                      <p className="text-gray-400 text-xs mt-3">잠시 후 다시 시도해주세요</p>
                    </div>
                  )}
                  
                  {/* 하단 그라디언트 오버레이 (항상 표시) */}
                  <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black via-black/70 to-transparent"></div>
                  
                  {/* 한글 게임명 (항상 표시) */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/50">
                    <p className="text-white text-center line-clamp-2" style={{
                      fontFamily: 'AsiaHead, -apple-system, sans-serif',
                      fontSize: '1.5rem',
                      fontWeight: '700',
                      textShadow: '0 3px 15px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,0.9)',
                      letterSpacing: '-0.01em',
                      lineHeight: '1.4'
                    }}>
                      {game.name_ko || game.name}
                    </p>
                  </div>
                  
                  {/* 호버 효과 - 플레이 버튼 & 밝기 조절 */}
                  <div className="absolute inset-0 bg-gradient-to-t from-blue-600/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 -translate-y-6">
                      <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center">
                        <Play className="w-8 h-8 text-white fill-white" />
                      </div>
                      <span className="text-white font-black tracking-wider drop-shadow-lg">
                        플레이
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}