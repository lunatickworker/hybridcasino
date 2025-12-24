import { ReactNode, useEffect, useRef, useState } from "react";
import { IndoHeader } from "./IndoHeader";
import { IndoSidebar } from "./IndoSidebar";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { getUserBalanceWithConfig } from "../../lib/investApi";

interface IndoLayoutProps {
  user: any;
  currentRoute: string;
  onRouteChange: (route: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function IndoLayout({ user, currentRoute, onRouteChange, onLogout, children }: IndoLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const syncingSessionsRef = useRef<Set<number>>(new Set());
  const autoLogoutTimerRef = useRef<NodeJS.Timeout>();
  const sessionChannelRef = useRef<any>(null);
  const onlineChannelRef = useRef<any>(null);

  // ==========================================================================
  // 보유금 동기화 함수
  // ==========================================================================
  const syncBalanceForSession = async (sessionId: number) => {
    if (syncingSessionsRef.current.has(sessionId)) {
      console.log(`⏭️ [Indo 보유금 동기화] 이미 진행 중: 세션 ${sessionId}`);
      return;
    }

    try {
      syncingSessionsRef.current.add(sessionId);
      console.log(`💰 [Indo 보유금 동기화] 시작: 세션 ${sessionId}`);

      // 1. 세션 정보 조회
      const { data: session, error: sessionError } = await supabase
        .from('game_launch_sessions')
        .select('user_id, status')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        console.error(`❌ [Indo 보유금 동기화] 세션 조회 실패:`, sessionError);
        return;
      }

      // status='active'인 세션만 동기화
      if (session.status !== 'active') {
        console.log(`⏭️ [Indo 보유금 동기화] 스킵 (세션 ${sessionId}): status=${session.status}`);
        return;
      }

      // 2. 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('username, referrer_id')
        .eq('id', session.user_id)
        .single();

      if (userError || !userData) {
        console.error(`❌ [Indo 보유금 동기화] 사용자 정보 조회 실패:`, userError);
        return;
      }

      const username = userData.username;

      // 3. referrer_id를 따라 최상위 Lv1 파트너 찾기
      let currentPartnerId = userData.referrer_id;
      if (!currentPartnerId) {
        console.error(`❌ [Indo 보유금 동기화] referrer_id 없음: user_id=${session.user_id}`);
        return;
      }

      let topLevelPartnerId = currentPartnerId;
      let iterations = 0;
      const maxIterations = 10;

      while (iterations < maxIterations) {
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, parent_id, level')
          .eq('id', currentPartnerId)
          .single();

        if (partnerError || !partnerData) {
          console.error(`❌ [Indo 보유금 동기화] 파트너 정보 없음: partner_id=${currentPartnerId}`);
          break;
        }

        if (partnerData.level === 1 || !partnerData.parent_id) {
          topLevelPartnerId = partnerData.id;
          console.log(`   ✅ 최상위 Lv1 파트너 찾음: ${topLevelPartnerId}`);
          break;
        }

        currentPartnerId = partnerData.parent_id;
        iterations++;
      }

      if (iterations >= maxIterations) {
        console.error(`❌ [Indo 보유금 동기화] 최상위 파트너 찾기 실패`);
        return;
      }

      // 4. Lv1 파트너의 api_configs에서 credential 조회
      const { data: apiConfig, error: configError } = await supabase
        .from('api_configs')
        .select('opcode, token, secret_key')
        .eq('partner_id', topLevelPartnerId)
        .eq('api_provider', 'invest')
        .single();

      if (configError || !apiConfig || !apiConfig.opcode || !apiConfig.token || !apiConfig.secret_key) {
        console.error(`❌ [Indo 보유금 동기화] API 설정 누락: partner_id=${topLevelPartnerId}`, configError);
        return;
      }

      console.log(`   📍 사용 credential: partner_id=${topLevelPartnerId}`);

      // 5. 보유금 조회
      const balanceResult = await getUserBalanceWithConfig(
        apiConfig.opcode,
        username,
        apiConfig.token,
        apiConfig.secret_key
      );

      if (balanceResult.success && balanceResult.balance !== undefined) {
        await supabase
          .from('users')
          .update({ balance: balanceResult.balance })
          .eq('id', session.user_id);

        console.log(`✅ [Indo 보유금 동기화] 완료: 세션 ${sessionId}, 잔고 ${balanceResult.balance}`);
      } else {
        console.error(`❌ [Indo 보유금 동기화] API 실패: ${balanceResult.error}`);
      }
    } catch (error) {
      console.error(`❌ [Indo 보유금 동기화] 오류:`, error);
    } finally {
      syncingSessionsRef.current.delete(sessionId);
    }
  };

  // ==========================================================================
  // 게임창 강제 종료 함수
  // ==========================================================================
  useEffect(() => {
    (window as any).forceCloseGameWindow = (sessionId: number) => {
      const gameWindows = (window as any).gameWindows as Map<number, Window>;
      const gameWindow = gameWindows?.get(sessionId);
      
      if (gameWindow && !gameWindow.closed) {
        gameWindow.close();
        gameWindows.delete(sessionId);
        return true;
      }
      return false;
    };

    (window as any).syncBalanceAfterGame = async (sessionId: number) => {
      try {
        console.log('🔄 [Indo 게임창 닫힘] 세션 종료:', sessionId);
        
        const { data: session, error: sessionError } = await supabase
          .from('game_launch_sessions')
          .select('user_id, api_type, status')
          .eq('id', sessionId)
          .single();

        if (sessionError || !session) {
          console.error('❌ [Indo 게임창 닫힘] 세션 조회 실패:', sessionError);
          return;
        }

        if (session.status !== 'active') {
          console.log(`⏭️ [Indo 게임창 닫힘] 이미 종료된 세션: status=${session.status}`);
          return;
        }

        const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
        await syncBalanceOnSessionEnd(session.user_id, session.api_type);
        
        console.log('✅ [Indo 게임창 닫힘] 처리 완료');
      } catch (error) {
        console.error('❌ [Indo 게임창 닫힘 오류]:', error);
        try {
          await supabase
            .from('game_launch_sessions')
            .update({ 
              status: 'ended',
              ended_at: new Date().toISOString()
            })
            .eq('id', sessionId);
        } catch (e) {
          console.error('❌ [세션 종료 실패]:', e);
        }
      }
    };

    return () => {
      delete (window as any).forceCloseGameWindow;
      delete (window as any).syncBalanceAfterGame;
      syncingSessionsRef.current.clear();
    };
  }, []);

  // ==========================================================================
  // 세션 상태 변경 감지 (Realtime)
  // ==========================================================================
  useEffect(() => {
    if (!user?.id) return;

    console.log('🔴 [Indo 세션 감지] 구독 시작:', user.id);

    sessionChannelRef.current = supabase
      .channel(`indo_session_status_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_launch_sessions',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          const { new: newSession, old: oldSession } = payload as any;

          if (oldSession?.status === 'active' && 
              ['ended', 'force_ended'].includes(newSession.status)) {
            
            console.log('🛑 [Indo 세션 종료]', newSession.id, newSession.status);
            
            (window as any).forceCloseGameWindow?.(newSession.id);
            await syncBalanceForSession(newSession.id);
            
            if (newSession.status === 'force_ended') {
              toast.error('네트워크 오류가 발생 되었습니다. 다시 시작해 주세요');
            }
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔴 [Indo 세션 감지] 구독 종료');
      if (sessionChannelRef.current) {
        supabase.removeChannel(sessionChannelRef.current);
        sessionChannelRef.current = null;
      }
    };
  }, [user?.id]);

  // ==========================================================================
  // 30분 무활동 시 자동 로그아웃
  // ==========================================================================
  useEffect(() => {
    if (!user?.id) return;

    console.log('⏰ [Indo 자동 로그아웃] 시작');

    const checkAutoLogout = async () => {
      try {
        const { data: userData, error } = await supabase
          .from('users')
          .select('balance_sync_started_at, is_online')
          .eq('id', user.id)
          .single();

        if (error || !userData?.is_online || !userData.balance_sync_started_at) {
          return;
        }

        const startedAt = new Date(userData.balance_sync_started_at);
        const now = new Date();
        const elapsedMinutes = (now.getTime() - startedAt.getTime()) / 1000 / 60;

        if (elapsedMinutes >= 30) {
          console.log('🚪 [Indo 자동 로그아웃] 30분 경과');
          
          await supabase
            .from('users')
            .update({ is_online: false })
            .eq('id', user.id);

          onLogout();
        }
      } catch (err) {
        console.error('❌ [Indo 자동 로그아웃 체크 오류]:', err);
      }
    };

    autoLogoutTimerRef.current = setInterval(checkAutoLogout, 10000);

    return () => {
      console.log('⏰ [Indo 자동 로그아웃] 종료');
      if (autoLogoutTimerRef.current) {
        clearInterval(autoLogoutTimerRef.current);
      }
    };
  }, [user?.id, onLogout]);

  // ==========================================================================
  // 온라인 상태 모니터링 (Realtime)
  // ==========================================================================
  useEffect(() => {
    if (!user?.id) return;

    console.log('🟢 [Indo 온라인 상태] 구독 시작:', user.id);

    onlineChannelRef.current = supabase
      .channel(`indo_online_status_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`
        },
        async (payload) => {
          const { new: newUser } = payload as any;
          
          if (!newUser.is_online) {
            console.log('🚪 [Indo 온라인 상태] 강제 로그아웃 감지');
            // toast.error('다른 기기에서 로그인되어 로그아웃됩니다.'); // ✅ 토스트 메시지 제거
            setTimeout(() => {
              onLogout();
            }, 1000);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🟢 [Indo 온라인 상태] 구독 종료');
      if (onlineChannelRef.current) {
        supabase.removeChannel(onlineChannelRef.current);
        onlineChannelRef.current = null;
      }
    };
  }, [user?.id, onLogout]);

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white">
      {/* Header */}
      <IndoHeader 
        user={user}
        onRouteChange={onRouteChange}
        onLogout={onLogout}
      />
      
      <div className="flex pt-16">
        {/* Sidebar */}
        <IndoSidebar 
          currentRoute={currentRoute}
          onRouteChange={onRouteChange}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
        
        {/* Main Content */}
        <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>

      {/* TODO: 배너 팝업 및 메시지 팝업 추가 예정 */}
    </div>
  );
}

export default IndoLayout;