# 지갑 관리 시스템 - 버그 수정 리포트

## 수정일: 2025-01-06
## 수정자: AI Assistant

---

## 📋 수정 개요

HIGH 우선순위 버그 2건을 즉시 수정했습니다.

---

## ✅ 수정 완료 항목

### 1. BalanceContext: Lv1 잔고 표시 오류 수정

**파일**: `/contexts/BalanceContext.tsx` 라인 367, 374

**수정 전**:
```typescript
// ❌ Invest 잔고만 표시 (OroPlay 누락)
setBalance(newBalance);

console.log('✅ [Balance] React State 업데이트 완료:', {
  invest: newBalance,
  oroplay: oroBalance,
  balance: newBalance  // ❌ Invest만
});
```

**수정 후**:
```typescript
// ✅ Invest + OroPlay 합계
setBalance(newBalance + oroBalance);

console.log('✅ [Balance] React State 업데이트 완료:', {
  invest: newBalance,
  oroplay: oroBalance,
  balance: newBalance + oroBalance  // ✅ 합계
});
```

**영향**:
- ✅ Lv1 (시스템관리자)의 총 보유금이 정확히 표시됨
- ✅ Invest + OroPlay 2개 지갑의 합계가 올바르게 계산됨

**검증 방법**:
1. Lv1 계정으로 로그인
2. AdminHeader에서 보유금 확인
3. Invest 보유금 + OroPlay 보유금 = 총 보유금인지 확인

---

### 2. UserDeposit: 입금 중복 신청 방지 로직 추가

**파일**: `/components/user/UserDeposit.tsx` 라인 93-119

**추가된 함수**:
```typescript
// 🔧 추가: 진행 중인 입금 신청 확인 (중복 방지)
const checkPendingDeposit = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('transaction_type', 'deposit')
      .in('status', ['pending', 'approved'])
      .limit(1);

    if (error) {
      console.error('❌ 진행 중인 입금 확인 오류:', error);
      return true; // 오류 시 안전하게 진행 허용
    }

    if (data && data.length > 0) {
      toast.warning('이미 진행 중인 입금 신청이 있습니다.');
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ 진행 중인 입금 확인 오류:', error);
    return true; // 오류 시 안전하게 진행 허용
  }
};
```

**handleDepositSubmit 수정**:
```typescript
const handleDepositSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!amount) {
    toast.error('모든 필수 항목을 입력해주세요.');
    return;
  }

  // 🔧 추가: 중복 신청 방지
  const canDeposit = await checkPendingDeposit();
  if (!canDeposit) {
    return;
  }

  // ... 기존 로직 계속
};
```

**영향**:
- ✅ 사용자가 여러 번 클릭해도 중복 신청 차단
- ✅ 진행 중인 입금이 있으면 Toast 경고 메시지 표시
- ✅ 출금과 동일한 중복 방지 로직 적용

**검증 방법**:
1. 사용자 계정으로 로그인
2. 입금 신청 제출 (상태: pending)
3. 다시 입금 신청 시도
4. "이미 진행 중인 입금 신청이 있습니다." 메시지 확인
5. 관리자가 승인/거절 후 다시 신청 가능한지 확인

---

## ⚠️ 추가 확인 필요 사항

### 1. 트리거 존재 여부 확인

**확인 방법**:
Supabase SQL Editor에서 다음 쿼리 실행:

```sql
-- 트리거 확인
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers 
WHERE trigger_name LIKE '%transaction%';

-- 함수 확인
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_name LIKE '%transaction%' 
  OR routine_name LIKE '%balance%';
```

**예상 결과**:
```
trigger_name: update_user_balance_on_transaction
event_manipulation: INSERT
event_object_table: transactions
```

**트리거가 없을 경우**:
다음 SQL을 실행하여 생성:

```sql
-- 트리거 함수 생성
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
    
    -- balance_after 업데이트
    NEW.balance_after := (SELECT balance FROM users WHERE id = NEW.user_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER update_user_balance_on_transaction
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION auto_update_user_balance();
```

---

### 2. 게임 Transfer 로직 점검

**다음 점검 시 확인 필요**:
- `/lib/gameApi.ts` 전체 분석
- 게임 시작 시 Transfer 플로우
- 게임 종료 시 Transfer 플로우
- 팝업 강제 종료 시 처리

---

## 📊 수정 전후 비교

### Lv1 보유금 표시

| 구분 | Invest 잔고 | OroPlay 잔고 | 표시된 총 보유금 | 정확성 |
|------|------------|-------------|----------------|-------|
| **수정 전** | ₩1,000,000 | ₩500,000 | ₩1,000,000 | ❌ 틀림 |
| **수정 후** | ₩1,000,000 | ₩500,000 | ₩1,500,000 | ✅ 정확 |

### 입금 중복 신청

| 시나리오 | 수정 전 | 수정 후 |
|---------|--------|--------|
| 첫 번째 입금 신청 | ✅ 가능 | ✅ 가능 |
| 진행 중인 입금 있을 때 재신청 | ⚠️ 가능 (중복) | ❌ 차단 |
| 승인/거절 후 재신청 | ✅ 가능 | ✅ 가능 |

---

## 🎯 다음 단계

### 즉시 확인 (사용자가 직접)
1. **Supabase 대시보드 접속**
2. **SQL Editor**에서 트리거 확인 쿼리 실행
3. **결과 공유** → 트리거 없으면 생성 필요

### 다음 점검 (AI)
1. 게임 Transfer 로직 (`/lib/gameApi.ts`)
2. OroPlay API 통합 (`/lib/oroplayApi.ts`)
3. 배팅 기록 동기화 (`/components/admin/BettingHistorySync.tsx`)

---

## 📎 관련 문서

- `/docs/wallet-management/BUG_INSPECTION_REPORT.md` - 전체 버그 점검 리포트
- `/docs/wallet-management/DATABASE_SCHEMA.md` - DB 스키마
- `/docs/wallet-management/README.md` - 시스템 개요

---

## 🆕 추가 수정 항목 (2025-01-06 추가)

### 3. Lv1/Lv2 파트너 보유금 자동 계산 트리거 추가

**파일**: `/database/500_auto_update_lv1_lv2_balance.sql` (신규 생성)

**문제점**:
- Lv1/Lv2의 invest_balance와 oroplay_balance가 업데이트되어도 balance 컬럼이 0으로 표시됨
- 파트너 간 입금 처리 시 보유금이 화면에 반영되지 않음

**해결 방법**:
```sql
-- 트리거 함수: invest_balance + oroplay_balance = balance 자동 계산 (Lv1/Lv2)
CREATE OR REPLACE FUNCTION auto_update_lv1_lv2_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.level IN (1, 2) THEN
    NEW.balance := COALESCE(NEW.invest_balance, 0) + COALESCE(NEW.oroplay_balance, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER trigger_auto_update_lv1_lv2_balance
BEFORE INSERT OR UPDATE OF invest_balance, oroplay_balance, level
ON partners
FOR EACH ROW
EXECUTE FUNCTION auto_update_lv1_lv2_balance();

-- 기존 데이터 일괄 업데이트
UPDATE partners
SET balance = COALESCE(invest_balance, 0) + COALESCE(oroplay_balance, 0),
    updated_at = NOW()
WHERE level IN (1, 2);
```

**영향**:
- ✅ Lv1/Lv2 파트너의 invest_balance 또는 oroplay_balance 업데이트 시 balance 자동 계산
- ✅ 파트너 간 입금/출금 시 화면에 즉시 반영
- ✅ API별 잔고 총합이 자동으로 balance에 표시됨
- ✅ Lv3~Lv6는 balance만 사용하므로 영향 없음

**적용 방법**:
1. Supabase SQL Editor에서 `/database/500_auto_update_lv1_lv2_balance.sql` 실행
2. 기존 Lv1/Lv2 파트너의 balance가 자동으로 업데이트됨
3. 이후 모든 입금/출금 시 자동 반영

**검증 방법**:
```sql
-- Lv1/Lv2 파트너의 보유금 확인
SELECT 
  id,
  username,
  nickname,
  level,
  invest_balance,
  oroplay_balance,
  balance,
  (COALESCE(invest_balance, 0) + COALESCE(oroplay_balance, 0)) AS calculated_balance,
  balance = (COALESCE(invest_balance, 0) + COALESCE(oroplay_balance, 0)) AS is_correct
FROM partners
WHERE level IN (1, 2)
ORDER BY level, created_at DESC;
```

---

## 🆕 추가 수정 항목 (2025-01-06 추가 - Realtime 동기화)

### 4. Lv1/Lv2 파트너 Realtime 동기화 수정

**파일**: `/components/admin/PartnerManagement.tsx` (라인 361-405, 279-298)

**문제점**:
- Lv1/Lv2 파트너의 invest_balance/oroplay_balance 업데이트 시 balance가 화면에 반영되지 않음
- Realtime 구독에서 balance를 강제로 0으로 설정하여 트리거 결과를 무시함

**해결 방법**:
```typescript
// 수정 전: balance를 강제로 0으로 설정
return {
  ...p,
  invest_balance: newInvestBalance,
  oroplay_balance: newOroplayBalance,
  balance: 0 // ❌ 트리거 결과 무시
};

// 수정 후: 트리거가 계산한 balance 사용
const newBalance = (payload.new as any).balance || 0;
return {
  ...p,
  invest_balance: newInvestBalance,
  oroplay_balance: newOroplayBalance,
  balance: newBalance // ✅ 트리거 결과 반영
};
```

**영향**:
- ✅ Lv1/Lv2 파트너 입출금 시 화면 즉시 업데이트
- ✅ DB 업데이트 → 트리거 실행 → Realtime 이벤트 → 화면 반영 전체 흐름 완성
- ✅ 중복 처리 방지 (Lv1은 api_configs + partners, Lv2는 전용 구독에서만 처리)

**적용 방법**:
1. 코드는 이미 수정 완료
2. 브라우저 새로고침 (Ctrl + F5)
3. Lv1/Lv2 파트너에게 입금/출금 테스트

**검증 방법**:
1. Lv1 계정으로 로그인
2. 파트너 계층 관리 → gms11(Lv2) 선택
3. 강제 입금 (Invest API, 10,000원)
4. 화면에서 보유금이 즉시 업데이트되는지 확인
5. F12 콘솔에서 다음 로그 확인:
   ```
   💰 Lv2 보유금 변경 (partner_id: xxx): I:110000 + O:142996.8 = B:252996.8
   ```

---

**수정 완료**: 2025-01-06  
**적용 대상**: BalanceContext.tsx, UserDeposit.tsx, 500_auto_update_lv1_lv2_balance.sql (신규), PartnerManagement.tsx  
**검증 필요**: Supabase에서 SQL 실행 후 트리거 작동 확인 + Lv1/Lv2 입출금 테스트
