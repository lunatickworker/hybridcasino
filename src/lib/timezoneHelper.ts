import { supabase } from './supabase';

/**
 * 파트너별 타임존 오프셋 캐시
 */
const timezoneCache = new Map<string, number>();

/**
 * 파트너의 타임존 오프셋 조회 (Lv1은 system_settings, Lv2+는 partners 테이블)
 * @param partnerId - 파트너 ID
 * @param partnerLevel - 파트너 레벨
 * @returns 타임존 오프셋 (UTC 기준 시간)
 */
export async function getPartnerTimezoneOffset(partnerId: string, partnerLevel: number): Promise<number> {
  // 캐시 확인
  const cacheKey = `${partnerId}_${partnerLevel}`;
  if (timezoneCache.has(cacheKey)) {
    return timezoneCache.get(cacheKey)!;
  }

  try {
    let offset = 9; // 기본값: UTC+9

    if (partnerLevel === 1) {
      // Lv1 시스템관리자는 system_settings에서 조회
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'timezone_offset')
        .maybeSingle();

      if (!error && data) {
        offset = parseInt(data.setting_value);
      }
    } else {
      // Lv2+ 파트너는 partners 테이블에서 조회
      const { data, error } = await supabase
        .from('partners')
        .select('timezone_offset')
        .eq('id', partnerId)
        .maybeSingle();

      if (!error && data && data.timezone_offset !== null) {
        offset = data.timezone_offset;
      } else {
        // 파트너에 설정이 없으면 system_settings 기본값 사용
        const { data: systemData, error: systemError } = await supabase
          .from('system_settings')
          .select('setting_value')
          .eq('setting_key', 'timezone_offset')
          .maybeSingle();

        if (!systemError && systemData) {
          offset = parseInt(systemData.setting_value);
        }
      }
    }

    // 캐시 저장
    timezoneCache.set(cacheKey, offset);
    return offset;
  } catch (err) {
    console.error('❌ [Timezone] 오프셋 조회 실패:', err);
    return 9; // 기본값: UTC+9
  }
}

/**
 * 파트너 타임존 기준 현재 시간을 로컬 포맷으로 반환
 * @param partnerId - 파트너 ID
 * @param partnerLevel - 파트너 레벨
 * @returns 포맷된 시간 문자열 (예: "2025. 11. 23. 오전 3:55:01")
 */
export async function getCurrentTimeFormatted(partnerId: string, partnerLevel: number): Promise<string> {
  const offset = await getPartnerTimezoneOffset(partnerId, partnerLevel);
  const now = new Date();
  const offsetMs = offset * 60 * 60 * 1000;
  
  // 파트너 타임존 기준 현재 시각
  const partnerDate = new Date(now.getTime() + offsetMs);
  
  // UTC 기준으로 년/월/일/시/분/초 추출
  const year = partnerDate.getUTCFullYear();
  const month = partnerDate.getUTCMonth();
  const day = partnerDate.getUTCDate();
  const hours = partnerDate.getUTCHours();
  const minutes = partnerDate.getUTCMinutes();
  const seconds = partnerDate.getUTCSeconds();
  
  // 로컬 Date 객체 생성하여 toLocaleString 사용
  const localDate = new Date(year, month, day, hours, minutes, seconds);
  
  return localDate.toLocaleString('ko-KR');
}

/**
 * 파트너 타임존 기준 "오늘" 시작 시각 (ISO string)
 * @param partnerId - 파트너 ID
 * @param partnerLevel - 파트너 레벨
 * @returns ISO 형식의 오늘 시작 시각 (UTC 기준)
 */
export async function getTodayStartISO(partnerId: string, partnerLevel: number): Promise<string> {
  const offset = await getPartnerTimezoneOffset(partnerId, partnerLevel);
  const now = new Date();
  const offsetMs = offset * 60 * 60 * 1000;
  
  // 파트너 타임존 기준 현재 시각
  const partnerDate = new Date(now.getTime() + offsetMs);
  
  // 오늘 00:00:00 (UTC 기준으로 계산)
  const todayStart = new Date(
    Date.UTC(
      partnerDate.getUTCFullYear(),
      partnerDate.getUTCMonth(),
      partnerDate.getUTCDate(),
      0, 0, 0, 0
    )
  );
  
  // UTC 기준으로 역변환
  return new Date(todayStart.getTime() - offsetMs).toISOString();
}

/**
 * 파트너 타임존 기준 날짜 범위 계산
 * @param partnerId - 파트너 ID
 * @param partnerLevel - 파트너 레벨
 * @param filter - 날짜 필터 ('today' | 'yesterday' | 'week' | 'month')
 * @returns 시작 및 종료 ISO 문자열
 */
export async function getDateRange(
  partnerId: string,
  partnerLevel: number,
  filter: 'today' | 'yesterday' | 'week' | 'month'
): Promise<{ start: string; end: string }> {
  const offset = await getPartnerTimezoneOffset(partnerId, partnerLevel);
  const now = new Date();
  const offsetMs = offset * 60 * 60 * 1000;
  const partnerDate = new Date(now.getTime() + offsetMs);
  
  const today = new Date(
    Date.UTC(
      partnerDate.getUTCFullYear(),
      partnerDate.getUTCMonth(),
      partnerDate.getUTCDate(),
      0, 0, 0, 0
    )
  );
  
  switch (filter) {
    case 'today':
      return {
        start: new Date(today.getTime() - offsetMs).toISOString(),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - offsetMs).toISOString()
      };
    case 'yesterday':
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return {
        start: new Date(yesterday.getTime() - offsetMs).toISOString(),
        end: new Date(today.getTime() - offsetMs).toISOString()
      };
    case 'week':
      const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        start: new Date(weekStart.getTime() - offsetMs).toISOString(),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - offsetMs).toISOString()
      };
    case 'month':
      const monthStart = new Date(
        Date.UTC(
          partnerDate.getUTCFullYear(),
          partnerDate.getUTCMonth(),
          1,
          0, 0, 0, 0
        )
      );
      return {
        start: new Date(monthStart.getTime() - offsetMs).toISOString(),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - offsetMs).toISOString()
      };
  }
}

/**
 * 파트너 타임존 기준 날짜 포맷팅
 * @param partnerId - 파트너 ID
 * @param partnerLevel - 파트너 레벨
 * @param utcDateString - UTC 날짜 문자열
 * @param format - 포맷 타입 ('datetime' | 'date' | 'time')
 * @returns 포맷된 날짜 문자열
 */
export async function formatPartnerDate(
  partnerId: string,
  partnerLevel: number,
  utcDateString: string,
  format: 'datetime' | 'date' | 'time' = 'datetime'
): Promise<string> {
  const offset = await getPartnerTimezoneOffset(partnerId, partnerLevel);
  const date = new Date(utcDateString);
  const partnerDate = new Date(date.getTime() + offset * 60 * 60 * 1000);
  
  const year = partnerDate.getUTCFullYear();
  const month = String(partnerDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(partnerDate.getUTCDate()).padStart(2, '0');
  const hours = String(partnerDate.getUTCHours()).padStart(2, '0');
  const minutes = String(partnerDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(partnerDate.getUTCSeconds()).padStart(2, '0');
  
  switch (format) {
    case 'date':
      return `${year}-${month}-${day}`;
    case 'time':
      return `${hours}:${minutes}:${seconds}`;
    case 'datetime':
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

/**
 * 특정 파트너의 타임존 캐시 초기화
 * @param partnerId - 파트너 ID (선택사항, 없으면 전체 캐시 초기화)
 */
export function resetTimezoneCache(partnerId?: string) {
  if (partnerId) {
    // 특정 파트너의 캐시만 삭제
    for (const key of timezoneCache.keys()) {
      if (key.startsWith(partnerId)) {
        timezoneCache.delete(key);
      }
    }
  } else {
    // 전체 캐시 초기화
    timezoneCache.clear();
  }
  console.log('🔄 [Timezone] 캐시 초기화:', partnerId || 'ALL');
}