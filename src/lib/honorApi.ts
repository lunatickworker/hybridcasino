/**
 * HonorAPI 연동 모듈
 * Base URL: https://api.honorlink.org/api
 * Proxy: https://vi8282.com/proxy
 */

import { supabase } from './supabase';

const HONORAPI_BASE_URL = 'https://api.honorlink.org/api';
const PROXY_URL = 'https://vi8282.com/proxy';

// ============================================
// 타입 정의
// ============================================

export interface AgentInfo {
  id: number;
  type: string;
  username: string;
  nickname: string;
  callback_url: string | null;
  balance: string;
  created_at: string;
}

export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  country: string;
  currency_code: string;
  token: string | null;
  last_access_at: string | null;
  balance: number;
  point: string;
  created_at: string;
  updated_at: string;
  agent_id: number;
  config: any | null;
  banned_at: string | null;
}

export interface GameLaunchResponse {
  user: {
    id: number;
    username: string;
    nickname: string;
    balance: number;
    last_access_at: string;
    token: string;
  };
  userCreated: boolean;
  link: string;
}

export interface AddBalanceResponse {
  username: string;
  balance: number;
  amount: number;
  transaction_id: number;
  cached: boolean;
  requested_amount?: number;
  agent_balance?: number;
  message?: string;
  error?: string;
}

export interface SubBalanceResponse {
  username: string;
  balance: number;
  amount: number;
  transaction_id: number;
  cached: boolean;
  requested_amount?: number;
  message?: string;
  error?: string;
}

export interface SubBalanceAllResponse {
  username: string;
  balance: number;
  amount: number;
  transaction_id?: number;
  cached: boolean;
  message?: string;
}

export interface Transaction {
  id: number;
  type: 'bet' | 'win' | 'cancel' | 'tip' | 'add' | 'sub';
  amount: number;
  before: number;
  status: 'success' | 'pending' | 'failed';
  details: {
    game?: {
      id: string;
      type: string;
      round: string;
      title: string;
      vendor: string;
    }
  };
  processed_at: string;
  referer_id: number | null;
  created_at: string;
  user: {
    id: number;
    username: string;
  };
  external: {
    id: string;
    detail: any;
  } | null;
}

export interface VendorList {
  [vendorName: string]: {
    name: string;
    enabled: number;
  }
}

export interface Game {
  title: string;
  type: string;
  id: string;
  vendor: string;
  provider: string;
  thumbnail: string;
  thumbnails: {
    "300x300": string;
  };
  rank: number | null;
  langs: {
    ko?: string;
    en?: string;
    [key: string]: string | undefined;
  };
}

export interface Lobby {
  title: string;
  type: 'lobby';
  id: string;
  provider: string;
  thumbnail: string;
  thumbnails: {
    "300x300": string;
  };
  vendor: string;
}

// ============================================
// Proxy 서버를 통한 API 호출
// ============================================

interface ProxyConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
}

async function proxyCall<T = any>(
  config: ProxyConfig,
  apiKey: string,
  retries: number = 2
): Promise<T> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      console.log(`🔄 [HonorAPI] 재시도 ${attempt}/${retries}...`);
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
    }

    try {
      console.log(`📡 [HonorAPI] Proxy 호출 시작 (attempt ${attempt + 1}/${retries + 1}):`, {
        url: config.url,
        method: config.method,
        proxyUrl: PROXY_URL
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('⏰ [HonorAPI] 타임아웃 발생 (30초)');
        controller.abort();
      }, 30000); // 60초 → 30초로 단축

      const fetchBody = {
        ...config,
        headers: {
          ...config.headers,
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };

      console.log('📤 [HonorAPI] Fetch 요청 전송 중...');

      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fetchBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('📡 [HonorAPI] Proxy 응답 상태:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: config.url
      });

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = `응답 읽기 실패 (${response.status})`;
        }

        console.error(`❌ [HonorAPI] Proxy 서버 응답 (${response.status}):`, errorText);

        // api_sync_logs 기록
        try {
          await supabase.from('api_sync_logs').insert({
            opcode: 'honorapi',
            api_endpoint: config.url,
            sync_type: config.method,
            status: 'error',
            error_message: `HTTP ${response.status}: ${errorText}`,
            response_data: { http_status: response.status }
          });
        } catch (logError) {
          console.warn('⚠️ api_sync_logs 기록 실패:', logError);
        }

        // 401: 인증 실패 - 재시도 없이 즉시 실패
        if (response.status === 401) {
          throw new Error('인증 실패: Bearer Token이 유효하지 않습니다.');
        }

        // 429: Rate Limit - 재시도 없이 즉시 실패
        if (response.status === 429) {
          throw new Error(`API 호출 실패 (${response.status}): ${errorText}`);
        }

        // 5xx 오류는 재시도, 나머지 4xx 오류는 즉시 반환
        if (response.status >= 500 && attempt < retries) {
          lastError = new Error(`서버 오류 (${response.status}): ${errorText}`);
          continue;
        }

        throw new Error(`API 호출 실패 (${response.status}): ${errorText}`);
      }

      // 응답 데이터 파싱
      console.log('📄 [HonorAPI] 응답 읽기 시작...');
      const responseText = await response.text();

      if (attempt === 0) {
        console.log('📄 [HonorAPI] Raw 응답:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
      }

      if (!responseText.trim()) {
        console.warn('⚠️ [HonorAPI] 빈 응답 수신');
        if (attempt < retries) {
          lastError = new Error('빈 응답을 받았습니다');
          continue;
        }
        throw new Error('빈 응답을 받았습니다');
      }

      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('❌ [HonorAPI] JSON 파싱 실패:', responseText);
        throw new Error('응답 JSON 파싱 실패');
      }

      console.log('✅ [HonorAPI] 응답 파싱 완료:', {
        type: typeof result,
        isArray: Array.isArray(result),
        keys: typeof result === 'object' ? Object.keys(result) : null
      });

      // api_sync_logs 성공 기록
      try {
        await supabase.from('api_sync_logs').insert({
          opcode: 'honorapi',
          api_endpoint: config.url,
          sync_type: config.method,
          status: 'success',
          error_message: null,
          response_data: result
        });
      } catch (logError) {
        console.warn('⚠️ api_sync_logs 기록 실패:', logError);
      }

      return result;

    } catch (error: any) {
      lastError = error;

      console.error('❌ [HonorAPI] Catch 블록:', {
        errorName: error.name,
        errorMessage: error.message,
        attempt: attempt + 1,
        maxRetries: retries + 1
      });

      if (error.name === 'AbortError') {
        console.error('❌ [HonorAPI] API 호출 타임아웃');
        if (attempt < retries) {
          continue;
        }
        throw new Error('API 호출 타임아웃 (60초)');
      }

      if (error.message.includes('Failed to fetch') || error.message.includes('fetch')) {
        console.error('❌ [HonorAPI] 네트워크 오류:', error.message);
        if (attempt < retries) {
          continue;
        }
        throw new Error(`Proxy 서버(${PROXY_URL})에 연결할 수 없습니다. 네트워크 연결을 확인하세요.`);
      }

      console.error('❌ [HonorAPI] 호출 오류:', error);
      if (attempt < retries) {
        continue;
      }
      throw error;
    }
  }

  // 모든 재시도 실패
  const errorMessage = lastError instanceof Error ? lastError.message : '알 수 없는 오류';
  console.error('❌ [HonorAPI] 모든 재시도 실패:', errorMessage);

  // api_sync_logs 실패 기록
  try {
    await supabase.from('api_sync_logs').insert({
      opcode: 'honorapi',
      api_endpoint: config.url,
      sync_type: config.method,
      status: 'error',
      error_message: `재시도 ${retries}회 실패: ${errorMessage}`,
      response_data: null
    });
  } catch (logError) {
    console.warn('⚠️ api_sync_logs 기록 실패:', logError);
  }

  throw new Error(`API 호출 실패 (재시도 ${retries}회): ${errorMessage}`);
}

// ============================================
// Phase 1: 필수 API
// ============================================

/**
 * 1. 에이전트 본인 정보 조회
 * GET /my-info
 */
export async function getAgentInfo(apiKey: string): Promise<AgentInfo> {
  console.log('🔍 [HonorAPI] 에이전트 정보 조회 시작');
  
  const result = await proxyCall<AgentInfo>({
    url: `${HONORAPI_BASE_URL}/my-info`,
    method: 'GET'
  }, apiKey);

  console.log('✅ [HonorAPI] 에이전트 정보 조회 성공:', result);
  return result;
}

/**
 * 2. 유저 정보 조회
 * GET /user?username={username}
 */
export async function getUserInfo(apiKey: string, username: string): Promise<UserInfo> {
  console.log(`🔍 [HonorAPI] 유저 정보 조회: ${username}`);
  
  const result = await proxyCall<UserInfo>({
    url: `${HONORAPI_BASE_URL}/user?username=${encodeURIComponent(username)}`,
    method: 'GET'
  }, apiKey);

  console.log(`✅ [HonorAPI] 유저 정보 조회 성공: ${username}, 잔고: ${result.balance}`);
  return result;
}

/**
 * 3. 게임 실행 링크 조회 (자동 유저 생성 포함)
 * GET /game-launch-link?username={username}&game_id={gameId}&vendor={vendor}
 */
export async function getGameLaunchLink(
  apiKey: string,
  username: string,
  gameId: string,
  vendor: string
): Promise<GameLaunchResponse> {
  console.log(`🎮 [HonorAPI] 게임 실행 링크 조회: user=${username}, game=${gameId}, vendor=${vendor}`);
  
  const params = new URLSearchParams({
    username,
    game_id: gameId,
    vendor
  });

  const result = await proxyCall<GameLaunchResponse>({
    url: `${HONORAPI_BASE_URL}/game-launch-link?${params.toString()}`,
    method: 'GET'
  }, apiKey);

  console.log(`✅ [HonorAPI] 게임 실행 링크 조회 성공: ${username}, 신규유저: ${result.userCreated}`);
  return result;
}

/**
 * 4. 유저 머니 지급 (입금)
 * POST /user/add-balance?username={username}&amount={amount}&uuid={uuid}
 * ⚠️ Rate Limit: 유저당 1초에 1회
 */
export async function addUserBalance(
  apiKey: string,
  username: string,
  amount: number,
  uuid?: string
): Promise<AddBalanceResponse> {
  console.log(`💰 [HonorAPI] 유저 머니 지급: ${username}, 금액: ${amount}, uuid: ${uuid || 'N/A'}`);
  
  const params = new URLSearchParams({
    username,
    amount: amount.toString()
  });

  if (uuid) {
    params.append('uuid', uuid);
  }

  const result = await proxyCall<AddBalanceResponse>({
    url: `${HONORAPI_BASE_URL}/user/add-balance?${params.toString()}`,
    method: 'POST'
  }, apiKey);

  if (result.error) {
    console.error(`❌ [HonorAPI] 유저 머니 지급 실패: ${result.error}`);
    throw new Error(result.error);
  }

  console.log(`✅ [HonorAPI] 유저 머니 지급 성공: ${username}, 잔고: ${result.balance}, cached: ${result.cached}`);
  return result;
}

/**
 * 5. 유저 머니 회수 (출금)
 * POST /user/sub-balance?username={username}&amount={amount}&uuid={uuid}
 * ⚠️ Rate Limit: 유저당 1초에 1회
 */
export async function subUserBalance(
  apiKey: string,
  username: string,
  amount: number,
  uuid?: string
): Promise<SubBalanceResponse> {
  console.log(`💸 [HonorAPI] 유저 머니 회수: ${username}, 금액: ${amount}, uuid: ${uuid || 'N/A'}`);
  
  const params = new URLSearchParams({
    username,
    amount: amount.toString()
  });

  if (uuid) {
    params.append('uuid', uuid);
  }

  const result = await proxyCall<SubBalanceResponse>({
    url: `${HONORAPI_BASE_URL}/user/sub-balance?${params.toString()}`,
    method: 'POST'
  }, apiKey);

  if (result.error) {
    console.error(`❌ [HonorAPI] 유저 머니 회수 실패: ${result.error}`);
    throw new Error(result.error);
  }

  console.log(`✅ [HonorAPI] 유저 머니 회수 성공: ${username}, 잔고: ${result.balance}, cached: ${result.cached}`);
  return result;
}

/**
 * 6. 유저 머니 전체 회수
 * POST /user/sub-balance-all?username={username}&uuid={uuid}
 * ⚠️ Rate Limit: 유저당 1초에 1회
 */
export async function subUserBalanceAll(
  apiKey: string,
  username: string,
  uuid?: string
): Promise<SubBalanceAllResponse> {
  console.log(`💸 [HonorAPI] 유저 머니 전체 회수: ${username}, uuid: ${uuid || 'N/A'}`);
  
  const params = new URLSearchParams({
    username
  });

  if (uuid) {
    params.append('uuid', uuid);
  }

  const result = await proxyCall<SubBalanceAllResponse>({
    url: `${HONORAPI_BASE_URL}/user/sub-balance-all?${params.toString()}`,
    method: 'POST'
  }, apiKey);

  console.log(`✅ [HonorAPI] 유저 머니 전체 회수 성공: ${username}, 회수금액: ${result.amount}, cached: ${result.cached}`);
  return result;
}

/**
 * 7. 통합 트랜잭션 조회
 * GET /transactions?start={start}&end={end}&page={page}&perPage={perPage}
 * ⚠️ 중요: 검색 기간은 반드시 1시간 이내로 설정
 * ⚠️ 조회 가능 기간: 최대 14일 전까지
 */
export async function getTransactions(
  apiKey: string,
  start: string,
  end: string,
  page: number = 1,
  perPage: number = 1000,
  withDetails: boolean = true  // ✅ external.detail 포함 여부
): Promise<{ data: Transaction[] }> {
  console.log(`📊 [HonorAPI] 트랜잭션 조회: ${start} ~ ${end}, page: ${page}, perPage: ${perPage}, withDetails: ${withDetails}`);
  
  const params = new URLSearchParams({
    start,
    end,
    page: page.toString(),
    perPage: perPage.toString()
  });

  // ✅ withDetails 파라미터 추가 (external.detail 포함)
  if (withDetails) {
    params.append('withDetails', '1');
  }

  console.log(`🔍 [HonorAPI] API URL: ${HONORAPI_BASE_URL}/transactions?${params.toString()}`);
  console.log(`🔑 [HonorAPI] API Key: ${apiKey.substring(0, 10)}...`);

  const result = await proxyCall<{ data: Transaction[] }>({
    url: `${HONORAPI_BASE_URL}/transactions?${params.toString()}`,
    method: 'GET'
  }, apiKey);

  console.log(`✅ [HonorAPI] 트랜잭션 조회 성공: ${result.data?.length || 0}건`);
  return result;
}

// ============================================
// Phase 2: 게임 관리 API
// ============================================

/**
 * 8. 벤더 리스트 조회
 * GET /vendor-list
 */
export async function getVendorList(apiKey: string): Promise<VendorList> {
  console.log('🔍 [HonorAPI] 벤더 리스트 조회 시작');
  
  const result = await proxyCall<VendorList>({
    url: `${HONORAPI_BASE_URL}/vendor-list`,
    method: 'GET'
  }, apiKey);

  console.log(`✅ [HonorAPI] 벤더 리스트 조회 성공: ${Object.keys(result).length}개`);
  return result;
}

/**
 * 9. 게임 리스트 조회
 * GET /game-list?vendor={vendor}
 */
export async function getGameList(apiKey: string, vendor: string): Promise<Game[]> {
  console.log(`🔍 [HonorAPI] 게임 리스트 조회: vendor=${vendor}`);
  
  const result = await proxyCall<Game[]>({
    url: `${HONORAPI_BASE_URL}/game-list?vendor=${encodeURIComponent(vendor)}`,
    method: 'GET'
  }, apiKey);

  console.log(`✅ [HonorAPI] 게임 리스트 조회 성공: ${result.length}개`);
  return result;
}

/**
 * 10. 로비 리스트 조회
 * GET /lobby-list
 */
export async function getLobbyList(apiKey: string): Promise<Lobby[]> {
  console.log('🔍 [HonorAPI] 로비 리스트 조회 시작');
  
  const result = await proxyCall<Lobby[]>({
    url: `${HONORAPI_BASE_URL}/lobby-list`,
    method: 'GET'
  }, apiKey);

  console.log(`✅ [HonorAPI] 로비 리스트 조회 성공: ${result.length}개`);
  return result;
}

// ============================================
// Phase 3: 조직 관리 API
// ============================================

/**
 * 11. 직속 유저 리스트 조회
 * GET /user-list?page={page}&perPage={perPage}
 */
export async function getUserList(
  apiKey: string,
  page: number = 1,
  perPage: number = 5000
): Promise<UserInfo[]> {
  console.log(`🔍 [HonorAPI] 직속 유저 리스트 조회: page=${page}, perPage=${perPage}`);
  
  const params = new URLSearchParams({
    page: page.toString(),
    perPage: perPage.toString()
  });

  const result = await proxyCall<UserInfo[]>({
    url: `${HONORAPI_BASE_URL}/user-list?${params.toString()}`,
    method: 'GET'
  }, apiKey);

  console.log(`✅ [HonorAPI] 직속 유저 리스트 조회 성공: ${result.length}명`);
  return result;
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * HonorAPI 베팅 내역 동기화
 * 최근 1시간 내 트랜잭션을 조회하여 game_records에 저장
 */
export async function syncHonorApiBettingHistory(): Promise<{
  success: boolean;
  recordsProcessed: number;
  recordsSaved: number;
  error?: string;
}> {
  console.log('🔄 [HonorAPI] 베팅 내역 동기화 시작');

  try {
    // Lv1 HonorAPI credentials 조회
    const { getLv1HonorApiCredentials } = await import('./apiConfigHelper');
    const credentials = await getLv1HonorApiCredentials();

    if (!credentials) {
      console.error('❌ [HonorAPI] credentials를 찾을 수 없습니다.');
      throw new Error('HonorAPI credentials를 찾을 수 없습니다.');
    }

    const { api_key } = credentials;
    
    if (!api_key) {
      console.error('❌ [HonorAPI] api_key가 없습니다.');
      throw new Error('HonorAPI api_key가 설정되지 않았습니다.');
    }
    
    console.log('✅ [HonorAPI] Credentials 확인 완료');

    // ✅ 24시간 전부터 현재까지 조회 (OroPlay와 동일)
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24시간 전

    const startTime = formatUTC(dayAgo);
    const endTime = formatUTC(now);

    console.log(`📅 [HonorAPI] 조회 기간: ${startTime} ~ ${endTime} (UTC, 최근 24시간)`);

    // 트랜잭션 조회
    let transactions: Transaction[] = [];
    try {
      const result = await getTransactions(api_key, startTime, endTime, 1, 1000);
      transactions = result.data || [];
      console.log(`📊 [HonorAPI] 트랜잭션 조회 완료: ${transactions.length}건`);
    } catch (txError) {
      console.error('❌ [HonorAPI] 트랜잭션 조회 실패:', txError);
      throw txError;
    }

    if (transactions.length === 0) {
      console.log('ℹ️ [HonorAPI] 조회된 트랜잭션이 없습니다.');
      return {
        success: true,
        recordsProcessed: 0,
        recordsSaved: 0
      };
    }

    let recordsSaved = 0;

    // 각 트랜잭션을 game_records에 저장
    for (const tx of transactions) {
      // bet 타입만 처리 (win, cancel 등은 제외)
      if (tx.type !== 'bet') {
        continue;
      }

      // 게임 정보가 없으면 건너뛰기
      if (!tx.details?.game) {
        console.warn(`⚠️ [HonorAPI] 게임 정보 없음: txid=${tx.id}`);
        continue;
      }

      try {
        // 사용자 정보 조회 (username으로)
        const { data: user } = await supabase
          .from('users')
          .select('id, referrer_id')
          .eq('username', tx.user.username)
          .single();

        if (!user) {
          console.warn(`⚠️ [HonorAPI] 사용자 없음: username=${tx.user.username}`);
          continue;
        }

        // 게임 정보 조회 (game_code로)
        const { data: game } = await supabase
          .from('honor_games')
          .select('id, provider_id, name, type')
          .eq('game_code', tx.details.game.id)
          .single();

        // 제공사 정보 조회 (HonorAPI 전용)
        let providerName = '';

        if (game?.provider_id) {
          const { data: provider } = await supabase
            .from('honor_game_providers')
            .select('name')
            .eq('id', game.provider_id)
            .single();
          
          // ⭐ DB에 제공사 이름이 있으면 사용, 없으면 API 응답값 (vendor) 사용
          providerName = provider?.name || tx.details.game.vendor || 'Unknown Provider';
        } else {
          // ⭐ game이 없을 경우, API 응답값 (vendor) 사용
          providerName = tx.details.game.vendor || 'Unknown Provider';
        }

        // 같은 라운드의 win 트랜잭션 찾기
        const winTx = transactions.find(
          t => t.type === 'win' && 
               t.details?.game?.round === tx.details.game.round &&
               t.user.username === tx.user.username
        );

        const winAmount = winTx?.amount || 0;
        
        // ✅ 베팅액은 항상 양수로 저장 (HonorAPI는 bet를 음수로 전송)
        const betAmount = Math.abs(tx.amount);
        
        // ✅ 올바른 잔액 계산: balance_after = balance_before - betAmount + winAmount
        const balanceAfter = tx.before - betAmount + winAmount;

        // ✅ external 데이터 추출 (게임 상세 결과)
        const external = tx.external ? {
          id: tx.external.id,
          detail: tx.external.detail
        } : null;

        // game_records에 저장 (중복 체크: external_txid + api_type unique)
        const { error: insertError } = await supabase
          .from('game_records')
          .insert({
            external_txid: tx.id,
            user_id: user.id,
            username: tx.user.username,
            game_id: game?.id || null,
            provider_id: null,  // ⚠️ HonorAPI는 별도 provider 테이블 사용 (game_providers FK 제약 회피)
            provider_name: providerName,  // ⭐ 항상 유효한 값 보장
            game_provider_name: providerName,  // ✅ 일관성을 위한 추가 필드
            game_title: game?.name || tx.details.game.title || tx.details.game.id || 'Unknown',  // ⭐ fallback 추가
            game_name: game?.name || tx.details.game.title || tx.details.game.id || 'Unknown',  // ✅ 일관성을 위한 추가 필드
            game_type: game?.type || tx.details.game.type || 'slot',
            bet_amount: betAmount,
            win_amount: winAmount,
            balance_before: tx.before,
            balance_after: balanceAfter,
            played_at: tx.processed_at,
            session_id: null,
            round_id: tx.details.game.round || null,
            partner_id: user.referrer_id,
            api_type: 'honorapi',
            sync_status: 'synced',
            time_category: 'recent',
            currency: 'KRW',
            external: external  // ✅ 게임 상세 결과 저장
          } as any);  // ⭐ id는 자동 생성되므로 제외

        if (insertError) {
          // unique constraint 위반은 정상 (이미 저장된 데이터)
          if (insertError.code === '23505') {
            // console.log(`⏭️ [HonorAPI] 이미 저장된 트랜잭션: txid=${tx.id}`);
          } else {
            console.error(`❌ [HonorAPI] game_records 저장 실패: txid=${tx.id}`, insertError);
          }
        } else {
          recordsSaved++;
        }

      } catch (error) {
        console.error(`❌ [HonorAPI] 트랜잭션 처리 실패: txid=${tx.id}`, error);
      }
    }

    console.log(`✅ [HonorAPI] 베팅 내역 동기화 완료: ${recordsSaved}/${transactions.length}건 저장`);

    return {
      success: true,
      recordsProcessed: transactions.length,
      recordsSaved
    };

  } catch (error) {
    console.error('❌ [HonorAPI] 베팅 내역 동기화 실패:', error);
    return {
      success: false,
      recordsProcessed: 0,
      recordsSaved: 0,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
}

/**
 * UTC 시간 포맷팅 (YYYY-MM-DD HH:mm:ss)
 */
export function formatUTC(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/**
 * UUID 생성 (멱등성 보장용)
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================
// 게임 동기화 함수
// ============================================

/**
 * HonorAPI 게임 제공사 및 게임 목록 동기화
 * honor_game_providers와 honor_games 테이블에 저장
 */
export async function syncHonorApiGames(): Promise<{
  newProviders: number;
  updatedProviders: number;
  newGames: number;
  updatedGames: number;
}> {
  console.log('🔄 [HonorAPI] 게임 동기화 시작');

  // Lv1 HonorAPI credentials 조회
  const { getLv1HonorApiCredentials } = await import('./apiConfigHelper');
  const credentials = await getLv1HonorApiCredentials();

  if (!credentials) {
    throw new Error('HonorAPI credentials를 찾을 수 없습니다.');
  }

  const { api_key } = credentials;

  let newProviders = 0;
  let updatedProviders = 0;
  let newGames = 0;
  let updatedGames = 0;

  try {
    // 1. 벤더 목록 조회
    const vendorList = await getVendorList(api_key);
    console.log(`📋 [HonorAPI] 벤더 리스트: ${Object.keys(vendorList).length}개`);

    // 2. 배치 처리 (동시에 5개씩만 처리) ⚡
    const vendorEntries = Object.entries(vendorList);
    const BATCH_SIZE = 5; // 동시에 5개씩만 처리
    
    console.log(`🔄 [HonorAPI] 배치 처리 시작 (배치 크기: ${BATCH_SIZE})`);

    for (let i = 0; i < vendorEntries.length; i += BATCH_SIZE) {
      const batch = vendorEntries.slice(i, i + BATCH_SIZE);
      console.log(`📦 [HonorAPI] 배치 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(vendorEntries.length / BATCH_SIZE)}: ${batch.map(([name]) => name).join(', ')}`);

      const vendorPromises = batch.map(async ([vendorName, vendorData]) => {
        console.log(`🔄 [HonorAPI] 벤더 처리: ${vendorName} (${vendorData.name})`);

        // 3. 해당 벤더의 게임 목록 조회
        try {
          const games = await getGameList(api_key, vendorName);
          console.log(`📋 [HonorAPI] ${vendorData.name} 게임 목록: ${games.length}개`);

          if (games.length === 0) {
            console.log(`⚠️ [HonorAPI] ${vendorData.name}: 게임이 없어 건너뜁니다.`);
            return { newProviders: 0, updatedProviders: 0, newGames: 0, updatedGames: 0 };
          }

          // 벤더 타입 결정: 게임 type 필드를 기반으로 결정
          const casinoGameTypes = ['baccarat', 'blackjack', 'roulette', 'sicbo', 'dragontiger', 'poker', 'wheel', 'live'];
          
          // ✅ 벤더 이름으로도 카지노 타입 판별 (Evolution, Asia Gaming, Ezugi, SA Gaming 등)
          const casinoVendorNames = ['evolution', 'asiagaming', 'ezugi', 'sa gaming', 'sagaming', 'pragmatic play live', 'pragmaticplay live', 'dream gaming', 'dreamgaming', 'sexy', 'wm', 'allbet', 'og', 'microgaming', 'skywind'];
          const vendorNameLower = vendorData.name.toLowerCase();
          const isCasinoVendor = casinoVendorNames.some(name => vendorNameLower.includes(name));
          
          const hasCasinoGames = games.some(g => casinoGameTypes.includes(g.type.toLowerCase()));
          const vendorType: 'slot' | 'casino' = (hasCasinoGames || isCasinoVendor) ? 'casino' : 'slot';

          console.log(`🎮 [HonorAPI] ${vendorData.name} 타입: ${vendorType} (isCasinoVendor: ${isCasinoVendor}, hasCasinoGames: ${hasCasinoGames})`);

          // honor_game_providers에 벤더 저장/업데이트
          const { data: existingProvider } = await supabase
            .from('honor_game_providers')
            .select('id')
            .eq('name', vendorData.name)
            .single();

          let providerId: number;
          let localNewProviders = 0;
          let localUpdatedProviders = 0;

          if (existingProvider) {
            // 기존 제공사 업데이트
            await supabase
              .from('honor_game_providers')
              .update({
                vendor_code: vendorName,
                type: vendorType,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingProvider.id);

            providerId = existingProvider.id;
            localUpdatedProviders++;
            console.log(`✅ [HonorAPI] 제공사 업데이트: ${vendorData.name} (ID: ${providerId}, type: ${vendorType})`);
          } else {
            // 신규 제공사 추가
            const { data: newProvider, error: insertError } = await supabase
              .from('honor_game_providers')
              .insert({
                name: vendorData.name,
                vendor_code: vendorName,
                type: vendorType,
                status: 'visible',
                is_visible: true
              })
              .select('id')
              .single();

            if (insertError || !newProvider) {
              console.error(`❌ [HonorAPI] 제공사 추가 실패: ${vendorData.name}`, insertError);
              
              // unique constraint 위반인 경우 기존 제공사 찾기
              if (insertError?.code === '23505') {
                console.log(`🔄 [HonorAPI] 제공사 중복, 기존 제공사 조회: ${vendorData.name}`);
                
                // vendor_code나 name으로 다시 조회
                const { data: retryProvider } = await supabase
                  .from('honor_game_providers')
                  .select('id')
                  .or(`name.eq.${vendorData.name},vendor_code.eq.${vendorName}`)
                  .single();
                
                if (retryProvider) {
                  providerId = retryProvider.id;
                  updatedProviders++;
                  console.log(`✅ [HonorAPI] 기존 제공사 사용: ${vendorData.name} (ID: ${providerId})`);
                } else {
                  console.error(`❌ [HonorAPI] 제공사 재조회 실패: ${vendorData.name}`);
                  return { newProviders: 0, updatedProviders: 0, newGames: 0, updatedGames: 0 };
                }
              } else {
                return { newProviders: 0, updatedProviders: 0, newGames: 0, updatedGames: 0 };
              }
            } else {
              providerId = newProvider.id;
              localNewProviders++;
              console.log(`✅ [HonorAPI] 제공사 추가: ${vendorData.name} (ID: ${providerId})`);
            }
          }

          // 4. 각 게임 저장/업데이트 (병렬 처리)
          let localNewGames = 0;
          let localUpdatedGames = 0;

          const gamePromises = games.map(async (game) => {
            // ⭐⭐⭐ 중요: 제공사의 타입(vendorType)을 우선 사용!
            // Evolution이 'casino'라면, Evolution의 모든 게임은 'casino'로 저장!
            const gameType: 'slot' | 'casino' = vendorType;

            // ✅ game_code만으로 중복 체크 (provider_id 제외)
            const { data: existingGame } = await supabase
              .from('honor_games')
              .select('id')
              .eq('game_code', String(game.id))
              .single();

            if (existingGame) {
              // 기존 게임 업데이트
              await supabase
                .from('honor_games')
                .update({
                  provider_id: providerId, // ✅ 제공사 정보도 업데이트
                  name: game.title,
                  name_en: game.title,
                  name_ko: game.langs?.ko || game.title, // ✅ 한국어 이름!
                  vendor_code: vendorName,
                  type: gameType,
                  image_url: game.thumbnail,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingGame.id);

              return 'updated';
            } else {
              // 신규 게임 추가
              await supabase
                .from('honor_games')
                .insert({
                  provider_id: providerId,
                  name: game.title,
                  name_en: game.title,
                  name_ko: game.langs?.ko || game.title, // ✅ 한국어 이름!
                  vendor_code: vendorName,
                  type: gameType,
                  status: 'visible', // ✅ GMS 어드민 기본 노출
                  is_visible: true, // ✅ GMS 어드민 기본 노출
                  image_url: game.thumbnail,
                  game_code: String(game.id),
                  demo_available: false,
                  is_featured: false,
                  priority: game.rank || 0
                });

              return 'new';
            }
          });

          const gameResults = await Promise.all(gamePromises);
          localNewGames = gameResults.filter(r => r === 'new').length;
          localUpdatedGames = gameResults.filter(r => r === 'updated').length;

          console.log(`✅ [HonorAPI] ${vendorData.name} 게임 동기화 완료 (신규: ${localNewGames}, 업데이트: ${localUpdatedGames})`);
          
          return { 
            newProviders: localNewProviders, 
            updatedProviders: localUpdatedProviders, 
            newGames: localNewGames, 
            updatedGames: localUpdatedGames 
          };
          
        } catch (gameError) {
          console.error(`❌ [HonorAPI] ${vendorData.name} 게임 조회 실패:`, gameError);
          return { newProviders: 0, updatedProviders: 0, newGames: 0, updatedGames: 0 };
        }
      });

      // 모든 벤더 처리 완료 대기
      const vendorResults = await Promise.all(vendorPromises);
      
      // 결과 집계
      vendorResults.forEach(result => {
        newProviders += result.newProviders;
        updatedProviders += result.updatedProviders;
        newGames += result.newGames;
        updatedGames += result.updatedGames;
      });
    }

    // 5. 로비 목록도 처리 (vendor별로 구분)
    try {
      const lobbies = await getLobbyList(api_key);
      console.log(`📋 [HonorAPI] 로비 목록: ${lobbies.length}개`);

      // 벤더별로 로비 그룹화
      const lobbiesByVendor = new Map<string, typeof lobbies>();
      for (const lobby of lobbies) {
        if (!lobbiesByVendor.has(lobby.vendor)) {
          lobbiesByVendor.set(lobby.vendor, []);
        }
        lobbiesByVendor.get(lobby.vendor)!.push(lobby);
      }

      console.log(`🔍 [HonorAPI] ${lobbiesByVendor.size}개 벤더의 로비 발견`);

      // 각 벤더별로 병렬 처리 ⚡
      const lobbyPromises = Array.from(lobbiesByVendor.entries()).map(async ([vendorName, vendorLobbies]) => {
        console.log(`🔄 [HonorAPI] ${vendorName} 로비 처리: ${vendorLobbies.length}개`);

        // 해당 벤더의 제공사 찾기
        const { data: vendorProvider } = await supabase
          .from('honor_game_providers')
          .select('id')
          .eq('vendor_code', vendorName)
          .single();

        let providerId: number;

        if (vendorProvider) {
          providerId = vendorProvider.id;
          console.log(`✅ [HonorAPI] 기존 제공사 발견: ${vendorName} (ID: ${providerId})`);
        } else {
          // 제공사가 없으면 생성 (벤더 정보에서 이름 가져오기)
          const vendorInfo = vendorList[vendorName];
          const providerName = vendorInfo?.name || vendorName;

          const { data: newProvider, error: insertError } = await supabase
            .from('honor_game_providers')
            .insert({
              name: providerName,
              vendor_code: vendorName,
              type: 'casino', // 로비는 카지노 타입
              status: 'visible',
              is_visible: true
            })
            .select('id')
            .single();

          if (insertError || !newProvider) {
            console.error(`❌ [HonorAPI] ${vendorName} 제공사 생성 실패`, insertError);
            
            // unique constraint 위반인 경우 기존 제공사 찾기
            if (insertError?.code === '23505') {
              console.log(`🔄 [HonorAPI] 로비 제공사 중복, 기존 제공사 조회: ${providerName}`);
              
              const { data: retryProvider } = await supabase
                .from('honor_game_providers')
                .select('id')
                .or(`name.eq.${providerName},vendor_code.eq.${vendorName}`)
                .single();
              
              if (retryProvider) {
                providerId = retryProvider.id;
                console.log(`✅ [HonorAPI] 기존 제공사 사용: ${providerName} (ID: ${providerId})`);
              } else {
                console.error(`❌ [HonorAPI] 제공사 재조회 실패: ${providerName}`);
                return { newProviders: 0, updatedProviders: 0, newGames: 0, updatedGames: 0 };
              }
            } else {
              return { newProviders: 0, updatedProviders: 0, newGames: 0, updatedGames: 0 };
            }
          } else {
            providerId = newProvider.id;
            newProviders++;
            console.log(`✅ [HonorAPI] 제공사 생성: ${providerName} (ID: ${providerId}, vendor_code: ${vendorName})`);
          }
        }

        // 각 로비 저장
        for (const lobby of vendorLobbies) {
          // ✅ game_code만으로 중복 체크 (provider_id 제외)
          const { data: existingLobby } = await supabase
            .from('honor_games')
            .select('id')
            .eq('game_code', String(lobby.id))
            .single();

          if (existingLobby) {
            await supabase
              .from('honor_games')
              .update({
                provider_id: providerId, // ✅ 제공사 정보도 업데이트
                name: lobby.title, // ✅ HonorAPI Lobby: title 필드
                name_en: lobby.title,
                name_ko: lobby.langs?.ko || lobby.title, // ✅ HonorAPI Lobby: langs.ko 필드
                vendor_code: vendorName, // ✅ vendor 저장
                image_url: lobby.thumbnail, // ✅ HonorAPI Lobby: thumbnail 필드
                updated_at: new Date().toISOString()
              })
              .eq('id', existingLobby.id);

            updatedGames++;
          } else {
            await supabase
              .from('honor_games')
              .insert({
                provider_id: providerId,
                name: lobby.title, // ✅ HonorAPI Lobby: title 필드
                name_en: lobby.title,
                name_ko: lobby.langs?.ko || lobby.title, // ✅ HonorAPI Lobby: langs.ko 필드
                vendor_code: vendorName, // ✅ vendor 저장
                type: 'casino', // 로비는 카지노 타입
                status: 'visible', // ✅ GMS 어드민 기본 노출
                is_visible: true, // ✅ GMS 어드민 기본 노출
                image_url: lobby.thumbnail, // ✅ HonorAPI Lobby: thumbnail 필드
                game_code: String(lobby.id), // ✅ HonorAPI Lobby: id를 game_code로 저장
                demo_available: false,
                is_featured: false,
                priority: lobby.rank || 0 // ✅ HonorAPI Lobby: rank 필드
              });

            newGames++;
          }
        }

        console.log(`✅ [HonorAPI] ${vendorName} 로비 동기화 완료`);
        
        return { newProviders: 0, updatedProviders: 0, newGames: 0, updatedGames: 0 };
      });

      // 모든 로비 처리 완료 대기
      const lobbyResults = await Promise.all(lobbyPromises);
      
      // 결과 집계
      lobbyResults.forEach(result => {
        newProviders += result.newProviders;
        updatedProviders += result.updatedProviders;
        newGames += result.newGames;
        updatedGames += result.updatedGames;
      });

      console.log(`✅ [HonorAPI] 전체 로비 동기화 완료`);
    } catch (lobbyError) {
      console.error(`❌ [HonorAPI] 로비 조회 실패:`, lobbyError);
    }

    console.log(`✅ [HonorAPI] 게임 동기화 완료:`, {
      newProviders,
      updatedProviders,
      newGames,
      updatedGames
    });

    return { newProviders, updatedProviders, newGames, updatedGames };
  } catch (error) {
    console.error('❌ [HonorAPI] 게임 동기화 실패:', error);
    throw error;
  }
}

/**
 * 🆕 HonorAPI 특정 제공사만 동기화 (예: skywind)
 * @param vendorNameOrCode - 제공사 이름 또는 vendor_code (예: 'skywind' 또는 'Skywind Live')
 */
export async function syncSpecificHonorApiProvider(vendorNameOrCode: string): Promise<{
  newProviders: number;
  updatedProviders: number;
  newGames: number;
  updatedGames: number;
}> {
  console.log(`🔄 [HonorAPI] 특정 제공사 동기화 시작: ${vendorNameOrCode}`);

  // Lv1 HonorAPI credentials 조회
  const { getLv1HonorApiCredentials } = await import('./apiConfigHelper');
  const credentials = await getLv1HonorApiCredentials();

  if (!credentials) {
    throw new Error('HonorAPI credentials를 찾을 수 없습니다.');
  }

  const { api_key } = credentials;

  try {
    // 1. 벤더 목록 조회
    const vendorList = await getVendorList(api_key);
    console.log(`📋 [HonorAPI] 벤더 리스트: ${Object.keys(vendorList).length}개`);

    // 2. 해당 벤더 찾기 (vendor_code 또는 name으로 검색)
    const vendorNameOrCodeLower = vendorNameOrCode.toLowerCase();
    const targetVendorEntry = Object.entries(vendorList).find(([vendorCode, vendorData]) => 
      vendorCode.toLowerCase() === vendorNameOrCodeLower || 
      vendorData.name.toLowerCase() === vendorNameOrCodeLower ||
      vendorData.name.toLowerCase().includes(vendorNameOrCodeLower)
    );

    if (!targetVendorEntry) {
      throw new Error(`HonorAPI에서 ${vendorNameOrCode} 제공사를 찾을 수 없습니다.`);
    }

    const [vendorCode, vendorData] = targetVendorEntry;
    console.log(`🔍 [HonorAPI] 제공사 발견: ${vendorData.name} (vendor_code: ${vendorCode})`);

    // 3. 해당 벤더의 게임 목록 조회
    const games = await getGameList(api_key, vendorCode);
    console.log(`📋 [HonorAPI] ${vendorData.name} 게임 목록: ${games.length}개`);

    if (games.length === 0) {
      console.log(`⚠️ [HonorAPI] ${vendorData.name}: 게임이 없습니다.`);
      return { newProviders: 0, updatedProviders: 0, newGames: 0, updatedGames: 0 };
    }

    // 벤더 타입 결정
    const casinoGameTypes = ['baccarat', 'blackjack', 'roulette', 'sicbo', 'dragontiger', 'poker', 'wheel', 'live'];
    const casinoVendorNames = ['evolution', 'asiagaming', 'ezugi', 'sa gaming', 'sagaming', 'pragmatic play live', 'pragmaticplay live', 'dream gaming', 'dreamgaming', 'sexy', 'wm', 'allbet', 'og', 'microgaming', 'skywind'];
    const vendorNameLower = vendorData.name.toLowerCase();
    const isCasinoVendor = casinoVendorNames.some(name => vendorNameLower.includes(name));
    const hasCasinoGames = games.some(g => casinoGameTypes.includes(g.type.toLowerCase()));
    const vendorType: 'slot' | 'casino' = (hasCasinoGames || isCasinoVendor) ? 'casino' : 'slot';

    console.log(`🎮 [HonorAPI] ${vendorData.name} 타입: ${vendorType}`);

    // 4. honor_game_providers에 벤더 저장/업데이트
    const { data: existingProvider } = await supabase
      .from('honor_game_providers')
      .select('id')
      .eq('vendor_code', vendorCode)
      .single();

    let providerId: number;
    let newProviders = 0;
    let updatedProviders = 0;

    if (existingProvider) {
      // 기존 제공사 업데이트
      await supabase
        .from('honor_game_providers')
        .update({
          name: vendorData.name,
          type: vendorType,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProvider.id);

      providerId = existingProvider.id;
      updatedProviders++;
      console.log(`✅ [HonorAPI] 제공사 업데이트: ${vendorData.name} (ID: ${providerId})`);
    } else {
      // 신규 제공사 추가
      const { data: newProvider, error: insertError } = await supabase
        .from('honor_game_providers')
        .insert({
          name: vendorData.name,
          vendor_code: vendorCode,
          type: vendorType,
          status: 'visible',
          is_visible: true
        })
        .select('id')
        .single();

      if (insertError || !newProvider) {
        console.error(`❌ [HonorAPI] 제공사 추가 실패: ${vendorData.name}`, insertError);
        throw new Error(`제공사 추가 실패: ${insertError?.message}`);
      }

      providerId = newProvider.id;
      newProviders++;
      console.log(`✅ [HonorAPI] 제공사 추가: ${vendorData.name} (ID: ${providerId})`);
    }

    // 5. 각 게임 저장/업데이트
    let newGames = 0;
    let updatedGames = 0;

    console.log(`💾 [HonorAPI] ${vendorData.name}: ${games.length}개 게임 동기화 시작...`);

    for (const game of games) {
      // title 필드 검증 - null이나 undefined면 스킵
      if (!game.title || typeof game.title !== 'string' || game.title.trim() === '') {
        console.warn(`⚠️ [HonorAPI] 게임 이름이 없어서 스킵: game_id=${game.id}`);
        continue;
      }

      const gameType: 'slot' | 'casino' = vendorType;

      const { data: existingGame } = await supabase
        .from('honor_games')
        .select('id')
        .eq('game_code', String(game.id))
        .single();

      if (existingGame) {
        // 기존 게임 업데이트
        await supabase
          .from('honor_games')
          .update({
            provider_id: providerId,
            name: game.title.trim(),
            name_en: game.title.trim(),
            name_ko: game.langs?.ko || game.title.trim(),
            vendor_code: vendorCode,
            type: gameType,
            image_url: game.thumbnail || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingGame.id);

        updatedGames++;
      } else {
        // 신규 게임 추가
        const { error: gameInsertError } = await supabase
          .from('honor_games')
          .insert({
            provider_id: providerId,
            name: game.title.trim(),
            name_en: game.title.trim(),
            name_ko: game.langs?.ko || game.title.trim(),
            type: gameType,
            api_type: 'honorapi',
            status: 'visible',
            is_visible: true,
            vendor_code: vendorCode,
            game_code: String(game.id),
            image_url: game.thumbnail || null,
            demo_available: false,
            is_featured: false,
            priority: 0
          });

        if (gameInsertError) {
          console.error(`❌ [HonorAPI] 게임 추가 실패: ${game.title}`, gameInsertError);
        } else {
          newGames++;
        }
      }
    }

    console.log(`✅ [HonorAPI] ${vendorData.name} 동기화 완료: 신규 게임 ${newGames}개, 업데이트 ${updatedGames}개`);

    return { newProviders, updatedProviders, newGames, updatedGames };
  } catch (error) {
    console.error(`❌ [HonorAPI] ${vendorNameOrCode} 동기화 실패:`, error);
    throw error;
  }
}

// ============================================
// Seamless Wallet 헬퍼 함수 (OroPlay와 동일한 구조)
// ============================================

/**
 * 게임 시작 시 입금 (Seamless Wallet)
 * @param apiKey - HonorAPI API Key
 * @param username - 사용자명
 * @param amount - 입금 금액
 * @param uuid - 거래 고유 ID (멱등성 보장)
 * @returns 성공 여부와 잔고
 */
export async function depositBalance(
  apiKey: string,
  username: string,
  amount: number,
  uuid?: string
): Promise<{ success: boolean; balance?: number; error?: string }> {
  try {
    const result = await addUserBalance(apiKey, username, amount, uuid);
    return {
      success: true,
      balance: result.balance
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
 * @param apiKey - HonorAPI API Key
 * @param username - 사용자명
 * @param uuid - 거래 고유 ID (멱등성 보장)
 * @returns 성공 여부와 회수 금액
 */
export async function withdrawBalance(
  apiKey: string,
  username: string,
  uuid?: string
): Promise<{ success: boolean; balance?: number; error?: string }> {
  try {
    const result = await subUserBalanceAll(apiKey, username, uuid);
    return {
      success: true,
      balance: result.amount // 회수된 금액
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
 * @param response - API 응답 객체
 * @param username - 사용자명 (로그용)
 * @returns 추출된 잔고
 */
export function extractBalanceFromResponse(response: any, username: string): number {
  // HonorAPI는 balance 필드에 잔고를 반환
  if (typeof response === 'number') {
    return response;
  }
  
  // balance 필드가 있으면 사용
  if (response?.balance !== undefined) {
    return typeof response.balance === 'number' ? response.balance : parseFloat(response.balance) || 0;
  }
  
  // amount 필드가 있을 수 있음 (출 응답)
  if (response?.amount !== undefined) {
    return typeof response.amount === 'number' ? response.amount : parseFloat(response.amount) || 0;
  }
  
  console.warn('⚠️ [HonorAPI] 잔고 추출 실패, 0 반환:', response);
  return 0;
}

/**
 * Agent 잔고 조회 (OroPlay getAgentBalance와 동일한 시그니처)
 * @param apiKey - HonorAPI API Key
 * @returns Agent 잔고
 */
export async function getAgentBalance(apiKey: string): Promise<number> {
  console.log('📊 [HonorAPI] Agent 잔고 조회 API 호출');
  
  const agentInfo = await getAgentInfo(apiKey);
  const balance = parseFloat(agentInfo.balance) || 0;
  
  console.log(`✅ [HonorAPI] Agent 잔고: ${balance}`);
  
  return balance;
}

// ============================================
// 통합 Export 객체 (OroPlay와 동일한 구조)
// ============================================

export const honorApi = {
  // Phase 1: 필수 API
  getAgentInfo,
  getUserInfo,
  getGameLaunchLink,
  addUserBalance,
  subUserBalance,
  subUserBalanceAll,
  getTransactions,
  
  // Phase 2: 게임 관리 API
  getVendorList,
  getGameList,
  getLobbyList,
  
  // Phase 3: 조직 관리 API
  getUserList,
  
  // Seamless Wallet
  depositBalance,
  withdrawBalance,
  getAgentBalance,
  
  // 유틸리티
  extractBalanceFromResponse,
  formatUTC,
  generateUUID,
  
  // 동기화
  syncHonorApiBettingHistory,
  syncHonorApiGames,
  syncSpecificHonorApiProvider,
};