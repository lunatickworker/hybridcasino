import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import {
  handleBalanceCallback,
  handleChangeBalanceCallback,
  handleChangeBalanceSlotCallback
} from "./familycallback.ts";

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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
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
    .select('token, token_expires_at, client_id, client_secret')
    .eq('partner_id', partnerId)
    .eq('api_provider', 'oroplay')
    .maybeSingle();
  
  if (configError || !config) {
    throw new Error('OroPlay API 설정을 찾을 수 없습니다.');
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
    credit: response.data?.credit
  });
  
  // resultCode는 문자열 "0" 또는 숫자 0일 수 있음
  if (response.resultCode !== '0' && response.resultCode !== 0) {
    throw new Error(`FamilyAPI Agent 잔고 조회 실패: ${response.resultMessage || response.resultCode}`);
  }
  
  return parseFloat(response.data?.credit || 0);
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
      for (const bet of completedBets) {
        try {
          const userId = userMap.get(bet.userCode);
          if (!userId) {
            continue;
          }

          // 게임 정보 조회 (vendor_code와 game_code로 매칭)
          const { data: gameData } = await supabase
            .from('games')
            .select('id, provider_id, game_type') // ✅ game_type 추가
            .eq('vendor_code', bet.vendorCode)
            .eq('game_code', bet.gameCode)
            .eq('api_type', 'oroplay')
            .maybeSingle();

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
              game_type: gameData?.game_type || 'casino', // ✅ game_type 추가
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
// Lv2 파트너 OroPlay 보유금 동기화
// =====================================================
async function syncLv2Balances(): Promise<any> {
  console.log('💰 [Lv2 Balance Sync] 보유금 동기화 시작 (Invest, OroPlay, FamilyAPI)');

  // Lv2 파트너 목록 조회
  const { data: lv2Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname, parent_id')
    .eq('level', 2)
    .eq('status', 'active');

  if (partnersError || !lv2Partners || lv2Partners.length === 0) {
    return { success: true, message: 'No active Lv2 partners', synced: 0 };
  }

  console.log(`📋 ${lv2Partners.length}개 Lv2 파트너 발견`);

  let totalSynced = 0;
  let totalErrors = 0;
  const syncResults = {
    invest: { synced: 0, errors: 0 },
    oroplay: { synced: 0, errors: 0 },
    familyapi: { synced: 0, errors: 0 }
  };

  // 각 Lv2 파트너별로 처리
  for (const partner of lv2Partners) {
    try {
      if (!partner.parent_id) {
        continue;
      }

      console.log(`\n🔄 Partner ${partner.id} (${partner.nickname}) 처리 중...`);

      const balances: any = {};

      // ========================================
      // 1. Invest Balance 동기화
      // ========================================
      try {
        // ✅ Invest API 설정이 있고 활성화되어 있는지 확인
        const { data: investConfig } = await supabase
          .from('api_configs')
          .select('id, is_active')
          .eq('partner_id', partner.parent_id)
          .eq('api_provider', 'invest')
          .maybeSingle();

        if (investConfig && investConfig.is_active !== false) {
          // Dynamic import to avoid circular dependency
          const investModule = await import('https://deno.land/x/invest_api@v1.0.0/mod.ts').catch(() => null);
          
          // Note: Invest API는 별도 모듈이 필요하므로 여기서는 스킵
          // 실제 구현 시에는 invest 토큰 조회 및 잔고 조회 로직 추가
          console.log(`⚠️ Partner ${partner.id}: Invest API 동기화는 별도 구현 필요`);
        } else if (investConfig && investConfig.is_active === false) {
          console.log(`⏭️ Partner ${partner.id}: Invest API 비활성화됨 - 동기화 건너뜀`);
        }
      } catch (investError: any) {
        console.log(`⚠️ Partner ${partner.id}: Invest 동기화 실패 - ${investError.message}`);
        syncResults.invest.errors++;
      }

      // ========================================
      // 2. OroPlay Balance 동기화
      // ========================================
      try {
        // ✅ OroPlay API가 활성화되어 있는지 확인
        const { data: oroConfig } = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('partner_id', partner.parent_id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();

        if (oroConfig && oroConfig.is_active !== false) {
          const oroToken = await getOroPlayToken(partner.parent_id);
          const oroBalance = await getAgentBalance(oroToken);
          balances.oroplay_balance = oroBalance;
          console.log(`💰 Partner ${partner.id} OroPlay: ${oroBalance}`);
          syncResults.oroplay.synced++;
        } else {
          console.log(`⏭️ Partner ${partner.id}: OroPlay API 비활성화됨 - 동기화 건너뜀`);
        }
      } catch (oroError: any) {
        console.log(`⚠️ Partner ${partner.id}: OroPlay 동기화 실패 - ${oroError.message}`);
        syncResults.oroplay.errors++;
      }

      // ========================================
      // 3. FamilyAPI Balance 동기화
      // ========================================
      try {
        // ✅ FamilyAPI가 활성화되어 있는지 확인
        const { data: familyConfig } = await supabase
          .from('api_configs')
          .select('api_key, is_active')
          .eq('partner_id', partner.parent_id)
          .eq('api_provider', 'familyapi')
          .maybeSingle();

        if (familyConfig && familyConfig.api_key && familyConfig.is_active !== false) {
          const familyToken = await getFamilyApiToken(partner.parent_id);
          const familyBalance = await getFamilyApiAgentBalance(familyConfig.api_key, familyToken);
          balances.familyapi_balance = familyBalance;
          console.log(`💰 Partner ${partner.id} FamilyAPI: ${familyBalance}`);
          syncResults.familyapi.synced++;
        } else if (familyConfig && familyConfig.is_active === false) {
          console.log(`⏭️ Partner ${partner.id}: FamilyAPI 비활성화됨 - 동기화 건너뜀`);
        }
      } catch (familyError: any) {
        console.log(`⚠️ Partner ${partner.id}: FamilyAPI 동기화 실패 - ${familyError.message}`);
        syncResults.familyapi.errors++;
      }

      // ========================================
      // 4. DB 업데이트 (수집된 잔고들을 한 번에 업데이트)
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
    if (path === '/' || path === '/server' || path === '/server/') {
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
    // =====================================================
    
    // 1. 잔고 확인 콜백 (GET, POST 지원)
    if ((path === '/balance' || path === '/server/balance') && (req.method === 'POST' || req.method === 'GET')) {
      return await handleBalanceCallback(req, supabase, corsHeaders);
    }

    // 2. 카지노 베팅/결과 콜백
    if ((path === '/changebalance' || path === '/server/changebalance') && req.method === 'POST') {
      return await handleChangeBalanceCallback(req, supabase, corsHeaders);
    }

    // 3. 슬롯 베팅/결과 콜백
    if ((path === '/changebalance/slot' || path === '/server/changebalance/slot') && req.method === 'POST') {
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

    // Lv2 보유금 동기화
    if ((path === '/sync/lv2-balances' || path === '/server/sync/lv2-balances') && req.method === 'POST') {
      console.log('🎯 [Sync] 보유금 동기화 요청 수신');
      const result = await syncLv2Balances();
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