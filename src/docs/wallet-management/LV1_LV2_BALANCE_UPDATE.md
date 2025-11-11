# Lv1/Lv2 파트너 보유금 자동 계산 시스템

## 작성일: 2025-01-06
## 목적: Lv1/Lv2의 API별 보유금을 balance에 자동 반영

---

## 📋 개요

### 문제
- Lv1 (시스템관리자)과 Lv2 (대본사)는 Invest API와 OroPlay API 2개의 지갑을 사용
- 각각 `invest_balance`, `oroplay_balance` 컬럼으로 관리
- 파트너 계층 관리 화면에서는 `balance` 컬럼을 표시하는데, 이 값이 0으로 표시되는 문제
- 입출금 처리 시 실시간으로 화면에 반영되지 않는 문제

### 해결 방법
1. **DB 트리거**: `invest_balance + oroplay_balance` → `balance` 자동 계산
2. **Realtime 구독**: 트리거가 계산한 `balance`를 화면에 즉시 반영

---

## 🔧 구현 내용

### 1. DB 트리거 생성

**파일**: `/database/500_auto_update_lv1_lv2_balance.sql`

```sql
-- 트리거 함수: Lv1/Lv2의 balance 자동 계산
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

### 2. Realtime 동기화 수정

**파일**: `/components/admin/PartnerManagement.tsx`

#### 변경 1: Lv1/Lv2 전용 구독 (라인 361-405)
```typescript
// Lv1/Lv2 partners 테이블의 invest_balance/oroplay_balance/balance 변경 감지
const lv2BalanceChannel = supabase
  .channel('lv2_balance_changes')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'partners',
  }, async (payload) => {
    const partnerId = (payload.new as any).id;
    const newInvestBalance = (payload.new as any).invest_balance || 0;
    const newOroplayBalance = (payload.new as any).oroplay_balance || 0;
    const newBalance = (payload.new as any).balance || 0; // ✅ 트리거가 계산한 값

    setPartners(prev => {
      const partner = prev.find(p => p.id === partnerId);
      if (!partner || partner.level !== 2) return prev;
      
      return prev.map(p => {
        if (p.id === partnerId) {
          return {
            ...p,
            invest_balance: newInvestBalance,
            oroplay_balance: newOroplayBalance,
            balance: newBalance // ✅ 트리거 결과 반영
          };
        }
        return p;
      });
    });
  })
  .subscribe();
```

#### 변경 2: 일반 balance 구독 (라인 264-301)
```typescript
// ✅ Lv3~Lv6만 처리 (Lv1은 api_configs, Lv2는 별도 구독에서 처리)
setPartners(prev => {
  const partner = prev.find(p => p.id === partnerId);
  if (!partner) return prev;
  
  // Lv1은 무시 (api_configs 사용)
  if (partner.level === 1) {
    console.log(`⏭️ Lv1 balance 변경 무시 (api_configs 사용)`);
    return prev;
  }
  
  // Lv2는 무시 (invest_balance/oroplay_balance 전용 구독에서 처리)
  if (partner.level === 2) {
    console.log(`⏭️ Lv2 balance 변경 무시 (Lv2 전용 구독에서 처리)`);
    return prev;
  }
  
  // Lv3~Lv6만 업데이트
  console.log(`💰 Lv${partner.level} 보유금 변경: ${oldBalance} → ${newBalance}`);
  return prev.map(p => 
    p.id === partnerId ? { ...p, balance: newBalance } : p
  );
});
```

---

## 🎯 적용 방법

### 1️⃣ Supabase SQL 실행 (필수)

1. **Supabase 대시보드 접속**
   - URL: https://hduofjzsitoaujyjvuix.supabase.co

2. **SQL Editor 열기**

3. **SQL 복사 & 실행**
   - 파일: `/database/500_auto_update_lv1_lv2_balance.sql`
   - 내용 복사 후 SQL Editor에 붙여넣기
   - [Run] 버튼 클릭

### 2️⃣ 프론트엔드 새로고침

1. **브라우저 강력 새로고침**
   - Windows/Linux: `Ctrl + F5`
   - Mac: `Cmd + Shift + R`

---

## 🧪 검증 방법

### 1. 기존 데이터 확인

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
ORDER BY level, created_at DESC;
```

**예상 결과**:
- `is_correct` 컬럼이 모두 `true`
- `balance = invest_balance + oroplay_balance`

### 2. 입금 테스트 (화면)

1. **Lv1 계정으로 로그인**

2. **파트너 계층 관리 → Lv2 파트너 선택**

3. **강제 입금**
   - API: Invest
   - 금액: 10,000원
   - [입금] 버튼 클릭

4. **결과 확인**
   - ✅ 화면에서 보유금 즉시 업데이트
   - ✅ F12 콘솔에서 로그 확인:
     ```
     💰 Lv2 보유금 변경 (partner_id: xxx): I:110000 + O:142996.8 = B:252996.8
     ```

### 3. DB 확인

```sql
SELECT 
  username,
  invest_balance,
  oroplay_balance,
  balance
FROM partners
WHERE level = 2 AND username = 'gmcl1';
```

**예상 결과**:
```
invest_balance: 110000.00
oroplay_balance: 142996.80
balance: 252996.80  ← 자동 계산 (110000 + 142996.80)
```

---

## 📊 처리 흐름

### Lv1 → Lv2 입금 (Invest API)

```
1. 사용자: [입금] 버튼 클릭
   ↓
2. PartnerManagement.tsx: handleForceTransaction 실행
   ↓
3. Supabase: partners 테이블 UPDATE
   UPDATE partners
   SET invest_balance = invest_balance + 10000
   WHERE id = '[Lv2 파트너 ID]'
   ↓
4. DB 트리거: auto_update_lv1_lv2_balance() 자동 실행
   NEW.balance = invest_balance + oroplay_balance
   ↓
5. Realtime: partners 테이블 UPDATE 이벤트 발생
   ↓
6. PartnerManagement.tsx: Realtime 구독 감지
   - invest_balance 업데이트
   - oroplay_balance 업데이트
   - balance 업데이트 (트리거 결과 사용)
   ↓
7. React State 업데이트
   ↓
8. 화면 즉시 반영
```

---

## 🔍 계층별 지갑 구조

| 레벨 | 이름 | 지갑 구조 | balance 컬럼 | 비고 |
|------|------|----------|-------------|------|
| Lv1 | 시스템관리자 | 2개 지갑<br>(Invest + OroPlay) | **자동 계산**<br>(I + O) | api_configs + partners 사용 |
| Lv2 | 대본사 | 2개 지갑<br>(Invest + OroPlay) | **자동 계산**<br>(I + O) | partners 테이블만 사용 |
| Lv3 | 본사 | 1개 지갑 | **직접 관리** | balance만 사용 |
| Lv4 | 부본사 | 1개 지갑 | **직접 관리** | balance만 사용 |
| Lv5 | 총판 | 1개 지갑 | **직접 관리** | balance만 사용 |
| Lv6 | 매장 | 1개 지갑 | **직접 관리** | balance만 사용 |

---

## ⚠️ 주의사항

### 1. 트리거 실행 시점
- `BEFORE INSERT OR UPDATE` 트리거
- DB에 저장되기 **전**에 balance를 자동 계산
- 따라서 DB에 저장되는 값은 이미 계산된 값

### 2. Lv3~Lv6 영향 없음
- `IF NEW.level IN (1, 2)` 조건으로 Lv1/Lv2만 처리
- Lv3~Lv6은 기존 로직 유지 (balance 직접 관리)

### 3. 기존 트리거 자동 삭제
- `trigger_auto_update_lv2_balance` (구 버전) 자동 삭제
- `trigger_auto_update_lv1_lv2_balance` (신 버전) 생성

---

## 📝 관련 문서

- `/docs/wallet-management/SUMMARY.md` - 전체 요약
- `/docs/wallet-management/BUG_FIX_REPORT.md` - 버그 수정 리포트
- `/docs/wallet-management/VERIFICATION_GUIDE.md` - 검증 가이드
- `/database/500_auto_update_lv1_lv2_balance.sql` - 트리거 SQL

---

**작성 완료**: 2025-01-06  
**적용 상태**: ✅ 코드 수정 완료, SQL 실행 대기 중
