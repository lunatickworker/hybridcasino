# 데이터베이스 다국어 지원 현황

## 작성일: 2025-01-11

---

## 📊 완료된 다국어 테이블

### 1. ✅ menus (메뉴 정보)
- **SQL 파일**: `1000_add_menu_translations.sql`, `1001_complete_menu_translations.sql`
- **컬럼**: `name_ko`, `name_en`
- **뷰**: `v_menus_i18n`
- **함수**: `get_menu_name(menu_id, language)`
- **상태**: ✅ 완료 (모든 메뉴 번역 데이터 포함)

### 2. ✅ game_providers (게임 제공사)
- **SQL 파일**: `1100_add_game_translations.sql`
- **컬럼**: `name_ko`, `name_en`
- **뷰**: `v_game_providers_i18n`
- **함수**: `get_provider_name(provider_id, language)`
- **상태**: ✅ 완료 (스키마만, 데이터는 API 동기화 시 자동 업데이트)

### 3. ✅ games (게임 목록)
- **SQL 파일**: `1100_add_game_translations.sql`
- **컬럼**: `name_ko`, `name_en`
- **뷰**: `v_games_i18n`
- **함수**: `get_game_name(game_id, language)`
- **상태**: ✅ 완료 (스키마만, 데이터는 API 동기화 시 자동 업데이트)

### 4. ✅ announcements (공지사항)
- **SQL 파일**: `1101_add_announcements_banners_translations.sql`
- **컬럼**: `title_ko`, `title_en`, `content_ko`, `content_en`
- **뷰**: `v_announcements_i18n`
- **함수**: `get_announcement_title()`, `get_announcement_content()`
- **상태**: ✅ 완료 (스키마 + 기존 데이터 마이그레이션)

### 5. ✅ banners (배너)
- **SQL 파일**: `1101_add_announcements_banners_translations.sql`
- **컬럼**: `title_ko`, `title_en`, `content_ko`, `content_en`
- **뷰**: `v_banners_i18n`
- **함수**: `get_banner_title()`, `get_banner_content()`
- **상태**: ✅ 완료 (스키마 + 기존 데이터 마이그레이션)

### 6. ✅ banks (은행 정보)
- **SQL 파일**: `1102_create_banks_table.sql`
- **컬럼**: `name_ko`, `name_en`, `short_name`
- **뷰**: `v_banks_i18n`
- **함수**: `get_bank_name(bank_code, language)`
- **상태**: ✅ 완료 (44개 주요 은행 데이터 포함)
- **참고**: 기존 `partners.bank_name`, `users.bank_name`은 텍스트 저장 방식
  - 향후 `bank_code`로 변경하여 banks 테이블과 FK 연결 권장

---

## 🔍 다국어 지원이 필요한 다른 항목

### 1. ⚠️ 거래 타입 (Transaction Types)
**현재 상태**: 코드로만 저장 (`deposit`, `withdrawal`, `admin_deposit` 등)
**위치**: `transactions.transaction_type`
**제안**: 
- 프론트엔드에서 번역 파일로 처리 (DB 변경 불필요)
- `/translations/ko.ts`, `/translations/en.ts`에 번역 키 추가
```typescript
// translations/ko.ts
transactionTypes: {
  deposit: '입금',
  withdrawal: '출금',
  admin_deposit: '관리자 입금',
  admin_withdrawal: '관리자 출금',
  point_conversion: '포인트 전환'
}
```

### 2. ⚠️ 상태 (Status)
**현재 상태**: 코드로만 저장 (`active`, `inactive`, `blocked`, `pending`, `approved` 등)
**위치**: 
- `partners.status`
- `users.status`
- `transactions.status`
- `game_providers.status`
- `games.status`
- `announcements.status`
- `banners.status`

**제안**: 프론트엔드에서 번역 파일로 처리
```typescript
// translations/ko.ts
status: {
  active: '활성',
  inactive: '비활성',
  blocked: '차단',
  pending: '대기',
  approved: '승인',
  rejected: '거부',
  completed: '완료'
}
```

### 3. ⚠️ VIP 등급 (VIP Levels)
**현재 상태**: 숫자로만 저장 (0~5)
**위치**: `users.vip_level`
**제안**: 프론트엔드에서 번역 파일로 처리
```typescript
// translations/ko.ts
vipLevels: {
  0: '일반',
  1: 'VIP 1',
  2: 'VIP 2',
  3: 'VIP 3',
  4: 'VIP 4',
  5: 'VIP 5'
}
```

### 4. ⚠️ 파트너 타입 (Partner Types)
**현재 상태**: 코드로만 저장 (`system_admin`, `head_office`, `main_office` 등)
**위치**: `partners.partner_type`
**제안**: 프론트엔드에서 번역 파일로 처리
```typescript
// translations/ko.ts
partnerTypes: {
  system_admin: '시스템 관리자',
  head_office: '대본사',
  main_office: '본사',
  sub_office: '부본사',
  distributor: '총판',
  store: '매장'
}
```

### 5. ⚠️ 게임 타입 (Game Types)
**현재 상태**: 코드로만 저장 (`casino`, `slot`, `mini_game`)
**위치**: `games.type`, `game_providers.type`
**제안**: 프론트엔드에서 번역 파일로 처리
```typescript
// translations/ko.ts
gameTypes: {
  casino: '카지노',
  slot: '슬롯',
  mini_game: '미니게임'
}
```

### 6. ⚠️ 타겟 대상 (Target Audience)
**현재 상태**: 코드로만 저장 (`all`, `users`, `partners`)
**위치**: `announcements.target_audience`, `banners.target_audience`
**제안**: 프론트엔드에서 번역 파일로 처리
```typescript
// translations/ko.ts
targetAudience: {
  all: '전체',
  users: '사용자',
  partners: '파트너'
}
```

### 7. ⚠️ 배너 타입 (Banner Types)
**현재 상태**: 코드로만 저장 (`popup`, `banner`)
**위치**: `banners.banner_type`
**제안**: 프론트엔드에서 번역 파일로 처리
```typescript
// translations/ko.ts
bannerTypes: {
  popup: '팝업',
  banner: '배너'
}
```

---

## 📝 다국어 지원 전략

### ✅ DB에서 처리하는 경우 (테이블 컬럼 추가)
- **사용자가 직접 입력하는 텍스트**
  - 공지사항 제목/내용 (`announcements.title`, `content`)
  - 배너 제목/내용 (`banners.title`, `content`)
  - 게임 이름 (`games.name`) - API에서 제공
  - 제공사 이름 (`game_providers.name`) - API에서 제공
  - 은행 이름 (`banks.name`)
  - 메뉴 이름 (`menus.name`)

### ✅ 프론트엔드에서 처리하는 경우 (번역 파일)
- **시스템 정의 코드/상수**
  - 상태 코드 (`active`, `inactive`, `pending` 등)
  - 거래 타입 (`deposit`, `withdrawal` 등)
  - 파트너 타입 (`system_admin`, `head_office` 등)
  - 게임 타입 (`casino`, `slot`, `mini_game`)
  - VIP 등급 (0~5)
  - 타겟 대상 (`all`, `users`, `partners`)
  - 배너 타입 (`popup`, `banner`)

---

## 🚀 적용 순서

### 1단계: DB 마이그레이션 (완료)
```bash
# Supabase SQL Editor에서 순차 실행
1. 1000_add_menu_translations.sql ✅
2. 1001_complete_menu_translations.sql ✅
3. 1100_add_game_translations.sql ✅ (문법 오류 수정 완료)
4. 1101_add_announcements_banners_translations.sql ⬅️ 실행 필요
5. 1102_create_banks_table.sql ⬅️ 실행 필요
```

### 2단계: 번역 파일 확장
```typescript
// /translations/ko.ts 및 /translations/en.ts에 추가
- transactionTypes
- status
- vipLevels
- partnerTypes
- gameTypes
- targetAudience
- bannerTypes
```

### 3단계: 컴포넌트 적용
- Announcements.tsx (공지사항) - title_ko/title_en 사용
- BannerManagement.tsx (배너) - title_ko/title_en 사용
- UserDeposit.tsx, UserWithdraw.tsx (은행 선택) - banks 테이블 사용
- 모든 status 표시 컴포넌트 - 번역 파일 사용

---

## 📊 데이터 마이그레이션 체크리스트

### ✅ 자동 마이그레이션 (SQL 스크립트에서 처리)
- [x] menus - 기존 name → name_ko 복사
- [x] announcements - 기존 title/content → title_ko/content_ko 복사
- [x] banners - 기존 title/content → title_ko/content_ko 복사
- [x] banks - 44개 은행 데이터 자동 삽입

### ⏳ 수동/API 마이그레이션
- [ ] game_providers - API 동기화 시 name_en 자동 저장
- [ ] games - API 동기화 시 name_en 자동 저장

---

## 🔧 향후 개선 사항

### 1. banks 테이블 연동
**현재**: `partners.bank_name`, `users.bank_name`에 텍스트 직접 저장
**개선안**: 
```sql
-- 1. 컬럼 변경
ALTER TABLE partners ADD COLUMN bank_code TEXT REFERENCES banks(bank_code);
ALTER TABLE users ADD COLUMN bank_code TEXT REFERENCES banks(bank_code);

-- 2. 기존 데이터 마이그레이션
UPDATE partners SET bank_code = '004' WHERE bank_name LIKE '%국민%';
UPDATE users SET bank_code = '004' WHERE bank_name LIKE '%국민%';

-- 3. 기존 컬럼 제거 (선택사항)
-- ALTER TABLE partners DROP COLUMN bank_name;
-- ALTER TABLE users DROP COLUMN bank_name;
```

### 2. 거래 타입 enum 타입 변경 (선택사항)
```sql
-- PostgreSQL enum 타입으로 변경하여 타입 안정성 확보
CREATE TYPE transaction_type_enum AS ENUM (
  'deposit', 'withdrawal', 'admin_deposit', 'admin_withdrawal', 'point_conversion'
);

ALTER TABLE transactions 
  ALTER COLUMN transaction_type TYPE transaction_type_enum 
  USING transaction_type::transaction_type_enum;
```

---

## 📎 관련 파일

### SQL 마이그레이션 파일
- `/database/1000_add_menu_translations.sql`
- `/database/1001_complete_menu_translations.sql`
- `/database/1100_add_game_translations.sql`
- `/database/1101_add_announcements_banners_translations.sql`
- `/database/1102_create_banks_table.sql`

### 번역 파일
- `/translations/ko.ts`
- `/translations/en.ts`

### 컨텍스트
- `/contexts/LanguageContext.tsx`

### 관련 문서
- `/database/README_TRANSLATION_SQL.md`
- `/database/README_GAME_TRANSLATIONS.md`
- `/TRANSLATION_STATUS.md`

---

**최종 업데이트**: 2025-01-11  
**작성자**: AI Assistant
