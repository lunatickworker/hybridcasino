import { memo, lazy, Suspense } from "react";

// Indo 페이지 컴포넌트 (lazy loading)
const IndoMain = lazy(() => import("./IndoMain").then(m => ({ default: m.IndoMain })));

// User 컴포넌트 재사용 (기능 동일)
const UserCasino = lazy(() => import("../user/UserCasino").then(m => ({ default: m.UserCasino })));
const UserSlot = lazy(() => import("../user/UserSlot").then(m => ({ default: m.UserSlot })));
const UserMiniGame = lazy(() => import("../user/UserMiniGame").then(m => ({ default: m.UserMiniGame })));
const UserDeposit = lazy(() => import("../user/UserDeposit").then(m => ({ default: m.UserDeposit })));
const UserWithdraw = lazy(() => import("../user/UserWithdraw").then(m => ({ default: m.UserWithdraw })));
const UserNotice = lazy(() => import("../user/UserNotice").then(m => ({ default: m.UserNotice })));
const UserSupport = lazy(() => import("../user/UserSupport").then(m => ({ default: m.UserSupport })));
const UserProfile = lazy(() => import("../user/UserProfile").then(m => ({ default: m.UserProfile })));
const UserBettingHistory = lazy(() => import("../user/UserBettingHistory").then(m => ({ default: m.UserBettingHistory })));

interface IndoRoutesProps {
  currentRoute: string;
  user: any;
  onRouteChange: (route: string) => void;
}

const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
  </div>
);

export const IndoRoutes = memo(({ currentRoute, user, onRouteChange }: IndoRoutesProps) => {
  const renderRoute = () => {
    switch (currentRoute) {
      case '/indo':
      case '/indo/featured':
        return <IndoMain user={user} onRouteChange={onRouteChange} />;
      case '/indo/casino':
        return <UserCasino user={user} onRouteChange={onRouteChange} />;
      case '/indo/slot':
        return <UserSlot user={user} onRouteChange={onRouteChange} />;
      case '/indo/minigame':
        return <UserMiniGame user={user} onRouteChange={onRouteChange} />;
      case '/indo/deposit':
        return <UserDeposit user={user} onRouteChange={onRouteChange} />;
      case '/indo/withdraw':
        return <UserWithdraw user={user} onRouteChange={onRouteChange} />;
      case '/indo/notice':
        return <UserNotice user={user} onRouteChange={onRouteChange} />;
      case '/indo/support':
        return <UserSupport user={user} onRouteChange={onRouteChange} />;
      case '/indo/profile':
        return <UserProfile user={user} onRouteChange={onRouteChange} />;
      case '/indo/betting-history':
        return <UserBettingHistory user={user} />;
      default:
        return <IndoMain user={user} onRouteChange={onRouteChange} />;
    }
  };

  return (
    <Suspense fallback={<LoadingFallback />}>
      {renderRoute()}
    </Suspense>
  );
});

IndoRoutes.displayName = 'IndoRoutes';
