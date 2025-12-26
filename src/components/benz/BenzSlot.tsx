import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { ChevronLeft, Sparkles, Play } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { motion } from "motion/react";
import { toast } from "sonner@2.0.3";

interface BenzSlotProps {
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
}

interface Game {
  id: string;
  name: string;
  game_code: string;
  image_url?: string;
  provider_id: number;
  api_type?: string;
}

const FALLBACK_PROVIDERS = [
  { id: 101, name: '프라그마틱 플레이', name_ko: '프라그마틱 플레이', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s1.png', status: 'visible' },
  { id: 102, name: 'PG소프트', name_ko: 'PG소프트', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s2.png', status: 'visible' },
  { id: 103, name: '넷엔트', name_ko: '넷엔트', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s10.png', status: 'visible' },
  { id: 104, name: '레드타이거', name_ko: '레드타이거', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s11.png', status: 'visible' },
  { id: 105, name: '플레이앤고', name_ko: '플레이앤고', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s12.png', status: 'visible' },
  { id: 106, name: '퀵스핀', name_ko: '퀵스핀', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s13.png', status: 'visible' },
  { id: 107, name: '이그드라실', name_ko: '이그드라실', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s14.png', status: 'visible' },
  { id: 108, name: '하바네로', name_ko: '하바네로', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s15.png', status: 'visible' },
  { id: 109, name: '블루프린트', name_ko: '블루프린트', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s16.png', status: 'visible' },
  { id: 110, name: '빅타임게이밍', name_ko: '빅타임게이밍', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s17.png', status: 'visible' },
  { id: 111, name: '릴렉스 게이밍', name_ko: '릴렉스 게이밍', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s18.png', status: 'visible' },
  { id: 112, name: '노리밋 시티', name_ko: '노리밋 시티', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s19.png', status: 'visible' },
];

// 랜덤 이미지 선택 함수
const getRandomSlotImage = () => {
  const randomIndex = Math.floor(Math.random() * FALLBACK_PROVIDERS.length);
  return FALLBACK_PROVIDERS[randomIndex].logo_url;
};

export function BenzSlot({ user, onRouteChange }: BenzSlotProps) {
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<GameProvider | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // 🆕 백그라운드 프로세스 상태
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
      
      const providersData = await gameApi.getUserVisibleProviders({ 
        type: 'slot', 
        userId: user?.id 
      });
      
      setProviders(providersData);
    } catch (error) {
      console.error('❌ 제공사 로드 오류:', error);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderClick = async (provider: GameProvider) => {
    // 🆕 백그라운드 프로세스 중 클릭 방지
    if (isProcessing) {
      toast.error('잠시 후 다시 시도해주세요.');
      return;
    }

    try {
      setGamesLoading(true);
      setSelectedProvider(provider);

      const gamesData = await gameApi.getUserVisibleGames({
        type: 'slot',
        provider_id: provider.id,
        userId: user.id
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
    // 🆕 백그라운드 프로세스 중 클릭 방지
    if (isProcessing) {
      toast.error('잠시 후 다시 시도해주세요.');
      return;
    }

    setSelectedProvider(null);
    setGames([]);
  };

  const handleGameClick = async (game: Game) => {
    // 🆕 백그라운드 프로세스 중 클릭 방지
    if (isProcessing) {
      toast.error('잠시 후 다시 시도해주세요.');
      return;
    }

    if (launchingGameId === game.id) return;

    setLaunchingGameId(game.id);
    setIsProcessing(true); // 🆕 프로세스 시작
    
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
        
        console.log('🔄 [슬롯 입장] active 세션 재사용 - 기존 URL 사용:', activeSession.session_id);
        
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
          toast.success(`${game.name} 슬롯에 입장했습니다.`);
          
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
          toast.success(`${game.name} 슬롯에 입장했습니다.`);
          
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
        toast.error(result.error || '게임 실행에 실패했습니다.');
      }
    } catch (error) {
      console.error('게임 실행 오류:', error);
      toast.error('게임 실행에 실패했습니다.');
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
              className="text-pink-400 hover:text-pink-300 hover:bg-pink-900/20"
            >
              <ChevronLeft className="w-5 h-5 mr-2" />
              제공사 목록
            </Button>
          )}
          <div className="flex items-center gap-4">
            <div className="w-1 h-8 bg-gradient-to-b from-pink-500 to-purple-500"></div>
            <h1 className="text-3xl font-black">
              <span className="bg-gradient-to-r from-pink-500 to-purple-400 bg-clip-text text-transparent">
                {selectedProvider ? selectedProvider.name_ko || selectedProvider.name : '슬롯 게임'}
              </span>
            </h1>
          </div>
        </div>
      </div>

      {/* 제공사 목록 */}
      {!selectedProvider && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {loading ? (
            Array(12).fill(0).map((_, i) => (
              <div key={i} className="aspect-[4/3] bg-gray-800 animate-pulse rounded-2xl"></div>
            ))
          ) : (
            providers.map((provider) => (
              <motion.div
                key={provider.id}
                whileHover={{ 
                  scale: 1.08,
                  rotateY: 5,
                  z: 50
                }}
                whileTap={{ scale: 0.95 }}
                transition={{ 
                  type: "spring", 
                  stiffness: 300, 
                  damping: 20 
                }}
                className="cursor-pointer"
                onClick={() => handleProviderClick(provider)}
                style={{
                  transformStyle: 'preserve-3d',
                  perspective: '1000px'
                }}
              >
                <div className="relative aspect-[4/3] overflow-hidden group">
                  {/* 제공사 이미지 - 카드 전체를 꽉 채움 */}
                  <ImageWithFallback
                    src={provider.logo_url || provider.thumbnail_url || getRandomSlotImage()}
                    alt={provider.name}
                    className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
                  />
                  
                  {/* 제공사명 오버레이 - 하단 그라디언트 배경 */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent py-6 px-4">
                    <p className="text-xl font-black text-center text-white tracking-wide" style={{
                      textShadow: '0 0 12px rgba(0, 0, 0, 1), 0 2px 8px rgba(0, 0, 0, 0.9), 0 4px 16px rgba(236, 72, 153, 0.6)'
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
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden group shadow-lg hover:shadow-pink-500/30 transition-all duration-300">
                  {/* 게임 이미지 */}
                  {game.image_url ? (
                    <ImageWithFallback
                      src={game.image_url}
                      alt={game.name}
                      className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-pink-900/30 to-purple-900/30 flex items-center justify-center">
                      <Play className="w-12 h-12 text-pink-500/50" />
                    </div>
                  )}
                  
                  {/* 하단 그라디언트 오버레이 (항상 표시) */}
                  <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black via-black/70 to-transparent"></div>
                  
                  {/* 게임명 (항상 표시) */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="text-white text-center line-clamp-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                      {game.name}
                    </p>
                  </div>
                  
                  {/* 호버 효과 - 플레이 버튼 & 밝기 조절 */}
                  <div className="absolute inset-0 bg-gradient-to-t from-pink-600/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
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
            ))
          )}
        </div>
      )}
    </div>
  );
}