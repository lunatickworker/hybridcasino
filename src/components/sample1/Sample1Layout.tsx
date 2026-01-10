import { ReactNode, useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { LogOut, User, Wallet, Bell, MessageSquare, Gift } from "lucide-react";
import { UserMessagePopup } from "../user/UserMessagePopup";
import { Sample1Signup } from "./Sample1Signup";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";

interface Sample1LayoutProps {
  user: any;
  currentRoute: string;
  onRouteChange: (route: string) => void;
  onLogout: () => void;
  onLogin: (user: any) => void;
  children: ReactNode;
}

export function Sample1Layout({ 
  user, 
  currentRoute, 
  onRouteChange, 
  onLogout,
  onLogin, 
  children 
}: Sample1LayoutProps) {
  const [showMessagePopup, setShowMessagePopup] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const syncingSessionsRef = useRef<Set<number>>(new Set());

  // ==========================================================================
  // 게임 윈도우 관리 및 세션 종료 로직 (글로벌 함수)
  // ==========================================================================
  useEffect(() => {
    // 게임 윈도우 강제 닫기 함수
    (window as any).forceCloseGameWindow = (sessionId: number) => {
      const gameWindows = (window as any).gameWindows;
      if (!gameWindows) return false;
      
      const gameWindow = gameWindows?.get(sessionId);
      
      if (gameWindow && !gameWindow.closed) {
        gameWindow.close();
        gameWindows.delete(sessionId);
        return true;
      }
      return false;
    };

    // 게임 종료 시 보유금 동기화 + API 출금 함수
    (window as any).syncBalanceAfterGame = async (sessionId: number) => {
      try {
        console.log('🔄 [Sample1 게임창 닫힘] 세션 종료:', sessionId);
        
        // ⭐ 1. 세션 정보 조회 (user_id, api_type, status 확인)
        const { data: session, error: sessionError } = await supabase
          .from('game_launch_sessions')
          .select('user_id, api_type, status')
          .eq('id', sessionId)
          .single();

        if (sessionError || !session) {
          console.error('❌ [Sample1 게임창 닫힘] 세션 조회 실패:', sessionError);
          return;
        }

        // ⭐ active 상태만 처리 (이미 종료된 세션은 무시)
        if (session.status !== 'active') {
          console.log(`⏭️ [Sample1 게임창 닫힘] 이미 종료된 세션: status=${session.status}`);
          return;
        }

        // ⭐ 중복 실행 방지
        if (syncingSessionsRef.current.has(sessionId)) {
          console.log(`⏭️ [Sample1 게임창 닫힘] 이미 처리 중인 세션: ${sessionId}`);
          return;
        }

        syncingSessionsRef.current.add(sessionId);

        try {
          // ⭐ 2. lib/gameApi.ts의 syncBalanceOnSessionEnd 호출 (완전한 출금 로직)
          const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
          await syncBalanceOnSessionEnd(session.user_id, session.api_type);
          
          console.log('✅ [Sample1 게임창 닫힘] 처리 완료');
        } finally {
          syncingSessionsRef.current.delete(sessionId);
        }
      } catch (error) {
        console.error('❌ [Sample1 게임창 닫힘 오류]:', error);
        syncingSessionsRef.current.delete(sessionId);
        
        // 에러 발생 시에도 세션은 종료
        try {
          await supabase
            .from('game_launch_sessions')
            .update({ 
              status: 'ended',
              ended_at: new Date().toISOString()
            })
            .eq('id', sessionId);
        } catch (e) {
          console.error('❌ [Sample1 세션 종료 실패]:', e);
        }
      }
    };

    return () => {
      delete (window as any).forceCloseGameWindow;
      delete (window as any).syncBalanceAfterGame;
      syncingSessionsRef.current.clear();
    };
  }, []);

  const handleLogin = async () => {
    if (!loginUsername || !loginPassword) {
      toast.error("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setIsLoggingIn(true);
    try {
      console.log('🔐 마블 로그인 시도:', loginUsername);
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', loginUsername.trim())
        .eq('password_hash', loginPassword)
        .maybeSingle();

      console.log('🔐 로그인 응답:', { data, error });

      if (error) {
        console.error('❌ 로그인 쿼리 에러:', error);
        toast.error("로그인 중 오류가 발생했습니다.");
        return;
      }

      if (!data) {
        console.log('❌ 아이디 또는 비밀번호 불일치');
        toast.error("아이디 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      // 사용자 상태 확인
      if (data.status === 'blocked') {
        toast.error("차단된 계정입니다. 고객센터에 문의해주세요.");
        return;
      }

      if (data.status === 'pending') {
        toast.error("승인 대기 중인 계정입니다. 관리자 승인 후 이용 가능합니다.");
        return;
      }

      if (data.status !== 'active') {
        toast.error("사용할 수 없는 계정입니다.");
        return;
      }

      // 온라인 상태 업데이트
      await supabase
        .from('users')
        .update({ 
          is_online: true, 
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString() 
        })
        .eq('id', data.id);

      console.log('✅ 로그인 성공:', data.username);
      toast.success(`환영합니다, ${data.nickname || data.username}님!`);
      
      // 로그인 폼 초기화
      setLoginUsername("");
      setLoginPassword("");
      
      onLogin(data);
    } catch (error) {
      console.error("로그인 오류:", error);
      toast.error("로그인 중 오류가 발생했습니다.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 카테고리 메뉴
  const categories = [
    { id: 'casino', label: '라이브카지노', route: '/sample1/casino' },
    { id: 'slot', label: '슬롯', route: '/sample1/slot' },
    { id: 'minigame', label: '미니게임', route: '/sample1/minigame' },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0a0a0a]">
      {/* 배경 이미지 */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(https://images.unsplash.com/photo-1633499737221-5e3406d4d952?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ2FtaW5nJTIwYmFja2dyb3VuZHxlbnwxfHx8fDE3NjI0NDQyOTV8MA&ixlib=rb-4.1.0&q=80&w=1080)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90" />
      </div>

      {/* 좌측 캐릭터 장식 */}
      <div 
        className="fixed left-0 top-1/2 -translate-y-1/2 w-[250px] h-[600px] z-0 opacity-30"
        style={{
          backgroundImage: `url(https://images.unsplash.com/photo-1758850253805-8572b62e376d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdXBlcmhlcm8lMjBjaW5lbWF0aWN8ZW58MXx8fHwxNzYyNTExNTk5fDA&ixlib=rb-4.1.0&q=80&w=1080)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* 우측 캐릭터 장식 */}
      <div 
        className="fixed right-0 top-1/2 -translate-y-1/2 w-[250px] h-[600px] z-0 opacity-30"
        style={{
          backgroundImage: `url(https://images.unsplash.com/photo-1760722974347-6d10ecf10a41?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJ2ZWwlMjBkYXJrJTIwYmFja2dyb3VuZHxlbnwxfHx8fDE3NjI1MTE1OTl8MA&ixlib=rb-4.1.0&q=80&w=1080)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* 메인 컨텐츠 */}
      <div className="relative z-10">
        {/* 상단 헤더 */}
        <header className="border-b border-yellow-600/30 bg-black/60 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              {/* 좌측: 로고 */}
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      // vip_level이 10인 사용자만 /admin으로 이동
                      if (user?.vip_level === 10) {
                        window.location.hash = '#/admin';
                      } else {
                        onRouteChange('/sample1/casino');
                      }
                    }}
                    className="px-6 py-2 bg-gradient-to-r from-red-700 to-red-900 rounded-md border-2 border-yellow-600 cursor-pointer hover:opacity-90 transition-opacity"
                    style={{
                      boxShadow: '0 0 20px rgba(234, 179, 8, 0.3)',
                    }}
                  >
                    <span className="text-2xl tracking-wider" style={{ 
                      fontFamily: 'Impact, sans-serif',
                      color: '#fff',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    }}>
                      MARVEL
                    </span>
                  </button>
                </div>

                {/* 카테고리 버튼들 */}
                <div className="flex items-center gap-2">
                  {categories.map((cat) => (
                    <Button
                      key={cat.id}
                      onClick={() => onRouteChange(cat.route)}
                      className={`
                        px-6 py-2 rounded-md transition-all duration-200
                        ${currentRoute === cat.route
                          ? 'bg-gradient-to-r from-yellow-600 to-yellow-700 text-black border-2 border-yellow-400'
                          : 'bg-black/50 text-yellow-500 border border-yellow-600/30 hover:bg-yellow-600/20'
                        }
                      `}
                      style={{
                        boxShadow: currentRoute === cat.route 
                          ? '0 0 15px rgba(234, 179, 8, 0.4)' 
                          : 'none',
                      }}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 우측: 사용자 정보 및 메뉴 */}
              <div className="flex items-center gap-4">
                {user ? (
                  <>
                    {/* 로그인된 상태 */}
                    {/* 사용자 정보 */}
                    <div className="flex items-center gap-3 px-4 py-2 bg-black/50 rounded-md border border-yellow-600/30">
                      <User className="w-4 h-4 text-yellow-500" />
                      <span className="text-yellow-100">{user.username}</span>
                      <div className="w-px h-4 bg-yellow-600/30" />
                      <Wallet className="w-4 h-4 text-yellow-500" />
                      <span className="text-yellow-100">
                        {user.balance?.toLocaleString() || 0}원
                      </span>
                      <div className="w-px h-4 bg-yellow-600/30" />
                      <Gift className="w-4 h-4 text-yellow-500" />
                      <span className="text-yellow-100">
                        P {user.points?.toLocaleString() || 0}
                      </span>
                    </div>

                    {/* 메뉴 버튼들 */}
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => onRouteChange('/sample1/deposit')}
                        className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white border border-green-400/30 hover:from-green-500 hover:to-green-600"
                      >
                        입금
                      </Button>
                      <Button
                        onClick={() => onRouteChange('/sample1/withdraw')}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white border border-blue-400/30 hover:from-blue-500 hover:to-blue-600"
                      >
                        출금
                      </Button>
                      <Button
                        onClick={() => onRouteChange('/sample1/profile')}
                        className="px-4 py-2 bg-black/50 text-yellow-500 border border-yellow-600/30 hover:bg-yellow-600/20"
                      >
                        <User className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => setShowMessagePopup(true)}
                        className="px-4 py-2 bg-black/50 text-yellow-500 border border-yellow-600/30 hover:bg-yellow-600/20"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={onLogout}
                        className="px-4 py-2 bg-black/50 text-red-500 border border-red-600/30 hover:bg-red-600/20"
                      >
                        <LogOut className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* 로그인 전 상태 */}
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => onRouteChange('/sample1/notice')}
                        className="px-4 py-2 bg-black/50 text-yellow-100 border border-yellow-600/30 hover:bg-yellow-600/20 rounded-md"
                      >
                        입금신청
                      </Button>
                      <Button
                        onClick={() => onRouteChange('/sample1/notice')}
                        className="px-4 py-2 bg-black/50 text-yellow-100 border border-yellow-600/30 hover:bg-yellow-600/20 rounded-md"
                      >
                        1:1문의
                      </Button>
                      <Button
                        onClick={() => onRouteChange('/sample1/notice')}
                        className="px-4 py-2 bg-black/50 text-yellow-100 border border-yellow-600/30 hover:bg-yellow-600/20 rounded-md"
                      >
                        공지사항
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* 로그인 폼 / 서브 메뉴 */}
        {!user ? (
          <div className="bg-gradient-to-r from-black/80 via-yellow-900/20 to-black/80 border-b border-yellow-600/20">
            <div className="max-w-7xl mx-auto px-4 py-4">
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="아이디"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="w-40 bg-white/90 border-yellow-600/30 text-black placeholder:text-gray-500"
                  />
                  <Input
                    type="password"
                    placeholder="비밀번호"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="w-40 bg-white/90 border-yellow-600/30 text-black placeholder:text-gray-500"
                  />
                  <Button
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="px-6 bg-gradient-to-r from-yellow-600 to-yellow-700 text-black hover:from-yellow-500 hover:to-yellow-600 border-2 border-yellow-400"
                  >
                    {isLoggingIn ? "로그인 중..." : "로그인"}
                  </Button>
                  <Button
                    onClick={() => setShowSignup(true)}
                    className="px-6 bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600 border border-red-400/30"
                  >
                    회원가입
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-black/80 via-yellow-900/20 to-black/80 border-b border-yellow-600/20">
            <div className="max-w-7xl mx-auto px-4 py-2">
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => onRouteChange('/sample1/deposit')}
                  className="px-4 py-1 text-sm text-gray-400 hover:text-yellow-400 transition-colors"
                >
                  입금
                </button>
                <button
                  onClick={() => onRouteChange('/sample1/withdraw')}
                  className="px-4 py-1 text-sm text-gray-400 hover:text-yellow-400 transition-colors"
                >
                  출금
                </button>
                <button
                  onClick={() => onRouteChange('/sample1/notice')}
                  className="px-4 py-1 text-sm text-gray-400 hover:text-yellow-400 transition-colors"
                >
                  공지사항
                </button>
                <button
                  onClick={() => onRouteChange('/sample1/support')}
                  className="px-4 py-1 text-sm text-gray-400 hover:text-yellow-400 transition-colors"
                >
                  고객지원
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 메인 컨텐츠 영역 */}
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>

        {/* 하단 정보 */}
        <footer className="border-t border-yellow-600/20 bg-black/60 backdrop-blur-sm mt-12">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="text-center text-xs text-gray-500 space-y-1">
              <p>
                ※본사 고액 출금 제한 최대 없음. 24시 입출금 가능 ※ 단폴, 다폴, 조합, 승무패 가리지 않고 모두 배팅 가능하십니다. 영국, 중국 등 국내 및 국외 배팅 등
                제재 없이 모든 리그, 모든 경기를 즐기실 수 있습니다 1분 빠른 입출금 / 고액 당첨, 규정 위반 시 환전 제한 가능 ※
              </p>
              <p className="text-gray-600">
                COPYRIGHT © 2022, ALL RIGHTS RESERVED
              </p>
            </div>
          </div>
        </footer>
      </div>

      {/* 메시지 팝업 */}
      {showMessagePopup && user && (
        <UserMessagePopup
          userId={user.id}
          onClose={() => setShowMessagePopup(false)}
        />
      )}
      
      {/* 회원가입 모달 */}
      {showSignup && (
        <Sample1Signup
          onClose={() => setShowSignup(false)}
          onSuccess={(username) => {
            setLoginUsername(username);
          }}
        />
      )}
    </div>
  );
}