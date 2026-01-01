import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { toast } from "sonner@2.0.3";
import { Loader2, Play } from "lucide-react";
import { Button } from "../ui/button";
import { Sample1GameLoadingPopup } from "./Sample1GameLoadingPopup";

interface Sample1CasinoProps {
  user: any;
}

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

export function Sample1Casino({ user }: Sample1CasinoProps) {
  const [loading, setLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<number | null>(null);
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingStage, setLoadingStage] = useState<'preparing' | 'launch' | 'withdraw'>('preparing');
  const [casinoGames, setCasinoGames] = useState<CasinoGame[]>([]);
  const [providers, setProviders] = useState<any[]>([]);

  useEffect(() => {
    loadCasinoData();
  }, []);

  const loadCasinoData = async () => {
    try {
      setLoading(true);
      
      // 노출된 제공사 가져오기
      const providersData = await gameApi.getUserVisibleProviders({ type: 'casino' });
      setProviders(providersData);
      
      // ✅ gameApi.getUserVisibleGames 사용 (HonorAPI 지원)
      const gamesData = await gameApi.getUserVisibleGames({
        type: 'casino'
      });

      // 게임 데이터 포맷팅
      const formattedGames = gamesData?.map(game => ({
        game_id: game.id,
        provider_id: game.provider_id,
        provider_name: game.provider_name || 'Unknown',
        provider_logo: (game as any).game_providers?.logo_url,
        game_name: game.name,
        game_type: game.type,
        image_url: game.image_url,
        is_featured: game.is_featured,
        status: game.status,
        priority: game.priority || 0,
        api_type: game.api_type
      })) || [];

      // ✅ 노출된 제공사의 게임만 필터링
      const visibleGames = formattedGames.filter(game => 
        providersData.some((p: any) => p.id === game.provider_id)
      );

      setCasinoGames(visibleGames);
      
    } catch (error) {
      console.error('카지노 데이터 로드 오류:', error);
      toast.error('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchCasino = async (gameId: number, gameName: string) => {
    if (!user) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    if (loading) return;

    try {
      setLoading(true);
      setLaunchingGameId(gameId);

      // 활성 세션 체크
      const { data: activeSession } = await supabase
        .from('game_launch_sessions')
        .select('id, game_id, api_type')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (activeSession) {
        toast.error('이미 진행 중인 게임이 있습니다. 게임을 종료한 후 다시 시도해주세요.');
        setLoading(false);
        setLaunchingGameId(null);
        return;
      }

      // ⭐ 게임 준비 팝업 표시
      setLoadingStage('preparing');
      setLoadingMessage("게임을 준비중입니다");
      setShowLoadingPopup(true);

      // 게임 실행
      const result = await gameApi.launchGame(user.id, gameId, user.username);

      // ⭐ 팝업 자동 닫힘
      setShowLoadingPopup(false);

      if (result.success && result.launch_url) {
        const popup = window.open(
          result.launch_url,
          `game_${gameId}`,
          'width=1280,height=720,scrollbars=yes,resizable=yes'
        );

        if (!popup) {
          toast.error('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
        } else {
          toast.success(`${gameName} 실행 중...`);

          // 게임 팝업 참조 저장 및 종료 감지 설정
          if (result.sessionId) {
            const sessionId = result.sessionId;
            
            if (!(window as any).gameWindows) {
              (window as any).gameWindows = new Map();
            }
            (window as any).gameWindows.set(sessionId, popup);
            
            if (!(window as any).gameWindowCheckers) {
              (window as any).gameWindowCheckers = new Map();
            }
            
            let isProcessing = false;
            const handleGameWindowClose = async () => {
              if (isProcessing) return;
              isProcessing = true;
              
              console.log('🎮 [게임창 닫힘 감지] 세션:', sessionId);
              
              setLoadingStage('withdraw');
              setShowLoadingPopup(true);
              
              const checker = (window as any).gameWindowCheckers?.get(sessionId);
              if (checker) {
                clearInterval(checker);
                (window as any).gameWindowCheckers?.delete(sessionId);
              }
              
              (window as any).gameWindows?.delete(sessionId);
              
              console.log('🔄 [게임창 닫힘] syncBalanceAfterGame 호출 시작');
              if ((window as any).syncBalanceAfterGame) {
                await (window as any).syncBalanceAfterGame(sessionId);
              } else {
                console.error('❌ syncBalanceAfterGame 함수가 등록되지 않음!');
              }
              
              setTimeout(() => {
                setShowLoadingPopup(false);
              }, 500);
            };
            
            const checkGameWindow = setInterval(() => {
              try {
                // ⭐ gameWindows에서 참조 가져오기 (클로저 문제 해결)
                const gameWindow = (window as any).gameWindows?.get(sessionId);
                if (gameWindow && gameWindow.closed) {
                  console.log('🚪 [게임창 닫힘] 팝업창 closed 감지, sessionId:', sessionId);
                  handleGameWindowClose();
                  clearInterval(checkGameWindow);
                }
              } catch (error) {
                console.error('❌ [게임창 체크 에러]:', error);
              }
            }, 1000);
            
            (window as any).gameWindowCheckers.set(sessionId, checkGameWindow);
            console.log('✅ [게임창 모니터링 시작] sessionId:', sessionId);
          }
        }
      } else {
        toast.error(result.error || '게임 실행 실패');
      }
    } catch (error: any) {
      console.error('게임 실행 오류:', error);
      toast.error(error.message || '게임 실행 중 오류가 발생했습니다.');
      setShowLoadingPopup(false);
    } finally {
      setLoading(false);
      setLaunchingGameId(null);
    }
  };

  // ✅ 카지노 로비 게임 추출 (중복 제거)
  const uniqueProviderGames = casinoGames.reduce((acc: CasinoGame[], game) => {
    const exists = acc.find(g => g.provider_id === game.provider_id);
    if (!exists) {
      acc.push(game);
    }
    return acc;
  }, []);

  // 제공사별 색상 매핑
  const getProviderColor = (providerId: number) => {
    const colors: { [key: number]: string } = {
      410: 'from-red-600 to-red-800',
      77: 'from-blue-600 to-blue-800',
      86: 'from-pink-600 to-pink-800',
      78: 'from-purple-600 to-purple-800',
      30: 'from-yellow-600 to-yellow-800',
      2: 'from-green-600 to-green-800',
      11: 'from-indigo-600 to-indigo-800',
      28: 'from-orange-600 to-orange-800',
    };
    return colors[providerId] || 'from-gray-600 to-gray-800';
  };

  return (
    <div className="space-y-8">
      {/* 섹션 헤더 */}
      <div className="relative">
        <div className="flex items-center justify-center gap-4">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-yellow-600 to-transparent" />
          <div className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-red-700 to-red-900 rounded-md border-2 border-yellow-600">
            <span className="text-xl tracking-wider" style={{ 
              fontFamily: 'Impact, sans-serif',
              color: '#fff',
              textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
            }}>
              MARVEL
            </span>
            <span className="text-white mx-2">•</span>
            <span className="text-yellow-400">라이브카지노</span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-yellow-600 via-yellow-600 to-transparent" />
        </div>
      </div>

      {/* 카지노 제공사 그리드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {uniqueProviderGames.map((game) => (
          <button
            key={game.game_id}
            onClick={() => handleLaunchCasino(game.game_id, game.game_name)}
            disabled={loading}
            className="group relative overflow-hidden rounded-lg border-2 border-yellow-600/30 hover:border-yellow-500 transition-all duration-300"
            style={{
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {/* 배경 그라데이션 */}
            <div className={`absolute inset-0 bg-gradient-to-br ${getProviderColor(game.provider_id)} opacity-80 group-hover:opacity-100 transition-opacity`} />
            
            {/* 빛나는 효과 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            
            {/* 컨텐츠 */}
            <div className="relative p-6 flex flex-col items-center justify-center gap-3 min-h-[160px]">
              {/* 아이콘 영역 */}
              <div className="w-16 h-16 rounded-full bg-black/30 flex items-center justify-center border-2 border-yellow-400/50 group-hover:border-yellow-400 transition-colors">
                {launchingGameId === game.game_id ? (
                  <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
                ) : (
                  <Play className="w-8 h-8 text-yellow-400 group-hover:scale-110 transition-transform" />
                )}
              </div>

              {/* 제공사 이름 */}
              <div className="text-center">
                <div className="text-white text-sm mb-1" style={{
                  fontFamily: 'Impact, sans-serif',
                  letterSpacing: '0.05em',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                }}>
                  {game.provider_name.toUpperCase()}
                </div>
                <div className="text-yellow-400 text-xs">
                  {game.game_name}
                </div>
              </div>

              {/* 호버 효과 */}
              <div className="absolute inset-0 border-2 border-yellow-400/0 group-hover:border-yellow-400/50 rounded-lg transition-all duration-300" />
            </div>
          </button>
        ))}
      </div>

      {/* 게임이 없을 때 */}
      {uniqueProviderGames.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400">
          <p>현재 이용 가능한 카지노가 없습니다.</p>
        </div>
      )}

      {/* 로딩 상태 */}
      {loading && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-yellow-600 to-yellow-800 p-8 rounded-lg border-2 border-yellow-400 shadow-2xl">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-white animate-spin" />
              <p className="text-white text-lg">게임을 실행하는 중입니다...</p>
            </div>
          </div>
        </div>
      )}

      {/* 게임 준비 팝업 */}
      {showLoadingPopup && (
        <Sample1GameLoadingPopup
          show={showLoadingPopup}
          message={loadingStage === 'withdraw' ? '게임 종료 후 정산중입니다' : loadingMessage}
        />
      )}
    </div>
  );
}