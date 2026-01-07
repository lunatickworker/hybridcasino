import { Sample1Casino } from "./Sample1Casino";
import { Sample1Slot } from "./Sample1Slot";
import { Sample1MiniGame } from "./Sample1MiniGame";
import { UserDeposit } from "../user/UserDeposit";
import { UserWithdraw } from "../user/UserWithdraw";
import { UserProfile } from "../user/UserProfile";
import { UserBettingHistory } from "../user/UserBettingHistory";
import { UserNotice } from "../user/UserNotice";
import { UserSupport } from "../user/UserSupport";

interface Sample1RoutesProps {
  currentRoute: string;
  user: any;
  onRouteChange: (route: string) => void;
}

export function Sample1Routes({ currentRoute, user, onRouteChange }: Sample1RoutesProps) {
  // 기본 라우트: /sample1/casino
  if (currentRoute === '/sample1' || currentRoute === '/sample1/') {
    return <Sample1Casino user={user} />;
  }

  switch (currentRoute) {
    case '/sample1/casino':
      return <Sample1Casino user={user} />;
    
    case '/sample1/slot':
      return <Sample1Slot user={user} />;
    
    case '/sample1/minigame':
      return <Sample1MiniGame user={user} />;
    
    case '/sample1/deposit':
      return <UserDeposit user={user} />;
    
    case '/sample1/withdraw':
      return <UserWithdraw user={user} />;
    
    case '/sample1/profile':
      return <UserProfile user={user} onRouteChange={onRouteChange} />;
    
    case '/sample1/betting-history':
      return <UserBettingHistory user={user} />;
    
    case '/sample1/notice':
      return <UserNotice user={user} />;
    
    case '/sample1/support':
      return <UserSupport user={user} />;
    
    default:
      return <Sample1Casino user={user} />;
  }
}
