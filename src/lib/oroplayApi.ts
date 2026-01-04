/**
 * OroPlay API 연동 모듈
 * Base URL: https://bs.sxvwlkohlv.com/api/v2
 * Proxy: https://vi8282.com/proxy
 */

import { supabase } from './supabase';
import { oroplayRateLimiter } from './rateLimiter';

const OROPLAY_BASE_URL = 'https://bs.sxvwlkohlv.com/api/v2';
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
        throw new Error(`인증 실패 (401): 토큰이 유효하지 않습니다.`);
      }
      throw new Error(`Proxy call failed (${response.status})`);
    }
    
    const data = await response.json();
    
    // ⭐ Proxy 응답 검증: RESULT가 false이면 에러
    if (data && typeof data === 'object') {
      if (data.RESULT === false || data.result === false) {
        const errorMessage = data.message || data.DATA?.message || '알 수 없는 오류가 발생했습니다.';
        
        // ✅ "게임기록이 존재하지 않습니다" 메시지는 정상 응답으로 처리
        if (errorMessage.includes('게임기록이 존재하지 않습니다')) {
          console.log('ℹ️ [OroPlay] 게임기록이 없습니다 (정상)');
          return data; // 원본 데이터 그대로 반환
        }
        
        console.error('❌ OroPlay Proxy 응답 오류 (RESULT: false):', errorMessage);
        throw new Error(errorMessage);
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

interface CreateTokenResponse {
  token: string;
  expiration: number;
}

export async function createOroPlayToken(
  clientId: string,
  clientSecret: string
): Promise<CreateTokenResponse> {
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/auth/createtoken`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      clientId,
      clientSecret
    }
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Token creation failed: errorCode ${response.errorCode}`);
  }
  
  if (response.token && response.expiration) {
    return { token: response.token, expiration: response.expiration };
  }
  
  if (response.message?.token && response.message?.expiration) {
    return response.message;
  }
  
  throw new Error('Invalid token response format');
}

// ============================================
// 2. 토큰 자동 관리
// ============================================

/**
 * OroPlay 토큰 조회 및 자동 갱신
 */
export async function getOroPlayToken(partnerId: string): Promise<string> {
  const { data: config, error: configError } = await supabase
    .from('api_configs')
    .select('token, token_expires_at, client_id, client_secret')
    .eq('partner_id', partnerId)
    .eq('api_provider', 'oroplay')
    .maybeSingle();
  
  if (configError || !config) {
    console.error('❌ [OroPlay] API 설정 조회 실패:', {
      partner_id: partnerId,
      error: configError?.message
    });
    throw new Error('OroPlay API 설정을 찾을 수 없습니다.');
  }
  
  if (!config.client_id || !config.client_secret) {
    console.error('❌ [OroPlay] Credentials 정보 없음:', {
      partner_id: partnerId,
      has_client_id: !!config.client_id,
      has_client_secret: !!config.client_secret
    });
    throw new Error('OroPlay client_id 또는 client_secret이 설정되지 않았습니다.');
  }
  
  return await refreshTokenIfNeeded(partnerId, config);
}

/**
 * 토큰이 만료되었으면 재발급
 */
async function refreshTokenIfNeeded(
  partnerId: string,
  config: {
    token: string | null;
    token_expires_at: string | null;
    client_id: string;
    client_secret: string;
  }
): Promise<string> {
  // 토큰이 있고 아직 유효하면 그대로 사용
  if (config.token && config.token_expires_at) {
    const expiresAt = new Date(config.token_expires_at).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (expiresAt - now > fiveMinutes) {
      return config.token;
    }
  }
  
  // 토큰 재발급
  const tokenData = await createOroPlayToken(
    config.client_id,
    config.client_secret
  );
  
  // DB에 저장
  const { error: updateError } = await supabase
    .from('api_configs')
    .update({
      token: tokenData.token,
      token_expires_at: new Date(tokenData.expiration * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('partner_id', partnerId)
    .eq('api_provider', 'oroplay');
  
  if (updateError) {
    throw new Error(`토큰 DB 저장 실패: ${updateError.message}`);
  }
  
  return tokenData.token;
}

// ============================================
// 3. 게임 관리 API
// ============================================

export interface Vendor {
  vendorCode: string;
  type: number; // 1=casino, 2=slot, 3=minigame
  name: string;
}

export async function getVendorsList(token: string): Promise<Vendor[]> {
  console.log('📡 [OroPlay] Vendor 목록 API 호출 시작');
  
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/vendors/list`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  console.log('📊 [OroPlay] Vendor 목록 API 응답:', {
    errorCode: response.errorCode,
    hasMessage: !!response.message,
    responseKeys: Object.keys(response)
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    console.error('❌ [OroPlay] Vendor 목록 조회 실패:', {
      errorCode: response.errorCode,
      errorMessage: getErrorMessage(response.errorCode)
    });
    throw new Error(`Failed to get vendors list: errorCode ${response.errorCode}`);
  }
  
  const vendors = response.message || response;
  
  console.log('✅ [OroPlay] Vendor 목록 수신:', {
    총개수: vendors.length,
    vendors: vendors.map((v: Vendor) => ({
      vendorCode: v.vendorCode,
      name: v.name,
      type: v.type,
      typeLabel: v.type === 1 ? 'casino' : v.type === 2 ? 'slot' : 'minigame'
    }))
  });
  
  return vendors;
}

export interface Game {
  provider: string;
  vendorCode: string;
  gameId: string;
  gameCode: string;
  gameName: string;
  slug: string;
  thumbnail: string;
  updatedAt: string;
  isNew: boolean;
  underMaintenance: boolean;
}

export async function getGamesList(
  token: string,
  vendorCode: string,
  language: string = 'ko'
): Promise<Game[]> {
  console.log(`📡 [OroPlay] 게임 목록 API 호출:`, { vendorCode, language });
  
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/games/list`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: {
      vendorCode,
      language
    }
  });
  
  console.log(`📊 [OroPlay] 게임 목록 API 응답:`, {
    vendorCode,
    errorCode: response.errorCode,
    hasMessage: !!response.message,
    messageType: typeof response.message,
    messageLength: Array.isArray(response.message) ? response.message.length : 'not array',
    responseType: typeof response,
    isArray: Array.isArray(response)
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    // ✅ 500 에러는 API 서버 문제이므로 로그 출력 없이 throw만 (상위에서 처리)
    if (response.errorCode !== 500) {
      console.error(`❌ [OroPlay] 게임 목록 조회 실패:`, {
        vendorCode,
        errorCode: response.errorCode,
        errorMessage: getErrorMessage(response.errorCode)
      });
    }
    throw new Error(`Failed to get games list: errorCode ${response.errorCode} - ${getErrorMessage(response.errorCode)}`);
  }
  
  const games = response.message || response;
  console.log(`✅ [OroPlay] 게임 ${games.length || 0}개 반환 (vendorCode: ${vendorCode})`);
  
  return games;
}

export async function getLaunchUrl(
  token: string,
  vendorCode: string,
  gameCode: string,
  userCode: string,
  language: string = 'ko',
  lobbyUrl?: string,
  theme?: number
): Promise<string> {
  console.log('🎮 [OroPlay] getLaunchUrl 호출:', {
    vendorCode,
    gameCode,
    userCode,
    language
  });

  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/game/launch-url`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: {
      vendorCode,
      gameCode,
      userCode,
      language,
      lobbyUrl,
      theme
    }
  });
  
  console.log('📊 [OroPlay] getLaunchUrl 응답:', {
    errorCode: response.errorCode,
    hasMessage: !!response.message,
    response
  });

  if (response.errorCode !== undefined && response.errorCode !== 0) {
    const errorMessage = getErrorMessage(response.errorCode);
    console.error('❌ [OroPlay] getLaunchUrl 실패:', {
      vendorCode,
      gameCode,
      userCode,
      errorCode: response.errorCode,
      errorMessage
    });
    throw new Error(`Failed to get launch URL: errorCode ${response.errorCode} - ${errorMessage}`);
  }
  
  return response.message || response;
}

// ============================================
// 4. 사용자 관리 API (Transfer)
// ============================================

export async function createUser(token: string, userCode: string): Promise<void> {
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/user/create`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: {
      userCode
    }
  });
  
  // errorCode 0 = 성공, errorCode 1 = 이미 존재 (성공으로 간주)
  if (response.errorCode === 0 || response.errorCode === 1) {
    return;
  }
  
  throw new Error(`Failed to create user: errorCode ${response.errorCode}`);
}

export async function getUserBalance(token: string, userCode: string): Promise<number> {
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/user/balance`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: {
      userCode
    }
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Failed to get user balance: errorCode ${response.errorCode}`);
  }
  
  // ⭐ response.message가 잔액 (숫자)
  // response 전체 객체가 아니라 message 속성만 반환
  return typeof response.message === 'number' ? response.message : 0;
}

export async function depositToUser(
  token: string,
  userCode: string,
  balance: number,
  orderNo?: string,
  vendorCode?: string
): Promise<number> {
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/user/deposit`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: {
      userCode,
      balance,
      orderNo,
      vendorCode
    }
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Failed to deposit: errorCode ${response.errorCode}`);
  }
  
  return response.message || response;
}

export async function withdrawFromUser(
  token: string,
  userCode: string,
  vendorCode?: string
): Promise<number> {
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/user/withdraw-all`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: {
      userCode,
      vendorCode
    }
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Failed to withdraw: errorCode ${response.errorCode}`);
  }
  
  return response.message || response;
}

// ============================================
// 5. 배팅 내역 API
// ============================================

interface BettingHistory {
  id: number;
  userCode: string;
  roundId: string;
  gameCode: string;
  vendorCode: string;
  betAmount: number;
  winAmount: number;
  beforeBalance: number;
  afterBalance: number;
  detail: string;
  status: number; // 0=진행중, 1=완료, 2=취소
  createdAt: number;
  updatedAt: number;
}

interface BettingHistoryResponse {
  nextStartDate: string;
  limit: number;
  histories: BettingHistory[];
}

export async function getBettingHistory(
  token: string,
  startDate: string,
  limit: number = 5000,
  vendorCode?: string
): Promise<BettingHistoryResponse> {
  try {
    const response = await proxyCall<any>({
      url: `${OROPLAY_BASE_URL}/betting/history/by-date-v2`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: {
        vendorCode,
        startDate,
        limit
      }
    });
    
    // ✅ "게임기록이 존재하지 않습니다" 메시지는 정상 처리 (빈 배열 반환)
    if (response.RESULT === false || response.result === false) {
      const errorMessage = response.message || response.DATA?.message || '';
      if (errorMessage.includes('게임기록이 존재하지 않습니다')) {
        return {
          nextStartDate: startDate,
          limit: limit,
          histories: []
        };
      }
    }
    
    // ✅ errorCode 체크
    if (response.errorCode !== undefined && response.errorCode !== 0) {
      // errorCode 5 = 배팅 기록이 없습니다 (정상 처리)
      if (response.errorCode === 5) {
        return {
          nextStartDate: startDate,
          limit: limit,
          histories: []
        };
      }
      throw new Error(`Failed to get betting history: errorCode ${response.errorCode}`);
    }
    
    // ✅ response.message 또는 response를 직접 반환
    const result = response.message || response;
    
    return result;
  } catch (error: any) {
    console.error('❌ [OroPlay] getBettingHistory 에러:', error);
    // ✅ "게임기록이 존재하지 않습니다" 메시지는 정상 처리 (빈 배열 반환)
    if (error.message && error.message.includes('게임기록이 존재하지 않습니다')) {
      return {
        nextStartDate: startDate,
        limit: limit,
        histories: []
      };
    }
    throw error;
  }
}

// ============================================
// 6. Agent 관리 API
// ============================================

export async function getAgentBalance(token: string): Promise<number> {
  console.log('📊 [OroPlay] Agent 잔고 조회 API 호출');
  
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/agent/balance`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Agent 잔고 조회 실패: errorCode ${response.errorCode}`);
  }
  
  // response.message에 잔고가 숫자로 반환됨
  let balance = 0;
  if (typeof response.message === 'number') {
    balance = response.message;
  } else if (response.message === 0) {
    balance = 0;
  } else if (typeof response === 'number') {
    balance = response;
  } else if (typeof response.message === 'string') {
    balance = parseFloat(response.message) || 0;
  }
  
  console.log(`✅ [OroPlay] Agent 잔고: ${balance}`);
  
  return balance;
}

// ============================================
// 7. RTP 관리 API
// ============================================

export async function setUserRTP(
  token: string,
  vendorCode: string,
  userCode: string,
  rtp: number
): Promise<void> {
  if (rtp < 30 || rtp > 99) {
    throw new Error('RTP 값은 30~99 범위여야 합니다');
  }
  
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/game/user/set-rtp`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: {
      vendorCode,
      userCode,
      rtp
    }
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Failed to set user RTP: errorCode ${response.errorCode}`);
  }
}

export async function resetAllUsersRTP(
  token: string,
  vendorCode: string,
  rtp: number
): Promise<void> {
  if (rtp < 30 || rtp > 99) {
    throw new Error('RTP 값은 30~99 범위여야 합니다');
  }
  
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/game/users/reset-rtp`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: {
      vendorCode,
      rtp
    }
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Failed to reset all users RTP: errorCode ${response.errorCode}`);
  }
}

interface BatchRTPData {
  userCode: string;
  rtp: number;
}

export async function batchSetRTP(
  token: string,
  vendorCode: string,
  data: BatchRTPData[]
): Promise<void> {
  if (data.length > 500) {
    throw new Error('최대 500명까지 설정 가능합니다');
  }
  
  const executeCall = async () => {
    return await proxyCall<any>({
      url: `${OROPLAY_BASE_URL}/game/users/batch-rtp`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: {
        vendorCode,
        data
      }
    });
  };
  
  const response = await oroplayRateLimiter.enqueue(executeCall);
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Failed to batch set RTP: errorCode ${response.errorCode}`);
  }
}

export async function getUserRTP(
  token: string,
  vendorCode: string,
  userCode: string
): Promise<number> {
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/game/user/rtp`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: {
      vendorCode,
      userCode
    }
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Failed to get user RTP: errorCode ${response.errorCode}`);
  }
  
  return response.message || response;
}

// ============================================
// 8. 오류 메시지 헬퍼
// ============================================

export function getErrorMessage(errorCode: number): string {
  const messages: Record<number, string> = {
    0: '정상 처리',
    1: '이미 존재하는 계정입니다',
    2: '존재하지 않는 계정입니다',
    3: '시스템 점검 중입니다 (Agent 잔고 부족)',
    4: '보유금이 부족합니다',
    5: '배팅 기록이 없습니다',
    6: '중복된 요청입니다',
    7: '이미 완료된 배팅입니다',
    8: '잔고 기록이 존재하지 않습니다',
    9: '게임 공급사 점검 중입니다',
    10: '게임 점검 중입니다',
    20: '사용 중단된 엔드포인트입니다',
    400: '잘못된 요청입니다',
    401: '인증에 실패했습니다',
    500: '서버 오류가 발생했습니다'
  };
  
  return messages[errorCode] || '알 수 없는 오류가 발생했습니다';
}

// ============================================
// 9. Seamless Wallet 헬퍼 함수
// ============================================

/**
 * 게임 시작 시 입금 (Seamless Wallet)
 */
export async function depositBalance(
  token: string,
  username: string,
  amount: number,
  vendorCode?: string
): Promise<{ success: boolean; balance?: number; error?: string }> {
  try {
    const balance = await depositToUser(token, username, amount, undefined, vendorCode);
    return {
      success: true,
      balance: balance
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
 */
export async function withdrawBalance(
  token: string,
  username: string,
  vendorCode?: string
): Promise<{ success: boolean; balance?: number; error?: string }> {
  try {
    const balance = await withdrawFromUser(token, username, vendorCode);
    return {
      success: true,
      balance: balance
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
}

/**
 * API 응답에서 잔고 추출
 */
export function extractBalanceFromResponse(response: any, username: string): number {
  // OroPlay는 입금/출금 후 잔고를 직접 반환
  if (typeof response === 'number') {
    return response;
  }
  
  // balance 필드가 있으면 사용
  if (response?.balance !== undefined) {
    return typeof response.balance === 'number' ? response.balance : parseFloat(response.balance) || 0;
  }
  
  // message 필드에 잔고가 있을 수 있음
  if (response?.message !== undefined && typeof response.message === 'number') {
    return response.message;
  }
  
  console.warn('⚠️ [OroPlay] 잔고 추출 실패, 0 반환:', response);
  return 0;
}

// ============================================
// 통합 Export 객체
// ============================================

export const oroplayApi = {
  // 인증
  createToken: createOroPlayToken,
  getToken: getOroPlayToken,
  
  // 게임 관리
  getVendors: getVendorsList,
  getGameList: getGamesList,
  getLaunchUrl,
  
  // 사용자 관리
  createUser,
  getUserBalance,
  deposit: depositToUser,
  withdraw: withdrawFromUser,
  
  // Seamless Wallet
  depositBalance,
  withdrawBalance,
  
  // 배팅 내역
  getBettingHistory,
  
  // Agent 관리
  getAgentBalance,
  
  // RTP 관리
  setUserRTP,
  resetAllUsersRTP,
  batchSetRTP,
  getUserRTP,
  
  // 유틸리티
  getErrorMessage,
  extractBalanceFromResponse,
};