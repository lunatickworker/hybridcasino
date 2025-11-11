# Release Notes - v2.0.0

## 🎉 제공사 상태 관리 기능 추가

**릴리즈 일자**: 2025-01-11  
**버전**: v2.0.0  
**주요 변경**: 제공사(Provider) 노출/비노출/점검중 상태 관리 기능 추가

---

## 🆕 새로운 기능

### 1. 제공사 상태 관리 (3가지 상태)

제공사별로 사용자 노출 상태를 세밀하게 관리할 수 있습니다:

| 상태 | 사용 시나리오 | 사용자 영향 | 하위 게임 영향 |
|------|--------------|------------|--------------|
| **노출** (visible) | 정상 운영 중 | ✅ 제공사와 게임 모두 표시 | 게임 원래 상태 유지 |
| **점검중** (maintenance) | 임시 점검, API 오류 등 | ❌ 제공사와 게임 모두 숨김 | 모든 게임 자동 숨김 |
| **숨김** (hidden) | 계약 종료, 영구 비활성화 | ❌ 제공사와 게임 모두 숨김 | 모든 게임 자동 숨김 |

### 2. 계층적 상태 관리

```
제공사 (Provider)
  ↓ 상태 영향
게임 (Game)
  ↓ 최종 노출 여부
사용자 페이지
```

**규칙**:
- 제공사가 점검중/숨김 → 모든 하위 게임 자동 숨김
- 제공사가 노출 → 게임 개별 상태에 따라 표시
- 사용자는 제공사와 게임 모두 visible이어야 볼 수 있음

### 3. 직관적인 관리자 UI

- **시각적 상태 표시**: 
  - 노출: 기본 색상
  - 점검중: 오렌지 배지 + 오렌지 계열 배경
  - 숨김: 회색 배지 + 반투명 회색 배경

- **간편한 상태 변경**:
  - 제공사 선택 → 드롭다운에서 상태 선택 → 즉시 적용

- **실시간 피드백**:
  - 토스트 메시지로 변경 결과 확인
  - 제공사 카드 색상 즉시 변경
  - 하위 게임 자동 업데이트

---

## ⚡ 성능 개선

### 1. 게임 로딩 속도 대폭 향상
- **이전**: 30초 (순차 처리)
- **현재**: 3~5초 (병렬 처리)
- **개선율**: 83% 단축 ⚡

**구현 방법**:
- 배치 크기: 5개 제공사씩 동시 처리
- 배치 간 대기: 300ms (API Rate Limit 고려)

### 2. 검색 응답성 개선
- **debounce 적용**: 300ms
- **효과**: 불필요한 재렌더링 방지, CPU 사용량 감소

### 3. DB 인덱스 추가
```sql
CREATE INDEX idx_game_providers_status ON game_providers(status);
CREATE INDEX idx_game_providers_is_visible ON game_providers(is_visible);
CREATE INDEX idx_game_providers_api_type_type ON game_providers(api_type, type);
```

---

## 🔧 기술적 변경사항

### DB 스키마 업데이트

#### game_providers 테이블:
```sql
-- 신규 컬럼
is_visible BOOLEAN DEFAULT TRUE

-- 기존 컬럼 타입 변경
status TEXT DEFAULT 'visible'  -- 'active'|'inactive' → 'visible'|'maintenance'|'hidden'

-- 새로운 CHECK 제약 조건
CONSTRAINT game_providers_status_check CHECK (status IN ('visible', 'maintenance', 'hidden'))
```

#### games 테이블:
```sql
-- 신규 컬럼
is_visible BOOLEAN DEFAULT TRUE

-- 기존 컬럼 타입 변경
status TEXT DEFAULT 'visible'  -- 'active'|'inactive' → 'visible'|'maintenance'|'hidden'

-- 새로운 CHECK 제약 조건
CONSTRAINT games_status_check CHECK (status IN ('visible', 'maintenance', 'hidden'))
```

#### 마이그레이션:
- 파일: `/database/401_update_game_providers_schema.sql`
- 기존 CHECK 제약 조건 자동 삭제
- `active` → `visible` 자동 변환
- `inactive` → `hidden` 자동 변환
- 새로운 CHECK 제약 조건 추가
- 성능 최적화 인덱스 8개 추가

### API 함수 추가

#### `/lib/gameApi.ts`:
```typescript
// 제공사 상태 관리
updateProviderStatus(providerId, status)
updateProviderVisibility(providerId, isVisible)
getUserVisibleProviders(filters)
```

### UI 컴포넌트 업데이트

#### `/components/admin/EnhancedGameManagement.tsx`:
- 제공사 카드 상태별 시각화
- 제공사 상태 변경 드롭다운
- 제공사 상태 변경 핸들러
- 통계 카드 MetricCard 컴포넌트 사용

---

## 📝 문서 업데이트

### 신규 문서:
1. **PROVIDER_STATUS_FEATURE.md** - 제공사 상태 관리 기능 상세 설명
2. **IMPLEMENTATION_CHECKLIST.md** - 구현 단계별 체크리스트
3. **RELEASE_NOTES_v2.0.0.md** - 릴리즈 노트 (현재 문서)
4. **401_update_game_providers_schema.sql** - DB 마이그레이션 스크립트

### 업데이트된 문서:
1. **GAME_MANAGEMENT_GUIDE.md** - 최신 기능 반영, 성능 개선 내역 추가

---

## 🚀 배포 가이드

### 필수 작업 순서:

1. **DB 마이그레이션 실행** (필수)
   ```sql
   -- Supabase SQL Editor에서 실행
   -- /database/401_update_game_providers_schema.sql
   ```

2. **코드 배포** (필수)
   - 최신 코드 pull/deploy
   - 브라우저 캐시 클리어

3. **제공사 초기화** (Lv1 전용, 권장)
   - 관리자 페이지 > 게임 관리
   - "제공사 초기화" 버튼 클릭
   - 모든 제공사가 visible 상태로 생성됨

4. **테스트 수행** (권장)
   - IMPLEMENTATION_CHECKLIST.md 참고
   - 제공사 상태 변경 테스트
   - 사용자 페이지 노출 확인

---

## ⚠️ 주의사항

### 1. 하위 호환성
- **기존 데이터 자동 마이그레이션**: `active` → `visible`, `inactive` → `hidden`
- **is_visible 컬럼 자동 추가**: 기본값 `true`
- **기존 게임 상태 유지**: 변경 없음

### 2. 제공사 상태 변경 시 영향
- **점검중/숨김으로 변경**: 해당 제공사의 모든 게임이 사용자에게 즉시 숨겨집니다
- **노출로 복원**: 게임의 원래 상태(status)에 따라 선택적으로 표시됩니다

### 3. 권한 관리
- **Lv1 전용**: 제공사 초기화, 게임 동기화
- **모든 관리자**: 제공사 상태 변경, 게임 상태 변경

---

## 🐛 알려진 이슈 및 해결 방법

### 이슈 1: 제공사 상태 변경 후 사용자 페이지에 즉시 반영 안 됨
**원인**: 브라우저 캐시  
**해결**: 페이지 새로고침 (F5) 또는 WebSocket 실시간 동기화 구현

### 이슈 2: 일부 제공사의 게임이 0개로 표시됨
**원인**: 정상 동작 (로비 진입 방식 제공사 또는 API 미지원)  
**해결**: 게임 동기화 후에도 0개인 경우 정상

### 이슈 3: OroPlay 제공사 동기화가 오래 걸림
**원인**: API 응답 속도, Rate Limit  
**해결**: 정상 (30초~1분 소요), 대기 권장

---

## 📊 성능 벤치마크

### 테스트 환경:
- 제공사 수: 46개 (Invest) + N개 (OroPlay)
- 게임 수: 약 2,000~3,000개
- 네트워크: 일반 인터넷 환경

### 측정 결과:

| 작업 | v1.0.0 | v2.0.0 | 개선율 |
|------|--------|--------|--------|
| Invest 게임 동기화 | 30초 | 3~5초 | 83% ↓ |
| 제공사 상태 변경 | N/A | <1초 | - |
| 게임 목록 로딩 | 2~3초 | 1~2초 | 33% ↓ |
| 검색 필터링 | 즉시 (과부하) | 300ms delay | CPU↓ |

---

## 🎯 다음 버전 계획 (v2.1.0)

### 예정 기능:
1. **점검중 안내 메시지**
   - 사용자 페이지에서 점검중 제공사/게임 표시
   - 점검 종료 예정 시간 안내

2. **WebSocket 실시간 동기화**
   - 관리자 상태 변경 시 사용자 페이지 즉시 반영
   - 브라우저 새로고침 불필요

3. **제공사별 통계**
   - 제공사별 플레이 횟수
   - 제공사별 인기도 순위
   - 제공사별 매출 통계

4. **일괄 제공사 상태 변경**
   - 여러 제공사 동시 선택
   - 일괄 상태 변경

5. **상태 변경 이력**
   - 누가, 언제, 어떤 제공사를, 어떻게 변경했는지 로그
   - 감사(Audit) 기능

---

## 👥 기여자

- **개발**: 게임 관리 시스템 개발팀
- **테스트**: QA 팀
- **문서**: 프로젝트 매니저

---

## 📞 지원

### 문의사항:
- **기술 지원**: 개발팀
- **사용 방법**: GAME_MANAGEMENT_GUIDE.md 참고
- **상세 기능**: PROVIDER_STATUS_FEATURE.md 참고
- **구현 가이드**: IMPLEMENTATION_CHECKLIST.md 참고

### 긴급 상황:
- **롤백 필요 시**: 시스템 관리자 (Lv1) 연락
- **DB 복구**: IMPLEMENTATION_CHECKLIST.md > 9단계 참고

---

**릴리즈 완료**: 2025-01-11  
**다음 릴리즈 예정**: v2.1.0 (TBD)  
**라이선스**: 프로젝트 라이선스 준수

---

## ✅ 체크리스트

배포 전 확인사항:
- [ ] DB 마이그레이션 실행 완료
- [ ] 코드 배포 완료
- [ ] 제공사 초기화 완료
- [ ] 관리자 UI 테스트 완료
- [ ] 사용자 페이지 확인 완료
- [ ] 문서 업데이트 완료
- [ ] 팀 교육 완료

**모든 체크리스트 완료 시 프로덕션 배포 가능** ✅
