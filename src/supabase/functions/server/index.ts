import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

// =====================================================
// 상수 정의
// =====================================================
const PROXY_URL = 'https://vi8282.com/proxy';
const OROPLAY_BASE_URL = 'https://bs.sxvwlkohlv.com/api/v2';

// Supabase Admin Client (Secrets에서 환경 변수 가져오기)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

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
    .select('oroplay_token, oroplay_token_expires_at, oroplay_client_id, oroplay_client_secret')
    .eq('partner_id', partnerId)
    .eq('api_provider', 'oroplay')
    .maybeSingle();
  
  if (configError || !config) {
    throw new Error('OroPlay API 설정을 찾을 수 없습니다.');
  }
  
  if (!config.oroplay_client_id || !config.oroplay_client_secret) {
    throw new Error('OroPlay client_id 또는 client_secret이 설정되지 않았습니다.');
  }
  
  // 토큰이 있고 아직 유효하면 그대로 사용
  if (config.oroplay_token && config.oroplay_token_expires_at) {
    const expiresAt = new Date(config.oroplay_token_expires_at).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (expiresAt - now > fiveMinutes) {
      return config.oroplay_token;
    }
  }
  
  // 토큰 재발급
  const response = await proxyCall<any>({
    url: `${OROPLAY_BASE_URL}/auth/createtoken`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      clientId: config.oroplay_client_id,
      clientSecret: config.oroplay_client_secret
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
      oroplay_token: tokenData.token,
      oroplay_token_expires_at: new Date(tokenData.expiration * 1000).toISOString(),
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
// Hono 앱 설정
// =====================================================
const app = new Hono();

app.use('*', logger(console.log));

app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

app.get("/make-server-5bfbb11c/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// =====================================================
// OroPlay 베팅 기록 동기화 (기존 로직 그대로)
// =====================================================
app.post("/make-server-5bfbb11c/sync/oroplay-bets", async (c) => {
  try {
    console.log('🎰 [OroPlay Sync] 베팅 기록 동기화 시작');

    // 1. 모든 Lv1 파트너 조회 (OroPlay API config가 있는 파트너)
    const { data: lv1Partners, error: partnersError } = await supabase
      .from('partners')
      .select('id, nickname')
      .eq('level', 1)
      .eq('status', 'active');

    if (partnersError || !lv1Partners || lv1Partners.length === 0) {
      return c.json({ success: true, message: 'No active Lv1 partners', synced: 0 });
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
              .select('id, provider_id')
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

    return c.json({
      success: true,
      synced: totalSynced,
      errors: totalErrors,
      partners: lv1Partners.length
    });

  } catch (error) {
    console.error('❌ [OroPlay Sync] 전체 동기화 에러:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// =====================================================
// Lv2 파트너 OroPlay 보유금 동기화
// =====================================================
app.post("/make-server-5bfbb11c/sync/lv2-balances", async (c) => {
  try {
    console.log('💰 [Lv2 Balance Sync] 보유금 동기화 시작');

    // Lv2 파트너 목록 조회
    const { data: lv2Partners, error: partnersError } = await supabase
      .from('partners')
      .select('id, nickname, parent_id')
      .eq('level', 2)
      .eq('status', 'active');

    if (partnersError || !lv2Partners || lv2Partners.length === 0) {
      return c.json({ success: true, message: 'No active Lv2 partners', synced: 0 });
    }

    console.log(`📋 ${lv2Partners.length}개 Lv2 파트너 발견`);

    let totalSynced = 0;
    let totalErrors = 0;

    // 각 Lv2 파트너별로 처리
    for (const partner of lv2Partners) {
      try {
        if (!partner.parent_id) {
          continue;
        }

        console.log(`\n🔄 Partner ${partner.id} (${partner.nickname}) 처리 중...`);

        // Lv1(parent)의 OroPlay 토큰 가져오기
        let token: string;
        try {
          token = await getOroPlayToken(partner.parent_id);
        } catch (tokenError: any) {
          console.log(`⚠️ Partner ${partner.id}: 상위 파트너 토큰 없음 - ${tokenError.message}`);
          continue;
        }

        // OroPlay Agent 보유금 조회
        const balance = await getAgentBalance(token);
        console.log(`💰 Partner ${partner.id} (${partner.nickname}): ${balance}`);

        // partners.oroplay_balance 업데이트
        const { error: updateError } = await supabase
          .from('partners')
          .update({
            oroplay_balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('id', partner.id);

        if (updateError) {
          console.error(`❌ Partner ${partner.id} 업데이트 에러:`, updateError);
          totalErrors++;
        } else {
          totalSynced++;
        }

      } catch (error) {
        console.error(`❌ Partner ${partner.id} 처리 에러:`, error);
        totalErrors++;
      }
    }

    console.log(`\n🎉 [Lv2 Balance Sync] 완료 - ${totalSynced}개 업데이트, ${totalErrors}개 에러`);

    return c.json({
      success: true,
      synced: totalSynced,
      errors: totalErrors,
      partners: lv2Partners.length
    });

  } catch (error) {
    console.error('❌ [Lv2 Balance Sync] 전체 동기화 에러:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// =====================================================
// 서버 시작
// =====================================================
Deno.serve(app.fetch);