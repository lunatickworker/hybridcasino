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
  History
} from "lucide-react";

interface BenzSidebarProps {
  currentRoute: string;
  onRouteChange: (route: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

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

export function BenzSidebar({ currentRoute, onRouteChange, isOpen, onToggle }: BenzSidebarProps) {
  return (
    <>
      {/* Sidebar */}
      <aside className={`fixed left-0 top-20 h-[calc(100vh-5rem)] bg-[#0f1433] border-r border-purple-900/30 transition-all duration-300 z-40 ${isOpen ? 'w-64' : 'w-0'} overflow-hidden`} style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
        <div className="p-4 space-y-6">
          {/* Main Menu */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3 px-2">메뉴</h3>
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.path;
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    onClick={() => onRouteChange(item.path)}
                    className={`w-full justify-start gap-3 h-12 text-base ${ 
                      isActive 
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white mr-3 rounded-lg' 
                        : 'text-gray-300 hover:text-white hover:bg-purple-900/30'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </nav>
          </div>

          {/* User Menu */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3 px-2">회원</h3>
            <nav className="space-y-1">
              {userMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.path;
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    onClick={() => onRouteChange(item.path)}
                    className={`w-full justify-start gap-3 h-12 text-base ${ 
                      isActive 
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white mr-3 rounded-lg' 
                        : 'text-gray-300 hover:text-white hover:bg-purple-900/30'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={`fixed top-24 ${isOpen ? 'left-64' : 'left-0'} z-50 bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-r-lg transition-all duration-300`}
      >
        {isOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      </button>
    </>
  );
}