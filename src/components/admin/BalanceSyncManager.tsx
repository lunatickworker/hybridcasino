import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
// import { getInfo, getAllAccountBalances, getAccountBalance } from '../../lib/investApi'; // ❌ getInfo 사용 중지
import { getAllAccountBalances, getAccountBalance } from '../../lib/investApi';
import * as opcodeHelper from '../../lib/opcodeHelper';
import { Partner } from '../../types';

interface BalanceSyncManagerProps {
  user: Partner;
}

// ⚠️ 자동 로그아웃 카운트 제한 설정 (테스트: 1, 운영: 60)
const LOGOUT_COUNT_LIMIT = 60; // 🔧 여기 수정: 60으로 변경

/**
 * ✅ 보유금 자동 동기화 매니저 (Lv1 전용)
 * 
 * ⚠️ 중요: Lv1(시스템관리자)만 외부 API를 호출하여 balance를 동기화합니다!
 * - Lv2~Lv6: Seamless Wallet이므로 외부 API 호출 없음 (베팅내역 동기화만)
 * 
 * Lv1이 실행하는 작업:
 * 1. GET /api/info: 자신의 보유금 동기화 (30초마다)
 * 2. GET /api/account/balance: 온라인 사용자 개별 조회 (30초마다, 10초 차이)
 * 3. 설정된 횟수 도달 시 자동 로그아웃
 * 
 * AdminLayout.tsx에서 user.level === 1일 때만 렌더링됩니다.
 */
export function BalanceSyncManager({ user }: BalanceSyncManagerProps) {
  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // 온라인 사용자 GET API용 refs
  const isOnlineSyncingRef = useRef(false);
  const lastOnlineSyncTimeRef = useRef<number>(0);
  const onlineIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ========================================
  // 온라인 사용자 전용 보유금 동기화 (GET API)
  // ========================================
  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // ✅ Lv1 권한 체크
    if (user.level !== 1) {
      return;
    }

    const syncOnlineUserBalances = async () => {
      const now = Date.now();
      const timeSinceLastSync = now - lastOnlineSyncTimeRef.current;
      
      // 최소 25초 간격 보장
      if (timeSinceLastSync < 25000) {
        return;
      }

      if (isOnlineSyncingRef.current) {
        return;
      }

      try {
        isOnlineSyncingRef.current = true;
        lastOnlineSyncTimeRef.current = now;

        // ✅ Invest API 활성화 체크 (OPCODE는 invest 전용)
        const { data: investConfig } = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'invest')
          .maybeSingle();

        if (!investConfig?.is_active) {
          // ⭐ Invest API 비활성화 시 조용히 스킵
          return;
        }

        // opcode 정보 조회 (invest 전용)
        const opcodeInfo = await opcodeHelper.getAdminOpcode(user);
        
        let opcode: string;
        let secretKey: string;
        let token: string;

        if (opcodeHelper.isMultipleOpcode(opcodeInfo)) {
          if (opcodeInfo.opcodes.length === 0) {
            // ⭐ 조용히 스킵 (경고 메시지 제거)
            return;
          }
          opcode = opcodeInfo.opcodes[0].opcode;
          secretKey = opcodeInfo.opcodes[0].secretKey;
          token = opcodeInfo.opcodes[0].token || '';
        } else {
          opcode = opcodeInfo.opcode;
          secretKey = opcodeInfo.secretKey;
          token = opcodeInfo.token || '';
        }

        // ⭐ 게임 중인 사용자만 조회 (game_launch_sessions에서 active 상태)
        const { data: activeGameSessions, error: sessionError } = await supabase
          .from('game_launch_sessions')
          .select('user_id')
          .eq('status', 'active');

        if (sessionError) {
          console.error('❌ [OnlineBalanceSync] 게임 세션 조회 실패:', sessionError);
          return;
        }

        if (!activeGameSessions || activeGameSessions.length === 0) {
          return;
        }

        // 중복 제거
        const activeUserIds = [...new Set(activeGameSessions.map((s: any) => s.user_id).filter(Boolean))];

        // 사용자 정보 조회
        const { data: onlineUsers, error: onlineError } = await supabase
          .from('users')
          .select('id, username, balance')
          .in('id', activeUserIds);

        if (onlineError) {
          console.error('❌ [OnlineBalanceSync] 사용자 조회 실패:', onlineError);
          return;
        }

        if (!onlineUsers || onlineUsers.length === 0) {
          return;
        }

        let successCount = 0;
        let logoutCount = 0;

        // 각 온라인 사용자에 대해 GET API 호출
        for (const onlineUser of onlineUsers) {
          const username = onlineUser.username;
          
          if (!username || !token) {
            continue;
          }

          try {
            // GET /api/account/balance 호출
            const apiResult = await getAccountBalance(opcode, username, token, secretKey);

            if (apiResult.error) {
              console.error(`❌ [OnlineBalanceSync] API 호출 실패 (${username}):`, apiResult.error);
              continue;
            }

            const apiData = apiResult.data;
            let newBalance = 0;

            // API 응답 파싱
            if (apiData) {
              if (typeof apiData === 'object' && !apiData.is_text) {
                if (apiData.RESULT === true && apiData.DATA) {
                  newBalance = parseFloat(apiData.DATA.balance || 0);
                } else if (apiData.balance !== undefined) {
                  newBalance = parseFloat(apiData.balance || 0);
                }
              } else if (apiData.is_text && apiData.text_response) {
                const balanceMatch = apiData.text_response.match(/balance[\\\"'\\\s:]+(\\d+\\.?\\d*)/i);
                if (balanceMatch) {
                  newBalance = parseFloat(balanceMatch[1]);
                }
              }
            }

            // ✅ DB에서 현재 호출 카운터 조회
            const { data: userData } = await supabase
              .from('users')
              .select('balance_sync_call_count')
              .eq('username', username)
              .single();

            const currentCount = userData?.balance_sync_call_count || 0;
            const newCount = currentCount + 1;

            // 설정된 카운트 도달 시 강제 로그아웃
            if (newCount >= LOGOUT_COUNT_LIMIT) {
              // 보유금 업데이트 + 로그아웃 + 카운터 초기화
              await supabase
                .from('users')
                .update({
                  balance: newBalance,
                  is_online: false,
                  balance_sync_call_count: 0,
                  updated_at: new Date().toISOString()
                })
                .eq('username', username);

              logoutCount++;
            } else {
              // ✅ 설정된 카운트 미만이면 보유금 업데이트 + 카운터 증가
              await supabase
                .from('users')
                .update({
                  balance: newBalance,
                  balance_sync_call_count: newCount,
                  updated_at: new Date().toISOString()
                })
                .eq('username', username);
            }

            successCount++;

          } catch (error) {
            console.error(`❌ [OnlineBalanceSync] 처리 오류 (${username}):`, error);
          }
        }

      } catch (error) {
        console.error('❌ [OnlineBalanceSync] 동기화 오류:', error);
      } finally {
        isOnlineSyncingRef.current = false;
      }
    };

    // 기존 interval이 있으면 제거
    if (onlineIntervalRef.current) {
      clearInterval(onlineIntervalRef.current);
      onlineIntervalRef.current = null;
    }

    // 10초 후 첫 실행 (PATCH와 시간 분산)
    const initialTimeout = setTimeout(() => {
      syncOnlineUserBalances();
      
      // 이후 30초마다 실행
      onlineIntervalRef.current = setInterval(() => {
        syncOnlineUserBalances();
      }, 30000);
    }, 10000);

    return () => {
      clearTimeout(initialTimeout);
      if (onlineIntervalRef.current) {
        clearInterval(onlineIntervalRef.current);
        onlineIntervalRef.current = null;
      }
    };
  }, [user?.id, user?.username, user?.level]);

  // ========================================
  // 전체 사용자 보유금 동기화 (PATCH API)
  // ========================================
  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // ✅ Lv1 권한 체크
    if (user.level !== 1) {
      return;
    }

    const syncAllBalances = async () => {
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncTimeRef.current;
      
      // 최소 25초 간격 보장 (30초 interval이지만 안전하게 25초)
      if (timeSinceLastSync < 25000) {
        return;
      }

      if (isSyncingRef.current) {
        return;
      }

      try {
        isSyncingRef.current = true;
        lastSyncTimeRef.current = now;

        // ✅ Invest API 활성화 체크 (OPCODE는 invest 전용)
        const { data: investConfig } = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'invest')
          .maybeSingle();

        if (!investConfig?.is_active) {
          // ⭐ Invest API 비활성화 시 조용히 스킵
          return;
        }

        // opcode 정보 조회 (invest 전용)
        const opcodeInfo = await opcodeHelper.getAdminOpcode(user);
        
        let opcode: string;
        let secretKey: string;
        let partnerId: string;

        if (opcodeHelper.isMultipleOpcode(opcodeInfo)) {
          if (opcodeInfo.opcodes.length === 0) {
            console.warn('⚠️ [BalanceSync] 사용 가능한 OPCODE 없음 - 동기화 스킵');
            return;
          }
          opcode = opcodeInfo.opcodes[0].opcode;
          secretKey = opcodeInfo.opcodes[0].secretKey;
          partnerId = opcodeInfo.opcodes[0].partnerId;
        } else {
          opcode = opcodeInfo.opcode;
          secretKey = opcodeInfo.secretKey;
          partnerId = opcodeInfo.partnerId;
        }

        // ⚠️ 이 컴포넌트는 Lv1만 사용합니다 (AdminLayout.tsx에서 조건부 렌더링)
        // Lv2~Lv6은 Seamless Wallet이므로 외부 API 호출하지 않습니다
        if (user.level !== 1) {
          return;
        }

        // ========================================
        // Lv1: GET /api/info (자신의 보유금 동기화)
        // ========================================
        // const apiResult = await getInfo(opcode, secretKey);

        // if (apiResult.error) {
        //   console.error('❌ [BalanceSync] API 호출 실패:', apiResult.error);
        //   return;
        // }

        // const apiData = apiResult.data;
        // let newBalance = 0;

        // if (apiData) {
        //   if (typeof apiData === 'object' && !apiData.is_text) {
        //     if (apiData.RESULT === true && apiData.DATA) {
        //       newBalance = parseFloat(apiData.DATA.balance || 0);
        //     } else if (apiData.balance !== undefined) {
        //       newBalance = parseFloat(apiData.balance || 0);
        //     }
        //   } else if (apiData.is_text && apiData.text_response) {
        //     const balanceMatch = apiData.text_response.match(/balance[\"'\\\s:]+(\\d+\\.?\\d*)/i);
        //     if (balanceMatch) {
        //       newBalance = parseFloat(balanceMatch[1]);
        //     }
        //   }
        // }

        // await supabase
        //   .from('partners')
        //   .update({
        //     balance: newBalance,
        //     updated_at: new Date().toISOString()
        //   })
        //   .eq('id', partnerId);

        // ========================================
        // PATCH /api/account/balance (온라인 게임 사용자만 보유금 일괄 조회)
        // ⭐ 최적화: game_launch_sessions에 active 상태인 사용자만 동기화
        // ========================================
        
        // 1️⃣ 온라인 게임 중인 사용자 조회 (active 세션)
        const { data: onlineGameSessions, error: sessionError } = await supabase
          .from('game_launch_sessions')
          .select('user_id')
          .eq('status', 'active');

        if (sessionError) {
          console.error('❌ [BalanceSync] 온라인 게임 세션 조회 실패:', sessionError);
          return;
        }

        if (!onlineGameSessions || onlineGameSessions.length === 0) {
          return;
        }

        // 2️⃣ 온라인 사용자의 username 조회
        const onlineUserIds = [...new Set(onlineGameSessions.map((s: any) => s.user_id).filter(Boolean))];
        
        const { data: onlineUsers, error: userError } = await supabase
          .from('users')
          .select('username')
          .in('id', onlineUserIds);

        if (userError) {
          console.error('❌ [BalanceSync] 온라인 사용자 조회 실패:', userError);
          return;
        }

        if (!onlineUsers || onlineUsers.length === 0) {
          return;
        }

        const onlineUsernames = onlineUsers.map((u: any) => u.username);
        
        const patchResult = await getAllAccountBalances(opcode, secretKey);

        if (patchResult.error) {
          console.error('❌ [BalanceSync] PATCH API 호출 실패:', patchResult.error);
          return;
        }

        const patchData = patchResult.data;
        
        // ✅ 응답에서 온라인 사용자만 필터링하여 동기화
        if (patchData) {
          let balanceMap: Record<string, number> = {};
          
          // 응답 파싱 (다양한 형식 지원)
          if (typeof patchData === 'object' && !patchData.is_text) {
            if (patchData.RESULT === true && patchData.DATA) {
              // { RESULT: true, DATA: { username1: balance1, username2: balance2, ... } }
              balanceMap = patchData.DATA;
            } else if (patchData.data) {
              // { data: { username1: balance1, username2: balance2, ... } }
              balanceMap = patchData.data;
            } else {
              // { username1: balance1, username2: balance2, ... }
              balanceMap = patchData;
            }
          }

          const allUsernames = Object.keys(balanceMap);
          
          // ⭐ 온라인 게임 중인 사용자만 필터링
          const targetUsernames = allUsernames.filter(username => onlineUsernames.includes(username));
          
          if (targetUsernames.length === 0) {
            return;
          }

          let successCount = 0;
          let failCount = 0;

          // ✅ 온라인 사용자만 DB 업데이트
          for (const username of targetUsernames) {
            try {
              const balance = parseFloat(balanceMap[username] || 0);

              const { error } = await supabase
                .from('users')
                .update({
                  balance: balance,
                  updated_at: new Date().toISOString()
                })
                .eq('username', username);

              if (error) {
                console.error(`❌ [BalanceSync] ${username} 업데이트 실패:`, error);
                failCount++;
              } else {
                successCount++;
              }
            } catch (err) {
              console.error(`❌ [BalanceSync] ${username} 처리 오류:`, err);
              failCount++;
            }
          }
        }

      } catch (error) {
        console.error('❌ [BalanceSync] 동기화 오류:', error);
      } finally {
        isSyncingRef.current = false;
      }
    };

    // 기존 interval이 있으면 제거
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 즉시 1회 실행
    syncAllBalances();

    // 30초마다 실행
    intervalRef.current = setInterval(() => {
      syncAllBalances();
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user?.id, user?.username, user?.level]);

  return null;
}