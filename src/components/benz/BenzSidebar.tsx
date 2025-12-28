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
}

// ⭐ /benz는 필터링 없이 모든 게임 메뉴 표시 (partner_game_access 체크 안 함)
const menuItems = [
  { path: '/benz/casino', label: '카지노', icon: Gamepad2 },
  { path: '/benz/slot', label: '슬롯', icon: Coins },
  { path: '/benz/notice', label: '공지사항', icon: Bell },
  { path: '/benz/support', label: '고객센터', icon: MessageSquare },
];

const userMenuItems = [
  { path: '/benz/deposit', label: '입금신청', icon: CreditCard },
  { path: '/benz/withdraw', label: '출금신청', icon: ArrowUpDown },
  { path: '/benz/profile', label: '내 정보', icon: User },
];

export function BenzSidebar({ user, currentRoute, onRouteChange }: BenzSidebarProps) {
  const [showLoginMessage, setShowLoginMessage] = useState(false);

  const handleMenuClick = (path: string) => {
    // 로그인이 필요한 메뉴 체크
    const requiresLogin = [
      '/benz/deposit', 
      '/benz/withdraw', 
      '/benz/profile',
      '/benz/casino',
      '/benz/slot',
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
            className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[120]"
          >
            <div className="relative px-10 py-5" style={{ backgroundColor: '#000000', border: '4px solid #444444' }}>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse"></div>
                <p className="font-bold text-lg text-white">로그인이 필요한 서비스입니다</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className="hidden md:block fixed left-0 top-20 h-[calc(100vh-5rem)] w-80 z-40 overflow-y-auto" style={{ 
        fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        background: 'linear-gradient(180deg, rgba(20, 20, 30, 0.98) 0%, rgba(15, 15, 25, 0.98) 100%)',
        borderRight: '2px solid rgba(193, 154, 107, 0.2)',
        boxShadow: '4px 0 20px rgba(0, 0, 0, 0.5)'
      }}>
        <div className="p-4 space-y-6" style={{ marginTop: '40px' }}>
          {/* Logo - 삭제 */}

          {/* Main Menu */}
          <div>
            <nav className="space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleMenuClick(item.path)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg transition-all duration-300 group relative overflow-hidden ${ 
                      isActive 
                        ? 'scale-105' 
                        : 'hover:scale-105'
                    }`}
                    style={{
                      background: isActive 
                        ? 'linear-gradient(135deg, rgba(193, 154, 107, 0.25) 0%, rgba(166, 124, 82, 0.15) 100%)'
                        : 'transparent',
                      border: isActive
                        ? '1px solid rgba(193, 154, 107, 0.4)'
                        : '1px solid transparent',
                      boxShadow: isActive 
                        ? '0 4px 15px rgba(193, 154, 107, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        : 'none'
                    }}
                  >
                    {/* 호버 배경 효과 */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, rgba(166, 124, 82, 0.08) 100%)'
                      }}
                    ></div>
                    
                    {/* 왼쪽 골드 라인 */}
                    <div 
                      className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      style={{
                        background: 'linear-gradient(180deg, #C19A6B 0%, #A67C52 100%)',
                        boxShadow: '0 0 10px rgba(193, 154, 107, 0.5)'
                      }}
                    ></div>

                    <Icon 
                      className="w-6 h-6 relative z-10 transition-all duration-300"
                      style={{
                        color: isActive ? '#E6C9A8' : '#9CA3AF',
                        filter: isActive 
                          ? 'drop-shadow(0 0 6px rgba(193, 154, 107, 0.6))'
                          : 'none'
                      }}
                    />
                    <span 
                      className="relative z-10 font-bold tracking-wide transition-all duration-300"
                      style={{
                        fontSize: '1.5rem',
                        color: isActive ? '#E6C9A8' : '#D1D5DB',
                        textShadow: isActive 
                          ? '0 2px 8px rgba(193, 154, 107, 0.4)'
                          : 'none'
                      }}
                    >
                      {item.label}
                    </span>

                    {/* 호버 글로우 */}
                    <div 
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20 blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-300"
                      style={{
                        background: 'radial-gradient(circle, rgba(193, 154, 107, 0.4) 0%, transparent 70%)'
                      }}
                    ></div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* User Menu */}
          <div>
            <h3 
              className="font-bold uppercase mb-3 px-4 tracking-wider"
              style={{
                fontSize: '1.1rem',
                color: '#A67C52',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)'
              }}
            >
              회원
            </h3>
            <nav className="space-y-2">
              {userMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleMenuClick(item.path)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg transition-all duration-300 group relative overflow-hidden ${ 
                      isActive 
                        ? 'scale-105' 
                        : 'hover:scale-105'
                    }`}
                    style={{
                      background: isActive 
                        ? 'linear-gradient(135deg, rgba(193, 154, 107, 0.25) 0%, rgba(166, 124, 82, 0.15) 100%)'
                        : 'transparent',
                      border: isActive
                        ? '1px solid rgba(193, 154, 107, 0.4)'
                        : '1px solid transparent',
                      boxShadow: isActive 
                        ? '0 4px 15px rgba(193, 154, 107, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        : 'none'
                    }}
                  >
                    {/* 호버 배경 효과 */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, rgba(166, 124, 82, 0.08) 100%)'
                      }}
                    ></div>
                    
                    {/* 왼쪽 골드 라인 */}
                    <div 
                      className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      style={{
                        background: 'linear-gradient(180deg, #C19A6B 0%, #A67C52 100%)',
                        boxShadow: '0 0 10px rgba(193, 154, 107, 0.5)'
                      }}
                    ></div>

                    <Icon 
                      className="w-6 h-6 relative z-10 transition-all duration-300"
                      style={{
                        color: isActive ? '#E6C9A8' : '#9CA3AF',
                        filter: isActive 
                          ? 'drop-shadow(0 0 6px rgba(193, 154, 107, 0.6))'
                          : 'none'
                      }}
                    />
                    <span 
                      className="relative z-10 font-bold tracking-wide transition-all duration-300"
                      style={{
                        fontSize: '1.5rem',
                        color: isActive ? '#E6C9A8' : '#D1D5DB',
                        textShadow: isActive 
                          ? '0 2px 8px rgba(193, 154, 107, 0.4)'
                          : 'none'
                      }}
                    >
                      {item.label}
                    </span>

                    {/* 호버 글로우 */}
                    <div 
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20 blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-300"
                      style={{
                        background: 'radial-gradient(circle, rgba(193, 154, 107, 0.4) 0%, transparent 70%)'
                      }}
                    ></div>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}