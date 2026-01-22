import { useEffect, useRef, useState } from "react";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { publicAnonKey } from "../../utils/supabase";

interface Lv2AutoSyncProps {
  user: Partner;
}

/**
 * Lv2 관리자 전용 자동 동기화 컴포넌트
 * - Invest 베팅 동기화: 30초마다 실행 (활성화된 경우만)
 * - OroPlay, FamilyAPI 베팅 동기화: 4초마다 실행 (활성화된 경우만)
 * - 보유금 동기화: 4초마다 실행 (Lv2 잔액)
 */
export function Lv2AutoSync({ user }: Lv2AutoSyncProps) {
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncCountRef = useRef(0);
  const investSyncCountRef = useRef(0);
  const balanceIntervalRef = useRef<number | null>(null);
  const investIntervalRef = useRef<number | null>(null);
  const honorIntervalRef = useRef<number | null>(null);
  const activeApisRef = useRef({
    invest: false,
    oroplay: false,
    familyapi: false,
    honorapi: false
  });

  console.log('🔧 [Lv2AutoSync] 컴포넌트 마운트됨, user.level:', user.level, 'user.id:', user.id);

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

  // API 활성화 상태 조회
  useEffect(() => {
    const checkActiveApis = async () => {
      try {
        // Lv1 파트너의 API 설정 확인
        const { data: apiConfigs } = await supabase
          .from('api_configs')
          .select('api_provider, is_active')
          .eq('partner_id', user.parent_id)
          .eq('is_active', true);

        if (apiConfigs) {
          const activeApiMap = {
            invest: false,
            oroplay: false,
            familyapi: false,
            honorapi: false
          };

          apiConfigs.forEach((config: any) => {
            if (config.api_provider === 'invest') activeApiMap.invest = true;
            if (config.api_provider === 'oroplay') activeApiMap.oroplay = true;
            if (config.api_provider === 'familyapi') activeApiMap.familyapi = true;
            if (config.api_provider === 'honorapi') activeApiMap.honorapi = true;
          });

          // ✅ ref에 저장 (state 대신)
          activeApisRef.current = activeApiMap;
          console.log('✅ [Lv2AutoSync] 활성화된 API:', activeApiMap);
        }
      } catch (error) {
        console.error('❌ [Lv2AutoSync] API 활성화 상태 조회 실패:', error);
      }
    };

    if (user.level === 2 && user.parent_id) {
      checkActiveApis();
    }
  }, [user.level, user.parent_id]);

  useEffect(() => {
    // Lv2가 아니면 실행하지 않음
    if (user.level !== 2) {
      console.log('⛔ [Lv2AutoSync] Lv2가 아님 - 실행 취소 (level:', user.level, ')');
      return;
    }

    console.log('✅ [Lv2AutoSync] useEffect 시작 - Lv2 사용자 감지');

    // ✅ Edge Function URL 하드코딩
    const EDGE_FUNCTION_URL = 'https://hduofjzsitoaujyjvuix.supabase.co/functions/v1/server';

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    };

    // Invest 베팅 동기화 실행 함수 (30초마다)
    const runInvestBettingSync = async () => {
      if (!activeApisRef.current.invest) {
        return;
      }

      try {
        investSyncCountRef.current += 1;
        console.log(`🎰 [Lv2AutoSync #${investSyncCountRef.current}] Invest 베팅 동기화 시작...`);

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
      if (!activeApisRef.current.honorapi) {
        return;
      }

      try {
        // console.log('🎰 [Lv2AutoSync] HonorAPI 베팅 동기화 시작...');

        const honorBetsResponse = await fetchWithRetry(`${EDGE_FUNCTION_URL}/sync/honorapi-bets`, {
          method: 'POST',
          headers,
        });

        if (!honorBetsResponse) {
          // console.error('❌ [Lv2AutoSync] HonorAPI 베팅 동기화 실패: 최대 재시도 횟수 초과');
        } else if (!honorBetsResponse.ok) {
          const errorText = await honorBetsResponse.text();
          // console.error('❌ [Lv2AutoSync] HonorAPI 베팅 동기화 실패:', honorBetsResponse.status, errorText);
        } else {
          const honorBetsData = await honorBetsResponse.json();
          // console.log('✅ [Lv2AutoSync] HonorAPI 베팅 동기화 성공:', honorBetsData);
        }

      } catch (error: any) {
        // console.error('❌ [Lv2AutoSync] HonorAPI 베팅 동기화 오류:', error);
      }
    };

    // OroPlay, FamilyAPI 베팅 동기화 + 보유금 동기화 실행 함수 (4초마다)
    const runFastSync = async () => {
      try {
        syncCountRef.current += 1;
        console.log(`🔄 [Lv2AutoSync #${syncCountRef.current}] 동기화 시작 - activeApis:`, activeApisRef.current);

        // 1. OroPlay 베팅 동기화
        if (activeApisRef.current.oroplay) {
          console.log('📞 [Lv2AutoSync] OroPlay 베팅 동기화 호출...');
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

        // 2. FamilyAPI 베팅 동기화
        if (activeApisRef.current.familyapi) {
          // console.log('📞 [Lv2AutoSync] FamilyAPI 베팅 동기화 호출...');
          const familyBetsResponse = await fetchWithRetry(`${EDGE_FUNCTION_URL}/sync/familyapi-bets`, {
            method: 'POST',
            headers,
          });

          if (!familyBetsResponse) {
            // console.error('❌ [Lv2AutoSync] FamilyAPI 베팅 동기화 실패: 최대 재시도 횟수 초과');
          } else if (!familyBetsResponse.ok) {
            const errorText = await familyBetsResponse.text();
            // console.error('❌ [Lv2AutoSync] FamilyAPI 베팅 동기화 실패:', familyBetsResponse.status, errorText);
          } else {
            const familyBetsData = await familyBetsResponse.json();
            // console.log('✅ [Lv2AutoSync] FamilyAPI 베팅 동기화 성공:', familyBetsData);
          }
        }

        // 3. Lv2 보유금 동기화
        // console.log('📞 [Lv2AutoSync] Lv2 보유금 동기화 호출...');
        const balanceResponse = await fetchWithRetry(`${EDGE_FUNCTION_URL}/sync/lv2-balances`, {
          method: 'POST',
          headers,
        });

        if (!balanceResponse) {
          // console.error('❌ [Lv2AutoSync] 보유금 동기화 실패: 최대 재시도 횟수 초과');
        } else if (!balanceResponse.ok) {
          const errorText = await balanceResponse.text();
          // console.error('❌ [Lv2AutoSync] 보유금 동기화 실패:', balanceResponse.status, errorText);
        } else {
          const balanceData = await balanceResponse.json();
          // console.log('✅ [Lv2AutoSync] 보유금 동기화 성공:', balanceData);
        }

        // 동기화 성공 시 시간 업데이트
        setLastSyncTime(new Date());
        console.log(`✅ [Lv2AutoSync #${syncCountRef.current}] 동기화 완료`);

      } catch (error: any) {
        // console.error('❌ [Lv2AutoSync] 동기화 오류:', error);
      }
    };

    // 즉시 첫 동기화 실행
    console.log('⚡ [Lv2AutoSync] 첫 동기화 시작...');
    if (activeApisRef.current.invest) {
      console.log('  → Invest API 활성화, runInvestBettingSync 호출');
      runInvestBettingSync();
    }
    if (activeApisRef.current.honorapi) {
      console.log('  → HonorAPI 활성화, runHonorApiBettingSync 호출');
      runHonorApiBettingSync();
    }
    console.log('  → runFastSync 호출');
    runFastSync();

    // Invest 베팅 동기화: 30초마다 실행
    if (activeApisRef.current.invest) {
      console.log('⏱️ [Lv2AutoSync] Invest 30초 interval 설정');
      investIntervalRef.current = window.setInterval(() => {
        runInvestBettingSync();
      }, 30000);
    }

    // HonorAPI 베팅 동기화: 34초마다 실행
    if (activeApisRef.current.honorapi) {
      console.log('⏱️ [Lv2AutoSync] HonorAPI 34초 interval 설정');
      honorIntervalRef.current = window.setInterval(() => {
        runHonorApiBettingSync();
      }, 34000);
    }

    // OroPlay, FamilyAPI 베팅 + 보유금 동기화: 4초마다 실행
    console.log('⏱️ [Lv2AutoSync] FastSync 4초 interval 설정');
    balanceIntervalRef.current = window.setInterval(() => {
      runFastSync();
    }, 4000);

    // 클린업
    return () => {
      console.log('🛑 [Lv2AutoSync] useEffect 정리 시작');
      if (balanceIntervalRef.current) {
        clearInterval(balanceIntervalRef.current);
        balanceIntervalRef.current = null;
        console.log('  → FastSync interval 제거');
      }
      if (investIntervalRef.current) {
        clearInterval(investIntervalRef.current);
        investIntervalRef.current = null;
        console.log('  → Invest interval 제거');
      }
      if (honorIntervalRef.current) {
        clearInterval(honorIntervalRef.current);
        honorIntervalRef.current = null;
        console.log('  → HonorAPI interval 제거');
      }
      console.log('🛑 [Lv2AutoSync] useEffect 정리 완료');
    };
  }, [user.level, user.id, user.parent_id]);

  // UI는 렌더링하지 않음 (백그라운드 동작)
  return null;
}