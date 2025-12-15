/**
 * 통합 정산 계산 모듈
 * - 모든 정산 관련 로직을 중앙 집중화하여 코드 중복 제거
 * - CommissionSettlement, IntegratedSettlement, Dashboard, PartnerManagement에서 공통 사용
 * - RPC 함수 사용 금지, 직접 SELECT 쿼리만 사용
 */

import { supabase } from './supabase';
import { getBettingStatsByGameType } from './settlementCalculatorV2';

/**
 * 파트너 커미션 정보
 */
export interface PartnerCommissionInfo {
  partner_id: string;
  partner_username: string;
  partner_nickname: string;
  partner_level: number;
  commission_rolling: number; // ⚠️ 하위 호환성
  commission_losing: number; // ⚠️ 하위 호환성
  casino_rolling_commission: number; // ✅ 카지노 롤링 요율
  casino_losing_commission: number; // ✅ 카지노 루징 요율
  slot_rolling_commission: number; // ✅ 슬롯 롤링 요율
  slot_losing_commission: number; // ✅ 슬롯 루징 요율
  withdrawal_fee: number;
  // 카지노
  casino_bet_amount: number;
  casino_loss_amount: number;
  casino_rolling_commission_amount: number;
  casino_losing_commission_amount: number;
  // 슬롯
  slot_bet_amount: number;
  slot_loss_amount: number;
  slot_rolling_commission_amount: number;
  slot_losing_commission_amount: number;
  // 전체 (하위 호환성)
  total_bet_amount: number;
  total_loss_amount: number;
  total_withdrawal_amount: number;
  rolling_commission: number;
  losing_commission: number;
  withdrawal_commission: number;
  total_commission: number;
}

/**
 * 정산 요약 정보
 */
export interface SettlementSummary {
  // 내 수입 - 카지노
  myCasinoRollingIncome: number;
  myCasinoLosingIncome: number;
  // 내 수입 - 슬롯
  mySlotRollingIncome: number;
  mySlotLosingIncome: number;
  // 내 수입 - 환전 (게임 타입 무관)
  myWithdrawalIncome: number;
  // 내 수입 - 합계 (하위 호환성)
  myRollingIncome: number;
  myLosingIncome: number;
  myTotalIncome: number;

  // 하위 파트너 지급 - 카지노
  partnerCasinoRollingPayments: number;
  partnerCasinoLosingPayments: number;
  // 하위 파트너 지급 - 슬롯
  partnerSlotRollingPayments: number;
  partnerSlotLosingPayments: number;
  // 하위 파트너 지급 - 환전
  partnerWithdrawalPayments: number;
  // 하위 파트너 지급 - 합계 (하위 호환성)
  partnerRollingPayments: number;
  partnerLosingPayments: number;
  partnerTotalPayments: number;

  // 순수익 - 카지노
  netCasinoRollingProfit: number;
  netCasinoLosingProfit: number;
  // 순수익 - 슬롯
  netSlotRollingProfit: number;
  netSlotLosingProfit: number;
  // 순수익 - 환전
  netWithdrawalProfit: number;
  // 순수익 - 합계 (하위 호환성)
  netRollingProfit: number;
  netLosingProfit: number;
  netTotalProfit: number;
}

/**
 * 파트너 지급 상세
 */
export interface PartnerPaymentDetail {
  partner_id: string;
  partner_nickname: string;
  // 카지노
  casino_rolling_payment: number;
  casino_losing_payment: number;
  // 슬롯
  slot_rolling_payment: number;
  slot_losing_payment: number;
  // 환전
  withdrawal_payment: number;
  // 합계 (하위 호환성)
  rolling_payment: number;
  losing_payment: number;
  total_payment: number;
}

/**
 * ⚡ 최적화: 모든 하위 사용자 ID를 일괄 조회 (재귀 제거)
 * @param partnerId 파트너 ID
 * @returns 모든 하위 사용자 ID 배열
 */
export async function getDescendantUserIds(partnerId: string): Promise<string[]> {
  console.log('[settlementCalculator.getDescendantUserIds] 조회 시작:', { partnerId });
  
  const allUserIds: string[] = [];
  const allPartnerIds: string[] = [partnerId];
  
  // 1단계부터 5단계까지 하위 파트너를 반복문으로 조회 (재귀 제거)
  let currentLevelIds = [partnerId];
  
  for (let level = 0; level < 5; level++) {
    if (currentLevelIds.length === 0) break;
    
    const { data: nextLevelPartners } = await supabase
      .from('partners')
      .select('id')
      .in('parent_id', currentLevelIds);
    
    if (nextLevelPartners && nextLevelPartners.length > 0) {
      const nextIds = nextLevelPartners.map(p => p.id);
      console.log(`[settlementCalculator.getDescendantUserIds] Level ${level + 1}: ${nextIds.length}개 하위 파트너 발견`);
      allPartnerIds.push(...nextIds);
      currentLevelIds = nextIds;
    } else {
      break;
    }
  }
  
  console.log('[settlementCalculator.getDescendantUserIds] 모든 파트너 ID:', allPartnerIds.length);
  
  // 모든 파트너의 직속 사용자를 한 번에 조회
  if (allPartnerIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, username')
      .in('referrer_id', allPartnerIds);
    
    if (users) {
      allUserIds.push(...users.map(u => u.id));
      console.log('[settlementCalculator.getDescendantUserIds] 사용자 조회 완료:', {
        userCount: users.length,
        usernames: users.map(u => u.username).slice(0, 10) // 첫 10개만 출력
      });
    }
  }

  console.log('[settlementCalculator.getDescendantUserIds] 최종 사용자 수:', allUserIds.length);
  return allUserIds;
}

/**
 * ⚡ 최적화: 특정 기간의 베팅 통계 조회 (필요한 컬럼만 SELECT)
 * @param userIds 사용자 ID 배열
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param apiFilter API 필터 (optional): 'all' | 'invest' | 'oroplay'
 * @returns 총 베팅액과 총 손실액
 */
export async function getBettingStats(
  userIds: string[],
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<{ totalBetAmount: number; totalLossAmount: number }> {
  if (userIds.length === 0) {
    return { totalBetAmount: 0, totalLossAmount: 0 };
  }

  try {
    // ⚡ 최적화: userIds가 너무 많으면 청크로 나누어 처리
    const CHUNK_SIZE = 100;
    let totalBetAmount = 0;
    let totalLossAmount = 0;

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);

      // ⚡ 필요한 컬럼만 조회하여 네트워크 부하 감소
      let query = supabase
        .from('game_records')
        .select('bet_amount, win_amount')
        .in('user_id', chunk)
        .gte('played_at', startDate)
        .lte('played_at', endDate);

      // API 필터 적용
      if (apiFilter !== 'all') {
        query = query.eq('api_type', apiFilter);
      }

      const { data: bettingData, error } = await query;

      if (error) {
        console.error('베팅 데이터 조회 오류 (chunk):', error);
        continue; // 에러 발생 시 해당 청크는 건너뛰고 계속 진행
      }

      if (bettingData && bettingData.length > 0) {
        // ⚡ 한 번의 순회로 두 값 모두 계산
        for (const record of bettingData) {
          const bet = record.bet_amount || 0;
          const win = record.win_amount || 0;
          totalBetAmount += bet;
          const loss = bet - win;
          if (loss > 0) {
            totalLossAmount += loss;
          }
        }
      }
    }

    return { totalBetAmount, totalLossAmount };
  } catch (error) {
    console.error('베팅 통계 계산 실패:', error);
    return { totalBetAmount: 0, totalLossAmount: 0 };
  }
}

/**
 * 특정 기간의 출금 총액 조회
 * @param userIds 사용자 ID 배열
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @returns 총 출금액
 */
export async function getWithdrawalAmount(
  userIds: string[],
  startDate: string,
  endDate: string
): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }

  try {
    // ⚡ 최적화: userIds가 너무 많으면 청크로 나누어 처리
    const CHUNK_SIZE = 100;
    let totalWithdrawalAmount = 0;

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);

      const { data: withdrawalData, error } = await supabase
        .from('transactions')
        .select('amount')
        .in('user_id', chunk)
        .eq('transaction_type', 'withdrawal')
        .eq('status', 'approved')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (error) {
        console.error('출금 데이터 조회 오류 (chunk):', error);
        continue; // 에러 발생 시 해당 청크는 건너뛰고 계속 진행
      }

      if (withdrawalData && withdrawalData.length > 0) {
        totalWithdrawalAmount += withdrawalData.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      }
    }

    return totalWithdrawalAmount;
  } catch (error) {
    console.error('출금 총액 계산 실패:', error);
    return 0;
  }
}

/**
 * 특정 기간의 만충금 조회
 * @param userIds 사용자 ID 배열
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @returns 총 만충금
 */
export async function calculatePendingDeposits(
  userIds: string[],
  startDate: string,
  endDate: string
): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }

  try {
    const CHUNK_SIZE = 100;
    let totalPendingDeposits = 0;

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);

      const { data: depositData, error } = await supabase
        .from('transactions')
        .select('amount')
        .in('user_id', chunk)
        .eq('transaction_type', 'deposit')
        .eq('status', 'pending')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (error) {
        console.error('만충금 데이터 조회 오류 (chunk):', error);
        continue;
      }

      if (depositData && depositData.length > 0) {
        totalPendingDeposits += depositData.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      }
    }

    return totalPendingDeposits;
  } catch (error) {
    console.error('만충금 계산 실패:', error);
    return 0;
  }
}

/**
 * 파트너의 커미션 계산 (직속 하위 정산 방식)
 * @param partnerId 파트너 ID
 * @param partner 파트너 정보 (commission_rolling, commission_losing, withdrawal_fee 포함)
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param apiFilter API 필터 (optional): 'all' | 'invest' | 'oroplay'
 * @returns 커미션 상세 정보
 */
export async function calculatePartnerCommission(
  partnerId: string,
  partner: {
    username: string;
    nickname: string;
    level: number;
    commission_rolling: number;
    commission_losing: number;
    casino_rolling_commission?: number;
    casino_losing_commission?: number;
    slot_rolling_commission?: number;
    slot_losing_commission?: number;
    withdrawal_fee: number;
  },
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<PartnerCommissionInfo> {
  try {
    // 모든 하위 사용자 ID 조회
    const descendantUserIds = await getDescendantUserIds(partnerId);

    if (descendantUserIds.length === 0) {
      return {
        partner_id: partnerId,
        partner_username: partner.username,
        partner_nickname: partner.nickname,
        partner_level: partner.level,
        commission_rolling: partner.commission_rolling,
        commission_losing: partner.commission_losing,
        casino_rolling_commission: partner.casino_rolling_commission || partner.commission_rolling,
        casino_losing_commission: partner.casino_losing_commission || partner.commission_losing,
        slot_rolling_commission: partner.slot_rolling_commission || partner.commission_rolling,
        slot_losing_commission: partner.slot_losing_commission || partner.commission_losing,
        withdrawal_fee: partner.withdrawal_fee,
        casino_bet_amount: 0,
        casino_loss_amount: 0,
        casino_rolling_commission_amount: 0,
        casino_losing_commission_amount: 0,
        slot_bet_amount: 0,
        slot_loss_amount: 0,
        slot_rolling_commission_amount: 0,
        slot_losing_commission_amount: 0,
        total_bet_amount: 0,
        total_loss_amount: 0,
        total_withdrawal_amount: 0,
        rolling_commission: 0,
        losing_commission: 0,
        withdrawal_commission: 0,
        total_commission: 0
      };
    }

    // ✅ 카지노/슬롯 구분 베팅 통계 조회
    const stats = await getBettingStatsByGameType(
      descendantUserIds,
      startDate,
      endDate,
      apiFilter
    );

    // 출금 총액 조회
    const totalWithdrawalAmount = await getWithdrawalAmount(
      descendantUserIds,
      startDate,
      endDate
    );

    // ✅ 카지노/슬롯 커미션 계산
    const casinoRollingRate = partner.casino_rolling_commission || partner.commission_rolling;
    const casinoLosingRate = partner.casino_losing_commission || partner.commission_losing;
    const slotRollingRate = partner.slot_rolling_commission || partner.commission_rolling;
    const slotLosingRate = partner.slot_losing_commission || partner.commission_losing;

    const casinoRollingCommission = stats.casino.betAmount * (casinoRollingRate / 100);
    const casinoLosingCommission = stats.casino.lossAmount * (casinoLosingRate / 100);
    const slotRollingCommission = stats.slot.betAmount * (slotRollingRate / 100);
    const slotLosingCommission = stats.slot.lossAmount * (slotLosingRate / 100);
    const withdrawalCommission = totalWithdrawalAmount * (partner.withdrawal_fee / 100);

    // 전체 커미션 (하위 호환성)
    const rollingCommission = casinoRollingCommission + slotRollingCommission;
    const losingCommission = casinoLosingCommission + slotLosingCommission;
    const totalCommission = rollingCommission + losingCommission + withdrawalCommission;

    // ✅ 디버깅용 상세 로그
    console.log(`[calculatePartnerCommission] ${partner.nickname} (${partner.username})`, {
      rates: {
        casinoRolling: casinoRollingRate,
        casinoLosing: casinoLosingRate,
        slotRolling: slotRollingRate,
        slotLosing: slotLosingRate,
        withdrawal: partner.withdrawal_fee
      },
      stats: {
        casinoBet: stats.casino.betAmount,
        casinoLoss: stats.casino.lossAmount,
        slotBet: stats.slot.betAmount,
        slotLoss: stats.slot.lossAmount,
        withdrawal: totalWithdrawalAmount
      },
      commissions: {
        casinoRolling: casinoRollingCommission,
        casinoLosing: casinoLosingCommission,
        slotRolling: slotRollingCommission,
        slotLosing: slotLosingCommission,
        withdrawal: withdrawalCommission,
        total: totalCommission
      }
    });

    return {
      partner_id: partnerId,
      partner_username: partner.username,
      partner_nickname: partner.nickname,
      partner_level: partner.level,
      commission_rolling: partner.commission_rolling,
      commission_losing: partner.commission_losing,
      casino_rolling_commission: casinoRollingRate,
      casino_losing_commission: casinoLosingRate,
      slot_rolling_commission: slotRollingRate,
      slot_losing_commission: slotLosingRate,
      withdrawal_fee: partner.withdrawal_fee,
      casino_bet_amount: stats.casino.betAmount,
      casino_loss_amount: stats.casino.lossAmount,
      casino_rolling_commission_amount: casinoRollingCommission,
      casino_losing_commission_amount: casinoLosingCommission,
      slot_bet_amount: stats.slot.betAmount,
      slot_loss_amount: stats.slot.lossAmount,
      slot_rolling_commission_amount: slotRollingCommission,
      slot_losing_commission_amount: slotLosingCommission,
      total_bet_amount: stats.total.betAmount,
      total_loss_amount: stats.total.lossAmount,
      total_withdrawal_amount: totalWithdrawalAmount,
      rolling_commission: rollingCommission,
      losing_commission: losingCommission,
      withdrawal_commission: withdrawalCommission,
      total_commission: totalCommission
    };
  } catch (error) {
    console.error('파트너 커미션 계산 실패:', error);
    return {
      partner_id: partnerId,
      partner_username: partner.username,
      partner_nickname: partner.nickname,
      partner_level: partner.level,
      commission_rolling: partner.commission_rolling,
      commission_losing: partner.commission_losing,
      casino_rolling_commission: partner.casino_rolling_commission || partner.commission_rolling,
      casino_losing_commission: partner.casino_losing_commission || partner.commission_losing,
      slot_rolling_commission: partner.slot_rolling_commission || partner.commission_rolling,
      slot_losing_commission: partner.slot_losing_commission || partner.commission_losing,
      withdrawal_fee: partner.withdrawal_fee,
      casino_bet_amount: 0,
      casino_loss_amount: 0,
      casino_rolling_commission_amount: 0,
      casino_losing_commission_amount: 0,
      slot_bet_amount: 0,
      slot_loss_amount: 0,
      slot_rolling_commission_amount: 0,
      slot_losing_commission_amount: 0,
      total_bet_amount: 0,
      total_loss_amount: 0,
      total_withdrawal_amount: 0,
      rolling_commission: 0,
      losing_commission: 0,
      withdrawal_commission: 0,
      total_commission: 0
    };
  }
}

/**
 * ⚡ 최적화: 직속 하위 파트너들의 커미션을 병렬 계산
 * @param parentId 상위 파트너 ID
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param apiFilter API 필터 (optional): 'all' | 'invest' | 'oroplay'
 * @returns 파트너별 커미션 배열
 */
export async function calculateChildPartnersCommission(
  parentId: string,
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<PartnerCommissionInfo[]> {
  try {
    // 직속 하위 파트너 목록 조회 (✅ 카지노/슬롯 커미션 포함)
    const { data: childPartners, error } = await supabase
      .from('partners')
      .select(`
        id, 
        username, 
        nickname, 
        level, 
        commission_rolling, 
        commission_losing, 
        casino_rolling_commission,
        casino_losing_commission,
        slot_rolling_commission,
        slot_losing_commission,
        withdrawal_fee
      `)
      .eq('parent_id', parentId)
      .order('level')
      .order('nickname');

    if (error) {
      console.error('하위 파트너 조회 오류:', error);
      return [];
    }

    if (!childPartners || childPartners.length === 0) {
      return [];
    }

    // ⚡ 병렬 처리: 모든 파트너의 커미션을 동시에 계산
    const commissionsPromises = childPartners.map(partner =>
      calculatePartnerCommission(
        partner.id,
        partner,
        startDate,
        endDate,
        apiFilter
      )
    );

    const commissionsData = await Promise.all(commissionsPromises);

    return commissionsData;
  } catch (error) {
    console.error('하위 파트너 커미션 계산 실패:', error);
    return [];
  }
}

/**
 * 내 총 수입 계산 (카지노/슬롯 구분)
 * @param partnerId 파트너 ID
 * @param commissionRates 내 커미션율 (카지노/슬롯 구분)
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param apiFilter API 필터 (optional): 'all' | 'invest' | 'oroplay'
 * @returns 카지노/슬롯별 롤링/루징/출금 수입과 총합
 */
export async function calculateMyIncome(
  partnerId: string,
  commissionRates: {
    rolling: number; // 하위 호환성
    losing: number; // 하위 호환성
    casino_rolling: number;
    casino_losing: number;
    slot_rolling: number;
    slot_losing: number;
    withdrawal: number;
  },
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<{
  casinoRolling: number;
  casinoLosing: number;
  slotRolling: number;
  slotLosing: number;
  rolling: number; // 하위 호환성
  losing: number; // 하위 호환성
  withdrawal: number;
  total: number;
}> {
  try {
    // 모든 하위 사용자 ID 조회
    const descendantUserIds = await getDescendantUserIds(partnerId);

    if (descendantUserIds.length === 0) {
      return { 
        casinoRolling: 0, 
        casinoLosing: 0, 
        slotRolling: 0, 
        slotLosing: 0, 
        rolling: 0, 
        losing: 0, 
        withdrawal: 0, 
        total: 0 
      };
    }

    // 카지노/슬롯 구분 베팅 통계 조회 (API 필터 적용)
    const gameTypeStats = await getBettingStatsByGameType(
      descendantUserIds,
      startDate,
      endDate,
      apiFilter
    );

    // 출금 총액 조회
    const totalWithdrawalAmount = await getWithdrawalAmount(
      descendantUserIds,
      startDate,
      endDate
    );

    // 카지노/슬롯별 내 수수료율로 계산
    const casinoRollingIncome = gameTypeStats.casino.betAmount * (commissionRates.casino_rolling / 100);
    const casinoLosingIncome = gameTypeStats.casino.lossAmount * (commissionRates.casino_losing / 100);
    const slotRollingIncome = gameTypeStats.slot.betAmount * (commissionRates.slot_rolling / 100);
    const slotLosingIncome = gameTypeStats.slot.lossAmount * (commissionRates.slot_losing / 100);
    const withdrawalIncome = totalWithdrawalAmount * (commissionRates.withdrawal / 100);

    // 하위 호환성을 위한 합계
    const rollingIncome = casinoRollingIncome + slotRollingIncome;
    const losingIncome = casinoLosingIncome + slotLosingIncome;

    return {
      casinoRolling: casinoRollingIncome,
      casinoLosing: casinoLosingIncome,
      slotRolling: slotRollingIncome,
      slotLosing: slotLosingIncome,
      rolling: rollingIncome,
      losing: losingIncome,
      withdrawal: withdrawalIncome,
      total: rollingIncome + losingIncome + withdrawalIncome
    };
  } catch (error) {
    console.error('내 수입 계산 실패:', error);
    return { 
      casinoRolling: 0, 
      casinoLosing: 0, 
      slotRolling: 0, 
      slotLosing: 0, 
      rolling: 0, 
      losing: 0, 
      withdrawal: 0, 
      total: 0 
    };
  }
}

/**
 * ⚡ 최적화: 하위 파트너 지급액을 병렬 계산
 * @param parentId 상위 파트너 ID
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param apiFilter API 필터 (optional): 'all' | 'invest' | 'oroplay'
 * @returns 파트너별 지급 상세 및 총합
 */
export async function calculatePartnerPayments(
  parentId: string,
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<{
  totalCasinoRolling: number;
  totalCasinoLosing: number;
  totalSlotRolling: number;
  totalSlotLosing: number;
  totalRolling: number;
  totalLosing: number;
  totalWithdrawal: number;
  total: number;
  details: PartnerPaymentDetail[];
}> {
  try {
    // 직속 하위 파트너 조회
    const { data: childPartners, error } = await supabase
      .from('partners')
      .select('id, nickname, commission_rolling, commission_losing, casino_rolling_commission, casino_losing_commission, slot_rolling_commission, slot_losing_commission, withdrawal_fee')
      .eq('parent_id', parentId);

    if (error) {
      console.error('하위 파트너 조회 오류:', error);
      return {
        totalCasinoRolling: 0,
        totalCasinoLosing: 0,
        totalSlotRolling: 0,
        totalSlotLosing: 0,
        totalRolling: 0,
        totalLosing: 0,
        totalWithdrawal: 0,
        total: 0,
        details: []
      };
    }

    if (!childPartners || childPartners.length === 0) {
      return {
        totalCasinoRolling: 0,
        totalCasinoLosing: 0,
        totalSlotRolling: 0,
        totalSlotLosing: 0,
        totalRolling: 0,
        totalLosing: 0,
        totalWithdrawal: 0,
        total: 0,
        details: []
      };
    }

    // ⚡ 병렬 처리: 모든 파트너의 지급액을 동시에 계산
    const paymentPromises = childPartners.map(partner =>
      calculatePartnerPayment(partner, startDate, endDate, apiFilter)
    );

    const details = await Promise.all(paymentPromises);

    // 총합 계산
    let totalCasinoRolling = 0;
    let totalCasinoLosing = 0;
    let totalSlotRolling = 0;
    let totalSlotLosing = 0;
    let totalRolling = 0;
    let totalLosing = 0;
    let totalWithdrawal = 0;

    for (const payment of details) {
      totalCasinoRolling += payment.casino_rolling_payment;
      totalCasinoLosing += payment.casino_losing_payment;
      totalSlotRolling += payment.slot_rolling_payment;
      totalSlotLosing += payment.slot_losing_payment;
      totalRolling += payment.rolling_payment;
      totalLosing += payment.losing_payment;
      totalWithdrawal += payment.withdrawal_payment;
    }

    return {
      totalCasinoRolling,
      totalCasinoLosing,
      totalSlotRolling,
      totalSlotLosing,
      totalRolling,
      totalLosing,
      totalWithdrawal,
      total: totalRolling + totalLosing + totalWithdrawal,
      details
    };
  } catch (error) {
    console.error('파트너 지급 계산 실패:', error);
    return {
      totalCasinoRolling: 0,
      totalCasinoLosing: 0,
      totalSlotRolling: 0,
      totalSlotLosing: 0,
      totalRolling: 0,
      totalLosing: 0,
      totalWithdrawal: 0,
      total: 0,
      details: []
    };
  }
}

/**
 * 특정 파트너의 지급액 계산 (카지노/슬롯 분리)
 */
async function calculatePartnerPayment(
  partner: {
    id: string;
    nickname: string;
    commission_rolling: number;
    commission_losing: number;
    casino_rolling_commission: number;
    casino_losing_commission: number;
    slot_rolling_commission: number;
    slot_losing_commission: number;
    withdrawal_fee: number;
  },
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<PartnerPaymentDetail> {
  try {
    // 해당 파트너의 모든 하위 사용자 조회
    const descendantUserIds = await getDescendantUserIds(partner.id);

    if (descendantUserIds.length === 0) {
      return {
        partner_id: partner.id,
        partner_nickname: partner.nickname,
        casino_rolling_payment: 0,
        casino_losing_payment: 0,
        slot_rolling_payment: 0,
        slot_losing_payment: 0,
        withdrawal_payment: 0,
        rolling_payment: 0,
        losing_payment: 0,
        total_payment: 0
      };
    }

    // 카지노/슬롯 베팅 통계 조회 (API 필터 적용)
    const gameTypeStats = await getBettingStatsByGameType(
      descendantUserIds,
      startDate,
      endDate,
      apiFilter
    );

    // 출금 총액 조회
    const totalWithdrawalAmount = await getWithdrawalAmount(
      descendantUserIds,
      startDate,
      endDate
    );

    // 카지노/슬롯별 파트너 수수료율로 계산
    const casinoRollingPayment = gameTypeStats.casino.betAmount * (partner.casino_rolling_commission / 100);
    const casinoLosingPayment = gameTypeStats.casino.lossAmount * (partner.casino_losing_commission / 100);
    const slotRollingPayment = gameTypeStats.slot.betAmount * (partner.slot_rolling_commission / 100);
    const slotLosingPayment = gameTypeStats.slot.lossAmount * (partner.slot_losing_commission / 100);
    const withdrawalPayment = totalWithdrawalAmount * (partner.withdrawal_fee / 100);

    // 하위 호환성을 위한 합계
    const rollingPayment = casinoRollingPayment + slotRollingPayment;
    const losingPayment = casinoLosingPayment + slotLosingPayment;

    return {
      partner_id: partner.id,
      partner_nickname: partner.nickname,
      casino_rolling_payment: casinoRollingPayment,
      casino_losing_payment: casinoLosingPayment,
      slot_rolling_payment: slotRollingPayment,
      slot_losing_payment: slotLosingPayment,
      withdrawal_payment: withdrawalPayment,
      rolling_payment: rollingPayment,
      losing_payment: losingPayment,
      total_payment: rollingPayment + losingPayment + withdrawalPayment
    };
  } catch (error) {
    console.error('파트너 지급 계산 실패:', error);
    return {
      partner_id: partner.id,
      partner_nickname: partner.nickname,
      casino_rolling_payment: 0,
      casino_losing_payment: 0,
      slot_rolling_payment: 0,
      slot_losing_payment: 0,
      withdrawal_payment: 0,
      rolling_payment: 0,
      losing_payment: 0,
      total_payment: 0
    };
  }
}

/**
 * 통합 정산 계산 (내 수입 - 하위 파트너 지급 = 순수익)
 * @param partnerId 파트너 ID
 * @param commissionRates 내 커미션율
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param apiFilter API 필터 (optional): 'all' | 'invest' | 'oroplay'
 * @returns 통합 정산 요약
 */
export async function calculateIntegratedSettlement(
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
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<SettlementSummary> {
  try {
    // 내 총 수입 계산 (API 필터 적용, 카지노/슬롯 구분)
    const myIncome = await calculateMyIncome(partnerId, commissionRates, startDate, endDate, apiFilter);

    // 하위 파트너 지급 계산 (API 필터 적용)
    const payments = await calculatePartnerPayments(partnerId, startDate, endDate, apiFilter);

    // 순수익 계산
    return {
      myCasinoRollingIncome: myIncome.casinoRolling,
      myCasinoLosingIncome: myIncome.casinoLosing,
      mySlotRollingIncome: myIncome.slotRolling,
      mySlotLosingIncome: myIncome.slotLosing,
      myWithdrawalIncome: myIncome.withdrawal,
      myRollingIncome: myIncome.rolling,
      myLosingIncome: myIncome.losing,
      myTotalIncome: myIncome.total,
      partnerCasinoRollingPayments: payments.totalCasinoRolling,
      partnerCasinoLosingPayments: payments.totalCasinoLosing,
      partnerSlotRollingPayments: payments.totalSlotRolling,
      partnerSlotLosingPayments: payments.totalSlotLosing,
      partnerWithdrawalPayments: payments.totalWithdrawal,
      partnerRollingPayments: payments.totalRolling,
      partnerLosingPayments: payments.totalLosing,
      partnerTotalPayments: payments.total,
      netCasinoRollingProfit: myIncome.casinoRolling - payments.totalCasinoRolling,
      netCasinoLosingProfit: myIncome.casinoLosing - payments.totalCasinoLosing,
      netSlotRollingProfit: myIncome.slotRolling - payments.totalSlotRolling,
      netSlotLosingProfit: myIncome.slotLosing - payments.totalSlotLosing,
      netWithdrawalProfit: myIncome.withdrawal - payments.totalWithdrawal,
      netRollingProfit: myIncome.rolling - payments.totalRolling,
      netLosingProfit: myIncome.losing - payments.totalLosing,
      netTotalProfit: myIncome.total - payments.total
    };
  } catch (error) {
    console.error('통합 정산 계산 실패:', error);
    return {
      myCasinoRollingIncome: 0,
      myCasinoLosingIncome: 0,
      mySlotRollingIncome: 0,
      mySlotLosingIncome: 0,
      myWithdrawalIncome: 0,
      myRollingIncome: 0,
      myLosingIncome: 0,
      myTotalIncome: 0,
      partnerCasinoRollingPayments: 0,
      partnerCasinoLosingPayments: 0,
      partnerSlotRollingPayments: 0,
      partnerSlotLosingPayments: 0,
      partnerWithdrawalPayments: 0,
      partnerRollingPayments: 0,
      partnerLosingPayments: 0,
      partnerTotalPayments: 0,
      netCasinoRollingProfit: 0,
      netCasinoLosingProfit: 0,
      netSlotRollingProfit: 0,
      netSlotLosingProfit: 0,
      netWithdrawalProfit: 0,
      netRollingProfit: 0,
      netLosingProfit: 0,
      netTotalProfit: 0
    };
  }
}