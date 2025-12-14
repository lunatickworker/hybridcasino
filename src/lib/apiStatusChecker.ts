// API 활성화 상태 체크 유틸리티
import { supabase } from './supabase';

/**
 * API 활성화 상태 체크
 * @param apiProvider - 'invest', 'oroplay', 'familyapi'
 * @returns is_active 값 (true/false)
 */
export async function checkApiActive(apiProvider: 'invest' | 'oroplay' | 'familyapi'): Promise<boolean> {
  try {
    // Lv1 파트너 ID 찾기
    const { data: lv1Partner, error: lv1Error } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 1)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (lv1Error || !lv1Partner) {
      console.error(`❌ [API Status] Lv1 파트너를 찾을 수 없습니다:`, lv1Error);
      return false;
    }

    // api_configs에서 활성화 상태 조회
    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('is_active')
      .eq('partner_id', lv1Partner.id)
      .eq('api_provider', apiProvider)
      .maybeSingle();

    if (configError) {
      console.error(`❌ [API Status] ${apiProvider} API 설정 조회 실패:`, configError);
      return false;
    }

    if (!apiConfig) {
      console.warn(`⚠️ [API Status] ${apiProvider} API 설정이 존재하지 않습니다.`);
      return false;
    }

    const isActive = apiConfig.is_active !== false; // 기본값 true
    console.log(`✅ [API Status] ${apiProvider} API 활성화 상태:`, isActive);
    
    return isActive;
  } catch (error) {
    console.error(`❌ [API Status] ${apiProvider} API 상태 체크 오류:`, error);
    return false;
  }
}

/**
 * 파트너 ID로 API 활성화 상태 체크 (성능 최적화 버전)
 * @param partnerId - 파트너 ID (보통 Lv1)
 * @param apiProvider - 'invest', 'oroplay', 'familyapi'
 * @returns is_active 값 (true/false)
 */
export async function checkApiActiveByPartnerId(
  partnerId: string, 
  apiProvider: 'invest' | 'oroplay' | 'familyapi'
): Promise<boolean> {
  try {
    const { data: apiConfig, error } = await supabase
      .from('api_configs')
      .select('is_active')
      .eq('partner_id', partnerId)
      .eq('api_provider', apiProvider)
      .maybeSingle();

    if (error) {
      console.error(`❌ [API Status] ${apiProvider} API 설정 조회 실패:`, error);
      return false;
    }

    if (!apiConfig) {
      console.warn(`⚠️ [API Status] ${apiProvider} API 설정이 존재하지 않습니다.`);
      return false;
    }

    return apiConfig.is_active !== false; // 기본값 true
  } catch (error) {
    console.error(`❌ [API Status] ${apiProvider} API 상태 체크 오류:`, error);
    return false;
  }
}

/**
 * 모든 API 활성화 상태를 한 번에 조회 (성능 최적화)
 * @returns { invest: boolean, oroplay: boolean, familyapi: boolean }
 */
export async function checkAllApiStatus(): Promise<{
  invest: boolean;
  oroplay: boolean;
  familyapi: boolean;
}> {
  try {
    // Lv1 파트너 ID 찾기
    const { data: lv1Partner, error: lv1Error } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 1)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (lv1Error || !lv1Partner) {
      console.error(`❌ [API Status] Lv1 파트너를 찾을 수 없습니다:`, lv1Error);
      return { invest: false, oroplay: false, familyapi: false };
    }

    // 모든 API 설정 한 번에 조회
    const { data: apiConfigs, error: configError } = await supabase
      .from('api_configs')
      .select('api_provider, is_active')
      .eq('partner_id', lv1Partner.id)
      .in('api_provider', ['invest', 'oroplay', 'familyapi']);

    if (configError) {
      console.error(`❌ [API Status] API 설정 조회 실패:`, configError);
      return { invest: false, oroplay: false, familyapi: false };
    }

    // 기본값 설정
    const result = {
      invest: false,
      oroplay: false,
      familyapi: false
    };

    // 조회 결과 적용
    apiConfigs?.forEach(config => {
      const provider = config.api_provider as 'invest' | 'oroplay' | 'familyapi';
      result[provider] = config.is_active !== false; // 기본값 true
    });

    console.log(`✅ [API Status] 전체 API 활성화 상태:`, result);
    
    return result;
  } catch (error) {
    console.error(`❌ [API Status] 전체 API 상태 체크 오류:`, error);
    return { invest: false, oroplay: false, familyapi: false };
  }
}
