import { Button } from "../ui/button";
import { 
  Gift, 
  Star, 
  Gamepad2, 
  Bell, 
  MessageSquare,
  CreditCard,
  ArrowUpDown,
  User,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  History,
  Menu
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

interface BenzSidebarProps {
  user: any;
  currentRoute: string;
  onRouteChange: (route: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

// ⭐ /benz는 필터링 없이 모든 게임 메뉴 표시 (partner_game_access 체크 안 함)
const menuItems = [
  { path: '/benz', label: '보너스 혜택', icon: Gift },
  { path: '/benz/featured', label: '추천게임', icon: Star },
  { path: '/benz/casino', label: '카지노', icon: Gamepad2 },
  { path: '/benz/slot', label: '슬롯', icon: Coins },
  { path: '/benz/minigame', label: '미니게임', icon: Crown },
  { path: '/benz/notice', label: '공지사항', icon: Bell },
  { path: '/benz/support', label: '고객센터', icon: MessageSquare },
];

const userMenuItems = [
  { path: '/benz/deposit', label: '입금신청', icon: CreditCard },
  { path: '/benz/withdraw', label: '출금신청', icon: ArrowUpDown },
  { path: '/benz/betting-history', label: '베팅내역', icon: History },
  { path: '/benz/profile', label: '내 정보', icon: User },
];

export function BenzSidebar({ user, currentRoute, onRouteChange, isOpen, onToggle }: BenzSidebarProps) {
  const [showLoginMessage, setShowLoginMessage] = useState(false);

  const handleMenuClick = (path: string) => {
    // 로그인이 필요한 메뉴 체크
    const requiresLogin = [
      '/benz/deposit', 
      '/benz/withdraw', 
      '/benz/betting-history', 
      '/benz/profile',
      '/benz/casino',
      '/benz/slot',
      '/benz/minigame',
      '/benz/support',
      '/benz/notice'
    ];
    
    if (requiresLogin.includes(path) && !user) {
      // 로그인 필요 메시지 표시
      setShowLoginMessage(true);
      setTimeout(() => setShowLoginMessage(false), 3000);
      return;
    }
    
    // 정상 라우팅
    onRouteChange(path);
  };

  return (
    <>
      {/* 로그인 필요 메시지 - 네온사인 스타일 */}
      <AnimatePresence>
        {showLoginMessage && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[100]"
          >
            <div className="relative bg-[#0a0e27]/95 backdrop-blur-sm border-2 px-10 py-5 shadow-2xl" style={{
              borderColor: 'rgba(168, 85, 247, 0.4)',
              boxShadow: '0 0 30px rgba(168, 85, 247, 0.3), 0 0 60px rgba(236, 72, 153, 0.2), inset 0 0 20px rgba(168, 85, 247, 0.1)'
            }}>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full animate-pulse" style={{
                  background: 'radial-gradient(circle, rgba(168, 85, 247, 1) 0%, rgba(168, 85, 247, 0.4) 70%)',
                  boxShadow: '0 0 10px rgba(168, 85, 247, 0.8), 0 0 20px rgba(168, 85, 247, 0.5)'
                }}></div>
                <p className="font-bold text-lg" style={{
                  color: '#e0d5ff',
                  textShadow: '0 0 10px rgba(168, 85, 247, 0.6), 0 0 20px rgba(236, 72, 153, 0.4), 0 0 30px rgba(168, 85, 247, 0.3)',
                  letterSpacing: '0.5px'
                }}>로그인이 필요한 서비스입니다</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`hidden md:block fixed left-0 top-20 h-[calc(100vh-5rem)] bg-[#0f1433] border-r border-purple-900/30 transition-all duration-300 z-40 ${isOpen ? 'w-64' : 'w-0'} overflow-hidden`} style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
        {/* Close Button - 메뉴 카드 우측 상단 */}
        {isOpen && (
          <div className="absolute top-4 right-4 z-50">
            <button
              onClick={onToggle}
              className="bg-[#1a1f4a] hover:bg-[#232a5c] text-gray-400 hover:text-white p-2 border border-purple-900/30 hover:border-purple-700/50 shadow-sm transition-all duration-300"
              title="사이드바 닫기"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="p-4 space-y-6 pt-8">
          {/* Main Menu */}
          <div>
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.path;
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    onClick={() => handleMenuClick(item.path)}
                    className={`w-full justify-start gap-3 h-12 text-lg transition-all duration-300 ${ 
                      isActive 
                        ? 'text-[#FF6B35] font-bold scale-105' 
                        : 'text-gray-400 hover:text-white hover:bg-purple-900/30 hover:scale-105'
                    }`}
                  >
                    <Icon className={`w-6 h-6 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`} />
                    <span className="transition-all duration-300">{item.label}</span>
                  </Button>
                );
              })}
            </nav>
          </div>

          {/* User Menu */}
          <div>
            <h3 className="text-base font-semibold text-gray-400 uppercase mb-3 px-2">회원</h3>
            <nav className="space-y-1">
              {userMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.path;
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    onClick={() => handleMenuClick(item.path)}
                    className={`w-full justify-start gap-3 h-12 text-lg transition-all duration-300 ${ 
                      isActive 
                        ? 'text-[#FF6B35] font-bold scale-105' 
                        : 'text-gray-400 hover:text-white hover:bg-purple-900/30 hover:scale-105'
                    }`}
                  >
                    <Icon className={`w-6 h-6 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`} />
                    <span className="transition-all duration-300">{item.label}</span>
                  </Button>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>

      {/* Toggle Button - 사이드바가 닫혀있을 때만 표시 - Desktop only */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="hidden md:block fixed top-1/2 -translate-y-1/2 left-0 z-50 transition-all duration-300 bg-[#0f1433] hover:bg-[#1a1f4a] text-gray-400 hover:text-white border border-purple-900/30 hover:border-purple-700/50 px-2 py-6 rounded-r-lg shadow-sm"
          title="사이드바 열기"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </>
  );
}