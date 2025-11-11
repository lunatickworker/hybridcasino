# 게임 플랫폼 관리 시스템

## 📋 프로젝트 개요

Invest API와 OroPlay API를 통한 이중 슬롯 게임 제공사 관리 시스템입니다. 7단계 권한 체계(시스템관리자→대본사→본사→부본사→총판→매장→사용자)와 Seamless Wallet 통합을 제공합니다.

---

## 🎯 주요 기능

### 1. 이중 API 게임 제공
- **Invest API**: 카지노, 슬롯
- **OroPlay API**: 카지노, 슬롯, 미니게임

### 2. 7단계 권한 체계
| 레벨 | 명칭 | 지갑 구조 | 설명 |
|------|------|----------|------|
| Lv1 | 시스템관리자 | 2개 (Invest, OroPlay) | API credentials 보유, 외부 API 직접 관리 |
| Lv2 | 대본사 | 2개 (Invest, OroPlay) | API credentials 없음, Lv1로부터 API별 입금 |
| Lv3 | 본사 | **2개 (DB) + 1개 (UI)** | **이중 API 통합 관리** ⭐ |
| Lv4 | 부본사 | 1개 (Seamless) | 단일 지갑 |
| Lv5 | 총판 | 1개 (Seamless) | 단일 지갑 |
| Lv6 | 매장 | 1개 (Seamless) | 단일 지갑 |
| Lv7 | 사용자 | 1개 (Seamless) | 게임 플레이 |

### 3. Seamless Wallet 시스템
- **실시간 동기화**: Realtime Subscription (WebSocket)
- **자동 동기화**: 30초 주기 (Lv1만)
- **지연 차감**: Lv1, Lv2는 게임 플레이 시점에 API 차감
- **즉시 차감**: Lv3~6은 입금 시점에 즉시 차감

---

## 🚀 최신 업데이트

### ⭐ Lv3 이중 API 입출금 시스템 v1.1 (2025-01-10)
Lv3 본사가 두 개의 API(Invest, OroPlay)를 동시에 관리할 수 있도록 입출금 로직을 개선했습니다.

**핵심 기능**:
1. **입금**: 두 API 모두 동시 처리
2. **회수**: 선택한 API만 처리 (모달에서 선택)
3. **UI**: `balance` 하나만 표시 (자동 계산: invest_balance + oroplay_balance)
4. **로그**: 각자의 입장에서만 거래 기록 (중복 제거) ✨ NEW

**v1.1 수정 사항** (2025-01-10):
- ✅ 입출금 내역 중복 기록 문제 해결
- ✅ "나의 입장" 원칙 적용: 입금 받는 사람만 입금 로그, 출금하는 사람만 출금 로그
- ✅ 모든 레벨(Lv1~Lv7) 입출금에 적용

📄 **상세 문서**: [`/LV3_DUAL_API_TRANSACTION.md`](/LV3_DUAL_API_TRANSACTION.md)

---

## 📁 문서 구조

### 핵심 문서 (시작 가이드)
| 문서 | 설명 | 대상 |
|------|------|------|
| [LV3_DUAL_API_TRANSACTION.md](/LV3_DUAL_API_TRANSACTION.md) | Lv3 이중 API 입출금 시스템 완료 보고서 | 전체 |
| [QUICK_REFERENCE.md](/QUICK_REFERENCE.md) | 제공사 상태 관리 빠른 참조 가이드 | 관리자 |
| [Guidelines.md](/guidelines/Guidelines.md) | Invest API 연동 메뉴얼 | 개발자 |

### 가이드라인 (/guidelines/)
| 문서 | 설명 |
|------|------|
| [deposit_withdrawal_logic.md](/guidelines/deposit_withdrawal_logic.md) | 입출금 로직 완전 가이드 |
| [seamless_wallet_integration.md](/guidelines/seamless_wallet_integration.md) | Seamless Wallet 설계 |
| [api_enable_settings.md](/guidelines/api_enable_settings.md) | API 설정 가이드 |
| [oroplayapi.md](/guidelines/oroplayapi.md) | OroPlay API 명세 |
| [menufunction.md](/guidelines/menufunction.md) | 메뉴 기능 명세 |
| [add_api_policy.md](/guidelines/add_api_policy.md) | API 정책 및 파트너 생성 |

### 지갑 관리 문서 (/docs/wallet-management/)
| 문서 | 설명 |
|------|------|
| [README.md](/docs/wallet-management/README.md) | 지갑 관리 시스템 개요 |
| [SUMMARY.md](/docs/wallet-management/SUMMARY.md) | 전체 작업 요약 |
| [VERIFICATION_GUIDE.md](/docs/wallet-management/VERIFICATION_GUIDE.md) | 검증 가이드 |
| [BUG_FIX_REPORT.md](/docs/wallet-management/BUG_FIX_REPORT.md) | 버그 수정 리포트 |
| [DATABASE_SCHEMA.md](/docs/wallet-management/DATABASE_SCHEMA.md) | DB 스키마 |

### 게임 관리 문서 (/docs/game-management/)
| 문서 | 설명 |
|------|------|
| [README.md](/docs/game-management/README.md) | 게임 관리 개요 |
| [GAME_MANAGEMENT_GUIDE.md](/docs/game-management/GAME_MANAGEMENT_GUIDE.md) | 게임 관리 가이드 |

### 릴리즈 노트
| 문서 | 설명 |
|------|------|
| [RELEASE_NOTES_v2.0.0.md](/RELEASE_NOTES_v2.0.0.md) | v2.0.0 릴리즈 노트 |
| [PROVIDER_STATUS_FEATURE.md](/PROVIDER_STATUS_FEATURE.md) | 제공사 상태 관리 기능 |
| [IMPLEMENTATION_CHECKLIST.md](/IMPLEMENTATION_CHECKLIST.md) | 구현 체크리스트 |

---

## 🔧 기술 스택

### 프론트엔드
- **React** (TypeScript)
- **Tailwind CSS** (v4.0)
- **Shadcn/ui** (컴포넌트 라이브러리)
- **Lucide React** (아이콘)
- **Recharts** (차트)

### 백엔드
- **Supabase** (PostgreSQL + Realtime + Auth)
- **WebSocket** (실시간 통신)
- **Proxy Server** (https://vi8282.com/proxy)

### 외부 API
- **Invest API** (https://api.invest-ho.com)
- **OroPlay API**

---

## 📂 프로젝트 구조

```
/
├── App.tsx                          # 메인 엔트리포인트
├── components/
│   ├── admin/                       # 관리자 컴포넌트
│   │   ├── Dashboard.tsx            # 대시보드
│   │   ├── UserManagement.tsx       # 사용자 관리 (강제 입출금)
│   │   ├── PartnerManagement.tsx    # 파트너 관리 (파트너 간 입출금)
│   │   ├── BettingManagement.tsx    # 베팅 관리
│   │   ├── EnhancedGameManagement.tsx # 게임 관리
│   │   ├── ForceTransactionModal.tsx # 입출금 모달 (API 선택)
│   │   └── ...
│   ├── user/                        # 사용자 컴포넌트
│   │   ├── UserCasino.tsx           # 카지노 게임
│   │   ├── UserSlot.tsx             # 슬롯 게임
│   │   ├── UserMiniGame.tsx         # 미니게임
│   │   ├── UserDeposit.tsx          # 입금 신청
│   │   ├── UserWithdraw.tsx         # 출금 신청
│   │   └── ...
│   ├── common/                      # 공통 컴포넌트
│   └── ui/                          # Shadcn UI 컴포넌트
├── contexts/
│   ├── AuthContext.tsx              # 인증 Context
│   ├── BalanceContext.tsx           # 보유금 Context (Realtime)
│   ├── WebSocketContext.tsx         # WebSocket Context
│   └── SessionCleanupContext.tsx    # 세션 정리 Context
├── lib/
│   ├── investApi.ts                 # Invest API 호출
│   ├── oroplayApi.ts                # OroPlay API 호출
│   ├── gameApi.ts                   # 게임 API 호출
│   └── supabase.ts                  # Supabase 클라이언트
├── database/
│   ├── 400_reset_game_tables.sql    # 게임 테이블 초기화
│   ├── 401_update_game_providers_schema.sql # 제공사 스키마 업데이트
│   ├── 500_auto_update_lv1_lv2_balance.sql # Lv1/Lv2 보유금 트리거
│   ├── 600_add_api_enable_settings.sql # API 설정 추가
│   └── 700_add_lv3_generated_balance.sql # Lv3 balance 자동 계산 트리거 ⭐
├── guidelines/                      # 가이드라인 문서
├── docs/                            # 상세 문서
│   ├── wallet-management/           # 지갑 관리 문서
│   └── game-management/             # 게임 관리 문서
└── README.md                        # 이 파일
```

---

## 🚀 빠른 시작

### 1. Supabase 설정
```bash
# 환경 변수 설정
VITE_SUPABASE_URL=https://hduofjzsitoaujyjvuix.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. DB 마이그레이션 (필수!)

#### 2.1. Lv1, Lv2 보유금 자동 계산 트리거
```sql
-- Supabase SQL Editor에서 실행
-- 파일: /database/500_auto_update_lv1_lv2_balance.sql
```

#### 2.2. Lv3 보유금 자동 계산 트리거 ⭐ (신규)
```sql
-- Supabase SQL Editor에서 실행
-- 파일: /database/700_add_lv3_generated_balance.sql
```

#### 2.3. API 설정 추가
```sql
-- Supabase SQL Editor에서 실행
-- 파일: /database/600_add_api_enable_settings.sql
```

### 3. 애플리케이션 실행
```bash
npm install
npm run dev
```

---

## ⚙️ 시스템 설정

### API 설정 (Lv1 전용)
1. 관리자 로그인 (Lv1)
2. 시스템 설정 > API 설정
3. Invest/OroPlay API credentials 입력
4. 저장

### 제공사 초기화 (Lv1 전용, 1회만 실행)
1. 게임 관리 > 제공사 초기화
2. Invest/OroPlay 제공사 자동 생성
3. 게임 동기화

---

## 🧪 테스트 시나리오

### Lv2 → Lv3 입금 테스트 ⭐
```
1. Lv2 로그인
2. 파트너 관리 > Lv3 선택
3. 입금 100,000원
4. 확인:
   - Lv2 Invest: -100,000원
   - Lv2 OroPlay: -100,000원
   - Lv3 Invest: +100,000원
   - Lv3 OroPlay: +100,000원
   - Lv3 balance: +200,000원 (자동 계산)
```

### Lv2 → Lv3 회수 테스트 ⭐
```
1. Lv2 로그인
2. 파트너 관리 > Lv3 선택
3. 회수 50,000원 (Invest API 선택)
4. 확인:
   - Lv2 Invest: +50,000원
   - Lv2 OroPlay: 변동 없음
   - Lv3 Invest: -50,000원
   - Lv3 OroPlay: 변동 없음
   - Lv3 balance: -50,000원 (자동 재계산)
```

📄 **전체 테스트 시나리오**: [`/LV3_DUAL_API_TRANSACTION.md#테스트-시나리오`](/LV3_DUAL_API_TRANSACTION.md#🧪-테스트-시나리오)

---

## 📊 주요 기능

### 1. 관리자 페이지
- **대시보드**: 통계, 실시간 모니터링
- **사용자 관리**: 강제 입출금, 사용자 생성/수정
- **파트너 관리**: 파트너 간 입출금, 파트너 생성/수정
- **베팅 관리**: 베팅 내역 조회, 정산
- **게임 관리**: 제공사 관리, 게임 관리, 게임 동기화
- **입출금 관리**: 입출금 승인, 거래 내역
- **시스템 설정**: API 설정, 메뉴 관리, 배너 관리

### 2. 사용자 페이지
- **카지노**: Invest + OroPlay 통합 목록
- **슬롯**: Invest + OroPlay 통합 목록
- **미니게임**: OroPlay 전용
- **입출금**: 입금/출금 신청
- **프로필**: 정보 수정, 비밀번호 변경
- **베팅 내역**: 게임 플레이 기록

---

## 🔍 트러블슈팅

### Q: Lv3 balance가 자동 계산되지 않음
```sql
-- 트리거 확인
SELECT * FROM pg_trigger WHERE tgname = 'trigger_update_lv3_balance';

-- 트리거 재생성
-- 파일: /database/700_add_lv3_generated_balance.sql 재실행
```

### Q: 제공사 상태 변경이 사용자 페이지에 반영 안 됨
```bash
# 해결 방법 1: 페이지 새로고침
사용자 페이지에서 F5 또는 Ctrl+R

# 해결 방법 2: 브라우저 캐시 삭제
Ctrl+Shift+Delete → 캐시 삭제

# 해결 방법 3: DB 확인
SELECT status, is_visible FROM game_providers WHERE id = [제공사ID];
```

### Q: 입금/출금이 처리되지 않음
```bash
# 1. DB 트리거 확인
SELECT * FROM pg_trigger WHERE tgname LIKE 'trigger_%';

# 2. API 설정 확인 (Lv1)
관리자 페이지 > 시스템 설정 > API 설정

# 3. 네트워크 확인
프록시 서버: https://vi8282.com/proxy
Invest API: https://api.invest-ho.com
```

---

## 🔗 외부 API

### Proxy Server
```
URL: https://vi8282.com/proxy
Method: POST
Body:
{
  "url": "https://api.invest-ho.com/api/...",
  "method": "GET/POST/PUT/DELETE",
  "headers": { "Content-Type": "application/json" },
  "body": { ... }
}
```

### WebSocket
```
URL: wss://vi8282.com/ws
```

---

## 📞 지원

### 문서 링크
- **Lv3 이중 API**: [LV3_DUAL_API_TRANSACTION.md](/LV3_DUAL_API_TRANSACTION.md)
- **입출금 로직**: [deposit_withdrawal_logic.md](/guidelines/deposit_withdrawal_logic.md)
- **지갑 시스템**: [wallet-management/README.md](/docs/wallet-management/README.md)
- **게임 관리**: [game-management/README.md](/docs/game-management/README.md)

### SQL 스크립트
- **Lv1/Lv2 트리거**: [500_auto_update_lv1_lv2_balance.sql](/database/500_auto_update_lv1_lv2_balance.sql)
- **Lv3 트리거**: [700_add_lv3_generated_balance.sql](/database/700_add_lv3_generated_balance.sql)
- **API 설정**: [600_add_api_enable_settings.sql](/database/600_add_api_enable_settings.sql)

---

## 📝 변경 이력

### v1.0 (2025-01-10) - Lv3 이중 API 시스템
- ✅ Lv3 본사 이중 API 입출금 로직 구현
- ✅ Lv3 balance 자동 계산 트리거 추가
- ✅ ForceTransactionModal API 선택 UI 구현
- ✅ PartnerManagement Lv2→Lv3 입출금 로직 구현
- ✅ UserManagement Lv1/Lv2→Lv7 입금 외부 API 건너뛰기
- ✅ 문서 업데이트 (deposit_withdrawal_logic.md, LV3_DUAL_API_TRANSACTION.md)

### v2.0.0 (2025-01-11) - 제공사 상태 관리
- ✅ 제공사 상태 관리 기능 (노출/점검중/숨김)
- ✅ 게임 동기화 성능 개선 (83% 단축)
- ✅ 검색 최적화 (300ms debounce)

---

## 🎯 다음 단계

### 1. SQL 실행 (필수!)
- [ ] Supabase SQL Editor에서 `/database/700_add_lv3_generated_balance.sql` 실행

### 2. 테스트
- [ ] Lv2 → Lv3 입금 테스트
- [ ] Lv2 → Lv3 회수 (Invest) 테스트
- [ ] Lv2 → Lv3 회수 (OroPlay) 테스트
- [ ] Lv1 → Lv7 입금 후 게임 테스트
- [ ] Lv3 → Lv7 입금 테스트

### 3. 검증
- [ ] Lv3 balance 자동 계산 확인
- [ ] 입금 제한 (최소값) 확인
- [ ] 회수 시 API 선택 확인
- [ ] Realtime 동기화 확인

---

**최종 업데이트**: 2025-01-10  
**버전**: v1.0  
**상태**: SQL 실행 대기 중 (700_add_lv3_generated_balance.sql)
