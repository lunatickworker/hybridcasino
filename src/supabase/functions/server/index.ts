console.log('🚀 [STARTUP] Edge Function 시작');

// =====================================================
// Supabase 클라이언트 초기화
// =====================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 필수 환경 변수
const OROPLAY_BASE_URL = Deno.env.get('OROPLAY_BASE_URL') || 'https://bs.sxvwlkohlv.com/api/v2';
const FAMILYAPI_BASE_URL = Deno.env.get('FAMILYAPI_BASE_URL') || 'https://api.familyapi.com';
const PROXY_URL = Deno.env.get('PROXY_URL') || 'https://vi8282.com/proxy';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;
  
  console.log(`🔔 [HANDLER] ${req.method} ${path}`);

  // OPTIONS preflight 응답
  if (req.method === 'OPTIONS') {
    console.log('✅ [HANDLER] OPTIONS 200 응답');
    return new Response(null, { 
      status: 200,
      headers: corsHeaders,
    });
  }

  const executedAt = new Date().toISOString();
  
  try {
    // 경로별 동기화 처리
    if (path.includes('/sync/oroplay-bets')) {
      console.log('🎰 [SYNC] OroPlay 베팅 동기화 시작');
      const result = await syncOroplayBets();
      return new Response(
        JSON.stringify({
          ...result,
          functionExecutedAt: executedAt,
          functionRespondedAt: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (path.includes('/sync/honorapi-bets')) {
      console.log('🎰 [SYNC] HonorAPI 베팅 동기화 시작');
      const result = await syncHonorapiBets();
      return new Response(
        JSON.stringify({
          ...result,
          functionExecutedAt: executedAt,
          functionRespondedAt: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (path.includes('/sync/lv2-balances')) {
      console.log('💰 [SYNC] Lv2 보유금 동기화 시작');
      const result = await syncLv2Balances();
      return new Response(
        JSON.stringify({
          ...result,
          functionExecutedAt: executedAt,
          functionRespondedAt: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (path.includes('/sync/')) {
      console.log(`✅ [HANDLER] 기타 Sync 요청 - ${path}`);
      return new Response(
        JSON.stringify({
          success: true,
          synced: 0,
          errors: 0,
          functionExecutedAt: executedAt,
          functionRespondedAt: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Health check / 기타
    console.log(`✅ [HANDLER] 기타 요청 - ${path}`);
    return new Response(
      JSON.stringify({ ok: true, timestamp: executedAt }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('❌ [HANDLER] 에러:', error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        functionExecutedAt: executedAt,
        functionRespondedAt: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

console.log('✅ [STARTUP] Edge Function 준비 완료');
async function proxyCall<T = any>(config: {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
}): Promise<T> {
  console.log(`📡 [ProxyCall] ${config.method} ${config.url}`);
  
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  
  if (!response.ok) {
    console.error(`❌ [ProxyCall] 응답 오류: ${response.status} ${response.statusText}, PROXY_URL=${PROXY_URL}`);
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
  console.log('[OroPlay] 시작');
  // 1. 로그인한 Lv2 파트너 조회 (활성 세션이 있는 Lv2만)
  const { data: activeLv2Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname, parent_id')
    .eq('level', 2)
    .eq('status', 'active')
    .not('parent_id', 'is', null);

  if (partnersError) {
    console.error('❌ [OroPlay] 파트너 조회 오류:', partnersError);
    return { success: false, message: 'Failed to fetch partners', errors: 1, synced: 0 };
  }

  if (!activeLv2Partners || activeLv2Partners.length === 0) {
    console.log('[OroPlay] 활성 Lv2 파트너 없음');
    return { success: true, message: 'No active Lv2 partners', synced: 0, errors: 0 };
  }
  
  console.log(`[OroPlay] ${activeLv2Partners.length}개 활성 Lv2 파트너 발견`);

  let totalSynced = 0;
  let totalErrors = 0;

  for (const lv2Partner of activeLv2Partners) {
    try {
      // 1. Lv2 자신의 OroPlay API 설정 확인
      let oroConfig = await supabase
        .from('api_configs')
        .select('client_id, client_secret, is_active')
        .eq('partner_id', lv2Partner.id)
        .eq('api_provider', 'oroplay')
        .maybeSingle();

      // Lv2에 설정이 없으면 Lv1(parent_id)에서 찾기
      let partnerId = lv2Partner.id;
      if (!oroConfig.data && lv2Partner.parent_id) {
        console.log(`   🔍 Lv2(${lv2Partner.id})에 OroPlay 설정 없음, Lv1(${lv2Partner.parent_id})에서 찾는 중...`);
        oroConfig = await supabase
          .from('api_configs')
          .select('client_id, client_secret, is_active')
          .eq('partner_id', lv2Partner.parent_id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();
        partnerId = lv2Partner.parent_id;
      }

      // 설정 존재 여부 및 활성화 상태 확인
      if (!oroConfig.data) {
        console.log(`   ⚠️ ${lv2Partner.nickname}: OroPlay API 설정 없음`);
        continue;
      }

      console.log(`   ✅ ${lv2Partner.nickname}: OroPlay 설정 발견 (is_active=${oroConfig.data.is_active})`);

      if (oroConfig.data.is_active === false) {
        console.log(`   ⚠️ ${lv2Partner.nickname}: OroPlay API 비활성화됨`);
        continue;
      }

      // client_id, client_secret 확인
      if (!oroConfig.data.client_id || !oroConfig.data.client_secret) {
        console.error(`   ❌ ${lv2Partner.nickname} OroPlay: client_id(${oroConfig.data.client_id ? '✓' : '✗'}), client_secret(${oroConfig.data.client_secret ? '✓' : '✗'}) 설정 누락`);
        totalErrors++;
        continue;
      }

      console.log(`   ✅ ${lv2Partner.nickname}: 자격증명 확인 완료`);

      // 2. OroPlay 토큰 가져오기
      let token: string;
      try {
        console.log(`   🔑 ${lv2Partner.nickname}: 토큰 조회 시작...`);
        token = await getOroPlayToken(partnerId);
        console.log(`   ✅ ${lv2Partner.nickname}: 토큰 획득 성공`);
      } catch (tokenError: any) {
        console.error(`   ❌ ${lv2Partner.nickname} OroPlay 토큰 조회 실패: ${tokenError.message}`);
        totalErrors++;
        continue;
      }

      // 2-1. Lv2 조직의 모든 회원 조회 (재귀적)
      const getAllDescendantUsers = async (partnerId: string): Promise<any[]> => {
        // 1. 현재 파트너의 직속 사용자 조회
        console.log(`   🔎 [조직 조회] partnerId=${partnerId}로 users 테이블 조회 시작`);
        const { data: directUsers, error: usersError } = await supabase
          .from('users')
          .select('id, username, referrer_id')
          .eq('referrer_id', partnerId);

        if (usersError) {
          console.error(`   ❌ [조직 조회] users 조회 에러:`, usersError);
        }
        console.log(`   👤 [조직 조회] 결과: ${directUsers?.length || 0}명 (partnerId=${partnerId})`);
        if (directUsers && directUsers.length > 0) {
          directUsers.slice(0, 3).forEach(u => {
            console.log(`      └─ ${u.username} (id=${u.id}, referrer_id=${u.referrer_id})`);
          });
        }

        // 2. 현재 파트너의 하위 파트너 조회
        console.log(`   🔎 [OroPlay 조직] partnerId=${partnerId}의 하위 파트너 조회`);
        const { data: childPartners, error: childError } = await supabase
          .from('partners')
          .select('id, nickname')
          .eq('parent_id', partnerId);

        if (childError) {
          console.error(`   ❌ [OroPlay 조직] childPartners 조회 에러:`, childError);
        }
        console.log(`   🏢 [OroPlay 조직] 하위 파트너: ${childPartners?.length || 0}개`);
        if (childPartners && childPartners.length > 0) {
          childPartners.slice(0, 3).forEach(p => {
            console.log(`      └─ ${p.nickname} (id=${p.id})`);
          });
        }

        if (!childPartners || childPartners.length === 0) {
          console.log(`   ✅ [OroPlay 조직] 하위 파트너 없음, 직속 사용자 ${directUsers?.length || 0}명 반환`);
          return directUsers || [];
        }

        // 3. 각 하위 파트너의 사용자도 재귀 조회
        console.log(`   🔄 [OroPlay 조직] ${childPartners.length}개 하위 파트너 재귀 처리 시작`);
        const allUsers = [...(directUsers || [])];
        for (const child of childPartners) {
          console.log(`   ↳ 재귀: ${child.nickname}(${child.id}) 조회 중...`);
          const childUsers = await getAllDescendantUsers(child.id);
          console.log(`   ↰ 재귀 완료: ${child.nickname} → ${childUsers.length}명 수집`);
          allUsers.push(...childUsers);
        }

        console.log(`   ✅ [OroPlay 조직] 최종: 총 ${allUsers.length}명 (직속: ${directUsers?.length || 0}명 + 하위: ${allUsers.length - (directUsers?.length || 0)}명)`);
        return allUsers;
      };

      // Lv2 조직의 모든 회원 조회
      const lv2OrganizationUsers = await getAllDescendantUsers(lv2Partner.id);

      console.log(`   👥 ${lv2Partner.nickname}: 조직 회원 ${lv2OrganizationUsers.length}명 조회됨`);

      if (lv2OrganizationUsers.length === 0) {
        console.log(`   ⏭️ ${lv2Partner.nickname}: 조직 회원 없음 - 스킵`);
        continue;
      }

      // 3. 최근 동기화 시간 확인 (4초 전부터 조회)
      const startDate = new Date(Date.now() - 4000).toISOString();

      console.log(`   📅 ${lv2Partner.nickname}: 조회 시간=${startDate}`);

      // 4. 배팅 내역 조회
      const result = await getBettingHistory(token, startDate, 1000);

      console.log(`   📡 ${lv2Partner.nickname}: API 호출 결과 - histories=${result?.histories?.length || 0}건`);

      if (!result || !result.histories || result.histories.length === 0) {
        console.log(`   ℹ️ ${lv2Partner.nickname}: [결과] API 베팅 내역 0건 → DB 저장 0건`);
        continue;
      }

      const apiTotalBets = result.histories.length;
      console.log(`   📊 ${lv2Partner.nickname}: [1단계] API 수신 ${apiTotalBets}건`);

      // 5. status=1 (완료된 배팅만) 필터링
      const completedBets = result.histories.filter((bet: any) => bet.status === 1);
      const completedBetsCount = completedBets.length;
      console.log(`   ✅ ${lv2Partner.nickname}: [2단계] 완료된 배팅 ${completedBetsCount}건 (전체 대비: ${apiTotalBets}건)`);

      // 6. 이미 저장된 트랜잭션 ID 조회 (중복 제거) - CRITICAL: api_type도 함께 확인
      const { data: existingOroplayRecords } = await supabase
        .from('game_records')
        .select('external_txid')
        .eq('partner_id', lv2Partner.id)
        .eq('api_type', 'oroplay');

      // ✅ 타입 변환: 모든 ID를 문자열로 통일하여 비교 (BigInt 안전성)
      const existingOroplayTxIds = new Set(
        existingOroplayRecords?.map((r: any) => String(r.external_txid)) || []
      );
      const existingCount = existingOroplayTxIds.size;
      console.log(`   📋 ${lv2Partner.nickname}: [3단계] 이미 저장됨 ${existingCount}건`);

      // 6. 새로운 베팅만 필터링 (이미 저장된 것 제외)
      const newCompletedBets = completedBets.filter((bet: any) => {
        const txId = String(bet.id);
        return !existingOroplayTxIds.has(txId);
      });

      const newBetsCount = newCompletedBets.length;
      console.log(`   🆕 ${lv2Partner.nickname}: [4단계] 새로운 배팅 ${newBetsCount}건`);

      if (newBetsCount === 0) {
        console.log(`   ℹ️ ${lv2Partner.nickname}: [결과] 신규 배팅 없음 → DB 저장 0건`);
        continue;
      }

      // 7. 사용자 매핑 (Lv2 조직 회원만)
      const userMap = new Map<string, any>();
      lv2OrganizationUsers.forEach((u: any) => {
        userMap.set(u.username, { id: u.id, referrer_id: u.referrer_id });
      });

      // 8. game_records에 저장
      for (const bet of newCompletedBets) {
        try {
          const userInfo = userMap.get(bet.userCode);
          if (!userInfo) {
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

          // 게임 정보 조회 (vendor_code와 game_code로 매칭)
          const { data: gameData } = await supabase
            .from('games')
            .select('id, provider_id, game_type, name, name_ko')
            .eq('vendor_code', bet.vendorCode)
            .eq('game_code', bet.gameCode)
            .eq('api_type', 'oroplay')
            .maybeSingle();

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

          // ⭐ NULL 방지 최종 체크
          const finalProviderName = providerName || bet.vendorCode || 'Unknown Provider';
          const finalGameTitle = gameTitle || bet.gameCode || 'Unknown Game';

          const { error } = await supabase
            .from('game_records')
            .insert({
              api_type: 'oroplay',
              partner_id: userInfo.referrer_id,
              external_txid: bet.id,
              username: bet.userCode,
              user_id: userInfo.id,
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
              console.error(`❌ OroPlay 저장 오류:`, error);
              totalErrors++;
            }
          } else {
            totalSynced++;
          }

        } catch (err) {
          console.error(`❌ OroPlay 레코드 오류:`, err);
          totalErrors++;
        }
      }

      console.log(`   ✅ ${lv2Partner.nickname}: [최종 결과] ${totalSynced}건 DB 저장 완료 (API 수신: ${apiTotalBets}건 → DB: ${totalSynced}건)`);

    } catch (error) {
      console.error(`❌ ${lv2Partner.nickname} OroPlay:`, error);
      totalErrors++;
    }
  }

  console.log(`[OroPlay] 🎉 완료: 총 ${totalSynced}건 저장, ${totalErrors}개 에러`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: activeLv2Partners.length
  };
}

// =====================================================
// Invest 베팅 기록 동기화
// =====================================================
async function syncInvestBets(): Promise<any> {
  console.log('🎰 [Invest Sync] 베팅 기록 동기화 시작');

  // 1. 로그인한 Lv2 파트너 조회 (활성 세션이 있는 Lv2만)
  const { data: activeLv2Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname, parent_id')
    .eq('level', 2)
    .eq('status', 'active')
    .not('parent_id', 'is', null);

  if (partnersError || !activeLv2Partners || activeLv2Partners.length === 0) {
    return { success: true, message: 'No active Lv2 partners', synced: 0 };
  }

  console.log(`📋 ${activeLv2Partners.length}개 활성 Lv2 파트너 발견`);

  let totalSynced = 0;
  let totalErrors = 0;

  for (const lv2Partner of activeLv2Partners) {
    try {
      console.log(`\n🔄 [${lv2Partner.nickname}] Lv2 로그인 감지, Invest 베팅 동기화 시작...`);

      // 1. Lv2 자신의 Invest API 설정 확인
      let investConfig = await supabase
        .from('api_configs')
        .select('opcode, secret_key, is_active')
        .eq('partner_id', lv2Partner.id)
        .eq('api_provider', 'invest')
        .maybeSingle();

      // Lv2에 설정이 없으면 Lv1(parent_id)에서 찾기
      let partnerId = lv2Partner.id;
      if (!investConfig.data && lv2Partner.parent_id) {
        console.log(`   🔍 Lv2(${lv2Partner.id})에 Invest 설정 없음, Lv1(${lv2Partner.parent_id})에서 찾는 중...`);
        investConfig = await supabase
          .from('api_configs')
          .select('opcode, secret_key, is_active')
          .eq('partner_id', lv2Partner.parent_id)
          .eq('api_provider', 'invest')
          .maybeSingle();
        partnerId = lv2Partner.parent_id;
      }

      if (!investConfig.data || investConfig.data.is_active === false) {
        console.log(`⚠️ Invest API 설정 없음 또는 비활성화`);
        continue;
      }

      // 최근 동기화 시간 확인 (34초 전부터 조회)
      const startDate = new Date(Date.now() - 34000).toISOString();
      
      console.log(`📅 조회 기간: ${startDate} ~ 현재`);

      // TODO: Invest API 베팅 내역 조회 및 저장 로직 구현
      console.log(`✅ Partner ${partnerId}: Invest 동기화 완료 (구현 필요)`);

    } catch (error) {
      console.error(`❌ ${lv2Partner.nickname} Invest 동기화 에러:`, error);
      totalErrors++;
    }
  }

  console.log(`\n🎉 [Invest Sync] 완료 - ${totalSynced}개 저장, ${totalErrors}개 에러`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: activeLv2Partners.length
  };
}

// =====================================================
// FamilyAPI 베팅 기록 동기화
// =====================================================
async function syncFamilyapiBets(): Promise<any> {
  console.log('🎰 [FamilyAPI Sync] 베팅 기록 동기화 시작');

  // 1. 로그인한 Lv2 파트너 조회 (활성 세션이 있는 Lv2만)
  const { data: activeLv2Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname, parent_id')
    .eq('level', 2)
    .eq('status', 'active')
    .not('parent_id', 'is', null);

  if (partnersError || !activeLv2Partners || activeLv2Partners.length === 0) {
    return { success: true, message: 'No active Lv2 partners', synced: 0 };
  }

  console.log(`📋 ${activeLv2Partners.length}개 활성 Lv2 파트너 발견`);

  let totalSynced = 0;
  let totalErrors = 0;

  for (const lv2Partner of activeLv2Partners) {
    try {
      console.log(`\n🔄 [${lv2Partner.nickname}] Lv2 로그인 감지, FamilyAPI 베팅 동기화 시작...`);

      // 1. Lv2 자신의 FamilyAPI 설정 확인
      let familyConfig = await supabase
        .from('api_configs')
        .select('api_key, token, is_active')
        .eq('partner_id', lv2Partner.id)
        .eq('api_provider', 'familyapi')
        .maybeSingle();

      // Lv2에 설정이 없으면 Lv1(parent_id)에서 찾기
      let partnerId = lv2Partner.id;
      if (!familyConfig.data && lv2Partner.parent_id) {
        console.log(`   🔍 Lv2(${lv2Partner.id})에 FamilyAPI 설정 없음, Lv1(${lv2Partner.parent_id})에서 찾는 중...`);
        familyConfig = await supabase
          .from('api_configs')
          .select('api_key, token, is_active')
          .eq('partner_id', lv2Partner.parent_id)
          .eq('api_provider', 'familyapi')
          .maybeSingle();
        partnerId = lv2Partner.parent_id;
      }

      if (!familyConfig.data || familyConfig.data.is_active === false) {
        console.log(`⚠️ FamilyAPI 설정 없음 또는 비활성화`);
        continue;
      }

      // TODO: FamilyAPI 베팅 내역 조회 및 저장 로직 구현
      console.log(`✅ Partner ${partnerId}: FamilyAPI 동기화 완료 (구현 필요)`);

    } catch (error) {
      console.error(`❌ ${lv2Partner.nickname} FamilyAPI 동기화 에러:`, error);
      totalErrors++;
    }
  }

  console.log(`\n🎉 [FamilyAPI Sync] 완료 - ${totalSynced}개 저장, ${totalErrors}개 에러`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: activeLv2Partners.length
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

  // 1. 로그인한 Lv2 파트너 조회 (활성 세션이 있는 Lv2만)
  const { data: activeLv2Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname, parent_id')
    .eq('level', 2)
    .eq('status', 'active')
    .not('parent_id', 'is', null);

  if (partnersError || !activeLv2Partners || activeLv2Partners.length === 0) {
    return { success: true, message: 'No active Lv2 partners', synced: 0 };
  }

  console.log(`📋 ${activeLv2Partners.length}개 활성 Lv2 파트너 발견`);

  let totalSynced = 0;
  let totalErrors = 0;

  for (const lv2Partner of activeLv2Partners) {
    try {
      console.log(`\n🔄 [${lv2Partner.nickname}] Lv2 로그인 감지, HonorAPI 베팅 동기화 시작...`);

      // 1. Lv2 자신의 HonorAPI 설정 확인
      let honorConfig = await supabase
        .from('api_configs')
        .select('api_key, is_active')
        .eq('partner_id', lv2Partner.id)
        .eq('api_provider', 'honorapi')
        .maybeSingle();

      // Lv2에 설정이 없으면 Lv1(parent_id)에서 찾기
      let partnerId = lv2Partner.id;
      if (!honorConfig.data && lv2Partner.parent_id) {
        console.log(`   🔍 Lv2(${lv2Partner.id})에 HonorAPI 설정 없음, Lv1(${lv2Partner.parent_id})에서 찾는 중...`);
        honorConfig = await supabase
          .from('api_configs')
          .select('api_key, is_active')
          .eq('partner_id', lv2Partner.parent_id)
          .eq('api_provider', 'honorapi')
          .maybeSingle();
        partnerId = lv2Partner.parent_id;
      }

      if (!honorConfig.data || honorConfig.data.is_active === false) {
        console.log(`⚠️ HonorAPI 설정 없음 또는 비활성화`);
        continue;
      }

      if (!honorConfig.data.api_key) {
        console.log(`⚠️ HonorAPI api_key 없음`);
        continue;
      }

      // 1-1. Lv2 조직의 모든 회원 조회 (재귀적)
      const getAllDescendantUsers = async (partnerId: string): Promise<any[]> => {
        // 1. 현재 파트너의 직속 사용자 조회
        console.log(`   🔎 [HonorAPI 조직] partnerId=${partnerId}로 users 테이블 조회 시작`);
        const { data: directUsers, error: usersError } = await supabase
          .from('users')
          .select('id, username, referrer_id')
          .eq('referrer_id', partnerId);

        if (usersError) {
          console.error(`   ❌ [HonorAPI 조직] users 조회 에러:`, usersError);
        }
        console.log(`   👤 [HonorAPI 조직] 직속 사용자: ${directUsers?.length || 0}명 (partnerId=${partnerId})`);
        if (directUsers && directUsers.length > 0) {
          directUsers.slice(0, 3).forEach(u => {
            console.log(`      └─ ${u.username} (id=${u.id})`);
          });
        }

        if (!directUsers || directUsers.length === 0) {
          // 직속 사용자가 없으면 하위 파트너로 이동
        } else {
          // 직속 사용자가 있으면 바로 반환하지 말고 계속 진행
        }

        // 2. 현재 파트너의 하위 파트너 조회
        console.log(`   🔎 [HonorAPI 조직] partnerId=${partnerId}의 하위 파트너 조회`);
        const { data: childPartners, error: childError } = await supabase
          .from('partners')
          .select('id, nickname')
          .eq('parent_id', partnerId);

        if (childError) {
          console.error(`   ❌ [HonorAPI 조직] childPartners 조회 에러:`, childError);
        }
        console.log(`   🏢 [HonorAPI 조직] 하위 파트너: ${childPartners?.length || 0}개`);
        if (childPartners && childPartners.length > 0) {
          childPartners.slice(0, 3).forEach(p => {
            console.log(`      └─ ${p.nickname} (id=${p.id})`);
          });
        }

        if (!childPartners || childPartners.length === 0) {
          console.log(`   ✅ [HonorAPI 조직] 하위 파트너 없음, 직속 사용자 ${directUsers?.length || 0}명 반환`);
          return directUsers || [];
        }

        // 3. 각 하위 파트너의 사용자도 재귀 조회
        console.log(`   🔄 [HonorAPI 조직] ${childPartners.length}개 하위 파트너 재귀 처리 시작`);
        const allUsers = [...(directUsers || [])];
        for (const child of childPartners) {
          console.log(`      ↳ 재귀: ${child.nickname}(${child.id}) 조회 중...`);
          const childUsers = await getAllDescendantUsers(child.id);
          console.log(`      ↰ 재귀 완료: ${child.nickname} → ${childUsers.length}명 수집`);
          allUsers.push(...childUsers);
        }

        console.log(`   ✅ [HonorAPI 조직] 최종: 총 ${allUsers.length}명 (직속: ${directUsers?.length || 0}명 + 하위: ${allUsers.length - (directUsers?.length || 0)}명)`);
        return allUsers;
      };

      // Lv2 조직의 모든 회원 조회
      const lv2OrganizationUsers = await getAllDescendantUsers(lv2Partner.id);
      console.log(`   👥 ${lv2Partner.nickname} 조직 회원: ${lv2OrganizationUsers.length}명`);

      if (lv2OrganizationUsers.length === 0) {
        console.log(`   ⏭️ 조직 내 회원 없음 - 동기화 건너뜀`);
        continue;
      }

      // 2. 마지막 동기화된 external_txid 조회 (새로운 데이터만 처리하기 위함)
      const { data: lastRecord } = await supabase
        .from('game_records')
        .select('external_txid, played_at')
        .eq('partner_id', lv2Partner.id)
        .eq('api_type', 'honorapi')
        .order('external_txid', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastExternalTxid = lastRecord?.external_txid || 0;
      const lastPlayedAt = lastRecord?.played_at ? new Date(lastRecord.played_at) : new Date(0);

      console.log(`📍 마지막 external_txid=${lastExternalTxid}, played_at=${lastPlayedAt.toISOString()}`);

      // 3. 조회 기간 설정: 마지막 played_at 기준으로 1분 전부터 현재까지
      // (네트워크 지연, 클라이언트 타임 차이 등 고려하여 1분 여유)
      const now = new Date();
      const oneMinuteBeforeLastTime = new Date(lastPlayedAt.getTime() - 60000);

      const startTime = formatUTC(oneMinuteBeforeLastTime);
      const endTime = formatUTC(now);

      console.log(`📅 조회 기간: ${startTime} ~ ${endTime}`);

      // 4. 트랜잭션 조회
      const result = await getHonorApiTransactions(
        honorConfig.data.api_key,
        startTime,
        endTime,
        1,
        1000
      );

      const transactions = result.data || [];

      if (transactions.length === 0) {
        console.log(`ℹ️ Partner ${lv2Partner.id}: 새 베팅 기록 없음`);
        continue;
      }

      console.log(`📊 Partner ${lv2Partner.id}: ${transactions.length}개 트랜잭션 수신`);

      // 4. bet 타입만 필터링
      const betTransactions = transactions.filter((tx: any) => tx.type === 'bet' && tx.details?.game);
      console.log(`   ✅ 베팅 트랜잭션: ${betTransactions.length}건`);

      // 5. 이미 저장된 트랜잭션 ID 조회 (중복 제거) - CRITICAL: api_type도 함께 확인
      const { data: existingRecords } = await supabase
        .from('game_records')
        .select('external_txid')
        .eq('partner_id', lv2Partner.id)
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
        console.log(`ℹ️ 신규 베팅 기록 없음 (모두 기존 데이터)`);
        continue;
      }

      // 7. 사용자 매핑 (Lv2 조직 회원만)
      const userMap = new Map<string, any>();
      lv2OrganizationUsers.forEach((u: any) => {
        userMap.set(u.username, { id: u.id, referrer_id: u.referrer_id });
      });

      console.log(`   📊 HonorAPI userMap 생성됨: ${userMap.size}명`);

      // 8. game_records에 저장
      for (const tx of newBetTransactions) {
        try {
          const userInfo = userMap.get(tx.user.username);
          if (!userInfo) {
            continue;
          }

          // ⚠️ CRITICAL: INSERT 직전에 한 번 더 중복 체크 (경쟁 조건 방지)
          const { data: alreadyExists } = await supabase
            .from('game_records')
            .select('id')
            .eq('external_txid', tx.id)
            .eq('api_type', 'honorapi')
            .maybeSingle();

          if (alreadyExists) {
            continue;  // 조용히 건너뜀 (로그 제거)
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

      console.log(`✅ ${lv2Partner.nickname} HonorAPI 동기화 완료 (신규: ${newBetTransactions.length})`);


    } catch (error) {
      console.error(`❌ ${lv2Partner.nickname} HonorAPI 동기화 에러:`, error);
      totalErrors++;
    }
  }

  console.log(`\n🎉 [HonorAPI Sync] 완료 - ${totalSynced}개 저장, ${totalErrors}개 에러`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: activeLv2Partners.length
  };
}

// =====================================================
// Lv2 파트너 보유금 동기화
// =====================================================
async function syncLv2Balances(): Promise<any> {
  console.log('[Lv2Balance] 시작');
  const { data: lv2Partners, error: partnersError } = await supabase
    .from('partners')
    .select('id, nickname, parent_id, level, status')
    .eq('level', 2)
    .eq('status', 'active');

  if (partnersError) {
    console.error('❌ Lv2 파트너 조회 에러:', partnersError);
    return { success: false, message: 'Failed to fetch Lv2 partners', error: partnersError };
  }

  if (!lv2Partners || lv2Partners.length === 0) {
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
        const { data: investConfig } = await supabase
          .from('api_configs')
          .select('id, is_active')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'invest')
          .maybeSingle();

        if (investConfig && investConfig.is_active !== false) {
          // Invest API 동기화는 별도 구현 필요
        }
      } catch (investError: any) {
        syncResults.invest.errors++;
      }

      try {
        let oroConfig = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();

        if (!oroConfig.data && partner.parent_id) {
          oroConfig = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', partner.parent_id)
            .eq('api_provider', 'oroplay')
            .maybeSingle();
        }

        if (oroConfig.data && oroConfig.data.is_active !== false) {
          const credentialPartnerId = oroConfig.data ? partner.id : partner.parent_id;
          try {
            const oroToken = await getOroPlayToken(credentialPartnerId);
            if (oroToken) {
              const oroBalance = await getAgentBalance(oroToken);
              balances.oroplay_balance = oroBalance;
              syncResults.oroplay.synced++;
            } else {
              syncResults.oroplay.errors++;
            }
          } catch (err) {
            syncResults.oroplay.errors++;
          }
        }
      } catch (oroError: any) {
        syncResults.oroplay.errors++;
      }

      try {
        let familyConfig = await supabase
          .from('api_configs')
          .select('api_key, is_active')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'familyapi')
          .maybeSingle();

        if (!familyConfig.data && partner.parent_id) {
          familyConfig = await supabase
            .from('api_configs')
            .select('api_key, is_active')
            .eq('partner_id', partner.parent_id)
            .eq('api_provider', 'familyapi')
            .maybeSingle();
        }

        if (familyConfig.data && familyConfig.data.api_key && familyConfig.data.is_active !== false) {
          const credentialPartnerId = familyConfig.data ? partner.id : partner.parent_id;
          const familyToken = await getFamilyApiToken(credentialPartnerId);
          const familyBalance = await getFamilyApiAgentBalance(familyConfig.data.api_key, familyToken);
          balances.familyapi_balance = familyBalance;
          syncResults.familyapi.synced++;
        }
      } catch (familyError: any) {
        syncResults.familyapi.errors++;
      }

      try {
        let honorConfig = await supabase
          .from('api_configs')
          .select('api_key, is_active')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'honorapi')
          .maybeSingle();

        if (!honorConfig.data && partner.parent_id) {
          honorConfig = await supabase
            .from('api_configs')
            .select('api_key, is_active')
            .eq('partner_id', partner.parent_id)
            .eq('api_provider', 'honorapi')
            .maybeSingle();
        }

        if (honorConfig.data && honorConfig.data.api_key && honorConfig.data.is_active !== false) {
          const honorBalance = await getHonorApiAgentBalance(honorConfig.data.api_key);
          balances.honorapi_balance = honorBalance;
          syncResults.honorapi.synced++;
        }
      } catch (honorError: any) {
        syncResults.honorapi.errors++;
      }

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
      console.error(`❌ Partner ${partner.id} 에러:`, error);
      totalErrors++;
    }
  }

  console.log(`[Lv2Balance] 완료: ${totalSynced}건 업데이트, ${totalErrors}개 에러`);

  return {
    success: true,
    synced: totalSynced,
    errors: totalErrors,
    partners: lv2Partners.length,
    details: syncResults
  };
}

// =====================================================
// 메인 핸들러 - 원본 (주석 처리됨 - 간단한 버전 사용 중)
// =====================================================
/*
export default async function handler(req: Request): Promise<Response> {
  console.error('🔔 [HANDLER] 호출 시작');
  
  try {
    const now = new Date().toISOString();
    console.error(`=============== START ${now}`);
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
      console.error(`=============== OPTIONS ${now}`);
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    console.error(`=============== REQUEST: ${req.method} ${path} ${now}`);

    try {
      // Root health check
      if (path === '/' || path === '/server' || path === '/server/' || 
          path === '/functions/v1/server' || path === '/functions/v1/server/') {
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
      return await handleBalanceCallback(req, supabase, corsHeaders);
    }

    // 2. 카지노 베팅/결과 콜백
    if ((path.endsWith('/changebalance') || path === '/server/changebalance' || path === '/functions/v1/server/changebalance') && req.method === 'POST') {
      return await handleChangeBalanceCallback(req, supabase, corsHeaders);
    }

    // 3. 슬롯 베팅/결과 콜백
    if ((path.endsWith('/changebalance/slot') || path === '/server/changebalance/slot' || path === '/functions/v1/server/changebalance/slot') && req.method === 'POST') {
      return await handleChangeBalanceSlotCallback(req, supabase, corsHeaders);
    }

    // ✅ Authorization 헤더 검증 (동기화 엔드포인트만)
    if (path.includes('/sync/')) {
      const authHeader = req.headers.get('Authorization');
      
      if (!authHeader) {
        return new Response(
          JSON.stringify({ code: 401, message: 'Missing authorization header' }),
          { status: 401, headers: corsHeaders }
        );
      }

      // Bearer 토큰 추출
      const token = authHeader.replace('Bearer ', '');
      const anonKey = process.env.SUPABASE_ANON_KEY;
      
      // Anon Key 또는 Service Role Key 확인
      if (token !== anonKey && token !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(
          JSON.stringify({ code: 401, message: 'Invalid authorization token' }),
          { status: 401, headers: corsHeaders }
        );
      }
    }

    // OroPlay 베팅 동기화
    if ((path === '/sync/oroplay-bets' || path === '/server/sync/oroplay-bets') && req.method === 'POST') {
      const startTime = new Date().toISOString();
      const result = await syncOroplayBets();
      return new Response(JSON.stringify({ ...result, functionExecutedAt: startTime, functionRespondedAt: new Date().toISOString() }), { headers: corsHeaders });
    }

    // Invest 베팅 동기화
    if ((path === '/sync/invest-bets' || path === '/server/sync/invest-bets') && req.method === 'POST') {
      const startTime = new Date().toISOString();
      const result = await syncInvestBets();
      return new Response(JSON.stringify({ ...result, functionExecutedAt: startTime, functionRespondedAt: new Date().toISOString() }), { headers: corsHeaders });
    }

    // FamilyAPI 베팅 동기화
    if ((path === '/sync/familyapi-bets' || path === '/server/sync/familyapi-bets') && req.method === 'POST') {
      const startTime = new Date().toISOString();
      const result = await syncFamilyapiBets();
      return new Response(JSON.stringify({ ...result, functionExecutedAt: startTime, functionRespondedAt: new Date().toISOString() }), { headers: corsHeaders });
    }

    // HonorAPI 베팅 동기화
    if ((path === '/sync/honorapi-bets' || path === '/server/sync/honorapi-bets') && req.method === 'POST') {
      const startTime = new Date().toISOString();
      const result = await syncHonorapiBets();
      return new Response(JSON.stringify({ ...result, functionExecutedAt: startTime, functionRespondedAt: new Date().toISOString() }), { headers: corsHeaders });
    }

    // Lv2 보유금 동기화
    if ((path === '/sync/lv2-balances' || path === '/server/sync/lv2-balances') && req.method === 'POST') {
      const startTime = new Date().toISOString();
      const result = await syncLv2Balances();
      return new Response(JSON.stringify({ ...result, functionExecutedAt: startTime, functionRespondedAt: new Date().toISOString() }), { headers: corsHeaders });
    }

      // 자동 정산 (매일 00:04 실행)
      if ((path === '/sync/auto-settlement' || path === '/server/sync/auto-settlement') && req.method === 'POST') {
        const result = await executeAutoSettlement();
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      }

      // 404 Not Found
      return new Response(
        JSON.stringify({ error: 'Not Found', path, method: req.method }),
        { status: 404, headers: corsHeaders }
      );

    } catch (error: any) {
      console.error('❌ HANDLER ERROR:', error);
      console.error('❌ Stack:', error.stack);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error message:', error.message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message,
          errorName: error.name,
          errorStack: error.stack
        }),
        { status: 500, headers: corsHeaders }
      );
    } finally {
      console.error('🔔 [HANDLER] 호출 완료');
    }
  } catch (error: any) {
    console.error('❌ OUTER ERROR:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
*/

console.log('📍 [STARTUP] 간단한 테스트 핸들러 사용 중');