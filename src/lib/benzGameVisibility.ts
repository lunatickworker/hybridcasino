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
  console.log('🎯 [filterVisibleProviders] 시작:', {
    providers_count: providers.length,
    userId: userId
  });

  // userId가 없으면 기본 필터링만 (status='visible')
  if (!userId) {
    console.log('⚠️ [filterVisibleProviders] userId 없음 - 기본 필터링만');
    return providers.filter(p => p.status === 'visible');
  }

  // 1. 사용자 정보 조회
  const user = await getUserInfo(userId);
  if (!user) {
    console.log('❌ [filterVisibleProviders] 사용자 정보 없음');
    return [];
  }

  console.log('👤 [filterVisibleProviders] 사용자 정보:', {
    user_id: user.id,
    username: user.username,
    referrer_id: user.referrer_id
  });

  // 2. 매장(partner_id)이 없으면 빈 목록 반환
  if (!user.referrer_id) {
    console.log('❌ [filterVisibleProviders] referrer_id 없음');
    return [];
  }

  // 3. 매장 차단 설정 + 사용자 차단 설정 조회
  const [storeBlocked, userBlocked] = await Promise.all([
    getStoreBlockedItems(user.referrer_id),
    getUserBlockedItems(userId)
  ]);

  console.log('🔍 [filterVisibleProviders] 차단 설정:', {
    storeBlocked_count: storeBlocked.length,
    userBlocked_count: userBlocked.length,
    storeBlocked: storeBlocked,
    userBlocked: userBlocked
  });

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