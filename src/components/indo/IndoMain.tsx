import { useState, useEffect } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ImageWithFallback } from "@figma/ImageWithFallback";
import { 
  Play, 
  Star,
  TrendingUp,
  Zap,
  Crown,
  Sparkles
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";

interface IndoMainProps {
  user: any;
  onRouteChange: (route: string) => void;
}

const categories = [
  {
    id: 'casino',
    title: '카지노',
    icon: '🎰',
    gradient: 'from-purple-600 via-purple-700 to-purple-800',
    image: 'https://images.unsplash.com/photo-1659382151328-30c3df37a69a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800'
  },
  {
    id: 'slot',
    title: '슬롯',
    icon: '🎲',
    gradient: 'from-pink-600 via-pink-700 to-pink-800',
    image: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800'
  },
  {
    id: 'holdem',
    title: '홀덤',
    icon: '🃏',
    gradient: 'from-red-600 via-red-700 to-red-800',
    image: 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800'
  },
  {
    id: 'minigame',
    title: '미니게임',
    icon: '🎯',
    gradient: 'from-blue-600 via-blue-700 to-blue-800',
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800'
  },
];

const casinoProviders = [
  { id: 'evolution', name: '에볼루션', logo: '🎰', color: 'from-red-500 to-red-600' },
  { id: 'pragmatic', name: '프라그마틱', logo: '🎲', color: 'from-blue-500 to-blue-600' },
  { id: 'dream', name: '드림 카지노', logo: '💎', color: 'from-purple-500 to-purple-600' },
  { id: 'asia', name: '아시아 카지노', logo: '🌏', color: 'from-green-500 to-green-600' },
  { id: 'wm', name: 'WM 카지노', logo: '👑', color: 'from-yellow-500 to-yellow-600' },
  { id: 'micro', name: '마이크로게이밍', logo: '⚡', color: 'from-pink-500 to-pink-600' },
];

export function IndoMain({ user, onRouteChange }: IndoMainProps) {
  const [featuredGames, setFeaturedGames] = useState<any[]>([]);
  const [recentBets, setRecentBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Featured games
      const { data: games } = await supabase
        .from('games')
        .select(`
          *,
          game_providers (name, logo_url)
        `)
        .eq('is_featured', true)
        .eq('status', 'visible')
        .eq('is_visible', true)
        .order('priority', { ascending: false })
        .limit(12);

      setFeaturedGames(games || []);

      // Recent bets
      const { data: bets } = await supabase
        .from('game_records')
        .select('*')
        .order('played_at', { ascending: false })
        .limit(10);

      setRecentBets(bets || []);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount || 0);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const launchGame = async (gameId: number) => {
    if (!user) {
      toast.error('로그인이 필요합니다.');
      onRouteChange('/indo/login');
      return;
    }

    try {
      const result = await gameApi.launchGame(user.id, gameId, 'invest');
      if (result.success && result.url) {
        window.open(result.url, '_blank', 'width=1200,height=800');
      } else {
        toast.error(result.error || '게임 실행 실패');
      }
    } catch (error: any) {
      toast.error(error.message || '게임 실행 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="relative h-[500px] rounded-2xl overflow-hidden">
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1659382151328-30c3df37a69a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920"
          alt="Casino Banner"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent">
          <div className="flex items-center h-full px-12">
            <div className="max-w-2xl space-y-6">
              <div className="inline-block">
                <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 text-lg">
                  <Star className="w-5 h-5 mr-2 inline" />
                  VIP 보너스
                </Badge>
              </div>
              <h1 className="text-6xl font-bold">
                <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
                  Night
                </span>
              </h1>
              <p className="text-2xl text-gray-300">
                최고의 카지노 경험을 지금 바로 시작하세요
              </p>
              <Button
                size="lg"
                onClick={() => onRouteChange('/indo/casino')}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg px-8 py-6"
              >
                <Play className="w-5 h-5 mr-2" />
                게임 시작하기
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Games Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-400" />
            최근 승리게임
          </h2>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {featuredGames.slice(0, 12).map((game) => (
            <Card key={game.id} className="bg-[#1a1f3a] border-purple-900/30 overflow-hidden group hover:scale-105 transition-transform cursor-pointer">
              <CardContent className="p-0">
                <div className="relative aspect-square">
                  <ImageWithFallback
                    src={game.image_url || 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?q=80&w=400'}
                    alt={game.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <Button
                        size="sm"
                        onClick={() => launchGame(game.id)}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                      >
                        <Play className="w-4 h-4 mr-1" />
                        플레이
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate text-white">{game.name}</p>
                  <p className="text-xs text-gray-400 truncate">{game.game_providers?.name}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <Badge variant="secondary" className="text-xs bg-green-900/30 text-green-400">
                      20000원
                    </Badge>
                    <span className="text-xs text-gray-500">X 2.56</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Category Cards Section */}
      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Crown className="w-6 h-6 text-purple-400" />
          게임 카테고리
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((category) => (
            <Card 
              key={category.id}
              className="bg-gradient-to-br from-[#1a1f3a] to-[#0f1433] border-purple-900/30 overflow-hidden group hover:scale-105 transition-all cursor-pointer"
              onClick={() => onRouteChange(`/indo/${category.id}`)}
            >
              <CardContent className="p-0">
                <div className="relative h-48">
                  <ImageWithFallback
                    src={category.image}
                    alt={category.title}
                    className="w-full h-full object-cover"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-70 group-hover:opacity-50 transition-opacity`}></div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                    <span className="text-6xl mb-3">{category.icon}</span>
                    <h3 className="text-2xl font-bold">{category.title}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Casino Providers Section */}
      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Zap className="w-6 h-6 text-purple-400" />
          카지노
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {casinoProviders.map((provider) => (
            <Card 
              key={provider.id}
              className="bg-[#1a1f3a] border-purple-900/30 overflow-hidden group hover:scale-105 transition-all cursor-pointer"
              onClick={() => onRouteChange('/indo/casino')}
            >
              <CardContent className="p-0">
                <div className={`relative h-32 bg-gradient-to-br ${provider.color} flex items-center justify-center`}>
                  <span className="text-5xl">{provider.logo}</span>
                </div>
                <div className="p-3 text-center">
                  <p className="text-sm font-medium text-white">{provider.name}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Recent Bets Section */}
      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-purple-400" />
          최근 배팅
        </h2>
        
        <Card className="bg-[#1a1f3a] border-purple-900/30">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-purple-900/30">
                  <tr className="text-gray-400 text-sm">
                    <th className="text-left p-4">게임</th>
                    <th className="text-left p-4">유저</th>
                    <th className="text-left p-4">시간</th>
                    <th className="text-right p-4">배팅 금액</th>
                    <th className="text-right p-4">배수</th>
                    <th className="text-right p-4">지급금</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBets.map((bet, index) => {
                    const profit = (bet.win_amount || 0) - (bet.bet_amount || 0);
                    const multiplier = bet.bet_amount > 0 ? (bet.win_amount / bet.bet_amount).toFixed(2) : '0.00';
                    
                    return (
                      <tr key={index} className="border-b border-purple-900/10 hover:bg-purple-900/10">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-purple-900/30 flex items-center justify-center">
                              🎰
                            </div>
                            <span className="text-sm text-white">{bet.game_title || 'Unknown Game'}</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-gray-300">{bet.username || 'gtgt***'}</td>
                        <td className="p-4 text-sm text-gray-400">{formatDate(bet.played_at)}</td>
                        <td className="p-4 text-right">
                          <span className="text-sm text-orange-400">🪙 {formatCurrency(bet.bet_amount || 0)}</span>
                        </td>
                        <td className="p-4 text-right text-sm text-gray-300">{multiplier}x</td>
                        <td className="p-4 text-right">
                          <span className={`text-sm font-medium ${profit > 0 ? 'text-green-400' : profit < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            🪙 {formatCurrency(bet.win_amount || 0)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {recentBets.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  베팅 내역이 없습니다.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Provider Logos Footer */}
      <section className="py-8">
        <div className="flex items-center justify-center gap-8 flex-wrap opacity-50 grayscale hover:grayscale-0 transition-all">
          <span className="text-4xl">🎰</span>
          <span className="text-4xl">🎲</span>
          <span className="text-4xl">👑</span>
          <span className="text-4xl">💎</span>
          <span className="text-4xl">⚡</span>
          <span className="text-4xl">🌟</span>
          <span className="text-4xl">🎯</span>
          <span className="text-4xl">🃏</span>
        </div>
      </section>
    </div>
  );
}
