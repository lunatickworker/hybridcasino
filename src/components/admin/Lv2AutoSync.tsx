import { useEffect, useRef, useState } from "react";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { publicAnonKey } from "../../utils/supabase";

interface Lv2AutoSyncProps {
  user: Partner;
}

/**
 * Lv2 관리자 전용 자동 동기화 컴포넌트
 * - 페이지 오픈 시 4초마다 자동으로 Edge Function 호출
 * - OroPlay 베팅 동기화
 * - Lv2 보유금 동기화
 */
export function Lv2AutoSync({ user }: Lv2AutoSyncProps) {
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncCountRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Lv2가 아니면 실행하지 않음
    if (user.level !== 2) {
      console.log('⚠️ [Lv2AutoSync] Lv2가 아니므로 자동 동기화를 실행하지 않습니다.');
      return;
    }

    console.log('🔄 [Lv2AutoSync] 자동 동기화 시작 (4초 간격)');

    // ✅ Edge Function URL 하드코딩
    const EDGE_FUNCTION_URL = 'https://hduofjzsitoaujyjvuix.supabase.co/functions/v1/server';

    // 동기화 실행 함수
    const runSync = async () => {
      try {
        syncCountRef.current += 1;
        console.log(`🔄 [Lv2AutoSync] 동기화 실행 중... (${syncCountRef.current}번째)`);

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        };

        // 1. OroPlay 베팅 동기화
        console.log(`📡 [Lv2AutoSync] 베팅 동기화 요청`);
        const betsResponse = await fetch(`${EDGE_FUNCTION_URL}/sync/oroplay-bets`, {
          method: 'POST',
          headers,
        });

        if (betsResponse.ok) {
          const betsResult = await betsResponse.json();
          console.log('✅ [Lv2AutoSync] 베팅 동기화 완료:', betsResult);
        } else {
          const errorText = await betsResponse.text();
          console.error('❌ [Lv2AutoSync] 베팅 동기화 실패:', betsResponse.status, errorText);
        }

        // 2. Lv2 보유금 동기화
        console.log(`📡 [Lv2AutoSync] 보유금 동기화 요청`);
        const balanceResponse = await fetch(`${EDGE_FUNCTION_URL}/sync/lv2-balances`, {
          method: 'POST',
          headers,
        });

        if (balanceResponse.ok) {
          const balanceResult = await balanceResponse.json();
          console.log('✅ [Lv2AutoSync] 보유금 동기화 완료:', balanceResult);
        } else {
          const errorText = await balanceResponse.text();
          console.error('❌ [Lv2AutoSync] 보유금 동기화 실패:', balanceResponse.status, errorText);
        }

        // 동기화 성공 시 시간 업데이트
        setLastSyncTime(new Date());

      } catch (error: any) {
        console.error('❌ [Lv2AutoSync] 동기화 오류:', error);
      }
    };

    // 즉시 첫 동기화 실행
    console.log('⚡ [Lv2AutoSync] 첫 동기화 즉시 실행');
    runSync();

    // 4초마다 동기화 실행
    intervalRef.current = window.setInterval(() => {
      runSync();
    }, 4000);

    console.log('✅ [Lv2AutoSync] 타이머 설정 완료 (4초 간격)');

    // 클린업
    return () => {
      if (intervalRef.current) {
        console.log('🛑 [Lv2AutoSync] 자동 동기화 중지');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user.level, user.id, user.parent_id]);

  // UI는 렌더링하지 않음 (백그라운드 동작)
  return null;
}