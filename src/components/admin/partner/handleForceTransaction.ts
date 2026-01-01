import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner@2.0.3';

interface ForceTransactionData {
  targetId: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  memo: string;
  apiType?: 'invest' | 'oroplay';
}

export async function handleForceTransaction(
  data: ForceTransactionData,
  authUserId: string,
  t: any,
  connected: boolean,
  sendMessage: ((data: any) => void) | null,
  fetchPartners: () => void
) {
  try {
    console.log('💰 [파트너 강제 입출금] 시작:', data);

    // 1. 대상 파트너 정보 조회
    const { data: targetPartner, error: targetError } = await supabase
      .from('partners')
      .select('id, nickname, balance, level, partner_type, invest_balance, oroplay_balance')
      .eq('id', data.targetId)
      .single();

    if (targetError || !targetPartner) {
      toast.error(t.partnerManagement.targetPartnerFetchError);
      console.error('❌ 대상 파트너 조회 실패:', targetError);
      return;
    }

    // 2. 관리자 정보 조회
    const { data: adminPartner, error: adminError } = await supabase
      .from('partners')
      .select('balance, level, nickname, partner_type, invest_balance, oroplay_balance')
      .eq('id', authUserId)
      .single();

    if (adminError || !adminPartner) {
      toast.error(t.partnerManagement.adminInfoFetchError);
      console.error('❌ 관리자 정보 조회 실패:', adminError);
      return;
    }

    const isSystemAdmin = adminPartner.level === 1;
    const isHeadOffice = targetPartner.partner_type === 'head_office';
    const isLv1ToLv2 = isSystemAdmin && targetPartner.level === 2;
    const isLv1ToLv3 = isSystemAdmin && targetPartner.level === 3;
    const isLv2ToLv3 = adminPartner.level === 2 && targetPartner.level === 3;

    console.log('📊 [파트너 강제 입출금] 상황:', {
      isLv1ToLv2,
      isLv2ToLv3,
      adminLevel: adminPartner.level,
      targetLevel: targetPartner.level,
      apiType: data.apiType
    });

    // 3. 출금 시 대상 파트너 보유금 검증
    if (data.type === 'withdrawal') {
      // Lv2는 두 개의 지갑 중에서 해당 API 잔고 확인
      if (isLv1ToLv2 && data.apiType) {
        const currentBalance = (data.apiType === 'invest' ? targetPartner.invest_balance : targetPartner.oroplay_balance) || 0;
        if (currentBalance < data.amount) {
          const balanceName = data.apiType === 'invest' ? 'Invest' : 'OroPlay';
          toast.error(t.partnerManagement.withdrawalExceedError.replace('{{balance}}', `${balanceName} ${currentBalance.toLocaleString()}`));
          return;
        }
      }
      // Lv3~7은 단일 balance 사용
      else if (!isLv1ToLv2 && targetPartner.balance < data.amount) {
        toast.error(t.partnerManagement.withdrawalExceedError.replace('{{balance}}', targetPartner.balance.toLocaleString()));
        return;
      }
    }

    // 4. 입금 시 관리자 보유금 검증
    if (data.type === 'deposit') {
      // Lv1 → Lv2 특별 처리: API별 검증
      if (isLv1ToLv2 && data.apiType) {
        // ✅ 새 구조: api_provider별 balance 조회
        const { data: apiConfig, error: apiConfigError } = await supabase
          .from('api_configs')
          .select('balance')
          .eq('partner_id', authUserId)
          .eq('api_provider', data.apiType)
          .maybeSingle();

        if (apiConfigError || !apiConfig) {
          toast.error(t.partnerManagement.apiConfigFetchError);
          console.error('❌ API 설정 조회 실패:', apiConfigError);
          return;
        }

        const availableBalance = apiConfig.balance || 0;

        console.log(`💳 Lv1 ${data.apiType.toUpperCase()} API 보유금:`, availableBalance);

        if (availableBalance < data.amount) {
          const apiName = data.apiType === 'invest' ? 'Invest' : 'OroPlay';
          toast.error(t.partnerManagement.apiBalanceInsufficientError
            .replace('{{apiName}}', apiName)
            .replace('{{balance}}', availableBalance.toLocaleString()));
          return;
        }
      }
      // ✅ Lv2 → Lv3+ 입금 시: 보유금 검증 건너뜀 (API 동기화로 관리)
      else if (adminPartner.level === 2) {
        console.log('💰 [입금] Lv2는 보유금 검증 건너뜀 (API 동기화로 관리)');
      }
      // 일반 검증 (Lv3~6만)
      else if (adminPartner.level >= 3 && adminPartner.balance < data.amount) {
        toast.error(t.partnerManagement.balanceInsufficientError.replace('{{balance}}', adminPartner.balance.toLocaleString()));
        return;
      }
    }

    // ✅ 5. Lv1 → Lv2 입금은 외부 API 호출 없이 DB만 업데이트
    if (isLv1ToLv2 && data.type === 'deposit' && data.apiType) {
      console.log('✅ [Lv1→Lv2 입금] Lv1의 api_configs 차감 + Lv2 지갑 증가');
      
      const balanceField = data.apiType === 'invest' ? 'invest_balance' : 'oroplay_balance';
      const currentBalance = (data.apiType === 'invest' ? targetPartner.invest_balance : targetPartner.oroplay_balance) || 0;
      const newBalance = currentBalance + data.amount;

      // ✅ 1) Lv1의 api_configs.balance 차감
      const { data: apiConfig, error: apiConfigError } = await supabase
        .from('api_configs')
        .select('balance')
        .eq('partner_id', authUserId)
        .eq('api_provider', data.apiType)
        .maybeSingle();

      if (apiConfigError || !apiConfig) {
        toast.error('API 설정을 찾을 수 없습니다.');
        console.error('❌ API 설정 조회 실패:', apiConfigError);
        return;
      }

      const lv1NewBalance = (apiConfig.balance || 0) - data.amount;

      const { error: lv1UpdateError } = await supabase
        .from('api_configs')
        .update({ 
          balance: lv1NewBalance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', authUserId)
        .eq('api_provider', data.apiType);

      if (lv1UpdateError) {
        toast.error('Lv1 API 잔고 차감 실패');
        console.error('❌ Lv1 api_configs 업데이트 실패:', lv1UpdateError);
        return;
      }

      console.log(`✅ Lv1 api_configs.${data.apiType}.balance 차감:`, {
        before: apiConfig.balance,
        after: lv1NewBalance,
        amount: -data.amount
      });

      // ✅ 2) Lv2 partners 테이블 API별 잔고 증가
      const { error: updateError } = await supabase
        .from('partners')
        .update({ 
          [balanceField]: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.targetId);

      if (updateError) {
        toast.error(t.partnerManagement.lv2BalanceUpdateError);
        console.error('❌ Lv2 partners 업데이트 실패:', updateError);
        return;
      }

      console.log(`✅ Lv2 partners.${balanceField} 증가:`, {
        before: currentBalance,
        after: newBalance,
        amount: data.amount
      });

      // 로그 기록
      const apiName = data.apiType === 'invest' ? 'Invest' : 'OroPlay';
      await supabase
        .from('partner_balance_logs')
        .insert({
          partner_id: data.targetId,
          balance_before: currentBalance,
          balance_after: newBalance,
          amount: data.amount,
          transaction_type: 'deposit',
          from_partner_id: authUserId,
          to_partner_id: data.targetId,
          processed_by: authUserId,
          api_type: data.apiType,
          memo: `[${apiName} API 할당] ${adminPartner.nickname}으로부터 ${data.amount.toLocaleString()}원 할당${data.memo ? `: ${data.memo}` : ''}`
        });

      toast.success(t.partnerManagement.apiAllocationSuccess
        .replace('{{nickname}}', targetPartner.nickname)
        .replace('{{apiName}}', apiName)
        .replace('{{amount}}', data.amount.toLocaleString()));

      fetchPartners();
      return;
    }

    // ✅ 6. Lv1 → Lv2 출금도 외부 API 호출 없이 DB만 업데이트
    if (isLv1ToLv2 && data.type === 'withdrawal' && data.apiType) {
      console.log('✅ [Lv1→Lv2 출금] Lv1의 api_configs 증가 + Lv2 지갑 차감');

      const balanceField = data.apiType === 'invest' ? 'invest_balance' : 'oroplay_balance';
      const currentBalance = (data.apiType === 'invest' ? targetPartner.invest_balance : targetPartner.oroplay_balance) || 0;
      const newBalance = currentBalance - data.amount;

      // ✅ 1) Lv2 partners 테이블 API별 잔고 차감
      const { error: updateError } = await supabase
        .from('partners')
        .update({ 
          [balanceField]: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.targetId);

      if (updateError) {
        toast.error(t.partnerManagement.lv2WithdrawalDeductError);
        console.error('❌ Lv2 partners 업데이트 실패:', updateError);
        return;
      }

      console.log(`✅ Lv2 partners.${balanceField} 차감:`, {
        before: currentBalance,
        after: newBalance,
        amount: -data.amount
      });

      // ✅ 2) Lv1의 api_configs.balance 증가
      const { data: apiConfig, error: apiConfigError } = await supabase
        .from('api_configs')
        .select('balance')
        .eq('partner_id', authUserId)
        .eq('api_provider', data.apiType)
        .maybeSingle();

      if (apiConfigError || !apiConfig) {
        toast.error('API 설정을 찾을 수 없습니다.');
        console.error('❌ API 설정 조회 실패:', apiConfigError);
        return;
      }

      const lv1NewBalance = (apiConfig.balance || 0) + data.amount;

      const { error: lv1UpdateError } = await supabase
        .from('api_configs')
        .update({ 
          balance: lv1NewBalance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', authUserId)
        .eq('api_provider', data.apiType);

      if (lv1UpdateError) {
        toast.error('Lv1 API 잔고 증가 실패');
        console.error('❌ Lv1 api_configs 업데이트 실패:', lv1UpdateError);
        return;
      }

      console.log(`✅ Lv1 api_configs.${data.apiType}.balance 증가:`, {
        before: apiConfig.balance,
        after: lv1NewBalance,
        amount: data.amount
      });

      // 로그 기록
      const apiName = data.apiType === 'invest' ? 'Invest' : 'OroPlay';
      await supabase
        .from('partner_balance_logs')
        .insert({
          partner_id: data.targetId,
          balance_before: currentBalance,
          balance_after: newBalance,
          amount: -data.amount,
          transaction_type: 'withdrawal',
          from_partner_id: data.targetId,
          to_partner_id: authUserId,
          processed_by: authUserId,
          api_type: data.apiType,
          memo: `[${apiName} API 회수] ${adminPartner.nickname}이(가) ${data.amount.toLocaleString()}원 회수${data.memo ? `: ${data.memo}` : ''}`
        });

      toast.success(t.partnerManagement.apiRecoveryCompletedFromPartner
        .replace('{{nickname}}', targetPartner.nickname)
        .replace('{{apiName}}', apiName)
        .replace('{{amount}}', data.amount.toLocaleString()));

      fetchPartners();
      return;
    }

    // 7. 내부 DB 업데이트 (파트너 간 입출금은 외부 API 호출 없이 DB만 처리)
    console.log('✅ [파트너 강제 입출금] 외부 API 호출 건너뜀 - 내부 DB만 처리');
    
    let adminNewBalance = adminPartner.balance;
    let targetNewBalance = targetPartner.balance;

    if (data.type === 'deposit') { 
      // Lv1/Lv2 → Lv3 입금: Lv2 변동 없음, Lv3 balance만 증가
      if ((isLv1ToLv3 || isLv2ToLv3) && targetPartner.level === 3) {
        console.log('✅ [Lv1/Lv2→Lv3 입금] Lv2 변동 없음, Lv3 balance만 증가');
        
        // Lv3: balance 증가
        const targetBalanceBefore = targetPartner.balance;
        const targetBalanceAfter = targetBalanceBefore + data.amount;

        await supabase
          .from('partners')
          .update({ 
            balance: targetBalanceAfter,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.targetId);

        // ✅ 로그 기록 - Lv3 입금 내역만 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: data.targetId,
            balance_before: targetBalanceBefore,
            balance_after: targetBalanceAfter,
            amount: data.amount,
            transaction_type: 'deposit',
            from_partner_id: authUserId,
            to_partner_id: data.targetId,
            processed_by: authUserId,
            memo: `[Lv3 수신] ${adminPartner.nickname}으로부터 ${data.amount.toLocaleString()}원 입금${data.memo ? `: ${data.memo}` : ''}`
          });

        toast.success(t.partnerManagement.depositCompleted
        .replace('{{nickname}}', targetPartner.nickname)
        .replace('{{amount}}', data.amount.toLocaleString()));
        fetchPartners();
        return;
      }
      // ✅ Lv2 → Lv4~6 입금: Lv2 보유금 변동 없음 (4초마다 API 동기화), Lv4~6만 증가
      if (adminPartner.level === 2 && targetPartner.level >= 4) {
        console.log('✅ [Lv2→Lv4~6 입금] Lv2 보유금 변동 없음, 대상만 증가');
        
        // 대상 파트너(Lv4~6) balance 증가만
        targetNewBalance = targetPartner.balance + data.amount;
        await supabase
          .from('partners')
          .update({ balance: targetNewBalance, updated_at: new Date().toISOString() })
          .eq('id', data.targetId);

        // ✅ 로그 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: data.targetId,
            balance_before: targetPartner.balance,
            balance_after: targetNewBalance,
            amount: data.amount,
            transaction_type: 'deposit',
            from_partner_id: authUserId,
            to_partner_id: data.targetId,
            processed_by: authUserId,
            memo: `[강제입금] ${adminPartner.nickname}으로부터 ${data.amount.toLocaleString()}원 입금 (Lv2는 API 동기화로 관리)${data.memo ? `: ${data.memo}` : ''}`
          });

        toast.success(t.partnerManagement.depositCompleted
          .replace('{{nickname}}', targetPartner.nickname)
          .replace('{{amount}}', data.amount.toLocaleString()));
        fetchPartners();
        return;
      }
      // Lv3~6 일반 입금: 관리자 차감, 파트너 증가
      else {
        adminNewBalance = adminPartner.balance - data.amount;
        await supabase
          .from('partners')
          .update({ balance: adminNewBalance, updated_at: new Date().toISOString() })
          .eq('id', authUserId);

        targetNewBalance = targetPartner.balance + data.amount;
        await supabase
          .from('partners')
          .update({ balance: targetNewBalance, updated_at: new Date().toISOString() })
          .eq('id', data.targetId);

        // ✅ 로그 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: data.targetId,
            balance_before: targetPartner.balance,
            balance_after: targetNewBalance,
            amount: data.amount,
            transaction_type: 'deposit',
            from_partner_id: authUserId,
            to_partner_id: data.targetId,
            processed_by: authUserId,
            memo: `[강제입금] ${adminPartner.nickname}으로부터 ${data.amount.toLocaleString()}원 입금${data.memo ? `: ${data.memo}` : ''}`
          });
      }

    } else {
      // 출금 처리
      // Lv1/Lv2 → Lv3 회수: Lv2 변동 없음, Lv3 balance만 차감
      if ((isLv1ToLv3 || isLv2ToLv3) && targetPartner.level === 3) {
        console.log(`✅ [Lv1/Lv2→Lv3 회수] Lv2 변동 없음, Lv3 balance만 차감`);
        
        // Lv3: balance 차감
        const targetBalanceBefore = targetPartner.balance;
        const targetBalanceAfter = targetBalanceBefore - data.amount;

        await supabase
          .from('partners')
          .update({ 
            balance: targetBalanceAfter,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.targetId);

        // ✅ 로그 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: data.targetId,
            balance_before: targetBalanceBefore,
            balance_after: targetBalanceAfter,
            amount: -data.amount,
            transaction_type: 'withdrawal',
            from_partner_id: data.targetId,
            to_partner_id: authUserId,
            processed_by: authUserId,
            memo: `[Lv3 회수] ${adminPartner.nickname}에게 ${data.amount.toLocaleString()}원 출금${data.memo ? `: ${data.memo}` : ''}`
          });

        toast.success(t.partnerManagement.withdrawalCompleted
          .replace('{{nickname}}', targetPartner.nickname)
          .replace('{{amount}}', data.amount.toLocaleString()));
        fetchPartners();
        return;
      }
      // ✅ Lv2 → Lv4~6 출금: Lv2 보유금 변동 없음 (4초마다 API 동기화), Lv4~6만 차감
      if (adminPartner.level === 2 && targetPartner.level >= 4) {
        console.log('✅ [Lv2→Lv4~6 회수] Lv2 보유금 변동 없음, 대상만 차감');
        
        // 대상 파트너(Lv4~6) balance 차감만
        targetNewBalance = targetPartner.balance - data.amount;
        await supabase
          .from('partners')
          .update({ balance: targetNewBalance, updated_at: new Date().toISOString() })
          .eq('id', data.targetId);

        // ✅ 로그 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: data.targetId,
            balance_before: targetPartner.balance,
            balance_after: targetNewBalance,
            amount: -data.amount,
            transaction_type: 'withdrawal',
            from_partner_id: data.targetId,
            to_partner_id: authUserId,
            processed_by: authUserId,
            memo: `[강제출금] ${adminPartner.nickname}에게 ${data.amount.toLocaleString()}원 출금 (Lv2는 API 동기화로 관리)${data.memo ? `: ${data.memo}` : ''}`
          });

        toast.success(t.partnerManagement.withdrawalCompleted
          .replace('{{nickname}}', targetPartner.nickname)
          .replace('{{amount}}', data.amount.toLocaleString()));
        fetchPartners();
        return;
      }
      // Lv3~6 일반 출금: 파트너 차감, 관리자 증가
      else {
        targetNewBalance = targetPartner.balance - data.amount;
        await supabase
          .from('partners')
          .update({ balance: targetNewBalance, updated_at: new Date().toISOString() })
          .eq('id', data.targetId);

        adminNewBalance = adminPartner.balance + data.amount;
        await supabase
          .from('partners')
          .update({ balance: adminNewBalance, updated_at: new Date().toISOString() })
          .eq('id', authUserId);

        // ✅ 로그 기록
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: data.targetId,
            balance_before: targetPartner.balance,
            balance_after: targetNewBalance,
            amount: -data.amount,
            transaction_type: 'withdrawal',
            from_partner_id: data.targetId,
            to_partner_id: authUserId,
            processed_by: authUserId,
            memo: `[강제출금] ${adminPartner.nickname}에게 ${data.amount.toLocaleString()}원 출금${data.memo ? `: ${data.memo}` : ''}`
          });
      }
    }

    // 8. 실시간 업데이트
    if (connected && sendMessage) {
      sendMessage('partner_balance_updated', {
        partnerId: data.targetId,
        amount: data.amount,
        type: data.type
      });
    }

    // 9. 성공 메시지 및 목록 새로고침
    const typeText = data.type === 'deposit' ? t.partnerManagement.depositTypeLabel : t.partnerManagement.withdrawalTypeLabel;
    toast.success(t.partnerManagement.forceTransactionSuccess.replace('{{type}}', typeText).replace('{{amount}}', data.amount.toLocaleString()));
    fetchPartners();

  } catch (error: any) {
    console.error('❌ [파트너 강제 입출금] 오류:', error);
    toast.error('입출금 처리 중 오류가 발생했습니다.');
  }
}