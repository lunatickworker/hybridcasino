# 지갑 관리 시스템 - 버그 점검 리포트

## 작성일: 2025-01-06
## 점검자: AI Assistant
## 점검 범위: 전체 지갑 관리 시스템

---

## 📋 점검 개요

전체 지갑 관리 시스템을 상세히 점검하여 잠재적 버그와 개선 사항을 파악했습니다.

### 점검 대상 파일
1. `/contexts/BalanceContext.tsx` - 보유금 Context (Realtime 구독)
2. `/components/admin/TransactionManagement.tsx` - 입출금 승인
3. `/components/user/UserDeposit.tsx` - 사용자 입금
4. `/components/user/UserWithdraw.tsx` - 사용자 출금
5. `/lib/investApi.ts` - Invest API 호출
6. `/lib/oroplayApi.ts` - OroPlay API 호출 (예정)
7. `/lib/gameApi.ts` - 게임 Transfer (예정)

---

## 🐛 발견된 버그 및 문제점

### 🔴 HIGH - 즉시 수정 필요

#### 1. BalanceContext: Lv1 잔고 표시 오류

**파일**: `/contexts/BalanceContext.tsx` 라인 367

**문제**:
```typescript
// ❌ 잘못된 코드
setBalance(newBalance);  // Lv1인데 Invest 잔고만 표시

// ✅ 올바른 코드 (API별 2개 지갑의 합계)
setBalance(newBalance + oroBalance);
```

**영향**:
- Lv1 (시스템관리자)는 Invest + OroPlay 2개 지갑을 사용하는데, balance에 Invest만 반영됨
- OroPlay 잔고가 누락되어 실제보다 적게 표시됨

**수정 방법**:
```typescript
// 라인 367 수정
setBalance(newBalance + oroBalance);  // Invest + OroPlay 합계
```

---

#### 2. BalanceContext: Lv2 잔고 동기화 누락

**파일**: `/contexts/BalanceContext.tsx` 라인 180-183

**문제**:
```typescript
// ✅ Lv2 이하는 잔고 동기화 안 함
if (user.level !== 1) {
  console.log('ℹ️ [Balance] Lv2 이하는 Invest+OroPlay 잔고 동기화 스킵');
  return;
}
```

**설계 의도 확인 필요**:
- **Lv2 (대본사)**는 `partners.invest_balance`, `partners.oroplay_balance` 2개 지갑을 사용
- 현재 코드는 Lv2의 API 잔고를 동기화하지 않음
- Lv2가 자체 API credentials를 보유하는지 확인 필요

**수정 여부 판단 기준**:
1. **Lv2가 자체 API credentials 있음** → Lv1과 동일한 동기화 로직 필요
2. **Lv2는 Lv1로부터 수동 입금만 받음** → 현재 코드 유지 (API 동기화 불필요)

**문서 확인**:
- `/guidelines/add_api_policy.md`: Lv2는 API credentials 없음, Lv1로부터 입금만 받음
- 따라서 현재 코드가 맞음 (Lv2는 API 동기화 불필요)

**결론**: ✅ 현재 코드 정상 (수정 불필요)

---

#### 3. 입금 중복 신청 방지 누락

**파일**: `/components/user/UserDeposit.tsx`

**문제**:
- 출금은 중복 방지 로직 구현됨 (`UserWithdraw.tsx` 라인 65-87)
- 입금은 중복 방지 로직 없음
- 사용자가 여러 번 클릭하면 중복 신청 가능

**수정 방법**:
```typescript
// UserDeposit.tsx에 추가 필요
const checkPendingDeposit = async () => {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .eq('transaction_type', 'deposit')
    .in('status', ['pending', 'approved'])
    .limit(1);
  
  if (data && data.length > 0) {
    toast.warning('이미 진행 중인 입금 신청이 있습니다.');
    return false;
  }
  return true;
};

// handleDepositSubmit 시작 부분에 추가
const canDeposit = await checkPendingDeposit();
if (!canDeposit) return;
```

---

### 🟡 MEDIUM - 우선 순위 높음

#### 4. OroPlay API 입출금 처리 누락

**파일**: `/components/admin/TransactionManagement.tsx` 라인 320-418

**문제**:
- 현재 **Invest API만** 사용하여 입출금 처리
- OroPlay API 게임을 사용하는 사용자의 입출금은 어떻게 처리되는가?

**현재 코드**:
```typescript
// TransactionManagement.tsx - handleTransactionAction
if (transaction.transaction_type === 'deposit') {
  apiResult = await depositBalance(...);  // ❌ Invest API만 호출
} else if (transaction.transaction_type === 'withdrawal') {
  apiResult = await withdrawBalance(...);  // ❌ Invest API만 호출
}
```

**설계 정책 확인**:
`/guidelines/seamless_wallet_integration.md` 확인 결과:
- **Seamless Wallet**: 사용자는 API를 의식하지 않음
- **GMS 내부 지갑 (users.balance)**: 모든 게임에서 공용으로 사용
- **Transfer**: 게임 시작 시 GMS → API, 게임 종료 시 API → GMS

**결론**:
- 입출금은 **GMS 내부 지갑 (users.balance)만 업데이트**하면 됨
- 게임 시작 시 Transfer로 API에 입금됨
- 따라서 Invest API만 사용해도 문제 없음 (OroPlay는 게임 Transfer 시에만 사용)

**하지만 확인 필요**:
- 현재 Invest API 입출금은 **외부 API 지갑**에 직접 입출금하는 것
- Seamless Wallet 설계와 다르게 구현된 것인지 확인 필요
- `gameApi.ts`의 Transfer 로직 점검 필요

**임시 결론**: ⚠️ 게임 Transfer 로직 점검 후 재평가

---

#### 5. 트리거 함수 미확인

**문제**:
- 문서에서 트리거 존재를 가정했지만, `/database/` 폴더에 트리거 SQL 없음
- `251_transaction_triggers.sql` 파일이 프로젝트에 존재하지 않음

**확인 필요**:
```sql
-- 이 트리거가 Supabase에 실제로 존재하는지 확인 필요
CREATE TRIGGER update_user_balance_on_transaction
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION auto_update_user_balance();
```

**대안**:
- 트리거가 없다면 프론트엔드에서 수동으로 users.balance 업데이트 필요
- TransactionManagement.tsx에서 승인 시 직접 업데이트

---

### 🟢 LOW - 개선 권장

#### 6. 금액 파싱 유틸 함수 공통화

**문제**:
- 금액 정수 변환 로직이 여러 곳에 중복됨
```typescript
// TransactionManagement.tsx 라인 343, 443
const amountNum = Math.floor(parseFloat(amount));

// investApi.ts 라인 516, 541
const amountInt = Math.floor(amount);
```

**개선안**:
```typescript
// /lib/utils.ts에 추가
export function parseTransactionAmount(amount: string | number): number {
  const parsed = parseFloat(amount.toString());
  if (isNaN(parsed) || parsed < 0) {
    throw new Error('유효하지 않은 금액입니다.');
  }
  return Math.floor(parsed); // 소수점 버림
}
```

---

#### 7. API 응답 balance_after 파싱 누락

**파일**: `/components/admin/TransactionManagement.tsx` 라인 385-396

**문제**:
- Invest API 응답에서 `balance_after`를 파싱하지 않음
- Guidelines.md: 입출금 API는 "충전된 금액과 현재 잔고 반환"

**개선안**:
```typescript
// API 응답 파싱 추가
let balanceAfter = null;
if (apiResult.data) {
  if (apiResult.data.DATA?.balance) {
    balanceAfter = Number(apiResult.data.DATA.balance);
  } else if (apiResult.data.current_balance) {
    balanceAfter = Number(apiResult.data.current_balance);
  }
}

// transactions 업데이트 시 포함
await supabase
  .from('transactions')
  .update({
    status: 'completed',
    balance_after: balanceAfter,  // 추가
    processed_by: user.id,
    processed_at: new Date().toISOString()
  })
  .eq('id', transaction.id);
```

---

#### 8. Realtime 구독 중복 방지

**파일**: `/contexts/BalanceContext.tsx` 라인 447-530

**문제**:
- user.id가 변경될 때마다 새로운 구독 생성
- 이전 구독을 명시적으로 unsubscribe하지 않음 (cleanup에서만)

**개선안**:
```typescript
useEffect(() => {
  if (!user?.id) return;
  
  // 기존 구독 정리
  const cleanup = () => {
    supabase.removeAllChannels();  // 또는 개별 채널 unsubscribe
  };
  
  // 새 구독 시작
  const channel1 = supabase.channel(...)...
  const channel2 = supabase.channel(...)...
  
  return cleanup;
}, [user?.id]);
```

현재 코드는 cleanup에서 unsubscribe하므로 큰 문제는 없지만, 명시적으로 정리하는 것이 안전함.

---

## ✅ 정상 작동 확인 항목

### 1. MD5 Signature 생성
- ✅ UTF-8 인코딩 포함
- ✅ Guidelines.md와 일치하는 파라미터 순서

### 2. Invest API 호출
- ✅ Proxy 서버 경유
- ✅ 재시도 로직 포함
- ✅ 금액 정수 변환

### 3. NaN 방지
- ✅ 모든 balance 파싱 시 타입 체크
- ✅ isNaN() 검증

### 4. Realtime 구독
- ✅ partners 테이블 구독
- ✅ api_configs 테이블 구독 (Lv1, Lv2만)
- ✅ transactions 테이블 구독

### 5. 출금 중복 방지
- ✅ 진행 중인 출금 체크
- ✅ 중복 신청 차단

---

## 🔧 수정 우선순위

### 즉시 수정 (HIGH)
1. ✅ **BalanceContext.tsx 라인 367**: Lv1 잔고 표시 (Invest + OroPlay 합계)
2. ✅ **UserDeposit.tsx**: 입금 중복 신청 방지 로직 추가
3. ⚠️ **트리거 존재 여부 확인**: Supabase에서 직접 확인 필요

### 우선 순위 높음 (MEDIUM)
4. ⚠️ **게임 Transfer 로직 점검**: `gameApi.ts` 전체 분석
5. ⚠️ **OroPlay API 입출금**: 설계 정책 재확인 후 결정

### 개선 권장 (LOW)
6. **금액 파싱 유틸 함수** 공통화
7. **API 응답 balance_after 파싱**
8. **Realtime 구독 중복 방지**

---

## 📝 다음 단계

### 1단계: 즉시 수정 사항 적용
- [ ] BalanceContext.tsx 라인 367 수정
- [ ] UserDeposit.tsx 중복 방지 로직 추가

### 2단계: 확인 작업
- [ ] Supabase에서 트리거 존재 여부 확인
  ```sql
  SELECT * FROM information_schema.triggers 
  WHERE trigger_name = 'update_user_balance_on_transaction';
  ```
- [ ] gameApi.ts Transfer 로직 점검

### 3단계: 개선 사항 적용
- [ ] 금액 파싱 유틸 함수 생성
- [ ] API 응답 balance_after 파싱 추가

---

## 🔍 추가 점검 필요 항목

### 1. 게임 Transfer 플로우
**파일**: `/lib/gameApi.ts`

**점검 항목**:
- 게임 시작 시: GMS 출금 → API 입금 원자성 보장
- 게임 종료 시: API 출금 → GMS 입금 원자성 보장
- 팝업 강제 종료 시: 잔고 복구 로직
- API 호출 실패 시: 롤백 메커니즘

### 2. 배팅 기록 동기화
**파일**: `/components/admin/BettingHistorySync.tsx`

**점검 항목**:
- Invest API historyindex 응답에서 username별 balance 파싱
- 사용자 보유금 자동 동기화 여부

### 3. OroPlay API 통합
**파일**: `/lib/oroplayApi.ts`

**점검 항목**:
- POST /user/deposit 구현 확인
- POST /user/withdraw-all 구현 확인
- Token 갱신 로직 확인

---

## 📎 관련 문서

- `/docs/wallet-management/DATABASE_SCHEMA.md` - DB 스키마
- `/docs/wallet-management/WALLET_SYSTEM_INSPECTION_REPORT.md` - 이전 점검 리포트
- `/guidelines/Guidelines.md` - Invest API 명세
- `/guidelines/seamless_wallet_integration.md` - Seamless Wallet 설계

---

**점검 완료**: 2025-01-06  
**다음 점검**: 게임 Transfer 로직, 트리거 확인 후
