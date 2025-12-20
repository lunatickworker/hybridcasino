/**
 * 활동 로그 기록 모듈
 * - 관리자/회원의 모든 접속 및 사용 기록 추적
 * - 기존 activity_logs 테이블 구조 사용
 */

import { supabase } from './supabase';

export type ActivityType = 
  // 인증 관련
  | 'login' 
  | 'logout'
  | 'login_failed'
  // 회원 관련
  | 'user_create'
  | 'user_update'
  | 'user_delete'
  | 'user_status_change'
  | 'user_balance_change'
  // 파트너 관련
  | 'partner_create'
  | 'partner_update'
  | 'partner_delete'
  | 'partner_balance_change'
  // 입출금 관련
  | 'deposit_request'
  | 'deposit_approve'
  | 'deposit_reject'
  | 'withdrawal_request'
  | 'withdrawal_approve'
  | 'withdrawal_reject'
  // 게임 관련
  | 'game_launch'
  | 'game_end'
  | 'game_force_end'
  // 정산 관련
  | 'settlement_execute'
  | 'commission_settle'
  // 시스템 설정
  | 'system_setting_update'
  | 'api_config_update'
  // 기타
  | 'page_view'
  | 'data_export'
  | 'data_import';

export interface ActivityLogParams {
  actorId: string; // 행위자 ID (파트너 또는 사용자)
  actorType: 'partner' | 'user'; // 행위자 타입
  action: ActivityType; // 활동 유형 (기존 테이블의 'action' 컬럼 사용)
  targetType?: 'user' | 'partner' | 'transaction' | 'game' | 'settlement' | 'system'; // 대상 타입
  targetId?: string; // 대상 ID
  description: string; // 활동 설명
  details?: Record<string, any>; // 추가 메타데이터 (기존 테이블의 'details' 컬럼 사용)
  ipAddress?: string; // IP 주소
  userAgent?: string; // User Agent
  success?: boolean; // 성공 여부
}

/**
 * 활동 로그 기록
 */
export async function logActivity(params: ActivityLogParams): Promise<void> {
  try {
    const {
      actorId,
      actorType,
      action,
      targetType,
      targetId,
      description,
      details,
      ipAddress,
      userAgent,
      success = true
    } = params;

    // details에 description과 success 포함
    const combinedDetails = {
      ...(details || {}),
      description,
      success
    };

    // activity_logs 테이블에 기록
    const { error } = await supabase
      .from('activity_logs')
      .insert({
        actor_id: actorId,
        actor_type: actorType,
        action, // 기존 테이블 컬럼명
        target_type: targetType,
        target_id: targetId,
        details: combinedDetails, // description과 success를 details에 포함
        ip_address: ipAddress,
        user_agent: userAgent,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('활동 로그 기록 실패:', error);
    }
  } catch (error) {
    console.error('활동 로그 기록 오류:', error);
  }
}

/**
 * 로그인 기록
 */
export async function logLogin(
  userId: string,
  userType: 'partner' | 'user',
  ipAddress?: string,
  userAgent?: string,
  success: boolean = true
): Promise<void> {
  await logActivity({
    actorId: userId,
    actorType: userType,
    action: success ? 'login' : 'login_failed',
    description: success ? '로그인 성공' : '로그인 실패',
    ipAddress,
    userAgent,
    success
  });
}

/**
 * 로그아웃 기록
 */
export async function logLogout(
  userId: string,
  userType: 'partner' | 'user',
  ipAddress?: string
): Promise<void> {
  await logActivity({
    actorId: userId,
    actorType: userType,
    action: 'logout',
    description: '로그아웃',
    ipAddress
  });
}

/**
 * 회원 정보 수정 기록
 */
export async function logUserUpdate(
  adminId: string,
  targetUserId: string,
  changes: Record<string, any>,
  ipAddress?: string
): Promise<void> {
  const changeDescription = Object.entries(changes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  await logActivity({
    actorId: adminId,
    actorType: 'partner',
    action: 'user_update',
    targetType: 'user',
    targetId: targetUserId,
    description: `회원 정보 수정 (${changeDescription})`,
    details: { changes },
    ipAddress
  });
}

/**
 * 머니 지급/차감 기록
 */
export async function logBalanceChange(
  adminId: string,
  targetId: string,
  targetType: 'user' | 'partner',
  amount: number,
  beforeBalance: number,
  afterBalance: number,
  reason: string,
  ipAddress?: string
): Promise<void> {
  const action = targetType === 'user' ? 'user_balance_change' : 'partner_balance_change';
  const changeType = amount > 0 ? '지급' : '차감';

  await logActivity({
    actorId: adminId,
    actorType: 'partner',
    action,
    targetType,
    targetId,
    description: `머니 ${changeType}: ₩${Math.abs(amount).toLocaleString()} (${reason})`,
    details: {
      amount,
      beforeBalance,
      afterBalance,
      reason
    },
    ipAddress
  });
}

/**
 * 입금 승인/거부 기록
 */
export async function logDepositAction(
  adminId: string,
  transactionId: string,
  userId: string,
  action: 'approve' | 'reject',
  amount: number,
  ipAddress?: string
): Promise<void> {
  const activityType = action === 'approve' ? 'deposit_approve' : 'deposit_reject';
  const actionText = action === 'approve' ? '승인' : '거부';

  await logActivity({
    actorId: adminId,
    actorType: 'partner',
    action: activityType,
    targetType: 'transaction',
    targetId: transactionId,
    description: `입금 ${actionText}: ₩${amount.toLocaleString()}`,
    details: {
      userId,
      amount,
      action
    },
    ipAddress
  });
}

/**
 * 출금 승인/거부 기록
 */
export async function logWithdrawalAction(
  adminId: string,
  transactionId: string,
  userId: string,
  action: 'approve' | 'reject',
  amount: number,
  ipAddress?: string
): Promise<void> {
  const activityType = action === 'approve' ? 'withdrawal_approve' : 'withdrawal_reject';
  const actionText = action === 'approve' ? '승인' : '거부';

  await logActivity({
    actorId: adminId,
    actorType: 'partner',
    action: activityType,
    targetType: 'transaction',
    targetId: transactionId,
    description: `출금 ${actionText}: ₩${amount.toLocaleString()}`,
    details: {
      userId,
      amount,
      action
    },
    ipAddress
  });
}

/**
 * 게임 강제 종료 기록
 */
export async function logGameForceEnd(
  adminId: string,
  sessionId: string,
  userId: string,
  gameId: number,
  ipAddress?: string
): Promise<void> {
  await logActivity({
    actorId: adminId,
    actorType: 'partner',
    action: 'game_force_end',
    targetType: 'game',
    targetId: sessionId,
    description: `게임 강제 종료 (게임 ID: ${gameId})`,
    details: {
      userId,
      gameId,
      sessionId
    },
    ipAddress
  });
}

/**
 * 정산 실행 기록
 */
export async function logSettlement(
  adminId: string,
  settlementType: 'partner_commission' | 'integrated',
  periodStart: string,
  periodEnd: string,
  amount: number,
  ipAddress?: string
): Promise<void> {
  await logActivity({
    actorId: adminId,
    actorType: 'partner',
    action: 'settlement_execute',
    targetType: 'settlement',
    description: `정산 실행: ₩${amount.toLocaleString()} (${periodStart} ~ ${periodEnd})`,
    details: {
      settlementType,
      periodStart,
      periodEnd,
      amount
    },
    ipAddress
  });
}

/**
 * 파트너 생성 기록
 */
export async function logPartnerCreate(
  adminId: string,
  partnerId: string,
  partnerUsername: string,
  level: number,
  ipAddress?: string
): Promise<void> {
  await logActivity({
    actorId: adminId,
    actorType: 'partner',
    action: 'partner_create',
    targetType: 'partner',
    targetId: partnerId,
    description: `파트너 생성: ${partnerUsername} (Lv${level})`,
    details: {
      username: partnerUsername,
      level
    },
    ipAddress
  });
}

/**
 * 회원 생성 기록
 */
export async function logUserCreate(
  adminId: string,
  userId: string,
  username: string,
  ipAddress?: string
): Promise<void> {
  await logActivity({
    actorId: adminId,
    actorType: 'partner',
    action: 'user_create',
    targetType: 'user',
    targetId: userId,
    description: `회원 생성: ${username}`,
    details: {
      username
    },
    ipAddress
  });
}

/**
 * 페이지 조회 기록 (선택적)
 */
export async function logPageView(
  userId: string,
  userType: 'partner' | 'user',
  pagePath: string,
  ipAddress?: string
): Promise<void> {
  await logActivity({
    actorId: userId,
    actorType: userType,
    action: 'page_view',
    description: `페이지 조회: ${pagePath}`,
    details: {
      pagePath
    },
    ipAddress
  });
}

/**
 * IP 주소 가져오기 (클라이언트 측)
 */
export async function getClientIP(): Promise<string | undefined> {
  try {
    // ✅ 여러 IP 조회 API를 순차적으로 시도 (fallback)
    const ipApis = [
      'https://api.ipify.org?format=json',
      'https://api.my-ip.io/ip.json',
      'https://ipapi.co/json/',
    ];

    for (const apiUrl of ipApis) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3초 타임아웃

        const response = await fetch(apiUrl, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) continue;

        const data = await response.json();
        
        // API마다 응답 형식이 다르므로 처리
        const ip = data.ip || data.IPv4 || data.query;
        
        if (ip && typeof ip === 'string') {
          console.log('✅ IP 주소 조회 성공:', ip, 'from', apiUrl);
          return ip;
        }
      } catch (err) {
        // 다음 API 시도
        continue;
      }
    }

    // 모든 API 실패 시
    console.warn('⚠️ IP 주소 조회 실패 - 모든 API 시도 완료. undefined 반환');
    return undefined;
  } catch (error) {
    console.warn('⚠️ IP 주소 조회 실패:', error);
    return undefined;
  }
}

/**
 * User Agent 가져오기
 */
export function getUserAgent(): string | undefined {
  if (typeof window !== 'undefined' && window.navigator) {
    return window.navigator.userAgent;
  }
  return undefined;
}