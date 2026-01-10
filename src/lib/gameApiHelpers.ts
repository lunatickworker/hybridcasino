/**
 * gameApi.ts 최적화 헬퍼 함수
 * ⚡ WITH RECURSIVE 쿼리로 파트너 조회 최적화
 */

import { supabase } from './supabase';

/**
 * referrer_id를 따라 최상위(Lv1) 파트너 ID를 찾는 함수
 * ⚡ WITH RECURSIVE 쿼리로 최적화 (6번 조회 → 1번 조회)
 */
export async function getTopLevelPartnerId(partnerId: string): Promise<string | null> {
  try {
    // ⚡ PostgreSQL RPC 함수 호출 (단일 쿼리)
    const { data, error } = await supabase.rpc('get_top_level_partner', {
      start_partner_id: partnerId
    });
    
    if (error) {
      console.error('❌ [getTopLevelPartnerId] RPC 호출 실패:', error);
      
      // ⚠️ RPC 함수가 없으면 fallback (기존 재귀 방식)
      if (error.message?.includes('function') || error.code === '42883') {
        console.warn('⚠️ [getTopLevelPartnerId] RPC 함수 없음 - fallback 사용');
        return await getTopLevelPartnerIdFallback(partnerId);
      }
      
      return null;
    }
    
    if (data && typeof data === 'string') {
      console.log('✅ [getTopLevelPartnerId] 최상위 파트너 조회 완료 (단일 쿼리):', data);
      return data;
    }
    
    console.error('❌ [getTopLevelPartnerId] 유효하지 않은 응답:', data);
    return null;
    
  } catch (error) {
    console.error('❌ [getTopLevelPartnerId] 오류:', error);
    return null;
  }
}

/**
 * ⚠️ Fallback: RPC 함수가 없을 때 사용하는 재귀 방식 (레거시)
 */
async function getTopLevelPartnerIdFallback(partnerId: string): Promise<string | null> {
  const maxRetries = 3;
  const retryDelay = 1000;
  
  try {
    let currentPartnerId = partnerId;
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      let partner = null;
      let error = null;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await supabase
            .from('partners')
            .select('id, parent_id, level, username')
            .eq('id', currentPartnerId)
            .single();
          
          partner = result.data;
          error = result.error;
          
          if (!error && partner) {
            break;
          }
          
          if (attempt < maxRetries) {
            console.warn(`⚠️ 파트너 조회 재시도 ${attempt + 1}/${maxRetries}:`, error?.message);
            await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          }
        } catch (fetchError) {
          console.error(`❌ 파트너 조회 네트워크 오류 (시도 ${attempt + 1}):`, fetchError);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          } else {
            error = fetchError;
          }
        }
      }

      if (error || !partner) {
        console.error('❌ 파트너 조회 실패 (모든 재시도 완료):', {
          message: error?.message || 'Unknown error',
          details: JSON.stringify(error),
          hint: error?.hint,
          code: error?.code
        });
        return null;
      }

      console.log(`🔍 파트너 조회 [${iterations}]:`, {
        id: partner.id,
        username: partner.username,
        level: partner.level,
        parent_id: partner.parent_id
      });

      if (partner.level === 1 || !partner.parent_id) {
        console.log('✅ 최상위 파트너 발견 (Lv1):', partner.username);
        return partner.id;
      }

      currentPartnerId = partner.parent_id;
      iterations++;
    }

    console.error('❌ 최대 반복 횟수 초과');
    return null;
  } catch (error) {
    console.error('❌ getTopLevelPartnerIdFallback 오류:', error);
    return null;
  }
}
