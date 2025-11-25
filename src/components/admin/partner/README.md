# Partner Management 모듈

파트너 관리 기능을 모듈화하여 확장성과 유지보수성을 향상시킨 구조입니다.

## 파일 구조

```
/components/admin/partner/
├── types.ts                      # 타입 정의 및 상수
├── partnerService.ts             # 파트너 CRUD 및 조회 서비스
├── transferService.ts            # 보유금 입출금 서비스 (GMS 머니 시스템)
├── usePartnerManagement.ts       # 커스텀 훅 (상태 관리)
├── PartnerTransferDialog.tsx     # 보유금 입출금 다이얼로그
└── README.md                     # 이 파일
```

## 주요 특징

### 1. types.ts
- `Partner` 인터페이스
- `TransferMode`, `ForceTransactionType` 타입
- `partnerTypeColors`, `statusColors` 상수

### 2. partnerService.ts
파트너 관련 모든 API 호출을 담당:
- `fetchPartners()` - 파트너 목록 조회
- `loadPartnerCommissionById()` - 커미션 조회
- `loadSystemDefaultCommission()` - 시스템 기본 커미션 조회
- `fetchAdminApiBalances()` - Lv1 API 보유금 조회
- `fetchCurrentUserBalance()` - 현재 사용자 보유금 조회
- `createPartner()` - 파트너 생성
- `updatePartner()` - 파트너 수정
- `deletePartner()` - 파트너 삭제
- `checkChildPartners()` - 하위 파트너 확인
- `checkManagedUsers()` - 관리 사용자 확인

### 3. transferService.ts
**GMS 머니 시스템**으로 구현된 파트너간 보유금 입출금:
- ✅ 외부 API 호출 없음 (내부 DB만 처리)
- Lv1: 시스템관리자
- Lv2~Lv7: GMS 머니 시스템 사용
- 대본사→본사 지급 시 보유금 합계 검증 로직 포함

### 4. usePartnerManagement.ts
커스텀 훅으로 상태 관리 및 이벤트 처리:
- 모든 state 관리
- Realtime 구독 (partners, api_configs 테이블)
- 초기 데이터 로드
- 파트너 목록, 보유금, 커미션 조회 메서드

### 5. PartnerTransferDialog.tsx
보유금 입출금 UI 컴포넌트:
- 입금/출금 모드 선택
- 금액 입력 및 검증
- 에러 처리 및 사용자 피드백
- WebSocket 실시간 업데이트 지원

## 사용 방법

### PartnerManagement.tsx에서 사용

```typescript
import { usePartnerManagement } from "./partner/usePartnerManagement";
import { PartnerTransferDialog } from "./partner/PartnerTransferDialog";

export function PartnerManagement() {
  const {
    // State
    partners,
    loading,
    showTransferDialog,
    setShowTransferDialog,
    transferTargetPartner,
    setTransferTargetPartner,
    transferMode,
    setTransferMode,
    transferAmount,
    setTransferAmount,
    transferMemo,
    setTransferMemo,
    transferLoading,
    
    // Methods
    fetchPartners,
    
    // Context
    authState,
    sendMessage
  } = usePartnerManagement();

  return (
    <div>
      {/* 파트너 목록 및 기타 UI */}
      
      <PartnerTransferDialog
        open={showTransferDialog}
        onOpenChange={setShowTransferDialog}
        targetPartner={transferTargetPartner}
        transferMode={transferMode}
        setTransferMode={setTransferMode}
        transferAmount={transferAmount}
        setTransferAmount={setTransferAmount}
        transferMemo={transferMemo}
        setTransferMemo={setTransferMemo}
        transferLoading={transferLoading}
        currentUserId={authState.user?.id || ''}
        onSuccess={() => {
          setTransferTargetPartner(null);
          setTransferAmount("");
          setTransferMemo("");
          setTransferMode('deposit');
          fetchPartners();
        }}
        onWebSocketUpdate={(data) => {
          if (sendMessage) {
            sendMessage(data);
          }
        }}
      />
    </div>
  );
}
```

## 확장 가능한 구조

새로운 기능 추가 시:
1. `types.ts`에 필요한 타입 추가
2. `partnerService.ts`에 API 로직 추가
3. `usePartnerManagement.ts`에 상태/메서드 추가
4. 필요시 별도 컴포넌트 생성 (예: `PartnerCreateDialog.tsx`)

## 주요 변경사항

### transferService.ts (중요)
- ✅ **GMS 머니 시스템 적용**
- ❌ 외부 API 호출 제거 (Lv2~Lv7간 입출금)
- ✅ 내부 DB만 처리 (partners 테이블)
- ✅ 대본사→본사 지급 시 보유금 합계 검증
- ✅ 로그 기록 (partner_balance_logs)

## 참고사항

- Lv1: api_configs 테이블의 balance 사용 (API 제공사별 잔고)
- Lv2: partners.invest_balance + partners.oroplay_balance (두 개 지갑)
- Lv3~Lv7: partners.balance (단일 지갑, GMS 머니)

이 구조는 대본사가 늘어나도 각 모듈을 독립적으로 관리할 수 있어 확장성이 뛰어납니다.
