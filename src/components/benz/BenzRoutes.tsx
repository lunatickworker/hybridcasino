import { lazy, Suspense, memo } from "react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { BenzMain } from "./BenzMain";
import { BenzCasino } from "./BenzCasino";
import { BenzSlot } from "./BenzSlot";
import { BenzMinigame } from "./BenzMinigame";
import { BenzDeposit } from "./BenzDeposit";
import { BenzWithdraw } from "./BenzWithdraw";
import { BenzNotice } from "./BenzNotice";
import { BenzSupport } from "./BenzSupport";
import { BenzProfile } from "./BenzProfile";
import { BenzPoint } from "./BenzPoint";

// User 컴포넌트 재사용 (기능 동일)
const UserBettingHistory = lazy(() => import("../user/UserBettingHistory").then(m => ({ default: m.UserBettingHistory })));

interface BenzRoutesProps {
  currentRoute: string;
  user: any;
  onRouteChange: (route: string) => void;
  onOpenPointModal?: () => void; // ⭐ 포인트 모달 열기 함수 추가
  refreshFlag?: boolean; // ✅ 리플레시 플래그
}

const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8">
    <LoadingSpinner />
  </div>
);

export const BenzRoutes = memo(({ currentRoute, user, onRouteChange, onOpenPointModal, refreshFlag }: BenzRoutesProps) => {
  console.log('🔄 [BenzRoutes] 렌더링:', { currentRoute, userExists: !!user, refreshFlag });
  
  const renderRoute = () => {
    console.log('📍 [BenzRoutes] 라우트 매칭:', { currentRoute });
    switch (currentRoute) {
      case '/benz':
      case '/benz/featured':
        return <BenzMain user={user} onRouteChange={onRouteChange} />;
      case '/benz/casino':
        return <BenzCasino user={user} onRouteChange={onRouteChange} refreshFlag={refreshFlag} />;
      case '/benz/slot':
        return <BenzSlot user={user} onRouteChange={onRouteChange} refreshFlag={refreshFlag} />;
      case '/benz/minigame':
        return <BenzMinigame user={user} onRouteChange={onRouteChange} />;
      case '/benz/deposit':
        return <BenzDeposit user={user} onRouteChange={onRouteChange} />;
      case '/benz/withdraw':
        return <BenzWithdraw user={user} onRouteChange={onRouteChange} />;
      case '/benz/notice':
        return <BenzNotice user={user} onRouteChange={onRouteChange} />;
      case '/benz/point':
        return <BenzPoint user={user} onRouteChange={onRouteChange} onOpenPointModal={onOpenPointModal} />;
      case '/benz/support':
        return <BenzSupport user={user} onRouteChange={onRouteChange} />;
      case '/benz/profile':
        return <BenzProfile user={user} onRouteChange={onRouteChange} onOpenPointModal={onOpenPointModal} />;
      case '/benz/betting-history':
        return <UserBettingHistory user={user} />;
      default:
        return <BenzMain user={user} onRouteChange={onRouteChange} />;
    }
  };

  return (
    <Suspense fallback={<LoadingFallback />}>
      {renderRoute()}
    </Suspense>
  );
});

BenzRoutes.displayName = 'BenzRoutes';