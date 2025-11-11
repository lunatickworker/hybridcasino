import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { toast } from "sonner@2.0.3";
import { Loader2, Play, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Sample1GameLoadingPopup } from "./Sample1GameLoadingPopup";

interface Sample1SlotProps {
  user: any;
}

// 슬롯 제공사 데이터
const SLOT_PROVIDERS = [
  { id: 300, name: '프라그마틱 플레이', label: 'PRAGMATIC PLAY', color: 'from-purple-600 to-purple-800' },
  { id: 87, name: 'PG소프트', label: 'PG SOFT', color: 'from-blue-600 to-blue-800' },
  { id: 75, name: '넷엔트', label: 'NETENT', color: 'from-red-600 to-red-800' },
  { id: 76, name: '레드타이거', label: 'RED TIGER', color: 'from-orange-600 to-orange-800' },
  { id: 17, name: '플레이앤고', label: "PLAY'N GO", color: 'from-green-600 to-green-800' },
  { id: 59, name: '플레이슨', label: 'PLAYSON', color: 'from-yellow-600 to-yellow-800' },
  { id: 39, name: '부운고', label: 'BOOONGO', color: 'from-pink-600 to-pink-800' },
  { id: 20, name: 'CQ9 게이밍', label: 'CQ9', color: 'from-indigo-600 to-indigo-800' },
  { id: 1, name: '마이크로게이밍', label: 'MICROGAMING', color: 'from-teal-600 to-teal-800' },
  { id: 22, name: '하바네로', label: 'HABANERO', color: 'from-rose-600 to-rose-800' },
  { id: 61, name: '퀵스핀', label: 'QUICKSPIN', color: 'from-cyan-600 to-cyan-800' },
  { id: 74, name: '릴렉스 게이밍', label: 'RELAX GAMING', color: 'from-amber-600 to-amber-800' },
  { id: 53, name: '노리밋 시티', label: 'NOLIMIT CITY', color: 'from-lime-600 to-lime-800' },
  { id: 60, name: '푸쉬 게이밍', label: 'PUSH GAMING', color: 'from-emerald-600 to-emerald-800' },
  { id: 41, name: '엘크 스튜디오', label: 'ELK STUDIOS', color: 'from-fuchsia-600 to-fuchsia-800' },
  { id: 56, name: '원터치', label: 'ONETOUCH', color: 'from-violet-600 to-violet-800' },
];

interface Game {
  id: number;
  name: string;
  provider_id: number;
}

export function Sample1Slot({ user }: Sample1SlotProps) {
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [filteredGames, setFilteredGames] = useState<Game[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<number | null>(null);
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  // 제공사 선택 시 게임 목록 로드
  useEffect(() => {
    if (selectedProvider) {
      loadGames(selectedProvider);
    } else {
      setGames([]);
      setFilteredGames([]);
    }
  }, [selectedProvider]);

  // 검색어 변경 시 필터링
  useEffect(() => {
    if (searchTerm) {
      const filtered = games.filter(game =>
        game.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredGames(filtered);
    } else {
      setFilteredGames(games);
    }
  }, [searchTerm, games]);

  const loadGames = async (providerId: number) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('games')
        .select('id, name, provider_id')
        .eq('provider_id', providerId)
        .eq('api_type', 'invest')
        .order('name');

      if (error) throw error;
      setGames(data || []);
      setFilteredGames(data || []);
    } catch (error) {
      console.error('게임 목록 로드 오류:', error);
      toast.error('게임 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchGame = async (gameId: number, gameName: string) => {
    if (!user) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    if (launchingGameId) return;

    try {
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
            <span className="text-yellow-400">슬롯게임</span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-yellow-600 via-yellow-600 to-transparent" />
        </div>
      </div>

      {/* 제공사 선택 그리드 */}
      {!selectedProvider && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {SLOT_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              onClick={() => setSelectedProvider(provider.id)}
              className="group relative overflow-hidden rounded-lg border-2 border-yellow-600/30 hover:border-yellow-500 transition-all duration-300"
              style={{
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${provider.color} opacity-80 group-hover:opacity-100 transition-opacity`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              
              <div className="relative p-4 flex flex-col items-center justify-center gap-2 min-h-[120px]">
                <div className="text-white text-sm text-center" style={{
                  fontFamily: 'Impact, sans-serif',
                  letterSpacing: '0.05em',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                }}>
                  {provider.label}
                </div>
                <div className="text-yellow-400 text-xs text-center">
                  {provider.name}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 게임 목록 */}
      {selectedProvider && (
        <div className="space-y-4">
          {/* 상단 컨트롤 */}
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setSelectedProvider(null)}
              className="px-4 py-2 bg-black/50 text-yellow-500 border border-yellow-600/30 hover:bg-yellow-600/20"
            >
              ← 제공사 목록으로
            </Button>
            
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-500" />
              <Input
                placeholder="게임 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-black/50 border-yellow-600/30 text-yellow-100 placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* 게임 그리드 */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredGames.map((game) => (
                <button
                  key={game.id}
                  onClick={() => handleLaunchGame(game.id, game.name)}
                  disabled={!!launchingGameId}
                  className="group relative overflow-hidden rounded-lg border border-yellow-600/30 hover:border-yellow-500 transition-all duration-300 bg-black/50"
                >
                  <div className="p-3 flex flex-col items-center gap-2 min-h-[100px]">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-600 to-yellow-800 flex items-center justify-center">
                      {launchingGameId === game.id ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Play className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="text-yellow-100 text-xs text-center line-clamp-2">
                      {game.name}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && filteredGames.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      )}

      {/* 게임 로딩 팝업 */}
      {showLoadingPopup && (
        <Sample1GameLoadingPopup
          show={showLoadingPopup}
          message={loadingMessage}
        />
      )}
    </div>
  );
}