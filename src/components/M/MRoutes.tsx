import { Sample1Casino } from "./MCasino";
import { Sample1Slot } from "./MSlot";
import { Sample1MiniGame } from "./MMiniGame";
import { UserDeposit } from "../user/UserDeposit";
import { UserWithdraw } from "../user/UserWithdraw";
import { UserProfile } from "../user/UserProfile";
import { UserBettingHistory } from "../user/UserBettingHistory";
import { UserNotice } from "../user/UserNotice";
import { UserSupport } from "../user/UserSupport";

interface MRoutesProps {
  currentRoute: string;
  user: any;
  onRouteChange: (route: string) => void;
}

export function MRoutes({ currentRoute, user, onRouteChange }: MRoutesProps) {
  // 기본 라우트: /m/casino
  if (currentRoute === '/m' || currentRoute === '/m/') {
    return <Sample1Casino user={user} />;
  }

  switch (currentRoute) {
    case '/m/casino':
      return <Sample1Casino user={user} />;
    
    case '/m/slot':
      return <Sample1Slot user={user} />;
    
    case '/m/minigame':
      return <Sample1MiniGame user={user} />;
    
    case '/m/deposit':
      return <UserDeposit user={user} />;
    
    case '/m/withdraw':
      return <UserWithdraw user={user} />;
    
    case '/m/profile':
      return <UserProfile user={user} onRouteChange={onRouteChange} />;
    
    case '/m/betting-history':
      return <UserBettingHistory user={user} />;
    
    case '/m/notice':
      return <UserNotice user={user} />;
    
    case '/m/support':
      return <UserSupport user={user} />;
    
    default:
      return <Sample1Casino user={user} />;
  }
}
