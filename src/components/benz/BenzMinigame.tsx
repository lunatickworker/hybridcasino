import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { ChevronLeft, Sparkles, Play } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { motion } from "motion/react";
import { toast } from "sonner@2.0.3";
import { BenzGamePreparingDialog } from "./BenzGamePreparingDialog";

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
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'deposit' | 'launch' | 'withdraw' | 'switch_deposit'>('launch');
  const isMountedRef = useRef(true);

  useEffect(() => {
    loadProviders();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadProviders = async () => {
    try {
      setLoading(true);
      
      // ⭐ getUserVisibleProviders 사용 (/user(vip)와 동일한 로직)
      const providersData = await gameApi.getUserVisibleProviders({ 
        type: 'minigame',
        userId: user?.id 
      });
      
      console.log(`📊 [미니게임] 제공사 조회: ${providersData.length}개`);
      
      if (providersData.length > 0) {
        setProviders(providersData);
        // 첫 번째 제공사의 게임 리스트 자동 로드
        handleProviderClick(providersData[0]);
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
    try {
      setGamesLoading(true);
      setSelectedProvider(provider);

      const gamesData = await gameApi.getUserVisibleGames({
        type: 'minigame',
        provider_id: provider.id,
        userId: user.id // 🆕 userId 추가
      });

      setGames(gamesData || []);
    } catch (error) {
      console.error('게임 로드 오류:', error);
      setGames([]);
    } finally {
      setGamesLoading(false);
    }
  };

  const handleBackToProviders = () => {
    setSelectedProvider(null);
    setGames([]);
  };

  const handleGameClick = async (game: Game) => {
    if (launchingGameId === game.id) return;

    setLaunchingGameId(game.id);
    
    try {
      const activeSession = await gameApi.checkActiveSession(user.id);
      
      // ⭐ 1. 다른 API 게임이 실행 중인지 체크
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

      // ⭐ 2. 같은 API 내에서 다른 게임으로 전환 시 기존 게임 출금
      if (activeSession?.isActive && 
          activeSession.api_type === game.api_type && 
          activeSession.game_id !== parseInt(game.id)) {
        
        console.log('🔄 [게임 전환] 기존 게임 출금 후 새 게임 실행:', {
          oldGameId: activeSession.game_id,
          newGameId: game.id
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
      
      const result = await gameApi.generateGameLaunchUrl(user.id, parseInt(game.id));
      
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
        toast.error(result.error || '게임 실행에 실패했습니다.');
      }
    } catch (error) {
      console.error('게임 실행 오류:', error);
      toast.error('게임 실행에 실패했습니다.');
    } finally {
      setLaunchingGameId(null);
    }
  };

  return (
    <div className="p-6 space-y-6" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedProvider && providers.length > 1 && (
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
                {selectedProvider ? selectedProvider.name_ko || selectedProvider.name : 'MINI GAMES'}
              </span>
            </h1>
          </div>
        </div>
      </div>

      {/* 제공사 목록 (제공사가 여러 개일 경우에만) */}
      {!selectedProvider && providers.length > 1 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {loading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="aspect-[4/3] bg-gray-800 animate-pulse"></div>
            ))
          ) : (
            providers.map((provider) => (
              <motion.div
                key={provider.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="cursor-pointer"
                onClick={() => handleProviderClick(provider)}
              >
                <div className="relative aspect-[4/3] overflow-hidden group">
                  {/* 제공사 이미지 - 카드 전체를 꽉 채움 */}
                  <ImageWithFallback
                    src={provider.logo_url || provider.thumbnail_url || getRandomMiniImage()}
                    alt={provider.name}
                    className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
                  />
                  
                  {/* 제공사명 오버레이 - 하단에 50% 투명 배경 */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-4 py-3">
                    <p className="font-black text-center text-white" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)'
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
            games.map((game) => (
              <motion.div
                key={game.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="cursor-pointer"
                onClick={() => handleGameClick(game)}
              >
                <Card className="bg-[#1a1f3a] border-blue-500/30 overflow-hidden group">
                  <CardContent className="p-0">
                    <div className="relative aspect-[3/4] flex items-center justify-center bg-gradient-to-br from-blue-900/20 to-cyan-900/20">
                      {game.image_url ? (
                        <ImageWithFallback
                          src={game.image_url}
                          alt={game.name}
                          className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
                        />
                      ) : (
                        <Play className="w-12 h-12 text-blue-500/50" />
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <Play className="w-16 h-16 text-white" />
                      </div>
                      
                      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
                        <p className="font-black text-sm text-center text-white line-clamp-2" style={{
                          textShadow: '0 0 20px rgba(59, 130, 246, 0.8), 0 2px 10px rgba(0, 0, 0, 1)'
                        }}>
                          {game.name}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      )}
      
      {/* 게임 준비 중 다이얼로그 */}
      <BenzGamePreparingDialog
        show={showLoadingPopup}
        stage={loadingStage}
      />
    </div>
  );
}