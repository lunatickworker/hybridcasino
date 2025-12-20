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
  const [activeApis, setActiveApis] = useState({
    invest: false,
    oroplay: false,
    familyapi: false
  });

  // ✅ 네트워크 오류 재시도 헬퍼 함수
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response | null> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25초 타임아웃
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        return response;
      } catch (error: any) {
        lastError = error;
        
        // 마지막 재시도가 아니면 대기 후 재시도
        if (attempt < maxRetries) {
          const waitTime = Math.min(Math.pow(2, attempt) * 1000, 5000); // 지수 백오프: 1초, 2초, 4초 (최대 5초)
          console.log(`⚠️ [Lv2AutoSync] 재시도 대기 중... (${attempt + 1}/${maxRetries + 1}) - ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // 모든 재시도 실패 시 null 반환 (에러를 던지지 않음)
    console.error(`❌ [Lv2AutoSync] 최대 재시도 횟수 초과:`, lastError?.message);
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
            familyapi: false
          };

          apiConfigs.forEach((config: any) => {
            if (config.api_provider === 'invest') activeApiMap.invest = true;
            if (config.api_provider === 'oroplay') activeApiMap.oroplay = true;
            if (config.api_provider === 'familyapi') activeApiMap.familyapi = true;
          });

          setActiveApis(activeApiMap);
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
      return;
    }

    // ✅ Edge Function URL 하드코딩
    const EDGE_FUNCTION_URL = 'https://hduofjzsitoaujyjvuix.supabase.co/functions/v1/server';

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    };

    // Invest 베팅 동기화 실행 함수 (30초마다)
    const runInvestBettingSync = async () => {
      if (!activeApis.invest) {
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
          console.error('❌ [Lv2AutoSync] Invest 베팅 동기화 실패: 최대 재시도 횟수 초과');
        } else if (!investBetsResponse.ok) {
          const errorText = await investBetsResponse.text();
          console.error('❌ [Lv2AutoSync] Invest 베팅 동기화 실패:', investBetsResponse.status, errorText);
        } else {
          const investBetsData = await investBetsResponse.json();
          console.log('✅ [Lv2AutoSync] Invest 베팅 동기화 성공:', investBetsData);
        }

      } catch (error: any) {
        console.error('❌ [Lv2AutoSync] Invest 베팅 동기화 오류:', error);
      }
    };

    // OroPlay, FamilyAPI 베팅 동기화 + 보유금 동기화 실행 함수 (4초마다)
    const runFastSync = async () => {
      try {
        syncCountRef.current += 1;
        console.log(`🔄 [Lv2AutoSync #${syncCountRef.current}] 동기화 시작...`);

        // 1. OroPlay 베팅 동기화
        if (activeApis.oroplay) {
          console.log('📞 [Lv2AutoSync] OroPlay 베팅 동기화 호출...');
          const betsResponse = await fetchWithRetry(`${EDGE_FUNCTION_URL}/sync/oroplay-bets`, {
            method: 'POST',
            headers,
          });

          if (!betsResponse) {
            console.error('❌ [Lv2AutoSync] OroPlay 베팅 동기화 실패: 최대 재시도 횟수 초과');
          } else if (!betsResponse.ok) {
            const errorText = await betsResponse.text();
            console.error('❌ [Lv2AutoSync] OroPlay 베팅 동기화 실패:', betsResponse.status, errorText);
          } else {
            const betsData = await betsResponse.json();
            console.log('✅ [Lv2AutoSync] OroPlay 베팅 동기화 성공:', betsData);
          }
        }

        // 2. FamilyAPI 베팅 동기화
        if (activeApis.familyapi) {
          console.log('📞 [Lv2AutoSync] FamilyAPI 베팅 동기화 호출...');
          const familyBetsResponse = await fetchWithRetry(`${EDGE_FUNCTION_URL}/sync/familyapi-bets`, {
            method: 'POST',
            headers,
          });

          if (!familyBetsResponse) {
            console.error('❌ [Lv2AutoSync] FamilyAPI 베팅 동기화 실패: 최대 재시도 횟수 초과');
          } else if (!familyBetsResponse.ok) {
            const errorText = await familyBetsResponse.text();
            console.error('❌ [Lv2AutoSync] FamilyAPI 베팅 동기화 실패:', familyBetsResponse.status, errorText);
          } else {
            const familyBetsData = await familyBetsResponse.json();
            console.log('✅ [Lv2AutoSync] FamilyAPI 베팅 동기화 성공:', familyBetsData);
          }
        }

        // 3. Lv2 보유금 동기화
        console.log('📞 [Lv2AutoSync] Lv2 보유금 동기화 호출...');
        const balanceResponse = await fetchWithRetry(`${EDGE_FUNCTION_URL}/sync/lv2-balances`, {
          method: 'POST',
          headers,
        });

        if (!balanceResponse) {
          console.error('❌ [Lv2AutoSync] 보유금 동기화 실패: 최대 재시도 횟수 초과');
        } else if (!balanceResponse.ok) {
          const errorText = await balanceResponse.text();
          console.error('❌ [Lv2AutoSync] 보유금 동기화 실패:', balanceResponse.status, errorText);
        } else {
          const balanceData = await balanceResponse.json();
          console.log('✅ [Lv2AutoSync] 보유금 동기화 성공:', balanceData);
        }

        // 동기화 성공 시 시간 업데이트
        setLastSyncTime(new Date());
        console.log(`✅ [Lv2AutoSync #${syncCountRef.current}] 동기화 완료`);

      } catch (error: any) {
        console.error('❌ [Lv2AutoSync] 동기화 오류:', error);
      }
    };

    // 즉시 첫 동기화 실행
    if (activeApis.invest) {
      runInvestBettingSync();
    }
    runFastSync();

    // Invest 베팅 동기화: 30초마다 실행
    if (activeApis.invest) {
      investIntervalRef.current = window.setInterval(() => {
        runInvestBettingSync();
      }, 30000);
    }

    // OroPlay, FamilyAPI 베팅 + 보유금 동기화: 4초마다 실행
    balanceIntervalRef.current = window.setInterval(() => {
      runFastSync();
    }, 4000);

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
    };
  }, [user.level, user.id, user.parent_id, activeApis]);

  // UI는 렌더링하지 않음 (백그라운드 동작)
  return null;
}