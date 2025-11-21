import { useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { 
  User, 
  Gamepad2, 
  Coins,
  CreditCard,
  ArrowUpDown,
  MessageSquare,
  LogOut,
  Crown,
  Wallet,
  History,
  Bell
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { AnimatedCurrency, AnimatedPoints } from "../common/AnimatedNumber";
import { useLanguage } from "../../contexts/LanguageContext";
import { LanguageSwitcher } from "../admin/LanguageSwitcher";

interface UserHeaderProps {
  user: any;
  currentRoute: string;
  onRouteChange: (route: string) => void;
  onLogout: () => void;
}

interface UserBalance {
  balance: number;
  points: number;
}

export function UserHeader({ user, currentRoute, onRouteChange, onLogout }: UserHeaderProps) {
  const [balance, setBalance] = useState<UserBalance>({ balance: 0, points: 0 });
  const [showPointsDialog, setShowPointsDialog] = useState(false);
  const balanceChannelRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const { language, setLanguage, t } = useLanguage();

  const menuItems = [
    { path: '/user/casino', label: t.user.casino, icon: Gamepad2 },
    { path: '/user/slot', label: t.user.slot, icon: Coins },
    { path: '/user/minigame', label: t.user.minigame, icon: Crown },
    { path: '/user/betting-history', label: t.user.bettingHistory, icon: History },
    { path: '/user/deposit', label: t.user.deposit, icon: CreditCard },
    { path: '/user/withdraw', label: t.user.withdraw, icon: ArrowUpDown },
    { path: '/user/notice', label: t.user.notice, icon: MessageSquare },
    { path: '/user/support', label: t.user.support, icon: MessageSquare }
  ];

  useEffect(() => {
    fetchBalance();

    balanceChannelRef.current = supabase
      .channel(`user_balance_${user.id}`)
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          if (isMountedRef.current) {
            fetchBalance();
          }
        }
      )
      .subscribe();

    return () => {
      isMountedRef.current = false;
      if (balanceChannelRef.current) {
        supabase.removeChannel(balanceChannelRef.current);
        balanceChannelRef.current = null;
      }
    };
  }, [user.id]);

  const fetchBalance = async () => {
    if (!isMountedRef.current) return;
    
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

  const convertPointsToBalance = async () => {
    if (balance.points <= 0) {
      toast.error('전환할 포인트가 없습니다.');
      return;
    }

    try {
      const pointsToConvert = balance.points;
      
      const { error: userError } = await supabase
        .from('users')
        .update({
          points: 0,
          balance: balance.balance + pointsToConvert
        })
        .eq('id', user.id);

      if (userError) throw userError;

      await supabase
        .from('point_transactions')
        .insert([{
          user_id: user.id,
          transaction_type: 'convert_to_balance',
          amount: pointsToConvert,
          points_before: balance.points,
          points_after: 0,
          memo: '포인트를 보유금으로 전환'
        }]);

      await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          transaction_type: 'point_conversion',
          amount: pointsToConvert,
          status: 'completed',
          balance_before: balance.balance,
          balance_after: balance.balance + pointsToConvert,
          memo: '포인트 전환'
        }]);

      await fetchBalance();
      setShowPointsDialog(false);
      toast.success(`${pointsToConvert.toLocaleString()}P가 보유금으로 전환되었습니다.`);
    } catch (error: any) {
      console.error('포인트 전환 오류:', error);
      toast.error(error.message || '포인트 전환 중 오류가 발생했습니다.');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount);
  };

  const getVipBadge = (vipLevel: number) => {
    if (vipLevel >= 5) return { label: 'DIAMOND', color: 'bg-purple-600' };
    if (vipLevel >= 4) return { label: 'PLATINUM', color: 'bg-gray-400' };
    if (vipLevel >= 3) return { label: 'GOLD', color: 'bg-yellow-500' };
    if (vipLevel >= 2) return { label: 'SILVER', color: 'bg-gray-300' };
    if (vipLevel >= 1) return { label: 'BRONZE', color: 'bg-orange-400' };
    return { label: 'MEMBER', color: 'bg-slate-500' };
  };

  const vipBadge = getVipBadge(user.vip_level || 0);

  return (
    <>
      {/* Desktop Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-b border-yellow-600/30 shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-yellow-500 to-transparent opacity-60" />
        
        <div className="container mx-auto px-3 sm:px-4 max-w-full">
          <div className="flex items-center justify-between h-20 lg:h-20 min-w-0">
            {/* 로고 */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={() => {
                  // vip_level이 10인 사용자만 /admin으로 이동
                  if (user.vip_level === 10) {
                    window.location.hash = '#/admin';
                  } else {
                    onRouteChange('/user/casino');
                  }
                }}
                className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden golden-border cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500 via-red-600 to-yellow-500" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Crown className="w-8 h-8 sm:w-9 sm:h-9 text-white drop-shadow-lg relative z-10" />
                </div>
              </button>
              <div className="hidden sm:block">
                <div className="text-2xl sm:text-3xl gold-text neon-glow tracking-wide">VIP CASINO</div>
                <div className="text-sm sm:text-base text-yellow-400 tracking-widest uppercase">LUXURY EXPERIENCE</div>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-3 flex-shrink-0">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.path;
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    onClick={() => onRouteChange(item.path)}
                    className={`
                      relative px-4 lg:px-6 py-3 lg:py-3.5 transition-all duration-300 whitespace-nowrap
                      ${isActive 
                        ? 'bg-gradient-to-r from-yellow-600 to-red-600 text-white shadow-lg shadow-yellow-500/50 border border-yellow-400/50' 
                        : 'text-yellow-200/80 hover:text-yellow-100 hover:bg-yellow-900/20 border border-transparent hover:border-yellow-600/30'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 lg:w-6 lg:h-6 mr-2.5 ${isActive ? 'drop-shadow-lg' : ''}`} />
                    <span className="text-base lg:text-lg">{item.label}</span>
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-yellow-300 to-transparent" />
                    )}
                  </Button>
                );
              })}
            </nav>

            {/* Right Section - Desktop */}
            <div className="hidden lg:flex items-center space-x-2 lg:space-x-3 flex-shrink-0">
              {/* 언어 전환 버튼 */}
              <LanguageSwitcher />
              
              {/* 잔고 정보 */}
              <div className="flex items-center space-x-2 lg:space-x-3 luxury-card rounded-xl px-2 lg:px-4 py-2 lg:py-2.5">
                {/* 보유금 */}
                <div className="flex items-center space-x-1 lg:space-x-2">
                  <div className="p-1 lg:p-1.5 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 shadow-lg shadow-yellow-500/30">
                    <Wallet className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-yellow-400/70 tracking-wide">{t.user.balance}</div>
                    <div className="text-sm text-yellow-400">
                      <AnimatedCurrency value={balance.balance} duration={800} currencySymbol={t.common.currencySymbol} />
                    </div>
                  </div>
                </div>
                <div className="w-px h-8 lg:h-10 bg-gradient-to-b from-transparent via-yellow-600/50 to-transparent"></div>
                {/* 포인트 */}
                <button
                  onClick={() => setShowPointsDialog(true)}
                  className="flex items-center space-x-1 lg:space-x-2 cursor-pointer group hover:scale-105 transition-transform"
                >
                  <div className="p-1 lg:p-1.5 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30">
                    <Coins className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-green-400/70 tracking-wide">{t.user.points}</div>
                    <div className="text-sm text-green-400">
                      <AnimatedPoints value={balance.points} duration={800} />
                    </div>
                  </div>
                </button>
              </div>

              {/* 사용자 정보 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2 text-yellow-100 hover:text-white hover:bg-yellow-900/20 border border-transparent hover:border-yellow-600/30 luxury-card px-3 py-2 min-w-0">
                    <div className="flex items-center space-x-2 min-w-0">
                      <Badge className={`vip-badge ${vipBadge.color} text-white px-2.5 py-1 border border-yellow-400/30`}>
                        <Crown className="w-3 h-3 mr-1 drop-shadow-lg" />
                        <span className="tracking-wide text-sm">{vipBadge.label}</span>
                      </Badge>
                      <span className="text-yellow-100 text-sm truncate max-w-20">{user.nickname}</span>
                    </div>
                    <User className="w-4 h-4 flex-shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 luxury-card border-yellow-600/30" align="end">
                  <DropdownMenuItem 
                    onClick={() => onRouteChange('/user/profile')}
                    className="text-yellow-100 hover:text-white hover:bg-yellow-900/30 cursor-pointer"
                  >
                    <User className="w-4 h-4 mr-2" />
                    {t.user.myProfile}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onRouteChange('/user/deposit')}
                    className="text-green-400 hover:text-green-300 hover:bg-green-900/30 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {t.user.depositRequest}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onRouteChange('/user/withdraw')}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/30 cursor-pointer"
                  >
                    <ArrowUpDown className="w-4 h-4 mr-2" />
                    {t.user.withdrawRequest}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-yellow-600/30" />
                  <DropdownMenuItem 
                    onClick={onLogout}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/30 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t.user.logout}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Right Section - Mobile */}
            <div className="lg:hidden flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRouteChange('/user/support')}
                className="p-1.5 sm:p-2 text-yellow-100 hover:text-white hover:bg-yellow-900/20"
              >
                <MessageSquare className="w-8 h-8 sm:w-9 sm:h-9" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRouteChange('/user/notice')}
                className="p-1.5 sm:p-2 text-yellow-100 hover:text-white hover:bg-yellow-900/20"
              >
                <Bell className="w-8 h-8 sm:w-9 sm:h-9" />
              </Button>

              <div className="flex flex-col items-end px-2 py-1.5 rounded-lg bg-black/40">
                <div className="text-xs text-yellow-400/70 tracking-wide">보유금</div>
                <div className="text-base sm:text-lg text-yellow-400 whitespace-nowrap">
                  <AnimatedCurrency value={balance.balance} duration={800} currencySymbol={t.common.currencySymbol} />
                </div>
              </div>

              <button
                onClick={() => setShowPointsDialog(true)}
                className="flex flex-col items-end px-2 py-1.5 rounded-lg bg-black/40 hover:bg-yellow-900/20 transition-colors"
              >
                <div className="text-xs text-green-400/70 tracking-wide">포인트</div>
                <div className="text-base sm:text-lg text-green-400 whitespace-nowrap">
                  <AnimatedPoints value={balance.points} duration={800} />
                </div>
              </button>

              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="p-1.5 sm:p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20"
              >
                <LogOut className="w-8 h-8 sm:w-9 sm:h-9" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-t border-yellow-600/30 shadow-2xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent" />
        
        <div className="flex items-center justify-around py-4 px-1 safe-area-bottom overflow-y-hidden">
          {menuItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = currentRoute === item.path;
            return (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                onClick={() => onRouteChange(item.path)}
                className={`
                  flex flex-col items-center justify-center gap-1.5 px-1 py-6 relative flex-1                  
                  ${isActive 
                    ? 'text-yellow-400' 
                    : 'text-yellow-200/70 hover:text-yellow-100'
                  }
                `}
              >
                <Icon className={`w-11 h-11 sm:w-11 sm:h-11 flex-shrink-0 ${isActive ? 'drop-shadow-[0_0_12px_rgba(250,204,21,1)]' : ''}`} />
                <span className={`text-sm sm:text-sm leading-tight text-center ${isActive ? 'neon-glow' : ''} whitespace-nowrap px-1`}>
                  {item.label}
                </span>
                {isActive && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-1.5 bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full" />
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* 포인트 전환 다이얼로그 */}
      <AlertDialog open={showPointsDialog} onOpenChange={setShowPointsDialog}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t.user.pointConversion}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              {balance.points > 0 ? (
                <>
                  {t.user.convertPointsConfirm} <span className="text-yellow-400 font-bold">{formatCurrency(balance.points)}P</span>
                  {t.user.convertPointsQuestion}
                </>
              ) : (
                <span className="text-slate-400">{t.user.noPointsToConvert}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600 border-slate-600">
              {balance.points > 0 ? t.user.cancel : t.user.confirm}
            </AlertDialogCancel>
            {balance.points > 0 && (
              <AlertDialogAction
                onClick={convertPointsToBalance}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {t.user.convertPointsButton}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}