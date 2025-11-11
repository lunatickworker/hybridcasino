# 제공사 상태 관리 기능 (Provider Status Management)

## 개요

게임 관리 시스템에 제공사(Provider) 상태 관리 기능이 추가되었습니다. 이제 제공사 단위로 노출/비노출/점검중 상태를 관리할 수 있으며, 제공사 상태가 하위 게임에 자동으로 영향을 미칩니다.

## 주요 변경사항

### 1. 제공사 상태 관리 (3가지 상태)

| 상태 | 코드 | 설명 | 사용자 노출 | 하위 게임 영향 |
|------|------|------|------------|--------------|
| 노출 | `visible` | 정상 서비스 중 | ✅ 노출됨 | 게임 원래 상태 유지 |
| 점검중 | `maintenance` | 임시 점검 중 | ❌ 숨김 | 모든 게임 자동 숨김 |
| 숨김 | `hidden` | 영구 비활성화 | ❌ 숨김 | 모든 게임 자동 숨김 |

### 2. DB 스키마 변경

#### game_providers 테이블 업데이트:

```sql
-- 신규 컬럼
is_visible BOOLEAN DEFAULT TRUE  -- 사용자 페이지 노출 여부

-- 기존 컬럼 타입 변경
status TEXT DEFAULT 'visible'    -- 'active' | 'inactive' → 'visible' | 'maintenance' | 'hidden'
```

#### 마이그레이션 스크립트:
- 파일: `/database/401_update_game_providers_schema.sql`
- 실행: Supabase SQL Editor에서 실행
- 자동 처리:
  - 기존 CHECK 제약 조건 삭제
  - 데이터 마이그레이션 (active→visible, inactive→hidden)
  - 새로운 CHECK 제약 조건 추가 (visible, maintenance, hidden)
  - 성능 최적화 인덱스 추가

### 3. API 함수 추가

#### `/lib/gameApi.ts`

```typescript
// 제공사 상태 변경 (하위 게임 자동 영향)
await gameApi.updateProviderStatus(providerId, 'maintenance');

// 제공사 노출 설정
await gameApi.updateProviderVisibility(providerId, false);

// 사용자 페이지용 제공사 조회
const providers = await gameApi.getUserVisibleProviders({
  type: 'casino',
});
```

### 4. 관리자 UI 개선

#### 제공사 카드 시각적 표시:
- **노출**: 기본 색상 (슬레이트)
- **점검중**: 오렌지 계열 + "점검중" 배지
- **숨김**: 회색 계열 (투명도 낮음) + "숨김" 배지

#### 제공사 상태 변경:
- 제공사 선택 시 하단에 드롭다운 표시
- 3가지 옵션: 노출 / 점검중 / 숨김
- 선택 즉시 적용 및 하위 게임 자동 업데이트

---

## 작동 방식

### 제공사 상태 변경 시 자동 처리

#### 1. 제공사를 "점검중" 또는 "숨김"으로 변경:

```typescript
// 관리자가 실행
await gameApi.updateProviderStatus(providerId, 'maintenance');

// 자동 처리:
// 1. game_providers 테이블 업데이트
//    - status = 'maintenance'
//    - is_visible = false
//
// 2. games 테이블 자동 업데이트 (해당 제공사의 모든 게임)
//    - is_visible = false
//
// 결과: 사용자 페이지에서 제공사와 모든 게임이 즉시 숨겨짐
```

#### 2. 제공사를 "노출"로 변경:

```typescript
// 관리자가 실행
await gameApi.updateProviderStatus(providerId, 'visible');

// 자동 처리:
// 1. game_providers 테이블 업데이트
//    - status = 'visible'
//    - is_visible = true
//
// 2. games 테이블 복원 (해당 제공사의 모든 게임)
//    - is_visible = (status === 'visible')
//    즉, 게임의 원래 status에 따라 is_visible 복원
//
// 결과: 
// - 제공사 노출됨
// - 게임은 원래 상태대로 복원 (visible 게임만 노출)
```

---

## 사용 예시

### 시나리오 1: 제공사 전체 점검

```typescript
// 에볼루션 게이밍을 점검중으로 설정
await gameApi.updateProviderStatus(410, 'maintenance');

// 결과:
// ✅ 제공사 상태: maintenance
// ✅ 제공사 is_visible: false
// ✅ 에볼루션의 모든 게임 is_visible: false
// ✅ 사용자 페이지: 에볼루션 제공사와 모든 게임 숨김
```

### 시나리오 2: 점검 완료 후 복원

```typescript
// 에볼루션 게이밍을 다시 노출
await gameApi.updateProviderStatus(410, 'visible');

// 결과:
// ✅ 제공사 상태: visible
// ✅ 제공사 is_visible: true
// ✅ 에볼루션의 게임:
//    - status='visible' → is_visible=true (사용자에게 표시)
//    - status='hidden' → is_visible=false (여전히 숨김)
//    - status='maintenance' → is_visible=false (여전히 점검중)
// ✅ 사용자 페이지: 제공사 표시 + visible 게임만 표시
```

### 시나리오 3: 제공사 영구 비활성화

```typescript
// 오래된 제공사를 숨김 처리
await gameApi.updateProviderStatus(99, 'hidden');

// 결과:
// ✅ 제공사 상태: hidden
// ✅ 제공사 is_visible: false
// ✅ 해당 제공사의 모든 게임 is_visible: false
// ✅ 사용자 페이지: 제공사와 모든 게임 완전히 숨김
// ✅ 관리자 페이지: 여전히 표시 (회색 "숨김" 배지)
```

---

## 사용자 페이지 필터링 로직

### 제공사 조회:

```typescript
// 사용자는 다음 조건을 만족하는 제공사만 볼 수 있음
const providers = await gameApi.getUserVisibleProviders({
  type: 'casino',
});

// SQL 조건:
// WHERE is_visible = true AND status = 'visible'
```

### 게임 조회:

```typescript
// 사용자는 다음 조건을 만족하는 게임만 볼 수 있음
const games = await gameApi.getUserVisibleGames({
  type: 'casino',
});

// SQL 조건:
// WHERE games.is_visible = true 
//   AND games.status = 'visible'
//   AND provider.is_visible = true  -- JOIN 조건
//   AND provider.status = 'visible' -- JOIN 조건
```

**즉, 제공사와 게임 모두 visible 상태여야 사용자가 볼 수 있습니다.**

---

## 관리자 페이지 사용법

### 1. 제공사 상태 확인

게임 관리 페이지에서 제공사 카드를 확인:
- **배지 없음**: 정상 노출 (visible)
- **오렌지 "점검중" 배지**: 점검중 (maintenance)
- **회색 "숨김" 배지**: 숨김 (hidden)

### 2. 제공사 상태 변경

1. 제공사 카드 클릭 (선택)
2. 카드 하단에 나타나는 드롭다운 클릭
3. 원하는 상태 선택:
   - 노출 (👁️ 아이콘)
   - 점검중 (⚠️ 아이콘)
   - 숨김 (🚫 아이콘)
4. 자동 적용 및 토스트 메시지 확인

### 3. 제공사 상태 변경 시 주의사항

⚠️ **제공사를 점검중/숨김으로 변경하면 해당 제공사의 모든 게임이 사용자에게 즉시 숨겨집니다.**

- 일부 게임만 숨기려면: 제공사는 노출 상태로 두고, 개별 게임 상태를 변경하세요.
- 제공사 전체를 숨기려면: 제공사 상태를 점검중 또는 숨김으로 변경하세요.

---

## 성능 최적화

### 인덱스 추가:

```sql
-- 제공사 상태 조회 최적화 (4개)
CREATE INDEX idx_game_providers_status ON game_providers(status);
CREATE INDEX idx_game_providers_is_visible ON game_providers(is_visible);
CREATE INDEX idx_game_providers_api_type_type ON game_providers(api_type, type);

-- 게임 상태 조회 최적화 (4개)
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_is_visible ON games(is_visible);
CREATE INDEX idx_games_provider_id_status ON games(provider_id, status);
CREATE INDEX idx_games_api_type_type ON games(api_type, type);
```

### 쿼리 최적화:

- 사용자 페이지: `is_visible`과 `status` 인덱스로 빠른 필터링
- 관리자 페이지: 모든 제공사 표시 (숨김 포함), 상태별 시각적 구분

---

## 테스트 시나리오

### 1. 초기 설정 테스트

```bash
# 1. DB 스키마 업데이트
# Supabase SQL Editor에서 /database/401_update_game_providers_schema.sql 실행

# 2. 제공사 초기화
# 관리자 페이지 > 게임 관리 > "제공사 초기화" 클릭

# 3. 확인
# - 모든 제공사 status = 'visible'
# - 모든 제공사 is_visible = true
```

### 2. 제공사 점검중 테스트

```bash
# 1. 에볼루션 게이밍 선택
# 2. 드롭다운에서 "점검중" 선택
# 3. 확인:
#    - 제공사 카드에 오렌지 "점검중" 배지 표시
#    - 사용자 페이지에서 에볼루션 제공사와 게임 모두 숨김
# 4. 다시 "노출"로 변경
# 5. 확인:
#    - 배지 사라짐
#    - 사용자 페이지에서 제공사와 게임 다시 표시
```

### 3. 제공사 숨김 테스트

```bash
# 1. 특정 제공사 선택
# 2. 드롭다운에서 "숨김" 선택
# 3. 확인:
#    - 제공사 카드에 회색 "숨김" 배지 표시
#    - 제공사 카드 색상이 회색/투명하게 변경
#    - 사용자 페이지에서 완전히 숨김
```

### 4. 하위 게임 영향 테스트

```bash
# 1. 제공사를 점검중으로 변경
# 2. DB 확인:
SELECT 
  p.name AS provider_name,
  p.status AS provider_status,
  p.is_visible AS provider_visible,
  g.name AS game_name,
  g.status AS game_status,
  g.is_visible AS game_visible
FROM game_providers p
JOIN games g ON g.provider_id = p.id
WHERE p.id = [providerId]
LIMIT 10;

# 3. 결과 확인:
#    - provider_status = 'maintenance'
#    - provider_visible = false
#    - game_visible = false (모든 게임)
```

---

## FAQ

### Q1. 제공사 상태를 변경했는데 사용자 페이지에 반영이 안 돼요.

**A**: 브라우저 캐시를 새로고침하거나 페이지를 다시 로드하세요. WebSocket 실시간 동기화가 설정되어 있다면 자동으로 반영됩니다.

### Q2. 제공사를 노출로 바꿨는데 일부 게임이 여전히 안 보여요.

**A**: 정상입니다. 제공사를 노출로 변경하면 게임의 원래 `status`에 따라 복원됩니다. 숨김 상태였던 게임은 여전히 숨김으로 유지됩니다.

### Q3. 제공사 상태를 변경하면 게임 상태도 변경되나요?

**A**: 게임의 `status`는 변경되지 않습니다. `is_visible` 필드만 자동으로 변경됩니다:
- 제공사 점검중/숨김 → 모든 게임 `is_visible=false`
- 제공사 노출 → 게임 `is_visible` = (게임 `status` === 'visible')

### Q4. Lv1이 아닌 관리자도 제공사 상태를 변경할 수 있나요?

**A**: 네, 모든 관리자가 제공사 상태를 변경할 수 있습니다. Lv1 전용 기능은 "제공사 초기화"와 "게임 동기화"입니다.

### Q5. 제공사를 숨김 처리하면 영구적으로 삭제되나요?

**A**: 아니요. DB에는 그대로 남아있고, 관리자 페이지에서도 여전히 볼 수 있습니다 (회색 "숨김" 배지). 사용자 페이지에서만 숨겨집니다.

---

## 관련 파일

### 수정된 파일:
- `/lib/gameApi.ts` - 제공사 상태 관리 함수 추가
- `/components/admin/EnhancedGameManagement.tsx` - 제공사 상태 UI 추가
- `/GAME_MANAGEMENT_GUIDE.md` - 문서 업데이트

### 신규 파일:
- `/database/401_update_game_providers_schema.sql` - DB 스키마 업데이트
- `/PROVIDER_STATUS_FEATURE.md` - 기능 상세 문서 (현재 파일)

---

## 다음 단계

1. ✅ DB 스키마 업데이트 실행
2. ✅ 제공사 초기화 (모두 visible 상태로 생성됨)
3. 사용자 페이지에 제공사 필터 적용
4. 점검중 제공사/게임 안내 메시지 추가
5. WebSocket 실시간 동기화 연동
6. 제공사별 통계 추가 (플레이 횟수, 인기도 등)

---

**업데이트 일시**: 2025-01-11  
**버전**: v2.0.0  
**작성자**: 게임 관리 시스템 개발팀
