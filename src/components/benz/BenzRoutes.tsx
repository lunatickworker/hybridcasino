import { memo, lazy, Suspense } from "react";

// Benz 페이지 컴포넌트 (lazy loading)
const BenzMain = lazy(() => import("./BenzMain").then(m => ({ default: m.BenzMain })));
const BenzDeposit = lazy(() => import("./BenzDeposit").then(m => ({ default: m.BenzDeposit })));
const BenzWithdraw = lazy(() => import("./BenzWithdraw").then(m => ({ default: m.BenzWithdraw })));
const BenzCasino = lazy(() => import("./BenzCasino").then(m => ({ default: m.BenzCasino })));
const BenzSlot = lazy(() => import("./BenzSlot").then(m => ({ default: m.BenzSlot })));
const BenzMinigame = lazy(() => import("./BenzMinigame").then(m => ({ default: m.BenzMinigame })));
const BenzNotice = lazy(() => import("./BenzNotice").then(m => ({ default: m.BenzNotice })));
const BenzSupport = lazy(() => import("./BenzSupport").then(m => ({ default: m.BenzSupport })));

// User 컴포넌트 재사용 (기능 동일)
const UserProfile = lazy(() => import("../user/UserProfile").then(m => ({ default: m.UserProfile })));
const UserBettingHistory = lazy(() => import("../user/UserBettingHistory").then(m => ({ default: m.UserBettingHistory })));

interface BenzRoutesProps {
  currentRoute: string;
  user: any;
  onRouteChange: (route: string) => void;
}

const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
  </div>
);

export const BenzRoutes = memo(({ currentRoute, user, onRouteChange }: BenzRoutesProps) => {
  const renderRoute = () => {
    switch (currentRoute) {
      case '/benz':
      case '/benz/featured':
        return <BenzMain user={user} onRouteChange={onRouteChange} />;
      case '/benz/casino':
        return <BenzCasino user={user} onRouteChange={onRouteChange} />;
      case '/benz/slot':
        return <BenzSlot user={user} onRouteChange={onRouteChange} />;
      case '/benz/minigame':
        return <BenzMinigame user={user} onRouteChange={onRouteChange} />;
      case '/benz/deposit':
        return <BenzDeposit user={user} onRouteChange={onRouteChange} />;
      case '/benz/withdraw':
        return <BenzWithdraw user={user} onRouteChange={onRouteChange} />;
      case '/benz/notice':
        return <BenzNotice user={user} onRouteChange={onRouteChange} />;
      case '/benz/support':
        return <BenzSupport user={user} onRouteChange={onRouteChange} />;
      case '/benz/profile':
        return <UserProfile user={user} onRouteChange={onRouteChange} />;
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