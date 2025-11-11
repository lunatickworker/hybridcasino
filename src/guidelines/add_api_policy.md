***** 외부 api 추가 모듈 ******

핵심 포인트
```
관리자 화면에서:
✅ 에볼루션(invest) - 노출
❌ 에볼루션(new) - 비노출

사용자 화면에서:
[에볼루션] ← invest API만 보임
또는
관리자 화면에서:
❌ 에볼루션(invest) - 비노출
✅ 에볼루션(new) - 노출

사용자 화면에서:
[에볼루션] ← new API만 보임
```
---
장점

UI 혼란 제거: 사용자는 같은 제공사가 2개씩 보이지 않음
관리자 제어: 언제든 API 전환 가능 (노출/비노출 토글)
부하 분산: 제공사별로 다른 API 선택 가능
장애 대응: 한 API 장애 시 다른 API로 빠르게 전환
자연스러운 전환: 사용자는 API 변경을 인지 못함
---

구현 요약

1. DB 스키마
```sql
-- games 테이블에 api_type 추가
ALTER TABLE games ADD COLUMN api_type VARCHAR(50) DEFAULT 'invest';


-- 같은 제공사를 API별로 복제
INSERT INTO games (game_id, provider_id, game_title, type, api_type, is_visible, partner_id)
SELECT game_id + 100000, provider_id, game_title, type, 'new', false, partner_id
FROM games WHERE api_type = 'invest';
```

2. 사용자 화면 쿼리
```typescript
// is_visible = true인 게임만 조회
const { data: visibleGames } = await supabase
  .from('games')
  .select(', game_providers()')
  .eq('type', 'casino')
  .eq('is_visible', true) // 노출된 것만
  .eq('status', 'active');


// 결과: invest/new가 섞여서 나오지만 사용자는 모름
```

3. 게임 실행
```typescript
// 선택된 게임의 api_type 자동 감지
const { data: game } = await supabase
  .from('games')
  .select(', game_providers()')
  .eq('id', selectedGameId)
  .single();

// game.api_type에 따라 자동으로 적절한 API 호출
if (game.api_type === 'invest') {
  await launchInvestGame();
} else {
  await launchNewAPIGame();
}
```

4. 관리자 화면 (EnhancedGameManagement)
```tsx
// 각 제공사의 invest/new 버전 모두 표시
// 토글로 is_visible 제어
<Switch 
  checked={game.is_visible}
  onCheckedChange={(checked) => updateGameVisibility(game.id, checked)}
/>
```
---

구현 순서는:

DB 스키마 수정 (games.api_type 추가)
기존 게임 복제 (new API용)
사용자 화면 쿼리 수정 (is_visible 필터)
게임 실행 로직 수정 (api_type 자동 감지)
관리자 게임 관리 화면 개선


********** 지갑 구조 정리 *************

1. 시스템관리자 (Lv1)
```
화면에 표시되는 지갑:
├─ Invest API 보유금: 500,000,000원
└─ OroPlay API 보유금: 300,000,000원
   총: 800,000,000원
```

특징:

2개의 외부 API 지갑을 직접 관리
api_configs 테이블 사용 (API credentials 보유)
각 API별로 입출금 내역 분리 관리

---

2. 대본사 (Lv2)
```
화면에 표시되는 지갑:
├─ Invest API 보유금: 200,000,000원
└─ OroPlay API 보유금: 100,000,000원
   총: 300,000,000원
```

특징:

2개 지갑 관리 (partners.invest_balance, partners.oroplay_balance)
api_configs 테이블 사용하지 않음 (API credentials 없음)
Lv1으로부터 각 API별로 분리하여 입금받음
Lv3 이하에게는 합산된 금액을 지급

---

3. 하위 파트너 (Lv3~Lv6: 본사/부본사/총판/매장)
```
화면에 표시되는 지갑:
└─ GMS 보유금: 50,000,000원 (partners.balance)
   (단일 지갑)
```

특징:

GMS 내부 지갑만 사용 (Seamless Wallet)
외부 API는 의식하지 않음
상위 파트너로부터 지급받은 금액만 관리

---

4. 일반 사용자 (Lv7)
```
화면에 표시되는 지갑:
└─ 보유금: 100,000원 (users.balance)
   (단일 지갑)
```

특징:

GMS 내부 지갑만 보임 (Seamless Wallet)
게임 플레이 시 자동으로 적절한 API 선택
어느 API를 사용하는지 전혀 알 필요 없음
---

******* 게임 실행 흐름 *******


올바른 플로우 (사용자님 제안)

1. 사용자 게임 시작 (50,000원)
```
[GMS 출금 처리]
사용자: 50,000 → 0 (출금)
파트너: 50,000 → 0 (출금)

[API 입금 처리]
API balance: 100,000 → 50,000 (차감)
```

2. 게임 종료 - 손실 (40,000원 남음)
```
[API 출금 처리]
API balance: 50,000 + 40,000 = 90,000

[GMS 입금 처리]
사용자: 0 + 40,000 = 40,000
파트너: 0 + 40,000 = 40,000
```

3. 게임 종료 - 수익 (60,000원 남음)
```
[API 출금 처리]
API balance: 50,000 + 60,000 = 110,000

[GMS 입금 처리]
사용자: 0 + 60,000 = 60,000
파트너: 0 + 60,000 = 60,000
```

장점

명확한 자금 추적: 파트너가 실시간으로 사용 가능한 보유금 확인 가능
기존 로직과 일관성: 강제입금/승인과 동일한 패턴
투명한 회계: 모든 거래가 입출금으로 기록됨
동시성 제어: 여러 사용자가 동시에 게임 시작 시 파트너 보유금 초과 방지

보유금 동기화 (30초 간격)

시스템관리자 화면 (Lv1)
```tsx
// Dashboard.tsx - Lv1만 보임

<Card>
  <CardTitle>외부 API 보유금</CardTitle>
  <CardContent>
    <div>Invest API: {investBalance}원</div>
    <div>OroPlay API: {oroplayBalance}원</div>
    <div>합계: {investBalance + oroplayBalance}원</div>
  </CardContent>
</Card>
```

대본사 화면 (Lv2)
```tsx
// Dashboard.tsx - Lv2만 보임

<Card>
  <CardTitle>보유금</CardTitle>
  <CardContent>
    <div>Invest API: {partner.invest_balance}원</div>
    <div>OroPlay API: {partner.oroplay_balance}원</div>
    <div>합계: {partner.invest_balance + partner.oroplay_balance}원</div>
  </CardContent>
</Card>
```

하위 파트너 화면 (Lv3~Lv6)
```tsx
// Dashboard.tsx - 본사/부본사/총판/매장

<Card>
  <CardTitle>보유금</CardTitle>
  <CardContent>
    <div>{partner.balance}원</div>
  </CardContent>
</Card>
```

사용자 화면 (Lv7)
```tsx
// UserHeader.tsx

<div className="balance">
  {user.balance}원
</div>
```
---

핵심 정리

| 구분 | 보유금 지갑 개수 | 실제 보유 장소 | 비고 |
|------|----------------|--------------|------|
| Lv1 시스템관리자 | 2개 | api_configs (invest + oroplay) | API credentials 보유 |
| Lv2 대본사 | 2개 | partners.invest_balance + partners.oroplay_balance | API credentials 없음 |
| Lv3 본사 | 1개 | partners.balance | Seamless Wallet |
| Lv4 부본사 | 1개 | partners.balance | Seamless Wallet |
| Lv5 총판 | 1개 | partners.balance | Seamless Wallet |
| Lv6 매장 | 1개 | partners.balance | Seamless Wallet |
| Lv7 사용자 | 1개 | users.balance | Seamless Wallet |
---

결론

✅ Lv1(시스템관리자): 2개 지갑 (invest + oroplay) - api_configs 사용  
✅ Lv2(대본사): 2개 지갑 (invest + oroplay) - api_configs 사용 안 함  
✅ Lv3~Lv6(하위 파트너): 1개 지갑 (GMS 내부) - Seamless Wallet  
✅ Lv7(사용자): 1개 지갑 (GMS 내부) - Seamless Wallet  
✅ 투명성: Lv3 이하는 API를 의식하지 않음  
✅ 확장성: 3번째 API 추가해도 동일한 구조


*************API 계정 생성 정책 (백그라운드 제거)*************

정책 변경 사유:
- 백그라운드 처리는 Rate Limiter 큐 문제 발생 (OroPlay API)
- 승인되지 않을 사용자의 API 계정 생성은 리소스 낭비
- 명확한 에러 처리를 위해 동기 처리 필요

구현 계획

1. DB 스키마 (유지)
```sql
-- users 테이블에 API 계정 상태
-- 'pending': 외부 API 계정 미생성
-- 'active': 모든 API 계정 생성 완료 (게임 가능)
-- 'error': API 계정 생성 실패
-- 'partial': 일부 API만 성공 (일부 게임만 가능)
```

2. 사용자 회원가입 흐름 (UserLogin.tsx)
```
사용자 입력 → 확인 클릭
  ↓
GMS users 생성 (api_account_status='pending', status='pending')
  ↓
화면 즉시 전환 ✅ (API 호출 없음!)
  ↓
관리자 승인 대기
```

3. 관리자 직접 생성 흐름 (UserManagement.tsx - createUser)
```
관리자가 회원 생성 버튼 클릭
  ↓
GMS users 생성 (status='active')
  ↓
[동기 처리] Invest API 계정 생성
  ↓
[동기 처리] OroPlay API 계정 생성
  ↓
성공: api_account_status='active' → 즉시 게임 가능 ✅
실패: api_account_status='error' 또는 'partial'
```

4. 관리자 승인 흐름 (UserManagement.tsx - approveUser)
```
관리자가 승인 버튼 클릭
  ↓
[동기 처리] Invest API 계정 생성
  ↓
[동기 처리] OroPlay API 계정 생성
  ↓
성공 시: api_account_status='active', status='active'
실패 시: 롤백 또는 partial 상태
  ↓
사용자 게임 가능
```

5. 사용자 경험
```
회원가입: 즉시 완료 ✅ (관리자 승인 대기)
관리자 직접 생성: 즉시 게임 가능 ✅
로그인: 승인 후에만 가능
게임 시도: 승인 후에만 가능
```

6. 관리자 화면
```tsx
// UserManagement.tsx

<Table>
  <TableRow>
    <TableCell>{user.username}</TableCell>
    <TableCell>
      {user.api_account_status === 'pending' && (
        <Badge variant="secondary">계정 생성 중</Badge>
      )}
      {user.api_account_status === 'active' && (
        <Badge variant="success">정상</Badge>
      )}
      {user.api_account_status === 'error' && (
        <Badge variant="destructive">오류</Badge>
      )}
      {user.api_account_status === 'partial' && (
        <Badge variant="warning">부분 오류</Badge>
      )}
    </TableCell>
    <TableCell>
      {user.api_account_status === 'error' && (
        <Button onClick={() => retryApiAccountCreation(user.id)}>
          재시도
        </Button>
      )}
    </TableCell>
  </TableRow>
</Table>
```

필요한 파일:

`database/367_add_api_account_status.sql` - 스키마 수정
`database/368_update_register_user_function.sql` - 회원가입 함수 수정
`components/user/UserLogin.tsx` - 백그라운드 처리
`components/admin/UserManagement.tsx` - 상태 표시

---

*************파트너 생성 정책 (2025.01 업데이트)*************

## 정책 변경 내용

### 1. API 정보 관리 방식 변경 ✅
- ❌ **기존**: partners 테이블에 opcode, secret_key, api_token 컬럼 저장
- ✅ **변경**: 모든 API 정보는 api_configs 테이블에서 관리
- 🗑️ **완료**: partners.opcode, partners.secret_key, partners.api_token 컬럼 사용 중단
- ⚠️ **중요**: 모든 코드에서 partners 테이블의 opcode 참조 제거 완료

### 2. Lv2(대본사) 생성 간소화 ✅
**기존 방식:**
```
Lv1이 Lv2 생성 → opcode/secret_key/token 수동 입력 → API 연결 테스트 → 생성
```

**신규 방식 (2025.01 최종 업데이트):**
```
Lv1이 PartnerCreation.tsx에서 Lv2 생성
  ↓
기본 정보만 입력 (username, nickname, password)
  ↓
생성 버튼 클릭 → partners 테이블에 레코드 생성
  ↓
partners.invest_balance = 0, partners.oroplay_balance = 0으로 초기화
  ↓
완료! (api_configs는 Lv1만 사용하므로 생성하지 않음)
```

**변경 사유:**
- ⚠️ **중요**: Lv2는 api_configs를 사용하지 않음 (API credentials 없음)
- Lv2는 2개 지갑만 가짐 (invest_balance, oroplay_balance)
- Lv1이 Lv2에게 각 API별로 분리하여 입금
- Lv2는 Lv3 이하에게 합산된 금액을 지급 (Seamless Wallet 시작점)

### 3. Lv1이 Lv3~Lv6 생성 시 소속 선택 기능 추가 ✅
**기존 방식:**
```
Lv1이 Lv3~Lv6 생성 → 무조건 Lv1 직속으로 생성됨
```

**신규 방식 (구현 완료):**
```
Lv1이 PartnerCreation.tsx에서 Lv3~Lv6 생성
  ↓
"소속 파트너 선택" 드롭다운 표시
  ↓
선택 가능한 파트너 목록:
  - Lv2(대본사)
  - Lv3(본사)
  - Lv4(부본사)
  - Lv5(총판)
  - Lv6(매장)
  ↓
선택한 파트너의 하위로 생성됨
```

**구현 위치:**
- 파일: `/components/admin/PartnerCreation.tsx`
- 라인: 516-538 (소속 파트너 선택 드롭다운)

**UI 예시:**
```tsx
{user.partner_type === 'system_admin' && formData.partner_type !== 'head_office' && availableParents.length > 0 && (
  <div className="space-y-2">
    <Label htmlFor="selected_parent">소속 파트너 선택</Label>
    <Select 
      value={formData.selected_parent_id || ''} 
      onValueChange={(value) => handleInputChange('selected_parent_id', value)}
    >
      <SelectTrigger>
        <SelectValue placeholder="상위 파트너를 선택하세요" />
      </SelectTrigger>
      <SelectContent>
        {availableParents.map((parent) => (
          <SelectItem key={parent.id} value={parent.id}>
            {parent.nickname || parent.username} ({getPartnerLevelText(parent.level)})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

### 4. Lv1이 Lv7(회원) 생성 시 소속 선택 기능 추가 ✅
**기존 방식:**
```
Lv1이 회원 생성 → 무조건 Lv1 직속으로 생성됨
```

**신규 방식 (구현 완료):**
```
Lv1이 UserManagement.tsx 회원생성모달에서 회원 생성
  ↓
"소속 파트너" 드롭다운 표시 (선택사항)
  ↓
선택하지 않으면 → Lv1 직속으로 생성
선택하면 → 해당 파트너 소속으로 생성
  ↓
Invest + OroPlay API 계정 자동 생성
```

**구현 위치:**
- 파일: `/components/admin/UserManagement.tsx`
- 라인: 118 (selected_referrer_id 필드 정의)
- 라인: 198-221 (loadAvailablePartners 함수)
- 라인: 315-320 (actualReferrerId 결정 로직)

**UI 구현:**
```tsx
// formData에 selected_referrer_id 추가
const [formData, setFormData] = useState({
  username: '',
  nickname: '',
  password: '',
  bank_name: '',
  bank_account: '',
  memo: '',
  selected_referrer_id: '' // ✅ Lv1이 회원 생성 시 소속 파트너 선택
});

// Lv1 로그인 시 선택 가능한 파트너 목록 로드
useEffect(() => {
  if (authState.user?.level === 1) {
    loadAvailablePartners();
  }
}, [authState.user?.level]);

// 회원 생성 시 선택된 파트너 또는 현재 사용자를 referrer_id로 사용
const actualReferrerId = (authState.user?.level === 1 && formData.selected_referrer_id) 
  ? formData.selected_referrer_id 
  : authState.user?.id;
```

### 5. 데이터 조회 로직 변경 ✅

**기존 로직 (❌ 완전히 제거됨):**
```typescript
// PartnerManagement.tsx - 기존 (제거됨)
const { data: parentData } = await supabase
  .from('partners')
  .select('opcode, secret_key, api_token, parent_id')
  .eq('id', currentParentId)
  .single();

if (parentData.opcode && parentData.secret_key && parentData.api_token) {
  apiOpcode = parentData.opcode;
  apiSecretKey = parentData.secret_key;
  apiToken = parentData.api_token;
}
```

**신규 로직 (✅ 적용 완료):**
```typescript
// opcodeHelper.ts - api_configs 기반
export async function getAdminOpcode(admin: Partner): Promise<OpcodeInfo | MultipleOpcodeInfo> {
  // 1. 시스템관리자: 본인 + 모든 대본사의 api_configs 조회
  if (admin.partner_type === 'system_admin') {
    const { data: systemConfig } = await supabase
      .from('api_configs')
      .select('partner_id, invest_opcode, invest_secret_key, invest_token')
      .eq('partner_id', admin.id)
      .single();
    // ...
  }

  // 2. 대본사: 자신의 api_configs 조회
  if (admin.partner_type === 'head_office') {
    const { data: config } = await supabase
      .from('api_configs')
      .select('invest_opcode, invest_secret_key, invest_token')
      .eq('partner_id', admin.id)
      .single();
    // ...
  }

  // 3. 하위 파트너: 상위 대본사의 api_configs 조회 (재귀 탐색)
  while (currentPartnerId && attempts < maxAttempts) {
    const { data: parentPartner } = await supabase
      .from('partners')
      .select('id, partner_type, parent_id')
      .eq('id', currentPartnerId)
      .single();

    if (parentPartner.partner_type === 'head_office') {
      const { data: config } = await supabase
        .from('api_configs')
        .select('invest_opcode, invest_secret_key, invest_token')
        .eq('partner_id', parentPartner.id)
        .single();
      // ...
    }
  }
}
```

**PartnerManagement.tsx 수정:**
```typescript
// 파트너 생성 시 opcodeHelper 사용
const { getAdminOpcode, isMultipleOpcode } = await import('../../lib/opcodeHelper');

const tempPartner = {
  id: parentId || authState.user?.id || '',
  partner_type: formData.partner_type as any,
  parent_id: parentId,
  username: formData.username,
  nickname: formData.nickname
} as any;

const opcodeInfo = await getAdminOpcode(tempPartner);

// api_configs에서 조회한 정보로 API 계정 생성
const apiResult = await createAccount(apiOpcode, apiUsername, apiSecretKey);
```

### 6. 수정된 파일 목록 ✅

| 파일 | 변경 내용 | 상태 |
|------|----------|------|
| `database/397_partner_creation_policy_update.sql` | partners 테이블에서 opcode 관련 컬럼 제거 | ✅ 완료 |
| `lib/opcodeHelper.ts` | api_configs 테이블 기반으로 전환 | ✅ 완료 |
| `lib/apiAccountManager.ts` | api_configs 테이블 기반으로 전환 | ✅ 완료 |
| `components/admin/PartnerCreation.tsx` | Lv2 생성 간소화, Lv3~Lv6 소속 파트너 선택 | ✅ 완료 |
| `components/admin/PartnerManagement.tsx` | partners.opcode 참조 제거, api_configs 사용 | ✅ 완료 (2025.01) |
| `components/admin/UserManagement.tsx` | 회원생성모달에 소속 파트너 선택 드롭다운 | ✅ 완료 |
| `guidelines/add_api_policy.md` | 문서 업데이트 (이 섹션) | ✅ 완료 (2025.01) |

### 7. 마이그레이션 가이드

**기존 시스템에서 업그레이드 시:**

1. `database/397_partner_creation_policy_update.sql` 실행
   - partners 테이블 opcode 정보 백업
   - opcode 관련 컬럼 제거

2. 기존 opcode 데이터를 api_configs로 이전
   ```sql
   -- 기존 partners 테이블의 opcode 데이터를 api_configs로 복사
   INSERT INTO api_configs (partner_id, invest_opcode, invest_secret_key, invest_token)
   SELECT id, opcode, secret_key, api_token
   FROM partners
   WHERE opcode IS NOT NULL;
   ```

3. 프론트엔드 코드 업데이트
   - PartnerCreation.tsx 교체
   - UserManagement.tsx 업데이트
   - opcodeHelper.ts 교체
   - apiAccountManager.ts 업데이트

### 8. 주의사항

⚠️ **중요**: 
- partners 테이블에서 opcode 컬럼을 제거하기 전에 반드시 백업하세요
- 기존 대본사의 opcode 정보를 api_configs 테이블로 수동 이전해야 합니다
- Lv1(시스템관리자)가 Lv2(대본사) 생성 후, api_configs 테이블에 수동으로 API 정보를 입력해야 합니다

### 9. 신규 파트너 생성 플로우 (2025.01 최신) ✅

**Lv2(대본사) 생성: (2025.01 최종 업데이트)**
```
1. Lv1이 PartnerCreation 페이지(/components/admin/PartnerCreation.tsx) 접속
2. 대본사 정보 입력:
   - username (아이디)
   - nickname (닉네임)
   - password (비밀번호)
   - 은행 정보 (선택사항)
   ※ opcode/secret_key/token 입력 필드 없음!
3. "파트너 생성" 버튼 클릭
4. partners 테이블에 레코드 생성:
   {
     id: [생성된 파트너 ID],
     level: 2,
     partner_type: 'head_office',
     invest_balance: 0,
     oroplay_balance: 0,
     balance: 0  -- Lv2는 사용하지 않음
   }
5. 토스트 메시지: "대본사가 생성되었습니다."
6. 완료! (api_configs는 Lv1만 사용)
```

**⚠️ 중요**: Lv2는 api_configs를 사용하지 않음. Lv1이 입출금 관리 시 API를 선택하여 처리.

**Lv3~Lv6 생성 (본사/부본사/총판/매장):**
```
1. Lv1이 PartnerCreation 페이지 접속
2. 파트너 등급 선택 (본사/부본사/총판/매장)
3. "소속 파트너 선택" 드롭다운 표시됨 ✅
   - 선택 가능: 대본사, 본사, 부본사, 총판, 매장
4. 상위 파트너 선택 (필수)
5. 파트너 정보 입력 (username, nickname, password)
6. "파트너 생성" 버튼 클릭
7. 선택한 파트너의 parent_id로 설정되어 생성
8. opcodeHelper.getAdminOpcode()를 통해 상위 대본사의 api_configs 조회
9. Invest API 계정 자동 생성 (/api/account POST)
10. partners 테이블에 레코드 저장 (opcode 컬럼 없음)
```

**Lv7(회원) 생성:**
```
1. Lv1이 UserManagement 페이지(/components/admin/UserManagement.tsx) 접속
2. "회원 생성" 버튼 클릭 → 모달 열림
3. (선택사항) "소속 파트너" 드롭다운에서 파트너 선택 ✅
   - 선택하지 않으면: Lv1 직속으로 생성
   - 선택하면: 해당 파트너 소속으로 생성
4. 회원 정보 입력 (username, nickname, password, 은행 정보)
5. "생성" 버튼 클릭
6. users 테이블에 레코드 생성 (referrer_id = 선택한 파트너 또는 Lv1)
7. apiAccountManager.createApiAccounts() 호출:
   - Invest API 계정 생성 (상위 대본사 api_configs 사용)
   - OroPlay API 계정 생성 (상위 대본사 api_configs 사용)
8. 토스트 메시지: "회원 [username] 생성 완료! (Invest ✅ / OroPlay ✅)"
```
  

---

### 10. 지갑 관리 시스템 입출금 로직 (2025.01 최종 확정) ✅

**입출금 차감/증감 규칙:**

| 입출금 경로 | 관리자 잔고 | 대상 잔고 | 비고 |
|-----------|----------|---------|------|
| **Lv1 → Lv2** | 변동 없음 ❌ | 증감/차감 ✅ | 내부 할당만 (외부 API 지갑 ↔ 내부 지갑) |
| **Lv1 → Lv7** | 변동 없음 ❌ | 증감/차감 ✅ | 내부 거래만 (게임 플레이 시 외부 API 호출) |
| **Lv2 → Lv3~6** | 증감/차감 ✅ | 증감/차감 ✅ | 내부 거래 (partners.invest/oroplay_balance ↔ partners.balance) |
| **Lv2 → Lv7** | 증감/차감 ✅ | 증감/차감 ✅ | 내부 거래 (게임 플레이 시 외부 API 호출) |
| **Lv3~6 → Lv3~6** | 증감/차감 ✅ | 증감/차감 ✅ | 내부 거래 (partners.balance ↔ partners.balance) |
| **Lv3 → Lv7** | 증감/차감 ✅ | 증감/차감 ✅ | 내부 거래 (게임 플레이 시 외부 API 호출) |
| **Lv4 → Lv7** | 증감/차감 ✅ | 증감/차감 ✅ | 내부 거래 (게임 플레이 시 외부 API 호출) |
| **Lv5 → Lv7** | 증감/차감 ✅ | 증감/차감 ✅ | 내부 거래 (게임 플레이 시 외부 API 호출) |
| **Lv6 → Lv7** | 증감/차감 ✅ | 증감/차감 ✅ | 내부 거래 (게임 플레이 시 외부 API 호출) |

**핵심 원칙:**
1. **Lv1 → Lv2/Lv7 입출금**: 내부 거래만 (Lv1 api_configs 변동 없음)
2. **Lv2~Lv6 간 거래**: 모두 내부 거래 (양쪽 차감/증가)
3. **모든 레벨 → Lv7 입출금**: 내부 거래 (양쪽 차감/증가)
4. **외부 API 호출 시점**: 사용자가 게임을 플레이할 때만 (게임 시작/종료 시 해당 API의 Lv1 보유금 증감차감)

**외부 API 호출 흐름 (게임 플레이 시):**
```
사용자 게임 시작
  ↓
GMS 내부: 사용자 balance → 0, 관리자 balance → 0
  ↓
외부 API: 해당 게임 API의 Lv1 api_configs.invest_balance 차감
  ↓
게임 종료
  ↓
외부 API: 해당 게임 API의 Lv1 api_configs.invest_balance 증가
  ↓
GMS 내부: 사용자 balance 복구, 관리자 balance 복구
```

**구현 위치:**
- **파트너 간 입출금**: `/components/admin/PartnerManagement.tsx` (1195~1413번 줄)
- **사용자 입출금**: `/components/admin/UserManagement.tsx` (885~1085번 줄)
- **게임 플레이 API 호출**: `/components/user/GameLobby.tsx` (게임 시작/종료 시)
- **로그 기록**: `partner_balance_logs` 테이블

**업데이트 일시:** 2025.01.06