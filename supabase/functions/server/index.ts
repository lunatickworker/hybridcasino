import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import {
  handleBalanceCallback,
  handleChangeBalanceCallback,
  handleChangeBalanceSlotCallback
} from "./familycallback.ts";
import { executeAutoSettlement } from "./auto-settlement.ts";

// =====================================================
// 상수 정의
// =====================================================
const PROXY_URL = 'https://vi8282.com/proxy';
const OROPLAY_BASE_URL = 'https://bs.sxvwlkohlv.com/api/v2';
const FAMILYAPI_BASE_URL = 'https://api.xtreem.cc';

// Supabase Admin Client (Secrets에서 환경 변수 가져오기)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// =====================================================
// CORS 헤더
// =====================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// =====================================================
// Proxy 호출 헬퍼
// =====================================================
async function proxyCall<T = any>(config: {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
}): Promise<T> {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  
  if (!response.ok) {
    throw new Error(`Proxy call failed (${response.status})`);
  }
  
  const data = await response.json();
  
  // Proxy 응답 검증
  if (data && typeof data === 'object') {
    if (data.RESULT === false || data.result === false) {
      const errorMessage = data.message || data.DATA?.message || '알 수 없는 오류가 발생했습니다.';
      
      // "게임기록이 존재하지 않습니다" 메시지는 정상 응답으로 처리
      if (errorMessage.includes('게임기록이 존재하지 않습니다')) {
        return data;
      }
      
      throw new Error(errorMessage);
    }
  }
  
  return data;
}

// =====================================================
// OroPlay 토큰 조회 및 자동 갱신
// =====================================================
async function getOroPlayToken(partnerId: string): Promise<string> {
  const { data: config, error: configError } = await supabase
    .from('api_configs')
    .select('token, token_expires_at, client_id, client_secret, is_active')
    .eq('partner_id', partnerId)
    .eq('api_provider', 'oroplay')
    .maybeSingle();
  
  if (configError || !config) {
    throw new Error('OroPlay API 설정을 찾을 수 없습니다.');
  }
  
  // ✅ is_active 체크 추가
  if (config.is_active === false) {
    throw new Error('OroPlay API가 비활성화되어 있습니다.');
  }
  
  if (!config.client_id || !config.client_secret) {
    throw new Error('OroPlay client_id 또는 client_secret이 설정되지 않았습니다.');
  }
  
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
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/auth/createtoken`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      clientId: config.client_id,
      clientSecret: config.client_secret
    }
  });
  
  if (response.errorCode !== undefined && response.errorCode !== 0) {
    throw new Error(`Token creation failed: errorCode ${response.errorCode}`);
  }
  
  const tokenData = response.message || response;
  
  if (!tokenData.token || !tokenData.expiration) {
    throw new Error('Invalid token response format');
  }
  
  // DB에 저장
  await supabase
    .from('api_configs')
    .update({
      token: tokenData.token,
      token_expires_at: new Date(tokenData.expiration * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('partner_id', partnerId)
    .eq('api_provider', 'oroplay');
  
  return tokenData.token;
}

// =====================================================
// OroPlay 배팅 내역 조회
// =====================================================
async function getBettingHistory(
  token: string,
  startDate: string,
  limit: number = 5000,
  vendorCode?: string
): Promise<{ nextStartDate: string; limit: number; histories: any[] }> {
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
    
    // "게임기록이 존재하지 않습니다" 메시지는 정상 처리 (빈 배열 반환)
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
    
    // errorCode 체크
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
    
    const result = response.message || response;
    return result;
    
  } catch (error: any) {
    // "게임기록이 존재하지 않습니다" 메시지는 정상 처리 (빈 배열 반환)
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

// =====================================================
// OroPlay Agent 잔고 조회
// =====================================================
async function getAgentBalance(token: string): Promise<number> {
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
  
  return balance;
}

// =====================================================
// FamilyAPI 토큰 조회 및 자동 갱신
// =====================================================
async function getFamilyApiToken(partnerId: string): Promise<string> {
  const { data: config, error: configError } = await supabase
    .from('api_configs')
    .select('api_key')
    .eq('partner_id', partnerId)
    .eq('api_provider', 'familyapi')
    .maybeSingle();
  
  if (configError || !config) {
    throw new Error('FamilyAPI 설정을 찾을 수 없습니다.');
  }
  
  if (!config.api_key) {
    throw new Error('FamilyAPI api_key가 설정되지 않았습니다.');
  }
  
  console.log('🔑 [FamilyAPI] 토큰 발급 시작:', {
    partnerId,
    apiKey: config.api_key ? `${config.api_key.substring(0, 8)}...` : 'EMPTY'
  });
  
  // 매번 새로운 토큰 발급
  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/getToken`,
    method: 'POST',
    headers: {
      'Authorization': config.api_key,
      'Content-Type': 'application/json'
    }
  });
  
  console.log('📥 [FamilyAPI] 토큰 발급 응답:', {
    resultCode: response.resultCode,
    hasToken: !!response.data?.token
  });
  
  // resultCode는 문자열 "0" 또는 숫자 0일 수 있음
  if (response.resultCode !== '0' && response.resultCode !== 0) {
    throw new Error(`FamilyAPI 토큰 생성 실패: ${response.resultMessage || response.resultCode}`);
  }
  
  const token = response.data?.token;
  
  if (!token) {
    throw new Error('Invalid FamilyAPI token response');
  }
  
  console.log('✅ [FamilyAPI] 토큰 발급 성공:', token.substring(0, 10) + '...');
  
  return token;
}

// =====================================================
// FamilyAPI Agent 잔고 조회
// =====================================================
async function getFamilyApiAgentBalance(apiKey: string, token: string): Promise<number> {
  console.log('💰 [FamilyAPI] Agent 잔고 조회 시작:', {
    apiKey: apiKey ? `${apiKey.substring(0, 8)}...` : 'EMPTY',
    token: token ? `${token.substring(0, 10)}...` : 'EMPTY'
  });

  const response = await proxyCall<any>({
    url: `${FAMILYAPI_BASE_URL}/api/p1/agentBalance`,
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'token': token,
      'Content-Type': 'application/json'
    }
  });
  
  console.log('📥 [FamilyAPI] Agent 잔고 응답:', {
    resultCode: response.resultCode,
    resultMessage: response.resultMessage,
    credit: response.data?.credit
  });
  
  // resultCode는 문자열 "0" 또는 숫자 0일 수 있음
  if (response.resultCode !== '0' && response.resultCode !== 0) {
    // ⚠️ FamilyAPI가 비활성화되어 있거나 토큰이 유효하지 않은 경우
    if (response.resultCode === '9999') {
      console.warn('⚠️ [FamilyAPI] Agent 잔고 조회 실패 - API 비활성화 또는 토큰 오류');
      return 0; // 에러 대신 0 반환 (비활성화로 간주)
    }
    throw new Error(`FamilyAPI Agent 잔고 조회 실패: ${response.resultMessage || response.resultCode}`);
  }
  
  return parseFloat(response.data?.credit || 0);
}

// =====================================================
// HonorAPI Agent 잔고 조회
// =====================================================
async function getHonorApiAgentBalance(apiKey: string): Promise<number> {
  console.log('💰 [HonorAPI] Agent 잔고 조회 시작:', {
    apiKey: apiKey ? `${apiKey.substring(0, 8)}...` : 'EMPTY'
  });

  const response = await proxyCall<{ balance: string }>({
    url: `${HONORAPI_BASE_URL}/my-info`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  console.log('📥 [HonorAPI] Agent 잔고 응답:', {
    balance: response.balance
  });

  return parseFloat(response.balance || '0');
}

// =====================================================
// 배치 레코드 삽입 헬퍼 (개별 에러 처리 포함)
// =====================================================
async function insertBatchRecords(
  records: any[],
  syncedRef: { value: number },
  errorsRef: { value: number }
): Promise<void> {
  if (records.length === 0) return;

  // ✅ 배치 내에서 중복 제거 (external_txid 기준)
  const seen = new Set<string>();
  const uniqueRecords = records.filter(r => {
    if (seen.has(r.external_txid)) {
      return false;
    }
    seen.add(r.external_txid);
    return true;
  });

  if (uniqueRecords.length === 0) return;

  try {
    // ✅ 배치 INSERT 시도
    const { error, data } = await supabase
      .from('game_records')
      .insert(uniqueRecords);

    if (error) {
      // 409/23505 (중복 또는 제약조건) 에러인 경우 개별 INSERT 시도
      if (error.code === '409' || error.code === '23505') {
        let successCount = 0;
        for (const record of uniqueRecords) {
          try {
            const { error: singleError } = await supabase
              .from('game_records')
              .insert([record]);
            
            if (singleError) {
              if (singleError.code !== '23505' && singleError.code !== '409') {
                errorsRef.value++;
              }
            } else {
              successCount++;
              syncedRef.value++;
            }
          } catch (err) {
            errorsRef.value++;
          }
        }
      } else {
        errorsRef.value += uniqueRecords.length;
      }
    } else {
      syncedRef.value += uniqueRecords.length;
    }
  } catch (err) {
    errorsRef.value += uniqueRecords.length;
  }
}

// =====================================================
// OroPlay 베팅 기록 동기화 (최적화)
// =====================================================
async function syncOroplayBets(): Promise<any> {
  console.log('🎰 [OroPlay Sync] 베팅 기록 동기화 시작');

  const startTime = Date.now();

  // 1. 모든 Lv1 파트너 조회 (OroPlay API config가 있는 파트너)
  const { data: lv1Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname')
    .eq('level', 1)
    .eq('status', 'active');

  if (partnersError || !lv1Partners || lv1Partners.length === 0) {
    return { success: true, message: 'No active Lv1 partners', synced: 0 };
  }

  // ✅ Ref 객체로 함수에 전달 가능하게
  let totalSynced = 0;
  let totalErrors = 0;
  const syncedRef = { value: totalSynced };
  const errorsRef = { value: totalErrors };

  // ✅ 전체 게임/제공사 캐시 (한 번만 로드)
  const gameCache = new Map<string, any>();
  const providerCache = new Map<number, string>();

  // 게임 캐시 사전로드
  const { data: allGames } = await supabase
    .from('games')
    .select('id, vendor_code, game_code, provider_id, game_type, name, name_ko')
    .eq('api_type', 'oroplay');

  if (allGames) {
    allGames.forEach(g => {
      gameCache.set(`${g.vendor_code}-${g.game_code}`, g);
    });
  }

  // 제공사 캐시 사전로드
  const { data: allProviders } = await supabase
    .from('game_providers')
    .select('id, name, name_ko');

  if (allProviders) {
    allProviders.forEach(p => {
      providerCache.set(p.id, p.name_ko || p.name);
    });
  }

  for (const partner of lv1Partners) {
    try {
      // 1. OroPlay 토큰 가져오기
      let token: string;
      try {
        token = await getOroPlayToken(partner.id);
      } catch (tokenError: any) {
        continue;
      }

      // 2. 최근 동기화 시간 확인 (1초 전부터 조회)
      const startDate = new Date(Date.now() - 1000).toISOString();

      // 3. 배팅 내역 조회
      const result = await getBettingHistory(token, startDate, 1000);

      if (!result || !result.histories || result.histories.length === 0) {
        continue;
      }

      // 4. status=1 (완료된 배팅만) 필터링
      const completedBets = result.histories.filter((bet: any) => bet.status === 1);

      if (completedBets.length === 0) continue;

      // ✅ 이미 존재하는 external_txid 필터링 (409 Conflict 방지)
      const externalTxIds = completedBets.map((b: any) => b.id);
      const { data: existingRecords } = await supabase
        .from('game_records')
        .select('external_txid')
        .in('external_txid', externalTxIds);

      const existingTxIds = new Set(existingRecords?.map(r => r.external_txid) || []);
      const newBets = completedBets.filter((bet: any) => !existingTxIds.has(bet.id));

      if (newBets.length === 0) {
        continue;
      }

      // 5. ✅ 사용자 매핑 (stream으로 처리 - 메모리 효율)
      const userIds = [...new Set(newBets.map((b: any) => b.userCode))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username')
        .in('username', userIds);

      const userMap = new Map<string, string>();
      if (users) {
        users.forEach((u: any) => {
          userMap.set(u.username, u.id);
        });
      }

      // 6. ✅ 배치 INSERT (일괄 저장)
      const batchSize = 100;
      let recordsToInsert: any[] = [];

      for (const bet of newBets) {
        try {
          const userId = userMap.get(bet.userCode);
          if (!userId) {
            console.warn(`   ⚠️ 사용자 미매칭: ${bet.userCode}`);
            continue;
          }

          // 캐시에서 게임 정보 조회
          const gameKey = `${bet.vendorCode}-${bet.gameCode}`;
          const gameData = gameCache.get(gameKey);

          // 제공사 이름 결정 (캐시 사용)
          let providerName = bet.vendorCode;
          if (gameData?.provider_id) {
            providerName = providerCache.get(gameData.provider_id) || bet.vendorCode;
          }

          const gameTitle = gameData?.name_ko || gameData?.name || bet.gameCode || 'Unknown Game';

          recordsToInsert.push({
            api_type: 'oroplay',
            partner_id: partner.id,
            external_txid: bet.id,
            username: bet.userCode,
            user_id: userId,
            game_id: gameData?.id || null,
            provider_id: gameData?.provider_id || null,
            provider_name: providerName || 'Unknown Provider',
            game_title: gameTitle,
            game_type: gameData?.game_type || 'slot',
            bet_amount: bet.betAmount,
            win_amount: bet.winAmount,
            balance_before: bet.beforeBalance,
            balance_after: bet.afterBalance,
            played_at: typeof bet.createdAt === 'number'
              ? new Date(bet.createdAt * 1000).toISOString()
              : new Date(bet.createdAt).toISOString()
          });

          // 배치가 가득 찼으면 한 번에 INSERT
          if (recordsToInsert.length >= batchSize) {
            await insertBatchRecords(recordsToInsert, syncedRef, errorsRef);
            recordsToInsert = [];
          }

        } catch (err) {
          console.error(`   ❌ 레코드 처리 오류:`, err);
          errorsRef.value++;
        }
      }

      // 남은 레코드 일괄 저장
      if (recordsToInsert.length > 0) {
        await insertBatchRecords(recordsToInsert, syncedRef, errorsRef);
      }

      console.log(`✅ Partner ${partner.id}: 동기화 완료`);

    } catch (error) {
      console.error(`❌ Partner ${partner.id} 동기화 에러:`, error);
      errorsRef.value++;
    }
  }

  totalSynced = syncedRef.value;
  totalErrors = errorsRef.value;

  const elapsed = Date.now() - startTime;
  console.log(`\n🎉 [OroPlay Sync] 완료 - ${totalSynced}개 저장, ${totalErrors}개 에러, ${elapsed}ms 소요`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: lv1Partners.length,
    elapsed: `${elapsed}ms`
  };
}

// =====================================================
// Invest 베팅 기록 동기화
// =====================================================
async function syncInvestBets(): Promise<any> {
  console.log('🎰 [Invest Sync] 베팅 기록 동기화 시작');

  // 1. 모든 Lv1 파트너 조회 (Invest API config가 있는 파트너)
  const { data: lv1Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname')
    .eq('level', 1)
    .eq('status', 'active');

  if (partnersError || !lv1Partners || lv1Partners.length === 0) {
    return { success: true, message: 'No active Lv1 partners', synced: 0 };
  }

  let totalSynced = 0;
  let totalErrors = 0;

  for (const partner of lv1Partners) {
    try {
      // Invest API 설정 확인
      const { data: investConfig } = await supabase
        .from('api_configs')
        .select('opcode, secret_key, is_active')
        .eq('partner_id', partner.id)
        .eq('api_provider', 'invest')
        .maybeSingle();

      if (!investConfig || investConfig.is_active === false) {
        continue;
      }

      // 최근 동기화 시간 확인 (34초 전부터 조회)
      const startDate = new Date(Date.now() - 34000).toISOString();

      // TODO: Invest API 베팅 내역 조회 및 저장 로직 구현
      console.log(`✅ Partner ${partner.id}: Invest 동기화 완료 (구현 필요)`);

    } catch (error) {
      console.error(`❌ Partner ${partner.id} Invest 동기화 에러:`, error);
      totalErrors++;
    }
  }

  console.log(`\n🎉 [Invest Sync] 완료 - ${totalSynced}개 저장, ${totalErrors}개 에러`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: lv1Partners.length
  };
}

// =====================================================
// FamilyAPI 베팅 기록 동기화
// =====================================================
async function syncFamilyapiBets(): Promise<any> {
  console.log('🎰 [FamilyAPI Sync] 베팅 기록 동기화 시작');

  // 1. 모든 Lv1 파트너 조회 (FamilyAPI config가 있는 파트너)
  const { data: lv1Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname')
    .eq('level', 1)
    .eq('status', 'active');

  if (partnersError || !lv1Partners || lv1Partners.length === 0) {
    return { success: true, message: 'No active Lv1 partners', synced: 0 };
  }

  let totalSynced = 0;
  let totalErrors = 0;

  for (const partner of lv1Partners) {
    try {
      // FamilyAPI 설정 확인
      const { data: familyConfig } = await supabase
        .from('api_configs')
        .select('api_key, token, is_active')
        .eq('partner_id', partner.id)
        .eq('api_provider', 'familyapi')
        .maybeSingle();

      if (!familyConfig || familyConfig.is_active === false) {
        continue;
      }

      // TODO: FamilyAPI 베팅 내역 조회 및 저장 로직 구현
      console.log(`✅ Partner ${partner.id}: FamilyAPI 동기화 완료 (구현 필요)`);

    } catch (error) {
      console.error(`❌ Partner ${partner.id} FamilyAPI 동기화 에러:`, error);
      totalErrors++;
    }
  }

  console.log(`\n🎉 [FamilyAPI Sync] 완료 - ${totalSynced}개 저장, ${totalErrors}개 에러`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: lv1Partners.length
  };
}

// =====================================================
// HonorAPI 베팅 기록 동기화
// =====================================================
const HONORAPI_BASE_URL = 'https://api.honorlink.org/api';

/**
 * UTC 시간 포맷팅 (YYYY-MM-DD HH:mm:ss)
 */
function formatUTC(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/**
 * HonorAPI 트랜잭션 조회
 */
async function getHonorApiTransactions(
  apiKey: string,
  start: string,
  end: string,
  page: number = 1,
  perPage: number = 1000
): Promise<{ data: any[] }> {
  const params = new URLSearchParams({
    start,
    end,
    page: page.toString(),
    perPage: perPage.toString()
  });

  const response = await proxyCall<{ data: any[] }>({
    url: `${HONORAPI_BASE_URL}/transactions?${params.toString()}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  return response;
}

async function syncHonorapiBets(): Promise<any> {
  console.log('🎰 [HonorAPI Sync] 베팅 기록 동기화 시작');

  const startTime = Date.now();

  // 1. 모든 Lv1 파트너 조회 (HonorAPI config가 있는 파트너)
  const { data: lv1Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname')
    .eq('level', 1)
    .eq('status', 'active');

  if (partnersError || !lv1Partners || lv1Partners.length === 0) {
    return { success: true, message: 'No active Lv1 partners', synced: 0 };
  }

  // ✅ Ref 객체로 함수에 전달 가능하게
  let totalSynced = 0;
  let totalErrors = 0;
  const syncedRef = { value: totalSynced };
  const errorsRef = { value: totalErrors };

  for (const partner of lv1Partners) {
    try {
      // HonorAPI 설정 확인
      const { data: honorConfig } = await supabase
        .from('api_configs')
        .select('api_key, is_active')
        .eq('partner_id', partner.id)
        .eq('api_provider', 'honorapi')
        .maybeSingle();

      if (!honorConfig || honorConfig.is_active === false) {
        continue;
      }

      if (!honorConfig.api_key) {
        continue;
      }

      // 2. 최근 동기화 시간 확인 (60초 전부터 조회 - 1분)
      const now = new Date();
      const sixtySecondsAgo = new Date(now.getTime() - 60000);

      const startTime = formatUTC(sixtySecondsAgo);
      const endTime = formatUTC(now);

      // 3. 트랜잭션 조회
      const result = await getHonorApiTransactions(
        honorConfig.api_key,
        startTime,
        endTime,
        1,
        1000
      );

      const transactions = result.data || [];

      if (transactions.length === 0) {
        continue;
      }

      // 4. bet 타입만 필터링
      const betTransactions = transactions.filter((tx: any) => tx.type === 'bet' && tx.details?.game);

      // ✅ 이미 존재하는 external_txid 필터링 (409 Conflict 방지)
      const externalTxIds = betTransactions.map((tx: any) => tx.id);
      const { data: existingRecords } = await supabase
        .from('game_records')
        .select('external_txid')
        .in('external_txid', externalTxIds);

      const existingTxIds = new Set(existingRecords?.map(r => r.external_txid) || []);
      const newTransactions = betTransactions.filter((tx: any) => !existingTxIds.has(tx.id));

      if (newTransactions.length === 0) {
        continue;
      }

      // ✅ 게임 캐시 사전로드 (불필요한 개별 쿼리 제거)
      const gameCache = new Map<string, any>();
      const { data: allHonorGames } = await supabase
        .from('honor_games')
        .select('id, game_code, provider_id, name, type');

      if (allHonorGames) {
        allHonorGames.forEach(g => {
          gameCache.set(g.game_code, g);
        });
      }

      // ✅ 제공사 캐시 사전로드
      const providerCache = new Map<number, string>();
      const { data: allProviders } = await supabase
        .from('honor_game_providers')
        .select('id, name');

      if (allProviders) {
        allProviders.forEach(p => {
          providerCache.set(p.id, p.name);
        });
      }

      // 5. ✅ 사용자 매핑 (필요한 사용자만 조회)
      const usernames = [...new Set(newTransactions.map((tx: any) => tx.user.username))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username, referrer_id')
        .in('username', usernames);

      const userMap = new Map<string, any>();
      if (users) {
        users.forEach((u: any) => {
          userMap.set(u.username, { id: u.id, referrer_id: u.referrer_id });
        });
      }

      // 6. ✅ 배치 INSERT
      const batchSize = 100;
      let recordsToInsert: any[] = [];

      for (const tx of newTransactions) {
        try {
          const userInfo = userMap.get(tx.user.username);
          if (!userInfo) {
            continue;
          }

          // 캐시에서 게임 정보 조회
          const game = gameCache.get(tx.details.game.id);

          // 제공사 이름 결정
          let providerName = tx.details.game.vendor || 'HonorAPI';
          if (game?.provider_id) {
            providerName = providerCache.get(game.provider_id) || tx.details.game.vendor || 'HonorAPI';
          }

          const gameTitle = game?.name || tx.details.game.title || tx.details.game.id || 'Unknown Game';

          // 같은 라운드의 win 트랜잭션 찾기
          const winTx = transactions.find(
            (t: any) => t.type === 'win' && 
                 t.details?.game?.round === tx.details.game.round &&
                 t.user.username === tx.user.username
          );

          const winAmount = winTx?.amount || 0;
          const betAmount = Math.abs(tx.amount);
          const balanceAfter = tx.before - betAmount + winAmount;

          recordsToInsert.push({
            external_txid: tx.id,
            user_id: userInfo.id,
            username: tx.user.username,
            game_id: game?.id || null,
            provider_id: null,
            provider_name: providerName || 'HonorAPI',
            game_title: gameTitle,
            game_type: game?.type || tx.details.game.type || 'slot',
            bet_amount: betAmount,
            win_amount: winAmount,
            balance_before: tx.before,
            balance_after: balanceAfter,
            played_at: tx.processed_at,
            session_id: null,
            round_id: tx.details.game.round || null,
            partner_id: userInfo.referrer_id,
            api_type: 'honorapi',
            sync_status: 'synced',
            time_category: 'recent',
            currency: 'KRW'
          });

          // 배치 INSERT
          if (recordsToInsert.length >= batchSize) {
            await insertBatchRecords(recordsToInsert, syncedRef, errorsRef);
            recordsToInsert = [];
          }

        } catch (err) {
          console.error(`   ❌ 레코드 처리 오류:`, err);
          errorsRef.value++;
        }
      }

      // 남은 레코드 일괄 저장
      if (recordsToInsert.length > 0) {
        await insertBatchRecords(recordsToInsert, syncedRef, errorsRef);
      }

      console.log(`✅ Partner ${partner.id}: 동기화 완료`);

    } catch (error) {
      console.error(`❌ Partner ${partner.id} HonorAPI 동기화 에러:`, error);
      errorsRef.value++;
    }
  }

  totalSynced = syncedRef.value;
  totalErrors = errorsRef.value;

  const elapsed = Date.now() - startTime;
  console.log(`\n🎉 [HonorAPI Sync] 완료 - ${totalSynced}개 저장, ${totalErrors}개 에러, ${elapsed}ms 소요`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: lv1Partners.length
  };
}

// =====================================================
// Lv2 파트너 OroPlay 보유금 동기화
// =====================================================
async function syncLv2Balances(): Promise<any> {
  console.log('💰 [Lv2 Balance Sync] 보유금 동기화 시작');

  // Lv2 파트너 목록 조회
  const { data: lv2Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname, parent_id')
    .eq('level', 2)
    .eq('status', 'active');

  if (partnersError || !lv2Partners || lv2Partners.length === 0) {
    return { success: true, message: 'No active Lv2 partners', synced: 0 };
  }

  let totalSynced = 0;
  let totalErrors = 0;
  const syncResults = {
    invest: { synced: 0, errors: 0 },
    oroplay: { synced: 0, errors: 0 },
    familyapi: { synced: 0, errors: 0 },
    honorapi: { synced: 0, errors: 0 }
  };

  // 각 Lv2 파트너별로 처리
  for (const partner of lv2Partners) {
    try {
      if (!partner.parent_id) {
        continue;
      }

      const balances: any = {};

      // ========================================
      // 1. Invest Balance 동기화
      // ========================================
      try {
        // ✅ Lv2 자신의 Invest API 설정 확인 (parent_id가 아닌 자신의 id)
        const { data: investConfig } = await supabase
          .from('api_configs')
          .select('id, is_active')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'invest')
          .maybeSingle();

        if (investConfig && investConfig.is_active !== false) {
          // Dynamic import to avoid circular dependency
          const investModule = await import('https://deno.land/x/invest_api@v1.0.0/mod.ts').catch(() => null);
          
          // Note: Invest API는 별도 모듈이 필요하므로 여기서는 스킵
          // 실제 구현 시에는 invest 토큰 조회 및 잔고 조회 로직 추가
        } else if (investConfig && investConfig.is_active === false) {
          // Invest API 비활성화
        }
      } catch (investError: any) {
        syncResults.invest.errors++;
      }

      // ========================================
      // 2. OroPlay Balance 동기화
      // ========================================
      try {
        // ✅ Lv2 자신의 OroPlay API 설정 확인
        const { data: oroConfig } = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();

        if (oroConfig && oroConfig.is_active !== false) {
          const oroToken = await getOroPlayToken(partner.id);
          const oroBalance = await getAgentBalance(oroToken);
          balances.oroplay_balance = oroBalance;
          syncResults.oroplay.synced++;
        }
      } catch (oroError: any) {
        syncResults.oroplay.errors++;
      }

      // ========================================
      // 3. FamilyAPI Balance 동기화
      // ========================================
      try {
        // ✅ Lv2 자신의 FamilyAPI 설정 확인
        const { data: familyConfig } = await supabase
          .from('api_configs')
          .select('api_key, is_active')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'familyapi')
          .maybeSingle();

        if (familyConfig && familyConfig.api_key && familyConfig.is_active !== false) {
          const familyToken = await getFamilyApiToken(partner.id);
          const familyBalance = await getFamilyApiAgentBalance(familyConfig.api_key, familyToken);
          balances.familyapi_balance = familyBalance;
          syncResults.familyapi.synced++;
        }
      } catch (familyError: any) {
        syncResults.familyapi.errors++;
      }

      // ========================================
      // 4. HonorAPI Balance 동기화
      // ========================================
      try {
        // ✅ Lv2 자신의 HonorAPI 설정 확인
        const { data: honorConfig } = await supabase
          .from('api_configs')
          .select('api_key, is_active')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'honorapi')
          .maybeSingle();

        if (honorConfig && honorConfig.api_key && honorConfig.is_active !== false) {
          const honorBalance = await getHonorApiAgentBalance(honorConfig.api_key);
          balances.honorapi_balance = honorBalance;
          syncResults.honorapi.synced++;
        }
      } catch (honorError: any) {
        syncResults.honorapi.errors++;
      }

      // ========================================
      // 5. DB 업데이트 (수집된 잔고들을 한 번에 업데이트)
      // ========================================
      if (Object.keys(balances).length > 0) {
        const { error: updateError } = await supabase
          .from('partners')
          .update({
            ...balances,
            updated_at: new Date().toISOString()
          })
          .eq('id', partner.id);

        if (updateError) {
          console.error(`❌ Partner ${partner.id} 업데이트 에러:`, updateError);
          totalErrors++;
        } else {
          totalSynced++;
        }
      }

    } catch (error) {
      console.error(`❌ Partner ${partner.id} 처리 에러:`, error);
      totalErrors++;
    }
  }

  console.log(`\n🎉 [Lv2 Balance Sync] 완료`);
  console.log(`   📊 총 파트너: ${lv2Partners.length}개`);
  console.log(`   ✅ OroPlay: ${syncResults.oroplay.synced}개 성공, ${syncResults.oroplay.errors}개 실패`);
  console.log(`   ✅ FamilyAPI: ${syncResults.familyapi.synced}개 성공, ${syncResults.familyapi.errors}개 실패`);
  console.log(`   ✅ Invest: ${syncResults.invest.synced}개 성공, ${syncResults.invest.errors}개 실패`);
  console.log(`   ✅ HonorAPI: ${syncResults.honorapi.synced}개 성공, ${syncResults.honorapi.errors}개 실패`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: lv2Partners.length,
    details: syncResults
  };
}

// =====================================================
// 메인 핸들러
// =====================================================
Deno.serve(async (req: Request) => {
  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // 엣지 함수 요청 수신
  console.error(`🚀 START: ${req.method} ${path}`);

  try {
    // Root health check
    if (path === '/' || path === '/server' || path === '/server/' || 
        path === '/functions/v1/server' || path === '/functions/v1/server/') {
      console.error(`✅ Health check`);
      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'OroPlay Sync Server',
          timestamp: new Date().toISOString(),
          version: 'v1.3.0',
          routes: [
            'GET /health',
            'POST /balance (public)',
            'POST /changebalance (public)',
            'POST /changebalance/slot (public)',
            'POST /sync/invest-bets',
            'POST /sync/oroplay-bets',
            'POST /sync/familyapi-bets',
            'POST /sync/honorapi-bets',
            'POST /sync/lv2-balances'
          ]
        }),
        { headers: corsHeaders }
      );
    }

    // Health check
    if (path === '/health' || path === '/server/health') {
      console.error(`✅ Health check OK`);
      return new Response(
        JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), version: 'v1.3.0' }),
        { headers: corsHeaders }
      );
    }

    // =====================================================
    // ⭐ FamilyAPI 콜백 엔드포인트 (PUBLIC - Authorization 불필요)
    // =====================================================
    
    // 1. 잔고 확인 콜백 (GET, POST 지원)
    if ((path.endsWith('/balance') || path === '/server/balance' || path === '/functions/v1/server/balance') && req.method === 'POST') {
      console.error('📞 [FamilyAPI] /balance callback 처리');
      return await handleBalanceCallback(req, supabase, corsHeaders);
    }

    // 2. 카지노 베팅/결과 콜백
    if ((path.endsWith('/changebalance') || path === '/server/changebalance' || path === '/functions/v1/server/changebalance') && req.method === 'POST') {
      console.error('📞 [FamilyAPI] /changebalance callback 처리');
      return await handleChangeBalanceCallback(req, supabase, corsHeaders);
    }

    // 3. 슬롯 베팅/결과 콜백
    if ((path.endsWith('/changebalance/slot') || path === '/server/changebalance/slot' || path === '/functions/v1/server/changebalance/slot') && req.method === 'POST') {
      console.error('📞 [FamilyAPI] /changebalance/slot callback 처리');
      return await handleChangeBalanceSlotCallback(req, supabase, corsHeaders);
    }

    // ✅ Authorization 헤더 검증 (동기화 엔드포인트만)
    if (path.includes('/sync/')) {
      const authHeader = req.headers.get('Authorization');
      
      if (!authHeader) {
        console.error('❌ Missing authorization header');
        return new Response(
          JSON.stringify({ code: 401, message: 'Missing authorization header' }),
          { status: 401, headers: corsHeaders }
        );
      }

      // Bearer 토큰 추출
      const token = authHeader.replace('Bearer ', '');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      
      // Anon Key 또는 Service Role Key 확인
      if (token !== anonKey && token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
        console.error('❌ Invalid authorization token');
        return new Response(
          JSON.stringify({ code: 401, message: 'Invalid authorization token' }),
          { status: 401, headers: corsHeaders }
        );
      }

      console.error('✅ Authorization verified');
    }

    // OroPlay 베팅 동기화
    if ((path === '/sync/oroplay-bets' || path === '/server/sync/oroplay-bets') && req.method === 'POST') {
      console.error('🎯 [Sync] OroPlay 베팅 동기화 시작');
      const result = await syncOroplayBets();
      console.error('🎯 [Sync] OroPlay 베팅 동기화 완료', result);
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // Invest 베팅 동기화
    if ((path === '/sync/invest-bets' || path === '/server/sync/invest-bets') && req.method === 'POST') {
      console.error('🎯 [Sync] Invest 베팅 동기화 시작');
      const result = await syncInvestBets();
      console.error('🎯 [Sync] Invest 베팅 동기화 완료', result);
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // FamilyAPI 베팅 동기화
    if ((path === '/sync/familyapi-bets' || path === '/server/sync/familyapi-bets') && req.method === 'POST') {
      console.error('🎯 [Sync] FamilyAPI 베팅 동기화 시작');
      const result = await syncFamilyapiBets();
      console.error('🎯 [Sync] FamilyAPI 베팅 동기화 완료', result);
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // HonorAPI 베팅 동기화
    if ((path === '/sync/honorapi-bets' || path === '/server/sync/honorapi-bets') && req.method === 'POST') {
      console.error('🎯 [Sync] HonorAPI 베팅 동기화 시작');
      const result = await syncHonorapiBets();
      console.error('🎯 [Sync] HonorAPI 베팅 동기화 완료', result);
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // Lv2 보유금 동기화
    if ((path === '/sync/lv2-balances' || path === '/server/sync/lv2-balances') && req.method === 'POST') {
      console.error('🎯 [Sync] Lv2 보유금 동기화 시작');
      const result = await syncLv2Balances();
      console.error('🎯 [Sync] Lv2 보유금 동기화 완료', result);
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // 자동 정산 (매일 00:04 실행)
    if ((path === '/sync/auto-settlement' || path === '/server/sync/auto-settlement') && req.method === 'POST') {
      console.error('🎯 [Auto Settlement] 자동 정산 시작');
      const result = await executeAutoSettlement();
      console.error('🎯 [Auto Settlement] 자동 정산 완료', result);
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // 404 Not Found
    console.error(`❌ 404 Not Found: ${path}`);
    return new Response(
      JSON.stringify({ error: 'Not Found', path, method: req.method }),
      { status: 404, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('❌ Fatal Error:', error.message || error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: corsHeaders }
    );
  }
});