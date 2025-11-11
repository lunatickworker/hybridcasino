# 지갑 관리 시스템 - 검증 가이드

## 작성일: 2025-01-06
## 목적: 사용자와 함께 수정사항 검증

---

## 📋 검증 개요

수정된 3개 버그를 함께 검증합니다.

### 수정 항목
1. ✅ BalanceContext: Lv1 보유금 표시 (Invest + OroPlay 합계)
2. ✅ UserDeposit: 입금 중복 신청 방지
3. ✅ Lv2 파트너 보유금 자동 계산 트리거 (신규 추가)

---

## 🔍 검증 1: Lv1 보유금 표시 수정

### 준비 단계

1. **Supabase SQL Editor 접속**
   - URL: https://hduofjzsitoaujyjvuix.supabase.co
   - SQL Editor 탭 열기

2. **Lv1 계정의 api_configs 확인**

```sql
SELECT 
  partner_id,
  invest_balance,
  oroplay_balance,
  (invest_balance + oroplay_balance) AS total_expected
FROM api_configs
WHERE partner_id IN (
  SELECT id FROM partners WHERE level = 1
)
LIMIT 1;
```

**예상 결과**:
```
partner_id: [UUID]
invest_balance: 1000000
oroplay_balance: 500000
total_expected: 1500000  ← 이 값이 화면에 표시되어야 함
```

### 검증 단계

1. **Lv1 계정으로 로그인**
   - 시스템관리자 계정 사용

2. **AdminHeader 보유금 확인**
   - 우측 상단 보유금 표시 영역 확인
   - 표시된 금액과 DB의 `total_expected` 비교

3. **개발자 도구 콘솔 확인**
   ```
   F12 → Console 탭
   
   검색: "[Balance] React State 업데이트 완료"
   
   확인 사항:
   {
     invest: 1000000,
     oroplay: 500000,
     balance: 1500000  ← Invest + OroPlay 합계인지 확인
   }
   ```

### 성공 기준

- ✅ 화면 표시 금액 = DB의 `invest_balance + oroplay_balance`
- ✅ 콘솔 로그의 `balance` = `invest + oroplay`

### 실패 시 조치

**증상**: 여전히 Invest 잔고만 표시됨

**원인**: 캐시된 JavaScript 파일 사용

**해결**:
1. Ctrl + F5 (강력 새로고침)
2. 브라우저 캐시 삭제
3. 시크릿 모드로 재접속

---

## 🔍 검증 2: 입금 중복 신청 방지

### 준비 단계

1. **테스트용 사용자 계정 준비**
   - 일반 사용자 (Lv7) 계정 필요
   - 진행 중인 입금이 없는 상태

2. **transactions 테이블 초기 상태 확인**

```sql
SELECT 
  id,
  user_id,
  transaction_type,
  amount,
  status,
  created_at
FROM transactions
WHERE user_id = '[사용자 UUID]'
  AND transaction_type = 'deposit'
  AND status IN ('pending', 'approved')
ORDER BY created_at DESC
LIMIT 1;
```

**예상 결과**: 0 rows (진행 중인 입금 없음)

### 검증 단계

#### 테스트 1: 첫 번째 입금 신청 (정상 케이스)

1. **사용자 계정으로 로그인**

2. **입금 신청**
   - 메뉴: 입금
   - 금액: 10,000원
   - 메모: "테스트 입금"
   - [신청하기] 버튼 클릭

3. **결과 확인**
   - ✅ "입금 신청이 완료되었습니다" Toast 메시지
   - ✅ 입금 내역에 "대기중" 상태로 표시

4. **DB 확인**
```sql
SELECT status FROM transactions
WHERE user_id = '[사용자 UUID]'
  AND transaction_type = 'deposit'
ORDER BY created_at DESC
LIMIT 1;
```
**예상**: status = 'pending'

#### 테스트 2: 중복 신청 방지 (핵심 테스트)

1. **다시 입금 신청 시도**
   - 메뉴: 입금
   - 금액: 20,000원
   - [신청하기] 버튼 클릭

2. **결과 확인**
   - ✅ "이미 진행 중인 입금 신청이 있습니다." Toast 경고
   - ✅ 신청이 **차단**됨
   - ❌ transactions 테이블에 새 레코드 **생성되지 않음**

3. **DB 확인**
```sql
SELECT COUNT(*) as pending_count
FROM transactions
WHERE user_id = '[사용자 UUID]'
  AND transaction_type = 'deposit'
  AND status = 'pending';
```
**예상**: pending_count = 1 (여전히 1개만)

#### 테스트 3: 승인 후 재신청 (정상 케이스)

1. **관리자 계정으로 전환**
   - 거래 관리 메뉴 접속

2. **입금 신청 승인**
   - 대기 중인 입금 찾기
   - [승인] 버튼 클릭

3. **사용자 계정으로 전환**
   - 입금 신청 상태 확인
   - 상태: "완료" 또는 "승인"

4. **다시 입금 신청**
   - 금액: 30,000원
   - [신청하기] 버튼 클릭

5. **결과 확인**
   - ✅ "입금 신청이 완료되었습니다" Toast 메시지
   - ✅ 신청 **성공**
   - ✅ 새 레코드 생성됨

### 성공 기준

| 테스트 케이스 | 예상 결과 | 확인 |
|-------------|----------|------|
| 첫 번째 입금 신청 | ✅ 성공 | □ |
| 진행 중 상태에서 재신청 | ❌ 차단 + Toast 경고 | □ |
| 승인 후 재신청 | ✅ 성공 | □ |
| 거절 후 재신청 | ✅ 성공 | □ |

### 실패 시 조치

**증상 1**: 중복 신청이 여전히 가능함

**원인**: 코드가 적용되지 않음

**해결**:
1. 브라우저 강력 새로고침 (Ctrl + F5)
2. `/components/user/UserDeposit.tsx` 파일 확인
3. `checkPendingDeposit` 함수 존재 여부 확인

**증상 2**: 승인 후에도 재신청 불가

**원인**: status 체크 로직 오류

**해결**:
```typescript
// checkPendingDeposit 함수 확인
.in('status', ['pending', 'approved'])  // ← 'approved'가 포함되어 있는지 확인

// 수정: 'pending'만 체크해야 함
.eq('status', 'pending')
```

---

## 🔍 검증 3: 트리거 존재 여부 확인 (중요!)

### 확인 단계

**Supabase SQL Editor에서 실행**:

```sql
-- 1️⃣ 트리거 확인
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'transactions'
  AND trigger_name LIKE '%balance%';

-- 2️⃣ 함수 확인
SELECT 
  routine_name,
  routine_definition
FROM information_schema.routines 
WHERE routine_name LIKE '%balance%'
  AND routine_type = 'FUNCTION';
```

### 예상 결과

#### 트리거 존재하는 경우
```
trigger_name: update_user_balance_on_transaction
event_manipulation: INSERT
event_object_table: transactions
action_statement: EXECUTE FUNCTION auto_update_user_balance()
```

#### 트리거 없는 경우
```
0 rows
```

### 트리거 없을 경우 생성

**다음 SQL 실행** (필수!):

```sql
-- =====================================================
-- 트리거 함수 생성
-- =====================================================
CREATE OR REPLACE FUNCTION auto_update_user_balance()
RETURNS TRIGGER AS $$
DECLARE
  current_user_balance DECIMAL(15,2);
BEGIN
  -- status가 'completed'인 경우에만 실행
  IF NEW.status = 'completed' THEN
    
    -- 현재 사용자 잔고 조회
    SELECT balance INTO current_user_balance
    FROM users
    WHERE id = NEW.user_id;
    
    -- 입금 타입
    IF NEW.transaction_type IN ('deposit', 'admin_deposit', 'point_conversion') THEN
      UPDATE users 
      SET balance = balance + NEW.amount,
          updated_at = NOW()
      WHERE id = NEW.user_id;
      
      -- balance_after 업데이트
      NEW.balance_after := current_user_balance + NEW.amount;
      
    -- 출금 타입
    ELSIF NEW.transaction_type IN ('withdrawal', 'admin_withdrawal') THEN
      UPDATE users 
      SET balance = balance - NEW.amount,
          updated_at = NOW()
      WHERE id = NEW.user_id;
      
      -- balance_after 업데이트
      NEW.balance_after := current_user_balance - NEW.amount;
    END IF;
    
    -- 로그 출력 (Supabase Logs에서 확인 가능)
    RAISE NOTICE 'Transaction % completed: user_id=%, amount=%, balance_after=%', 
      NEW.id, NEW.user_id, NEW.amount, NEW.balance_after;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 트리거 생성
-- =====================================================
DROP TRIGGER IF EXISTS update_user_balance_on_transaction ON transactions;

CREATE TRIGGER update_user_balance_on_transaction
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION auto_update_user_balance();

-- =====================================================
-- 검증
-- =====================================================
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers 
WHERE trigger_name = 'update_user_balance_on_transaction';
```

**예상 결과**:
```
trigger_name: update_user_balance_on_transaction
event_manipulation: INSERT
event_object_table: transactions
```

---

## 🔍 검증 4: Lv1/Lv2 파트너 보유금 자동 계산 트리거 (신규)

### 준비 단계

**⚠️ 중요: 이 단계를 먼저 실행해야 합니다!**

1. **Supabase SQL Editor 접속**
   - URL: https://hduofjzsitoaujyjvuix.supabase.co
   - SQL Editor 탭 열기

2. **트리거 SQL 실행** (필수!)

다음 SQL을 복사하여 Supabase SQL Editor에서 실행:

```sql
-- ============================================================================
-- 파트너 보유금 자동 계산 트리거 (Lv1 시스템관리자 + Lv2 대본사)
-- ============================================================================

-- 1️⃣ 트리거 함수 생성
CREATE OR REPLACE FUNCTION auto_update_lv1_lv2_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- ✅ Lv1(시스템관리자) 또는 Lv2(대본사)인 경우에만 실행
  IF NEW.level IN (1, 2) THEN
    -- invest_balance + oroplay_balance를 balance에 자동 저장
    NEW.balance := COALESCE(NEW.invest_balance, 0) + COALESCE(NEW.oroplay_balance, 0);
    
    -- 디버그 로그
    RAISE NOTICE '💰 [Lv% 보유금 자동 계산] ID:%, invest:%, oroplay:%, total:%', 
      NEW.level,
      NEW.id, 
      NEW.invest_balance, 
      NEW.oroplay_balance, 
      NEW.balance;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2️⃣ 기존 트리거 삭제 및 새 트리거 생성 (INSERT/UPDATE 시 실행)
DROP TRIGGER IF EXISTS trigger_auto_update_lv2_balance ON partners;
DROP TRIGGER IF EXISTS trigger_auto_update_lv1_lv2_balance ON partners;

CREATE TRIGGER trigger_auto_update_lv1_lv2_balance
BEFORE INSERT OR UPDATE OF invest_balance, oroplay_balance, level
ON partners
FOR EACH ROW
EXECUTE FUNCTION auto_update_lv1_lv2_balance();

-- 3️⃣ 기존 Lv1/Lv2 파트너의 balance 일괄 업데이트
UPDATE partners
SET balance = COALESCE(invest_balance, 0) + COALESCE(oroplay_balance, 0),
    updated_at = NOW()
WHERE level IN (1, 2);
```

### 검증 단계

#### 테스트 1: 기존 데이터 확인

**SQL 실행**:
```sql
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
ORDER BY created_at DESC;
```

**예상 결과**:
```
level: 1 또는 2
username: system_admin 또는 gmcl1
invest_balance: 100000.00
oroplay_balance: 142996.80
balance: 242996.80          ← 자동 계산됨
calculated_balance: 242996.80
is_correct: true            ← 모두 true여야 함
```

#### 테스트 2: 입금 처리 후 자동 업데이트 확인

1. **Lv1 (시스템관리자) 계정으로 로그인**

2. **파트너 관리 → 강제 입금**
   - 대상: Lv2 파트너 (gmcl1)
   - API: Invest
   - 금액: 50,000원
   - [입금] 버튼 클릭

3. **DB 즉시 확인**:
```sql
SELECT 
  username,
  invest_balance,
  oroplay_balance,
  balance
FROM partners
WHERE username = 'gmcl1';
```

**예상 결과**:
```
invest_balance: 150000.00   ← 100000 + 50000
oroplay_balance: 142996.80  ← 변동 없음
balance: 292996.80          ← 자동 계산 (150000 + 142996.80)
```

4. **화면 새로고침 후 확인**
   - 파트너 관리 화면의 보유금 컬럼
   - 표시된 금액 = 292,996원

#### 테스트 3: OroPlay API 입금 테스트

1. **다시 강제 입금**
   - 대상: Lv2 파트너 (gmcl1)
   - API: OroPlay
   - 금액: 30,000원
   - [입금] 버튼 클릭

2. **DB 확인**:
```sql
SELECT 
  username,
  invest_balance,
  oroplay_balance,
  balance
FROM partners
WHERE username = 'gmcl1';
```

**예상 결과**:
```
invest_balance: 150000.00   ← 변동 없음
oroplay_balance: 172996.80  ← 142996.80 + 30000
balance: 322996.80          ← 자동 계산 (150000 + 172996.80)
```

### 성공 기준

| 테스트 케이스 | 예상 결과 | 확인 |\n|-------------|----------|------|\n| 트리거 SQL 실행 | ✅ 성공 (에러 없음) | □ |\n| 기존 Lv2 데이터 일괄 업데이트 | ✅ balance = invest + oroplay | □ |\n| Invest 입금 시 balance 자동 업데이트 | ✅ 즉시 반영 | □ |\n| OroPlay 입금 시 balance 자동 업데이트 | ✅ 즉시 반영 | □ |\n| 화면 표시 | ✅ 정확한 총합 표시 | □ |

### 실패 시 조치

**증상 1**: 트리거 실행 오류

```
ERROR: permission denied for table partners
```

**해결**: Supabase 대시보드에서 관리자 권한으로 로그인했는지 확인

---

**증상 2**: balance가 여전히 0으로 표시됨

**원인**: 트리거 미실행 또는 화면 캐시

**해결**:
1. SQL 확인:
```sql
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'trigger_auto_update_lv2_balance';
```
2. 결과가 0 rows이면 트리거 SQL 재실행
3. 브라우저 강력 새로고침 (Ctrl + F5)

---

**증상 3**: Lv3~Lv6 파트너의 balance가 0이 됨

**원인**: 트리거 조건 오류 (모든 레벨에 적용됨)

**해결**:
```sql
-- 트리거 함수 확인
SELECT routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'auto_update_lv2_balance';

-- "IF NEW.level = 2 THEN" 조건이 있는지 확인
-- 없으면 트리거 SQL 재실행
```

---

## 🎯 전체 검증 체크리스트

### 사전 준비
- [ ] Supabase 대시보드 접속
- [ ] SQL Editor 준비
- [ ] Lv1 계정 준비
- [ ] Lv7 사용자 계정 준비

### Lv1 보유금 표시
- [ ] api_configs 조회하여 Invest + OroPlay 합계 확인
- [ ] Lv1 로그인 후 화면 표시 금액 확인
- [ ] 개발자 콘솔 로그 확인
- [ ] 합계가 정확한지 검증

### 입금 중복 방지
- [ ] 첫 번째 입금 신청 성공 확인
- [ ] 중복 신청 차단 확인
- [ ] Toast 경고 메시지 확인
- [ ] DB에 중복 레코드 없음 확인
- [ ] 승인 후 재신청 가능 확인

### 트리거 확인
- [ ] 트리거 존재 여부 SQL 실행
- [ ] 트리거 없으면 생성 SQL 실행
- [ ] 트리거 생성 후 검증 SQL 실행

### Lv2 보유금 자동 계산 (신규)
- [ ] Lv2 보유금 트리거 SQL 실행
- [ ] 기존 Lv2 데이터 일괄 업데이트 확인
- [ ] Invest API 입금 테스트
- [ ] OroPlay API 입금 테스트
- [ ] 화면 표시 정확성 확인
- [ ] Lv3~Lv6 파트너 영향 없음 확인

---

## 📞 문제 발생 시

### 즉시 보고 사항

1. **검증 실패**
   - 어떤 테스트에서 실패했는지
   - 예상 결과와 실제 결과
   - 스크린샷 또는 콘솔 로그

2. **오류 발생**
   - 오류 메시지 전문
   - 발생 시점 (어떤 작업 중)
   - 브라우저 콘솔 오류

### 추가 지원

- 트리거 생성 중 오류 → SQL 오류 메시지 공유
- 화면 표시 오류 → 스크린샷 + 콘솔 로그
- 중복 방지 작동 안 함 → transactions 테이블 조회 결과

---

## 📎 참고 문서

- `/docs/wallet-management/BUG_FIX_REPORT.md` - 수정 내역
- `/docs/wallet-management/BUG_INSPECTION_REPORT.md` - 전체 점검 리포트
- `/docs/wallet-management/DATABASE_SCHEMA.md` - DB 스키마

---

**작성 완료**: 2025-01-06  
**검증 대상**: BalanceContext.tsx, UserDeposit.tsx, Lv2 Balance Trigger, User Transaction Trigger  
**예상 소요 시간**: 20~25분

---

## 🚨 중요 알림

**Lv2 파트너 보유금 트리거는 반드시 Supabase에서 SQL을 실행해야 작동합니다!**

파일 위치: `/database/500_auto_update_lv2_balance.sql`

또는 이 문서의 "검증 4" 섹션에 있는 SQL을 복사하여 실행하세요.
