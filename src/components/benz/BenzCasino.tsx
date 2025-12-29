import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { ChevronLeft, Sparkles, Play } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { motion } from "motion/react";
import { toast } from "sonner@2.0.3";

interface BenzCasinoProps {
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
  provider_ids?: number[]; // 🆕 통합된 게임사의 모든 provider_id
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

const FALLBACK_PROVIDERS = [
  { id: 1, name: 'Evolution', name_ko: '에볼루션', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/evolution.jpg', status: 'visible' },
  { id: 2, name: 'Pragmatic Play Live', name_ko: '프라그마틱 라이브', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pragmaticlive.jpg', status: 'visible' },
  { id: 3, name: 'Microgaming', name_ko: '마이크로 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/microgaming.jpg', status: 'visible' },
  { id: 4, name: 'Asia Gaming', name_ko: '아시아 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/asiagaming.jpg', status: 'visible' },
  { id: 5, name: 'SA Gaming', name_ko: 'SA 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/sagaming.jpg', status: 'visible' },
  { id: 6, name: 'Ezugi', name_ko: '이주기', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/ezugi.jpg', status: 'visible' },
  { id: 7, name: 'Dream Gaming', name_ko: '드림 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/dreamgaming.jpg', status: 'visible' },
  { id: 8, name: 'Play Ace', name_ko: '플레이 에이스', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/playace.jpg', status: 'visible' },
];

// 랜덤 이미지 선택 함수
const getRandomCasinoImage = () => {
  const randomIndex = Math.floor(Math.random() * FALLBACK_PROVIDERS.length);
  return FALLBACK_PROVIDERS[randomIndex].logo_url;
};

export function BenzCasino({ user, onRouteChange }: BenzCasinoProps) {
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
        type: 'casino', 
        userId: user?.id 
      });
      
      // 🆕 같은 이름의 게임사를 하나로 통합 (유연한 매핑)
      const providerMap = new Map<string, GameProvider>();
      
      // 프라그마틱 통합을 위한 정규화 함수
      const normalizeProviderName = (provider: GameProvider): string => {
        const name = (provider.name_ko || provider.name || '').toLowerCase();
        
        // 프라그마틱 관련 통합
        if (name.includes('pragmatic') || name.includes('프라그마틱')) {
          if (name.includes('slot') || name.includes('슬롯')) {
            return 'pragmatic_slot';
          }
          if (name.includes('live') || name.includes('라이브')) {
            return 'pragmatic_live';
          }
          // 기본 프라그마틱 (라이브로 간주)
          return 'pragmatic_live';
        }
        
        // 다른 게임사들은 name_ko 또는 name 사용
        return provider.name_ko || provider.name;
      };
      
      for (const provider of providersData) {
        const key = normalizeProviderName(provider);
        
        if (providerMap.has(key)) {
          // 이미 존재하는 게임사 - provider_ids 배열에 추가
          const existing = providerMap.get(key)!;
          if (!existing.provider_ids) {
            existing.provider_ids = [existing.id];
          }
          existing.provider_ids.push(provider.id);
        } else {
          // 새로운 게임사
          providerMap.set(key, {
            ...provider,
            provider_ids: [provider.id]
          });
        }
      }
      
      setProviders(Array.from(providerMap.values()));
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

      // 🆕 통합된 게임사의 모든 provider_id로 게임 로드
      const providerIds = provider.provider_ids || [provider.id];
      let allGames: Game[] = [];

      for (const providerId of providerIds) {
        const gamesData = await gameApi.getUserVisibleGames({
          type: 'casino',
          provider_id: providerId,
          userId: user.id
        });

        if (gamesData && gamesData.length > 0) {
          allGames = [...allGames, ...gamesData];
        }
      }

      setGames(allGames);
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
          toast.success(`${game.name} 카지노에 입장했습니다.`);
          
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
          toast.success(`${game.name} 카지노에 입장했습니다.`);
          
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
    <div className="relative min-h-screen" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
      {/* 깔끔한 다크 배경 */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          background: '#0a0a0f',
        }}
      />

      <div className="relative z-10 p-8 lg:p-12 space-y-10 max-w-[1400px] mx-auto">
        {/* 미니멀 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {selectedProvider && (
              <Button
                onClick={handleBackToProviders}
                variant="ghost"
                className="text-white/60 hover:text-white hover:bg-white/5 transition-all"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                뒤로가기
              </Button>
            )}
            <h1 className="text-4xl font-bold tracking-tight">
              <span style={{
                background: 'linear-gradient(90deg, #ffffff 0%, #E6C9A8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                {selectedProvider ? selectedProvider.name_ko || selectedProvider.name : '라이브 카지노'}
              </span>
            </h1>
          </div>
        </div>

        {/* 제공사 목록 - 4칸 정렬 */}
        {!selectedProvider && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl animate-pulse" style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
                }}></div>
              ))
            ) : (
              providers.map((provider, index) => (
                <motion.div
                  key={provider.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ 
                    y: -12,
                    scale: 1.05,
                    transition: { duration: 0.3 }
                  }}
                  className="cursor-pointer group"
                  onClick={() => handleProviderClick(provider)}
                >
                  <div 
                    className="relative aspect-square rounded-2xl overflow-hidden"
                    style={{
                      border: '2px solid rgba(193, 154, 107, 0.5)',
                    }}
                  >
                    <img
                      src={FALLBACK_PROVIDERS[index % FALLBACK_PROVIDERS.length]?.logo_url || provider.logo_url}
                      alt={provider.name}
                      className="w-full object-cover"
                      style={{
                        height: '105%',
                        marginTop: '-2.5%'
                      }}
                    />
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* 게임 목록 - 4칸 정렬 */}
        {selectedProvider && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {gamesLoading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl animate-pulse" style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
                }}></div>
              ))
            ) : games.length === 0 ? (
              <div className="col-span-full text-center py-20">
                <p className="text-white/40 text-lg">게임이 없습니다.</p>
              </div>
            ) : (
              games.map((game) => (
                <motion.div
                  key={game.id}
                  whileHover={{ scale: 1.05, y: -8 }}
                  whileTap={{ scale: 0.98 }}
                  className="cursor-pointer group"
                  onClick={() => handleGameClick(game)}
                >
                  <div className="relative aspect-square overflow-hidden rounded-2xl transition-all duration-500" style={{
                    background: '#16161f',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                  }}>
                    {/* 게임 이미지 */}
                    {game.image_url ? (
                      <ImageWithFallback
                        src={game.image_url}
                        alt={game.name_ko || game.name}
                        className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{
                        background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)'
                      }}>
                        <Play className="w-16 h-16 text-white/20" />
                      </div>
                    )}
                    
                    {/* 그라디언트 오버레이 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent opacity-70 group-hover:opacity-80 transition-opacity duration-500"></div>
                    
                    {/* 호버 시 로즈 골드 테두리 */}
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
                      boxShadow: 'inset 0 0 0 2px rgba(193, 154, 107, 0.5)'
                    }}></div>
                    
                    {/* 호버 시 플레이 버튼 */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-24 h-24 rounded-full backdrop-blur-xl flex items-center justify-center transition-all duration-500" style={{
                          background: 'rgba(193, 154, 107, 0.15)',
                          boxShadow: '0 0 40px rgba(193, 154, 107, 0.3), inset 0 0 20px rgba(255,255,255,0.1)',
                          border: '2px solid rgba(193, 154, 107, 0.4)'
                        }}>
                          <Play className="w-12 h-12" style={{ color: '#E6C9A8', fill: '#E6C9A8' }} />
                        </div>
                        <span className="text-white font-black text-xl tracking-wide" style={{
                          textShadow: '0 2px 20px rgba(0,0,0,0.8)',
                          color: '#E6C9A8',
                          letterSpacing: '0.05em'
                        }}>
                          PLAY
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
    </div>
  );
}