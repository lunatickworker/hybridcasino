/**
 * useApiStatus Hook
 * - 특정 파트너의 API 상태를 실시간으로 구독
 * - 컴포넌트에서 쉽게 사용 가능
 */

import { useEffect, useState } from 'react';
import { apiStateManager, ApiStatus } from '../lib/apiStateManager';

export function useApiStatus(partnerId: string | null | undefined) {
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    invest: false,
    oroplay: false,
    familyapi: false,
    honorapi: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Realtime 구독 시작
      const unsubscribe = apiStateManager.watchApiStatus(partnerId, (status) => {
        setApiStatus(status);
        setLoading(false);
        console.log(
          `✅ [useApiStatus] API 상태 업데이트 (partnerId=${partnerId}):`,
          status
        );
      });

      // 클린업
      return () => {
        unsubscribe();
      };
    } catch (err: any) {
      setError(err?.message || 'API 상태 조회 실패');
      setLoading(false);
    }
  }, [partnerId]);

  return { apiStatus, loading, error };
}
