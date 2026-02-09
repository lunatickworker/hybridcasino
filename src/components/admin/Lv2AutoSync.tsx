import { useEffect, useRef, useState } from "react";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { publicAnonKey } from "../../utils/supabase";
import { useApiStatus } from "../../hooks/useApiStatus";

interface Lv2AutoSyncProps {
  user: Partner;
}

/**
 * Lv2 관리자 전용 자동 동기화 컴포넌트
 * - OroPlay 베팅 동기화: 1초마다 실행 (활성화된 경우만)
 * - HonorAPI 베팅 동기화: 34초마다 실행 (활성화된 경우만)
 * - Invest 베팅 동기화: 30초마다 실행 (활성화된 경우만)
 * 
 * 보유금 동기화는 Lv2BalanceSync.tsx (4초 주기)에서 별도로 관리
 */
export function Lv2AutoSync({ user }: Lv2AutoSyncProps) {
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncCountRef = useRef(0);
  const investSyncCountRef = useRef(0);
  const balanceIntervalRef = useRef<number | null>(null);
  const investIntervalRef = useRef<number | null>(null);
  const honorIntervalRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);
  
  // ✅ useApiStatus로 동적 API 상태 감시
  const targetPartnerId = user.level === 2 ? user.id : user.parent_id;
  const { apiStatus } = useApiStatus(targetPartnerId);



  // ✅ 네트워크 오류 재시도 헬퍼 함수
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response | null> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃 (25초→30초 증가)
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // ✅ 응답이 성공이면 바로 반환
        if (response.ok) {
          return response;
        }
        
        // ✅ 500번대 에러는 재시도
        if (response.status >= 500 && attempt < maxRetries) {
          // console.log(`⚠️ [Lv2AutoSync] 서버 오류 (${response.status}), 재시도 중... (${attempt + 1}/${maxRetries + 1})`);
          const waitTime = Math.min(Math.pow(2, attempt) * 1000, 5000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // ✅ 400번대 에러는 재시도 없이 바로 반환
        return response;
        
      } catch (error: any) {
        lastError = error;
        
        // ✅ 타임아웃/네트워크 오류만 재시도
        const isRetryableError = error.name === 'AbortError' || 
                                 error.message?.includes('network') || 
                                 error.message?.includes('fetch');
        
        if (isRetryableError && attempt < maxRetries) {
          const waitTime = Math.min(Math.pow(2, attempt) * 1000, 5000); // 지수 백오프: 1초, 2초, 4초 (최대 5초)
          // console.log(`⚠️ [Lv2AutoSync] 재시도 대기 중... (${attempt + 1}/${maxRetries + 1}) - ${waitTime}ms - ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // 재시도 불가능한 에러는 즉시 중단
          break;
        }
      }
    }
    
    // 모든 재시도 실패 시 null 반환 (에러를 던지지 않음)
    if (lastError) {
      // console.error(`❌ [Lv2AutoSync] 최대 재시도 횟수 초과:`, lastError?.message || lastError);
    }
    return null;
  };



  // API 활성화 상태 조회 및 메인 동기화 로직
  useEffect(() => {
    // Lv2가 아니면 실행하지 않음
    console.log('🔍 [Lv2AutoSync] CHECK: user.level=', user.level, 'targetPartnerId=', targetPartnerId);
    
    if (user.level !== 2) {
      console.log('❌ [Lv2AutoSync] NOT Lv2 - STOP');
      return;
    }

    console.log('✅ [Lv2AutoSync] IS Lv2 - START');
    console.log('✅ [Lv2AutoSync] 현재 활성화된 API:', apiStatus);

    // ✅ Edge Function URL 하드코딩
    const EDGE_FUNCTION_URL = 'https://hduofjzsitoaujyjvuix.supabase.co/functions/v1/server';

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    };

    // Invest 베팅 동기화 실행 함수 (30초마다)
    const runInvestBettingSync = async () => {
      if (!apiStatus.invest) {
        console.log('⏭️ [Lv2AutoSync] Invest SKIPPED - API not active');
        return;
      }

      try {
        investSyncCountRef.current += 1;

        const investBetsResponse = await fetchWithRetry(`${EDGE_FUNCTION_URL}/sync/invest-bets`, {
          method: 'POST',
          headers,
        });

        if (!investBetsResponse) {
          // console.error('❌ [Lv2AutoSync] Invest 베팅 동기화 실패: 최대 재시도 횟수 초과');
        } else if (!investBetsResponse.ok) {
          const errorText = await investBetsResponse.text();
          // console.error('❌ [Lv2AutoSync] Invest 베팅 동기화 실패:', investBetsResponse.status, errorText);
        } else {
          const investBetsData = await investBetsResponse.json();
          // console.log('✅ [Lv2AutoSync] Invest 베팅 동기화 성공:', investBetsData);
        }

      } catch (error: any) {
        // console.error('❌ [Lv2AutoSync] Invest 베팅 동기화 오류:', error);
      }
    };

    // HonorAPI 베팅 동기화 실행 함수 (34초마다)
    const runHonorApiBettingSync = async () => {
      try {

        const honorBetsResponse = await fetchWithRetry(`${EDGE_FUNCTION_URL}/sync/honorapi-bets`, {
          method: 'POST',
          headers,
        });

        if (!honorBetsResponse) {
        } else if (!honorBetsResponse.ok) {
          const errorText = await honorBetsResponse.text();
        } else {
          const honorBetsData = await honorBetsResponse.json();
        }

      } catch (error: any) {
        // console.error('❌ [Lv2AutoSync] HonorAPI 베팅 동기화 오류:', error);
      }
    };

    // OroPlay 베팅 동기화 실행 함수 (3초마다)
    const runFastSync = async () => {
      try {
        syncCountRef.current += 1;

        // OroPlay 베팅 동기화
        if (apiStatus.oroplay) {
          const betsResponse = await fetchWithRetry(`${EDGE_FUNCTION_URL}/sync/oroplay-bets`, {
            method: 'POST',
            headers,
          });

          if (!betsResponse) {
            // console.error('❌ [Lv2AutoSync] OroPlay 베팅 동기화 실패: 최대 재시도 횟수 초과');
          } else if (!betsResponse.ok) {
            const errorText = await betsResponse.text();
            // console.error('❌ [Lv2AutoSync] OroPlay 베팅 동기화 실패:', betsResponse.status, errorText);
          } else {
            const betsData = await betsResponse.json();
            // console.log('✅ [Lv2AutoSync] OroPlay 베팅 동기화 성공:', betsData);
          }
        }

        // 동기화 성공 시 시간 업데이트
        setLastSyncTime(new Date());

      } catch (error: any) {
        // console.error('❌ [Lv2AutoSync] 동기화 오류:', error);
      }
    };

    // 즉시 첫 동기화 실행
    if (apiStatus.invest) {
      runInvestBettingSync();
    }
    runHonorApiBettingSync();  // ✅ HonorAPI: 항상 실행
    runFastSync();

    // Invest 베팅 동기화: 30초마다 실행
    if (apiStatus.invest) {
      investIntervalRef.current = window.setInterval(() => {
        runInvestBettingSync();
      }, 30000);
    }

    // OroPlay 베팅 동기화: 3초마다 실행
    balanceIntervalRef.current = window.setInterval(() => {
      runFastSync();
    }, 3000);

    // HonorAPI 베팅 동기화: 34초마다 실행 (OroPlay 패턴과 동일)
    honorIntervalRef.current = window.setInterval(() => {
      runHonorApiBettingSync();
    }, 34000);

    // 클린업
    return () => {
      if (balanceIntervalRef.current) {
        clearInterval(balanceIntervalRef.current);
        balanceIntervalRef.current = null;
      }
      if (investIntervalRef.current) {
        clearInterval(investIntervalRef.current);
        investIntervalRef.current = null;
      }
      if (honorIntervalRef.current) {
        clearInterval(honorIntervalRef.current);
        honorIntervalRef.current = null;
      }
    };
  }, [user.level, user.id, user.parent_id, apiStatus]);

  // UI는 렌더링하지 않음 (백그라운드 동작)
  return null;
}