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

interface IndoSidebarProps {
  currentRoute: string;
  onRouteChange: (route: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const menuItems = [
  { path: '/indo', label: '보너스 혜택', icon: Gift },
  { path: '/indo/featured', label: '추천게임', icon: Star },
  { path: '/indo/casino', label: '카지노', icon: Gamepad2 },
  { path: '/indo/slot', label: '슬롯', icon: Coins },
  { path: '/indo/minigame', label: '미니게임', icon: Crown },
  { path: '/indo/notice', label: '공지사항', icon: Bell },
  { path: '/indo/support', label: '고객센터', icon: MessageSquare },
];

const userMenuItems = [
  { path: '/indo/deposit', label: '입금신청', icon: CreditCard },
  { path: '/indo/withdraw', label: '출금신청', icon: ArrowUpDown },
  { path: '/indo/betting-history', label: '베팅내역', icon: History },
  { path: '/indo/profile', label: '내 정보', icon: User },
];

export function IndoSidebar({ currentRoute, onRouteChange, isOpen, onToggle }: IndoSidebarProps) {
  return (
    <>
      {/* Sidebar */}
      <aside className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-[#0f1433] border-r border-purple-900/30 transition-all duration-300 z-40 ${isOpen ? 'w-64' : 'w-0'} overflow-hidden`}>
        <div className="p-4 space-y-6">
          {/* Main Menu */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3 px-2">메뉴</h3>
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.path;
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    onClick={() => onRouteChange(item.path)}
                    className={`w-full justify-start gap-3 ${
                      isActive 
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white mr-3 rounded-lg' 
                        : 'text-gray-300 hover:text-white hover:bg-purple-900/30'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </nav>
          </div>

          {/* User Menu */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3 px-2">회원</h3>
            <nav className="space-y-1">
              {userMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.path;
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    onClick={() => onRouteChange(item.path)}
                    className={`w-full justify-start gap-3 ${
                      isActive 
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white mr-3 rounded-lg' 
                        : 'text-gray-300 hover:text-white hover:bg-purple-900/30'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
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
        className={`fixed top-20 ${isOpen ? 'left-64' : 'left-0'} z-50 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-r-lg transition-all duration-300`}
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </>
  );
}