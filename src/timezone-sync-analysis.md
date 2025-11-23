# Timezone Sync 정리 - 영향 받는 컴포넌트 및 코드 분석

## 🔍 AdminHeader 시간 계산 로직 정확한 분석

### **현재 리셋 시간 (검증 완료)**
AdminHeader.tsx의 총입출금 통계는 **KST 기준 00:00 = UTC 기준 전날 15:00**에 리셋됩니다.

### **왜 UTC 15:00에 리셋되는가?**
```typescript
// Line 203-208
const now = new Date();
const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
const kstDate = new Date(now.getTime() + kstOffset);
const todayStart = new Date(kstDate.getFullYear(), kstDate.getMonth(), kstDate.getDate());
const todayStartISO = new Date(todayStart.getTime() - kstOffset).toISOString();
```

**단계별 계산 (예: 현재 UTC 2025-11-23 10:00:00):**
1. `now.getTime() + kstOffset`: UTC 10:00 + 9시간 = KST 19:00
2. `new Date(2025, 10, 23)`: **브라우저 로컬 타임존** 기준 2025-11-23 00:00:00 생성
   - ⚠️ **문제**: `new Date(year, month, date)`는 로컬 타임존을 사용
   - 브라우저가 KST라면: `2025-11-23 00:00:00 KST`
   - 이를 UTC로 변환: `2025-11-22 15:00:00 UTC`
3. `todayStart.getTime() - kstOffset`: 로컬 00:00 - 9시간 = UTC 전날 15:00

**결과**: KST 00:00 = **UTC 15:00 (전날)** → 관찰한 "15:00 리셋"이 정확합니다!

---

## 📋 현재 상태 요약

### ✅ **timezone_offset을 사용하는 컴포넌트** (통합 완료)
1. **BannerManagement.tsx** - 배너 시작/종료 시간
2. **UserBannerPopup.tsx** - 사용자 페이지 배너 표시

### ❌ **브라우저 로컬 시간 또는 하드코딩 KST를 사용하는 컴포넌트** (수정 필요)

#### 1. **AdminHeader.tsx** (203-208줄)
**현재 코드:**
```typescript
// 오늘 날짜 (KST 기준) - 하드코딩
const now = new Date();
const kstOffset = 9 * 60 * 60 * 1000; // 하드코딩된 UTC+9
const kstDate = new Date(now.getTime() + kstOffset);
const todayStart = new Date(kstDate.getFullYear(), kstDate.getMonth(), kstDate.getDate());
const todayStartISO = new Date(todayStart.getTime() - kstOffset).toISOString();
```

**사용처:**
- 헤더 통계 조회 (daily_deposit, daily_withdrawal)
- 입금/출금 합계 계산 시 `gte('created_at', todayStartISO)`

**리셋 시간:**
- KST 기준 00:00에 리셋 (= UTC 기준 전날 15:00)
- 예: KST 2025-11-23 00:00 = UTC 2025-11-22 15:00

**문제점:**
- `new Date(year, month, date)`는 브라우저 로컬 타임존으로 Date 객체 생성
- 브라우저 타임존이 KST가 아니면 리셋 시간이 달라짐
- KST로 하드코딩되어 system_settings.timezone_offset 설정 무시

**영향:**
- 관리자가 다른 시간대에 있으면 "오늘" 기준이 달라짐
- 통계 불일치 발생 가능
- 시스템 타임존 설정과 무관하게 항상 KST 00:00 기준

---

#### 2. **Dashboard.tsx** (271-273줄)
**현재 코드:**
```typescript
// 오늘 날짜 (UTC 기준 오늘 00:00:00) - 브라우저 로컬 시간
const now = new Date();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const todayStartISO = todayStart.toISOString();

console.log('📅 오늘 시작 시각 (UTC):', todayStartISO);
console.log('📅 현재 시각 (로컬):', now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
```

**사용처:**
- 대시보드 통계 조회
- 일별 입출금 통계
- 베팅 내역 통계

**영향:**
- AdminHeader와 다른 시간 기준 사용 → 통계 불일치
- 브라우저 시간대에 따라 "오늘"이 달라짐

---

#### 3. **BettingHistory.tsx** (61-73줄)
**현재 코드:**
```typescript
const getDateRange = (filter: string) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 브라우저 로컬
  
  switch (filter) {
    case 'today':
      return { start: today.toISOString(), end: now.toISOString() };
    case 'week':
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 7);
      return { start: weekStart.toISOString(), end: now.toISOString() };
    // ...
  }
}
```

**사용처:**
- 베팅 내역 필터링 (오늘, 최근 7일, 최근 30일)

**영향:**
- 필터 기준이 브라우저 시간대에 종속

---

#### 4. **CommissionSettlement.tsx** (69-113줄)
**현재 코드:**
```typescript
const getDateRange = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 브라우저 로컬
  
  switch (periodFilter) {
    case "today":
      return {
        start: today.toISOString(),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
      };
    case "yesterday":
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return {
        start: yesterday.toISOString(),
        end: today.toISOString()
      };
    // ...
  }
}
```

**사용처:**
- 커미션 정산 기간 필터링 (오늘, 어제, 이번 주, 이번 달)

**영향:**
- 정산 기간 계산이 브라우저 시간대에 종속
- 관리자마다 다른 정산 결과 가능

---

#### 5. **AutoSyncMonitor.tsx** (72-74줄)
**현재 코드:**
```typescript
const formatKST = (utcDateString: string) => {
  const date = new Date(utcDateString);
  // UTC에서 KST로 변환 (UTC + 9시간) - 하드코딩
  const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  // ...
}
```

**사용처:**
- 자동 동기화 시간 표시

**영향:**
- KST로 고정되어 있어 다른 시간대 관리자에게 혼란

---

## 🛠️ 수정 방안

### 1. **Timezone Helper 유틸리티 생성**

**/lib/timezoneHelper.ts** (신규 생성)
```typescript
import { supabase } from './supabase';

/**
 * 시스템 타임존 오프셋 조회 (캐싱)
 */
let cachedTimezoneOffset: number | null = null;

export async function getSystemTimezoneOffset(): Promise<number> {
  if (cachedTimezoneOffset !== null) {
    return cachedTimezoneOffset;
  }

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'timezone_offset')
      .single();

    if (!error && data) {
      cachedTimezoneOffset = parseInt(data.setting_value);
      return cachedTimezoneOffset;
    }
  } catch (err) {
    console.error('❌ [Timezone] 오프셋 조회 실패:', err);
  }

  // 기본값: UTC+9
  cachedTimezoneOffset = 9;
  return 9;
}

/**
 * 시스템 타임존 기준 "오늘" 시작 시각 (ISO string)
 */
export async function getTodayStartISO(): Promise<string> {
  const offset = await getSystemTimezoneOffset();
  const now = new Date();
  const offsetMs = offset * 60 * 60 * 1000;
  
  // 시스템 타임존 기준 현재 시각
  const systemDate = new Date(now.getTime() + offsetMs);
  
  // 오늘 00:00:00
  const todayStart = new Date(
    systemDate.getUTCFullYear(),
    systemDate.getUTCMonth(),
    systemDate.getUTCDate()
  );
  
  // UTC 기준으로 역변환
  return new Date(todayStart.getTime() - offsetMs).toISOString();
}

/**
 * 시스템 타임존 기준 날짜 범위 계산
 */
export async function getDateRange(
  filter: 'today' | 'yesterday' | 'week' | 'month'
): Promise<{ start: string; end: string }> {
  const offset = await getSystemTimezoneOffset();
  const now = new Date();
  const offsetMs = offset * 60 * 60 * 1000;
  const systemDate = new Date(now.getTime() + offsetMs);
  
  const today = new Date(
    systemDate.getUTCFullYear(),
    systemDate.getUTCMonth(),
    systemDate.getUTCDate()
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
        systemDate.getUTCFullYear(),
        systemDate.getUTCMonth(),
        1
      );
      return {
        start: new Date(monthStart.getTime() - offsetMs).toISOString(),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - offsetMs).toISOString()
      };
  }
}

/**
 * 시스템 타임존 기준 날짜 포맷팅
 */
export async function formatSystemDate(
  utcDateString: string,
  format: 'datetime' | 'date' | 'time' = 'datetime'
): Promise<string> {
  const offset = await getSystemTimezoneOffset();
  const date = new Date(utcDateString);
  const systemDate = new Date(date.getTime() + offset * 60 * 60 * 1000);
  
  const year = systemDate.getUTCFullYear();
  const month = String(systemDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(systemDate.getUTCDate()).padStart(2, '0');
  const hours = String(systemDate.getUTCHours()).padStart(2, '0');
  const minutes = String(systemDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(systemDate.getUTCSeconds()).padStart(2, '0');
  
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
 * 캐시 초기화 (SystemSettings 변경 시 호출)
 */
export function resetTimezoneCache() {
  cachedTimezoneOffset = null;
}
```

---

### 2. **각 컴포넌트 수정 사항**

#### **AdminHeader.tsx**
```typescript
// 수정 전
const now = new Date();
const kstOffset = 9 * 60 * 60 * 1000;
const kstDate = new Date(now.getTime() + kstOffset);
const todayStart = new Date(kstDate.getFullYear(), kstDate.getMonth(), kstDate.getDate());
const todayStartISO = new Date(todayStart.getTime() - kstOffset).toISOString();

// 수정 후
import { getTodayStartISO } from '../../lib/timezoneHelper';

const todayStartISO = await getTodayStartISO();
```

#### **Dashboard.tsx**
```typescript
// 수정 전
const now = new Date();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const todayStartISO = todayStart.toISOString();

// 수정 후
import { getTodayStartISO } from '../../lib/timezoneHelper';

const todayStartISO = await getTodayStartISO();
```

#### **BettingHistory.tsx**
```typescript
// 수정 전
const getDateRange = (filter: string) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // ...
}

// 수정 후
import { getDateRange as getSystemDateRange } from '../../lib/timezoneHelper';

const getDateRange = async (filter: 'today' | 'yesterday' | 'week' | 'month') => {
  return await getSystemDateRange(filter);
}
```

#### **CommissionSettlement.tsx**
```typescript
// 수정 전
const getDateRange = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // ...
}

// 수정 후
import { getDateRange as getSystemDateRange } from '../../lib/timezoneHelper';

const getDateRange = async () => {
  if (periodFilter === 'custom') {
    // custom은 그대로 유지
  }
  return await getSystemDateRange(periodFilter as 'today' | 'yesterday' | 'week' | 'month');
}
```

#### **AutoSyncMonitor.tsx**
```typescript
// 수정 전
const formatKST = (utcDateString: string) => {
  const date = new Date(utcDateString);
  const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  // ...
}

// 수정 후
import { formatSystemDate } from '../../lib/timezoneHelper';

const formatSystemTime = async (utcDateString: string) => {
  return await formatSystemDate(utcDateString, 'datetime');
}
```

---

## 🔄 SystemSettings 통합

**SystemSettings.tsx**에서 timezone_offset 변경 시:
```typescript
import { resetTimezoneCache } from '../../lib/timezoneHelper';

const handleSaveGeneralSettings = async () => {
  // ... 저장 로직
  
  // 타임존 캐시 초기화
  resetTimezoneCache();
  
  toast.success('설정이 저장되었습니다.');
}
```

---

## 📊 영향 범위 우선순위

### **높음 (통계 정확도 영향)**
1. ✅ AdminHeader.tsx - 헤더 통계
2. ✅ Dashboard.tsx - 대시보드 통계
3. ✅ CommissionSettlement.tsx - 커미션 정산

### **중간 (사용자 경험 영향)**
4. ✅ BettingHistory.tsx - 베팅 내역 필터
5. ✅ AutoSyncMonitor.tsx - 동기화 시간 표시

### **낮음 (이미 완료)**
6. ✅ BannerManagement.tsx - 배너 관리
7. ✅ UserBannerPopup.tsx - 배너 팝업

---

## ⚠️ 주의 사항

### **DB 타임스탬프 저장 방식**
- 모든 timestamp는 UTC로 저장 유지 (변경 없음)
- `new Date().toISOString()` 사용하는 곳은 수정 불필요
- 예: `created_at`, `updated_at`, `logout_at` 등

### **조회 시에만 시스템 타임존 적용**
- 데이터 입력: UTC 그대로
- 데이터 조회/필터링: 시스템 타임존 기준
- 화면 표시: 시스템 타임존으로 변환

### **타임존 변경 시 영향**
- 실시간 통계: 페이지 새로고침 필요
- 과거 데이터: 영향 없음 (UTC 저장이므로)
- 캐시: 자동 초기화됨

---

## 📝 구현 체크리스트

- [ ] `/lib/timezoneHelper.ts` 생성
- [ ] `AdminHeader.tsx` 수정
- [ ] `Dashboard.tsx` 수정
- [ ] `BettingHistory.tsx` 수정
- [ ] `CommissionSettlement.tsx` 수정
- [ ] `AutoSyncMonitor.tsx` 수정
- [ ] `IntegratedSettlement.tsx` 수정
- [ ] `SystemSettings.tsx`에 캐시 초기화 추가
- [ ] 테스트: UTC+0, UTC+9, UTC-5에서 동작 확인
- [ ] 문서화: 관리자 매뉴얼 업데이트