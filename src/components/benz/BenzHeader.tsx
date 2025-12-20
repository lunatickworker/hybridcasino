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

interface BenzHeaderProps {
  user: any;
  onRouteChange: (route: string) => void;
  onLogout: () => void;
  onOpenLoginModal?: () => void;
  onOpenSignupModal?: () => void;
  balance?: number;
  points?: number;
}

interface UserBalance {
  balance: number;
  points: number;
}

export function BenzHeader({ user, onRouteChange, onLogout, onOpenLoginModal, onOpenSignupModal, balance: propsBalance, points: propsPoints }: BenzHeaderProps) {
  const [balance, setBalance] = useState<UserBalance>({ 
    balance: propsBalance || 0, 
    points: propsPoints || 0 
  });
  const [searchQuery, setSearchQuery] = useState("");

  // Props로 받은 balance가 변경되면 업데이트
  useEffect(() => {
    if (propsBalance !== undefined && propsPoints !== undefined) {
      setBalance({ balance: propsBalance, points: propsPoints });
    }
  }, [propsBalance, propsPoints]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0f1433] border-b border-purple-900/30" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
      <div className="flex items-center justify-between px-6 h-20">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => onRouteChange('/benz')}
            className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent"
          >
            BENZ CASINO
          </button>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="게임 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500 h-12 text-base"
            />
          </div>
        </div>

        {/* User Info */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              {/* Balance */}
              <div className="flex items-center gap-3 px-5 py-3 bg-[#1a1f3a] rounded-lg border border-purple-900/30">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-purple-400" />
                  <div className="text-right">
                    <div className="text-sm text-gray-400">보유금</div>
                    <div className="text-base font-bold text-white">
                      <AnimatedCurrency value={balance.balance} duration={800} />
                    </div>
                  </div>
                </div>
                <div className="w-px h-10 bg-purple-900/30"></div>
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-green-400" />
                  <div className="text-right">
                    <div className="text-sm text-gray-400">포인트</div>
                    <div className="text-base font-bold text-green-400">
                      <AnimatedPoints value={balance.points} duration={800} />
                    </div>
                  </div>
                </div>
              </div>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 text-white hover:bg-purple-900/30 text-base h-12 px-4">
                    <User className="w-5 h-5" />
                    <span>{user.nickname}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-52 bg-[#1a1f3a] border-purple-900/30" align="end">
                  <DropdownMenuItem 
                    onClick={() => onRouteChange('/benz/profile')}
                    className="text-gray-300 hover:text-white hover:bg-purple-900/30 cursor-pointer text-base py-3"
                  >
                    <User className="w-5 h-5 mr-2" />
                    내 정보
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-purple-900/30" />
                  <DropdownMenuItem 
                    onClick={onLogout}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20 cursor-pointer text-base py-3"
                  >
                    <LogOut className="w-5 h-5 mr-2" />
                    로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button 
                onClick={onOpenLoginModal}
                variant="outline"
                className="border-purple-500 text-purple-400 hover:bg-purple-900/30 text-base h-11 px-5"
              >
                로그인
              </Button>
              <Button 
                onClick={onOpenSignupModal}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-base h-11 px-5"
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