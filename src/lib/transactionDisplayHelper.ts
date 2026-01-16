/**
 * 거래유형 Display 로직
 * TRANSACTION_TYPE_GUIDE.md 참조
 * 
 * 핵심: 발신자와 수신자의 Display는 거래 내용 + 파트너 레벨에 따라 달라짐
 */

interface TransactionDisplayContext {
  transactionType: string;
  fromPartnerLevel?: number; // 발신자 레벨 (없으면 회원)
  toPartnerLevel?: number;   // 수신자 레벨 (없으면 회원)
  isFromRecord: boolean;      // 발신자 입장인지 여부
}

/**
 * 거래 Display 메시지 결정
 * 
 * 규칙:
 * 1. user_online_deposit/withdrawal: 항상 고정 (회원 거래)
 * 2. partner_online_* / partner_manual_* / partner_*:
 *    - 운영사(Lv1) 관여 시: 발신자/수신자 표시 같음
 *    - Lv2 이상 간 거래: 발신자/수신자 표시 다름
 */
export function getTransactionDisplay(context: TransactionDisplayContext): string {
  const {
    transactionType,
    fromPartnerLevel = undefined,
    toPartnerLevel = undefined,
    isFromRecord
  } = context;

  // ===== 회원 관련 거래 (항상 고정) =====
  if (transactionType === 'user_online_deposit') {
    return '온라인 입금';
  }
  if (transactionType === 'user_online_withdrawal') {
    return '온라인 출금';
  }

  // ===== 파트너 온라인 거래 =====
  if (transactionType === 'partner_online_deposit') {
    // 부본사→본사 등에서 상위가 하위에 입금할 때
    // - 발신자(부본사): "온라인 입금"
    // - 수신자(본사): "온라인 출금" (상위는 반대로 표시)
    
    const isSenderHigherLevel = (fromPartnerLevel || 0) > (toPartnerLevel || 0);
    
    if (isFromRecord) {
      // 발신자 입장
      return '온라인 입금'; // 항상 "온라인 입금"
    } else {
      // 수신자 입장
      if (isSenderHigherLevel) {
        // 상위가 하위에 입금 → 수신자는 반대로 표시
        return '온라인 출금';
      } else {
        // 하위가 상위에 입금 → 수신자도 같게 표시
        return '온라인 입금';
      }
    }
  }

  if (transactionType === 'partner_online_withdrawal') {
    // 부본사→본사 등에서 상위가 하위에 출금할 때
    // - 발신자(부본사): "온라인 출금"
    // - 수신자(본사): "온라인 입금" (상위는 반대로 표시)
    
    const isSenderHigherLevel = (fromPartnerLevel || 0) > (toPartnerLevel || 0);
    
    if (isFromRecord) {
      // 발신자 입장
      return '온라인 출금'; // 항상 "온라인 출금"
    } else {
      // 수신자 입장
      if (isSenderHigherLevel) {
        // 상위가 하위에 출금 → 수신자는 반대로 표시
        return '온라인 입금';
      } else {
        // 하위가 상위에 출금 → 수신자도 같게 표시
        return '온라인 출금';
      }
    }
  }

  // ===== 수동 충전/환전 =====
  if (transactionType === 'partner_manual_deposit') {
    // 운영사→회원: "수동 충전"
    // 본사→회원: "수동 환전"
    
    if (fromPartnerLevel === 1) {
      // 운영사 발신
      return '수동 충전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 2) {
      // 본사 이상 발신
      if (isFromRecord) {
        return '수동 환전'; // 발신자는 "수동 환전"
      } else {
        return '수동 충전'; // 수신자는 "수동 충전"
      }
    }
    return '수동 충전'; // 기본값
  }

  if (transactionType === 'partner_manual_withdrawal') {
    // 운영사→회원: "수동 환전"
    // 본사→회원: "수동 충전"
    
    if (fromPartnerLevel === 1) {
      // 운영사 발신
      return '수동 환전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 2) {
      // 본사 이상 발신
      if (isFromRecord) {
        return '수동 충전'; // 발신자는 "수동 충전"
      } else {
        return '수동 환전'; // 수신자는 "수동 환전"
      }
    }
    return '수동 환전'; // 기본값
  }

  // ===== 파트너 충전/환전 (partner_balance_logs) =====
  if (transactionType === 'partner_deposit') {
    // 운영사→본사: "파트너 충전"
    // 본사→부본사: "파트너 환전"
    
    if (fromPartnerLevel === 1) {
      // 운영사 발신
      return '파트너 충전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 2) {
      // 본사 이상 발신
      if (isFromRecord) {
        return '파트너 환전'; // 발신자는 "파트너 환전"
      } else {
        return '파트너 충전'; // 수신자는 "파트너 충전"
      }
    }
    return '파트너 충전'; // 기본값
  }

  if (transactionType === 'partner_withdrawal') {
    // 운영사→본사: "파트너 환전"
    // 본사→부본사: "파트너 충전"
    
    if (fromPartnerLevel === 1) {
      // 운영사 발신
      return '파트너 환전';
    } else if (fromPartnerLevel && fromPartnerLevel >= 2) {
      // 본사 이상 발신
      if (isFromRecord) {
        return '파트너 충전'; // 발신자는 "파트너 충전"
      } else {
        return '파트너 환전'; // 수신자는 "파트너 환전"
      }
    }
    return '파트너 환전'; // 기본값
  }

  // 기본값
  return transactionType;
}

/**
 * 간단한 Display 메시지 (레벨 정보 없을 때)
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
  };

  return displayMap[transactionType] || transactionType;
}
