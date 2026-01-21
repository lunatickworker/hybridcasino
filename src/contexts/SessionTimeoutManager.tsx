import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * SessionTimeoutManager
 * 
 * 역할:
 * 1. ended/force_ended 세션 30분 후 DB 삭제
 * 
 * UI 없음, 백그라운드 작업만 수행
 */
export function SessionTimeoutManager() {
  useEffect(() => {
    // 10분마다 오래된 세션 삭제 (30분 경과)
    const cleanupInterval = setInterval(cleanupEndedSessions, 10 * 60 * 1000);
    
    // 컴포넌트 마운트 시 즉시 1회 실행
    cleanupEndedSessions();
    
    return () => {
      clearInterval(cleanupInterval);
    };
  }, []);
  
  return null;
}

/**
 * ended/force_ended 세션 30분 후 DB 삭제
 */
async function cleanupEndedSessions() {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    console.log('🔍 [cleanupEndedSessions] 30분 기준:', thirtyMinutesAgo.toISOString());
    
    // ✅ ended_at이 NULL이 아닌 세션만 삭제
    const { data: deletedSessions, error } = await supabase
      .from('game_launch_sessions')
      .delete()
      .in('status', ['ended', 'force_ended'])
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