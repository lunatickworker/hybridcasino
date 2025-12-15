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
  apiFilter: 'all' | 'invest' | 'oroplay' | 'familyapi' = 'all'
): Promise<GameTypeBettingStats> {
  if (userIds.length === 0) {
    console.log('[getBettingStatsByGameType] userIds가 비어있음');
    return {
      casino: { betAmount: 0, lossAmount: 0 },
      slot: { betAmount: 0, lossAmount: 0 },
      total: { betAmount: 0, lossAmount: 0 }
    };
  }

  console.log('[getBettingStatsByGameType] 조회 시작:', {
    userCount: userIds.length,
    startDate,
    endDate,
    apiFilter
  });

  try {
    const CHUNK_SIZE = 100;
    let casinoBetAmount = 0;
    let casinoLossAmount = 0;
    let slotBetAmount = 0;
    let slotLossAmount = 0;
    let totalRecords = 0;

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);

      // ✅ games 테이블과 JOIN하여 game_type을 직접 가져옴
      let query = supabase
        .from('game_records')
        .select(`
          bet_amount, 
          win_amount, 
          game_type,
          games!inner(game_type)
        `)
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
        totalRecords += bettingData.length;

        // 베팅 데이터 집계
        for (const record of bettingData) {
          const bet = record.bet_amount || 0;
          const win = record.win_amount || 0;
          const loss = bet - win;
          
          // ✅ game_records의 game_type이 있으면 사용, 없으면 games 테이블에서 가져온 값 사용
          const gameType = record.game_type || (record.games as any)?.game_type || 'casino';

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

    console.log('[getBettingStatsByGameType] 조회 완료:', {
      totalRecords,
      casinoBetAmount,
      casinoLossAmount,
      slotBetAmount,
      slotLossAmount
    });

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