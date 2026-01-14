import { useState, useEffect } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { BettingHistorySync } from "./BettingHistorySync";
import { BalanceSyncManager } from "./BalanceSyncManager";
import { Lv2AutoSync } from "./Lv2AutoSync";
import { AdminGameRecordsSync } from "./AdminGameRecordsSync";
import { useAuth } from "../../contexts/AuthContext";
import { useWebSocketContext } from "../../contexts/WebSocketContext";
import { Partner } from "../../types";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";

interface AdminLayoutProps {
  children: React.ReactNode;
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export function AdminLayout({ children, currentRoute, onNavigate }: AdminLayoutProps) {
  const { authState } = useAuth();
  const { connected } = useWebSocketContext();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('admin-sidebar-open');
    console.log('🔍 사이드바 초기 상태:', saved);
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    console.log('💾 사이드바 상태 저장:', sidebarOpen);
    localStorage.setItem('admin-sidebar-open', JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  if (!authState.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a]">
        <div className="text-center space-y-4">
          <div className="loading-premium mx-auto"></div>
          <p className="text-slate-300">로딩 중...</p>
        </div>
      </div>
    );
  }

  const user = authState.user as Partner;

  return (
    <>
      {/* ✅ 새 정책: Lv1만 balance 동기화, Lv2만 베팅내역 동기화 */}
      {user.level === 1 && (
        <BalanceSyncManager user={user} />
      )}
      
      {/* ✅ Lv1, Lv2만 베팅내역 동기화 (시스템관리자, 대본사) - active 세션 있을 때만 */}
      {/* ✅ 거래 기록 동기화 */}
      {(user.level === 1 || user.level === 2) && (
        <BettingHistorySync user={user} />
      )}
      
      {/* ✅ Lv2만 자동 동기화 */}
      {user.level === 2 && (
        <Lv2AutoSync user={user} />
      )}

      {/* ✅ 자동 게임 기록 동기화 */}
      {<AdminGameRecordsSync user={user} />}
      
      <div className="h-screen flex w-full overflow-hidden bg-[#0a0e1a] min-w-[1200px]">
        <div className={cn(
          "fixed left-0 top-0 h-screen transition-all duration-300 z-40",
          "backdrop-blur-xl border-r border-slate-700/50 shadow-xl",
          sidebarOpen ? "w-80" : "w-16"
        )}>
          <AdminSidebar 
            user={user}
            onNavigate={onNavigate}
            currentRoute={currentRoute}
            className="h-full"
          />
        </div>
        
        <div className={cn(
          "flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300",
          sidebarOpen ? "ml-80" : "ml-16"
        )}>
          <header className="sticky top-0 z-30 bg-[#0f1419]/90 backdrop-blur-lg border-b border-slate-700/50 shadow-sm">
            <AdminHeader 
              user={user}
              wsConnected={connected}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              onRouteChange={onNavigate}
              currentRoute={currentRoute}
            />
          </header>
          
          <main className="flex-1 p-6 overflow-y-auto bg-[#0a0e1a] admin-scrollbar">
            <div className="max-w-[2400px] mx-auto space-y-6 min-w-[1000px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

export default AdminLayout;