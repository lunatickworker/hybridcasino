import { supabase } from "../../../lib/supabase";
import { Partner, TransferMode } from "./types";

interface TransferBalanceParams {
  transferTargetPartner: Partner;
  currentUserId: string;
  amount: number;
  transferMode: TransferMode;
  transferMemo?: string;
}

/**
 * 파트너간 보유금 입출금 (GMS 머니 시스템 - 외부 API 호출 없음)
 * Lv2~Lv7간 입출금은 GMS 머니만 처리하며 외부 API 호출하지 않음
 */
export const transferBalanceToPartner = async ({
  transferTargetPartner,
  currentUserId,
  amount,
  transferMode,
  transferMemo = ""
}: TransferBalanceParams) => {
  // 1. 현재 관리자의 보유금 조회
  const { data: currentPartnerData, error: fetchError } = await supabase
    .from('partners')
    .select('balance, nickname, partner_type, level')
    .eq('id', currentUserId)
    .single();

  if (fetchError) throw fetchError;

  const isSystemAdmin = currentPartnerData.level === 1;

  // 회수 모드인 경우: 대상 파트너의 보유금 검증
  if (transferMode === 'withdrawal') {
    const { data: targetBalanceData, error: targetBalanceError } = await supabase
      .from('partners')
      .select('balance')
      .eq('id', transferTargetPartner.id)
      .single();

    if (targetBalanceError) throw targetBalanceError;

    if (targetBalanceData.balance < amount) {
      throw new Error(`TARGET_BALANCE_INSUFFICIENT:${targetBalanceData.balance}`);
    }
  }

  // 2. 지급 모드: 보유금 검증
  if (transferMode === 'deposit' && !isSystemAdmin) {
    // ✅ Lv2는 GMS 머니(balance)만 사용
    if (currentPartnerData.balance < amount) {
      throw new Error(`BALANCE_LOW:${currentPartnerData.balance}`);
    }
  }

  // 2-1. 대본사가 본사에게 지급할 때: 하위 본사들의 보유금 합계가 대본사 보유금을 초과할 수 없음
  if (transferMode === 'deposit' && currentPartnerData.level === 2 && transferTargetPartner.partner_type === 'main_office') {
    // 현재 대본사 아래의 모든 본사(main_office) 보유금 합계 조회
    const { data: childMainOffices, error: childError } = await supabase
      .from('partners')
      .select('balance')
      .eq('parent_id', currentUserId)
      .eq('partner_type', 'main_office');

    if (childError) {
      console.error('[Child Main Office Fetch Error]:', childError);
      throw childError;
    }

    const currentChildBalanceSum = (childMainOffices || []).reduce((sum, office) => sum + (office.balance || 0), 0);
    const afterTransferChildBalanceSum = currentChildBalanceSum + amount;

    console.log('💰 [대본사→본사 지급 검증]', {
      대본사_보유금: currentPartnerData.balance,
      현재_하위본사_보유금합계: currentChildBalanceSum,
      지급액: amount,
      지급후_하위본사_보유금합계: afterTransferChildBalanceSum,
      초과여부: afterTransferChildBalanceSum > currentPartnerData.balance
    });

    if (afterTransferChildBalanceSum > currentPartnerData.balance) {
      throw new Error(`CHILD_BALANCE_EXCEEDS:${currentChildBalanceSum}:${afterTransferChildBalanceSum}:${currentPartnerData.balance}`);
    }
  }

  // ✅ 3. 파트너간 입출금은 GMS 머니 시스템 - 외부 API 호출 없이 내부 DB만 처리
  console.log('✅ [파트너 보유금 입출금] 외부 API 호출 건너뜀 - 내부 DB만 처리 (GMS 머니 시스템)');
  
  let senderNewBalance = currentPartnerData.balance;
  let receiverNewBalance = transferTargetPartner.balance;

  if (transferMode === 'deposit') {
    // 지급: 송금자 차감, 수신자 증가
    if (!isSystemAdmin) {
      // ✅ Lv2~7: GMS 머니(balance) 차감
      senderNewBalance = currentPartnerData.balance - amount;
      const { error: deductError } = await supabase
        .from('partners')
        .update({ 
          balance: senderNewBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentUserId);

      if (deductError) throw deductError;

      // 송신자 로그 기록
      await supabase
        .from('partner_balance_logs')
        .insert({
          partner_id: currentUserId,
          balance_before: currentPartnerData.balance,
          balance_after: senderNewBalance,
          amount: -amount,
          transaction_type: 'withdrawal',
          from_partner_id: currentUserId,
          to_partner_id: transferTargetPartner.id,
          processed_by: currentUserId,
          memo: `[보유금 지급] ${transferTargetPartner.nickname}에게 ${amount.toLocaleString()}원 지급${transferMemo ? `: ${transferMemo}` : ''}`
        });
    }

    // 수신자 보유금 증가
    receiverNewBalance = transferTargetPartner.balance + amount;
    const { error: increaseError } = await supabase
      .from('partners')
      .update({ 
        balance: receiverNewBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', transferTargetPartner.id);

    if (increaseError) throw increaseError;

    // 수신자 로그 기록
    await supabase
      .from('partner_balance_logs')
      .insert({
        partner_id: transferTargetPartner.id,
        balance_before: transferTargetPartner.balance,
        balance_after: receiverNewBalance,
        amount: amount,
        transaction_type: 'deposit',
        from_partner_id: isSystemAdmin ? null : currentUserId,
        to_partner_id: transferTargetPartner.id,
        processed_by: currentUserId,
        memo: `[보유금 수신] ${currentPartnerData.nickname}으로부터 ${amount.toLocaleString()}원 수신${transferMemo ? `: ${transferMemo}` : ''}`
      });

  } else {
    // 회수: 수신자 차감, 송금자 증가
    receiverNewBalance = transferTargetPartner.balance - amount;
    const { error: decreaseError } = await supabase
      .from('partners')
      .update({ 
        balance: receiverNewBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', transferTargetPartner.id);

    if (decreaseError) throw decreaseError;

    // 대상 파트너 로그 기록
    await supabase
      .from('partner_balance_logs')
      .insert({
        partner_id: transferTargetPartner.id,
        balance_before: transferTargetPartner.balance,
        balance_after: receiverNewBalance,
        amount: -amount,
        transaction_type: 'withdrawal',
        from_partner_id: transferTargetPartner.id,
        to_partner_id: isSystemAdmin ? null : currentUserId,
        processed_by: currentUserId,
        memo: `[보유금 회수] ${currentPartnerData.nickname}이(가) ${amount.toLocaleString()}원 회수${transferMemo ? `: ${transferMemo}` : ''}`
      });

    // 송금자 보유금 증가 (시스템관리자가 아닌 경우)
    if (!isSystemAdmin) {
      senderNewBalance = currentPartnerData.balance + amount;
      const { error: increaseError } = await supabase
        .from('partners')
        .update({ 
          balance: senderNewBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentUserId);

      if (increaseError) throw increaseError;

      // 송신자 로그 기록
      await supabase
        .from('partner_balance_logs')
        .insert({
          partner_id: currentUserId,
          balance_before: currentPartnerData.balance,
          balance_after: senderNewBalance,
          amount: amount,
          transaction_type: 'deposit',
          from_partner_id: transferTargetPartner.id,
          to_partner_id: currentUserId,
          processed_by: currentUserId,
          memo: `[보유금 회수] ${transferTargetPartner.nickname}으로부터 ${amount.toLocaleString()}원 회수${transferMemo ? `: ${transferMemo}` : ''}`
        });
    }
  }

  return {
    success: true,
    senderNewBalance,
    receiverNewBalance
  };
};
