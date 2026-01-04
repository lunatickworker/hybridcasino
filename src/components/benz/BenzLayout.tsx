import { ReactNode, useEffect, useRef, useState, cloneElement, ReactElement, isValidElement } from "react";
import { BenzHeader } from "./BenzHeader";
import { BenzSidebar } from "./BenzSidebar";
import { BenzMessagePopup } from "./BenzMessagePopup";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { getUserBalanceWithConfig } from "../../lib/investApi";

interface BenzLayoutProps {
  user: any;
  currentRoute: string;
  onRouteChange: (route: string) => void;
  onLogout: () => void;
  onOpenLoginModal?: () => void;
  onOpenSignupModal?: () => void;
  children: ReactNode;
}

interface UserBalance {
  balance: number;
  points: number;
}

export function BenzLayout({ user, currentRoute, onRouteChange, onLogout, onOpenLoginModal, onOpenSignupModal, children }: BenzLayoutProps) {
  const [userBalance, setUserBalance] = useState<UserBalance>({ balance: 0, points: 0 });
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);
  const [showPointDialog, setShowPointDialog] = useState(false); // ⭐ 포인트 모달 상태 관리
  const syncingSessionsRef = useRef<Set<number>>(new Set());
  const autoLogoutTimerRef = useRef<NodeJS.Timeout>();
  const sessionChannelRef = useRef<any>(null);
  const onlineChannelRef = useRef<any>(null);
  const balanceChannelRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const inactivityTimerRef = useRef<NodeJS.Timeout>(); // ⏰ 비활성 타이머

  // ==========================================================================
  // 화면 크기 감지
  // ==========================================================================
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ==========================================================================
  // 보유금 조회 함수
  // ==========================================================================
  const fetchBalance = async () => {
    if (!user?.id || !isMountedRef.current) return;
    
    console.log('🔍 [Benz] 보유금 조회 시작 - user_id:', user.id);
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('balance, points')
        .eq('id', user.id)
        .single();

      console.log('📊 [Benz] DB 조회 결과:', { data, error });

      if (error) {
        console.error('❌ [Benz] 보유금 조회 오류:', error);
        throw error;
      }
      
      if (data && isMountedRef.current) {
        const newBalance = {
          balance: parseFloat(data.balance) || 0,
          points: parseFloat(data.points) || 0
        };
        
        console.log('✅ [Benz] 보유금 설정:', newBalance);
        setUserBalance(newBalance);
      }
    } catch (error) {
      console.error('❌ [Benz] 잔고 조회 오류:', error);
    }
  };

  // ==========================================================================
  // 보유금 실시간 구독
  // ==========================================================================
  useEffect(() => {
    if (!user?.id) {
      // ⚠️ 로그인 전에는 정상적으로 user가 없음 (경고 레벨로 변경)
      return; // 조용히 종료
    }

    // ⭐ 컴포넌트 마운트 상태 초기화
    isMountedRef.current = true;

    console.log('🔵 [Benz] 보유금 실시간 구독 시작:', {
      userId: user.id,
      username: user.username,
      channelName: `benz_user_balance_${user.id}`
    });

    // 초기 잔고 조회
    fetchBalance();

    // ⭐ UserHeader와 완전히 동일한 방식으로 구독 (filter 사용)
    balanceChannelRef.current = supabase
      .channel(`benz_user_balance_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`  // ⭐ filter 복원
        },
        (payload) => {
          console.log('💰💰💰 [Benz] ========================================');
          console.log('💰 [Benz] Realtime 보유금 업데이트 수신!!!');
          console.log('💰 [Benz] Payload:', JSON.stringify(payload, null, 2));
          console.log('💰 [Benz] isMountedRef.current:', isMountedRef.current);
          console.log('💰💰💰 [Benz] ========================================');
          
          if (isMountedRef.current) {
            const newData = payload.new as any;
            const newBalance = {
              balance: parseFloat(newData.balance) || 0,
              points: parseFloat(newData.points) || 0
            };
            
            console.log('✅ [Benz] 보유금 상태 업데이트:', newBalance);
            setUserBalance(newBalance);
          } else {
            console.warn('⚠️ [Benz] 컴포넌트 언마운트됨 - 업데이트 스킵');
          }
        }
      )
      .subscribe((status, err) => {
        console.log('📡📡📡 [Benz] ========================================');
        console.log('📡 [Benz] Realtime 구독 상태 변경:', status);
        if (err) {
          console.error('❌ [Benz] Realtime 구독 오류:', err);
        }
        console.log('📡📡📡 [Benz] ========================================');
      });

    return () => {
      console.log('🔴 [Benz] 보유금 실시간 구독 해제:', user.id);
      isMountedRef.current = false;
      if (balanceChannelRef.current) {
        supabase.removeChannel(balanceChannelRef.current);
        balanceChannelRef.current = null;
      }
    };
  }, [user?.id]);

  // ==========================================================================
  // 보유금 동기화 함수 (단순 조회만 - Realtime ended 이벤트용)
  // ==========================================================================
  const syncBalanceForSession = async (sessionId: number) => {
    if (syncingSessionsRef.current.has(sessionId)) {
      console.log(`⏭️ [Benz 보유금 동기화] 이미 진행 중: 세션 ${sessionId}`);
      return;
    }

    try {
      syncingSessionsRef.current.add(sessionId);
      console.log(`💰 [Benz 보유금 동기화] 시작: 세션 ${sessionId}`);

      // 1. 세션 정보 조회
      const { data: session, error: sessionError } = await supabase
        .from('game_launch_sessions')
        .select('user_id, status')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        console.error(`❌ [Benz 보유금 동기화] 세션 조회 실패:`, sessionError);
        return;
      }

      // status='active'인 세션만 동기화
      if (session.status !== 'active') {
        console.log(`⏭️ [Benz 보유금 동기화] 스킵 (세션 ${sessionId}): status=${session.status}`);
        return;
      }

      // 2. 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('username, referrer_id')
        .eq('id', session.user_id)
        .single();

      if (userError || !userData) {
        console.error(`❌ [Benz 보유금 동기화] 사용자 정보 조회 실패:`, userError);
        return;
      }

      const username = userData.username;

      // 3. referrer_id를 따라 최상위 Lv1 파트너 찾기
      let currentPartnerId = userData.referrer_id;
      if (!currentPartnerId) {
        console.error(`❌ [Benz 보유금 동기화] referrer_id 없음: user_id=${session.user_id}`);
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
          console.error(`❌ [Benz 보유금 동기화] 파트너 정보 없음: partner_id=${currentPartnerId}`);
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
        console.error(`❌ [Benz 보유금 동기화] 최상위 파트너 찾기 실패`);
        return;
      }

      // 4. 게임 세션의 api_type 확인
      const { data: sessionData, error: sessionDataError } = await supabase
        .from('game_launch_sessions')
        .select('api_type')
        .eq('id', sessionId)
        .single();

      if (sessionDataError || !sessionData) {
        console.error(`❌ [Benz 보유금 동기화] 세션 api_type 조회 실패:`, sessionDataError);
        return;
      }

      // 5. Lv1 파트너의 api_configs에서 credential 조회
      const apiProvider = sessionData.api_type === 'invest' ? 'invest' : 
                         sessionData.api_type === 'oroplay' ? 'oroplay' :
                         sessionData.api_type === 'familyapi' ? 'familyapi' : 'honorapi';
      
      const { data: apiConfig, error: configError } = await supabase
        .from('api_configs')
        .select('opcode, token, secret_key')
        .eq('partner_id', topLevelPartnerId)
        .eq('api_provider', apiProvider)
        .single();

      if (configError || !apiConfig || !apiConfig.opcode || !apiConfig.token || !apiConfig.secret_key) {
        console.error(`❌ [Benz 보유금 동기화] API 설정 누락: partner_id=${topLevelPartnerId}, api_type=${sessionData.api_type}`, configError);
        return;
      }

      console.log(`   📍 사용 credential: partner_id=${topLevelPartnerId}, api_type=${sessionData.api_type}`);

      // 6. 보유금 조회 (출금 없이 조회만)
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

        console.log(`✅ [Benz 보유금 동기화] 완료: 세션 ${sessionId}, 잔고 ${balanceResult.balance}`);
      } else {
        console.error(`❌ [Benz 보유금 동기화] API 실패: ${balanceResult.error}`);
      }
    } catch (error) {
      console.error(`❌ [Benz 보유금 동기화] 오류:`, error);
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
        console.log('🔄 [Benz 게임창 닫힘] 세션 종료:', sessionId);
        
        // ⭐ 1. 세션 정보 조회 (user_id, api_type, status 확인)
        const { data: session, error: sessionError } = await supabase
          .from('game_launch_sessions')
          .select('user_id, api_type, status')
          .eq('id', sessionId)
          .single();

        if (sessionError || !session) {
          console.error('❌ [Benz 게임창 닫힘] 세션 조회 실패:', sessionError);
          return;
        }

        // ⭐ active 상태만 처리 (ending/ended 세션은 무시)
        if (session.status !== 'active') {
          console.log(`⏭️ [Benz 게임창 닫힘] 이미 종료 중이거나 종료된 세션: status=${session.status}`);
          return;
        }

        // ⭐ 중복 실행 방지
        if (syncingSessionsRef.current.has(sessionId)) {
          console.log(`⏭️ [Benz 게임창 닫힘] 이미 처리 중인 세션: ${sessionId}`);
          return;
        }

        syncingSessionsRef.current.add(sessionId);

        try {
          // ⭐ 2. lib/gameApi.ts의 syncBalanceOnSessionEnd 호출 (완전한 출금 로직)
          const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
          await syncBalanceOnSessionEnd(session.user_id, session.api_type);
          
          console.log('✅ [Benz 게임창 닫힘] 처리 완료');
        } finally {
          syncingSessionsRef.current.delete(sessionId);
        }
      } catch (error) {
        console.error('❌ [Benz 게임창 닫힘 오류]:', error);
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
          console.error('❌ [Benz 세션 종료 실패]:', e);
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

    console.log('🔴 [Benz 세션 감지] 구독 시작:', user.id);

    sessionChannelRef.current = supabase
      .channel(`benz_session_status_${user.id}`)
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
            
            console.log('🛑 [Benz 세션 종료]', newSession.id, newSession.status);
            
            // 게임창 닫기
            (window as any).forceCloseGameWindow?.(newSession.id);
            
            // 보유금 동기화
            await syncBalanceForSession(newSession.id);
            
            if (newSession.status === 'force_ended') {
              toast.error('네트워크 오류가 발생 되었습니다. 다시 시작해 주세요');
            }
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔴 [Benz 세션 감지] 구독 종료');
      if (sessionChannelRef.current) {
        supabase.removeChannel(sessionChannelRef.current);
        sessionChannelRef.current = null;
      }
    };
  }, [user?.id]);

  // ==========================================================================
  // 1분 30초 비활성 시 자동 로그아웃 (⚠️ 임시 비활성화)
  // ==========================================================================
  // useEffect(() => {
  //   if (!user?.id) return;

  //   console.log('⏰ [Benz 자동 로그아웃] 1분 30초 타이머 시작');

  //   // 1분 30초 = 90초 = 90000ms
  //   inactivityTimerRef.current = setTimeout(() => {
  //     console.log('⏰ [Benz 자동 로그아웃] 1분 30초 경과 - 로그아웃 실행');
  //     toast.info('세션이 만료되었습니다.');
  //     onLogout();
  //   }, 90000);

  //   return () => {
  //     if (inactivityTimerRef.current) {
  //       console.log('⏰ [Benz 자동 로그아웃] 타이머 정리');
  //       clearTimeout(inactivityTimerRef.current);
  //     }
  //   };
  // }, [user?.id, onLogout]);

  // ==========================================================================
  // 30분 무활동 시 자동 로그아웃 (⚠️ 임시 비활성화)
  // ==========================================================================
  // useEffect(() => {
  //   if (!user?.id) return;

  //   const checkAutoLogout = async () => {
  //     try {
  //       const { data: userData, error } = await supabase
  //         .from('users')
  //         .select('balance_sync_started_at, is_online')
  //         .eq('id', user.id)
  //         .single();

  //       if (error || !userData?.is_online || !userData.balance_sync_started_at) {
  //         return;
  //       }

  //       const startedAt = new Date(userData.balance_sync_started_at);
  //       const now = new Date();
  //       const elapsedMinutes = (now.getTime() - startedAt.getTime()) / 1000 / 60;

  //       if (elapsedMinutes >= 30) {
  //         await supabase
  //           .from('users')
  //           .update({ is_online: false })
  //           .eq('id', user.id);

  //         onLogout();
  //       }
  //     } catch (err) {
  //       console.error('❌ [Benz 자동 로그아웃 체크 오류]:', err);
  //     }
  //   };

  //   autoLogoutTimerRef.current = setInterval(checkAutoLogout, 10000);

  //   return () => {
  //     if (autoLogoutTimerRef.current) {
  //       clearInterval(autoLogoutTimerRef.current);
  //     }
  //   };
  // }, [user?.id, onLogout]);

  // ==========================================================================
  // 온라인 상태 모니터링 (Realtime)
  // ==========================================================================
  useEffect(() => {
    if (!user?.id) return;

    onlineChannelRef.current = supabase
      .channel(`benz_online_status_${user.id}`)
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
            // toast.error('다른 기기에서 로그인되어 로그아웃됩니다.'); // ✅ 토스트 메시지 제거
            setTimeout(() => {
              onLogout();
            }, 1000);
          }
        }
      )
      .subscribe();

    return () => {
      if (onlineChannelRef.current) {
        supabase.removeChannel(onlineChannelRef.current);
        onlineChannelRef.current = null;
      }
    };
  }, [user?.id, onLogout]);

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#141414' }}>
      {/* Header */}
      <BenzHeader 
        user={user}
        onRouteChange={onRouteChange}
        onLogout={onLogout}
        onOpenLoginModal={onOpenLoginModal}
        onOpenSignupModal={onOpenSignupModal}
        balance={userBalance.balance}
        points={userBalance.points}
        showPointDialog={showPointDialog}
        onPointDialogChange={setShowPointDialog}
      />
      
      <div className="flex pt-16 md:pt-20">
        {/* Sidebar */}
        <BenzSidebar 
          user={user}
          currentRoute={currentRoute}
          onRouteChange={onRouteChange}
        />
        
        {/* Main Content - children에 포인트 모달 함수 전달 */}
        <main className="flex-1 transition-all duration-300 overflow-x-hidden md:ml-80">
          {isValidElement(children) ? 
            cloneElement(children as ReactElement<any>, { 
              onOpenPointModal: () => setShowPointDialog(true) 
            }) 
            : children
          }
        </main>
      </div>

      {/* TODO: 배너 팝업 및 메시지 팝업 추가 예정 */}
      {user?.id && <BenzMessagePopup userId={user.id} />}
    </div>
  );
}

export default BenzLayout;