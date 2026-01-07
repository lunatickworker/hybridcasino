import { useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { 
  Search, 
  User, 
  LogOut,
  Wallet,
  Coins,
  Menu
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { supabase } from "../../lib/supabase";
import { AnimatedCurrency, AnimatedPoints } from "../common/AnimatedNumber";

interface IndoHeaderProps {
  user: any;
  onRouteChange: (route: string) => void;
  onLogout: () => void;
}

interface UserBalance {
  balance: number;
  points: number;
}

export function IndoHeader({ user, onRouteChange, onLogout }: IndoHeaderProps) {
  const [balance, setBalance] = useState<UserBalance>({ balance: 0, points: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const balanceChannelRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (user?.id) {
      fetchBalance();

      balanceChannelRef.current = supabase
        .channel(`indo_balance_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: `id=eq.${user.id}`
          },
          (payload) => {
            if (isMountedRef.current) {
              const newData = payload.new as any;
              setBalance({
                balance: parseFloat(newData.balance) || 0,
                points: parseFloat(newData.points) || 0
              });
            }
          }
        )
        .subscribe();
    }

    return () => {
      isMountedRef.current = false;
      if (balanceChannelRef.current) {
        supabase.removeChannel(balanceChannelRef.current);
        balanceChannelRef.current = null;
      }
    };
  }, [user?.id]);

  const fetchBalance = async () => {
    if (!user?.id || !isMountedRef.current) return;
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('balance, points')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      if (data && isMountedRef.current) {
        setBalance({
          balance: parseFloat(data.balance) || 0,
          points: parseFloat(data.points) || 0
        });
      }
    } catch (error) {
      console.error('잔고 조회 오류:', error);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0f1433] border-b border-purple-900/30">
      <div className="flex items-center justify-between px-6 h-16">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => onRouteChange('/indo')}
            className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent"
          >
            INDO CASINO
          </button>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="게임 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500"
            />
          </div>
        </div>

        {/* User Info */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              {/* Balance */}
              <div className="flex items-center gap-3 px-4 py-2 bg-[#1a1f3a] rounded-lg border border-purple-900/30">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-purple-400" />
                  <div className="text-right">
                    <div className="text-xs text-gray-400">보유금</div>
                    <div className="text-sm font-bold text-white">
                      <AnimatedCurrency value={balance.balance} duration={800} />
                    </div>
                  </div>
                </div>
                <div className="w-px h-8 bg-purple-900/30"></div>
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-green-400" />
                  <div className="text-right">
                    <div className="text-xs text-gray-400">포인트</div>
                    <div className="text-sm font-bold text-green-400">
                      <AnimatedPoints value={balance.points} duration={800} />
                    </div>
                  </div>
                </div>
              </div>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 text-white hover:bg-purple-900/30">
                    <User className="w-4 h-4" />
                    <span>{user.nickname}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48 bg-[#1a1f3a] border-purple-900/30" align="end">
                  <DropdownMenuItem 
                    onClick={() => onRouteChange('/indo/profile')}
                    className="text-gray-300 hover:text-white hover:bg-purple-900/30 cursor-pointer"
                  >
                    <User className="w-4 h-4 mr-2" />
                    내 정보
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-purple-900/30" />
                  <DropdownMenuItem 
                    onClick={onLogout}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => onRouteChange('/indo/login')}
                variant="outline"
                className="border-purple-500 text-purple-400 hover:bg-purple-900/30"
              >
                로그인
              </Button>
              <Button 
                onClick={() => onRouteChange('/indo/signup')}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                회원가입
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
