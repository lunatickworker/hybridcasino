import { supabase } from "../../../lib/supabase";
import { Partner, TransferMode, TransferBalanceParams } from "./types";

/**
 * ✅ 거래유형 결정 함수
 * Lv1(운영사) → Lv2(본사): admin_deposit_receive (파트너 충전) / admin_withdrawal_receive
 * Lv2(본사) → Lv3~7: admin_deposit_send (파트너 환전) / admin_withdrawal_send
 * Lv3+ → Lv2+: admin_deposit_receive (파트너 충전) / admin_withdrawal_receive
 */
const getTransactionType = (
  senderLevel: number,
  receiverLevel: number,
  transferMode: TransferMode
): string => {
  if (transferMode === 'deposit') {
    if (senderLevel === 1 && receiverLevel === 2) {
      return 'admin_deposit_receive'; // ✅ 운영사 → 본사: "파트너 충전"
    } else if (senderLevel < receiverLevel) {
      return 'admin_deposit_send'; // 상위 → 하위: "파트너 환전"
    } else if (senderLevel > receiverLevel) {
      return 'admin_deposit_receive'; // 하위 → 상위: "파트너 충전"
    }
  } else {
    // withdrawal
    if (senderLevel === 2 && receiverLevel === 1) {
      return 'admin_withdrawal_receive'; // ✅ 본사 → 운영사: "파트너 충전" (출금)
    } else if (senderLevel < receiverLevel) {
      return 'admin_withdrawal_send'; // 상위 → 하위: "파트너 환전"
    } else if (senderLevel > receiverLevel) {
      return 'admin_withdrawal_receive'; // 하위 → 상위: "파트너 충전"
    }
  }
  return transferMode === 'deposit' ? 'deposit' : 'withdrawal';
};

/**
 * 파트너간 보유금 입출금 (GMS 머니 시스템)
 * 
 * 핵심 규칙:
 * - Lv1(운영사) ↔ Lv2(본사): 운영사는 기록 없음, 본사만 "파트너 충전" 기록
 * - Lv2 이상: 송신자와 수신자 모두 기록
 */
export const transferBalanceToPartner = async ({
  transferTargetPartner,
  currentUserId,
  amount,
  transferMode,
  transferMemo = "",
  apiType
}: TransferBalanceParams) => {
  console.log('🔵 [transferBalanceToPartner] 시작:', {
    sender: currentUserId,
    receiver: transferTargetPartner.id,
    amount,
    transferMode
  });

  // 1️⃣ 송신자 정보 조회
  const { data: currentPartnerData, error: fetchError } = await supabase
    .from('partners')
    .select('balance, invest_balance, oroplay_balance, nickname, level')
    .eq('id', currentUserId)
    .single();

  if (fetchError) throw fetchError;

  const senderLevel = currentPartnerData.level;
  const receiverLevel = transferTargetPartner.level;
  const isLv1ToLv2 = senderLevel === 1 && receiverLevel === 2;
  const transactionType = getTransactionType(senderLevel, receiverLevel, transferMode);

  console.log('📊 거래 정보:', {
    송신자: currentPartnerData.nickname,
    송신자레벨: senderLevel,
    수신자: transferTargetPartner.nickname,
    수신자레벨: receiverLevel,
    거래유형: transactionType,
    isLv1ToLv2
  });

  // 2️⃣ 송신자 보유금 검증
  if (transferMode === 'deposit' && senderLevel !== 1) {
    if (senderLevel === 2) {
      const balance = currentPartnerData.oroplay_balance || 0;
      if (balance < amount) {
        throw new Error(`SENDER_BALANCE_INSUFFICIENT:OroPlay=${balance},required=${amount}`);
      }
    } else if (senderLevel >= 3) {
      if (currentPartnerData.balance < amount) {
        throw new Error(`SENDER_BALANCE_INSUFFICIENT:${currentPartnerData.balance}`);
      }
    }
  }

  // 3️⃣ 수신자 보유금 검증
  if (transferMode === 'withdrawal') {
    if (transferTargetPartner.balance < amount) {
      throw new Error(`TARGET_BALANCE_INSUFFICIENT:${transferTargetPartner.balance}`);
    }
  }

  // 4️⃣ 거래 처리
  if (transferMode === 'deposit') {
    await handleDeposit({
      sender: { id: currentUserId, level: senderLevel, ...currentPartnerData },
      receiver: transferTargetPartner,
      amount,
      transactionType,
      isLv1ToLv2,
      transferMemo
    });
  } else {
    await handleWithdrawal({
      sender: { id: currentUserId, level: senderLevel, ...currentPartnerData },
      receiver: transferTargetPartner,
      amount,
      transactionType,
      isLv1ToLv2,
      transferMemo
    });
  }

  console.log('✅ 거래 완료');
};

/**
 * 입금 처리 (송신자 차감, 수신자 증가)
 */
async function handleDeposit({
  sender,
  receiver,
  amount,
  transactionType,
  isLv1ToLv2,
  transferMemo
}: {
  sender: any;
  receiver: Partner;
  amount: number;
  transactionType: string;
  isLv1ToLv2: boolean;
  transferMemo: string;
}) {
  console.log('💰 [입금] 송신자 보유금 차감 시작');

  let senderBalanceBefore = 0;
  let senderBalanceAfter = 0;

  // 송신자 보유금 차감
  if (sender.level === 1) {
    senderBalanceBefore = sender.balance;
    senderBalanceAfter = senderBalanceBefore - amount;

    const { error } = await supabase
      .from('partners')
      .update({ balance: senderBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', sender.id);

    if (error) throw error;
    console.log('✅ Lv1 보유금 차감 완료');
  } else if (sender.level === 2) {
    senderBalanceBefore = sender.oroplay_balance || 0;
    senderBalanceAfter = senderBalanceBefore - amount;

    const { error } = await supabase
      .from('partners')
      .update({ oroplay_balance: senderBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', sender.id);

    if (error) throw error;

    // 📝 Lv2 송신자 로그
    const { error: logError } = await supabase
      .from('partner_balance_logs')
      .insert({
        partner_id: sender.id,
        balance_before: senderBalanceBefore,
        balance_after: senderBalanceAfter,
        amount: -amount,
        transaction_type: transactionType,
        from_partner_id: sender.id,
        to_partner_id: receiver.id,
        processed_by: sender.id,
        api_type: 'oroplay',
        memo: transferMemo || null
      });

    if (logError) throw logError;
    console.log('✅ Lv2 송신자 보유금 차감 + 로그 기록 완료');
  } else if (sender.level >= 3) {
    senderBalanceBefore = sender.balance;
    senderBalanceAfter = senderBalanceBefore - amount;

    const { error } = await supabase
      .from('partners')
      .update({ balance: senderBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', sender.id);

    if (error) throw error;

    // 📝 Lv3+ 송신자 로그
    const { error: logError } = await supabase
      .from('partner_balance_logs')
      .insert({
        partner_id: sender.id,
        balance_before: senderBalanceBefore,
        balance_after: senderBalanceAfter,
        amount: -amount,
        transaction_type: transactionType,
        from_partner_id: sender.id,
        to_partner_id: receiver.id,
        processed_by: sender.id,
        memo: transferMemo || null
      });

    if (logError) throw logError;
    console.log('✅ Lv3+ 송신자 보유금 차감 + 로그 기록 완료');
  }

  // 수신자 보유금 증가
  console.log('💰 [입금] 수신자 보유금 증가 시작');
  const receiverBalanceBefore = receiver.balance;
  const receiverBalanceAfter = receiverBalanceBefore + amount;

  const { error: increaseError } = await supabase
    .from('partners')
    .update({ balance: receiverBalanceAfter, updated_at: new Date().toISOString() })
    .eq('id', receiver.id);

  if (increaseError) throw increaseError;
  console.log('✅ 수신자 보유금 증가 완료');

  // 📝 수신자 로그 기록 (모든 수신자 기록)
  const { error: receiverLogError } = await supabase
    .from('partner_balance_logs')
    .insert({
      partner_id: receiver.id,
      balance_before: receiverBalanceBefore,
      balance_after: receiverBalanceAfter,
      amount: amount,
      transaction_type: transactionType,
      from_partner_id: isLv1ToLv2 ? null : sender.id, // ✅ Lv1→Lv2는 null
      to_partner_id: receiver.id,
      processed_by: sender.id,
      memo: transferMemo || null
    });

  if (receiverLogError) throw receiverLogError;
  console.log('✅ 수신자 로그 기록 완료');

  // transactions 테이블에 기록
  await recordTransaction({
    senderId: sender.id,
    receiverId: receiver.id,
    senderLevel: sender.level,
    senderBalanceBefore,
    senderBalanceAfter,
    senderName: sender.nickname,
    receiverName: receiver.nickname,
    amount,
    transactionType,
    transferMode: 'deposit',
    transferMemo
  });
}

/**
 * 출금 처리 (수신자 차감, 송신자 증가)
 */
async function handleWithdrawal({
  sender,
  receiver,
  amount,
  transactionType,
  isLv1ToLv2,
  transferMemo
}: {
  sender: any;
  receiver: Partner;
  amount: number;
  transactionType: string;
  isLv1ToLv2: boolean;
  transferMemo: string;
}) {
  console.log('💰 [출금] 수신자 보유금 차감 시작');

  // 수신자 보유금 차감
  const receiverBalanceBefore = receiver.balance;
  const receiverBalanceAfter = receiverBalanceBefore - amount;

  const { error: decreaseError } = await supabase
    .from('partners')
    .update({ balance: receiverBalanceAfter, updated_at: new Date().toISOString() })
    .eq('id', receiver.id);

  if (decreaseError) throw decreaseError;
  console.log('✅ 수신자 보유금 차감 완료');

  // 📝 수신자 로그 기록
  const { error: receiverLogError } = await supabase
    .from('partner_balance_logs')
    .insert({
      partner_id: receiver.id,
      balance_before: receiverBalanceBefore,
      balance_after: receiverBalanceAfter,
      amount: -amount,
      transaction_type: transactionType,
      from_partner_id: receiver.id,
      to_partner_id: isLv1ToLv2 ? null : sender.id, // ✅ Lv2→Lv1은 null
      processed_by: sender.id,
      memo: transferMemo || null
    });

  if (receiverLogError) throw receiverLogError;
  console.log('✅ 수신자 로그 기록 완료');

  // 송신자 보유금 증가
  console.log('💰 [출금] 송신자 보유금 증가 시작');

  let senderBalanceBefore = 0;
  let senderBalanceAfter = 0;

  if (sender.level === 1) {
    senderBalanceBefore = sender.balance;
    senderBalanceAfter = senderBalanceBefore + amount;

    const { error } = await supabase
      .from('partners')
      .update({ balance: senderBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', sender.id);

    if (error) throw error;
    console.log('✅ Lv1 보유금 증가 완료');
  } else if (sender.level === 2) {
    senderBalanceBefore = sender.oroplay_balance || 0;
    senderBalanceAfter = senderBalanceBefore + amount;

    const { error } = await supabase
      .from('partners')
      .update({ oroplay_balance: senderBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', sender.id);

    if (error) throw error;

    // 📝 Lv2 송신자 로그
    const { error: logError } = await supabase
      .from('partner_balance_logs')
      .insert({
        partner_id: sender.id,
        balance_before: senderBalanceBefore,
        balance_after: senderBalanceAfter,
        amount: amount,
        transaction_type: transactionType,
        from_partner_id: isLv1ToLv2 ? null : receiver.id, // ✅ Lv2←Lv1은 null
        to_partner_id: sender.id,
        processed_by: sender.id,
        api_type: 'oroplay',
        memo: transferMemo || null
      });

    if (logError) throw logError;
    console.log('✅ Lv2 송신자 보유금 증가 + 로그 기록 완료');
  } else if (sender.level >= 3) {
    senderBalanceBefore = sender.balance;
    senderBalanceAfter = senderBalanceBefore + amount;

    const { error } = await supabase
      .from('partners')
      .update({ balance: senderBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', sender.id);

    if (error) throw error;

    // 📝 Lv3+ 송신자 로그
    const { error: logError } = await supabase
      .from('partner_balance_logs')
      .insert({
        partner_id: sender.id,
        balance_before: senderBalanceBefore,
        balance_after: senderBalanceAfter,
        amount: amount,
        transaction_type: transactionType,
        from_partner_id: receiver.id,
        to_partner_id: sender.id,
        processed_by: sender.id,
        memo: transferMemo || null
      });

    if (logError) throw logError;
    console.log('✅ Lv3+ 송신자 보유금 증가 + 로그 기록 완료');
  }

  // transactions 테이블에 기록
  await recordTransaction({
    senderId: sender.id,
    receiverId: receiver.id,
    senderLevel: sender.level,
    senderBalanceBefore,
    senderBalanceAfter,
    senderName: sender.nickname,
    receiverName: receiver.nickname,
    amount,
    transactionType,
    transferMode: 'withdrawal',
    transferMemo
  });
}

/**
 * transactions 테이블 기록
 */
async function recordTransaction({
  senderId,
  receiverId,
  senderLevel,
  senderBalanceBefore,
  senderBalanceAfter,
  senderName,
  receiverName,
  amount,
  transactionType,
  transferMode,
  transferMemo
}: {
  senderId: string;
  receiverId: string;
  senderLevel: number;
  senderBalanceBefore: number;
  senderBalanceAfter: number;
  senderName: string;
  receiverName: string;
  amount: number;
  transactionType: string;
  transferMode: 'deposit' | 'withdrawal';
  transferMemo: string;
}) {
  const transactionRecord = {
    id: crypto.randomUUID(),
    user_id: null,
    partner_id: senderLevel === 1 ? null : senderId, // ✅ Lv1은 null
    transaction_type: transactionType,
    amount: transferMode === 'deposit' ? amount : -amount,
    status: 'completed',
    balance_before: senderBalanceBefore,
    balance_after: senderBalanceAfter,
    processed_by: senderId,
    processed_at: new Date().toISOString(),
    from_partner_id: transferMode === 'deposit' ? senderId : receiverId,
    to_partner_id: transferMode === 'deposit' ? receiverId : senderId,
    memo: transferMemo || `[파트너 ${transferMode === 'deposit' ? '입금' : '출금'}] ${senderName} → ${receiverName}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('transactions')
    .insert(transactionRecord);

  if (error) {
    console.error('❌ transactions 저장 실패:', error);
    throw error;
  }

  console.log('✅ transactions 테이블 저장 완료');
}
