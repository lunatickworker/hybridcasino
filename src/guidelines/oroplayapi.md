# OroPlay API 연동 가이드 (GMS 통합)

## 목차
1. [GMS 통합 개요](#gms-통합-개요)
2. [단일 지갑(Seamless Wallet) 시스템](#단일-지갑seamless-wallet-시스템) -> add_api_policy.md 참조
3. [게임 플로우](#게임-플로우) -> add.api_policy.md 참조
4. [OroPlay API 명세](#oroplay-api-명세)

---

## GMS 통합 개요

### 기본 정보
- **Base URL**: `https://bs.sxvwlkohlv.com/api/v2`
- **Proxy Server**: `https://vi8282.com/proxy` (모든 외부 API 호출 시 경유)
- **인증 방식**: Bearer Token
- **Content-Type**: `application/json`

### 지갑 구조
```
대본사 (System Admin)
├─ OroPlay API Balance (외부 지갑)
└─ GMS 내부 회계
   ├─ 파트너 Balance (partners.balance)
   └─ 사용자 Balance (users.balance)
```

---

## 단일 지갑(Seamless Wallet) 시스템

add_api_policy.md 참고.(내용 충돌시 add_api_policy.md 우선적용)

---


## OroPlay API 명세

### 기본 설정

#### Proxy를 통한 API 호출
```json
{
  "url": "https://bs.sxvwlkohlv.com/api/v2/auth/createtoken",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "clientId": "your_client_id",
    "clientSecret": "your_client_secret"
  }
}
```

---

## 참조 정보

### 오류 코드 (Error Codes)

| errorCode | Name | 설명 |
|-----------|------|------|
| 0 | NO_ERROR | 정상 처리 |
| 1 | USER_ALREADY_EXISTS | 사용자 계정이 이미 존재함 |
| 2 | USER_DOES_NOT_EXIST | 사용자 계정을 찾을 수 없음 |
| 3 | INSUFFICIENT_AGENT_BALANCE | Agent 잔고 부족 (대본사 OroPlay API 잔고 부족) |
| 4 | INSUFFICIENT_USER_BALANCE | 사용자 잔고 부족 |
| 5 | NO_BETTING_LOG_EXIST | 배팅 기록이 존재하지 않음 |
| 6 | DUPLICATE_TRANSACTION | 중복된 트랜잭션 코드 |
| 7 | INVALID_TRANSACTION | 이미 완료된 배팅 (재처리 불가) |
| 8 | BALANCE_LOG_DOES_NOT_EXIST | 잔고 기록이 존재하지 않음 |
| 9 | VENDOR_IS_UNDER_MAINTENANCE | 게임 공급사 점검 중 |
| 10 | GAME_IS_UNDER_MAINTENANCE | 게임 점검 중 |
| 20 | DEPRECATED_ENDPOINT | 사용 중단된 엔드포인트 |
| 400 | BAD_REQUEST | 잘못된 요청 형식 |
| 401 | UNAUTHORIZED | 인증 실패 (토큰 무효/만료) |
| 500 | UNKNOWN_SERVER_ERROR | 알 수 없는 서버 오류 |

**GMS 처리 가이드:**
- `errorCode: 3` 발생 시 → 대본사에게 OroPlay API 잔고 충전 요청
- `errorCode: 4` 발생 시 → 사용자에게 잔고 부족 안내
- `errorCode: 6, 7` 발생 시 → 중복 트랜잭션 방지 로직 점검
- `errorCode: 9, 10` 발생 시 → 해당 게임/공급사 비활성화 표시

---

### 지원 언어 코드 (Language Codes)

| Code | 언어 | English Name |
|------|------|--------------|
| en | 영어 | English |
| ko | 한국어 | Korean |
| ja | 일본어 | Japanese |
| zh | 중국어 | Chinese |
| th | 태국어 | Thai |
| vi | 베트남어 | Vietnamese |
| id | 인도네시아어 | Indonesian |
| ms | 말레이어 | Malay |
| hi | 힌디어 | Hindi |
| ar | 아랍어 | Arabic |
| ru | 러시아어 | Russian |
| tr | 터키어 | Turkish |
| de | 독일어 | German |
| fr | 프랑스어 | French |
| es | 스페인어 | Spanish |
| pt | 포르투갈어 | Portuguese |
| it | 이탈리아어 | Italian |
| nl | 네덜란드어 | Dutch |
| pl | 폴란드어 | Polish |
| cs | 체코어 | Czech |
| hu | 헝가리어 | Hungarian |
| ro | 루마니아어 | Romanian |
| bg | 불가리아어 | Bulgarian |
| hr | 크로아티아어 | Croatian |
| sk | 슬로바키아어 | Slovak |
| sl | 슬로베니아어 | Slovene |
| sq | 알바니아어 | Albanian |
| sv | 스웨덴어 | Swedish |
| da | 덴마크어 | Danish |
| fi | 핀란드어 | Finnish |
| et | 에스토니아어 | Estonian |
| lt | 리투아니아어 | Lithuanian |
| lv | 라트비아어 | Latvian |
| uk | 우크라이나어 | Ukrainian |
| el | 그리스어 | Greek |
| he | 히브리어 | Hebrew |
| hy | 아르메니아어 | Armenian |
| ka | 조지아어 | Georgian |
| mn | 몽골어 | Mongolian |
| ca | 카탈루냐어 | Catalan |

**GMS 적용:**
- 게임 실행 시 `language` 파라미터로 사용
- 사용자 프로필 설정에서 선택 가능
- 기본값: `ko` (한국어)

---

### 지원 통화 코드 (Currency Codes)

| Symbol | Code | 통화명 | English Name |
|--------|------|--------|--------------|
| ₩ | KRW | 대한민국 원 | South Korean Won |
| $ | USD | 미국 달러 | US Dollar |
| ฿ | THB | 태국 바트 | Thai Baht |
| ₹ | INR | 인도 루피 | Indian Rupee |
| JP¥ | JPY | 일본 엔 | Japanese Yen |
| ₮ | MNT | 몽골 투그릭 | Mongolian Tugrik |
| R$ | BRL | 브라질 헤알 | Brazilian Real |
| CN¥ | CNY | 중국 위안 | Chinese Yuan |
| đ | VND | 베트남 동 | Vietnamese Dong |
| ₺ | TRY | 터키 리라 | Turkish Lira |
| Rp | IDR | 인도네시아 루피아 | Indonesian Rupiah |
| ₱ | PHP | 필리핀 페소 | Philippine Peso |
| € | EUR | 유로 | Euro |
| $AR | ARS | 아르헨티나 페소 | Argentine Peso |
| R | ZAR | 남아프리카 랜드 | South African Rand |
| DT | TND | 튀니지 디나르 | Tunisia Dinar |
| ₦ | NGN | 나이지리아 나이라 | Nigerian Naira |
| S/ | PEN | 페루 솔 | Peruvian Sol |
| $U | UYU | 우루과이 페소 | Uruguayan Peso |
| Col$ | COP | 콜롬비아 페소 | Colombian Peso |
| Bs | BOB | 볼리비아 볼리비아노 | Bolivian Boliviano |
| $ | CLP | 칠레 페소 | Chilean Peso |
| Mex$ | MXN | 멕시코 페소 | Mexican Peso |
| RM | MYR | 말레이시아 링깃 | Malaysian Ringgit |
| ৳ | BDT | 방글라데시 타카 | Bangladeshi Taka |
| AU$ | AUD | 호주 달러 | Australian Dollar |
| K | MMK | 미얀마 짯 | Myanmar Kyat |
| ₭ | LAK | 라오스 킵 | Lao Kip |
| ₲ | PYG | 파라과이 과라니 | Paraguayan Guarani |
| NT$ | TWD | 대만 달러 | New Taiwan Dollar |
| ₽ | RUB | 러시아 루블 | Russian Ruble |
| Rs | PKR | 파키스탄 루피 | Pakistani Rupee |
| £ | EGP | 이집트 파운드 | Egyptian Pound |
| Лв | UZS | 우즈베키스탄 숨 | Uzbekistani Som |

**GMS 기본 설정:**
- 기본 통화: `KRW` (대한민국 원)
- 통화 단위는 파트너 생성 시 설정
- 모든 금액 표시 시 해당 통화 심볼 자동 표시

---

### 1. 인증 API

#### 1.1 토큰 생성
```
POST /auth/createtoken
Rate Limit: 5회/30초
```

**Request:**
```json
{
  "clientId": "your_client_id",
  "clientSecret": "your_client_secret"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzUxMiI...",
  "expiration": 1716257131
}
```

**주의사항:**
- 토큰은 만료 시간 전에 재발급 필요
- 과도한 토큰 생성 시 계정 차단 가능

---

### 2. 게임 관리 API

#### 2.1 게임 공급사 목록 조회
```
GET /vendors/list
Headers: Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": [
    {
      "vendorCode": "slot-pragmatic",
      "type": 2,
      "name": "Pragmatic Slot"
    },
    {
      "vendorCode": "casino-evolution",
      "type": 1,
      "name": "Evolution Gaming"
    }
  ],
  "errorCode": 0
}
```

**게임 타입 (type):**
- `1`: Live Casino (라이브 카지노) → GMS `game_type='casino'`
- `2`: Slot (슬롯) → GMS `game_type='slot'`
- `3`: Mini-Game (미니게임) → GMS `game_type='minigame'`

**GMS 연동:**
- `game_providers` 테이블과 매핑
- `vendor_type` 컬럼으로 분류
- 파트너별 활성화 게임사 관리
- **사용자 페이지**: 카지노/슬롯/미니게임 3개 탭으로 구분
- **관리자 페이지**: Invest와 OroPlay 각각 카지노/슬롯/미니게임으로 6개 탭 구분

---

#### 2.2 게임 목록 조회
```
POST /games/list
Headers: Authorization: Bearer {token}
```

**Request:**
```json
{
  "vendorCode": "casino-evolution",
  "language": "ko"
}
```

**Parameters:**
- `vendorCode`: 게임 공급사 코드 (필수)
- `language`: 언어 코드 (필수) - [지원 언어 코드](#지원-언어-코드-language-codes) 참조

**Response:**
```json
{
  "success": true,
  "message": [
    {
      "provider": "Evolution",
      "vendorCode": "casino-evolution",
      "gameId": "",
      "gameCode": "lobby",
      "gameName": "Lobby",
      "slug": "evolution-lobby",
      "thumbnail": "https://www.evolution.com/...",
      "updatedAt": "2024-05-20T10:36:40.980Z",
      "isNew": false,
      "underMaintenance": false
    }
  ],
  "errorCode": 0
}
```

---

#### 2.3 게임 실행 URL 생성
```
POST /game/launch-url
Headers: Authorization: Bearer {token}
```

**Request:**
```json
{
  "vendorCode": "casino-evolution",
  "gameCode": "lobby",
  "userCode": "user123",
  "language": "ko",
  "lobbyUrl": "https://yourdomain.com",
  "theme": 1
}
```

**Parameters:**
- `vendorCode`: 게임 공급사 코드 (필수)
- `gameCode`: 게임 코드 (필수)
- `userCode`: 사용자 ID (필수) - GMS의 users.username
- `language`: 언어 코드 (필수) - [지원 언어 코드](#지원-언어-코드-language-codes) 참조
- `lobbyUrl`: 로비 URL (선택) - 일부 게임사에서 게임 종료 시 리다이렉트
- `theme`: 테마 번호 (선택)

**Response:**
```json
{
  "success": true,
  "message": "https://evolution.api-endpoint.com/entry?jsessionid=...",
  "errorCode": 0
}
```

---

### 3. 사용자 관리 API (Transfer)

#### 3.1 사용자 계정 생성
```
POST /user/create
Headers: Authorization: Bearer {token}
```

**Request:**
```json
{
  "userCode": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "errorCode": 0
}
```

**GMS 연동 시점:**
- 회원가입 시 자동으로 모든 API 계정 생성
- 실패 시 users.api_account_status = 'failed'로 표시

---

#### 3.2 잔고 조회
```
POST /user/balance
Headers: Authorization: Bearer {token}
```

**Request:**
```json
{
  "userCode": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "message": 1000.00,
  "errorCode": 0
}
```

---

#### 3.3 입금 (게임 시작 시)
```
POST /user/deposit
Headers: Authorization: Bearer {token}
```

**Request:**
```json
{
  "userCode": "user123",
  "balance": 50000.00,
  "orderNo": "ORDER_12345",
  "vendorCode": "casino-evolution"
}
```

**Parameters:**
- `userCode`: 사용자 ID (필수)
- `balance`: 입금 금액 (필수) - 숫자만, 통화 단위는 Agent 설정 따름
- `orderNo`: 주문 번호 (선택) - GMS 트랜잭션 ID 권장
- `vendorCode`: 게임 공급사 코드 (선택) - 분리 지갑 사용 시 필수

**Response:**
```json
{
  "success": true,
  "message": 50000.00,
  "errorCode": 0
}
```

**GMS 처리 순서:**
1. 사용자 보유금 검증 (users.balance >= 입금액)
2. 소속 파트너 보유금 검증 (partners.balance >= 입금액)
3. GMS 출금 처리 (users.balance 차감)
4. GMS 출금 처리 (partners.balance 차감)
5. transactions 기록 ('game_deposit')
6. OroPlay API 호출
7. 성공 시 게임 URL 생성
8. 실패 시 GMS 롤백

**오류 처리:**
- `errorCode: 3` → Agent 잔고 부족 (시스템 관리자에게 알림)
- `errorCode: 6` → 중복 orderNo (재시도 방지)

---

#### 3.4 출금 (게임 종료 시)
```
POST /user/withdraw-all
Headers: Authorization: Bearer {token}
```

**Request:**
```json
{
  "userCode": "user123",
  "vendorCode": "casino-evolution"
}
```

**Parameters:**
- `userCode`: 사용자 ID (필수)
- `vendorCode`: 게임 공급사 코드 (선택) - 분리 지갑 사용 시 필수

**Response:**
```json
{
  "success": true,
  "message": 45000.00,
  "errorCode": 0
}
```

**GMS 처리 순서:**
1. OroPlay API 호출 (사용자 게임 계정 잔고 전액 회수)
2. 회수 금액 확인
3. GMS 입금 처리 (users.balance 업데이트)
4. GMS 입금 처리 (partners.balance 업데이트)
5. transactions 기록 ('game_withdraw')
6. 게임 세션 종료 처리

**손익 계산:**
- 손실: 회수 금액 < 입금 금액
- 수익: 회수 금액 > 입금 금액
- 무승부: 회수 금액 = 입금 금액

**오류 처리:**
- `errorCode: 2` → 사용자 계정 없음
- `errorCode: 5` → 배팅 기록 없음 (게임 미진행)

---

### 4. 배팅 내역 API

#### 4.1 배팅 내역 조회 (날짜 기준)
```
POST /betting/history/by-date-v2
Headers: Authorization: Bearer {token}
Rate Limit: 1회/1초
```

**Request:**
```json
{
  "vendorCode": "casino-evolution",
  "startDate": "2024-01-01T00:00:00",
  "limit": 5000
}
```

**Parameters:**
- `vendorCode`: 게임 공급사 코드 (선택) - 미입력 시 전체 조회
- `startDate`: 조회 시작 시간 (필수) - UTC+0 기준, 최대 7일 전까지
- `limit`: 최대 조회 개수 (필수) - 최대 5000개

**Response:**
```json
{
  "success": true,
  "message": {
    "nextStartDate": "2024-01-01T12:00:00",
    "limit": 5000,
    "histories": [
      {
        "id": 12345,
        "userCode": "user123",
        "roundId": "1713765639547",
        "gameCode": "lobby",
        "vendorCode": "casino-evolution",
        "betAmount": 1000.00,
        "winAmount": 1500.00,
        "beforeBalance": 50000.00,
        "afterBalance": 50500.00,
        "detail": "",
        "status": 1,
        "createdAt": 1713765639,
        "updatedAt": 1713765639
      }
    ]
  },
  "errorCode": 0
}
```

**배팅 상태 (status):**
- `0`: Unfinished (진행 중) - 아직 결과가 나오지 않음
- `1`: Finished (완료) - 정상 완료
- `2`: Canceled (취소) - 배팅 취소

**GMS 연동:**
- `game_records` 테이블에 저장
- 중복 방지: `roundId` 기준으로 체크
- 자동 동기화: 게임 종료 후 즉시 조회
- 주기적 동기화: 1분마다 최근 기록 재확인

**주의사항:**
- Rate Limit 준수 (1초당 1회)
- `nextStartDate`를 다음 조회 시작점으로 사용
- 7일 이내 데이터만 조회 가능

---

### 5. Agent 관리 API

#### 5.1 Agent 잔고 조회
```
GET /agent/balance
Headers: Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": 1000000.00,
  "errorCode": 0
}
```

**GMS 연동:**
- 대본사의 OroPlay API 잔고 확인
- 30초마다 자동 동기화
- `api_configs` 테이블의 `balance` 컬럼에 저장
- 잔고 부족 시 시스템 관리자에게 알림

**중요:**
이 잔고는 대본사의 OroPlay Agent 계정 잔고입니다. 
모든 하위 사용자가 게임 시작 시 이 잔고에서 차감되므로, 
충분한 잔고 유지가 필수입니다.

---

### 6. RTP 관리 API

#### 6.1 사용자별 RTP 설정
```
POST /game/user/set-rtp
Headers: Authorization: Bearer {token}
```

**Request:**
```json
{
  "vendorCode": "slot-pragmatic",
  "userCode": "user123",
  "rtp": 90
}
```

**Parameters:**
- `vendorCode`: 게임 공급사 코드 (필수)
- `userCode`: 사용자 ID (필수)
- `rtp`: RTP 값 (필수) - 30 ~ 99 범위

**Response:**
```json
{
  "success": true,
  "errorCode": 0
}
```

**RTP (Return To Player):**
- 30 ~ 99 사이의 정수
- 높을수록 플레이어에게 유리
- 슬롯 게임에만 적용 (카지노는 미지원)

**GMS 활용:**
- 관리자가 특정 사용자의 당첨 확률 조정
- VIP 회원 우대 정책 적용
- 이벤트 기간 RTP 상향 조정

---

#### 6.2 전체 사용자 RTP 초기화
```
POST /game/users/reset-rtp
Headers: Authorization: Bearer {token}
```

**Request:**
```json
{
  "vendorCode": "slot-pragmatic",
  "rtp": 85
}
```

**Parameters:**
- `vendorCode`: 게임 공급사 코드 (필수)
- `rtp`: 기본 RTP 값 (필수) - 30 ~ 99 범위

**Response:**
```json
{
  "success": true,
  "message": 85,
  "errorCode": 0
}
```

**주의사항:**
- 해당 게임사의 **모든 사용자** RTP가 동일한 값으로 설정됨
- 개별 설정된 RTP는 모두 초기화됨
- 신중하게 사용 필요

---

#### 6.3 일괄 RTP 설정
```
POST /game/users/batch-rtp
Headers: Authorization: Bearer {token}
Rate Limit: 1회/3초
```

**Request:**
```json
{
  "vendorCode": "slot-pragmatic",
  "data": [
    {
      "userCode": "user123",
      "rtp": 90
    },
    {
      "userCode": "user456",
      "rtp": 85
    }
  ]
}
```

**Parameters:**
- `vendorCode`: 게임 공급사 코드 (필수)
- `data`: 사용자별 RTP 배열 (필수)
  - `userCode`: 사용자 ID
  - `rtp`: RTP 값 (30 ~ 99)

**Response:**
```json
{
  "success": true,
  "errorCode": 0
}
```

**제약사항:**
- 최대 500명까지 한 번에 설정 가능
- Rate Limit: 1회/3초
- 대량 설정 시 활용

**GMS 활용:**
- VIP 등급별 RTP 일괄 설정
- 이벤트 대상자 RTP 조정
- 신규 회원 RTP 상향 조정

---

## 응답 처리 가이드

### API 응답 구조
모든 OroPlay API는 다음 구조로 응답합니다:
```json
{
  "success": true/false,
  "message": "데이터 또는 설명",
  "errorCode": 0
}
```

### 오류 처리 예시
```javascript
// GMS에서 권장하는 오류 처리 방식
const response = await callOroPlayAPI(endpoint, params);

switch (response.errorCode) {
  case 0:
    // 정상 처리
    return response.message;
  
  case 3:
    // Agent 잔고 부족 - 대본사에게 충전 요청
    await notifySystemAdmin('OroPlay API 잔고 부족');
    throw new Error('시스템 점검 중입니다');
  
  case 4:
    // User 잔고 부족
    throw new Error('보유금이 부족합니다');
  
  case 7:
    // 중복 트랜잭션
    console.warn('중복 트랜잭션 방지:', params);
    return null;
  
  case 9:
  case 10:
    // 게임/공급사 점검 중
    await disableGame(params.gameCode);
    throw new Error('해당 게임은 점검 중입니다');
  
  default:
    // 기타 오류
    await logError(response);
    throw new Error('일시적인 오류가 발생했습니다');
}
```

---

## Rate Limiting

### Endpoint별 제한
| Endpoint | Limit | Time Window |
|----------|-------|-------------|
| POST /auth/createtoken | 5회 | 30초 |
| POST /betting/history/by-date-v2 | 1회 | 1초 |
| POST /game/users/batch-rtp | 1회 | 3초 |

### 응답 헤더
```
X-RateLimit-Limit: 5           // 시간당 최대 요청 수
X-RateLimit-Remaining: 3       // 남은 요청 수
X-RateLimit-Reset: 1716257131  // 리셋 시각 (Unix timestamp)
```

**GMS 구현:**
- Rate Limit 초과 시 대기 후 재시도
- 남은 요청 수 모니터링
- 429 에러 발생 시 자동 대기

---

## GMS 데이터베이스 연동

### users 테이블
```sql
-- API 계정 상태 추가
ALTER TABLE users ADD COLUMN api_account_status JSONB DEFAULT '{
  "oroplay": {
    "status": "pending",
    "userCode": null,
    "createdAt": null,
    "error": null
  }
}'::jsonb;
```

### 상태 값
- `pending`: 계정 생성 대기
- `active`: 정상 작동
- `failed`: 생성 실패

### 트랜잭션 타입
- `game_deposit`: 게임 시작 시 GMS → API 이동
- `game_withdraw`: 게임 종료 시 API → GMS 이동

---

## 구현 체크리스트

### 회원가입 시
- [ ] OroPlay 사용자 계정 생성 (POST /user/create)
- [ ] users.api_account_status 업데이트
- [ ] 실패 시 관리자 페이지에 알림

### 게임 시작 시
- [ ] 사용자/파트너 보유금 검증
- [ ] GMS 출금 처리 (users/partners balance 차감)
- [ ] OroPlay 입금 API 호출 (POST /user/deposit)
- [ ] transactions 기록 ('game_deposit')
- [ ] 게임 URL 생성 (POST /game/launch-url)

### 게임 종료 시
- [ ] OroPlay 출금 API 호출 (POST /user/withdraw-all)
- [ ] GMS 입금 처리 (users/partners balance 업데이트)
- [ ] transactions 기록 ('game_withdraw')
- [ ] 최종 잔고 동기화

### 주기적 작업
- [ ] Agent Balance 동기화 (30초마다)
- [ ] 배팅 내역 동기화 (실시간)
- [ ] 토큰 갱신 (만료 전)

---

## 주의사항

### 1. 잔고 불일치 방지
- 게임 시작/종료는 원자적 트랜잭션으로 처리
- 실패 시 롤백 메커니즘 구현
- 주기적으로 GMS와 API 잔고 대조

### 2. 동시성 제어
- 사용자가 동시에 여러 게임 시작 불가
- 파트너 보유금 초과 방지

### 3. 오류 처리
- API 호출 실패 시 재시도 로직
- 최대 3회 재시도 후 관리자 알림
- 모든 오류를 로그에 기록

### 4. Rate Limiting 준수
- 배팅 내역 조회는 1초당 1회만
- 토큰 생성은 30초당 5회만
- 초과 시 429 에러 발생

---

---

## 실전 통합 예시

### 게임 시작 전체 플로우
```javascript
// 1. 사용자 게임 시작 요청
async function launchGame(userId, gameCode, vendorCode) {
  try {
    // 1-1. 사용자 정보 조회
    const user = await getUser(userId);
    const partner = await getPartner(user.referrer_id);
    
    // 1-2. 보유금 검증
    const gameAmount = user.balance; // 전액 이동
    if (gameAmount > partner.balance) {
      throw new Error('소속 파트너 보유금 부족');
    }
    
    // 1-3. GMS 출금 처리 (원자적 트랜잭션)
    await supabase.rpc('start_game_transaction', {
      p_user_id: userId,
      p_amount: gameAmount,
      p_game_code: gameCode
    });
    
    // 1-4. OroPlay API 토큰 조회/갱신
    const token = await getOrRefreshToken();
    
    // 1-5. OroPlay API 입금
    const depositResponse = await proxyCall({
      url: 'https://bs.sxvwlkohlv.com/api/v2/user/deposit',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: {
        userCode: user.username,
        balance: gameAmount,
        orderNo: `GAME_${Date.now()}`,
        vendorCode: vendorCode
      }
    });
    
    // 1-6. 오류 처리
    if (depositResponse.errorCode !== 0) {
      await rollbackGameTransaction(userId);
      throw new Error(getErrorMessage(depositResponse.errorCode));
    }
    
    // 1-7. 게임 URL 생성
    const launchResponse = await proxyCall({
      url: 'https://bs.sxvwlkohlv.com/api/v2/game/launch-url',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: {
        vendorCode: vendorCode,
        gameCode: gameCode,
        userCode: user.username,
        language: 'ko',
        lobbyUrl: 'https://yourdomain.com',
        theme: 1
      }
    });
    
    // 1-8. 게임 세션 기록
    await createGameSession({
      userId: userId,
      gameCode: gameCode,
      depositAmount: gameAmount,
      status: 'playing'
    });
    
    return launchResponse.message; // 게임 URL
    
  } catch (error) {
    console.error('게임 시작 오류:', error);
    throw error;
  }
}

// 2. 게임 종료
async function endGame(userId, vendorCode) {
  try {
    const token = await getOrRefreshToken();
    
    // 2-1. OroPlay API 출금 (전액 회수)
    const withdrawResponse = await proxyCall({
      url: 'https://bs.sxvwlkohlv.com/api/v2/user/withdraw-all',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: {
        userCode: user.username,
        vendorCode: vendorCode
      }
    });
    
    if (withdrawResponse.errorCode !== 0) {
      throw new Error(getErrorMessage(withdrawResponse.errorCode));
    }
    
    const finalAmount = withdrawResponse.message;
    
    // 2-2. GMS 입금 처리
    await supabase.rpc('end_game_transaction', {
      p_user_id: userId,
      p_amount: finalAmount
    });
    
    // 2-3. 배팅 내역 동기화
    await syncBettingHistory(userId, vendorCode);
    
    // 2-4. 게임 세션 종료
    await updateGameSession({
      userId: userId,
      withdrawAmount: finalAmount,
      status: 'ended'
    });
    
    return {
      success: true,
      finalBalance: finalAmount
    };
    
  } catch (error) {
    console.error('게임 종료 오류:', error);
    throw error;
  }
}

// 3. Proxy 서버 호출
async function proxyCall(config) {
  const response = await fetch('https://vi8282.com/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });
  
  return await response.json();
}

// 4. 오류 메시지 변환
function getErrorMessage(errorCode) {
  const messages = {
    1: '이미 존재하는 계정입니다',
    2: '존재하지 않는 계정입니다',
    3: '시스템 점검 중입니다 (잔고 부족)',
    4: '보유금이 부족합니다',
    5: '배팅 기록이 없습니다',
    6: '중복된 요청입니다',
    7: '이미 완료된 배팅입니다',
    9: '게임사 점검 중입니다',
    10: '게임 점검 중입니다',
    400: '잘못된 요청입니다',
    401: '인증에 실패했습니다',
    500: '서버 오류가 발생했습니다'
  };
  
  return messages[errorCode] || '알 수 없는 오류가 발생했습니다';
}
```

---

## 문의

**기술 지원:** OroPlay 기술팀 / GMS 개발팀  
**문서 버전:** 3.0 (2025-01-03 업데이트)  
**마지막 수정:** currency_for_oroplayapi.md 통합 완료
