# 게임 관리 시스템 가이드

## 개요

최신 버전의 게임 관리 시스템입니다. 이중 API 지원(Invest + OroPlay)과 제공사/게임 상태 관리가 완벽하게 작동합니다.

## 주요 특징

### 1. 이중 API 지원
- **Invest API**: Guidelines.md 기준 46개 고정 제공사 (슬롯 33 + 카지노 13)
- **OroPlay API**: 동적으로 제공사 및 게임 조회

### 2. 제공사 상태 관리 (신규 기능 ✨)

제공사는 3가지 상태를 가질 수 있습니다:

| 상태 | 설명 | 사용자 페이지 노출 | 하위 게임 영향 |
|------|------|-------------------|--------------|
| `visible` | 정상 노출 | ✅ 노출됨 | 게임 원래 상태 유지 |
| `maintenance` | 점검중 | ❌ 숨김 (점검중 메시지) | 모든 게임 자동 숨김 |
| `hidden` | 관리자가 숨김 | ❌ 완전히 숨김 | 모든 게임 자동 숨김 |

**중요**: 제공사가 점검중이거나 숨김 상태일 경우, 해당 제공사의 모든 게임이 자동으로 사용자에게 숨겨집니다.

### 3. 게임 상태 관리

게임은 3가지 상태를 가질 수 있습니다:

| 상태 | 설명 | 사용자 페이지 노출 |
|------|------|-------------------|
| `visible` | 정상 노출 | ✅ 노출됨 (단, 제공사도 visible이어야 함) |
| `maintenance` | 점검중 | ❌ 숨김 (점검중 메시지) |
| `hidden` | 관리자가 숨김 | ❌ 완전히 숨김 |

### 4. 5개 탭 구조 (관리자 페이지)

```
├─ Invest Casino    (api_type='invest' + type='casino')
├─ Invest Slot      (api_type='invest' + type='slot')
├─ OroPlay Casino   (api_type='oroplay' + type='casino')
├─ OroPlay Slot     (api_type='oroplay' + type='slot')
└─ OroPlay MiniGame (api_type='oroplay' + type='minigame')
```

### 5. 3개 탭 구조 (사용자 페이지)

```
├─ Casino    (type='casino' + is_visible=true + status='visible')
├─ Slot      (type='slot' + is_visible=true + status='visible')
└─ MiniGame  (type='minigame' + is_visible=true + status='visible')
```

사용자는 API 구분 없이 모든 카지노/슬롯/미니게임을 하나의 탭에서 봅니다.

### 6. API 활성화 설정 연동 (신규 기능 ✨)

**Lv1 시스템 관리자**는 시스템 설정에서 API 사용 여부를 설정할 수 있습니다:
- `use_invest_api`: Invest API 사용 여부 (기본값: true)
- `use_oroplay_api`: OroPlay API 사용 여부 (기본값: true)

**API 비활성화 시 동작**:
1. **관리자 페이지**: 비활성화된 API의 게임/제공사가 모두 숨김 처리됨
2. **사용자 페이지**: 비활성화된 API의 게임이 자동으로 제외됨 (사용자는 인지 불가)
3. **잔고 계산**: 비활성화된 API의 잔고가 총 잔고에서 제외됨

예시: Invest API를 비활성화하면
- 관리자: "Invest 카지노", "Invest 슬롯" 탭에서 게임 목록이 빈 상태로 표시
- 사용자: OroPlay 게임만 표시되며, Invest 게임은 보이지 않음

---

## 초기 설정 (처음 시작 시)

### 1단계: DB 초기화

Supabase SQL Editor에서 실행:

```sql
-- /database/400_reset_game_tables.sql 실행
TRUNCATE TABLE games CASCADE;
TRUNCATE TABLE game_providers CASCADE;
TRUNCATE TABLE game_status_logs CASCADE;
```

### 2단계: 제공사 초기화 (Lv1 전용)

관리자 페이지 > 게임 관리에서:

1. **"제공사 초기화"** 버튼 클릭
   - Invest 46개 제공사 자동 생성 (모두 visible 상태)
   - OroPlay 제공사 API 조회 및 생성 (모두 visible 상태)
   - 카지노 로비 게임 자동 생성

### 3단계: 게임 동기화 (Lv1 전용)

#### Invest 게임 동기화
1. **"Invest 동기화"** 버튼 클릭
2. 46개 제공사의 게임 목록을 병렬로 가져옴 (배치 크기: 5개)
3. 완료까지 약 **3~5초** 소요 (성능 최적화 완료 ✅)

#### OroPlay 게임 동기화
1. **"OroPlay 동기화"** 버튼 클릭
2. OroPlay 제공사의 게임 목록을 가져옴
3. 완료까지 약 30초~1분 소요

---

## 사용 방법

### 관리자 페이지

#### 1. 제공사 상태 변경 (신규 기능 ✨)

제공사 카드 선택 후:
- 하단에 나타나는 **드롭다운 선택**: 노출 / 점검중 / 숨김 중 선택
- **자동 반영**: 선택 즉시 DB 업데이트
- **하위 게임 영향**: 
  - 제공사가 점검중/숨김 → 모든 게임 자동 숨김
  - 제공사가 노출 → 게임 원래 상태로 복원

**시각적 표시**:
- 노출: 기본 색상
- 점검중: 오렌지 계열 + "점검중" 배지
- 숨김: 회색 계열 + "숨김" 배지

#### 2. 게임 상태 변경

각 게임 카드에서:
- **드롭다운 선택**: 노출 / 점검중 / 숨김 중 선택
- **자동 반영**: 선택 즉시 DB 업데이트 및 사용자 페이지 반영

#### 3. 일괄 게임 상태 변경

1. 게임 카드 좌측 상단 체크박스 클릭 (여러 개 선택 가능)
2. 상단에 나타나는 일괄 작업 바에서 버튼 클릭:
   - **노출**: 선택한 게임 모두 노출
   - **점검중**: 선택한 게임 모두 점검중
   - **숨김**: 선택한 게임 모두 숨김

#### 4. 추천 게임 설정

- 게임 카드 호버 시 별 아이콘 클릭
- 추천 게임은 우선 순위(priority)가 높아져 상위 노출

#### 5. 제공사별 필터링

- 상단의 제공사 버튼 클릭으로 해당 제공사 게임만 표시
- 탭 전환 시 첫 번째 제공사 자동 선택

#### 6. 검색 (300ms debounce 적용)

- 검색창에 게임 이름 또는 제공사 이름 입력
- 실시간 필터링 (입력 후 300ms 대기)

### 사용자 페이지

사용자는 다음 조건을 만족하는 게임만 볼 수 있습니다:

```typescript
// 게임 조건
game.is_visible === true && game.status === 'visible'

// 제공사 조건
provider.is_visible === true && provider.status === 'visible'
```

- **점검중 게임/제공사**: 보이지 않음 (또는 "점검중" 메시지 표시)
- **숨김 게임/제공사**: 완전히 보이지 않음
- **API 구분 무관**: Invest와 OroPlay 게임이 섞여서 표시

---

## 데이터베이스 스키마

### game_providers 테이블 (업데이트됨 ✨)

```sql
CREATE TABLE game_providers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'slot' | 'casino' | 'minigame'
  api_type TEXT NOT NULL, -- 'invest' | 'oroplay'
  vendor_code TEXT, -- OroPlay 전용
  status TEXT DEFAULT 'visible', -- 'visible' | 'maintenance' | 'hidden'
  is_visible BOOLEAN DEFAULT TRUE, -- 사용자 페이지 노출 여부
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### games 테이블

```sql
CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  provider_id INTEGER REFERENCES game_providers(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'slot' | 'casino' | 'minigame'
  api_type TEXT NOT NULL, -- 'invest' | 'oroplay'
  status TEXT DEFAULT 'visible', -- 'visible' | 'maintenance' | 'hidden'
  is_visible BOOLEAN DEFAULT TRUE, -- 사용자 페이지 노출 여부
  vendor_code TEXT, -- OroPlay 전용
  game_code TEXT, -- OroPlay 전용
  image_url TEXT,
  demo_available BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 0,
  rtp NUMERIC,
  play_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API 함수

### /lib/gameApi.ts

#### 제공사 관리

```typescript
// Invest 제공사 초기화 (46개)
await gameApi.initializeInvestProviders();

// OroPlay 제공사 동기화
await gameApi.syncOroPlayProviders();

// 제공사 조회
const providers = await gameApi.getProviders({
  api_type: 'invest', // 'invest' | 'oroplay'
  type: 'casino', // 'slot' | 'casino' | 'minigame'
  status: 'visible', // 'visible' | 'maintenance' | 'hidden'
  is_visible: true,
});

// 사용자 페이지용 제공사 조회
const providers = await gameApi.getUserVisibleProviders({
  type: 'casino',
});
```

#### 제공사 상태 관리 (신규 기능 ✨)

```typescript
// 제공사 상태 변경 (하위 게임 자동 영향)
await gameApi.updateProviderStatus(providerId, 'maintenance');
// 결과: 제공사 점검중 + 모든 하위 게임 is_visible=false

await gameApi.updateProviderStatus(providerId, 'visible');
// 결과: 제공사 노출 + 게임 원래 status에 따라 is_visible 복원

// 제공사 노출 설정
await gameApi.updateProviderVisibility(providerId, false);
```

#### 게임 동기화

```typescript
// Invest 단일 제공사 동기화
const result = await gameApi.syncInvestGames(providerId);

// Invest 전체 제공사 동기화 (병렬 처리, 배치 크기: 5개)
const result = await gameApi.syncAllInvestGames();

// OroPlay 전체 동기화
const result = await gameApi.syncOroPlayGames();
```

#### 게임 조회

```typescript
// 관리자: 모든 게임 조회
const games = await gameApi.getGames({
  api_type: 'invest',
  type: 'casino',
  provider_id: 410,
  status: 'visible',
  search: '바카라',
});

// 사용자: 노출된 게임만 조회
const games = await gameApi.getUserVisibleGames({
  type: 'casino',
  provider_id: 410,
  search: '바카라',
});
```

#### 게임 상태 관리

```typescript
// 단일 게임 상태 변경
await gameApi.updateGameStatus(gameId, 'maintenance');

// 단일 게임 노출 설정
await gameApi.updateGameVisibility(gameId, false);

// 일괄 상태 변경
await gameApi.bulkUpdateStatus([gameId1, gameId2], 'hidden');

// 일괄 노출 설정
await gameApi.bulkUpdateVisibility([gameId1, gameId2], true);

// 추천 설정
await gameApi.updateGameFeatured(gameId, true);
```

---

## 성능 최적화 내역

### ✅ 완료된 최적화

1. **게임 목록 로딩 시간**: 30초 → 3~5초 (병렬 처리로 83% 단축)
   - 배치 크기: 5개 제공사씩 동시 처리
   - 배치 간 대기: 300ms

2. **검색 필터 입력 딜레이**: 즉시 → 300ms debounce
   - 불필요한 재렌더링 방지

3. **수평 스크롤바 개선**: custom-scrollbar 클래스 적용
   - 제공사 선택 영역의 가독성 향상

4. **"전체 보기" 기능 삭제**: 성능 향상
   - 탭 전환 시 첫 번째 제공사 자동 선택

5. **통계 카드 디자인**: MetricCard 컴포넌트 사용
   - 회원관리와 동일한 UI/UX

---

## 주의사항

### 1. API Rate Limit

- **Invest API**: 배치당 300ms 대기 (배치 크기: 5개)
- **OroPlay API**: 제공사당 500ms 대기
- 동기화 함수에 자동으로 대기 시간 포함됨

### 2. 게임 ID 생성

#### Invest
- 슬롯: API에서 제공하는 game_id 사용
- 카지노: 고정 로비 ID (예: 410000)

#### OroPlay
- `vendorCode_gameCode` 조합을 해시하여 고유 ID 생성
- 2,000,000 이상의 숫자로 설정 (Invest와 겹치지 않도록)

### 3. 제공사 ID 생성

#### Invest
- Guidelines.md에 명시된 고정 ID 사용

#### OroPlay
- vendorCode 해시값 + 1,000,000으로 고유 ID 생성

### 4. 상태 동기화

#### 제공사 상태 변경 시:
1. DB 업데이트 (`game_providers` 테이블)
2. 하위 게임 자동 영향 (`games` 테이블):
   - 점검중/숨김 → 모든 게임 `is_visible=false`
   - 노출 → 게임 원래 `status`에 따라 `is_visible` 복원
3. WebSocket으로 실시간 전파 (선택사항)
4. 사용자 페이지 자동 반영

#### 게임 상태 변경 시:
1. DB 업데이트 (`games` 테이블)
2. WebSocket으로 실시간 전파 (선택사항)
3. 사용자 페이지 자동 반영

### 5. 점검중 vs 숨김

#### 제공사:
- **점검중 (maintenance)**: 일시적인 서비스 중단, 모든 게임 자동 숨김
- **숨김 (hidden)**: 완전히 노출하지 않음, 모든 게임 자동 숨김

#### 게임:
- **점검중 (maintenance)**: 일시적인 서비스 중단 (사용자에게 "점검중" 메시지 표시 가능)
- **숨김 (hidden)**: 완전히 노출하지 않음 (사용자는 존재조차 모름)

---

## 권한 관리

### Lv1 (시스템 관리자) 전용 기능:
- 제공사 초기화
- Invest 게임 동기화
- OroPlay 게임 동기화

### 모든 관리자 가능:
- 제공사 상태 변경 (노출/점검중/숨김)
- 게임 상태 변경 (노출/점검중/숨김)
- 게임 추천 설정
- 일괄 작업
- 검색 및 필터링

---

## 트러블슈팅

### Q1. 제공사가 표시되지 않아요
**A**: Lv1 계정으로 "제공사 초기화" 버튼을 클릭하세요. Invest는 자동으로 46개가 생성되며, OroPlay는 API에서 조회합니다.

### Q2. 게임이 표시되지 않아요
**A**: Lv1 계정으로 "Invest 동기화" 또는 "OroPlay 동기화" 버튼을 클릭하세요. 제공사가 먼저 초기화되어 있어야 합니다.

### Q3. 일부 제공사의 게임이 0개예요
**A**: 정상입니다. 일부 제공사는 게임 목록 API를 지원하지 않거나 로비 진입 방식을 사용합니다.

### Q4. 사용자 페이지에서 게임이 안 보여요
**A**: 관리자 페이지에서 다음을 확인하세요:
- 제공사: `is_visible=true`, `status='visible'`
- 게임: `is_visible=true`, `status='visible'`
- 둘 다 만족해야 사용자가 볼 수 있습니다.

### Q5. 제공사를 점검중으로 설정했는데 게임이 여전히 보여요
**A**: 제공사 점검중 설정 시 모든 하위 게임의 `is_visible`이 자동으로 `false`로 변경됩니다. 캐시를 새로고침하거나 페이지를 다시 로드하세요.

### Q6. 제공사를 노출로 바꿨는데 게임이 안 보여요
**A**: 제공사를 노출로 변경하면 게임의 원래 `status`에 따라 `is_visible`이 복원됩니다. 게임이 원래 `hidden` 상태였다면 여전히 보이지 않습니다.

### Q7. 동기화가 너무 오래 걸려요
**A**: Invest 전체 동기화는 약 3~5초, OroPlay는 30초~1분이 정상입니다. 네트워크 상태를 확인하세요.

---

## 다음 단계

1. ✅ **제공사 상태 관리 완료**: visible/maintenance/hidden 기능 구현
2. **사용자 페이지 수정**: UserCasino.tsx, UserSlot.tsx, UserMiniGame.tsx에서 `getUserVisibleGames()` 및 `getUserVisibleProviders()` 사용
3. **점검중 UI 추가**: 점검중 제공사/게임에 대한 안내 메시지 표시
4. **게임 실행 로직 연동**: 게임/제공사 상태 확인 후 실행 (점검중이면 실행 불가)
5. **WebSocket 실시간 동기화**: 관리자가 상태 변경 시 사용자 페이지 실시간 반영
6. **통계 기능 강화**: 제공사별/게임별 플레이 횟수, 인기도 트래킹

---

## 변경 이력

### v2.0.0 (2025-01-11)
- ✨ 제공사 상태 관리 기능 추가 (visible/maintenance/hidden)
- ✨ 제공사 상태 변경 시 하위 게임 자동 영향 기능
- ⚡ 성능 최적화: 게임 로딩 시간 83% 단축 (30초 → 3~5초)
- ⚡ 검색 debounce 적용 (300ms)
- 🎨 제공사 카드 상태별 시각적 표시
- 🎨 통계 카드 MetricCard 디자인 적용
- 🗑️ "전체 보기" 기능 삭제
- 🔧 탭 전환 시 첫 번째 제공사 자동 선택

### v1.0.0 (2025-01-10)
- 🎉 초기 릴리즈
- Invest + OroPlay 이중 API 지원
- 5개 탭 구조 (관리자)
- 3개 탭 구조 (사용자)
- 게임 상태 관리 (visible/maintenance/hidden)

---

## 참고 문서

- `/guidelines/Guidelines.md`: Invest API 명세
- `/guidelines/oroplayapi.md`: OroPlay API 명세
- `/guidelines/add_api_policy.md`: 이중 API 정책
- `/guidelines/seamless_wallet_integration.md`: Seamless Wallet 통합
- `/guidelines/menufunction.md`: 7단계 권한 체계
