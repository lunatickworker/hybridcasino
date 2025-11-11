# 다국어(i18n) 적용 가이드

## 개요
관리자 페이지에 한국어/영어 다국어 지원이 구현되었습니다. 사용자는 헤더 오른쪽 상단의 국기 아이콘을 클릭하여 언어를 전환할 수 있으며, 선택한 언어는 localStorage에 저장됩니다.

## 구조
- `/contexts/LanguageContext.tsx` - 언어 컨텍스트 및 Provider
- `/translations/ko.ts` - 한국어 번역
- `/translations/en.ts` - 영어 번역
- `/components/admin/LanguageSwitcher.tsx` - 언어 전환 버튼

## 번역 파일 구조
```typescript
export const ko = {
  common: { ... },        // 공통 텍스트
  menu: { ... },          // 메뉴명
  dashboard: { ... },     // 대시보드
  userManagement: { ... }, // 회원 관리
  // ... 기타
};
```

## 컴포넌트에 번역 적용하는 방법

### 1. import 추가
```typescript
import { useLanguage } from '../../contexts/LanguageContext';
```

### 2. 컴포넌트 내에서 훅 사용
```typescript
export function YourComponent() {
  const { t } = useLanguage();
  
  return (
    <div>
      <h1>{t.menu.dashboard}</h1>
      <Button>{t.common.save}</Button>
    </div>
  );
}
```

### 3. 텍스트 교체 예시

**Before:**
```typescript
<CardTitle>회원 관리</CardTitle>
<Button>저장</Button>
<p>총 {count}명</p>
toast.success("저장되었습니다");
```

**After:**
```typescript
<CardTitle>{t.userManagement.title}</CardTitle>
<Button>{t.common.save}</Button>
<p>{t.userManagement.totalUsers}: {count}</p>
toast.success(t.success.saved);
```

### 4. 동적 텍스트 처리

번역에 변수가 필요한 경우:

```typescript
// 번역 파일에서
error: {
  minLength: '최소 {{length}}자 이상이어야 합니다',
}

// 컴포넌트에서 (수동 치환)
const errorMessage = t.error.minLength.replace('{{length}}', '8');
```

## 적용이 필요한 컴포넌트 목록

### ✅ 완료
- [x] AdminLogin.tsx
- [x] AdminHeader.tsx (LanguageSwitcher 추가)

### ⏳ 적용 필요
- [ ] Dashboard.tsx
- [ ] UserManagement.tsx
- [ ] PartnerManagement.tsx
- [ ] BettingManagement.tsx
- [ ] TransactionManagement.tsx
- [ ] EnhancedGameManagement.tsx
- [ ] SystemSettings.tsx
- [ ] CommissionSettlement.tsx
- [ ] IntegratedSettlement.tsx
- [ ] SettlementHistory.tsx
- [ ] CustomerSupport.tsx
- [ ] PointManagement.tsx
- [ ] MessageCenter.tsx
- [ ] Announcements.tsx
- [ ] BannerManagement.tsx
- [ ] BlacklistManagement.tsx
- [ ] MenuManagement.tsx
- [ ] ApiTester.tsx
- [ ] OnlineUsers.tsx
- [ ] BettingHistory.tsx
- [ ] PartnerCreation.tsx
- [ ] PartnerTransactions.tsx
- [ ] AdminSidebar.tsx
- [ ] MetricCard.tsx
- [ ] PremiumSectionCard.tsx
- [ ] UserDetailModal.tsx
- [ ] ForceTransactionModal.tsx
- [ ] AdminDialog.tsx
- [ ] AdminCard.tsx
- [ ] CallCycle.tsx
- [ ] BalanceSyncManager.tsx
- [ ] BettingHistorySync.tsx
- [ ] AutoSyncMonitor.tsx
- [ ] PartnerConnectionStatus.tsx
- [ ] PasswordChangeSection.tsx

## 번역 추가/수정 방법

### 1. 한국어 번역 추가
`/translations/ko.ts` 파일에서 해당 섹션에 추가:
```typescript
export const ko = {
  yourSection: {
    newKey: '새로운 한국어 텍스트',
  },
};
```

### 2. 영어 번역 추가
`/translations/en.ts` 파일에서 **동일한 키**로 추가:
```typescript
export const en = {
  yourSection: {
    newKey: 'New English Text',
  },
};
```

### 3. 일관성 유지
- 키 이름은 camelCase 사용
- 섹션 구분은 명확하게
- 한국어/영어 파일의 구조는 항상 동일하게 유지

## 테스트 방법

1. 관리자 페이지 로그인
2. 헤더 오른쪽 상단의 🇰🇷 또는 🇺🇸 아이콘 클릭
3. 모든 텍스트가 올바르게 번역되는지 확인
4. 페이지 새로고침 후 언어 설정이 유지되는지 확인

## 주의사항

1. **toast 메시지도 번역 필요**
   ```typescript
   // Bad
   toast.success("저장되었습니다");
   
   // Good
   toast.success(t.success.saved);
   ```

2. **에러 메시지도 번역 필요**
   ```typescript
   // Bad
   throw new Error("오류가 발생했습니다");
   
   // Good
   throw new Error(t.error.generic);
   ```

3. **placeholder, label, title 모두 번역**
   ```typescript
   // Bad
   <Input placeholder="검색..." />
   
   // Good
   <Input placeholder={t.common.search} />
   ```

4. **console.log는 번역하지 않음**
   - 개발자용 로그는 영어로 유지

## 번역 품질 가이드

- 전문 용어는 업계 표준을 따름
- 일관된 톤 유지 (격식체)
- 명확하고 간결한 표현
- 문화적 차이 고려

## 도움이 필요한 경우

1. 번역 파일 구조 확인: `/translations/ko.ts`, `/translations/en.ts`
2. 적용 예시 확인: `/components/admin/AdminLogin.tsx`
3. 언어 컨텍스트 확인: `/contexts/LanguageContext.tsx`
