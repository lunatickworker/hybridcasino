import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// CORS 헤더
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// Invest API 동기화
// ============================================
async function syncInvestGameRecords(apiConfig: any) {
  console.log('🎮 [INVEST-SYNC] 동기화 시작');
  
  const { opcode, secret_key, partner_id } = apiConfig;
  
  if (!opcode || !secret_key) {
    console.warn('⚠️ [INVEST-SYNC] OPCODE 또는 SECRET_KEY 없음');
    return;
  }

  try {
    // 현재 연월 계산
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString();

    // 마지막 동기화된 external_txid 조회
    const { data: lastRecord } = await supabase
      .from('game_records')
      .select('external_txid')
      .eq('partner_id', partner_id)
      .eq('api_type', 'invest')
      .order('external_txid', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastIndex = lastRecord?.external_txid || 0;
    console.log(`📍 [INVEST-SYNC] 마지막 id: ${lastIndex}`);

    // Invest API 호출 (historyindex)
    const url = 'https://api.invest-ho.com/api/game/historyindex';
    const signature = await generateMd5(`${opcode}${year}${month}${lastIndex}${secret_key}`);
    
    // ✅ GET 요청은 URL 파라미터로 전송
    const params = new URLSearchParams({
      opcode,
      year,
      month,
      index: lastIndex.toString(),
      limit: '4000',
      signature
    });
    
    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Invest API 호출 실패: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error || !result.data) {
      console.log('⚠️ [INVEST-SYNC] API 실패 또는 데이터 없음');
      return;
    }

    const bettingRecords = Array.isArray(result.data.DATA) ? result.data.DATA : 
                          Array.isArray(result.data) ? result.data : [];

    if (bettingRecords.length === 0) {
      console.log('ℹ️ [INVEST-SYNC] 새 데이터 없음');
      return;
    }

    console.log(`📊 [INVEST-SYNC] ${bettingRecords.length}건 수신`);

    // 사용자 매핑
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, username');

    const userMap = new Map();
    if (allUsers) {
      allUsers.forEach((u: any) => userMap.set(u.username, u.id));
    }

    // 데이터 저장
    let successCount = 0;
    let skipCount = 0;

    for (const record of bettingRecords) {
      try {
        if (!record.username || !record.id) continue;

        const userId = userMap.get(record.username);
        if (!userId) continue;

        const betAmount = parseFloat(record.bet || record.bet_amount || '0');
        const winAmount = parseFloat(record.win || record.win_amount || '0');
        const balanceAfter = parseFloat(record.balance || '0');

        // ✅ games 테이블에서 game_type 조회
        const { data: gameData } = await supabase
          .from('games')
          .select('game_type')
          .eq('id', record.game_id)
          .maybeSingle();

        const { error } = await supabase
          .from('game_records')
          .insert({
            api_type: 'invest',
            partner_id,
            external_txid: parseInt(record.id),
            username: record.username,
            user_id: userId,
            game_id: record.game_id,
            provider_id: record.provider_id || Math.floor((record.game_id || 410000) / 1000),
            game_type: gameData?.game_type || 'casino', // ✅ game_type 추가
            bet_amount: betAmount,
            win_amount: winAmount,
            balance_after: balanceAfter,
            played_at: new Date(record.create_at || record.played_at).toISOString()
          });

        if (error) {
          if (error.code === '23505') {
            skipCount++;
          }
        } else {
          successCount++;
        }
      } catch (err) {
        console.error('레코드 처리 오류:', err);
      }
    }

    console.log(`✅ [INVEST-SYNC] 완료: 성공 ${successCount}건, 중복 ${skipCount}건`);
  } catch (error) {
    console.error('❌ [INVEST-SYNC] 오류:', error);
    throw error;
  }
}

// ============================================
// OroPlay API 동기화
// ============================================
async function syncOroPlayGameRecords(apiConfig: any) {
  console.log('🎮 [OROPLAY-SYNC] 동기화 시작');
  
  const { token, partner_id } = apiConfig;
  
  if (!token) {
    console.warn('⚠️ [OROPLAY-SYNC] TOKEN 없음');
    return;
  }

  try {
    // 마지막 동기화 시간 조회 (24시간 전 기본값)
    const { data: syncLog } = await supabase
      .from('api_sync_logs')
      .select('last_sync_time')
      .eq('partner_id', partner_id)
      .eq('api_type', 'oroplay')
      .maybeSingle();

    const startDate = syncLog?.last_sync_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // OroPlay API 호출
    const url = 'https://ag.xn--vh3bn1ioqg.com/api/agent/betting/by-date';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate,
        limit: 4000
      })
    });

    if (!response.ok) {
      throw new Error(`OroPlay API 호출 실패: ${response.status}`);
    }

    const result = await response.json();

    if (!result || !result.histories || result.histories.length === 0) {
      console.log('ℹ️ [OROPLAY-SYNC] 새 데이터 없음');
      return;
    }

    console.log(`📊 [OROPLAY-SYNC] ${result.histories.length}건 수신`);

    // 완료된 베팅만 필터링
    const completedBets = result.histories.filter((bet: any) => bet.status === 1);
    console.log(`   ✅ 완료된 베팅: ${completedBets.length}건`);

    // 사용자 매핑
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, username');

    const userMap = new Map();
    if (allUsers) {
      allUsers.forEach((u: any) => userMap.set(u.username, u.id));
    }

    // 데이터 저장
    let successCount = 0;
    let skipCount = 0;

    for (const bet of completedBets) {
      try {
        const userId = userMap.get(bet.userCode);
        if (!userId) continue;

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
            partner_id,
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
          if (error.code === '23505') {
            skipCount++;
          }
        } else {
          successCount++;
        }
      } catch (err) {
        console.error('레코드 처리 오류:', err);
      }
    }

    console.log(`✅ [OROPLAY-SYNC] 완료: 성공 ${successCount}건, 중복 ${skipCount}건`);

    // 다음 동기화 시작 시간 저장
    if (result.nextStartDate) {
      await supabase
        .from('api_sync_logs')
        .upsert({
          partner_id,
          api_type: 'oroplay',
          last_sync_time: result.nextStartDate,
          updated_at: new Date().toISOString()
        });
    }
  } catch (error) {
    console.error('❌ [OROPLAY-SYNC] 오류:', error);
    throw error;
  }
}

// ============================================
// FamilyAPI 동기화
// ============================================
async function syncFamilyApiGameRecords(apiConfig: any) {
  console.log('🎮 [FAMILYAPI-SYNC] 동기화 시작');
  
  const { token, partner_id } = apiConfig;
  
  if (!token) {
    console.warn('⚠️ [FAMILYAPI-SYNC] TOKEN 없음');
    return;
  }

  try {
    // 마지막 동기화 시간 조회
    const { data: syncLog } = await supabase
      .from('api_sync_logs')
      .select('last_sync_time')
      .eq('partner_id', partner_id)
      .eq('api_type', 'familyapi')
      .maybeSingle();

    const startDate = syncLog?.last_sync_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // FamilyAPI 호출은 proxy 서버를 통해야 하므로 여기서는 스킵
    // 실제 구현 시 proxy 서버 URL 사용 필요
    console.log('⚠️ [FAMILYAPI-SYNC] Proxy 서버 구현 필요');
    
  } catch (error) {
    console.error('❌ [FAMILYAPI-SYNC] 오류:', error);
    throw error;
  }
}

// ============================================
// MD5 해시 생성 (Invest API용)
// ============================================
async function generateMd5(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.toLowerCase();
}

// ============================================
// Edge Function 핸들러
// ============================================
serve(async (req) => {
  try {
    // OPTIONS 요청 처리
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // 요청 본문 파싱
    const body = await req.json();
    const { api_type, partner_id } = body;

    if (!api_type || !partner_id) {
      return new Response(
        JSON.stringify({ error: 'api_type과 partner_id가 필요합니다' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 해당 파트너의 API 설정 조회
    const { data: apiConfig, error } = await supabase
      .from('api_configs')
      .select('*')
      .eq('partner_id', partner_id)
      .eq('api_provider', api_type)
      .eq('is_active', true)
      .single();

    if (error || !apiConfig) {
      console.error('API 설정 조회 실패:', error);
      return new Response(
        JSON.stringify({ error: 'API 설정을 찾을 수 없습니다' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // API 타입별 동기화 실행
    switch (api_type) {
      case 'invest':
        await syncInvestGameRecords(apiConfig);
        break;
      case 'oroplay':
        await syncOroPlayGameRecords(apiConfig);
        break;
      case 'familyapi':
        await syncFamilyApiGameRecords(apiConfig);
        break;
      default:
        return new Response(
          JSON.stringify({ error: '지원하지 않는 API 타입입니다' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: '게임 기록 동기화 완료',
        api_type
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Edge Function 오류:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});