/**
 * FamilyAPI 연동 모듈
 * Base URL: https://api.xtreem.cc
 * API Key: y18LV4uca7hQOYS1BufIIFcs
 */

import { supabase } from './supabase';

const FAMILYAPI_BASE_URL = 'https://api.xtreem.cc';
const PROXY_URL = 'https://vi8282.com/proxy';

// ============================================
// Proxy 서버를 통한 API 호출
// ============================================

interface ProxyConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
}

async function proxyCall<T = any>(config: ProxyConfig, retries: number = 0): Promise<T> {
  const startTime = Date.now();
  console.log(`⏱️ [Family Proxy] API 호출 시작:`, {
    url: config.url,
    method: config.method,
    timestamp: new Date().toISOString()
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error(`⏰ [Family Proxy] 타임아웃 발생 (120초 경과):`, config.url);
        controller.abort();
      }, 120000);
      
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const elapsed = Date.now() - startTime;
      console.log(`✅ [Family Proxy] 응답 수신 (${elapsed}ms):`, {
        status: response.status,
        ok: response.ok
      });
      
      if (!response.ok) {
        throw new Error(`Proxy call failed (${response.status})`);
      }
      
      const data = await response.json();
      
      console.log(`📦 [Family Proxy] 데이터 파싱 완료 (총 ${Date.now() - startTime}ms)`);
      
      return data;
      
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      
      if (error.name === 'AbortError') {
        console.error(`❌ [Family Proxy] 타임아웃 (${elapsed}ms):`, {
          url: config.url,
          method: config.method
        });
        throw new Error('API 호출 시간 초과 (120초). 프록시 서버가 응답하지 않습니다.');
      }
      
      // "Failed to fetch" 오류 처리 (네트워크 오류)
      if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
        console.error(`❌ [Family Proxy] 네트워크 오류 (${elapsed}ms):`, {
          url: config.url,
          method: config.method,
          error: error.message
        });
        throw new Error(`프록시 서버 연결 실패: ${config.url}. 네트워크를 확인하거나 잠시 후 다시 시도해주세요.`);
      }
      
      // 기타 오류
      console.error(`❌ [Family Proxy] 오류 (${elapsed}ms):`, {
        url: config.url,
        error: error.message
      });
      
      throw error;
    }
  }
  
  // 모든 재시도 실패 (retries=0이면 여기 도달 안함)
  throw new Error(`API 호출 실패: ${config.url}`);
}

// ============================================
// 1. 인증 API
// ============================================

interface TokenResponse {
  token: string;
}

export async function createFamilyApiToken(apiKey: string): Promise<TokenResponse> {
  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/getToken`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.resultCode !== "0") {
    throw new Error(`Token creation failed: ${response.resultMessage}`);
  }
  
  if (response.data?.token) {
    return { token: response.data.token };
  }
  
  throw new Error('Invalid token response format');
}

// ============================================
// 2. 토큰 자동 관리
// ============================================

/**
 * 상위 계층 파트너 ID 목록 조회 (계층 순서대로)
 */
async function getFamilyApiPartnerHierarchy(partnerId: string): Promise<string[]> {
  const hierarchy: string[] = [];
  let currentId: string | null = partnerId;
  const maxIterations = 10;

  while (currentId && hierarchy.length < maxIterations) {
    hierarchy.push(currentId);
    
    const { data: partner } = await supabase
      .from('partners')
      .select('id, parent_id, level')
      .eq('id', currentId)
      .single();
    
    if (!partner || partner.level === 1 || !partner.parent_id) {
      break;
    }
    
    currentId = partner.parent_id;
  }

  return hierarchy;
}

/**
 * FamilyAPI 토큰 조회 (저장된 토큰 사용 또는 신규 발급)
 * ⚡ hierarchical credential lookup: Lv6 → Lv5 → ... → Lv1 순서로 credentials 검색
 */
export async function getFamilyApiToken(partnerId: string, forceRefresh: boolean = false): Promise<string> {
  console.log('🔑 [FamilyAPI] getFamilyApiToken 호출 시작:', { partnerId, forceRefresh });
  
  // ⚡ 계층 순서대로 파트너 ID 목록 조회
  const hierarchy = await getFamilyApiPartnerHierarchy(partnerId);
  console.log('🔗 [FamilyAPI] 검색할 파트너 계층:', hierarchy);
  
  // ⚡ 계층 순서대로 credentials 검색
  let foundPartnerId: string | null = null;
  let config: any = null;
  
  for (const pid of hierarchy) {
    const { data, error } = await supabase
      .from('api_configs')
      .select('api_key, token, partner_id')
      .eq('partner_id', pid)
      .eq('api_provider', 'familyapi')
      .maybeSingle();
    
    if (!error && data?.api_key) {
      config = data;
      foundPartnerId = pid;
      console.log(`✅ [FamilyAPI] Credentials 발견: partner_id=${pid}`);
      break;
    }
  }
  
  // ⚡ credentials가 없으면 에러
  if (!config || !foundPartnerId) {
    console.error('❌ [FamilyAPI] 어떤 파트너에도 credentials가 설정되지 않았습니다:', {
      searched_hierarchy: hierarchy,
      partner_id: partnerId
    });
    throw new Error('FamilyAPI API 설정을 찾을 수 없습니다.');
  }
  
  if (!config.api_key) {
    console.error('❌ [FamilyAPI] API Key 정보 없음:', {
      partner_id: foundPartnerId,
      has_api_key: !!config.api_key
    });
    throw new Error('FamilyAPI api_key가 설정되지 않았습니다.');
  }
  
  // 저장된 토큰이 있고 강제 갱신이 아닌 경우 기존 토큰 사용
  if (config.token && !forceRefresh) {
    console.log('📋 [FamilyAPI] 기존 토큰 사용:', { partner_id: foundPartnerId });
    return config.token;
  }
  
  // 새로운 토큰 발급
  console.log('🔄 [FamilyAPI] 새 토큰 발급 시작:', { partner_id: foundPartnerId });
  const tokenData = await createFamilyApiToken(config.api_key);
  
  // 토큰을 DB에 저장 (credentials를 찾은 파트너 ID 사용)
  await supabase
    .from('api_configs')
    .update({ token: tokenData.token, updated_at: new Date().toISOString() })
    .eq('partner_id', foundPartnerId)
    .eq('api_provider', 'familyapi');
  
  console.log('✅ [FamilyAPI] 새 토큰 발급 완료:', { partner_id: foundPartnerId });
  return tokenData.token;
}

// ============================================
// 3. 게임사 목록 조회
// ============================================

export interface FamilyApiVendor {
  vendorKey: string;
  vendorName: string;
  vendorNameEng: string;
}

export async function getVendorList(apiKey: string, token: string): Promise<FamilyApiVendor[]> {
  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/p1/vendorList`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'token': token,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.resultCode !== "0") {
    throw new Error(`Vendor list failed: ${response.resultMessage}`);
  }
  
  return response.data?.list || [];
}

// ============================================
// 4. 슬롯 게임 목록 조회
// ============================================

export interface FamilyApiGame {
  gameIdx: number;
  gameKey: string;
  gameName: string;
  gameNameEn: string;
  gameImg: string;
}

export async function getGameList(
  apiKey: string,
  vendorKey: string
): Promise<FamilyApiGame[]> {
  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/games`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: {
      vendorKey
    }
  });
  
  if (response.resultCode !== "0") {
    throw new Error(`Game list failed: ${response.resultMessage}`);
  }
  
  return response.data?.list || [];
}

// ============================================
// 5. 게임 접속 인증
// ============================================

export interface AuthGameRequest {
  userId: string;
  nickName: string;
  userIp?: string;
  balance: number;
}

export interface AuthGameResponse {
  userId: number;
  token: string;
}

export async function authGame(
  apiKey: string,
  params: AuthGameRequest
): Promise<AuthGameResponse> {
  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/auth`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: {
      userId: params.userId,
      nickName: params.nickName,
      userIp: params.userIp || '',
      balance: params.balance
    }
  });
  
  if (response.resultCode !== "0") {
    throw new Error(`Game auth failed: ${response.resultMessage}`);
  }
  
  return {
    userId: response.data?.userId || 0,
    token: response.data?.token || ''
  };
}

// ============================================
// 6. 게임 실행
// ============================================

export interface PlayGameRequest {
  userId: string;
  vendorKey: string;
  gameKey?: string; // 슬롯 전용
  balance: number;
  isMobile: 'Y' | 'N';
  userIp?: string;
  language?: string;
  skinType?: 'A' | 'B' | 'C' | 'D' | 'E'; // 에볼루션 스킨
  callbackUrl?: string; // ⭐ Seamless wallet callback URL 추가
}

export interface PlayGameResponse {
  gameurl: string;
  callbackType: string;
}

export async function playGame(
  apiKey: string,
  gameToken: string,
  params: PlayGameRequest
): Promise<PlayGameResponse> {
  console.log('🎮 [FamilyAPI playGame] 호출 시작:', {
    userId: params.userId,
    vendorKey: params.vendorKey,
    gameKey: params.gameKey,
    balance: params.balance,
    isMobile: params.isMobile ? 'Y' : 'N',
    userIp: params.userIp
  });

  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/play`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Token': gameToken,
      'Content-Type': 'application/json'
    },
    body: {
      userId: params.userId,
      vendorKey: params.vendorKey,
      gameKey: params.gameKey || '',
      balance: params.balance,
      isMobile: params.isMobile ? 'Y' : 'N',
      userIp: params.userIp || '',
      language: params.language || 'KR',
      decYN: '',
      skinType: params.skinType || 'A'
      // ⭐ callbackUrl 제거 - FamilyAPI는 사전 등록된 URL 사용
    }
  });
  
  console.log('📥 [FamilyAPI playGame] 응답:', {
    resultCode: response.resultCode,
    gameurl: response.data?.gameurl ? '생성됨' : '없음',
    callbackType: response.data?.callbackType
  });
  
  if (response.resultCode !== "0") {
    throw new Error(`Game play failed: ${response.resultMessage}`);
  }
  
  return {
    gameurl: response.data?.gameurl || '',
    callbackType: response.data?.callbackType || ''
  };
}

// ============================================
// 7. Agent 잔고 조회
// ============================================

export interface AgentBalanceResponse {
  credit: number;
  point: number;
}

export async function getAgentBalance(
  apiKey: string,
  token: string
): Promise<AgentBalanceResponse> {
  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/p1/agentBalance`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'token': token,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.resultCode !== "0") {
    throw new Error(`Agent balance failed: ${response.resultMessage}`);
  }
  
  return {
    credit: response.data?.credit || 0,
    point: response.data?.point || 0
  };
}

// ============================================
// 8. 베팅 내역 조회
// ============================================

export interface TransactionRequest {
  memberId?: string;
  vendorKey?: string;
  startDate: string; // YYYY-MM-DD HH:II:SS
  endDate?: string;
  count?: number; // 기본 100, 최대 3000
  isDetail?: 'Y' | 'N'; // 기본 N
}

export interface TransactionItem {
  tranId: string;
  betId: string;
  siteId: string;
  memberId: string;
  vendorIdx: number;
  vendorKey: string;
  vendorName: string;
  vendorNameEng: string;
  gameName: string;
  tranType: 'debit' | 'credit' | 'adjust' | 'credit_wait';
  amount: string;
  isCancel: 'Y' | 'N';
  detail?: any;
  regDate: string;
}

export interface TransactionResponse {
  total: number;
  nextStartDate: string;
  list: TransactionItem[];
}

export async function getTransactionHistory(
  apiKey: string,
  token: string,
  params: TransactionRequest
): Promise<TransactionResponse> {
  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/p1/transaction`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'token': token,
      'Content-Type': 'application/json'
    },
    body: {
      memberId: params.memberId || '',
      vendorKey: params.vendorKey || '',
      startDate: params.startDate,
      endDate: params.endDate || '',
      count: params.count || 100,
      isDetail: params.isDetail || 'N'
    }
  });
  
  if (response.resultCode !== "0") {
    throw new Error(`Transaction history failed: ${response.resultMessage}`);
  }
  
  return {
    total: response.data?.total || 0,
    nextStartDate: response.data?.nextStartDate || params.startDate,
    list: response.data?.list || []
  };
}

// ============================================
// 9. 유저 입금 (충전)
// ============================================

export async function depositUser(
  apiKey: string,
  userId: string,
  amount: number
): Promise<void> {
  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/p1/deposit`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: {
      userId,
      amount: amount.toString()
    }
  });
  
  if (response.resultCode !== "0") {
    throw new Error(`Deposit failed: ${response.resultMessage}`);
  }
}

// ============================================
// 10. 유저 출금 (회수)
// ============================================

export async function withdrawUser(
  apiKey: string,
  userId: string,
  amount: number
): Promise<void> {
  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/p1/withdraw`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: {
      userId,
      amount: amount.toString()
    }
  });
  
  if (response.resultCode !== "0") {
    throw new Error(`Withdraw failed: ${response.resultMessage}`);
  }
}

// ============================================
// 11. FamilyAPI 설정 조회 (hierarchical credential lookup)
// ============================================

export async function getFamilyApiConfig() {
  console.log('🔑 [FamilyAPI] getFamilyApiConfig 호출 시작');
  
  // ⚡ 시스템 관리자 조회 (레거시 방식 - 하위 호환성)
  const { data: systemAdmin } = await supabase
    .from('partners')
    .select('id')
    .eq('level', 1)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!systemAdmin) {
    throw new Error('시스템 관리자를 찾을 수 없습니다.');
  }

  // ⚡ 계층 순서대로 credentials 검색
  const hierarchy = await getFamilyApiPartnerHierarchy(systemAdmin.id);
  console.log('🔗 [FamilyAPI] getFamilyApiConfig 검색할 파트너 계층:', hierarchy);
  
  let foundPartnerId: string | null = null;
  let apiConfig: any = null;
  
  for (const pid of hierarchy) {
    const { data, error } = await supabase
      .from('api_configs')
      .select('api_key, token, partner_id')
      .eq('partner_id', pid)
      .eq('api_provider', 'familyapi')
      .maybeSingle();
    
    if (!error && data?.api_key) {
      apiConfig = data;
      foundPartnerId = pid;
      console.log(`✅ [FamilyAPI] getFamilyApiConfig: Credentials 발견 partner_id=${pid}`);
      break;
    }
  }
  
  if (!apiConfig?.api_key) {
    console.error('❌ [FamilyAPI] 어떤 파트너에도 credentials가 설정되지 않았습니다:', hierarchy);
    throw new Error('FamilyAPI 설정을 찾을 수 없습니다.');
  }

  return {
    partnerId: foundPartnerId!,
    apiKey: apiConfig.api_key,
    token: apiConfig.token || null,
  };
}

// ============================================
// 12. Seamless Wallet 헬퍼 함수
// ============================================

/**
 * 게임 시작 시 입금 (Seamless Wallet)
 * @param apiKey - FamilyAPI API Key
 * @param userId - 유저 ID (username)
 * @param amount - 입금할 금액
 * @returns 성공 여부 및 에러 메시지
 */
export async function depositBalance(
  apiKey: string,
  userId: string,
  amount: number
): Promise<{ success: boolean; balance?: number; error?: string }> {
  try {
    await depositUser(apiKey, userId, amount);
    return {
      success: true,
      balance: amount // FamilyAPI는 잔액을 반환하지 않으므로 입금액을 반환
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
}

/**
 * 게임 종료 시 출금 (Seamless Wallet)
 * @param apiKey - FamilyAPI API Key
 * @param userId - 유저 ID (username)
 * @param amount - 출금할 금액
 * @returns 성공 여부 및 에러 메시지
 */
export async function withdrawBalance(
  apiKey: string,
  userId: string,
  amount: number
): Promise<{ success: boolean; balance?: number; error?: string }> {
  try {
    await withdrawUser(apiKey, userId, amount);
    return {
      success: true,
      balance: 0 // FamilyAPI는 잔액을 반환하지 않으므로 0을 반환
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
}

export const familyApi = {
  createFamilyApiToken,
  getFamilyApiToken,
  getVendorList,
  getGameList,
  authGame,
  playGame,
  getAgentBalance,
  getTransactionHistory,
  depositUser,
  withdrawUser,
  getFamilyApiConfig,
  depositBalance,
  withdrawBalance
};
