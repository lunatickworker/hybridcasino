// ✅ CRITICAL: 콘솔 필터를 가장 먼저 로드 (GoTrueClient 경고 억제)
import './lib/consoleFilter';

import { useState, useEffect } from 'react';
import { Toaster } from './components/ui/sonner';
import { AdminLogin } from './components/admin/AdminLogin';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminRoutes } from './components/common/AdminRoutes';
import { UserLogin } from './components/user/UserLogin';
import { UserLayout } from './components/user/UserLayout';
import { UserRoutes } from './components/common/UserRoutes';
import { Sample1Layout } from './components/sample1/Sample1Layout';
import { Sample1Routes } from './components/sample1/Sample1Routes';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BalanceProvider } from './contexts/BalanceContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { SessionCleanupProvider } from './contexts/SessionCleanupContext';
import { SessionTimeoutManager } from './contexts/SessionTimeoutManager';
import { MessageQueueProvider } from './components/common/MessageQueueProvider';
import { LanguageProvider } from './contexts/LanguageContext';
import { supabase } from './lib/supabase';



function AppContent() {
  const { authState, logout } = useAuth();
  const [, forceUpdate] = useState({});

  // 초기 리다이렉트 처리 (useEffect로 이동하여 render phase 오류 방지)
  useEffect(() => {
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      window.location.hash = '#/user';
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

  const isUserPage = currentPath.startsWith('/user');
  const isSample1Page = currentPath.startsWith('/sample1');
  const isAdminPage = currentPath.startsWith('/admin');

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
          .update({ 
            is_online: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', userSession.id);

        if (userError) {
          console.error('❌ is_online 업데이트 오류:', userError);
        } else {
          console.log('✅ is_online = false 업데이트 완료');
        }

        // 2. user_sessions 테이블의 활성 세션 종료
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
        } else {
          console.log('✅ user_sessions 종료 완료');
        }

        // 3. game_launch_sessions는 로그아웃 시 종료하지 않음
        // ⚠️ 중요: 게임창을 닫을 때만 세션이 종료되어야 함
        // UserCasino.tsx와 UserSlot.tsx에서 게임창 닫힘 감지 시 syncBalanceAfterGame() 호출하여 세션 종료
        console.log('ℹ️ game_launch_sessions는 게임창 닫힘 시에만 종료됨 (로그아웃 시 유지)');

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
          <UserLogin onLoginSuccess={(user) => {
            localStorage.setItem('user_session', JSON.stringify(user));
            window.location.hash = '#/user/casino';
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

    // 로그인 여부와 관계없이 동일한 레이아웃 표시
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
      <Toaster position="top-right" />
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