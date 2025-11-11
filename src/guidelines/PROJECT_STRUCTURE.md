# 프로젝트 구조 가이드

## 📁 전체 폴더 구조

```
/components
├── /admin          # 관리자 페이지 전용 컴포넌트
├── /user           # 공통 사용자 컴포넌트 (모든 샘플 페이지에서 공유)
├── /sample1        # Sample1 전용 컴포넌트 (Marvel 테마)
├── /sample2        # Sample2 전용 컴포넌트 (미래 확장용)
├── /sample3        # Sample3 전용 컴포넌트 (미래 확장용)
├── /common         # 관리자/사용자 공통 컴포넌트
├── /ui             # Shadcn UI 기본 컴포넌트
└── /figma          # Figma 관련 유틸리티 컴포넌트
```

---

## 🎯 컴포넌트 분류 원칙

### 1. `/components/admin/` - 관리자 전용
관리자 페이지에서만 사용되는 모든 컴포넌트

**주요 컴포넌트:**
- AdminLayout.tsx - 관리자 레이아웃
- AdminLogin.tsx - 관리자 로그인
- Dashboard.tsx - 대시보드
- UserManagement.tsx - 사용자 관리
- BettingManagement.tsx - 베팅 관리
- PartnerManagement.tsx - 파트너 관리
- SystemSettings.tsx - 시스템 설정
- EnhancedGameManagement.tsx - 게임 관리
- 기타 30+ 관리 컴포넌트

**라우팅:** `#/admin/*`

---

### 2. `/components/user/` - 공통 사용자 컴포넌트
**모든 샘플 페이지(sample1, sample2, sample3 등)에서 공유하는 컴포넌트**

**공통 컴포넌트 목록:**
```
UserLogin.tsx              # 로그인 (모든 샘플 공통)
UserDeposit.tsx           # 입금 페이지
UserWithdraw.tsx          # 출금 페이지
UserProfile.tsx           # 프로필 페이지
UserBettingHistory.tsx    # 베팅 내역
UserNotice.tsx            # 공지사항
UserSupport.tsx           # 고객지원
UserMessagePopup.tsx      # 메시지 팝업
UserMiniGame.tsx          # 미니게임 (기본 구현)
GameProviderSelector.tsx  # 게임 제공사 선택기
```

**특징:**
- ✅ 모든 샘플 페이지에서 import하여 재사용
- ✅ 한 번 수정하면 모든 샘플에 자동 반영
- ✅ 코드 중복 방지 및 유지보수 편의성

---

### 3. `/components/sample1/` - Sample1 전용 (Marvel 테마)
Marvel 테마만의 고유한 디자인과 레이아웃을 가진 컴포넌트

**Sample1 전용 컴포넌트:**
```
Sample1Layout.tsx         # Marvel 테마 전용 레이아웃
Sample1Casino.tsx         # Marvel 스타일 카지노 페이지
Sample1Slot.tsx           # Marvel 스타일 슬롯 페이지
Sample1MiniGame.tsx       # Marvel 헤더 + UserMiniGame 재사용
Sample1Routes.tsx         # Sample1 라우팅 로직
```

**디자인 특징:**
- 🎨 Marvel 브랜드 컬러 (빨강/금색/검정)
- 🎨 Impact 폰트 사용
- 🎨 슈퍼히어로 테마 배경 이미지
- 🎨 고유한 네비게이션 스타일

**라우팅:** `#/sample1/*`

**공유 컴포넌트 사용 예시:**
```tsx
// Sample1Routes.tsx
import { Sample1Casino } from "./Sample1Casino";      // Sample1 전용
import { Sample1Slot } from "./Sample1Slot";          // Sample1 전용
import { Sample1MiniGame } from "./Sample1MiniGame";  // Sample1 전용
import { UserDeposit } from "../user/UserDeposit";    // 공통 컴포넌트
import { UserWithdraw } from "../user/UserWithdraw";  // 공통 컴포넌트
import { UserProfile } from "../user/UserProfile";    // 공통 컴포넌트
```

---

### 4. `/components/sample2/` - Sample2 전용 (미래 확장)
다른 테마/브랜드를 위한 독립적인 샘플 페이지

**예상 구조:**
```
Sample2Layout.tsx         # Sample2 전용 레이아웃
Sample2Casino.tsx         # Sample2 스타일 카지노
Sample2Slot.tsx           # Sample2 스타일 슬롯
Sample2MiniGame.tsx       # Sample2 헤더 + UserMiniGame 재사용
Sample2Routes.tsx         # Sample2 라우팅
```

**라우팅:** `#/sample2/*`

**공유 방식:** Sample1과 동일하게 `/components/user/` 컴포넌트 재사용

---

### 5. `/components/common/` - 관리자/사용자 공통
관리자와 사용자 페이지 모두에서 사용되는 유틸리티 컴포넌트

**공통 컴포넌트:**
```
AdminRoutes.tsx           # 관리자 라우팅
UserRoutes.tsx            # 일반 사용자 라우팅
DataTable.tsx             # 데이터 테이블
LoadingSpinner.tsx        # 로딩 스피너
ErrorBoundary.tsx         # 에러 경계
MessageQueueProvider.tsx  # 메시지 큐
NotificationCenter.tsx    # 알림 센터
```

---

## 🔄 샘플 페이지 구조 패턴

### 공통 재사용 컴포넌트 vs 샘플 전용 컴포넌트

| 기능 | 위치 | 이유 |
|------|------|------|
| 로그인 | `/user/UserLogin.tsx` | 로직 동일, 모든 샘플 공유 |
| 입금/출금 | `/user/UserDeposit.tsx`, `UserWithdraw.tsx` | API 연동 로직 동일 |
| 프로필 | `/user/UserProfile.tsx` | 사용자 정보 표시 로직 동일 |
| 베팅내역 | `/user/UserBettingHistory.tsx` | 데이터 조회 로직 동일 |
| 레이아웃 | `/sample1/Sample1Layout.tsx` | **테마별로 다름** |
| 카지노 페이지 | `/sample1/Sample1Casino.tsx` | **디자인 스타일이 다름** |
| 슬롯 페이지 | `/sample1/Sample1Slot.tsx` | **디자인 스타일이 다름** |

---

## 📋 새로운 샘플 페이지 생성 가이드

### Sample2 생성 예시

1. **폴더 생성**
```bash
/components/sample2/
```

2. **필수 파일 생성**
```
Sample2Layout.tsx         # 새로운 테마의 레이아웃
Sample2Casino.tsx         # 카지노 페이지 (새 디자인)
Sample2Slot.tsx           # 슬롯 페이지 (새 디자인)
Sample2MiniGame.tsx       # 미니게임 페이지
Sample2Routes.tsx         # 라우팅 로직
```

3. **Routes 파일 작성**
```tsx
// /components/sample2/Sample2Routes.tsx
import { Sample2Casino } from "./Sample2Casino";
import { Sample2Slot } from "./Sample2Slot";
import { Sample2MiniGame } from "./Sample2MiniGame";

// ✅ 공통 컴포넌트 재사용
import { UserDeposit } from "../user/UserDeposit";
import { UserWithdraw } from "../user/UserWithdraw";
import { UserProfile } from "../user/UserProfile";
import { UserBettingHistory } from "../user/UserBettingHistory";
import { UserNotice } from "../user/UserNotice";
import { UserSupport } from "../user/UserSupport";

export function Sample2Routes({ currentRoute, user, onRouteChange }) {
  switch (currentRoute) {
    case '/sample2/casino':
      return <Sample2Casino user={user} />;
    case '/sample2/slot':
      return <Sample2Slot user={user} />;
    case '/sample2/deposit':
      return <UserDeposit user={user} />;  // 공통 컴포넌트 재사용
    case '/sample2/withdraw':
      return <UserWithdraw user={user} />; // 공통 컴포넌트 재사용
    // ... 기타 라우트
  }
}
```

4. **App.tsx에 라우팅 추가**
```tsx
import { Sample2Layout } from './components/sample2/Sample2Layout';
import { Sample2Routes } from './components/sample2/Sample2Routes';

// ... AppContent 내부
if (isSample2Page) {
  return (
    <Sample2Layout 
      user={userSession}
      currentRoute={currentRoute}
      onRouteChange={handleNavigate}
      onLogout={handleUserLogout}
    >
      <Sample2Routes 
        currentRoute={currentRoute} 
        user={userSession}
        onRouteChange={handleNavigate}
      />
    </Sample2Layout>
  );
}
```

---

## 🎨 샘플 페이지별 테마 권장사항

### Sample1 (Marvel)
- 컬러: Red (#DC2626), Gold (#EAB308), Black (#0A0A0A)
- 폰트: Impact, sans-serif
- 느낌: 히어로, 파워풀, 다크

### Sample2 (예: Luxury Casino)
- 컬러: Purple, Gold, Dark Blue
- 폰트: Playfair Display, serif
- 느낌: 고급스러운, 우아한

### Sample3 (예: Neon Gaming)
- 컬러: Cyan, Magenta, Dark Background
- 폰트: Orbitron, sans-serif
- 느낌: 미래적, 사이버펑크

---

## ⚠️ 중요 규칙

### ✅ DO (해야 할 것)
1. **공통 기능은 `/components/user/`에 배치**
   - 입금/출금/프로필/베팅내역 등
2. **테마별 고유 디자인만 `/components/sampleN/`에 배치**
   - Layout, Casino, Slot 등
3. **공통 컴포넌트를 최대한 재사용**
   - 코드 중복 방지
4. **각 샘플의 Routes.tsx에서 공통 컴포넌트 import**
   - `import { UserDeposit } from "../user/UserDeposit"`

### ❌ DON'T (하지 말아야 할 것)
1. **같은 기능을 샘플마다 중복 구현하지 않기**
   - ❌ Sample1Deposit.tsx, Sample2Deposit.tsx (중복)
   - ✅ UserDeposit.tsx (공통)
2. **공통 컴포넌트를 샘플 폴더에 복사하지 않기**
3. **공통 로직에 샘플별 분기문 넣지 않기**
   - 각 샘플은 독립적으로 동작해야 함

---

## 🔍 파일 위치 결정 플로우차트

```
새 컴포넌트 생성 필요?
    ↓
[질문 1] 관리자 페이지에서만 사용?
    YES → /components/admin/
    NO → ↓
    
[질문 2] 모든 샘플 페이지에서 공통으로 사용?
    YES → /components/user/
    NO → ↓
    
[질문 3] 특정 샘플의 고유한 디자인/레이아웃?
    YES → /components/sampleN/
    NO → ↓
    
[질문 4] 관리자/사용자 모두 사용하는 유틸리티?
    YES → /components/common/
```

---

## 📊 현재 구현 상태

### ✅ 완료된 샘플
- **Sample1 (Marvel)**: 완전 구현
  - Sample1Layout, Sample1Casino, Sample1Slot, Sample1MiniGame
  - 공통 컴포넌트 재사용 적용 완료

### 🔜 미래 확장 가능
- **Sample2**: 폴더만 생성, 컴포넌트는 필요 시 추가
- **Sample3**: 폴더만 생성, 컴포넌트는 필요 시 추가

---

## 🛠️ 유지보수 팁

### 공통 컴포넌트 수정 시
```tsx
// /components/user/UserDeposit.tsx 수정
// → Sample1, Sample2, Sample3 모두 자동 반영됨
```

### 샘플별 컴포넌트 수정 시
```tsx
// /components/sample1/Sample1Casino.tsx 수정
// → Sample1에만 영향, 다른 샘플은 영향 없음
```

### 새로운 공통 기능 추가 시
1. `/components/user/NewFeature.tsx` 생성
2. 각 샘플의 Routes.tsx에서 import
3. 모든 샘플에서 즉시 사용 가능

---

## 📝 체크리스트

새 샘플 페이지 생성 시 확인사항:

- [ ] `/components/sampleN/` 폴더 생성
- [ ] SampleNLayout.tsx 작성 (고유 디자인)
- [ ] SampleNCasino.tsx 작성 (고유 디자인)
- [ ] SampleNSlot.tsx 작성 (고유 디자인)
- [ ] SampleNMiniGame.tsx 작성
- [ ] SampleNRoutes.tsx 작성 (공통 컴포넌트 import)
- [ ] App.tsx에 라우팅 로직 추가
- [ ] 테마 컬러/폰트 정의
- [ ] 테스트 (로그인, 게임 실행, 입출금)

---

## 🔗 관련 문서

- [Invest API 연동](./Guidelines.md)
- [Seamless Wallet 통합](./seamless_wallet_integration.md)
- [API 정책](./add_api_policy.md)
- [OroPlay API](./oroplayapi.md)
