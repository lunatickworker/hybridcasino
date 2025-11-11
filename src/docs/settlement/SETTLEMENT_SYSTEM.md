# 정산 관리 시스템 완전 분석 문서

## 📋 목차
1. [시스템 개요](#시스템-개요)
2. [정산 방식](#정산-방식)
3. [정산 유형](#정산-유형)
4. [계산 로직](#계산-로직)
5. [실행 프로세스](#실행-프로세스)
6. [데이터베이스 구조](#데이터베이스-구조)
7. [주요 함수 및 API](#주요-함수-및-api)
8. [사용 흐름](#사용-흐름)
9. [주의사항](#주의사항)

---

## 시스템 개요

### 목적
7단계 권한 체계에서 파트너들의 커미션 및 수익을 계산하고 기록하는 시스템

### 핵심 원칙
- **기록만 저장, 보유금 변경 없음**: 정산은 수익 계산 및 기록만 수행하며, 실제 보유금은 변경하지 않음
- **중복 정산 방지**: 동일 기간/유형/API 필터에 대한 중복 정산 차단
- **실시간 조회**: 정산 실행 전 실시간으로 커미션 계산 및 확인 가능
- **API 필터 지원**: Invest API, OroPlay API 또는 전체 API에 대한 개별 정산 가능

### 주요 컴포넌트
| 파일 | 역할 |
|------|------|
| `CommissionSettlement.tsx` | 파트너별 수수료 정산 UI |
| `IntegratedSettlement.tsx` | 통합 정산 UI |
| `SettlementHistory.tsx` | 정산 이력 조회 UI |
| `settlementCalculator.ts` | 정산 계산 로직 (공통 모듈) |
| `settlementExecutor.ts` | 정산 실행 로직 (DB 기록) |

---

## 정산 방식

### 1. 직속 하위 정산 (Direct Subordinate) ✅ 현재 사용
**계산 방식**: 직속 하위 파트너들에게 지급할 커미션만 계산

```
예시) 대본사(Lv2)의 정산
- 본사A (직속): 베팅 1억 → 롤링 0.5% → 지급 50만원
- 본사B (직속): 베팅 5천만 → 롤링 0.3% → 지급 15만원
- 부본사C (본사A의 하위): 계산 안 함 ❌

→ 대본사는 직속 하위인 본사A, 본사B에게만 지급
```

**장점**:
- 계산이 간단하고 빠름
- 각 레벨에서 직속 하위만 관리하면 됨
- 성능 최적화 용이 (병렬 계산 가능)

### 2. 차등 정산 (Differential) ⚠️ 미사용
**계산 방식**: 내 커미션율과 하위 파트너 커미션율의 차액을 수입으로 계산

```
예시) 본사(롤링 0.5%)의 차등 정산
- 총판A (롤링 0.3%): 베팅 1억 → 본사 수입: (0.5% - 0.3%) = 0.2% → 20만원
- 총판B (롤링 0.4%): 베팅 5천만 → 본사 수입: (0.5% - 0.4%) = 0.1% → 5만원

→ 본사 순수익: 25만원
```

**특징**:
- 커미션율 차이가 수익이 됨
- 복잡한 계산 필요
- 현재 시스템에서는 미사용

### 정산 방식 설정
```sql
-- system_settings 테이블에 저장
INSERT INTO system_settings (setting_key, setting_value)
VALUES ('settlement_method', 'direct_subordinate');  -- 또는 'differential'
```

---

## 정산 유형

### 1. 파트너별 수수료 정산 (Partner Commission)

**목적**: 직속 하위 파트너들에게 지급할 수수료를 계산하고 기록

**계산 항목**:
```typescript
interface PartnerCommissionInfo {
  partner_id: string;              // 하위 파트너 ID
  partner_username: string;        // 하위 파트너 아이디
  partner_nickname: string;        // 하위 파트너 표시명
  partner_level: number;           // 하위 파트너 레벨 (2~6)
  
  // 하위 파트너의 커미션율
  commission_rolling: number;      // 롤링 수수료율 (%)
  commission_losing: number;       // 루징 수수료율 (%)
  withdrawal_fee: number;          // 출금 수수료율 (%)
  
  // 하위 파트너의 전체 하위 사용자 활동 기준
  total_bet_amount: number;        // 총 베팅액
  total_loss_amount: number;       // 총 손실액
  total_withdrawal_amount: number; // 총 출금액
  
  // 지급해야 할 수수료
  rolling_commission: number;      // 롤링 수수료 = 베팅액 × 롤링율
  losing_commission: number;       // 루징 수수료 = 손실액 × 루징율
  withdrawal_commission: number;   // 출금 수수료 = 출금액 × 출금수수료율
  total_commission: number;        // 총 수수료
}
```

**예시**:
```
대본사(Lv2)가 파트너별 수수료 정산 실행

직속 하위 파트너 목록:
1. 본사A (롤링 0.5%, 루징 5%)
   - 전체 하위 사용자 베팅: 1억원
   - 전체 하위 사용자 손실: 500만원
   - 지급 수수료: 롤링 50만원 + 루징 25만원 = 75만원

2. 본사B (롤링 0.3%, 루징 3%)
   - 전체 하위 사용자 베팅: 5천만원
   - 전체 하위 사용자 손실: 300만원
   - 지급 수수료: 롤링 15만원 + 루징 9만원 = 24만원

→ 대본사가 직속 하위에게 지급할 총액: 99만원
```

**UI**: `CommissionSettlement.tsx`
- 직속 하위 파트너별 수수료 상세 테이블
- 롤링/루징/출금 수수료 구분 표시
- 정산하기 버튼: 기록만 저장, 보유금 변경 없음

---

### 2. 통합 정산 (Integrated Settlement)

**목적**: 내 총 수입에서 하위 파트너 지급액을 뺀 순수익을 계산

**계산 구조**:
```typescript
interface SettlementSummary {
  // A. 내 총 수입 (내 커미션율 × 전체 하위 사용자 활동)
  myRollingIncome: number;         // 내 롤링 수입
  myLosingIncome: number;          // 내 루징 수입
  myWithdrawalIncome: number;      // 내 출금수수료 수입
  myTotalIncome: number;           // 내 총 수입
  
  // B. 하위 파트너 지급 (직속 하위들에게 지급할 총액)
  partnerRollingPayments: number;  // 하위 롤링 지급
  partnerLosingPayments: number;   // 하위 루징 지급
  partnerWithdrawalPayments: number; // 하위 출금수수료 지급
  partnerTotalPayments: number;    // 하위 총 지급
  
  // C. 순수익 (A - B)
  netRollingProfit: number;        // 롤링 순수익
  netLosingProfit: number;         // 루징 순수익
  netWithdrawalProfit: number;     // 출금수수료 순수익
  netTotalProfit: number;          // 총 순수익
}
```

**예시**:
```
본사(Lv3, 롤링 0.8%, 루징 8%)의 통합 정산

A. 내 총 수입 계산:
   - 전체 하위 사용자 베팅: 10억원
   - 전체 하위 사용자 손실: 5천만원
   - 내 롤링 수입: 10억 × 0.8% = 800만원
   - 내 루징 수입: 5천만 × 8% = 400만원
   - 내 총 수입: 1,200만원

B. 하위 파트너 지급 계산:
   - 부본사A (롤링 0.5%, 루징 5%): 지급 500만원
   - 부본사B (롤링 0.4%, 루징 4%): 지급 300만원
   - 하위 총 지급: 800만원

C. 순수익:
   - 1,200만원 - 800만원 = 400만원
```

**UI**: `IntegratedSettlement.tsx`
- 내 총 수입 (A) / 하위 파트너 지급 (B) / 순수익 (A-B) 카드로 구분 표시
- 하위 파트너별 지급 상세 테이블
- 정산 기록 저장 버튼

---

### 3. 정산 이력 (Settlement History)

**목적**: 과거 정산 기록 조회 및 확인

**조회 정보**:
- 정산일시
- 정산 유형 (파트너별 수수료 / 통합 정산)
- 정산 기간 (오늘/어제/최근7일/이번달/사용자지정)
- 기간 (시작일 ~ 종료일)
- API 필터 (전체/Invest/OroPlay)
- 롤링/루징/출금 수수료 금액
- 총액 또는 순수익
- 실행자

**UI**: `SettlementHistory.tsx`
- 정산 유형별 필터
- 날짜 범위 필터
- 정산 내역 테이블

---

## 계산 로직

### 핵심 모듈: `settlementCalculator.ts`

모든 정산 계산 로직을 중앙 집중화하여 코드 중복 제거

#### 1. 하위 사용자 조회 함수

```typescript
/**
 * 특정 파트너의 모든 하위 사용자 ID를 조회
 * 재귀 없이 5단계까지 반복문으로 조회 (성능 최적화)
 */
async function getDescendantUserIds(partnerId: string): Promise<string[]>
```

**동작 원리**:
```
대본사(Lv2) 조회 시:
1. 대본사의 직속 하위 파트너 조회 → 본사A, 본사B (Lv3)
2. 본사들의 직속 하위 파트너 조회 → 부본사A, 부본사B, ... (Lv4)
3. 부본사들의 직속 하위 파트너 조회 → 총판A, 총판B, ... (Lv5)
4. 총판들의 직속 하위 파트너 조회 → 매장A, 매장B, ... (Lv6)
5. 모든 파트너의 직속 사용자 조회 → 사용자1, 사용자2, ... (Lv7)
→ 사용자 ID 배열 반환
```

#### 2. 베팅 통계 조회 함수

```typescript
/**
 * 특정 기간의 베팅 통계 조회 (API 필터 지원)
 */
async function getBettingStats(
  userIds: string[],
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<{ totalBetAmount: number; totalLossAmount: number }>
```

**쿼리**:
```sql
SELECT bet_amount, win_amount 
FROM game_records
WHERE user_id IN (userIds)
  AND played_at >= startDate 
  AND played_at <= endDate
  AND (apiFilter = 'all' OR api_type = apiFilter)
```

**계산**:
```typescript
for (const record of bettingData) {
  totalBetAmount += record.bet_amount;
  const loss = record.bet_amount - record.win_amount;
  if (loss > 0) {
    totalLossAmount += loss;  // 손실만 합산 (이익은 제외)
  }
}
```

#### 3. 출금 총액 조회 함수

```typescript
/**
 * 특정 기간의 승인된 출금 총액 조회
 */
async function getWithdrawalAmount(
  userIds: string[],
  startDate: string,
  endDate: string
): Promise<number>
```

**쿼리**:
```sql
SELECT amount 
FROM transactions
WHERE user_id IN (userIds)
  AND transaction_type = 'withdrawal'
  AND status = 'approved'
  AND created_at >= startDate 
  AND created_at <= endDate
```

#### 4. 파트너 커미션 계산 함수

```typescript
/**
 * 특정 파트너의 커미션 계산
 * (그 파트너의 전체 하위 사용자 활동 × 파트너의 커미션율)
 */
async function calculatePartnerCommission(
  partnerId: string,
  partner: {
    username: string;
    nickname: string;
    level: number;
    commission_rolling: number;
    commission_losing: number;
    withdrawal_fee: number;
  },
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<PartnerCommissionInfo>
```

**계산 과정**:
```
1. getDescendantUserIds(partnerId) → 하위 사용자 ID 배열
2. getBettingStats(userIds, startDate, endDate, apiFilter) → 베팅액, 손실액
3. getWithdrawalAmount(userIds, startDate, endDate) → 출금액

4. 커미션 계산:
   - rolling_commission = totalBetAmount × (commission_rolling / 100)
   - losing_commission = totalLossAmount × (commission_losing / 100)
   - withdrawal_commission = totalWithdrawalAmount × (withdrawal_fee / 100)
   - total_commission = rolling + losing + withdrawal
```

#### 5. 직속 하위 파트너 커미션 계산 함수 (병렬 처리)

```typescript
/**
 * 직속 하위 파트너들의 커미션을 병렬로 계산
 * 파트너별 수수료 정산에서 사용
 */
async function calculateChildPartnersCommission(
  parentId: string,
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<PartnerCommissionInfo[]>
```

**동작**:
```typescript
// 1. 직속 하위 파트너 조회
const { data: childPartners } = await supabase
  .from('partners')
  .select('id, username, nickname, level, commission_rolling, commission_losing, withdrawal_fee')
  .eq('parent_id', parentId);

// 2. 병렬 처리 (성능 최적화)
const commissionsPromises = childPartners.map(partner =>
  calculatePartnerCommission(partner.id, partner, startDate, endDate, apiFilter)
);
const commissionsData = await Promise.all(commissionsPromises);

// 3. 결과 반환
return commissionsData;
```

#### 6. 내 총 수입 계산 함수

```typescript
/**
 * 내 커미션율로 전체 하위 사용자 활동에 대한 수입 계산
 * 통합 정산의 "내 총 수입" 부분
 */
async function calculateMyIncome(
  partnerId: string,
  commissionRates: {
    rolling: number;
    losing: number;
    withdrawal: number;
  },
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<{
  rolling: number;
  losing: number;
  withdrawal: number;
  total: number;
}>
```

**계산**:
```typescript
// 1. 내 모든 하위 사용자 조회
const descendantUserIds = await getDescendantUserIds(partnerId);

// 2. 하위 사용자 활동 조회
const { totalBetAmount, totalLossAmount } = await getBettingStats(
  descendantUserIds, startDate, endDate, apiFilter
);
const totalWithdrawalAmount = await getWithdrawalAmount(
  descendantUserIds, startDate, endDate
);

// 3. 내 커미션율로 수입 계산
const rollingIncome = totalBetAmount × (commissionRates.rolling / 100);
const losingIncome = totalLossAmount × (commissionRates.losing / 100);
const withdrawalIncome = totalWithdrawalAmount × (commissionRates.withdrawal / 100);

return { rolling, losing, withdrawal, total };
```

#### 7. 하위 파트너 지급액 계산 함수 (병렬 처리)

```typescript
/**
 * 직속 하위 파트너들에게 지급할 총액 계산
 * 통합 정산의 "하위 파트너 지급" 부분
 */
async function calculatePartnerPayments(
  parentId: string,
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<{
  totalRolling: number;
  totalLosing: number;
  totalWithdrawal: number;
  total: number;
  details: PartnerPaymentDetail[];
}>
```

**동작**:
```typescript
// 1. 직속 하위 파트너 조회
const { data: childPartners } = await supabase
  .from('partners')
  .select('id, nickname, commission_rolling, commission_losing, withdrawal_fee')
  .eq('parent_id', parentId);

// 2. 각 파트너의 지급액 병렬 계산
const paymentPromises = childPartners.map(partner =>
  calculatePartnerPayment(partner, startDate, endDate, apiFilter)
);
const details = await Promise.all(paymentPromises);

// 3. 총합 계산
let totalRolling = 0, totalLosing = 0, totalWithdrawal = 0;
for (const payment of details) {
  totalRolling += payment.rolling_payment;
  totalLosing += payment.losing_payment;
  totalWithdrawal += payment.withdrawal_payment;
}

return { totalRolling, totalLosing, totalWithdrawal, total, details };
```

#### 8. 통합 정산 계산 함수

```typescript
/**
 * 통합 정산 계산 (내 수입 - 하위 지급 = 순수익)
 */
async function calculateIntegratedSettlement(
  partnerId: string,
  commissionRates: {
    rolling: number;
    losing: number;
    withdrawal: number;
  },
  startDate: string,
  endDate: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<SettlementSummary>
```

**계산**:
```typescript
// 1. 내 총 수입 계산
const myIncome = await calculateMyIncome(
  partnerId, commissionRates, startDate, endDate, apiFilter
);

// 2. 하위 파트너 지급 계산
const payments = await calculatePartnerPayments(
  partnerId, startDate, endDate, apiFilter
);

// 3. 순수익 계산
return {
  myRollingIncome: myIncome.rolling,
  myLosingIncome: myIncome.losing,
  myWithdrawalIncome: myIncome.withdrawal,
  myTotalIncome: myIncome.total,
  
  partnerRollingPayments: payments.totalRolling,
  partnerLosingPayments: payments.totalLosing,
  partnerWithdrawalPayments: payments.totalWithdrawal,
  partnerTotalPayments: payments.total,
  
  netRollingProfit: myIncome.rolling - payments.totalRolling,
  netLosingProfit: myIncome.losing - payments.totalLosing,
  netWithdrawalProfit: myIncome.withdrawal - payments.totalWithdrawal,
  netTotalProfit: myIncome.total - payments.total
};
```

---

## 실행 프로세스

### 핵심 모듈: `settlementExecutor.ts`

정산 계산 결과를 DB에 기록하는 실행 로직 (보유금 변경 없음)

### 1. 파트너별 수수료 정산 실행

```typescript
async function executePartnerCommissionSettlement(
  partnerId: string,         // 정산 실행자 ID
  startDate: string,
  endDate: string,
  settlementPeriod: string,  // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<SettlementExecutionResult>
```

**실행 단계**:

#### Step 1: 중복 정산 체크
```typescript
const { data: existsData } = await supabase.rpc('check_settlement_exists', {
  p_partner_id: partnerId,
  p_settlement_type: 'partner_commission',
  p_period_start: periodStart,
  p_period_end: periodEnd,
  p_api_filter: apiFilter
});

if (existsData === true) {
  return { success: false, message: '이미 정산이 완료된 기간입니다.' };
}
```

**중복 체크 로직 (RPC 함수)**:
```sql
CREATE OR REPLACE FUNCTION check_settlement_exists(
  p_partner_id UUID,
  p_settlement_type TEXT,
  p_period_start DATE,
  p_period_end DATE,
  p_api_filter TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM settlements
    WHERE partner_id = p_partner_id
      AND settlement_type = p_settlement_type
      AND period_start = p_period_start
      AND period_end = p_period_end
      AND api_filter = p_api_filter
      AND status = 'completed'
  );
END;
$$ LANGUAGE plpgsql;
```

#### Step 2: 커미션 계산
```typescript
const commissions = await calculateChildPartnersCommission(
  partnerId, startDate, endDate, apiFilter
);

if (commissions.length === 0) {
  return { success: false, message: '정산할 하위 파트너가 없습니다.' };
}
```

#### Step 3: 총 정산액 계산
```typescript
const totalRolling = commissions.reduce((sum, c) => sum + c.rolling_commission, 0);
const totalLosing = commissions.reduce((sum, c) => sum + c.losing_commission, 0);
const totalWithdrawal = commissions.reduce((sum, c) => sum + c.withdrawal_commission, 0);
const totalCommission = totalRolling + totalLosing + totalWithdrawal;

if (totalCommission <= 0) {
  return { success: false, message: '정산할 커미션이 0원입니다.' };
}
```

#### Step 4: 정산 기록 생성 (보유금 변경 없음)
```typescript
const { data: settlement, error } = await supabase
  .from('settlements')
  .insert({
    partner_id: partnerId,
    settlement_type: 'partner_commission',
    settlement_period: settlementPeriod,
    api_filter: apiFilter,
    period_start: periodStart,
    period_end: periodEnd,
    total_bet_amount: commissions.reduce((sum, c) => sum + c.total_bet_amount, 0),
    total_withdrawal_amount: commissions.reduce((sum, c) => sum + c.total_withdrawal_amount, 0),
    rolling_commission: totalRolling,
    losing_commission: totalLosing,
    withdrawal_commission: totalWithdrawal,
    commission_amount: totalCommission,
    status: 'completed',
    processed_at: new Date().toISOString(),
    executed_by: partnerId,
    settlement_details: commissionsData.map(c => ({
      partner_id: c.partner_id,
      partner_nickname: c.partner_nickname,
      partner_level: c.partner_level,
      rolling_commission: c.rolling_commission,
      losing_commission: c.losing_commission,
      withdrawal_commission: c.withdrawal_commission,
      total_commission: c.total_commission
    }))
  })
  .select()
  .single();

return {
  success: true,
  message: `정산 기록이 생성되었습니다. (총 정산액: ₩${totalCommission.toLocaleString()}, ${commissions.length}명)`,
  settlementId: settlement.id
};
```

**중요**: 
- ✅ settlements 테이블에 기록만 생성
- ❌ partners.balance 업데이트 없음
- ❌ 외부 API 호출 없음

---

### 2. 통합 정산 실행

```typescript
async function executeIntegratedSettlement(
  partnerId: string,
  commissionRates: { rolling: number; losing: number; withdrawal: number },
  startDate: string,
  endDate: string,
  settlementPeriod: string,
  apiFilter: 'all' | 'invest' | 'oroplay' = 'all'
): Promise<SettlementExecutionResult>
```

**실행 단계**:

#### Step 1: 중복 정산 체크
```typescript
const { data: existsData } = await supabase.rpc('check_settlement_exists', {
  p_partner_id: partnerId,
  p_settlement_type: 'integrated',
  p_period_start: periodStart,
  p_period_end: periodEnd,
  p_api_filter: apiFilter
});

if (existsData === true) {
  return { success: false, message: '이미 정산이 완료된 기간입니다.' };
}
```

#### Step 2: 통합 정산 계산
```typescript
const settlement = await calculateIntegratedSettlement(
  partnerId, commissionRates, startDate, endDate, apiFilter
);

if (settlement.netTotalProfit <= 0) {
  return { success: false, message: '순수익이 0원 이하입니다. 정산할 수 없습니다.' };
}
```

#### Step 3: 정산 기록 생성 (보유금 변경 없음)
```typescript
const { data: settlementRecord, error } = await supabase
  .from('settlements')
  .insert({
    partner_id: partnerId,
    settlement_type: 'integrated',
    settlement_period: settlementPeriod,
    api_filter: apiFilter,
    period_start: periodStart,
    period_end: periodEnd,
    rolling_commission: settlement.netRollingProfit,
    losing_commission: settlement.netLosingProfit,
    withdrawal_commission: settlement.netWithdrawalProfit,
    commission_amount: settlement.netTotalProfit,
    my_total_income: settlement.myTotalIncome,
    partner_total_payments: settlement.partnerTotalPayments,
    net_profit: settlement.netTotalProfit,
    status: 'completed',
    processed_at: new Date().toISOString(),
    executed_by: partnerId,
    settlement_details: {
      my_income: {
        rolling: settlement.myRollingIncome,
        losing: settlement.myLosingIncome,
        withdrawal: settlement.myWithdrawalIncome,
        total: settlement.myTotalIncome
      },
      partner_payments: {
        rolling: settlement.partnerRollingPayments,
        losing: settlement.partnerLosingPayments,
        withdrawal: settlement.partnerWithdrawalPayments,
        total: settlement.partnerTotalPayments
      },
      net_profit: {
        rolling: settlement.netRollingProfit,
        losing: settlement.netLosingProfit,
        withdrawal: settlement.netWithdrawalProfit,
        total: settlement.netTotalProfit
      }
    }
  })
  .select()
  .single();

return {
  success: true,
  message: `통합 정산이 완료되었습니다. (순수익: ₩${settlement.netTotalProfit.toLocaleString()})`,
  settlementId: settlementRecord.id
};
```

**중요**:
- ✅ settlements 테이블에 기록만 생성
- ❌ partners.balance 업데이트 없음
- ❌ 외부 API 호출 없음

---

## 데이터베이스 구조

### settlements 테이블

```sql
CREATE TABLE settlements (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id) NOT NULL,  -- 정산 실행자 ID
  
  -- 정산 유형
  settlement_type TEXT NOT NULL,                      -- 'partner_commission' | 'integrated' | 'rolling' | 'losing'
  settlement_period TEXT NOT NULL,                    -- 'today' | 'yesterday' | 'week' | 'month' | 'custom'
  api_filter TEXT NOT NULL DEFAULT 'all',             -- 'all' | 'invest' | 'oroplay'
  
  -- 정산 기간
  period_start DATE NOT NULL,                         -- 정산 시작일
  period_end DATE NOT NULL,                           -- 정산 종료일
  
  -- 베팅 통계 (참고용)
  total_bet_amount DECIMAL(15,2) DEFAULT 0,          -- 총 베팅액
  total_win_amount DECIMAL(15,2) DEFAULT 0,          -- 총 승리액
  total_withdrawal_amount DECIMAL(15,2) DEFAULT 0,   -- 총 출금액
  
  -- 수수료 금액
  rolling_commission DECIMAL(15,2) DEFAULT 0,        -- 롤링 수수료
  losing_commission DECIMAL(15,2) DEFAULT 0,         -- 루징 수수료
  withdrawal_commission DECIMAL(15,2) DEFAULT 0,     -- 출금 수수료
  commission_amount DECIMAL(15,2) DEFAULT 0,         -- 총 수수료 (파트너별 정산용)
  
  -- 통합 정산용 추가 필드
  my_total_income DECIMAL(15,2) DEFAULT 0,           -- 내 총 수입
  partner_total_payments DECIMAL(15,2) DEFAULT 0,    -- 하위 파트너 총 지급
  net_profit DECIMAL(15,2) DEFAULT 0,                -- 순수익
  
  -- 상태
  status TEXT DEFAULT 'pending',                      -- 'pending' | 'completed' | 'cancelled'
  
  -- 처리 정보
  processed_at TIMESTAMPTZ,                           -- 정산 실행 시각
  executed_by UUID REFERENCES partners(id),           -- 정산 실행자 ID
  
  -- 상세 데이터 (JSONB)
  settlement_details JSONB,                           -- 파트너별 상세 또는 통합 정산 상세
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_settlements_partner_id ON settlements(partner_id);
CREATE INDEX idx_settlements_type ON settlements(settlement_type);
CREATE INDEX idx_settlements_period ON settlements(period_start, period_end);
CREATE INDEX idx_settlements_status ON settlements(status);
CREATE INDEX idx_settlements_api_filter ON settlements(api_filter);

-- 복합 유니크 인덱스 (중복 정산 방지)
CREATE UNIQUE INDEX idx_settlements_unique 
ON settlements(partner_id, settlement_type, period_start, period_end, api_filter)
WHERE status = 'completed';
```

### settlement_details 구조

#### 파트너별 수수료 정산 (partner_commission)
```json
{
  "settlement_details": [
    {
      "partner_id": "uuid",
      "partner_nickname": "본사A",
      "partner_level": 3,
      "rolling_commission": 500000,
      "losing_commission": 250000,
      "withdrawal_commission": 50000,
      "total_commission": 800000
    },
    {
      "partner_id": "uuid",
      "partner_nickname": "본사B",
      "partner_level": 3,
      "rolling_commission": 300000,
      "losing_commission": 150000,
      "withdrawal_commission": 30000,
      "total_commission": 480000
    }
  ]
}
```

#### 통합 정산 (integrated)
```json
{
  "settlement_details": {
    "my_income": {
      "rolling": 8000000,
      "losing": 4000000,
      "withdrawal": 200000,
      "total": 12200000
    },
    "partner_payments": {
      "rolling": 5000000,
      "losing": 3000000,
      "withdrawal": 150000,
      "total": 8150000
    },
    "net_profit": {
      "rolling": 3000000,
      "losing": 1000000,
      "withdrawal": 50000,
      "total": 4050000
    }
  }
}
```

---

### 정산 이력 조회 RPC 함수

```sql
CREATE OR REPLACE FUNCTION get_settlement_history(
  p_partner_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_settlement_type TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  partner_id UUID,
  partner_nickname TEXT,
  settlement_type TEXT,
  settlement_period TEXT,
  api_filter TEXT,
  period_start DATE,
  period_end DATE,
  total_bet_amount DECIMAL,
  total_win_amount DECIMAL,
  total_withdrawal_amount DECIMAL,
  rolling_commission DECIMAL,
  losing_commission DECIMAL,
  withdrawal_commission DECIMAL,
  commission_amount DECIMAL,
  my_total_income DECIMAL,
  partner_total_payments DECIMAL,
  net_profit DECIMAL,
  status TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  executed_by UUID,
  executor_nickname TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.partner_id,
    p.nickname AS partner_nickname,
    s.settlement_type,
    s.settlement_period,
    s.api_filter,
    s.period_start,
    s.period_end,
    s.total_bet_amount,
    s.total_win_amount,
    s.total_withdrawal_amount,
    s.rolling_commission,
    s.losing_commission,
    s.withdrawal_commission,
    s.commission_amount,
    s.my_total_income,
    s.partner_total_payments,
    s.net_profit,
    s.status,
    s.processed_at,
    s.created_at,
    s.executed_by,
    e.nickname AS executor_nickname
  FROM settlements s
  LEFT JOIN partners p ON s.partner_id = p.id
  LEFT JOIN partners e ON s.executed_by = e.id
  WHERE s.partner_id = p_partner_id
    AND (p_start_date IS NULL OR s.processed_at >= p_start_date)
    AND (p_end_date IS NULL OR s.processed_at <= p_end_date)
    AND (p_settlement_type IS NULL OR s.settlement_type = p_settlement_type)
    AND s.status = 'completed'
  ORDER BY s.processed_at DESC;
END;
$$ LANGUAGE plpgsql;
```

---

## 주요 함수 및 API

### settlementCalculator.ts 함수 요약

| 함수명 | 용도 | 반환 타입 |
|--------|------|-----------|
| `getDescendantUserIds` | 모든 하위 사용자 ID 조회 | `string[]` |
| `getBettingStats` | 베팅 통계 조회 (API 필터) | `{ totalBetAmount, totalLossAmount }` |
| `getWithdrawalAmount` | 출금 총액 조회 | `number` |
| `calculatePartnerCommission` | 특정 파트너 커미션 계산 | `PartnerCommissionInfo` |
| `calculateChildPartnersCommission` | 직속 하위 파트너 커미션 계산 | `PartnerCommissionInfo[]` |
| `calculateMyIncome` | 내 총 수입 계산 | `{ rolling, losing, withdrawal, total }` |
| `calculatePartnerPayments` | 하위 파트너 지급액 계산 | `{ totalRolling, totalLosing, ... }` |
| `calculateIntegratedSettlement` | 통합 정산 계산 | `SettlementSummary` |
| `calculatePendingDeposits` | 만충금 계산 | `number` |
| `calculateMonthlyCommission` | 이번 달 커미션 계산 | `number` |

### settlementExecutor.ts 함수 요약

| 함수명 | 용도 | 반환 타입 |
|--------|------|-----------|
| `executePartnerCommissionSettlement` | 파트너별 수수료 정산 실행 | `SettlementExecutionResult` |
| `executeIntegratedSettlement` | 통합 정산 실행 | `SettlementExecutionResult` |

---

## 사용 흐름

### 1. 파트너별 수수료 정산 흐름

```
[관리자 페이지] CommissionSettlement.tsx
    ↓
1. 기간 선택 (오늘/어제/최근7일/이번달/사용자지정)
    ↓
2. API 필터 선택 (전체/Invest/OroPlay)
    ↓
3. 실시간 계산 (정산하기 버튼 누르기 전)
   → calculateChildPartnersCommission(partnerId, start, end, apiFilter)
   → 직속 하위 파트너별 수수료 테이블 표시
    ↓
4. 정산하기 버튼 클릭
   → 확인 다이얼로그: "총 N명에게 ₩X를 정산하시겠습니까?"
    ↓
5. 확인 시
   → executePartnerCommissionSettlement(partnerId, start, end, period, apiFilter)
   → settlements 테이블에 기록 생성
   → ✅ 성공 메시지 표시
   → 데이터 새로고침
```

### 2. 통합 정산 흐름

```
[관리자 페이지] IntegratedSettlement.tsx
    ↓
1. 기간 선택
    ↓
2. API 필터 선택
    ↓
3. 실시간 계산 (정산 기록 저장 버튼 누르기 전)
   → calculateIntegratedSettlement(partnerId, commissionRates, start, end, apiFilter)
   → 내 총 수입 / 하위 파트너 지급 / 순수익 카드 표시
   → 하위 파트너별 지급 상세 테이블 표시
    ↓
4. 정산 기록 저장 버튼 클릭
   → 확인 다이얼로그: 내 수입, 하위 지급, 순수익 표시
    ↓
5. 확인 시
   → executeIntegratedSettlement(partnerId, commissionRates, start, end, period, apiFilter)
   → settlements 테이블에 기록 생성
   → ✅ 성공 메시지 표시
   → 데이터 새로고침
```

### 3. 정산 이력 조회 흐름

```
[관리자 페이지] SettlementHistory.tsx
    ↓
1. 정산 유형 필터 선택 (전체/파트너별/통합/롤링/루징)
    ↓
2. 날짜 범위 선택 (선택 사항)
    ↓
3. supabase.rpc('get_settlement_history', {
     p_partner_id: user.id,
     p_start_date: startDate,
     p_end_date: endDate,
     p_settlement_type: settlementType
   })
    ↓
4. 정산 이력 테이블 표시
   - 정산일시
   - 정산 유형 (배지)
   - 정산 기간
   - 기간 (시작일~종료일)
   - API (배지)
   - 롤링/루징/출금 수수료
   - 총액 또는 순수익
   - 실행자
```

---

## 주의사항

### 1. 보유금 변경 없음
- 정산은 **기록만 저장**하며, 실제 파트너 보유금(partners.balance)을 변경하지 않음
- 정산 기록은 수익 확인 및 향후 정산 지급 시 참고용
- 실제 지급은 별도 프로세스 (예: 관리자 강제 입금, 외부 송금 등) 필요

### 2. 중복 정산 방지
- 같은 partner_id + settlement_type + period_start + period_end + api_filter 조합은 1번만 정산 가능
- settlements 테이블의 UNIQUE 인덱스로 DB 레벨에서 강제
- RPC 함수 `check_settlement_exists`로 사전 체크

### 3. API 필터 독립성
- 같은 기간이라도 API 필터가 다르면 별도 정산 가능
  - 예: 오늘 Invest API 정산, 오늘 OroPlay API 정산, 오늘 전체 API 정산 → 모두 가능
- 각 API별 수익 분리 관리

### 4. 실시간 계산 성능
- 정산하기 버튼을 누르기 전에도 실시간으로 계산 수행
- 병렬 처리 (`Promise.all`) 사용으로 성능 최적화
- 하위 사용자가 많을 경우 계산 시간 소요 가능 → 로딩 스피너 표시

### 5. 기간 선택 주의
- 시작일 00:00:00 ~ 종료일 23:59:59 포함
- 종료일은 자동으로 +1일 00:00:00으로 변환 (쿼리에서 `lte` 사용)
- 예: 2025-01-01 선택 시 → 2025-01-01 00:00:00 ~ 2025-01-02 00:00:00 (2025-01-01 전체 포함)

### 6. 손실 계산
- 손실액 = 베팅액 - 승리액
- **손실만 합산, 이익(음수 손실)은 제외**
  ```typescript
  const loss = bet_amount - win_amount;
  if (loss > 0) {
    totalLossAmount += loss;
  }
  ```

### 7. 정산 방식 변경
- system_settings.settlement_method 변경 시 기존 정산 이력에는 영향 없음
- 변경 후 새로운 정산부터 적용
- 현재는 'direct_subordinate' 방식만 사용 (차등 정산 미구현)

### 8. 데이터 일관성
- game_records 테이블의 데이터가 정확해야 정산도 정확함
- 외부 API 동기화 (BettingHistorySync) 정상 작동 확인 필요
- transactions 테이블의 출금 승인 상태 정확성 확인 필요

### 9. 권한 관리
- 각 레벨에서 자신의 직속 하위에 대해서만 정산 가능
- Lv1 (시스템관리자): 전체 조회 가능하지만 정산은 Lv2 이하에서 수행
- Lv2~Lv6: 각자 직속 하위 정산

### 10. UI/UX
- 정산 전 확인 다이얼로그로 사용자 실수 방지
- 실시간 계산으로 정산 전 금액 미리 확인 가능
- 로딩 상태 명확히 표시 (로딩 스피너, 버튼 disabled)
- 에러 메시지 토스트로 사용자에게 명확히 전달

---

## 부록: 성능 최적화

### 1. 병렬 처리
- 직속 하위 파트너 커미션 계산 시 `Promise.all` 사용
- 예: 10명의 직속 하위 → 10개의 계산을 동시에 수행 (순차 대비 10배 빠름)

### 2. 재귀 제거
- 하위 사용자 조회 시 재귀 함수 대신 반복문 사용
- 스택 오버플로우 방지 및 성능 향상

### 3. 필요한 컬럼만 SELECT
- `select('bet_amount, win_amount')` 처럼 필요한 컬럼만 조회
- 네트워크 부하 및 파싱 시간 감소

### 4. 인덱스 활용
- user_id, played_at, api_type 등 WHERE 절 컬럼에 인덱스 생성
- 빠른 데이터 조회

### 5. 한 번의 순회로 계산
- 베팅액과 손실액을 별도 루프 없이 한 번의 루프로 계산
  ```typescript
  for (const record of bettingData) {
    totalBetAmount += record.bet_amount;
    const loss = record.bet_amount - record.win_amount;
    if (loss > 0) totalLossAmount += loss;
  }
  ```

---

**문서 버전**: 1.0  
**작성일**: 2025-01-10  
**최종 업데이트**: 2025-01-10  
**작성자**: System Analysis  
**다음 업데이트**: DB 스키마 실제 확인 후 수정
