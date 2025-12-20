import { supabase } from './supabase';

/**
 * API Config 헬퍼 함수
 * 테이블 구조: partner_id + api_provider 조합으로 각 API별 1개 행
 * JSONB 없이 각 컬럼 직접 사용
 */

/**
 * Invest Credentials 타입
 */
export interface InvestCredentials {
  opcode: string;
  secret_key: string;
  token: string;
}

/**
 * OroPlay Credentials 타입
 */
export interface OroplayCredentials {
  client_id: string;
  client_secret: string;
  token: string;
  token_expires_at: string | null;
}

/**
 * FamilyAPI Credentials 타입
 */
export interface FamilyApiCredentials {
  api_key: string;
  token: string;
  token_expires_at: string | null;
}

/**
 * HonorAPI Credentials 타입
 */
export interface HonorApiCredentials {
  api_key: string;
}

/**
 * Invest API credentials 조회
 * @param partnerId - 파트너 ID
 * @returns Invest credentials
 */
export async function getInvestCredentials(partnerId: string): Promise<InvestCredentials> {
  try {
    const { data, error } = await supabase
      .from('api_configs')
      .select('opcode, secret_key, token')
      .eq('partner_id', partnerId)
      .eq('api_provider', 'invest')
      .maybeSingle();

    if (error) {
      console.error('❌ [API Config] Invest credentials 조회 실패:', error);
      return { opcode: '', secret_key: '', token: '' };
    }

    if (!data) {
      console.warn('⚠️ [API Config] Invest 레코드 없음:', partnerId);
      return { opcode: '', secret_key: '', token: '' };
    }

    return {
      opcode: data.opcode || '',
      secret_key: data.secret_key || '',
      token: data.token || ''
    };
  } catch (err) {
    console.error('❌ [API Config] Invest credentials 조회 예외:', err);
    return { opcode: '', secret_key: '', token: '' };
  }
}

/**
 * OroPlay API credentials 조회
 * @param partnerId - 파트너 ID
 * @returns OroPlay credentials
 */
export async function getOroplayCredentials(partnerId: string): Promise<OroplayCredentials> {
  try {
    const { data, error } = await supabase
      .from('api_configs')
      .select('client_id, client_secret, token, token_expires_at')
      .eq('partner_id', partnerId)
      .eq('api_provider', 'oroplay')
      .maybeSingle();

    if (error) {
      console.error('❌ [API Config] OroPlay credentials 조회 실패:', error);
      return { client_id: '', client_secret: '', token: '', token_expires_at: null };
    }

    if (!data) {
      console.warn('⚠️ [API Config] OroPlay 레코드 없음:', partnerId);
      return { client_id: '', client_secret: '', token: '', token_expires_at: null };
    }

    return {
      client_id: data.client_id || '',
      client_secret: data.client_secret || '',
      token: data.token || '',
      token_expires_at: data.token_expires_at || null
    };
  } catch (err) {
    console.error('❌ [API Config] OroPlay credentials 조회 예외:', err);
    return { client_id: '', client_secret: '', token: '', token_expires_at: null };
  }
}

/**
 * Lv1 시스템관리자의 Invest credentials 조회
 * @param partnerId - 현재 파트너 ID (Lv1까지 자동으로 탐색)
 * @returns Lv1의 Invest credentials
 */
export async function getLv1InvestCredentials(partnerId: string): Promise<InvestCredentials> {
  try {
    // Lv1 파트너 찾기
    const { data: lv1Partner, error: lv1Error } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 1)
      .limit(1)
      .maybeSingle();

    if (lv1Error || !lv1Partner) {
      console.error('❌ [API Config] Lv1 파트너 조회 실패:', lv1Error);
      return { opcode: '', secret_key: '', token: '' };
    }

    return getInvestCredentials(lv1Partner.id);
  } catch (err) {
    console.error('❌ [API Config] Lv1 Invest credentials 조회 예외:', err);
    return { opcode: '', secret_key: '', token: '' };
  }
}

/**
 * Lv1 시스템관리자의 OroPlay credentials 조회
 * @param partnerId - 현재 파트너 ID (Lv1까지 자동으로 탐색)
 * @returns Lv1의 OroPlay credentials
 */
export async function getLv1OroplayCredentials(partnerId: string): Promise<OroplayCredentials> {
  try {
    // Lv1 파트너 찾기
    const { data: lv1Partner, error: lv1Error } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 1)
      .limit(1)
      .maybeSingle();

    if (lv1Error || !lv1Partner) {
      console.error('❌ [API Config] Lv1 파트너 조회 실패:', lv1Error);
      return { client_id: '', client_secret: '', token: '', token_expires_at: null };
    }

    return getOroplayCredentials(lv1Partner.id);
  } catch (err) {
    console.error('❌ [API Config] Lv1 OroPlay credentials 조회 예외:', err);
    return { client_id: '', client_secret: '', token: '', token_expires_at: null };
  }
}

/**
 * FamilyAPI credentials 조회
 * @param partnerId - 파트너 ID
 * @returns FamilyAPI credentials
 */
export async function getFamilyApiCredentials(partnerId: string): Promise<FamilyApiCredentials> {
  try {
    const { data, error } = await supabase
      .from('api_configs')
      .select('api_key, token, token_expires_at')
      .eq('partner_id', partnerId)
      .eq('api_provider', 'familyapi')
      .maybeSingle();

    if (error) {
      console.error('❌ [API Config] FamilyAPI credentials 조회 실패:', error);
      return { api_key: '', token: '', token_expires_at: null };
    }

    if (!data) {
      console.warn('⚠️ [API Config] FamilyAPI 레코드 없음:', partnerId);
      return { api_key: '', token: '', token_expires_at: null };
    }

    return {
      api_key: data.api_key || '',
      token: data.token || '',
      token_expires_at: data.token_expires_at || null
    };
  } catch (err) {
    console.error('❌ [API Config] FamilyAPI credentials 조회 예외:', err);
    return { api_key: '', token: '', token_expires_at: null };
  }
}

/**
 * Lv1 시스템관리자의 FamilyAPI credentials 조회
 * @param partnerId - 현재 파트너 ID (Lv1까지 자동으로 탐색)
 * @returns Lv1의 FamilyAPI credentials
 */
export async function getLv1FamilyApiCredentials(partnerId: string): Promise<FamilyApiCredentials> {
  try {
    // Lv1 파트너 찾기
    const { data: lv1Partner, error: lv1Error } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 1)
      .limit(1)
      .maybeSingle();

    if (lv1Error || !lv1Partner) {
      console.error('❌ [API Config] Lv1 파트너 조회 실패:', lv1Error);
      return { api_key: '', token: '', token_expires_at: null };
    }

    return getFamilyApiCredentials(lv1Partner.id);
  } catch (err) {
    console.error('❌ [API Config] Lv1 FamilyAPI credentials 조회 예외:', err);
    return { api_key: '', token: '', token_expires_at: null };
  }
}

/**
 * HonorAPI credentials 조회
 * @param partnerId - 파트너 ID
 * @returns HonorAPI credentials
 */
export async function getHonorApiCredentials(partnerId: string): Promise<HonorApiCredentials> {
  try {
    const { data, error } = await supabase
      .from('api_configs')
      .select('api_key')
      .eq('partner_id', partnerId)
      .eq('api_provider', 'honorapi')
      .maybeSingle();

    if (error) {
      console.error('❌ [API Config] HonorAPI credentials 조회 실패:', error);
      return { api_key: '' };
    }

    if (!data) {
      console.warn('⚠️ [API Config] HonorAPI 레코드 없음:', partnerId);
      return { api_key: '' };
    }

    return {
      api_key: data.api_key || ''
    };
  } catch (err) {
    console.error('❌ [API Config] HonorAPI credentials 조회 예외:', err);
    return { api_key: '' };
  }
}

/**
 * Lv1 시스템관리자의 HonorAPI credentials 조회
 * @param partnerId - 현재 파트너 ID (Lv1까지 자동으로 탐색)
 * @returns Lv1의 HonorAPI credentials
 */
export async function getLv1HonorApiCredentials(partnerId: string): Promise<HonorApiCredentials> {
  try {
    // Lv1 파트너 찾기
    const { data: lv1Partner, error: lv1Error } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 1)
      .limit(1)
      .maybeSingle();

    if (lv1Error || !lv1Partner) {
      console.error('❌ [API Config] Lv1 파트너 조회 실패:', lv1Error);
      return { api_key: '' };
    }

    return getHonorApiCredentials(lv1Partner.id);
  } catch (err) {
    console.error('❌ [API Config] Lv1 HonorAPI credentials 조회 예외:', err);
    return { api_key: '' };
  }
}

/**
 * Invest 잔액 업데이트
 * @param partnerId - 파트너 ID
 * @param balance - 새 잔액
 * @returns 성공 여부
 */
export async function updateInvestBalance(partnerId: string, balance: number): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('api_configs')
      .update({
        balance: balance,
        updated_at: new Date().toISOString()
      })
      .eq('partner_id', partnerId)
      .eq('api_provider', 'invest');

    if (error) {
      console.error('❌ [API Config] Invest 잔액 업데이트 실패:', error);
      return false;
    }
    
    // ✅ Lv1 업데이트 시 Lv2도 동기화
    const { data: lv2Partners } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 2);
    
    if (lv2Partners && lv2Partners.length > 0) {
      for (const lv2 of lv2Partners) {
        await supabase
          .from('partners')
          .update({
            invest_balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('id', lv2.id);
      }
      console.log(`✅ [API Config] Lv2 invest_balance 동기화 완료: ${balance.toLocaleString()}`);
    }

    return true;
  } catch (err) {
    console.error('❌ [API Config] Invest 잔액 업데이트 예외:', err);
    return false;
  }
}

/**
 * OroPlay 잔액 업데이트
 * @param partnerId - 파트너 ID
 * @param balance - 새 잔액
 * @returns 성공 여부
 */
export async function updateOroplayBalance(partnerId: string, balance: number): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('api_configs')
      .update({
        balance: balance,
        updated_at: new Date().toISOString()
      })
      .eq('partner_id', partnerId)
      .eq('api_provider', 'oroplay');

    if (error) {
      console.error('❌ [API Config] OroPlay 잔액 업데이트 실패:', error);
      return false;
    }
    
    // ✅ Lv1 업데이트 시 Lv2도 동기화
    const { data: lv2Partners } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 2);
    
    if (lv2Partners && lv2Partners.length > 0) {
      for (const lv2 of lv2Partners) {
        await supabase
          .from('partners')
          .update({
            oroplay_balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('id', lv2.id);
      }
      console.log(`✅ [API Config] Lv2 oroplay_balance 동기화 완료: ${balance.toLocaleString()}`);
    }

    return true;
  } catch (err) {
    console.error('❌ [API Config] OroPlay 잔액 업데이트 예외:', err);
    return false;
  }
}

/**
 * 파트너의 Invest + OroPlay 잔액 동시 조회
 * @param partnerId - 파트너 ID
 * @returns { investBalance, oroplayBalance }
 */
export async function getPartnerBalances(partnerId: string): Promise<{ investBalance: number; oroplayBalance: number }> {
  try {
    const { data, error } = await supabase
      .from('api_configs')
      .select('api_provider, balance')
      .eq('partner_id', partnerId)
      .in('api_provider', ['invest', 'oroplay']);

    if (error) {
      console.error('❌ [API Config] 잔액 조회 실패:', error);
      return { investBalance: 0, oroplayBalance: 0 };
    }

    if (!data || data.length === 0) {
      console.warn('⚠️ [API Config] 잔액 레코드 없음:', partnerId);
      return { investBalance: 0, oroplayBalance: 0 };
    }

    const investData = data.find((row: any) => row.api_provider === 'invest');
    const oroplayData = data.find((row: any) => row.api_provider === 'oroplay');

    return {
      investBalance: investData?.balance || 0,
      oroplayBalance: oroplayData?.balance || 0
    };
  } catch (err) {
    console.error('❌ [API Config] 잔액 조회 예외:', err);
    return { investBalance: 0, oroplayBalance: 0 };
  }
}

/**
 * API 사용 여부 조회
 * @param partnerId - 파트너 ID
 * @returns { useInvestApi, useOroplayApi, useFamilyApi }
 */
export async function getApiUsageSettings(partnerId: string): Promise<{ useInvestApi: boolean; useOroplayApi: boolean; useFamilyApi: boolean }> {
  try {
    const { data, error } = await supabase
      .from('api_configs')
      .select('api_provider, is_active')
      .eq('partner_id', partnerId)
      .in('api_provider', ['invest', 'oroplay', 'familyapi']);

    if (error) {
      console.error('❌ [API Config] API 사용 설정 조회 실패:', error);
      return { useInvestApi: true, useOroplayApi: true, useFamilyApi: true };
    }

    if (!data || data.length === 0) {
      console.warn('⚠️ [API Config] API 설정 레코드 없음:', partnerId);
      return { useInvestApi: true, useOroplayApi: true, useFamilyApi: true };
    }

    const investData = data.find((row: any) => row.api_provider === 'invest');
    const oroplayData = data.find((row: any) => row.api_provider === 'oroplay');
    const familyData = data.find((row: any) => row.api_provider === 'familyapi');

    return {
      useInvestApi: investData?.is_active !== false,
      useOroplayApi: oroplayData?.is_active !== false,
      useFamilyApi: familyData?.is_active !== false
    };
  } catch (err) {
    console.error('❌ [API Config] API 사용 설정 조회 예외:', err);
    return { useInvestApi: true, useOroplayApi: true, useFamilyApi: true };
  }
}

/**
 * Invest Token 업데이트
 * @param partnerId - 파트너 ID
 * @param token - 새 토큰
 * @returns 성공 여부
 */
export async function updateInvestToken(partnerId: string, token: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('api_configs')
      .update({
        token: token,
        updated_at: new Date().toISOString()
      })
      .eq('partner_id', partnerId)
      .eq('api_provider', 'invest');

    if (error) {
      console.error('❌ [API Config] Invest token 업데이트 실패:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('❌ [API Config] Invest token 업데이트 예외:', err);
    return false;
  }
}

/**
 * OroPlay Token 업데이트
 * @param partnerId - 파트너 ID
 * @param token - 새 토큰
 * @param expiresAt - 만료 시간
 * @returns 성공 여부
 */
export async function updateOroplayToken(partnerId: string, token: string, expiresAt?: string): Promise<boolean> {
  try {
    const updateData: any = {
      token: token,
      updated_at: new Date().toISOString()
    };

    if (expiresAt) {
      updateData.token_expires_at = expiresAt;
    }

    const { error } = await supabase
      .from('api_configs')
      .update(updateData)
      .eq('partner_id', partnerId)
      .eq('api_provider', 'oroplay');

    if (error) {
      console.error('❌ [API Config] OroPlay token 업데이트 실패:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('❌ [API Config] OroPlay token 업데이트 예외:', err);
    return false;
  }
}

/**
 * HonorAPI 잔액 업데이트
 * @param partnerId - 파트너 ID
 * @param balance - 새 잔액
 * @returns 성공 여부
 */
export async function updateHonorApiBalance(partnerId: string, balance: number): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('api_configs')
      .update({
        balance: balance,
        updated_at: new Date().toISOString()
      })
      .eq('partner_id', partnerId)
      .eq('api_provider', 'honorapi');

    if (error) {
      console.error('❌ [API Config] HonorAPI 잔액 업데이트 실패:', error);
      return false;
    }
    
    // ✅ Lv1 업데이트 시 Lv2도 동기화
    const { data: lv2Partners } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 2);
    
    if (lv2Partners && lv2Partners.length > 0) {
      for (const lv2 of lv2Partners) {
        await supabase
          .from('partners')
          .update({
            honorapi_balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('id', lv2.id);
      }
      console.log(`✅ [API Config] Lv2 honorapi_balance 동기화 완료: ${balance.toLocaleString()}`);
    }

    return true;
  } catch (err) {
    console.error('❌ [API Config] HonorAPI 잔액 업데이트 예외:', err);
    return false;
  }
}