/**
 * 거래 필터링 및 처리 로직
 * UI 독립적인 순수 함수들
 */

import { Transaction, Partner } from "../../types";

/**
 * 회원 거래 필터링
 * deposit, withdrawal, admin_deposit, admin_withdrawal
 */
export function filterUserTransactions(transactions: Transaction[]): Transaction[] {
  const filtered = transactions.filter(t => 
    t.transaction_type === 'deposit' || 
    t.transaction_type === 'withdrawal' ||
    t.transaction_type === 'admin_deposit' ||
    t.transaction_type === 'admin_withdrawal'
  );
  
  console.log('📊 [필터] 회원 거래:', {
    total: filtered.length,
    types: Array.from(new Set(filtered.map(t => t.transaction_type)))
  });
  
  return filtered;
}

/**
 * 파트너 간 거래 필터링 (Lv3+)
 * Lv2 제외, admin_deposit_send/admin_withdrawal_send 제외
 */
export function filterPartnerTransactions(
  partnerTransactions: any[],
  userId: string,
  userLevel: number
): any[] {
  const filtered = partnerTransactions.filter(pt => {
    // admin_deposit_send/admin_withdrawal_send는 Lv2 컴파일러에서 처리
    if (pt.transaction_type === 'admin_deposit_send' || pt.transaction_type === 'admin_withdrawal_send') {
      return false;
    }
    // Lv2 거래 제외
    if (pt.from_partner_level === 2 || pt.to_partner_level === 2) {
      return false;
    }
    return true;
  });

  console.log('🔥 [필터] 파트너 거래 (Lv3+):', {
    total: filtered.length,
    myId: userId,
    myLevel: userLevel,
    receivedCount: filtered.filter(t => t.to_partner_id === userId).length,
    sentCount: filtered.filter(t => t.from_partner_id === userId && t.to_partner_id === null).length,
    types: Array.from(new Set(filtered.map(t => t.transaction_type)))
  });

  return filtered;
}

/**
 * Lv2 파트너 거래 필터링
 * admin_deposit_send, admin_withdrawal_send만
 * Lv2가 관련된 모든 거래
 */
export function filterLv2Transactions(
  partnerTransactions: any[],
  userId: string,
  userLevel: number
): any[] {
  const filtered = partnerTransactions.filter(pt => {
    // admin_deposit_send/admin_withdrawal_send만 대상
    if (pt.transaction_type !== 'admin_deposit_send' && pt.transaction_type !== 'admin_withdrawal_send') {
      return false;
    }
    // Lv2가 관련된 거래만
    if (pt.from_partner_level === 2 || pt.to_partner_level === 2) {
      return true;
    }
    return false;
  });

  console.log('🔥 [필터] Lv2 거래:', {
    total: filtered.length,
    myId: userId,
    myLevel: userLevel,
    // Lv2 특별 규칙: 모든 거래가 "받는 거래" (to_partner_id = Lv2)
    toMeCount: filtered.filter(t => t.to_partner_id === userId).length,
    fromMeCount: filtered.filter(t => t.from_partner_id === userId).length,
    adminDepositSend: filtered.filter(t => t.transaction_type === 'admin_deposit_send').length,
    adminWithdrawalSend: filtered.filter(t => t.transaction_type === 'admin_withdrawal_send').length,
    sample: filtered.slice(0, 2).map(pt => ({
      type: pt.transaction_type,
      from_id: pt.from_partner_id,
      from_level: pt.from_partner_level,
      to_id: pt.to_partner_id,
      to_level: pt.to_partner_level,
      is_to_me: pt.to_partner_id === userId ? '✓ 받는거래' : 'X'
    }))
  });

  return filtered;
}

/**
 * "받는사람" 표시 결정 로직
 * 각 거래가 현재 사용자 관점에서 "받는 거래"인지 판단
 */
export function isReceivedTransaction(
  transaction: any,
  userId: string,
  userLevel: number
): boolean {
  // Lv2 특별 규칙: 모든 admin_deposit_send/admin_withdrawal_send는 "받는 거래"
  if (userLevel === 2 && transaction.to_partner_id === userId) {
    if (transaction.transaction_type === 'admin_deposit_send' || 
        transaction.transaction_type === 'admin_withdrawal_send') {
      return true;
    }
  }

  // Lv3+: to_partner_id = 자신이면 "받는 거래"
  if (transaction.to_partner_id === userId) {
    return true;
  }

  return false;
}

/**
 * 거래 렌더링 텍스트 생성
 */
export function getTransactionDisplayText(
  transaction: any,
  userId: string,
  userLevel: number
): { sender: string; receiver: string; isReceived: boolean } {
  const isReceived = isReceivedTransaction(transaction, userId, userLevel);

  const senderText = transaction.from_partner_username || 
                    transaction.from_partner_nickname || 
                    '-';
  
  const receiverText = transaction.to_partner_username || 
                      transaction.to_partner_nickname || 
                      transaction.partner_username ||
                      '-';

  return {
    sender: senderText,
    receiver: receiverText,
    isReceived
  };
}
