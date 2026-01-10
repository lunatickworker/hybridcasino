import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { syncBalanceOnSessionEnd } from '../lib/gameApi';

/**
 * SessionTimeoutManager
 * 
 * 역할:
 * 1. 5분 무활동 시 자동 종료 (auto_ended) - 1분 주기 체크
 * 2. auto_ended 세션 30분 후 DB 삭제
 * 3. ended/force_ended 세션 30분 후 DB 삭제
 * 
 * UI 없음, 백그라운드 작업만 수행
 */
export function SessionTimeoutManager() {
  useEffect(() => {
    // 1분마다 5분 무활동 체크
    const activityInterval = setInterval(handleInactivityTimeout, 60 * 1000);
    
    // 10분마다 오래된 세션 삭제 (30분 경과)
    const cleanupInterval = setInterval(cleanupEndedSessions, 10 * 60 * 1000);
    
    // 컴포넌트 마운트 시 즉시 1회 실행
    handleInactivityTimeout();
    cleanupEndedSessions();
    
    return () => {
      clearInterval(activityInterval);
      clearInterval(cleanupInterval);
    };
  }, []);
  
  return null;
}

/**
 * 5분 무활동 시 자동 종료 (active → auto_ended)
 */
async function handleInactivityTimeout() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // active 상태이면서 5분간 활동 없는 세션 조회
    const { data: inactiveSessions, error: selectError } = await supabase
      .from('game_launch_sessions')
      .select('id, user_id, api_type')
      .eq('status', 'active')
      .lt('last_activity_at', fiveMinutesAgo.toISOString());
    
    if (selectError) {
      // Supabase 연결 안 됨 - 조용히 실패
      if (selectError?.message?.includes('Failed to fetch')) return;
      console.error('❌ 무활동 세션 조회 실패:', selectError);
      return;
    }
    
    if (!inactiveSessions || inactiveSessions.length === 0) {
      return;
    }
    
    console.log(`⏰ ${inactiveSessions.length}개 세션 5분 무활동 감지`);
    console.log('🔍 조회된 세션 데이터:', inactiveSessions);
    
    // 세션 auto_ended로 변경
    const now = new Date().toISOString();
    
    // ✅ null ID 필터링
    const sessionIds = inactiveSessions
      .map(s => s.id)
      .filter(id => id != null);
    
    if (sessionIds.length === 0) {
      console.error('❌ 유효한 세션 ID가 없습니다');
      console.error('🔍 원본 데이터:', JSON.stringify(inactiveSessions));
      return;
    }
    
    console.log('🔍 업데이트할 세션 ID들:', sessionIds);
    console.log('🔍 ended_at 값:', now, '타입:', typeof now);
    
    // ✅ 하나씩 업데이트 (디버깅용)
    for (const sessionId of sessionIds) {
      const { error: updateError } = await supabase
        .from('game_launch_sessions')
        .update({
          status: 'auto_ended',
          ended_at: now,
        })
        .eq('id', sessionId);
      
      if (updateError) {
        console.error(`❌ 세션 ${sessionId} 자동 종료 실패:`, {
          error: updateError,
          sessionId,
          now,
          sessionIdType: typeof sessionId,
          nowType: typeof now,
        });
      }
    }
    
    console.log(`✅ ${sessionIds.length}개 세션 자동 종료 완료`);
    
    // 각 사용자 보유금 동기화 (백그라운드)
    for (const session of inactiveSessions) {
      if (session.user_id && session.api_type) {
        syncBalanceOnSessionEnd(session.user_id, session.api_type).catch(err => {
          console.error('❌ [자동 종료] 보유금 동기화 실패:', err);
        });
      }
    }
  } catch (error) {
    console.error('❌ handleInactivityTimeout 실패:', error);
  }
}

/**
 * ended/force_ended/auto_ended 세션 30분 후 DB 삭제
 */
async function cleanupEndedSessions() {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    console.log('🔍 [cleanupEndedSessions] 30분 기준:', thirtyMinutesAgo.toISOString());
    
    // ✅ ended_at이 NULL이 아닌 세션만 삭제
    const { data: deletedSessions, error } = await supabase
      .from('game_launch_sessions')
      .delete()
      .in('status', ['ended', 'force_ended', 'auto_ended'])
      .not('ended_at', 'is', null) // ended_at이 NULL이 아닌 것만
      .lt('ended_at', thirtyMinutesAgo.toISOString())
      .select('id');
    
    if (error) {
      // Supabase 연결 안 됨 - 조용히 실패
      if (error?.message?.includes('Failed to fetch')) return;
      console.error('❌ ended 세션 삭제 실패:', error);
      return;
    }
    
    if (deletedSessions && deletedSessions.length > 0) {
      console.log(`🗑️ ${deletedSessions.length}개 종료 세션 삭제 완료 (30분 경과)`);
    }
  } catch (error) {
    console.error('❌ cleanupEndedSessions 실패:', error);
  }
}