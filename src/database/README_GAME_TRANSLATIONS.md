# 게임 다국어 지원 시스템

## 📋 개요

게임(games)과 게임 제공사(game_providers) 테이블에 다국어 지원을 추가하여 한국어/영어 이름을 저장하고 관리할 수 있도록 확장합니다.

## 🗄️ 데이터베이스 스키마 변경사항

### 1. game_providers 테이블

```sql
ALTER TABLE game_providers ADD COLUMN name_ko TEXT;  -- 한국어 이름
ALTER TABLE game_providers ADD COLUMN name_en TEXT;  -- 영어 이름
```

**컬럼 구조:**
- `name`: 기본 이름 (호환성 유지용)
- `name_ko`: 한국어 이름
- `name_en`: 영어 이름 (API 응답에서 제공)

### 2. games 테이블

```sql
ALTER TABLE games ADD COLUMN name_ko TEXT;  -- 한국어 이름
ALTER TABLE games ADD COLUMN name_en TEXT;  -- 영어 이름
```

**컬럼 구조:**
- `name`: 기본 이름 (호환성 유지용)
- `name_ko`: 한국어 이름
- `name_en`: 영어 이름 (API 응답에서 제공)

## 🚀 설치 방법

### SQL 실행

```bash
# Supabase SQL 에디터에서 실행
psql -h [host] -U [user] -d [database] -f /database/1100_add_game_translations.sql
```

또는 Supabase Dashboard의 SQL Editor에서 `/database/1100_add_game_translations.sql` 파일의 내용을 복사하여 실행합니다.

## 💻 사용 방법

### 1. API 동기화 시 영어 이름 저장

#### Invest API

```typescript
// investApi.ts - 게임 목록 조회 시
const response = await fetch(`${BASE_URL}/api/game/lists`, {
  method: 'GET',
  body: JSON.stringify({
    opcode: opcode,
    provider_id: providerId,
    signature: signature
  })
});

const games = await response.json();

// DB에 저장
for (const game of games) {
  await supabase
    .from('games')
    .upsert({
      game_id: game.id,
      provider_id: providerUuid,
      name: game.name,           // 기본값 (한국어)
      name_ko: game.name_ko || game.name,  // 한국어 이름
      name_en: game.name_en || game.name,  // 영어 이름 (API에서 제공)
      api_type: 'invest',
      type: gameType,
      status: 'visible'
    });
}
```

#### OroPlay API

```typescript
// oroplayApi.ts - 게임 목록 조회 시
const response = await fetch(`${BASE_URL}/game/list`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    provider: providerId,
    type: gameType
  })
});

const games = await response.json();

// DB에 저장
for (const game of games.data) {
  await supabase
    .from('games')
    .upsert({
      game_id: game.game_id,
      provider_id: providerUuid,
      name: game.game_name,         // 기본값 (영어일 수 있음)
      name_ko: game.game_name_ko,   // 한국어 이름 (번역 필요 시)
      name_en: game.game_name,      // 영어 이름
      api_type: 'oroplay',
      type: gameType,
      status: 'visible'
    });
}
```

### 2. 프론트엔드에서 언어별 조회

#### React 컴포넌트에서 사용

```typescript
import { useLanguage } from '../contexts/LanguageContext';

function GameList() {
  const { language } = useLanguage();
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    loadGames();
  }, [language]);

  const loadGames = async () => {
    const { data } = await supabase
      .from('games')
      .select(`
        *,
        game_providers (
          name,
          name_ko,
          name_en
        )
      `)
      .eq('status', 'visible');

    setGames(data || []);
  };

  return (
    <div>
      {games.map(game => (
        <div key={game.id}>
          {/* 언어에 따라 적절한 이름 표시 */}
          <h3>
            {language === 'en' 
              ? (game.name_en || game.name) 
              : (game.name_ko || game.name)
            }
          </h3>
          <p>
            Provider: {language === 'en' 
              ? (game.game_providers.name_en || game.game_providers.name)
              : (game.game_providers.name_ko || game.game_providers.name)
            }
          </p>
        </div>
      ))}
    </div>
  );
}
```

#### 헬퍼 함수 사용

```typescript
// utils/gameUtils.ts
export function getGameName(game: Game, language: 'ko' | 'en'): string {
  if (language === 'en') {
    return game.name_en || game.name || game.name_ko || 'Unknown';
  }
  return game.name_ko || game.name || game.name_en || '이름 없음';
}

export function getProviderName(provider: GameProvider, language: 'ko' | 'en'): string {
  if (language === 'en') {
    return provider.name_en || provider.name || provider.name_ko || 'Unknown';
  }
  return provider.name_ko || provider.name || provider.name_en || '제공사 없음';
}

// 컴포넌트에서 사용
import { getGameName, getProviderName } from '../utils/gameUtils';

function GameCard({ game }: { game: Game }) {
  const { language } = useLanguage();
  
  return (
    <div>
      <h3>{getGameName(game, language)}</h3>
      <p>{getProviderName(game.provider, language)}</p>
    </div>
  );
}
```

### 3. SQL 함수 사용

```sql
-- 언어별 게임 이름 조회
SELECT get_game_name(id, 'en') as game_name_en
FROM games
WHERE status = 'visible';

-- 언어별 제공사 이름 조회
SELECT get_provider_name(id, 'ko') as provider_name_ko
FROM game_providers
WHERE status = 'visible';
```

### 4. 뷰 사용

```typescript
// 다국어 지원 뷰 사용
const { data: games } = await supabase
  .from('v_games_i18n')
  .select('*')
  .eq('status', 'visible');

// games 배열은 자동으로 name_ko, name_en 포함
games.forEach(game => {
  console.log('한국어:', game.name_ko);
  console.log('영어:', game.name_en);
  console.log('제공사(한국어):', game.provider_name_ko);
  console.log('제공사(영어):', game.provider_name_en);
});
```

## 🔄 데이터 마이그레이션

### 기존 데이터 처리

SQL 마이그레이션을 실행하면 자동으로 기존 `name` 컬럼의 데이터가 `name_ko`로 복사됩니다:

```sql
-- 자동 실행됨
UPDATE game_providers 
SET name_ko = name 
WHERE name_ko IS NULL AND name IS NOT NULL;

UPDATE games 
SET name_ko = name 
WHERE name_ko IS NULL AND name IS NOT NULL;
```

### 영어 이름 추가

API 동기화를 다시 실행하여 영어 이름을 채웁니다:

```typescript
// 관리자 페이지에서 실행
// EnhancedGameManagement.tsx

// 1. Invest 동기화 버튼 클릭
await syncInvestGames();

// 2. OroPlay 동기화 버튼 클릭
await syncOroPlayGames();
```

## 📊 데이터 구조 예시

### game_providers 테이블

| id | provider_id | name | name_ko | name_en | api_type | type |
|----|-------------|------|---------|---------|----------|------|
| uuid-1 | 41 | 에볼루션 게이밍 | 에볼루션 게이밍 | Evolution Gaming | invest | casino |
| uuid-2 | 300 | 프라그마틱 플레이 | 프라그마틱 플레이 | Pragmatic Play | invest | slot |
| uuid-3 | 75 | 넷엔트 | 넷엔트 | NetEnt | invest | slot |

### games 테이블

| id | game_id | name | name_ko | name_en | provider_id | type |
|----|---------|------|---------|---------|-------------|------|
| uuid-a | 300001 | 스위트 보난자 | 스위트 보난자 | Sweet Bonanza | uuid-2 | slot |
| uuid-b | 300002 | 게이츠 오브 올림푸스 | 게이츠 오브 올림푸스 | Gates of Olympus | uuid-2 | slot |
| uuid-c | 75001 | 스타버스트 | 스타버스트 | Starburst | uuid-3 | slot |

## 🎯 TypeScript 타입 정의

```typescript
// /types/index.ts

export interface GameProvider {
  id: string;
  provider_id?: number;
  name: string;
  name_ko?: string;  // 한국어 이름
  name_en?: string;  // 영어 이름
  api_type: 'invest' | 'oroplay';
  type: 'slot' | 'casino' | 'minigame';
  status: 'visible' | 'hidden' | 'maintenance';
  is_visible?: boolean;
  logo_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Game {
  id: string;
  game_id: number;
  provider_id: string;
  name: string;
  name_ko?: string;  // 한국어 이름
  name_en?: string;  // 영어 이름
  api_type: 'invest' | 'oroplay';
  type: 'slot' | 'casino' | 'minigame';
  status: 'visible' | 'hidden' | 'maintenance';
  is_visible?: boolean;
  thumbnail_url?: string;
  demo_available?: boolean;
  created_at?: string;
  updated_at?: string;
  // 조인된 제공사 정보
  provider_name_ko?: string;
  provider_name_en?: string;
}
```

## 🌍 번역 키

### 한국어 (ko.ts)

```typescript
gameManagement: {
  providerNameKo: '제공사명(한국어)',
  providerNameEn: '제공사명(영어)',
  gameNameKo: '게임명(한국어)',
  gameNameEn: '게임명(영어)',
  // ...
}
```

### 영어 (en.ts)

```typescript
gameManagement: {
  providerNameKo: 'Provider Name (Korean)',
  providerNameEn: 'Provider Name (English)',
  gameNameKo: 'Game Name (Korean)',
  gameNameEn: 'Game Name (English)',
  // ...
}
```

## ⚠️ 주의사항

### 1. NULL 처리

항상 NULL 체크와 폴백을 사용하세요:

```typescript
const gameName = language === 'en' 
  ? (game.name_en || game.name || game.name_ko || 'Unknown')
  : (game.name_ko || game.name || game.name_en || '이름 없음');
```

### 2. API 응답 확인

API에서 영어 이름을 제공하지 않는 경우도 있으므로, 항상 기본값을 설정하세요:

```typescript
name_en: apiResponse.name_en || apiResponse.name || null
```

### 3. 성능 최적화

대량의 게임 목록을 조회할 때는 뷰를 사용하세요:

```typescript
// ✅ 권장: 뷰 사용
const { data } = await supabase
  .from('v_games_i18n')
  .select('*');

// ⚠️ 비권장: 매번 조인
const { data } = await supabase
  .from('games')
  .select(`
    *,
    game_providers (name, name_ko, name_en)
  `);
```

### 4. 기존 코드 호환성

기존 `name` 컬럼은 유지되므로 이전 코드도 계속 작동합니다:

```typescript
// 기존 코드 (계속 작동)
const gameName = game.name;

// 새 코드 (다국어 지원)
const gameName = language === 'en' ? game.name_en : game.name_ko;
```

## 📚 관련 파일

- `/database/1100_add_game_translations.sql` - 스키마 마이그레이션
- `/types/index.ts` - TypeScript 타입 정의
- `/translations/ko.ts` - 한국어 번역
- `/translations/en.ts` - 영어 번역
- `/contexts/LanguageContext.tsx` - 언어 컨텍스트

## 🔗 관련 문서

- `/database/1001_complete_menu_translations.sql` - 메뉴 다국어 시스템
- `/database/README_TRANSLATION_SQL.md` - 메뉴 번역 가이드
- `/translations/README.md` - 번역 시스템 개요
- `/TRANSLATION_STATUS.md` - 번역 진행 상황

---

**최종 업데이트**: 2025-01-11  
**다음 작업**: API 동기화 로직에 영어 이름 저장 기능 추가
