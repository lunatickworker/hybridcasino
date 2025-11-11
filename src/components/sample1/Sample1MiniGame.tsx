import { useState, useEffect } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { Sample1GameLoadingPopup } from "./Sample1GameLoadingPopup";
import { 
  Search, 
  Play, 
  Star, 
  Grid, 
  List, 
  Loader, 
  Sparkles,
  Gamepad2
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { gameApi } from "../../lib/gameApi";
import { supabase } from "../../lib/supabase";
import { useApiSettings } from "../../hooks/useApiSettings";

interface Sample1MiniGameProps {
  user: any;
}

interface Game {
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
}

const miniGameCategories = [
  { id: 'all', name: '전체', icon: Gamepad2 },
  { id: 'featured', name: '인기', icon: Star },
  { id: 'new', name: '신규', icon: Sparkles }
];

export function Sample1MiniGame({ user }: Sample1MiniGameProps) {
  const { useOroplayApi } = useApiSettings();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [launchingGameId, setLaunchingGameId] = useState<number | null>(null);
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  useEffect(() => {
    loadMiniGames();
  }, [selectedCategory]);

  const loadMiniGames = async () => {
    if (!user) {
      setGames([]);
      return;
    }

    try {
      setLoading(true);

      if (!useOroplayApi) {
        setGames([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('games')
        .select(`
          id,
          provider_id,
          name,
          type,
          status,
          image_url,
          is_featured,
          priority,
          api_type,
          game_providers!inner(name, type, status, api_type, logo_url)
        `)
        .eq('type', 'minigame')
        .eq('api_type', 'oroplay')
        .eq('status', 'visible')
        .eq('is_visible', true)
        .eq('game_providers.status', 'active')
        .order('is_featured', { ascending: false })
        .order('priority', { ascending: false })
        .order('name');

      if (selectedCategory === 'featured') {
        query = query.eq('is_featured', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      const gamesData: Game[] = (data || []).map((game: any) => ({
        game_id: game.id,
        provider_id: game.provider_id,
        provider_name: game.game_providers?.name || '알 수 없음',
        provider_logo: game.game_providers?.logo_url,
        game_name: game.name,
        game_type: game.type,
        image_url: game.image_url,
        is_featured: game.is_featured,
        status: game.status,
        priority: game.priority
      }));

      setGames(gamesData);

    } catch (error) {
      console.error('미니게임 로드 실패:', error);
      toast.error('미니게임을 불러오는데 실패했습니다.');
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchGame = async (gameId: number) => {
    if (!user) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    if (launchingGameId) {
      toast.error('게임 실행 중입니다. 잠시만 기다려주세요.');
      return;
    }

    const game = games.find(g => g.game_id === gameId);
    if (!game) {
      toast.error('게임을 찾을 수 없습니다.');
      return;
    }

    setLaunchingGameId(gameId);
    setShowLoadingPopup(true);
    setLoadingMessage(`게임 ${game.game_name}을(를) 실행 중입니다...`);

    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('balance')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      if (!userData || userData.balance <= 0) {
        toast.error('보유금이 부족합니다. 입금 후 이용해주세요.');
        return;
      }

      const activeSession = await gameApi.checkActiveSession(user.id);
      
      if (activeSession?.isActive && activeSession.api_type !== 'oroplay') {
        toast.error(
          `다른 API 게임이 실행 중입니다.\\n현재 게임을 종료해주세요.`,
          { duration: 5000 }
        );
        setLaunchingGameId(null);
        return;
      }
      
      const launchData = await gameApi.launchGame(user.id, gameId);
      
      if (!launchData || !launchData.game_url) {
        throw new Error('게임 URL을 받지 못했습니다.');
      }

      const gameWindow = window.open(
        launchData.game_url,
        `game_${gameId}`,
        'width=1280,height=720,resizable=yes,scrollbars=yes'
      );

      if (!gameWindow) {
        toast.error('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
        return;
      }

      toast.success(`${game.game_name} 게임을 실행합니다.`);

    } catch (error: any) {
      console.error('게임 실행 실패:', error);
      toast.error(error.message || '게임 실행에 실패했습니다.');
    } finally {
      setLaunchingGameId(null);
      setShowLoadingPopup(false);
    }
  };

  const getGameImage = (game: Game) => {
    if (game.image_url && game.image_url.trim() && game.image_url !== 'null') {
      return game.image_url;
    }
    return 'https://images.unsplash.com/photo-1760954185931-40d5b65fbb86?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdXBlcmhlcm8lMjBhY3Rpb24lMjBtb3ZpZXxlbnwxfHx8fDE3NjI1MTc0ODh8MA&ixlib=rb-4.1.0&q=80&w=1080';
  };

  const filteredGames = games.filter(game => {
    if (searchTerm && !game.game_name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
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

      {/* 카테고리 및 검색 */}
      <Card className="bg-black/40 border-yellow-600/30 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* 카테고리 버튼 */}
            <div className="flex flex-wrap gap-2">
              {miniGameCategories.map(category => {
                const Icon = category.icon;
                return (
                  <Button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={selectedCategory === category.id 
                      ? "bg-gradient-to-r from-yellow-600 to-yellow-700 text-black border-2 border-yellow-400" 
                      : "bg-black/50 text-yellow-100 border border-yellow-600/30 hover:bg-yellow-600/20"
                    }
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {category.name}
                  </Button>
                );
              })}
            </div>

            {/* 검색 및 뷰 모드 */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="게임명 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-black/50 border-yellow-600/30 text-white placeholder:text-gray-400"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  onClick={() => setViewMode('grid')}
                  className={viewMode === 'grid' 
                    ? "bg-yellow-600 hover:bg-yellow-700" 
                    : "bg-black/50 border border-yellow-600/30"
                  }
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={() => setViewMode('list')}
                  className={viewMode === 'list' 
                    ? "bg-yellow-600 hover:bg-yellow-700" 
                    : "bg-black/50 border border-yellow-600/30"
                  }
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 게임 목록 */}
      {!user ? (
        <Card className="bg-black/40 border-yellow-600/30">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <Gamepad2 className="h-16 w-16 text-yellow-600 mb-4" />
            <p className="text-yellow-100 text-lg">로그인 후 이용 가능합니다.</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader className="h-12 w-12 animate-spin text-yellow-500 mb-4" />
          <p className="text-yellow-100">미니게임을 불러오는 중...</p>
        </div>
      ) : filteredGames.length === 0 ? (
        <Card className="bg-black/40 border-yellow-600/30">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <Gamepad2 className="h-16 w-16 text-yellow-600 mb-4" />
            <p className="text-yellow-100 text-lg">게임이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className={
          viewMode === 'grid'
            ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
            : "space-y-3"
        }>
          {filteredGames.map(game => (
            <Card 
              key={`minigame-${game.game_id}`} 
              className="group bg-black/40 border-yellow-600/30 hover:border-yellow-400 transition-all duration-300 hover:shadow-[0_0_20px_rgba(234,179,8,0.3)] cursor-pointer overflow-hidden"
              onClick={() => handleLaunchGame(game.game_id)}
            >
              <CardContent className="p-0">
                {viewMode === 'grid' ? (
                  <div className="relative">
                    <div className="aspect-square relative overflow-hidden">
                      <ImageWithFallback
                        src={getGameImage(game)}
                        alt={game.game_name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                      {game.is_featured && (
                        <Badge className="absolute top-2 right-2 bg-red-600 text-white border-0">
                          <Star className="h-3 w-3 mr-1 fill-current" />
                          인기
                        </Badge>
                      )}
                    </div>
                    <div className="p-3 bg-gradient-to-b from-black/60 to-black/90">
                      <h3 className="text-sm text-yellow-100 truncate mb-1">{game.game_name}</h3>
                      <p className="text-xs text-gray-400 truncate">{game.provider_name}</p>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <Button 
                        className="bg-gradient-to-r from-yellow-600 to-yellow-700 text-black hover:from-yellow-500 hover:to-yellow-600"
                        disabled={launchingGameId === game.game_id}
                      >
                        {launchingGameId === game.game_id ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            플레이
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center p-4 gap-4">
                    <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                      <ImageWithFallback
                        src={getGameImage(game)}
                        alt={game.game_name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-yellow-100 truncate">{game.game_name}</h3>
                        {game.is_featured && (
                          <Badge className="bg-red-600 text-white border-0 flex-shrink-0">
                            <Star className="h-3 w-3 mr-1 fill-current" />
                            인기
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 truncate">{game.provider_name}</p>
                    </div>
                    <Button 
                      className="bg-gradient-to-r from-yellow-600 to-yellow-700 text-black hover:from-yellow-500 hover:to-yellow-600 flex-shrink-0"
                      disabled={launchingGameId === game.game_id}
                    >
                      {launchingGameId === game.game_id ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          플레이
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {showLoadingPopup && (
        <Sample1GameLoadingPopup
          show={showLoadingPopup}
          message={loadingMessage}
        />
      )}
    </div>
  );
}