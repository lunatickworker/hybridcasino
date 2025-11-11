# 포인트 관리 시스템 완전 가이드

## 📋 개요

### 목적
사용자에게 포인트를 지급/회수하고 보유금으로 전환하는 보너스 시스템

### 핵심 원칙
- **레벨별 차등 처리**: Lv1 불가, Lv2 이중 API 제한, Lv3~6 단일 지갑
- **외부 API 호출 없음**: 포인트 지급/회수/전환 시 외부 API 미사용
- **게임 진입 시 정산**: Lv7이 게임 진입 시에만 외부 API 호출 → Lv1, Lv2 증감
- **실시간 업데이트**: WebSocket으로 즉시 반영

---

## 포인트 vs 보유금

| 구분 | 포인트 (Points) | 보유금 (Balance) |
|------|----------------|------------------|
| 저장 위치 | `users.points` | `users.balance` |
| 용도 | 보너스 (게임 플레이 불가) | 실제 자금 (게임 플레이 가능) |
| 전환 | 보유금으로 1:1 전환 | - |
| 출금 | 불가 | 가능 |

---

## 레벨별 포인트 지급

### 1. Lv1 (시스템관리자)

**제한**: ❌ **포인트 지급 불가**

**UI 처리**:
- 포인트 지급 버튼 비활성화
- 또는 클릭 시 알림: "시스템관리자는 포인트를 지급할 수 없습니다."

**이유**: Lv1은 외부 API 잔고만 관리하며, 게임 진입 시에만 증감

---

### 2. Lv2 (대본사)

#### 포인트 지급

**지급 제한**: 없음 (Lv1과 같은 로직)

**핵심 원칙**:
- ❌ Lv2는 변동 없음 (두 API 차감 안 함)
- ✅ Lv7 포인트만 증가
- ✅ 기록만 남김

**처리 프로세스**:
```
1. Lv7 포인트 증가
   - points: 0P + 100P = 100P

2. Lv2 변동 없음
   - Invest: 1,000,000원 (변동 없음)
   - OroPlay: 500,000원 (변동 없음)

3. 외부 API 호출 없음

4. DB 기록
   - point_transactions INSERT (transaction_type: 'admin_adjustment')
```

**코드 예시**:
```typescript
// 1. Lv7 포인트 증가
await supabase
  .from('users')
  .update({
    points: lv7Data.points + pointAmount
  })
  .eq('id', lv7Id);

// 2. Lv2는 변동 없음 (입금/출금과 달리 포인트는 기록만)

// 3. 거래 내역
await supabase.from('point_transactions').insert({
  user_id: lv7Id,
  partner_id: lv2Id,
  transaction_type: 'admin_adjustment',
  amount: pointAmount,
  points_before: lv7Data.points,
  points_after: lv7Data.points + pointAmount
});
```

#### 포인트 회수

**회수 제한**: Lv7 포인트 범위 내

**핵심 원칙**:
- ❌ Lv2는 변동 없음
- ✅ Lv7 포인트만 차감
- ✅ 기록만 남김 (입금할때도 변동이 없었으니까)

**처리 프로세스**:
```
1. Lv7 포인트 체크
   - points: 100P
   → 100P 이하만 회수 가능

2. Lv7 포인트 차감
   - points: 100P - 50P = 50P

3. Lv2 변동 없음
   - Invest: 1,000,000원 (변동 없음)
   - OroPlay: 500,000원 (변동 없음)

4. 외부 API 호출 없음

5. DB 기록
   - point_transactions INSERT (transaction_type: 'use')
```

**코드 예시**:
```typescript
// 1. Lv7 포인트 체크
if (recoverAmount > lv7Data.points) {
  throw new Error('회수할 포인트가 부족합니다.');
}

// 2. Lv7 포인트 차감
await supabase
  .from('users')
  .update({
    points: lv7Data.points - recoverAmount
  })
  .eq('id', lv7Id);

// 3. Lv2는 변동 없음 (기록만 남김)

// 4. 거래 내역
await supabase.from('point_transactions').insert({
  user_id: lv7Id,
  partner_id: lv2Id,
  transaction_type: 'use',
  amount: -recoverAmount,
  points_before: lv7Data.points,
  points_after: lv7Data.points - recoverAmount
});
```

---

### 3. Lv3 (본사)

#### 포인트 지급

**지급 제한**: balance 범위 내

**핵심 원칙**:
- ✅ Lv3 balance 차감
- ❌ Lv2 변동 없음 (기록만)
- ✅ 포인트는 전액을 무조건 전환, 한번 전환되면 롤백 불가

```typescript
if (pointAmount > lv3Balance) {
  toast.error('보유금이 부족합니다.');
  return;
}
```

**처리 프로세스**:
```
1. balance 체크
   - balance: 1,100,000원
   → 1,100,000P 이하만 지급 가능

2. Lv3 balance 차감
   - balance: 1,100,000원 - 100원 = 1,099,900원

3. Lv7 포인트 증가
   - points: 0P + 100P = 100P

4. Lv2 변동 없음 (기록만 남김)

5. 외부 API 호출 없음

6. DB 기록
   - point_transactions INSERT
   - partner_balance_logs INSERT
```

**코드 예시**:
```typescript
// 1. balance 체크
if (pointAmount > lv3Data.balance) {
  throw new Error('보유금이 부족합니다.');
}

// 2. Lv3 balance 차감
await supabase
  .from('partners')
  .update({
    balance: lv3Data.balance - pointAmount
  })
  .eq('id', lv3Id);

// 3. Lv7 포인트 증가
await supabase
  .from('users')
  .update({
    points: lv7Data.points + pointAmount
  })
  .eq('id', lv7Id);

// 4. Lv2는 변동 없음 (기록만)

// 5. 거래 내역
await supabase.from('point_transactions').insert({
  user_id: lv7Id,
  partner_id: lv3Id,
  transaction_type: 'admin_adjustment',
  amount: pointAmount,
  points_before: lv7Data.points,
  points_after: lv7Data.points + pointAmount
});
```

#### 포인트 회수

**회수 제한**: Lv7 포인트 범위 내

**핵심 원칙**:
- ✅ Lv3 balance 증가
- ❌ Lv2 변동 없음 (Lv3 balance로 줄때도 Lv2는 변동 없음. Lv1 로직과 같음)

**처리 프로세스**:
```
1. Lv7 포인트 체크
   - points: 100P
   → 100P 이하만 회수 가능

2. Lv7 포인트 차감
   - points: 100P - 50P = 50P

3. Lv3 balance 증가
   - balance: 1,499,900원 + 50원 = 1,499,950원
   - (invest_balance 증가 → 트리거로 balance 자동 재계산)

4. Lv2 변동 없음 (기록만 남김)

5. 외부 API 호출 없음
```

**코드 예시**:
```typescript
// 1. Lv7 포인트 체크
if (recoverAmount > lv7Data.points) {
  throw new Error('회수할 포인트가 부족합니다.');
}

// 2. Lv7 포인트 차감
await supabase
  .from('users')
  .update({
    points: lv7Data.points - recoverAmount
  })
  .eq('id', lv7Id);

// 3. Lv3 balance 증가
await supabase
  .from('partners')
  .update({
    balance: lv3Data.balance + recoverAmount
  })
  .eq('id', lv3Id);

// 4. Lv2는 변동 없음

// 5. 거래 내역
await supabase.from('point_transactions').insert({
  user_id: lv7Id,
  partner_id: lv3Id,
  transaction_type: 'use',
  amount: -recoverAmount,
  points_before: lv7Data.points,
  points_after: lv7Data.points - recoverAmount
});
```

---

### 4. Lv4~6 (부본사, 총판, 매장)

#### 포인트 지급

**지급 제한**: balance 범위 내

```typescript
if (pointAmount > upperBalance) {
  toast.error('보유금이 부족합니다.');
  return;
}
```

**처리 프로세스**:
```
1. balance 체크
   - balance: 500,000원
   → 500,000P 이하만 지급 가능

2. balance 차감
   - balance: 500,000원 - 100원 = 499,900원

3. Lv7 포인트 증가
   - points: 0P + 100P = 100P

4. 외부 API 호출 없음

5. DB 기록
   - point_transactions INSERT
   - partner_balance_logs INSERT
```

**코드 예시**:
```typescript
// 1. balance 체크
if (pointAmount > upperData.balance) {
  throw new Error('보유금이 부족합니다.');
}

// 2. balance 차감
await supabase
  .from('partners')
  .update({
    balance: upperData.balance - pointAmount
  })
  .eq('id', upperId);

// 3. Lv7 포인트 증가
await supabase
  .from('users')
  .update({
    points: lv7Data.points + pointAmount
  })
  .eq('id', lv7Id);

// 4. 거래 내역
await supabase.from('point_transactions').insert({
  user_id: lv7Id,
  partner_id: upperId,
  transaction_type: 'admin_adjustment',
  amount: pointAmount,
  points_before: lv7Data.points,
  points_after: lv7Data.points + pointAmount
});
```

#### 포인트 회수

**회수 제한**: Lv7 포인트 범위 내

**처리**: balance 증가

```typescript
// 1. Lv7 포인트 차감
await supabase
  .from('users')
  .update({
    points: lv7Data.points - recoverAmount
  })
  .eq('id', lv7Id);

// 2. balance 증가
await supabase
  .from('partners')
  .update({
    balance: upperData.balance + recoverAmount
  })
  .eq('id', upperId);
```

---

## 포인트 → 보유금 전환

### 전환 프로세스 (모든 레벨 동일)

**제한**: Lv7 포인트 범위 내

**핵심 원칙**:
- ✅ 한번 전환되면 롤백 불가
- ✅ 전액을 무조건 전환 (부분 전환도 가능)
- ❌ 상위 파트너 변동 없음

**처리**:
```
1. Lv7 포인트 체크
   - points: 100P
   → 100P 이하만 전환 가능

2. Lv7 포인트 차감, 보유금 증가
   - points: 100P - 100P = 0P
   - balance: 0원 + 100원 = 100원

3. 외부 API 호출 없음
4. 상위 파트너 변동 없음 (Lv2, Lv3 모두)

5. DB 기록
   - point_transactions INSERT (transaction_type: 'convert_to_balance')
```

**코드 예시**:
```typescript
// 1. 포인트 체크
if (convertAmount > lv7Data.points) {
  throw new Error('보유 포인트가 부족합니다.');
}

// 2. 포인트 차감, 보유금 증가
await supabase
  .from('users')
  .update({
    points: lv7Data.points - convertAmount,
    balance: lv7Data.balance + convertAmount
  })
  .eq('id', lv7Id);

// 3. 거래 내역
await supabase.from('point_transactions').insert({
  user_id: lv7Id,
  partner_id: null,  // 전환은 파트너 없음
  transaction_type: 'convert_to_balance',
  amount: convertAmount,
  points_before: lv7Data.points,
  points_after: lv7Data.points - convertAmount
});
```

**전환 가능 위치**:
- 관리자 페이지: `/admin/points` (PointManagement.tsx)
- 사용자 페이지: 헤더 (UserHeader.tsx)
- 사용자 페이지: 프로필 (UserProfile.tsx)

---

## 게임 진입/종료 시스템

### 게임 진입 (모든 레벨 동일)

**프로세스**:
```
1. Lv7이 게임 클릭 (예: Invest API 슬롯 게임)

2. Game Launch API 호출

3. Lv7 balance → 외부 Invest API 입금 호출
   - 예: 100원 입금

4. Lv1, Lv2 증감
   - Lv1 invest_balance: -100원
   - Lv2 invest_balance: -100원
   (Lv3~6은 변동 없음, 이미 입금 시 차감됨)

5. 게임 팝업 열림
```

**코드 흐름**:
```typescript
// 사용자가 게임 클릭
const launchGame = async (gameId: number) => {
  // 1. Game Launch API 호출
  const launchResult = await gameLaunchApi(gameId, userId);
  
  // 2. Lv7 balance → 외부 API 입금
  await depositToExternalApi(userId, lv7Balance);
  
  // 3. Lv1, Lv2 증감 (게임 API에 따라)
  if (gameApiType === 'invest') {
    await decreaseLv1Lv2InvestBalance(lv7Balance);
  } else if (gameApiType === 'oroplay') {
    await decreaseLv1Lv2OroplayBalance(lv7Balance);
  }
  
  // 4. 게임 팝업 열기
  window.open(launchResult.gameUrl);
};
```

### 게임 종료

**프로세스**:
```
1. 게임 팝업 닫기

2. Session status = ended / enforce-ended

3. 외부 API 출금 호출
   - 예: 게임 후 잔액 150원 출금

4. Lv7 balance 업데이트
   - balance: 0원 + 150원 = 150원

5. Lv1, Lv2 증감
   - Lv1 invest_balance: +150원
   - Lv2 invest_balance: +150원
```

**코드 흐름**:
```typescript
// 게임 세션 종료 감지
const onGameSessionEnd = async (sessionId: string) => {
  // 1. Session status 확인
  const session = await getGameSession(sessionId);
  
  if (session.status === 'ended' || session.status === 'enforce-ended') {
    // 2. 외부 API 출금
    const finalBalance = await withdrawFromExternalApi(userId);
    
    // 3. Lv7 balance 업데이트
    await supabase
      .from('users')
      .update({ balance: finalBalance })
      .eq('id', userId);
    
    // 4. Lv1, Lv2 증감
    if (gameApiType === 'invest') {
      await increaseLv1Lv2InvestBalance(finalBalance);
    } else if (gameApiType === 'oroplay') {
      await increaseLv1Lv2OroplayBalance(finalBalance);
    }
  }
};
```

---

## 통합 시나리오

### 시나리오 1: Lv2 → Lv7 포인트 지급 → 게임 플레이

```
📍 초기 상태
- Lv1 Invest: 10,000,000원, OroPlay: 15,000,000원
- Lv2 Invest: 1,000,000원, OroPlay: 500,000원
- Lv7 Points: 0P, Balance: 0원

1️⃣ Lv2가 Lv7에게 100P 지급
   → Lv2 Invest: 1,000,000원 (변동 없음)
   → Lv2 OroPlay: 500,000원 (변동 없음)
   → Lv7 Points: 100P
   → 외부 API 호출 없음
   → 기록만 남김

2️⃣ Lv7이 포인트 → 보유금 전환 (100P → 100원)
   → Lv7 Points: 0P
   → Lv7 Balance: 100원
   → 외부 API 호출 없음
   → Lv2 변동 없음 (기록만)

3️⃣ Lv7이 Invest API 슬롯 게임 클릭
   → Game Launch API 호출
   → 외부 Invest API 입금 100원
   → Lv1 Invest: 9,999,900원 ⚡ (게임 진입 시에만 차감)
   → Lv2 Invest: 999,900원 ⚡ (게임 진입 시에만 차감)
   → 게임 팝업 열림

4️⃣ Lv7 게임 플레이
   - 베팅: 50원 × 3회 = 150원
   - 승리: 100원
   - 최종 잔액: 50원

5️⃣ Lv7 게임 팝업 닫기
   → Session status: ended
   → 외부 Invest API 출금 50원
   → Lv7 Balance: 50원 ⚡
   → Lv1 Invest: 9,999,950원 ⚡
   → Lv2 Invest: 999,950원 ⚡

📍 최종 상태
- Lv1 Invest: 9,999,950원 (-50원, 손실)
- Lv2 Invest: 999,950원 (-50원, 손실)
- Lv7 Balance: 50원 (-50원, 손실)

💡 결과: Lv7이 50원 손실, Lv1과 Lv2도 각각 50원 손실 (게임 진입 시에만 차감됨)
```

---

### 시나리오 2: Lv3 → Lv7 포인트 지급 → 게임 플레이

```
📍 초기 상태
- Lv1 Invest: 10,000,000원, OroPlay: 15,000,000원
- Lv2 Invest: 1,000,000원, OroPlay: 500,000원
- Lv3 balance: 1,100,000원
- Lv7 Points: 0P, Balance: 0원

1️⃣ Lv3가 Lv7에게 100P 지급
   → Lv3 balance: 1,100,000원 - 100원 = 1,099,900원
   → Lv2 변동 없음 (기록만)
   → Lv7 Points: 100P
   → 외부 API 호출 없음

2️⃣ Lv7이 포인트 → 보유금 전환 (100P → 100원)
   → Lv7 Points: 0P
   → Lv7 Balance: 100원
   → Lv3 변동 없음
   → Lv2 변동 없음

3️⃣ Lv7이 Invest API 슬롯 게임 클릭
   → Game Launch API 호출
   → 외부 Invest API 입금 100원
   → Lv1 Invest: 9,999,900원 ⚡ (게임 진입 시에만 차감)
   → Lv2 Invest: 999,900원 ⚡ (게임 진입 시에만 차감)
   → Lv3 변동 없음 (이미 포인트 지급 시 차감됨)
   → 게임 팝업 열림

4️⃣ Lv7 게임 플레이
   - 베팅: 50원 × 3회 = 150원
   - 승리: 100원
   - 최종 잔액: 50원

5️⃣ Lv7 게임 팝업 닫기
   → Session status: ended
   → 외부 Invest API 출금 50원
   → Lv7 Balance: 50원 ⚡
   → Lv1 Invest: 9,999,950원 ⚡
   → Lv2 Invest: 999,950원 ⚡

📍 최종 상태
- Lv1 Invest: 9,999,950원 (-50원, 손실)
- Lv2 Invest: 999,950원 (-50원, 손실)
- Lv3 balance: 1,099,900원 (-100원, 손실 - 포인트 지급액)
- Lv7 Balance: 50원 (-50원, 손실)

💡 결과: 
- Lv3는 포인트 지급 시 100원 차감 (게임 결과와 무관)
- Lv1, Lv2는 게임 진입/종료 시에만 차감/증가 (최종 -50원)
```

---

## 데이터베이스 구조

### users 테이블
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  nickname TEXT NOT NULL,
  
  balance DECIMAL(15,2) DEFAULT 0,   -- 게임 플레이 가능한 보유금
  points INTEGER DEFAULT 0,          -- 보너스 포인트
  
  referrer_id UUID REFERENCES partners(id),
  ...
);
```

### point_transactions 테이블
```sql
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  partner_id UUID REFERENCES partners(id),
  
  transaction_type TEXT NOT NULL,
    -- 'admin_adjustment': 지급
    -- 'use': 회수
    -- 'convert_to_balance': 보유금 전환
    -- 'earn': 자동 적립 (미사용)
  
  amount INTEGER NOT NULL,
  points_before INTEGER DEFAULT 0,
  points_after INTEGER DEFAULT 0,
  memo TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_point_transactions_user_id ON point_transactions(user_id);
CREATE INDEX idx_point_transactions_type ON point_transactions(transaction_type);
CREATE INDEX idx_point_transactions_created_at ON point_transactions(created_at);
```

### partner_balance_logs 테이블
```sql
CREATE TABLE partner_balance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id) NOT NULL,
  
  balance_before DECIMAL(15,2) DEFAULT 0,
  balance_after DECIMAL(15,2) DEFAULT 0,
  amount DECIMAL(15,2) NOT NULL,
  
  transaction_type TEXT NOT NULL,
  processed_by UUID REFERENCES partners(id),
  memo TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## UI 컴포넌트

### PointManagement.tsx (관리자 페이지)

**위치**: `/admin/points`

**기능**:
1. **포인트 지급**:
   - Lv1: 버튼 비활성화 또는 알림
   - Lv2: 최소값 체크 + 두 API 차감
   - Lv3~6: balance 체크 + 차감

2. **포인트 회수**:
   - 모든 레벨: Lv7 points 차감 + 상위 balance 증가

3. **포인트 전환**:
   - 관리자가 대신 전환 가능
   - Lv7 points → balance

4. **거래 내역**:
   - 포인트 거래 전체 조회
   - 필터: 유형별 (지급/회수/전환)

**단축 금액 버튼**:
- 10P, 30P, 50P, 70P, 100P, 200P, 300P, 400P

---

### UserHeader.tsx (사용자 페이지)

**위치**: 모든 사용자 페이지 헤더

**기능**:
- 포인트 잔액 표시
- 포인트 → 보유금 전환 버튼

---

### UserProfile.tsx (사용자 페이지)

**위치**: `/profile`

**기능**:
- 포인트 잔액 표시
- 포인트 → 보유금 전환
- 포인트 거래 내역 (최근 20건)

---

## 레벨별 비교표

| 레벨 | 지급 가능 | 지급 제한 | 상위 파트너 차감 | Lv2 변동 | 외부 API 호출 | 게임 진입 시 Lv1/Lv2 증감 |
|------|----------|----------|----------------|---------|--------------|----------------------|
| Lv1 | ❌ | - | - | - | - | API별 증감 |
| Lv2 | ✅ | 없음 | ❌ 변동 없음 | ❌ | ❌ | API별 증감 |
| Lv3 | ✅ | balance | ✅ balance 차감 | ❌ | ❌ | API별 증감 |
| Lv4 | ✅ | balance | ✅ balance 차감 | ❌ | ❌ | API별 증감 |
| Lv5 | ✅ | balance | ✅ balance 차감 | ❌ | ❌ | API별 증감 |
| Lv6 | ✅ | balance | ✅ balance 차감 | ❌ | ❌ | API별 증감 |

**핵심 차이점**:
- **Lv2**: 포인트 지급/회수 시 자신은 변동 없음 (Lv1과 같은 로직)
- **Lv3**: balance 범위 내 제한, Lv3 balance 차감, Lv2 변동 없음 (포인트와 동일)
- **Lv4~6**: balance 범위 내 제한, balance 차감

**게임 진입 시 Lv1, Lv2 증감** (모든 레벨 동일):
- Invest 게임: lv1InvestBalance, lv2InvestBalance 차감
- OroPlay 게임: lv1OroplayBalance, lv2OroplayBalance 차감

---

## 주의사항

### 1. 포인트 = 원화 1:1
- 1P = 1원
- 포인트 지급/회수/전환 모두 1:1 비율

### 2. 외부 API 호출 타이밍
- ✅ 게임 진입/종료 시에만 외부 API 호출
- ❌ 포인트 지급/회수/전환 시 외부 API 호출 없음

### 3. Lv2 포인트는 변동 없음
- 포인트 지급/회수 시 Lv2는 변동 없음 (기록만)
- Lv1과 같은 로직 (게임 진입 시에만 증감)

### 4. 게임 진입 시 Lv1, Lv2만 증감
- Lv3~6은 이미 입금 시 차감되어 변동 없음
- Lv1, Lv2는 게임 플레이 시점에 실제 차감

### 5. 포인트 회수 시 상위 파트너만 변동
- Lv2: 변동 없음 (기록만)
- Lv3: balance 증가
- Lv4~6: balance 증가

### 6. 실시간 업데이트
- WebSocket으로 포인트/보유금 즉시 반영
- BalanceContext Realtime Subscription

### 7. 권한 관리
- 관리자는 직속 사용자(referrer_id)만 관리
- Lv1은 모든 사용자 조회 가능

---

## 구현 체크리스트

### PointManagement.tsx
- [x] Lv1 포인트 지급 불가 처리
- [x] Lv2 변동 없음 (기록만) 구현
- [x] Lv3 최소값 체크 + balance 차감 구현
- [x] Lv4~6 balance 차감 구현
- [x] 포인트 회수 로직 (레벨별 차등)
- [x] 포인트 전환 로직
- [x] 외부 API 호출 제거

### 게임 시스템
- [x] 게임 진입 시 외부 API 입금
- [x] Lv1, Lv2 증감 처리
- [x] 게임 종료 시 외부 API 출금
- [x] Lv1, Lv2 증감 처리

### 문서
- [x] POINT_SYSTEM.md 업데이트 (이 문서)
- [x] LV3_DUAL_API_TRANSACTION.md 업데이트

---

## 관련 문서

- `/LV3_DUAL_API_TRANSACTION.md` - 이중 API 입출금 완전 가이드
- `/guidelines/deposit_withdrawal_logic.md` - 입출금 로직 완전 가이드
- `/guidelines/seamless_wallet_integration.md` - Seamless Wallet 설계

---

**문서 버전**: 3.0  
**작성일**: 2025-01-10  
**최종 수정일**: 2025-01-10  
**상태**: ✅ 구현 완료
