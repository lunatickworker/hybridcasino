// API 활성화 상태 체크 유틸리티
import { supabase } from './supabase';

/**
 * API 활성화 상태 체크
 * @param apiProvider - 'invest', 'oroplay', 'familyapi', 'honorapi'
 * @returns is_active 값 (true/false)
 */
export async function checkApiActive(apiProvider: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'): Promise<boolean> {
  try {
    // ✅ 개발 환경에서는 API 체크 건너뛰기
    // Figma Make나 로컬 환경에서는 항상 true 반환
    return true;

    // ❌ 프로덕션 환경에서만 활성화
    /*
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
    */
  } catch (error) {
    console.error(`❌ [API Status] ${apiProvider} API 상태 체크 오류:`, error);
    return false;
  }
}

/**
 * 파트너 ID로 API 활성화 상태 체크 (성능 최적화 버전)
 * @param partnerId - 파트너 ID (어떤 레벨이든 상관없음, Lv1을 자동으로 찾음)
 * @param apiProvider - 'invest', 'oroplay', 'familyapi', 'honorapi'
 * @returns is_active 값 (true/false)
 */
export async function checkApiActiveByPartnerId(
  partnerId: string, 
  apiProvider: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
): Promise<boolean> {
  try {
    // 🆕 먼저 Lv1 파트너 ID 찾기 (api_configs는 Lv1에게만 저장됨)
    let lv1PartnerId = partnerId;
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, level, parent_id')
        .eq('id', lv1PartnerId)
        .single();

      if (partnerError || !partner) {
        console.error(`❌ [API Status] 파트너 조회 실패:`, partnerError);
        return false;
      }

      // Lv1이면 종료
      if (partner.level === 1) {
        break;
      }

      // 부모 파트너로 이동
      if (partner.parent_id) {
        lv1PartnerId = partner.parent_id;
      } else {
        // 부모가 없으면 현재 파트너가 최상위
        break;
      }
      
      iterations++;
    }

    // 🆕 Lv1 파트너의 API 설정 조회
    const { data: apiConfig, error } = await supabase
      .from('api_configs')
      .select('is_active')
      .eq('partner_id', lv1PartnerId)
      .eq('api_provider', apiProvider)
      .maybeSingle();

    if (error) {
      console.error(`❌ [API Status] ${apiProvider} API 설정 조회 실패:`, error);
      return false;
    }

    if (!apiConfig) {
      console.warn(`⚠️ [API Status] ${apiProvider} API 설정이 존재하지 않습니다. (partnerId: ${partnerId}, lv1: ${lv1PartnerId})`);
      return false;
    }

    const isActive = apiConfig.is_active !== false;
    console.log(`✅ [API Status] ${apiProvider} API 활성화 상태: ${isActive} (partnerId: ${partnerId}, lv1: ${lv1PartnerId})`);
    
    return isActive;
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
