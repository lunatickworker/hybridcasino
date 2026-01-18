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
      return 'admin_withdrawal_send'; // ✅ 본사 → 운영사: "파트너 환전" (Lv2가 내보내는 것)
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

    console.log('🔄 [Lv1 sender update]:', { id: sender.id, before: senderBalanceBefore, after: senderBalanceAfter });
    
    const { error } = await supabase
      .from('partners')
      .update({ balance: senderBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', sender.id);

    if (error) {
      console.error('❌ [Lv1 sender update error]:', error);
      throw error;
    }
    console.log('✅ Lv1 보유금 차감 완료');
  } else if (sender.level === 2) {
    senderBalanceBefore = sender.balance;
    senderBalanceAfter = senderBalanceBefore - amount;

    const { error } = await supabase
      .from('partners')
      .update({ balance: senderBalanceAfter, updated_at: new Date().toISOString() })
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
  let receiverBalanceBefore = 0;
  let receiverBalanceAfter = 0;

  // 수신자 레벨에 따라 다른 필드 업데이트
  if (receiver.level === 1) {
    receiverBalanceBefore = receiver.balance;
    receiverBalanceAfter = receiverBalanceBefore + amount;

    console.log('🔄 [Lv1 receiver update]:', { id: receiver.id, before: receiverBalanceBefore, after: receiverBalanceAfter });
    
    const { error: increaseError } = await supabase
      .from('partners')
      .update({ balance: receiverBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', receiver.id);

    if (increaseError) {
      console.error('❌ [Lv1 receiver update error]:', increaseError);
      throw increaseError;
    }
  } else if (receiver.level === 2) {
    // Lv2: balance 업데이트
    receiverBalanceBefore = receiver.balance;
    receiverBalanceAfter = receiverBalanceBefore + amount;

    console.log('🔄 [Lv2 receiver update]:', { id: receiver.id, before: receiverBalanceBefore, after: receiverBalanceAfter });
    
    const { error: increaseError } = await supabase
      .from('partners')
      .update({ balance: receiverBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', receiver.id);

    if (increaseError) {
      console.error('❌ [Lv2 receiver update error]:', increaseError);
      throw increaseError;
    }
  } else {
    // Lv3+: balance 업데이트
    receiverBalanceBefore = receiver.balance;
    receiverBalanceAfter = receiverBalanceBefore + amount;

    console.log('🔄 [Lv3+ receiver update]:', { id: receiver.id, level: receiver.level, before: receiverBalanceBefore, after: receiverBalanceAfter });
    
    const { error: increaseError } = await supabase
      .from('partners')
      .update({ balance: receiverBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', receiver.id);

    if (increaseError) {
      console.error('❌ [Lv3+ receiver update error]:', increaseError);
      throw increaseError;
    }
  }
  
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
  let receiverBalanceBefore = 0;
  let receiverBalanceAfter = 0;

  // 수신자 레벨에 따라 다른 필드 차감
  if (receiver.level === 1) {
    receiverBalanceBefore = receiver.balance;
    receiverBalanceAfter = receiverBalanceBefore - amount;

    const { error: decreaseError } = await supabase
      .from('partners')
      .update({ balance: receiverBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', receiver.id);

    if (decreaseError) throw decreaseError;
  } else if (receiver.level === 2) {
    // Lv2: balance 차감
    receiverBalanceBefore = receiver.balance;
    receiverBalanceAfter = receiverBalanceBefore - amount;

    const { error: decreaseError } = await supabase
      .from('partners')
      .update({ balance: receiverBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', receiver.id);

    if (decreaseError) throw decreaseError;
  } else {
    // Lv3+: balance 차감
    receiverBalanceBefore = receiver.balance;
    receiverBalanceAfter = receiverBalanceBefore - amount;

    const { error: decreaseError } = await supabase
      .from('partners')
      .update({ balance: receiverBalanceAfter, updated_at: new Date().toISOString() })
      .eq('id', receiver.id);

    if (decreaseError) throw decreaseError;
  }
  
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
      to_partner_id: isLv1ToLv2 ? null : sender.id, // ✅ Lv1(수신자)은 기록 없음
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
    senderBalanceBefore = sender.balance;
    senderBalanceAfter = senderBalanceBefore + amount;

    const { error } = await supabase
      .from('partners')
      .update({ balance: senderBalanceAfter, updated_at: new Date().toISOString() })
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
        from_partner_id: sender.id,
        to_partner_id: isLv1ToLv2 ? null : receiver.id,
        processed_by: sender.id,
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
}

