/**
 * 게임 기록 자동 동기화 모듈
 * - Invest, OroPlay, FamilyAPI의 게임 기록을 주기적으로 동기화
 */

import { supabase } from './supabase';

// 동기화 타이머 저장
let syncTimers: { [key: string]: number } = {};

// 마지막 동기화 시간 (밀리초)
const lastSyncTime: { [key: string]: number } = {
  invest: 0,
  oroplay: 0,
  familyapi: 0
};

// 동기화 간격 (밀리초)
const SYNC_INTERVALS = {
  invest: 30000,     // 30초
  oroplay: 30000,    // 30초
  familyapi: 3600000 // 1시간
};

/**
 * 특정 API의 게임 기록 동기화
 */
async function syncApiGameRecords(apiType: 'invest' | 'oroplay' | 'familyapi', partnerId: string) {
  try {
    console.log(`[${new Date().toISOString()}] ${apiType} 게임 기록 동기화 시작`);

    // Supabase Edge Function 호출
    const { data, error } = await supabase.functions.invoke('sync-game-records', {
      body: { 
        api_type: apiType,
        partner_id: partnerId
      }
    });

    if (error) {
      console.error(`[${apiType}] 동기화 실패:`, error);
      return;
    }

    console.log(`[${new Date().toISOString()}] ${apiType} 동기화 완료:`, data);
    lastSyncTime[apiType] = Date.now();

  } catch (error) {
    console.error(`[${apiType}] 동기화 오류:`, error);
  }
}

/**
 * Invest API 동기화 시작 (30초 간격)
 */
function startInvestSync(partnerId: string) {
  // 즉시 한번 실행
  syncApiGameRecords('invest', partnerId);
  
  // 30초마다 반복 실행
  syncTimers.invest = window.setInterval(() => {
    syncApiGameRecords('invest', partnerId);
  }, SYNC_INTERVALS.invest);

  console.log('✅ Invest API 동기화 시작 (30초 간격)');
}

/**
 * OroPlay API 동기화 시작 (30초 간격)
 */
function startOroPlaySync(partnerId: string) {
  // 즉시 한번 실행
  syncApiGameRecords('oroplay', partnerId);
  
  // 30초마다 반복 실행
  syncTimers.oroplay = window.setInterval(() => {
    syncApiGameRecords('oroplay', partnerId);
  }, SYNC_INTERVALS.oroplay);

  console.log('✅ OroPlay API 동기화 시작 (30초 간격)');
}

/**
 * FamilyAPI 동기화 시작 (1시간 간격)
 */
function startFamilyApiSync(partnerId: string) {
  // 즉시 한번 실행
  syncApiGameRecords('familyapi', partnerId);
  
  // 1시간마다 반복 실행
  syncTimers.familyapi = window.setInterval(() => {
    syncApiGameRecords('familyapi', partnerId);
  }, SYNC_INTERVALS.familyapi);

  console.log('✅ FamilyAPI 동기화 시작 (1시간 간격)');
}

/**
 * 모든 API 동기화 시작
 */
export function startGameRecordsSync(partnerId: string) {
  // 이미 실행 중이면 무시
  if (Object.keys(syncTimers).length > 0) {
    console.warn('⚠️ 게임 기록 동기화가 이미 실행 중입니다.');
    return;
  }

  console.log('🚀 게임 기록 자동 동기화 시작...');

  // 활성화된 API 확인 후 각각 시작
  checkActiveApis(partnerId).then(activeApis => {
    if (activeApis.includes('invest')) {
      startInvestSync(partnerId);
    }
    if (activeApis.includes('oroplay')) {
      startOroPlaySync(partnerId);
    }
    if (activeApis.includes('familyapi')) {
      startFamilyApiSync(partnerId);
    }
  });
}

/**
 * 모든 API 동기화 중지
 */
export function stopGameRecordsSync() {
  console.log('🛑 게임 기록 자동 동기화 중지...');

  Object.entries(syncTimers).forEach(([apiType, timerId]) => {
    window.clearInterval(timerId);
    console.log(`✅ ${apiType} 동기화 중지됨`);
  });

  syncTimers = {};
}

/**
 * 활성화된 API 목록 조회
 */
async function checkActiveApis(partnerId: string): Promise<string[]> {
  try {
    const { data: apiConfigs, error } = await supabase
      .from('api_configs')
      .select('api_provider')
      .eq('is_active', true)
      .eq('partner_id', partnerId);

    if (error) {
      console.error('활성화된 API 조회 실패:', error);
      return [];
    }

    const activeApis = apiConfigs?.map(config => config.api_provider) || [];
    console.log('활성화된 API:', activeApis);
    
    return activeApis;

  } catch (error) {
    console.error('API 설정 조회 오류:', error);
    return [];
  }
}

/**
 * 동기화 상태 조회
 */
export function getGameRecordsSyncStatus() {
  const isRunning = Object.keys(syncTimers).length > 0;
  
  return {
    isRunning,
    activeApis: Object.keys(syncTimers),
    lastSyncTime: { ...lastSyncTime },
    intervals: { ...SYNC_INTERVALS }
  };
}

/**
 * 수동으로 특정 API 동기화 실행
 */
export async function manualSyncGameRecords(apiType: 'invest' | 'oroplay' | 'familyapi', partnerId: string) {
  console.log(`🔄 수동 동기화 실행: ${apiType}`);
  await syncApiGameRecords(apiType, partnerId);
}