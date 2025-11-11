# Seamless Wallet 통합 구현 가이드 (v2.1 - paused 상태 추가)

## 개요
Invest API와 OroPlay API를 통합하여 사용자가 게임 아이콘 선택에 따라 자동으로 다른 API를 사용하는 Seamless Wallet 시스템 구현 가이드

**v2.1 업데이트 (2025-01-11):**
- ⭐ `paused` 상태 추가로 ready 중복 입금 버그 해결
- active → paused (4분 베팅 없음, 타임아웃 없음)
- paused → active (베팅 재개)
- paused는 게임창 닫힘까지 무한 대기

**v2.0 업데이트:**
- Lv3 본사의 `balance` 자동 계산 트리거 추가
- Lv1/Lv2 → Lv3 입금/회수 시 두 API 처리 로직 추가

---

## 1. 데이터베이스 스키마 변경

### 1.0 Lv3 Balance 자동 계산 (⭐ 신규)
```sql
-- Lv3 본사의 balance를 invest_balance + oroplay_balance로 자동 계산
CREATE OR REPLACE FUNCTION update_lv3_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.level = 3 THEN
    NEW.balance := COALESCE(NEW.invest_balance, 0) + COALESCE(NEW.oroplay_balance, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_lv3_balance
  BEFORE INSERT OR UPDATE OF invest_balance, oroplay_balance
  ON partners
  FOR EACH ROW
  WHEN (NEW.level = 3)
  EXECUTE FUNCTION update_lv3_balance();

-- 기존 Lv3 데이터 재계산
UPDATE partners
SET balance = COALESCE(invest_balance, 0) + COALESCE(oroplay_balance, 0)
WHERE level = 3;
```

**설명:**
- Lv3는 DB에 `invest_balance`, `oroplay_balance`, `balance` 모두 저장
- `balance`는 트리거로 자동 계산되므로 수동 업데이트 불필요
- UI에는 `balance`만 표시 (API 보유금은 회수 시에만 표시)

---

## 1. 데이터베이스 스키마 변경

### 1.1 api_configs 테이블 확장
```sql
ALTER TABLE api_configs ADD COLUMN IF NOT EXISTS oroplay_secret TEXT;
ALTER TABLE api_configs ADD COLUMN IF NOT EXISTS oroplay_token TEXT;
ALTER TABLE api_configs ADD COLUMN IF NOT EXISTS oroplay_token_expires_at TIMESTAMPTZ;
ALTER TABLE api_configs ADD COLUMN IF NOT EXISTS oroplay_balance DECIMAL(15,2) DEFAULT 0;

-- 토큰 자동 갱신 함수 (5분 전 만료 체크)
CREATE OR REPLACE FUNCTION check_oroplay_token_expiry()
RETURNS TABLE (
  partner_id UUID,
  should_refresh BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ac.partner_id,
    (ac.oroplay_token_expires_at IS NULL OR 
     ac.oroplay_token_expires_at < NOW() + INTERVAL '5 minutes') as should_refresh
  FROM api_configs ac
  WHERE ac.oroplay_secret IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
```

### 1.2 games 테이블 확장
```sql
ALTER TABLE games ADD COLUMN IF NOT EXISTS api_type TEXT DEFAULT 'invest';
ALTER TABLE games ADD COLUMN IF NOT EXISTS vendor_code TEXT;

-- api_type: 'invest' | 'oroplay'
-- game_type: 'casino' | 'slot' | 'minigame'
-- vendor_code: OroPlay API 게임사 코드

CREATE INDEX IF NOT EXISTS idx_games_api_type ON games(api_type);
CREATE INDEX IF NOT EXISTS idx_games_vendor_code ON games(vendor_code);
CREATE INDEX IF NOT EXISTS idx_games_game_type ON games(game_type);
```

### 1.3 game_records 테이블 확장
```sql
ALTER TABLE game_records ADD COLUMN IF NOT EXISTS api_type TEXT DEFAULT 'invest';

-- 복합 유니크 인덱스 (트랜잭션 ID 충돌 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_records_api_txid 
ON game_records(api_type, txid);
```

### 1.4 game_sessions 테이블 확장
```sql
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS api_type TEXT DEFAULT 'invest';

CREATE INDEX IF NOT EXISTS idx_game_sessions_api_type ON game_sessions(api_type);
```

---

## 2. API 라우팅 시스템

### 2.1 게임 실행 시 API Credential 조회 규칙

**⭐ 중요: Lv7(사용자) 게임 실행 시 Credential 조회 로직**

사용자(Lv7)가 게임을 실행할 때는 자신의 `referrer_id`를 따라 최상위 파트너(Lv1)까지 올라가서 해당 파트너의 `api_configs`에서 credential을 가져와야 합니다.

**권한 레벨:**
- Lv1: 시스템관리자 (API Credential 소유)
- Lv2: 대본사
- Lv3: 본사
- Lv4: 부본사
- Lv5: 총판
- Lv6: 매장
- Lv7: 사용자

**Credential 조회 흐름:**
```
Lv7 사용자 → referrer_id → Lv6 매장 → parent_id → Lv5 총판 
→ parent_id → Lv4 부본사 → parent_id → Lv3 본사 
→ parent_id → Lv2 대본사 → parent_id → Lv1 시스템관리자 (API Credential)
```

### 2.2 게임 실행 시 API 결정
```typescript
// lib/gameApi.ts 확장

/**
 * referrer_id를 따라 최상위(Lv1) 파트너 ID를 찾는 함수
 */
async function getTopLevelPartnerId(partnerId: string): Promise<string | null> {
  let currentPartnerId = partnerId;
  let iterations = 0;
  const maxIterations = 10; // 무한 루프 방지

  while (iterations < maxIterations) {
    const { data: partner, error } = await supabase
      .from('partners')
      .select('id, parent_id, level, username')
      .eq('id', currentPartnerId)
      .single();

    if (error || !partner) {
      console.error('❌ 파트너 조회 실패:', error);
      return null;
    }

    console.log(`🔍 파트너 조회 [${iterations}]:`, {
      id: partner.id,
      username: partner.username,
      level: partner.level,
      parent_id: partner.parent_id
    });

    // Lv1 (시스템관리자)에 도달하면 해당 ID 반환
    if (partner.level === 1 || !partner.parent_id) {
      console.log('✅ 최상위 파트너 발견 (Lv1):', partner.username);
      return partner.id;
    }

    // 상위 파트너로 이동
    currentPartnerId = partner.parent_id;
    iterations++;
  }

  console.error('❌ 최대 반복 횟수 초과');
  return null;
}

export async function launchGame(
  userId: string,
  gameId: number,
  apiType: 'invest' | 'oroplay'
) {
  // 1. 활성 세션 체크 (다른 API 게임 중인지 확인)
  const activeSession = await checkActiveSession(userId);
  
  if (activeSession && activeSession.api_type !== apiType) {
    throw new Error('DIFFERENT_API_ACTIVE');
  }
  
  // 2. 사용자 정보 조회
  const { data: user } = await supabase
    .from('users')
    .select('username, referrer_id')
    .eq('id', userId)
    .single();
  
  // 3. ⭐ Lv1 파트너 ID 찾기 (referrer_id를 따라 최상위까지 올라감)
  const topLevelPartnerId = await getTopLevelPartnerId(user.referrer_id);
  
  if (!topLevelPartnerId) {
    throw new Error('최상위 파트너를 찾을 수 없습니다.');
  }
  
  // 4. API 타입에 따라 분기
  if (apiType === 'invest') {
    return await launchInvestGame(topLevelPartnerId, user.username, gameId);
  } else {
    return await launchOroPlayGame(topLevelPartnerId, user.username, gameId);
  }
}

async function checkActiveSession(userId: string) {
  const { data } = await supabase
    .from('game_sessions')
    .select('api_type, session_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
    
  return data;
}
```

### 2.2 게임창 차단 시나리오 (⭐ v2.1 추가)

**시나리오:**
1. 사용자가 게임 클릭 → API 입금 완료, URL 발급 완료
2. 브라우저가 팝업 차단 → 토스트 "차단되었습니다" 출력
3. 세션은 `ready` 상태 유지 (입금 완료, URL 발급 완료)
4. 사용자가 팝업 차단 해제
5. 동일한 게임 재클릭 → 기존 URL 재사용 (중복 입금 방지)

**구현:**
```typescript
// UserCasino.tsx / UserSlot.tsx / UserMiniGame.tsx

// ⭐ 1. 팝업 오픈 시도
const gameWindow = window.open(launch_url, '_blank', 'width=1280,height=720');

if (!gameWindow) {
  // ⭐ 팝업 차단 시나리오: 세션 종료하지 않고 ready_status만 업데이트
  toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
  
  // ready_status를 'popup_blocked'로 업데이트 (세션은 유지)
  await supabase
    .from('game_launch_sessions')
    .update({ 
      ready_status: 'popup_blocked',
      last_activity_at: new Date().toISOString()
    })
    .eq('id', sessionId);
    
  console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료. 재클릭 시 기존 URL 재사용됩니다.');
  
} else {
  // ⭐ 팝업 오픈 성공: ready_status를 'popup_opened'로 업데이트
  toast.success('게임을 시작합니다.');
  
  await supabase
    .from('game_launch_sessions')
    .update({ 
      ready_status: 'popup_opened',
      last_activity_at: new Date().toISOString()
    })
    .eq('id', sessionId);
}

// ⭐ 2. 재클릭 시 기존 ready 세션 재사용 (중복 입금 방지)
const { data: activeSession } = await gameApi.checkActiveSession(user.id);

if (activeSession?.status === 'ready' && 
    activeSession.game_id === game.game_id && 
    activeSession.launch_url) {
  // 기존 launch_url 재사용 (중복 입금 없음)
  const gameWindow = window.open(activeSession.launch_url, '_blank');
  
  if (!gameWindow) {
    // 여전히 차단됨
    toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
  } else {
    // 오픈 성공
    toast.success('게임에 입장했습니다.');
  }
}
```

**핵심 포인트:**
- 팝업 차단 시 세션을 종료하지 않음 (기존 로직은 endGameSession() 호출)
- ready_status를 'popup_blocked'로 업데이트
- 재클릭 시 기존 URL 재사용으로 중복 입금 방지
- ready 타임아웃(10분)은 그대로 적용됨

---

### 2.3 게임 클릭 시 프론트엔드 처리
```typescript
// components/user/GameProviderSelector.tsx 수정

const handleGameClick = async (game: Game) => {
  try {
    // 1. 게임의 api_type 확인
    const apiType = game.api_type || 'invest';
    
    // 2. 활성 세션 체크
    const activeSession = await checkActiveSession(user.id);
    
    if (activeSession && activeSession.api_type !== apiType) {
      // 다른 API 게임 실행 중
      showModal({
        title: '게임 실행 불가',
        message: '현재 진행 중인 게임을 먼저 종료해주세요.',
        type: 'warning'
      });
      return;
    }
    
    // 3. 게임 실행
    const launchUrl = await launchGame(user.id, game.id, apiType);
    
    // 4. 팝업 열기
    const popup = window.open(
      launchUrl, 
      'game', 
      'width=1280,height=720'
    );
    
    // 5. 팝업 참조 저장 (강제 종료용)
    storePopupReference(popup, apiType);
    
    // 6. 팝업 종료 감지
    monitorPopupClose(popup, user.id, apiType);
    
  } catch (error) {
    handleError(error);
  }
};
```

### 2.4 API Credential 조회 주의사항

**중요 포인트:**

1. **모든 게임 실행은 Lv1의 API Credential을 사용**
   - Lv2~Lv6 파트너는 API Credential을 가지지 않음
   - Lv7 사용자는 자신의 referrer_id 체인을 따라 Lv1까지 올라가야 함

2. **잘못된 구현 예시 (❌)**
   ```typescript
   // 잘못됨: 사용자의 직속 referrer(Lv6)의 credential 사용
   const { data: apiConfig } = await supabase
     .from('api_configs')
     .eq('partner_id', user.referrer_id)  // ❌ Lv6는 credential 없음
     .single();
   ```

3. **올바른 구현 예시 (✅)**
   ```typescript
   // 올바름: referrer_id를 따라 Lv1까지 올라가서 credential 사용
   const topLevelPartnerId = await getTopLevelPartnerId(user.referrer_id);
   const { data: apiConfig } = await supabase
     .from('api_configs')
     .eq('partner_id', topLevelPartnerId)  // ✅ Lv1의 credential 사용
     .single();
   ```

4. **데이터베이스 구조**
   - `users.referrer_id`: 해당 사용자를 생성한 파트너(Lv6 매장)
   - `partners.parent_id`: 상위 파트너 ID
   - `partners.level`: 파트너 권한 레벨 (1~6)
   - `api_configs.partner_id`: Lv1 파트너만 보유

---

## 2.5 Optimistic Update 적용 (⭐ 신규)

### 게임 실행 Deposit - api_configs 먼저 차감
```typescript
// lib/gameApi.ts - launchInvestGame / launchOroPlayGame

// ✅ 1. api_configs balance 먼저 차감 (Optimistic Update)
const { data: currentConfig } = await supabase
  .from('api_configs')
  .select('invest_balance') // 또는 oroplay_balance
  .eq('partner_id', partnerId)
  .single();

const currentBalance = currentConfig.invest_balance || 0;

// 보유금 부족 체크
if (currentBalance < userBalance) {
  return { success: false, error: '관리자 보유금 부족' };
}

// DB 먼저 차감
await supabase
  .from('api_configs')
  .update({ 
    invest_balance: currentBalance - userBalance,
    updated_at: new Date().toISOString()
  })
  .eq('partner_id', partnerId);

// ✅ 2. 외부 API deposit 호출
const depositResult = await investApi.depositBalance(...);

// ✅ 3. 실패 시 롤백
if (!depositResult.success) {
  await supabase
    .from('api_configs')
    .update({ invest_balance: currentBalance })
    .eq('partner_id', partnerId);
}
```

### 게임 종료 Withdraw - api_configs, users 먼저 증감
```typescript
// lib/investApi.ts - withdrawBalance

// ✅ 1. partner_id 찾기
const { data: apiConfig } = await supabase
  .from('api_configs')
  .select('partner_id, invest_balance')
  .eq('invest_opcode', opcode)
  .single();

// ✅ 2. api_configs balance 먼저 증가
await supabase
  .from('api_configs')
  .update({ 
    invest_balance: previousBalance + amount,
    updated_at: new Date().toISOString()
  })
  .eq('partner_id', apiConfig.partner_id);

// ✅ 3. users balance 먼저 업데이트
await supabase
  .from('users')
  .update({ 
    balance: amount,
    updated_at: new Date().toISOString()
  })
  .eq('username', username);

// ✅ 4. 외부 API withdraw 호출
const result = await withdrawFromAccount(...);

// ✅ 5. 실패 시 롤백
if (result.error) {
  await supabase.from('api_configs').update({ invest_balance: previousBalance });
  await supabase.from('users').update({ balance: previousUserBalance });
}
```

**효과:**
- 관리자 보유금 중복 체크 안정화 (동기화 이슈 해결)
- DB 먼저 업데이트 → 외부 API 호출 → 실패 시 롤백
- 게임 실행/종료 시 DB와 외부 API 간 데이터 정합성 보장

---

## 3. 게임 팝업 관리

### 3.1 팝업 강제 종료 시스템
```typescript
// lib/popupManager.ts

let activePopup: Window | null = null;
let activeApiType: 'invest' | 'oroplay' | null = null;

export function storePopupReference(
  popup: Window, 
  apiType: 'invest' | 'oroplay'
) {
  activePopup = popup;
  activeApiType = apiType;
}

export function forceClosePopup() {
  if (activePopup && !activePopup.closed) {
    activePopup.close();
    console.log('팝업 강제 종료 완료');
  }
  activePopup = null;
  activeApiType = null;
}

export function monitorPopupClose(
  popup: Window,
  userId: string,
  apiType: 'invest' | 'oroplay'
) {
  const checkInterval = setInterval(async () => {
    if (popup.closed) {
      clearInterval(checkInterval);
      
      // 팝업 닫힘 → 즉시 세션 종료 + 잔고 동기화
      await handleGameEnd(userId, apiType);
      
      activePopup = null;
      activeApiType = null;
    }
  }, 1000);
}

async function handleGameEnd(
  userId: string, 
  apiType: 'invest' | 'oroplay'
) {
  try {
    // 1. 세션 종료
    await endGameSession(userId, apiType);
    
    // 2. 잔고 즉시 동기화
    if (apiType === 'invest') {
      await syncInvestBalance(userId);
    } else {
      await syncOroPlayBalance(userId);
    }
    
    // 3. WebSocket으로 실시간 업데이트
    websocket.send({
      type: 'BALANCE_UPDATE',
      userId,
      apiType
    });
    
  } catch (error) {
    console.error('게임 종료 처리 실패:', error);
  }
}
```

### 3.2 팝업 내부 beforeunload 처리
```typescript
// 팝업 창 내부에서 실행
window.addEventListener('beforeunload', () => {
  // 부모 창에 메시지 전송
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(
      { 
        type: 'GAME_CLOSE',
        userId: currentUserId,
        apiType: currentApiType
      },
      '*'
    );
  }
});
```

---

## 4. 잔고 동기화 시스템

### 4.1 OroPlay API 잔고 동기화
```typescript
// lib/oroplayApi.ts

export async function syncOroPlayBalance(userId: string) {
  try {
    // 1. 사용자 정보 조회
    const { data: user } = await supabase
      .from('users')
      .select('username, referrer_id')
      .eq('id', userId)
      .single();
    
    // 2. API Config 조회
    const { data: config } = await supabase
      .from('api_configs')
      .select('oroplay_secret, oroplay_token')
      .eq('partner_id', user.referrer_id)
      .single();
    
    // 3. OroPlay API 호출 (잔고 조회)
    const response = await fetch('https://vi8282.com/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://oroplay.api/balance',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.oroplay_token}`
        },
        body: {
          username: user.username
        }
      })
    });
    
    const result = await response.json();
    
    if (result.status === 1) {
      // 4. 사용자 잔고 업데이트
      await supabase
        .from('users')
        .update({ balance: result.balance })
        .eq('id', userId);
      
      // 5. WebSocket 전파
      websocket.send({
        type: 'BALANCE_SYNCED',
        userId,
        balance: result.balance,
        apiType: 'oroplay'
      });
    }
    
  } catch (error) {
    console.error('OroPlay 잔고 동기화 실패:', error);
  }
}
```

### 4.2 베팅 기록 동기화 (⭐ 업데이트)
```typescript
// BalanceSyncManager.tsx (Lv1 전용, 30초 주기)
// 1. GET /api/info: Lv1 자신의 보유금 동기화
// 2. PATCH /api/account/balance: 모든 사용자 보유금 일괄 조회 및 동기화
// 3. GET /api/account/balance: 온라인 사용자 개별 조회 (10초 지연 후 30초 주기)

// BettingHistorySync.tsx (Lv1, Lv2 전용)
// ❌ 30초 자동 타이머 제거 (성능 최적화)
// ✅ 베팅 내역은 새로고침 버튼으로만 수동 호출
// ✅ 세션 자동 종료는 30초마다 체크 (240초 무활동 기준)

// BettingHistory.tsx (새로고침 버튼)
// ✅ 사용자가 수동으로 클릭 시 forceSyncBettingHistory() 호출
// ✅ Invest API historyindex: 배팅 기록 동기화 + 사용자 보유금 실시간 동기화
// ✅ OroPlay API by-date-v2: 배팅 기록 동기화 (limit 4000)

export function BettingHistorySync({ user }: { user: Partner }) {
  useEffect(() => {
    // 세션 자동 종료만 30초마다 실행
    const interval = setInterval(() => {
      checkAndEndInactiveSessions(user.id);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [user.level]);
  
  return null;
}
```

**변경 이유:**
- 30초 자동 API 호출은 불필요한 부하 발생
- 베팅 내역 테이블의 새로고침 버튼으로 충분
- 실시간 업데이트는 Realtime Subscription으로 처리
- 테이블 깜박임 없이 Optimistic Update 적용

### 4.3 관리자 화면 - 양쪽 API 잔고 구분 표시
```typescript
// components/admin/Dashboard.tsx

interface ApiBalances {
  invest: number;
  oroplay: number;
  total: number;
}

export function Dashboard() {
  const [apiBalances, setApiBalances] = useState<ApiBalances>({
    invest: 0,
    oroplay: 0,
    total: 0
  });
  
  useEffect(() => {
    const fetchApiBalances = async () => {
      const { data: config } = await supabase
        .from('api_configs')
        .select('invest_balance, oroplay_balance')
        .eq('partner_id', currentPartnerId)
        .single();
      
      setApiBalances({
        invest: config.invest_balance || 0,
        oroplay: config.oroplay_balance || 0,
        total: (config.invest_balance || 0) + (config.oroplay_balance || 0)
      });
    };
    
    // 초기 로드
    fetchApiBalances();
    
    // 30초마다 갱신
    const interval = setInterval(fetchApiBalances, 30000);
    
    return () => clearInterval(interval);
  }, [currentPartnerId]);
  
  return (
    <div className="grid grid-cols-3 gap-4">
      <AdminCard title="Invest API 잔고">
        {apiBalances.invest.toLocaleString()}원
      </AdminCard>
      <AdminCard title="OroPlay API 잔고">
        {apiBalances.oroplay.balance.toLocaleString()}원
      </AdminCard>
      <AdminCard title="통합 잔고">
        {apiBalances.total.toLocaleString()}원
      </AdminCard>
    </div>
  );
}
```

---

## 5. 게임 기록 동기화

### 5.1 배팅 기록 동기화 (✅ 구현 완료)

**Invest API (BettingHistorySync.tsx):**
```typescript
// GET /api/game/historyindex (30초 주기, Lv2 전용)
// - Lv2가 api_configs credentials 사용
// - 배팅 기록 저장 후 모든 username 보유금 실시간 동기화
// - GET /api/account/balance로 각 사용자 보유금 조회 후 DB 업데이트

export async function processSingleOpcode(opcode, secretKey, partnerId, year, month) {
  // 1. 배팅 기록 조회 (limit 4000)
  const result = await getGameHistory(opcode, year, month, lastIndex, 4000, secretKey);
  
  // 2. game_records에 저장
  // ...
  
  // 3. ✅ 배팅 기록에 등장한 모든 username의 보유금 동기화
  const uniqueUsernames = [...new Set(records.map(r => r.username))];
  
  for (const username of uniqueUsernames) {
    const balanceResult = await getUserBalanceWithConfig(opcode, username, token, secretKey);
    await supabase.from('users').update({ balance: balanceResult.balance }).eq('username', username);
  }
}
```

**OroPlay API (BettingHistorySync.tsx):**
```typescript
// POST /betting/history/by-date-v2 (30초 주기, Lv2 전용, limit 4000)
export async function syncOroPlayBettingHistory(
  partnerId: string,
  startDate: string,
  endDate: string
) {
  try {
    // 1. API Config 조회
    const { data: config } = await supabase
      .from('api_configs')
      .select('oroplay_secret, oroplay_token')
      .eq('partner_id', partnerId)
      .single();
    
    // 2. OroPlay API 호출 (V2 by-date, limit 4000)
    const result = await oroplayApi.getBettingHistory(token, startDate, 4000);
    
    // 3. status=1인 기록만 저장
    const completedBets = result.histories.filter((bet: any) => bet.status === 1);
    
    for (const bet of completedBets) {
      // 4. 매핑 후 game_records에 저장
      await supabase.from('game_records').insert({
        api_type: 'oroplay',
        txid: bet.transaction_id,
        user_id: bet.user_id,
        game_id: bet.game_id,
        bet_amount: bet.bet,
        win_amount: bet.win,
        balance_before: bet.balance_before,
        balance_after: bet.balance_after,
        created_at: bet.bet_time
      });
    }
    
  } catch (error) {
    console.error('OroPlay 배팅 기록 동기화 실패:', error);
  }
}
```

### 5.2 Rate Limiting 구현
```typescript
// lib/rateLimiter.ts

class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private lastCall: number = 0;
  private minInterval: number;
  
  constructor(callsPerSecond: number) {
    this.minInterval = 1000 / callsPerSecond;
  }
  
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      
      this.process();
    });
  }
  
  private async process() {
    if (this.queue.length === 0) return;
    
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    
    if (timeSinceLastCall < this.minInterval) {
      setTimeout(() => this.process(), this.minInterval - timeSinceLastCall);
      return;
    }
    
    const fn = this.queue.shift();
    if (fn) {
      this.lastCall = Date.now();
      await fn();
      this.process();
    }
  }
}

// 사용 예시
const oroplayLimiter = new RateLimiter(1); // 1초당 1회

export async function callOroPlayApi(endpoint: string, body: any) {
  return await oroplayLimiter.enqueue(async () => {
    return await fetch('https://vi8282.com/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://oroplay.api${endpoint}`,
        ...body
      })
    });
  });
}
```

---

## 6. 게임 목록 관리

### 6.1 OroPlay 게임 동기화 버튼
```typescript
// components/admin/EnhancedGameManagement.tsx

export function EnhancedGameManagement() {
  const [syncing, setSyncing] = useState(false);
  
  const syncOroPlayGames = async () => {
    setSyncing(true);
    
    try {
      // 1. OroPlay API에서 게임 목록 가져오기
      const response = await fetch('https://vi8282.com/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://oroplay.api/games',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${oroplayToken}`
          }
        })
      });
      
      const result = await response.json();
      
      // 2. games 테이블에 저장 (api_type='oroplay')
      for (const game of result.data) {
        await supabase.from('games').upsert({
          game_id: game.id,
          game_title: game.name,
          provider_name: game.provider,
          vendor_code: game.vendorCode,
          game_type: game.type, // 'casino' | 'slot' | 'minigame'
          api_type: 'oroplay',
          partner_id: currentPartnerId,
          is_active: true
        }, {
          onConflict: 'game_id,api_type'
        });
      }
      
      toast.success('OroPlay 게임 동기화 완료');
      
    } catch (error) {
      toast.error('게임 동기화 실패');
    } finally {
      setSyncing(false);
    }
  };
  
  return (
    <div>
      <button 
        onClick={syncOroPlayGames}
        disabled={syncing}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        {syncing ? '동기화 중...' : 'OroPlay 게임 동기화'}
      </button>
    </div>
  );
}
```

### 6.2 관리자 게임 리스트 - API 구분 표시
```typescript
// components/admin/EnhancedGameManagement.tsx

// Invest는 카지노/슬롯만, OroPlay는 카지노/슬롯/미니게임 지원
type GameTab = 
  | 'invest_casino' 
  | 'invest_slot' 
  | 'oroplay_casino' 
  | 'oroplay_slot'
  | 'oroplay_minigame';

export function EnhancedGameManagement() {
  const [activeTab, setActiveTab] = useState<GameTab>('invest_casino');
  
  const fetchGames = async () => {
    const [apiType, gameType] = activeTab.split('_');
    
    const { data } = await supabase
      .from('games')
      .select('*')
      .eq('api_type', apiType)
      .eq('game_type', gameType)
      .eq('partner_id', currentPartnerId);
    
    setGames(data || []);
  };
  
  return (
    <div>
      <div className="flex gap-4 mb-6">
        {/* Invest API - 카지노/슬롯만 */}
        <button 
          onClick={() => setActiveTab('invest_casino')}
          className={activeTab === 'invest_casino' ? 'active' : ''}
        >
          Invest 카지노
        </button>
        <button 
          onClick={() => setActiveTab('invest_slot')}
          className={activeTab === 'invest_slot' ? 'active' : ''}
        >
          Invest 슬롯
        </button>
        
        {/* OroPlay API - 카지노/슬롯/미니게임 */}
        <button 
          onClick={() => setActiveTab('oroplay_casino')}
          className={activeTab === 'oroplay_casino' ? 'active' : ''}
        >
          OroPlay 카지노
        </button>
        <button 
          onClick={() => setActiveTab('oroplay_slot')}
          className={activeTab === 'oroplay_slot' ? 'active' : ''}
        >
          OroPlay 슬롯
        </button>
        <button 
          onClick={() => setActiveTab('oroplay_minigame')}
          className={activeTab === 'oroplay_minigame' ? 'active' : ''}
        >
          OroPlay 미니게임
        </button>
      </div>
      
      <GameList games={games} />
    </div>
  );
}
```

### 6.3 사용자 페이지 - API 구분 없이 표시
```typescript
// components/user/UserCasino.tsx
// components/user/UserSlot.tsx
// components/user/UserMiniGame.tsx (NEW)

export function UserCasino() {
  const [games, setGames] = useState<Game[]>([]);
  
  useEffect(() => {
    const fetchGames = async () => {
      // API 구분 없이 모든 카지노 게임 조회
      const { data } = await supabase
        .from('games')
        .select('*')
        .eq('game_type', 'casino')
        .eq('is_active', true)
        .order('provider_name', { ascending: true });
      
      setGames(data || []);
    };
    
    fetchGames();
  }, []);
  
  return (
    <div>
      {/* 카지노 게임 아이콘 표시 (Invest + OroPlay 섞임) */}
      {games.map(game => (
        <GameIcon 
          key={`${game.api_type}_${game.game_id}`}
          game={game}
          onClick={() => handleGameClick(game)}
        />
      ))}
    </div>
  );
}

export function UserSlot() {
  const [groupedGames, setGroupedGames] = useState<Record<string, Game[]>>({});
  
  useEffect(() => {
    const fetchGames = async () => {
      // API 구분 없이 모든 슬롯 게임 조회
      const { data } = await supabase
        .from('games')
        .select('*')
        .eq('game_type', 'slot')
        .eq('is_active', true);
      
      // 제공사별로 그룹핑 (Invest + OroPlay 섞임)
      const grouped = (data || []).reduce((acc, game) => {
        const provider = game.provider_name;
        if (!acc[provider]) acc[provider] = [];
        acc[provider].push(game);
        return acc;
      }, {} as Record<string, Game[]>);
      
      setGroupedGames(grouped);
    };
    
    fetchGames();
  }, []);
  
  return (
    <div>
      {Object.entries(groupedGames).map(([provider, games]) => (
        <div key={provider}>
          <h3>{provider}</h3>
          <div className="grid grid-cols-4 gap-4">
            {games.map(game => (
              <GameIcon 
                key={`${game.api_type}_${game.game_id}`}
                game={game}
                onClick={() => handleGameClick(game)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function UserMiniGame() {
  const [games, setGames] = useState<Game[]>([]);
  
  useEffect(() => {
    const fetchGames = async () => {
      // 미니게임은 OroPlay API만 지원 (Invest는 미니게임 없음)
      const { data } = await supabase
        .from('games')
        .select('*')
        .eq('game_type', 'minigame')
        .eq('api_type', 'oroplay') // OroPlay만
        .eq('is_active', true)
        .order('game_title', { ascending: true });
      
      setGames(data || []);
    };
    
    fetchGames();
  }, []);
  
  return (
    <div>
      <h2>미니게임</h2>
      <div className="grid grid-cols-4 gap-4">
        {/* OroPlay 미니게임만 표시 */}
        {games.map(game => (
          <GameIcon 
            key={`${game.api_type}_${game.game_id}`}
            game={game}
            onClick={() => handleGameClick(game)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 7. WebSocket 실시간 업데이트

### 7.1 양쪽 API 잔고 실시간 전파
```typescript
// contexts/WebSocketContext.tsx

export function WebSocketProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!ws) return;
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'INVEST_BALANCE_UPDATE':
          // Invest API 잔고 업데이트
          updateInvestBalance(data.balance);
          break;
          
        case 'OROPLAY_BALANCE_UPDATE':
          // OroPlay API 잔고 업데이트
          updateOroPlayBalance(data.balance);
          break;
          
        case 'USER_BALANCE_UPDATE':
          // 사용자 통합 잔고 업데이트
          updateUserBalance(data.userId, data.balance);
          break;
      }
    };
  }, [ws]);
  
  return (
    <WebSocketContext.Provider value={{ ws, send }}>
      {children}
    </WebSocketContext.Provider>
  );
}
```

---

## 8. 구현 체크리스트

### Phase 1: 데이터베이스 구조
- [x] api_configs 테이블에 OroPlay 필드 추가
- [x] games 테이블에 api_type, vendor_code 추가
- [x] game_records 복합 유니크 인덱스 생성
- [x] game_sessions에 api_type 추가

### Phase 2: API 통합
- [x] OroPlay API 연동 라이브러리 작성 (lib/oroplayApi.ts)
- [x] 토큰 자동 갱신 시스템 구현
- [x] Rate Limiter 구현
- [x] Proxy 서버 경유 설정

### Phase 3: 게임 실행
- [x] 활성 세션 체크 로직
- [x] API 타입별 게임 실행 분기
- [x] 다른 API 게임 중 모달 표시
- [x] 팝업 강제 종료 시스템

### Phase 4: 잔고 관리
- [x] OroPlay 잔고 동기화 함수
- [x] 30초 주기 양쪽 API 동기화
- [x] 팝업 종료 시 즉시 동기화
- [x] 관리자 화면 API별 잔고 구분 표시 (Lv0-1만)

### Phase 5: 게임 기록
- [x] OroPlay 배팅 기록 동기화
- [x] status=1 필터링
- [x] 트랜잭션 ID 중복 방지
- [x] 관리자 기록 조회 API 구분

### Phase 6: 게임 목록
- [x] OroPlay 게임 동기화 버튼
- [x] 관리자 게임 리스트 API 구분 (5개 탭: Invest 2개 + OroPlay 3개)
  - [x] Invest: 카지노/슬롯 (미니게임 없음)
  - [x] OroPlay: 카지노/슬롯/미니게임
- [x] 사용자 페이지 통합 표시 (카지노/슬롯은 섞임, 미니게임은 OroPlay만)
- [x] 사용자 페이지에 UserMiniGame.tsx 컴포넌트 추가
- [x] vendor_code 매핑

### Phase 7: 실시간 업데이트
- [x] WebSocket 이벤트 타입 추가
- [x] 양쪽 API 잔고 실시간 전파
- [x] 세션 상태 실시간 업데이트

---

## 9. API 활성화/비활성화 설정

### 9.1 개요
- **Lv1 시스템관리자 전용** 설정
- Invest API와 OroPlay API의 사용 여부 선택 가능
- 비활성화된 API의 보유금은 입금 제한 계산에서 제외

### 9.2 입금/출금 로직 (중요!)
```typescript
// ⚠️ Lv1, Lv2 → Lv7 입금: API 보유금 차감 없음 (게임 플레이 시에만 차감)
if (currentUserLevel === 1 || currentUserLevel === 2) {
  // 입금 제한만 체크 (가장 작은 보유금 기준)
  const minBalance = Math.min(
    currentUserInvestBalance, 
    currentUserOroplayBalance
  );
  
  // 입금 시 API 보유금 변동 없음
  // 게임 플레이 시점에 실제 사용된 API에서만 차감
}

// Lv3~6 → Lv7 입금: 즉시 balance 차감
else {
  // 입금 즉시 관리자 balance 차감
  adminNewBalance = adminPartner.balance - amount;
}

// 출금: 대상자의 전체 balance만 체크
if (type === 'withdrawal') {
  // API 구분 없이 전체 balance 체크
}

// 게임 플레이 시: 실제 API 차감 (Lv1, Lv2만 해당)
// - Invest 게임 → Lv1/Lv2 Invest 보유금 차감
// - OroPlay 게임 → Lv1/Lv2 OroPlay 보유금 차감
```

### 9.3 관리자 보유금 표시
- **Lv1**: 두 API 보유금 + 입금 가능 (최소값)
- **Lv2**: 두 API 보유금 + 입금 가능 (최소값)
- **Lv3~7**: 단일 balance만 표시

### 9.4 데이터베이스
```sql
ALTER TABLE api_configs 
ADD COLUMN use_invest_api BOOLEAN DEFAULT true,
ADD COLUMN use_oroplay_api BOOLEAN DEFAULT true;
```

### 9.5 상세 문서
- `/guidelines/api_enable_settings.md` - 전체 가이드 참조

---

## 10. 주요 정책 요약

| 항목 | 정책 |
|------|------|
| **토큰 관리** | 5분 전 만료 자동 갱신 |
| **Rate Limit** | 1초당 1회 (큐 대기) |
| **게임 중 전환** | 모달 표시 + 차단 |
| **팝업 종료** | 즉시 세션 종료 + 잔고 동기화 |
| **잔고 동기화** | 30초 주기 (양쪽 API) |
| **트랜잭션 ID** | api_type + txid 복합키 |
| **게임 기록** | status=1만 저장 |
| **vendor_code** | 항상 전송 (분리/통합 무관) |
| **사용자 화면** | 카지노/슬롯은 API 구분 없이 섞임, 미니게임은 OroPlay만 (3개 탭) |
| **관리자 화면** | API별 구분 (5개 탭: Invest 2개 + OroPlay 3개) |
| **게임 타입** | Invest: casino/slot, OroPlay: casino/slot/minigame |
| **API 지원** | Invest는 미니게임 미지원 |
| **API 활성화** | Lv1만 설정 가능, 비활성화 시 보유금 제외 |
| **입금 제한** | Lv1/Lv2: API 최소값 기준 (차감 없음), Lv3~6: balance 즉시 차감 |
| **출금 제한** | 대상자 balance만 체크 |
| **API 차감** | Lv1/Lv2는 게임 플레이 시점에만 차감 (지연 차감) |

---

## 10. 에러 처리

### 10.1 주요 에러 코드
```typescript
enum OroPlayError {
  DIFFERENT_API_ACTIVE = 'DIFFERENT_API_ACTIVE', // 다른 API 게임 중
  TOKEN_EXPIRED = 'TOKEN_EXPIRED', // 토큰 만료
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED', // Rate Limit 초과
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE', // 잔고 부족
  GAME_NOT_FOUND = 'GAME_NOT_FOUND' // 게임 없음
}

export function handleOroPlayError(error: OroPlayError) {
  switch (error) {
    case OroPlayError.DIFFERENT_API_ACTIVE:
      toast.error('현재 진행 중인 게임을 먼저 종료해주세요.');
      break;
    case OroPlayError.TOKEN_EXPIRED:
      // 자동 토큰 갱신
      refreshOroPlayToken();
      break;
    case OroPlayError.RATE_LIMIT_EXCEEDED:
      toast.warning('잠시 후 다시 시도해주세요.');
      break;
    default:
      toast.error('오류가 발생했습니다.');
  }
}
```

---

## 11. 성능 최적화

### 11.1 메모리 최적화
- 컴포넌트 재사용 극대화
- API 응답 직접 파싱 (JOSB 사용 금지)
- Realtime Subscription 최소화

### 11.2 네트워크 최적화
- Rate Limiter로 API 호출 제어
- 30초 주기 일괄 동기화
- WebSocket으로 실시간 전파

---

## 12. 사용자 페이지 네비게이션 구조

### 12.1 사용자 페이지 탭 구성
```typescript
// components/user/UserLayout.tsx

export function UserLayout() {
  return (
    <div>
      <UserHeader />
      <nav className="game-tabs">
        <NavLink to="/user/casino">카지노</NavLink>
        <NavLink to="/user/slot">슬롯</NavLink>
        <NavLink to="/user/minigame">미니게임</NavLink> {/* NEW */}
        <NavLink to="/user/deposit">입금</NavLink>
        <NavLink to="/user/withdraw">출금</NavLink>
        <NavLink to="/user/history">배팅내역</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
```

### 12.2 라우팅 설정
```typescript
// App.tsx

const userRoutes = [
  { path: '/user/casino', element: <UserCasino /> },
  { path: '/user/slot', element: <UserSlot /> },
  { path: '/user/minigame', element: <UserMiniGame /> }, // NEW
  { path: '/user/deposit', element: <UserDeposit /> },
  { path: '/user/withdraw', element: <UserWithdraw /> },
  { path: '/user/history', element: <UserBettingHistory /> },
];
```

### 12.3 미니게임 특징
- **제공 API**: OroPlay API만 (Invest는 미니게임 미지원)
- **표시 방식**: 그리드 레이아웃 (4열)
- **게임 타입**: type=3 (OroPlay API)
- **게임 실행**: 다른 게임과 동일한 팝업 방식

---

## 13. 콜주기 페이지 - OroPlay API 전용 RTP 관리

### 13.1 개요
- **관리자 사이드메뉴에 "콜주기" 페이지 추가**
- **목적**: OroPlay API 슬롯 게임의 RTP(Return To Player) 설정 관리
- **중요**: Invest API와는 완전히 무관한 기능
- **권한**: 시스템관리자, 대본사만 접근 가능
- **위치**: `/admin/call-cycle`
- **API 기능**:
  - **Set User RTP**: 개별 RTP 설정
  - **Get User RTP**: 개별 RTP 확인
  - **Reset User RTP**: 일괄 RTP 설정 (최대 500명)

### 13.2 데이터베이스 스키마 (선택사항)
```sql
-- RTP 설정 기록 테이블 (로그용)
CREATE TABLE IF NOT EXISTS rtp_settings (
  id BIGSERIAL PRIMARY KEY,
  partner_id UUID REFERENCES partners(id),
  vendor_code TEXT NOT NULL, -- OroPlay 게임사 코드
  user_id UUID REFERENCES users(id), -- NULL이면 전체 설정
  setting_type TEXT NOT NULL DEFAULT 'rtp', -- 'rtp' 고정
  rtp_value INTEGER NOT NULL, -- 30 ~ 99
  applied_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rtp_settings_vendor ON rtp_settings(vendor_code);
CREATE INDEX idx_rtp_settings_user_id ON rtp_settings(user_id);
CREATE INDEX idx_rtp_settings_partner_id ON rtp_settings(partner_id);
```

### 13.3 CallCycle.tsx 완전 재구성
```typescript
// components/admin/CallCycle.tsx

interface CallCycleProps {
  user: Partner;
}

export function CallCycle({ user }: CallCycleProps) {
  const [actionMode, setActionMode] = useState<'set' | 'get' | 'reset'>('set');
  const [vendorCode, setVendorCode] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [rtpValue, setRtpValue] = useState(85);
  const [loading, setLoading] = useState(false);
  const [settingHistory, setSettingHistory] = useState<RTPSetting[]>([]);
  const [rtpResults, setRtpResults] = useState<Array<{ username: string; rtp: number }>>([]);
  
  // OroPlay 토큰 가져오기
  const getOroPlayToken = async (): Promise<string> => {
    const { data } = await supabase
      .from('api_configs')
      .select('oroplay_token')
      .eq('partner_id', user.id)
      .single();
    
    return data?.oroplay_token || '';
  };
  
  // Set User RTP - 개별 RTP 설정
  const setUserRTP = async () => {
    setLoading(true);
    try {
      const token = await getOroPlayToken();
      
      for (const username of selectedUsers) {
        const response = await fetch('https://vi8282.com/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'https://bs.sxvwlkohlv.com/api/v2/game/user/set-rtp',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: {
              vendorCode,
              userCode: username,
              rtp: rtpValue
            }
          })
        });
        
        const result = await response.json();
        
        if (result.errorCode === 0) {
          // 로그 저장
          const { data: userRecord } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();
          
          await supabase.from('rtp_settings').insert({
            partner_id: user.id,
            vendor_code: vendorCode,
            user_id: userRecord?.id,
            setting_type: 'set',
            rtp_value: rtpValue,
            applied_by: user.id
          });
        }
      }
      
      toast.success('RTP 설정이 완료되었습니다.');
      fetchSettingHistory();
      
    } catch (error) {
      toast.error('RTP 설정 실패');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  
  // Get User RTP - 개별 RTP 확인
  const getUserRTP = async () => {
    setLoading(true);
    setRtpResults([]);
    
    try {
      const token = await getOroPlayToken();
      const results: Array<{ username: string; rtp: number }> = [];
      
      for (const username of selectedUsers) {
        const response = await fetch('https://vi8282.com/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'https://bs.sxvwlkohlv.com/api/v2/game/user/get-rtp',
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: {
              vendorCode,
              userCode: username
            }
          })
        });
        
        const result = await response.json();
        
        if (result.errorCode === 0 && result.data) {
          results.push({
            username,
            rtp: result.data.rtp
          });
        }
      }
      
      setRtpResults(results);
      toast.success('RTP 조회 완료');
      
    } catch (error) {
      toast.error('RTP 조회 실패');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  
  // Reset User RTP - 일괄 RTP 설정 (최대 500명)
  const resetUserRTP = async () => {
    if (selectedUsers.length > 500) {
      toast.error('최대 500명까지 선택 가능합니다.');
      return;
    }
    
    setLoading(true);
    try {
      const token = await getOroPlayToken();
      
      const data = selectedUsers.map(username => ({
        userCode: username,
        rtp: rtpValue
      }));
      
      const response = await fetch('https://vi8282.com/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://bs.sxvwlkohlv.com/api/v2/game/users/reset-rtp',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: {
            vendorCode,
            data
          }
        })
      });
      
      const result = await response.json();
      
      if (result.errorCode === 0) {
        toast.success(`${selectedUsers.length}명의 RTP가 일괄 설정되었습니다.`);
        
        // 로그 저장
        await supabase.from('rtp_settings').insert({
          partner_id: user.id,
          vendor_code: vendorCode,
          user_id: null,
          setting_type: 'reset',
          rtp_value: rtpValue,
          applied_by: user.id
        });
        
        fetchSettingHistory();
      }
    } catch (error) {
      toast.error('일괄 RTP 설정 실패');
    } finally {
      setLoading(false);
    }
  };
  
  // 설정 이력 조회
  const fetchSettingHistory = async () => {
    const { data } = await supabase
      .from('rtp_settings')
      .select('*, applied_by:partners!rtp_settings_applied_by_fkey(username)')
      .eq('partner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    setSettingHistory(data || []);
  };
  
  useEffect(() => {
    fetchSettingHistory();
  }, []);
  
  return (
    <DarkPageLayout>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div>
          <h1 className="text-2xl mb-2">콜주기 관리</h1>
          <p className="text-sm text-gray-400">
            OroPlay API 슬롯 게임의 RTP(Return To Player) 설정을 관리합니다.
          </p>
        </div>
        
        {/* 게임사 선택 */}
        <UnifiedCard title="게임 공급사 선택">
          <div className="space-y-2">
            <Label>Vendor Code</Label>
            <Select value={vendorCode} onValueChange={setVendorCode}>
              <SelectTrigger>
                <SelectValue placeholder="게임사 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slot-pragmatic">Pragmatic Play Slot</SelectItem>
                <SelectItem value="slot-pgsoft">PG Soft</SelectItem>
                <SelectItem value="slot-netent">NetEnt</SelectItem>
                <SelectItem value="slot-redtiger">Red Tiger</SelectItem>
                <SelectItem value="slot-playson">Playson</SelectItem>
                <SelectItem value="slot-nolimit">NoLimit City</SelectItem>
                <SelectItem value="slot-relax">Relax Gaming</SelectItem>
                {/* 추가 슬롯 게임사 */}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              RTP 설정을 적용할 슬롯 게임 공급사를 선택하세요.
            </p>
          </div>
        </UnifiedCard>
        
        {/* 작업 선택 */}
        <UnifiedCard title="작업 선택">
          <div className="space-y-4">
            <div className="flex gap-4">
              <Button
                variant={actionMode === 'set' ? 'default' : 'outline'}
                onClick={() => setActionMode('set')}
              >
                Set User RTP (개별 설정)
              </Button>
              <Button
                variant={actionMode === 'get' ? 'default' : 'outline'}
                onClick={() => setActionMode('get')}
              >
                Get User RTP (개별 확인)
              </Button>
              <Button
                variant={actionMode === 'reset' ? 'default' : 'outline'}
                onClick={() => setActionMode('reset')}
              >
                Reset User RTP (일괄 설정)
              </Button>
            </div>
            
            {/* 사용자 선택 */}
            <div className="space-y-2">
              <Label>대상 사용자</Label>
              <UserMultiSelect
                value={selectedUsers}
                onChange={setSelectedUsers}
                maxUsers={actionMode === 'reset' ? 500 : undefined}
              />
              <p className="text-xs text-gray-500">
                {actionMode === 'reset' 
                  ? '최대 500명까지 선택 가능합니다.' 
                  : actionMode === 'get'
                  ? 'RTP를 조회할 사용자를 선택하세요.'
                  : '개별 설정할 사용자를 선택하세요.'}
              </p>
            </div>
            
            {/* RTP 값 입력 (get 모드에서는 숨김) */}
            {actionMode !== 'get' && (
              <div className="space-y-2">
                <Label>RTP 값 (30 ~ 99)</Label>
                <Input
                  type="number"
                  value={rtpValue}
                  onChange={(e) => setRtpValue(parseInt(e.target.value))}
                  min={30}
                  max={99}
                />
                <p className="text-xs text-gray-500">
                  높을수록 플레이어에게 유리합니다. (기본값: 85)
                </p>
              </div>
            )}
            
            {/* 적용 버튼 */}
            <Button
              onClick={() => {
                if (actionMode === 'set') {
                  setUserRTP();
                } else if (actionMode === 'get') {
                  getUserRTP();
                } else {
                  resetUserRTP();
                }
              }}
              disabled={
                loading ||
                !vendorCode ||
                selectedUsers.length === 0
              }
              className="w-full"
            >
              {loading ? '처리 중...' : 
                actionMode === 'set' ? 'RTP 설정' :
                actionMode === 'get' ? 'RTP 조회' :
                '일괄 RTP 설정'}
            </Button>
          </div>
        </UnifiedCard>
        
        {/* RTP 조회 결과 */}
        {actionMode === 'get' && rtpResults.length > 0 && (
          <UnifiedCard title="RTP 조회 결과">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2">사용자</th>
                    <th className="text-left py-2">현재 RTP</th>
                  </tr>
                </thead>
                <tbody>
                  {rtpResults.map((result) => (
                    <tr key={result.username} className="border-b border-gray-800">
                      <td className="py-2">{result.username}</td>
                      <td>{result.rtp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </UnifiedCard>
        )}
        
        {/* 주의사항 */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>주의사항:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>이 기능은 OroPlay API 슬롯 게임에만 적용됩니다.</li>
              <li>Set User RTP: 개별 사용자의 RTP를 설정합니다.</li>
              <li>Get User RTP: 개별 사용자의 현재 RTP를 확인합니다.</li>
              <li>Reset User RTP: 최대 500명의 RTP를 일괄 설정합니다.</li>
              <li>Invest API와는 무관한 기능입니다.</li>
            </ul>
          </AlertDescription>
        </Alert>
        
        {/* 설정 이력 */}
        <UnifiedCard title="최근 설정 이력">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2">시간</th>
                  <th className="text-left py-2">게임사</th>
                  <th className="text-left py-2">설정 방식</th>
                  <th className="text-left py-2">RTP</th>
                  <th className="text-left py-2">적용자</th>
                </tr>
              </thead>
              <tbody>
                {settingHistory.map((record) => (
                  <tr key={record.id} className="border-b border-gray-800">
                    <td className="py-2">
                      {new Date(record.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td>{record.vendor_code}</td>
                    <td>
                      {record.setting_type === 'set' ? '개별 설정' : 
                       record.setting_type === 'reset' ? '일괄 설정' : 
                       record.setting_type}
                    </td>
                    <td>{record.rtp_value}</td>
                    <td>{record.applied_by?.username || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </UnifiedCard>
      </div>
    </DarkPageLayout>
  );
}
```

### 13.4 사이드메뉴 추가
```typescript
// components/admin/AdminSidebar.tsx 수정

const menuItems = [
  // ... 기존 메뉴들 ...
  { 
    path: '/admin/call-cycle', 
    label: '콜주기', 
    icon: Settings,
    requiredLevels: [0, 1] // 시스템관리자, 대본사만
  },
  // ... 나머지 메뉴들 ...
];
```

### 13.5 라우팅 추가
```typescript
// App.tsx 또는 AdminRoutes.tsx

const adminRoutes = [
  // ... 기존 라우트들 ...
  { 
    path: '/admin/call-cycle', 
    element: <CallCycle user={currentUser} /> 
  },
  // ... 나머지 라우트들 ...
];
```

### 13.6 주요 정책

| 항목 | 설명 |
|------|------|
| **API** | OroPlay API 전용 (Invest API 무관) |
| **대상 게임** | 슬롯 게임만 (카지노 미지원) |
| **설정 항목** | RTP (Return To Player) |
| **RTP 범위** | 30 ~ 99 |
| **작업 방식** | Set (개별 설정) / Get (개별 확인) / Reset (일괄 설정, 최대 500명) |
| **Rate Limit** | 없음 (API 자체 제한) |
| **필수 파라미터** | vendorCode (게임사 코드) |
| **권한** | 시스템관리자, 대본사만 |
| **로깅** | rtp_settings 테이블에 Set/Reset 기록 |

### 13.7 구현 체크리스트

#### Phase 1: 데이터베이스
- [ ] rtp_settings 테이블 생성
- [ ] 인덱스 생성 (vendor_code, user_id, partner_id)

#### Phase 2: CallCycle.tsx 재구성
- [ ] 기존 내용 완전히 교체
- [ ] OroPlay API RTP 관리 UI 구현
- [ ] 게임사 선택 드롭다운
- [ ] 작업 방식 선택 (Set/Get/Reset)
- [ ] 사용자 멀티 셀렉트 컴포넌트
- [ ] RTP 값 입력 필드 (Get 모드에서는 숨김)
- [ ] RTP 조회 결과 테이블

#### Phase 3: OroPlay API 연동
- [ ] Set User RTP: 개별 RTP 설정 (POST /game/user/set-rtp)
- [ ] Get User RTP: 개별 RTP 확인 (GET /game/user/get-rtp)
- [ ] Reset User RTP: 일괄 RTP 설정 (POST /game/users/reset-rtp, 최대 500명)

#### Phase 4: UI/UX
- [ ] DarkPageLayout 적용
- [ ] UnifiedCard 컴포넌트 사용
- [ ] 로딩 상태 표시
- [ ] 에러 처리 및 토스트 알림
- [ ] 검증 로직 (vendorCode, 사용자 선택, RTP 범위)

#### Phase 5: 로깅 및 이력
- [ ] rtp_settings 테이블에 설정 기록
- [ ] 설정 이력 조회 UI
- [ ] 적용자 정보 표시

#### Phase 6: 메뉴 통합
- [ ] AdminSidebar에 "콜주기" 메뉴 추가
- [ ] 라우팅 설정
- [ ] 권한 체크 (시스템관리자, 대본사만)

---

## 14. 세션 관리 정리 (Invest API 전용)

### 14.1 사용하지 않는 4분 타이머 완전 삭제

**문제점:**
- `session_timers` 테이블과 관련 코드가 구현되어 있지만 실제 사용되지 않음
- `scheduled_end_at = NOW() + INTERVAL '4 minutes'` 코드가 여러 함수에 존재
- 실제 세션 종료는 **60초 무활동 로직**이 처리함 (336_FORCE_CLEANUP_TRIGGERS.sql)

**삭제 대상:**
1. `session_timers` 테이블 (265, 289 파일에서 생성)
2. 모든 함수의 session_timers INSERT 코드
   - `save_game_launch_session()` (287, 289 파일)
   - `reactivate_session_on_betting()` (287 파일)

**신규 SQL 파일: 367_remove_unused_session_timers.sql**
```sql
-- =====================================================
-- 367. 사용하지 않는 session_timers 테이블 완전 삭제
-- =====================================================
-- 작성일: 2025-11-03
-- 목적: 실제 사용하지 않는 4분 타이머 완전 제거

DO $$
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE '367. session_timers 완전 삭제';
    RAISE NOTICE '============================================';
END $$;

-- ============================================
-- 1단계: session_timers 테이블 삭제
-- ============================================

DROP TABLE IF EXISTS session_timers CASCADE;

DO $$
BEGIN
    RAISE NOTICE '✅ session_timers 테이블 삭제 완료';
END $$;

-- ============================================
-- 2단계: save_game_launch_session 함수 수정 (타이머 제거)
-- ============================================

CREATE OR REPLACE FUNCTION save_game_launch_session(
    p_user_id UUID,
    p_game_id BIGINT,
    p_opcode VARCHAR(50),
    p_launch_url TEXT,
    p_session_token VARCHAR(255) DEFAULT NULL,
    p_balance_before DECIMAL(15,2) DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_session_id BIGINT;
    v_partner_id UUID;
    v_random_session_id TEXT;
    v_existing_session RECORD;
    v_recent_session_time TIMESTAMPTZ;
BEGIN
    -- 사용자의 partner_id 조회
    SELECT referrer_id INTO v_partner_id
    FROM users
    WHERE id = p_user_id;
    
    -- 30초 내 중복 세션 생성 방지
    SELECT launched_at INTO v_recent_session_time
    FROM game_launch_sessions
    WHERE user_id = p_user_id
    AND status = 'active'
    AND launched_at > NOW() - INTERVAL '30 seconds'
    ORDER BY launched_at DESC
    LIMIT 1;
    
    IF v_recent_session_time IS NOT NULL THEN
        RAISE EXCEPTION '잠시 후에 다시 시도하세요. (30초 이내 중복 요청)';
    END IF;
    
    -- 4시간 이내 같은 user_id + game_id의 ended 세션 찾기
    SELECT id, session_id INTO v_existing_session
    FROM game_launch_sessions
    WHERE user_id = p_user_id
    AND game_id = p_game_id
    AND status = 'ended'
    AND (ended_at > NOW() - INTERVAL '4 hours' OR launched_at > NOW() - INTERVAL '4 hours')
    ORDER BY COALESCE(ended_at, launched_at) DESC
    LIMIT 1;
    
    -- 기존 세션이 있으면 재활성화
    IF v_existing_session.id IS NOT NULL THEN
        UPDATE game_launch_sessions
        SET 
            status = 'active',
            ended_at = NULL,
            last_activity_at = NOW(),
            launch_url = p_launch_url,
            session_token = p_session_token,
            launched_at = NOW()
        WHERE id = v_existing_session.id;
        
        RAISE NOTICE '🔄 세션 재활성화 성공: db_id=%, session_id=%', 
            v_existing_session.id, v_existing_session.session_id;
        
        RETURN v_existing_session.id;
    END IF;
    
    -- 기존 세션이 없으면 새로 생성
    v_random_session_id := substring(md5(random()::text || clock_timestamp()::text) from 1 for 16);
    
    INSERT INTO game_launch_sessions (
        user_id, game_id, opcode, launch_url, session_token,
        balance_before, launched_at, ended_at, status,
        last_activity_at, partner_id, session_id
    ) VALUES (
        p_user_id, p_game_id, p_opcode, p_launch_url, p_session_token,
        COALESCE(p_balance_before, 0), NOW(), NULL, 'active',
        NOW(), v_partner_id, v_random_session_id
    ) RETURNING id INTO v_session_id;
    
    RAISE NOTICE '✅ 새 세션 생성: db_id=%, session_id=%', 
        v_session_id, v_random_session_id;
    
    RETURN v_session_id;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ save_game_launch_session 오류: %', SQLERRM;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION save_game_launch_session(UUID, BIGINT, VARCHAR, TEXT, VARCHAR, DECIMAL) TO anon, authenticated;

DO $$
BEGIN
    RAISE NOTICE '✅ save_game_launch_session 함수 수정 완료 (타이머 코드 제거)';
END $$;

-- ============================================
-- 3단계: reactivate_session_on_betting 함수 수정 (타이머 제거)
-- ============================================

CREATE OR REPLACE FUNCTION reactivate_session_on_betting(
    p_user_id UUID,
    p_game_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
    v_session_id BIGINT;
    v_session_token TEXT;
    v_active_session RECORD;
BEGIN
    -- 1. 먼저 active 세션 확인
    SELECT id, session_id INTO v_active_session
    FROM game_launch_sessions
    WHERE user_id = p_user_id
    AND game_id = p_game_id
    AND status = 'active'
    ORDER BY launched_at DESC
    LIMIT 1;
    
    -- Active 세션이 있으면 재활성화 불필요
    IF v_active_session.id IS NOT NULL THEN
        RAISE NOTICE '✅ 이미 active 세션 존재: db_id=%', v_active_session.id;
        RETURN FALSE;
    END IF;
    
    -- 2. Active 세션이 없으면 4시간 내 ended 세션 찾기
    SELECT id, session_id INTO v_session_id, v_session_token
    FROM game_launch_sessions
    WHERE user_id = p_user_id
    AND game_id = p_game_id
    AND status = 'ended'
    AND (ended_at > NOW() - INTERVAL '4 hours' OR launched_at > NOW() - INTERVAL '4 hours')
    ORDER BY COALESCE(ended_at, launched_at) DESC
    LIMIT 1;
    
    IF v_session_id IS NULL THEN
        RAISE NOTICE '❌ 재활성화할 세션 없음: user=%, game=%', p_user_id, p_game_id;
        RETURN FALSE;
    END IF;
    
    -- 3. 세션 재활성화
    UPDATE game_launch_sessions
    SET 
        status = 'active',
        ended_at = NULL,
        last_activity_at = NOW(),
        launched_at = NOW()
    WHERE id = v_session_id;
    
    RAISE NOTICE '🔄 베팅 감지로 세션 재활성화 성공: db_id=%, session=%', 
        v_session_id, v_session_token;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ reactivate_session_on_betting 오류: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION reactivate_session_on_betting(UUID, BIGINT) TO anon, authenticated;

DO $$
BEGIN
    RAISE NOTICE '✅ reactivate_session_on_betting 함수 수정 완료 (타이머 코드 제거)';
END $$;

-- ============================================
-- 완료
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE '✅ 367. session_timers 완전 삭제 완료';
    RAISE NOTICE '============================================';
    RAISE NOTICE '삭제된 항목:';
    RAISE NOTICE '  1. ✅ session_timers 테이블';
    RAISE NOTICE '  2. ✅ save_game_launch_session 타이머 코드';
    RAISE NOTICE '  3. ✅ reactivate_session_on_betting 타이머 코드';
    RAISE NOTICE '';
    RAISE NOTICE '📌 현재 세션 관리 로직:';
    RAISE NOTICE '  • 60초 무활동 → auto_ended (336_FORCE_CLEANUP_TRIGGERS.sql)';
    RAISE NOTICE '  • 4시간 재활성화 가능 (ended → active)';
    RAISE NOTICE '  • 4시간 후 세션 삭제 (cleanup_old_ended_sessions 함수)';
    RAISE NOTICE '============================================';
END $$;
```

---

### 14.2 4시간 후 세션 삭제 자동화

**현재 상태:**
- `cleanup_old_ended_sessions()` 함수는 구현되어 있음 (287번 파일)
- pg_cron은 323번에서 완전 삭제됨
- **자동 실행 메커니즘 없음** → ended 세션이 무한정 쌓임

**해결 방안: 프론트엔드 주기 호출**

**contexts/SessionCleanupContext.tsx (신규 생성)**
```typescript
import { createContext, useContext, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

const SessionCleanupContext = createContext<null>(null);

export function SessionCleanupProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // 초기 실행
    cleanupOldSessions();
    
    // 1시간마다 실행
    const cleanupInterval = setInterval(async () => {
      await cleanupOldSessions();
    }, 3600000); // 1시간 = 3600000ms
    
    return () => clearInterval(cleanupInterval);
  }, []);
  
  const cleanupOldSessions = async () => {
    try {
      const { data, error } = await supabase
        .rpc('cleanup_old_ended_sessions');
      
      if (error) {
        console.error('세션 정리 실패:', error);
      } else if (data > 0) {
        console.log(`🗑️ ${data}개 세션 정리 완료 (4시간 경과)`);
      }
    } catch (err) {
      console.error('세션 정리 오류:', err);
    }
  };
  
  return (
    <SessionCleanupContext.Provider value={null}>
      {children}
    </SessionCleanupContext.Provider>
  );
}
```

**App.tsx 수정**
```typescript
import { SessionCleanupProvider } from './contexts/SessionCleanupContext';

function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <BalanceProvider>
          <SessionCleanupProvider>
            {/* 기존 라우팅 */}
          </SessionCleanupProvider>
        </BalanceProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}
```

**특징:**
- 애플리케이션이 로드되면 자동으로 1시간마다 실행
- 브라우저가 열려있는 동안만 작동
- 서버 부하 없음 (프론트엔드 타이머)
- cleanup_old_ended_sessions() RPC 함수 호출

---

### 14.3 세션 관리 최종 아키텍처

```
[게임 시작]
    ↓
[세션 생성: status=active]
    ↓
[배팅 발생] ← last_activity_at 갱신
    ↓
[60초 무활동] → [status=auto_ended] → [보유금 동기화 트리거]
    ↓
[4시간 이내 재접속] → [재활성화: status=active, launched_at=NOW()]
    ↓
[4시간 경과] → [프론트엔드 1시간 주기 → cleanup_old_ended_sessions() → DB 삭제]
```

**핵심 타임라인:**

| 시간 | 로직 | 구현 위치 |
|-----|------|----------|
| **60초 (1분)** | 무활동 자동 종료 | 336_FORCE_CLEANUP_TRIGGERS.sql |
| **4시간** | 재활성화 가능 기간 | 287_enhanced_session_management.sql |
| **4시간** | 세션 삭제 (1시간 주기 체크) | SessionCleanupContext.tsx → cleanup_old_ended_sessions() |

---

### 14.4 구현 체크리스트

#### Phase 1: session_timers 삭제
- [ ] 367_remove_unused_session_timers.sql 실행
- [ ] session_timers 테이블 삭제 확인
- [ ] save_game_launch_session 함수 타이머 코드 제거 확인
- [ ] reactivate_session_on_betting 함수 타이머 코드 제거 확인

#### Phase 2: 세션 정리 자동화
- [ ] contexts/SessionCleanupContext.tsx 생성
- [ ] App.tsx에 SessionCleanupProvider 추가
- [ ] 브라우저 콘솔에서 1시간 주기 실행 확인

#### Phase 3: 검증
- [ ] 60초 무활동 종료 작동 확인
- [ ] 4시간 재활성화 작동 확인
- [ ] 4시간 경과 세션 삭제 확인
- [ ] 보유금 동기화 트리거 작동 확인 (320번)

---

## 완료

이 가이드를 기반으로 단계별 구현을 진행하면 Seamless Wallet 시스템이 완성됩니다.

**주요 구현 사항:**
- ✅ 미니게임 탭 추가 (사용자 페이지) - **OroPlay API만**
- ✅ 관리자 게임 관리 5개 탭 구성
  - Invest: 카지노/슬롯 (미니게임 없음)
  - OroPlay: 카지노/슬롯/미니게임
- ✅ game_type='minigame' 지원 (OroPlay만)
- ✅ OroPlay API type=3 매핑
- ✅ **콜주기 페이지 - OroPlay API 전용 RTP 관리 (Invest API와 완전 독립)**
- ✅ **세션 관리 정리 - session_timers 삭제 + 4시간 세션 정리 자동화**

**중요 사항:**
- **Invest API는 카지노/슬롯만 지원 (미니게임 없음)**
- **OroPlay API는 카지노/슬롯/미니게임 모두 지원**
- CallCycle.tsx는 **OroPlay API 슬롯 게임 RTP 관리만** 담당
- Invest API와는 **완전히 무관**한 기능
- 관리자 사이드메뉴에 독립적인 페이지로 추가
- 시스템관리자, 대본사만 접근 가능
- **세션 관리는 60초 무활동 종료 + 4시간 재활성화 + 4시간 후 삭제**

구현 시작 대기 중입니다.
