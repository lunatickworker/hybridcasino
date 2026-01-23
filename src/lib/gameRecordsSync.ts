/**
 * 게임 기록 자동 동기화 모듈
 * - Invest, OroPlay, FamilyAPI, HonorAPI의 게임 기록을 주기적으로 동기화
 */

import { supabase } from './supabase';

// 동기화 타이머 저장
let syncTimers: { [key: string]: number } = {};

// 마지막 동기화 시간 (밀리초)
const lastSyncTime: { [key: string]: number } = {
  invest: 0,
  oroplay: 0,
  familyapi: 0,
  honor: 0
};

// 동기화 간격 (밀리초)
const SYNC_INTERVALS = {
  invest: 30000,    // 30초
  oroplay: 3000,    // 3초
  familyapi: 4000,  // 4초
  honor: 34000      // 34초
};

/**
 * 특정 API의 게임 기록 동기화
 */
async function syncApiGameRecords(apiType: 'invest' | 'oroplay' | 'familyapi' | 'honor', partnerId: string) {
  try {
    console.log(`🔄 [${new Date().toISOString()}] ${apiType.toUpperCase()} 게임 기록 동기화 요청 중...`);

    // server 폴더 내 Edge Function 호출 - 경로는 /sync/{endpoint}로 처리됨
    const endpointMap: { [key: string]: string } = {
      'invest': 'server',
      'oroplay': 'server',
      'familyapi': 'server',
      'honor': 'server'
    };

    const functionName = endpointMap[apiType];
    if (!functionName) {
      console.error(`❌ [${apiType.toUpperCase()}] 알 수 없는 API 타입`);
      return;
    }

    // Supabase Edge Function 호출 - server/index.ts에서 경로별로 처리
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { 
        api_type: apiType,
        partner_id: partnerId
      }
    });

    if (error) {
      console.error(`❌ [${apiType.toUpperCase()}] 동기화 실패:`, error);
      console.error(`   Error details:`, JSON.stringify(error, null, 2));
      return;
    }

    console.log(`✅ [${new Date().toISOString()}] ${apiType.toUpperCase()} 동기화 완료:`, data);
    lastSyncTime[apiType] = Date.now();

  } catch (error) {
    console.error(`❌ [${apiType.toUpperCase()}] 동기화 오류:`, error);
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
 * OroPlay API 동기화 시작 (4초 간격)
 */
function startOroPlaySync(partnerId: string) {
  // 즉시 한번 실행
  syncApiGameRecords('oroplay', partnerId);
  
  // 4초마다 반복 실행
  syncTimers.oroplay = window.setInterval(() => {
    syncApiGameRecords('oroplay', partnerId);
  }, SYNC_INTERVALS.oroplay);

  console.log('✅ OroPlay API 동기화 시작 (4초 간격)');
}

/**
 * FamilyAPI 동기화 시작 (4초 간격)
 */
function startFamilyApiSync(partnerId: string) {
  // 즉시 한번 실행
  syncApiGameRecords('familyapi', partnerId);
  
  // 4초마다 반복 실행
  syncTimers.familyapi = window.setInterval(() => {
    syncApiGameRecords('familyapi', partnerId);
  }, SYNC_INTERVALS.familyapi);

  console.log('✅ FamilyAPI 동기화 시작 (4초 간격)');
}

/**
 * HonorAPI 동기화 시작 (34초 간격)
 */
function startHonorSync(partnerId: string) {
  // 즉시 한번 실행
  syncApiGameRecords('honor', partnerId);
  
  // 34초마다 반복 실행
  syncTimers.honor = window.setInterval(() => {
    syncApiGameRecords('honor', partnerId);
  }, SYNC_INTERVALS.honor);

  console.log('✅ HonorAPI 동기화 시작 (34초 간격)');
}
export function startGameRecordsSync(partnerId: string) {
  // 이미 실행 중이면 무시
  if (Object.keys(syncTimers).length > 0) {
    console.warn('⚠️ 게임 기록 동기화가 이미 실행 중입니다.');
    return;
  }

  console.log('🚀 게임 기록 자동 동기화 시작... (OroPlay + HonorAPI)');

  // OroPlay와 HonorAPI만 동기화
  startOroPlaySync(partnerId);
  startHonorSync(partnerId);
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
    console.log(`🔍 [checkActiveApis] partnerId=${partnerId}에서 활성화된 API 조회 중...`);
    
    const { data: apiConfigs, error } = await supabase
      .from('api_configs')
      .select('api_provider')
      .eq('is_active', true)
      .eq('partner_id', partnerId);

    if (error) {
      console.error(`❌ [checkActiveApis] 활성화된 API 조회 실패:`, error);
      console.error(`   SQL Error:`, JSON.stringify(error, null, 2));
      return [];
    }

    const activeApis = apiConfigs?.map(config => config.api_provider) || [];
    console.log(`✅ [checkActiveApis] 활성화된 API 목록:`, activeApis);
    console.log(`   - 총 ${activeApis.length}개의 API 활성화됨`);
    
    return activeApis;

  } catch (error) {
    console.error(`❌ [checkActiveApis] API 설정 조회 오류:`, error);
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