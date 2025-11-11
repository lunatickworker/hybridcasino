# API 활성화/비활성화 설정 가이드

## 개요
Lv1 시스템관리자가 Invest API와 OroPlay API의 사용 여부를 선택할 수 있는 기능입니다.
API를 비활성화하면:
1. 해당 API의 보유금은 입금 제한 계산에서 제외됩니다.
2. 해당 API 관련 UI가 모두 숨김 처리됩니다 (Lv2, Lv3).
3. Lv2, Lv3의 balance 계산에서 비활성화된 API 잔고가 제외됩니다.

---

## 1. 기본 정책

### 1.1 권한
- **Lv1 (시스템관리자)만 설정 가능**
- Lv2~7은 Lv1의 설정을 따라감

### 1.2 제약사항
- **최소 하나의 API는 활성화되어야 함**
- 두 API를 모두 비활성화할 수 없음

### 1.3 기본값
- `use_invest_api`: `true`
- `use_oroplay_api`: `true`

---

## 2. 데이터베이스 구조

### 2.1 api_configs 테이블 컬럼 추가
```sql
ALTER TABLE api_configs 
ADD COLUMN IF NOT EXISTS use_invest_api BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS use_oroplay_api BOOLEAN DEFAULT true;
```

### 2.2 인덱스
```sql
CREATE INDEX IF NOT EXISTS idx_api_configs_use_invest 
  ON api_configs(partner_id, use_invest_api);
  
CREATE INDEX IF NOT EXISTS idx_api_configs_use_oroplay 
  ON api_configs(partner_id, use_oroplay_api);
```

---

## 3. 입금/출금 로직 (중요!)

### 3.0 Lv1/Lv2 → Lv3 입금 ⭐ (신규)
- **입금 시점: 두 API 모두 즉시 차감/증가**
- **Lv3 balance: invest_balance + oroplay_balance (트리거 자동 계산)**
- **Lv3 UI: balance만 표시 (API 보유금 숨김)**
- 입금 제한: 두 API 중 가장 작은 보유금 기준
- 예시:
  ```
  Lv2 Invest: 1,000,000원
  Lv2 OroPlay: 1,500,000원
  Lv3 Invest: 500,000원
  Lv3 OroPlay: 700,000원
  Lv3 balance: 1,200,000원 (자동 계산)
  
  Lv2 → Lv3 100,000원 입금
  → 입금 가능: 1,000,000원 (최소값 기준)
  → ✅ 입금 성공
  → Lv2 Invest: 900,000원 (차감)
  → Lv2 OroPlay: 1,400,000원 (차감)
  → Lv3 Invest: 600,000원 (증가)
  → Lv3 OroPlay: 800,000원 (증가)
  → Lv3 balance: 1,400,000원 (자동 계산)
  ```

### 3.1 Lv1, Lv2 → Lv7 입금
- **⚠️ 입금 시점에는 API 보유금 차감 없음**
- **게임 플레이 시에만 실제 사용된 API 보유금 차감**
- 입금 제한: 활성화된 API 중 가장 작은 보유금 기준
- 예시:
  ```
  Lv1 Invest: 1,000,000원
  Lv1 OroPlay: 1,500,000원
  
  Lv1 → Lv7 100,000원 입금
  → 입금 가능: 1,000,000원 (최소값 기준)
  → ✅ 입금 성공 (Lv1 API 보유금 변동 없음)
  
  Lv7이 Invest API 게임 실행
  → Invest API에서 베팅
  → Lv1 Invest 보유금에서만 차감
  ```

### 3.2 Lv3~6 → Lv7 입금
- **즉시 balance에서 차감**
- 예시:
  ```
  Lv3 balance: 500,000원
  
  Lv3 → Lv7 100,000원 입금
  → Lv3 balance: 400,000원 (즉시 차감)
  ```

### 3.3 Lv1/Lv2 → Lv3 회수(출금) ⭐ (신규)
- **회수 시점: 선택한 API만 처리**
- **모달 UI: Invest / OroPlay API 선택 라디오 버튼**
- **Lv3 balance: 선택한 API 차감 후 자동 재계산**
- 예시:
  ```
  Lv2 Invest: 900,000원
  Lv2 OroPlay: 1,400,000원
  Lv3 Invest: 600,000원
  Lv3 OroPlay: 800,000원
  Lv3 balance: 1,400,000원
  
  Lv2 → Lv3 회수 50,000원 (Invest API 선택)
  → ✅ 회수 성공
  → Lv2 Invest: 950,000원 (증가)
  → Lv2 OroPlay: 1,400,000원 (변동 없음)
  → Lv3 Invest: 550,000원 (차감)
  → Lv3 OroPlay: 800,000원 (변동 없음)
  → Lv3 balance: 1,350,000원 (자동 재계산)
  ```

### 3.4 출금
- **Lv3 제외: 대상자의 전체 balance만 체크**
- 모든 레벨 동일 로직

---

## 4. UI 구성

### 4.1 시스템 설정 - API 설정 탭
**위치**: `/admin/settings` → `API 설정` 탭

**구성 요소**:
1. **Invest API 스위치**
   - 레이블: "Invest API"
   - 설명: "카지노 및 슬롯 게임 제공"
   - 비활성화 조건: OroPlay가 비활성화된 상태에서 Invest만 활성화된 경우

2. **OroPlay API 스위치**
   - 레이블: "OroPlay API"
   - 설명: "카지노, 슬롯 및 미니게임 제공"
   - 비활성화 조건: Invest가 비활성화된 상태에서 OroPlay만 활성화된 경우

3. **안내 메시지**
   ```
   ℹ️ API를 비활성화하면:
   • 해당 API의 보유금은 입금 제한 계산에서 제외됩니다.
   • 해당 API 관련 UI가 모두 숨김 처리됩니다 (Lv2, Lv3).
   • Lv2, Lv3의 balance는 활성화된 API 잔고만 합산됩니다.
   • Lv2~7은 Lv1의 설정을 따라갑니다.
   • 최소 하나의 API는 활성화되어야 합니다.
   ```

4. **입금 제한 로직 안내**
   ```
   ⚠️ 입금 제한 로직 안내
   • Lv1→Lv2~7 입금: 활성화된 API 중 가장 작은 보유금 기준
   • Lv2→Lv3~7 입금: 활성화된 API 중 가장 작은 보유금 기준
   • Lv3~7 입금: balance 기준 (API 보유금 표시 없음)
   ```

### 4.2 UI 동적 노출/비노출 (✅ 신규)

#### 4.2.1 Lv2 헤더 - API별 잔고 표시
**위치**: `AdminHeader.tsx`

**로직**:
- `use_invest_api = false` → Invest API 잔고 카드 숨김
- `use_oroplay_api = false` → OroPlay API 잔고 카드 숨김

**예시**:
```
✅ 두 API 모두 활성화:
[Invest ₩100,000] [OroPlay ₩142,997]

✅ Invest만 활성화:
[Invest ₩100,000]

✅ OroPlay만 활성화:
[OroPlay ₩142,997]
```

#### 4.2.2 입출금 모달 - API 선택 UI
**위치**: `ForceTransactionModal.tsx`

**Lv1, Lv2 → Lv2, Lv3 입출금 시**:
- 비활성화된 API는 선택 옵션에서 제거
- 관리자 보유금 표시에서도 비활성화된 API 숨김

**예시**:
```
✅ 두 API 모두 활성화:
API 선택: [Invest API] [OroPlay API]
Invest API:  100,000원
OroPlay API: 150,000원

✅ Invest만 활성화:
API 선택: [Invest API]
Invest API:  100,000원

✅ OroPlay만 활성화:
API 선택: [OroPlay API]
OroPlay API: 150,000원
```

#### 4.2.3 Lv2, Lv3 balance 트리거 (✅ 신규)
**위치**: `/database/700_add_lv3_generated_balance.sql`

**로직**:
- Lv2, Lv3의 `balance`는 **활성화된 API 잔고만 합산**
- `use_invest_api = false` → `balance = oroplay_balance`
- `use_oroplay_api = false` → `balance = invest_balance`
- 두 API 모두 활성화 → `balance = invest_balance + oroplay_balance`

**트리거**:
1. `partners` 테이블의 `invest_balance`, `oroplay_balance` 변경 시 자동 계산
2. `api_configs` 테이블의 `use_invest_api`, `use_oroplay_api` 변경 시 모든 Lv2, Lv3 재계산

**예시**:
```
초기 상태:
Lv2 invest_balance: 100,000원
Lv2 oroplay_balance: 150,000원
Lv2 balance: 250,000원

Lv1이 Invest API 비활성화:
→ Lv2 balance: 150,000원 (자동 재계산)
→ Lv3 balance: oroplay_balance만 합산

Lv1이 Invest API 재활성화:
→ Lv2 balance: 250,000원 (자동 복구)
```

### 4.3 강제 입출금 모달 - 관리자 보유금 표시
**Lv1 표시 예시**:
```
💰 관리자 보유금 (입금 가능 금액)
Invest API:     100,000원
OroPlay API:    150,000원
────────────────────────
입금 가능 (최소값): 100,000원

※ 두 API 중 가장 작은 보유금을 기준으로 입금 제한됩니다.
```

**Lv2 표시 예시**:
```
💰 관리자 보유금 (입금 가능 금액)
Invest API:     50,000원
OroPlay API:    80,000원
────────────────────────
입금 가능 (최소값): 50,000원

※ 두 API 중 가장 작은 보유금을 기준으로 입금 제한됩니다.
```

**Lv3~7 표시 예시**:
```
💰 관리자 보유금 (입금 가능 금액)
사용 가능:      200,000원
```

---

## 5. BalanceContext 확장 (✅ 신규)

### 5.1 Context에 API 설정 추가
**위치**: `/contexts/BalanceContext.tsx`

**추가 필드**:
```typescript
interface BalanceContextType {
  // 기존 필드
  balance: number;
  investBalance: number;
  oroplayBalance: number;
  loading: boolean;
  error: string | null;
  lastSyncTime: Date | null;
  syncBalance: () => Promise<void>;
  
  // ✅ 신규 필드
  useInvestApi: boolean;   // Invest API 활성화 여부
  useOroplayApi: boolean;  // OroPlay API 활성화 여부
}
```

**로드 로직**:
- Lv1: `api_configs` 테이블에서 직접 조회
- Lv2~7: Lv1의 `api_configs` 조회 (Lv1 설정을 따름)

**사용 예시**:
```typescript
const { useInvestApi, useOroplayApi } = useBalance();

// UI 조건부 렌더링
{useInvestApi && <InvestBalanceCard />}
{useOroplayApi && <OroplayBalanceCard />}
```

## 6. 구현 상세

### 6.1 SystemSettings.tsx
```typescript
// API 활성화 상태
const [useInvestApi, setUseInvestApi] = useState(true);
const [useOroplayApi, setUseOroplayApi] = useState(true);

// API 설정 로드
const loadApiSettings = async () => {
  const { data } = await supabase
    .from('api_configs')
    .select('use_invest_api, use_oroplay_api')
    .eq('partner_id', user.id)
    .single();
    
  setUseInvestApi(data.use_invest_api !== false);
  setUseOroplayApi(data.use_oroplay_api !== false);
};

// API 설정 저장
const saveApiSettings = async () => {
  if (!useInvestApi && !useOroplayApi) {
    toast.error('최소 하나의 API는 활성화되어야 합니다.');
    return;
  }
  
  await supabase
    .from('api_configs')
    .update({
      use_invest_api: useInvestApi,
      use_oroplay_api: useOroplayApi
    })
    .eq('partner_id', user.id);
};
```

### 6.2 AdminHeader.tsx (✅ 신규)
```typescript
const { useInvestApi, useOroplayApi } = useBalance();

// Lv2 헤더 - API별 잔고 표시
{(user.level === 1 || user.level === 2) && (
  <>
    {/* Invest 보유금 - useInvestApi가 true일 때만 표시 */}
    {useInvestApi && (
      <div className="...">
        <Wallet /> Invest {investBalance}
      </div>
    )}
    
    {/* OroPlay 보유금 - useOroplayApi가 true일 때만 표시 */}
    {useOroplayApi && (
      <div className="...">
        <Wallet /> OroPlay {oroplayBalance}
      </div>
    )}
  </>
)}
```

### 6.3 ForceTransactionModal.tsx
```typescript
const { useInvestApi, useOroplayApi } = useBalance();

// ✅ API 선택 UI - 비활성화된 API 숨김
<Select value={apiType} onValueChange={(v) => setApiType(v)}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {useInvestApi && <SelectItem value="invest">Invest API</SelectItem>}
    {useOroplayApi && <SelectItem value="oroplay">OroPlay API</SelectItem>}
  </SelectContent>
</Select>

// ✅ 관리자 보유금 표시 - 비활성화된 API 숨김
{currentUserLevel === 1 && (
  <div>
    {useInvestApi && (
      <div>Invest API: {currentUserInvestBalance}원</div>
    )}
    {useOroplayApi && (
      <div>OroPlay API: {currentUserOroplayBalance}원</div>
    )}
    <div>
      입금 가능 (최소값): 
      {(() => {
        const balances = [];
        if (useInvestApi) balances.push(currentUserInvestBalance);
        if (useOroplayApi) balances.push(currentUserOroplayBalance);
        return Math.min(...balances);
      })()}원
    </div>
  </div>
)}

// ✅ 검증 로직 (입금) - 활성화된 API만 고려
if (type === 'deposit') {
  if (currentUserLevel === 1 || currentUserLevel === 2) {
    const balances = [];
    if (useInvestApi) balances.push(currentUserInvestBalance);
    if (useOroplayApi) balances.push(currentUserOroplayBalance);
    const minBalance = balances.length > 0 ? Math.min(...balances) : 0;
    
    if (amountNum > minBalance) {
      let insufficientApi = '';
      if (useInvestApi && useOroplayApi) {
        insufficientApi = currentUserInvestBalance < currentUserOroplayBalance 
          ? 'Invest' : 'OroPlay';
      } else if (useInvestApi) {
        insufficientApi = 'Invest';
      } else {
        insufficientApi = 'OroPlay';
      }
      errorMessage = `${insufficientApi} API 보유금이 부족합니다.`;
    }
  }
}
```

### 6.4 Database Triggers (✅ 신규)

#### 6.4.1 Lv2, Lv3 balance 자동 계산 트리거
**파일**: `/database/700_add_lv3_generated_balance.sql`

```sql
-- Lv2, Lv3 balance 자동 업데이트 트리거 함수 (API 설정 반영)
CREATE OR REPLACE FUNCTION update_lv2_lv3_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_use_invest_api BOOLEAN;
  v_use_oroplay_api BOOLEAN;
BEGIN
  IF NEW.level IN (2, 3) THEN
    -- Lv1의 API 설정 조회
    SELECT ac.use_invest_api, ac.use_oroplay_api
    INTO v_use_invest_api, v_use_oroplay_api
    FROM partners p
    INNER JOIN api_configs ac ON ac.partner_id = p.id
    WHERE p.level = 1
    LIMIT 1;
    
    -- 기본값 설정
    v_use_invest_api := COALESCE(v_use_invest_api, true);
    v_use_oroplay_api := COALESCE(v_use_oroplay_api, true);
    
    -- balance 계산 (활성화된 API만 합산)
    NEW.balance := 0;
    
    IF v_use_invest_api THEN
      NEW.balance := NEW.balance + COALESCE(NEW.invest_balance, 0);
    END IF;
    
    IF v_use_oroplay_api THEN
      NEW.balance := NEW.balance + COALESCE(NEW.oroplay_balance, 0);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### 6.4.2 API 설정 변경 시 재계산 트리거
```sql
-- API 설정 변경 시 Lv2, Lv3 balance 재계산 트리거
CREATE OR REPLACE FUNCTION recalculate_lv2_lv3_balance_on_api_change()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM partners WHERE id = NEW.partner_id AND level = 1) THEN
    -- Lv2, Lv3 balance 재계산
    IF NEW.use_invest_api AND NEW.use_oroplay_api THEN
      UPDATE partners
      SET balance = COALESCE(invest_balance, 0) + COALESCE(oroplay_balance, 0)
      WHERE level IN (2, 3);
    ELSIF NEW.use_invest_api THEN
      UPDATE partners
      SET balance = COALESCE(invest_balance, 0)
      WHERE level IN (2, 3);
    ELSIF NEW.use_oroplay_api THEN
      UPDATE partners
      SET balance = COALESCE(oroplay_balance, 0)
      WHERE level IN (2, 3);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER trigger_recalculate_lv2_lv3_balance
  AFTER UPDATE OF use_invest_api, use_oroplay_api
  ON api_configs
  FOR EACH ROW
  WHEN (OLD.use_invest_api IS DISTINCT FROM NEW.use_invest_api OR 
        OLD.use_oroplay_api IS DISTINCT FROM NEW.use_oroplay_api)
  EXECUTE FUNCTION recalculate_lv2_lv3_balance_on_api_change();
```

### 6.5 UserManagement.tsx - 강제 입금 처리
```typescript
// 관리자 보유금 처리
if (adminPartner.level === 1 || adminPartner.level === 2) {
  // Lv1, Lv2: 입금 시 API 보유금 변동 없음
  // 게임 플레이 시에만 실제 API에서 차감
  console.log('ℹ️ Lv1/Lv2 입금: API 보유금 변동 없음 (게임 플레이 시 차감)');
} else {
  // Lv3~6: 즉시 balance 차감
  if (data.type === 'deposit') {
    adminNewBalance = adminPartner.balance - data.amount;
    await supabase
      .from('partners')
      .update({ balance: adminNewBalance })
      .eq('id', authState.user.id);
  }
}
```

---

## 7. 사용 시나리오

### 6.1 Lv1 → Lv7 입금 후 게임 플레이
**초기 상태**:
- Lv1 Invest: 1,000,000원
- Lv1 OroPlay: 1,500,000원
- Lv7 balance: 0원

**시나리오**:
1. Lv1이 Lv7에게 100,000원 입금
   - 입금 제한: 1,000,000원 (최소값)
   - ✅ 입금 성공
   - Lv1 Invest: 1,000,000원 (변동 없음)
   - Lv1 OroPlay: 1,500,000원 (변동 없음)
   - Lv7 balance: 100,000원

2. Lv7이 Invest API 게임 실행 (프라그마틱)
   - 게임 실행 → Invest API 호출
   - 베팅: 10,000원
   - Lv1 Invest: 990,000원 (**게임 플레이 시점에 차감**)
   - Lv1 OroPlay: 1,500,000원 (변동 없음)

3. Lv7이 OroPlay API 게임 실행
   - 게임 실행 → OroPlay API 호출
   - 베팅: 5,000원
   - Lv1 Invest: 990,000원 (변동 없음)
   - Lv1 OroPlay: 1,495,000원 (**게임 플레이 시점에 차감**)

### 6.2 Lv2 → Lv3 입금 ⭐ (신규)
**초기 상태**:
- Lv2 Invest: 1,000,000원
- Lv2 OroPlay: 1,500,000원
- Lv3 Invest: 500,000원
- Lv3 OroPlay: 700,000원
- Lv3 balance: 1,200,000원

**시나리오**:
1. Lv2가 Lv3에게 100,000원 입금
   - 입금 제한: 1,000,000원 (최소값)
   - ✅ 입금 성공
   - Lv2 Invest: 900,000원 (**즉시 차감**)
   - Lv2 OroPlay: 1,400,000원 (**즉시 차감**)
   - Lv3 Invest: 600,000원 (**즉시 증가**)
   - Lv3 OroPlay: 800,000원 (**즉시 증가**)
   - Lv3 balance: 1,400,000원 (**트리거 자동 계산**)

### 6.3 Lv2 → Lv3 회수 ⭐ (신규)
**초기 상태**:
- Lv2 Invest: 900,000원
- Lv2 OroPlay: 1,400,000원
- Lv3 Invest: 600,000원
- Lv3 OroPlay: 800,000원
- Lv3 balance: 1,400,000원

**시나리오**:
1. 모달에서 **Invest API 선택** 후 회수 50,000원
   - ✅ 회수 성공
   - Lv2 Invest: 950,000원 (**증가**)
   - Lv2 OroPlay: 1,400,000원 (**변동 없음**)
   - Lv3 Invest: 550,000원 (**차감**)
   - Lv3 OroPlay: 800,000원 (**변동 없음**)
   - Lv3 balance: 1,350,000원 (**트리거 자동 재계산**)

### 6.4 Lv3 → Lv7 입금
**초기 상태**:
- Lv3 balance: 1,350,000원
- Lv7 balance: 0원

**시나리오**:
1. Lv3이 Lv7에게 100,000원 입금
   - ✅ 입금 성공
   - Lv3 balance: 1,250,000원 (**즉시 차감**)
   - Lv7 balance: 100,000원

2. Lv7이 게임 실행
   - Lv3 balance는 변동 없음 (이미 입금 시 차감됨)

### 7.3 API 비활성화 시 UI 변화 (✅ 신규)
**초기 상태**:
- Lv1 use_invest_api: true
- Lv1 use_oroplay_api: true
- Lv2 invest_balance: 100,000원
- Lv2 oroplay_balance: 150,000원
- Lv2 balance: 250,000원

**Lv1이 Invest API 비활성화**:
1. **데이터베이스 변화**:
   - `api_configs.use_invest_api = false`
   - Lv2 balance: 150,000원 (자동 재계산, 트리거)
   - Lv3 balance: oroplay_balance만 합산 (트리거)

2. **UI 변화 (Lv2)**:
   - AdminHeader: Invest 잔고 카드 숨김 → [OroPlay ₩150,000]만 표시
   - ForceTransactionModal:
     - API 선택: [OroPlay API]만 표시
     - 관리자 보유금: OroPlay API만 표시
     - 입금 가능 금액: 150,000원

3. **입금 제한**:
   - Lv1 → Lv7 입금: OroPlay 보유금만 기준
   - Lv2 → Lv7 입금: OroPlay 보유금만 기준

**Lv1이 Invest API 재활성화**:
1. **데이터베이스 변화**:
   - `api_configs.use_invest_api = true`
   - Lv2 balance: 250,000원 (자동 복구, 트리거)
   - Lv3 balance: invest_balance + oroplay_balance (트리거)

2. **UI 변화 (Lv2)**:
   - AdminHeader: 두 잔고 카드 모두 표시
   - ForceTransactionModal: 두 API 모두 선택 가능

### 7.4 API 비활성화 시 (기존)
**설정**:
- Invest API: ❌ 비활성화
- OroPlay API: ✅ 활성화

**효과**:
- 입금 제한: OroPlay 보유금만 기준
- Lv7이 Invest API 게임 실행해도 차감 안 됨 (비활성화)

---

## 8. 주의사항

### 7.1 API 비활성화 != 게임 비활성화
- API를 비활성화해도 **게임은 여전히 실행 가능**
- 단지 **입금 제한 계산에서만 제외**됨

### 7.2 Lv2~7은 Lv1을 따름
- Lv2~7 파트너는 이 설정을 변경할 수 없음
- Lv1의 설정이 전체 시스템에 적용됨

### 7.3 실시간 반영
- 설정 저장 즉시 입금 제한 로직에 반영
- 현재 진행 중인 거래에는 영향 없음

---

## 9. 테스트 체크리스트

### 8.1 기본 기능
- [ ] Lv1에서 API 설정 탭 접근 가능
- [ ] Lv2~7에서 API 설정 탭 접근 제한 (안내 메시지 표시)
- [ ] 두 API 모두 비활성화 시도 시 에러 메시지
- [ ] 설정 저장 후 DB에 정확히 저장됨
- [ ] 페이지 새로고침 후에도 설정 유지

### 8.2 입금 제한 로직
- [ ] Lv1 → Lv7 입금 시 가장 작은 API 보유금 기준 적용
- [ ] Lv2 → Lv7 입금 시 가장 작은 API 보유금 기준 적용
- [ ] Lv3 → Lv7 입금 시 balance 기준 적용
- [ ] 출금 시 대상자 balance만 체크

### 9.3 UI 동적 노출/비노출 (✅ 신규)
- [ ] Lv2 헤더: Invest API 비활성화 시 Invest 잔고 카드 숨김
- [ ] Lv2 헤더: OroPlay API 비활성화 시 OroPlay 잔고 카드 숨김
- [ ] 입출금 모달: 비활성화된 API는 선택 옵션에서 제거
- [ ] 입출금 모달: 관리자 보유금 표시에서 비활성화된 API 숨김
- [ ] 입출금 모달: 입금 가능 금액 계산에 활성화된 API만 반영

### 9.4 Lv2, Lv3 balance 트리거 (✅ 신규)
- [ ] Invest API 비활성화 시 Lv2 balance = oroplay_balance
- [ ] OroPlay API 비활성화 시 Lv2 balance = invest_balance
- [ ] 두 API 모두 활성화 시 Lv2 balance = invest_balance + oroplay_balance
- [ ] API 설정 변경 시 모든 Lv2, Lv3 balance 자동 재계산
- [ ] invest_balance, oroplay_balance 변경 시 balance 자동 업데이트

### 9.5 UI 표시 (기존)
- [ ] Lv1 입금 모달: 두 API 보유금 + 최소값 표시
- [ ] Lv2 입금 모달: 두 API 보유금 + 최소값 표시
- [ ] Lv3~7 입금 모달: 단일 balance 표시
- [ ] 에러 메시지 정확히 표시

---

## 10. 관련 파일

### 10.1 컴포넌트
- `/components/admin/SystemSettings.tsx` - API 설정 UI
- `/components/admin/ForceTransactionModal.tsx` - 입금 제한 로직 + UI 동적 노출/비노출
- `/components/admin/AdminHeader.tsx` - Lv2 헤더 API별 잔고 표시 (✅ 신규)
- `/components/admin/UserManagement.tsx` - 관리자 보유금 조회

### 10.2 Context
- `/contexts/BalanceContext.tsx` - API 활성화 상태 제공 (✅ 신규)

### 10.3 데이터베이스
- `/database/600_add_api_enable_settings.sql` - 스키마 마이그레이션
- `/database/700_add_lv3_generated_balance.sql` - Lv2, Lv3 balance 트리거 (✅ 수정)

### 10.4 문서
- `/guidelines/api_enable_settings.md` - 이 문서
- `/guidelines/seamless_wallet_integration.md` - 전체 지갑 시스템

---

## 11. 향후 확장 가능성

### 10.1 파트너별 API 설정
- 현재: Lv1만 전체 시스템 설정
- 향후: Lv2~6도 자신의 하위에만 적용되는 설정 가능

### 10.2 API별 제한 비율
- 현재: 활성화/비활성화만 지원
- 향후: API별로 입금 제한 비율 설정 가능 (예: Invest 70%, OroPlay 30%)

### 10.3 시간대별 API 전환
- 현재: 고정 설정
- 향후: 특정 시간대에 자동으로 API 전환

---

## 12. FAQ

### Q1. Lv1이 Lv7에게 입금하면 언제 API 보유금이 차감되나요?
**A**: **게임 플레이 시점**에만 차감됩니다. 입금 시점에는 Lv1의 API 보유금이 변동되지 않습니다.
```
입금 시: Lv1 API 보유금 변동 없음 ❌
게임 플레이 시: 실제 사용된 API에서만 차감 ✅
```

### Q2. Lv3이 Lv7에게 입금하면 언제 balance가 차감되나요?
**A**: **입금 즉시** 차감됩니다.
```
입금 시: Lv3 balance 즉시 차감 ✅
```

### Q3. Lv7이 게임을 하지 않으면 Lv1 보유금은 어떻게 되나요?
**A**: **변동 없습니다**. Lv7이 게임을 실행하고 베팅할 때만 차감됩니다.

### Q4. Lv7이 Invest 게임과 OroPlay 게임을 번갈아 하면?
**A**: **각 API별로 독립적으로 차감**됩니다.
```
Invest 게임 베팅 → Lv1 Invest 보유금 차감
OroPlay 게임 베팅 → Lv1 OroPlay 보유금 차감
```

### Q5. 출금은 어떻게 처리되나요?
**A**: 출금은 **대상자의 전체 balance만** 체크합니다. API 구분 없이 처리됩니다.

### Q6. API를 비활성화하면 게임도 실행 안 되나요?
**A**: 아니요. API 비활성화는 **입금 제한 계산에만 영향**을 미칩니다. 게임은 여전히 정상적으로 실행됩니다.

### Q7. Lv2도 Lv1과 동일하게 작동하나요?
**A**: 네. **Lv1, Lv2 모두 게임 플레이 시점에만 API 보유금이 차감**됩니다. 입금 시점에는 변동이 없습니다.

### Q8. API를 비활성화하면 UI에서 어떻게 보이나요? (✅ 신규)
**A**: 비활성화된 API는 **모든 UI에서 숨김 처리**됩니다.
```
예) Invest API 비활성화:
- Lv2 헤더: Invest 잔고 카드 숨김
- 입출금 모달: Invest API 선택 옵션 제거
- 관리자 보유금: Invest API 표시 제거
```

### Q9. API 설정을 변경하면 Lv2, Lv3 balance는 언제 반영되나요? (✅ 신규)
**A**: **즉시 자동 반영**됩니다. 데이터베이스 트리거가 API 설정 변경을 감지하여 모든 Lv2, Lv3 파트너의 balance를 자동으로 재계산합니다.

### Q10. Lv2 balance는 어떻게 계산되나요? (✅ 신규)
**A**: **활성화된 API 잔고만 합산**됩니다.
```
두 API 모두 활성화: balance = invest_balance + oroplay_balance
Invest만 활성화: balance = invest_balance
OroPlay만 활성화: balance = oroplay_balance
```

---

## 13. 버전 히스토리

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 1.0  | 2025-01-10 | 초기 문서 작성 |
| 2.0  | 2025-01-11 | Lv3 본사 API별 보유금 관리 로직 추가 |
| 3.0  | 2025-11-07 | ✅ UI 동적 노출/비노출 + Lv2, Lv3 balance 트리거 추가 |

---

**문서 작성자**: GMS 개발팀  
**최종 수정일**: 2025-11-07  
**관련 이슈**: API 활성화/비활성화 설정 + UI 동적 노출/비노출 + Lv2, Lv3 balance 자동 계산
