import { ReactNode, useEffect, useRef } from "react";
import { UserHeader } from "./UserHeader";
import { UserMessagePopup } from "./UserMessagePopup";
import { UserBannerPopup } from "./UserBannerPopup";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { getUserBalanceWithConfig } from "../../lib/investApi";

interface UserLayoutProps {
  user: any;
  currentRoute: string;
  onRouteChange: (route: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function UserLayout({ user, currentRoute, onRouteChange, onLogout, children }: UserLayoutProps) {
  const syncingSessionsRef = useRef<Set<number>>(new Set());
  const autoLogoutTimerRef = useRef<NodeJS.Timeout>();
  const sessionChannelRef = useRef<any>(null);
  const onlineChannelRef = useRef<any>(null);

  // ==========================================================================
  // 보유금 동기화 함수
  // ==========================================================================
  const syncBalanceForSession = async (sessionId: number) => {
    if (syncingSessionsRef.current.has(sessionId)) {
      console.log(`⏭️ [보유금 동기화] 이미 진행 중: 세션 ${sessionId}`);
      return;
    }

    try {
      syncingSessionsRef.current.add(sessionId);
      console.log(`💰 [보유금 동기화] 시작: 세션 ${sessionId}`);

      // 1. 세션 정보 조회 (user_id + status)
      const { data: session, error: sessionError } = await supabase
        .from('game_launch_sessions')
        .select('user_id, status')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        console.error(`❌ [보유금 동기화] 세션 조회 실패:`, sessionError);
        return;
      }

      // ⭐ status='active'인 세션만 동기화 (게임 중인 사용자만)
      if (session.status !== 'active') {
        console.log(`⏭️ [보유금 동기화] 스킵 (세션 ${sessionId}): status=${session.status} (active 아님)`);
        return;
      }

      // 2. 사용자 정보 조회 (username, referrer_id)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('username, referrer_id')
        .eq('id', session.user_id)
        .single();

      if (userError || !userData) {
        console.error(`❌ [보유금 동기화] 사용자 정보 조회 실패:`, userError);
        return;
      }

      const username = userData.username;

      // 3. ⭐ referrer_id를 따라 최상위 Lv1 파트너 찾기
      let currentPartnerId = userData.referrer_id;
      if (!currentPartnerId) {
        console.error(`❌ [보유금 동기화] referrer_id 없음: user_id=${session.user_id}`);
        return;
      }

      // parent_id 체인을 따라 Lv1까지 올라가기
      let topLevelPartnerId = currentPartnerId;
      let iterations = 0;
      const maxIterations = 10; // 무한 루프 방지

      while (iterations < maxIterations) {
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, parent_id, level')
          .eq('id', currentPartnerId)
          .single();

        if (partnerError || !partnerData) {
          console.error(`❌ [보유금 동기화] 파트너 정보 없음: partner_id=${currentPartnerId}`);
          break;
        }

        // Lv1에 도달하면 종료
        if (partnerData.level === 1 || !partnerData.parent_id) {
          topLevelPartnerId = partnerData.id;
          console.log(`   ✅ 최상위 Lv1 파트너 찾음: ${topLevelPartnerId} (level: ${partnerData.level})`);
          break;
        }

        // 상위 파트너로 이동
        currentPartnerId = partnerData.parent_id;
        iterations++;
      }

      if (iterations >= maxIterations) {
        console.error(`❌ [보유금 동기화] 최상위 파트너 찾기 실패 (무한 루프 방지)`);
        return;
      }

      // 4. ⭐ 게임 세션의 api_type 확인 (어떤 API로 게임 중인지)
      const { data: sessionData, error: sessionDataError } = await supabase
        .from('game_launch_sessions')
        .select('api_type')
        .eq('id', sessionId)
        .single();

      if (sessionDataError || !sessionData) {
        console.error(`❌ [보유금 동기화] 세션 api_type 조회 실패:`, sessionDataError);
        return;
      }

      // 5. ⭐ Lv1 파트너의 api_configs에서 credential 조회 (api_provider 필터링)
      const { data: apiConfig, error: configError } = await supabase
        .from('api_configs')
        .select('opcode, token, secret_key')
        .eq('partner_id', topLevelPartnerId)
        .eq('api_provider', sessionData.api_type === 'invest' ? 'invest' : 'oroplay')
        .single();

      if (configError || !apiConfig || !apiConfig.opcode || !apiConfig.token || !apiConfig.secret_key) {
        console.error(`❌ [보유금 동기화] API 설정 누락: partner_id=${topLevelPartnerId}, api_type=${sessionData.api_type}`, configError);
        return;
      }

      console.log(`   📍 사용 credential: partner_id=${topLevelPartnerId}, api_type=${sessionData.api_type}`);

      // 6. 보유금 조회
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

        console.log(`✅ [보유금 동기화] 완료: 세션 ${sessionId}, 잔고 ${balanceResult.balance}`);
      } else {
        console.error(`❌ [보유금 동기화] API 실패: ${balanceResult.error}`);
      }
    } catch (error) {
      console.error(`❌ [보유금 동기화] 오류:`, error);
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
        console.log('🔄 [게임창 닫힘] 세션 종료:', sessionId);
        
        // ⭐ 1. 세션 정보 조회 (user_id, api_type, status 확인)
        const { data: session, error: sessionError } = await supabase
          .from('game_launch_sessions')
          .select('user_id, api_type, status')
          .eq('id', sessionId)
          .single();

        if (sessionError || !session) {
          console.error('❌ [게임창 닫힘] 세션 조회 실패:', sessionError);
          return;
        }

        // ⭐ FINAL_FLOW: ready 또는 active 상태만 처리 (이미 종료된 세션은 무시)
        if (!['ready', 'active'].includes(session.status)) {
          console.log(`⏭️ [게임창 닫힘] 이미 종료된 세션: status=${session.status}`);
          return;
        }

        // ⭐ 2. lib/gameApi.ts의 syncBalanceOnSessionEnd 호출 (완전한 출금 로직)
        const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
        await syncBalanceOnSessionEnd(session.user_id, session.api_type);
        
        console.log('✅ [게임창 닫힘] 처리 완료');
      } catch (error) {
        console.error('❌ [게임창 닫힘 오류]:', error);
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

    console.log('🔴 [세션 감지] 구독 시작:', user.id);

    sessionChannelRef.current = supabase
      .channel(`session_status_${user.id}`)
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

          // ⭐ FINAL_FLOW: active/ready → ended/force_ended 감지
          if (['active', 'ready'].includes(oldSession?.status) && 
              ['ended', 'force_ended'].includes(newSession.status)) {
            
            console.log('🛑 [세션 종료]', newSession.id, newSession.status);
            
            // 게임창 닫기
            (window as any).forceCloseGameWindow?.(newSession.id);
            
            // 보유금 동기화
            await syncBalanceForSession(newSession.id);
            
            // 알림
            if (newSession.status === 'force_ended') {
              toast.error('네트워크 오류가 발생 되었습니다. 다시 시작해 주세요');
            }
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔴 [세션 감지] 구독 종료');
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

    console.log('⏰ [자동 로그아웃] 시작');

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
          console.log('🚪 [자동 로그아웃] 30분 경과');
          
          await supabase
            .from('users')
            .update({ is_online: false })
            .eq('id', user.id);

          onLogout();
        }
      } catch (err) {
        console.error('❌ [자동 로그아웃] 오류:', err);
      }
    };

    checkAutoLogout();
    autoLogoutTimerRef.current = setInterval(checkAutoLogout, 10000);

    return () => {
      console.log('🛑 [자동 로그아웃] 종료');
      if (autoLogoutTimerRef.current) {
        clearInterval(autoLogoutTimerRef.current);
      }
    };
  }, [user?.id, onLogout]);

  // ==========================================================================
  // 온라인 상태 모니터링
  // ==========================================================================
  useEffect(() => {
    if (!user?.id) return;

    console.log('👤 [온라인 상태] 모니터링 시작');

    onlineChannelRef.current = supabase
      .channel(`user_online_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          const { new: newUser, old: oldUser } = payload as any;

          if (oldUser?.is_online === true && newUser?.is_online === false) {
            console.log('⚠️ [자동 로그아웃] 오프라인 전환 감지');
            onLogout();
          }
        }
      )
      .subscribe();

    return () => {
      console.log('👤 [온라인 상태] 종료');
      if (onlineChannelRef.current) {
        supabase.removeChannel(onlineChannelRef.current);
        onlineChannelRef.current = null;
      }
    };
  }, [user?.id, onLogout]);

  return (
    <div className="min-h-screen casino-gradient-bg overflow-x-hidden">
      {/* VIP 상단 빛 효과 */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-yellow-500/10 via-red-500/5 to-transparent pointer-events-none" />
      
      <UserHeader 
        user={user}
        currentRoute={currentRoute}
        onRouteChange={onRouteChange}
        onLogout={onLogout}
      />
      
      <UserMessagePopup userId={user.id} />
      <UserBannerPopup userId={user.id} />
      
      <main className="relative pb-32 lg:pb-4 pt-20 lg:pt-20 overflow-x-hidden">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 relative z-10 max-w-full">
          {children}
        </div>
      </main>

      {/* 하단 그라데이션 */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/50 to-transparent pointer-events-none z-0" />
    </div>
  );
}

export default UserLayout;