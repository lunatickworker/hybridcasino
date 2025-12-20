import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { toast } from "sonner@2.0.3";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { Sample1GameLoadingPopup } from "./Sample1GameLoadingPopup";

interface Sample1MiniGameProps {
  user: any;
}

interface Provider {
  id: number;
  name: string;
  logo_url?: string;
  status: string;
  type: string;
}

interface Game {
  game_id: number;
  provider_id: number;
  provider_name: string;
  game_name: string;
  game_type: string;
  image_url?: string;
  is_featured: boolean;
  status: string;
  priority: number;
  api_type?: string;
}

export function Sample1MiniGame({ user }: Sample1MiniGameProps) {
  const [loading, setLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<number | null>(null);
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingStage, setLoadingStage] = useState<'preparing' | 'launch' | 'withdraw'>('preparing');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      setLoading(true);
      
      // ✅ 노출된 제공사만 가져오기
      const providersData = await gameApi.getUserVisibleProviders({ type: 'minigame' });
      setProviders(providersData);
      
    } catch (error) {
      console.error('제공사 로드 오류:', error);
      toast.error('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadGames = async (providerId: number) => {
    try {
      setLoading(true);
      
      // ✅ gameApi.getUserVisibleGames 사용 (HonorAPI 지원)
      const gamesData = await gameApi.getUserVisibleGames({
        type: 'minigame',
        provider_id: providerId
      });

      const formattedGames = gamesData?.map(game => ({
        game_id: game.id,
        provider_id: game.provider_id,
        provider_name: game.provider_name || 'Unknown',
        game_name: game.name,
        game_type: game.type,
        image_url: game.image_url,
        is_featured: game.is_featured,
        status: game.status,
        priority: game.priority || 0,
        api_type: game.api_type
      })) || [];

      setGames(formattedGames);
      
    } catch (error) {
      console.error('게임 로드 오류:', error);
      toast.error('게임을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderClick = async (provider: Provider) => {
    setSelectedProvider(provider);
    await loadGames(provider.id);
  };

  const handleGameClick = async (game: Game) => {
    if (!user) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    if (launchingGameId) return;

    try {
      setLaunchingGameId(game.game_id);

      // 활성 세션 체크
      const activeSession = await gameApi.checkActiveSession(user.id);
      
      if (activeSession?.isActive && activeSession.api_type !== game.api_type) {
        const apiNames = {
          invest: 'Invest API',
          oroplay: 'OroPlay API',
          familyapi: 'Family API'
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

      setLoadingStage('preparing');
      setLoadingMessage("게임을 준비중입니다");
      setShowLoadingPopup(true);
      
      const result = await gameApi.generateGameLaunchUrl(user.id, game.game_id);
      
      setShowLoadingPopup(false);
      
      if (result.success && result.launchUrl) {
        const gameWindow = window.open(
          result.launchUrl,
          '_blank',
          'width=1280,height=720,scrollbars=yes,resizable=yes'
        );

        if (!gameWindow) {
          toast.error('팝업이 차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
        } else {
          toast.success(`${game.game_name} 게임을 실행합니다.`);
          
          // 게임 팝업 참조 저장 및 종료 감지 설정
          if (result.sessionId && typeof result.sessionId === 'number') {
            const sessionId = result.sessionId;
            
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

  const handleBack = () => {
    setSelectedProvider(null);
    setGames([]);
  };

  const getProviderColor = (index: number) => {
    const colors = [
      'from-purple-600 to-purple-800',
      'from-blue-600 to-blue-800',
      'from-red-600 to-red-800',
      'from-orange-600 to-orange-800',
      'from-green-600 to-green-800',
      'from-amber-600 to-amber-800',
      'from-pink-600 to-pink-800',
      'from-indigo-600 to-indigo-800',
      'from-teal-600 to-teal-800',
      'from-rose-600 to-rose-800',
      'from-cyan-600 to-cyan-800',
      'from-violet-600 to-violet-800',
      'from-lime-600 to-lime-800',
      'from-emerald-600 to-emerald-800',
      'from-fuchsia-600 to-fuchsia-800',
      'from-sky-600 to-sky-800',
    ];
    return colors[index % colors.length];
  };

  // 게임 리스트 뷰
  if (selectedProvider) {
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
              <span className="text-yellow-400">{selectedProvider.name}</span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-yellow-600 via-yellow-600 to-transparent" />
          </div>
        </div>

        {/* 뒤로가기 버튼 */}
        <div>
          <Button
            onClick={handleBack}
            className="bg-yellow-600 hover:bg-yellow-700 text-black border-2 border-yellow-400"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            제공사 목록으로
          </Button>
        </div>

        {/* 게임 그리드 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-yellow-400 animate-spin" />
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>현재 이용 가능한 게임이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {games.map((game) => (
              <button
                key={game.game_id}
                onClick={() => handleGameClick(game)}
                disabled={launchingGameId === game.game_id}
                className="group relative overflow-hidden rounded-lg border-2 border-yellow-600/30 hover:border-yellow-500 transition-all duration-300 bg-black/50"
                style={{
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}
              >
                <div className="aspect-[4/3] relative overflow-hidden">
                  <ImageWithFallback
                    src={game.image_url}
                    alt={game.game_name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                  
                  {/* 오버레이 */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                  
                  {/* 로딩 표시 */}
                  {launchingGameId === game.game_id && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
                    </div>
                  )}
                </div>
                
                {/* 게임 정보 */}
                <div className="p-3 bg-gradient-to-b from-black/80 to-black/90">
                  <h3 className="text-white text-sm truncate">{game.game_name}</h3>
                </div>

                {/* 호버 효과 */}
                <div className="absolute inset-0 border-2 border-yellow-400/0 group-hover:border-yellow-400/50 rounded-lg transition-all duration-300" />
              </button>
            ))}
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

  // 제공사 리스트 뷰
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
            <span className="text-yellow-400">미니게임</span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-yellow-600 via-yellow-600 to-transparent" />
        </div>
      </div>

      {/* 제공사 그리드 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-12 h-12 text-yellow-400 animate-spin" />
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>현재 이용 가능한 미니게임 제공사가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {providers.map((provider, index) => (
            <button
              key={provider.id}
              onClick={() => handleProviderClick(provider)}
              className="group relative overflow-hidden rounded-lg border-2 border-yellow-600/30 hover:border-yellow-500 transition-all duration-300"
              style={{
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              {/* 배경 그라데이션 */}
              <div className={`absolute inset-0 bg-gradient-to-br ${getProviderColor(index)} opacity-80 group-hover:opacity-100 transition-opacity`} />
              
              {/* 빛나는 효과 */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              
              {/* 컨텐츠 */}
              <div className="relative p-6 flex flex-col items-center justify-center gap-3 min-h-[140px]">
                {/* 제공사 이름 */}
                <div className="text-center">
                  <div className="text-white mb-1" style={{
                    fontFamily: 'Impact, sans-serif',
                    letterSpacing: '0.05em',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                  }}>
                    {provider.name.toUpperCase()}
                  </div>
                  <div className="text-yellow-400 text-sm">
                    {provider.name}
                  </div>
                </div>

                {/* 호버 효과 */}
                <div className="absolute inset-0 border-2 border-yellow-400/0 group-hover:border-yellow-400/50 rounded-lg transition-all duration-300" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}