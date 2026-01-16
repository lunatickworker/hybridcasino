-- ============================================
-- Migration: notifications → realtime_notifications
-- notifications 테이블의 데이터를 realtime_notifications로 이동
-- ============================================

-- 1️⃣ 데이터 마이그레이션 (is_read → status 변환)
INSERT INTO public.realtime_notifications (
  id,
  recipient_type,
  recipient_id,
  notification_type,
  title,
  content,
  status,
  read_at,
  created_at,
  updated_at
)
SELECT 
  id,
  recipient_type,
  recipient_id,
  notification_type,
  title,
  content,
  CASE 
    WHEN is_read = true THEN 'read'
    ELSE 'pending'
  END as status,
  read_at,
  created_at,
  COALESCE(read_at, created_at) as updated_at
FROM public.notifications
ON CONFLICT (id) DO NOTHING;  -- 중복 방지

-- 2️⃣ 마이그레이션 완료 확인
SELECT 
  COUNT(*) as total_count,
  SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
FROM public.realtime_notifications
WHERE created_at >= NOW() - INTERVAL '1 hour';  -- 최근 1시간 데이터

-- 3️⃣ (선택) 원본 notifications 테이블 백업 후 정리
-- ⚠️ 데이터 검증 후 실행!
-- DELETE FROM public.notifications;
