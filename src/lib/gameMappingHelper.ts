/**
 * 게임 코드 매핑 헬퍼 모듈
 * game_id, provider_id를 실제 게임명/제공사명으로 변환
 */

import { supabase } from './supabase';

/**
 * 게임 ID로 게임 정보 조회
 */
export async function getGameInfo(gameId: number) {
  // 1. games 테이블 조회
  const { data: gameData } = await supabase
    .from('games')
    .select('id, name, name_ko, game_code, provider_id, game_type, api_type')
    .eq('id', gameId)
    .maybeSingle();

  if (gameData) {
    return {
      id: gameData.id,
      name: gameData.name_ko || gameData.name,
      gameCode: gameData.game_code,
      providerId: gameData.provider_id,
      gameType: gameData.game_type,
      apiType: gameData.api_type
    };
  }

  // 2. games 테이블에 없으면 honor_games 테이블 조회
  const { data: honorGameData } = await supabase
    .from('honor_games')
    .select('id, name, name_ko, game_code, provider_id, type, api_type')
    .eq('id', gameId)
    .maybeSingle();

  if (honorGameData) {
    return {
      id: honorGameData.id,
      name: honorGameData.name_ko || honorGameData.name,
      gameCode: honorGameData.game_code,
      providerId: honorGameData.provider_id,
      gameType: honorGameData.type,
      apiType: honorGameData.api_type || 'honorapi'
    };
  }

  return null;
}

/**
 * 제공사 ID로 제공사 정보 조회
 */
export async function getProviderInfo(providerId: number) {
  // 1. game_providers 테이블 조회
  const { data: providerData } = await supabase
    .from('game_providers')
    .select('id, name, name_ko, vendor_code')
    .eq('id', providerId)
    .maybeSingle();

  if (providerData) {
    return {
      id: providerData.id,
      name: providerData.name_ko || providerData.name,
      vendorCode: providerData.vendor_code
    };
  }

  // 2. game_providers에 없으면 honor_game_providers 테이블 조회
  const { data: honorProviderData } = await supabase
    .from('honor_game_providers')
    .select('id, name, name_ko, vendor_code')
    .eq('id', providerId)
    .maybeSingle();

  if (honorProviderData) {
    return {
      id: honorProviderData.id,
      name: honorProviderData.name_ko || honorProviderData.name,
      vendorCode: honorProviderData.vendor_code
    };
  }

  return null;
}

/**
 * 게임 ID와 제공사 ID로 게임명/제공사명 조회
 * @param gameId 게임 ID
 * @param providerId 제공사 ID
 * @returns 게임명, 제공사명
 */
export async function getGameAndProviderNames(gameId: number | null, providerId: number | null) {
  let gameName: string | null = null;
  let providerName: string | null = null;
  let gameType: string | null = null;

  // 게임 정보 조회
  if (gameId) {
    const gameInfo = await getGameInfo(gameId);
    if (gameInfo) {
      gameName = gameInfo.name;
      gameType = gameInfo.gameType;
    }
  }

  // 제공사 정보 조회
  if (providerId) {
    const providerInfo = await getProviderInfo(providerId);
    if (providerInfo) {
      providerName = providerInfo.name;
    }
  }

  return { gameName, providerName, gameType };
}

/**
 * 여러 게임/제공사 정보를 한 번에 조회 (배치 최적화)
 */
export async function getBatchGameAndProviderInfo(
  records: Array<{ gameId?: number | null; providerId?: number | null }>
) {
  const gameIds = new Set<number>();
  const providerIds = new Set<number>();

  // 고유 ID 수집
  records.forEach(r => {
    if (r.gameId) gameIds.add(r.gameId);
    if (r.providerId) providerIds.add(r.providerId);
  });

  const gameMap = new Map<number, { name: string; type: string }>();
  const providerMap = new Map<number, string>();

  // 게임 정보 배치 조회
  if (gameIds.size > 0) {
    const { data: games } = await supabase
      .from('games')
      .select('id, name, name_ko, game_type')
      .in('id', Array.from(gameIds));

    const { data: honorGames } = await supabase
      .from('honor_games')
      .select('id, name, name_ko, type')
      .in('id', Array.from(gameIds));

    games?.forEach(g => {
      gameMap.set(g.id, { name: g.name_ko || g.name, type: g.game_type });
    });
    honorGames?.forEach(g => {
      if (!gameMap.has(g.id)) {
        gameMap.set(g.id, { name: g.name_ko || g.name, type: g.type });
      }
    });
  }

  // 제공사 정보 배치 조회
  if (providerIds.size > 0) {
    const { data: providers } = await supabase
      .from('game_providers')
      .select('id, name, name_ko')
      .in('id', Array.from(providerIds));

    const { data: honorProviders } = await supabase
      .from('honor_game_providers')
      .select('id, name, name_ko')
      .in('id', Array.from(providerIds));

    providers?.forEach(p => {
      providerMap.set(p.id, p.name_ko || p.name);
    });
    honorProviders?.forEach(p => {
      if (!providerMap.has(p.id)) {
        providerMap.set(p.id, p.name_ko || p.name);
      }
    });
  }

  return { gameMap, providerMap };
}
