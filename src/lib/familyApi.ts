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

async function proxyCall<T = any>(config: ProxyConfig): Promise<T> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(`인증 실패 (401): API Key가 유효하지 않습니다.`);
      }
      throw new Error(`Proxy call failed (${response.status})`);
    }
    
    const data = await response.json();
    
    // FamilyAPI 응답 검증: resultCode가 "0"이 아니면 에러
    if (data && typeof data === 'object') {
      if (data.resultCode !== undefined && data.resultCode !== "0") {
        const errorMessage = data.resultMessage || '알 수 없는 오류가 발생했습니다.';
        const errorDetail = `FamilyAPI 오류 (resultCode: ${data.resultCode}): ${errorMessage}`;
        console.error('❌ ❌ FamilyAPI Proxy 응답 오류:', {
          resultCode: data.resultCode,
          resultMessage: errorMessage,
          url: config.url,
          method: config.method
        });
        
        // resultCode 9999는 일반적으로 토큰 오류 또는 제공사 사용 불가
        if (data.resultCode === "9999" || data.resultCode === 9999) {
          throw new Error('제공사를 사용할 수 없습니다. (토큰 오류 또는 권한 없음)');
        }
        
        throw new Error(errorDetail);
      }
    }
    
    if (data.error) {
      throw new Error(`Proxy error: ${JSON.stringify(data.error)}`);
    }
    
    return data;
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('API 호출 시간 초과 (60초)');
    }
    throw error;
  }
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
 * FamilyAPI 토큰 조회 (저장된 토큰 사용 또는 신규 발급)
 * ⚠️ 에러 발생 시 자동으로 재발급
 */
export async function getFamilyApiToken(partnerId: string, forceRefresh: boolean = false): Promise<string> {
  const { data: config, error: configError } = await supabase
    .from('api_configs')
    .select('api_key, token')
    .eq('partner_id', partnerId)
    .eq('api_provider', 'familyapi')
    .maybeSingle();
  
  if (configError || !config) {
    console.error('❌ [FamilyAPI] API 설정 조회 실패:', {
      partner_id: partnerId,
      error: configError?.message
    });
    throw new Error('FamilyAPI API 설정을 찾을 수 없습니다.');
  }
  
  if (!config.api_key) {
    console.error('❌ [FamilyAPI] API Key 정보 없음:', {
      partner_id: partnerId,
      has_api_key: !!config.api_key
    });
    throw new Error('FamilyAPI api_key가 설정되지 않았습니다.');
  }
  
  // 저장된 토큰이 있고 강제 갱신이 아닌 경우 기존 토큰 사용
  if (config.token && !forceRefresh) {
    return config.token;
  }
  
  // 새로운 토큰 발급
  const tokenData = await createFamilyApiToken(config.api_key);
  
  // 토큰을 DB에 저장
  await supabase
    .from('api_configs')
    .update({ token: tokenData.token, updated_at: new Date().toISOString() })
    .eq('partner_id', partnerId)
    .eq('api_provider', 'familyapi');
  
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
// 11. Lv1 관리자의 FamilyAPI 설정 조회
// ============================================

export async function getFamilyApiConfig() {
  // 시스템 관리자 조회
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

  const { data: apiConfig } = await supabase
    .from('api_configs')
    .select('api_key, token')
    .eq('partner_id', systemAdmin.id)
    .eq('api_provider', 'familyapi')
    .maybeSingle();

  if (!apiConfig?.api_key) {
    throw new Error('FamilyAPI 설정을 찾을 수 없습니다.');
  }

  return {
    partnerId: systemAdmin.id,
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