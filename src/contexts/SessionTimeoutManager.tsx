import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { syncBalanceOnSessionEnd } from '../lib/gameApi';

/**
 * SessionTimeoutManager
 * 
 * 역할:
 * 1. ready 10분 타임아웃 체크 (1분 주기)
 * 2. ended/force_ended 세션 1시간 후 DB 삭제 (1시간 주기)
 * 
 * UI 없음, 백그라운드 작업만 수행
 */
export function SessionTimeoutManager() {
  useEffect(() => {
    // 1분마다 ready 타임아웃 체크
    const readyInterval = setInterval(handleReadyTimeout, 60 * 1000);
    
    // 1시간마다 ended 세션 삭제
    const cleanupInterval = setInterval(cleanupEndedSessions, 60 * 60 * 1000);
    
    // 컴포넌트 마운트 시 즉시 1회 실행
    handleReadyTimeout();
    cleanupEndedSessions();
    
    return () => {
      clearInterval(readyInterval);
      clearInterval(cleanupInterval);
    };
  }, []);
  
  return null;
}

/**
 * ready 상태 타임아웃 처리 (비활성화)
 * ⚠️ ready 상태가 제거되어 더 이상 사용하지 않음
 */
async function handleReadyTimeout() {
  // ready 상태가 제거되어 이 함수는 더 이상 사용되지 않습니다.
  return;
}

/**
 * ended/force_ended 세션 1시간 후 DB 삭제
 */
async function cleanupEndedSessions() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const { data: deletedSessions, error } = await supabase
      .from('game_launch_sessions')
      .delete()
      .in('status', ['ended', 'force_ended'])
      .lt('ended_at', oneHourAgo.toISOString())
      .select('id');
    
    if (error) {
      // Supabase 연결 안 됨 - 조용히 실패
      if (error?.message?.includes('Failed to fetch')) return;
      console.error('❌ ended 세션 삭제 실패:', error);
      return;
    }
    
    if (deletedSessions && deletedSessions.length > 0) {
      console.log(`🗑️ ended 세션 ${deletedSessions.length}개 삭제 완료`);
    }
  } catch (error) {
    console.error('❌ cleanupEndedSessions 실패:', error);
  }
}