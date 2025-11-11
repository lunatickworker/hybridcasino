# 지갑 관리 시스템 - DB 스키마 정의서

## 작성일: 2025-01-06
## 버전: 1.0

---

## 📋 개요

보유금 관리 시스템의 핵심 테이블 4개를 정리한 문서입니다.

### 핵심 테이블:
1. **partners** - 파트너 정보 및 보유금
2. **users** - 사용자 정보 및 보유금
3. **api_configs** - 외부 API 설정 및 잔고 (Lv1만)
4. **transactions** - 모든 입출금 거래 기록

---

## 1️⃣ partners 테이블 (파트너 정보)

### 용도
7단계 권한 체계(Lv1~Lv6)의 파트너 정보 및 보유금 관리

### 스키마

```sql
CREATE TABLE partners (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,                    -- 로그인 아이디
  nickname TEXT NOT NULL,                           -- 표시명
  password TEXT NOT NULL,                            -- 암호화된 비밀번호
  name TEXT,                                         -- 실명
  
  -- 계층 정보
  partner_type TEXT NOT NULL,                        -- 'system_admin' | 'head_office' | 'main_office' | 'sub_office' | 'distributor' | 'store'
  level INTEGER NOT NULL,                            -- 1(시스템관리자) ~ 6(매장)
  parent_id UUID REFERENCES partners(id),            -- 상위 파트너 ID
  parent_chain UUID[],                               -- 상위 파트너 체인 배열 (빠른 조회용)
  
  -- ⭐ 보유금 관련 (핵심)
  balance DECIMAL(15,2) DEFAULT 0,                   -- 💰 GMS 내부 보유금 (Lv3~Lv6만 사용)
  invest_balance DECIMAL(15,2) DEFAULT 0,            -- 💰 Invest API 보유금 (Lv2만 사용)
  oroplay_balance DECIMAL(15,2) DEFAULT 0,           -- 💰 OroPlay API 보유금 (Lv2만 사용)
  
  -- 상태
  status TEXT DEFAULT 'active',                      -- 'active' | 'inactive' | 'blocked'
  
  -- 수수료 설정
  commission_rolling DECIMAL(5,2) DEFAULT 0,         -- 롤링 수수료율 (%)
  commission_losing DECIMAL(5,2) DEFAULT 0,          -- 루징 수수료율 (%)
  withdrawal_fee DECIMAL(15,2) DEFAULT 0,            -- 출금 수수료
  
  -- 은행 정보
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  
  -- 메모
  memo TEXT,
  
  -- 타임스탬프
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_partners_parent_id ON partners(parent_id);
CREATE INDEX idx_partners_level ON partners(level);
CREATE INDEX idx_partners_status ON partners(status);
CREATE INDEX idx_partners_partner_type ON partners(partner_type);
```

### 보유금 사용 규칙

| 레벨 | 타입 | 사용하는 보유금 컬럼 | 설명 |
|------|------|---------------------|------|
| **Lv1** (시스템관리자) | system_admin | ❌ 없음 | api_configs 테이블 사용 |
| **Lv2** (대본사) | head_office | `invest_balance`<br>`oroplay_balance` | API별 2개 지갑 |
| **Lv3** (본사) | main_office | `balance` | 단일 지갑 |
| **Lv4** (부본사) | sub_office | `balance` | 단일 지갑 |
| **Lv5** (총판) | distributor | `balance` | 단일 지갑 |
| **Lv6** (매장) | store | `balance` | 단일 지갑 |

---

## 2️⃣ users 테이블 (사용자 정보)

### 용도
일반 사용자(Lv7) 정보 및 보유금 관리

### 스키마

```sql
CREATE TABLE users (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,                    -- 로그인 아이디
  nickname TEXT NOT NULL,                           -- 표시명
  password TEXT NOT NULL,                            -- 암호화된 비밀번호
  
  -- 소속 정보
  referrer_id UUID REFERENCES partners(id),         -- 소속 파트너 ID
  
  -- ⭐ 보유금 관련 (핵심)
  balance DECIMAL(15,2) DEFAULT 0,                   -- 💰 GMS 내부 보유금 (Seamless Wallet)
  points INTEGER DEFAULT 0,                          -- 🎁 포인트 (보너스)
  
  -- 상태
  status TEXT DEFAULT 'pending',                     -- 'pending' | 'active' | 'blocked'
  is_online BOOLEAN DEFAULT FALSE,                   -- 온라인 여부
  
  -- VIP 등급
  vip_level INTEGER DEFAULT 0,                       -- 0(일반) ~ 5(VIP5)
  
  -- 은행 정보
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  
  -- 연락처
  email TEXT,
  phone TEXT,
  
  -- 메모
  memo TEXT,
  
  -- 타임스탬프
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_users_referrer_id ON users(referrer_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_is_online ON users(is_online);
CREATE INDEX idx_users_username ON users(username);
```

### 보유금 사용 규칙

| 컬럼 | 용도 | 업데이트 시점 |
|------|------|--------------|
| `balance` | 게임 플레이 가능한 실제 보유금 | 입출금 승인 시<br>게임 시작/종료 시 |
| `points` | 보너스 포인트 (게임 불가) | 포인트 지급 시<br>포인트→보유금 전환 시 |

---

## 3️⃣ api_configs 테이블 (외부 API 설정)

### 용도
Lv1 (시스템관리자)의 외부 API credentials 및 잔고 관리

### 스키마

```sql
CREATE TABLE api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id) UNIQUE,   -- Lv1 파트너 ID (시스템관리자만)
  
  -- ⭐ Invest API 설정
  invest_opcode TEXT,                                -- Invest API OPCODE
  invest_secret_key TEXT,                            -- Invest API Secret Key
  invest_token TEXT,                                 -- Invest API Token (영구)
  invest_balance DECIMAL(15,2) DEFAULT 0,            -- 💰 Invest API 잔고
  
  -- ⭐ OroPlay API 설정
  oroplay_client_id TEXT,                            -- OroPlay Client ID
  oroplay_client_secret TEXT,                        -- OroPlay Client Secret
  oroplay_token TEXT,                                -- OroPlay Token (갱신 필요)
  oroplay_token_expires_at TIMESTAMPTZ,              -- OroPlay Token 만료 시간
  oroplay_balance DECIMAL(15,2) DEFAULT 0,           -- 💰 OroPlay API 잔고
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE UNIQUE INDEX idx_api_configs_partner_id ON api_configs(partner_id);
```

### 보유금 사용 규칙

| 레벨 | 사용 여부 | 설명 |
|------|----------|------|
| **Lv1** (시스템관리자) | ✅ 사용 | `invest_balance` + `oroplay_balance`로 2개 지갑 관리 |
| **Lv2 이하** | ❌ 사용 안 함 | partners 테이블 사용 |

### 잔고 동기화

**30초 주기 자동 동기화 (Lv1만)**:
```typescript
// BalanceContext.tsx - Lv1만 실행
setInterval(() => {
  // 1. Invest API: GET /api/info → invest_balance 업데이트
  // 2. OroPlay API: GET /agent/balance → oroplay_balance 업데이트
}, 30000);
```

---

## 4️⃣ transactions 테이블 (거래 기록)

### 용도
모든 입출금 거래 기록 및 트리거를 통한 자동 잔고 업데이트

### 스키마

```sql
CREATE TABLE transactions (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),                -- 사용자 ID (필수)
  partner_id UUID REFERENCES partners(id),          -- 소속 파트너 ID (선택)
  
  -- 거래 정보
  transaction_type TEXT NOT NULL,                    -- 'deposit' | 'withdrawal' | 'admin_deposit' | 'admin_withdrawal' | 'point_conversion'
  amount DECIMAL(15,2) NOT NULL,                     -- 거래 금액
  
  -- 상태
  status TEXT DEFAULT 'pending',                     -- 'pending' | 'approved' | 'rejected' | 'completed'
  
  -- 잔고 스냅샷
  balance_before DECIMAL(15,2) DEFAULT 0,            -- 거래 전 잔고
  balance_after DECIMAL(15,2) DEFAULT 0,             -- 거래 후 잔고
  
  -- 은행 정보 (입출금 시)
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  
  -- 메모
  memo TEXT,
  
  -- 처리 정보
  processed_by UUID REFERENCES partners(id),         -- 처리한 관리자 ID
  processed_at TIMESTAMPTZ,                          -- 처리 시각
  
  -- 외부 API 응답 (디버깅용)
  external_response JSONB,
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_partner_id ON transactions(partner_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_transaction_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
```

### 트랜잭션 타입

| 타입 | 설명 | 누가 생성? | 자동 잔고 업데이트 |
|------|------|-----------|------------------|
| `deposit` | 사용자 입금 신청 | 사용자 | ✅ 승인 시 users.balance += amount |
| `withdrawal` | 사용자 출금 신청 | 사용자 | ✅ 승인 시 users.balance -= amount |
| `admin_deposit` | 관리자 강제 입금 | 관리자 | ✅ 즉시 users.balance += amount |
| `admin_withdrawal` | 관리자 강제 출금 | 관리자 | ✅ 즉시 users.balance -= amount |
| `point_conversion` | 포인트→보유금 전환 | 사용자 | ✅ 즉시 users.balance += amount |

### 자동 잔고 업데이트 트리거

```sql
-- transactions INSERT 시 자동으로 users.balance 업데이트
CREATE TRIGGER update_user_balance_on_transaction
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION auto_update_user_balance();

-- 트리거 함수
CREATE OR REPLACE FUNCTION auto_update_user_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- status가 'completed'인 경우에만 실행
  IF NEW.status = 'completed' THEN
    -- 입금 타입
    IF NEW.transaction_type IN ('deposit', 'admin_deposit', 'point_conversion') THEN
      UPDATE users 
      SET balance = balance + NEW.amount,
          updated_at = NOW()
      WHERE id = NEW.user_id;
    
    -- 출금 타입
    ELSIF NEW.transaction_type IN ('withdrawal', 'admin_withdrawal') THEN
      UPDATE users 
      SET balance = balance - NEW.amount,
          updated_at = NOW()
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 💰 보유금 흐름도

### 1. 사용자 입금 플로우

```
[사용자] 입금 신청 (10,000원)
    ↓
transactions INSERT
  - user_id: [사용자 ID]
  - transaction_type: 'deposit'
  - amount: 10000
  - status: 'pending'
  - balance_before: 50000
  - balance_after: 50000  (승인 전에는 변동 없음)
    ↓
[관리자] 승인
    ↓
Invest API: POST /api/account/balance
  - opcode: [대본사 OPCODE]
  - username: [사용자명]
  - amount: 10000
    ↓
API 성공 → transactions UPDATE
  - status: 'completed'
  - processed_by: [관리자 ID]
  - processed_at: NOW()
    ↓
✅ 트리거 자동 실행
  - users.balance: 50000 + 10000 = 60000
  - balance_after: 60000 (스냅샷 업데이트)
    ↓
✅ Realtime 이벤트 발생 → 사용자 화면 즉시 업데이트
```

### 2. 사용자 출금 플로우

```
[사용자] 출금 신청 (20,000원)
    ↓
보유금 검증: balance >= 20000?
    ↓
비밀번호 확인
    ↓
transactions INSERT
  - user_id: [사용자 ID]
  - transaction_type: 'withdrawal'
  - amount: 20000
  - status: 'pending'
  - balance_before: 60000
  - balance_after: 60000
    ↓
[관리자] 승인
    ↓
Invest API: PUT /api/account/balance
  - opcode: [대본사 OPCODE]
  - username: [사용자명]
  - amount: 20000
    ↓
API 성공 → transactions UPDATE
  - status: 'completed'
  - processed_by: [관리자 ID]
  - processed_at: NOW()
    ↓
✅ 트리거 자동 실행
  - users.balance: 60000 - 20000 = 40000
  - balance_after: 40000
    ↓
✅ Realtime 이벤트 발생 → 사용자 화면 즉시 업데이트
```

### 3. 관리자 강제 입금 플로우

```
[관리자] 사용자에게 강제 입금 (5,000원)
    ↓
Invest API: POST /api/account/balance
  - opcode: [대본사 OPCODE]
  - username: [사용자명]
  - amount: 5000
    ↓
API 성공 → transactions INSERT
  - user_id: [사용자 ID]
  - transaction_type: 'admin_deposit'
  - amount: 5000
  - status: 'completed'  (즉시 완료)
  - balance_before: 40000
  - balance_after: 45000
  - processed_by: [관리자 ID]
  - processed_at: NOW()
    ↓
✅ 트리거 자동 실행
  - users.balance: 40000 + 5000 = 45000
    ↓
✅ Realtime 이벤트 발생 → 사용자 화면 즉시 업데이트
```

---

## 🔄 Realtime 동기화

### Realtime Subscription 구독 대상

```typescript
// BalanceContext.tsx에서 구독

// 1. partners 테이블 (모든 레벨)
supabase.channel(`partner_balance_${user.id}`)
  .on('postgres_changes', {
    table: 'partners',
    filter: `id=eq.${user.id}`
  })
  .subscribe();

// 2. api_configs 테이블 (Lv1, Lv2만)
supabase.channel(`api_configs_${user.id}`)
  .on('postgres_changes', {
    table: 'api_configs',
    filter: `partner_id=eq.${user.id}`
  })
  .subscribe();

// 3. transactions 테이블 (사용자 개별)
supabase.channel(`deposit_updates_${user.id}`)
  .on('postgres_changes', {
    table: 'transactions',
    filter: `user_id=eq.${user.id}`
  })
  .subscribe();
```

### Realtime 이벤트 처리 순서

```
1. transactions INSERT/UPDATE
    ↓
2. 트리거 실행: users.balance 자동 업데이트
    ↓
3. Realtime 이벤트 발생 (postgres_changes)
    ↓
4. 프론트엔드 구독 감지
    ↓
5. React State 즉시 업데이트
    ↓
6. UI 자동 반영 (UserHeader 보유금 표시 등)
```

---

## 📊 보유금 조회 쿼리 예시

### Lv1 (시스템관리자) 보유금 조회

```sql
-- api_configs 테이블에서 조회
SELECT 
  invest_balance,
  oroplay_balance,
  (invest_balance + oroplay_balance) AS total_balance
FROM api_configs
WHERE partner_id = '[Lv1 파트너 ID]';
```

### Lv2 (대본사) 보유금 조회

```sql
-- partners 테이블에서 조회
SELECT 
  invest_balance,
  oroplay_balance,
  (invest_balance + oroplay_balance) AS total_balance
FROM partners
WHERE id = '[Lv2 파트너 ID]';
```

### Lv3~Lv6 (파트너) 보유금 조회

```sql
-- partners 테이블에서 조회
SELECT 
  balance AS total_balance
FROM partners
WHERE id = '[파트너 ID]';
```

### Lv7 (사용자) 보유금 조회

```sql
-- users 테이블에서 조회
SELECT 
  balance,
  points
FROM users
WHERE id = '[사용자 ID]';
```

---

## ⚠️ 주의사항

### 1. NaN 방지
모든 balance 파싱 시 타입 체크 + NaN 체크 필수:
```typescript
const balance = typeof rawBalance === 'number' && !isNaN(rawBalance) 
  ? rawBalance 
  : 0;
```

### 2. 트랜잭션 원자성
입출금 처리는 반드시 원자적 트랜잭션으로 처리:
```typescript
// 잘못된 예: 순차 처리
await investApi.deposit(username, amount);  // API 성공
await supabase.from('transactions').insert(...);  // DB 실패 → 불일치!

// 올바른 예: API 성공 후 DB 처리, 실패 시 롤백
try {
  const apiResult = await investApi.deposit(username, amount);
  if (!apiResult.success) throw new Error('API 실패');
  
  await supabase.from('transactions').insert(...);
} catch (error) {
  // API는 성공했지만 DB 실패 시 수동 롤백 필요
  await investApi.withdraw(username, amount);  // API 롤백
  throw error;
}
```

### 3. 동시성 제어
- 출금 신청 시 진행 중인 출금 체크 필수 (중복 방지)
- 입금 신청도 동일한 로직 추가 권장

### 4. 금액 정수 변환
Guidelines.md 정책에 따라 모든 금액은 정수로 변환:
```typescript
const amount = Math.floor(parseFloat(rawAmount));
```

---

## 📎 관련 문서

- `/guidelines/Guidelines.md` - Invest API 명세
- `/guidelines/seamless_wallet_integration.md` - Seamless Wallet 설계
- `/guidelines/add_api_policy.md` - API 정책
- `/guidelines/oroplayapi.md` - OroPlay API 명세
- `/docs/wallet-management/WALLET_SYSTEM_INSPECTION_REPORT.md` - 시스템 점검 리포트

---

**최종 업데이트**: 2025-01-06  
**다음 업데이트**: 실제 Supabase 스키마 확인 후 수정
