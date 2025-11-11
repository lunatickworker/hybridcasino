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

// 카지노 로비 데이터 (이미지 기반)
const CASINO_PROVIDERS = [
  { id: 410000, name: '에볼루션 라이브카지노', provider_id: 410, label: 'EVOLUTION', color: 'from-red-600 to-red-800' },
  { id: 77060, name: '마이크로게이밍 라이브카지노', provider_id: 77, label: 'MICROGAMING', color: 'from-blue-600 to-blue-800' },
  { id: 86001, name: '섹시게이밍', provider_id: 86, label: 'SEXY GAMING', color: 'from-pink-600 to-pink-800' },
  { id: 78001, name: '프라그마틱 라이브카지노', provider_id: 78, label: 'PRAGMATIC PLAY', color: 'from-purple-600 to-purple-800' },
  { id: 30000, name: '아시아게이밍', provider_id: 30, label: 'ASIA GAMING', color: 'from-yellow-600 to-yellow-800' },
  { id: 2029, name: 'Vivo 라이브카지노', provider_id: 2, label: 'VIVO GAMING', color: 'from-green-600 to-green-800' },
  { id: 11000, name: '비비아이엔', provider_id: 11, label: 'BBIEN', color: 'from-indigo-600 to-indigo-800' },
  { id: 28000, name: '드림게임', provider_id: 28, label: 'DREAM GAMING', color: 'from-orange-600 to-orange-800' },
];

export function Sample1Casino({ user }: Sample1CasinoProps) {
  const [loading, setLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<number | null>(null);
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

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

          // 게임 팝업 참조 저장
          if (result.sessionId) {
            if (!(window as any).gameWindows) {
              (window as any).gameWindows = new Map();
            }
            (window as any).gameWindows.set(result.sessionId, popup);
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
        {CASINO_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            onClick={() => handleLaunchCasino(provider.id, provider.name)}
            disabled={loading}
            className="group relative overflow-hidden rounded-lg border-2 border-yellow-600/30 hover:border-yellow-500 transition-all duration-300"
            style={{
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {/* 배경 그라데이션 */}
            <div className={`absolute inset-0 bg-gradient-to-br ${provider.color} opacity-80 group-hover:opacity-100 transition-opacity`} />
            
            {/* 빛나는 효과 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            
            {/* 컨텐츠 */}
            <div className="relative p-6 flex flex-col items-center justify-center gap-3 min-h-[160px]">
              {/* 아이콘 영역 */}
              <div className="w-16 h-16 rounded-full bg-black/30 flex items-center justify-center border-2 border-yellow-400/50 group-hover:border-yellow-400 transition-colors">
                {launchingGameId === provider.id ? (
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
                  {provider.label}
                </div>
                <div className="text-yellow-400 text-xs">
                  {provider.name}
                </div>
              </div>

              {/* 호버 효과 */}
              <div className="absolute inset-0 border-2 border-yellow-400/0 group-hover:border-yellow-400/50 rounded-lg transition-all duration-300" />
            </div>
          </button>
        ))}
      </div>

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
          message={loadingMessage}
        />
      )}
    </div>
  );
}