# 제공사 상태 관리 빠른 참조 가이드

## 🚀 5분 안에 시작하기

### 1단계: DB 업데이트 (1회만 실행)
```sql
-- Supabase SQL Editor에서 실행
-- /database/401_update_game_providers_schema.sql 파일 내용 복사 & 실행
```

### 2단계: 제공사 초기화 (Lv1 전용, 1회만 실행)
```
관리자 페이지 > 게임 관리 > "제공사 초기화" 버튼 클릭
```

### 3단계: 제공사 상태 관리
```
1. 제공사 카드 클릭
2. 하단 드롭다운에서 상태 선택
   - 노출: 사용자에게 표시
   - 점검중: 임시로 숨김
   - 숨김: 완전히 숨김
```

---

## 📋 제공사 상태 한눈에 보기

| 상태 | 코드 | 제공사 | 게임 | 사용 상황 |
|------|------|--------|------|----------|
| 🟢 노출 | `visible` | ✅ 표시 | ✅ 표시 | 정상 운영 |
| 🟠 점검중 | `maintenance` | ❌ 숨김 | ❌ 자동 숨김 | API 오류, 임시 점검 |
| ⚫ 숨김 | `hidden` | ❌ 숨김 | ❌ 자동 숨김 | 계약 종료, 영구 중단 |

---

## 🎯 주요 사용 시나리오

### 시나리오 1: 제공사 임시 점검
```typescript
// 예: 에볼루션 게이밍 API 오류 발생
제공사 선택 → "점검중" 선택
결과: 사용자는 에볼루션 제공사와 모든 게임을 볼 수 없음

// 문제 해결 후
제공사 선택 → "노출" 선택
결과: 제공사와 게임 다시 표시
```

### 시나리오 2: 특정 제공사 영구 비활성화
```typescript
// 예: 계약 종료된 제공사
제공사 선택 → "숨김" 선택
결과: 사용자에게 완전히 숨김 (관리자는 볼 수 있음)
```

### 시나리오 3: 일부 게임만 숨기기
```typescript
// 제공사는 노출 유지, 개별 게임만 숨김
1. 제공사는 "노출" 상태 유지
2. 특정 게임만 "숨김" 또는 "점검중"으로 변경
결과: 제공사는 보이지만, 해당 게임만 숨김
```

---

## ⚡ 성능 최적화 팁

### Invest 게임 동기화
```
이전: 30초 → 현재: 3~5초 (83% 단축)
방법: 병렬 처리 (배치 크기: 5개)
```

### 검색 최적화
```
300ms debounce 적용
→ 입력 후 0.3초 대기하여 불필요한 검색 방지
```

---

## 🔍 문제 해결 (트러블슈팅)

### Q: 제공사 상태 변경이 사용자 페이지에 반영 안 됨
```bash
# 해결 방법 1: 페이지 새로고침
사용자 페이지에서 F5 또는 Ctrl+R

# 해결 방법 2: 브라우저 캐시 삭제
Ctrl+Shift+Delete → 캐시 삭제

# 해결 방법 3: DB 확인
SELECT status, is_visible FROM game_providers WHERE id = [제공사ID];
```

### Q: 제공사를 노출로 바꿨는데 일부 게임이 안 보임
```bash
# 정상 동작입니다
# 제공사를 노출로 변경하면:
# - status='visible' 게임 → 표시
# - status='hidden' 게임 → 여전히 숨김
# - status='maintenance' 게임 → 여전히 점검중

# 모든 게임을 표시하려면:
관리자 페이지 > 게임 관리 > 게임 선택 > "노출"로 변경
```

### Q: 게임 동기화가 너무 오래 걸림
```bash
# 정상 소요 시간:
# - Invest: 3~5초
# - OroPlay: 30초~1분

# 더 오래 걸린다면:
# 1. 네트워크 연결 확인
# 2. 프록시 서버 상태 확인
# 3. API 서버 상태 확인
```

---

## 📞 빠른 지원

### 문서 링크:
- **상세 가이드**: `/GAME_MANAGEMENT_GUIDE.md`
- **기능 설명**: `/PROVIDER_STATUS_FEATURE.md`
- **구현 체크리스트**: `/IMPLEMENTATION_CHECKLIST.md`
- **릴리즈 노트**: `/RELEASE_NOTES_v2.0.0.md`

### SQL 스크립트:
- **스키마 업데이트**: `/database/401_update_game_providers_schema.sql`
- **테이블 초기화**: `/database/400_reset_game_tables.sql`

---

## 🛠️ 관리자 권한별 기능

| 기능 | Lv1 | Lv2-7 |
|------|-----|-------|
| 제공사 초기화 | ✅ | ❌ |
| 게임 동기화 | ✅ | ❌ |
| 제공사 상태 변경 | ✅ | ✅ |
| 게임 상태 변경 | ✅ | ✅ |
| 게임 추천 설정 | ✅ | ✅ |
| 일괄 작업 | ✅ | ✅ |

---

## 💡 유용한 SQL 쿼리

### 모든 제공사 상태 확인
```sql
SELECT 
  name,
  status,
  is_visible,
  COUNT(g.id) as game_count
FROM game_providers p
LEFT JOIN games g ON g.provider_id = p.id
GROUP BY p.id, p.name, p.status, p.is_visible
ORDER BY name;
```

### 점검중인 제공사 찾기
```sql
SELECT id, name, type, api_type
FROM game_providers
WHERE status = 'maintenance';
```

### 숨김 처리된 제공사 찾기
```sql
SELECT id, name, type, api_type
FROM game_providers
WHERE status = 'hidden';
```

### 제공사별 노출/숨김 게임 수 확인
```sql
SELECT 
  p.name,
  p.status as provider_status,
  COUNT(g.id) as total_games,
  SUM(CASE WHEN g.is_visible = true THEN 1 ELSE 0 END) as visible_games,
  SUM(CASE WHEN g.is_visible = false THEN 1 ELSE 0 END) as hidden_games
FROM game_providers p
LEFT JOIN games g ON g.provider_id = p.id
GROUP BY p.id, p.name, p.status
ORDER BY total_games DESC;
```

### 모든 제공사를 노출 상태로 되돌리기
```sql
UPDATE game_providers 
SET status = 'visible', is_visible = true;

UPDATE games 
SET is_visible = (status = 'visible');
```

---

## 🎨 UI 색상 가이드

### 제공사 카드 색상:
- **노출**: 슬레이트 (기본)
- **점검중**: 오렌지/호박색
- **숨김**: 회색 (반투명)

### 배지:
- **점검중**: `bg-orange-600` + "점검중" 텍스트
- **숨김**: `bg-slate-600` + "숨김" 텍스트
- **노출**: 배지 없음

---

## ⌨️ 키보드 단축키 (향후 추가 예정)

```
Ctrl + R: 새로고침
Ctrl + F: 검색
Esc: 선택 해제
```

---

## 📊 성능 모니터링

### 확인할 메트릭:
1. **게임 로딩 시간**: 3~5초 이내 (정상)
2. **제공사 상태 변경**: 1초 이내 (정상)
3. **검색 응답**: 즉시 (300ms debounce)

### 성능 저하 시:
1. 브라우저 캐시 삭제
2. DB 인덱스 확인
3. 네트워크 연결 확인

---

**최종 업데이트**: 2025-01-11  
**버전**: v2.0.0  
**상태**: 프로덕션 준비 완료 ✅
