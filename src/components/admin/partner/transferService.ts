import { supabase } from "../../../lib/supabase";
import { Partner, TransferMode, TransferBalanceParams } from "./types";

/**
 * ✅ 거래유형 결정 함수 (Lv별 계층 구조 고려)
 * - admin_deposit_initial: Lv1(운영사) → Lv2(본사) 입금
 * - admin_deposit_send: 상위 Lv에서 하위 Lv로의 입금 (환전)
 * - admin_deposit_receive: 하위 Lv에서 상위 Lv로의 입금 (충전)
 * - admin_withdrawal_initial: Lv2(본사) → Lv1(운영사) 출금
 * - admin_withdrawal_send: 상위 Lv에서 하위 Lv로의 출금 (환전)
 * - admin_withdrawal_receive: 하위 Lv에서 상위 Lv로의 출금 (충전)
 */
const getTransactionType = (
  senderLevel: number,
  receiverLevel: number,
  transferMode: TransferMode
): string => {
  if (transferMode === 'deposit') {
    // 입금: 송신자 → 수신자로 돈을 보냄
    if (senderLevel === 1 && receiverLevel === 2) {
      return 'admin_deposit_initial'; // 운영사 → 본사
    } else if (senderLevel < receiverLevel) {
      return 'admin_deposit_send'; // 상위 → 하위: 환전
    } else if (senderLevel > receiverLevel) {
      return 'admin_deposit_receive'; // 하위 → 상위: 충전
    }
  } else {
    // 출금: 수신자로부터 송신자가 돈을 회수
    if (senderLevel === 2 && receiverLevel === 1) {
      return 'admin_withdrawal_initial'; // 본사 → 운영사
    } else if (senderLevel < receiverLevel) {
      return 'admin_withdrawal_send'; // 상위 → 하위: 환전
    } else if (senderLevel > receiverLevel) {
      return 'admin_withdrawal_receive'; // 하위 → 상위: 충전
    }
  }
  // 기본값 (동일 레벨의 경우 발생하지 않음)
  return transferMode === 'deposit' ? 'deposit' : 'withdrawal';
};

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

  // ✅ 거래유형 결정
  const senderTransactionType = getTransactionType(currentPartnerData.level, transferTargetPartner.level, transferMode);
  const receiverTransactionType = getTransactionType(transferTargetPartner.level, currentPartnerData.level, transferMode === 'deposit' ? 'withdrawal' : 'deposit');

  console.log('💰 [파트너 보유금 입출금] 시작:', {
    송신자: currentPartnerData.nickname,
    송신자레벨: currentPartnerData.level,
    수신자: transferTargetPartner.nickname,
    수신자레벨: transferTargetPartner.level,
    타입: transferMode,
    금액: amount,
    송신자거래유형: senderTransactionType,
    수신자거래유형: receiverTransactionType,
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
        const { error: logError1 } = await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: currentUserId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: -amount,
            transaction_type: senderTransactionType,
            from_partner_id: currentUserId,
            to_partner_id: transferTargetPartner.id,
            processed_by: currentUserId,
            api_type: 'oroplay',
            memo: transferMemo || null  // ✅ 사용자 입력 메모만 저장
          });
        
        if (logError1) {
          console.error('❌ [Lv2 송신자 로그 기록 실패]:', logError1);
          throw logError1;
        }
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
        const { error: logError2 } = await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: currentUserId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: -amount,
            transaction_type: senderTransactionType,
            from_partner_id: currentUserId,
            to_partner_id: transferTargetPartner.id,
            processed_by: currentUserId,
            memo: transferMemo || null  // ✅ 사용자 입력 메모만 저장
          });
        
        if (logError2) {
          console.error('❌ [Lv3+ 송신자 로그 기록 실패]:', logError2);
          throw logError2;
        }
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
    const { error: logError3 } = await supabase
      .from('partner_balance_logs')
      .insert({
        partner_id: transferTargetPartner.id,
        balance_before: receiverCurrentBalance,
        balance_after: receiverNewBalance,
        amount: amount,
        transaction_type: receiverTransactionType,
        from_partner_id: isSystemAdmin ? null : currentUserId,
        to_partner_id: transferTargetPartner.id,
        processed_by: currentUserId,
        memo: transferMemo || null  // ✅ 사용자 입력 메모만 저장
      });
    
    if (logError3) {
      console.error('❌ [수신자 로그 기록 실패]:', logError3);
      throw logError3;
    }

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
    const { error: logError4 } = await supabase
      .from('partner_balance_logs')
      .insert({
        partner_id: transferTargetPartner.id,
        balance_before: receiverCurrentBalance,
        balance_after: receiverNewBalance,
        amount: -amount,
        transaction_type: receiverTransactionType,
        from_partner_id: transferTargetPartner.id,
        to_partner_id: isSystemAdmin ? null : currentUserId,
        processed_by: currentUserId,
        memo: transferMemo || null  // ✅ 사용자 입력 메모만 저장
      });
    
    if (logError4) {
      console.error('❌ [회수 대상 로그 기록 실패]:', logError4);
      throw logError4;
    }

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
        const { error: logError5 } = await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: currentUserId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: amount,
            transaction_type: senderTransactionType,
            from_partner_id: transferTargetPartner.id,
            to_partner_id: currentUserId,
            processed_by: currentUserId,
            api_type: 'oroplay',
            memo: transferMemo || null  // ✅ 사용자 입력 메모만 저장
          });
        
        if (logError5) {
          console.error('❌ [Lv2 회수자 로그 기록 실패]:', logError5);
          throw logError5;
        }
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
        const { error: logError6 } = await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: currentUserId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: amount,
            transaction_type: senderTransactionType,
            from_partner_id: transferTargetPartner.id,
            to_partner_id: currentUserId,
            processed_by: currentUserId,
            memo: transferMemo || null  // ✅ 사용자 입력 메모만 저장
          });
        
        if (logError6) {
          console.error('❌ [Lv3+ 회수자 로그 기록 실패]:', logError6);
          throw logError6;
        }
      }
    }
  }

  console.log('✅ [파트너 보유금 입출금] 완료');

  // ✅ 전체입출금내역에 기록하기 위해 transactions 테이블에도 저장
  const transactionRecord = {
    id: crypto.randomUUID(),
    user_id: null, // 파트너 간 거래이므로 회원 ID는 없음
    partner_id: isSystemAdmin ? null : currentUserId, // 송신자 파트너 ID
    transaction_type: senderTransactionType,
    amount: transferMode === 'deposit' ? amount : -amount,
    status: 'completed',
    balance_before: transferMode === 'deposit' 
      ? (currentPartnerData.level === 2 ? (currentPartnerData.oroplay_balance || 0) : currentPartnerData.balance)
      : transferTargetPartner.balance,
    balance_after: transferMode === 'deposit'
      ? (currentPartnerData.level === 2 
        ? ((currentPartnerData.oroplay_balance || 0) - amount)
        : (currentPartnerData.balance - amount))
      : (transferTargetPartner.balance - amount),
    processed_by: currentUserId,
    processed_at: new Date().toISOString(),
    from_partner_id: transferMode === 'deposit' ? currentUserId : transferTargetPartner.id,
    to_partner_id: transferMode === 'deposit' ? transferTargetPartner.id : currentUserId,
    memo: transferMemo || `[파트너 ${transferMode === 'deposit' ? '입금' : '출금'}] ${currentPartnerData.nickname} → ${transferTargetPartner.nickname}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error: transactionError } = await supabase
    .from('transactions')
    .insert(transactionRecord);

  if (transactionError) {
    console.error('❌ [전체입출금내역 저장 실패]:', transactionError);
    throw transactionError;
  }

  console.log('✅ [전체입출금내역] transactions 테이블 저장 완료:', {
    transaction_type: senderTransactionType,
    from: currentPartnerData.nickname,
    to: transferTargetPartner.nickname,
    amount: transferMode === 'deposit' ? amount : -amount
  });
};