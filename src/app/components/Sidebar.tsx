import { LayoutDashboard, Users, ShoppingCart, BarChart3, Settings, Package } from 'lucide-react';

export function Sidebar() {
  const menuItems = [
    { icon: LayoutDashboard, label: '대시보드', active: true },
    { icon: Users, label: '사용자', active: false },
    { icon: ShoppingCart, label: '주문', active: false },
    { icon: Package, label: '제품', active: false },
    { icon: BarChart3, label: '통계', active: false },
    { icon: Settings, label: '설정', active: false },
  ];

  return (
    <div className="w-64 bg-gray-900 text-white h-screen fixed left-0 top-0">
      <div className="p-6">
        <h1 className="text-2xl font-bold">Admin</h1>
      </div>
      <nav className="mt-6">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <a
              key={index}
              href="#"
              className={`flex items-center px-6 py-3 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors ${
                item.active ? 'bg-gray-800 text-white border-l-4 border-blue-500' : ''
              }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
