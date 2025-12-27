/**
 * 자동 정산 Edge Function
 * - 매일 00:04에 전날 데이터를 자동으로 정산
 * - 수동 정산과 동일한 로직 사용 (executeIntegratedSettlement)
 */

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

/**
 * 정산 실행 결과
 */
interface SettlementExecutionResult {
  success: boolean;
  message: string;
  settlementId?: string;
  error?: string;
}

/**
 * 통합 정산 실행 (기록만 생성, 보유금 변경 없음)
 * ✅ /lib/settlementExecutor.ts의 executeIntegratedSettlement와 동일한 로직
 */
async function executeIntegratedSettlement(
  partnerId: string,
  commissionRates: { 
    rolling: number; 
    losing: number; 
    casino_rolling: number;
    casino_losing: number;
    slot_rolling: number;
    slot_losing: number;
    withdrawal: number;
  },
  startDate: string,
  endDate: string,
  settlementPeriod: string,
  apiFilter: 'all' | 'invest' | 'oroplay' | 'familyapi' | 'honorapi' = 'all'
): Promise<SettlementExecutionResult> {
  try {
    // 1. 중복 정산 체크
    const periodStart = new Date(startDate).toISOString().split('T')[0];
    const periodEnd = new Date(endDate).toISOString().split('T')[0];
    
    const { data: existsData, error: existsError } = await supabase
      .rpc('check_settlement_exists', {
        p_partner_id: partnerId,
        p_settlement_type: 'integrated',
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_api_filter: apiFilter
      });

    if (existsError) {
      return { success: false, message: '중복 정산 체크에 실패했습니다.', error: existsError.message };
    }

    if (existsData === true) {
      return { success: false, message: '이미 정산이 완료된 기간입니다.' };
    }

    // 2. 통합 정산 계산
    // ✅ 프론트엔드와 달리 Edge Function에서는 직접 계산 로직을 구현해야 함
    // calculateIntegratedSettlement을 Edge Function으로 이식
    const settlement = await calculateIntegratedSettlementInEdge(
      partnerId,
      commissionRates,
      startDate,
      endDate,
      apiFilter
    );

    if (settlement.netTotalProfit <= 0) {
      return { success: false, message: '순수익이 0원 이하입니다. 정산할 수 없습니다.' };
    }

    // 3. 정산 기록 생성 (통합 정산은 보유금 변경 없이 기록만)
    const { data: settlementRecord, error: settlementError } = await supabase
      .from('settlements')
      .insert({
        partner_id: partnerId,
        settlement_type: 'integrated',
        settlement_period: settlementPeriod,
        api_filter: apiFilter,
        period_start: periodStart,
        period_end: periodEnd,
        total_bet_amount: 0,
        total_win_amount: 0,
        total_withdrawal_amount: 0,
        rolling_commission: settlement.netRollingProfit,
        losing_commission: settlement.netLosingProfit,
        withdrawal_commission: settlement.netWithdrawalProfit,
        commission_amount: settlement.netTotalProfit,
        commission_rate: 0,
        my_total_income: settlement.myTotalIncome,
        partner_total_payments: settlement.partnerTotalPayments,
        net_profit: settlement.netTotalProfit,
        status: 'completed',
        processed_at: new Date().toISOString(),
        executed_by: partnerId,
        settlement_details: {
          my_income: {
            casino_rolling: settlement.myCasinoRollingIncome,
            casino_losing: settlement.myCasinoLosingIncome,
            slot_rolling: settlement.mySlotRollingIncome,
            slot_losing: settlement.mySlotLosingIncome,
            rolling: settlement.myRollingIncome,
            losing: settlement.myLosingIncome,
            withdrawal: settlement.myWithdrawalIncome,
            total: settlement.myTotalIncome
          },
          partner_payments: {
            casino_rolling: settlement.partnerCasinoRollingPayments,
            casino_losing: settlement.partnerCasinoLosingPayments,
            slot_rolling: settlement.partnerSlotRollingPayments,
            slot_losing: settlement.partnerSlotLosingPayments,
            rolling: settlement.partnerRollingPayments,
            losing: settlement.partnerLosingPayments,
            withdrawal: settlement.partnerWithdrawalPayments,
            total: settlement.partnerTotalPayments
          },
          net_profit: {
            casino_rolling: settlement.netCasinoRollingProfit,
            casino_losing: settlement.netCasinoLosingProfit,
            slot_rolling: settlement.netSlotRollingProfit,
            slot_losing: settlement.netSlotLosingProfit,
            rolling: settlement.netRollingProfit,
            losing: settlement.netLosingProfit,
            withdrawal: settlement.netWithdrawalProfit,
            total: settlement.netTotalProfit
          }
        }
      })
      .select()
      .single();

    if (settlementError) {
      return { success: false, message: '정산 기록 생성에 실패했습니다.', error: settlementError.message };
    }

    return {
      success: true,
      message: `통합 정산이 완료되었습니다. (순수익: ₩${settlement.netTotalProfit.toLocaleString()})`,
      settlementId: settlementRecord.id
    };

  } catch (error) {
    console.error('통합 정산 실행 실패:', error);
    return { 
      success: false, 
      message: '통합 정산 처리 중 오류가 발생했습니다.', 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * 통합 정산 계산 (Edge Function 버전)
 * ✅ /lib/settlementCalculator.ts의 calculateIntegratedSettlement를 Edge Function으로 이식
 */
async function calculateIntegratedSettlementInEdge(
  partnerId: string,
  commissionRates: {
    rolling: number;
    losing: number;
    casino_rolling: number;
    casino_losing: number;
    slot_rolling: number;
    slot_losing: number;
    withdrawal: number;
  },
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
) {
  // 1. 내 수입 계산
  const myIncome = await calculateMyIncomeInEdge(partnerId, commissionRates, startDate, endDate, apiFilter);
  
  // 2. 하위 파트너 지급액 계산
  const partnerPayments = await calculatePartnerPaymentsInEdge(partnerId, startDate, endDate, apiFilter);

  // 3. 순수익 계산
  return {
    // 내 수입
    myCasinoRollingIncome: myIncome.casino_rolling,
    myCasinoLosingIncome: myIncome.casino_losing,
    mySlotRollingIncome: myIncome.slot_rolling,
    mySlotLosingIncome: myIncome.slot_losing,
    myRollingIncome: myIncome.rolling,
    myLosingIncome: myIncome.losing,
    myWithdrawalIncome: myIncome.withdrawal,
    myTotalIncome: myIncome.total,

    // 하위 파트너 지급
    partnerCasinoRollingPayments: partnerPayments.casino_rolling,
    partnerCasinoLosingPayments: partnerPayments.casino_losing,
    partnerSlotRollingPayments: partnerPayments.slot_rolling,
    partnerSlotLosingPayments: partnerPayments.slot_losing,
    partnerRollingPayments: partnerPayments.rolling,
    partnerLosingPayments: partnerPayments.losing,
    partnerWithdrawalPayments: partnerPayments.withdrawal,
    partnerTotalPayments: partnerPayments.total,

    // 순수익
    netCasinoRollingProfit: myIncome.casino_rolling - partnerPayments.casino_rolling,
    netCasinoLosingProfit: myIncome.casino_losing - partnerPayments.casino_losing,
    netSlotRollingProfit: myIncome.slot_rolling - partnerPayments.slot_rolling,
    netSlotLosingProfit: myIncome.slot_losing - partnerPayments.slot_losing,
    netRollingProfit: myIncome.rolling - partnerPayments.rolling,
    netLosingProfit: myIncome.losing - partnerPayments.losing,
    netWithdrawalProfit: myIncome.withdrawal - partnerPayments.withdrawal,
    netTotalProfit: myIncome.total - partnerPayments.total
  };
}

/**
 * 내 총 수입 계산
 */
async function calculateMyIncomeInEdge(
  partnerId: string,
  commissionRates: any,
  startDate: string,
  endDate: string,
  apiFilter: string
) {
  // 하위 사용자 조회
  const descendantIds = await getDescendantUserIdsInEdge(partnerId);
  
  // 베팅 통계 조회
  const stats = await getBettingStatsByGameTypeInEdge(descendantIds, startDate, endDate, apiFilter);
  
  // 출금 총액 조회
  const withdrawalAmount = await getWithdrawalAmountInEdge(descendantIds, startDate, endDate);

  return {
    casino_rolling: stats.casino_bet * commissionRates.casino_rolling / 100,
    casino_losing: stats.casino_loss * commissionRates.casino_losing / 100,
    slot_rolling: stats.slot_bet * commissionRates.slot_rolling / 100,
    slot_losing: stats.slot_loss * commissionRates.slot_losing / 100,
    rolling: stats.total_bet * commissionRates.rolling / 100,
    losing: stats.total_loss * commissionRates.losing / 100,
    withdrawal: withdrawalAmount * commissionRates.withdrawal / 100,
    total: 
      (stats.casino_bet * commissionRates.casino_rolling / 100) +
      (stats.casino_loss * commissionRates.casino_losing / 100) +
      (stats.slot_bet * commissionRates.slot_rolling / 100) +
      (stats.slot_loss * commissionRates.slot_losing / 100) +
      (withdrawalAmount * commissionRates.withdrawal / 100)
  };
}

/**
 * 하위 파트너 지급액 계산
 */
async function calculatePartnerPaymentsInEdge(
  parentId: string,
  startDate: string,
  endDate: string,
  apiFilter: string
) {
  // 직속 하위 파트너 조회
  const { data: childPartners } = await supabase
    .from('partners')
    .select('id, casino_rolling_commission, casino_losing_commission, slot_rolling_commission, slot_losing_commission, commission_rolling, commission_losing, withdrawal_fee')
    .eq('parent_id', parentId)
    .eq('status', 'active');

  if (!childPartners || childPartners.length === 0) {
    return {
      casino_rolling: 0,
      casino_losing: 0,
      slot_rolling: 0,
      slot_losing: 0,
      rolling: 0,
      losing: 0,
      withdrawal: 0,
      total: 0
    };
  }

  let totalPayments = {
    casino_rolling: 0,
    casino_losing: 0,
    slot_rolling: 0,
    slot_losing: 0,
    rolling: 0,
    losing: 0,
    withdrawal: 0
  };

  for (const partner of childPartners) {
    const descendantIds = await getDescendantUserIdsInEdge(partner.id);
    const stats = await getBettingStatsByGameTypeInEdge(descendantIds, startDate, endDate, apiFilter);
    const withdrawalAmount = await getWithdrawalAmountInEdge(descendantIds, startDate, endDate);

    totalPayments.casino_rolling += stats.casino_bet * (partner.casino_rolling_commission ?? 0) / 100;
    totalPayments.casino_losing += stats.casino_loss * (partner.casino_losing_commission ?? 0) / 100;
    totalPayments.slot_rolling += stats.slot_bet * (partner.slot_rolling_commission ?? 0) / 100;
    totalPayments.slot_losing += stats.slot_loss * (partner.slot_losing_commission ?? 0) / 100;
    totalPayments.rolling += stats.total_bet * partner.commission_rolling / 100;
    totalPayments.losing += stats.total_loss * partner.commission_losing / 100;
    totalPayments.withdrawal += withdrawalAmount * partner.withdrawal_fee / 100;
  }

  return {
    ...totalPayments,
    total: Object.values(totalPayments).reduce((sum, val) => sum + val, 0)
  };
}

/**
 * 하위 사용자 ID 조회
 */
async function getDescendantUserIdsInEdge(partnerId: string): Promise<string[]> {
  const { data } = await supabase.rpc('get_descendant_user_ids', { partner_id: partnerId });
  return data || [];
}

/**
 * 베팅 통계 조회 (게임 타입별)
 */
async function getBettingStatsByGameTypeInEdge(
  userIds: string[],
  startDate: string,
  endDate: string,
  apiFilter: string
) {
  if (userIds.length === 0) {
    return { casino_bet: 0, casino_loss: 0, slot_bet: 0, slot_loss: 0, total_bet: 0, total_loss: 0 };
  }

  let query = supabase
    .from('game_records')
    .select('game_type, bet_amount, win_amount')
    .in('user_id', userIds)
    .gte('played_at', startDate)
    .lte('played_at', endDate);

  if (apiFilter !== 'all') {
    query = query.eq('api_type', apiFilter);
  }

  const { data } = await query;

  if (!data || data.length === 0) {
    return { casino_bet: 0, casino_loss: 0, slot_bet: 0, slot_loss: 0, total_bet: 0, total_loss: 0 };
  }

  let casino_bet = 0, casino_loss = 0, slot_bet = 0, slot_loss = 0;

  for (const record of data) {
    const bet = record.bet_amount || 0;
    const win = record.win_amount || 0;
    const loss = Math.max(0, bet - win);

    if (record.game_type === 'casino') {
      casino_bet += bet;
      casino_loss += loss;
    } else {
      slot_bet += bet;
      slot_loss += loss;
    }
  }

  return {
    casino_bet,
    casino_loss,
    slot_bet,
    slot_loss,
    total_bet: casino_bet + slot_bet,
    total_loss: casino_loss + slot_loss
  };
}

/**
 * 출금 총액 조회
 */
async function getWithdrawalAmountInEdge(
  userIds: string[],
  startDate: string,
  endDate: string
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .in('user_id', userIds)
    .eq('type', 'withdrawal')
    .eq('status', 'completed')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (!data || data.length === 0) return 0;

  return data.reduce((sum, tx) => sum + (tx.amount || 0), 0);
}

/**
 * 자동 정산 실행
 * - 모든 Lv1 파트너에 대해 전날 데이터 정산
 */
export async function executeAutoSettlement() {
  console.log('🤖 [Auto Settlement] 자동 정산 시작');

  // 1. 전날 날짜 계산 (KST 기준)
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0).toISOString();
  const endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59).toISOString();

  console.log(`📅 정산 기간: ${startDate} ~ ${endDate}`);

  // 2. 모든 Lv1 파트너 조회
  const { data: lv1Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname, casino_rolling_commission, casino_losing_commission, slot_rolling_commission, slot_losing_commission, commission_rolling, commission_losing, withdrawal_fee')
    .eq('level', 1)
    .eq('status', 'active');

  if (partnersError || !lv1Partners || lv1Partners.length === 0) {
    console.log('⚠️ Lv1 파트너가 없습니다.');
    return { success: true, message: 'No Lv1 partners', settled: 0 };
  }

  console.log(`📋 ${lv1Partners.length}개 Lv1 파트너 발견`);

  let successCount = 0;
  let errorCount = 0;
  const results = [];

  // 3. 각 Lv1 파트너별로 정산 실행
  for (const partner of lv1Partners) {
    try {
      console.log(`\n🔄 Partner ${partner.id} (${partner.nickname}) 정산 시작...`);

      const result = await executeIntegratedSettlement(
        partner.id,
        {
          rolling: partner.commission_rolling || 0,
          losing: partner.commission_losing || 0,
          casino_rolling: partner.casino_rolling_commission ?? 0,
          casino_losing: partner.casino_losing_commission ?? 0,
          slot_rolling: partner.slot_rolling_commission ?? 0,
          slot_losing: partner.slot_losing_commission ?? 0,
          withdrawal: partner.withdrawal_fee || 0
        },
        startDate,
        endDate,
        'yesterday',  // 전날 정산
        'all'  // 모든 API
      );

      if (result.success) {
        console.log(`✅ Partner ${partner.id}: ${result.message}`);
        successCount++;
      } else {
        console.log(`⚠️ Partner ${partner.id}: ${result.message}`);
        if (!result.message.includes('이미 정산이 완료된 기간')) {
          errorCount++;
        }
      }

      results.push({
        partnerId: partner.id,
        nickname: partner.nickname,
        ...result
      });

    } catch (error: any) {
      console.error(`❌ Partner ${partner.id} 정산 에러:`, error);
      errorCount++;
      results.push({
        partnerId: partner.id,
        nickname: partner.nickname,
        success: false,
        message: error.message
      });
    }
  }

  console.log(`\n🎉 [Auto Settlement] 완료 - ${successCount}개 성공, ${errorCount}개 실패`);

  return {
    success: true,
    settled: successCount,
    errors: errorCount,
    partners: lv1Partners.length,
    results
  };
}
