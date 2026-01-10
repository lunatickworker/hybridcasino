import { useState, useEffect, useMemo } from "react";
import { Button } from "../../ui/button";
import { List, Store, User as UserIcon } from "lucide-react";
import { Partner } from "../../../types";
import { GameProvider, Game } from "../../../lib/gameApi";
import { useLanguage } from "../../../contexts/LanguageContext";

// 탭 컴포넌트 import
import { GamesTab } from "./GamesTab";
import { StoresTab } from "./StoresTab";
import { UsersTab } from "./UsersTab";

// 타입 import
import type { TabType } from "../game-management/types";

interface EnhancedGameManagementProps {
  user: Partner;
}

export function EnhancedGameManagement({ user }: EnhancedGameManagementProps) {
  const { t } = useLanguage();
  
  // 탭 상태
  const [activeTab, setActiveTab] = useState<TabType>("games");

  // 권한별 사용 가능한 탭 결정
  const availableTabs = useMemo(() => {
    const tabs: TabType[] = [];
    
    if (user.level === 1) {
      // Lv1: 게임 관리만
      tabs.push("games");
    } else if (user.level === 2) {
      // Lv2: 매장 게임 관리 + 사용자 게임 관리
      tabs.push("stores", "users");
    } else if (user.level === 6) {
      // Lv6: 매장별 게임 + 사용자별 게임 (Lv7 사용자 선택)
      tabs.push("stores", "users");
    }
    // Lv3~Lv5, Lv7은 빈 배열
    
    return tabs;
  }, [user.level]);

  // 권한에 따라 초기 탭 설정
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [availableTabs, activeTab]);

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      {availableTabs.length > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-700">
          {availableTabs.includes("games") && (
            <Button
              variant="ghost"
              onClick={() => setActiveTab("games")}
              className={`rounded-none border-b-2 transition-colors px-6 py-3 text-base font-bold ${
                activeTab === "games"
                  ? "border-purple-500 bg-purple-900/20 text-white"
                  : "border-transparent text-white hover:bg-slate-800/50"
              }`}
            >
              <List className="w-4 h-4 mr-2" />
              게임 관리
            </Button>
          )}
          {availableTabs.includes("stores") && (
            <Button
              variant="ghost"
              onClick={() => setActiveTab("stores")}
              className={`rounded-none border-b-2 transition-colors px-6 py-3 text-base font-bold ${
                activeTab === "stores"
                  ? "border-purple-500 bg-purple-900/20 text-white"
                  : "border-transparent text-white hover:bg-slate-800/50"
              }`}
            >
              <Store className="w-4 h-4 mr-2" />
              매장 게임 관리
            </Button>
          )}
          {availableTabs.includes("users") && (
            <Button
              variant="ghost"
              onClick={() => setActiveTab("users")}
              className={`rounded-none border-b-2 transition-colors px-6 py-3 text-base font-bold ${
                activeTab === "users"
                  ? "border-purple-500 bg-purple-900/20 text-white"
                  : "border-transparent text-white hover:bg-slate-800/50"
              }`}
            >
              <UserIcon className="w-4 h-4 mr-2" />
              사용자 게임 관리
            </Button>
          )}
        </div>
      )}

      {/* 탭 컨텐츠 */}
      {activeTab === "games" && <GamesTab user={user} />}
      {activeTab === "stores" && <StoresTab user={user} />}
      {activeTab === "users" && <UsersTab user={user} />}
    </div>
  );
}
