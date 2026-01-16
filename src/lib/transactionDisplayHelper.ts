/**
 * 거래유형 Display 로직
 * 
 * 핵심: 동일한 transaction_type이라도 발신자/수신자 관점에서 다른 이름으로 표시
 * 
 * 예시:
 * - 부본사→본사 입금: 부본사는 "온라인 입금", 본사는 "온라인 출금"
 * - 본사→부본사 충전: 본사는 "수동 환전", 부본사는 "수동 충전"
 */

interface TransactionDisplayContext {
  transactionType: string;
  fromPartnerLevel?: number; // 발신자 파트너 레벨 (없으면 회원)
  toPartnerLevel?: number;   // 수신자 파트너 레벨 (없으면 회원)
  isFromRecord: boolean;      // 발신자 기준 기록인지 여부
}

/**
 * 거래 Display 메시지 결정
 */
export function getTransactionDisplay(context: TransactionDisplayContext): string {
  const {
    transactionType,
    fromPartnerLevel,
    toPartnerLevel,
    isFromRecord
  } = context;

  // ===== 온라인 입금 (user_online_deposit, partner_online_deposit) =====
  if (transactionType === 'user_online_deposit') {
    return '온라인 입금';
  }

  if (transactionType === 'partner_online_deposit') {
    // 규칙:
    // - 부본사(3) → 본사(2): 부본사 "온라인 입금", 본사 "온라인 출금"
    // - 본사(2) → 운영사(1): 본사 "온라인 입금", 운영사 "온라인 입금"
    
    const isFromHigherLevel = (fromPartnerLevel || 0) > (toPartnerLevel || 0);
    
    if (isFromRecord) {
      return '온라인 입금'; // 발신자는 항상 "온라인 입금"
    } else {
      // 수신자: 발신자가 상위 레벨이면 반대로 표시
      return isFromHigherLevel ? '온라인 출금' : '온라인 입금';
    }
  }

  // ===== 온라인 출금 (user_online_withdrawal, partner_online_withdrawal) =====
  if (transactionType === 'user_online_withdrawal') {
    return '온라인 출금';
  }

  if (transactionType === 'partner_online_withdrawal') {
    // 규칙:
    // - 부본사(3) → 본사(2): 부본사 "온라인 출금", 본사 "온라인 입금"
    // - 본사(2) → 운영사(1): 본사 "온라인 출금", 운영사 "온라인 출금"
    
    const isFromHigherLevel = (fromPartnerLevel || 0) > (toPartnerLevel || 0);
    
    if (isFromRecord) {
      return '온라인 출금'; // 발신자는 항상 "온라인 출금"
    } else {
      // 수신자: 발신자가 상위 레벨이면 반대로 표시
      return isFromHigherLevel ? '온라인 입금' : '온라인 출금';
    }
  }

  // ===== 수동 충전 (partner_manual_deposit) =====
  if (transactionType === 'partner_manual_deposit') {
    // 규칙:
    // - 운영사(1) → 회원: "수동 충전" / "수동 충전"
    // - 본사(2) → 회원: "수동 환전" / "수동 충전"
    // - 부본사(3) → 회원: "수동 환전" / "수동 충전"
    
    if (fromPartnerLevel === 1) {
      // 운영사
      return '수동 충전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 2) {
      // 본사 이상
      return isFromRecord ? '수동 환전' : '수동 충전';
    }
    return '수동 충전';
  }

  // ===== 수동 환전 (partner_manual_withdrawal) =====
  if (transactionType === 'partner_manual_withdrawal') {
    // 규칙:
    // - 운영사(1) → 회원: "수동 환전" / "수동 환전"
    // - 본사(2) → 회원: "수동 충전" / "수동 환전"
    // - 부본사(3) → 회원: "수동 충전" / "수동 환전"
    
    if (fromPartnerLevel === 1) {
      // 운영사
      return '수동 환전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 2) {
      // 본사 이상
      return isFromRecord ? '수동 충전' : '수동 환전';
    }
    return '수동 환전';
  }

  // ===== 파트너 충전 (partner_balance_logs에만 기록, partner_deposit) =====
  if (transactionType === 'partner_deposit') {
    // 규칙:
    // - 운영사(1) → 본사(2): "파트너 충전" / "파트너 충전"
    // - 본사(2) → 부본사(3): "파트너 환전" / "파트너 충전"
    // - 부본사(3) → 총판(4): "파트너 환전" / "파트너 충전"
    
    if (fromPartnerLevel === 1) {
      // 운영사
      return '파트너 충전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 2) {
      // 본사 이상
      return isFromRecord ? '파트너 환전' : '파트너 충전';
    }
    return '파트너 충전';
  }

  // ===== 파트너 환전 (partner_balance_logs에만 기록, partner_withdrawal) =====
  if (transactionType === 'partner_withdrawal') {
    // 규칙:
    // - 운영사(1) → 본사(2): "파트너 환전" / "파트너 환전"
    // - 본사(2) → 부본사(3): "파트너 충전" / "파트너 환전"
    // - 부본사(3) → 총판(4): "파트너 충전" / "파트너 환전"
    
    if (fromPartnerLevel === 1) {
      // 운영사
      return '파트너 환전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 2) {
      // 본사 이상
      return isFromRecord ? '파트너 충전' : '파트너 환전';
    }
    return '파트너 환전';
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
    'partner_manual_deposit': '수동 충전',
    'partner_manual_withdrawal': '수동 환전',
    'partner_deposit': '파트너 충전',
    'partner_withdrawal': '파트너 환전',
    'admin_adjustment': '관리자 조정',
    'point_conversion': '포인트 전환',
  };

  return displayMap[transactionType] || transactionType;
}
