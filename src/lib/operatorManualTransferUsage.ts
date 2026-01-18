/**
 * 운영사 수동충전/환전 통합 로직 - 사용 예시
 * 
 * 기존 코드들이 어떻게 변환되는지 보여주는 예시 파일
 */

import { processManualTransfer, processLv1ToLv2Deposit } from './operatorManualTransfer';
import { toast } from 'sonner';

// ============================================================================
// 예시 1: 회원에게 입금 (기존 handleForceTransaction)
// ============================================================================

/**
 * 변경 전: TransactionManagement.tsx 또는 다른 파일에서 직접 구현
 * 
 * async function handleUserDeposit(userId, amount, memo) {
 *   // ... 복잡한 보유금 검증 (10줄)
 *   // ... 회원 balance 업데이트 (5줄)
 *   // ... transactions 거래 기록 생성 (10줄)
 *   // ... 에러 처리 (5줄)
 * }
 */

// 변경 후: 단일 함수 호출
export async function depositToUser(userId: string, currentUserId: string, amount: number, currentUserLevel: number, memo?: string) {
  const result = await processManualTransfer({
    type: 'deposit',
    targetType: 'user',
    targetId: userId,
    senderId: currentUserId,
    senderLevel: currentUserLevel,
    amount,
    memo
  });

  if (result.success) {
    toast.success('입금이 완료되었습니다.');
    return result;
  } else {
    toast.error(result.message);
    return result;
  }
}

// ============================================================================
// 예시 2: 회원에게서 출금 (기존 handleForceTransaction)
// ============================================================================

export async function withdrawFromUser(userId: string, currentUserId: string, amount: number, currentUserLevel: number, memo?: string) {
  const result = await processManualTransfer({
    type: 'withdrawal',
    targetType: 'user',
    targetId: userId,
    senderId: currentUserId,
    senderLevel: currentUserLevel,
    amount,
    memo
  });

  if (result.success) {
    toast.success('출금이 완료되었습니다.');
    return result;
  } else {
    toast.error(result.message);
    return result;
  }
}

// ============================================================================
// 예시 3: Lv1→Lv2 입금 (API별 보유금 관리)
// ============================================================================

export async function depositLv1ToLv2(
  lv1PartnerId: string,
  lv2PartnerId: string,
  apiType: 'invest' | 'oroplay' | 'familyapi' | 'honorapi',
  amount: number,
  memo?: string
) {
  const result = await processLv1ToLv2Deposit(lv1PartnerId, lv2PartnerId, apiType, amount, memo);

  if (result.success) {
    toast.success(`${apiType.toUpperCase()} API 입금이 완료되었습니다.`);
    return result;
  } else {
    toast.error(result.message);
    return result;
  }
}

// ============================================================================
// 예시 4: Lv1→Lv2 출금
// ============================================================================

export async function withdrawLv1ToLv2(
  lv1PartnerId: string,
  lv2PartnerId: string,
  apiType: 'invest' | 'oroplay' | 'familyapi' | 'honorapi',
  amount: number,
  memo?: string
) {
  const result = await processManualTransfer({
    type: 'withdrawal',
    targetType: 'lv3_partner',
    targetId: lv2PartnerId,
    senderId: lv1PartnerId,
    senderLevel: 1,
    amount,
    memo,
    apiType
  });

  if (result.success) {
    toast.success(`${apiType.toUpperCase()} API 출금이 완료되었습니다.`);
    return result;
  } else {
    toast.error(result.message);
    return result;
  }
}

// ============================================================================
// 예시 5: Lv2→Lv3+ 입금 (파트너 충전)
// ============================================================================

export async function depositLv2ToPartner(
  lv2PartnerId: string,
  targetPartnerId: string,
  amount: number,
  memo?: string
) {
  const result = await processManualTransfer({
    type: 'deposit',
    targetType: 'lv3_partner',
    targetId: targetPartnerId,
    senderId: lv2PartnerId,
    senderLevel: 2,
    amount,
    memo
  });

  if (result.success) {
    toast.success('파트너 충전이 완료되었습니다.');
    return result;
  } else {
    toast.error(result.message);
    return result;
  }
}

// ============================================================================
// 예시 6: Lv2→Lv3+ 출금 (파트너 환전)
// ============================================================================

export async function withdrawLv2ToPartner(
  lv2PartnerId: string,
  targetPartnerId: string,
  amount: number,
  memo?: string
) {
  const result = await processManualTransfer({
    type: 'withdrawal',
    targetType: 'lv3_partner',
    targetId: targetPartnerId,
    senderId: lv2PartnerId,
    senderLevel: 2,
    amount,
    memo
  });

  if (result.success) {
    toast.success('파트너 환전이 완료되었습니다.');
    return result;
  } else {
    toast.error(result.message);
    return result;
  }
}

// ============================================================================
// 예시 7: Lv3+→직속하위 입금 (파트너 충전)
// ============================================================================

export async function depositPartnerToChild(
  senderPartnerId: string,
  senderLevel: number,
  targetPartnerId: string,
  amount: number,
  memo?: string
) {
  const result = await processManualTransfer({
    type: 'deposit',
    targetType: 'direct_child_partner',
    targetId: targetPartnerId,
    senderId: senderPartnerId,
    senderLevel,
    amount,
    memo
  });

  if (result.success) {
    toast.success('파트너 충전이 완료되었습니다.');
    return result;
  } else {
    toast.error(result.message);
    return result;
  }
}

// ============================================================================
// 예시 8: Lv3+→직속하위 출금 (파트너 환전)
// ============================================================================

export async function withdrawPartnerToChild(
  senderPartnerId: string,
  senderLevel: number,
  targetPartnerId: string,
  amount: number,
  memo?: string
) {
  const result = await processManualTransfer({
    type: 'withdrawal',
    targetType: 'direct_child_partner',
    targetId: targetPartnerId,
    senderId: senderPartnerId,
    senderLevel,
    amount,
    memo
  });

  if (result.success) {
    toast.success('파트너 환전이 완료되었습니다.');
    return result;
  } else {
    toast.error(result.message);
    return result;
  }
}

// ============================================================================
// 기존 코드와의 호환성 (마이그레이션 헬퍼)
// ============================================================================

/**
 * 기존 transferBalanceToPartner 함수를 새 함수로 대체
 */
export async function transferBalanceToPartnerCompat(
  transferTargetPartner: { id: string; level: number; balance?: number },
  currentUserId: string,
  currentUserLevel: number,
  amount: number,
  transferMode: 'deposit' | 'withdrawal',
  transferMemo?: string
) {
  return processManualTransfer({
    type: transferMode,
    targetType: transferTargetPartner.level === 2 ? 'lv3_partner' : 'direct_child_partner',
    targetId: transferTargetPartner.id,
    senderId: currentUserId,
    senderLevel: currentUserLevel,
    amount,
    memo: transferMemo
  });
}
