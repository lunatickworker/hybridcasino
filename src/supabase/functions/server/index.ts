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
// OroPlay 베팅 기록 동기화
// =====================================================
async function syncOroplayBets(): Promise<any> {
  console.log('🎰 [OroPlay Sync] 베팅 기록 동기화 시작');

  // 1. 모든 Lv1 파트너 조회 (OroPlay API config가 있는 파트너)
  const { data: lv1Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname')
    .eq('level', 1)
    .eq('status', 'active');

  if (partnersError || !lv1Partners || lv1Partners.length === 0) {
    return { success: true, message: 'No active Lv1 partners', synced: 0 };
  }

  console.log(`📋 ${lv1Partners.length}개 Lv1 파트너 발견`);

  let totalSynced = 0;
  let totalErrors = 0;

  for (const partner of lv1Partners) {
    try {
      console.log(`\n🔄 Partner ${partner.id} (${partner.nickname}) 동기화 시작...`);

      // 1. OroPlay 토큰 가져오기
      let token: string;
      try {
        token = await getOroPlayToken(partner.id);
      } catch (tokenError: any) {
        console.log(`⚠️ Partner ${partner.id}: 토큰 없음 - ${tokenError.message}`);
        continue;
      }

      // 2. 최근 동기화 시간 확인 (4초 전부터 조회)
      const startDate = new Date(Date.now() - 4000).toISOString();

      // 3. 배팅 내역 조회
      const result = await getBettingHistory(token, startDate, 1000);

      if (!result || !result.histories || result.histories.length === 0) {
        console.log(`ℹ️ Partner ${partner.id}: 새 베팅 기록 없음`);
        continue;
      }

      console.log(`📊 Partner ${partner.id}: ${result.histories.length}개 베팅 기록 수신`);

      // 4. status=1 (완료된 배팅만) 필터링
      const completedBets = result.histories.filter((bet: any) => bet.status === 1);
      console.log(`   ✅ 완료된 배팅: ${completedBets.length}건`);

      // 5. 이미 저장된 트랜잭션 ID 조회 (중복 제거) - CRITICAL: api_type도 함께 확인
      const { data: existingOroplayRecords } = await supabase
        .from('game_records')
        .select('external_txid')
        .eq('partner_id', partner.id)
        .eq('api_type', 'oroplay');

      // ✅ 타입 변환: 모든 ID를 문자열로 통일하여 비교 (BigInt 안전성)
      const existingOroplayTxIds = new Set(
        existingOroplayRecords?.map((r: any) => String(r.external_txid)) || []
      );
      console.log(`   📋 기존 저장 건수: ${existingOroplayTxIds.size}건`);

      // 6. 새로운 베팅만 필터링 (이미 저장된 것 제외)
      const newCompletedBets = completedBets.filter((bet: any) => {
        const txId = String(bet.id);
        return !existingOroplayTxIds.has(txId);
      });
      const skippedOroplayCount = completedBets.length - newCompletedBets.length;
      console.log(`   🆕 신규 베팅: ${newCompletedBets.length}건, 건너뜀: ${skippedOroplayCount}건`);

      if (newCompletedBets.length === 0) {
        console.log(`ℹ️ Partner ${partner.id}: 신규 베팅 기록 없음 (모두 기존 데이터)`);
        continue;
      }

      // 5. 사용자 매핑
      const { data: allUsers } = await supabase
        .from('users')
        .select('id, username');

      const userMap = new Map<string, string>();
      if (allUsers) {
        allUsers.forEach((u: any) => {
          userMap.set(u.username, u.id);
        });
      }

      // 6. game_records에 저장
      for (const bet of newCompletedBets) {
        try {
          const userId = userMap.get(bet.userCode);
          if (!userId) {
            continue;
          }

          // ⚠️ CRITICAL: INSERT 직전에 한 번 더 중복 체크 (경쟁 조건 방지)
          const { data: oroplayAlreadyExists } = await supabase
            .from('game_records')
            .select('id')
            .eq('external_txid', bet.id)
            .eq('api_type', 'oroplay')
            .maybeSingle();

          if (oroplayAlreadyExists) {
            continue;  // 조용히 건너뜀
          }

          console.log(`   📦 OroPlay bet: vendor=${bet.vendorCode}, game=${bet.gameCode}`);

          // 게임 정보 조회 (vendor_code와 game_code로 매칭)
          const { data: gameData } = await supabase
            .from('games')
            .select('id, provider_id, game_type, name, name_ko')
            .eq('vendor_code', bet.vendorCode)
            .eq('game_code', bet.gameCode)
            .eq('api_type', 'oroplay')
            .maybeSingle();

          console.log(`   🎮 게임 매칭: ${gameData ? '성공 - ' + (gameData.name_ko || gameData.name) : '실패 - gameCode 사용'}`);

          // 게임사 이름 결정
          let providerName = bet.vendorCode; // ⭐ OroPlay는 vendorCode만 제공
          if (gameData?.provider_id) {
            const { data: providerData } = await supabase
              .from('game_providers')
              .select('name, name_ko')
              .eq('id', gameData.provider_id)
              .maybeSingle();
            
            if (providerData) {
              providerName = providerData.name_ko || providerData.name;
            }
          }

          // 게임 제목 결정
          const gameTitle = gameData?.name_ko || gameData?.name || bet.gameCode; // ⭐ OroPlay는 gameCode만 제공

          console.log(`   ✅ 저장: provider="${providerName}", game="${gameTitle}"`);

          // ⭐ NULL 방지 최종 체크
          const finalProviderName = providerName || bet.vendorCode || 'Unknown Provider';
          const finalGameTitle = gameTitle || bet.gameCode || 'Unknown Game';

          const { error } = await supabase
            .from('game_records')
            .insert({
              api_type: 'oroplay',
              partner_id: partner.id,
              external_txid: bet.id,
              username: bet.userCode,
              user_id: userId,
              game_id: gameData?.id || null,
              provider_id: gameData?.provider_id || null,
              provider_name: finalProviderName, // ✅ NULL 방지
              game_title: finalGameTitle, // ✅ NULL 방지
              game_type: gameData?.game_type || 'slot',
              bet_amount: bet.betAmount,
              win_amount: bet.winAmount,
              balance_before: bet.beforeBalance,
              balance_after: bet.afterBalance,
              played_at: typeof bet.createdAt === 'number'
                ? new Date(bet.createdAt * 1000).toISOString()
                : new Date(bet.createdAt).toISOString()
            });

          if (error) {
            if (error.code !== '23505') { // 중복이 아닌 에러만 카운트
              console.error(`   ❌ 저장 오류:`, error);
              totalErrors++;
            }
          } else {
            totalSynced++;
          }

        } catch (err) {
          console.error(`   ❌ 레코드 처리 오류:`, err);
          totalErrors++;
        }
      }

      console.log(`✅ Partner ${partner.id}: 동기화 완료`);

    } catch (error) {
      console.error(`❌ Partner ${partner.id} 동기화 에러:`, error);
      totalErrors++;
    }
  }

  console.log(`\n🎉 [OroPlay Sync] 완료 - ${totalSynced}개 저장, ${totalErrors}개 에러`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: lv1Partners.length
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

  console.log(`📋 ${lv1Partners.length}개 Lv1 파트너 발견`);

  let totalSynced = 0;
  let totalErrors = 0;

  for (const partner of lv1Partners) {
    try {
      console.log(`\n🔄 Partner ${partner.id} (${partner.nickname}) Invest 동기화 시작...`);

      // Invest API 설정 확인
      const { data: investConfig } = await supabase
        .from('api_configs')
        .select('opcode, secret_key, is_active')
        .eq('partner_id', partner.id)
        .eq('api_provider', 'invest')
        .maybeSingle();

      if (!investConfig || investConfig.is_active === false) {
        console.log(`⚠️ Partner ${partner.id}: Invest API 설정 없음 또는 비활성화`);
        continue;
      }

      // 최근 동기화 시간 확인 (34초 전부터 조회)
      const startDate = new Date(Date.now() - 34000).toISOString();
      
      console.log(`📅 조회 기간: ${startDate} ~ 현재`);

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

  console.log(`📋 ${lv1Partners.length}개 Lv1 파트너 발견`);

  let totalSynced = 0;
  let totalErrors = 0;

  for (const partner of lv1Partners) {
    try {
      console.log(`\n🔄 Partner ${partner.id} (${partner.nickname}) FamilyAPI 동기화 시작...`);

      // FamilyAPI 설정 확인
      const { data: familyConfig } = await supabase
        .from('api_configs')
        .select('api_key, token, is_active')
        .eq('partner_id', partner.id)
        .eq('api_provider', 'familyapi')
        .maybeSingle();

      if (!familyConfig || familyConfig.is_active === false) {
        console.log(`⚠️ Partner ${partner.id}: FamilyAPI 설정 없음 또는 비활성화`);
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

  // 1. 모든 Lv1 파트너 조회 (HonorAPI config가 있는 파트너)
  const { data: lv1Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname')
    .eq('level', 1)
    .eq('status', 'active');

  if (partnersError || !lv1Partners || lv1Partners.length === 0) {
    return { success: true, message: 'No active Lv1 partners', synced: 0 };
  }

  console.log(`📋 ${lv1Partners.length}개 Lv1 파트너 발견`);

  let totalSynced = 0;
  let totalErrors = 0;

  for (const partner of lv1Partners) {
    try {
      console.log(`\n🔄 Partner ${partner.id} (${partner.nickname}) HonorAPI 동기화 시작...`);

      // HonorAPI 설정 확인
      const { data: honorConfig } = await supabase
        .from('api_configs')
        .select('api_key, is_active')
        .eq('partner_id', partner.id)
        .eq('api_provider', 'honorapi')
        .maybeSingle();

      if (!honorConfig || honorConfig.is_active === false) {
        console.log(`⚠️ Partner ${partner.id}: HonorAPI 설정 없음 또는 비활성화`);
        continue;
      }

      if (!honorConfig.api_key) {
        console.log(`⚠️ Partner ${partner.id}: HonorAPI api_key 없음`);
        continue;
      }

      // 2. 마지막 동기화된 external_txid 조회 (새로운 데이터만 처리하기 위함)
      const { data: lastRecord } = await supabase
        .from('game_records')
        .select('external_txid, played_at')
        .eq('partner_id', partner.id)
        .eq('api_type', 'honorapi')
        .order('external_txid', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastExternalTxid = lastRecord?.external_txid || 0;
      const lastPlayedAt = lastRecord?.played_at ? new Date(lastRecord.played_at) : new Date(0);

      console.log(`📍 Partner ${partner.id}: 마지막 external_txid=${lastExternalTxid}, played_at=${lastPlayedAt.toISOString()}`);

      // 3. 조회 기간 설정: 마지막 played_at 기준으로 1분 전부터 현재까지
      // (네트워크 지연, 클라이언트 타임 차이 등 고려하여 1분 여유)
      const now = new Date();
      const oneMinuteBeforeLastTime = new Date(lastPlayedAt.getTime() - 60000);

      const startTime = formatUTC(oneMinuteBeforeLastTime);
      const endTime = formatUTC(now);

      console.log(`📅 조회 기간: ${startTime} ~ ${endTime}`);

      // 4. 트랜잭션 조회
      const result = await getHonorApiTransactions(
        honorConfig.api_key,
        startTime,
        endTime,
        1,
        1000
      );

      const transactions = result.data || [];

      if (transactions.length === 0) {
        console.log(`ℹ️ Partner ${partner.id}: 새 베팅 기록 없음`);
        continue;
      }

      console.log(`📊 Partner ${partner.id}: ${transactions.length}개 트랜잭션 수신`);

      // 4. bet 타입만 필터링
      const betTransactions = transactions.filter((tx: any) => tx.type === 'bet' && tx.details?.game);
      console.log(`   ✅ 베팅 트랜잭션: ${betTransactions.length}건`);

      // 5. 이미 저장된 트랜잭션 ID 조회 (중복 제거) - CRITICAL: api_type도 함께 확인
      const { data: existingRecords } = await supabase
        .from('game_records')
        .select('external_txid')
        .eq('partner_id', partner.id)
        .eq('api_type', 'honorapi')
        .gte('played_at', new Date(lastPlayedAt.getTime() - 300000).toISOString()); // 최근 5분 데이터만

      // ✅ 타입 변환: 모든 ID를 문자열로 통일하여 비교 (BigInt 안전성)
      const existingTxIds = new Set(
        existingRecords?.map((r: any) => String(r.external_txid)) || []
      );
      console.log(`   📋 기존 저장 건수: ${existingTxIds.size}건`);
      if (existingTxIds.size > 0) {
        const existingIds = Array.from(existingTxIds).slice(0, 5);
        console.log(`   📋 샘플 ID: ${existingIds.join(', ')} (최대 5개)`);
      }

      // 6. 새로운 트랜잭션만 필터링 (이미 저장된 것 제외)
      const newBetTransactions = betTransactions.filter((tx: any) => {
        const txId = String(tx.id);
        return !existingTxIds.has(txId);
      });
      const skippedCount = betTransactions.length - newBetTransactions.length;
      console.log(`   🆕 신규 베팅 트랜잭션: ${newBetTransactions.length}건, 건너뜀: ${skippedCount}건`);

      if (newBetTransactions.length === 0) {
        console.log(`ℹ️ Partner ${partner.id}: 신규 베팅 기록 없음 (모두 기존 데이터)`);
        continue;
      }

      // ✅ 배치 조회: 모든 신규 트랜잭션의 external_txid를 한 번에 조회 (Supabase 과부하 방지)
      const newTxIds = newBetTransactions.map((tx: any) => String(tx.id));
      const { data: batchExistingRecords } = await supabase
        .from('game_records')
        .select('external_txid')
        .eq('partner_id', partner.id)
        .eq('api_type', 'honorapi')
        .in('external_txid', newTxIds);

      const batchExistingTxIds = new Set(
        batchExistingRecords?.map((r: any) => String(r.external_txid)) || []
      );
      console.log(`   ✅ 배치 중복 체크 완료: ${batchExistingTxIds.size}개 발견`);

      // 7. 사용자 매핑
      const { data: allUsers } = await supabase
        .from('users')
        .select('id, username, referrer_id');

      const userMap = new Map<string, any>();
      if (allUsers) {
        allUsers.forEach((u: any) => {
          userMap.set(u.username, { id: u.id, referrer_id: u.referrer_id });
        });
      }

      // 8. game_records에 저장
      for (const tx of newBetTransactions) {
        try {
          const userInfo = userMap.get(tx.user.username);
          if (!userInfo) {
            continue;
          }

          // ⚠️ 배치 조회 결과에서 확인 (개별 쿼리 제거!)
          if (batchExistingTxIds.has(String(tx.id))) {
            continue;  // 조용히 건너뜀
          }

          // 게임 정보 조회
          const { data: game } = await supabase
            .from('honor_games')
            .select('id, provider_id, name, type')
            .eq('game_code', tx.details.game.id)
            .maybeSingle();

          console.log(`   🎮 HonorAPI 게임 매칭: code=${tx.details.game.id}, 결과=${game ? '성공' : '실패'}`);

          // 제공사 정보 조회
          let providerName = tx.details.game.vendor || 'Unknown'; // ✅ 기본값 설정
          if (game?.provider_id) {
            const { data: provider } = await supabase
              .from('honor_game_providers')
              .select('name')
              .eq('id', game.provider_id)
              .maybeSingle();
            
            if (provider?.name) {
              providerName = provider.name;
            }
          }

          // 게임 제목 결정
          const gameTitle = game?.name || tx.details.game.title || tx.details.game.id || 'Unknown Game';

          console.log(`   📝 저장할 데이터: provider=${providerName}, game=${gameTitle}`);

          // 같은 라운드의 win 트랜잭션 찾기
          const winTx = transactions.find(
            (t: any) => t.type === 'win' && 
                 t.details?.game?.round === tx.details.game.round &&
                 t.user.username === tx.user.username
          );

          const winAmount = winTx?.amount || 0;
          const betAmount = Math.abs(tx.amount);
          const balanceAfter = tx.before - betAmount + winAmount;

          const { error } = await supabase
            .from('game_records')
            .insert({
              external_txid: tx.id,
              user_id: userInfo.id,
              username: tx.user.username,
              game_id: game?.id || null,
              provider_id: null,  // HonorAPI는 별도 provider 테이블 사용
              provider_name: providerName,
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

          if (error) {
            if (error.code !== '23505') { // 중복이 아닌 에러만 카운트
              console.error(`   ❌ HonorAPI 저장 오류:`, error);
              totalErrors++;
            }
          } else {
            totalSynced++;
          }

        } catch (err) {
          console.error(`   ❌ 레코드 처리 오류:`, err);
          totalErrors++;
        }
      }

      console.log(`✅ Partner ${partner.id}: 동기화 완료 (신규: ${newBetTransactions.length}, 저장: ${totalSynced})`);


    } catch (error) {
      console.error(`❌ Partner ${partner.id} HonorAPI 동기화 에러:`, error);
      totalErrors++;
    }
  }

  console.log(`\n🎉 [HonorAPI Sync] 완료 - ${totalSynced}개 저장, ${totalErrors}개 에러`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: lv1Partners.length
  };
}

// =====================================================
// Lv2 파트너 보유금 동기화
// =====================================================
async function syncLv2Balances(): Promise<any> {
  console.log('\n' + '='.repeat(60));
  console.log('⏰ [Lv2 Balance Sync] 시작 -', new Date().toISOString());
  console.log('='.repeat(60));

  // Lv2 파트너 목록 조회
  try {
    const { data: lv2Partners, error: partnersError } = await supabase
      .from('partners')
      .select('id, nickname, parent_id')
      .eq('level', 2)
      .eq('status', 'active');

    if (partnersError) {
      console.log('❌ Lv2 파트너 조회 실패:');
      console.log(`   에러 메시지: ${partnersError.message}`);
      console.log(`   에러 코드: ${partnersError.code}`);
      console.log(`   에러 상세: ${JSON.stringify(partnersError)}`);
      return { success: false, message: 'Failed to fetch Lv2 partners', error: partnersError };
    }

    if (!lv2Partners || lv2Partners.length === 0) {
      console.log('⚠️ 활성 Lv2 파트너가 없습니다');
      return { success: true, message: 'No active Lv2 partners', synced: 0 };
    }

    console.log(`\n📋 활성 Lv2 파트너 ${lv2Partners.length}개 발견:`);
    lv2Partners.forEach((p, idx) => {
      console.log(`   ${idx + 1}. ${p.nickname} (ID: ${p.id})`);
    });

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

      console.log(`\n🔄 Partner ${partner.id} (${partner.nickname}) 처리 시작...`);
      console.log(`   Parent ID: ${partner.parent_id || 'N/A'}`);

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

        if (investConfig) {
          console.log(`   📌 Invest API 설정 찾음 (활성: ${investConfig.is_active !== false})`);
        } else {
          console.log(`   📌 Invest API 설정 없음`);
        }

        if (investConfig && investConfig.is_active !== false) {
          // Dynamic import to avoid circular dependency
          const investModule = await import('https://deno.land/x/invest_api@v1.0.0/mod.ts').catch(() => null);
          
          // Note: Invest API는 별도 모듈이 필요하므로 여기서는 스킵
          // 실제 구현 시에는 invest 토큰 조회 및 잔고 조회 로직 추가
          console.log(`   ⚠️ Invest API 동기화는 별도 구현 필요`);
        } else if (investConfig && investConfig.is_active === false) {
          console.log(`   ⏭️ Invest API 비활성화됨`);
        }
      } catch (investError: any) {
        console.log(`   ❌ Invest 동기화 실패: ${investError.message}`);
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

        if (oroConfig) {
          console.log(`   📌 OroPlay API 설정 찾음 (활성: ${oroConfig.is_active !== false})`);
        } else {
          console.log(`   📌 OroPlay API 설정 없음`);
        }

        if (oroConfig && oroConfig.is_active !== false) {
          const oroToken = await getOroPlayToken(partner.id);
          const oroBalance = await getAgentBalance(oroToken);
          balances.oroplay_balance = oroBalance;
          console.log(`   ✅ OroPlay 잔고 동기화: ${oroBalance}`);
          syncResults.oroplay.synced++;
        } else if (oroConfig) {
          console.log(`   ⏭️ OroPlay API 비활성화됨`);
        }
      } catch (oroError: any) {
        console.log(`   ❌ OroPlay 동기화 실패: ${oroError.message}`);
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

        if (familyConfig) {
          console.log(`   📌 FamilyAPI 설정 찾음 (활성: ${familyConfig.is_active !== false}, API Key: ${familyConfig.api_key ? '있음' : '없음'})`);
        } else {
          console.log(`   📌 FamilyAPI 설정 없음`);
        }

        if (familyConfig && familyConfig.api_key && familyConfig.is_active !== false) {
          const familyToken = await getFamilyApiToken(partner.id);
          const familyBalance = await getFamilyApiAgentBalance(familyConfig.api_key, familyToken);
          balances.familyapi_balance = familyBalance;
          console.log(`   ✅ FamilyAPI 잔고 동기화: ${familyBalance}`);
          syncResults.familyapi.synced++;
        } else if (familyConfig && familyConfig.is_active === false) {
          console.log(`   ⏭️ FamilyAPI 비활성화됨`);
        }
      } catch (familyError: any) {
        console.log(`   ❌ FamilyAPI 동기화 실패: ${familyError.message}`);
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

        if (honorConfig) {
          console.log(`   📌 HonorAPI 설정 찾음 (활성: ${honorConfig.is_active !== false}, API Key: ${honorConfig.api_key ? '있음' : '없음'})`);
        } else {
          console.log(`   📌 HonorAPI 설정 없음`);
        }

        if (honorConfig && honorConfig.api_key && honorConfig.is_active !== false) {
          const honorBalance = await getHonorApiAgentBalance(honorConfig.api_key);
          balances.honorapi_balance = honorBalance;
          console.log(`   ✅ HonorAPI 잔고 동기화: ${honorBalance}`);
          syncResults.honorapi.synced++;
        } else if (honorConfig && honorConfig.is_active === false) {
          console.log(`   ⏭️ HonorAPI 비활성화됨`);
        }
      } catch (honorError: any) {
        console.log(`   ❌ HonorAPI 동기화 실패: ${honorError.message}`);
        syncResults.honorapi.errors++;
      }

      // ========================================
      // 5. DB 업데이트 (수집된 잔고들을 한 번에 업데이트)
      // ========================================
      if (Object.keys(balances).length > 0) {
        console.log(`\n   📝 DB 업데이트 대기중:`);
        Object.entries(balances).forEach(([key, value]) => {
          console.log(`      - ${key}: ${value}`);
        });
        
        try {
          const updatePayload = {
            ...balances,
            updated_at: new Date().toISOString()
          };
          console.log(`   📌 업데이트 파트너 ID: ${partner.id}`);
          console.log(`   📌 업데이트 페이로드:`, JSON.stringify(updatePayload));
          
          const { error: updateError, data: updateData, status } = await supabase
            .from('partners')
            .update(updatePayload)
            .eq('id', partner.id)
            .select();

          console.log(`   📌 업데이트 응답 상태: ${status}`);
          console.log(`   📌 업데이트 응답 데이터:`, updateData);
          
          if (updateError) {
            console.log(`   ❌ DB 업데이트 실패:`);
            console.log(`      - 에러 메시지: ${updateError.message}`);
            console.log(`      - 에러 코드: ${updateError.code}`);
            console.log(`      - 에러 상세: ${JSON.stringify(updateError)}`);
            totalErrors++;
          } else if (!updateData || updateData.length === 0) {
            console.log(`   ⚠️ DB 업데이트 반응 없음 - 매칭되는 레코드 없거나 RLS 문제 가능성`);
            console.log(`      - 파트너 ID: ${partner.id}`);
            totalErrors++;
          } else {
            console.log(`   ✅ DB 업데이트 성공! ${Object.keys(balances).length}개 필드 업데이트됨`);
            console.log(`      - 업데이트된 레코드: ${updateData.length}개`);
            totalSynced++;
          }
        } catch (updateCatchError: any) {
          console.log(`   ❌ DB 업데이트 중 예외 발생:`, updateCatchError.message);
          console.log(`      - 상세 에러:`, JSON.stringify(updateCatchError));
          totalErrors++;
        }
      } else {
        console.log(`   ⏭️ 동기화할 잔고 데이터 없음`);
      }

    } catch (error) {
      console.log(`   ❌ 처리 중 에러 발생:`, error);
      totalErrors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 [Lv2 Balance Sync] 완료 - 결과 요약');
  console.log('='.repeat(60));
  console.log(`📊 총 파트너: ${lv2Partners.length}개`);
  console.log(`✅ DB 업데이트 성공: ${totalSynced}개 파트너`);
  console.log(`❌ DB 업데이트 실패: ${totalErrors}개 파트너`);
  console.log(`\n🌐 API별 동기화 결과:`);
  console.log(`   OroPlay: ${syncResults.oroplay.synced}개 ✅, ${syncResults.oroplay.errors}개 ❌`);
  console.log(`   FamilyAPI: ${syncResults.familyapi.synced}개 ✅, ${syncResults.familyapi.errors}개 ❌`);
  console.log(`   HonorAPI: ${syncResults.honorapi.synced}개 ✅, ${syncResults.honorapi.errors}개 ❌`);
  console.log(`   Invest: ${syncResults.invest.synced}개 ✅, ${syncResults.invest.errors}개 ❌`);
  console.log('='.repeat(60) + '\n');

  return {
    success: true,
    message: `Lv2 보유금 동기화 완료: ${totalSynced}개 파트너 DB 업데이트됨`,
    synced: totalSynced,
    errors: totalErrors,
    totalPartners: lv2Partners.length,
    syncResults: {
      oroplay: syncResults.oroplay,
      familyapi: syncResults.familyapi,
      honorapi: syncResults.honorapi,
      invest: syncResults.invest
    },
    timestamp: new Date().toISOString()
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

  // ⭐⭐⭐ 모든 요청 로깅 (body 포함)
  console.log(`\n🌐🌐🌐 [Edge Function] 요청 수신 🌐🌐🌐`);
  console.log(`📍 Method: ${req.method}`);
  console.log(`📍 Path: ${path}`);
  console.log(`📍 Full URL: ${req.url}`);
  console.log(`📍 Headers:`, Object.fromEntries(req.headers.entries()));
  
  // Body 복제 (한 번만 읽을 수 있으므로)
  const clonedReq = req.clone();
  try {
    const body = await clonedReq.text();
    console.log(`📍 Body (raw):`, body);
    if (body) {
      try {
        const jsonBody = JSON.parse(body);
        console.log(`📍 Body (JSON):`, jsonBody);
      } catch {
        console.log(`📍 Body is not JSON`);
      }
    }
  } catch {
    console.log(`📍 Body: (읽기 실패 또는 없음)`);
  }
  console.log(`🌐🌐🌐 ===============================🌐🌐🌐\n`);

  try {
    // Root health check
    if (path === '/' || path === '/server' || path === '/server/' || 
        path === '/functions/v1/server' || path === '/functions/v1/server/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'OroPlay Sync Server',
          timestamp: new Date().toISOString(),
          version: 'v1.3.0', // ⭐ FamilyAPI callback 분리로 버전 업데이트
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
      return new Response(
        JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), version: 'v1.3.0' }),
        { headers: corsHeaders }
      );
    }

    // =====================================================
    // ⭐ FamilyAPI 콜백 엔드포인트 (PUBLIC - Authorization 불필요)
    // ⭐ Vercel rewrites를 통해 /server/balance 형태로 들어옴
    // =====================================================
    
    // 1. 잔고 확인 콜백 (GET, POST 지원)
    if ((path.endsWith('/balance') || path === '/server/balance' || path === '/functions/v1/server/balance') && req.method === 'POST') {
      console.log('📞 [FamilyAPI] /balance callback 처리');
      return await handleBalanceCallback(req, supabase, corsHeaders);
    }

    // 2. 카지노 베팅/결과 콜백
    if ((path.endsWith('/changebalance') || path === '/server/changebalance' || path === '/functions/v1/server/changebalance') && req.method === 'POST') {
      console.log('📞 [FamilyAPI] /changebalance callback 처리');
      return await handleChangeBalanceCallback(req, supabase, corsHeaders);
    }

    // 3. 슬롯 베팅/결과 콜백
    if ((path.endsWith('/changebalance/slot') || path === '/server/changebalance/slot' || path === '/functions/v1/server/changebalance/slot') && req.method === 'POST') {
      console.log('📞 [FamilyAPI] /changebalance/slot callback 처리');
      return await handleChangeBalanceSlotCallback(req, supabase, corsHeaders);
    }

    // ✅ Authorization 헤더 검증 (동기화 엔드포인트만 - lv2-balances 제외)
    if (path.includes('/sync/') && !path.includes('lv2-balances')) {
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

      console.log('✅ Authorization verified');
    }

    // OroPlay 베팅 동기화
    if ((path === '/sync/oroplay-bets' || path === '/server/sync/oroplay-bets') && req.method === 'POST') {
      console.log('🎯 [Sync] 베팅 동기화 요청 수신');
      const result = await syncOroplayBets();
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // Invest 베팅 동기화
    if ((path === '/sync/invest-bets' || path === '/server/sync/invest-bets') && req.method === 'POST') {
      console.log('🎯 [Sync] 베팅 동기화 요청 수신');
      const result = await syncInvestBets();
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // FamilyAPI 베팅 동기화
    if ((path === '/sync/familyapi-bets' || path === '/server/sync/familyapi-bets') && req.method === 'POST') {
      console.log('🎯 [Sync] 베팅 동기화 요청 수신');
      const result = await syncFamilyapiBets();
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // HonorAPI 베팅 동기화
    if ((path === '/sync/honorapi-bets' || path === '/server/sync/honorapi-bets') && req.method === 'POST') {
      console.log('🎯 [Sync] 베팅 동기화 요청 수신');
      const result = await syncHonorapiBets();
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // Lv2 보유금 동기화
    if ((path === '/sync/lv2-balances' || path === '/server/sync/lv2-balances') && req.method === 'POST') {
      console.log('🎯 [Sync] 보유금 동기화 요청 수신');
      const result = await syncLv2Balances();
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // 자동 정산 (매일 00:04 실행)
    if ((path === '/sync/auto-settlement' || path === '/server/sync/auto-settlement') && req.method === 'POST') {
      console.log('🎯 [Auto Settlement] 자동 정산 요청 수신');
      const result = await executeAutoSettlement();
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // 404 Not Found
    return new Response(
      JSON.stringify({ error: 'Not Found', path, method: req.method }),
      { status: 404, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});