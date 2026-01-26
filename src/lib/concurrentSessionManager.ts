import { supabase } from './supabase';

/**
 * 게임 세션 관리자
 * 동접 제한 기능을 제공합니다
 */

/**
 * 최대 동접 사용자 수 조회 (운영사별)
 * @param userId 사용자 ID (옵션)
 */
export async function getMaxConcurrentUsers(userId?: string): Promise<number> {
  try {
    // 사용자 ID가 제공된 경우, 사용자의 운영사 정보 조회
    if (userId) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('referrer_id')
        .eq('id', userId)
        .single();

      if (!userError && userData?.referrer_id) {
        // 해당 운영사의 동접 제한 설정 조회
        const { data: partnerLimit, error: limitError } = await supabase
          .from('partner_concurrent_limits')
          .select('max_concurrent_users')
          .eq('partner_id', userData.referrer_id)
          .single();

        if (!limitError && partnerLimit?.max_concurrent_users) {
          console.log(`✅ 운영사별 동접 제한 조회: ${userData.referrer_id} - ${partnerLimit.max_concurrent_users}`);
          return partnerLimit.max_concurrent_users;
        }
      }
    }

    // 운영사별 설정이 없는 경우, 전체 시스템 설정 조회
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'max_concurrent_users_global')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('최대 동접 수 조회 실패:', error);
      return 5000; // 기본값
    }

    return data ? parseInt(data.setting_value) || 5000 : 5000;
  } catch (error) {
    console.error('최대 동접 수 조회 중 오류:', error);
    return 5000; // 기본값
  }
}

/**
 * 동접 체크 및 게임 세션 생성
 * @param userId 사용자 ID
 * @param gameType 게임 타입 (pragmatic, invest, oroplay 등)
 * @returns { success: boolean, sessionId?: string, message: string, currentSessions?: number, maxAllowed?: number }
 */
export async function checkAndCreateGameSession(
  userId: string,
  gameType: string
): Promise<{
  success: boolean;
  sessionId?: string;
  message: string;
  currentSessions?: number;
  maxAllowed?: number;
}> {
  try {
    // 1. 사용자의 운영사에 맞는 최대 동접 사용자 수 조회
    const maxConcurrent = await getMaxConcurrentUsers(userId);

    // 2. RPC 함수 호출 (동접 체크 + 세션 생성을 원자적으로 처리)
    const { data, error } = await supabase.rpc('check_and_create_game_session', {
      p_user_id: userId,
      p_game_type: gameType,
      p_max_concurrent: maxConcurrent
    });

    if (error) {
      console.error('❌ RPC 함수 호출 실패:', error);
      return {
        success: false,
        message: '동접 제한 확인 중 오류가 발생했습니다',
      };
    }

    if (!data?.success) {
      console.warn('⚠️ 동접 제한 초과:', data);
      return {
        success: false,
        message: data?.message || '동접 제한을 초과했습니다',
        currentSessions: data?.current_sessions,
        maxAllowed: data?.max_allowed
      };
    }

    console.log('✅ 게임 세션 생성 성공:', {
      sessionId: data.session_id,
      currentSessions: data.current_sessions,
      maxAllowed: data.max_allowed
    });

    return {
      success: true,
      sessionId: data.session_id,
      message: data.message,
      currentSessions: data.current_sessions,
      maxAllowed: data.max_allowed
    };
  } catch (error) {
    console.error('❌ 동접 세션 생성 중 오류:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '예기치 않은 오류가 발생했습니다'
    };
  }
}

/**
 * 게임 세션 종료
 * @param sessionId 세션 ID
 */
export async function endGameSession(sessionId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const { data, error } = await supabase.rpc('end_game_session', {
      p_session_id: sessionId
    });

    if (error) {
      console.error('❌ 게임 세션 종료 실패:', error);
      return {
        success: false,
        message: '세션 종료 중 오류가 발생했습니다'
      };
    }

    console.log('✅ 게임 세션 종료 성공:', sessionId);

    return {
      success: true,
      message: data?.message || '세션 종료 완료'
    };
  } catch (error) {
    console.error('❌ 게임 세션 종료 중 오류:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '예기치 않은 오류가 발생했습니다'
    };
  }
}

/**
 * 사용자의 현재 활성 세션 수 조회
 * @param userId 사용자 ID
 */
export async function getUserActiveSessions(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_user_active_sessions_count', {
      p_user_id: userId
    });

    if (error) {
      console.error('활성 세션 조회 실패:', error);
      return 0;
    }

    return data?.active_sessions || 0;
  } catch (error) {
    console.error('활성 세션 조회 중 오류:', error);
    return 0;
  }
}

/**
 * 게임 세션 ID를 localStorage에 저장 (게임 창 종료 시 정리용)
 */
export function saveGameSessionId(userId: string, sessionId: string, gameType: string): void {
  try {
    const key = `game_session_${userId}`;
    const sessions = JSON.parse(localStorage.getItem(key) || '[]') as Array<{
      sessionId: string;
      gameType: string;
      createdAt: string;
    }>;

    sessions.push({
      sessionId,
      gameType,
      createdAt: new Date().toISOString()
    });

    // 최대 10개 세션만 유지 (메모리 절약)
    if (sessions.length > 10) {
      sessions.shift();
    }

    localStorage.setItem(key, JSON.stringify(sessions));
  } catch (error) {
    console.warn('게임 세션 ID 저장 실패:', error);
  }
}

/**
 * 게임 세션 ID를 localStorage에서 로드
 */
export function getGameSessionIds(userId: string): Array<{
  sessionId: string;
  gameType: string;
  createdAt: string;
}> {
  try {
    const key = `game_session_${userId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (error) {
    console.warn('게임 세션 ID 로드 실패:', error);
    return [];
  }
}

/**
 * 특정 세션 ID를 localStorage에서 제거
 */
export function removeGameSessionId(userId: string, sessionId: string): void {
  try {
    const key = `game_session_${userId}`;
    const sessions = JSON.parse(localStorage.getItem(key) || '[]') as Array<{
      sessionId: string;
      gameType: string;
      createdAt: string;
    }>;

    const filtered = sessions.filter(s => s.sessionId !== sessionId);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (error) {
    console.warn('게임 세션 ID 제거 실패:', error);
  }
}

/**
 * 사용자의 모든 활성 세션을 종료 시도 (창 종료 시 정리용)
 */
export async function cleanupUserSessions(userId: string): Promise<void> {
  try {
    const sessions = getGameSessionIds(userId);
    
    for (const session of sessions) {
      const result = await endGameSession(session.sessionId);
      if (result.success) {
        removeGameSessionId(userId, session.sessionId);
      }
    }

    console.log(`✅ 사용자 ${userId}의 게임 세션 정리 완료`);
  } catch (error) {
    console.error('게임 세션 정리 중 오류:', error);
  }
}
