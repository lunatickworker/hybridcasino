# 게임 세션 & Seamless Wallet 최종 플로우 확정서 (v3.0)

## 📋 문서 개요

- **작성일**: 2025-01-11
- **최종 업데이트**: 2025-01-11 (paused 상태 추가)
- **기반 문서**: 
  - FLOW_CONFLICTS_ANALYSIS.md (Q1~Q8 답변 완료)
  - FINAL_FLOW_QUESTIONS.md (Q1-1~Q8-1 답변 완료)
  - bettingsyncM_walletM_gameM.md (v2.0)
- **v3.1 업데이트**: paused 상태 추가로 ready 중복 입금 버그 해결

---

## ✅ 확정된 답변 정리

### 📌 FLOW_CONFLICTS_ANALYSIS.md 답변

| 질문 | 답변 | 의미 |
|------|------|------|
| Q1 | A | 4분 베팅 없을 때 **paused**로 전환 (idle 상태 없음) ⭐ 업데이트 |
| Q2 | B | **idle 상태 사용 안 함** |
| Q3 | A | ready 타임아웃 **10분 재설정** |
| Q4 | C | 베팅 동기화 **30초 자동 + 수동 둘 다** |
| Q5 | A | checkAndEndInactiveSessions **완전 삭제** (연관기능 영향 없이) |
| Q6 | C | **기존 4시간 로직 유지** (있다면) |
| Q7 | A | GamePreparingDialog **진행 상태 표시** |
| Q8 | A | ready 상태에서 **기존 URL 재사용** |

### 📌 FINAL_FLOW_QUESTIONS.md 답변

| 질문 | 답변 | 구현 방안 |
|------|------|----------|
| Q1-1 | **B 권장** | `ready_at` 컬럼 추가 (ready 전환 시마다 업데이트) |
| Q2-1 | 예 | 게임창은 열려있는 상태 |
| Q2-2 | 예 | game_records.updated_at을 30초 주기로 체크 |
| Q3-1 | B | ready 상태 세분화 필요 (sub_status 컬럼 추가) |
| Q4-1 | A | ready → active 전환 시 보유금 동기화 필요 없음 |
| Q4-2 | B, C | 출금 시 + ready에서 출금페이지 이동 시 보유금 동기화 |
| Q5-1 | B | ended 세션 1시간 주기 삭제 |
| Q6-1 | A | BettingHistorySync에 30초 자동 베팅 동기화 통합 |
| Q7-1 | B | SessionTimeoutManager: ready 10분 타임아웃 + ended 1시간 주기 삭제 |
| Q8-1 | A | 타임아웃 재설정 제한 없음 (베팅만 하면 계속 유지) |

---

## 📊 DB 스키마 변경사항

### game_launch_sessions 테이블 스키마

```sql
CREATE TABLE game_launch_sessions (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  game_id TEXT NOT NULL,
  api_type TEXT NOT NULL,  -- 'invest' | 'oroplay'
  
  -- 세션 정보
  session_id TEXT,
  launch_url TEXT,
  session_token TEXT,
  
  -- 보유금 정보
  balance_before DECIMAL(15,2) DEFAULT 0,
  
  -- ⭐ 상태 관리 (핵심)
  status TEXT NOT NULL DEFAULT 'ready',  -- 'ready' | 'active' | 'paused' | 'ended' | 'force_ended' ⭐ paused 추가
  ready_status TEXT,  -- 'popup_blocked' | 'popup_opened' | null
  
  -- ⭐ 시간 관리 (핵심)
  launched_at TIMESTAMPTZ DEFAULT NOW(),     -- 최초 세션 생성 시간
  ready_at TIMESTAMPTZ DEFAULT NOW(),         -- ready 상태로 전환된 시간 (타임아웃 계산용)
  last_activity_at TIMESTAMPTZ DEFAULT NOW(), -- 마지막 활동 시간
  last_bet_at TIMESTAMPTZ,                    -- 마지막 베팅 시간 (active 상태 관리용)
  last_bet_checked_at TIMESTAMPTZ,            -- 마지막 베팅 체크 시간 (30초 주기 체크용)
  ended_at TIMESTAMPTZ,                       -- 세션 종료 시간
  
  -- 파트너 정보
  partner_id UUID REFERENCES partners(id),
  opcode TEXT,
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_game_launch_sessions_user_id ON game_launch_sessions(user_id);
CREATE INDEX idx_game_launch_sessions_status ON game_launch_sessions(status);
CREATE INDEX idx_game_launch_sessions_api_type ON game_launch_sessions(api_type);
CREATE INDEX idx_game_launch_sessions_ready_at ON game_launch_sessions(ready_at);
CREATE INDEX idx_game_launch_sessions_last_bet_at ON game_launch_sessions(last_bet_at);
CREATE INDEX idx_game_launch_sessions_ended_at ON game_launch_sessions(ended_at);
```

### 컬럼 설명

| 컬럼 | 용도 | 업데이트 시점 |
|------|------|--------------|
| `launched_at` | 최초 세션 생성 시간 (변경 안 됨) | 세션 생성 시 1회만 |
| `ready_at` | ready 타임아웃 계산 기준 시간 | ready 상태 전환 시마다 NOW() 업데이트 |
| `last_activity_at` | 마지막 활동 시간 | 베팅, 상태 변경 등 모든 활동 시 |
| `last_bet_at` | 마지막 베팅 시간 | active 상태에서 베팅 발생 시 |
| `last_bet_checked_at` | 마지막 베팅 체크 시간 | BettingHistorySync 30초 주기 체크 시 |
| `ended_at` | 세션 종료 시간 | ended/force_ended 상태 전환 시 |
| `ready_status` | ready 상태 세부 분류 | ready 상태 전환 시 |

### ready_status 값

```typescript
type ReadyStatus = 
  | 'popup_blocked'      // 팝업 차단으로 오픈 안 됨
  | 'popup_opened'       // 팝업 열렸지만 첫 베팅 전
  | null;                // 기본값 (첫 생성 시) ⭐ inactive_returned 제거
```

**⭐ paused vs ready 차이점:**
- **ready**: API에 입금 완료, 아직 베팅 안 함 (신규 게임)
- **paused**: API에 입금 완료, 과거 베팅 있음, 최근 4분 베팅 없음 (기존 게임)

---

## 🔄 상태 전환 플로우 (최종 확정)

### 1. 게임 실행 플로우

```
[게임 클릭]
    ↓
GamePreparingDialog 표시 ("게임 준비중입니다", 진행 상태 표시)
    ↓
[1단계: 기존 세션 체크]
    ├─ 다른 API 게임 실행 중? → 토스트 에러 + 중단
    ├─ 같은 게임 ready/paused 세션 있음? → 기존 launch_url 재사용 + 팝업 오픈 ⭐
    └─ 기존 세션 없음 → 계속
    ↓
[2단계: API 입금]
    ├─ users.balance 체크 (잔액 부족 시 에러)
    ├─ DB 먼저 차감: users.balance = 0
    ├─ DB 먼저 차감: api_configs.invest_balance -= amount
    ├─ Proxy 경유: POST https://vi8282.com/proxy
    │   └─ body.url: https://api.invest-ho.com/api/account/balance
    │   └─ body.method: POST
    │   └─ body.body: { opcode, username, token, amount, signature }
    └─ 실패 시 롤백: users.balance, api_configs.invest_balance 복구
    ↓
[3단계: 게임 실행 URL 발급]
    ├─ Proxy 경유: POST https://vi8282.com/proxy
    │   └─ body.url: https://api.invest-ho.com/api/game/launch
    │   └─ body.method: POST
    │   └─ body.body: { opcode, username, token, game, signature }
    └─ launch_url 받음
    ↓
[4단계: 세션 생성]
    └─ game_launch_sessions INSERT {
          status: 'ready',
          ready_status: null,
          ready_at: NOW(),
          launched_at: NOW(),
          last_activity_at: NOW(),
          launch_url: [받은 URL]
        }
    ↓
[5단계: 팝업 오픈 시도] ⭐ 신규 세부 플로우
    ├─ window.open(launch_url) 실행
    │
    ├─ [A] 팝업 차단된 경우:
    │   ├─ 토스트 "차단되었습니다" 출력
    │   ├─ ready_status = 'popup_blocked'
    │   ├─ status = 'ready' 유지 (세션 종료 안 함!)
    │   └─ 재클릭 시 [1단계]에서 기존 URL 재사용
    │
    └─ [B] 팝업 성공한 경우:
        ├─ 토스트 "게임 시작" 출력
        ├─ ready_status = 'popup_opened'
        └─ 게임창 닫힘 감지 시작
    ↓
GamePreparingDialog 닫기
    ↓
[ready 상태] (최대 10분 타임아웃)
```

---

### 2. ready → active 전환 (첫 베팅 발생)

```
[ready 상태 유지 중]
    ↓
[BettingHistorySync 30초 주기 체크]
    ↓
Proxy 경유: GET /api/game/historyindex
    ↓
game_records에 새 베팅 발견
    ↓
game_launch_sessions.last_bet_at 업데이트 (베팅 시간)
    ↓
상태 전환: ready → active
    ├─ status = 'active'
    ├─ last_bet_at = [베팅 시간]
    ├─ last_activity_at = NOW()
    └─ ready_status = null (초기화)
    ↓
[active 상태]
```

**구현 위치**: `BettingHistorySync.tsx` (기존 syncInvestBetting 수정)

```typescript
// 베팅 기록 저장 후
const { data: readySessions } = await supabase
  .from('game_launch_sessions')
  .select('*')
  .eq('user_id', userId)
  .eq('status', 'ready');

if (readySessions && readySessions.length > 0) {
  const recentBet = gameRecords.find(r => r.user_id === userId);
  if (recentBet) {
    await supabase
      .from('game_launch_sessions')
      .update({
        status: 'active',
        last_bet_at: recentBet.played_at,
        last_activity_at: new Date().toISOString(),
        ready_status: null
      })
      .eq('id', readySessions[0].id);
  }
}
```

---

### 3. active → paused 전환 (4분 베팅 없음) ⭐ 업데이트

```
[active 상태]
    ↓
[BettingHistorySync 30초 주기 체크]
    ↓
last_bet_at 확인: NOW() - last_bet_at > 4분?
    ↓
예: 상태 전환
    ├─ status = 'paused'  ⭐ ready → paused 변경
    ├─ last_bet_checked_at = NOW()
    └─ last_activity_at = NOW()
    ↓
[paused 상태] (게임창 닫힘까지 대기, 타임아웃 없음)
    ├─ 게임창은 여전히 열려있음
    ├─ 사용자는 이 전환을 모름
    └─ 베팅하면 다시 active로 전환
```

**구현 위치**: `BettingHistorySync.tsx` (monitorSessionStates 함수)

```typescript
// active → paused (4분 베팅 없음)
async function monitorSessionStates() {
  const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000);
  
  const { data: activeSessions } = await supabase
    .from('game_launch_sessions')
    .select('*')
    .eq('status', 'active')
    .not('last_bet_at', 'is', null)
    .lt('last_bet_at', fourMinutesAgo.toISOString());
  
  for (const session of activeSessions || []) {
    await supabase
      .from('game_launch_sessions')
      .update({
        status: 'paused',  // ⭐ paused로 전환
        last_bet_checked_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .eq('id', session.id);
  }
}
```

---

### 3-1. paused → active 전환 (베팅 재개) ⭐ 신규

```
[paused 상태]
    ↓
[BettingHistorySync 30초 주기 체크]
    ↓
최근 30초 이내 베팅 발견?
    ↓
예: 상태 전환
    ├─ status = 'active'
    ├─ last_bet_at = [베팅 시간]
    ├─ last_bet_checked_at = NOW()
    └─ last_activity_at = NOW()
    ↓
[active 상태] (다시 활성화)
```

**구현 위치**: `BettingHistorySync.tsx` (monitorSessionStates 함수)

```typescript
// paused → active (베팅 재개)
const { data: pausedSessions } = await supabase
  .from('game_launch_sessions')
  .select('*')
  .eq('status', 'paused');

for (const session of pausedSessions || []) {
  const { data: recentBets } = await supabase
    .from('game_records')
    .select('played_at')
    .eq('user_id', session.user_id)
    .gte('played_at', new Date(now.getTime() - 30 * 1000).toISOString())
    .limit(1);

  if (recentBets && recentBets.length > 0) {
    await supabase
      .from('game_launch_sessions')
      .update({
        status: 'active',
        last_bet_at: recentBets[0].played_at,
        last_bet_checked_at: now.toISOString(),
        last_activity_at: now.toISOString()
      })
      .eq('id', session.id);
  }
}
```

---

### 4. ready 타임아웃 (10분 후 자동 종료) ⭐ paused는 타임아웃 없음

```
[ready 상태]
    ↓
[SessionTimeoutManager 1분 주기 체크]
    ↓
ready_at 확인: NOW() - ready_at > 10분?
    ↓
예: 자동 출금 + 종료
    ├─ [보유금 동기화]
    │   ├─ Proxy 경유: GET /api/account/balance
    │   └─ users.balance 업데이트
    │
    ├─ [API 출금]
    │   ├─ Proxy 경유: PUT /api/account/balance
    │   └─ api_configs.invest_balance 업데이트
    │
    └─ [세션 종료]
        ├─ status = 'ended'
        ├─ ended_at = NOW()
        └─ last_activity_at = NOW()
    ↓
[ended 상태] (1시간 후 DB에서 삭제)

⭐ paused 상태는 타임아웃 없음 (게임창 닫힘까지 대기)
```

**구현 위치**: `contexts/SessionTimeoutManager.tsx` (신규 생성)

```typescript
async function handleReadyTimeout() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  
  const { data: readySessions } = await supabase
    .from('game_launch_sessions')
    .select('*')
    .eq('status', 'ready')
    .lt('ready_at', tenMinutesAgo.toISOString());
  
  for (const session of readySessions || []) {
    // 보유금 동기화 + API 출금 + ended 상태 전환
    await syncBalanceOnSessionEnd(session.user_id, session.api_type);
  }
}
```

---

### 5. 게임창 닫힘 감지 → ended ⭐ paused도 게임창 닫으면 ended

```
[ready, active 또는 paused 상태]  ⭐ paused 추가
    ↓
[팝업 닫힘 감지] (1초 주기 체크)
    ├─ gameWindow.closed === true
    └─ clearInterval(checkGameWindow)
    ↓
handleGameWindowClose(sessionId)
    ├─ [보유금 동기화]
    │   ├─ Proxy 경유: GET /api/account/balance
    │   └─ users.balance 업데이트
    │
    ├─ [API 출금]
    │   ├─ Proxy 경유: PUT /api/account/balance
    │   └─ api_configs.invest_balance 업데이트
    │
    └─ [세션 종료]
        ├─ status = 'ended'
        ├─ ended_at = NOW()
        └─ last_activity_at = NOW()
    ↓
[ended 상태] (1시간 후 DB에서 삭제)

⭐ paused 상태의 유일한 종료 방법: 게임창 닫기
```

**구현 위치**: `UserSlot.tsx`, `UserCasino.tsx` (기존 로직 유지)

---

### 6. 관리자 강제 종료 → force_ended

```
[관리자 페이지: 온라인 사용자 관리]
    ↓
[강제 종료 버튼 클릭]
    ↓
handleForceEndSession(userId)
    ├─ [보유금 동기화]
    │   ├─ Proxy 경유: GET /api/account/balance
    │   └─ users.balance 업데이트
    │
    ├─ [API 출금]
    │   ├─ Proxy 경유: PUT /api/account/balance
    │   └─ api_configs.invest_balance 업데이트
    │
    └─ [세션 종료]
        ├─ status = 'force_ended'
        ├─ ended_at = NOW()
        └─ last_activity_at = NOW()
    ↓
[force_ended 상태] (1시간 후 DB에서 삭제)
```

**참고**: 게임 팝업은 강제로 닫히지 않음. 사용자가 직접 닫아야 함. 출금만 처리됨.

---

### 7. ready 상태에서 출금 페이지 이동

```
[ready 상태]
    ↓
[사용자가 출금 페이지로 이동]
    ↓
useEffect(() => { ... }, [pathname])
    ├─ pathname === '/user/withdraw'?
    └─ 현재 ready 세션 있음?
    ↓
[보유금 동기화 실행]
    ├─ Proxy 경유: GET /api/account/balance
    └─ users.balance 업데이트
    ↓
출금 페이지 표시 (최신 보유금 반영)
```

**구현 위치**: `UserWithdraw.tsx` (useEffect 추가)

```typescript
useEffect(() => {
  const checkAndSyncBalance = async () => {
    // ready 세션 확인
    const { data: readySession } = await supabase
      .from('game_launch_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'ready')
      .single();
    
    if (readySession) {
      // 보유금 동기화
      await syncUserBalance(user.id, readySession.api_type);
    }
  };
  
  checkAndSyncBalance();
}, []);
```

---

### 8. 게임창 차단 시나리오 (⭐ 신규)

```
[게임 클릭]
    ↓
[API 입금 완료 + URL 발급 완료]
    ↓
window.open(launch_url) 실행
    ↓
[팝업 차단 감지]
    ├─ gameWindow === null
    └─ 토스트 "차단되었습니다" 출력
    ↓
[ready_status 업데이트]
    ├─ ready_status = 'popup_blocked'
    ├─ status = 'ready' 유지 (세션 종료 안 함!)
    └─ last_activity_at = NOW()
    ↓
[사용자가 팝업 차단 해제]
    ↓
[같은 게임 다시 클릭]
    ↓
[기존 ready 세션 감지]
    ├─ status = 'ready'
    ├─ game_id 동일
    └─ launch_url 존재
    ↓
[기존 launch_url 재사용]
    ├─ window.open(기존 launch_url) 실행
    ├─ 중복 입금 없음!
    └─ ready_status = 'popup_opened' 업데이트
    ↓
[ready 상태] (첫 베팅 대기)
```

**구현 위치**: `UserCasino.tsx`, `UserSlot.tsx`, `UserMiniGame.tsx`

**핵심 포인트**:
- 팝업 차단 시 세션을 종료하지 않음 (기존에는 endGameSession() 호출)
- ready_status를 'popup_blocked'로 업데이트
- 재클릭 시 기존 URL 재사용으로 중복 입금 방지
- ready 타임아웃(10분)은 그대로 적용됨

---

### 9. 다른 게임으로 이동 (게임 전환)

```
[ready 또는 active 상태에서 다른 게임 클릭]
    ↓
GamePreparingDialog 표시 ("게임 이동 중입니다")
    ├─ "기존 게임 출금 중..." (2초)
    ├─ "새 게임 준비 중..." (2초)
    └─ 진행 상태 표시
    ↓
[1단계: 기존 게임 출금]
    ├─ Proxy 경유: GET /api/account/balance (보유금 조회)
    ├─ users.balance 업데이트
    ├─ Proxy 경유: PUT /api/account/balance (출금)
    ├─ api_configs.invest_balance 업데이트
    └─ 기존 세션: status = 'ended', ended_at = NOW()
    ↓
[4초 대기] (출금 완료 보장)
    ↓
[2단계: 새 게임 입금]
    ├─ users.balance 체크
    ├─ DB 먼저 차감
    ├─ Proxy 경유: POST /api/account/balance (입금)
    └─ 실패 시 롤백
    ↓
[3단계: 새 게임 실행]
    ├─ Proxy 경유: POST /api/game/launch
    ├─ 새 세션 생성 (ready 상태)
    └─ 팝업 오픈
    ↓
GamePreparingDialog 닫기
```

**구현 위치**: `UserSlot.tsx`, `UserCasino.tsx` (기존 로직 유지)

---

## 🔧 구현해야 할 컴포넌트/함수

### 1. SessionTimeoutManager.tsx (신규 생성)

**파일 위치**: `/contexts/SessionTimeoutManager.tsx`

**역할**:
- ready 10분 타임아웃 체크 (1분 주기)
- ended/force_ended 세션 1시간 후 DB 삭제 (1시간 주기)

**함수**:
```typescript
async function handleReadyTimeout() {
  // ready_at > 10분 경과한 세션 → 자동 출금 + ended
}

async function cleanupEndedSessions() {
  // ended_at > 1시간 경과한 세션 → DB 삭제
}
```

---

### 2. BettingHistorySync.tsx (수정) ⭐ paused 로직 추가

**기존 기능 유지**:
- ✅ Invest API 베팅 기록 동기화 (30초 자동)
- ✅ OroPlay API 베팅 기록 동기화 (30초 자동)
- ✅ 수동 새로고침 버튼

**추가 기능**:
- ✅ ready → active 전환 (첫 베팅 발견 시)
- ✅ active → paused 전환 (4분 베팅 없음) ⭐ 업데이트
- ✅ paused → active 전환 (베팅 재개) ⭐ 신규

**삭제 기능**:
- ❌ `checkAndEndInactiveSessions()` 완전 삭제

**함수**:
```typescript
async function monitorSessionStates() {
  // 1. ready → active (첫 베팅 발견)
  // 2. active → paused (4분 베팅 없음) ⭐ ready → paused 변경
  // 3. paused → active (베팅 재개) ⭐ 신규
}

// 기존 syncInvestBetting()에 monitorSessionStates() 통합
```

---

### 3. UserWithdraw.tsx (수정)

**추가 기능**:
- ✅ ready 세션 감지 시 보유금 동기화

**함수**:
```typescript
useEffect(() => {
  async function checkAndSyncBalance() {
    // ready 세션 확인 → 보유금 동기화
  }
  checkAndSyncBalance();
}, []);
```

---

### 4. GamePreparingDialog.tsx (수정)

**기존**: "게임 준비중입니다" (심플)

**변경**: 진행 상태 표시
- "게임 준비 중..." (입금 중)
- "게임 실행 중..." (URL 발급 중)
- "기존 게임 출금 중..." (게임 전환 시)
- "새 게임 준비 중..." (게임 전환 시)

**Props**:
```typescript
interface GamePreparingDialogProps {
  isOpen: boolean;
  stage: 'deposit' | 'launch' | 'withdraw' | 'switch_deposit';
}
```

---

### 5. lib/gameApi.ts (신규 함수 추가)

**함수**:
```typescript
/**
 * 세션 종료 시 보유금 동기화 + API 출금
 */
export async function syncBalanceOnSessionEnd(
  userId: string, 
  apiType: 'invest' | 'oroplay'
) {
  // 1. API에서 보유금 조회
  // 2. users.balance 업데이트
  // 3. API 출금 호출
  // 4. api_configs.balance 업데이트
  // 5. 세션 ended 상태 전환
}

/**
 * ready 세션에서 보유금 동기화 (출금 페이지 진입 시)
 */
export async function syncUserBalance(
  userId: string,
  apiType: 'invest' | 'oroplay'
) {
  // 1. API에서 보유금 조회
  // 2. users.balance 업데이트
}
```

---

## 📊 상태 전환 다이어그램 ⭐ paused 상태 추가

```
┌────────────────────────────────────────────────────────────────┐
│                   게임 세션 생애주기 (v3.1)                       │
└────────────────────────────────────────────────────────────────┘

    [게임 클릭]
        │
        ↓
   ┌─────────┐
   │  ready  │ ← 팝업 오픈, 베팅 전
   │ (10분)  │ ← 타임아웃: ready_at + 10분
   └─────────┘
        │
        ├─→ [첫 베팅 발생] ────────────────────┐
        │                                      │
        │                                      ↓
        │                                 ┌─────────┐
        │                                 │ active  │
        │                                 │ (계속)  │
        │                                 └─────────┘
        │                                      │
        │                                      ├─→ [4분 베팅 없음] ─┐
        │                                      │                    │
        │    ┌─────────────────────────────────┘                    │
        │    │                                                       ↓
        │    │                                                  ┌────────┐
        │    │                                                  │ paused │ ⭐ 신규
        │    │                                                  │(무제한)│
        │    │                                                  └────────┘
        │    │                                                       │
        │    │    ┌──────────────────────────────────────────────────┤
        │    │    │ [베팅 재개]                                      │
        │    │    ↓                                                  │
        │ [게임 지속]                                                │
        │    │                                                        │
        ├────┴─────────────────────────────────────────←─────────────┤
        │                                                             │
        ├─→ [10분 타임아웃] ──────────────────────┐                  │
        │                                         │                  │
        ├─→ [게임창 닫힘] ────────────────────────┤◄─────────────────┘
        │                                         │
        ├─→ [관리자 강제 종료] ───────────────────┤
        │                                         │
        ↓                                         ↓
   ┌─────────┐                              ┌──────────────┐
   │  ended  │                              │ force_ended  │
   │ (1시간) │                              │   (1시간)    │
   └─────────┘                              └──────────────┘
        │                                         │
        └────────→ [1시간 후 DB 삭제] ←───────────┘

⭐ paused 상태 특징:
  - 타임아웃 없음 (게임창 닫힘까지 대기)
  - ready 중복 입금 버그 방지
  - 베팅 재개 시 active로 복귀
```

---

## ⚠️ 중요 구현 주의사항

### 1. paused 상태는 타임아웃 없음 ⭐ 신규

**paused 상태 특징**:
- 4분 베팅 없을 때 active → paused 전환
- **타임아웃 없음** (게임창 닫힘까지 무한 대기)
- 베팅 재개 시 paused → active 복귀
- 게임창 닫으면 paused → ended

**시나리오**:
```
0분: ready (타임아웃 10분)
2분: active (첫 베팅)
6분: paused (4분 베팅 없음, 타임아웃 없음)
10분: active (베팅 재개)
14분: paused (4분 베팅 없음, 타임아웃 없음)
20분: active (베팅 재개)
...무한 반복 가능 (게임창만 열려있으면 계속 유지)
```

**이유**: 
- 게임 중인 사용자는 베팅 여부와 관계없이 게임창만 열려있으면 계속 플레이 가능
- ready 중복 입금 버그 방지 (ready는 신규 게임, paused는 기존 게임)

---

### 2. ready → active 전환 최대 30초 지연

**Q2-2 답변**: game_records의 updated_at을 30초 주기로 체크

**의미**: 
- 사용자가 베팅한 후 최대 30초 후에 active 상태로 전환됨
- 사용자는 이 지연을 느끼지 못함 (게임창 열려있고 정상 플레이 중)

---

### 3. active → paused 전환 시 보유금 동기화 불필요 ⭐ 업데이트

**Q4-1 답변**: A (보유금 동기화 필요 없음)

**이유**: 
- 게임창이 여전히 열려있음
- API에 잔액이 유지됨
- 베팅 재개 시 자동으로 active로 복귀
- paused는 기존 게임이므로 ready처럼 타임아웃 걱정 없음

---

### 4. ready 상태에서 출금 페이지 이동 시 동기화 필수

**Q4-2 답변**: B, C (출금 시 + ready에서 출금페이지 이동 시)

**이유**:
- ready 상태 = API에 잔액이 입금되어 있음
- users.balance는 0원 상태
- 출금 페이지에서 정확한 보유금 표시를 위해 동기화 필요

**구현**:
```typescript
// UserWithdraw.tsx
useEffect(() => {
  checkAndSyncBalance(); // ready 세션 확인 → 보유금 동기화
}, []);
```

---

### 5. ended 세션 1시간 후 삭제

**Q5-1 답변**: B (1시간 주기 삭제)

**구현**:
```typescript
// SessionTimeoutManager.tsx
setInterval(async () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  await supabase
    .from('game_launch_sessions')
    .delete()
    .in('status', ['ended', 'force_ended'])
    .lt('ended_at', oneHourAgo.toISOString());
}, 60 * 60 * 1000); // 1시간마다 실행
```

---

### 6. BettingHistorySync 30초 자동 동기화 통합

**Q6-1 답변**: A (BettingHistorySync에 통합)

**기존**: 수동 새로고침 버튼만
**변경**: 30초 자동 + 수동 새로고침 둘 다

**구현**:
```typescript
// BettingHistorySync.tsx
useEffect(() => {
  const interval = setInterval(async () => {
    // 1. 베팅 기록 동기화
    await syncInvestBetting();
    await syncOroPlayBetting();
    
    // 2. 세션 상태 전환 체크
    await monitorSessionStates();
  }, 30000);
  
  return () => clearInterval(interval);
}, []);
```

---

### 7. SessionTimeoutManager 역할

**Q7-1 답변**: B (ready 10분 타임아웃 + ended 1시간 주기 삭제)

**구현**:
```typescript
// contexts/SessionTimeoutManager.tsx
export function SessionTimeoutManager() {
  useEffect(() => {
    // 1분마다 ready 타임아웃 체크
    const readyInterval = setInterval(handleReadyTimeout, 60 * 1000);
    
    // 1시간마다 ended 세션 삭제
    const cleanupInterval = setInterval(cleanupEndedSessions, 60 * 60 * 1000);
    
    return () => {
      clearInterval(readyInterval);
      clearInterval(cleanupInterval);
    };
  }, []);
  
  return null; // UI 없음, 백그라운드 작업만
}
```

---

### 8. GamePreparingDialog 진행 상태 표시

**Q7 답변**: A (진행 상태 표시)

**변경 전**:
```tsx
<Dialog>
  <DialogTitle>게임 준비중입니다</DialogTitle>
  <DialogDescription>잠시만 기다려주세요...</DialogDescription>
</Dialog>
```

**변경 후**:
```tsx
<Dialog>
  <DialogTitle>게임 준비중</DialogTitle>
  <DialogDescription>
    {stage === 'deposit' && '게임 입금 중...'}
    {stage === 'launch' && '게임 실행 중...'}
    {stage === 'withdraw' && '기존 게임 출금 중...'}
    {stage === 'switch_deposit' && '새 게임 준비 중...'}
  </DialogDescription>
  <Progress value={progress} />
</Dialog>
```

---

## 📋 구현 체크리스트

### Phase 1: DB 스키마 업데이트

- [ ] game_launch_sessions 테이블에 컬럼 추가
  - [ ] `ready_at TIMESTAMPTZ`
  - [ ] `ready_status TEXT`
  - [ ] `last_bet_checked_at TIMESTAMPTZ`
- [ ] 인덱스 추가
  - [ ] `idx_game_launch_sessions_ready_at`
  - [ ] `idx_game_launch_sessions_last_bet_at`

### Phase 2: SessionTimeoutManager 구현

- [ ] `/contexts/SessionTimeoutManager.tsx` 생성
- [ ] `handleReadyTimeout()` 함수 구현
  - [ ] ready_at > 10분 경과 세션 조회
  - [ ] syncBalanceOnSessionEnd() 호출
  - [ ] ended 상태 전환
- [ ] `cleanupEndedSessions()` 함수 구현
  - [ ] ended_at > 1시간 경과 세션 삭제
- [ ] App.tsx에 SessionTimeoutManager 추가

### Phase 3: BettingHistorySync 수정

- [ ] `checkAndEndInactiveSessions()` 함수 완전 삭제
- [ ] `monitorSessionStates()` 함수 추가
  - [ ] ready → active 전환 로직
  - [ ] active → ready 전환 로직
- [ ] 30초 자동 타이머 추가
  - [ ] syncInvestBetting() 호출
  - [ ] syncOroPlayBetting() 호출
  - [ ] monitorSessionStates() 호출

### Phase 4: gameApi.ts 함수 추가

- [ ] `syncBalanceOnSessionEnd()` 함수 구현
  - [ ] API 보유금 조회
  - [ ] users.balance 업데이트
  - [ ] API 출금 호출
  - [ ] api_configs.balance 업데이트
  - [ ] 세션 ended 상태 전환
- [ ] `syncUserBalance()` 함수 구현
  - [ ] API 보유금 조회
  - [ ] users.balance 업데이트

### Phase 5: UserWithdraw.tsx 수정

- [ ] useEffect 추가
  - [ ] ready 세션 확인
  - [ ] syncUserBalance() 호출

### Phase 6: GamePreparingDialog.tsx 수정

- [ ] stage prop 추가
- [ ] 진행 상태 메시지 표시
- [ ] Progress 바 추가 (선택)

### Phase 7: 기존 코드 수정

- [ ] UserSlot.tsx
  - [ ] 게임 전환 시 GamePreparingDialog stage 전달
  - [ ] ready 세션 재사용 로직 확인
- [ ] UserCasino.tsx
  - [ ] 게임 전환 시 GamePreparingDialog stage 전달
  - [ ] ready 세션 재사용 로직 확인
- [ ] OnlineUsers.tsx
  - [ ] force_ended 상태 전환 확인

### Phase 8: 테스트

- [ ] ready 10분 타임아웃 테스트
- [ ] ready → active 전환 테스트
- [ ] active → ready 전환 (4분) 테스트
- [ ] ended 1시간 후 삭제 테스트
- [ ] 출금 페이지 보유금 동기화 테스트
- [ ] 게임 전환 시나리오 테스트
- [ ] 관리자 강제 종료 테스트

---

## 📎 관련 문서

- `/docs/FLOW_CONFLICTS_ANALYSIS.md` - 충돌 분석 (Q1~Q8)
- `/docs/FINAL_FLOW_QUESTIONS.md` - 세부 질문 (Q1-1~Q8-1)
- `/docs/bettingsyncM_walletM_gameM.md` - 이전 버전 (v2.0)
- `/guidelines/seamless_wallet_integration.md` - Seamless Wallet 설계
- `/docs/SESSION_MANAGEMENT.md` - 세션 관리 기존 문서

---

**최종 확정일**: 2025-01-11  
**다음 단계**: Phase 1부터 순차적으로 구현 시작
