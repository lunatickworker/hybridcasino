import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Partner } from '../../types';

interface GameSessionMonitorProps {
  user: Partner;
}

/**
 * 게임 세션 상태 전환 모니터링 (세션 관리 전용)
 * 
 * 세션 상태 플로우:
 * 1. ready → active (첫 베팅 발견)
 * 2. active → paused (4분 베팅 없음, 게임창 열려있음)
 * 3. paused → active (베팅 재개)
 * 
 * ⚠️ Lv1, Lv2만 사용 (시스템관리자, 대본사)
 * ⚠️ 베팅 동기화는 AdminGameRecordsSync가 담당
 */
const monitorSessionStates = async () => {
  try {
    const now = new Date();
    const fourMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000);

    // 1. ready → active (첫 베팅 발견 시)
    const { data: readySessions } = await supabase
      .from('game_launch_sessions')
      .select('*, users!inner(username)')
      .eq('status', 'ready');

    if (readySessions && readySessions.length > 0) {
      for (const session of readySessions) {
        // 최근 30초 이내 베팅 기록 확인
        const { data: recentBets } = await supabase
          .from('game_records')
          .select('played_at')
          .eq('user_id', session.user_id)
          .gte('played_at', new Date(now.getTime() - 30 * 1000).toISOString())
          .limit(1);

        if (recentBets && recentBets.length > 0) {
          // ready → active 전환
          await supabase
            .from('game_launch_sessions')
            .update({
              status: 'active',
              last_bet_at: recentBets[0].played_at,
              last_bet_checked_at: now.toISOString(),
              last_activity_at: now.toISOString(),
              ready_status: null
            })
            .eq('id', session.id);

          console.log(`✅ [SESSION] ready → active: user=${session.users?.username}`);
        }
      }
    }

    // 2. active → paused (4분 베팅 없음)
    const { data: activeSessions } = await supabase
      .from('game_launch_sessions')
      .select('*, users!inner(username)')
      .eq('status', 'active')
      .not('last_bet_at', 'is', null)
      .lt('last_bet_at', fourMinutesAgo.toISOString());

    if (activeSessions && activeSessions.length > 0) {
      for (const session of activeSessions) {
        // active → paused 전환
        await supabase
          .from('game_launch_sessions')
          .update({
            status: 'paused',
            last_bet_checked_at: now.toISOString(),
            last_activity_at: now.toISOString()
          })
          .eq('id', session.id);

        console.log(`✅ [SESSION] active → paused: user=${session.users?.username}`);
      }
    }

    // 3. paused → active (베팅 재개)
    const { data: pausedSessions } = await supabase
      .from('game_launch_sessions')
      .select('*, users!inner(username)')
      .eq('status', 'paused');

    if (pausedSessions && pausedSessions.length > 0) {
      for (const session of pausedSessions) {
        // 최근 30초 이내 베팅 기록 확인
        const { data: recentBets } = await supabase
          .from('game_records')
          .select('played_at')
          .eq('user_id', session.user_id)
          .gte('played_at', new Date(now.getTime() - 30 * 1000).toISOString())
          .limit(1);

        if (recentBets && recentBets.length > 0) {
          // paused → active 전환
          await supabase
            .from('game_launch_sessions')
            .update({
              status: 'active',
              last_bet_at: recentBets[0].played_at,
              last_bet_checked_at: now.toISOString(),
              last_activity_at: now.toISOString()
            })
            .eq('id', session.id);

          console.log(`✅ [SESSION] paused → active: user=${session.users?.username}`);
        }
      }
    }

    return;
  } catch (error) {
    console.error('❌ [SESSION-MONITOR] 세션 상태 모니터링 오류:', error);
  }
};

/**
 * 게임 세션 상태 모니터링 컴포넌트
 * - Lv1, Lv2만 사용 (세션 상태 관리 권한)
 * - 30초마다 세션 상태 전환 체크
 * - 베팅 동기화는 AdminGameRecordsSync가 담당
 */
export function GameSessionMonitor({ user }: GameSessionMonitorProps) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Lv1, Lv2 권한 체크
    if (user.level !== 1 && user.level !== 2) {
      console.warn('⛔ [SESSION-MONITOR] Lv1, Lv2만 사용 가능 (현재:', user.level, ')');
      return;
    }

    console.log('🎯 [SESSION-MONITOR] 세션 상태 모니터링 시작 (30초 간격)');

    // 기존 interval이 있으면 제거
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 즉시 1회 실행
    monitorSessionStates();

    // 30초마다 세션 상태 모니터링
    intervalRef.current = setInterval(() => {
      monitorSessionStates();
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user.level]);

  return null;
}
