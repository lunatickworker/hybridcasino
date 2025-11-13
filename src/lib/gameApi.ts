import { supabase } from './supabase';
import { investApi } from './investApi';
import { oroplayApi } from './oroplayApi';

// ============================================
// 타입 정의
// ============================================

export interface GameProvider {
  id: number;
  name: string;
  type: 'slot' | 'casino' | 'minigame';
  api_type: 'invest' | 'oroplay';
  status: 'visible' | 'maintenance' | 'hidden'; // 노출/점검중/비노출
  is_visible: boolean; // 사용자 페이지 노출 여부
  vendor_code?: string; // OroPlay 전용
  logo_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Game {
  id: number;
  provider_id: number;
  name: string;
  type: 'slot' | 'casino' | 'minigame';
  api_type: 'invest' | 'oroplay';
  status: 'visible' | 'maintenance' | 'hidden';
  is_visible: boolean; // 사용자 페이지 노출 여부
  image_url?: string;
  demo_available?: boolean;
  is_featured?: boolean;
  priority?: number;
  rtp?: number;
  play_count?: number;
  vendor_code?: string; // OroPlay 전용
  game_code?: string; // OroPlay 전용
  created_at?: string;
  updated_at?: string;
  provider_name?: string; // JOIN 시 추가
}

export interface SyncResult {
  newGames: number;
  updatedGames: number;
  totalGames: number;
}

// ============================================
// Invest 제공사 데이터 (Guidelines.md 기준)
// ============================================

const INVEST_SLOT_PROVIDERS: Array<{ id: number; name: string }> = [
  { id: 1, name: '마이크로게이밍' },
  { id: 17, name: '플레이앤고' },
  { id: 20, name: 'CQ9 게이밍' },
  { id: 21, name: '제네시스 게이밍' },
  { id: 22, name: '하바네로' },
  { id: 23, name: '게임아트' },
  { id: 27, name: '플레이텍' },
  { id: 38, name: '블루프린트' },
  { id: 39, name: '부운고' },
  { id: 40, name: '드라군소프트' },
  { id: 41, name: '엘크 스튜디오' },
  { id: 47, name: '드림테크' },
  { id: 51, name: '칼람바 게임즈' },
  { id: 52, name: '모빌롯' },
  { id: 53, name: '노리밋 시티' },
  { id: 55, name: 'OMI 게이밍' },
  { id: 56, name: '원터치' },
  { id: 59, name: '플레이슨' },
  { id: 60, name: '푸쉬 게이밍' },
  { id: 61, name: '퀵스핀' },
  { id: 62, name: 'RTG 슬롯' },
  { id: 63, name: '리볼버 게이밍' },
  { id: 65, name: '슬롯밀' },
  { id: 66, name: '스피어헤드' },
  { id: 70, name: '썬더킥' },
  { id: 72, name: '우후 게임즈' },
  { id: 74, name: '릴렉스 게이밍' },
  { id: 75, name: '넷엔트' },
  { id: 76, name: '레드타이거' },
  { id: 87, name: 'PG소프트' },
  { id: 88, name: '플레이스타' },
  { id: 90, name: '빅타임게이밍' },
  { id: 300, name: '프라그마틱 플레이' },
];

const INVEST_CASINO_PROVIDERS: Array<{ id: number; name: string; game_id: number }> = [
  { id: 410, name: '에볼루션 게이밍', game_id: 410000 },
  { id: 77, name: '마이크로 게이밍', game_id: 77060 },
  { id: 2, name: 'Vivo 게이밍', game_id: 2029 },
  { id: 30, name: '아시아 게이밍', game_id: 30000 },
  { id: 78, name: '프라그마틱플레이', game_id: 78001 },
  { id: 86, name: '섹시게이밍', game_id: 86001 },
  { id: 11, name: '비비아이엔', game_id: 11000 },
  { id: 28, name: '드림게임', game_id: 28000 },
  { id: 89, name: '오리엔탈게임', game_id: 89000 },
  { id: 91, name: '보타', game_id: 91000 },
  { id: 44, name: '이주기', game_id: 44006 },
  { id: 85, name: '플레이텍 라이브', game_id: 85036 },
  { id: 0, name: '제네럴 카지노', game_id: 0 },
];

// ============================================
// 1. 제공사 초기화 및 관리
// ============================================

/**
 * Invest 제공사 초기화 (Guidelines.md 기준)
 */
export async function initializeInvestProviders(): Promise<void> {
  console.log('🔧 Invest 제공사 초기화 시작...');

  try {
    // 슬롯 제공사
    const slotProviders = INVEST_SLOT_PROVIDERS.map(p => ({
      id: p.id,
      name: p.name,
      type: 'slot' as const,
      api_type: 'invest' as const,
      status: 'visible' as const,
      is_visible: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    // 카지노 제공사
    const casinoProviders = INVEST_CASINO_PROVIDERS.map(p => ({
      id: p.id,
      name: p.name,
      type: 'casino' as const,
      api_type: 'invest' as const,
      status: 'visible' as const,
      is_visible: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const allProviders = [...slotProviders, ...casinoProviders];

    // 배치로 upsert
    const batchSize = 20;
    let insertedCount = 0;

    for (let i = 0; i < allProviders.length; i += batchSize) {
      const batch = allProviders.slice(i, i + batchSize);

      const { error } = await supabase
        .from('game_providers')
        .upsert(batch, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`❌ Invest 제공사 배치 ${Math.floor(i / batchSize) + 1} 삽입 오류:`, error);
      } else {
        insertedCount += batch.length;
      }
    }

    console.log(`✅ Invest 제공사 초기화 완료: ${insertedCount}개 (슬롯 ${slotProviders.length}, 카지노 ${casinoProviders.length})`);

    // 카지노 로비 게임 자동 생성
    await initializeCasinoLobbyGames();

  } catch (error) {
    console.error('❌ Invest 제공사 초기화 실패:', error);
    throw error;
  }
}

/**
 * 카지노 로비 게임 초기화
 */
async function initializeCasinoLobbyGames(): Promise<void> {
  console.log('🎰 카지노 로비 게임 초기화 시작...');

  const lobbyGames = INVEST_CASINO_PROVIDERS.map(p => ({
    id: p.game_id,
    provider_id: p.id,
    name: `${p.name} 로비`,
    type: 'casino' as const,
    api_type: 'invest' as const,
    status: 'visible' as const,
    is_visible: true,
    demo_available: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('games')
    .upsert(lobbyGames, {
      onConflict: 'id',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error('❌ 카지노 로비 게임 생성 오류:', error);
  } else {
    console.log(`✅ 카지노 로비 게임 생성 완료: ${lobbyGames.length}개`);
  }
}

/**
 * OroPlay 제공사 동기화
 */
export async function syncOroPlayProviders(): Promise<void> {
  console.log('🔄 OroPlay 제공사 동기화 시작...');

  try {
    // 1. 시스템 관리자 조회
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

    // 2. OroPlay 토큰 조회
    const token = await oroplayApi.getToken(systemAdmin.id);

    // 3. OroPlay API에서 제공사 목록 조회
    const vendors = await oroplayApi.getVendors(token);

    if (!vendors || vendors.length === 0) {
      console.log('⚠️ OroPlay 제공사가 없습니다.');
      return;
    }

    console.log(`📊 OroPlay 제공사 ${vendors.length}개 발견`);

    // 타입 매핑 (OroPlay type → GMS type)
    const typeMap: Record<number, 'casino' | 'slot' | 'minigame'> = {
      1: 'casino',
      2: 'slot',
      3: 'minigame',
    };

    const providers = vendors.map(vendor => ({
      // OroPlay는 ID가 없으므로 vendorCode 해시로 생성
      id: hashVendorCode(vendor.vendorCode),
      name: vendor.name,
      type: typeMap[vendor.type] || 'slot',
      api_type: 'oroplay' as const,
      vendor_code: vendor.vendorCode,
      status: 'visible' as const,
      is_visible: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    // 배치로 upsert
    const batchSize = 20;
    let insertedCount = 0;

    for (let i = 0; i < providers.length; i += batchSize) {
      const batch = providers.slice(i, i + batchSize);

      const { error } = await supabase
        .from('game_providers')
        .upsert(batch, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`❌ OroPlay 제공사 배치 ${Math.floor(i / batchSize) + 1} 삽입 오류:`, error);
      } else {
        insertedCount += batch.length;
      }
    }

    console.log(`✅ OroPlay 제공사 동기화 완료: ${insertedCount}개`);

  } catch (error) {
    console.error('❌ OroPlay 제공사 동기화 실패:', error);
    throw error;
  }
}

/**
 * vendorCode를 해시하여 고유한 숫자 ID 생성
 */
function hashVendorCode(vendorCode: string): number {
  let hash = 0;
  for (let i = 0; i < vendorCode.length; i++) {
    const char = vendorCode.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Invest ID와 겹치지 않도록 1000000 이상으로 설정
  return Math.abs(hash % 900000) + 1000000;
}

/**
 * 제공사 목록 조회
 */
export async function getProviders(filters?: {
  api_type?: 'invest' | 'oroplay';
  type?: 'slot' | 'casino' | 'minigame';
  status?: 'visible' | 'maintenance' | 'hidden';
  is_visible?: boolean;
}): Promise<GameProvider[]> {
  let query = supabase
    .from('game_providers')
    .select('*')
    .order('api_type', { ascending: true })
    .order('type', { ascending: true })
    .order('name', { ascending: true });

  if (filters?.api_type) {
    query = query.eq('api_type', filters.api_type);
  }

  if (filters?.type) {
    query = query.eq('type', filters.type);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.is_visible !== undefined) {
    query = query.eq('is_visible', filters.is_visible);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ 제공사 조회 오류:', error);
    throw error;
  }

  console.log(`📊 제공사 조회: ${data?.length || 0}개`, filters);
  return data || [];
}

// ============================================
// 2. 게임 동기화
// ============================================

/**
 * Invest 게임 동기화 (단일 제공사)
 */
export async function syncInvestGames(providerId: number): Promise<SyncResult> {
  console.log(`🔄 Invest 제공사 ${providerId} 게임 동기화 시작...`);

  try {
    // 1. 제공사 정보 조회
    const { data: provider, error: providerError } = await supabase
      .from('game_providers')
      .select('*')
      .eq('id', providerId)
      .eq('api_type', 'invest')
      .single();

    if (providerError || !provider) {
      throw new Error(`제공사 ${providerId}를 찾을 수 없습니다.`);
    }

    // 2. 시스템 관리자의 API 설정 조회
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
      .select('invest_opcode, invest_secret_key')
      .eq('partner_id', systemAdmin.id)
      .maybeSingle();

    if (!apiConfig?.invest_opcode || !apiConfig?.invest_secret_key) {
      throw new Error('시스템 관리자의 API 설정을 찾을 수 없습니다.');
    }

    // 3. Invest API 호출
    let gamesData: any[] = [];

    try {
      const apiResponse = await investApi.getGameList(
        apiConfig.invest_opcode,
        providerId,
        apiConfig.invest_secret_key
      );

      if (apiResponse.error) {
        // 500 에러나 게임이 없는 제공사는 정상 처리
        if (apiResponse.error.includes('500') ||
            apiResponse.error.includes('게임 목록이 없습니다') ||
            apiResponse.error.includes('지원하지 않는')) {
          console.log(`ℹ️ 제공사 ${provider.name}: 게임 목록 없음 (로비 진입 방식 또는 API 미지원)`);
          gamesData = [];
        } else {
          throw new Error(apiResponse.error);
        }
      } else if (apiResponse.data?.RESULT === true && Array.isArray(apiResponse.data?.DATA)) {
        gamesData = apiResponse.data.DATA;
        console.log(`✅ 제공사 ${provider.name}: ${gamesData.length}개 게임 발견`);
      } else if (apiResponse.data?.RESULT === false) {
        console.log(`ℹ️ 제공사 ${provider.name}: 게임 없음`);
        gamesData = [];
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('500') || errorMsg.includes('프록시 서버 오류')) {
        console.log(`ℹ️ 제공사 ${provider.name}: API 미지원`);
        gamesData = [];
      } else {
        throw error;
      }
    }

    // 4. 게임 데이터 처리
    const timestamp = new Date().toISOString();
    const processedGames = gamesData
      .map(game => {
        const gameId = parseInt(game.id || game.game_id || game.gameId || game.ID);
        if (!gameId || isNaN(gameId)) return null;

        let gameName = '';
        if (game.game_title) gameName = game.game_title.trim();
        else if (game.name) gameName = game.name.trim();
        else if (game.game_name) gameName = game.game_name.trim();
        else gameName = `Game ${gameId}`;

        return {
          id: gameId,
          provider_id: providerId,
          name: gameName,
          type: provider.type,
          api_type: 'invest',
          status: 'visible',
          is_visible: true,
          image_url: game.image_url || null,
          demo_available: Boolean(game.demo_available || game.demoAvailable || game.demo),
          priority: 0,
          created_at: timestamp,
          updated_at: timestamp,
        };
      })
      .filter(g => g !== null);

    // 5. 중복 제거
    const uniqueGames = new Map();
    processedGames.forEach(game => {
      if (game) uniqueGames.set(game.id, game);
    });
    const finalGames = Array.from(uniqueGames.values());

    console.log(`📊 처리된 게임: ${finalGames.length}개`);

    // 6. DB 저장
    let newCount = 0;
    let updateCount = 0;

    if (finalGames.length > 0) {
      // 기존 게임 ID 조회
      const { data: existingGames } = await supabase
        .from('games')
        .select('id')
        .eq('provider_id', providerId)
        .eq('api_type', 'invest');

      const existingIds = new Set(existingGames?.map(g => g.id) || []);

      const newGames = finalGames.filter(g => !existingIds.has(g.id));
      const existingToUpdate = finalGames.filter(g => existingIds.has(g.id));

      // 신규 게임 추가
      if (newGames.length > 0) {
        const { error: insertError } = await supabase
          .from('games')
          .insert(newGames);

        if (insertError) {
          console.error('❌ 신규 게임 추가 오류:', insertError);
        } else {
          newCount = newGames.length;
          console.log(`✅ 신규 게임 ${newCount}개 추가`);
        }
      }

      // 기존 게임 업데이트
      if (existingToUpdate.length > 0) {
        for (const game of existingToUpdate) {
          const { error: updateError } = await supabase
            .from('games')
            .update({
              name: game.name,
              image_url: game.image_url,
              demo_available: game.demo_available,
              updated_at: game.updated_at,
            })
            .eq('id', game.id)
            .eq('provider_id', providerId);

          if (!updateError) {
            updateCount++;
          }
        }
        console.log(`✅ 기존 게임 ${updateCount}개 업데이트`);
      }
    }

    console.log(`🎯 제공사 ${provider.name} 동기화 완료: 신규 ${newCount}, 업데이트 ${updateCount}`);

    return {
      newGames: newCount,
      updatedGames: updateCount,
      totalGames: finalGames.length,
    };

  } catch (error) {
    console.error(`❌ Invest 제공사 ${providerId} 동기화 실패:`, error);
    throw error;
  }
}

/**
 * Invest 전체 제공사 게임 동기화 (병렬 처리로 성능 개선)
 */
export async function syncAllInvestGames(): Promise<{ results: SyncResult[] }> {
  console.log('🚀 Invest 전체 제공사 게임 동기화 시작...');

  try {
    const providers = await getProviders({ api_type: 'invest' });
    
    // 병렬 처리로 성능 향상 (배치 크기 5개씩)
    const batchSize = 5;
    const results: SyncResult[] = [];
    
    for (let i = 0; i < providers.length; i += batchSize) {
      const batch = providers.slice(i, i + batchSize);
      
      // 배치 내 제공사는 병렬로 처리
      const batchResults = await Promise.allSettled(
        batch.map(provider => syncInvestGames(provider.id))
      );
      
      // 결과 수집
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const providerName = batch[index].name;
          console.error(`⚠️ 제공사 ${providerName} 건너뛰기:`, result.reason);
          results.push({ newGames: 0, updatedGames: 0, totalGames: 0 });
        }
      });
      
      // 다음 배치 전 짧은 대기 (API Rate Limit 고려, 300ms로 단축)
      if (i + batchSize < providers.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    const totalNew = results.reduce((sum, r) => sum + r.newGames, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.updatedGames, 0);

    console.log(`🎯 Invest 전체 동기화 완료: 신규 ${totalNew}, 업데이트 ${totalUpdated}`);

    return { results };

  } catch (error) {
    console.error('❌ Invest 전체 동기화 실패:', error);
    throw error;
  }
}

/**
 * OroPlay 게임 동기화 (전체)
 */
export async function syncOroPlayGames(): Promise<SyncResult> {
  console.log('🔄 OroPlay 게임 동기화 시작...');

  try {
    // 1. 시스템 관리자 조회
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

    // 2. OroPlay 토큰 조회
    const token = await oroplayApi.getToken(systemAdmin.id);

    // 3. OroPlay 제공사 목록 조회
    const providers = await getProviders({ api_type: 'oroplay', status: 'visible' });

    if (providers.length === 0) {
      console.log('⚠️ OroPlay 제공사가 없습니다. 먼저 제공사를 동기화하세요.');
      return { newGames: 0, updatedGames: 0, totalGames: 0 };
    }

    let totalNew = 0;
    let totalUpdated = 0;
    let totalGames = 0;

    // 4. 각 제공사별 게임 동기화
    for (const provider of providers) {
      if (!provider.vendor_code) {
        console.warn(`⚠️ 제공사 ${provider.name}: vendorCode 없음`);
        continue;
      }

      try {
        const games = await oroplayApi.getGameList(token, provider.vendor_code, 'ko');

        if (!games || games.length === 0) {
          console.log(`ℹ️ 제공사 ${provider.name}: 게임 없음`);
          continue;
        }

        console.log(`📊 제공사 ${provider.name}: ${games.length}개 게임 발견`);

        const timestamp = new Date().toISOString();
        const processedGames = games.map(game => ({
          // OroPlay 게임 ID는 vendorCode + gameCode 조합으로 해시
          id: hashGameCode(provider.vendor_code!, game.gameCode),
          provider_id: provider.id,
          name: game.gameName,
          type: provider.type,
          api_type: 'oroplay',
          status: game.underMaintenance ? 'maintenance' : 'visible',
          is_visible: !game.underMaintenance,
          vendor_code: provider.vendor_code,
          game_code: game.gameCode,
          image_url: game.thumbnail || null,
          demo_available: false,
          is_featured: game.isNew || false,
          priority: game.isNew ? 100 : 0,
          created_at: timestamp,
          updated_at: timestamp,
        }));

        // 기존 게임 ID 조회
        const { data: existingGames } = await supabase
          .from('games')
          .select('id')
          .eq('provider_id', provider.id)
          .eq('api_type', 'oroplay');

        const existingIds = new Set(existingGames?.map(g => g.id) || []);

        const newGames = processedGames.filter(g => !existingIds.has(g.id));
        const existingToUpdate = processedGames.filter(g => existingIds.has(g.id));

        // 신규 게임 추가
        if (newGames.length > 0) {
          const { error: insertError } = await supabase
            .from('games')
            .insert(newGames);

          if (!insertError) {
            totalNew += newGames.length;
            console.log(`✅ ${provider.name}: 신규 ${newGames.length}개`);
          } else {
            console.error(`❌ ${provider.name}: 신규 게임 추가 오류:`, insertError);
          }
        }

        // 기존 게임 업데이트
        if (existingToUpdate.length > 0) {
          for (const game of existingToUpdate) {
            const { error: updateError } = await supabase
              .from('games')
              .update({
                name: game.name,
                status: game.status,
                is_visible: game.is_visible,
                image_url: game.image_url,
                is_featured: game.is_featured,
                priority: game.priority,
                updated_at: game.updated_at,
              })
              .eq('id', game.id);

            if (!updateError) {
              totalUpdated++;
            }
          }
          console.log(`✅ ${provider.name}: 업데이트 ${totalUpdated}개`);
        }

        totalGames += processedGames.length;

        // Rate Limit 방지
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`⚠️ 제공사 ${provider.name} 건너뛰기:`, error);
      }
    }

    console.log(`🎯 OroPlay 전체 동기화 완료: 신규 ${totalNew}, 업데이트 ${totalUpdated}, 총 ${totalGames}`);

    return {
      newGames: totalNew,
      updatedGames: totalUpdated,
      totalGames: totalGames,
    };

  } catch (error) {
    console.error('❌ OroPlay 게임 동기화 실패:', error);
    throw error;
  }
}

/**
 * gameCode를 해시하여 고유한 숫자 ID 생성
 */
function hashGameCode(vendorCode: string, gameCode: string): number {
  const combined = `${vendorCode}_${gameCode}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // OroPlay 게임 ID는 2000000 이상으로 설정 (Invest와 겹치지 않도록)
  return Math.abs(hash % 900000) + 2000000;
}

// ============================================
// 3. 게임 조회
// ============================================

/**
 * 게임 목록 조회
 */
export async function getGames(filters?: {
  api_type?: 'invest' | 'oroplay';
  type?: 'slot' | 'casino' | 'minigame';
  provider_id?: number;
  status?: 'visible' | 'maintenance' | 'hidden';
  is_visible?: boolean;
  search?: string;
}): Promise<Game[]> {
  let query = supabase
    .from('games')
    .select(`
      *,
      game_providers!inner(
        id,
        name,
        type,
        api_type
      )
    `)
    .order('priority', { ascending: false })
    .order('name', { ascending: true });

  if (filters?.api_type) {
    query = query.eq('game_providers.api_type', filters.api_type);
  }

  if (filters?.type) {
    query = query.eq('type', filters.type);
  }

  if (filters?.provider_id) {
    query = query.eq('provider_id', filters.provider_id);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.is_visible !== undefined) {
    query = query.eq('is_visible', filters.is_visible);
  }

  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ 게임 조회 오류:', error);
    throw error;
  }

  const mappedData = (data || []).map(game => ({
    ...game,
    provider_name: game.game_providers?.name || '알 수 없음',
  }));

  console.log(`📊 게임 조회: ${mappedData.length}개`, filters);

  return mappedData;
}

// ============================================
// 4. 게임 상태 관리 (노출/비노출/점검중)
// ============================================

/**
 * 게임 노출 설정 업데이트
 */
export async function updateGameVisibility(gameId: number, isVisible: boolean): Promise<void> {
  const { error } = await supabase
    .from('games')
    .update({
      is_visible: isVisible,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);

  if (error) {
    console.error('❌ 게임 노출 설정 업데이트 오류:', error);
    throw error;
  }

  console.log(`✅ 게임 ${gameId} 노출 설정: ${isVisible ? '노출' : '숨김'}`);
}

/**
 * 게임 상태 업데이트 (visible/maintenance/hidden)
 */
export async function updateGameStatus(
  gameId: number,
  status: 'visible' | 'maintenance' | 'hidden'
): Promise<void> {
  const { error } = await supabase
    .from('games')
    .update({
      status,
      // 점검중이나 숨김 상태면 사용자 페이지에서 보이지 않도록
      is_visible: status === 'visible',
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);

  if (error) {
    console.error('❌ 게임 상태 업데이트 오류:', error);
    throw error;
  }

  console.log(`✅ 게임 ${gameId} 상태 업데이트: ${status}`);
}

/**
 * 게임 일괄 노출 설정
 */
export async function bulkUpdateVisibility(gameIds: number[], isVisible: boolean): Promise<void> {
  const { error } = await supabase
    .from('games')
    .update({
      is_visible: isVisible,
      updated_at: new Date().toISOString(),
    })
    .in('id', gameIds);

  if (error) {
    console.error('❌ 게임 일괄 노출 설정 오류:', error);
    throw error;
  }

  console.log(`✅ ${gameIds.length}개 게임 일괄 노출 설정: ${isVisible ? '노출' : '숨김'}`);
}

/**
 * 게임 일괄 상태 업데이트
 */
export async function bulkUpdateStatus(
  gameIds: number[],
  status: 'visible' | 'maintenance' | 'hidden'
): Promise<void> {
  const { error } = await supabase
    .from('games')
    .update({
      status,
      is_visible: status === 'visible',
      updated_at: new Date().toISOString(),
    })
    .in('id', gameIds);

  if (error) {
    console.error('❌ 게임 일괄 상태 업데이트 오류:', error);
    throw error;
  }

  console.log(`✅ ${gameIds.length}개 게임 일괄 상태 업데이트: ${status}`);
}

/**
 * 게임 추천(Featured) 설정
 */
export async function updateGameFeatured(gameId: number, isFeatured: boolean): Promise<void> {
  const { error } = await supabase
    .from('games')
    .update({
      is_featured: isFeatured,
      priority: isFeatured ? 100 : 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);

  if (error) {
    console.error('❌ 게임 추천 설정 오류:', error);
    throw error;
  }

  console.log(`✅ 게임 ${gameId} 추천 설정: ${isFeatured ? '추천' : '해제'}`);
}

// ============================================
// 5. 제공사 상태 관리 (노출/비노출/점검중)
// ============================================

/**
 * 제공사 노출 설정 업데이트
 */
export async function updateProviderVisibility(providerId: number, isVisible: boolean): Promise<void> {
  const { error } = await supabase
    .from('game_providers')
    .update({
      is_visible: isVisible,
      updated_at: new Date().toISOString(),
    })
    .eq('id', providerId);

  if (error) {
    console.error('❌ 제공사 노출 설정 업데이트 오류:', error);
    throw error;
  }

  console.log(`✅ 제공사 ${providerId} 노출 설정: ${isVisible ? '노출' : '숨김'}`);
}

/**
 * 제공사 상태 업데이트 (visible/maintenance/hidden)
 */
export async function updateProviderStatus(
  providerId: number,
  status: 'visible' | 'maintenance' | 'hidden'
): Promise<void> {
  const { error } = await supabase
    .from('game_providers')
    .update({
      status,
      // 점검중이나 숨김 상태면 사용자 페이지에서 보이지 않도록
      is_visible: status === 'visible',
      updated_at: new Date().toISOString(),
    })
    .eq('id', providerId);

  if (error) {
    console.error('❌ 제공사 상태 업데이트 오류:', error);
    throw error;
  }

  console.log(`✅ 제공사 ${providerId} 상태 업데이트: ${status}`);

  // ✅ 제공사 상태 변경 시 해당 제공사의 모든 게임 상태도 동기화
  const { error: gameUpdateError } = await supabase
    .from('games')
    .update({
      status,
      is_visible: status === 'visible',
      updated_at: new Date().toISOString(),
    })
    .eq('provider_id', providerId);

  if (gameUpdateError) {
    console.error('❌ 제공사 게임 상태 동기화 오류:', gameUpdateError);
    throw gameUpdateError;
  } else {
    console.log(`✅ 제공사 ${providerId}의 모든 게임 상태 업데이트 완료 (status=${status}, is_visible=${status === 'visible'})`);
  }
}

// ============================================
// 6. 사용자 페이지용 조회
// ============================================

/**
 * 사용자에게 노출할 게임만 조회
 */
export async function getUserVisibleGames(filters?: {
  type?: 'slot' | 'casino' | 'minigame';
  provider_id?: number;
  search?: string;
}): Promise<Game[]> {
  return getGames({
    ...filters,
    is_visible: true,
    status: 'visible',
  });
}

/**
 * 사용자에게 노출할 제공���만 조회
 */
export async function getUserVisibleProviders(filters?: {
  api_type?: 'invest' | 'oroplay';
  type?: 'slot' | 'casino' | 'minigame';
}): Promise<GameProvider[]> {
  return getProviders({
    ...filters,
    is_visible: true,
    status: 'visible',
  });
}

// ============================================
// 7. 게임 실행
// ============================================

/**
 * referrer_id를 따라 최상위(Lv1) 파트너 ID를 찾는 함수
 */
async function getTopLevelPartnerId(partnerId: string): Promise<string | null> {
  try {
    let currentPartnerId = partnerId;
    let iterations = 0;
    const maxIterations = 10; // 무한 루프 방지

    while (iterations < maxIterations) {
      const { data: partner, error } = await supabase
        .from('partners')
        .select('id, parent_id, level, username')
        .eq('id', currentPartnerId)
        .single();

      if (error || !partner) {
        console.error('❌ 파트너 조회 실패:', error);
        return null;
      }

      console.log(`🔍 파트너 조회 [${iterations}]:`, {
        id: partner.id,
        username: partner.username,
        level: partner.level,
        parent_id: partner.parent_id
      });

      // Lv1 (시스템관리자)에 도달하면 해당 ID 반환
      if (partner.level === 1 || !partner.parent_id) {
        console.log('✅ 최상위 파트너 발견 (Lv1):', partner.username);
        return partner.id;
      }

      // 상위 파트너로 이동
      currentPartnerId = partner.parent_id;
      iterations++;
    }

    console.error('❌ 최대 반복 횟수 초과');
    return null;
  } catch (error) {
    console.error('❌ getTopLevelPartnerId 오류:', error);
    return null;
  }
}

/**
 * 통합 게임 실행 함수 (Invest/OroPlay 자동 판별)
 */
export async function launchGame(
  userId: string,
  gameId: number,
  username?: string
): Promise<{
  success: boolean;
  launch_url?: string;
  game_url?: string;
  error?: string;
}> {
  console.log('🎮 통합 게임 실행 시작:', { userId, gameId, username });

  try {
    // 1. 게임 정보 조회 (먼저 조회해서 api_type 확인)
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*, game_providers!inner(*)')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      console.error('❌ 게임 정보 조회 실패:', gameError);
      return {
        success: false,
        error: '게임 정보를 찾을 수 없습니다.'
      };
    }

    console.log('✅ 게임 정보:', {
      name: game.name,
      api_type: game.api_type,
      provider_id: game.provider_id,
      vendor_code: game.vendor_code,
      game_code: game.game_code
    });

    // 2. 사용자 정보 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('username, referrer_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('❌ 사용자 정보 조회 실패:', userError);
      return {
        success: false,
        error: '사용자 정보를 찾을 수 없습니다.'
      };
    }

    const userUsername = username || user.username;

    // 3. Lv1 파트너 ID 찾기 (referrer_id를 따라 최상위까지 올라감)
    const topLevelPartnerId = await getTopLevelPartnerId(user.referrer_id);
    
    if (!topLevelPartnerId) {
      console.error('❌ 최상위 파트너를 찾을 수 없습니다.');
      return {
        success: false,
        error: '파트너 정보를 찾을 수 없습니다.'
      };
    }

    console.log('✅ 최상위 파트너 ID:', topLevelPartnerId);

    // 4. API 타입별로 분기
    if (game.api_type === 'invest') {
      return await launchInvestGame(topLevelPartnerId, userUsername, gameId);
    } else if (game.api_type === 'oroplay') {
      return await launchOroPlayGame(topLevelPartnerId, userUsername, game);
    } else {
      console.error('❌ 알 수 없는 API 타입:', game.api_type);
      return {
        success: false,
        error: '지원하지 않는 게임 타입입니다.'
      };
    }

  } catch (error) {
    console.error('❌ 게임 실행 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '게임 실행 중 오류가 발생했습니다.'
    };
  }
}

/**
 * Invest API 게임 실행
 */
async function launchInvestGame(
  partnerId: string,
  username: string,
  gameId: number
): Promise<{
  success: boolean;
  launch_url?: string;
  game_url?: string;
  error?: string;
}> {
  console.log('🎮 Invest API 게임 실행:', { partnerId, username, gameId });

  try {
    // API 설정 조회
    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('invest_opcode, invest_token, invest_secret_key')
      .eq('partner_id', partnerId)
      .single();

    if (configError || !apiConfig) {
      console.error('❌ API 설정 조회 실패:', configError);
      return {
        success: false,
        error: 'API 설정을 찾을 수 없습니다.'
      };
    }

    if (!apiConfig.invest_opcode || !apiConfig.invest_token || !apiConfig.invest_secret_key) {
      console.error('❌ Invest API 설정 불완전');
      return {
        success: false,
        error: 'Invest API 설정이 완료되지 않았습니다.'
      };
    }

    // ⭐ 1. 사용자 DB 보유금 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('username', username)
      .single();

    if (userError || !userData) {
      console.error('❌ 사용자 정보 조회 실패:', userError);
      return {
        success: false,
        error: '사용자 정보를 찾을 수 없습니다.'
      };
    }

    const userBalance = userData.balance || 0;
    
    if (userBalance <= 0) {
      console.error('❌ 보유금 부족:', userBalance);
      return {
        success: false,
        error: '보유금이 부족합니다. 입금 후 이용해주세요.'
      };
    }

    console.log(`💰 [게임 시작] 사용자 GMS 보유금: ${userBalance}원`);
    console.log(`ℹ️ [Seamless Wallet] GMS는 변동 없이 유지됩니다. 베팅 기록 동기화를 통해서만 증감됩니다.`);

    // ⭐ 2. api_configs balance 먼저 차감 (Optimistic Update)
    console.log(`🔄 [Optimistic Update] api_configs invest_balance 차감 시작: ${userBalance}원`);
    
    const { data: currentConfig, error: getConfigError } = await supabase
      .from('api_configs')
      .select('invest_balance')
      .eq('partner_id', partnerId)
      .single();
    
    if (getConfigError || !currentConfig) {
      console.error('❌ api_configs 조회 실패:', getConfigError);
      return {
        success: false,
        error: '관리자 보유금 정보를 찾을 수 없습니다.'
      };
    }
    
    const currentInvestBalance = currentConfig.invest_balance || 0;
    
    if (currentInvestBalance < userBalance) {
      console.error('❌ 관리자 Invest 보유금 부족:', { current: currentInvestBalance, required: userBalance });
      return {
        success: false,
        error: '관리자 보유금이 부족합니다. 관리자에게 문의하세요.'
      };
    }
    
    const { error: updateConfigError } = await supabase
      .from('api_configs')
      .update({ 
        invest_balance: currentInvestBalance - userBalance,
        updated_at: new Date().toISOString()
      })
      .eq('partner_id', partnerId);
    
    if (updateConfigError) {
      console.error('❌ api_configs 업데이트 실패:', updateConfigError);
      return {
        success: false,
        error: 'DB 업데이트 실패'
      };
    }
    
    console.log(`✅ [Optimistic Update] api_configs 차감 완료: ${currentInvestBalance} → ${currentInvestBalance - userBalance}`);

    // ⭐ 3. 외부 API에 입금 (POST /api/account/balance)
    // ✅ GMS 보유금은 그대로 유지! (0으로 만들지 않음)
    // ✅ 베팅 기록 동기화(PATCH)를 통해서만 GMS 증감
    let apiBalance = 0;
    
    try {
      const depositResult = await investApi.depositBalance(
        apiConfig.invest_opcode,
        username,
        apiConfig.invest_token,
        userBalance,
        apiConfig.invest_secret_key
      );

      if (!depositResult.success) {
        console.error('❌ API 입금 실패:', depositResult.error);
        
        // 롤백: api_configs balance 복구
        await supabase
          .from('api_configs')
          .update({ 
            invest_balance: currentInvestBalance,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', partnerId);
        
        console.log(`🔄 [Rollback] api_configs 복구 완료: ${currentInvestBalance - userBalance} → ${currentInvestBalance}`);
        
        return {
          success: false,
          error: `API 입금 실패: ${depositResult.error}`
        };
      }

      apiBalance = depositResult.balance || userBalance;
      
      console.log(`✅ [API 입금] ${userBalance}원 입금 완료`);
      console.log(`📊 [API 잔고] ${apiBalance}원`);
      console.log(`📊 [GMS 잔고] ${userBalance}원 (변동 없음)`);

    } catch (apiError) {
      console.error('❌ API 입금 오류:', apiError);
      
      // 롤백: api_configs balance 복구
      await supabase
        .from('api_configs')
        .update({ 
          invest_balance: currentInvestBalance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', partnerId);
      
      console.log(`🔄 [Rollback] api_configs 복구 완료: ${currentInvestBalance - userBalance} → ${currentInvestBalance}`);
      
      return {
        success: false,
        error: `API 입금 오류: ${apiError instanceof Error ? apiError.message : '알 수 없는 오류'}`
      };
    }

    // ⭐ 4. 게임 실행 URL 조회
    const result = await investApi.launchGame(
      apiConfig.invest_opcode,
      username,
      apiConfig.invest_token,
      gameId,
      apiConfig.invest_secret_key
    );

    if (result.success && result.data?.game_url) {
      console.log(`✅ [게임 실행] URL 생성 완료`);
      console.log(`✅ [Seamless Wallet] 게임 진입 완료:`);
      console.log(`   - API 잔고: ${apiBalance}원`);
      console.log(`   - GMS 잔고: ${userBalance}원 (유지)`);
      return {
        success: true,
        launch_url: result.data.game_url,
        game_url: result.data.game_url
      };
    }

    // 게임 실행 실패 시 API 출금으로 원복
    console.error('❌ 게임 실행 실패 - API 출금 원복 시작:', result.error || '게임 URL을 받지 못했습니다');
    
    // ⭐ 입금 처리 완료를 위해 2초 대기 (API 처리 시간 확보)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 최대 3회 재시도
    let rollbackSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`🔄 [원복 시도 ${attempt}/3] API 출금 시도 중...`);
        
        const withdrawResult = await investApi.withdrawBalance(
          apiConfig.invest_opcode,
          username,
          apiConfig.invest_token,
          userBalance,
          apiConfig.invest_secret_key
        );

        if (withdrawResult.success) {
          console.log(`✅ [원복 완료] API 출금 완료 (${attempt}번째 시도)`);
          rollbackSuccess = true;
          break;
        } else {
          console.error(`⚠️ [원복 실패 ${attempt}/3]`, withdrawResult.error);
          
          // 재시도 전 대기 (점진적 증가: 2초, 4초, 6초)
          if (attempt < 3) {
            const waitTime = attempt * 2000;
            console.log(`⏳ ${waitTime/1000}초 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      } catch (rollbackError) {
        console.error(`⚠️ [원복 오류 ${attempt}/3]`, rollbackError);
        
        // 재시도 전 대기
        if (attempt < 3) {
          const waitTime = attempt * 2000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    if (!rollbackSuccess) {
      console.error('🚨 [긴급] 원복 실패 - 수동 처리 필요!', {
        username,
        amount: userBalance,
        opcode: apiConfig.invest_opcode
      });
      
      // TODO: 관리자 알림 발송
      // await sendAdminAlert({ type: 'rollback_failed', username, amount: userBalance });
    }

    return {
      success: false,
      error: result.error || '게임 URL을 가져올 수 없습니다.'
    };

  } catch (error) {
    console.error('❌ Invest 게임 실행 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '게임 실행 중 오류가 발생했습니다.'
    };
  }
}

/**
 * OroPlay API 게임 실행 (Seamless Wallet)
 */
async function launchOroPlayGame(
  partnerId: string,
  username: string,
  game: any
): Promise<{
  success: boolean;
  launch_url?: string;
  game_url?: string;
  error?: string;
}> {
  console.log('🎮 OroPlay API 게임 실행:', {
    partnerId,
    username,
    vendorCode: game.vendor_code,
    gameCode: game.game_code
  });

  try {
    // ⭐ 1. 사용자 DB 보유금 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('username', username)
      .single();

    if (userError || !userData) {
      console.error('❌ 사용자 정보 조회 실패:', userError);
      return {
        success: false,
        error: '사용자 정보를 찾을 수 없습니다.'
      };
    }

    const userBalance = userData.balance || 0;
    
    if (userBalance <= 0) {
      console.error('❌ 보유금 부족:', userBalance);
      return {
        success: false,
        error: '보유금이 부족합니다. 입금 후 이용해주세요.'
      };
    }

    console.log(`💰 [게임 시작] 사용자 GMS 보유금: ${userBalance}원`);
    console.log(`ℹ️ [Seamless Wallet] GMS는 변동 없이 유지됩니다. 베팅 기록 동기화를 통해서만 증감됩니다.`);

    // ⭐ 2. api_configs balance 먼저 차감 (Optimistic Update)
    console.log(`🔄 [Optimistic Update] api_configs oroplay_balance 차감 시작: ${userBalance}원`);
    
    const { data: currentConfig, error: getConfigError } = await supabase
      .from('api_configs')
      .select('oroplay_balance')
      .eq('partner_id', partnerId)
      .single();
    
    if (getConfigError || !currentConfig) {
      console.error('❌ api_configs 조회 실패:', getConfigError);
      return {
        success: false,
        error: '관리자 보유금 정보를 찾을 수 없습니다.'
      };
    }
    
    const currentOroplayBalance = currentConfig.oroplay_balance || 0;
    
    if (currentOroplayBalance < userBalance) {
      console.error('❌ 관리자 OroPlay 보유금 부족:', { current: currentOroplayBalance, required: userBalance });
      return {
        success: false,
        error: '관리자 보유금이 부족합니다. 관리자에게 문의하세요.'
      };
    }
    
    const { error: updateConfigError } = await supabase
      .from('api_configs')
      .update({ 
        oroplay_balance: currentOroplayBalance - userBalance,
        updated_at: new Date().toISOString()
      })
      .eq('partner_id', partnerId);
    
    if (updateConfigError) {
      console.error('❌ api_configs 업데이트 실패:', updateConfigError);
      return {
        success: false,
        error: 'DB 업데이트 실패'
      };
    }
    
    console.log(`✅ [Optimistic Update] api_configs 차감 완료: ${currentOroplayBalance} → ${currentOroplayBalance - userBalance}`);

    // ⭐ 3. OroPlay 토큰 조회
    const token = await oroplayApi.getToken(partnerId);

    if (!token) {
      console.error('❌ OroPlay 토큰 조회 실패');
      
      // 롤백: api_configs balance 복구
      await supabase
        .from('api_configs')
        .update({ 
          oroplay_balance: currentOroplayBalance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', partnerId);
      
      console.log(`🔄 [Rollback] api_configs 복구 완료: ${currentOroplayBalance - userBalance} → ${currentOroplayBalance}`);
      
      return {
        success: false,
        error: 'OroPlay 인증 토큰을 가져올 수 없습니다.'
      };
    }

    // ⭐ 4. 외부 API에 입금 (POST /user/deposit)
    // ✅ GMS 보유금은 그대로 유지! (0으로 만들지 않음)
    // ✅ 베팅 기록 동기화(PATCH)를 통해서만 GMS 증감
    try {
      const depositResult = await oroplayApi.depositBalance(
        token,
        username,
        userBalance,
        game.vendor_code
      );

      if (!depositResult.success) {
        console.error('❌ API 입금 실패:', depositResult.error);
        
        // 롤백: api_configs balance 복구
        await supabase
          .from('api_configs')
          .update({ 
            oroplay_balance: currentOroplayBalance,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', partnerId);
        
        console.log(`🔄 [Rollback] api_configs 복구 완료: ${currentOroplayBalance - userBalance} → ${currentOroplayBalance}`);
        
        return {
          success: false,
          error: `API 입금 실패: ${depositResult.error}`
        };
      }

      console.log(`✅ [API 입금] ${userBalance}원 입금 완료`);
      console.log(`📊 [API 잔고] ${depositResult.balance}원`);
      console.log(`📊 [GMS 잔고] ${userBalance}원 (변동 없음)`);

    } catch (apiError) {
      console.error('❌ API 입금 오류:', apiError);
      
      // 롤백: api_configs balance 복구
      await supabase
        .from('api_configs')
        .update({ 
          oroplay_balance: currentOroplayBalance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', partnerId);
      
      console.log(`🔄 [Rollback] api_configs 복구 완료: ${currentOroplayBalance - userBalance} → ${currentOroplayBalance}`);
      
      return {
        success: false,
        error: `API 입금 오류: ${apiError instanceof Error ? apiError.message : '알 수 없는 오류'}`
      };
    }

    // ⭐ 5. 게임 실행 URL 조회
    const launchUrl = await oroplayApi.getLaunchUrl(
      token,
      game.vendor_code,
      game.game_code,
      username,
      'ko'
    );

    if (launchUrl) {
      console.log(`✅ [게임 실행] URL 생성 완료`);
      console.log(`✅ [Seamless Wallet] 게임 진입 완료:`);
      console.log(`   - API 잔고: ${userBalance}원`);
      console.log(`   - GMS 잔고: ${userBalance}원 (유지)`);
      return {
        success: true,
        launch_url: launchUrl,
        game_url: launchUrl
      };
    }

    // 게임 실행 실패 시 API 출금으로 원복
    console.error('❌ 게임 실행 실패 - API 출금 원복 시작: 게임 URL을 받지 못했습니다');
    
    // ⭐ 입금 처리 완료를 위해 2초 대기 (API 처리 시간 확보)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 최대 3회 재시도
    let rollbackSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`🔄 [원복 시도 ${attempt}/3] API 출금 시도 중...`);
        
        const withdrawResult = await oroplayApi.withdrawBalance(
          token,
          username,
          game.vendor_code
        );

        if (withdrawResult.success) {
          console.log(`✅ [원복 완료] API 출금 완료 (${attempt}번째 시도)`);
          rollbackSuccess = true;
          break;
        } else {
          console.error(`⚠️ [원복 실패 ${attempt}/3]`, withdrawResult.error);
          
          // 재시도 전 대기 (점진적 증가: 2초, 4초, 6초)
          if (attempt < 3) {
            const waitTime = attempt * 2000;
            console.log(`⏳ ${waitTime/1000}초 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      } catch (rollbackError) {
        console.error(`⚠️ [원복 오류 ${attempt}/3]`, rollbackError);
        
        // 재시도 전 대기
        if (attempt < 3) {
          const waitTime = attempt * 2000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    if (!rollbackSuccess) {
      console.error('🚨 [긴급] 원복 실패 - 수동 처리 필요!', {
        username,
        amount: userBalance,
        vendorCode: game.vendor_code
      });
      
      // TODO: 관리자 알림 발송
      // await sendAdminAlert({ type: 'rollback_failed', username, amount: userBalance });
    }

    return {
      success: false,
      error: '게임 URL을 가져올 수 없습니다.'
    };

  } catch (error) {
    console.error('❌ OroPlay 게임 실행 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '게임 실행 중 오류가 발생했습니다.'
    };
  }
}

// ============================================
// 8. 게임 세션 관리
// ============================================

/**
 * 활성 게임 세션 체크
 */
export async function checkActiveSession(userId: string): Promise<{
  isActive: boolean;
  api_type?: 'invest' | 'oroplay';
  game_name?: string;
  session_id?: number;
  game_id?: number;
  launch_url?: string;
  status?: 'active' | 'ready';
  ready_status?: 'waiting' | 'popup_opened' | 'popup_blocked';
} | null> {
  try {
    // ⭐ ready와 active 세션 모두 체크 (중복 클릭 방지)
    const { data, error } = await supabase
      .from('game_launch_sessions')
      .select(`
        id,
        api_type,
        game_id,
        status,
        launch_url,
        ready_status
      `)
      .eq('user_id', userId)
      .in('status', ['active', 'ready'])
      .order('launched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('❌ 활성 세션 조회 오류:', error);
      return null;
    }

    if (!data) {
      return { isActive: false };
    }

    // 게임 이름 별도 조회
    let gameName = '알 수 없는 게임';
    if (data.game_id) {
      const { data: gameData } = await supabase
        .from('games')
        .select('name')
        .eq('id', data.game_id)
        .single();
      
      if (gameData) {
        gameName = gameData.name;
      }
    }

    return {
      isActive: true,
      api_type: data.api_type as 'invest' | 'oroplay',
      game_name: gameName,
      session_id: data.id,
      game_id: data.game_id,
      launch_url: data.launch_url,
      status: data.status as 'active' | 'ready',
      ready_status: data.ready_status as 'waiting' | 'popup_opened' | 'popup_blocked'
    };
  } catch (error) {
    console.error('❌ 활성 세션 체크 오류:', error);
    return null;
  }
}

/**
 * 게임 실행 URL 생성 (통합 함수)
 */
export async function generateGameLaunchUrl(
  userId: string,
  gameId: number
): Promise<{
  success: boolean;
  launchUrl?: string;
  sessionId?: number;
  error?: string;
}> {
  console.log('🎮 게임 실행 URL 생성:', { userId, gameId });

  try {
    // 1. 게임 정보 조회
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select(`
        *,
        game_providers!inner(
          name,
          type,
          api_type
        )
      `)
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      console.error('❌ 게임 정보 조회 실패:', gameError);
      return {
        success: false,
        error: '게임 정보를 찾을 수 없습니다.'
      };
    }

    // 2. 사용자 정보 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('username, referrer_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('❌ 사용자 정보 조회 실패:', userError);
      return {
        success: false,
        error: '사용자 정보를 찾을 수 없습니다.'
      };
    }

    // 3. Lv1 파트너 ID 찾기 (referrer_id를 따라 최상위까지 올라감)
    const topLevelPartnerId = await getTopLevelPartnerId(user.referrer_id);
    
    if (!topLevelPartnerId) {
      console.error('❌ 최상위 파트너를 찾을 수 없습니다.');
      return {
        success: false,
        error: '파트너 정보를 찾을 수 없습니다.'
      };
    }

    // 4. Lv1 파트너의 API 설정 조회
    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('invest_opcode, oroplay_client_id, oroplay_client_secret')
      .eq('partner_id', topLevelPartnerId)
      .single();

    if (configError || !apiConfig) {
      console.error('❌ API 설정 조회 실패:', configError);
      return {
        success: false,
        error: 'API 설정을 찾을 수 없습니다.'
      };
    }

    // API 타입에 따라 적절한 credential 선택
    let opcode: string | null = null;
    
    if (game.api_type === 'invest') {
      opcode = apiConfig.invest_opcode;
      if (!opcode) {
        console.error('❌ Invest API opcode가 설정되지 않았습니다.');
        return {
          success: false,
          error: 'Invest API 설정이 완료되지 않았습니다.'
        };
      }
    } else if (game.api_type === 'oroplay') {
      // OroPlay는 client_id를 opcode 필드에 저장
      opcode = apiConfig.oroplay_client_id;
      if (!opcode || !apiConfig.oroplay_client_secret) {
        console.error('❌ OroPlay API credential이 설정되지 않았습니다.');
        return {
          success: false,
          error: 'OroPlay API 설정이 완료되지 않았습니다.'
        };
      }
    }

    // 5. 세션 ID 생성 (16자리 랜덤)
    const sessionId = Math.random().toString(36).substring(2, 18).padEnd(16, '0');

    // 6. 게임 세션 생성 (⭐ FINAL_FLOW: status='ready'로 시작)
    const { data: session, error: sessionError } = await supabase
      .from('game_launch_sessions')
      .insert({
        user_id: userId,
        game_id: gameId,
        opcode: opcode,
        partner_id: topLevelPartnerId,
        session_id: sessionId,
        api_type: game.api_type,
        status: 'ready',  // ⭐ 첫 베팅 전까지는 ready 상태
        ready_at: new Date().toISOString(),  // ⭐ ready 타임아웃 시작
        launched_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .select()
      .single();

    if (sessionError || !session) {
      console.error('❌ 세션 생성 실패:', sessionError);
      return {
        success: false,
        error: '게임 세션 생성에 실패했습니다.'
      };
    }

    // 7. API 타입별 게임 실행
    const launchResult = await launchGame(userId, gameId, user.username);

    if (!launchResult.success || !launchResult.launch_url) {
      // 세션 생성은 됐지만 게임 실행 실패 시 세션 종료
      await supabase
        .from('game_launch_sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', session.id);

      return {
        success: false,
        error: launchResult.error || '게임 실행에 실패했습니다.'
      };
    }

    // ⭐ 8. launch_url을 세션에 저장 (중복 입금 방지)
    await supabase
      .from('game_launch_sessions')
      .update({
        launch_url: launchResult.launch_url,
        last_activity_at: new Date().toISOString()
      })
      .eq('id', session.id);

    console.log(`✅ launch_url 저장 완료 (세션 ID: ${session.id})`);

    return {
      success: true,
      launchUrl: launchResult.launch_url,
      sessionId: session.id
    };

  } catch (error) {
    console.error('❌ 게임 실행 URL 생성 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '게임 실행 중 오류가 발생했습니다.'
    };
  }
}

// Export all functions
export const gameApi = {
  // 제공사 관리
  initializeInvestProviders,
  syncOroPlayProviders,
  getProviders,
  getUserVisibleProviders,

  // 게임 동기화
  syncInvestGames,
  syncAllInvestGames,
  syncOroPlayGames,

  // 게임 조회
  getGames,
  getUserVisibleGames,

  // 게임 상태 관리
  updateGameVisibility,
  updateGameStatus,
  bulkUpdateVisibility,
  bulkUpdateStatus,
  updateGameFeatured,

  // 제공사 상태 관리
  updateProviderVisibility,
  updateProviderStatus,

  // 게임 실행
  launchGame,
  generateGameLaunchUrl,
  checkActiveSession,
};

// ============================================
// 세션 관리 (Seamless Wallet)
// ============================================

/**
 * 세션 종료 시 보유금 동기화 + API 출금
 * ready 타임아웃, 게임창 닫힘, 관리자 강제 종료 시 호출
 */
export async function syncBalanceOnSessionEnd(
  userId: string,
  apiType: 'invest' | 'oroplay'
): Promise<void> {
  try {
    // 1. 사용자 정보 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('username, referrer_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error('사용자 정보 조회 실패');
    }

    // 2. 최상위 파트너(Lv1) API 설정 조회
    const topLevelPartnerId = await getTopLevelPartnerId(user.referrer_id);
    if (!topLevelPartnerId) {
      throw new Error('최상위 파트너 조회 실패');
    }

    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('*')
      .eq('partner_id', topLevelPartnerId)
      .single();

    if (configError || !apiConfig) {
      throw new Error('API 설정 조회 실패');
    }

    // 3. API에서 보유금 조회
    let currentBalance = 0;
    
    if (apiType === 'invest') {
      const balanceResult = await investApi.getUserBalance(
        apiConfig.invest_opcode,
        user.username,
        apiConfig.invest_token,
        apiConfig.invest_secret_key
      );
      
      if (balanceResult.success && balanceResult.balance !== undefined) {
        currentBalance = balanceResult.balance;
      }
    } else {
      // ⭐ OroPlay API 보유금 조회
      const token = await oroplayApi.getToken(topLevelPartnerId);
      if (token) {
        // ⭐ getUserBalance는 숫자를 직접 반환함 (객체 아님)
        currentBalance = await oroplayApi.getUserBalance(token, user.username);
      }
    }

    console.log(`💰 [세션 종료] API 보유금 조회 완료: ${currentBalance}원`);

    // 4. users.balance 업데이트 (DB 먼저 업데이트)
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        balance: currentBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      throw new Error('보유금 업데이트 실패');
    }

    console.log(`✅ [세션 종료] users.balance 업데이트 완료: ${currentBalance}원`);

    // 5. API 출금 호출 (잔액이 있는 경우만)
    if (currentBalance > 0) {
      if (apiType === 'invest') {
        const withdrawResult = await investApi.withdrawBalance(
          apiConfig.invest_opcode,
          user.username,
          apiConfig.invest_token,
          currentBalance,
          apiConfig.invest_secret_key
        );

        if (!withdrawResult.success) {
          console.error('❌ Invest API 출금 실패:', withdrawResult.error);
        } else {
          console.log(`✅ [세션 종료] Invest API 출금 완료: ${currentBalance}원`);
          
          // 6. api_configs.invest_balance 업데이트
          const { error: balanceError } = await supabase
            .from('api_configs')
            .update({
              invest_balance: (apiConfig.invest_balance || 0) + currentBalance,
              updated_at: new Date().toISOString()
            })
            .eq('partner_id', topLevelPartnerId);

          if (balanceError) {
            console.error('❌ Invest API 잔고 업데이트 실패:', balanceError);
          } else {
            console.log(`✅ [세션 종료] api_configs.invest_balance 업데이트 완료`);
          }
        }
      } else {
        // ⭐ OroPlay API 출금
        const token = await oroplayApi.getToken(topLevelPartnerId);
        if (token) {
          // ⭐ withdrawBalance의 세 번째 인자는 vendorCode (선택 사항)
          const withdrawResult = await oroplayApi.withdrawBalance(
            token,
            user.username,
            undefined  // vendorCode는 전체 출금이므로 undefined
          );

          if (!withdrawResult.success) {
            console.error('❌ OroPlay API 출금 실패:', withdrawResult.error);
          } else {
            console.log(`✅ [세션 종료] OroPlay API 출금 완료: ${withdrawResult.balance}원`);
            
            // ⭐ 실제 출금된 금액 사용 (API 응답값)
            const withdrawnAmount = withdrawResult.balance || currentBalance;
            
            // 6. api_configs.oroplay_balance 업데이트
            const { error: balanceError } = await supabase
              .from('api_configs')
              .update({
                oroplay_balance: (apiConfig.oroplay_balance || 0) + withdrawnAmount,
                updated_at: new Date().toISOString()
              })
              .eq('partner_id', topLevelPartnerId);

            if (balanceError) {
              console.error('❌ OroPlay API 잔고 업데이트 실패:', balanceError);
            } else {
              console.log(`✅ [세션 종료] api_configs.oroplay_balance 업데이트 완료: +${withdrawnAmount}원`);
            }
          }
        }
      }
    }

    // 7. 세션 종료 상태 전환
    const { error: sessionError } = await supabase
      .from('game_launch_sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .in('status', ['ready', 'active']);

    if (sessionError) {
      console.error('❌ 세션 종료 처리 실패:', sessionError);
    }

    console.log(`✅ 세션 종료 완료: user=${user.username}, balance=${currentBalance}`);
  } catch (error) {
    console.error('❌ syncBalanceOnSessionEnd 실패:', error);
    throw error;
  }
}

/**
 * ready 세션에서 보유금 동기화 (출금 페이지 진입 시)
 */
export async function syncUserBalance(
  userId: string,
  apiType: 'invest' | 'oroplay'
): Promise<number> {
  try {
    // 1. 사용자 정보 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('username, referrer_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error('사용자 정보 조회 실패');
    }

    // 2. 최상위 파트너(Lv1) API 설정 조회
    const topLevelPartnerId = await getTopLevelPartnerId(user.referrer_id);
    if (!topLevelPartnerId) {
      throw new Error('최상위 파트너 조회 실패');
    }

    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('*')
      .eq('partner_id', topLevelPartnerId)
      .single();

    if (configError || !apiConfig) {
      throw new Error('API 설정 조회 실패');
    }

    // 3. API에서 보유금 조회
    let currentBalance = 0;
    
    if (apiType === 'invest') {
      const balanceResult = await investApi.getUserBalance(
        apiConfig.invest_opcode,
        user.username,
        apiConfig.invest_token,
        apiConfig.invest_secret_key
      );
      
      if (balanceResult.success && balanceResult.balance !== undefined) {
        currentBalance = balanceResult.balance;
      }
    } else {
      // ⭐ OroPlay API 보유금 조회
      const token = await oroplayApi.getToken(topLevelPartnerId);
      if (token) {
        // ⭐ getUserBalance는 숫자를 직접 반환함 (객체 아님)
        currentBalance = await oroplayApi.getUserBalance(token, user.username);
      }
    }

    console.log(`💰 [출금 페이지] API 보유금 조회 완료: ${currentBalance}원`);

    // 4. users.balance 업데이트
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        balance: currentBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      throw new Error('보유금 업데이트 실패');
    }

    console.log(`✅ [출금 페이지] 보유금 동기화 완료: user=${user.username}, balance=${currentBalance}`);
    return currentBalance;
  } catch (error) {
    console.error('❌ syncUserBalance 실패:', error);
    throw error;
  }
}

// getTopLevelPartnerId 함수는 위에 이미 선언됨 (line 1075)