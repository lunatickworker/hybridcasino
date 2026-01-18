/**
 * 거래유형 Display 로직
 * 
 * Transactionrull.md 기반 거래 표시 규칙:
 * 
 * ===== Lv2(운영사) 특별 규칙 =====
 * 충전 (admin_deposit_send):
 * - Lv2 → Lv3~6: 모두 "수동 충전"
 * 
 * 환전 (admin_withdraw_send):
 * - Lv2 → Lv3~6: 모두 "수동 환전"
 * 
 * ===== 기타 거래 (Lv3~6) =====
 * 충전 (admin_deposit_send):
 * - 송신자: "파트너 환전" (감소), 수신자: "파트너 충전" (증가)
 * 
 * 환전 (admin_withdraw_send):
 * - 송신자: "파트너 충전" (증가), 수신자: "파트너 환전" (감소)
 */

interface TransactionDisplayContext {
  transactionType: string;
  fromPartnerLevel?: number; // 발신자 파트너 레벨
  toPartnerLevel?: number;   // 수신자 파트너 레벨
  isFromRecord: boolean;      // 발신자 기준 기록인지 여부
}

/**
 * 거래 Display 메시지 결정
 * 
 * Transactionrull.md 규칙 적용:
 * 1. admin_deposit_send (충전): Lv2 특별규칙 / Lv3+ 반대 표시
 * 2. admin_withdraw_send (환전): Lv2 특별규칙 / Lv3+ 반대 표시
 */
export function getTransactionDisplay(context: TransactionDisplayContext): string {
  const {
    transactionType,
    fromPartnerLevel,
    toPartnerLevel,
    isFromRecord
  } = context;

  // ===== admin_deposit_send (파트너 충전) =====
  if (transactionType === 'admin_deposit_send') {
    // Lv2 특별 규칙: 모두 "수동 충전"
    if (fromPartnerLevel === 2) {
      return '수동 충전';
    }
    
    // Lv3+ 규칙: 송신자 "파트너 환전", 수신자 "파트너 충전"
    if (fromPartnerLevel && fromPartnerLevel >= 3) {
      return isFromRecord ? '파트너 환전' : '파트너 충전';
    }
    
    return '수동 충전';
  }

  // ===== admin_withdraw_send (파트너 환전) =====
  if (transactionType === 'admin_withdraw_send') {
    // Lv2 특별 규칙: 모두 "수동 환전"
    if (fromPartnerLevel === 2) {
      return '수동 환전';
    }
    
    // Lv3+ 규칙: 송신자 "파트너 충전", 수신자 "파트너 환전"
    if (fromPartnerLevel && fromPartnerLevel >= 3) {
      return isFromRecord ? '파트너 충전' : '파트너 환전';
    }
    
    return '수동 환전';
  }

  // ===== 기타 거래 유형 (현기존 로직 유지) =====
  if (transactionType === 'user_online_deposit') {
    return '온라인 입금';
  }

  if (transactionType === 'user_online_withdrawal') {
    return '온라인 출금';
  }

  if (transactionType === 'partner_online_deposit') {
    const isSenderHigher = (fromPartnerLevel || 0) > (toPartnerLevel || 0);
    if (isFromRecord) {
      return '온라인 입금';
    } else {
      return isSenderHigher ? '온라인 출금' : '온라인 입금';
    }
  }

  if (transactionType === 'partner_online_withdrawal') {
    const isSenderHigher = (fromPartnerLevel || 0) > (toPartnerLevel || 0);
    if (isFromRecord) {
      return '온라인 출금';
    } else {
      return isSenderHigher ? '온라인 입금' : '온라인 출금';
    }
  }

  if (transactionType === 'partner_deposit') {
    if (fromPartnerLevel === 2) {
      return '파트너 충전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 3) {
      return isFromRecord ? '파트너 환전' : '파트너 충전';
    }
    return '파트너 충전';
  }

  if (transactionType === 'partner_withdrawal') {
    if (fromPartnerLevel === 2) {
      return '파트너 환전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 3) {
      return isFromRecord ? '파트너 충전' : '파트너 환전';
    }
    return '파트너 환전';
  }

  if (transactionType === 'admin_deposit') {
    return '수동 충전';
  }

  if (transactionType === 'admin_withdrawal') {
    return '수동 환전';
  }

  if (transactionType === 'admin_adjustment') {
    return '시스템 조정';
  }

  if (transactionType === 'commission') {
    return '커미션';
  }

  if (transactionType === 'refund') {
    return '환불';
  }

  if (transactionType === 'point_conversion') {
    return '포인트 전환';
  }

  // 기본값
  return transactionType;
}

/**
 * 간단한 Display 메시지 (레벨 정보 없을 때 사용)
 * 주로 회원 화면에서 사용
 */
export function getSimpleTransactionDisplay(transactionType: string): string {
  const displayMap: Record<string, string> = {
    'user_online_deposit': '온라인 입금',
    'user_online_withdrawal': '온라인 출금',
    'partner_online_deposit': '온라인 입금',
    'partner_online_withdrawal': '온라인 출금',
    'partner_deposit': '파트너 충전',
    'partner_withdrawal': '파트너 환전',
    'admin_deposit_send': '수동 충전',
    'admin_deposit_receive': '수동 충전',
    'admin_deposit': '수동 충전',
    'admin_withdraw_send': '수동 환전',
    'admin_withdrawal_send': '수동 환전',
    'admin_withdrawal_receive': '수동 환전',
    'admin_withdrawal': '수동 환전',
    'admin_adjustment': '시스템 조정',
    'commission': '커미션',
    'refund': '환불',
    'point_conversion': '포인트 전환',
  };

  return displayMap[transactionType] || transactionType;
}
