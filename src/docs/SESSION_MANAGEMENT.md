# 세션 관리 시스템 로직

## 개요
관리자와 사용자 세션을 분리 관리하며, localStorage 기반 세션 유지 및 DB 기반 검증을 수행합니다.

---

## 1. 관리자 세션 (`useAuth`)

### 1.1 로그인 프로세스
```typescript
// 1️⃣ RPC 호출: partner_login(username, password)
// 2️⃣ bcrypt 비밀번호 검증 (DB)
// 3️⃣ 파트너 정보 조회 (partners 테이블)
// 4️⃣ localStorage 저장: auth_token, auth_user
// 5️⃣ Lv1/Lv2: Invest & OroPlay API 보유금 동기화 (백그라운드)
```

### 1.2 인증 상태 유지
- **저장소**: localStorage (`auth_token`, `auth_user`)
- **초기 로딩**: 앱 시작 시 storage 확인 후 자동 인증
- **검증**: user.level 타입 체크

### 1.3 로그아웃
```typescript
// 1️⃣ authState 초기화
// 2️⃣ localStorage 정리 (auth_token, auth_user 제거)
```

### 1.4 권한 체크
- Lv0 (시스템관리자)
- Lv1 (대본사) - opcode, secret_key, api_token 필수 (API credentials 체크)
- Lv2 (본사) - API credentials 체크 안 함 (Lv1로부터 API별 입금만)
- Lv3 (부본사)
- Lv4 (총판)
- Lv5 (매장)
- Lv6 (관리자)

---

## 2. 사용자 세션 (`useUserAuth`)

### 2.1 로그인 프로세스
```typescript
// 1️⃣ RPC 호출: user_login(username, password)
// 2️⃣ bcrypt 비밀번호 검증 (DB)
// 3️⃣ 사용자 상태 확인 (status: active/blocked/pending)
// 4️⃣ localStorage 저장: user_session
// 5️⃣ user_sessions 테이블 기록 (login_at, is_active: true)
// 6️⃣ is_online: true 설정
```

### 2.2 인증 상태 유지
- **저장소**: localStorage (`user_session`)
- **검증**: DB 재확인 (users 테이블)
- **실시간 동기화**: Supabase Realtime 구독 (사용자 정보 업데이트)

### 2.3 로그아웃
```typescript
// 1️⃣ is_online: false 업데이트
// 2️⃣ user_sessions.is_active: false, logout_at 기록
// 3️⃣ localStorage 정리 (user_session 제거)
// 4️⃣ authState 초기화
```

### 2.4 사용자 상태 제한
- **blocked**: 로그인 거부
- **pending**: 승인 대기 (로그인 거부)
- **active**: 정상 로그인

---

## 3. 세션 정리 (`SessionCleanupContext`)

### 3.1 자동 정리 로직
```typescript
// 1️⃣ 초기 실행: 앱 시작 시 1회
// 2️⃣ 주기 실행: 1시간마다 (3600000ms)
// 3️⃣ RPC 호출: cleanup_old_ended_sessions()
// 4️⃣ 대상: logout_at 기준 4시간 경과한 세션
```

### 3.2 정리 대상
- **user_sessions** 테이블의 종료된 세션
- **is_active: false** + **logout_at > 4시간 전**

---

## 4. DB 테이블 구조

### 4.1 partners (관리자)
```sql
- id: UUID
- username: 로그인 ID
- password: bcrypt 해시
- level: 권한 레벨 (0~6)
- status: active/blocked
- opcode: Invest API (Lv1, Lv2만)
- secret_key: Invest API (Lv1, Lv2만)
- api_token: Invest API (Lv1, Lv2만)
- oroplay_agent_id: OroPlay API (Lv1, Lv2만)
- oroplay_agent_key: OroPlay API (Lv1, Lv2만)
```

### 4.2 users (사용자)
```sql
- id: UUID
- username: 로그인 ID
- password: bcrypt 해시
- status: active/blocked/pending
- balance: 잔고
- is_online: 온라인 상태
```

### 4.3 user_sessions (사용자 세션 기록)
```sql
- id: UUID
- user_id: 사용자 ID
- login_at: 로그인 시간
- logout_at: 로그아웃 시간
- is_active: 활성 여부
- ip_address: IP 주소
```

---

## 5. RPC 함수

### 5.1 partner_login(username, password)
```sql
-- bcrypt 비밀번호 검증
-- partners 테이블 조회
-- 반환: 파트너 정보 (배열)
```

### 5.2 user_login(username, password)
```sql
-- bcrypt 비밀번호 검증
-- users 테이블 조회
-- user_sessions 레코드 생성
-- 반환: 사용자 정보 (배열)
```

### 5.3 cleanup_old_ended_sessions()
```sql
-- 4시간 이상 경과한 종료 세션 삭제
-- 반환: 삭제된 세션 개수
```

---

## 6. 세션 보안

### 6.1 비밀번호 검증
- **bcrypt** 해싱 (DB 저장)
- **RPC 서버 측 검증** (클라이언트 측 평문 노출 방지)

### 6.2 토큰 관리
- 관리자: `partner-token-{id}` 형식
- 사용자: localStorage JSON 객체

### 6.3 다중 로그인 방지
- 현재 미구현 (필요 시 is_active 체크 추가)

---

## 7. 실시간 동기화

### 7.1 사용자 정보 실시간 구독
```typescript
supabase
  .channel('user_updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'users',
    filter: `id=eq.{user_id}`
  }, (payload) => {
    // 사용자 정보 자동 업데이트
    updateUser(payload.new);
  })
```

### 7.2 WebSocket 연동
- **주소**: wss://vi8282.com/ws
- **용도**: 관리자 ↔ 사용자 실시간 데이터 동기화
- **범위**: 입출금, 잔고, 배팅 기록, 메시지 등

---

## 8. 로그인 후 자동 동기화

### 8.1 관리자 (Lv1만)
- Invest API 보유금 조회 (`getInfo`)
- OroPlay API 보유금 조회 (`getAgentBalance`)
- `api_configs` 테이블 업데이트 (백그라운드 500ms 딜레이)
- ⚠️ **로딩 깜박임 없음**: 백그라운드에서 비동기 동기화
- ⚠️ **Lv2는 보유금 동기화 하지 않음**: Lv1만 외부 API 호출

### 8.2 사용자
- ⚠️ **자동 출금 방지**: 로그인 시 잔고 동기화 비활성화
- 💰 **마지막 보유금 유지**: DB 잔고 그대로 사용

---

## 9. 주의사항

### 9.1 로그아웃 처리
- 사용자는 반드시 **user_sessions** 테이블 업데이트
- 관리자는 localStorage 정리만 수행

### 9.2 세션 만료

#### 9.2.1 사용자 페이지 (구현 완료)
```typescript
// UserLayout.tsx - 30분 자동 로그아웃
// 1️⃣ balance_sync_started_at 기준 30분 경과 체크 (10초마다)
// 2️⃣ 30분 경과 시 is_online: false 업데이트
// 3️⃣ 자동 로그아웃 실행 (토스트 없음)
// 4️⃣ 수동 로그아웃/차단 처리 포함
```

**시나리오:**
- 로그인 후 30분 경과 시 자동 로그아웃 (토스트 표시 없음)
- 10초마다 경과 시간 체크
- 수동 로그아웃 시에도 동일한 로그아웃 처리

#### 9.2.2 관리자 페이지
- 현재 자동 만료 미구현
- 수동 로그아웃만 가능

### 9.3 API 동기화 시점

#### 9.3.1 관리자 로그인 시 (Lv1만)
- Invest API 보유금 조회 (백그라운드 500ms 딜레이)
- OroPlay API 보유금 조회 (백그라운드 500ms 딜레이)

#### 9.3.2 BalanceSyncManager (Lv1 전용)
```typescript
// 수동 실행 버튼 없음 - 자동 30초 주기 실행
// 1️⃣ GET /api/info: Lv1 자신의 보유금 동기화 (30초마다)
// 2️⃣ PATCH /api/account/balance: 온라인 게임 사용자만 보유금 일괄 조회 (30초마다)
//    ⭐ 최적화: game_launch_sessions의 active 세션 사용자만 동기화
//    ⭐ 오프라인 사용자는 DB 값 신뢰 (API 응답 무시)
// 3️⃣ GET /api/account/balance: 게임 중인 사용자 개별 조회 (10초 지연 후 30초마다)
//    ⭐ 최적화: game_launch_sessions의 active 세션 사용자만 조회
//    ⭐ is_online이 아닌 active 세션 기준으로 조회
```

#### 9.3.3 BettingHistorySync (Lv1 전용)
```typescript
// 배팅 기록 동기화 + 사용자 보유금 실시간 동기화
// ⭐ 베팅 기록은 온라인 게임 사용자만 발생하므로 자동으로 온라인 사용자만 동기화됨
// 1️⃣ Invest API historyindex: 10초 후부터 30초마다 호출
//    - 배팅 기록에 등장한 username은 모두 온라인 게임 중인 사용자
//    - GET /api/account/balance로 각 사용자 보유금 조회 후 DB 업데이트
// 2️⃣ OroPlay API by-date-v2: 10초 후부터 30초마다 호출 (limit 4000)
//    - 배팅 기록에 등장한 username은 모두 온라인 게임 중인 사용자
// 3️⃣ 비활성 세션 자동 종료: last_activity_at 240초(4분) 이상 경과 시 auto_ended
```

#### 9.3.4 입출금 처리 시
- 실시간 잔고 업데이트 (DB 직접 반영)

---

## 10. 구현 위치 및 중요 정책

### 10.1 파일 위치
| 기능 | 파일 경로 |
|------|----------|
| 관리자 인증 | `/hooks/useAuth.ts` |
| 사용자 인증 | `/hooks/useUserAuth.ts` |
| 세션 정리 | `/contexts/SessionCleanupContext.tsx` |
| 관리자 로그인 UI | `/components/admin/AdminLogin.tsx` |
| 사용자 로그인 UI | `/components/user/UserLogin.tsx` |

### 10.2 중요 정책
- **Lv1만 API 보유금 동기화**: Lv2는 API 보유금 동기화하지 않음 (모든 관리 시스템 일관성)
- **Lv2는 API credentials 없음**: Lv1로부터 API별 입금만 받음
- **Lv3~Lv7은 Seamless Wallet**: API 구분 없이 단일 balance만 사용

---

## 11. 플로우 차트

```
[사용자 로그인 요청]
    ↓
[user_login RPC 호출]
    ↓
[bcrypt 비밀번호 검증]
    ↓
[사용자 상태 확인]
    ├─ blocked → 로그인 거부
    ├─ pending → 로그인 거부
    └─ active → 계속
        ↓
    [user_sessions 레코드 생성]
        ↓
    [is_online: true 설정]
        ↓
    [localStorage 저장]
        ↓
    [Realtime 구독 시작]
        ↓
    [로그인 완료]
```

```
[관리자 로그인 요청]
    ↓
[partner_login RPC 호출]
    ↓
[bcrypt 비밀번호 검증]
    ↓
[파트너 정보 조회]
    ↓
[localStorage 저장]
    ↓
[Lv1/Lv2? API 보유금 동기화]
    ↓
[로그인 완료]
```

---

---

## 12. 게임 세션 관리 시스템

### 12.1 개요
Invest API와 OroPlay API를 사용하는 게임 세션을 관리하며, 사용자가 게임을 실행하면 세션이 생성되고 팝업 종료 시 세션이 종료됩니다.

### 12.2 DB 테이블 구조

#### game_launch_sessions
```sql
- id: UUID (PK)
- user_id: UUID (FK → users)
- game_id: BIGINT (게임 ID)
- opcode: VARCHAR (API opcode)
- launch_url: TEXT (게임 실행 URL)
- session_token: VARCHAR (세션 토큰)
- session_id: VARCHAR (세션 ID, 16자리 랜덤)
- balance_before: DECIMAL (게임 시작 전 잔고)
- launched_at: TIMESTAMPTZ (게임 시작 시간)
- ended_at: TIMESTAMPTZ (게임 종료 시간)
- last_activity_at: TIMESTAMPTZ (마지막 활동 시간)
- status: TEXT (active/ended/auto_ended)
- partner_id: UUID (FK → partners)
- api_type: TEXT (invest/oroplay)
```

### 12.3 세션 생성 프로세스

**⭐ 중요: API Credential 조회 규칙**

Lv7(사용자)가 게임을 실행할 때는 자신의 `referrer_id`를 따라 최상위 파트너(Lv1)까지 올라가서 해당 파트너의 `api_configs`에서 credential을 가져와야 합니다.

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

```typescript
// 1️⃣ 게임 클릭 시 활성 세션 체크
const activeSession = await supabase
  .from('game_launch_sessions')
  .select('api_type')
  .eq('user_id', userId)
  .eq('status', 'active')
  .single();

// 2️⃣ 다른 API 게임 실행 중이면 차단
if (activeSession && activeSession.api_type !== gameApiType) {
  showModal('현재 진행 중인 게임을 먼저 종료해주세요.');
  return;
}

// 3️⃣ ⭐ 사용자의 최상위(Lv1) 파트너 찾기
const { data: user } = await supabase
  .from('users')
  .select('username, referrer_id')
  .eq('id', userId)
  .single();

// referrer_id를 따라 parent_id 체인을 올라가서 Lv1 찾기
const topLevelPartnerId = await getTopLevelPartnerId(user.referrer_id);

// 4️⃣ ⭐ Lv1 파트너의 API Credential 조회
const { data: apiConfig } = await supabase
  .from('api_configs')
  .select('invest_opcode, invest_token, invest_secret_key, oroplay_secret, oroplay_token')
  .eq('partner_id', topLevelPartnerId)  // ✅ Lv1의 credential 사용
  .single();

// 5️⃣ 30초 내 중복 세션 생성 방지
// 6️⃣ 4시간 이내 같은 user_id + game_id의 ended 세션 재활성화
// 7️⃣ 새 세션 생성 (save_game_launch_session RPC)
```

### 12.4 세션 재활성화
```sql
-- 4시간 이내 종료된 세션을 재활성화
UPDATE game_launch_sessions
SET 
  status = 'active',
  launched_at = NOW(),
  last_activity_at = NOW(),
  ended_at = NULL
WHERE user_id = p_user_id
  AND game_id = p_game_id
  AND status IN ('ended', 'auto_ended')
  AND ended_at > NOW() - INTERVAL '4 hours'
```

### 12.5 비활성 세션 자동 종료
```typescript
// BettingHistorySync.tsx - 240초(4분) 동안 activity 없으면 auto_ended
// 1️⃣ last_activity_at < NOW() - 240초인 active 세션 조회
// 2️⃣ status: 'auto_ended', ended_at: NOW() 업데이트
// 3️⃣ 종료된 세션의 사용자 보유금 동기화
```

### 12.6 팝업 종료 감지
```typescript
// lib/popupManager.ts
export function monitorPopupClose(popup, userId, apiType) {
  const checkInterval = setInterval(async () => {
    if (popup.closed) {
      clearInterval(checkInterval);
      
      // 1️⃣ 세션 종료
      await endGameSession(userId, apiType);
      
      // 2️⃣ 잔고 즉시 동기화
      if (apiType === 'invest') {
        await syncInvestBalance(userId);
      } else {
        await syncOroPlayBalance(userId);
      }
      
      // 3️⃣ WebSocket 전파
      websocket.send({
        type: 'BALANCE_UPDATE',
        userId,
        apiType
      });
    }
  }, 1000);
}
```

### 12.7 게임 세션 플로우
```
[게임 실행 요청]
    ↓
[활성 세션 체크]
    ├─ 다른 API 게임 중 → 차단
    └─ 같은 API or 세션 없음 → 계속
        ↓
    [30초 내 중복 체크]
        ↓
    [4시간 내 종료 세션 찾기]
        ├─ 있음 → 재활성화
        └─ 없음 → 새 세션 생성
            ↓
        [게임 팝업 열기]
            ↓
        [팝업 모니터링 시작]
            ↓
        [1초마다 팝업 상태 체크]
            ├─ 열림 → 계속 체크
            └─ 닫힘 → 세션 종료 + 잔고 동기화
```

### 12.8 세션 상태 관리
- **active**: 게임 플레이 중
- **ended**: 정상 종료 (사용자가 팝업 닫음)
- **auto_ended**: 60초 동안 activity 없음
- **force_ended**: 관리자가 강제 종료 (실시간 현황 페이지에서 강제 종료 버튼 클릭)

#### 강제 종료 기능 (✅ 구현 완료)
```typescript
// ===== OnlineUsers.tsx - 관리자 페이지 =====
// 1️⃣ Lv7(사용자) 리스트에 강제 종료 버튼 표시
// 2️⃣ 단일 세션 강제 종료: status → 'force_ended', ended_at 업데이트
// 3️⃣ 강제 종료 후 사용자 보유금 즉시 동기화 (백그라운드)
// 4️⃣ 일괄 강제 종료: 선택한 여러 세션을 한 번에 종료
// 5️⃣ 각 사용자 보유금 자동 동기화

// ===== UserLayout.tsx - 사용자 페이지 =====
// 1️⃣ Supabase Realtime으로 game_launch_sessions 구독
// 2️⃣ status='force_ended' 감지 시 자동 처리:
//    - 게임 팝업 자동으로 닫기
//    - 보유금 즉시 동기화
//    - 토스트 알림: "네트워크 오류가 발생 되었습니다. 다시 시작해 주세요"
```

**구현 예시:**
```typescript
// UserLayout.tsx - Realtime Subscription
const channel = supabase
  .channel('force_ended_sessions')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'game_launch_sessions',
    filter: `user_id=eq.${user.id}`
  }, (payload) => {
    if (payload.new?.status === 'force_ended') {
      // 1. 게임 팝업 닫기
      closeGameWindow(payload.new.id);
      
      // 2. 보유금 동기화
      syncBalanceForSession(payload.new.id);
      
      // 3. 토스트 알림
      toast.error('네트워크 오류가 발생 되었습니다. 다시 시작해 주세요');
    }
  })
  .subscribe();

// OnlineUsers.tsx - 강제 종료 시 잔고 동기화
const handleKickUser = async () => {
  // 1. 세션 강제 종료
  await supabase
    .from('game_launch_sessions')
    .update({ status: 'force_ended', ended_at: now })
    .eq('id', sessionId);
  
  // 2. 보유금 동기화 (백그라운드)
  syncBalanceOnSessionEnd(userId, partnerId);
};
```

### 12.9 활동 시간 업데이트
```typescript
// 배팅 발생 시 last_activity_at 갱신
// reactivate_session_on_betting RPC 호출
// - 베팅이 발생하면 세션이 살아있다는 증거
// - last_activity_at을 NOW()로 업데이트
// - 60초 auto_ended 방지
```

### 12.10 API 타입별 세션 분리
- **game_sessions.api_type**: 'invest' | 'oroplay'
- **games.api_type**: 'invest' | 'oroplay'
- 사용자는 API를 의식하지 않지만, 내부적으로 분리 관리
- 다른 API 게임 실행 시 기존 세션 종료 필요

### 12.11 온라인 게임 사용자 잔고 동기화 정책 ⭐

**핵심 원칙:**
1. **온라인 게임 중인 사용자만 API 동기화 대상**
   - `game_launch_sessions`에 `status='active'` 세션이 있는 사용자
   - 베팅 기록은 온라인 게임 사용자만 발생하므로 자동으로 온라인 사용자만 동기화됨

2. **오프라인 사용자는 DB 값 신뢰**
   - PATCH API 응답에 포함되어도 업데이트하지 않음
   - 입금/출금 승인 시에만 DB 직접 업데이트
   - 로그인 시 외부 API 동기화 없음 (입금 후 balance 사라지는 문제 방지)

3. **동기화 타이밍**
   - 게임 시작 후 10초 후부터 동기화 시작
   - 이후 30초마다 정기 동기화
   - 게임 종료 시 즉시 최종 동기화

**구현 예시:**
```typescript
// BalanceSyncManager.tsx - PATCH API 호출 시
const { data: onlineGameSessions } = await supabase
  .from('game_launch_sessions')
  .select('user_id, users!inner(username)')
  .eq('status', 'active');

const onlineUsernames = [...new Set(onlineGameSessions.map(s => s.users?.username))];

// PATCH API 응답 중 온라인 사용자만 필터링
const targetUsernames = allUsernames.filter(username => 
  onlineUsernames.includes(username)
);

// 온라인 사용자만 DB 업데이트
for (const username of targetUsernames) {
  await supabase.from('users').update({ balance }).eq('username', username);
}
```

**이점:**
- ✅ 불필요한 DB 업데이트 최소화 (성능 향상)
- ✅ 입금 후 balance 사라지는 문제 방지 (오프라인 사용자는 DB 신뢰)
- ✅ 베팅 중인 사용자만 실시간 잔고 동기화 (정확성 향상)

### 12.12 구현 위치
| 기능 | 파일 경로 | 상태 |
|------|----------|------|
| 세션 생성 | `/database/save_game_launch_session.sql` | ✅ 구현 완료 |
| 세션 재활성화 | `/database/reactivate_session_on_betting.sql` | ✅ 구현 완료 |
| 비활성 세션 종료 | `/components/admin/BettingHistorySync.tsx` | ✅ 구현 완료 |
| 강제 종료 (관리자) | `/components/admin/OnlineUsers.tsx` | ✅ 구현 완료 |
| 강제 종료 감지 (사용자) | `/components/user/UserLayout.tsx` | ✅ 구현 완료 |
| 게임 실행 | `/components/user/UserCasino.tsx`, `/components/user/UserSlot.tsx` | ✅ 구현 완료 |
| 온라인 사용자 잔고 동기화 | `/components/admin/BalanceSyncManager.tsx` | ✅ 구현 완료 |

---

## 13. API 토큰 관리

### 13.1 Invest API 토큰
- **영구 토큰**: 대본사 생성 시 입력된 토큰값 사용
- **갱신 불필요**: 1회 설정 후 영구 유지
- **저장 위치**: `partners.api_token` (Lv1만)

### 13.2 OroPlay API 토큰 (✅ 구현 완료)
```typescript
// lib/oroplayApi.ts - refreshTokenIfNeeded()
// 1️⃣ 토큰 만료 5분 전 자동 체크
// 2️⃣ 만료 예정 시 자동으로 재발급 (createOroPlayToken)
// 3️⃣ api_configs.oroplay_token, oroplay_token_expires_at 업데이트
// 4️⃣ 모든 API 호출 시 자동으로 체크 및 갱신
```

**자동 갱신 로직:**
```typescript
async function refreshTokenIfNeeded(partnerId, config) {
  if (config.oroplay_token && config.oroplay_token_expires_at) {
    const expiresAt = new Date(config.oroplay_token_expires_at).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    // 만료 5분 전이면 기존 토큰 사용
    if (expiresAt - now > fiveMinutes) {
      return config.oroplay_token;
    }
  }
  
  // 만료 5분 전 or 토큰 없음 → 재발급
  const tokenData = await createOroPlayToken(clientId, clientSecret);
  
  // DB 업데이트
  await supabase
    .from('api_configs')
    .update({
      oroplay_token: tokenData.token,
      oroplay_token_expires_at: new Date(tokenData.expiration * 1000).toISOString()
    })
    .eq('partner_id', partnerId);
  
  return tokenData.token;
}
```

### 13.3 토큰 사용 시점
- OroPlay API 호출 전 `getOroPlayToken(partnerId)` 호출
- 내부에서 자동으로 만료 체크 및 갱신
- 개발자는 토큰 관리 신경 쓸 필요 없음

---

## 14. 개선 가능 항목

### 14.1 단기 (완료)
- [x] 세션 자동 만료 (무활동 30분) - 사용자 페이지 구현 완료
- [x] 비정상 종료 세션 복구 (60초 auto_ended) - 구현 완료
- [x] OroPlay 토큰 자동 갱신 (만료 5분 전) - 구현 완료
- [x] 관리자 강제 종료 기능 (force_ended) - 구현 완료
- [x] 강제 종료 시 Realtime 감지 및 팝업 닫기 - 구현 완료
- [x] 강제 종료 시 자동 잔고 동기화 - 구현 완료

### 14.2 장기
- [ ] JWT 토큰 기반 인증
- [ ] Refresh Token 구현 (Invest API용)
- [ ] 세션 활동 로그 (user_activity)
- [ ] 관리자 페이지 세션 자동 만료