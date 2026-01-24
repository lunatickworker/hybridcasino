import { supabase } from '../lib/supabase';

// 시스템 타임존 캐시 (초기값: UTC+9)
let cachedTimezoneOffset: number = 9;
let lastFetchTime: number = 0;
const CACHE_DURATION = 60000; // 1분

/**
 * 시스템 타임존 오프셋 가져오기 (캐싱)
 * @returns UTC 기준 시간 오프셋 (예: 9 = UTC+9)
 */
export async function getSystemTimezoneOffset(): Promise<number> {
  const now = Date.now();
  
  // 캐시가 유효하면 캐시된 값 반환
  if (now - lastFetchTime < CACHE_DURATION) {
    return cachedTimezoneOffset;
  }

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'timezone_offset')
      .maybeSingle();

    if (!error && data) {
      cachedTimezoneOffset = parseInt(data.setting_value) || 9;
      lastFetchTime = now;
      console.log(`🌍 [Timezone] 시스템 타임존 로드: UTC${cachedTimezoneOffset >= 0 ? '+' : ''}${cachedTimezoneOffset}`);
    }
  } catch (error) {
    console.error('❌ [Timezone] 타임존 설정 로드 실패:', error);
  }

  return cachedTimezoneOffset;
}

/**
 * 캐시된 타임존 오프셋 즉시 반환 (비동기 없음)
 */
export function getCachedTimezoneOffset(): number {
  return cachedTimezoneOffset;
}

/**
 * 타임존 캐시 강제 갱신
 */
export async function refreshTimezoneCache(): Promise<number> {
  lastFetchTime = 0; // 캐시 무효화
  return await getSystemTimezoneOffset();
}

/**
 * UTC 시간을 시스템 타임존으로 변환
 * @param utcDate UTC 날짜/시간
 * @param offset 타임존 오프셋 (선택사항, 없으면 시스템 설정 사용)
 */
export function convertUTCToSystemTime(utcDate: Date, offset?: number): Date {
  const timezoneOffset = offset ?? cachedTimezoneOffset;
  return new Date(utcDate.getTime() + (timezoneOffset * 3600000));
}

/**
 * 시스템 타임존 시간을 UTC로 변환
 * @param localDate 로컬 날짜/시간
 * @param offset 타임존 오프셋 (선택사항, 없으면 시스템 설정 사용)
 */
export function convertSystemTimeToUTC(localDate: Date, offset?: number): Date {
  const timezoneOffset = offset ?? cachedTimezoneOffset;
  return new Date(localDate.getTime() - (timezoneOffset * 3600000));
}

/**
 * ISO 문자열을 시스템 타임존으로 포맷팅
 * @param isoString ISO 8601 날짜 문자열
 * @param format 포맷 타입 ('datetime' | 'date' | 'time')
 */
export function formatSystemTime(isoString: string, format: 'datetime' | 'date' | 'time' = 'datetime'): string {
  const utcDate = new Date(isoString);
  const localDate = convertUTCToSystemTime(utcDate);

  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const hours = String(localDate.getUTCHours()).padStart(2, '0');
  const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(localDate.getUTCSeconds()).padStart(2, '0');

  if (format === 'date') {
    return `${year}-${month}-${day}`;
  } else if (format === 'time') {
    return `${hours}:${minutes}:${seconds}`;
  } else {
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

/**
 * datetime-local input 형식으로 변환 (YYYY-MM-DDTHH:mm)
 */
export function toDateTimeLocalFormat(isoString: string): string {
  const utcDate = new Date(isoString);
  const localDate = convertUTCToSystemTime(utcDate);

  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const hours = String(localDate.getUTCHours()).padStart(2, '0');
  const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * datetime-local input 값을 UTC ISO 문자열로 변환
 */
export function fromDateTimeLocalFormat(dateTimeLocal: string): string {
  // "2025-12-09T15:30" 형식
  const offset = cachedTimezoneOffset * 60; // 분 단위
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const minutes = String(absOffset % 60).padStart(2, '0');
  
  return `${dateTimeLocal}:00${sign}${hours}:${minutes}`;
}

/**
 * 오늘 0시 (시스템 타임존 기준) UTC ISO 문자열
 */
export function getTodayStartUTC(): string {
  const now = new Date();
  const localNow = convertUTCToSystemTime(now);
  
  // 시스템 타임존 기준 오늘 0시 (로컬 시간 - 단순히 연, 월, 일만 추출)
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();
  const day = localNow.getUTCDate();
  
  const todayStartLocal = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  
  // 로컬 시간을 UTC로 변환 (오프셋 역으로 적용)
  const offset = cachedTimezoneOffset * 60 * 60 * 1000;
  const utcTodayStart = new Date(todayStartLocal.getTime() - offset);
  console.log(`🌍 [getTodayStartUTC] localNow=${localNow.toISOString()}, result=${utcTodayStart.toISOString()}`);
  return utcTodayStart.toISOString();
}

/**
 * 내일 0시 (시스템 타임존 기준) UTC ISO 문자열
 */
export function getTomorrowStartUTC(): string {
  const now = new Date();
  const localNow = convertUTCToSystemTime(now);
  
  // 시스템 타임존 기준 내일 0시 (로컬 시간 - 단순히 연, 월, 일만 추출)
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();
  const day = localNow.getUTCDate() + 1;  // 내일로 설정
  
  const tomorrowStartLocal = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  
  // 로컬 시간을 UTC로 변환 (오프셋 역으로 적용)
  const offset = cachedTimezoneOffset * 60 * 60 * 1000;
  const utcTomorrowStart = new Date(tomorrowStartLocal.getTime() - offset);
  console.log(`🌍 [getTomorrowStartUTC] localNow=${localNow.toISOString()}, result=${utcTomorrowStart.toISOString()}`);
  return utcTomorrowStart.toISOString();
}

/**
 * 정산 리셋 시간 계산 (시스템 타임존 기준 다음 오전 6시)
 */
export function getNextSettlementResetTime(): Date {
  const now = new Date();
  const localNow = convertUTCToSystemTime(now);
  
  // 시스템 타임존 기준 오늘 오전 6시
  let resetTime = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    6, 0, 0, 0
  ));
  
  // 현재 시간이 이미 오전 6시를 넘었다면 내일 오전 6시
  if (localNow.getUTCHours() >= 6) {
    resetTime = new Date(resetTime.getTime() + 86400000); // +1일
  }
  
  // UTC로 다시 변환
  return convertSystemTimeToUTC(resetTime);
}

// 앱 시작 시 타임존 설정 로드
if (typeof window !== 'undefined') {
  getSystemTimezoneOffset().catch(console.error);
}
