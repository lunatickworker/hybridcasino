/**
 * API 계정 관리 시스템
 * 
 * 관리자 승인 시 외부 API 계정 생성 (동기 처리)
 * 백그라운드 로직 제거 - 직접 호출 방식으로 변경
 */

import { supabase } from './supabase';
import * as investApi from './investApi';
import * as oroplayApi from './oroplayApi';

export type ApiAccountStatus = 'pending' | 'active' | 'error' | 'partial';

interface ApiAccountResult {
  status: ApiAccountStatus;
  investCreated: boolean;
  oroplayCreated: boolean;
  errorMessage?: string;
}

/**
 * 외부 API 계정 생성 (Invest + OroPlay)
 * 관리자 승인 시 직접 동기 호출
 * 
 * @param userId 사용자 ID
 * @param username 사용자명
 * @param partnerId 파트너 ID
 * @param toastId 토스트 ID (선택)
 */
export async function createApiAccounts(
  userId: string,
  username: string,
  partnerId: string,
  toastId?: string
): Promise<ApiAccountResult> {
  console.log('🔧 [API-ACCOUNT] 외부 API 계정 생성 시작:', { userId, username, partnerId });
  
  // toast 동적 임포트
  const { toast } = await import('sonner@2.0.3');
  
  let investCreated = false;
  let oroplayCreated = false;
  let errorMessages: string[] = [];
  
  // 1. Invest API 계정 생성
  if (toastId) {
    toast.loading(`[3/5] Invest API 계정 생성 중... (${username})`, { id: toastId });
  }
  console.log('🔵 [API-ACCOUNT] Invest API 계정 생성 시작');
  
  try {
    const investResult = await createInvestAccount(username, partnerId);
    if (investResult.success) {
      investCreated = true;
      console.log('✅ [API-ACCOUNT] Invest API 계정 생성 성공');
      if (toastId) {
        toast.loading(`[3/5] Invest ✅ → OroPlay API 계정 생성 중... (${username})`, { id: toastId });
      }
    } else {
      errorMessages.push(`Invest: ${investResult.error}`);
      console.error('❌ [API-ACCOUNT] Invest API 계정 생성 실패:', investResult.error);
      if (toastId) {
        toast.loading(`[3/5] Invest ❌ (${investResult.error}) → OroPlay API 계정 생성 중...`, { id: toastId });
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '알 수 없는 오류';
    errorMessages.push(`Invest: ${errMsg}`);
    console.error('❌ [API-ACCOUNT] Invest API 계정 생성 예외:', error);
    if (toastId) {
      toast.loading(`[3/5] Invest ❌ (${errMsg}) → OroPlay API 계정 생성 중...`, { id: toastId });
    }
  }
  
  // 2. OroPlay API 계정 생성
  if (toastId) {
    toast.loading(`[4/5] OroPlay API 계정 생성 중... (${username})`, { id: toastId });
  }
  console.log('🔷 [API-ACCOUNT] OroPlay API 계정 생성 시작');
  
  try {
    const oroplayResult = await createOroPlayAccount(username, partnerId);
    console.log('🔍 [API-ACCOUNT] OroPlay 생성 결과:', oroplayResult);
    if (oroplayResult.success) {
      oroplayCreated = true;
      console.log('✅ [API-ACCOUNT] OroPlay API 계정 생성 성공');
    } else {
      errorMessages.push(`OroPlay: ${oroplayResult.error}`);
      console.error('❌ [API-ACCOUNT] OroPlay API 계정 생성 실패:', oroplayResult.error);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '알 수 없는 오류';
    errorMessages.push(`OroPlay: ${errMsg}`);
    console.error('❌ [API-ACCOUNT] OroPlay API 계정 생성 예외:', error);
  }
  
  // 3. 상태 결정
  let status: ApiAccountStatus;
  if (investCreated && oroplayCreated) {
    status = 'active';
  } else if (investCreated || oroplayCreated) {
    status = 'partial';
  } else {
    status = 'error';
  }
  
  // 4. DB 업데이트
  const { error: updateError } = await supabase
    .from('users')
    .update({
      api_account_status: status,
      api_invest_created: investCreated,
      api_oroplay_created: oroplayCreated,
      api_error_message: errorMessages.length > 0 ? errorMessages.join('; ') : null,
      api_last_check_at: new Date().toISOString()
    })
    .eq('id', userId);
  
  if (updateError) {
    console.error('❌ [API-ACCOUNT] DB 업데이트 실패:', updateError);
  } else {
    console.log(`✅ [API-ACCOUNT] 계정 생성 완료 (상태: ${status})`);
  }
  
  return {
    status,
    investCreated,
    oroplayCreated,
    errorMessage: errorMessages.length > 0 ? errorMessages.join('; ') : undefined
  };
}

/**
 * Invest API 계정 생성 (api_configs 기반)
 */
async function createInvestAccount(
  username: string,
  partnerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. 대본사 ID 찾기
    const headOfficeId = await findHeadOfficeId(partnerId);
    
    // 2. api_configs에서 Invest API 설정 조회
    const { data: apiConfig } = await supabase
      .from('api_configs')
      .select('invest_opcode, invest_secret_key, invest_token')
      .eq('partner_id', headOfficeId)
      .single();
    
    if (!apiConfig?.invest_opcode || !apiConfig?.invest_secret_key) {
      return { success: false, error: 'Invest API 설정이 없습니다 (api_configs 확인 필요)' };
    }
    
    // 3. 계정 생성
    const result = await investApi.createAccount(
      apiConfig.invest_opcode,
      username,
      apiConfig.invest_secret_key
    );
    
    if (result && result.Result !== false) {
      return { success: true };
    } else {
      return { success: false, error: result?.Msg || '계정 생성 실패' };
    }
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '알 수 없는 오류' 
    };
  }
}

/**
 * OroPlay API 계정 생성 (간소화)
 * ✅ 계정 생성 시마다 **새로운 토큰**을 강제로 발급받습니다
 */
async function createOroPlayAccount(
  username: string,
  partnerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('  🔹 [OROPLAY] ========== 시작 ==========');
    console.log('  🔹 [OROPLAY] Username:', username);
    console.log('  🔹 [OROPLAY] Partner ID:', partnerId);
    
    console.log('  🔹 [OROPLAY] 1단계: 대본사 ID 찾기 시작');
    // 1. 대본사 ID 찾기
    const headOfficeId = await findHeadOfficeId(partnerId);
    console.log('  ✅ [OROPLAY] 대본사 ID 찾기 완료:', headOfficeId);
    
    console.log('  🔹 [OROPLAY] 2단계: API 설정 조회');
    // 2. API 설정 조회 (대본사 설정 우선)
    let { data: apiConfig } = await supabase
      .from('api_configs')
      .select('partner_id, oroplay_client_id, oroplay_client_secret')
      .eq('partner_id', headOfficeId)
      .single();
    
    // 2-1. 대본사 설정이 없으면 첫 번째 유효한 설정 사용 (폴백)
    if (!apiConfig?.oroplay_client_id || !apiConfig?.oroplay_client_secret) {
      console.log('  ⚠️ [OROPLAY] 대본사 설정 없음, 첫 번째 유효한 설정 조회');
      
      const { data: firstConfig } = await supabase
        .from('api_configs')
        .select('partner_id, oroplay_client_id, oroplay_client_secret')
        .not('oroplay_client_id', 'is', null)
        .not('oroplay_client_secret', 'is', null)
        .limit(1)
        .single();
      
      if (!firstConfig) {
        console.error('  ❌ [OROPLAY] OroPlay API 설정을 찾을 수 없습니다');
        console.error('  ❌ [OROPLAY] api_configs 테이블에 oroplay_client_id, oroplay_client_secret을 설정하세요');
        return { success: false, error: 'OroPlay API 설정을 찾을 수 없습니다. 시스템 관리자에게 문의하세요.' };
      }
      
      apiConfig = firstConfig;
      console.log('  ✅ [OROPLAY] 첫 번째 설정 사용 (partner_id:', apiConfig.partner_id, ')');
    } else {
      console.log('  ✅ [OROPLAY] API 설정 조회 성공 (대본사)');
    }
    
    console.log('  🔹 [OROPLAY] 3단계: 새로운 토큰 강제 발급 시작');
    // 3. 🔥 계정 생성 시마다 **새로운 토큰**을 강제로 발급
    // ✅ Rate Limit 없음 (oroplayapi.md: 토큰 발급은 5회/30초, 계정 생성 시 1회만 호출)
    const tokenData = await oroplayApi.createOroPlayToken(
      apiConfig.oroplay_client_id,
      apiConfig.oroplay_client_secret
    );
    
    const newToken = tokenData.token;
    console.log('  ✅ [OROPLAY] 새 토큰 발급 성공 (길이:', newToken.length, ')');
    console.log('  🔹 [OROPLAY] 토큰 앞부분:', newToken.substring(0, 30) + '...');
    
    console.log('  🔹 [OROPLAY] 4단계: DB에 새 토큰 저장');
    // 4. DB에 새 토큰 저장 (실제 설정이 있는 partner_id에 저장)
    await supabase
      .from('api_configs')
      .update({
        oroplay_token: newToken,
        oroplay_token_expires_at: new Date(tokenData.expiration * 1000).toISOString()
      })
      .eq('partner_id', apiConfig.partner_id);
    
    console.log('  ✅ [OROPLAY] DB 저장 완료 (partner_id:', apiConfig.partner_id, ')');
    
    console.log('  🔹 [OROPLAY] 5단계: OroPlay API createUser 호출 시작');
    console.log('  🔹 [OROPLAY] 호출 파라미터 - token:', newToken.substring(0, 20) + '...', ', username:', username);
    
    // 5. 계정 생성 (errorCode 1 = 이미 존재도 성공 처리됨)
    // ✅ Rate Limit 없음 (oroplayapi.md: /user/create는 Rate Limit 대상 아님)
    const result = await oroplayApi.createUser(newToken, username);
    console.log('  ✅ [OROPLAY] createUser 응답:', result);
    console.log('  ✅ [OROPLAY] 계정 생성 완료!');
    console.log('  🔹 [OROPLAY] ========== 완료 ==========');
    
    return { success: true };
    
  } catch (error) {
    console.error('  ❌ [OROPLAY] ========== 오류 발생 ==========');
    console.error('  ❌ [OROPLAY] 오류 타입:', error?.constructor?.name);
    console.error('  ❌ [OROPLAY] 오류 메시지:', error instanceof Error ? error.message : String(error));
    console.error('  ❌ [OROPLAY] 오류 스택:', error instanceof Error ? error.stack : 'No stack');
    console.error('  ❌ [OROPLAY] 전체 오류 객체:', JSON.stringify(error, null, 2));
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '알 수 없는 오류' 
    };
  }
}

/**
 * Lv1 시스템관리자 ID 찾기 (재귀 탐색)
 * ✅ api_configs는 Lv1에만 있으므로, 항상 Lv1까지 올라가야 함
 */
async function findHeadOfficeId(partnerId: string): Promise<string> {
  console.log('    🔸 [Lv1찾기] 시작 파트너 ID:', partnerId);
  
  const { data: partner } = await supabase
    .from('partners')
    .select('id, partner_type, parent_id')
    .eq('id', partnerId)
    .single();
  
  if (!partner) {
    console.error('    ❌ [Lv1찾기] 파트너 정보 없음');
    throw new Error('파트너 정보를 찾을 수 없습니다');
  }
  
  console.log('    🔍 [Lv1찾기] 파트너 타입:', partner.partner_type);
  
  // ✅ 시스템 관리자(Lv1)를 찾으면 바로 반환
  if (partner.partner_type === 'system_admin') {
    console.log('    ✅ [Lv1찾기] Lv1 시스템관리자 찾음:', partner.id);
    return partner.id;
  }
  
  // ✅ Lv2(대본사)인 경우, parent_id(Lv1)로 올라감
  if (partner.partner_type === 'head_office') {
    console.log('    🔼 [Lv1찾기] Lv2 대본사 발견, 상위 Lv1로 이동');
    if (!partner.parent_id) {
      throw new Error('Lv2 대본사의 상위 Lv1을 찾을 수 없습니다');
    }
    
    const { data: lv1Partner } = await supabase
      .from('partners')
      .select('id, partner_type')
      .eq('id', partner.parent_id)
      .single();
    
    if (lv1Partner?.partner_type === 'system_admin') {
      console.log('    ✅ [Lv1찾기] Lv1 시스템관리자 찾음:', lv1Partner.id);
      return lv1Partner.id;
    } else {
      throw new Error('Lv2의 상위 파트너가 Lv1이 아닙니다');
    }
  }
  
  // 상위 파트너 탐색 (Lv3~Lv7)
  if (partner.parent_id) {
    console.log('    🔼 [Lv1찾기] 상위 파트너 탐색 시작');
    let currentId = partner.parent_id;
    let attempts = 0;
    
    while (currentId && attempts < 10) {
      const { data: parentPartner } = await supabase
        .from('partners')
        .select('id, partner_type, parent_id')
        .eq('id', currentId)
        .single();
      
      console.log(`    🔍 [Lv1찾기] 시도 ${attempts + 1}: 타입=${parentPartner?.partner_type}`);
      
      // ✅ Lv1 시스템관리자를 찾으면 반환
      if (parentPartner?.partner_type === 'system_admin') {
        console.log('    ✅ [Lv1찾기] Lv1 시스템관리자 찾음:', parentPartner.id);
        return parentPartner.id;
      }
      
      // ✅ Lv2 대본사를 찾으면, 그 상위(Lv1)로 이동
      if (parentPartner?.partner_type === 'head_office') {
        console.log('    🔼 [Lv1찾기] Lv2 대본사 발견, 상위 Lv1로 이동');
        if (!parentPartner.parent_id) {
          throw new Error('Lv2 대본사의 상위 Lv1을 찾을 수 없습니다');
        }
        
        const { data: lv1Partner } = await supabase
          .from('partners')
          .select('id, partner_type')
          .eq('id', parentPartner.parent_id)
          .single();
        
        if (lv1Partner?.partner_type === 'system_admin') {
          console.log('    ✅ [Lv1찾기] Lv1 시스템관리자 찾음:', lv1Partner.id);
          return lv1Partner.id;
        } else {
          throw new Error('Lv2의 상위 파트너가 Lv1이 아닙니다');
        }
      }
      
      currentId = parentPartner?.parent_id || null;
      attempts++;
    }
  }
  
  console.error('    ❌ [Lv1찾기] Lv1 시스템관리자를 찾을 수 없음');
  throw new Error('상위 Lv1 시스템관리자를 찾을 수 없습니다');
}

/**
 * API 계정 재생성 시도 (관리자 수동 실행)
 */
export async function retryApiAccountCreation(userId: string): Promise<ApiAccountResult> {
  console.log('🔄 [API-ACCOUNT] 계정 재생성 시도:', userId);
  
  // 사용자 정보 조회
  const { data: user, error } = await supabase
    .from('users')
    .select('username, referrer_id')
    .eq('id', userId)
    .single();
  
  if (error || !user) {
    throw new Error('사용자를 찾을 수 없습니다');
  }
  
  // 계정 생성 실행
  return await createApiAccounts(userId, user.username, user.referrer_id);
}

/**
 * API 계정 상태 확인
 */
export async function checkApiAccountStatus(userId: string): Promise<{
  status: ApiAccountStatus;
  canPlayGames: boolean;
  message?: string;
}> {
  const { data: user } = await supabase
    .from('users')
    .select('api_account_status, api_invest_created, api_oroplay_created, api_error_message')
    .eq('id', userId)
    .single();
  
  if (!user) {
    return {
      status: 'error',
      canPlayGames: false,
      message: '사용자 정보를 찾을 수 없습니다'
    };
  }
  
  const status = (user.api_account_status as ApiAccountStatus) || 'pending';
  
  switch (status) {
    case 'active':
      return {
        status: 'active',
        canPlayGames: true
      };
    
    case 'partial':
      return {
        status: 'partial',
        canPlayGames: true,
        message: '일부 게임만 이용 가능합니다'
      };
    
    case 'pending':
      return {
        status: 'pending',
        canPlayGames: false,
        message: '계정 준비 중입니다. 잠시 후 다시 시도해주세요'
      };
    
    case 'error':
      return {
        status: 'error',
        canPlayGames: false,
        message: user.api_error_message || '계정 오류가 발생했습니다. 고객센터에 문의하세요'
      };
    
    default:
      return {
        status: 'error',
        canPlayGames: false,
        message: '알 수 없는 상태입니다'
      };
  }
}

/**
 * 게임 실행 가능 여부 체크 (api_type별)
 */
export async function canPlayGame(
  userId: string,
  apiType: 'invest' | 'oroplay'
): Promise<{
  canPlay: boolean;
  message?: string;
}> {
  const { data: user } = await supabase
    .from('users')
    .select('api_account_status, api_invest_created, api_oroplay_created')
    .eq('id', userId)
    .single();
  
  if (!user) {
    return { canPlay: false, message: '사용자 정보를 찾을 수 없습니다' };
  }
  
  // pending 상태면 모든 게임 불가
  if (user.api_account_status === 'pending') {
    return { canPlay: false, message: '계정 준비 중입니다. 잠시 후 다시 시도해주세요' };
  }
  
  // error 상태면 모든 게임 불가
  if (user.api_account_status === 'error') {
    return { canPlay: false, message: '계정 오류가 발생했습니다. 고객센터에 문의하세요' };
  }
  
  // API 타입별 체크
  if (apiType === 'invest' && !user.api_invest_created) {
    return { canPlay: false, message: 'Invest 게임은 현재 이용할 수 없습니다' };
  }
  
  if (apiType === 'oroplay' && !user.api_oroplay_created) {
    return { canPlay: false, message: 'OroPlay 게임은 현재 이용할 수 없습니다' };
  }
  
  return { canPlay: true };
}