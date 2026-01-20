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
  Menu,
  Mail
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { ImageWithFallback } from "@figma/ImageWithFallback";

interface BenzSidebarProps {
  user: any;
  currentRoute: string;
  onRouteChange: (route: string) => void;
}

// ⭐ /benz는 필터링 없이 모든 게임 메뉴 표시 (partner_game_access 체크 안 함)
const menuItems = [
  { path: '/benz/casino', label: '카지노', icon: Gamepad2 },
  { path: '/benz/slot', label: '슬롯', icon: Coins },
];

const userMenuItems = [
  { path: '/benz/deposit', label: '입금', icon: CreditCard },
  { path: '/benz/withdraw', label: '출금', icon: ArrowUpDown },
  { path: '/benz/notice', label: '공지사항', icon: Bell },
  { path: '/benz/point', label: '포인트', icon: Gift },
  { path: '/benz/support', label: '쪽지관리', icon: Mail },
  { path: '/benz/profile', label: '회원정보수정', icon: User },
];

export function BenzSidebar({ user, currentRoute, onRouteChange }: BenzSidebarProps) {
  const [showLoginMessage, setShowLoginMessage] = useState(false);

  const handleMenuClick = (path: string) => {
    console.log('🔘 [BenzSidebar] 메뉴 클릭:', { path, userExists: !!user });
    
    // 로그인이 필요한 메뉴 체크
    const requiresLogin = [
      '/benz/deposit', 
      '/benz/withdraw', 
      '/benz/profile',
      '/benz/casino',
      '/benz/slot',
      '/benz/notice',
      '/benz/point',
      '/benz/support'
    ];
    
    if (requiresLogin.includes(path) && !user) {
      console.log('❌ [BenzSidebar] 로그인 필요:', path);
      // 로그인 필요 메시지 표시
      setShowLoginMessage(true);
      setTimeout(() => setShowLoginMessage(false), 3000);
      return;
    }
    
    console.log('✅ [BenzSidebar] 라우팅 호출:', { path, method: 'onRouteChange' });
    // 정상 라우팅 (페이지 새로고침 제거 - 각 페이지 컴포넌트에서 데이터 로드)
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
        background: 'linear-gradient(180deg, #1a1a1a 0%, #131313 100%)',
        borderRight: '4px solid rgba(193, 154, 107, 0.2)',
        boxShadow: '4px 0 20px rgba(0, 0, 0, 0.5)'
      }}>
        <div className="flex flex-col h-full">
          <div className="p-4 space-y-6" style={{ marginTop: '25px' }}>
            {/* Logo */}
            <div className="flex justify-center mb-6" style={{ marginTop: '2px' }}>
              <button 
                onClick={() => onRouteChange('/benz')}
                className="w-full flex justify-center cursor-pointer"
              >
                <ImageWithFallback
                  src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/main%20logo.png"
                  alt="BENZ CASINO"
                  className="h-auto object-contain px-4"
                  style={{ width: '80%' }}
                />
              </button>
            </div>

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
                        border: '1px solid transparent',
                        boxShadow: isActive 
                          ? '0 4px 15px rgba(193, 154, 107, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                          : 'none'
                      }}
                    >
                      {/* 기본 배경 이미지 */}
                      <div 
                        className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-0"
                        style={{
                          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Menu-bg.png)',
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          opacity: isActive ? 0 : 1
                        }}
                      ></div>

                      {/* hover 배경 이미지 */}
                      <div 
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Menu.png)',
                          backgroundSize: '100% 100%',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          opacity: isActive ? 1 : undefined
                        }}
                      ></div>

                      {/* 아이콘 */}
                      <Icon 
                        className="relative z-10 transition-all duration-300" 
                        style={{ 
                          width: '24px', 
                          height: '24px',
                          color: '#C19A6B',
                          filter: 'drop-shadow(0 2px 4px rgba(193, 154, 107, 0.3))'
                        }} 
                      />

                      <span 
                        className="relative z-10 font-bold tracking-wide transition-all duration-300"
                        style={{
                          fontSize: '20px',
                          color: '#888773',
                          textShadow: 'none',
                          fontFamily: 'AsiHead, Arial, sans-serif'
                        }}
                      >
                        {item.label}
                      </span>

                      {/* 호버 글로우 */}
                      <div 
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20 blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-300 pointer-events-none"
                        style={{
                          background: 'radial-gradient(circle, rgba(193, 154, 107, 0.4) 0%, transparent 70%)'
                        }}
                      ></div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* User Menu - 버튼 하나의 공간만큼 간격 추가 */}
            <div style={{ marginTop: '60px' }}>
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
                        border: '1px solid transparent',
                        boxShadow: isActive 
                          ? '0 4px 15px rgba(193, 154, 107, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                          : 'none'
                      }}
                    >
                      {/* 기본 배경 이미지 */}
                      <div 
                        className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-0"
                        style={{
                          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Menu-bg.png)',
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          opacity: isActive ? 0 : 1
                        }}
                      ></div>

                      {/* hover 배경 이미지 */}
                      <div 
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Menu.png)',
                          backgroundSize: '100% 100%',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          opacity: isActive ? 1 : undefined
                        }}
                      ></div>

                      {/* 아이콘 */}
                      <Icon 
                        className="relative z-10 transition-all duration-300" 
                        style={{ 
                          width: '24px', 
                          height: '24px',
                          color: '#C19A6B',
                          filter: 'drop-shadow(0 2px 4px rgba(193, 154, 107, 0.3))'
                        }} 
                      />

                      <span 
                        className="relative z-10 font-bold tracking-wide transition-all duration-300"
                        style={{
                          fontSize: '20px',
                          color: '#888773',
                          textShadow: 'none',
                          fontFamily: 'AsiHead, Arial, sans-serif'
                        }}
                      >
                        {item.label}
                      </span>

                      {/* 호버 글로우 */}
                      <div 
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20 blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-300 pointer-events-none"
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
          
          {/* 하단 관리자 페이지 링크 (텍스트 없이 클릭 영역만) */}
          <div 
            className="mt-auto p-3 flex-shrink-0 cursor-pointer"
            onClick={() => window.location.href = '#/admin'}
            title="임시: 관리자 페이지로 이동"
          >
          </div>
        </div>
      </aside>
    </>
  );
}