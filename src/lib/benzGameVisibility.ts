/**
 * 🎮 벤츠 사용자 페이지 게임 노출 로직
 * 
 * **핵심 원칙:**
 * 1. 매장(partner_id) 차단 + 사용자(user_id) 차단을 모두 확인
 * 2. 둘 중 하나라도 차단이면 → 노출 안 함
 * 3. partner_game_access에서 is_allowed=false인 레코드가 있으면 차단
 * 4. 레코드가 없으면 → 허용 (블랙리스트 방식)
 */

import { supabase } from './supabase';
import type { GameProvider, Game } from './gameApi';

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 사용자 정보 조회 (referrer_id = 매장 partner_id)
 */
async function getUserInfo(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, referrer_id, username')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * 매장의 차단 설정 조회 (partner_game_access에서 partner_id 기반)
 */
async function getStoreBlockedItems(partnerId: string) {
  const { data, error } = await supabase
    .from('partner_game_access')
    .select('*')
    .eq('partner_id', partnerId)
    .is('user_id', null) // 매장 레벨 설정 (user_id가 NULL)
    .or('is_allowed.eq.false,game_status.eq.maintenance'); // 차단 또는 점검중

  if (error) {
    return [];
  }

  return data || [];
}

/**
 * 사용자의 차단 설정 조회 (partner_game_access에서 user_id 기반)
 */
async function getUserBlockedItems(userId: string) {
  const { data, error } = await supabase
    .from('partner_game_access')
    .select('*')
    .eq('user_id', userId)
    .is('partner_id', null) // 사용자 레벨 설정 (partner_id가 NULL)
    .or('is_allowed.eq.false,game_status.eq.maintenance'); // 차단 또는 점검중

  if (error) {
    return [];
  }

  return data || [];
}

/**
 * 제공사가 차단되었는지 확인
 */
function isProviderBlocked(
  provider: GameProvider,
  blockedItems: any[]
): boolean {
  // API 전체 차단 확인
  const apiBlocked = blockedItems.some(
    item =>
      item.access_type === 'api' &&
      item.api_provider === provider.api_type
  );

  if (apiBlocked) {
    return true;
  }

  // 제공사 개별 차단 확인
  const providerBlocked = blockedItems.some(
    item =>
      item.access_type === 'provider' &&
      item.api_provider === provider.api_type &&
      String(item.game_provider_id) === String(provider.id)
  );

  if (providerBlocked) {
    return true;
  }

  return false;
}

/**
 * 🆕 제공사가 점검중인지 확인 (해당 제공사의 모든 게임이 점검중이면 true)
 */
async function isProviderMaintenance(
  provider: GameProvider,
  storeBlocked: any[],
  userBlocked: any[]
): Promise<boolean> {
  // 1. 제공사에 속한 모든 게임 조회 (통합된 게임사의 경우 모든 provider_id 확인)
  const providerIds = (provider as any).provider_ids || [provider.id];
  let allGames: any[] = [];

  for (const providerId of providerIds) {
    const { data, error } = await supabase
      .from(provider.api_type === 'honorapi' ? 'honor_games' : 'games')
      .select('id, provider_id, api_type')
      .eq('provider_id', providerId);

    if (!error && data) {
      allGames = [...allGames, ...data];
    }
  }

  if (allGames.length === 0) {
    return false; // 게임이 없으면 점검중 아님
  }

  const allBlockedItems = [...storeBlocked, ...userBlocked];

  // 2. 모든 게임이 maintenance 상태인지 확인
  const allMaintenance = allGames.every(game => {
    const isMaintenance = allBlockedItems.some(
      item =>
        item.access_type === 'game' &&
        item.game_status === 'maintenance' &&
        item.api_provider === (game.api_type || provider.api_type) &&
        (item.game_provider_id === null || String(item.game_provider_id) === String(game.provider_id)) &&
        String(item.game_id) === String(game.id)
    );
    
    return isMaintenance;
  });

  if (allMaintenance) {
    return true;
  }

  return false;
}

/**
 * 🆕 게임이 점검중인지 확인
 */
function isGameMaintenance(
  game: Game,
  blockedItems: any[]
): boolean {
  const maintenanceGame = blockedItems.some(
    item =>
      item.access_type === 'game' &&
      item.game_status === 'maintenance' &&
      item.api_provider === game.api_type &&
      (item.game_provider_id === null || String(item.game_provider_id) === String(game.provider_id)) &&
      String(item.game_id) === String(game.id)
  );

  return maintenanceGame;
}

/**
 * 게임이 차단되었는지 확인
 */
function isGameBlocked(
  game: Game,
  blockedItems: any[]
): boolean {
  // 🆕 game_status='maintenance'인 레코드는 차단이 아니라 점검중이므로 제외
  const actuallyBlockedItems = blockedItems.filter(item => item.game_status !== 'maintenance');

  // API 전체 차단 확인
  const apiBlocked = actuallyBlockedItems.some(
    item =>
      item.access_type === 'api' &&
      item.api_provider === game.api_type
  );

  if (apiBlocked) {
    return true;
  }

  // 제공사 전체 차단 확인
  const providerBlocked = actuallyBlockedItems.some(
    item =>
      item.access_type === 'provider' &&
      item.api_provider === game.api_type &&
      String(item.game_provider_id) === String(game.provider_id)
  );

  if (providerBlocked) {
    return true;
  }

  // 게임 개별 차단 확인
  const gameBlocked = actuallyBlockedItems.some(
    item =>
      item.access_type === 'game' &&
      item.api_provider === game.api_type &&
      String(item.game_provider_id) === String(game.provider_id) &&
      String(item.game_id) === String(game.id)
  );

  if (gameBlocked) {
    return true;
  }

  return false;
}

// ============================================
// 메인 노출 로직
// ============================================

/**
 * 🎯 사용자에게 노출할 제공사 필터링
 * 
 * @param providers - 전체 제공사 목록
 * @param userId - 사용자 ID
 * @returns 노출 가능한 제공사 목록
 */
export async function filterVisibleProviders(
  providers: GameProvider[],
  userId: string | null
): Promise<GameProvider[]> {
  // userId가 없으면 기본 필터링만 (status='visible')
  if (!userId) {
    return providers.filter(p => p.status === 'visible');
  }

  // 1. 사용자 정보 조회
  const user = await getUserInfo(userId);
  if (!user) {
    return [];
  }

  // 2. 매장(partner_id)이 없으면 빈 목록 반환
  if (!user.referrer_id) {
    return [];
  }

  // 3. 매장 차단 설정 + 사용자 차단 설정 조회
  const [storeBlocked, userBlocked] = await Promise.all([
    getStoreBlockedItems(user.referrer_id),
    getUserBlockedItems(userId)
  ]);

  // 4. 제공사 필터링 + 점검중 상태 추가
  const filteredProvidersPromises = providers.map(async provider => {
    // 기본 조건: status='visible' AND is_visible=true가 아니면 필터링
    if (provider.status !== 'visible' || provider.is_visible !== true) {
      return null;
    }

    // 매장 차단 확인
    if (isProviderBlocked(provider, storeBlocked)) {
      return null;
    }

    // 사용자 차단 확인
    if (isProviderBlocked(provider, userBlocked)) {
      return null;
    }

    // 🆕 Lv1의 game_visible='maintenance' 체크 (최우선)
    if (provider.game_visible === 'maintenance') {
      return {
        ...provider,
        status: 'maintenance' as const
      };
    }

    // 🆕 제공사의 모든 게임이 점검중이면 status를 'maintenance'로 설정
    const isMaintenance = await isProviderMaintenance(provider, storeBlocked, userBlocked);
    if (isMaintenance) {
      return {
        ...provider,
        status: 'maintenance' as const
      };
    }

    // 모든 조건 통과
    return provider;
  });

  const filteredProviders = (await Promise.all(filteredProvidersPromises))
    .filter((p): p is GameProvider => p !== null);

  return filteredProviders;
}

/**
 * 🎯 사용자에게 노출할 게임 필터링
 * 
 * @param games - 전체 게임 목록
 * @param userId - 사용자 ID
 * @returns 노출 가능한 게임 목록
 */
export async function filterVisibleGames(
  games: Game[],
  userId: string | null
): Promise<Game[]> {
  // userId가 없으면 기본 필터링만 (status='visible')
  if (!userId) {
    return games.filter(g => g.status === 'visible');
  }

  // 1. 사용자 정보 조회
  const user = await getUserInfo(userId);
  if (!user) {
    return [];
  }

  // 2. 매장(partner_id)이 없으면 빈 목록 반환
  if (!user.referrer_id) {
    return [];
  }

  // 3. 매장 차단 설정 + 사용자 차단 설정 조회
  const [storeBlocked, userBlocked] = await Promise.all([
    getStoreBlockedItems(user.referrer_id),
    getUserBlockedItems(userId)
  ]);

  // 4. 게임 필터링
  const filteredGames = games.map(game => {
    // 기본 조건: status='visible' AND is_visible=true
    if (game.status !== 'visible' || game.is_visible !== true) {
      return null;
    }

    // 🆕 점검중 체크를 먼저! (점검중이면 화면에 표시)
    if (isGameMaintenance(game, userBlocked) || isGameMaintenance(game, storeBlocked)) {
      return {
        ...game,
        status: 'maintenance' as const
      };
    }

    // 매장 차단 확인 (점검중이 아닌 경우만)
    if (isGameBlocked(game, storeBlocked)) {
      return null;
    }

    // 사용자 차단 확인 (점검중이 아닌 경우만)
    if (isGameBlocked(game, userBlocked)) {
      return null;
    }

    // 모든 조건 통과
    return game;
  }).filter((g): g is Game => g !== null);

  return filteredGames;
}