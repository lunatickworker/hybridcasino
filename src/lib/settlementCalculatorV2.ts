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
 * 사용자별 베팅 통계 + 커미션율
 */
export interface UserBettingWithCommission {
  userId: string;
  username: string;
  // 커미션율 (users 테이블에서 조회)
  casinoRollingRate: number;
  casinoLosingRate: number;
  slotRollingRate: number;
  slotLosingRate: number;
  // 베팅 통계
  casinoBetAmount: number;
  casinoLossAmount: number;
  slotBetAmount: number;
  slotLossAmount: number;
  // 계산된 커미션 (사용자 개별 요율 적용)
  casinoRollingCommission: number;
  casinoLosingCommission: number;
  slotRollingCommission: number;
  slotLosingCommission: number;
  totalCommission: number;
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

      // ✅ game_records 테이블에서 game_type을 직접 가져옴
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
        totalRecords += bettingData.length;

        // 베팅 데이터 집계
        for (const record of bettingData) {
          // ✅ bet_amount가 음수로 저장되므로 절대값 사용
          const bet = Math.abs(record.bet_amount || 0);
          const win = record.win_amount || 0;
          const loss = bet - win;
          
          // ✅ game_records의 game_type 사용, 없으면 기본값 'casino'
          const gameType = record.game_type || 'casino';

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

/**
 * ✅ NEW: 각 사용자의 개별 커미션율을 적용한 베팅 통계 조회
 * - 파트너 정산 시 사용: 각 사용자의 커미션율로 계산 후 합산
 * @param userIds 사용자 ID 배열
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param apiFilter API 필터
 * @returns 사용자별 베팅 통계 및 계산된 커미션
 */
export async function getBettingStatsWithUserCommission(
  userIds: string[],
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' | 'familyapi' | 'honorapi' = 'all'
): Promise<{
  userStats: UserBettingWithCommission[];
  summary: {
    totalCasinoRollingCommission: number;
    totalCasinoLosingCommission: number;
    totalSlotRollingCommission: number;
    totalSlotLosingCommission: number;
    totalCommission: number;
    totalCasinoBet: number;
    totalCasinoLoss: number;
    totalSlotBet: number;
    totalSlotLoss: number;
  };
}> {
  if (userIds.length === 0) {
    return {
      userStats: [],
      summary: {
        totalCasinoRollingCommission: 0,
        totalCasinoLosingCommission: 0,
        totalSlotRollingCommission: 0,
        totalSlotLosingCommission: 0,
        totalCommission: 0,
        totalCasinoBet: 0,
        totalCasinoLoss: 0,
        totalSlotBet: 0,
        totalSlotLoss: 0,
      }
    };
  }

  console.log('[getBettingStatsWithUserCommission] 조회 시작:', {
    userCount: userIds.length,
    startDate,
    endDate,
    apiFilter
  });

  try {
    // 1단계: 사용자 커미션율 조회 (users 테이블)
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id, username, casino_rolling_commission, casino_losing_commission, slot_rolling_commission, slot_losing_commission')
      .in('id', userIds);

    if (usersError) {
      console.error('[getBettingStatsWithUserCommission] 사용자 조회 오류:', usersError);
      throw usersError;
    }

    if (!usersData || usersData.length === 0) {
      console.warn('[getBettingStatsWithUserCommission] 사용자 데이터 없음');
      return {
        userStats: [],
        summary: {
          totalCasinoRollingCommission: 0,
          totalCasinoLosingCommission: 0,
          totalSlotRollingCommission: 0,
          totalSlotLosingCommission: 0,
          totalCommission: 0,
          totalCasinoBet: 0,
          totalCasinoLoss: 0,
          totalSlotBet: 0,
          totalSlotLoss: 0,
        }
      };
    }

    // 사용자별 커미션율 맵 생성
    const userCommissionMap = new Map<string, {
      username: string;
      casinoRollingRate: number;
      casinoLosingRate: number;
      slotRollingRate: number;
      slotLosingRate: number;
    }>();

    for (const user of usersData) {
      userCommissionMap.set(user.id, {
        username: user.username,
        casinoRollingRate: user.casino_rolling_commission || 0,
        casinoLosingRate: user.casino_losing_commission || 0,
        slotRollingRate: user.slot_rolling_commission || 0,
        slotLosingRate: user.slot_losing_commission || 0,
      });
    }

    // 2단계: 사용자별 게임 기록 조회 및 커미션 계산
    const userStats: UserBettingWithCommission[] = [];
    const CHUNK_SIZE = 50; // 사용자별 청크

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);

      // 각 사용자별 게임 기록 조회
      let query = supabase
        .from('game_records')
        .select('user_id, bet_amount, win_amount, game_type')
        .in('user_id', chunk)
        .gte('played_at', startDate)
        .lte('played_at', endDate);

      if (apiFilter !== 'all') {
        query = query.eq('api_type', apiFilter);
      }

      const { data: gameRecords, error: gameError } = await query;

      if (gameError) {
        console.error('[getBettingStatsWithUserCommission] 게임 기록 조회 오류:', gameError);
        continue;
      }

      if (!gameRecords || gameRecords.length === 0) {
        continue;
      }

      // 사용자별 베팅 집계
      const userBettingMap = new Map<string, {
        casinoBet: number;
        casinoLoss: number;
        slotBet: number;
        slotLoss: number;
      }>();

      for (const record of gameRecords) {
        const userId = record.user_id;
        if (!userId) continue;

        const bet = Math.abs(record.bet_amount || 0);
        const win = record.win_amount || 0;
        const loss = Math.max(bet - win, 0);
        const gameType = record.game_type || 'casino';

        if (!userBettingMap.has(userId)) {
          userBettingMap.set(userId, {
            casinoBet: 0,
            casinoLoss: 0,
            slotBet: 0,
            slotLoss: 0,
          });
        }

        const userBetting = userBettingMap.get(userId)!;

        if (gameType === 'slot') {
          userBetting.slotBet += bet;
          userBetting.slotLoss += loss;
        } else {
          userBetting.casinoBet += bet;
          userBetting.casinoLoss += loss;
        }
      }

      // 사용자별 커미션 계산
      for (const [userId, betting] of userBettingMap.entries()) {
        const commissionInfo = userCommissionMap.get(userId);
        if (!commissionInfo) {
          console.warn(`[getBettingStatsWithUserCommission] 사용자 ${userId}의 커미션 정보 없음`);
          continue;
        }

        // ✅ 각 사용자의 개별 커미션율 적용
        const casinoRollingCommission = betting.casinoBet * (commissionInfo.casinoRollingRate / 100);
        const casinoLosingCommission = betting.casinoLoss * (commissionInfo.casinoLosingRate / 100);
        const slotRollingCommission = betting.slotBet * (commissionInfo.slotRollingRate / 100);
        const slotLosingCommission = betting.slotLoss * (commissionInfo.slotLosingRate / 100);

        userStats.push({
          userId,
          username: commissionInfo.username,
          casinoRollingRate: commissionInfo.casinoRollingRate,
          casinoLosingRate: commissionInfo.casinoLosingRate,
          slotRollingRate: commissionInfo.slotRollingRate,
          slotLosingRate: commissionInfo.slotLosingRate,
          casinoBetAmount: betting.casinoBet,
          casinoLossAmount: betting.casinoLoss,
          slotBetAmount: betting.slotBet,
          slotLossAmount: betting.slotLoss,
          casinoRollingCommission,
          casinoLosingCommission,
          slotRollingCommission,
          slotLosingCommission,
          totalCommission: casinoRollingCommission + casinoLosingCommission + slotRollingCommission + slotLosingCommission,
        });
      }
    }

    // 3단계: 전체 합산
    const summary = {
      totalCasinoRollingCommission: 0,
      totalCasinoLosingCommission: 0,
      totalSlotRollingCommission: 0,
      totalSlotLosingCommission: 0,
      totalCommission: 0,
      totalCasinoBet: 0,
      totalCasinoLoss: 0,
      totalSlotBet: 0,
      totalSlotLoss: 0,
    };

    for (const stat of userStats) {
      summary.totalCasinoRollingCommission += stat.casinoRollingCommission;
      summary.totalCasinoLosingCommission += stat.casinoLosingCommission;
      summary.totalSlotRollingCommission += stat.slotRollingCommission;
      summary.totalSlotLosingCommission += stat.slotLosingCommission;
      summary.totalCommission += stat.totalCommission;
      summary.totalCasinoBet += stat.casinoBetAmount;
      summary.totalCasinoLoss += stat.casinoLossAmount;
      summary.totalSlotBet += stat.slotBetAmount;
      summary.totalSlotLoss += stat.slotLossAmount;
    }

    console.log('[getBettingStatsWithUserCommission] 조회 완료:', {
      userCount: userStats.length,
      totalCommission: summary.totalCommission,
    });

    return { userStats, summary };
  } catch (error) {
    console.error('[getBettingStatsWithUserCommission] 계산 실패:', error);
    return {
      userStats: [],
      summary: {
        totalCasinoRollingCommission: 0,
        totalCasinoLosingCommission: 0,
        totalSlotRollingCommission: 0,
        totalSlotLosingCommission: 0,
        totalCommission: 0,
        totalCasinoBet: 0,
        totalCasinoLoss: 0,
        totalSlotBet: 0,
        totalSlotLoss: 0,
      }
    };
  }
}