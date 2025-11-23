import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getApiUsageSettings } from '../lib/apiConfigHelper';

export function useApiSettings() {
  const [useInvestApi, setUseInvestApi] = useState(true);
  const [useOroplayApi, setUseOroplayApi] = useState(true);
  const [loading, setLoading] = useState(true);

  const loadApiSettings = async () => {
    try {
      setLoading(true);

      // Lv1 시스템관리자 조회
      const { data: lv1Config, error: lv1Error } = await supabase
        .from('partners')
        .select('id')
        .eq('level', 1)
        .limit(1)
        .maybeSingle();

      if (lv1Error || !lv1Config) {
        console.error('❌ [useApiSettings] Lv1 조회 실패:', lv1Error);
        setUseInvestApi(true);
        setUseOroplayApi(true);
        return;
      }

      // API 설정 조회 (헬퍼 함수 사용)
      const settings = await getApiUsageSettings(lv1Config.id);

      console.log('✅ [useApiSettings] API 설정 로드 완료:', settings);

      setUseInvestApi(settings.useInvestApi);
      setUseOroplayApi(settings.useOroplayApi);
    } catch (err) {
      console.error('❌ [useApiSettings] 설정 로드 오류:', err);
      setUseInvestApi(true);
      setUseOroplayApi(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApiSettings();
  }, []);

  return {
    useInvestApi,
    useOroplayApi,
    loading,
    reload: loadApiSettings,
  };
}