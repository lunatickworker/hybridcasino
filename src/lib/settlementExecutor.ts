/**
 * 정산 실행 모듈
 * - 파트너별 수수료 정산 실행 (기록만 저장, 보유금 변경 없음)
 * - 통합 정산 실행 (기록만 저장, 보유금 변경 없음)
 * - 정산 내역 영구 보관 및 조회용
 */

import { supabase } from './supabase';
import { 
  calculateChildPartnersCommission, 
  calculateIntegratedSettlement,
  PartnerCommissionInfo,
  SettlementSummary
} from './settlementCalculator';

/**
 * 정산 실행 결과
 */
export interface SettlementExecutionResult {
  success: boolean;
  message: string;
  settlementId?: string;
  error?: string;
}

/**
 * 파트너별 수수료 정산 실행 (기록만 생성, 보유금 변경 없음)
 * @param partnerId 정산 실행자 (상위 파트너) ID
 * @param startDate 정산 시작일
 * @param endDate 정산 종료일
 * @param settlementPeriod 정산 주기 ('today', 'yesterday', 'week', 'month', 'custom')
 * @param apiFilter API 필터 ('all' | 'invest' | 'oroplay')
 * @returns 정산 실행 결과
 */
export async function executePartnerCommissionSettlement(
  partnerId: string,
  startDate: string,
  endDate: string,
  settlementPeriod: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<SettlementExecutionResult> {
  try {
    // 1. 중복 정산 체크
    const periodStart = new Date(startDate).toISOString().split('T')[0];
    const periodEnd = new Date(endDate).toISOString().split('T')[0];
    
    const { data: existsData, error: existsError } = await supabase
      .rpc('check_settlement_exists', {
        p_partner_id: partnerId,
        p_settlement_type: 'partner_commission',
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_api_filter: apiFilter
      });

    if (existsError) {
      console.error('중복 정산 체크 실패:', existsError);
      return { success: false, message: '중복 정산 체크에 실패했습니다.', error: existsError.message };
    }

    if (existsData === true) {
      return { success: false, message: '이미 정산이 완료된 기간입니다.' };
    }

    // 2. 파트너별 커미션 계산
    const commissions = await calculateChildPartnersCommission(partnerId, startDate, endDate, apiFilter);

    if (commissions.length === 0) {
      return { success: false, message: '정산할 하위 파트너가 없습니다.' };
    }

    // 3. 총 정산액 계산
    const totalRolling = commissions.reduce((sum, c) => sum + c.rolling_commission, 0);
    const totalLosing = commissions.reduce((sum, c) => sum + c.losing_commission, 0);
    const totalWithdrawal = commissions.reduce((sum, c) => sum + c.withdrawal_commission, 0);
    const totalCommission = totalRolling + totalLosing + totalWithdrawal;

    if (totalCommission <= 0) {
      return { success: false, message: '정산할 커미션이 0원입니다.' };
    }

    // 4. 정산 기록만 생성 (보유금 증감 없음)
    const settlementDetails = commissions.map(c => ({
      partner_id: c.partner_id,
      partner_nickname: c.partner_nickname,
      partner_level: c.partner_level,
      rolling_commission: c.rolling_commission,
      losing_commission: c.losing_commission,
      withdrawal_commission: c.withdrawal_commission,
      total_commission: c.total_commission
    }));

    // 정산 기록 생성 (보유금 변경 없음, 기록만 저장)
    const { data: settlement, error: settlementError } = await supabase
      .from('settlements')
      .insert({
        partner_id: partnerId,
        settlement_type: 'partner_commission',
        settlement_period: settlementPeriod,
        api_filter: apiFilter,
        period_start: periodStart,
        period_end: periodEnd,
        total_bet_amount: commissions.reduce((sum, c) => sum + c.total_bet_amount, 0),
        total_win_amount: 0,
        total_withdrawal_amount: commissions.reduce((sum, c) => sum + c.total_withdrawal_amount, 0),
        rolling_commission: totalRolling,
        losing_commission: totalLosing,
        withdrawal_commission: totalWithdrawal,
        commission_amount: totalCommission,
        commission_rate: 0,
        status: 'completed',
        processed_at: new Date().toISOString(),
        executed_by: partnerId,
        settlement_details: settlementDetails
      })
      .select()
      .single();

    if (settlementError) {
      console.error('정산 기록 생성 실패:', settlementError);
      return { success: false, message: '정산 기록 생성에 실패했습니다.', error: settlementError.message };
    }

    return {
      success: true,
      message: `정산 기록이 생성되었습니다. (총 정산액: ₩${totalCommission.toLocaleString()}, ${commissions.length}명)`,
      settlementId: settlement.id
    };

  } catch (error) {
    console.error('정산 실행 실패:', error);
    return { 
      success: false, 
      message: '정산 처리 중 오류가 발생했습니다.', 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * 통합 정산 실행 (기록만 생성, 보유금 변경 없음)
 * @param partnerId 정산 실행자 ID
 * @param commissionRates 내 커미션율
 * @param startDate 정산 시작일
 * @param endDate 정산 종료일
 * @param settlementPeriod 정산 주기
 * @param apiFilter API 필터
 * @returns 정산 실행 결과
 */
export async function executeIntegratedSettlement(
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
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
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
    const settlement = await calculateIntegratedSettlement(
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