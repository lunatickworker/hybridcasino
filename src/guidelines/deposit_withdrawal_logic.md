# 입금/출금 로직 정리 (완전 개정판)

## 📊 전체 구조 한눈에 보기

| 거래 유형 | Lv1, Lv2 처리 | Lv3 처리 | Lv4~6 처리 | Lv7 처리 |
|---------|---------------|---------|-----------|---------|
| **→ Lv3 입금** | 두 API 차감 (즉시) | 두 API 증가, balance 자동 계산 | - | - |
| **→ Lv3 회수** | 선택 API 증가 | 선택 API 차감, balance 자동 계산 | - | - |
| **→ Lv7 입금** | 차감 없음 (게임 시 차감) | balance 차감 (즉시) | balance 차감 (즉시) | - |
| **→ Lv7 회수** | balance 증가 | balance 증가 | balance 증가 | - |

---

## 핵심 원칙

### 1. Lv1, Lv2 → Lv3 입금 ⭐ (신규)
- **입금 시점**: 두 API 모두 **즉시 차감/증가** ✅
- **입금 제한**: 두 API 중 가장 작은 보유금 기준
- **Lv3 DB**: `invest_balance`, `oroplay_balance` 모두 증가
- **Lv3 UI**: `balance = invest_balance + oroplay_balance` 자동 계산값만 표시

**예시:**
```
초기 상태:
- Lv2 Invest: 1,000,000원
- Lv2 OroPlay: 1,500,000원
- Lv3 Invest: 500,000원
- Lv3 OroPlay: 700,000원
- Lv3 balance: 1,200,000원 (자동 계산)

1. Lv2 → Lv3 입금 100,000원
   ✅ 입금 성공 (제한: 1,000,000원 = 최소값)
   - Lv2 Invest: 900,000원 (차감)
   - Lv2 OroPlay: 1,400,000원 (차감)
   - Lv3 Invest: 600,000원 (증가)
   - Lv3 OroPlay: 800,000원 (증가)
   - Lv3 balance: 1,400,000원 (자동 계산)
```

### 2. Lv1, Lv2 → Lv3 회수(출금) ⭐ (신규)
- **회수 시점**: **선택한 API만** 처리 ✅
- **모달 UI**: Invest / OroPlay API 선택 라디오 버튼
- **Lv3 DB**: 선택한 API의 `invest_balance` 또는 `oroplay_balance`만 차감
- **Lv3 UI**: `balance` 자동 재계산

**예시:**
```
초기 상태:
- Lv2 Invest: 900,000원
- Lv2 OroPlay: 1,400,000원
- Lv3 Invest: 600,000원
- Lv3 OroPlay: 800,000원
- Lv3 balance: 1,400,000원

1. Lv2 → Lv3 회수 50,000원 (Invest API 선택)
   ✅ 회수 성공
   - Lv2 Invest: 950,000원 (증가)
   - Lv2 OroPlay: 1,400,000원 (변동 없음)
   - Lv3 Invest: 550,000원 (차감)
   - Lv3 OroPlay: 800,000원 (변동 없음)
   - Lv3 balance: 1,350,000원 (자동 재계산)
```

### 3. Lv1, Lv2 → Lv7 입출금 (내부 거래)
- **입금 시점**: API 보유금 **차감 없음** ❌
- **출금 시점**: API 보유금 **증가 없음** ❌
- **게임 플레이 시점**: 실제 사용된 API에서만 **차감** ✅
- **게임 종료 시점**: 외부 API에서 **회수** ✅
- **입금 제한**: 두 API 중 가장 작은 보유금 기준

**예시:**
```
초기 상태:
- Lv1 Invest: 1,000,000원
- Lv1 OroPlay: 1,500,000원
- Lv7 balance: 0원

1. Lv1 → Lv7 입금 100,000원
   ✅ 입금 성공 (제한: 1,000,000원 = 최소값)
   - Lv1 Invest: 1,000,000원 (변동 없음)
   - Lv1 OroPlay: 1,500,000원 (변동 없음)
   - Lv7 balance: 100,000원

2. Lv7이 Invest 게임 베팅 10,000원
   ✅ 게임 플레이 시점에 차감
   - Lv1 Invest: 990,000원 (차감)
   - Lv1 OroPlay: 1,500,000원 (변동 없음)

3. Lv7이 OroPlay 게임 베팅 5,000원
   ✅ 게임 플레이 시점에 차감
   - Lv1 Invest: 990,000원 (변동 없음)
   - Lv1 OroPlay: 1,495,000원 (차감)
```

---

### 4. Lv3~6 → Lv7 입출금 (내부 거래)
- **입금 시점**: balance에서 **차감 없음** ❌
- **출금 시점**: balance에서 **증가 없음** ❌
- **게임 플레이 시점**: 변동 없음
- **게임 종료 시점**: 외부 API에서 **회수** ✅

**예시:**
```
초기 상태:
- Lv3 balance: 1,350,000원
- Lv7 balance: 0원

1. Lv3 → Lv7 입금 100,000원
   ✅ 입금 성공
   - Lv3 balance: 1,250,000원 (즉시 차감)
   - Lv7 balance: 100,000원

2. Lv7이 게임 플레이
   - Lv3 balance: 1,250,000원 (변동 없음)
```

---

### 5. 출금(회수)
- **Lv1/Lv2 → Lv3**: 선택한 API만 처리 (위 섹션 2 참조)
- **Lv3~6 → Lv7**: balance만 체크

**예시:**
```
Lv7 balance: 50,000원

Lv3 → Lv7 출금 30,000원
✅ 출금 성공
- Lv7 balance: 20,000원
- Lv3 balance: 1,280,000원 (자동 증가)
```

---

## 차이점 요약

| 구분 | Lv1, Lv2 | Lv3 | Lv4~6 | Lv7 |
|------|----------|-----|-------|-----|
| **DB 컬럼** | invest_balance, oroplay_balance | invest_balance, oroplay_balance, balance | balance | balance |
| **UI 표시** | 두 API 분리 | **balance만** | balance | balance |
| **→ Lv3 입금** | 두 API 차감 ✅ | 두 API 증가 ✅ | - | - |
| **→ Lv3 회수** | 선택 API 증가 ✅ | 선택 API 차감 ✅ | - | - |
| **→ Lv7 입금** | 차감 없음 ❌ | 차감 없음 ❌ | 차감 없음 ❌ | - |
| **→ Lv7 출금** | 증가 없음 ❌ | 증가 없음 ❌ | 증가 없음 ❌ | - |
| **게임 플레이 차감** | API별 차감 ✅ | ❌ 없음 | ❌ 없음 | - |
| **게임 종료 회수** | API별 회수 ✅ | ❌ 없음 | ❌ 없음 | - |

---

## 왜 이렇게 설계되었나?

### Lv1, Lv2의 지연 차감 이유
1. **API 호출 최소화**: 입금 시마다 외부 API 호출하지 않음
2. **실제 사용 추적**: 게임에서 실제 사용된 API만 정확히 차감
3. **유연성**: Lv7이 어떤 API 게임을 할지 미리 알 수 없음

### Lv3~6의 즉시 차감 이유
1. **단순성**: 단일 balance만 관리
2. **투명성**: 입금 즉시 보유금 변동 확인 가능
3. **일관성**: 일반적인 입금/출금 패턴과 동일

---

## 구현 포인트

### 1. DB 스키마 (700_add_lv3_generated_balance.sql)
```sql
-- Lv3 balance 자동 계산 트리거
CREATE OR REPLACE FUNCTION update_lv3_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.level = 3 THEN
    NEW.balance := COALESCE(NEW.invest_balance, 0) + COALESCE(NEW.oroplay_balance, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER trigger_update_lv3_balance
  BEFORE INSERT OR UPDATE OF invest_balance, oroplay_balance
  ON partners
  FOR EACH ROW
  WHEN (NEW.level = 3)
  EXECUTE FUNCTION update_lv3_balance();
```

### 2. ForceTransactionModal.tsx
```typescript
// API 선택 표시 조건 (Lv1/Lv2 → Lv2/Lv3 회수 시)
const showApiSelector = targetType === 'partner' && 
                        type === 'withdrawal' &&
                        ((currentUserLevel === 1 && (selectedTarget?.level === 2 || selectedTarget?.level === 3)) ||
                         (currentUserLevel === 2 && selectedTarget?.level === 3));

// 검증 로직
const isLv1ToLv3 = currentUserLevel === 1 && selectedTarget?.level === 3;
const isLv2ToLv3 = currentUserLevel === 2 && selectedTarget?.level === 3;

if (type === 'withdrawal' && (isLv1ToLv2 || isLv1ToLv3 || isLv2ToLv3)) {
  // 선택된 API 보유금 검증
  const targetApiBalance = apiType === 'invest' 
    ? (selectedTarget.invest_balance || 0) 
    : (selectedTarget.oroplay_balance || 0);
  
  if (amountNum > targetApiBalance) {
    errorMessage = `${apiType} API 출금 가능 금액 초과`;
  }
}

// 입금 제한 (Lv1, Lv2 → Lv3)
if (type === 'deposit' && (currentUserLevel === 1 || currentUserLevel === 2)) {
  const minBalance = Math.min(
    currentUserInvestBalance,
    currentUserOroplayBalance
  );
  if (amountNum > minBalance) {
    errorMessage = '보유금이 부족합니다.';
  }
}
```

### 3. PartnerManagement.tsx (파트너 간 거래)
```typescript
// Lv1/Lv2 → Lv3 입금
if ((adminLevel === 1 || adminLevel === 2) && targetLevel === 3 && type === 'deposit') {
  // 관리자: 두 API 차감
  await supabase
    .from('partners')
    .update({
      invest_balance: adminInvestBalance - amount,
      oroplay_balance: adminOroplayBalance - amount
    })
    .eq('id', adminId);
  
  // Lv3: 두 API 증가 (balance 자동 계산)
  await supabase
    .from('partners')
    .update({
      invest_balance: targetInvestBalance + amount,
      oroplay_balance: targetOroplayBalance + amount
    })
    .eq('id', targetId);
  
  // balance는 트리거가 자동 계산
}

// Lv1/Lv2 → Lv3 회수 (API 선택)
if ((adminLevel === 1 || adminLevel === 2) && targetLevel === 3 && type === 'withdrawal') {
  if (selectedApi === 'invest') {
    // Lv3 Invest 차감
    await supabase
      .from('partners')
      .update({ invest_balance: targetInvestBalance - amount })
      .eq('id', targetId);
    
    // Lv1/Lv2 Invest 증가
    await supabase
      .from('partners')
      .update({ invest_balance: adminInvestBalance + amount })
      .eq('id', adminId);
  } else {
    // OroPlay 동일 로직
    await supabase
      .from('partners')
      .update({ oroplay_balance: targetOroplayBalance - amount })
      .eq('id', targetId);
    
    await supabase
      .from('partners')
      .update({ oroplay_balance: adminOroplayBalance + amount })
      .eq('id', adminId);
  }
}
```

### 4. UserManagement.tsx (사용자 강제 입출금)
```typescript
// 1. Optimistic Update (DB 먼저 기록)
const optimisticBalance = data.type === 'deposit' 
  ? (user.balance || 0) + data.amount 
  : (user.balance || 0) - data.amount;

setUsers(prevUsers => 
  prevUsers.map(u => 
    u.id === data.targetId 
      ? { ...u, balance: optimisticBalance }
      : u
  )
);

// 2. 외부 API 호출 (Lv1~Lv7 모두 건너뜀)
let actualBalance = data.type === 'deposit' 
  ? (user.balance || 0) + data.amount
  : (user.balance || 0) - data.amount;

// ✅ Lv1, Lv2 → Lv7: 입출금 모두 내부 거래만
// ✅ Lv3~7 → Lv7: 입출금 모두 내부 거래만
// 게임 플레이 시: 외부 API 차감
// 게임 종료 시: 외부 API 회수

// 3. 관리자 보유금 처리
// Lv1: 변동 없음
// Lv2: 변동 없음 (입출금 모두)
// Lv3~7: 변동 없음 (입출금 모두)
```

### 5. 게임 실행/종료 Optimistic Update (⭐ 신규)

#### 게임 실행 시 Deposit
```typescript
// lib/gameApi.ts - launchInvestGame / launchOroPlayGame

// ⭐ 1. api_configs balance 먼저 차감 (Optimistic Update)
const { data: currentConfig } = await supabase
  .from('api_configs')
  .select('invest_balance') // 또는 oroplay_balance
  .eq('partner_id', topLevelPartnerId)
  .single();

const currentBalance = currentConfig.invest_balance || 0;

// 보유금 부족 체크
if (currentBalance < userBalance) {
  return { success: false, error: '관리자 보유금 부족' };
}

// DB 먼저 차감 (동기화 이슈 해결)
await supabase
  .from('api_configs')
  .update({ 
    invest_balance: currentBalance - userBalance,
    updated_at: new Date().toISOString()
  })
  .eq('partner_id', topLevelPartnerId);

// ⭐ 2. 외부 API deposit 호출
const depositResult = await investApi.depositBalance(...);

// ⭐ 3. 실패 시 롤백
if (!depositResult.success) {
  await supabase
    .from('api_configs')
    .update({ invest_balance: currentBalance })
    .eq('partner_id', topLevelPartnerId);
}
```

**효과:**
- 관리자 보유금 중복 체크 안정화
- 동시 게임 실행 시 잔고 부족 에러 방지
- DB 먼저 업데이트 → 외부 API 호출 → 실패 시 롤백

#### 게임 종료 시 Withdraw
```typescript
// lib/investApi.ts - withdrawBalance

// ⭐ 1. partner_id 찾기 (opcode로)
const { data: apiConfig } = await supabase
  .from('api_configs')
  .select('partner_id, invest_balance')
  .eq('invest_opcode', opcode)
  .single();

const previousBalance = apiConfig.invest_balance || 0;

// ⭐ 2. api_configs balance 먼저 증가 (Optimistic Update)
await supabase
  .from('api_configs')
  .update({ 
    invest_balance: previousBalance + amount,
    updated_at: new Date().toISOString()
  })
  .eq('partner_id', apiConfig.partner_id);

// ⭐ 3. users balance 먼저 업데이트 (Optimistic Update)
await supabase
  .from('users')
  .update({ 
    balance: amount,
    updated_at: new Date().toISOString()
  })
  .eq('username', username);

// ⭐ 4. 외부 API withdraw 호출
const result = await withdrawFromAccount(...);

// ⭐ 5. 실패 시 롤백
if (result.error) {
  await supabase.from('api_configs').update({ invest_balance: previousBalance });
  await supabase.from('users').update({ balance: previousUserBalance });
}
```

**효과:**
- 게임 종료 후 즉시 보유금 반영
- 사용자/관리자 보유금 동기화 보장
- 외부 API 오류 시에도 데이터 정합성 유지

---

### 6. 베팅 기록 동기화 최적화 (⭐ 업데이트)

#### 기존 방식 (❌)
```typescript
// 30초마다 자동 API 호출
setInterval(() => {
  syncBettingHistory();
}, 30000);
```

**문제점:**
- 불필요한 API 호출 (베팅 없어도 계속 호출)
- 서버 부하 증가
- 동기화 타이밍 이슈

#### 신규 방식 (✅)
```typescript
// BettingHistorySync.tsx
// 세션 자동 종료만 30초마다 체크
setInterval(() => {
  checkAndEndInactiveSessions(user.id);
}, 30000);

// BettingHistory.tsx
// 새로고침 버튼 클릭 시에만 API 호출
<Button onClick={async () => {
  await forceSyncBettingHistory(user);
  await loadBettingData();
}}>
  새로고침
</Button>

// Realtime Subscription으로 자동 업데이트
supabase
  .channel('betting-realtime')
  .on('postgres_changes', { event: 'INSERT', table: 'game_records' }, () => {
    loadBettingData(); // 테이블 깜박임 없이 업데이트
  })
  .subscribe();
```

**효과:**
- 불필요한 API 호출 제거 (성능 최적화)
- 사용자가 필요할 때만 수동 새로고침
- Realtime으로 자동 업데이트는 유지
- 테이블 깜박임 없음

---

### 게임 실행 시 (gameApi.ts)
```typescript
// Lv7이 게임 실행할 때
async function launchGame(userId, gameId, apiType) {
  // 1. 게임 실행
  const gameUrl = await callGameApi(userId, gameId, apiType);
  
  // 2. Lv1/Lv2 추적 (게임 세션에 api_type 기록)
  await supabase
    .from('game_sessions')
    .insert({
      user_id: userId,
      api_type: apiType, // 'invest' or 'oroplay'
      status: 'active'
    });
  
  // 3. 게임 종료 시 실제 API에서 차감
  // (별도 함수에서 처리)
}
```

---

## 주의사항

### ⚠️ Lv1, Lv2의 API 보유금은 게임 플레이 시에만 변동
- 입금 시점에 API 보유금을 차감하면 **안 됩니다**
- 게임 세션에 `api_type`을 반드시 기록해야 합니다
- 게임 종료 시 해당 `api_type`의 보유금을 차감해야 합니다

### ✅ Lv3~6은 즉시 차감
- 입금 시점에 바로 `balance` 차감
- 게임 플레이와 무관하게 처리

### 💡 출금은 모두 동일
- 대상자의 전체 `balance`만 체크
- API 구분 없음

---

## 테스트 시나리오

### 시나리오 1: Lv2 → Lv3 입금 ⭐ (신규)
```
초기:
- Lv2 Invest: 1,000,000원, OroPlay: 1,500,000원
- Lv3 Invest: 500,000원, OroPlay: 700,000원, balance: 1,200,000원

1. Lv2 → Lv3 입금 100,000원
   → Lv2 Invest: 900,000원 ✅
   → Lv2 OroPlay: 1,400,000원 ✅
   → Lv3 Invest: 600,000원 ✅
   → Lv3 OroPlay: 800,000원 ✅
   → Lv3 balance: 1,400,000원 (자동 계산) ✅
   → Lv3 UI: 1,400,000원만 표시 ✅
```

### 시나리오 2: Lv2 → Lv3 회수 (Invest API) ⭐ (신규)
```
초기:
- Lv2 Invest: 900,000원, OroPlay: 1,400,000원
- Lv3 Invest: 600,000원, OroPlay: 800,000원, balance: 1,400,000원

1. 모달에서 Invest API 선택 후 회수 50,000원
   → Lv2 Invest: 950,000원 ✅
   → Lv2 OroPlay: 1,400,000원 (변동 없음) ✅
   → Lv3 Invest: 550,000원 ✅
   → Lv3 OroPlay: 800,000원 (변동 없음) ✅
   → Lv3 balance: 1,350,000원 (자동 재계산) ✅
```

### 시나리오 3: Lv1 → Lv7 입금 후 Invest 게임
```
1. Lv1 Invest: 1,000,000원, OroPlay: 1,500,000원
2. Lv1 → Lv7 입금 100,000원
   → Lv1 API 보유금 변동 없음 ✅
3. Lv7 Invest 게임 베팅 10,000원
   → Lv1 Invest: 990,000원 ✅
   → Lv1 OroPlay: 1,500,000원 (변동 없음) ✅
```

### 시나리오 4: Lv3 → Lv7 입금 후 게임
```
1. Lv3 balance: 1,350,000원
2. Lv3 → Lv7 입금 100,000원
   → Lv3 balance: 1,250,000원 ✅
3. Lv7 게임 플레이
   → Lv3 balance: 1,250,000원 (변동 없음) ✅
```

### 시나리오 5: Lv3 → Lv7 출금
```
1. Lv7 balance: 50,000원
2. Lv3 → Lv7 출금 30,000원
   → Lv7 balance: 20,000원 ✅
   → Lv3 balance: 1,280,000원 ✅
```

---

## 관련 파일

- `/guidelines/deposit_withdrawal_logic.md` - 이 문서
- `/guidelines/api_enable_settings.md` - API 설정 가이드
- `/guidelines/seamless_wallet_integration.md` - 전체 지갑 시스템
- `/components/admin/UserManagement.tsx` - 강제 입출금 구현
- `/components/admin/ForceTransactionModal.tsx` - 입금 제한 검증
- `/lib/gameApi.ts` - 게임 실행 및 API 차감

---

**문서 작성일**: 2025-01-10  
**최종 수정일**: 2025-01-10  
**버전**: 1.0
