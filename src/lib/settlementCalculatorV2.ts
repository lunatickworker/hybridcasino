/**
 * 통합 정산 계산 모듈 V2 - 카지노/슬롯 구분
 * - 카지노 게임과 슬롯 게임의 커미션을 별도로 계산
 */

import { supabase } from './supabase';

/**
 * 카지노/슬롯 구분 베팅 통계
 */
export interface GameTypeBettingStats {
  casino: {
    betAmount: number;
    lossAmount: number;
  };
  slot: {
    betAmount: number;
    lossAmount: number;
  };
  total: {
    betAmount: number;
    lossAmount: number;
  };
}

/**
 * ⚡ 카지노/슬롯 구분 베팅 통계 조회
 * @param userIds 사용자 ID 배열
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param apiFilter API 필터 (optional): 'all' | 'invest' | 'oroplay'
 * @returns 카지노/슬롯별 베팅액과 손실액
 */
export async function getBettingStatsByGameType(
  userIds: string[],
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<GameTypeBettingStats> {
  if (userIds.length === 0) {
    return {
      casino: { betAmount: 0, lossAmount: 0 },
      slot: { betAmount: 0, lossAmount: 0 },
      total: { betAmount: 0, lossAmount: 0 }
    };
  }

  try {
    const CHUNK_SIZE = 100;
    let casinoBetAmount = 0;
    let casinoLossAmount = 0;
    let slotBetAmount = 0;
    let slotLossAmount = 0;

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);

      let query = supabase
        .from('game_records')
        .select('bet_amount, win_amount, game_type')
        .in('user_id', chunk)
        .gte('played_at', startDate)
        .lte('played_at', endDate);

      if (apiFilter !== 'all') {
        query = query.eq('api_type', apiFilter);
      }

      const { data: bettingData, error } = await query;

      if (error) {
        console.error('베팅 데이터 조회 오류 (chunk):', error);
        continue;
      }

      if (bettingData && bettingData.length > 0) {
        for (const record of bettingData) {
          const bet = record.bet_amount || 0;
          const win = record.win_amount || 0;
          const loss = bet - win;
          const gameType = record.game_type || 'casino'; // 기본값: casino

          if (gameType === 'slot') {
            slotBetAmount += bet;
            if (loss > 0) slotLossAmount += loss;
          } else {
            casinoBetAmount += bet;
            if (loss > 0) casinoLossAmount += loss;
          }
        }
      }
    }

    return {
      casino: {
        betAmount: casinoBetAmount,
        lossAmount: casinoLossAmount
      },
      slot: {
        betAmount: slotBetAmount,
        lossAmount: slotLossAmount
      },
      total: {
        betAmount: casinoBetAmount + slotBetAmount,
        lossAmount: casinoLossAmount + slotLossAmount
      }
    };
  } catch (error) {
    console.error('베팅 통계 계산 실패:', error);
    return {
      casino: { betAmount: 0, lossAmount: 0 },
      slot: { betAmount: 0, lossAmount: 0 },
      total: { betAmount: 0, lossAmount: 0 }
    };
  }
}

/**
 * 모든 하위 사용자 ID를 일괄 조회 (재귀 제거)
 */
export async function getDescendantUserIds(partnerId: string): Promise<string[]> {
  const allUserIds: string[] = [];
  const allPartnerIds: string[] = [partnerId];
  
  let currentLevelIds = [partnerId];
  
  for (let level = 0; level < 5; level++) {
    if (currentLevelIds.length === 0) break;
    
    const { data: nextLevelPartners } = await supabase
      .from('partners')
      .select('id')
      .in('parent_id', currentLevelIds);
    
    if (nextLevelPartners && nextLevelPartners.length > 0) {
      const nextIds = nextLevelPartners.map(p => p.id);
      allPartnerIds.push(...nextIds);
      currentLevelIds = nextIds;
    } else {
      break;
    }
  }
  
  if (allPartnerIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .in('referrer_id', allPartnerIds);
    
    if (users) {
      allUserIds.push(...users.map(u => u.id));
    }
  }

  return allUserIds;
}

/**
 * 출금 총액 조회
 */
export async function getWithdrawalAmount(
  userIds: string[],
  startDate: string,
  endDate: string
): Promise<number> {
  if (userIds.length === 0) return 0;

  try {
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
        continue;
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
