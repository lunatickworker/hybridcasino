import { createContext, useContext, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

const SessionCleanupContext = createContext<null>(null);

export function SessionCleanupProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // 초기 실행
    cleanupOldSessions();
    
    // 1시간마다 실행 (3600000ms)
    const cleanupInterval = setInterval(async () => {
      await cleanupOldSessions();
    }, 3600000);
    
    return () => clearInterval(cleanupInterval);
  }, []);
  
  const cleanupOldSessions = async () => {
    try {
      const { data, error } = await supabase
        .rpc('cleanup_old_ended_sessions');
      
      if (error) {
        console.error('세션 정리 실패:', error);
      } else if (data && data > 0) {
        console.log(`🗑️ ${data}개 세션 정리 완료 (4시간 경과)`);
      }
    } catch (err) {
      console.error('세션 정리 오류:', err);
    }
  };
  
  return (
    <SessionCleanupContext.Provider value={null}>
      {children}
    </SessionCleanupContext.Provider>
  );
}
