import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { getGameHistory, getUserBalanceWithConfig } from '../../lib/investApi';
import * as oroplayApi from '../../lib/oroplayApi';
import { callWithRateLimit } from '../../lib/rateLimiter';
import * as opcodeHelper from '../../lib/opcodeHelper';
import { Partner } from '../../types';
import * as honorApiModule from '../../lib/honorApi';

interface BettingHistorySyncProps {
  user: Partner;
}

/**
 * 세션 상태 전환 모니터링 (최종 플로우 with paused)
 * 1. active → paused (4분 베팅 없음, 게임창 열려있음)
 * 2. paused → active (베팅 재개)
 */
const monitorSessionStates = async () => {
  try {
    const now = new Date();
    const fourMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000);

    // 1. active → paused (4분 베팅 없음) ⭐ paused 상태로 변경
    const { data: activeSessions } = await supabase
      .from('game_launch_sessions')
      .select('*, users!inner(username)')
      .eq('status', 'active')
      .not('last_bet_at', 'is', null) // ✅ NULL 체크 추가
      .lt('last_bet_at', fourMinutesAgo.toISOString());

    if (activeSessions && activeSessions.length > 0) {
      for (const session of activeSessions) {
        // active → paused 전환 (게임창 열려있지만 일시정지)
        await supabase
          .from('game_launch_sessions')
          .update({
            status: 'paused', // ⭐ paused 상태로 변경
            last_bet_checked_at: now.toISOString(), // ✅ 추가
            last_activity_at: now.toISOString()
          })
          .eq('id', session.id);

        console.log(`✅ active → paused: user=${session.users?.username}`);
      }
    }

    // 2. paused → active (베팅 재개)
    const { data: pausedSessions } = await supabase
      .from('game_launch_sessions')
      .select('*, users!inner(username)')
      .eq('status', 'paused');

    if (pausedSessions && pausedSessions.length > 0) {
      for (const session of pausedSessions) {
        // 최근 30초 이내 베팅 기록 확인
        const { data: recentBets } = await supabase
          .from('game_records')
          .select('played_at')
          .eq('user_id', session.user_id)
          .gte('played_at', new Date(now.getTime() - 30 * 1000).toISOString())
          .limit(1);

        if (recentBets && recentBets.length > 0) {
          // paused → active 전환 (베팅 재개)
          await supabase
            .from('game_launch_sessions')
            .update({
              status: 'active',
              last_bet_at: recentBets[0].played_at,
              last_bet_checked_at: now.toISOString(),
              last_activity_at: now.toISOString()
            })
            .eq('id', session.id);

          console.log(`✅ paused → active: user=${session.users?.username}`);
        }
      }
    }

    return;
  } catch (error) {
    console.error('❌ [SESSION-MONITOR] 세션 상태 모니터링 오류:', error);
  }
};

// ✅ processSingleOpcode를 모듈 레벨로 이동하여 forceSyncBettingHistory에서도 사용 가능
const processSingleOpcode = async (
  opcode: string,
  secretKey: string,
  partnerId: string,
  year: string,
  month: string
) => {
  try {
    console.log(`📡 [BETTING-SYNC] OPCODE ${opcode} 처리 시작`);

    // 1. Get largest external_txid (= API's id) from DB for this partner to use as index
    const { data: lastRecord } = await supabase
      .from('game_records')
      .select('external_txid')
      .eq('partner_id', partnerId)
      .order('external_txid', { ascending: false })
      .limit(1)
      .single();

    const lastIndex = lastRecord?.external_txid || 0;
    console.log(`📍 [BETTING-SYNC] OPCODE ${opcode} 마지막 id (index): ${lastIndex}`);

    // 2. API 호출 (마지막 index 이후부터, limit 최대값 사용)
    const result = await getGameHistory(opcode, year, month, lastIndex, 4000, secretKey);

    if (result.error || !result.data) {
      console.log(`⚠️ [BETTING-SYNC] OPCODE ${opcode} API 실패`);
      return;
    }

    // 3. 데이터 추출
    let bettingRecords: any[] = [];
    if (result.data.DATA && Array.isArray(result.data.DATA)) {
      bettingRecords = result.data.DATA;
    } else if (Array.isArray(result.data)) {
      bettingRecords = result.data;
    }

    if (bettingRecords.length === 0) {
      console.log(`ℹ️ [BETTING-SYNC] OPCODE ${opcode} 새로운 데이터 없음`);
      return;
    }

    console.log(`📊 [BETTING-SYNC] OPCODE ${opcode}: ${bettingRecords.length}건 (id ${lastIndex} 이후)`);
    
    // 최신/최초 id 로그 (unique 값)
    if (bettingRecords.length > 0) {
      const ids = bettingRecords.map(r => typeof r.id === 'number' ? r.id : parseInt(r.id || '0', 10));
      const maxId = Math.max(...ids);
      const minId = Math.min(...ids);
      console.log(`   📍 id 범위: ${minId} ~ ${maxId} (unique 값)`);
    }

    // 3. 사용자 정보 조회 (제한 없이 모든 회원 조회하여 매칭)
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, username, referrer_id');

    const userMap = new Map<string, { id: string; referrer_id: string }>();
    if (allUsers) {
      allUsers.forEach((u: any) => {
        userMap.set(u.username, { id: u.id, referrer_id: u.referrer_id });
      });
    }
    
    console.log(`   👥 전체 회원 수: ${userMap.size}명`);

    // 4. 개별 INSERT (가장 간단하고 확실한 방법)
    let successCount = 0;
    let skipCount = 0;

    // ⚠️ 최신 데이터 우선 처리를 위해 id 기준 역순 정렬 (id가 unique 값)
    const sortedRecords = [...bettingRecords].sort((a, b) => {
      const aId = typeof a.id === 'number' ? a.id : parseInt(a.id || '0', 10);
      const bId = typeof b.id === 'number' ? b.id : parseInt(b.id || '0', 10);
      return bId - aId; // 내림차순 (최신 id 먼저)
    });

    let noUsernameCount = 0;
    let noUserDataCount = 0;
    let noIdCount = 0;

    for (const record of sortedRecords) {
      try {
        const username = record.username;
        if (!username) {
          noUsernameCount++;
          continue;
        }

        const userData = userMap.get(username);
        if (!userData) {
          noUserDataCount++;
          continue;
        }

        // ✅ 중요: external_txid는 API의 id 값을 사용 (unique 값)
        const externalTxidRaw = record.id;
        if (!externalTxidRaw) {
          noIdCount++;
          continue;
        }

        const externalTxidNum = typeof externalTxidRaw === 'number'
          ? externalTxidRaw
          : parseInt(externalTxidRaw.toString(), 10);

        if (isNaN(externalTxidNum)) {
          noIdCount++;
          continue;
        }

        const betAmount = parseFloat(record.bet || record.bet_amount || '0');
        const winAmount = parseFloat(record.win || record.win_amount || '0');
        const balanceAfter = parseFloat(record.balance || record.balance_after || '0');
        const balanceBefore = balanceAfter - (winAmount - betAmount);
        const playedAtRaw = record.create_at || record.played_at || record.created_at || new Date().toISOString();

        // ✅ API 시간: UTC를 +09로 잘못 표시 → 타임존 제거 후 시스템 타임존으로 변환
        // 예: API "2025-10-31T07:59:38+09:00" → UTC 07:59:38 → 시스템 타임존 적용
        const playedAtUTC = playedAtRaw.replace(/[+-]\d{2}:\d{2}$/, '').replace('Z', ''); // 타임존 제거
        const playedAt = new Date(playedAtUTC).toISOString(); // UTC 표준 형식으로 저장

        // ✅ 개별 INSERT (에러는 조용히 무시)
        const { error } = await supabase
          .from('game_records')
          .insert({
            partner_id: partnerId,
            external_txid: externalTxidNum,
            username: username,
            user_id: userData.id,
            game_id: record.game_id || record.game,
            provider_id: record.provider_id || Math.floor((record.game_id || record.game || 410000) / 1000),
            game_title: record.game_title || null,
            provider_name: record.provider_name || null,
            bet_amount: betAmount,
            win_amount: winAmount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            played_at: playedAt,
            api_type: 'invest'
          });

        if (error) {
          // 23505 = 중복 (정상)
          if (error.code === '23505') {
            skipCount++;
          } else {
            // 다른 에러는 로그 출력
            console.error(`   ❌ INSERT 실패 (external_txid: ${externalTxidNum}):`, error);
          }
        } else {
          successCount++;
        }

      } catch (err) {
        // INSERT 외부 에러도 로그 출력
        console.error(`   ❌ 레코드 처리 오류:`, err);
      }
    }

    if (noUsernameCount > 0 || noUserDataCount > 0 || noIdCount > 0) {
      console.log(`   ⚠️ 건너뛴 데이터: username 없음 ${noUsernameCount}건, user 매칭 실패 ${noUserDataCount}건, id 없음 ${noIdCount}건`);
    }

    console.log(`✅ [BETTING-SYNC] OPCODE ${opcode} 완료: 성공 ${successCount}건, 중복 ${skipCount}건`);
    
    // ✅ Sync balance for all usernames appearing in betting records
    if (successCount > 0) {
      console.log(`   💾 신규 베팅 ${successCount}건이 DB에 저장되었습니다.`);
      
      // ✅ Lv2에서 api_configs credentials 사용하여 사용자 보유금 실시간 동기화
      const uniqueUsernames = [...new Set(sortedRecords.map(r => r.username).filter(Boolean))];
      console.log(`   👥 보유금 동기화 대상: ${uniqueUsernames.length}명`);

      // ✅ 토큰 조회 (api_configs에서)
      const { data: apiConfig } = await supabase
        .from('api_configs')
        .select('token')
        .eq('partner_id', partnerId)
        .eq('api_provider', 'invest')
        .maybeSingle();

      const token = apiConfig?.token || '';

      if (!token) {
        console.warn(`   ⚠️ [BALANCE-SYNC] api_configs에 invest token 없음, 보유금 동기화 스킵`);
      } else {
        let balanceSyncSuccess = 0;
        let balanceSyncFail = 0;

        for (const username of uniqueUsernames) {
          try {
            const balanceResult = await getUserBalanceWithConfig(opcode, username, token, secretKey);

            if (balanceResult.success && balanceResult.balance !== undefined) {
              await supabase
                .from('users')
                .update({
                  balance: balanceResult.balance,
                  updated_at: new Date().toISOString()
                })
                .eq('username', username);

              balanceSyncSuccess++;
            } else {
              balanceSyncFail++;
            }
          } catch (err) {
            console.error(`   ❌ [BALANCE-SYNC] ${username} 보유금 동기화 실패:`, err);
            balanceSyncFail++;
          }
        }

        console.log(`   ✅ [BALANCE-SYNC] 보유금 동기화 완료: 성공 ${balanceSyncSuccess}명, 실패 ${balanceSyncFail}명`);
      }
      
      // 🔍 저장 직후 DB 확인
      const { data: verifyData, error: verifyError } = await supabase
        .from('game_records')
        .select('id, external_txid, username, partner_id')
        .eq('partner_id', partnerId)
        .order('external_txid', { ascending: false })
        .limit(3);
      
      if (!verifyError && verifyData && verifyData.length > 0) {
        console.log(`   🔍 DB 확인: 최근 저장된 ${verifyData.length}건`, verifyData);
      } else if (verifyError) {
        console.error(`   ❌ DB 확인 오류:`, verifyError);
      } else {
        console.warn(`   ⚠️ DB에서 데이터를 찾을 수 없습니다! partner_id: ${partnerId}`);
      }
      
      // ✅ 베팅 기록 저장 후 세션 상태 전환 모니터링
      await monitorSessionStates();
    }

  } catch (error) {
    console.error(`❌ [BETTING-SYNC] OPCODE ${opcode} 오류:`, error);
  }
};

/**
 * ✅ 강제 동기화 함수 (export) - 세션 체크 없이 무조건 API 호출
 * 새로고침 버튼 클릭 시 사용
 */
export async function forceSyncBettingHistory(user: Partner) {
  console.log('🔄 [BETTING-FORCE-SYNC] 베팅 동기화 시작');

  try {
    // ✅ Lv1 파트너 ID 찾기
    let topLevelPartnerId = user.id;
    if (user.level !== 1) {
      // Lv1까지 올라가기
      let currentId = user.id;
      let currentLevel = user.level;
      
      while (currentLevel > 1) {
        const { data: parentPartner } = await supabase
          .from('partners')
          .select('id, level, parent_id')
          .eq('id', (await supabase.from('partners').select('parent_id').eq('id', currentId).single()).data?.parent_id || '')
          .single();
        
        if (!parentPartner) break;
        
        currentId = parentPartner.id;
        currentLevel = parentPartner.level;
        
        if (currentLevel === 1) {
          topLevelPartnerId = currentId;
          break;
        }
      }
    }
    
    // OroPlay 베팅 동기화 실행
    await syncOroPlayBettingHistory(topLevelPartnerId);
    
    // HonorAPI 베팅 동기화 실행
    await syncHonorApiBettingHistory(topLevelPartnerId);

    console.log('✅ [BETTING-FORCE-SYNC] 베팅 동기화 완료');
  } catch (error) {
    console.error('❌ [BETTING-FORCE-SYNC] 오류:', error);
    throw error;
  }
}

/**
 * ✅ OroPlay API Betting History Sync
 * seamless_wallet_integration.md Section 5.1
 */
const syncOroPlayBettingHistory = async (partnerId: string) => {
  try {
    console.log('🎮 [OROPLAY-SYNC] Betting history sync started');

    // 1. OroPlay 토큰 가져오기
    const token = await oroplayApi.getOroPlayToken(partnerId);
    
    // ✅ 2. Vendor 목록 가져오기 (실제 vendor 이름 매핑용)
    const vendors = await oroplayApi.getVendorsList(token);
    const vendorMap = new Map<string, string>();
    vendors.forEach(vendor => {
      // vendorCode 전체를 키로 사용 (예: "slot-pragmatic")
      vendorMap.set(vendor.vendorCode, vendor.name);
      
      // ✅ "-" 뒤의 provider code만 추출하여 fallback 키로도 추가
      const parts = vendor.vendorCode.split('-');
      if (parts.length >= 2) {
        const providerCode = parts.slice(1).join('-'); // "slot-pragmatic" → "pragmatic"
        vendorMap.set(providerCode, vendor.name);
      }
    });
    console.log(`   📋 Vendor 목록: ${vendors.length}개 (맵 크기: ${vendorMap.size})`);
    
    // 3. 최근 동기화 시간 확인 (없으면 24시간 전부터)
    const lastSyncKey = `oroplay_last_sync_${partnerId}`;
    const lastSyncTime = localStorage.getItem(lastSyncKey);
    
    // ✅ 더 넓은 범위로 조회 (24시간)
    const startDate = lastSyncTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // 4. Apply rate limit to betting history query (V2 by-date, limit 4000)
    const result = await callWithRateLimit(async () => {
      return await oroplayApi.getBettingHistory(token, startDate, 4000);
    });
    
    if (!result || !result.histories || result.histories.length === 0) {
      console.log('ℹ️ [OROPLAY-SYNC] No new betting records');
      return;
    }
    
    console.log(`📊 [OROPLAY-SYNC] ${result.histories.length} betting records retrieved`);
    
    // 5. status=1 (완료된 배팅만) 필터링
    const completedBets = result.histories.filter((bet: any) => bet.status === 1);
    console.log(`   ✅ 완료된 배팅: ${completedBets.length}건`);
    
    // 6. 사용자 매핑
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, username');
    
    const userMap = new Map<string, string>();
    if (allUsers) {
      allUsers.forEach((u: any) => {
        userMap.set(u.username, u.id);
      });
    }
    
    // 7. game_records에 저장
    let successCount = 0;
    let skipCount = 0;
    
    for (const bet of completedBets) {
      try {
        const userId = userMap.get(bet.userCode);
        if (!userId) {
          console.warn(`   ⚠️ 사용자 매칭 실패: ${bet.userCode}`);
          continue;
        }
        
        // ✅ vendorCode 파싱: "slot-pragmatic" → gameType="slot", providerCode="pragmatic"
        let gameType = '';
        let providerCode = '';
        let providerName = '';
        
        if (bet.vendorCode && bet.vendorCode.includes('-')) {
          const parts = bet.vendorCode.split('-');
          gameType = parts[0]; // "slot", "casino" 등
          providerCode = parts.slice(1).join('-'); // "pragmatic", "evolution" 등
          
          // ⭐ vendorMap에서 제공사 이름 찾기 (전체 vendorCode 우선, 없으면 providerCode로, 최종적으로 대문자 변환)
          providerName = vendorMap.get(bet.vendorCode) || 
                         vendorMap.get(providerCode) || 
                         (providerCode ? providerCode.charAt(0).toUpperCase() + providerCode.slice(1) : null) || // ⭐ 매핑 실패 시 첫글자 대문자로 표시
                         'Unknown Provider';
        } else if (bet.vendorCode) {
          // "-"가 없는 경우 그대로 사용
          providerName = vendorMap.get(bet.vendorCode) || bet.vendorCode || 'Unknown Provider';
        } else {
          // vendorCode가 아예 없는 경우
          providerName = 'Unknown Provider';
        }
        
        // ✅ gameCode로 게임 정보 조회
        let gameData = null;
        if (bet.gameCode) {
          const result = await supabase
            .from('games')
            .select('id, name, provider_id')
            .eq('game_code', bet.gameCode)
            .eq('api_type', 'oroplay')
            .maybeSingle();
          gameData = result.data;
        }
        
        // ⭐ gameName: DB에 있으면 사용, 없으면 gameCode를 그대로 사용, 그것도 없으면 'Unknown Game'
        const gameName = gameData?.name || (bet.gameCode ? String(bet.gameCode) : 'Unknown Game');
        
        const { error } = await supabase
          .from('game_records')
          .insert({
            api_type: 'oroplay',
            partner_id: partnerId,
            external_txid: bet.id,
            username: bet.userCode,
            user_id: userId,
            game_id: gameData?.id || null,
            provider_id: gameData?.provider_id || null,
            game_title: gameName,  // ⭐ 항상 유효한 값 보장
            provider_name: providerName,  // ⭐ 항상 유효한 값 보장
            game_type: gameType || null, // ✅ 게임 타입 저장 (slot, casino 등)
            bet_amount: bet.betAmount,
            win_amount: bet.winAmount,
            balance_before: bet.beforeBalance,
            balance_after: bet.afterBalance,
            // ✅ createdAt이 Unix timestamp(초 단위)면 변환, 문자열이면 그대로 사용
            played_at: typeof bet.createdAt === 'number' 
              ? new Date(bet.createdAt * 1000).toISOString() 
              : new Date(bet.createdAt).toISOString()
          });
        
        if (error) {
          if (error.code === '23505') {
            skipCount++; // 중복
          } else {
            console.error(`   ❌ INSERT 실패 (txid: ${bet.id}):`, error);
          }
        } else {
          successCount++;
        }
        
      } catch (err) {
        console.error(`   ❌ 레코드 처리 오류:`, err);
      }
    }
    
    console.log(`✅ [OROPLAY-SYNC] 완료: 성공 ${successCount}건, 중복 ${skipCount}건`);
    
    // 8. 다음 동기화 시작 시간 저장
    if (result.nextStartDate) {
      localStorage.setItem(lastSyncKey, result.nextStartDate);
    }
    
  } catch (error) {
    console.error('❌ [OROPLAY-SYNC] 오류:', error);
  }
};

/**
 * ✅ HonorAPI Betting History Sync
 */
const syncHonorApiBettingHistory = async (partnerId: string) => {
  try {
    console.log('🎮 [HONORAPI-SYNC] Betting history sync started');
    
    // 베팅 내역 동기화 실행
    const result = await honorApiModule.syncHonorApiBettingHistory();
    
    if (!result.success) {
      console.error('❌ [HONORAPI-SYNC] 동기화 실패:', result.error);
      return;
    }
    
    console.log(`✅ [HONORAPI-SYNC] 완료: ${result.recordsSaved}/${result.recordsProcessed}건 저장`);
    
  } catch (error) {
    console.error('❌ [HONORAPI-SYNC] 오류:', error);
  }
};

/**
 * ✅ 베팅 기록 세션 자동 종료 컴포넌트 (Lv1, Lv2 전용)
 * 
 * ⚠️ 새 정책:
 * - Lv1(시스템관리자), Lv2(대본사): 세션 자동 종료만 담당
 * - Lv3~Lv6: 사용 안 함
 * 
 * 동작:
 * - ❌ 30초 자동 타이머 제거 (성능 최적화)
 * - ✅ 베팅 내역은 새로고침 버튼으로만 수동 호출
 * - ✅ 세션 자동 종료는 30초마다 체크 (240초 무활동 기준)
 * - ❌ HonorAPI 자동 동기화 비활성화 (Rate Limit 방지, 수동으로만 호출)
 * 
 * AdminLayout.tsx에서 user.level === 1 또는 user.level === 2일 때만 렌더링됩니다.
 */
export function BettingHistorySync({ user }: BettingHistorySyncProps) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ 세션 자동 종료만 30초마다 실행 (동기화는 새로고침 버튼으로만)
  useEffect(() => {
    // ✅ Lv1, Lv2 권한 체크
    if (user.level !== 1 && user.level !== 2) {
      console.warn('⛔ [SESSION-AUTO-END] Lv1, Lv2만 사용 가능 (현재:', user.level, ')');
      return;
    }

    console.log('🎯 [SESSION-MONITOR] 세션 상태 모니터링 타이머 시작 (30초 간격)');

    // 기존 interval이 있으면 제거
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 즉시 1회 실행
    monitorSessionStates();

    // 30초마다 세션 상태 모니터링 실행
    intervalRef.current = setInterval(() => {
      monitorSessionStates();
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user.level]);

  return null;
}

// syncBalanceOnSessionEnd 함수는 lib/gameApi.ts로 이동됨