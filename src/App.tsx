// v2.5.3 - Commission rate management added
import React from 'react';
import { useState, useEffect } from 'react';
import { Toaster } from './components/ui/sonner';
import { AdminLogin } from './components/admin/AdminLogin';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminRoutes } from './components/common/AdminRoutes';
import { UserLogin } from './components/user/UserLogin';
import { UserLayout } from './components/user/UserLayout';
import { UserRoutes } from './components/common/UserRoutes';
import { MLayout } from './components/M/MLayout';
import { MRoutes } from './components/M/MRoutes';
import { BenzLayout } from './components/benz/BenzLayout';
import { BenzRoutes } from './components/benz/BenzRoutes';
import { BenzLoginModal } from './components/benz/BenzLoginModal';
import { BenzSignupModal } from './components/benz/BenzSignupModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BalanceProvider } from './contexts/BalanceContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { SessionCleanupProvider } from './contexts/SessionCleanupContext';
import { SessionTimeoutManager } from './contexts/SessionTimeoutManager';
import { MessageQueueProvider } from './components/common/MessageQueueProvider';
import { LanguageProvider } from './contexts/LanguageContext';
import { supabase } from './lib/supabase';
import { initFavicon } from './utils/favicon';
import { gameApi } from './lib/gameApi';
import { setupNetworkLogging } from './lib/networkLoggingInterceptor';

// ✅ 앱 시작 시 네트워크 로깅 초기화 (민감한 정보 마스킹)
setupNetworkLogging();

function AppContent() {
  const { authState, logout } = useAuth();
  const [, forceUpdate] = useState({});
  const [benzModals, setBenzModals] = useState({ login: false, signup: false });

  // Favicon 초기화 (도메인/라우트별 자동 설정)
  useEffect(() => {
    initFavicon();
  }, []);

  // 초기 리다이렉트 처리 (useEffect로 이동하여 render phase 오류 방지)
  useEffect(() => {
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      window.location.hash = '#/benz';
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => forceUpdate({});
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigate = (route: string) => {
    // route가 이미 #으로 시작하면 그대로 사용, 아니면 #을 추가
    const hashRoute = route.startsWith('#') ? route : `#${route}`;
    
    // ✅ Benz 페이지에서는 주소창에 #/benz만 표시 (라우트 숨김)
    if (hashRoute.startsWith('#/benz')) {
      // 내부 상태는 유지하고, 주소창은 #/benz만 표시
      window.history.replaceState({ benz_route: hashRoute }, '', window.location.pathname + '#/benz');
      sessionStorage.setItem('benz_internal_route', hashRoute);
      forceUpdate({});
      return;
    }
    
    // ✅ /admin/transactions#deposit-request 같은 형식의 URL에서 앵커 추출
    const anchorMatch = hashRoute.match(/#(.*)#(.*)$/);
    if (anchorMatch) {
      // #/admin/transactions#deposit-request -> #/admin/transactions, deposit-request 분리
      const [, path, anchor] = anchorMatch;
      window.location.hash = `#${path}`;
      // 약간의 지연 후 앵커를 다시 추가 (TransactionManagement에서 hashchange 이벤트 감지)
      setTimeout(() => {
        window.location.hash = `#${path}#${anchor}`;
      }, 50);
    } else {
      window.location.hash = hashRoute;
    }
    
    forceUpdate({});
  };

  // Hash 기반 라우팅 사용
  const currentHash = window.location.hash || '#/admin';
  const currentPath = currentHash.substring(1); // # 제거

  const isBenzPage = currentPath.startsWith('/benz');
  const isUserPage = currentPath.startsWith('/user');
  const isMPage = currentPath.startsWith('/m');
  const isSample1Page = currentPath.startsWith('/sample1');
  const isAdminPage = currentPath.startsWith('/admin');

  // Benz 페이지 라우팅 (기본 도메인)
  if (isBenzPage) {
    // 주소창에는 #/benz만 표시되지만, 내부적으로는 sessionStorage에서 실제 라우트 가져오기
    const currentRoute = sessionStorage.getItem('benz_internal_route') || currentPath;

    // 사용자 세션 확인
    const userSessionString = localStorage.getItem('user_session');
    let userSession = null;
    
    try {
      if (userSessionString) {
        userSession = JSON.parse(userSessionString);
      }
    } catch (error) {
      console.error('사용자 세션 파싱 오류:', error);
      localStorage.removeItem('user_session');
    }

    const isUserAuthenticated = !!userSession;

    // 로그인 처리
    const handleUserLogin = (user: any) => {
      localStorage.setItem('user_session', JSON.stringify(user));
      forceUpdate({});
    };

    // 로그아웃 처리
    const handleUserLogout = async () => {
      if (!userSession?.id) {
        localStorage.removeItem('user_session');
        window.location.hash = '#/benz';
        forceUpdate({});
        return;
      }

      try {
        await supabase
          .from('users')
          .update({ 
            is_online: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', userSession.id);

        await supabase
          .from('user_sessions')
          .update({ 
            is_active: false,
            logout_at: new Date().toISOString()
          })
          .eq('user_id', userSession.id)
          .eq('is_active', true);

        await supabase
          .from('activity_logs')
          .insert([{
            actor_type: 'user',
            actor_id: userSession.id,
            action: 'logout',
            details: { 
              username: userSession.username, 
              logout_time: new Date().toISOString() 
            }
          }]);

      } catch (error) {
        console.error('로그아웃 처리 오류:', error);
      } finally {
        localStorage.removeItem('user_session');
        window.location.hash = '#/benz';
        forceUpdate({});
      }
    };

    return (
      <>
        <WebSocketProvider>
          {userSession ? (
            <MessageQueueProvider userType="user" userId={userSession.id}>
              <BenzLayout 
                user={userSession}
                currentRoute={currentRoute}
                onRouteChange={handleNavigate}
                onLogout={handleUserLogout}
                onOpenLoginModal={() => setBenzModals({ login: true, signup: false })}
                onOpenSignupModal={() => setBenzModals({ login: false, signup: true })}
              >
                <BenzRoutes 
                  currentRoute={currentRoute} 
                  user={userSession}
                  onRouteChange={handleNavigate}
                />
              </BenzLayout>
            </MessageQueueProvider>
          ) : (
            <MessageQueueProvider userType="user" userId={null}>
              <BenzLayout 
                user={null}
                currentRoute={currentRoute}
                onRouteChange={handleNavigate}
                onLogout={handleUserLogout}
                onOpenLoginModal={() => setBenzModals({ login: true, signup: false })}
                onOpenSignupModal={() => setBenzModals({ login: false, signup: true })}
              >
                <BenzRoutes 
                  currentRoute={currentRoute} 
                  user={null}
                  onRouteChange={handleNavigate}
                />
              </BenzLayout>
            </MessageQueueProvider>
          )}
        </WebSocketProvider>

        {/* Login Modal */}
        <BenzLoginModal
          isOpen={benzModals.login}
          onClose={() => setBenzModals({ login: false, signup: false })}
          onLoginSuccess={handleUserLogin}
          onSwitchToSignup={() => setBenzModals({ login: false, signup: true })}
        />

        {/* Signup Modal */}
        <BenzSignupModal
          isOpen={benzModals.signup}
          onClose={() => setBenzModals({ login: false, signup: false })}
          onSwitchToLogin={() => setBenzModals({ login: true, signup: false })}
        />

        <Toaster position="top-right" />
      </>
    );
  }

  // 사용자 페이지 라우팅
  if (isUserPage) {
    const currentRoute = currentPath;

    // 사용자 페이지는 별도의 세션 확인 (localStorage의 user_session)
    const userSessionString = localStorage.getItem('user_session');
    let userSession = null;
    
    try {
      if (userSessionString) {
        userSession = JSON.parse(userSessionString);
      }
    } catch (error) {
      console.error('사용자 세션 파싱 오류:', error);
      localStorage.removeItem('user_session');
    }

    const isUserAuthenticated = !!userSession;

    // 사용자 로그아웃 처리 함수
    const handleUserLogout = async () => {
      if (!userSession?.id) {
        localStorage.removeItem('user_session');
        window.location.hash = '#/user';
        forceUpdate({});
        return;
      }

      try {
        console.log('🔓 사용자 로그아웃 처리 시작:', userSession.id);

        // 1. users.is_online = false 업데이트
        const { error: userError } = await supabase
          .from('users')
          .update({ is_online: false })
          .eq('id', userSession.id);

        if (userError) {
          console.error('❌ is_online 업데이트 오류:', userError);
        }

        // 2. user_sessions 종료
        const { error: sessionError } = await supabase
          .from('user_sessions')
          .update({
            is_active: false,
            logout_at: new Date().toISOString()
          })
          .eq('user_id', userSession.id)
          .eq('is_active', true);

        if (sessionError) {
          console.error('❌ user_sessions 종료 오류:', sessionError);
        }

        // 3. game_launch_sessions는 종료하지 않음!
        // ⚠️ 중요: 게임창을 닫을 때만 세션이 종료되어야 함
        // UserCasino.tsx와 UserSlot.tsx에서 게임창 닫힘 감지 시 syncBalanceAfterGame() 호출하여 세션 종료

        // 4. 활동 로그 기록
        await supabase
          .from('activity_logs')
          .insert([{
            actor_type: 'user',
            actor_id: userSession.id,
            action: 'logout',
            details: {
              username: userSession.username,
              logout_time: new Date().toISOString()
            }
          }]);

        console.log('✅ 로그아웃 처리 완료');

      } catch (error) {
        console.error('❌ 로그아웃 처리 오류:', error);
      } finally {
        // 5. localStorage 제거 및 리다이렉트 (에러 발생 여부와 무관하게 실행)
        localStorage.removeItem('user_session');
        window.location.hash = '#/user';
        forceUpdate({});
      }
    };

    return (
      <>
        {!isUserAuthenticated ? (
          <UserLogin onLoginSuccess={async (user) => {
            localStorage.setItem('user_session', JSON.stringify(user));
            
            // 🆕 접근 가능한 게임 타입 확인 후 리다이렉트
            try {
              const accessibleTypes = await gameApi.getUserAccessibleGameTypes(user.id);
              
              if (accessibleTypes.length > 0) {
                // 접근 가능한 첫 번째 게임 타입으로 이동
                const firstType = accessibleTypes[0];
                window.location.hash = `#/user/${firstType}`;
              } else {
                // 게임 접근 권한이 없으면 입금 페이지로
                window.location.hash = '#/user/deposit';
              }
            } catch (error) {
              console.error('게임 타입 확인 실패:', error);
              window.location.hash = '#/user/casino'; // 폴백
            }
            
            forceUpdate({});
          }} />
        ) : (
          <WebSocketProvider>
            <MessageQueueProvider userType="user" userId={userSession.id}>
              <UserLayout 
                user={userSession}
                currentRoute={currentRoute}
                onRouteChange={handleNavigate}
                onLogout={handleUserLogout}
              >
                <UserRoutes 
                  currentRoute={currentRoute} 
                  user={userSession}
                  onRouteChange={handleNavigate}
                />
              </UserLayout>
            </MessageQueueProvider>
          </WebSocketProvider>
        )}
        <Toaster position="top-right" />
      </>
    );
  }

  // Sample1 페이지 라우팅 (Marvel 테마)
  if (isSample1Page) {
    const currentRoute = currentPath;

    // 사용자 세션 확인
    const userSessionString = localStorage.getItem('user_session');
    let userSession = null;
    
    try {
      if (userSessionString) {
        userSession = JSON.parse(userSessionString);
      }
    } catch (error) {
      console.error('사용자 세션 파싱 오류:', error);
      localStorage.removeItem('user_session');
    }

    // 로그인 처리
    const handleUserLogin = (user: any) => {
      localStorage.setItem('user_session', JSON.stringify(user));
      forceUpdate({});
    };

    // 로그아웃 처리
    const handleUserLogout = async () => {
      if (!userSession?.id) {
        localStorage.removeItem('user_session');
        forceUpdate({});
        return;
      }

      try {
        await supabase
          .from('users')
          .update({ is_online: false, updated_at: new Date().toISOString() })
          .eq('id', userSession.id);

        await supabase
          .from('user_sessions')
          .update({ is_active: false, logout_at: new Date().toISOString() })
          .eq('user_id', userSession.id)
          .eq('is_active', true);

        await supabase
          .from('activity_logs')
          .insert([{
            actor_type: 'user',
            actor_id: userSession.id,
            action: 'logout',
            details: { username: userSession.username, logout_time: new Date().toISOString() }
          }]);

      } catch (error) {
        console.error('로그아웃 처리 오류:', error);
      } finally {
        localStorage.removeItem('user_session');
        forceUpdate({});
      }
    };

    return (
      <>
        <WebSocketProvider>
          {userSession ? (
            <MessageQueueProvider userType="user" userId={userSession.id}>
              <Sample1Layout 
                user={userSession}
                currentRoute={currentRoute}
                onRouteChange={handleNavigate}
                onLogout={handleUserLogout}
                onLogin={handleUserLogin}
              >
                <Sample1Routes 
                  currentRoute={currentRoute} 
                  user={userSession}
                  onRouteChange={handleNavigate}
                />
              </Sample1Layout>
            </MessageQueueProvider>
          ) : (
            <Sample1Layout 
              user={null}
              currentRoute={currentRoute}
              onRouteChange={handleNavigate}
              onLogout={handleUserLogout}
              onLogin={handleUserLogin}
            >
              <Sample1Routes 
                currentRoute={currentRoute} 
                user={null}
                onRouteChange={handleNavigate}
              />
            </Sample1Layout>
          )}
        </WebSocketProvider>
        <Toaster position="top-right" />
      </>
    );
  }

  // M 페이지 라우팅
  if (isMPage) {
    const currentRoute = currentPath;

    // 사용자 세션 확인
    const userSessionString = localStorage.getItem('user_session');
    let userSession = null;
    
    try {
      if (userSessionString) {
        userSession = JSON.parse(userSessionString);
      }
    } catch (error) {
      console.error('사용자 세션 파싱 오류:', error);
      localStorage.removeItem('user_session');
    }

    // 로그인 처리
    const handleUserLogin = (user: any) => {
      localStorage.setItem('user_session', JSON.stringify(user));
      forceUpdate({});
    };

    // 로그아웃 처리
    const handleUserLogout = async () => {
      if (!userSession?.id) {
        localStorage.removeItem('user_session');
        forceUpdate({});
        return;
      }

      try {
        await supabase
          .from('users')
          .update({ is_online: false, updated_at: new Date().toISOString() })
          .eq('id', userSession.id);

        await supabase
          .from('user_sessions')
          .update({ is_active: false, logout_at: new Date().toISOString() })
          .eq('user_id', userSession.id)
          .eq('is_active', true);

        await supabase
          .from('activity_logs')
          .insert([{
            actor_type: 'user',
            actor_id: userSession.id,
            action: 'logout',
            details: { username: userSession.username, logout_time: new Date().toISOString() }
          }]);

      } catch (error) {
        console.error('로그아웃 처리 오류:', error);
      } finally {
        localStorage.removeItem('user_session');
        forceUpdate({});
      }
    };

    // 로그인 여부와 관계없이 동일한 레이아웃 표시
    return (
      <>
        <WebSocketProvider>
          {userSession ? (
            <MessageQueueProvider userType="user" userId={userSession.id}>
              <MLayout 
                user={userSession}
                currentRoute={currentRoute}
                onRouteChange={handleNavigate}
                onLogout={handleUserLogout}
                onLogin={handleUserLogin}
              >
                <MRoutes 
                  currentRoute={currentRoute} 
                  user={userSession}
                  onRouteChange={handleNavigate}
                />
              </MLayout>
            </MessageQueueProvider>
          ) : (
            <MLayout 
              user={null}
              currentRoute={currentRoute}
              onRouteChange={handleNavigate}
              onLogout={handleUserLogout}
              onLogin={handleUserLogin}
            >
              <MRoutes 
                currentRoute={currentRoute} 
                user={null}
                onRouteChange={handleNavigate}
              />
            </MLayout>
          )}
        </WebSocketProvider>
        <Toaster position="top-right" />
      </>
    );
  }

  // 관리자 페이지 라우팅 (기본)
  const currentRoute = isAdminPage && currentPath !== '/admin' && currentPath !== '/admin/'
    ? currentPath
    : '/admin/dashboard';

  const isAuthenticated = authState.isAuthenticated && authState.user;

  return (
    <>
      {!isAuthenticated ? (
        <AdminLogin onLoginSuccess={() => {
          window.location.hash = '#/admin/dashboard';
          forceUpdate({});
        }} />
      ) : (
        <WebSocketProvider>
          <BalanceProvider user={authState.user}>
            <SessionTimeoutManager />
            <MessageQueueProvider userType="admin" userId={authState.user.id}>
              <AdminLayout currentRoute={currentRoute} onNavigate={handleNavigate}>
                <AdminRoutes currentRoute={currentRoute} user={authState.user} />
              </AdminLayout>
            </MessageQueueProvider>
          </BalanceProvider>
        </WebSocketProvider>
      )}
      <Toaster position="bottom-right" />
    </>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <SessionCleanupProvider>
          <AppContent />
        </SessionCleanupProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;