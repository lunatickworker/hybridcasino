import { supabase } from "../../../lib/supabase";
import { Partner, TransferMode, TransferBalanceParams } from "./types";

/**
 * 파트너간 보유금 입출금 (GMS 머니 시스템 - 외부 API 호출 없음)
 * Lv2~Lv7간 입출금은 GMS 머니만 처리하며 외부 API 호출하지 않음
 */
export const transferBalanceToPartner = async ({
  transferTargetPartner,
  currentUserId,
  amount,
  transferMode,
  transferMemo = "",
  apiType // ✅ Lv2가 파트너에게 입출금 시 API 선택
}: TransferBalanceParams) => {
  // 1. 현재 관리자의 보유금 조회
  const { data: currentPartnerData, error: fetchError } = await supabase
    .from('partners')
    .select('balance, invest_balance, oroplay_balance, nickname, partner_type, level')
    .eq('id', currentUserId)
    .single();

  if (fetchError) throw fetchError;

  const isSystemAdmin = currentPartnerData.level === 1;

  console.log('💰 [파트너 보유금 입출금] 시작:', {
    송신자: currentPartnerData.nickname,
    송신자레벨: currentPartnerData.level,
    수신자: transferTargetPartner.nickname,
    수신자레벨: transferTargetPartner.level,
    타입: transferMode,
    금액: amount,
    API: apiType || 'N/A'
  });

  // 2. 입금 모드: 송신자 보유금 검증
  if (transferMode === 'deposit' && !isSystemAdmin) {
    // ✅ Lv2: 무조건 oroplay_balance 검증 (UserManagement와 동일)
    if (currentPartnerData.level === 2) {
      const oroplayBalance = currentPartnerData.oroplay_balance || 0;
      
      if (oroplayBalance < amount) {
        throw new Error(`SENDER_BALANCE_INSUFFICIENT:OroPlay=${oroplayBalance},required=${amount}`);
      }
    }
    // ✅ Lv3~7: GMS 머니(balance) 검증
    else if (currentPartnerData.level >= 3 && currentPartnerData.level <= 7) {
      if (currentPartnerData.balance < amount) {
        throw new Error(`SENDER_BALANCE_INSUFFICIENT:${currentPartnerData.balance}`);
      }
    }
  }

  // 3. 회수 모드: 대상 파트너 보유금 검증
  if (transferMode === 'withdrawal') {
    // Lv2는 GMS 머니(balance)만 확인
    if (transferTargetPartner.level === 2) {
      if (transferTargetPartner.balance < amount) {
        throw new Error(`TARGET_BALANCE_INSUFFICIENT:${transferTargetPartner.balance}`);
      }
    }
    // Lv3~7도 GMS 머니(balance) 확인
    else {
      if (transferTargetPartner.balance < amount) {
        throw new Error(`TARGET_BALANCE_INSUFFICIENT:${transferTargetPartner.balance}`);
      }
    }
  }

  // ✅ 4. DB 업데이트 (외부 API 호출 없이 내부 DB만 처리)
  console.log('✅ [파트너 보유금 입출금] 외부 API 호출 건너뜀 - 내부 DB만 처리 (GMS 머니 시스템)');

  if (transferMode === 'deposit') {
    // ===== 지급: 송금자 차감, 수신자 증가 =====
    
    // 송신자 보유금 차감 (시스템관리자가 아닌 경우)
    if (!isSystemAdmin) {
      // ✅ Lv2 → Lv3+: 무조건 oroplay_balance 차감 (UserManagement와 동일)
      if (currentPartnerData.level === 2) {
        const currentBalance = currentPartnerData.oroplay_balance || 0;
        const newBalance = currentBalance - amount;
        
        console.log(`💰 Lv2 oroplay_balance 차감:`, {
          before: currentBalance,
          after: newBalance,
          amount: -amount
        });

        const { error: deductError } = await supabase
          .from('partners')
          .update({ 
            oroplay_balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUserId);

        if (deductError) throw deductError;

        // 송신자 로그 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: currentUserId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: -amount,
            transaction_type: 'withdrawal',
            from_partner_id: currentUserId,
            to_partner_id: transferTargetPartner.id,
            processed_by: currentUserId,
            api_type: 'oroplay',
            memo: `[OroPlay 보유금 지급] ${transferTargetPartner.nickname}에게 ${amount.toLocaleString()}원 지급 (oroplay_balance: ${newBalance.toLocaleString()})${transferMemo ? `: ${transferMemo}` : ''}`
          });
      }
      // ✅ Lv3~7: GMS 머니(balance) 차감
      else if (currentPartnerData.level >= 3) {
        const currentBalance = currentPartnerData.balance;
        const newBalance = currentBalance - amount;
        
        console.log(`💰 Lv${currentPartnerData.level} balance 차감:`, {
          before: currentBalance,
          after: newBalance,
          amount: -amount
        });

        const { error: deductError } = await supabase
          .from('partners')
          .update({ 
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUserId);

        if (deductError) throw deductError;

        // 송신자 로그 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: currentUserId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: -amount,
            transaction_type: 'withdrawal',
            from_partner_id: currentUserId,
            to_partner_id: transferTargetPartner.id,
            processed_by: currentUserId,
            memo: `[보유금 지급] ${transferTargetPartner.nickname}에게 ${amount.toLocaleString()}원 지급${transferMemo ? `: ${transferMemo}` : ''}`
          });
      }
    }

    // 수신자 보유금 증가 (모든 레벨은 balance 사용)
    const receiverCurrentBalance = transferTargetPartner.balance;
    const receiverNewBalance = receiverCurrentBalance + amount;

    console.log(`💰 수신자 balance 증가:`, {
      before: receiverCurrentBalance,
      after: receiverNewBalance,
      amount: amount
    });

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
        balance_before: receiverCurrentBalance,
        balance_after: receiverNewBalance,
        amount: amount,
        transaction_type: 'deposit',
        from_partner_id: isSystemAdmin ? null : currentUserId,
        to_partner_id: transferTargetPartner.id,
        processed_by: currentUserId,
        memo: `[보유금 수신] ${currentPartnerData.nickname}으로부터 ${amount.toLocaleString()}원 수신${transferMemo ? `: ${transferMemo}` : ''}`
      });

  } else {
    // ===== 회수: 수신자 차감, 송금자 증가 =====
    
    // 수신자 보유금 차감 (모든 레벨은 balance 사용)
    const receiverCurrentBalance = transferTargetPartner.balance;
    const receiverNewBalance = receiverCurrentBalance - amount;

    console.log(`💰 회수 대상 balance 차감:`, {
      before: receiverCurrentBalance,
      after: receiverNewBalance,
      amount: -amount
    });

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
        balance_before: receiverCurrentBalance,
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
      // ✅ Lv2: 무조건 oroplay_balance 증가 (UserManagement와 동일)
      if (currentPartnerData.level === 2) {
        const currentBalance = currentPartnerData.oroplay_balance || 0;
        const newBalance = currentBalance + amount;
        
        console.log(`💰 Lv2 oroplay_balance 증가:`, {
          before: currentBalance,
          after: newBalance,
          amount: amount
        });

        const { error: increaseError } = await supabase
          .from('partners')
          .update({ 
            oroplay_balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUserId);

        if (increaseError) throw increaseError;

        // 송신자 로그 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: currentUserId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: amount,
            transaction_type: 'deposit',
            from_partner_id: transferTargetPartner.id,
            to_partner_id: currentUserId,
            processed_by: currentUserId,
            api_type: 'oroplay',
            memo: `[OroPlay 보유금 회수] ${transferTargetPartner.nickname}으로부터 ${amount.toLocaleString()}원 회수 (oroplay_balance: ${newBalance.toLocaleString()})${transferMemo ? `: ${transferMemo}` : ''}`
          });
      }
      // ✅ Lv3~7: GMS 머니(balance) 증가
      else if (currentPartnerData.level >= 3) {
        const currentBalance = currentPartnerData.balance;
        const newBalance = currentBalance + amount;
        
        console.log(`💰 Lv${currentPartnerData.level} balance 증가:`, {
          before: currentBalance,
          after: newBalance,
          amount: amount
        });

        const { error: increaseError } = await supabase
          .from('partners')
          .update({ 
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUserId);

        if (increaseError) throw increaseError;

        // 송신자 로그 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: currentUserId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: amount,
            transaction_type: 'deposit',
            from_partner_id: transferTargetPartner.id,
            to_partner_id: currentUserId,
            processed_by: currentUserId,
            memo: `[보유금 회수] ${transferTargetPartner.nickname}으로부터 ${amount.toLocaleString()}원 회수${transferMemo ? `: ${transferMemo}` : ''}`
          });
      }
    }
  }

  console.log('✅ [파트너 보유금 입출금] 완료');
};