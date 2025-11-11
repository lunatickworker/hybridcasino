# 지갑(보유금) 관리 시스템 문서

## 📁 문서 목록

### 핵심 문서
1. **[📊 SUMMARY](./SUMMARY.md)** ⭐ 시작은 여기서!
   - 전체 작업 요약
   - 수정 완료 내역
   - 다음 단계 가이드

2. **[🔍 검증 가이드](./VERIFICATION_GUIDE.md)** 🔥 즉시 확인 필요
   - 수정사항 검증 방법 (단계별)
   - 트리거 확인 및 생성
   - 체크리스트

### 상세 문서
3. **[🐛 버그 수정 리포트](./BUG_FIX_REPORT.md)**
   - 수정 전후 비교
   - 코드 변경 내역
   
4. **[🔍 버그 점검 리포트](./BUG_INSPECTION_REPORT.md)**
   - 전체 시스템 점검 결과
   - 발견된 버그 분류
   - 우선순위별 수정 계획

5. **[💾 DB 스키마](./DATABASE_SCHEMA.md)**
   - partners/users/api_configs/transactions 테이블
   - 보유금 컬럼 사용 규칙
   - 트리거 및 플로우

6. **[📋 Lv1, Lv2 보유금 업데이트](./LV1_LV2_BALANCE_UPDATE.md)**
   - Lv1, Lv2 자동 계산 트리거
   - 500_auto_update_lv1_lv2_balance.sql 설명

---

## 🎯 시스템 개요

### 지갑 구조 (7단계)

| 레벨 | 지갑 개수 | 데이터 위치 | 설명 |
|------|----------|-----------|------|
| **Lv1 (시스템관리자)** | 2개 | `api_configs.invest_balance`<br>`api_configs.oroplay_balance` | API credentials 보유<br>외부 API 직접 관리 |
| **Lv2 (대본사)** | 2개 | `partners.invest_balance`<br>`partners.oroplay_balance`<br>`partners.balance` (자동 계산) | API credentials 없음<br>Lv1로부터 API별 입금<br>balance = invest + oroplay |
| **Lv3 (본사)** ⭐ | **2개 (DB) + 1개 (UI)** | **`partners.invest_balance`<br>`partners.oroplay_balance`<br>`partners.balance` (자동 계산)** | **이중 API 통합 관리**<br>**UI는 balance만 표시** |
| **Lv4~Lv6 (파트너)** | 1개 | `partners.balance` | Seamless Wallet<br>API 구분 없음 |
| **Lv7 (사용자)** | 1개 | `users.balance` | Seamless Wallet<br>API 자동 선택 |

---

## 🔄 실시간 동기화 시스템

### 1. Realtime Subscription
- **partners 테이블 변경 감지**: 즉시 React State 업데이트
- **api_configs 테이블 변경 감지**: Lv1, Lv2만 구독
- **NaN 방지 로직**: 모든 balance 파싱 시 타입 체크

### 2. 30초 주기 자동 동기화 (Lv1만)
- **Invest API**: `GET /api/info` 호출
- **OroPlay API**: `GET /agent/balance` 호출
- **자동 업데이트**: api_configs 테이블 업데이트 → Realtime 이벤트 자동 발생

---

## 💰 입출금 플로우

### 입금 플로우
```
[사용자] 입금 신청
    ↓
transactions INSERT (status='pending')
    ↓
메시지 큐 → [관리자] 실시간 알림
    ↓
[관리자] 승인 버튼 클릭
    ↓
Invest API: POST /api/account/balance
    ↓
API 성공 → transactions UPDATE (status='completed')
    ↓
✅ 트리거 자동 실행: users.balance += amount
    ↓
✅ Realtime 이벤트 발생
    ↓
[사용자] UserHeader 즉시 업데이트 + Toast 알림
```

### 출금 플로우
```
[사용자] 출금 신청 (비밀번호 확인)
    ↓
진행 중인 출금 체크 (중복 방지)
    ↓
transactions INSERT (status='pending')
    ↓
메시지 큐 → [관리자] 실시간 알림
    ↓
[관리자] 승인 버튼 클릭
    ↓
Invest API: PUT /api/account/balance
    ↓
API 성공 → transactions UPDATE (status='completed')
    ↓
✅ 트리거 자동 실행: users.balance -= amount
    ↓
✅ Realtime 이벤트 발생
    ↓
[사용자] UserHeader 즉시 업데이트 + Toast 알림
```

---

## 🔑 핵심 컴포넌트

### 프론트엔드
- `/contexts/BalanceContext.tsx` - 보유금 Context (Realtime 구독, 30초 동기화)
- `/components/user/UserDeposit.tsx` - 사용자 입금 신청
- `/components/user/UserWithdraw.tsx` - 사용자 출금 신청
- `/components/admin/TransactionManagement.tsx` - 관리자 입출금 승인
- `/components/admin/ForceTransactionModal.tsx` - 입출금 모달 (API 선택) ⭐
- `/components/admin/PartnerManagement.tsx` - 파트너 관리 (Lv2→Lv3 입출금) ⭐
- `/components/admin/UserManagement.tsx` - 사용자 관리 (Lv1/Lv2→Lv7 입금) ⭐

### 백엔드/DB
- `database/251_transaction_triggers.sql` - transactions INSERT 시 users.balance 자동 업데이트
- `database/500_auto_update_lv1_lv2_balance.sql` - Lv1, Lv2 파트너 보유금 자동 계산 트리거
- `database/700_add_lv3_generated_balance.sql` - Lv3 본사 보유금 자동 계산 트리거 ⭐ (신규)
- `/lib/investApi.ts` - Invest API 호출 (입출금)
- `/lib/oroplayApi.ts` - OroPlay API 호출 (게임 Transfer)

---

## ✅ 정상 작동 확인된 기능

1. ✅ **보유금 변경 시 Realtime 동기화 구현됨**
2. ✅ **입출금 신청 시 메시지 큐로 실시간 알림**
3. ✅ **Lv1만 30초 주기 API 동기화**
4. ✅ **트리거 자동 실행 + Realtime 이벤트로 사용자 화면 즉시 업데이트**
5. ✅ **NaN 방지 로직 완벽 구현**
6. ✅ **Lv1 보유금 표시 (Invest + OroPlay 합계)** - 수정 완료
7. ✅ **입금 중복 신청 방지** - 수정 완료
8. ✅ **Lv2 파트너 보유금 자동 계산 트리거** - 완료 (SQL 실행 필요)
9. ✅ **Lv3 파트너 이중 API 입출금 로직** - 완료 ⭐ (SQL 실행 필요)

---

## ⚠️ 즉시 조치 필요 (사용자)

### 🔥 Lv3 보유금 트리거 SQL 실행 (필수!)

**Lv2 → Lv3 입출금 및 Lv3 balance 자동 계산을 위해 반드시 실행해야 합니다!**

1. **Supabase SQL Editor 접속**
   - URL: https://hduofjzsitoaujyjvuix.supabase.co

2. **SQL 실행**
   - 파일: `/database/700_add_lv3_generated_balance.sql`

3. **검증**
```sql
SELECT username, invest_balance, oroplay_balance, balance
FROM partners
WHERE level = 3;
```

예상: balance = invest_balance + oroplay_balance

---

## ⚠️ 추가 점검 필요 사항

1. **OroPlay API 입출금 처리**
   - 현재 TransactionManagement에서 Invest API만 호출 중
   - OroPlay API 사용 사용자의 입출금은 어떻게 처리되는지 확인 필요

2. **게임 Transfer 플로우**
   - 게임 시작 시 GMS 출금 → API 입금
   - 게임 종료 시 API 출금 → GMS 입금
   - `/lib/gameApi.ts` 전체 분석 필요

---

## 🔗 관련 문서

- `/LV3_DUAL_API_TRANSACTION.md` - Lv3 이중 API 입출금 시스템 완료 보고서 ⭐ (신규)
- `/guidelines/deposit_withdrawal_logic.md` - 입출금 로직 완전 가이드 (업데이트 완료)
- `/guidelines/Guidelines.md` - Invest API 명세
- `/guidelines/seamless_wallet_integration.md` - Seamless Wallet 설계
- `/guidelines/add_api_policy.md` - API 정책 및 파트너 생성
- `/guidelines/oroplayapi.md` - OroPlay API 명세

---

**최종 업데이트**: 2025-01-10  
**수정 완료**: Lv3 이중 API 입출금 시스템 구현 완료 ⭐  
**다음 점검**: SQL 실행 (700_add_lv3_generated_balance.sql), 실제 거래 테스트

---

## 🎯 빠른 시작 가이드

### 1단계: SQL 실행 (필수!)
→ `/database/500_auto_update_lv1_lv2_balance.sql` 실행 (Lv1, Lv2)  
→ `/database/700_add_lv3_generated_balance.sql` 실행 (Lv3) ⭐ 신규

### 2단계: 검증
→ `/docs/wallet-management/VERIFICATION_GUIDE.md` 참조  
→ `/LV3_DUAL_API_TRANSACTION.md` 테스트 시나리오 참조 ⭐

### 3단계: 완료 보고
→ 검증 결과 공유 (성공/실패)