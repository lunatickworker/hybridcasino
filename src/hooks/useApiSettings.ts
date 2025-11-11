import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface ApiSettings {
  useInvestApi: boolean;
  useOroplayApi: boolean;
  loading: boolean;
}

/**
 * API 활성화 설정을 조회하는 Hook
 * - BalanceProvider 없이도 사용 가능
 * - Lv1 시스템관리자의 API 설정을 조회
 */
export function useApiSettings(): ApiSettings {
  const [useInvestApi, setUseInvestApi] = useState<boolean>(true);
  const [useOroplayApi, setUseOroplayApi] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadApiSettings();
  }, []);

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

      if (lv1Error) {
        console.error('❌ [useApiSettings] Lv1 조회 실패:', lv1Error);
        setUseInvestApi(true);
        setUseOroplayApi(true);
        return;
      }

      if (!lv1Config) {
        console.warn('⚠️ [useApiSettings] Lv1 시스템관리자 없음 - 기본값 사용');
        setUseInvestApi(true);
        setUseOroplayApi(true);
        return;
      }

      // API 설정 조회
      const { data: apiConfig, error: apiError } = await supabase
        .from('api_configs')
        .select('use_invest_api, use_oroplay_api')
        .eq('partner_id', lv1Config.id)
        .maybeSingle();

      if (apiError) {
        console.error('❌ [useApiSettings] api_configs 조회 실패:', apiError);
        setUseInvestApi(true);
        setUseOroplayApi(true);
        return;
      }

      if (apiConfig) {
        const investEnabled = apiConfig.use_invest_api !== false; // 기본값 true
        const oroplayEnabled = apiConfig.use_oroplay_api !== false; // 기본값 true

        console.log('✅ [useApiSettings] API 설정 로드 완료:', {
          use_invest_api: investEnabled,
          use_oroplay_api: oroplayEnabled
        });

        setUseInvestApi(investEnabled);
        setUseOroplayApi(oroplayEnabled);
      } else {
        console.log('ℹ️ [useApiSettings] api_configs 레코드 없음 - 기본값 사용');
        setUseInvestApi(true);
        setUseOroplayApi(true);
      }
    } catch (err) {
      console.error('❌ [useApiSettings] 설정 로드 오류:', err);
      setUseInvestApi(true);
      setUseOroplayApi(true);
    } finally {
      setLoading(false);
    }
  };

  return {
    useInvestApi,
    useOroplayApi,
    loading
  };
}
