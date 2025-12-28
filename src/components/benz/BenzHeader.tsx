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
  Menu,
  ArrowRightLeft,
  Mail,
  UserX,
  Home,
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
  UserPlus,
  X,
  Gamepad2,
  Bell,
  HelpCircle,
  Star,
  Crown,
  MessageSquare,
  CreditCard,
  History,
  ArrowUpDown
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Alert, AlertDescription } from "../ui/alert";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { supabase } from "../../lib/supabase";
import { AnimatedCurrency, AnimatedPoints } from "../common/AnimatedNumber";
import { toast } from "sonner";

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
  const [showPointConvertDialog, setShowPointConvertDialog] = useState(false);
  const [showMessagesDialog, setShowMessagesDialog] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Props로 받은 balance가 변경되면 업데이트
  useEffect(() => {
    if (propsBalance !== undefined && propsPoints !== undefined) {
      setBalance({ balance: propsBalance, points: propsPoints });
    }
  }, [propsBalance, propsPoints]);

  // 읽지 않은 메시지 조회
  useEffect(() => {
    if (!user) return;

    const fetchUnreadMessages = async () => {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('status', 'unread');
      
      setUnreadMessages(count || 0);
    };

    fetchUnreadMessages();

    // 실시간 구독
    const subscription = supabase
      .channel('user_messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${user.id}`
      }, () => {
        fetchUnreadMessages();
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, [user]);

  // 포인트를 GMS 머니로 전환
  const convertPointsToBalance = async () => {
    if (balance.points <= 0) {
      toast.error('전환할 포인트가 없습니다.');
      return;
    }

    try {
      const pointsToConvert = balance.points;

      // 포인트 차감 및 잔고 증가
      const { error: userError } = await supabase
        .from('users')
        .update({ 
          points: 0,
          balance: balance.balance + pointsToConvert
        })
        .eq('id', user.id);

      if (userError) throw userError;

      // 포인트 거래 기록
      await supabase
        .from('point_transactions')
        .insert([{
          user_id: user.id,
          transaction_type: 'convert_to_balance',
          amount: pointsToConvert,
          points_before: balance.points,
          points_after: 0,
          memo: '포인트를 GMS 머니로 전환'
        }]);

      // 잔고 거래 기록
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

      // 활동 로그 기록
      await supabase
        .from('activity_logs')
        .insert([{
          actor_type: 'user',
          actor_id: user.id,
          action: 'point_conversion',
          target_type: 'transaction',
          details: {
            points: pointsToConvert,
            converted_amount: pointsToConvert
          }
        }]);

      setBalance({ balance: balance.balance + pointsToConvert, points: 0 });
      setShowPointConvertDialog(false);
      toast.success(`${pointsToConvert.toLocaleString()}P를 GMS 머니로 전환했습니다.`);
    } catch (error: any) {
      console.error('포인트 전환 오류:', error);
      toast.error(error.message || '포인트 전환에 실패했습니다.');
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString();
  };

  return (
    <>
      {/* Desktop Header */}
      <header className="hidden md:block fixed top-0 left-0 right-0 z-50 bg-black border-b-2" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif', borderColor: '#141414' }}>
        <div className="flex items-center justify-between px-6 h-20">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => onRouteChange('/benz')}
              className="hover:opacity-80 transition-opacity mt-9"
            >
              <ImageWithFallback
                src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/photo_2025-12-28_09-51-13.png"
                alt="BENZ CASINO"
                className="h-48 w-auto object-contain"
              />
            </button>
          </div>

          {/* User Info */}
          <div className="flex items-center gap-4">
            {user ? (
              <>
                {/* 닉네임 */}
                <div>
                  <span 
                    className="font-bold text-xl tracking-wide"
                    style={{
                      color: '#E6C9A8',
                      textShadow: '0 2px 8px rgba(193, 154, 107, 0.4)'
                    }}
                  >
                    {user.nickname}님
                  </span>
                </div>

                {/* 보유머니 */}
                <div 
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border"
                  style={{
                    background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.6) 0%, rgba(30, 30, 45, 0.4) 100%)',
                    borderColor: 'rgba(193, 154, 107, 0.3)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <span className="text-gray-300 text-base">보유머니 :</span>
                  <span 
                    className="font-bold text-xl"
                    style={{
                      color: '#E6C9A8',
                      textShadow: '0 2px 6px rgba(193, 154, 107, 0.5)'
                    }}
                  >
                    <AnimatedCurrency value={balance.balance} duration={800} />
                  </span>
                  <span className="text-gray-300 text-base">원</span>
                </div>

                {/* 포인트 (클릭 가능) */}
                <button
                  onClick={() => setShowPointConvertDialog(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-300 hover:scale-105 group relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.6) 0%, rgba(30, 30, 45, 0.4) 100%)',
                    borderColor: 'rgba(193, 154, 107, 0.3)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)'
                    }}
                  ></div>
                  <span className="text-gray-300 text-base relative z-10">포인트 :</span>
                  <span 
                    className="font-bold text-xl relative z-10"
                    style={{
                      color: '#A8E6CF',
                      textShadow: '0 2px 6px rgba(168, 230, 207, 0.4)'
                    }}
                  >
                    <AnimatedPoints value={balance.points} duration={800} />
                  </span>
                </button>

                {/* 쪽지 */}
                <button 
                  onClick={() => onRouteChange('/benz/support')}
                  className="relative px-5 py-2.5 rounded-lg border transition-all duration-300 hover:scale-105 group overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, rgba(166, 124, 82, 0.1) 100%)',
                    borderColor: 'rgba(193, 154, 107, 0.4)',
                    boxShadow: '0 4px 12px rgba(193, 154, 107, 0.2)'
                  }}
                >
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.25) 0%, rgba(166, 124, 82, 0.15) 100%)'
                    }}
                  ></div>
                  <div className="relative z-10 flex items-center gap-2">
                    <Mail className="w-5 h-5" style={{ color: '#E6C9A8' }} />
                    <span 
                      className="font-semibold text-base"
                      style={{
                        color: '#E6C9A8',
                        textShadow: '0 2px 4px rgba(193, 154, 107, 0.3)'
                      }}
                    >
                      쪽지
                    </span>
                    {unreadMessages > 0 && (
                      <span 
                        className="ml-1 font-bold"
                        style={{
                          color: '#FF6B6B',
                          textShadow: '0 0 8px rgba(255, 107, 107, 0.6)'
                        }}
                      >
                        {unreadMessages}
                      </span>
                    )}
                  </div>
                  {unreadMessages > 0 && (
                    <span 
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold"
                      style={{
                        background: 'linear-gradient(135deg, #FF6B6B 0%, #EE5A6F 100%)',
                        boxShadow: '0 2px 8px rgba(255, 107, 107, 0.6)'
                      }}
                    >
                      {unreadMessages}
                    </span>
                  )}
                </button>

                {/* 로그아웃 */}
                <button 
                  onClick={onLogout}
                  className="px-6 py-2.5 rounded-lg transition-all duration-300 hover:scale-105 group relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                    boxShadow: '0 4px 15px rgba(193, 154, 107, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(230, 201, 168, 0.3)'
                  }}
                >
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(135deg, #D4AF87 0%, #C19A6B 100%)'
                    }}
                  ></div>
                  <span 
                    className="relative z-10 font-bold text-base tracking-wide"
                    style={{
                      color: '#FFFFFF',
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                    }}
                  >
                    로그아웃
                  </span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <button 
                  onClick={onOpenLoginModal}
                  className="px-6 py-2.5 rounded-lg border transition-all duration-300 hover:scale-105 group relative overflow-hidden"
                  style={{
                    background: 'transparent',
                    borderColor: 'rgba(193, 154, 107, 0.5)',
                    boxShadow: '0 2px 8px rgba(193, 154, 107, 0.2)'
                  }}
                >
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, rgba(166, 124, 82, 0.1) 100%)'
                    }}
                  ></div>
                  <span 
                    className="relative z-10 font-semibold text-base tracking-wide"
                    style={{
                      color: '#E6C9A8',
                      textShadow: '0 2px 4px rgba(193, 154, 107, 0.3)'
                    }}
                  >
                    로그인
                  </span>
                </button>
                <button 
                  onClick={onOpenSignupModal}
                  className="px-6 py-2.5 rounded-lg transition-all duration-300 hover:scale-105 group relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                    boxShadow: '0 4px 15px rgba(193, 154, 107, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(230, 201, 168, 0.3)'
                  }}
                >
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(135deg, #D4AF87 0%, #C19A6B 100%)'
                    }}
                  ></div>
                  <span 
                    className="relative z-10 font-bold text-base tracking-wide"
                    style={{
                      color: '#FFFFFF',
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                    }}
                  >
                    회원가입
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-black border-b-2" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif', borderColor: '#141414' }}>
        <div className="flex items-center justify-between px-4 h-16">
          {/* Logo */}
          <button
            onClick={() => onRouteChange('/benz')}
            className="hover:opacity-80 transition-opacity"
          >
            <ImageWithFallback
              src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/photo_2025-12-28_09-50-36.jpg"
              alt="BENZ CASINO"
              className="h-15 w-auto object-contain"
            />
          </button>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button 
                  onClick={onLogout}
                  size="sm"
                  variant="outline"
                  className="border-purple-500 text-purple-400 hover:bg-purple-900/30 h-9 px-3"
                >
                  로그아웃
                </Button>
                <Button
                  onClick={() => setShowMobileMenu(true)}
                  size="sm"
                  className="bg-transparent hover:bg-purple-900/20 h-9 w-9 p-0 border-none"
                >
                  <Menu className="w-5 h-5 text-purple-400" />
                </Button>
              </>
            ) : (
              <>
                <Button 
                  onClick={onOpenLoginModal}
                  size="sm"
                  variant="outline"
                  className="border-purple-500 text-purple-400 hover:bg-purple-900/30 h-9 px-3"
                >
                  로그인
                </Button>
                <Button
                  onClick={() => setShowMobileMenu(true)}
                  size="sm"
                  className="bg-transparent hover:bg-purple-900/20 h-9 w-9 p-0 border-none"
                >
                  <Menu className="w-5 h-5 text-purple-400" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Menu Sidebar */}
      {showMobileMenu && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 z-[60] md:hidden"
            onClick={() => setShowMobileMenu(false)}
          />
          
          {/* Sidebar */}
          <div className="fixed top-0 right-0 bottom-0 w-80 bg-black z-[70] md:hidden overflow-y-auto">
            <div className="p-6">
              {/* Close Button */}
              <button
                onClick={() => setShowMobileMenu(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>

              {/* User Info */}
              {user && (
                <div className="mb-4 space-y-2">
                  <div className="text-lg text-orange-400 font-bold">{user.nickname}님</div>
                  
                  <div className="space-y-2">
                    <div className="p-2.5 bg-[#1a1f3a] rounded-lg border border-purple-900/30">
                      <div className="text-xs text-gray-400 mb-0.5">보유머니</div>
                      <div className="text-lg text-orange-400 font-bold">
                        <AnimatedCurrency value={balance.balance} duration={800} /> 원
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        setShowPointConvertDialog(true);
                        setShowMobileMenu(false);
                      }}
                      className="w-full p-2.5 bg-[#1a1f3a] rounded-lg border border-purple-900/30 hover:bg-purple-900/20 transition-colors"
                    >
                      <div className="text-xs text-gray-400 mb-0.5">포인트</div>
                      <div className="text-lg text-green-400 font-bold">
                        <AnimatedPoints value={balance.points} duration={800} /> P
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Menu Items */}
              <nav className="space-y-2">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3 px-2">메뉴</h3>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        if (!user) {
                          setShowMobileMenu(false);
                          onOpenLoginModal?.();
                          return;
                        }
                        onRouteChange('/benz');
                        setShowMobileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                    >
                      <Gift className="w-5 h-5 text-purple-400" />
                      <span className="text-white">보너스 혜택</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!user) {
                          setShowMobileMenu(false);
                          onOpenLoginModal?.();
                          return;
                        }
                        onRouteChange('/benz/featured');
                        setShowMobileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                    >
                      <Star className="w-5 h-5 text-yellow-400" />
                      <span className="text-white">추천게임</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!user) {
                          setShowMobileMenu(false);
                          onOpenLoginModal?.();
                          return;
                        }
                        onRouteChange('/benz/casino');
                        setShowMobileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                    >
                      <Gamepad2 className="w-5 h-5 text-purple-400" />
                      <span className="text-white">카지노</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!user) {
                          setShowMobileMenu(false);
                          onOpenLoginModal?.();
                          return;
                        }
                        onRouteChange('/benz/slot');
                        setShowMobileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                    >
                      <Coins className="w-5 h-5 text-yellow-400" />
                      <span className="text-white">슬롯</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!user) {
                          setShowMobileMenu(false);
                          onOpenLoginModal?.();
                          return;
                        }
                        onRouteChange('/benz/notice');
                        setShowMobileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                    >
                      <Bell className="w-5 h-5 text-blue-400" />
                      <span className="text-white">공지사항</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!user) {
                          setShowMobileMenu(false);
                          onOpenLoginModal?.();
                          return;
                        }
                        onRouteChange('/benz/support');
                        setShowMobileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                    >
                      <MessageSquare className="w-5 h-5 text-green-400" />
                      <span className="text-white">고객센터</span>
                    </button>
                  </div>
                </div>

                {user && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3 px-2">회원</h3>
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          onRouteChange('/benz/deposit');
                          setShowMobileMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                      >
                        <CreditCard className="w-5 h-5 text-green-400" />
                        <span className="text-white">입금신청</span>
                      </button>

                      <button
                        onClick={() => {
                          onRouteChange('/benz/withdraw');
                          setShowMobileMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                      >
                        <ArrowUpDown className="w-5 h-5 text-red-400" />
                        <span className="text-white">출금신청</span>
                      </button>

                      <button
                        onClick={() => {
                          onRouteChange('/benz/betting-history');
                          setShowMobileMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                      >
                        <History className="w-5 h-5 text-blue-400" />
                        <span className="text-white">베팅내역</span>
                      </button>

                      <button
                        onClick={() => {
                          onRouteChange('/benz/profile');
                          setShowMobileMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-purple-900/20 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                      >
                        <User className="w-5 h-5 text-purple-400" />
                        <span className="text-white">내 정보</span>
                      </button>
                    </div>
                  </div>
                )}
              </nav>
            </div>
          </div>
        </>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-purple-900/30" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
        <div className="flex items-center justify-around h-16">
          {/* 홈 */}
          <button
            onClick={() => onRouteChange('/benz')}
            className="flex flex-col items-center justify-center flex-1 h-full hover:bg-purple-900/20 transition-colors"
          >
            <Home className="w-6 h-6 text-purple-400 mb-1" />
            <span className="text-xs text-gray-400">홈</span>
          </button>

          {/* 입금 */}
          <button
            onClick={() => {
              if (!user) {
                onOpenLoginModal?.();
                return;
              }
              onRouteChange('/benz/deposit');
            }}
            className="flex flex-col items-center justify-center flex-1 h-full hover:bg-purple-900/20 transition-colors"
          >
            <ArrowUpCircle className="w-6 h-6 text-green-400 mb-1" />
            <span className="text-xs text-gray-400">입금</span>
          </button>

          {/* 출금 */}
          <button
            onClick={() => {
              if (!user) {
                onOpenLoginModal?.();
                return;
              }
              onRouteChange('/benz/withdraw');
            }}
            className="flex flex-col items-center justify-center flex-1 h-full hover:bg-purple-900/20 transition-colors"
          >
            <ArrowDownCircle className="w-6 h-6 text-red-400 mb-1" />
            <span className="text-xs text-gray-400">출금</span>
          </button>

          {/* 포인트 */}
          <button
            onClick={() => {
              if (!user) {
                onOpenLoginModal?.();
                return;
              }
              setShowPointConvertDialog(true);
            }}
            className="flex flex-col items-center justify-center flex-1 h-full hover:bg-purple-900/20 transition-colors"
          >
            <Gift className="w-6 h-6 text-yellow-400 mb-1" />
            <span className="text-xs text-gray-400">포인트</span>
          </button>

          {/* 회원가입 */}
          <button
            onClick={() => {
              if (user) {
                onRouteChange('/benz/profile');
              } else {
                onOpenSignupModal?.();
              }
            }}
            className="flex flex-col items-center justify-center flex-1 h-full hover:bg-purple-900/20 transition-colors"
          >
            <UserPlus className="w-6 h-6 text-pink-400 mb-1" />
            <span className="text-xs text-gray-400">{user ? '내정보' : '회원가입'}</span>
          </button>
        </div>
      </nav>

      {/* 포인트 전환 다이얼로그 */}
      <Dialog open={showPointConvertDialog} onOpenChange={setShowPointConvertDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <ArrowRightLeft className="w-6 h-6 text-green-400" />
              포인트 → GMS 머니 전환
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-base">
              포인트를 GMS 머니로 전환합니다
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="p-6 bg-slate-700/30 rounded-none border border-slate-700/50">
              <div className="text-center space-y-4">
                <div>
                  <div className="text-sm text-slate-400 mb-2">전환할 포인트</div>
                  <div className="text-3xl font-bold text-green-400">
                    {formatCurrency(balance.points)}P
                  </div>
                </div>
                
                <div className="flex items-center justify-center">
                  <ArrowRightLeft className="w-8 h-8 text-purple-400" />
                </div>
                
                <div>
                  <div className="text-sm text-slate-400 mb-2">전환 후 GMS 머니</div>
                  <div className="text-3xl font-bold text-orange-400">
                    {formatCurrency(balance.points)} 원
                  </div>
                </div>
              </div>
            </div>
            
            <Alert className="border-blue-600 bg-blue-900/20 rounded-none">
              <AlertDescription className="text-blue-300 text-base">
                💡 포인트를 GMS 머니로 전환하면 되돌릴 수 없습니다.<br/>
                전환하시겠습니까?
              </AlertDescription>
            </Alert>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowPointConvertDialog(false)}
                className="flex-1 border-slate-600 hover:bg-slate-700/50 text-white h-12 text-base rounded-none"
              >
                취소
              </Button>
              <Button
                onClick={convertPointsToBalance}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 h-12 text-base rounded-none"
                disabled={balance.points <= 0}
              >
                <ArrowRightLeft className="w-5 h-5 mr-2" />
                전환하기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}