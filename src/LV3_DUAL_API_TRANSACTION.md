# Lv3 단일 지갑 시스템 완전 가이드

## 📋 문서 개요

**목표**: Lv3 본사는 단일 지갑(balance)만 사용하며, Lv2 대본사로부터 입금 시 Lv2는 변동 없음  
**최종 수정일**: 2025-01-10  
**버전**: v3.0

---

## 🎯 핵심 원칙

### 1. 지갑 구조
| 레벨 | 지갑 개수 | DB 컬럼 | UI 표시 |
|------|----------|---------|--------------|
| Lv1 (시스템관리자) | 2개 | `invest_balance`, `oroplay_balance` | 두 API 분리 표시 |
| Lv2 (대본사) | 2개 | `invest_balance`, `oroplay_balance` | 두 API 분리 표시 |
| **Lv3 (본사)** | **1개** | **`balance`** | **`balance`만 표시** |
| Lv4~6 (파트너) | 1개 | `balance` | `balance` 표시 |
| Lv7 (사용자) | 1개 | `balance`, `points` | `balance`, `points` 표시 |

### 2. 파트너 간 입출금 원칙
- **Lv1**: 변동 없음 (게임 진입/종료 시에만 증감)
- **Lv2**: 
  - Lv3 입금: 변동 없음 (기록만)
  - Lv3 회수: 변동 없음 (기록만)
  - 포인트 지급/회수: 변동 없음 (기록만)
  - 게임 진입/종료: API별 증감
- **Lv3~6**: balance 증감
- **Lv7**: balance, points 증감 + 게임 진입/종료 시 외부 API 호출 → Lv1, Lv2 증감

---

## 💰 입출금 시스템

### 1. Lv2 → Lv3 입금

**입금 제한**: 없음 (Lv1과 같은 로직)

**핵심 원칙**:
- ❌ Lv2는 변동 없음 (두 API 차감 안 함)
- ✅ Lv3 balance만 증가
- ✅ 기록만 남김

**처리**:
```typescript
// Lv3: balance 증가
lv3Balance += amount;

// Lv2: 변동 없음 (기록만)

// 외부 API 호출 없음
```

**예시**:
```
초기:
- Lv2 Invest: 1,000,000원, OroPlay: 500,000원
- Lv3 balance: 300,000원

입금 100,000원:
✅ 성공
- Lv2 Invest: 1,000,000원 (변동 없음)
- Lv2 OroPlay: 500,000원 (변동 없음)
- Lv3 balance: 400,000원
```

---

### 2. Lv2 → Lv3 회수

**회수 제한**: Lv3 balance 범위 내

**핵심 원칙**:
- ❌ Lv2는 변동 없음
- ✅ Lv3 balance만 차감
- ✅ 기록만 남김 (입금할 때도 변동이 없었으니까)

**처리**:
```typescript
// Lv3: balance 차감
lv3Balance -= amount;

// Lv2: 변동 없음 (기록만)

// 외부 API 호출 없음
```

**예시**:
```
초기:
- Lv2 Invest: 1,000,000원, OroPlay: 500,000원
- Lv3 balance: 400,000원

회수 50,000원:
✅ 성공
- Lv2 Invest: 1,000,000원 (변동 없음)
- Lv2 OroPlay: 500,000원 (변동 없음)
- Lv3 balance: 350,000원
```

---

### 3. Lv3~6 → 하위 파트너 입금

**입금 제한**: balance 범위 내

**처리**:
```typescript
// 상위: balance 차감
upperBalance -= amount;

// 하위: balance 증가
lowerBalance += amount;
```

---

### 4. Lv1, Lv2 → Lv7 입금

**특징**: 외부 API 호출 **없음** (게임 진입 시에만 차감)

**처리**:
```typescript
// Lv1, Lv2: 변동 없음
// Lv7: balance 증가
lv7Balance += amount;
```

**게임 진입 시**:
```typescript
// 1. Lv7이 Invest 게임 클릭
// 2. Game launch API 호출
// 3. Lv7 balance → 외부 Invest API 입금
// 4. Lv1 invest_balance -= amount
// 5. Lv2 invest_balance -= amount
```

---

### 5. Lv3~6 → Lv7 입금

**처리**:
```typescript
// 상위: balance 즉시 차감
upperBalance -= amount;

// Lv7: balance 증가
lv7Balance += amount;
```

**게임 진입 시**:
```typescript
// 1. Lv7이 게임 클릭
// 2. Game launch API 호출
// 3. Lv7 balance → 외부 API 입금
// 4. Lv1, Lv2 증감 (사용하는 API에 따라)
```

---

## 🎁 포인트 시스템

### 1. Lv1 포인트 지급

**제한**: ❌ **지급 불가**

**UI**: 포인트 지급 버튼 비활성화 또는 알림 표시

---

### 2. Lv2 포인트 지급

**지급 제한**: 없음 (Lv1과 같은 로직)

**핵심 원칙**:
- ❌ Lv2는 변동 없음
- ✅ Lv7 포인트만 증가
- ✅ 기록만 남김

**처리**:
```typescript
// Lv7: points 증가
lv7Points += pointAmount;

// Lv2: 변동 없음 (기록만)

// 외부 API 호출 없음
```

**포인트 회수**:
```typescript
// Lv7: points 차감
lv7Points -= pointAmount;

// Lv2: 변동 없음 (기록만)
// (포인트 지급할때도 변동이 없었으니까)

// 외부 API 호출 없음
```

**예시**:
```
초기:
- Lv2 Invest: 1,000,000원, OroPlay: 500,000원
- Lv7 Points: 0P

포인트 100P 지급:
✅ 성공
- Lv2 Invest: 1,000,000원 (변동 없음)
- Lv2 OroPlay: 500,000원 (변동 없음)
- Lv7 Points: 100P

포인트 50P 회수:
✅ 성공
- Lv2 변동 없음 (기록만)
- Lv7 Points: 50P
```

---

### 3. Lv3 포인트 지급

**지급 제한**: balance 범위 내

**핵심 원칙**:
- ✅ Lv3 balance 차감
- ❌ Lv2 변동 없음 (기록만)
- ✅ 포인트는 전액을 무조건 전환, 한번 전환되면 롤백 불가

**처리**:
```typescript
// balance 체크
if (pointAmount > lv3Balance) {
  throw new Error('보유금이 부족합니다.');
}

// Lv3: balance 차감
lv3Balance -= pointAmount;

// Lv7: points 증가
lv7Points += pointAmount;

// Lv2: 변동 없음 (기록만)

// 외부 API 호출 없음
```

**포인트 회수**:
```typescript
// Lv7: points 차감
lv7Points -= pointAmount;

// Lv3: balance 증가
lv3Balance += pointAmount;

// Lv2: 변동 없음 (Lv3 balance로 줄 때도 Lv2는 변동 없음. Lv1 로직과 같음)

// 외부 API 호출 없음
```

**예시**:
```
초기:
- Lv3 balance: 1,100,000원
- Lv7 Points: 0P

포인트 100P 지급:
✅ 성공
- Lv3 balance: 1,099,900원
- Lv2 변동 없음 (기록만)
- Lv7 Points: 100P

포인트 50P 회수:
- Lv3 balance: 1,099,950원
- Lv2 변동 없음 (기록만)
- Lv7 Points: 50P
```

---

### 4. Lv4~6 포인트 지급

**지급 제한**: balance 범위 내

**처리**:
```typescript
// 상위: balance 차감
upperBalance -= pointAmount;

// Lv7: points 증가
lv7Points += pointAmount;

// 외부 API 호출 없음
```

**포인트 회수**:
```typescript
// Lv7: points 차감
lv7Points -= pointAmount;

// 상위: balance 증가
upperBalance += pointAmount;

// 외부 API 호출 없음
```

---

### 5. 포인트 → 보유금 전환 (모든 레벨 동일)

**핵심 원칙**:
- ✅ 한번 전환되면 롤백 불가
- ✅ 전액을 무조건 전환 (부분 전환도 가능)
- ❌ 상위 파트너 변동 없음 (Lv2, Lv3 모두)

**처리**:
```typescript
// Lv7: points 차감, balance 증가
lv7Points -= convertAmount;
lv7Balance += convertAmount;

// 외부 API 호출 없음
// 상위 파트너 변동 없음 (Lv2, Lv3 모두)
```

**게임 진입 시**:
```typescript
// 1. Lv7이 게임 클릭
// 2. Game launch API 호출
// 3. Lv7 balance → 외부 API 입금
// 4. Lv1, Lv2 증감 (사용하는 API에 따라)
//    - Invest 게임: lv1InvestBalance -= amount, lv2InvestBalance -= amount
//    - OroPlay 게임: lv1OroplayBalance -= amount, lv2OroplayBalance -= amount
```

---

## 🎮 게임 진입/종료 시스템

### 게임 진입 (모든 레벨 동일)

```typescript
// 1. 사용자가 게임 클릭 (예: Invest API 슬롯 게임)

// 2. Game Launch API 호출

// 3. Lv7 balance → 외부 Invest API 입금 호출
//    - 예: 100원 입금

// 4. Lv1, Lv2 증감
//    - Invest 게임: 
//      lv1InvestBalance -= lv7Balance
//      lv2InvestBalance -= lv7Balance
//    - OroPlay 게임:
//      lv1OroplayBalance -= lv7Balance
//      lv2OroplayBalance -= lv7Balance
//    (Lv3~6은 변동 없음, 이미 입금 시 차감됨)

// 5. 게임 팝업 열림
```

### 게임 종료

```typescript
// 1. 게임 팝업 닫기

// 2. Session status = ended / enforce-ended

// 3. 외부 API 출금 호출

// 4. Lv7 balance 업데이트

// 5. Lv1, Lv2 증감
//    - Invest 게임:
//      lv1InvestBalance += 잔액
//      lv2InvestBalance += 잔액
//    - OroPlay 게임:
//      lv1OroplayBalance += 잔액
//      lv2OroplayBalance += 잔액
```

---

## 📊 통합 예시

### 시나리오 1: Lv2 → Lv7 포인트 지급 후 게임

```
초기 상태:
- Lv1 Invest: 10,000,000원, OroPlay: 15,000,000원
- Lv2 Invest: 1,000,000원, OroPlay: 500,000원
- Lv7 Points: 0P, Balance: 0원

1️⃣ Lv2 → Lv7 포인트 100P 지급
   → Lv2 Invest: 1,000,000원 (변동 없음) ✅
   → Lv2 OroPlay: 500,000원 (변동 없음) ✅
   → Lv7 Points: 100P
   → 외부 API 호출 없음
   → 기록만 남김

2️⃣ Lv7 포인트 → 보유금 전환 (100P → 100원)
   → Lv7 Points: 0P, Balance: 100원
   → 외부 API 호출 없음
   → Lv2 변동 없음

3️⃣ Lv7 Invest 게임 진입
   → Game Launch API 호출
   → 외부 Invest API 입금 100원
   → Lv1 Invest: 9,999,900원 ✅ (게임 진입 시에만 차감)
   → Lv2 Invest: 999,900원 ✅ (게임 진입 시에만 차감)
   → 게임 팝업 열림

4️⃣ Lv7 게임 플레이 (베팅 후 50원 승리)
   → Lv7 게임 내 잔액: 150원

5️⃣ Lv7 게임 종료 (팝업 닫기)
   → Session status: ended
   → 외부 Invest API 출금 150원
   → Lv7 Balance: 150원 ✅
   → Lv1 Invest: 10,000,050원 ✅
   → Lv2 Invest: 1,000,050원 ✅

최종 상태:
- Lv1 Invest: 10,000,050원 (+50원, 순수익)
- Lv2 Invest: 1,000,050원 (+50원, 순수익) ← 게임 진입 시에만 차감됨
- Lv7 Balance: 150원 (+50원, 승리금)

💡 결과: Lv2는 포인트 지급 시 변동 없고, 게임 진입/종료 시에만 차감/증가
```

---

### 시나리오 2: Lv3 → Lv7 포인트 지급 후 게임

```
초기 상태:
- Lv1 Invest: 10,000,000원, OroPlay: 15,000,000원
- Lv2 Invest: 1,000,000원, OroPlay: 500,000원
- Lv3 balance: 1,100,000원
- Lv7 Points: 0P, Balance: 0원

1️⃣ Lv3 → Lv7 포인트 100P 지급
   → Lv3 balance: 1,100,000원 - 100원 = 1,099,900원
   → Lv2 변동 없음 (기록만) ✅
   → Lv7 Points: 100P
   → 외부 API 호출 없음

2️⃣ Lv7 포인트 → 보유금 전환 (100P → 100원)
   → Lv7 Points: 0P, Balance: 100원
   → Lv3 변동 없음
   → Lv2 변동 없음

3️⃣ Lv7 Invest 게임 진입
   → Game Launch API 호출
   → 외부 Invest API 입금 100원
   → Lv1 Invest: 9,999,900원 ✅ (게임 진입 시에만 차감)
   → Lv2 Invest: 999,900원 ✅ (게임 진입 시에만 차감)
   → Lv3 변동 없음 (이미 포인트 지급 시 차감됨)
   → 게임 팝업 열림

4️⃣ Lv7 게임 플레이 (베팅 후 50원 승리)
   → Lv7 게임 내 잔액: 150원

5️⃣ Lv7 게임 종료 (팝업 닫기)
   → Session status: ended
   → 외부 Invest API 출금 150원
   → Lv7 Balance: 150원 ✅
   → Lv1 Invest: 10,000,050원 ✅
   → Lv2 Invest: 1,000,050원 ✅

최종 상태:
- Lv1 Invest: 10,000,050원 (+50원, 순수익)
- Lv2 Invest: 1,000,050원 (+50원, 순수익)
- Lv3 balance: 1,099,900원 (-100원, 손실 - 포인트 지급액)
- Lv7 Balance: 150원 (+50원, 승리금)

💡 결과:
- Lv3는 포인트 지급 시 100원 차감 (게임 결과와 무관)
- Lv2는 변동 없다가 게임 진입/종료 시에만 차감/증가 (최종 +50원)
- Lv1은 게임 진입/종료 시에만 차감/증가 (최종 +50원)
```

---

## 🔄 입출금/포인트 일관성 비교

### Lv2 관련 거래

| 거래 유형 | 제한 | Lv2 변동 | 외부 API 호출 |
|-----------|-----|---------|---------------|
| Lv2 → Lv3 입금 | 없음 | ❌ 변동 없음 | ❌ |
| Lv2 → Lv3 회수 | Lv3 balance | ❌ 변동 없음 | ❌ |
| Lv2 → Lv7 입금 | 없음 | ❌ 변동 없음 | ❌ |
| Lv2 → Lv7 포인트 지급 | 없음 | ❌ 변동 없음 | ❌ |
| Lv2 → Lv7 포인트 회수 | Lv7 포인트 범위 | ❌ 변동 없음 | ❌ |

### Lv3 관련 거래

| 거래 유형 | 제한 | Lv3 변동 | Lv2 변동 | 외부 API 호출 |
|-----------|-----|---------|---------|---------------|
| Lv3 → 하위 입금 | balance | ✅ balance 차감 | ❌ | ❌ |
| Lv3 ← 하위 회수 | balance | ✅ balance 증가 | ❌ | ❌ |
| Lv3 → Lv7 입금 | balance | ✅ balance 차감 | ❌ | ❌ |
| Lv3 → Lv7 포인트 지급 | balance | ✅ balance 차감 | ❌ | ❌ |
| Lv3 ← Lv7 포인트 회수 | Lv7 포인트 | ✅ balance 증가 | ❌ | ❌ |

### Lv4~6 관련 거래

| 거래 유형 | balance 범위 | 외부 API 호출 |
|-----------|-------------|---------------|
| 상위 → 하위 입금 | ✅ | ❌ |
| 상위 → 하위 회수 | ✅ | ❌ |
| 상위 → Lv7 입금 | ✅ | ❌ |
| 상위 → Lv7 포인트 지급 | ✅ | ❌ |
| 상위 ← Lv7 포인트 회수 | ✅ | ❌ |

### Lv7 게임 진입/종료 (모든 상위 레벨 동일)

| 이벤트 | 외부 API 호출 | Lv1 증감 | Lv2 증감 |
|--------|--------------|----------|----------|
| 게임 진입 | ✅ 입금 | ✅ | ✅ |
| 게임 종료 | ✅ 출금 | ✅ | ✅ |

---

## 🗄️ DB 스키마

### partners 테이블
```sql
CREATE TABLE partners (
  id UUID PRIMARY KEY,
  level INTEGER NOT NULL,
  
  -- Lv1, Lv2: 두 API 별도 관리
  invest_balance DECIMAL(15,2) DEFAULT 0,
  oroplay_balance DECIMAL(15,2) DEFAULT 0,
  
  -- Lv3~6: 단일 지갑
  balance DECIMAL(15,2) DEFAULT 0,
  
  ...
);
```

### users 테이블
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  
  balance DECIMAL(15,2) DEFAULT 0,  -- 게임 플레이 가능한 보유금
  points INTEGER DEFAULT 0,          -- 보너스 포인트
  
  ...
);
```

### point_transactions 테이블
```sql
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  partner_id UUID REFERENCES partners(id),
  
  transaction_type TEXT NOT NULL,
    -- 'admin_adjustment': 지급
    -- 'use': 회수
    -- 'convert_to_balance': 전환
  
  amount INTEGER NOT NULL,
  points_before INTEGER,
  points_after INTEGER,
  memo TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### DB 트리거

**Lv3는 단일 지갑이므로 자동 계산 트리거 불필요**
- Lv1, Lv2만 `invest_balance + oroplay_balance` 자동 계산
- Lv3는 `balance` 컬럼만 사용

---

## 📝 구현 체크리스트

### DB
- [x] Lv3는 balance만 사용 (트리거 불필요)
- [x] Lv1, Lv2만 자동 계산 트리거 적용

### 입출금 시스템
- [x] ForceTransactionModal.tsx - API 선택 UI (Lv1 → Lv2만)
- [x] PartnerManagement.tsx - Lv2 → Lv3 입금 로직 (Lv2 변동 없음)
- [x] PartnerManagement.tsx - Lv2 → Lv3 회수 로직 (Lv2 변동 없음)
- [x] UserManagement.tsx - Lv1/Lv2 → Lv7 입금 로직

### 포인트 시스템
- [x] PointManagement.tsx - Lv1 지급 불가 처리
- [x] PointManagement.tsx - Lv2 변동 없음 (기록만) 구현
- [x] PointManagement.tsx - Lv3 balance 차감 구현
- [x] PointManagement.tsx - Lv4~6 balance 차감 구현
- [x] PointManagement.tsx - 포인트 회수 로직 (레벨별 차등)
- [x] PointManagement.tsx - 포인트 전환 로직
- [x] PointManagement.tsx - 외부 API 호출 제거
- [x] PointManagement.tsx - 관리자 보유금 변경 로그 기록

### 게임 시스템
- [x] GameLaunch - 진입 시 외부 API 입금
- [x] SessionManager - 종료 시 외부 API 출금
- [x] Lv1, Lv2 증감 처리

### 문서
- [x] LV3_DUAL_API_TRANSACTION.md 업데이트 (이 문서)
- [x] POINT_SYSTEM.md 업데이트
- [x] deposit_withdrawal_logic.md 검토 (기존 로직과 일치)

---

## 🔗 관련 문서

- `/docs/point/POINT_SYSTEM.md` - 포인트 시스템 완전 가이드
- `/guidelines/deposit_withdrawal_logic.md` - 입출금 로직 완전 가이드
- `/guidelines/seamless_wallet_integration.md` - Seamless Wallet 설계
- `/database/500_auto_update_lv1_lv2_balance.sql` - Lv1/Lv2 트리거 SQL

---

## ✅ 구현 완료 사항

### 1. DB 트리거 (Lv1, Lv2 balance 자동 계산)
- ✅ `500_auto_update_lv1_lv2_balance.sql` 실행 완료
- ✅ `auto_update_lv1_lv2_balance()` 함수 작동 확인
- ✅ `trigger_auto_update_lv1_lv2_balance` 트리거 활성화
- ✅ **Lv3는 제외** (단일 지갑이므로 자동 계산 불필요)

### 2. 입출금 시스템 (`/components/admin/PartnerManagement.tsx`)
- ✅ **Lv2 → Lv3 입금**: Lv2 변동 없음, Lv3 balance만 증가 (line 1269-1295)
- ✅ **Lv2 → Lv3 회수**: Lv2 변동 없음, Lv3 balance만 차감 (line 1405-1437)
- ✅ balance 직접 관리 (자동 계산 아님)
- ✅ partner_balance_logs 기록

### 3. UI 시스템 (`/components/admin/ForceTransactionModal.tsx`)
- ✅ **API 선택**: Lv1 → Lv2만 표시 (line 95-102)
- ✅ **Lv3 표시**: balance만 표시, API 구분 없음 (line 385-391)
- ✅ **입금 제한**: Lv2 → Lv3 제한 없음 (line 171-173)

### 4. 포인트 지급 시스템 (`/components/admin/PointManagement.tsx`)
- ✅ **Lv1**: 포인트 지급 불가 (line 203-206)
- ✅ **Lv2**: Lv7 포인트만 증가, Lv2 변동 없음, 기록만 (line 246-292)
  - Lv7 포인트 증가
  - point_transactions INSERT
  - 외부 API 호출 없음
- ✅ **Lv3**: balance 차감 (line 294-377)
  - balance 차감
  - point_transactions INSERT
  - partner_balance_logs INSERT
- ✅ **Lv4~6**: balance 차감 (line 379-496)
  - balance 차감
  - point_transactions INSERT
  - partner_balance_logs INSERT

### 5. 포인트 회수 시스템 (`/components/admin/PointManagement.tsx`)
- ✅ **Lv2**: Lv7 포인트 차감, Lv2 변동 없음 (line 562-608)
  - Lv7 포인트 차감
  - point_transactions INSERT (기록만)
  - 외부 API 호출 없음
- ✅ **Lv3**: Lv7 포인트 차감, balance 증가 (line 610-681)
  - Lv7 포인트 차감
  - balance 증가
  - point_transactions INSERT
  - partner_balance_logs INSERT
- ✅ **Lv4~6**: Lv7 포인트 차감, balance 증가 (line 683-761)
  - Lv7 포인트 차감
  - balance 증가
  - point_transactions INSERT
  - partner_balance_logs INSERT

### 6. 포인트 → 보유금 전환
- ✅ 모든 레벨: Lv7 points → balance 전환 (convertPointsToBalance 함수)
- ✅ 상위 파트너 변동 없음
- ✅ 외부 API 호출 없음
- ✅ point_transactions INSERT (transaction_type: 'convert_to_balance')

### 7. 기록 및 로그
- ✅ `point_transactions` 테이블 INSERT
- ✅ `partner_balance_logs` 테이블 INSERT (Lv3~6)
- ✅ 실시간 WebSocket 업데이트 (`connected && sendMessage`)

### 8. 외부 API 호출 제거
- ✅ 포인트 지급 시 외부 API 호출 없음
- ✅ 포인트 회수 시 외부 API 호출 없음
- ✅ 포인트 전환 시 외부 API 호출 없음
- ✅ 게임 진입/종료 시에만 외부 API 호출

---

## 📌 핵심 구현 포인트

### 1. Lv2와 Lv3의 차이점
| 항목 | Lv2 (대본사) | Lv3 (본사) |
|------|-------------|-----------|
| 입금 처리 시 | ❌ 변동 없음 (기록만) | ✅ balance 증가 |
| 회수 처리 시 | ❌ 변동 없음 (기록만) | ✅ balance 차감 |
| 포인트 지급 시 | ❌ 변동 없음 (기록만) | ✅ balance 차감 |
| 포인트 회수 시 | ❌ 변동 없음 (기록만) | ✅ balance 증가 |
| 지급 제한 | 없음 | balance 범위 내 |
| 외부 API 호출 | ❌ 없음 | ❌ 없음 |
| 게임 진입 시 | ✅ API별 차감 | ❌ 변동 없음 |
| 지갑 개수 | 2개 (API별) | 1개 (balance만) |

### 2. 외부 API 호출 타이밍
```
포인트 관련 작업 (지급/회수/전환)
└── ❌ 외부 API 호출 없음
    └── DB만 업데이트

게임 진입/종료
└── ✅ 외부 API 호출
    └── Lv1, Lv2 증감 (API별)
```

### 3. 레벨별 처리 흐름
```
Lv1: 포인트 지급 불가
Lv2: Lv7 포인트 ↑, Lv2 변동 없음 → 게임 진입 시 Lv1/Lv2 API 차감
Lv3: Lv7 포인트 ↑, Lv3 balance ↓ → 게임 진입 시 Lv1/Lv2 API 차감 (Lv3 변동 없음)
Lv4~6: Lv7 포인트 ↑, 상위 balance ↓ → 게임 진입 시 Lv1/Lv2만 API 차감
```

---

**문서 작성일**: 2025-01-10  
**최종 수정일**: 2025-01-10  
**버전**: v3.0  
**상태**: ✅ **구현 완료 및 검증 완료**

**검증자**: AI Assistant  
**검증일**: 2025-01-10  
**검증 방법**: Lv3 단일 지갑 구조 확인 및 코드 검증 완료
