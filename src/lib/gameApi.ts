import { supabase } from './supabase';
import { investApi } from './investApi';
import { oroplayApi } from './oroplayApi';
import * as familyApi from './familyApi';
import { logGameDeposit, logGameWithdraw } from './activityLogger';

// ============================================
// 🔒 전역 락: 세션 종료 중복 방지
// ============================================

// ⭐ 전역 중복 방지: 동일 세션에 대한 동시 처리 방지
export const sessionEndingProcessing = new Set<string>();

// ============================================
// 타입 정의
// ============================================

export interface GameProvider {
  id: number;
  name: string;
  type: 'slot' | 'casino' | 'minigame';
  api_type: 'invest' | 'oroplay' | 'familyapi' | 'honorapi';
  status: 'visible' | 'maintenance' | 'hidden'; // 노출/점검중/비노출
  is_visible: boolean; // 사용자 페이지 노출 여부
  game_visible?: 'visible' | 'maintenance' | 'hidden'; // Lv1 게임 노출 설정
  vendor_code?: string; // OroPlay, FamilyAPI, HonorAPI 전용
  logo_url?: string;
  created_at?: string;
  updated_at?: string;
  // 🆕 멀티 API 지원 (같은 제공사가 여러 API에 존재)
  multi_api?: boolean;
  source_apis?: ('invest' | 'oroplay' | 'familyapi' | 'honorapi')[];
  source_provider_ids?: number[]; // 🆕 원본 provider ID 목록
}

export interface Game {
  id: number;
  provider_id: number;
  name: string;
  type: 'slot' | 'casino' | 'minigame';
  api_type: 'invest' | 'oroplay' | 'familyapi' | 'honorapi';
  status: 'visible' | 'maintenance' | 'hidden';
  is_visible: boolean; // 사용자 페이지 노출 여부
  image_url?: string;
  demo_available?: boolean;
  is_featured?: boolean;
  priority?: number;
  rtp?: number;
  play_count?: number;
  vendor_code?: string; // OroPlay, FamilyAPI, HonorAPI 전용
  game_code?: string; // OroPlay, FamilyAPI, HonorAPI 전용
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
 * Invest 제공사 초기화 (래퍼 함수)
 * @deprecated syncAllProviders(['invest']) 사용 권장
 */
export async function initializeInvestProviders(): Promise<void> {
  return syncAllProviders(['invest']);
}

/**
 * 카지노 로비 게임 초기화
 */
async function initializeCasinoLobbyGames(): Promise<void> {
  const timestamp = new Date().toISOString();
  const lobbyGames = INVEST_CASINO_PROVIDERS.map(p => ({
    id: p.game_id,
    provider_id: p.id,
    name: `${p.name} 로비`,
    type: 'casino' as const,
    api_type: 'invest' as const,
    status: 'visible' as const,
    is_visible: true,
    demo_available: false,
    created_at: timestamp,
    updated_at: timestamp,
  }));

  // 기존 로비 게임 ID 조회
  const lobbyGameIds = lobbyGames.map(g => g.id);
  const { data: existingGames } = await supabase
    .from('games')
    .select('id')
    .eq('api_type', 'invest')
    .in('id', lobbyGameIds);

  const existingIds = new Set(existingGames?.map(g => g.id) || []);

  const newGames = lobbyGames.filter(g => !existingIds.has(g.id));
  const existingToUpdate = lobbyGames.filter(g => existingIds.has(g.id));

  let insertedCount = 0;
  let updatedCount = 0;

  // 신규 로비 게임 추가
  if (newGames.length > 0) {
    const { error: insertError } = await supabase
      .from('games')
      .insert(newGames);

    if (!insertError) {
      insertedCount = newGames.length;
    } else {
      console.error('❌ 카지노 로비 게임 추가 오류:', insertError);
    }
  }

  // 기존 로비 게임 업데이트 (메타데이터만)
  if (existingToUpdate.length > 0) {
    for (const game of existingToUpdate) {
      const { error: updateError } = await supabase
        .from('games')
        .update({
          name: game.name,
          updated_at: game.updated_at,
        })
        .eq('id', game.id);

      if (!updateError) {
        updatedCount++;
      }
    }
  }
}

/**
 * OroPlay 제공사 동기화 (래퍼 함수)
 * @deprecated syncAllProviders(['oroplay']) 사용 권장
 */
export async function syncOroPlayProviders(): Promise<void> {
  return syncAllProviders(['oroplay']);
}

/**
 * FamilyAPI 제공사 동기화 (래퍼 함수)
 * @deprecated syncAllProviders(['familyapi']) 사용 권장
 */
export async function syncFamilyApiProviders(): Promise<void> {
  return syncAllProviders(['familyapi']);
}

/**
 * HonorAPI 제공사 동기화
 * HonorAPI는 별도 테이블(honor_game_providers)을 사용하므로 별도 함수로 처리
 */
export async function syncHonorApiProviders(): Promise<void> {
  console.log('🔄 HonorAPI 제공사 동기화 시작...');
  
  try {
    // honorApi의 syncHonorApiGames 함수 호출 (제공사 + 게임 모두 동기화)
    const { syncHonorApiGames } = await import('./honorApi');
    const result = await syncHonorApiGames();
    
    console.log(`✅ HonorAPI 제공사 동기화 완료: 신규 ${result.newProviders}개, 업데이트 ${result.updatedProviders}개`);
    console.log(`✅ HonorAPI 게임 동기화 완료: 신규 ${result.newGames}개, 업데이트 ${result.updatedGames}개`);
  } catch (error) {
    console.error('❌ HonorAPI 제공사 동기화 실패:', error);
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
 * 누락된 제공사 자동 생성
 * - 게임은 DB에 있지만 제공사가 없는 경우 자동으로 생성
 */
async function ensureMissingProviders(): Promise<void> {
  try {
    // 1. 모든 게임의 vendor_code와 provider_id 조회
    const { data: games } = await supabase
      .from('games')
      .select('id, vendor_code, provider_id, type, api_type, name')
      .not('vendor_code', 'is', null);

    if (!games || games.length === 0) {
      return;
    }

    // 2. 고유한 vendor_code 목록 추출
    const gameVendorCodes = [...new Set(games.map(g => g.vendor_code).filter(Boolean))];

    // 3. 기존 제공사 조회
    const { data: existingProviders } = await supabase
      .from('game_providers')
      .select('id, vendor_code')
      .not('vendor_code', 'is', null);

    const providerMap = new Map((existingProviders || []).map(p => [p.vendor_code, p.id]));

    // 4. 누락된 vendor_code 찾기
    const missingVendorCodes = gameVendorCodes.filter(vc => !providerMap.has(vc));

    if (missingVendorCodes.length === 0) {
      return;
    }

    console.warn(`⚠️ 누락된 제공사 ID: ${missingVendorCodes.join(', ')} - 이 제공사들의 게임이 화면에 표시되지 않습니다.`);
    console.log('🔨 누락된 제공사 자동 생성 중...');

    // 5. 누락된 제공사 생성
    const ts = new Date().toISOString();
    const newProvidersToCreate = missingVendorCodes.map(vendorCode => {
      const gameWithThisVendor = games.find(g => g.vendor_code === vendorCode);
      const isCasino = vendorCode.startsWith('C');

      return {
        id: hashVendorCode(vendorCode),
        name: gameWithThisVendor?.name?.split(' ')[0] || vendorCode,
        type: gameWithThisVendor?.type || (isCasino ? 'casino' : 'slot'),
        api_type: gameWithThisVendor?.api_type || 'familyapi',
        vendor_code: vendorCode,
        status: 'visible' as const,
        is_visible: true,
        created_at: ts,
        updated_at: ts,
      };
    });

    const { error: insertError } = await supabase
      .from('game_providers')
      .insert(newProvidersToCreate);

    if (insertError) {
      console.error('❌ 누락된 제공사 생성 실패:', insertError);
    } else {
      console.log(`✅ ${newProvidersToCreate.length}개 제공사 생성 완료:`, newProvidersToCreate.map(p => `${p.vendor_code}[${p.id}]`));

      // 6. 게임의 provider_id 수정
      let fixedCount = 0;
      for (const provider of newProvidersToCreate) {
        const gamesToFix = games.filter(g => g.vendor_code === provider.vendor_code);
        
        for (const game of gamesToFix) {
          const { error } = await supabase
            .from('games')
            .update({ provider_id: provider.id })
            .eq('id', game.id);

          if (!error) {
            fixedCount++;
          }
        }
      }

      if (fixedCount > 0) {
        console.log(`✅ ${fixedCount}개 게임의 provider_id 수정 완료`);
      }
    }
  } catch (error) {
    console.error('❌ ensureMissingProviders 오류:', error);
  }
}

// ============================================
// 제공사 동기화 - 통합 함수
// ============================================

/**
 * API별 제공사 데이터 가져오기
 */
async function fetchProvidersByApi(apiType: 'invest' | 'oroplay' | 'familyapi'): Promise<Array<{
  id: number;
  name: string;
  type: 'slot' | 'casino' | 'minigame';
  api_type: 'invest' | 'oroplay' | 'familyapi';
  vendor_code?: string;
  status: 'visible' | 'maintenance' | 'hidden';
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}>> {
  const timestamp = new Date().toISOString();

  switch (apiType) {
    case 'invest': {
      const slotProviders = INVEST_SLOT_PROVIDERS.map(p => ({
        id: p.id,
        name: p.name,
        type: 'slot' as const,
        api_type: 'invest' as const,
        status: 'visible' as const,
        is_visible: true,
        created_at: timestamp,
        updated_at: timestamp,
      }));

      const casinoProviders = INVEST_CASINO_PROVIDERS.map(p => ({
        id: p.id,
        name: p.name,
        type: 'casino' as const,
        api_type: 'invest' as const,
        status: 'visible' as const,
        is_visible: true,
        created_at: timestamp,
        updated_at: timestamp,
      }));

      return [...slotProviders, ...casinoProviders];
    }

    case 'oroplay': {
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

      const token = await oroplayApi.getToken(systemAdmin.id);
      const vendors = await oroplayApi.getVendors(token);

      const typeMap: Record<number, 'casino' | 'slot' | 'minigame'> = {
        1: 'casino',
        2: 'slot',
        3: 'minigame',
      };

      return vendors.map(vendor => ({
        id: hashVendorCode(vendor.vendorCode),
        name: vendor.name,
        type: typeMap[vendor.type] || 'slot',
        api_type: 'oroplay' as const,
        vendor_code: vendor.vendorCode,
        status: 'hidden' as const,
        is_visible: true,
        created_at: timestamp,
        updated_at: timestamp,
      }));
    }

    case 'familyapi': {
      const config = await familyApi.getFamilyApiConfig();
      
      let token = await familyApi.getFamilyApiToken(config.partnerId);
      
      let vendors;
      try {
        vendors = await familyApi.getVendorList(config.apiKey, token);
      } catch (error: any) {
        console.warn('⚠️ 토큰 오류 감지, 새 토큰으로 재시도:', error.message);
        token = await familyApi.getFamilyApiToken(config.partnerId, true);
        vendors = await familyApi.getVendorList(config.apiKey, token);
      }

      return vendors.map(vendor => {
        const isCasino = vendor.vendorKey.startsWith('C');
        return {
          id: hashVendorCode(vendor.vendorKey),
          name: vendor.vendorName,
          type: (isCasino ? 'casino' : 'slot') as 'casino' | 'slot',
          api_type: 'familyapi' as const,
          vendor_code: vendor.vendorKey,
          status: 'visible' as const,
          is_visible: true,
          created_at: timestamp,
          updated_at: timestamp,
        };
      });
    }

    default:
      throw new Error(`지원하지 않는 API 타입: ${apiType}`);
  }
}

/**
 * 모든 API 제공사 동기화 (Invest, OroPlay, FamilyAPI, HonorAPI)
 * @param apiTypes - 동기화할 API 타입 배열 (기본값: 모두)
 */
export async function syncAllProviders(
  apiTypes: Array<'invest' | 'oroplay' | 'familyapi' | 'honorapi'> = ['invest', 'oroplay', 'familyapi', 'honorapi']
): Promise<void> {
  console.log('🔄 제공사 통합 동기화 시작:', apiTypes.join(', '));

  for (const apiType of apiTypes) {
    try {
      console.log(`\n🔧 ${apiType.toUpperCase()} 제공사 동기화 중...`);
      
      // HonorAPI는 별도 함수로 처리 (별도 테이블 사용)
      if (apiType === 'honorapi') {
        await syncHonorApiProviders();
        continue;
      }
      
      const providers = await fetchProvidersByApi(apiType);
      
      if (!providers || providers.length === 0) {
        console.log(`⚠️ ${apiType.toUpperCase()} 제공사가 없습니다.`);
        continue;
      }

      const providerIds = providers.map(p => p.id);
      const { data: existingProviders } = await supabase
        .from('game_providers')
        .select('id')
        .eq('api_type', apiType)
        .in('id', providerIds);

      const existingIds = new Set(existingProviders?.map(p => p.id) || []);

      const newProviders = providers.filter(p => !existingIds.has(p.id));
      const existingToUpdate = providers.filter(p => existingIds.has(p.id));

      const batchSize = 20;
      let insertedCount = 0;
      let updatedCount = 0;

      if (newProviders.length > 0) {
        for (let i = 0; i < newProviders.length; i += batchSize) {
          const batch = newProviders.slice(i, i + batchSize);

          const { error } = await supabase
            .from('game_providers')
            .upsert(batch, { onConflict: 'id' });

          if (error) {
            console.error(`❌ ${apiType.toUpperCase()} 제공사 배치 ${Math.floor(i / batchSize) + 1} 추가 오류:`, error);
          } else {
            insertedCount += batch.length;
          }
        }
      }

      if (existingToUpdate.length > 0) {
        for (const provider of existingToUpdate) {
          const updateData: any = {
            name: provider.name,
            updated_at: provider.updated_at,
          };

          if (provider.vendor_code) {
            updateData.vendor_code = provider.vendor_code;
          }

          const { error } = await supabase
            .from('game_providers')
            .update(updateData)
            .eq('id', provider.id);

          if (!error) {
            updatedCount++;
          }
        }
      }

      console.log(`✅ ${apiType.toUpperCase()} 제공사 동기화 완료: 신규 ${insertedCount}개, 업데이트 ${updatedCount}개`);

      // Invest의 경우 카지노 로비 게임 자동 생성
      if (apiType === 'invest' && insertedCount > 0) {
        await initializeCasinoLobbyGames();
      }

    } catch (error: any) {
      console.error(`❌ ${apiType.toUpperCase()} 제공사 동기화 실패:`, error);
      throw error;
    }
  }
}

/**
 * 제공사 목록 조회
 */
export async function getProviders(filters?: {
  api_type?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi';
  type?: 'slot' | 'casino' | 'minigame';
  status?: 'visible' | 'maintenance' | 'hidden';
  is_visible?: boolean;
  partner_id?: string; // 파트너 ID로 API 활성화 필터링
}): Promise<GameProvider[]> {
  let providers: GameProvider[] = [];

  // HonorAPI만 조회
  if (filters?.api_type === 'honorapi') {
    let query = supabase
      .from('honor_game_providers')
      .select('*')
      .order('type', { ascending: true })
      .order('name', { ascending: true });

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
      console.error('❌ HonorAPI 제공사 조회 오류:', error);
      throw error;
    }

    providers = (data || []).map(p => ({ ...p, api_type: 'honorapi' as const }));
  } 
  // api_type 필터가 없으면 모든 테이블에서 조회
  else if (!filters?.api_type) {
    // 1. game_providers 테이블에서 조회 (invest, oroplay, familyapi)
    let query1 = supabase
      .from('game_providers')
      .select('*')
      .order('api_type', { ascending: true })
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (filters?.type) {
      query1 = query1.eq('type', filters.type);
    }

    if (filters?.status) {
      query1 = query1.eq('status', filters.status);
    }

    if (filters?.is_visible !== undefined) {
      query1 = query1.eq('is_visible', filters.is_visible);
    }

    const { data: data1, error: error1 } = await query1;

    if (error1) {
      console.error('❌ 제공사 조회 오류:', error1);
      throw error1;
    }

    // 2. honor_game_providers 테이블에서 조회
    let query2 = supabase
      .from('honor_game_providers')
      .select('*')
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (filters?.type) {
      query2 = query2.eq('type', filters.type);
    }

    if (filters?.status) {
      query2 = query2.eq('status', filters.status);
    }

    if (filters?.is_visible !== undefined) {
      query2 = query2.eq('is_visible', filters.is_visible);
    }

    const { data: data2, error: error2 } = await query2;

    if (error2) {
      console.error('❌ HonorAPI 제공사 조회 오류:', error2);
      // 에러가 있어도 계속 진행 (honor_game_providers 테이블이 아직 없을 수 있음)
    }

    // 두 테이블의 결과를 합치기
    providers = [
      ...(data1 || []),
      ...(data2 || []).map(p => ({ ...p, api_type: 'honorapi' as const }))
    ];
  }
  // 특정 API 타입 조회 (invest, oroplay, familyapi)
  else {
    let query = supabase
      .from('game_providers')
      .select('*')
      .order('api_type', { ascending: true })
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    query = query.eq('api_type', filters.api_type);

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

    providers = data || [];
  }

  // partner_id가 제공된 경우, 해당 파트너의 Lv1 상위자의 활성화된 API만 필터링
  if (filters?.partner_id) {
    try {
      // 1. 파트너 정보 조회하여 Lv1 찾기
      const { data: partner } = await supabase
        .from('partners')
        .select('id, level, parent_id')
        .eq('id', filters.partner_id)
        .single();

      if (partner) {
        let lv1PartnerId = partner.id;

        // Lv1이 아니면 Lv1 찾기
        if (partner.level !== 1) {
          let currentId = partner.parent_id;
          let iterations = 0;
          const maxIterations = 10;

          while (currentId && iterations < maxIterations) {
            const { data: currentPartner } = await supabase
              .from('partners')
              .select('id, level, parent_id')
              .eq('id', currentId)
              .single();

            if (currentPartner?.level === 1) {
              lv1PartnerId = currentPartner.id;
              break;
            }

            currentId = currentPartner?.parent_id || null;
            iterations++;
          }
        }

        // 2. Lv1의 활성화된 API 조회
        const { data: apiConfigs } = await supabase
          .from('api_configs')
          .select('api_provider, is_active')
          .eq('partner_id', lv1PartnerId)
          .eq('is_active', true);

        const activeApis = new Set(apiConfigs?.map(c => c.api_provider) || []);

        console.log(`🔍 [파트너 ${filters.partner_id}] 활성화된 API:`, Array.from(activeApis));

        // 3. 활성화된 API의 제공사만 필터링
        providers = providers.filter(p => activeApis.has(p.api_type));

        console.log(`📊 제공사 조회 (활성 API만): ${providers.length}개`, filters);
        
        // 🆕 같은 이름의 제공사 통합 (예: oroplay Pragmatic + honorapi PragmaticSlot)
        providers = mergeProvidersByName(providers);
        
        return providers;
      }
    } catch (partnerError) {
      console.error('❌ 파트너 API 활성화 필터링 오류:', partnerError);
    }
  }

  console.log(`📊 제공사 조회 (통합 전): ${providers.length}개`, filters);
  
  // 🆕 같은 이름의 제공사 통합
  providers = mergeProvidersByName(providers);
  
  console.log(`📊 제공사 조회 (통합 후): ${providers.length}개`, filters);
  return providers;
}

/**
 * 🆕 같은 이름의 제공사를 통합 (Pragmatic 등)
 * - oroplay의 "Pragmatic"과 honorapi의 "PragmaticSlot"을 하나로 통합
 */
function mergeProvidersByName(providers: GameProvider[]): GameProvider[] {
  const providerMap = new Map<string, GameProvider>();
  
  // 제공사 이름 정규화 매핑
  const nameNormalizationMap: Record<string, string> = {
    'pragmaticslot': 'pragmatic',
    'evolution gaming': 'evolution',
    'evolutiongaming': 'evolution',
  };
  
  providers.forEach(provider => {
    // 이름 정규화
    let normalizedName = provider.name.toLowerCase().trim();
    normalizedName = nameNormalizationMap[normalizedName] || normalizedName;
    
    const existing = providerMap.get(normalizedName);
    
    if (!existing) {
      // 첫 번째 제공사 저장 (이름은 더 보기 좋은 것으로)
      providerMap.set(normalizedName, {
        ...provider,
        // Pragmatic으로 통일 (PragmaticSlot → Pragmatic)
        name: normalizedName === 'pragmatic' ? 'Pragmatic' : provider.name,
        // 🆕 multi_api 플래그 추가
        multi_api: false,
        source_apis: [provider.api_type],
        source_provider_ids: [provider.id], // 🆕 원본 provider ID 저장
      });
    } else {
      // 같은 이름의 제공사가 이미 있으면 통합
      console.log(`🔗 제공사 통합: ${existing.name} (${existing.api_type}) + ${provider.name} (${provider.api_type})`);
      
      existing.multi_api = true;
      if (!existing.source_apis) {
        existing.source_apis = [existing.api_type];
      }
      if (!existing.source_apis.includes(provider.api_type)) {
        existing.source_apis.push(provider.api_type);
      }
      
      // 🆕 원본 provider ID 저장
      if (!existing.source_provider_ids) {
        existing.source_provider_ids = [existing.id];
      }
      if (!existing.source_provider_ids.includes(provider.id)) {
        existing.source_provider_ids.push(provider.id);
      }
      
      // Pragmatic으로 이름 통일
      if (normalizedName === 'pragmatic') {
        existing.name = 'Pragmatic';
      }
    }
  });
  
  return Array.from(providerMap.values());
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
      .select('opcode, secret_key')
      .eq('partner_id', systemAdmin.id)
      .eq('api_provider', 'invest')
      .maybeSingle();

    if (!apiConfig?.opcode || !apiConfig?.secret_key) {
      throw new Error('시스템 관리자의 API 설정을 찾을 수 없습니다.');
    }

    // 3. Invest API 호출
    let gamesData: any[] = [];

    try {
      const apiResponse = await investApi.getGameList(
        apiConfig.opcode,
        providerId,
        apiConfig.secret_key
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
          status: 'visible', // ✅ GMS 어드민 기본 노출
          is_visible: true, // ✅ GMS 어드민 기본 노출
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

    // 6. DB 저장 - 신규 게임만 INSERT (기존 게임은 절대 업데이트하지 않음)
    let newCount = 0;

    if (finalGames.length > 0) {
      // 기존 게임 ID 조회
      const { data: existingGames } = await supabase
        .from('games')
        .select('id')
        .eq('provider_id', providerId)
        .eq('api_type', 'invest');

      const existingIds = new Set(existingGames?.map(g => g.id) || []);

      // 신규 게임만 필터링 (기존 게임 제외)
      const newGames = finalGames.filter(g => !existingIds.has(g.id));

      // 신규 게임만 INSERT (기존 게임은 절대 변경하지 않음)
      if (newGames.length > 0) {
        const { error: insertError } = await supabase
          .from('games')
          .insert(newGames);

        if (insertError) {
          console.error('❌ 신규 게임 추가 오류:', insertError);
        } else {
          newCount = newGames.length;
          console.log(`✅ 신규 게임 ${newCount}개 추가 (기존 게임 ${finalGames.length - newCount}개는 보호됨)`);
        }
      } else {
        console.log(`ℹ️ 신규 게임 없음 (기존 ${existingIds.size}개 게임 보호됨)`);
      }
    }

    console.log(`🎯 제공사 ${provider.name} 동기화 완료: 신규 ${newCount} (기존 게임 업데이트 없음)`);

    return {
      newGames: newCount,
      updatedGames: 0, // 기존 게임은 절대 업데이트하지 않음
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

    // 3. OroPlay 제공사 목록 조회 (status 무관하게 모든 제공사 대상)
    const providers = await getProviders({ api_type: 'oroplay' });

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
        console.warn(`⚠️ 제공사 ${provider.name}: vendorCode 없음`, provider);
        continue;
      }

      try {
        console.log(`🔍 [OroPlay 게임 동기화] 제공사: ${provider.name}, ID: ${provider.id}, vendorCode: ${provider.vendor_code}, type: ${provider.type}`);
        const games = await oroplayApi.getGameList(token, provider.vendor_code, 'ko');

        if (!games || games.length === 0) {
          console.log(`ℹ️ 제공사 ${provider.name}: 게임 없음`);
          continue;
        }

        console.log(`📊 제공사 ${provider.name}: ${games.length}개 게임 발견`);
        console.log(`   첫 3개 게임:`, games.slice(0, 3).map(g => g.gameName));

        const timestamp = new Date().toISOString();
        const processedGames = games.map(game => ({
          // OroPlay 게임 ID는 vendorCode + gameCode 조합으로 해시
          id: hashGameCode(provider.vendor_code!, game.gameCode),
          provider_id: provider.id,
          name: game.gameName, // ✅ OroPlay API: gameName 필드
          type: provider.type,
          api_type: 'oroplay',
          status: game.underMaintenance ? 'maintenance' : 'visible', // ✅ GMS 어드민 기본 노출
          is_visible: true, // ✅ GMS 어드민 기본 노출
          vendor_code: provider.vendor_code, // ✅ OroPlay API: vendorCode (provider에서 가져옴)
          game_code: game.gameCode, // ✅ OroPlay API: gameCode 필드
          image_url: game.thumbnail || null, // ✅ OroPlay API: thumbnail 필드
          demo_available: false,
          is_featured: game.isNew || false,
          priority: game.isNew ? 100 : 0,
          created_at: timestamp,
          updated_at: timestamp,
        }));

        // 기존 게임 ID 조회 - ✅ limit 추가하여 모든 게임 조회
        const { data: existingGames } = await supabase
          .from('games')
          .select('id')
          .eq('provider_id', provider.id)
          .eq('api_type', 'oroplay')
          .limit(10000); // ✅ 최대 10000개까지 조회

        const existingIds = new Set(existingGames?.map(g => g.id) || []);

        const newGames = processedGames.filter(g => !existingIds.has(g.id));
        const existingToUpdate = processedGames.filter(g => existingIds.has(g.id));

        // 신규 게임 추가 - ✅ INSERT만 사용 (기존 게임 절대 업데이트하지 않음)
        if (newGames.length > 0) {
          console.log(`   💾 ${provider.name}: ${newGames.length}개 신규 게임 추가 시작...`);
          
          // 배치 크기 500개씩 처리 (Supabase 안정성 고려)
          const batchSize = 500;
          let batchNew = 0;
          
          for (let i = 0; i < newGames.length; i += batchSize) {
            const batch = newGames.slice(i, i + batchSize);
            
            // ⭐ INSERT만 사용 (upsert 제거) - 기존 게임은 절대 업데이트하지 않음
            const { error: insertError } = await supabase
              .from('games')
              .insert(batch);

            if (!insertError) {
              batchNew += batch.length;
              console.log(`   ✅ ${provider.name}: 배치 ${Math.floor(i / batchSize) + 1}/${Math.ceil(newGames.length / batchSize)} - ${batch.length}개 추가 완료`);
            } else {
              console.error(`   ❌ ${provider.name}: 배치 ${Math.floor(i / batchSize) + 1} 추가 오류:`, insertError);
            }
          }
          
          totalNew += batchNew;
          console.log(`✅ ${provider.name}: 총 ${batchNew}개 신규 게임 추가 완료 (기존 게임 보호됨)`);
        } else {
          console.log(`   ℹ️ ${provider.name}: 신규 게임 없음 (기존 ${existingIds.size}개 게임 보호됨)`);
        }

        totalGames += processedGames.length;

        // Rate Limit 방지
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error: any) {
        // API 서버 오류는 간결한 로그만 출력하고 계속 진행
        if (error.message?.includes('errorCode 500')) {
          // 500 에러는 제공사명만 간단히 출력
          continue;
        } else {
          console.warn(`⚠️ ${provider.name}: ${error.message || error}`);
        }
        continue;
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
 * 🆕 OroPlay 특정 제공사만 동기화 (예: dreamtech)
 * @param vendorCode - 제공사 vendor_code (예: 'slot-dreamtech')
 */
export async function syncSpecificOroPlayProvider(vendorCode: string): Promise<SyncResult> {
  console.log(`🔄 OroPlay 특정 제공사 동기화 시작: ${vendorCode}`);

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

    // 3. DB에서 해당 제공사 조회 (vendor_code 정확히 매칭)
    const { data: existingProviders } = await supabase
      .from('game_providers')
      .select('*')
      .eq('api_type', 'oroplay')
      .eq('vendor_code', vendorCode)
      .limit(1);

    let targetProvider;

    if (!existingProviders || existingProviders.length === 0) {
      console.log(`⚠️ 제공사 ${vendorCode}가 DB에 없습니다. OroPlay API에서 조회 후 생성합니다.`);
      
      // OroPlay API에서 전체 제공사 목록 조회
      const vendors = await oroplayApi.getVendors(token);
      const targetVendor = vendors.find(v => v.vendorCode === vendorCode);
      
      if (!targetVendor) {
        throw new Error(`OroPlay API에서 ${vendorCode} 제공사를 찾을 수 없습니다.`);
      }

      // 제공사 생성
      const gameType = targetVendor.type === 1 ? 'casino' : targetVendor.type === 2 ? 'slot' : 'minigame';
      const { data: newProvider, error: createError } = await supabase
        .from('game_providers')
        .insert([{
          name: targetVendor.name,
          type: gameType,
          api_type: 'oroplay',
          status: 'visible',
          is_visible: true,
          vendor_code: targetVendor.vendorCode,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (createError || !newProvider) {
        console.error('❌ 제공사 생성 실패:', createError);
        throw new Error(`제공사 생성 실패: ${createError?.message}`);
      }

      console.log(`✅ 제공사 생성 완료: ${newProvider.name} (ID: ${newProvider.id})`);
      targetProvider = newProvider;
    } else {
      targetProvider = existingProviders[0];
    }

    console.log(`🔍 제공사: ${targetProvider.name}, ID: ${targetProvider.id}, vendorCode: ${targetProvider.vendor_code}`);

    // 4. 해당 제공사의 게임 목록 조회
    const games = await oroplayApi.getGameList(token, vendorCode, 'ko');

    if (!games || games.length === 0) {
      console.log(`ℹ️ 제공사 ${targetProvider.name}: 게임 없음`);
      return { newGames: 0, updatedGames: 0, totalGames: 0 };
    }

    console.log(`📊 제공사 ${targetProvider.name}: ${games.length}개 게임 발견`);

    const timestamp = new Date().toISOString();
    const processedGames = games.map(game => ({
      id: hashGameCode(vendorCode, game.gameCode),
      provider_id: targetProvider.id,
      name: game.gameName,
      type: targetProvider.type,
      api_type: 'oroplay',
      status: game.underMaintenance ? 'maintenance' : 'visible',
      is_visible: true,
      vendor_code: vendorCode,
      game_code: game.gameCode,
      image_url: game.thumbnail || null,
      demo_available: false,
      is_featured: game.isNew || false,
      priority: game.isNew ? 100 : 0,
      created_at: timestamp,
      updated_at: timestamp,
    }));

    // 5. 기존 게임 ID 조회
    const { data: existingGames } = await supabase
      .from('games')
      .select('id')
      .eq('provider_id', targetProvider.id)
      .eq('api_type', 'oroplay')
      .limit(10000);

    const existingIds = new Set(existingGames?.map(g => g.id) || []);

    const newGames = processedGames.filter(g => !existingIds.has(g.id));
    const existingToUpdate = processedGames.filter(g => existingIds.has(g.id));

    let totalNew = 0;
    let totalUpdated = 0;

    // 6. 신규 게임 추가 - ✅ INSERT만 사용 (기존 게임 절대 업데이트하지 않음)
    if (newGames.length > 0) {
      console.log(`💾 ${targetProvider.name}: ${newGames.length}개 신규 게임 추가 시작...`);
      
      const batchSize = 500;
      
      for (let i = 0; i < newGames.length; i += batchSize) {
        const batch = newGames.slice(i, i + batchSize);
        
        // ⭐ INSERT만 사용 (upsert 제거) - 기존 게임은 절대 업데이트하지 않음
        const { data: insertedData, error: insertError } = await supabase
          .from('games')
          .insert(batch)
          .select('id');

        if (insertError) {
          console.error(`❌ 배치 ${Math.floor(i / batchSize) + 1} 추가 오류:`, {
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code
          });
          console.error('❌ 실패한 배치 샘플:', batch[0]);
        } else {
          const actualInserted = insertedData?.length || 0;
          totalNew += actualInserted;
          console.log(`✅ 배치 ${Math.floor(i / batchSize) + 1}/${Math.ceil(newGames.length / batchSize)} - ${actualInserted}개 추가 완료 (시도: ${batch.length})`);
        }
      }
      
      console.log(`✅ ${targetProvider.name}: 총 ${totalNew}개 신규 게임 추가 완료 (기존 게임 보호됨)`);
    } else {
      console.log(`   ℹ️ ${targetProvider.name}: 신규 게임 없음 (기존 ${existingIds.size}개 게임 보호됨)`);
    }

    console.log(`🎯 ${targetProvider.name} 동기화 완료: 신규 ${totalNew}, 업데이트 ${totalUpdated}, 총 ${processedGames.length}`);

    // 8. DB에 실제 저장된 게임 수 확인
    const { data: savedGames, error: countError } = await supabase
      .from('games')
      .select('id', { count: 'exact' })
      .eq('provider_id', targetProvider.id)
      .eq('api_type', 'oroplay');

    if (!countError) {
      console.log(`📊 [DB 확인] ${targetProvider.name} 게임 총 ${savedGames?.length || 0}개 저장됨`);
    } else {
      console.error('❌ DB 확인 실패:', countError);
    }

    return {
      newGames: totalNew,
      updatedGames: totalUpdated,
      totalGames: processedGames.length,
    };

  } catch (error) {
    console.error(`❌ ${vendorCode} 동기화 실패:`, error);
    throw error;
  }
}

/**
 * FamilyAPI 게임 동기화 (전체)
 */
export async function syncFamilyApiGames(): Promise<SyncResult> {
  console.log('🔄 FamilyAPI 게임 동기화 시작...');

  try {
    // 0-1. 제공사 먼저 동기화 (제공사가 없거나 오래된 경우 대비)
    console.log('📋 FamilyAPI 제공사 동기화 확인 중...');
    await syncAllProviders(['familyapi']);
    
    // 0-2. 잘못된 데이터 정리 (game_code가 NULL인 FamilyAPI 게임 삭제)
    console.log('🧹 잘못된 FamilyAPI 게임 데이터 정리 중...');
    const { data: invalidGames } = await supabase
      .from('games')
      .select('id, name, vendor_code, game_code')
      .eq('api_type', 'familyapi')
      .is('game_code', null);

    if (invalidGames && invalidGames.length > 0) {
      console.log(`⚠️ 잘못된 게임 데이터 ${invalidGames.length}개 발견 (game_code가 NULL):`, 
        invalidGames.map(g => `${g.name} (${g.vendor_code})`));
      
      // 카지노 로비가 아닌 잘못된 데이터만 삭제
      const idsToDelete = invalidGames
        .filter(g => !g.name?.includes('로비'))
        .map(g => g.id);
      
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('games')
          .delete()
          .in('id', idsToDelete);

        if (deleteError) {
          console.error('❌ 잘못된 데이터 삭제 오류:', deleteError);
        } else {
          console.log(`✅ 잘못된 게임 데이터 ${idsToDelete.length}개 삭제 완료`);
        }
      }
    }

    // 1. 시스템 관리자 조회 (게임 목록 API는 token 불필요)
    const config = await familyApi.getFamilyApiConfig();
    
    // 2. FamilyAPI 제공사 목록 조회 (DB에서 최신 데이터 가져오기, status 무관)
    const providers = await getProviders({ api_type: 'familyapi' });
    
    console.log(`📋 FamilyAPI 제공사 ${providers.length}개 로드:`, 
      providers.map(p => `${p.vendor_code}(${p.type}): ${p.name} [ID:${p.id}]`));

    if (providers.length === 0) {
      console.log('⚠️ FamilyAPI 제공사가 없습니다. 먼저 제공사를 동기화하세요.');
      return { newGames: 0, updatedGames: 0, totalGames: 0 };
    }

    // 2-1. 기존 게임의 provider_id 수정 (vendor_code 기반으로 정확한 provider_id 매칭)
    console.log('🔧 기존 게임의 provider_id 검증 및 수정 중...');
    const { data: existingGames } = await supabase
      .from('games')
      .select('id, vendor_code, provider_id, type, name')
      .eq('api_type', 'familyapi');

    if (existingGames && existingGames.length > 0) {
      // 게임에 있는 고유한 vendor_code 목록 추출
      const gameVendorCodes = [...new Set(existingGames.map(g => g.vendor_code).filter(Boolean))];
      console.log(`🎮 게임에서 발견된 vendor_code: ${gameVendorCodes.join(', ')}`);

      // 제공사 맵 생성
      const providerMap = new Map(providers.map(p => [p.vendor_code, p.id]));
      
      // 누락된 vendor_code 찾기 및 제공사 생성
      const missingVendorCodes = gameVendorCodes.filter(vc => !providerMap.has(vc));
      
      if (missingVendorCodes.length > 0) {
        console.warn(`⚠️ 제공사가 없는 vendor_code 발견: ${missingVendorCodes.join(', ')}`);
        console.log('🔨 누락된 제공사 생성 중...');
        
        const ts = new Date().toISOString();
        const newProvidersToCreate = missingVendorCodes.map(vendorCode => {
          const isCasino = vendorCode.startsWith('C');
          const gameWithThisVendor = existingGames.find(g => g.vendor_code === vendorCode);
          
          return {
            id: hashVendorCode(vendorCode),
            name: vendorCode,
            type: gameWithThisVendor?.type || (isCasino ? 'casino' : 'slot'),
            api_type: 'familyapi' as const,
            vendor_code: vendorCode,
            status: 'visible' as const,
            is_visible: true,
            created_at: ts,
            updated_at: ts,
          };
        });

        const { error: insertError } = await supabase
          .from('game_providers')
          .insert(newProvidersToCreate);

        if (insertError) {
          console.error('❌ 누락된 제공사 생성 실패:', insertError);
        } else {
          console.log(`✅ ${newProvidersToCreate.length}개 제공사 생성 완료:`, newProvidersToCreate.map(p => `${p.vendor_code}[${p.id}]`));
          
          newProvidersToCreate.forEach(p => {
            providerMap.set(p.vendor_code, p.id);
          });
        }
      }

      // 게임의 provider_id 수정
      let fixedCount = 0;
      for (const game of existingGames) {
        if (!game.vendor_code) continue;
        
        const correctProviderId = providerMap.get(game.vendor_code);
        if (correctProviderId && correctProviderId !== game.provider_id) {
          const { error } = await supabase
            .from('games')
            .update({ provider_id: correctProviderId })
            .eq('id', game.id);

          if (!error) {
            fixedCount++;
            console.log(`✅ 게임 "${game.name}": provider_id ${game.provider_id} → ${correctProviderId} (${game.vendor_code})`);
          }
        }
      }

      if (fixedCount > 0) {
        console.log(`✅ ${fixedCount}개 게임의 provider_id 수정 완료`);
      } else {
        console.log(`✅ 모든 게임의 provider_id가 정확합니다`);
      }
    }

    let totalNew = 0;
    let totalUpdated = 0;
    let totalGames = 0;

    const timestamp = new Date().toISOString();

    // 3. 각 제공사별 게임 동기화
    for (const provider of providers) {
      if (!provider.vendor_code) {
        console.warn(`⚠️ 제공사 ${provider.name}: vendorCode 없음`, provider);
        continue;
      }

      try {
        // 카지노, 슬롯 모두 게임 목록 API 호출
        console.log(`🎰 [FamilyAPI] ${provider.type} 제공사 ${provider.name} (${provider.vendor_code}): 게임 목록 조회 시작`);
        const games = await familyApi.getGameList(config.apiKey, provider.vendor_code);

        if (!games || games.length === 0) {
          console.log(`ℹ️ 제공사 ${provider.name} (${provider.vendor_code}): 게임 목록 없음`);
          
          // 카지노이고 게임이 없으면 로비 게임 생성
          if (provider.type === 'casino') {
            console.log(`🎰 ${provider.name}: 로비 방식 카지노로 처리`);
            const lobbyGameId = hashFamilyApiLobbyId(provider.vendor_code);
            
            const { data: existingLobby } = await supabase
              .from('games')
              .select('id')
              .eq('id', lobbyGameId)
              .maybeSingle();

            if (existingLobby) {
              const { error: updateError } = await supabase
                .from('games')
                .update({
                  name: `${provider.name} 로비`,
                  updated_at: timestamp,
                })
                .eq('id', lobbyGameId);

              if (!updateError) {
                console.log(`✅ 카지노 로비 게임 업데이트: ${provider.name}`);
                totalUpdated += 1;
              }
            } else {
              const lobbyGame = {
                id: lobbyGameId,
                provider_id: provider.id,
                name: `${provider.name} 로비`,
                type: 'casino' as const,
                api_type: 'familyapi' as const,
                vendor_code: provider.vendor_code,
                game_code: provider.vendor_code,
                status: 'visible' as const,
                is_visible: true,
                demo_available: false,
                created_at: timestamp,
                updated_at: timestamp,
              };

              const { error: insertError } = await supabase
                .from('games')
                .insert([lobbyGame]);

              if (!insertError) {
                console.log(`✅ 카지노 로비 게임 추가: ${lobbyGame.name} (${lobbyGame.game_code})`);
                totalNew += 1;
              }
            }
            
            totalGames += 1;
          }
          
          continue;
        }

        console.log(`✅ 제공사 ${provider.name} (${provider.vendor_code}): ${games.length}개 게임 발견`);

        // 게임 데이터 변환 - provider.type을 그대로 사용
        const processedGames = games.map(game => ({
          id: hashFamilyApiGameCode(provider.vendor_code, game.gameKey),
          provider_id: provider.id,
          name: game.gameName || game.gameNameEn,
          type: provider.type, // 제공사의 type을 사용 (casino 또는 slot)
          api_type: 'familyapi' as const,
          vendor_code: provider.vendor_code,
          game_code: game.gameKey,
          status: 'visible' as const, // ✅ GMS 어드민 기본 노출
          is_visible: true, // ✅ GMS 어드민 기본 노출
          image_url: game.gameImg || null,
          demo_available: false,
          priority: 0,
          created_at: timestamp,
          updated_at: timestamp,
        }));

        // 전체 FamilyAPI 게임 중 현재 처리할 게임들의 ID 목록 조회 (중복 방지)
        const gameIds = processedGames.map(g => g.id);
        const { data: existingGames } = await supabase
          .from('games')
          .select('id')
          .eq('api_type', 'familyapi')
          .in('id', gameIds);

        const existingIds = new Set(existingGames?.map(g => g.id) || []);

        const newGames = processedGames.filter(g => !existingIds.has(g.id));
        const existingToUpdate = processedGames.filter(g => existingIds.has(g.id));

        // 신규 게임 추가
        if (newGames.length > 0) {
          console.log(`📥 신규 게임 ${newGames.length}개 추가 시도 중...`);
          console.log(`   샘플 게임 5개:`, newGames.slice(0, 5).map(g => `${g.name} (ID:${g.id}, provider:${g.provider_id}, type:${g.type})`));
          
          const { error: insertError, data: insertedData } = await supabase
            .from('games')
            .insert(newGames)
            .select('id');

          if (insertError) {
            console.error('❌ 신규 게임 추가 오류:', insertError);
            console.error('   에러 상세:', {
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
              code: insertError.code
            });
          } else {
            const actualInserted = insertedData?.length || 0;
            console.log(`✅ 신규 게임 ${actualInserted}개 추가 완료 (시도: ${newGames.length}개)`);
            if (actualInserted < newGames.length) {
              console.warn(`⚠️ 일부 게임이 추가되지 않음: ${newGames.length - actualInserted}개 누락`);
            }
            totalNew += actualInserted;
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
                updated_at: timestamp,
              })
              .eq('id', game.id);

            if (!updateError) {
              totalUpdated += 1;
            }
          }
          console.log(`✅ 기존 게임 ${existingToUpdate.length}개 업데이트 완료`);
        }

        totalGames += processedGames.length;

        // API Rate Limit 고려
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error: any) {
        console.warn(`⚠️ ${provider.name}: ${error.message || error}`);
        continue;
      }
    }

    console.log(`🎯 FamilyAPI 전체 동기화 완료: 신규 ${totalNew}, 업데이트 ${totalUpdated}, 총 ${totalGames}`);
    
    // ⚠️ 실제 DB에 저장된 FamilyAPI 게임 수 확인
    const { data: dbGames, error: dbError } = await supabase
      .from('games')
      .select('id, type, provider_id', { count: 'exact' })
      .eq('api_type', 'familyapi');
    
    if (!dbError && dbGames) {
      const casinoCount = dbGames.filter(g => g.type === 'casino').length;
      const slotCount = dbGames.filter(g => g.type === 'slot').length;
      console.log(`📊 [DB 확인] FamilyAPI 게임 총 ${dbGames.length}개 저장됨 (카지노: ${casinoCount}, 슬롯: ${slotCount})`);
    }

    return {
      newGames: totalNew,
      updatedGames: totalUpdated,
      totalGames: totalGames,
    };

  } catch (error) {
    console.error('❌ FamilyAPI 게임 동기화 실패:', error);
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

/**
 * FamilyAPI gameCode를 해시하여 고유한 숫자 ID 생성
 * ⚠️ vendorCode + gameCode를 조합하여 제공사별로 고유한 ID 생성
 */
function hashFamilyApiGameCode(vendorCode: string, gameCode: string): number {
  // vendorCode + gameCode를 조합하여 해시 생성 (제공사별로 고유 ID)
  const combined = `${vendorCode}_${gameCode}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // FamilyAPI 게임 ID는 3000000 이상으로 설정 (OroPlay와 겹치지 않도록)
  return Math.abs(hash % 900000) + 3000000;
}

/**
 * FamilyAPI 카지노 로비 게임 ID 생성
 */
function hashFamilyApiLobbyId(vendorCode: string): number {
  let hash = 0;
  for (let i = 0; i < vendorCode.length; i++) {
    const char = vendorCode.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // FamilyAPI 카지노 로비 ID는 3900000 이상으로 설정
  return Math.abs(hash % 100000) + 3900000;
}

/**
 * HonorAPI 게임 동기화
 * honor_games 테이블 사용
 */
export async function syncHonorApiGames(): Promise<SyncResult> {
  const { syncHonorApiGames: syncHonor } = await import('./honorApi');
  const result = await syncHonor();
  
  return {
    newGames: result.newGames,
    updatedGames: result.updatedGames,
    totalGames: result.newGames + result.updatedGames
  };
}

// ============================================
// 3. 게임 조회
// ============================================

/**
 * 게임 목록 조회
 */
export async function getGames(filters?: {
  api_type?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi';
  type?: 'slot' | 'casino' | 'minigame';
  provider_id?: number;
  status?: 'visible' | 'maintenance' | 'hidden';
  is_visible?: boolean;
  search?: string;
}): Promise<Game[]> {
  // HonorAPI만 조회하는 경우
  if (filters?.api_type === 'honorapi') {
    return getHonorApiGames(filters);
  }

  // api_type 필터가 없는 경우: games와 honor_games 테이블 모두 조회하여 병합
  if (!filters?.api_type) {
    const [normalGames, honorGames] = await Promise.all([
      getGamesFromTable('games', filters),
      getHonorApiGames(filters)
    ]);
    
    // 두 결과 병합
    const mergedGames = [...normalGames, ...honorGames];
    console.log(`📊 게임 조회 (병합): games=${normalGames.length}개, honor_games=${honorGames.length}개, 총=${mergedGames.length}개`);
    return mergedGames;
  }

  // 특정 API만 조회하는 경우 (invest/oroplay/familyapi)
  return getGamesFromTable('games', filters);
}

/**
 * games 테이블에서 게임 목록 조회
 */
async function getGamesFromTable(
  tableName: 'games',
  filters?: {
    api_type?: 'invest' | 'oroplay' | 'familyapi';
    type?: 'slot' | 'casino' | 'minigame';
    provider_id?: number;
    status?: 'visible' | 'maintenance' | 'hidden';
    is_visible?: boolean;
    search?: string;
  }
): Promise<Game[]> {
  // ⚠️ Supabase는 limit(10000)을 설정해도 실제로는 1000개까지만 반환
  // 페이지네이션으로 전체 데이터 가져오기
  const PAGE_SIZE = 1000;
  let allGames: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('games')
      .select(`
        *,
        game_providers(
          id,
          name,
          type,
          api_type
        )
      `)
      .order('priority', { ascending: true })
      .order('name', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (filters?.api_type) {
    query = query.eq('api_type', filters.api_type);
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

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allGames = allGames.concat(data);
      hasMore = data.length === PAGE_SIZE;
      page++;
    }
  }

  const mappedData = allGames.map(game => ({
    ...game,
    provider_name: game.game_providers?.name || '알 수 없음',
    // ⭐ 제공사 타입을 우선으로 사용 (중복 게임 처리)
    type: game.game_providers?.type || game.type,
  }));

  console.log(`📊 게임 조회: ${mappedData.length}개 (${page}페이지)`, filters);

  return mappedData;
}

/**
 * 게임 ID로 테이블 구분 (HonorAPI 게임 ID는 5000000 이상)
 */
function isHonorApiGame(gameId: number): boolean {
  return gameId >= 5000000;
}

/**
 * 제공사 ID로 테이블 구분 (HonorAPI 제공사 ID는 5000 이상)
 */
function isHonorApiProvider(providerId: number): boolean {
  return providerId >= 5000;
}

/**
 * HonorAPI 게임 목록 조회 (honor_games 테이블)
 */
async function getHonorApiGames(filters?: {
  type?: 'slot' | 'casino' | 'minigame';
  provider_id?: number;
  status?: 'visible' | 'maintenance' | 'hidden';
  is_visible?: boolean;
  search?: string;
}): Promise<Game[]> {
  try {
    const PAGE_SIZE = 1000;
    let allGames: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('honor_games')
        .select(`
          *,
          honor_game_providers(
            id,
            name,
            type
          )
        `)
        .order('priority', { ascending: true })
        .order('name', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

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
        console.error('❌ HonorAPI 게임 조회 오류:', error);
        // 테이블이 없는 경우 빈 배열 반환
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          console.log('⚠️ honor_games 테이블이 없습니다. 빈 배열 반환');
          return [];
        }
        throw error;
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allGames = allGames.concat(data);
        hasMore = data.length === PAGE_SIZE;
        page++;
      }
    }

    const mappedData = allGames.map(game => ({
      ...game,
      api_type: 'honorapi' as const,
      provider_name: game.honor_game_providers?.name || '알 수 없음',
      // ⭐ 제공사 타입을 우선으로 사용 (중복 게임 처리)
      type: game.honor_game_providers?.type || game.type,
    }));

    console.log(`📊 HonorAPI 게임 조회: ${mappedData.length}개 (${page}페이지)`, filters);

    return mappedData;
  } catch (error: any) {
    console.error('❌ ❌ HonorAPI 게임 조회 오류:', error);
    // 에러 발생 시 빈 배열 반환하여 전체 프로세스가 중단되지 않도록
    return [];
  }
}

// ============================================
// 4. 게임 상태 관리 (노출/비노출/점검중)
// ============================================

/**
 * 게임 노출 설정 업데이트
 */
export async function updateGameVisibility(
  gameId: number,
  isVisible: boolean,
  apiType?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
): Promise<void> {
  const isHonorApi = apiType ? apiType === 'honorapi' : isHonorApiGame(gameId);
  const tableName = isHonorApi ? 'honor_games' : 'games';
  
  const { error } = await supabase
    .from(tableName)
    .update({
      is_visible: isVisible,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);

  if (error) {
    console.error('❌ 게임 노출 설정 업데이트 오류:', error);
    throw error;
  }

  console.log(`✅ 게임 ${gameId} 노출 설정: ${isVisible ? '노출' : '숨김'} (${tableName})`);
}

/**
 * 게임 상태 업데이트 (visible/maintenance/hidden)
 */
export async function updateGameStatus(
  gameId: number,
  status: 'visible' | 'maintenance' | 'hidden',
  apiType?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
): Promise<void> {
  console.log(`🔧 updateGameStatus 호출: gameId=${gameId}, status=${status}, apiType=${apiType}`);
  
  // api_type이 제공되면 그것을 사용, 없으면 ID 기반 판단 (후방 호환성)
  const isHonorApi = apiType ? apiType === 'honorapi' : isHonorApiGame(gameId);
  const tableName = isHonorApi ? 'honor_games' : 'games';
  console.log(`📋 테이블 선택: ${tableName} (api_type=${apiType || 'auto'}, isHonorApi=${isHonorApi})`);
  
  const { data, error } = await supabase
    .from(tableName)
    .update({
      status,
      // 점검중이나 숨김 상태면 사용자 페이지에서 보이지 않도록
      is_visible: status === 'visible',
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId)
    .select();

  if (error) {
    console.error('❌ 게임 상태 업데이트 오류:', error);
    console.error('❌ 에러 상세:', JSON.stringify(error, null, 2));
    throw error;
  }

  console.log(`✅ 게임 ${gameId} 상태 업데이트 성공: ${status} (${tableName})`);
  console.log(`📊 업데이트된 데이터:`, data);
}

/**
 * 게임 일괄 노출 설정
 */
export async function bulkUpdateVisibility(gameIds: number[], isVisible: boolean): Promise<void> {
  // HonorAPI 게임과 일반 게임 분리
  const honorGameIds = gameIds.filter(id => isHonorApiGame(id));
  const normalGameIds = gameIds.filter(id => !isHonorApiGame(id));

  // 일반 게임 업데이트
  if (normalGameIds.length > 0) {
    const { error } = await supabase
      .from('games')
      .update({
        is_visible: isVisible,
        updated_at: new Date().toISOString(),
      })
      .in('id', normalGameIds);

    if (error) {
      console.error('❌ 게임 일괄 노출 설정 오류:', error);
      throw error;
    }
    console.log(`✅ ${normalGameIds.length}개 일반 게임 일괄 노출 설정: ${isVisible ? '노출' : '숨김'}`);
  }

  // HonorAPI 게임 업데이트
  if (honorGameIds.length > 0) {
    const { error } = await supabase
      .from('honor_games')
      .update({
        is_visible: isVisible,
        updated_at: new Date().toISOString(),
      })
      .in('id', honorGameIds);

    if (error) {
      console.error('❌ HonorAPI 게임 일괄 노출 설정 오류:', error);
      throw error;
    }
    console.log(`✅ ${honorGameIds.length}개 HonorAPI 게임 일괄 노출 설정: ${isVisible ? '노출' : '숨김'}`);
  }

  console.log(`✅ 총 ${gameIds.length}개 게임 일괄 노출 설정 완료: ${isVisible ? '노출' : '숨김'}`);
}

/**
 * 게임 일괄 상태 업데이트
 */
export async function bulkUpdateStatus(
  gameIds: number[],
  status: 'visible' | 'maintenance' | 'hidden'
): Promise<void> {
  console.log(`🔧 bulkUpdateStatus 호출: ${gameIds.length}개 게임, status=${status}`);
  console.log(`📋 게임 IDs:`, gameIds);
  
  // HonorAPI 게임과 일반 게임 분리
  const honorGameIds = gameIds.filter(id => isHonorApiGame(id));
  const normalGameIds = gameIds.filter(id => !isHonorApiGame(id));
  
  console.log(`📊 분리 결과: 일반 ${normalGameIds.length}개, HonorAPI ${honorGameIds.length}개`);

  // 일반 게임 업데이트
  if (normalGameIds.length > 0) {
    const { error } = await supabase
      .from('games')
      .update({
        status,
        is_visible: status === 'visible',
        updated_at: new Date().toISOString(),
      })
      .in('id', normalGameIds);

    if (error) {
      console.error('❌ 게임 일괄 상태 업데이트 오류:', error);
      throw error;
    }
    console.log(`✅ ${normalGameIds.length}개 일반 게임 일괄 상태 업데이트: ${status}`);
  }

  // HonorAPI 게임 업데이트
  if (honorGameIds.length > 0) {
    const { error } = await supabase
      .from('honor_games')
      .update({
        status,
        is_visible: status === 'visible',
        updated_at: new Date().toISOString(),
      })
      .in('id', honorGameIds);

    if (error) {
      console.error('❌ HonorAPI 게임 일괄 상태 업데이트 오류:', error);
      throw error;
    }
    console.log(`✅ ${honorGameIds.length}개 HonorAPI 게임 일괄 상태 업데이트: ${status}`);
  }

  console.log(`✅ 총 ${gameIds.length}개 게임 일괄 상태 업데이트 완료: ${status}`);
}

/**
 * 게임 추천(Featured) 설정
 */
export async function updateGameFeatured(
  gameId: number,
  isFeatured: boolean,
  apiType?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
): Promise<void> {
  const isHonorApi = apiType ? apiType === 'honorapi' : isHonorApiGame(gameId);
  const tableName = isHonorApi ? 'honor_games' : 'games';
  
  const { error } = await supabase
    .from(tableName)
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

  console.log(`✅ 게임 ${gameId} 추천 설정: ${isFeatured ? '추천' : '해제'} (${tableName})`);
}

// ============================================
// 5. 제공사 상태 관리 (노출/비노출/점검중)
// ============================================

/**
 * 제공사 노출 설정 업데이트
 */
export async function updateProviderVisibility(
  providerId: number,
  isVisible: boolean,
  apiType?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi',
  partnerId?: string
): Promise<void> {
  const isHonorApi = apiType ? apiType === 'honorapi' : isHonorApiProvider(providerId);
  const providerTable = isHonorApi ? 'honor_game_providers' : 'game_providers';
  
  const { error } = await supabase
    .from(providerTable)
    .update({
      is_visible: isVisible,
      updated_at: new Date().toISOString(),
    })
    .eq('id', providerId);

  if (error) {
    console.error('❌ 제공사 노출 설정 업데이트 오류:', error);
    throw error;
  }

  console.log(`✅ 제공사 ${providerId} 노출 설정: ${isVisible ? '노출' : '숨김'} (${providerTable})`);

  // ✅ is_visible=false이고 partnerId가 있으면 partner_game_access에 기록
  if (!isVisible && partnerId && apiType) {
    // 기존 레코드 확인
    const { data: existing } = await supabase
      .from('partner_game_access')
      .select('id')
      .eq('partner_id', partnerId)
      .eq('game_provider_id', providerId)
      .eq('api_provider', apiType)
      .eq('access_type', 'provider')
      .is('user_id', null)
      .single();

    if (!existing) {
      // 레코드가 없으면 삽입
      const { error: insertError } = await supabase
        .from('partner_game_access')
        .insert({
          partner_id: partnerId,
          user_id: null,
          api_provider: apiType,
          game_provider_id: providerId,
          game_id: null,
          access_type: 'provider',
          is_allowed: false,
          game_status: 'hidden',
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('❌ partner_game_access 삽입 오류:', insertError);
      } else {
        console.log(`✅ partner_game_access에 제공사 차단 기록 추가: partner_id=${partnerId}, provider_id=${providerId}`);
      }
    }
  }

  // ✅ is_visible=true이면 partner_game_access에서 제거
  if (isVisible && partnerId && apiType) {
    const { error: deleteError } = await supabase
      .from('partner_game_access')
      .delete()
      .eq('partner_id', partnerId)
      .eq('game_provider_id', providerId)
      .eq('api_provider', apiType)
      .eq('access_type', 'provider')
      .is('user_id', null);

    if (deleteError) {
      console.error('❌ partner_game_access 삭제 오류:', deleteError);
    } else {
      console.log(`✅ partner_game_access에서 제공사 차단 기록 제거: partner_id=${partnerId}, provider_id=${providerId}`);
    }
  }
}

/**
 * 제공사 상태 업데이트 (visible/maintenance/hidden)
 */
export async function updateProviderStatus(
  providerId: number,
  status: 'visible' | 'maintenance' | 'hidden',
  apiType?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
): Promise<void> {
  console.log(`🔧 updateProviderStatus 호출: providerId=${providerId}, status=${status}, apiType=${apiType}`);
  
  // api_type이 제공되면 그것을 사용, 없으면 ID 기반 판단 (후방 호환성)
  const isHonorApi = apiType ? apiType === 'honorapi' : isHonorApiProvider(providerId);
  const providerTable = isHonorApi ? 'honor_game_providers' : 'game_providers';
  const gameTable = isHonorApi ? 'honor_games' : 'games';
  
  console.log(`📋 테이블 선택: ${providerTable} / ${gameTable} (api_type=${apiType || 'auto'}, isHonorApi=${isHonorApi})`);
  
  // ✅ 제공사 status와 is_visible 모두 업데이트
  const { data, error } = await supabase
    .from(providerTable)
    .update({
      status,
      is_visible: status === 'visible',
      updated_at: new Date().toISOString(),
    })
    .eq('id', providerId)
    .select();

  if (error) {
    console.error('❌ 제공사 상태 업데이트 오류:', error);
    console.error('❌ 에러 상세:', JSON.stringify(error, null, 2));
    throw error;
  }

  console.log(`✅ 제공사 ${providerId} 상태 업데이트 성공: status=${status}, is_visible=${status === 'visible'} (${providerTable})`);
  console.log(`📊 업데이트된 데이터:`, data);

  // ✅ 제공사 상태 변경 시 해당 제공사의 모든 게임 status와 is_visible도 동기화
  const { data: gameUpdateData, error: gameUpdateError } = await supabase
    .from(gameTable)
    .update({
      status,
      is_visible: status === 'visible',
      updated_at: new Date().toISOString(),
    })
    .eq('provider_id', providerId)
    .select('id, name, status, is_visible');

  if (gameUpdateError) {
    console.error('❌ 제공사 게임 상태 동기화 오류:', gameUpdateError);
    throw gameUpdateError;
  } else {
    console.log(`✅ 제공사 ${providerId}의 게임 ${gameUpdateData?.length || 0}개 상태 업데이트 완료 (status=${status}, is_visible=${status === 'visible'}) (${gameTable})`);
    if (gameUpdateData && gameUpdateData.length > 0) {
      console.log(`📋 업데이트된 게임 목록:`, gameUpdateData.map(g => `${g.name} (ID: ${g.id})`).join(', '));
    }
  }
}

/**
 * Lv2+ 파트너용 제공사 상태 업데이트 (partner_game_access 사용)
 */
export async function updatePartnerProviderAccess(
  partnerId: string,
  providerId: number,
  apiType: 'invest' | 'oroplay' | 'familyapi' | 'honorapi',
  isVisible: boolean
): Promise<void> {
  console.log(`🔧 updatePartnerProviderAccess 호출: partnerId=${partnerId}, providerId=${providerId}, apiType=${apiType}, isVisible=${isVisible}`);
  
  // 1. 먼저 해당 제공사의 모든 게임 조회
  const isHonorApi = apiType === 'honorapi';
  const gameTable = isHonorApi ? 'honor_games' : 'games';
  
  let gameQuery = supabase
    .from(gameTable)
    .select('id')
    .eq('provider_id', providerId);
  
  if (!isHonorApi) {
    gameQuery = gameQuery.eq('api_type', apiType);
  }
  
  const { data: games, error: gamesError } = await gameQuery;
  
  if (gamesError) {
    console.error('❌ 게임 목록 조회 오류:', gamesError);
    throw gamesError;
  }
  
  const gameIds = games?.map(g => String(g.id)) || [];
  console.log(`📋 제공사 ${providerId}의 게임 ${gameIds.length}개 조회 완료`);
  
  // 2. partner_game_access 테이블 업데이트 (블랙리스트 방식)
  if (!isVisible) {
    // 숨김: 제공사 + 모든 게임 차단 레코드 추가
    
    // 먼저 기존 레코드 삭제
    await supabase
      .from('partner_game_access')
      .delete()
      .eq('partner_id', partnerId)
      .eq('api_provider', apiType)
      .eq('game_provider_id', String(providerId))
      .eq('access_type', 'provider');

    // 제공사 차단 레코드 추가 (is_allowed=false)
    const { error: providerInsertError } = await supabase
      .from('partner_game_access')
      .insert({
        partner_id: partnerId,
        api_provider: apiType,
        game_provider_id: String(providerId),
        access_type: 'provider',
        is_allowed: false, // ✅ 차단 (비노출)
        updated_at: new Date().toISOString(),
      });

    if (providerInsertError) {
      console.error('❌ 제공사 차단 레코드 추가 오류:', providerInsertError);
      throw providerInsertError;
    }

    console.log(`✅ 제공사 ${providerId} 차단 레코드 추가 완료 (is_allowed=false)`);

    // 모든 게임 차단 레코드도 추가
    if (gameIds.length > 0) {
      // 기존 게임 차단 레코드 삭제
      await supabase
        .from('partner_game_access')
        .delete()
        .eq('partner_id', partnerId)
        .eq('api_provider', apiType)
        .eq('access_type', 'game')
        .in('game_id', gameIds);

      // 게임 차단 레코드 추가 (is_allowed=false)
      const gameRecords = gameIds.map(gameId => ({
        partner_id: partnerId,
        api_provider: apiType,
        game_id: gameId,
        game_provider_id: String(providerId),
        access_type: 'game' as const,
        is_allowed: false, // ✅ 차단 (비노출)
        updated_at: new Date().toISOString(),
      }));

      const { error: gameInsertError } = await supabase
        .from('partner_game_access')
        .insert(gameRecords);

      if (gameInsertError) {
        console.error('❌ 게임 차단 레코드 추가 오류:', gameInsertError);
        throw gameInsertError;
      }

      console.log(`✅ 제공사 ${providerId}의 게임 ${gameIds.length}개 차단 레코드 추가 완료 (is_allowed=false)`);
    }
  } else {
    // 노출: 제공사 + 모든 게임 차단 레코드 삭제
    
    // 제공사 차단 레코드 삭제
    const { error: providerDeleteError } = await supabase
      .from('partner_game_access')
      .delete()
      .eq('partner_id', partnerId)
      .eq('api_provider', apiType)
      .eq('game_provider_id', String(providerId))
      .eq('access_type', 'provider');

    if (providerDeleteError) {
      console.error('❌ 제공사 차단 해제 오류:', providerDeleteError);
      throw providerDeleteError;
    }

    console.log(`✅ 제공사 ${providerId} 차단 해제 완료`);

    // 모든 게임 차단 레코드도 삭제
    if (gameIds.length > 0) {
      const { error: gameDeleteError } = await supabase
        .from('partner_game_access')
        .delete()
        .eq('partner_id', partnerId)
        .eq('api_provider', apiType)
        .eq('access_type', 'game')
        .in('game_id', gameIds);

      if (gameDeleteError) {
        console.error('❌ 게임 차단 해제 오류:', gameDeleteError);
        throw gameDeleteError;
      }

      console.log(`✅ 제공사 ${providerId}의 게임 ${gameIds.length}개 차단 해제 완료`);
    }
  }

  // 3. 게임 테이블의 status, is_visible 업데이트는 타임아웃 방지를 위해 제거
  // (실제 필터링은 partner_game_access 기준이므로 게임 테이블 업데이트는 불필요)
  console.log(`✅ partner_game_access 업데이트 완료 (게임 테이블 업데이트 스킵)`);
}

/**
 * Lv2+ 파트너용 API 전체 제공사 상태 업데이트 (partner_game_access 사용)
 */
export async function updatePartnerApiAccess(
  partnerId: string,
  apiType: 'invest' | 'oroplay' | 'familyapi' | 'honorapi',
  providerIds: number[],
  isVisible: boolean
): Promise<void> {
  console.log(`🔧 updatePartnerApiAccess 호출: partnerId=${partnerId}, apiType=${apiType}, providerIds=${providerIds.length}개, isVisible=${isVisible}`);
  
  // 1. 먼저 해당 제공사들의 모든 게임 조회
  const isHonorApi = apiType === 'honorapi';
  const gameTable = isHonorApi ? 'honor_games' : 'games';
  
  let gameQuery = supabase
    .from(gameTable)
    .select('id, provider_id')
    .in('provider_id', providerIds);
  
  if (!isHonorApi) {
    gameQuery = gameQuery.eq('api_type', apiType);
  }
  
  const { data: games, error: gamesError } = await gameQuery;
  
  if (gamesError) {
    console.error('❌ 게임 목록 조회 오류:', gamesError);
    throw gamesError;
  }
  
  const gameIds = games?.map(g => String(g.id)) || [];
  console.log(`📋 ${apiType} API 전체 제공사의 게임 ${gameIds.length}개 조회 완료`);
  
  // 2. partner_game_access 테이블 업데이트 (블랙리스트 방식)
  if (!isVisible) {
    // 전체 숨김: 모든 제공사 + 모든 게임 차단 레코드 추가
    
    // 먼저 기존 제공사 차단 레코드 삭제
    await supabase
      .from('partner_game_access')
      .delete()
      .eq('partner_id', partnerId)
      .eq('api_provider', apiType)
      .eq('access_type', 'provider')
      .in('game_provider_id', providerIds.map(String));

    // 제공사 차단 레코드 추가 (is_allowed=false)
    const providerRecords = providerIds.map(providerId => ({
      partner_id: partnerId,
      api_provider: apiType,
      game_provider_id: String(providerId),
      access_type: 'provider' as const,
      is_allowed: false, // ✅ 차단 (비노출)
      updated_at: new Date().toISOString(),
    }));

    const { error: providerInsertError } = await supabase
      .from('partner_game_access')
      .insert(providerRecords);

    if (providerInsertError) {
      console.error('❌ API 전체 제공사 차단 오류:', providerInsertError);
      throw providerInsertError;
    }

    console.log(`✅ ${apiType} API 전체 제공사 ${providerIds.length}개 차단 레코드 추가 완료`);

    // 모든 게임 차단 레코드도 추가
    if (gameIds.length > 0) {
      // 기존 게임 차단 레코드 삭제
      await supabase
        .from('partner_game_access')
        .delete()
        .eq('partner_id', partnerId)
        .eq('api_provider', apiType)
        .eq('access_type', 'game')
        .in('game_id', gameIds);

      // 게임 차단 레코드 추가 (배치 처리, is_allowed=false)
      const gameRecords = gameIds.map(gameId => {
        // game_id로 provider_id 찾기
        const game = games?.find(g => String(g.id) === gameId);
        const providerId = game ? String(game.provider_id || '') : '';
        
        return {
          partner_id: partnerId,
          api_provider: apiType,
          game_id: gameId,
          game_provider_id: providerId,
          access_type: 'game' as const,
          is_allowed: false, // ✅ 차단 (비노출)
          updated_at: new Date().toISOString(),
        };
      });

      const { error: gameInsertError } = await supabase
        .from('partner_game_access')
        .insert(gameRecords);

      if (gameInsertError) {
        console.error('❌ 게임 차단 레코드 추가 오류:', gameInsertError);
        throw gameInsertError;
      }

      console.log(`✅ ${apiType} API 전체 게임 ${gameIds.length}개 차단 레코드 추가 완료`);
    }
  } else {
    // 전체 노출: 모든 제공사 + 모든 게임 차단 레코드 삭제
    
    // 제공사 차단 레코드 삭제
    const { error: providerDeleteError } = await supabase
      .from('partner_game_access')
      .delete()
      .eq('partner_id', partnerId)
      .eq('api_provider', apiType)
      .eq('access_type', 'provider')
      .in('game_provider_id', providerIds.map(String));

    if (providerDeleteError) {
      console.error('❌ API 전체 제공사 차단 해제 오류:', providerDeleteError);
      throw providerDeleteError;
    }

    console.log(`✅ ${apiType} API 전체 제공사 ${providerIds.length}개 차단 해제 완료`);

    // 모든 게임 차단 레코드도 삭제
    if (gameIds.length > 0) {
      const { error: gameDeleteError } = await supabase
        .from('partner_game_access')
        .delete()
        .eq('partner_id', partnerId)
        .eq('api_provider', apiType)
        .eq('access_type', 'game')
        .in('game_id', gameIds);

      if (gameDeleteError) {
        console.error('❌ 게임 차단 해제 오류:', gameDeleteError);
        throw gameDeleteError;
      }

      console.log(`✅ ${apiType} API 전체 게임 ${gameIds.length}개 차단 해제 완료`);
    }
  }

  // 3. 게임 테이블의 status, is_visible 업데이트는 타임아웃 방지를 위해 제거
  // (실제 필터링은 partner_game_access 기준이므로 게임 테이블 업데이트는 불필요)
  console.log(`✅ partner_game_access API 전체 업데이트 완료 (게임 테이블 업데이트 스킵)`);
}

/**
 * Lv2+ 파트너의 차단된 제공사 목록 조회
 */
export async function getPartnerBlockedProviders(
  partnerId: string,
  apiType?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
): Promise<Set<number>> {
  let query = supabase
    .from('partner_game_access')
    .select('game_provider_id, is_allowed')
    .eq('partner_id', partnerId)
    .is('user_id', null)
    .eq('access_type', 'provider')
    .eq('is_allowed', false); // ✅ is_allowed=false인 레코드만 조회 (차단)

  if (apiType) {
    query = query.eq('api_provider', apiType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ 차단된 제공사 조회 오류:', error);
    return new Set();
  }

  const blockedIds = new Set(
    (data || [])
      .map(item => parseInt(item.game_provider_id))
      .filter(id => !isNaN(id))
  );

  console.log(`📋 파트너 ${partnerId} 차단된 제공사: ${blockedIds.size}개`, Array.from(blockedIds));
  return blockedIds;
}

/**
 * Lv2+ 파트너의 차단된 게임 목록 조회
 */
export async function getPartnerBlockedGames(
  partnerId: string,
  apiType?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
): Promise<Set<number>> {
  let query = supabase
    .from('partner_game_access')
    .select('game_id, is_allowed')
    .eq('partner_id', partnerId)
    .is('user_id', null)
    .eq('access_type', 'game')
    .eq('is_allowed', false); // ✅ is_allowed=false인 레코드만 조회 (차단)

  if (apiType) {
    query = query.eq('api_provider', apiType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ 차단된 게임 조회 오류:', error);
    return new Set();
  }

  const blockedIds = new Set(
    (data || [])
      .map(item => parseInt(item.game_id))
      .filter(id => !isNaN(id))
  );

  console.log(`📋 파트너 ${partnerId} 차단된 게임: ${blockedIds.size}개`);
  return blockedIds;
}

/**
 * Lv2+ 파트너용 개별 게임 접근 관리 (partner_game_access 사용)
 */
export async function updatePartnerGameAccess(
  partnerId: string,
  gameId: number,
  apiType: 'invest' | 'oroplay' | 'familyapi' | 'honorapi',
  providerId: number,
  isVisible: boolean
): Promise<void> {
  console.log(`🔧 updatePartnerGameAccess 호출: partnerId=${partnerId}, gameId=${gameId}, apiType=${apiType}, providerId=${providerId}, isVisible=${isVisible}`);
  
  if (!isVisible) {
    // 숨김: 게임 차단 레코드 추가 (is_allowed=false)
    
    // 먼저 기존 레코드 삭제 (중복 방지)
    await supabase
      .from('partner_game_access')
      .delete()
      .eq('partner_id', partnerId)
      .eq('api_provider', apiType)
      .eq('game_id', String(gameId))
      .eq('access_type', 'game');

    // 게임 차단 레코드 추가 (is_allowed=false)
    const { error: insertError } = await supabase
      .from('partner_game_access')
      .insert({
        partner_id: partnerId,
        api_provider: apiType,
        game_id: String(gameId),
        game_provider_id: String(providerId),
        access_type: 'game',
        is_allowed: false, // ✅ 차단 (비노출)
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('❌ 게임 차단 레코드 추가 오류:', insertError);
      throw insertError;
    }

    console.log(`✅ 게임 ${gameId} 차단 레코드 추가 완료 (is_allowed=false)`);
  } else {
    // 노출: 게임 차단 레코드 삭제
    const { error: deleteError } = await supabase
      .from('partner_game_access')
      .delete()
      .eq('partner_id', partnerId)
      .eq('api_provider', apiType)
      .eq('game_id', String(gameId))
      .eq('access_type', 'game');

    if (deleteError) {
      console.error('❌ 게임 차단 레코드 삭제 오류:', deleteError);
      throw deleteError;
    }

    console.log(`✅ 게임 ${gameId} 차단 해제 완료 (레코드 삭제)`);
  }
}

// ============================================
// 6. 사용자 페이지용 조회
// ============================================

/**
 * 사용자에게 노출할 게임만 조회
 * ✅ Lv7 사용자의 partner_game_access 체크 추가
 * ✅ multi_api 제공사의 경우, 각 API별 제공사 노출 여부도 체크
 */
export async function getUserVisibleGames(filters?: {
  type?: 'slot' | 'casino' | 'minigame';
  provider_id?: number;
  search?: string;
  userId?: string; // 🆕 사용자 ID 추가
}): Promise<Game[]> {
  // ✅ status='visible' AND is_visible=true 체크
  const allGamesRaw = await getGames({
    type: filters?.type,
    provider_id: filters?.provider_id,
    search: filters?.search,
    status: 'visible', // ✅ status='visible' 체크
  });
  
  // ✅ is_visible=true인 게임만 필터링
  let allGames = allGamesRaw.filter(g => g.is_visible === true);

  console.log(`🎮 [getUserVisibleGames] 초기 게임 조회: ${allGames.length}개 (type=${filters?.type}, provider_id=${filters?.provider_id})`);

  // 🆕 multi_api 제공사 필터링: 각 API별 제공사 노출 여부 체크
  // 통합된 제공사(multi_api=true)인 경우, 게임의 api_type에 해당하는 원본 제공사가 실제로 노출 상태인지 확인
  const multiApiProviderNames = ['pragmatic', 'evolution', 'pgsoft', 'playtech', 'habanero', 'CQ9', 'microgaming'];
  
  // 1. multi_api=true인 게임들의 원본 제공사 상태 조회
  const multiApiGames = allGames.filter(g => {
    // 게임의 provider_name이 multiApiProviderNames에 해당하고, multi_api 플래그가 있는 경우
    return multiApiProviderNames.some(name => 
      g.provider_name?.toLowerCase().includes(name.toLowerCase())
    );
  });

  if (multiApiGames.length > 0) {
    console.log(`🎯 [multi_api 필터링] multi_api 의심 게임: ${multiApiGames.length}개`);
    console.log(`📋 게임 목록:`, multiApiGames.slice(0, 3).map(g => `${g.name} (${g.provider_name}, api_type: ${g.api_type})`));

    // 2. 각 API별로 hidden 상태인 제공사 조회
    const hiddenProviders = new Set<string>(); // "api_type-provider_id" 형식
    
    // oroplay/familyapi/invest는 game_providers, honorapi는 honor_game_providers
    const { data: hiddenNormalProviders } = await supabase
      .from('game_providers')
      .select('id, api_type, status, is_visible')
      .in('api_type', ['oroplay', 'familyapi', 'invest'])
      .or('status.ne.visible,is_visible.eq.false');

    if (hiddenNormalProviders && hiddenNormalProviders.length > 0) {
      hiddenNormalProviders.forEach(p => {
        hiddenProviders.add(`${p.api_type}-${p.id}`);
      });
    }

    const { data: hiddenHonorProviders } = await supabase
      .from('honor_game_providers')
      .select('id, status, is_visible')
      .or('status.ne.visible,is_visible.eq.false');

    if (hiddenHonorProviders && hiddenHonorProviders.length > 0) {
      hiddenHonorProviders.forEach(p => {
        hiddenProviders.add(`honorapi-${p.id}`);
      });
    }

    console.log(`🚫 [multi_api 필터링] 비노출 제공사: ${hiddenProviders.size}개`, Array.from(hiddenProviders));

    // 3. 비노출 API의 게임 필터링
    const beforeCount = allGames.length;
    allGames = allGames.filter(g => {
      const gameKey = `${g.api_type}-${g.provider_id}`;
      const isHidden = hiddenProviders.has(gameKey);
      
      if (isHidden) {
        console.log(`🚫 [필터링] 비노출 제공사 게임 제외: ${g.name} (${g.api_type}, provider_id: ${g.provider_id})`);
        return false;
      }
      return true;
    });

    console.log(`✅ [multi_api 필터링] 게임 수: ${beforeCount}개 → ${allGames.length}개 (제외 ${beforeCount - allGames.length}개)`);
  }

  console.log(`📋 [getUserVisibleGames] 처음 5개 게임:`, allGames.slice(0, 5).map(g => ({
    id: g.id,
    name: g.name,
    provider_id: g.provider_id,
    api_type: g.api_type,
    status: g.status,
    is_visible: g.is_visible
  })));

  // 🆕 userId가 있으면 partner_game_access로 차단 필터링 (블랙리스트 방식)
  if (filters?.userId) {
    const { data: userData } = await supabase
      .from('users')
      .select('referrer_id, level')
      .eq('id', filters.userId)
      .maybeSingle();
    
    const userPartnerId = userData?.referrer_id;
    const userLevel = userData?.level;
    
    console.log('👤 [getUserVisibleGames] userId:', filters.userId, '→ referrer_id:', userPartnerId, 'level:', userLevel);
    
    // ⭐⭐⭐ 중요: Lv7만 partner_id 기반 필터링 적용! 매장(Lv2~Lv6)은 모든 게임 표시
    let filteredGames = allGames;
    
    // ⭐ partner_id 기반 차단 (Lv7만 적용)
    if (userLevel === 7 && userPartnerId) {
      console.log('🎯 [getUserVisibleGames] Lv7 사용자 - partner_game_access 필터링 적용');
      
      // ⭐ 상위 계층 전체의 파트너 ID 조회 (자신 + 상위 파트너들)
      const allPartnerIds = await getAllParentPartnerIds(userPartnerId);
      console.log('🔗 [getUserVisibleGames] 상위 계층 전체:', allPartnerIds);
      
      // ✅ 상위 계층 전체의 차단 설정 조회 (매장 레벨: partner_id 기반)
      const { data: blockedAccess } = await supabase
        .from('partner_game_access')
        .select('api_provider, game_provider_id, game_id, access_type, partner_id, game_status, is_allowed')
        .in('partner_id', allPartnerIds)  // ✅ 상위 계층 전체 확인
        .is('user_id', null); // ⭐ 매장 레벨 설정만 (user_id가 null)
      
      const allBlockedAccess = blockedAccess || [];
      
      console.log('🚫 [partner_game_access - 게임 매장] 차단 목록:', allBlockedAccess.length);
      console.log('🚫 [partner_game_access - 게임 매장] 상세:', allBlockedAccess);
      
      // ⭐ 블랙리스트 필터링: 차단 목록에 없는 게임만 표시
      filteredGames = filteredGames.filter(game => {
        // 개별 게임 차단 체크 (game_status='hidden' 또는 is_allowed=false)
        const isGameBlocked = allBlockedAccess.find(
          access =>
            access.api_provider === game.api_type &&
            access.game_provider_id === String(game.provider_id) &&
            access.game_id === String(game.id) &&
            access.access_type === 'game' &&
            (access.game_status === 'hidden' || access.is_allowed === false)
        );
        if (isGameBlocked) {
          return false; // 차단된 게임 제외
        }

        // 제공사 전체 차단 체크 (game_status='hidden' 또는 is_allowed=false)
        const isProviderBlocked = allBlockedAccess.find(
          access =>
            access.api_provider === game.api_type &&
            access.game_provider_id === String(game.provider_id) &&
            access.access_type === 'provider' &&
            (access.game_status === 'hidden' || access.is_allowed === false)
        );
        if (isProviderBlocked) {
          return false; // 제공사 전체 차단 제외
        }

        // API 전체 차단 체크 (game_status='hidden' 또는 is_allowed=false)
        const isApiBlocked = allBlockedAccess.find(
          access =>
            access.api_provider === game.api_type &&
            access.access_type === 'api' &&
            (access.game_status === 'hidden' || access.is_allowed === false)
        );
        if (isApiBlocked) {
          return false; // API 전체 차단 제외
        }

        return true; // 차단되지 않은 게임 표시
      });

      console.log(`✅ [partner_game_access] 게임 필터링: ${allGames.length}개 → ${filteredGames.length}개 (차단 ${allGames.length - filteredGames.length}개)`);
    } else if (userLevel !== 7) {
      console.log(`✅ [getUserVisibleGames] Lv${userLevel} - 매장/관리자는 모든 게임 표시 (partner_id 필터링 건너뜀)`);
    }
    
    // 🆕 user_id 기반 차단 (모든 레벨에 적용!)
    console.log('🎯 [getUserVisibleGames] user_id 기반 차단 설정 조회');
    
    const { data: userBlockedAccess } = await supabase
      .from('partner_game_access')
      .select('api_provider, game_provider_id, game_id, access_type, is_allowed, game_status')
      .eq('user_id', filters.userId); // ⭐ user_id만 체크 (partner_id는 함께 저장될 수 있음)
    
    const userBlocked = userBlockedAccess || [];
    
    console.log('🚫 [partner_game_access - user_id 게임] 차단 목록:', userBlocked.length);
    console.log('🚫 [partner_game_access - user_id 게임] 상세:', userBlocked);
    
    if (userBlocked.length > 0) {
      // ⭐ 블랙리스트 필터링: 차단 목록에 없는 게임만 표시
      const beforeCount = filteredGames.length;
      filteredGames = filteredGames.filter(game => {
        // 개별 게임 차단 체크 (game_status='hidden' 또는 is_allowed=false)
        const isGameBlocked = userBlocked.find(
          access =>
            access.api_provider === game.api_type &&
            access.game_provider_id === String(game.provider_id) &&
            access.game_id === String(game.id) &&
            access.access_type === 'game' &&
            (access.game_status === 'hidden' || access.is_allowed === false)
        );
        if (isGameBlocked) {
          return false; // 차단된 게임 제외
        }

        // 제공사 전체 차단 체크 (game_status='hidden' 또는 is_allowed=false)
        const isProviderBlocked = userBlocked.find(
          access =>
            access.api_provider === game.api_type &&
            access.game_provider_id === String(game.provider_id) &&
            access.access_type === 'provider' &&
            (access.game_status === 'hidden' || access.is_allowed === false)
        );
        if (isProviderBlocked) {
          return false; // 제공사 전체 차단 제외
        }

        // API 전체 차단 체크 (game_status='hidden' 또는 is_allowed=false)
        const isApiBlocked = userBlocked.find(
          access =>
            access.api_provider === game.api_type &&
            access.access_type === 'api' &&
            (access.game_status === 'hidden' || access.is_allowed === false)
        );
        if (isApiBlocked) {
          return false; // API 전체 차단 제외
        }

        return true; // 차단되지 않은 게임 표시
      });

      console.log(`✅ [partner_game_access - user_id] 게임 필터링: ${beforeCount}개 → ${filteredGames.length}개 (차단 ${beforeCount - filteredGames.length}개)`);
    } else {
      console.log('✅ [partner_game_access - user_id] 차단된 게임 없음');
    }
    
    return filteredGames;
  }

  return allGames;
}

// getUserVisibleProviders 함수 패치
// 이 내용을 lib/gameApi.ts의 1244-1256번 라인에 덮어쓰세요

/**
 * 사용자에게 노출할 제공사만 조회
 * ✅ Lv1의 api_configs.is_active도 함께 체크
 * ✅ 누락된 제공사 자동 생성
 * ✅ Lv7 사용자의 partner_game_access 체크 추가
 */
export async function getUserVisibleProviders(filters?: {
  api_type?: 'invest' | 'oroplay' | 'familyapi';
  type?: 'slot' | 'casino' | 'minigame';
  userId?: string; // 🆕 사용자 ID 추가
}): Promise<GameProvider[]> {
  try {
    console.log('🔍 [getUserVisibleProviders] 시작, filters:', filters);
    
    // 0. 누락된 제공사 자동 생성 (게임은 있지만 제공사가 없는 경우)
    await ensureMissingProviders();

    // 🆕 0-1. userId가 있으면 partner_id와 level 조회
    let userPartnerId: string | null = null;
    let userLevel: number | null = null;
    if (filters?.userId) {
      const { data: userData } = await supabase
        .from('users')
        .select('referrer_id, level')
        .eq('id', filters.userId)
        .maybeSingle();
      
      userPartnerId = userData?.referrer_id || null;
      userLevel = userData?.level || null;
      console.log('👤 [getUserVisibleProviders] userId:', filters.userId, '→ referrer_id:', userPartnerId, 'level:', userLevel);
      
      // ⭐ Lv7 사용자는 반드시 partner_id가 있어야 함
      if (userLevel === 7 && !userPartnerId) {
        console.log('⚠️ [partner_game_access] Lv7인데 partner_id 없음 - 빈 목록 반환');
        return [];
      }
    }

    // 1. Lv1 파트너 ID 조회
    const { data: lv1Partner } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 1)
      .limit(1)
      .maybeSingle();

    if (!lv1Partner) {
      console.warn('⚠️ Lv1 파트너를 찾을 수 없습니다');
      return [];
    }

    console.log('✅ Lv1 파트너 ID:', lv1Partner.id);

    // 2. 제공사 조회 (partner_id로 활성화된 API의 제공사만 가져오기)
    // ✅ 사용자 게임 관리 탭과 완전히 동일: getProviders({ partner_id })
    const allProviders = await getProviders({
      partner_id: lv1Partner.id, // ⭐ 활성화된 API 필터링 자동 적용
      api_type: filters?.api_type,
      type: filters?.type, // ⭐ 제공사의 type 필드로 필터링
    });
    
    console.log(`📊 [getUserVisibleProviders] 제공사 조회 (활성 API): ${allProviders.length}개`);
    
    // 3. Benz 사용자 페이지 노출 조건: status='visible' AND is_visible=true
    let providers = allProviders.filter(p => {
      const statusOk = p.status === 'visible';
      const isVisibleOk = p.is_visible === true;
      return statusOk && isVisibleOk;
    });
    console.log(`📊 [getUserVisibleProviders] Benz 노출 조건 필터링 (status='visible' AND is_visible=true): ${allProviders.length}개 → ${providers.length}개`);

    console.log(`📊 [getUserVisibleProviders] 최종 제공사 (partner_game_access 전): ${providers.length}개 (type=${filters?.type || 'all'}, userPartnerId=${userPartnerId})`);

    // 4. partner_game_access로 제공사 필터링 (블랙리스트 방식)
    // ⭐ userPartnerId가 있으면 partner_game_access에서 숨김 처리
    let filteredProviders = providers;
    if (userPartnerId) {
      console.log('🎯 [getUserVisibleProviders] partner_game_access 필터링 적용 (partner_id:', userPartnerId, ')');
      
      // ⭐ 상위 계층 전체의 파트너 ID 조회 (자신 + 상위 파트너들)
      const allPartnerIds = await getAllParentPartnerIds(userPartnerId);
      console.log('🔗 [getUserVisibleProviders] 상위 계층 전체:', allPartnerIds);
      
      // ⭐ 상위 계층 전체의 차단 설정 조회 (매장 레벨: partner_id 기반)
      const { data: partnerBlockedAccess } = await supabase
        .from('partner_game_access')
        .select('api_provider, game_provider_id, game_id, access_type, partner_id, is_allowed')
        .in('partner_id', allPartnerIds)  // ✅ 상위 계층 전체 확인
        .is('user_id', null) // ⭐ 매장 레벨 설정만 (user_id가 null)
        .eq('is_allowed', false); // ⭐ 블랙리스트: is_allowed=false가 차단
      
      // ⭐ 사용자별 차단 설정 조회 (사용자 레벨: user_id 기반)
      let userBlockedAccess: any[] = [];
      if (filters?.userId) {
        const { data } = await supabase
          .from('partner_game_access')
          .select('api_provider, game_provider_id, game_id, access_type, user_id, is_allowed')
          .eq('user_id', filters.userId) // ⭐ 사용자별 설정
          .eq('is_allowed', false); // ⭐ 블랙리스트: is_allowed=false가 차단
        userBlockedAccess = data || [];
      }
      
      const allBlockedAccess = [...(partnerBlockedAccess || []), ...userBlockedAccess];
      
      console.log('🚫 [partner_game_access - 제공사] 매장 차단:', partnerBlockedAccess?.length || 0);
      console.log('🚫 [partner_game_access - 제공사] 사용자 차단:', userBlockedAccess.length);
      console.log('🚫 [partner_game_access - 제공사] 총 차단:', allBlockedAccess.length);
      
      // ⭐ 블랙리스트 필터링: 차단된 제공사 제외
      if (allBlockedAccess.length > 0) {
        // API 전체 차단된 것 확인
        const blockedApis = new Set(
          allBlockedAccess
            .filter(access => access.access_type === 'api')
            .map(access => access.api_provider)
        );
        
        // 제공사 전체 차단된 것 확인
        const blockedProviderIds = new Set<number>();
        allBlockedAccess.forEach(access => {
          if (access.access_type === 'provider' && access.game_provider_id) {
            blockedProviderIds.add(Number(access.game_provider_id));
          }
        });
        
        // 차단되지 않은 제공사만 표시
        const beforeCount = filteredProviders.length;
        filteredProviders = filteredProviders.filter(p => {
          // API 전체 차단 확인
          if (blockedApis.has(p.api_type)) {
            console.log(`🚫 [차단] API 전체 차단: ${p.name} (api_type=${p.api_type})`);
            return false;
          }
          // 제공사 차단 확인
          if (blockedProviderIds.has(p.id)) {
            console.log(`🚫 [차단] 제공사 차단: ${p.name} (provider_id=${p.id})`);
            return false;
          }
          return true;
        });
        
        console.log(`🔐 [partner_game_access] 제공사 필터링: ${beforeCount}개 → ${filteredProviders.length}개 (차단 ${beforeCount - filteredProviders.length}개)`);
        console.log(`🚫 차단된 API: ${Array.from(blockedApis).join(', ') || '없음'}`);
        console.log(`🚫 차단된 제공사 ID: ${Array.from(blockedProviderIds).join(', ') || '없음'}`);
      } else {
        console.log('✅ [partner_game_access] 차단된 제공사 없음 - 전체 표시');
      }
    }
    
    console.log(`📊 [사용자 제공사] 전체: ${providers.length}개 → 활성화된 API: ${filteredProviders.length}개`);
    console.log('📋 필터링된 제공사:', filteredProviders.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      api_type: p.api_type
    })));
    
    return filteredProviders;
  } catch (error) {
    console.error('❌ 사용자 제공사 조회 오류:', error);
    return [];
  }
}


// ============================================
// 7. 게임 실행
// ============================================

/**
 * 현재 파트너의 상위 계층 전체 파트너 ID를 조회하는 함수
 * 자신부터 시작해서 Lv2(대본사)까지의 모든 partner_id 반환
 * 네트워크 재시도 로직 포함
 */
async function getAllParentPartnerIds(partnerId: string): Promise<string[]> {
  const maxRetries = 3;
  const retryDelay = 1000;
  const maxIterations = 10; // 무한 루프 방지
  
  try {
    const parentIds: string[] = [partnerId]; // 자신 포함
    let currentId = partnerId;
    let iterations = 0;

    while (iterations < maxIterations) {
      let partner = null;
      let error = null;
      
      // 재시도 로직
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await supabase
            .from('partners')
            .select('id, parent_id, level, username')
            .eq('id', currentId)
            .single();
          
          partner = result.data;
          error = result.error;
          
          if (!error && partner) {
            break; // 성공하면 재시도 루프 탈출
          }
          
          if (attempt < maxRetries) {
            console.warn(`⚠️ [getAllParentPartnerIds] 파트너 조회 재시도 ${attempt + 1}/${maxRetries}:`, error?.message);
            await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          }
        } catch (fetchError) {
          console.error(`❌ [getAllParentPartnerIds] 파트너 조회 네트워크 오류 (시도 ${attempt + 1}):`, fetchError);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          } else {
            error = fetchError;
          }
        }
      }

      if (error || !partner) {
        console.error('❌ [getAllParentPartnerIds] 파트너 조회 실패 (모든 재시도 완료):', error);
        return parentIds; // 지금까지 수집한 ID 반환
      }

      console.log(`🔍 [getAllParentPartnerIds] 파트너 조회 [${iterations}]:`, {
        id: partner.id,
        username: partner.username,
        level: partner.level,
        parent_id: partner.parent_id
      });

      // Lv2(대본사)에 도달하거나 parent_id가 없으면 종료
      if (partner.level === 2 || !partner.parent_id) {
        console.log('✅ [getAllParentPartnerIds] 상위 계층 조회 완료:', parentIds);
        return parentIds;
      }

      // 상위 파트너 추가
      parentIds.push(partner.parent_id);
      currentId = partner.parent_id;
      iterations++;
    }

    console.warn('⚠️ [getAllParentPartnerIds] 최대 반복 횟수 도달');
    return parentIds;
  } catch (error) {
    console.error('❌ [getAllParentPartnerIds] 오류:', error);
    return [partnerId]; // 최소한 자신의 ID는 반환
  }
}

/**
 * referrer_id를 따라 최상위(Lv1) 파트너 ID를 찾는 함수
 * 네트워크 재시도 로직 포함
 */
async function getTopLevelPartnerId(partnerId: string, retryCount = 0): Promise<string | null> {
  try {
    // ⚡ PostgreSQL RPC 함수 호출 (단일 쿼리로 최적화)
    const { data, error } = await supabase.rpc('get_top_level_partner', {
      start_partner_id: partnerId
    });
    
    if (error) {
      console.error('❌ [getTopLevelPartnerId] RPC 호출 실패:', error);
      
      // ⚠️ RPC 함수가 없으면 fallback (기존 재귀 방식)
      if (error.message?.includes('function') || error.code === '42883') {
        console.warn('⚠️ [getTopLevelPartnerId] RPC 함수 없음 - fallback 사용');
        return await getTopLevelPartnerIdFallback(partnerId);
      }
      
      return null;
    }
    
    if (data && typeof data === 'string') {
      console.log('✅ [getTopLevelPartnerId] 최상위 파트너 조회 완료 (단일 쿼리):', data);
      return data;
    }
    
    console.error('❌ [getTopLevelPartnerId] 유효하지 않은 응답:', data);
    return null;
    
  } catch (error) {
    console.error('❌ [getTopLevelPartnerId] 오류:', error);
    return null;
  }
}

/**
 * ⚠️ Fallback: RPC 함수가 없을 때 사용하는 재귀 방식 (레거시)
 */
async function getTopLevelPartnerIdFallback(partnerId: string): Promise<string | null> {
  const maxRetries = 3;
  const retryDelay = 1000;
  
  try {
    let currentPartnerId = partnerId;
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      let partner = null;
      let error = null;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await supabase
            .from('partners')
            .select('id, parent_id, level, username')
            .eq('id', currentPartnerId)
            .single();
          
          partner = result.data;
          error = result.error;
          
          if (!error && partner) {
            break;
          }
          
          if (attempt < maxRetries) {
            console.warn(`⚠️ 파트너 조회 재시도 ${attempt + 1}/${maxRetries}:`, error?.message);
            await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          }
        } catch (fetchError) {
          console.error(`❌ 파트너 조회 네트워크 오류 (시도 ${attempt + 1}):`, fetchError);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          } else {
            error = fetchError;
          }
        }
      }

      if (error || !partner) {
        console.error('❌ 파트너 조회 실패 (모든 재시도 완료):', {
          message: error?.message || 'Unknown error',
          details: JSON.stringify(error),
          hint: error?.hint,
          code: error?.code
        });
        return null;
      }

      console.log(`🔍 파트너 조회 [${iterations}]:`, {
        id: partner.id,
        username: partner.username,
        level: partner.level,
        parent_id: partner.parent_id
      });

      if (partner.level === 1 || !partner.parent_id) {
        console.log('✅ 최상위 파트너 발견 (Lv1):', partner.username);
        return partner.id;
      }

      currentPartnerId = partner.parent_id;
      iterations++;
    }

    console.error('❌ 최대 반복 횟수 초과');
    return null;
  } catch (error) {
    console.error('❌ getTopLevelPartnerIdFallback 오류:', error);
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
    // 1. 게임 정보 조회 (games 또는 honor_games에서)
    // 먼저 games 테이블 조회
    let game: any = null;
    
    console.log('🔍 게임 ID로 조회 시작:', gameId);
    
    const { data: regularGame, error: regularError } = await supabase
      .from('games')
      .select('*, game_providers(*)')
      .eq('id', gameId)
      .maybeSingle();

    console.log('📊 games 테이블 조회 결과:', { 
      found: !!regularGame, 
      error: regularError 
    });

    if (regularGame) {
      game = regularGame;
      console.log('��� games 테이블에서 게임 발견');
    } else {
      // honor_games 테이블 조회
      console.log('🔍 honor_games 테이블 조회 시작');
      const { data: honorGame, error: honorError } = await supabase
        .from('honor_games')
        .select('*, honor_game_providers(*)')
        .eq('id', gameId)
        .maybeSingle();
      
      console.log('📊 honor_games 테이블 조회 결과:', { 
        found: !!honorGame, 
        error: honorError 
      });
      
      if (honorGame) {
        game = honorGame;
        console.log('✅ honor_games 테이블에서 게임 발견');
      }
    }

    if (!game) {
      console.error('❌ 게임 정보 조회 실패: 게임을 찾을 수 없습니다. gameId:', gameId);
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

    // 2. 사용자 정보 조회 (referrer_id 포함)
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
    const userPartnerId = user.referrer_id; // Lv6 매장 ID

    // ⭐ 2-1. partner_game_access 검증 (Lv6 매장 또는 Lv7 사용자)
    // 로직 반전: 레코드 있음 = 차단, 레코드 없음 = 허용(기본)
    if (userPartnerId) {
      // ⚡ 최적화: 2번 조회 → 1번 조회 (OR 조건으로 통합)
      const { data: blockedAccess } = await supabase
        .from('partner_game_access')
        .select('api_provider, game_provider_id, game_id, access_type, user_id')
        .or(`user_id.eq.${userId},and(partner_id.eq.${userPartnerId},user_id.is.null)`);
      
      // ⚡ 메모리에서 필터링 (DB 조회는 1번만)
      const userBlockedAccess = blockedAccess?.filter(a => a.user_id === userId) || [];
      const storeBlockedAccess = blockedAccess?.filter(a => !a.user_id) || [];
      
      if (userBlockedAccess.length > 0 || storeBlockedAccess.length > 0) {
        console.log('🔍 [partner_game_access] 차단 설정:', {
          사용자: userBlockedAccess.length,
          매장: storeBlockedAccess.length
        });
      }

      // ⭐ 차단 여부 확인 (레코드가 있으면 차단됨)
      let isBlocked = false;
      let blockReason = '';

      // 1) 사용자가 제공사를 차단했는지 확인
      const userProviderBlocked = userBlockedAccess?.find(
        access =>
          access.game_provider_id === String(game.provider_id) &&
          access.access_type === 'provider'
      );
      if (userProviderBlocked) {
        isBlocked = true;
        blockReason = '사용자가 해당 게임사를 차단했습니다.';
        console.log('🚫 [사용자] 제공사 차단:', game.provider_id);
      }

      // 2) 사용자가 게임을 차단했는지 확인
      if (!isBlocked) {
        const userGameBlocked = userBlockedAccess?.find(
          access => 
            access.game_id === String(gameId) && 
            access.access_type === 'game'
        );
        if (userGameBlocked) {
          isBlocked = true;
          blockReason = '사용자가 해당 게임을 차단했습니다.';
          console.log('🚫 [사용자] 게임 차단:', gameId);
        }
      }

      // 3) 매장이 제공사를 차단했는지 확인
      if (!isBlocked) {
        const storeProviderBlocked = storeBlockedAccess?.find(
          access =>
            access.game_provider_id === String(game.provider_id) &&
            access.access_type === 'provider'
        );
        if (storeProviderBlocked) {
          isBlocked = true;
          blockReason = '매장에서 해당 게임사를 차단했습니다.';
          console.log('🚫 [매장] 제공사 차단:', game.provider_id);
        }
      }

      // 4) 매장이 게임을 차단했는지 확인
      if (!isBlocked) {
        const storeGameBlocked = storeBlockedAccess?.find(
          access => 
            access.game_id === String(gameId) && 
            access.access_type === 'game'
        );
        if (storeGameBlocked) {
          isBlocked = true;
          blockReason = '매장에서 해당 게임을 차단했습니다.';
          console.log('🚫 [매장] 게임 차단:', gameId);
        }
      }

      if (isBlocked) {
        console.error('❌ [partner_game_access] 게임 차단됨:', {
          gameId,
          game_name: game.name,
          provider_id: game.provider_id,
          reason: blockReason
        });
        return {
          success: false,
          error: blockReason
        };
      }

      console.log('✅ [partner_game_access] 게임 접근 허용 (차단 없음)');
    } else {
      console.log('ℹ️ [partner_game_access] partner_id 없음 - 검증 건너뜀 (파트너 계정)');
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

    console.log('✅ 최상위 파트너 ID:', topLevelPartnerId);

    // 4. API 활성화 상태 체크
    const { data: apiConfig } = await supabase
      .from('api_configs')
      .select('is_active')
      .eq('partner_id', topLevelPartnerId)
      .eq('api_provider', game.api_type)
      .maybeSingle();

    if (!apiConfig || apiConfig.is_active === false) {
      console.error('❌ API가 비활성화되어 있습니다:', game.api_type);
      return {
        success: false,
        error: '현재 이 게임 제공사는 사용할 수 없습니다. 관리자에게 문의하세요.'
      };
    }

    // 5. API 타입별로 분기
    if (game.api_type === 'invest') {
      return await launchInvestGame(topLevelPartnerId, userUsername, gameId);
    } else if (game.api_type === 'oroplay') {
      return await launchOroPlayGame(topLevelPartnerId, userUsername, game);
    } else if (game.api_type === 'familyapi') {
      return await launchFamilyApiGame(topLevelPartnerId, userUsername, game);
    } else if (game.api_type === 'honorapi') {
      return await launchHonorApiGame(topLevelPartnerId, userUsername, game);
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
    // ⚡ 병렬 처리: API 설정과 사용자 정보 동시 조회
    const [apiConfigResult, userDataResult] = await Promise.all([
      supabase
        .from('api_configs')
        .select('opcode, token, secret_key')
        .eq('partner_id', partnerId)
        .eq('api_provider', 'invest')
        .single(),
      supabase
        .from('users')
        .select('id, balance')
        .eq('username', username)
        .single()
    ]);

    const { data: apiConfig, error: configError } = apiConfigResult;
    const { data: userData, error: userError } = userDataResult;

    if (userError || !userData) {
      console.error('❌ 사용자 정보 조회 실패:', userError);
      return {
        success: false,
        error: '사용자 정보를 찾을 수 없습니다.'
      };
    }

    if (configError || !apiConfig) {
      console.error('❌ API 설정 조회 실패:', configError);
      return {
        success: false,
        error: 'API 설정을 찾을 수 없습니다.'
      };
    }

    if (!apiConfig.opcode || !apiConfig.token || !apiConfig.secret_key) {
      console.error('❌ Invest API 설정 불완전');
      return {
        success: false,
        error: 'Invest API 설정이 완료되지 않았습니다.'
      };
    }

    const userId = userData.id;

    // ⚡ 세션 종료 락 체크 (최대 3초 대기로 단축)
    const lockKey = `${userId}_invest`;
    if (sessionEndingProcessing.has(lockKey)) {
      console.warn(`⏳ [게임 실행 대기] 세션 종료 처리 중... (최대 3초 대기)`);
      
      let waitCount = 0;
      while (sessionEndingProcessing.has(lockKey) && waitCount < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      if (sessionEndingProcessing.has(lockKey)) {
        console.error('❌ [게임 실행 실패] 세션 종료 대기 시간 초과');
        return {
          success: false,
          error: '이전 게임 세션 종료 처리 중입니다. 잠시 후 다시 시도해주세요.'
        };
      }
      
      console.log(`✅ [게임 실행 대기 완료] 세션 종료 완료됨 (${waitCount * 100}ms)`);
      
      // 최신 잔고 다시 조회
      const { data: refreshedUser } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userId)
        .single();
      
      if (refreshedUser) {
        userData.balance = refreshedUser.balance;
        console.log(`💰 [게임 실행] 갱신된 보유금: ${refreshedUser.balance}원`);
      }
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

    // ⚡ 회원 생성 (비동기 처리 - await 하지 않음, 대부분 이미 존재)
    investApi.createAccount(
      apiConfig.opcode,
      username,
      apiConfig.secret_key
    ).catch(err => console.warn('⚠️ [회원 생성] 오류 (무시):', err));

    // ⚡ 입금
    console.log(`💸 [입금] GMS → API 입금 시작: ${userBalance}원`);
    const depositResult = await investApi.depositBalance(
      apiConfig.opcode,
      username,
      apiConfig.token,
      userBalance,
      apiConfig.secret_key
    );

    if (!depositResult.success) {
      console.error('❌ API 입금 실패:', depositResult.error);
      return {
        success: false,
        error: `입금 실패: ${depositResult.error}`
      };
    }

    console.log(`✅ [입금] API 입금 완료: ${userBalance}원`);

    // ⚡ 게임 URL 생성
    const result = await investApi.launchGame(
      apiConfig.opcode,
      username,
      apiConfig.token,
      gameId,
      apiConfig.secret_key
    );

    if (!result.success || !result.data?.game_url) {
      console.error('❌ 게임 URL 생성 실패:', result.error);
      return {
        success: false,
        error: result.error || '게임 URL 생성 실패'
      };
    }

    console.log(`✅ [게임 실행] URL 생성 완료`);

    // ✅ NOTE: 세션 생성은 generateGameLaunchUrl()에서 이미 처리됨
    // 여기서는 URL만 반환

    // ⚡ 활동 로그 (비동기)
    logGameDeposit(userId, username, 'invest', userBalance, gameId)
      .catch(err => console.error('❌ 게임 입금 로그 실패:', err));

    // 🚀 게임 URL 즉시 반환
    return {
      success: true,
      launch_url: result.data.game_url,
      game_url: result.data.game_url
    };

  } catch (error) {
    console.error('❌ Invest 게임 실행 오류:', error);
    
    // ⚡⚡⚡ 타임아웃 발생 시 무조건 API 머니 회수!
    try {
      console.log('🔄 [에러 발생] API 머니 회수 시도...');
      const { data: userData } = await supabase
        .from('users')
        .select('id, username, referrer_id')
        .eq('username', username)
        .single();
      
      if (userData) {
        const topLevelPartnerId = await getTopLevelPartnerId(userData.referrer_id);
        const { data: apiConfig } = await supabase
          .from('api_configs')
          .select('opcode, token, secret_key')
          .eq('partner_id', topLevelPartnerId)
          .eq('api_provider', 'invest')
          .single();
        
        if (apiConfig) {
          // Invest API에서 전체 출금
          const withdrawResult = await investApi.withdrawBalance(
            apiConfig.opcode,
            username,
            apiConfig.token,
            apiConfig.secret_key
          );
          
          if (withdrawResult.success && withdrawResult.balance && withdrawResult.balance > 0) {
            console.log(`✅ [에러 발생] API 머니 회수 완료: ${withdrawResult.balance}원`);
            
            // GMS 잔고 복구
            await supabase
              .from('users')
              .update({ 
                balance: withdrawResult.balance,
                updated_at: new Date().toISOString()
              })
              .eq('id', userData.id);
            
            console.log(`✅ [에러 발생] GMS 잔고 복구 완료: ${withdrawResult.balance}원`);
          } else {
            console.log('ℹ️ [에러 발생] API 머니 없음 (회수 불필요)');
          }
        }
      }
    } catch (recoverError) {
      console.error('❌ [에러 발생] API 머니 회수 실패:', recoverError);
      // 에러 발생해도 계속 진행 (원본 에러 메시지 반환)
    }
    
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

  // ⚡ token을 함수 스코프로 선언 (catch 블록에서도 접근 가능!)
  let token: string | null = null;

  try {
    // ✅ OroPlay API 활성화 체크
    const { checkApiActiveByPartnerId } = await import('./apiStatusChecker');
    const isOroPlayActive = await checkApiActiveByPartnerId(partnerId, 'oroplay');
    
    if (!isOroPlayActive) {
      console.error('❌ OroPlay API가 비활성화되어 있습니다');
      return {
        success: false,
        error: 'OroPlay API가 현재 비활성화되어 있습니다. 관리자에게 문의하세요.'
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

    // 🚨🚨🚨 CRITICAL: 세션 종료 중인지 체크 (Race Condition 방지!)
    const lockKey = `${userData.id}_oroplay`;
    if (sessionEndingProcessing.has(lockKey)) {
      console.warn(`⏳ [게임 실행 대기] 세션 종료 처리 중... (최대 5초 대기)`);
      
      // ⚡ 최대 5초 동안 대기 (100ms 간격으로 체크)
      let waitCount = 0;
      while (sessionEndingProcessing.has(lockKey) && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      if (sessionEndingProcessing.has(lockKey)) {
        console.error('❌ [게임 실행 실패] 세션 종료 대기 시간 초과');
        return {
          success: false,
          error: '이전 게임 세션 종료 처리 중입니다. 잠시 후 다시 시도해주세요.'
        };
      }
      
      console.log(`✅ [게임 실행 대기 완료] 세션 종료 완료됨 (${waitCount * 100}ms)`);
      
      // ⚡ 세션 종료 후 최신 잔고 다시 조회!
      const { data: refreshedUser } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userData.id)
        .single();
      
      if (refreshedUser) {
        userData.balance = refreshedUser.balance;
        console.log(`💰 [게임 실행] 갱신된 보유금: ${refreshedUser.balance}원`);
      }
    }

    const userBalance = userData.balance || 0;
    let finalBalance = 0; // ⭐ 입금 후 실제 금액 (회수 후 업데이트될 수 있음)
    
    if (userBalance <= 0) {
      console.error('❌ 보유금 부족:', userBalance);
      return {
        success: false,
        error: '보유금이 부족합니다. 입금 후 이용해주세요.'
      };
    }

    console.log(`💰 [게임 시작] 사용자 GMS 보유금: ${userBalance}원`);

    // ⭐ 1-1. 팝업 차단으로 인한 대기 중인 세션 체크 (중복 입금 방지!)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: waitingSessions } = await supabase
      .from('game_launch_sessions')
      .select('id, launch_url, ready_status, launched_at')
      .eq('user_id', userData.id)
      .eq('game_id', game.id)
      .eq('status', 'active')
      .in('ready_status', ['waiting', 'popup_blocked'])
      .gte('launched_at', fiveMinutesAgo.toISOString())
      .order('launched_at', { ascending: false })
      .limit(1);

    if (waitingSessions && waitingSessions.length > 0) {
      const waitingSession = waitingSessions[0];
      console.log(`♻️ 대기 중인 세션 발견 (팝업 차단 방지) - 재사용: session_id=${waitingSession.id}, ready_status=${waitingSession.ready_status}`);
      
      if (waitingSession.launch_url) {
        // 기존 세션의 launch_url 재사용 (중복 입금 방지!)
        return {
          success: true,
          launch_url: waitingSession.launch_url,
          game_url: waitingSession.launch_url,
          session_id: waitingSession.id,
          is_reused: true
        };
      }
    }

    // ⭐ 2. OroPlay 토큰 조회
    token = await oroplayApi.getToken(partnerId);

    if (!token) {
      console.error('❌ OroPlay 토큰 조회 실패');
      return {
        success: false,
        error: 'OroPlay 인증 토큰을 가져올 수 없습니다.'
      };
    }

    // ⭐ 3. 회원 생성 API 호출 (이미 존재하면 성공 처리)
    console.log(`👤 [회원 생성] OroPlay API 회원 생성 시작: ${username}`);
    try {
      await oroplayApi.createUser(token, username);
      // createUser는 성공 시 void 반환, 실패 시 throw
      console.log(`✅ [회원 생성] 회원 생성 완료 (또는 이미 존재)`);
    } catch (createError) {
      // errorCode 1 (이미 존재)는 createUser 내부에서 처리됨
      console.warn(`⚠️ [회원 생성] 오류 (계속 진행):`, createError);
    }

    // ⭐ 4. GMS 보유금을 API로 입금
    console.log(`💸 [입금] GMS → API 입금 시작: ${userBalance}원`);
    try {
      // ⚡ 입금 전 active 세션 체크 로직 제거 (generateGameLaunchUrl에서 이미 체크함)
      
      // 최신 잔고로 입금
      finalBalance = userData.balance || 0;
      const depositResult = await oroplayApi.depositBalance(token, username, finalBalance);

      if (depositResult.success) {
        console.log(`✅ [입금] API 입금 완료: ${finalBalance}원`);
      } else {
        console.error('❌ API 입금 실패:', depositResult.error);
        return {
          success: false,
          error: `입금 실패: ${depositResult.error}`
        };
      }
    } catch (depositError) {
      console.error('❌ 입금 중 오류 발생:', depositError);
      return {
        success: false,
        error: '입금 처리 중 오류가 발생했습니다.'
      };
    }

    // ⭐ 5. 게임 실행 URL 조회
    // ⚡ DB의 vendor_code를 그대로 사용 (Vendor 목록 조회 제거로 1초 단축!)
    let finalVendorCode = game.vendor_code; // casino-playace, slot-pragmatic 등
    let finalGameCode = game.game_code;
    
    console.log(`🔍 [OroPlay] 게임 실행 준비:`, {
      vendor_code: game.vendor_code,
      game_code: game.game_code
    });
    
    // ⭐ game_code가 'lobby'인 경우에만 게임 목록 조회 시도
    if (finalGameCode === 'lobby' || finalGameCode === 'Lobby') {
      console.log(`🔍 [OroPlay] 로비 게임 감지 - 게임 목록 조회 중...`);
      
      try {
        const gamesList = await oroplayApi.getGameList(token, finalVendorCode, 'ko');
        
        if (gamesList && gamesList.length > 0) {
          finalGameCode = gamesList[0].gameCode;
          console.log(`✅ [OroPlay] 첫 번째 게임 사용: ${finalGameCode} (${gamesList[0].gameName})`);
        } else {
          console.log('⚠️ [OroPlay] 게임 목록이 비어있음, 기본 lobby 사용');
          finalGameCode = 'lobby';
        }
      } catch (gameListError) {
        console.error('❌ [OroPlay] 게임 목록 조회 실패, 기본 lobby 사용:', gameListError);
        finalGameCode = 'lobby';
      }
    }
    
    const launchUrl = await oroplayApi.getLaunchUrl(
      token,
      finalVendorCode,
      finalGameCode,
      username,
      'ko'
    );

    if (launchUrl) {
      console.log(`✅ [게임 실행] URL 생성 완료`);
      
      // ✅ NOTE: 세션 생성은 generateGameLaunchUrl()에서 이미 처리됨
      // 여기서는 URL만 반환
      
      // ⭐ 7. GMS 보유금 차감은 generateGameLaunchUrl()에서 처리됨
      console.log(`✅ [게임 진입] 완료:`);
      console.log(`   - API 잔고: ${finalBalance}원 (GMS에서 이동)`);
      console.log(`   - GMS 잔고: 0원`);
      return {
        success: true,
        launch_url: launchUrl,
        game_url: launchUrl
      };
    }

    // 게임 실행 실패
    console.error('❌ 게임 실행 실패: 게임 URL을 받지 못했습니다');
    return {
      success: false,
      error: '게임 URL을 가져올 수 없습니다.'
    };

  } catch (error) {
    console.error('❌ ❌ OroPlay 게임 실행 오류:', error);
    console.error('📋 게임 정보:', {
      vendor_code: game.vendor_code,
      game_code: game.game_code,
      game_name: game.name
    });
    
    // ⚡⚡⚡ 타임아웃 발생 시 무조건 API 머니 회수!
    try {
      console.log('🔄 [에러 발생] API 머니 회수 시도...');
      
      // token이 없으면 다시 조회
      if (!token) {
        console.log('🔑 [에러 발생] 토큰 재조회 중...');
        token = await oroplayApi.getToken(partnerId);
      }
      
      if (!token) {
        console.error('❌ [에러 발생] 토큰 조회 실패 - API 머니 회수 불가');
        throw new Error('토큰 조회 실패');
      }
      
      const { data: userData } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', username)
        .single();
      
      if (userData) {
        // OroPlay API에서 전체 출금
        const withdrawResult = await oroplayApi.withdrawBalance(token, username);
        if (withdrawResult.success && withdrawResult.balance && withdrawResult.balance > 0) {
          console.log(`✅ [에러 발생] API 머니 회수 완료: ${withdrawResult.balance}원`);
          
          // GMS 잔고 복구
          await supabase
            .from('users')
            .update({ 
              balance: withdrawResult.balance,
              updated_at: new Date().toISOString()
            })
            .eq('id', userData.id);
          
          console.log(`✅ [에러 발생] GMS 잔고 복구 완료: ${withdrawResult.balance}원`);
        } else {
          console.log('ℹ️ [에러 발생] API 머니 없음 (회수 불필요)');
        }
      }
    } catch (recoverError) {
      console.error('❌ [에러 발생] API 머니 회수 실패:', recoverError);
      // 에러 발생해도 계속 진행 (원본 에러 메시지 반환)
    }
    
    // 에러 메시지 파싱
    let errorMessage = '게임 실행 중 오류가 발생했습니다.';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // errorCode 500인 경우 더 명확한 메시지 제공
      if (errorMessage.includes('errorCode 500')) {
        errorMessage = `게임 코드가 유효하지 않거나 API 서버 오류가 발생했습니다. (${game.vendor_code}/${game.game_code})`;
      }
      // 게임 공급사 점검 중
      else if (errorMessage.includes('errorCode 9')) {
        errorMessage = '게임 공급사가 점검 중입니다. 잠시 후 다시 시도해주세요.';
      }
      // 게임 점검 중
      else if (errorMessage.includes('errorCode 10')) {
        errorMessage = '게임이 점검 중입니다. 잠시 후 다시 시도해주세요.';
      }
      // Agent 잔고 부족
      else if (errorMessage.includes('errorCode 3')) {
        errorMessage = '시스템 점검 중입니다. 관리자에게 문의하세요.';
      }
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * FamilyAPI 게임 실행
 */
async function launchFamilyApiGame(
  partnerId: string,
  username: string,
  game: any
): Promise<{
  success: boolean;
  launch_url?: string;
  game_url?: string;
  error?: string;
}> {
  console.log('🎮 FamilyAPI 게임 실행:', {
    partnerId,
    username,
    vendorCode: game.vendor_code,
    gameCode: game.game_code
  });

  try {
    // ✅ FamilyAPI 활성화 체크
    const { checkApiActiveByPartnerId } = await import('./apiStatusChecker');
    const isFamilyApiActive = await checkApiActiveByPartnerId(partnerId, 'familyapi');
    
    if (!isFamilyApiActive) {
      console.error('❌ FamilyAPI가 비활성화되어 있습니다');
      return {
        success: false,
        error: 'FamilyAPI가 현재 비활성화되어 있습니다. 관리자에게 문의하세요.'
      };
    }
    
    // ⭐ 1. 사용자 DB 보유금 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, balance, referrer_id')
      .eq('username', username)
      .single();

    if (userError || !userData) {
      console.error('❌ 사용자 정보 조회 실패:', userError);
      return {
        success: false,
        error: '사용자 정보를 찾을 수 없습니다.'
      };
    }

    // 🚨🚨🚨 CRITICAL: 세션 종료 중인지 체크 (Race Condition 방지!)
    const lockKey = `${userData.id}_familyapi`;
    if (sessionEndingProcessing.has(lockKey)) {
      console.warn(`⏳ [게임 실행 대기] 세션 종료 처리 중... (최대 5초 대기)`);
      
      // ⚡ 최대 5초 동안 대기 (100ms 간격으로 체크)
      let waitCount = 0;
      while (sessionEndingProcessing.has(lockKey) && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      if (sessionEndingProcessing.has(lockKey)) {
        console.error('❌ [게임 실행 실패] 세션 종료 대기 시간 초과');
        return {
          success: false,
          error: '이전 게임 세션 종료 처리 중입니다. 잠시 후 다시 시도해주세요.'
        };
      }
      
      console.log(`✅ [게임 실행 대기 완료] 세션 종료 완료됨 (${waitCount * 100}ms)`);
      
      // ⚡ 세션 종료 후 최신 잔고 다시 조회!
      const { data: refreshedUser } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userData.id)
        .single();
      
      if (refreshedUser) {
        userData.balance = refreshedUser.balance;
        console.log(`💰 [게임 실행] 갱신된 보유금: ${refreshedUser.balance}원`);
      }
    }

    const userBalance = userData.balance || 0;
    let finalBalance = 0; // ⭐ 입금 후 실제 금액 (회수 후 업데이트될 수 있음)
    
    if (userBalance <= 0) {
      console.error('❌ 보유금 부족:', userBalance);
      return {
        success: false,
        error: '보유금이 부족합니다. 입금 후 이용해주세요.'
      };
    }

    console.log(`💰 [게임 시작] 사용자 GMS 보유금: ${userBalance}원`);

    // ⭐ 1-1. 팝업 차단으로 인한 대기 중인 세션 체크 (중복 입금 방지!)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: waitingSessions } = await supabase
      .from('game_launch_sessions')
      .select('id, launch_url, ready_status, launched_at')
      .eq('user_id', userData.id)
      .eq('game_id', game.id)
      .eq('status', 'active')
      .in('ready_status', ['waiting', 'popup_blocked'])
      .gte('launched_at', fiveMinutesAgo.toISOString())
      .order('launched_at', { ascending: false })
      .limit(1);

    if (waitingSessions && waitingSessions.length > 0) {
      const waitingSession = waitingSessions[0];
      console.log(`♻️ 대기 중인 세션 발견 (팝업 차단 방지) - 재사용: session_id=${waitingSession.id}, ready_status=${waitingSession.ready_status}`);
      
      if (waitingSession.launch_url) {
        // 기존 세션의 launch_url 재사용 (중복 입금 방지!)
        return {
          success: true,
          launch_url: waitingSession.launch_url,
          game_url: waitingSession.launch_url,
          session_id: waitingSession.id,
          is_reused: true
        };
      }
    }

    // ⭐ 2. FamilyAPI 설정 조회 (Lv1 partner_id 필요)
    const topLevelPartnerId = await getTopLevelPartnerId(userData.referrer_id);
    
    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('partner_id, api_key, balance')
      .eq('partner_id', topLevelPartnerId)
      .eq('api_provider', 'familyapi')
      .single();

    if (configError || !apiConfig?.api_key) {
      console.error('❌ FamilyAPI 설정 없음:', configError);
      return {
        success: false,
        error: 'FamilyAPI 설정을 찾을 수 없습니다.'
      };
    }

    // ⭐ 3. Lv2 파트너의 familyapi_balance 조회 (직접 부모 조회)
    const { data: directParent } = await supabase
      .from('partners')
      .select('id, level, familyapi_balance')
      .eq('id', userData.referrer_id)
      .single();

    const currentBalance = apiConfig.balance || 0;
    console.log(`📊 [FamilyAPI] 현재 API 보유금: ${currentBalance}원`);

    // ⭐ Lv2 파트너의 familyapi_balance 검증
    if (directParent?.level === 2) {
      const lv2Balance = directParent.familyapi_balance || 0;
      console.log(`📊 [Lv2] FamilyAPI 잔고: ${lv2Balance}원`);
      
      if (lv2Balance < userBalance) {
        console.error(`❌ Lv2 FamilyAPI 잔고 부족: ${lv2Balance} < ${userBalance}`);
        return {
          success: false,
          error: 'FamilyAPI 보유금이 부족합니다.'
        };
      }
    }

    // ✅ Seamless 방식: 잔고 검증만 수행 (차감하지 않음)
    console.log(`ℹ️ [Seamless Wallet] FamilyAPI는 callback으로 잔고를 실시간 관리합니다.`);
    console.log(`ℹ️ [Seamless] deposit API 생략 - 게임 진입 시 callback 자동 호출됨`);

    // ⭐ 4. FamilyAPI 게임 접속 인증 먼저 호출 (계정 생성 + 토큰 발급)
    let gameAuthResult;
    try {
      gameAuthResult = await familyApi.authGame(apiConfig.api_key, {
        userId: username,
        nickName: username,
        userIp: '1.2.3.4',
        balance: userBalance // ✅ Seamless: 실제 GMS 잔고 전달
      });

      if (!gameAuthResult.token) {
        throw new Error('게임 인증 토큰을 받지 못했습니다.');
      }

      console.log('✅ [게임 인증] api/auth 호출 성공, 계정 생성 및 토큰 발급 완료');
    } catch (authError) {
      console.error('❌ FamilyAPI 게임 인증 실패:', authError);
      return {
        success: false,
        error: `게임 인증 실패: ${authError instanceof Error ? authError.message : '알 수 없는 오류'}`
      };
    }

    // ✅ Seamless 방식: deposit API 호출 생략
    // callback이 호출되면 그때 잔고 증감 처리

    // ⭐ 5. 게임 실행 URL 조회 (api/play 호출 - 게임 인증 토큰 사용)
    const launchResult = await familyApi.playGame(apiConfig.api_key, gameAuthResult.token, {
      userId: username,
      vendorKey: game.vendor_code,
      gameKey: game.game_code,
      balance: userBalance,
      isMobile: 'N',
      userIp: '1.2.3.4' // 모든 API 호출에 고정 IP 사용
      // ⭐ callbackUrl 제거 - FamilyAPI는 사전 등록된 URL 사용
    });

    if (launchResult.gameurl) {
      console.log(`✅ [게임 실행] URL 생성 완료`);
      console.log(`ℹ️ [Seamless] 게임 진입 시 /balance callback이 자동 호출됩니다.`);
      
      // ✅ NOTE: 세션 생성은 generateGameLaunchUrl()에서 이미 처리됨
      // 여기서는 URL만 반환
      
      return {
        success: true,
        launch_url: launchResult.gameurl,
        game_url: launchResult.gameurl
      };
    }

    // ✅ Seamless 방식: 게임 URL 실패 시 원복 불필요 (deposit 안했으므로)
    console.error('❌ 게임 실행 실패: 게임 URL을 받지 못했습니다');
    return {
      success: false,
      error: '게임 URL을 가져올 수 없습니다.'
    };

  } catch (error) {
    console.error('❌ FamilyAPI 게임 실행 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '게임 실행 중 오류가 발생했습니다.'
    };
  }
}

/**
 * HonorAPI 게임 실행
 */
async function launchHonorApiGame(
  partnerId: string,
  username: string,
  game: any
): Promise<{
  success: boolean;
  launch_url?: string;
  game_url?: string;
  error?: string;
}> {
  console.log('🎮 HonorAPI 게임 실행:', {
    partnerId,
    username,
    gameId: game.id
  });

  try {
    // ✅ HonorAPI 활성화 체크
    const { checkApiActiveByPartnerId } = await import('./apiStatusChecker');
    const isHonorApiActive = await checkApiActiveByPartnerId(partnerId, 'honorapi');
    
    if (!isHonorApiActive) {
      console.error('❌ HonorAPI가 비활성화되어 있습니다');
      return {
        success: false,
        error: 'HonorAPI가 현재 비활성화되어 있습니다. 관리자에게 문의하세요.'
      };
    }
    
    // ⭐ 1. 사용자 DB 보유금 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, username, balance, referrer_id')
      .eq('username', username)
      .single();

    if (userError || !userData) {
      console.error('❌ 사용자 정보 조회 실패:', userError);
      return {
        success: false,
        error: '사용자 정보를 찾을 수 없습니다.'
      };
    }

    // 🚨🚨🚨 CRITICAL: 세션 종료 중인지 체크 (Race Condition 방지!)
    const lockKey = `${userData.id}_honorapi`;
    if (sessionEndingProcessing.has(lockKey)) {
      console.warn(`⏳ [게임 실행 대기] 세션 종료 처리 중... (최대 5초 대기)`);
      
      // ⚡ 최대 5초 동안 대기 (100ms 간격으로 체크)
      let waitCount = 0;
      while (sessionEndingProcessing.has(lockKey) && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      if (sessionEndingProcessing.has(lockKey)) {
        console.error('❌ [게임 실행 실패] 세션 종료 대기 시간 초과');
        return {
          success: false,
          error: '이전 게임 세션 종료 처리 중입니다. 잠시 후 다시 시도해주세요.'
        };
      }
      
      console.log(`✅ [게임 실행 대기 완료] 세션 종료 완료됨 (${waitCount * 100}ms)`);
      
      // ⚡ 세션 종료 후 최신 잔고 다시 조회!
      const { data: refreshedUser } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userData.id)
        .single();
      
      if (refreshedUser) {
        userData.balance = refreshedUser.balance;
        console.log(`💰 [게임 실행] 갱신된 보유금: ${refreshedUser.balance}원`);
      }
    }

    const userBalance = userData.balance || 0;
    let finalBalance = 0; // ⭐ 입금 후 실제 금액 (회수 후 업데이트될 수 있음)
    
    if (userBalance <= 0) {
      console.error('❌ 보유금 부족:', userBalance);
      return {
        success: false,
        error: '보유금이 부족합니다. 입금 후 이용해주세요.'
      };
    }

    console.log(`💰 [게임 시작] 사용자 GMS 보유금: ${userBalance}원`);

    // ⭐ 1-1. 팝업 차단으로 인한 대기 중인 세션 체크 (중복 입금 방지!)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: waitingSessions } = await supabase
      .from('game_launch_sessions')
      .select('id, launch_url, ready_status, launched_at')
      .eq('user_id', userData.id)
      .eq('game_id', game.id)
      .eq('status', 'active')
      .in('ready_status', ['waiting', 'popup_blocked'])
      .gte('launched_at', fiveMinutesAgo.toISOString())
      .order('launched_at', { ascending: false })
      .limit(1);

    if (waitingSessions && waitingSessions.length > 0) {
      const waitingSession = waitingSessions[0];
      console.log(`♻️ 대기 중인 세션 발견 (팝업 차단 방지) - 재사용: session_id=${waitingSession.id}, ready_status=${waitingSession.ready_status}`);
      
      if (waitingSession.launch_url) {
        // 기존 세션의 launch_url 재사용 (중복 입금 방지!)
        return {
          success: true,
          launch_url: waitingSession.launch_url,
          game_url: waitingSession.launch_url,
          session_id: waitingSession.id,
          is_reused: true
        };
      }
    }

    // ⭐ 2. HonorAPI 설정 조회 (Lv1 partner_id 필요)
    const topLevelPartnerId = await getTopLevelPartnerId(userData.referrer_id);
    
    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('partner_id, api_key, balance')
      .eq('partner_id', topLevelPartnerId)
      .eq('api_provider', 'honorapi')
      .single();

    if (configError || !apiConfig?.api_key) {
      console.error('❌ ❌ HonorAPI 설정 없음:', apiConfig?.api_key);
      return {
        success: false,
        error: 'HonorAPI 설정을 찾을 수 없습니다. 관리자에게 API Key 설정을 요청하세요.'
      };
    }

    const apiKey = apiConfig.api_key;
    console.log('✅ HonorAPI 설정 조회 완료');

    // 3. vendor_code 조회 (honor_game_providers 테이블에서)
    let vendorCode = game.vendor_code;
    
    if (!vendorCode && game.honor_game_providers?.vendor_code) {
      vendorCode = game.honor_game_providers.vendor_code;
    }
    
    if (!vendorCode && game.provider_id) {
      // provider_id로 조회
      const { data: providerData } = await supabase
        .from('honor_game_providers')
        .select('vendor_code')
        .eq('id', game.provider_id)
        .single();
      
      vendorCode = providerData?.vendor_code;
    }
    
    if (!vendorCode) {
      console.error('❌ vendor_code를 찾을 수 없습니다. 게임 데이터:', game);
      return {
        success: false,
        error: '게임 제공사 정보를 찾을 수 없습니다.'
      };
    }

    console.log(`✅ vendor_code 조회 완료: ${vendorCode}`);

    // ⭐ 4. Lv2 파트너의 honorapi_balance 조회 및 검증
    const { data: directParent } = await supabase
      .from('partners')
      .select('id, level, honorapi_balance')
      .eq('id', userData.referrer_id)
      .single();

    // ⭐ Lv2 파트너의 honorapi_balance 검증
    if (directParent?.level === 2) {
      const lv2Balance = directParent.honorapi_balance || 0;
      console.log(`📊 [Lv2] HonorAPI 잔고: ${lv2Balance}원`);
      
      if (lv2Balance < userBalance) {
        console.error(`❌ Lv2 잔고 부족: ${lv2Balance} < ${userBalance}`);
        
        // 관리자 알림 생성
        try {
          const { createAdminNotification } = await import('./notificationHelper');
          await createAdminNotification({
            user_id: userData.id,
            username: userData.username,
            user_login_id: username,
            partner_id: userData.referrer_id, // ✅ 사용자의 소속 관리자 ID
            message: '관리자에게 문의해주세요.',
            log_message: `Lv2 HonorAPI 잔고 부족: ${lv2Balance}원 < 사용자 보유금 ${userBalance}원`,
            notification_type: 'balance_insufficient'
          });
        } catch (notifError) {
          console.error('❌ 알림 생성 실패:', notifError);
        }
        
        return {
          success: false,
          error: '관리자에게 문의해주세요.'
        };
      }
    }

    // ⭐ 5. HonorAPI 게임 실행 플로우
    const honorApi = await import('./honorApi');
    
    try {
      // 5-1. 게임 실행 링크 조회 (자동 유저 생성 포함)
      console.log(`🎮 [게임 실행] 게임 링크 조회 시작: gameId=${game.id}, vendor=${vendorCode}`);
      
      const gameLaunchResult = await honorApi.getGameLaunchLink(
        apiKey,
        username,
        game.external_game_id || game.game_code || game.id.toString(),
        vendorCode
      );

      if (!gameLaunchResult.link) {
        console.error('❌ 게임 실행 링크 조회 실패');
        return {
          success: false,
          error: '게임 URL을 가져올 수 없습니다.'
        };
      }

      console.log(`✅ [게임 실행] URL 생성 완료, userCreated: ${gameLaunchResult.userCreated}`);

      // 5-2. 유저 머니 지급 (GMS 보유금을 HonorAPI로 전송)
      console.log(`💸 [입금] GMS → HonorAPI 유저 머니 지급 시작: ${userBalance}원`);
      
      const uuid = crypto.randomUUID(); // 멱등성 보장
      const addBalanceResult = await honorApi.addUserBalance(
        apiKey,
        username,
        userBalance,
        uuid
      );

      console.log(`✅ [입금] HonorAPI 유저 머니 지급 완료: ${addBalanceResult.balance}원, cached: ${addBalanceResult.cached}`);

      // ✅ NOTE: 세션 생성은 generateGameLaunchUrl()에서 이미 처리됨
      // 여기서는 URL만 반환
      
      // ⭐ GMS 보유금 차감은 generateGameLaunchUrl()에서 처리됨
      console.log(`✅ [게임 진입] 완료:`);
      console.log(`   - HonorAPI 잔고: ${addBalanceResult.balance}원 (GMS에서 이동)`);
      
      return {
        success: true,
        launch_url: gameLaunchResult.link,
        game_url: gameLaunchResult.link
      };

    } catch (error) {
      console.error('❌ HonorAPI 게임 실행 중 오류:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '게임 실행 중 오류가 발생했습니다.'
      };
    }

  } catch (error) {
    console.error('❌ HonorAPI 게임 실행 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '게임 실행 중 오류가 발생했습니다.'
    };
  }
}

/**
 * HonorAPI 게임 종료 및 잔고 회수
 * 게임 종료 시 HonorAPI 잔고를 GMS로 회수
 */
export async function endHonorApiGame(
  username: string
): Promise<{
  success: boolean;
  recovered_balance?: number;
  error?: string;
}> {
  console.log('🏁 HonorAPI 게임 종료 및 잔고 회수:', { username });

  try {
    // 1. 사용자 정보 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, referrer_id')
      .eq('username', username)
      .single();

    if (userError || !userData) {
      console.error('❌ 사용자 정보 조회 실패:', userError);
      return {
        success: false,
        error: '사용자 정보를 찾을 수 없습니다.'
      };
    }

    // 2. HonorAPI 설정 조회 (Lv1 partner_id 필요)
    const topLevelPartnerId = await getTopLevelPartnerId(userData.referrer_id);
    
    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('partner_id, api_key')
      .eq('partner_id', topLevelPartnerId)
      .eq('api_provider', 'honorapi')
      .single();

    if (configError || !apiConfig?.api_key) {
      console.error('❌ HonorAPI 설정 없음');
      return {
        success: false,
        error: 'HonorAPI 설정을 찾을 수 없습니다.'
      };
    }

    const apiKey = apiConfig.api_key;

    // 3. 유저 머니 전체 회수 (HonorAPI → GMS)
    const honorApi = await import('./honorApi');
    
    console.log(`💸 [출금] HonorAPI → GMS 유저 머니 회수 시작`);
    
    const uuid = crypto.randomUUID(); // 멱등성 보장
    const subBalanceResult = await honorApi.subUserBalanceAll(
      apiKey,
      username,
      uuid
    );

    const recoveredAmount = subBalanceResult.amount || 0;
    console.log(`✅ [출금] HonorAPI 유저 머니 회수 완료: ${recoveredAmount}원, cached: ${subBalanceResult.cached}`);

    // 4. GMS 보유금 업데이트 (HonorAPI에서 회수한 금액 추가)
    if (recoveredAmount > 0) {
      const { error: balanceUpdateError } = await supabase
        .from('users')
        .update({ 
          balance: recoveredAmount,
          updated_at: new Date().toISOString()
        })
        .eq('username', username);

      if (balanceUpdateError) {
        console.error('❌ GMS 보유금 업데이트 실패:', balanceUpdateError);
        return {
          success: false,
          error: 'GMS 보유금 업데이트 실패'
        };
      }

      console.log(`✅ GMS 보유금 업데이트: ${recoveredAmount}원`);
    } else {
      // 회수할 금액이 없어도 0원으로 업데이트
      await supabase
        .from('users')
        .update({ 
          balance: 0,
          updated_at: new Date().toISOString()
        })
        .eq('username', username);
      
      console.log(`✅ 회수 금액 없음, GMS 보유금: 0원`);
    }

    console.log(`✅ [게임 종료] 완료:`);
    console.log(`   - HonorAPI에서 회수: ${recoveredAmount}원`);
    console.log(`   - GMS 잔고: ${recoveredAmount}원`);
    
    return {
      success: true,
      recovered_balance: recoveredAmount
    };

  } catch (error) {
    console.error('❌ HonorAPI 게임 종료 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '게임 종료 중 오류가 발생했습니다.'
    };
  }
}

// ============================================
// 8. 게임 세션 관리
// ============================================

/**
 * 세션 종료 대기 (ending 상태가 ended로 바뀔 때까지 대기)
 * @returns true: 종료 완료, false: 타임아웃
 */
async function waitForSessionEnd(userId: string, maxWaitMs: number = 3000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 300; // 300ms마다 체크
  
  console.log('⏳ [세션 종료 대기] ending 상태 감지, 종료 완료까지 대기 시작...');
  
  while (Date.now() - startTime < maxWaitMs) {
    const { data } = await supabase
      .from('game_launch_sessions')
      .select('id, status, api_type')
      .eq('user_id', userId)
      .in('status', ['ending'])
      .maybeSingle();
    
    // ending 세션이 없으면 종료 완료
    if (!data) {
      const elapsed = Date.now() - startTime;
      console.log(`✅ [세션 종료 대기] 완료 (${elapsed}ms 소요)`);
      return true;
    }
    
    // 잠시 대기
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  // ⭐ 타임아웃 발생 시 강제로 ending 세션 종료 + API 머니 회수
  console.warn('⚠️ [세션 종료 대기] 타임아웃 (3초 초과) - 강제 종료 및 API 머니 회수 시작');
  
  const { data: endingSession } = await supabase
    .from('game_launch_sessions')
    .select('id, api_type')
    .eq('user_id', userId)
    .eq('status', 'ending')
    .maybeSingle();
  
  if (endingSession) {
    try {
      // 1. 세션을 ended로 강제 변경
      await supabase
        .from('game_launch_sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          error_message: '타임아웃으로 인한 강제 종료 (3초)'
        })
        .eq('id', endingSession.id);
      
      console.log('✅ [타임아웃 처리] ending 세션을 ended로 강제 변경:', endingSession.id);
      
      // 2. API 머니 회수
      await syncBalanceOnSessionEnd(userId, endingSession.api_type);
      console.log('✅ [타임아웃 처리] API 머니 회수 완료');
      
    } catch (error) {
      console.error('❌ [타임아웃 처리] 오류:', error);
    }
  }
  
  return false;
}

/**
 * 활성 게임 세션 체크
 */
export async function checkActiveSession(userId: string): Promise<{
  isActive: boolean;
  api_type?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi';
  game_name?: string;
  session_id?: number;
  game_id?: number;
  launch_url?: string;
  status?: 'active' | 'ending';
  ready_status?: 'waiting' | 'popup_opened' | 'popup_blocked';
} | null> {
  try {
    // ⭐ active 또는 ending 세션 체크 (ending은 종료 처리 중이므로 다른 게임 실행 차단!)
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
      .in('status', ['active', 'ending'])  // active 또는 ending 상태 모두 체크
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
      // games 테이블 먼저 조회
      let gameData = await supabase
        .from('games')
        .select('name')
        .eq('id', data.game_id)
        .maybeSingle()
        .then(res => res.data);
      
      // games에 없으면 honor_games에서 조회
      if (!gameData) {
        gameData = await supabase
          .from('honor_games')
          .select('name')
          .eq('id', data.game_id)
          .maybeSingle()
          .then(res => res.data);
      }
      
      if (gameData) {
        gameName = gameData.name;
      }
    }

    return {
      isActive: true,
      api_type: data.api_type as 'invest' | 'oroplay' | 'familyapi' | 'honorapi',
      game_name: gameName,
      session_id: data.id,
      game_id: data.game_id,
      launch_url: data.launch_url,
      status: data.status as 'active',
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
  try {
    // ⭐ 0. 중복 실행 방지: active 또는 ending 세션이 이미 있으면 즉시 리턴
    const { data: existingSession } = await supabase
      .from('game_launch_sessions')
      .select('id, status, game_id, api_type')
      .eq('user_id', userId)
      .in('status', ['active', 'ending'])
      .maybeSingle();
    
    if (existingSession) {
      console.log('🚫 [중복 실행 방지] 이미 실행 중이거나 종료 중인 세션이 있습니다:', {
        sessionId: existingSession.id,
        status: existingSession.status,
        gameId: existingSession.game_id,
        requestedGameId: gameId
      });
      
      // ending 상태면 대기 후 재시도
      if (existingSession.status === 'ending') {
        console.log('⏳ [게임 실행] 이전 세션 종료 처리 중... 대기 시작');
        const waitSuccess = await waitForSessionEnd(userId, 3000);
        
        if (!waitSuccess) {
          return {
            success: false,
            error: '이전 게임 종료 처리 중입니다. 잠시 후 다시 시도해주세요.'
          };
        }
        
        // 대기 완료 후 다시 한 번 체크
        const { data: recheckSession } = await supabase
          .from('game_launch_sessions')
          .select('id, status')
          .eq('user_id', userId)
          .in('status', ['active', 'ending'])
          .maybeSingle();
        
        if (recheckSession) {
          return {
            success: false,
            error: '게임 세션이 아직 활성화되어 있습니다. 잠시 후 다시 시도해주세요.'
          };
        }
      } else {
        // active 상태면 바로 리턴
        return {
          success: false,
          error: '이미 실행 중인 게임이 있습니다. 게임을 종료한 후 다시 시도해주세요.'
        };
      }
    }
    
    // ⭐ 2. 병렬 처리: 게임 정보 + 사용자 정보 동시 조회
    const [gameResult, userResult] = await Promise.all([
      // 게임 정보 조회
      (async () => {
        const { data: regularGame } = await supabase
          .from('games')
          .select('*, game_providers(name, type, api_type)')
          .eq('id', gameId)
          .maybeSingle();

        if (regularGame) return regularGame;

        const { data: honorGame } = await supabase
          .from('honor_games')
          .select('*, honor_game_providers(name, type, vendor_code)')
          .eq('id', gameId)
          .maybeSingle();

        return honorGame;
      })(),
      // 사용자 정보 조회
      supabase
        .from('users')
        .select('username, referrer_id, balance')
        .eq('id', userId)
        .single()
    ]);

    const game = gameResult;
    const { data: user, error: userError } = userResult;

    if (!game) {
      return { success: false, error: '게임 정보를 찾을 수 없습니다.' };
    }

    if (userError || !user) {
      return { success: false, error: '사용자 정보를 찾을 수 없습니다.' };
    }

    // ⭐ 병렬 처리 2: 최상위 파트너 조회
    const topLevelPartnerId = await getTopLevelPartnerId(user.referrer_id);
    
    if (!topLevelPartnerId) {
      return { success: false, error: '파트너 정보를 찾을 수 없습니다.' };
    }

    // API 설정 조회
    const apiProvider = game.api_type === 'invest' ? 'invest' : game.api_type === 'oroplay' ? 'oroplay' : game.api_type === 'honorapi' ? 'honorapi' : 'familyapi';
    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('opcode, client_id, client_secret, api_key')
      .eq('partner_id', topLevelPartnerId)
      .eq('api_provider', apiProvider)
      .single();

    if (configError || !apiConfig) {
      return { success: false, error: 'API 설정을 찾을 수 없습니다.' };
    }

    // API 타입별 credential 검증 (간소화)
    let opcode: string | null = null;
    
    if (game.api_type === 'invest') {
      opcode = apiConfig.opcode;
      if (!opcode) return { success: false, error: 'Invest API 설정이 완료되지 않았습니다.' };
    } else if (game.api_type === 'oroplay') {
      opcode = apiConfig.client_id;
      if (!opcode || !apiConfig.client_secret) return { success: false, error: 'OroPlay API 설정이 완료되지 않았습니다.' };
    } else if (game.api_type === 'familyapi') {
      if (!apiConfig.api_key) return { success: false, error: 'FamilyAPI 설정이 완료되지 않았습니다.' };
      opcode = null;
    } else if (game.api_type === 'honorapi') {
      if (!apiConfig.api_key) return { success: false, error: 'HonorAPI 설정이 완료되지 않았습니다.' };
      opcode = null;
    }

    // 5. 세션 ID 생성 (16자리 랜덤)
    const sessionId = Math.random().toString(36).substring(2, 18).padEnd(16, '0');

    // 6. 게임 세션 생성 (⭐ FINAL_FLOW: status='active'로 바로 시작)
    const sessionData: any = {
      user_id: userId,
      game_id: gameId,
      partner_id: topLevelPartnerId,
      session_id: sessionId,
      api_type: game.api_type,
      status: 'active',  // ⭐ 바로 active 상태로 시작 (ready 상태 제거)
      balance_before: user.balance || 0,  // 게임 시작 시 잔고 기록
      launched_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      opcode: opcode || ''  // ⭐ opcode NOT NULL 제약 조건 만족 (없으면 빈 문자열)
    };

    const { data: session, error: sessionError } = await supabase
      .from('game_launch_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (sessionError || !session) {
      console.error('❌ ❌ 세션 생성 실패:', sessionError);
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

      // ⭐ 활동 로그 기록: 게임 시작 실패
      try {
        await supabase.from('activity_logs').insert([{
          actor_type: 'system',
          actor_id: userId,
          action: 'game_start_failed',
          details: {
            username: user.username,
            gameName: game.name || '알 수 없음',
            gameId,
            apiType: game.api_type || game.vendor_code || '알 수 없음',
            errorMessage: launchResult.error || '게임 실행에 실패했습니다.'
          }
        }]);
      } catch (err) {
        console.error('❌ 활동 로그 기록 실패:', err);
      }

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

    // ⭐ 활동 로그 기록: 게임 시작 성공
    try {
      await supabase.from('activity_logs').insert([{
        actor_type: 'user',
        actor_id: userId,
        action: 'game_started',
        details: {
          username: user.username,
          gameName: game.name || '알 수 없음',
          gameId,
          apiType: game.api_type || game.vendor_code || '알 수 없음',
          sessionId: session.id,
          balanceBefore: user.balance
        }
      }]);
    } catch (err) {
      console.error('❌ 활동 로그 기록 실패:', err);
    }

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

// ============================================
// 8. 사용자 게임 접근 권한 확인
// ============================================

/**
 * 사용자가 접근 가능한 게임 타입 확인
 * @param userId - 사용자 ID
 * @returns 접근 가능한 게임 타입 배열 ['casino', 'slot', 'minigame']
 */
export async function getUserAccessibleGameTypes(userId: string): Promise<('casino' | 'slot' | 'minigame')[]> {
  try {
    // 1. 사용자의 partner_id 조회
    const { data: userData } = await supabase
      .from('users')
      .select('partner_id')
      .eq('id', userId)
      .maybeSingle();
    
    if (!userData?.partner_id) {
      console.warn('⚠️ [getUserAccessibleGameTypes] partner_id 없음');
      return [];
    }

    // 2. partner_game_access 조회
    const { data: gameAccess } = await supabase
      .from('partner_game_access')
      .select('api_provider, game_provider_id, game_id, access_type')
      .eq('partner_id', userData.partner_id);
    
    if (!gameAccess || gameAccess.length === 0) {
      console.warn('⚠️ [getUserAccessibleGameTypes] 게임 접근 권한 없음');
      return [];
    }

    // 3. 접근 가능한 제공사/게임의 타입 확인
    const accessibleTypes = new Set<'casino' | 'slot' | 'minigame'>();

    for (const access of gameAccess) {
      if (access.access_type === 'provider') {
        // 제공사 전체 접근 - 제공사 타입 조회
        const providerTableName = access.api_provider === 'honorapi' 
          ? 'honor_game_providers' 
          : 'game_providers';
        
        const { data: provider } = await supabase
          .from(providerTableName)
          .select('type')
          .eq('id', Number(access.game_provider_id))
          .eq('api_type', access.api_provider)
          .maybeSingle();
        
        if (provider?.type) {
          accessibleTypes.add(provider.type as 'casino' | 'slot' | 'minigame');
        }
      } else if (access.access_type === 'game' && access.game_id) {
        // 개별 게임 접근 - 게임 타입 조회
        const gameTableName = access.api_provider === 'honorapi' 
          ? 'honor_games' 
          : 'games';
        
        const { data: game } = await supabase
          .from(gameTableName)
          .select('type')
          .eq('id', Number(access.game_id))
          .maybeSingle();
        
        if (game?.type) {
          accessibleTypes.add(game.type as 'casino' | 'slot' | 'minigame');
        }
      }
    }

    const result = Array.from(accessibleTypes);
    console.log(`🎮 [getUserAccessibleGameTypes] 사용자 ${userId}: ${result.join(', ')}`);
    return result;
  } catch (error) {
    console.error('❌ [getUserAccessibleGameTypes] 오류:', error);
    return [];
  }
}

// Export all functions
export const gameApi = {
  // 제공사 관리
  syncAllProviders, // ✅ 통합 함수
  initializeInvestProviders,
  syncOroPlayProviders,
  syncFamilyApiProviders,
  syncHonorApiProviders,
  getProviders,
  getUserVisibleProviders,

  // 게임 동기화
  syncInvestGames,
  syncAllInvestGames,
  syncOroPlayGames,
  syncSpecificOroPlayProvider, // 🆕 특정 OroPlay 제공사만 동기화
  syncFamilyApiGames,
  syncHonorApiGames,

  // 게임 조회
  getGames,
  getUserVisibleGames,
  getUserAccessibleGameTypes, // 🆕 사용자 접근 가능 게임 타입 확인

  // 게임 상태 관리
  updateGameVisibility,
  updateGameStatus,
  bulkUpdateVisibility,
  bulkUpdateStatus,
  updateGameFeatured,

  // 제공사 상태 관리
  updateProviderVisibility,
  updateProviderStatus,
  
  // 🆕 Lv2+ 파트너 전용 게임 접근 관리 (partner_game_access)
  updatePartnerProviderAccess,
  updatePartnerGameAccess,
  updatePartnerApiAccess,
  getPartnerBlockedProviders,
  getPartnerBlockedGames,

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
  apiType: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
): Promise<void> {
  const lockKey = `${userId}_${apiType}`;
  
  // ⭐ 중복 호출 방지 체크
  if (sessionEndingProcessing.has(lockKey)) {
    console.warn(`⚠️ [세션 종료] 이미 처리 중: userId=${userId}, apiType=${apiType}`);
    return;
  }
  
  try {
    sessionEndingProcessing.add(lockKey);
    console.log(`🔄 [세션 종료 시작] userId=${userId}, apiType=${apiType}`);
    
    // 🚨 Step 0: 세션 상태를 즉시 'ending'으로 변경 (다른 게임 실행 차단!)
    const { error: endingError } = await supabase
      .from('game_launch_sessions')
      .update({
        status: 'ending', // 중간 상태로 변경
        last_activity_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('api_type', apiType) // ⭐ api_type 필터 추가 (다른 API 게임과 독립적으로 처리)
      .eq('status', 'active');

    if (endingError) {
      console.error('❌ [세션 종료] 상태 변경 실패 (ending):', endingError);
      // 실패해도 계속 진행 (최악의 경우 중복 실행 가능하지만, 돈 손실보다는 나음)
    } else {
      console.log('✅ [세션 종료] 상태를 ending으로 변경 완료 (다른 게임 실행 차단)');
    }
    
    // ⭐ 병렬 처리: 사용자 정보 + 잔고 + 최상위 파트너 조회 (동시 시작!)
    const [userResult, topLevelPartnerIdResult] = await Promise.all([
      supabase
        .from('users')
        .select('username, referrer_id, balance')
        .eq('id', userId)
        .single(),
      // referrer_id가 없어서 미리 조회 불가 → 사용자 조회 후 처리할 예정
      Promise.resolve(null)
    ]);

    const { data: user, error: userError } = userResult;

    if (userError || !user) {
      throw new Error(`사용자 정보 조회 실패: ${userError?.message || '사용자 없음'}`);
    }

    // 💾 함수 전체에서 사용할 현재 잔고 (반복 조회 방지!)
    let currentUserBalance = user.balance || 0;

    // ⭐ 병렬 처리: getTopLevelPartnerId (필수 항목)
    const topLevelPartnerId = await getTopLevelPartnerId(user.referrer_id);
    if (!topLevelPartnerId) {
      throw new Error('최상위 파트너 조회 실패');
    }

    const apiProvider = apiType === 'invest' ? 'invest' : apiType === 'oroplay' ? 'oroplay' : apiType === 'familyapi' ? 'familyapi' : 'honorapi';
    
    // 🚀 병렬 처리 PHASE 2: apiConfig 조회 + API별 잔고 조회 (가장 느린 부분!)
    const apiConfigPromise = supabase
      .from('api_configs')
      .select('*')
      .eq('partner_id', topLevelPartnerId)
      .eq('api_provider', apiProvider)
      .single();

    let apiBalancePromise: Promise<any> = Promise.resolve(null);

    if (apiType === 'oroplay') {
      // 🚀 OroPlay: 토큰 + 잔고 조회를 병렬로 시작!
      apiBalancePromise = (async () => {
        try {
          const token = await oroplayApi.getToken(topLevelPartnerId);
          if (!token) throw new Error('OroPlay 토큰 획득 실패');
          
          console.log(`🔍 [세션 종료] OroPlay 토큰 획득 완료 (병렬 처리)`);
          const balanceResult = await oroplayApi.getUserBalance(token, user.username);
          console.log(`🔍 [세션 종료] OroPlay getUserBalance 결과:`, balanceResult);
          
          if (typeof balanceResult === 'number') {
            return balanceResult;
          } else if (typeof balanceResult === 'object' && balanceResult !== null) {
            return (balanceResult as any).message || 0;
          }
          return 0;
        } catch (error) {
          console.error('❌ [세션 종료] OroPlay 잔고 조회 실패:', error);
          return 0;
        }
      })();
    } else if (apiType === 'honorapi') {
      // 🚀 HonorAPI: getUserInfo를 병렬로 시작하되, api_key는 apiConfig 완료 후 사용
      apiBalancePromise = (async () => {
        try {
          // apiConfig 먼저 완료 대기
          const { data: honorConfig, error: configErr } = await apiConfigPromise;
          if (configErr || !honorConfig?.api_key) {
            throw new Error('HonorAPI 설정 조회 실패');
          }
          
          const honorApi = await import('./honorApi');
          const userInfo = await honorApi.getUserInfo(honorConfig.api_key, user.username);
          console.log(`🔍 [세션 종료] HonorAPI 잔고 조회 결과: ${userInfo?.balance || 0}원 (병렬 처리됨)`);
          return userInfo?.balance || 0;
        } catch (error) {
          console.error('❌ [세션 종료] HonorAPI 잔고 조회 실패 (병렬):', error);
          return 0;
        }
      })();
    }

    // 병렬 대기: apiConfig + API 잔고
    const [configResult, apiBalance] = await Promise.all([
      apiConfigPromise,
      apiBalancePromise
    ]);

    const { data: apiConfig, error: configError } = configResult;

    if (configError || !apiConfig) {
      throw new Error(`API 설정 조회 실패: ${configError?.message || 'API 설정 없음'}`);
    }

    // 🎯 이 시점에서 이미 OroPlay/HonorAPI 잔고를 알고 있음!
    let currentBalance = apiBalance;
    
    // 🚀 성능 개선: OroPlay/HonorAPI의 경우, apiBalance 획득 직후 즉시 users.balance 업데이트!
    // 병렬 처리: 출금/회수 로직이 실행되는 동안 UI도 동시에 업데이트 가능
    //
    // 📊 개선 전:
    //   1. 상태 업데이트 → 2. apiBalance 조회 → 3. 회수/출금 → 4. users.balance 업데이트 (순차)
    //   총 시간: T1 + T2 + T3 + T4
    //
    // 📊 개선 후:
    //   1. 상태 업데이트 + 사용자 조회 + apiBalance 조회 (병렬)
    //   2. apiBalance 완료 → 즉시 users.balance 업데이트 (비동기)
    //   3. 동시에 회수/출금 로직 진행 (독립적)
    //   총 시간: max(T1, T2) + T3 ← 훨씬 빠름!
    
    if ((apiType === 'oroplay' || apiType === 'honorapi') && currentBalance > 0) {
      // 🎯 API에서 조회한 balance는 유저 보유금 전체 → 그대로 동기화!
      const newBalance = currentBalance; // 덧셈 NO! 조회된 값 그대로!
      
      // 📤 비동기 업데이트 시작 (메인 로직과 병렬로 진행)
      const updatePromise = supabase
        .from('users')
        .update({ 
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      // 업데이트 결과는 나중에 확인 (지금은 메인 로직 계속)
      updatePromise.then(({ error: updateError }) => {
        if (updateError) {
          console.error('❌ [세션 종료] users.balance 선행 업데이트 실패:', updateError);
        } else {
          console.log(`✅ [세션 종료] users.balance 동기화 완료: ${currentUserBalance}원 → ${newBalance}원 (API 조회값 그대로) - 병렬 처리됨`);
          // 메모리의 currentUserBalance도 업데이트
          currentUserBalance = newBalance;
        }
      }).catch(err => console.error('❌ [세션 종료] users.balance 업데이트 오류:', err));
    }
    
    // Invest/FamilyAPI의 경우 순차 처리 (네트워크 I/O 없음)
    if (apiType === 'invest') {
      const balanceResult = await investApi.getUserBalance(
        apiConfig.opcode,
        user.username,
        apiConfig.token,
        apiConfig.secret_key
      );
      
      if (balanceResult.success && balanceResult.balance !== undefined) {
        currentBalance = balanceResult.balance;
      }
    } else if (apiType === 'familyapi') {
      // ⭐ FamilyAPI는 개별 유저 잔고 조회를 지원하지 않음
      // 게임 세션 종료 시 사용자의 GMS 잔고를 그대로 사용
      currentBalance = currentUserBalance; // 이미 조회한 값 사용
    }
    // OroPlay/HonorAPI는 이미 병렬로 조회됨

    console.log(`💰 [세션 종료] API 보유금 조회 완료: ${currentBalance}원`);

    // 4. API 출금 처리 (각 API별로 다르게 처리)
    let finalBalance = 0; // 최종 반영할 잔고
    
    if (apiType === 'invest') {
      // ⭐ Invest API: 조회한 잔고가 0보다 크면 출금
      if (currentBalance > 0) {
        const withdrawResult = await investApi.withdrawBalance(
          apiConfig.opcode,
          user.username,
          apiConfig.token,
          currentBalance,
          apiConfig.secret_key
        );

        if (!withdrawResult.success) {
          console.error('❌ Invest API 출금 실패:', withdrawResult.error);
          
          // ⭐ 활동 로그 기록: API 출금 실패
          try {
            await supabase.from('activity_logs').insert([{
              actor_type: 'system',
              actor_id: userId,
              action: 'game_withdraw_failed',
              details: {
                username: user.username,
                apiType: 'invest',
                errorMessage: withdrawResult.error || '알 수 없는 오류',
                attemptedBalance: currentBalance
              }
            }]);
          } catch (err) {
            console.error('❌ 활동 로그 기록 실패:', err);
          }
          
          // ⚠️ 출금 실패 시 GMS 머니 증가하지 않음!
          throw new Error(`Invest API 출금 실패: ${withdrawResult.error}`);
        } else {
          console.log(`✅ [세션 종료] Invest API 출금 완료: ${currentBalance}원`);
          finalBalance = currentBalance; // ⚡ finalBalance 설정
          
          // 🚨 CRITICAL: users.balance 즉시 업데이트 (반복 조회 제거!)
          // ⚡ 이미 함수 시작 시 조회한 currentUserBalance를 사용!
          const newBalance = currentUserBalance + currentBalance;
          
          const { error: userBalanceError } = await supabase
            .from('users')
            .update({ 
              balance: newBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);

          if (userBalanceError) {
            console.error('❌ [세션 종료] users.balance 업데이트 실패:', userBalanceError);
          } else {
            console.log(`✅ [세션 종료] users.balance 증가: ${currentUserBalance - currentBalance}원 → ${newBalance}원 (+${currentBalance}원)`);
            
            // ⭐ 활동 로그 기록: 게임 종료 시 API 출금 + GMS 보유금 증가
            await logGameWithdraw(
              userId,
              user.username,
              apiType,
              currentBalance,
              currentUserBalance - currentBalance,
              newBalance
            ).catch(err => console.error('❌ 게임 출금 로그 실패:', err));
            
            // ⚡ 메모리의 currentUserBalance도 업데이트 (다른 API 케이스는 실행 안 됨)
            currentUserBalance = newBalance;
          }
          
          // 5. ⭐ api_configs.balance 업데이트 (통합 컬럼 사용)
          const { error: balanceError } = await supabase
            .from('api_configs')
            .update({
              balance: (apiConfig.balance || 0) + currentBalance,
              updated_at: new Date().toISOString()
            })
            .eq('partner_id', topLevelPartnerId)
            .eq('api_provider', 'invest');

          if (balanceError) {
            console.error('❌ Invest API 잔고 업데이트 실패:', balanceError);
          } else {
            console.log(`✅ [세션 종료] api_configs.balance 업데이트 완료`);
          }
        }
      } else {
        console.log(`ℹ️ [세션 종료] Invest API 잔고 0원 - 출금 생략`);
        finalBalance = 0;
      }
    } else if (apiType === 'oroplay') {
      // ⭐ OroPlay API: 조회 결과와 관계없이 무조건 출금 시도 (API가 실제 잔고 반환)
      console.log(`💸 [세션 종료] OroPlay 전체 출금 시작 - userId=${userId}, username=${user.username}`);
      const token = await oroplayApi.getToken(topLevelPartnerId);
      if (token) {
        console.log(`✅ [세션 종료] OroPlay 토큰 획득 완료: ${token.substring(0, 20)}...`);
        // ⭐ withdrawBalance의 세 번째 인자는 vendorCode (선택 사항)
        const withdrawResult = await oroplayApi.withdrawBalance(
          token,
          user.username,
          undefined  // vendorCode는 전체 출금이므로 undefined
        );
        
        console.log(`🔍 [세션 종료] OroPlay withdrawBalance 결과:`, withdrawResult);

        if (!withdrawResult.success) {
          console.error('❌ OroPlay API 출금 실패:', withdrawResult.error);
          
          // ⭐ 활동 로그 기록: API 출금 실패
          try {
            await supabase.from('activity_logs').insert([{
              actor_type: 'system',
              actor_id: userId,
              action: 'game_withdraw_failed',
              details: {
                username: user.username,
                apiType: 'oroplay',
                errorMessage: withdrawResult.error || '알 수 없는 오류',
                attemptedBalance: 0
              }
            }]);
          } catch (err) {
            console.error('❌ 활동 로그 기록 실패:', err);
          }
          
          // ⚠️ 출금 실패 시에도 세션은 종료 (돈 손실 방지)
          console.warn('⚠️ [세션 종료] OroPlay API 출금 실패했지만 세션은 종료합니다.');
          finalBalance = 0;
        } else {
          // ⭐ OroPlay API 응답 파싱: balance가 객체일 수 있음
          let withdrawnAmount = 0;
          if (typeof withdrawResult.balance === 'number') {
            withdrawnAmount = withdrawResult.balance;
          } else if (withdrawResult.balance && typeof withdrawResult.balance === 'object') {
            // balance가 { message: number } 형태인 경우
            withdrawnAmount = (withdrawResult.balance as any).message || 0;
          }
          
          console.log(`✅ [세션 종료] OroPlay API 출금 완료: ${withdrawnAmount}원`);
          
          // 🚨 CRITICAL: 비정상적인 출금 금액 검증 (음수만 체크)
          if (withdrawnAmount < 0) {
            console.error(`❌ [세션 종료] OroPlay 출금 금액이 음수: ${withdrawnAmount}원`);
            finalBalance = 0;
          } else {
            finalBalance = withdrawnAmount; // 실제 출금된 금액으로 업데이트
            
            // 🚨 CRITICAL: users.balance 즉시 업데이트 (반복 조회 제거!)
            // ⚡ 이미 함수 시작 시 조회한 currentUserBalance를 사용!
            const newBalance = currentUserBalance + finalBalance;
            
            const { error: userBalanceError } = await supabase
              .from('users')
              .update({ 
                balance: newBalance,
                updated_at: new Date().toISOString()
              })
              .eq('id', userId);

            if (userBalanceError) {
              console.error('❌ [세션 종료] users.balance 업데이트 실패:', userBalanceError);
            } else {
              console.log(`✅ [세션 종료] users.balance 증가: ${currentUserBalance}원 → ${newBalance}원 (+${finalBalance}원)`);
              // ⚡ 메모리의 currentUserBalance도 업데이트 (다른 API 케이스는 실행 안 됨)
              currentUserBalance = newBalance;
            }
            
            // 5. ⭐ api_configs.balance 업데이트 (통합 컬럼 사용)
            const { error: balanceError } = await supabase
              .from('api_configs')
              .update({
                balance: (apiConfig.balance || 0) + withdrawnAmount,
                updated_at: new Date().toISOString()
              })
              .eq('partner_id', topLevelPartnerId)
              .eq('api_provider', 'oroplay');

            if (balanceError) {
              console.error('❌ OroPlay API 잔고 업데이트 실패:', balanceError);
            } else {
              console.log(`✅ [세션 종료] api_configs.balance 업데이트 완료: +${withdrawnAmount}원`);
            }
          }
        }
      } else {
        console.error('❌ [세션 종료] OroPlay 토큰 획득 실패 - 출금 불가');
        finalBalance = 0;
      }
    } else if (apiType === 'familyapi') {
      // ✅ Seamless 방식: withdrawal API 호출 생략
      // callback을 통해 실시간으로 잔고가 관리되므로, 게임 종료 시 별도 처리 불필요
      console.log('ℹ️ [FamilyAPI Seamless] 게임 종료 - withdrawal 호출 생략');
      console.log('ℹ️ [FamilyAPI Seamless] 잔고는 callback을 통해 실시간으로 관리되었습니다.');
      finalBalance = 0; // FamilyAPI는 이미 callback으로 처리됨
    } else if (apiType === 'honorapi') {
      // ✅ HonorAPI: 게임 종료 시 잔고 회수 (무조건 실행)
      console.log(`💸 [세션 종료] HonorAPI 전체 회수 시작`);
      const honorApi = await import('./honorApi');
      
      const uuid = crypto.randomUUID(); // 멱등성 보장
      const subBalanceResult = await honorApi.subUserBalanceAll(
        apiConfig.api_key,
        user.username,
        uuid
      );

      const recoveredAmount = subBalanceResult.amount || 0;
      console.log(`✅ [세션 종료] HonorAPI 유저 머니 회수 완료: ${recoveredAmount}원, cached: ${subBalanceResult.cached}`);
      
      // ⭐ 회수된 금액을 그대로 사용 (음수일 리 없음 - API가 실제 회수한 양수 금액)
      finalBalance = Math.abs(recoveredAmount); // 절대값으로 보장
      
      // 🚨 CRITICAL: users.balance 증가 (반복 조회 제거!)
      // ⚡ 이미 함수 시작 시 조회한 currentUserBalance를 사용!
      const newBalance = currentUserBalance + finalBalance;
      
      const { error: userBalanceError } = await supabase
        .from('users')
        .update({ 
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (userBalanceError) {
        console.error('❌ [세션 종료] users.balance 업데이트 실패:', userBalanceError);
      } else {
        console.log(`✅ [세션 종료] users.balance 증가: ${currentUserBalance}원 → ${newBalance}원 (+${finalBalance}원)`);
        // ⚡ 메모리의 currentUserBalance도 업데이트 (다른 API 케이스는 실행 안 됨)
        currentUserBalance = newBalance;
      }
      
      // ⭐ api_configs.balance 업데이트 (회수한 금액을 GMS 머니로 반환)
      if (recoveredAmount > 0) {
        const { error: balanceError } = await supabase
          .from('api_configs')
          .update({
            balance: (apiConfig.balance || 0) + recoveredAmount,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', topLevelPartnerId)
          .eq('api_provider', 'honorapi');

        if (balanceError) {
          console.error('❌ HonorAPI 잔고 업데이트 실패:', balanceError);
        } else {
          console.log(`✅ [세션 종료] api_configs.balance 업데이트 완료: +${recoveredAmount}원`);
        }
      }
    }

    // ⚠️ 최종 잔고 음수 방지 (모든 API 처리 후 재확인)
    // ⚠️ 단, 이미 API에서 회수한 금액은 양수이므로, 여기서는 로그만 남기고 그대로 사용
    if (finalBalance < 0) {
      console.error(`⚠️ [세션 종료] 최종 잔고가 음수입니다! finalBalance=${finalBalance}원`);
      console.error(`   - userId: ${userId}, username: ${user.username}, apiType: ${apiType}`);
      
      // ⚠️ API가 음수를 반환하는 경우는 비정상이므로, 절대값으로 보정
      const correctedBalance = Math.abs(finalBalance);
      console.error(`   - API에서 회수한 금액을 절대값으로 보정: ${correctedBalance}원`);
      
      // 관리자 알림을 위한 로그 기록
      try {
        await supabase.from('activity_logs').insert([{
          actor_type: 'system',
          actor_id: userId,
          action: 'negative_final_balance_detected',
          details: {
            username: user.username,
            apiType,
            detectedBalance: finalBalance,
            correctedBalance: correctedBalance
          }
        }]);
      } catch (err) {
        console.error('활동 로그 기록 실패:', err);
      }
      
      finalBalance = correctedBalance;
    }

    // 7. 세션 종료 상태 전환 (ending → ended)
    console.log(`🔄 [세션 종료] 세션 상태를 ended로 변경 시작: userId=${userId}, apiType=${apiType}`);
    const { error: sessionError } = await supabase
      .from('game_launch_sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('api_type', apiType) // ⭐ api_type 필터 추가 (다른 API 게임과 독립적으로 처리)
      .eq('status', 'ending'); // ending 상태인 세션을 ended로 변경

    if (sessionError) {
      console.error('❌ 세션 종료 처리 실패:', sessionError);
    } else {
      console.log(`✅ [세션 종료] 세션 상태를 ended로 변경 완료: userId=${userId}, apiType=${apiType}`);
      // ⭐ 활동 로그 기록: 세션 종료 성공
      try {
        await supabase.from('activity_logs').insert([{
          actor_type: 'system',
          actor_id: userId,
          action: 'game_session_ended',
          details: {
            username: user.username,
            apiType,
            withdrawnAmount: finalBalance,
            sessionStatus: 'ended'
          }
        }]);
      } catch (err) {
        console.error('❌ 활동 로그 기록 실패:', err);
      }
    }

    console.log(`✅ 세션 종료 완료: user=${user.username}, balance=${currentBalance}`);
  } catch (error) {
    console.error('❌ syncBalanceOnSessionEnd 실패:', error);
    
    // ⚠️ 에러 발생 시에도 세션을 'ended'로 변경 (다음 게임 실행 가능하도록!)
    try {
      await supabase
        .from('game_launch_sessions')
        .update({
          status: 'ended',  // ⭐ error가 아닌 ended로 변경!
          ended_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : String(error),
          last_activity_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('api_type', apiType)
        .in('status', ['active', 'ending']); // active 또는 ending 상태를 ended로 변경
      
      console.log('✅ [세션 종료 실패] 세션 상태를 ended로 변경 완료 (다음 게임 실행 가능)');
      
      // ⭐ 활동 로그 기록: 세션 종료 실패
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('username')
          .eq('id', userId)
          .single();
        
        await supabase.from('activity_logs').insert([{
          actor_type: 'system',
          actor_id: userId,
          action: 'game_session_end_failed',
          details: {
            username: userData?.username || '알 수 없음',
            apiType,
            errorMessage: error instanceof Error ? error.message : String(error),
            sessionStatus: 'error'
          }
        }]);
      } catch (err) {
        console.error('❌ 활동 로그 기록 실패:', err);
      }
      
    } catch (updateError) {
      console.error('❌ [세션 종료 실패] 세션 상태 업데이트 실패:', updateError);
    }
    
    throw error;
  } finally {
    // ⭐ 처리 완료 후 락 해제
    const lockKey = `${userId}_${apiType}`;
    sessionEndingProcessing.delete(lockKey);
    console.log(`🔓 [세션 종료] 락 해제: ${lockKey}`);
  }
}

/**
 * ready 세션에서 보유금 동기화 (출금 페이지 진입 시)
 */
export async function syncUserBalance(
  userId: string,
  apiType: 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
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

    // ⭐ api_provider 필터 추가
    const apiProvider = apiType === 'invest' ? 'invest' : apiType === 'oroplay' ? 'oroplay' : apiType === 'familyapi' ? 'familyapi' : 'honorapi';
    const { data: apiConfig, error: configError } = await supabase
      .from('api_configs')
      .select('*')
      .eq('partner_id', topLevelPartnerId)
      .eq('api_provider', apiProvider)
      .single();

    if (configError || !apiConfig) {
      throw new Error('API 설정 조회 실패');
    }

    // 3. API에서 보유금 조회
    let currentBalance = 0;
    
    if (apiType === 'invest') {
      const balanceResult = await investApi.getUserBalance(
        apiConfig.opcode,
        user.username,
        apiConfig.token,
        apiConfig.secret_key
      );
      
      if (balanceResult.success && balanceResult.balance !== undefined) {
        currentBalance = balanceResult.balance;
      }
    } else if (apiType === 'oroplay') {
      // ⭐ OroPlay API 보유금 조회
      const token = await oroplayApi.getToken(topLevelPartnerId);
      if (token) {
        const balanceResult = await oroplayApi.getUserBalance(token, user.username);
        // ⭐ getUserBalance 결과가 숫자인지 확인
        if (typeof balanceResult === 'number') {
          currentBalance = balanceResult;
        } else if (typeof balanceResult === 'object' && balanceResult !== null) {
          // ⭐ 객체인 경우 message 속성 추출
          currentBalance = (balanceResult as any).message || 0;
        } else {
          currentBalance = 0;
        }
        console.log(`🔍 [출금 페이지] OroPlay 잔고 조회 결과:`, { balanceResult, currentBalance });
      }
    } else if (apiType === 'familyapi') {
      // ⭐ FamilyAPI는 개별 유저 잔고 조회를 지원하지 않음
      // 현재 사용자의 GMS 잔고를 그대로 사용
      const { data: userData } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userId)
        .single();
      
      currentBalance = userData?.balance || 0;
    } else if (apiType === 'honorapi') {
      // ⭐ HonorAPI: getUserInfo로 잔고 조회
      const honorApi = await import('./honorApi');
      
      try {
        const userInfo = await honorApi.getUserInfo(apiConfig.api_key, user.username);
        currentBalance = userInfo.balance || 0;
        console.log(`🔍 [출금 페이지] HonorAPI 잔고 조회 결과: ${currentBalance}원`);
      } catch (error) {
        console.error('❌ [출금 페이지] HonorAPI 잔고 조회 실패:', error);
        // 조회 실패 시 GMS 잔고 사용
        const { data: userData } = await supabase
          .from('users')
          .select('balance')
          .eq('id', userId)
          .single();
        
        currentBalance = userData?.balance || 0;
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
      console.error('❌ [출금 페이지] users.balance 업데이트 실패:', updateError);
      console.error('   - userId:', userId);
      console.error('   - currentBalance:', currentBalance);
      console.error('   - error details:', JSON.stringify(updateError));
      throw new Error(`보유금 업데이트 실패: ${updateError.message}`);
    }

    console.log(`✅ [출금 페이지] 보유금 동기화 완료: user=${user.username}, balance=${currentBalance}`);
    return currentBalance;
  } catch (error) {
    console.error('❌ syncUserBalance 실패:', error);
    throw error;
  }
}