-- ============================================
-- Migration: notifications → realtime_notifications
-- transactions에서 온 온라인 입출금 요청만 이동
-- (online_deposit, online_withdrawal 타입만)
-- ============================================

-- 1️⃣ transactions의 pending 입출금 요청에 해당하는 알림만 이동
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
  n.id,
  n.recipient_type,
  n.recipient_id,
  n.notification_type,
  n.title,
  n.content,
  CASE 
    WHEN n.is_read = true THEN 'read'
    ELSE 'pending'
  END as status,
  n.read_at,
  n.created_at,
  COALESCE(n.read_at, n.created_at) as updated_at
FROM public.notifications n
-- transactions에서 온 온라인 입출금 요청만 연결
INNER JOIN public.transactions t ON (
  n.notification_type IN ('online_deposit', 'online_withdrawal')
  AND t.status = 'pending'
  AND t.transaction_type IN ('deposit', 'withdrawal')
)
ON CONFLICT (id) DO NOTHING;

-- 2️⃣ 마이그레이션 완료 확인 (이동된 알림 수)
SELECT 
  COUNT(*) as migrated_count,
  SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
FROM public.realtime_notifications
WHERE notification_type IN ('online_deposit', 'online_withdrawal');

-- 3️⃣ (선택) 이동된 알림을 notifications에서 삭제
-- ⚠️ 데이터 검증 후 실행!
-- DELETE FROM public.notifications
-- WHERE notification_type IN ('online_deposit', 'online_withdrawal')
-- AND id IN (
--   SELECT id FROM public.realtime_notifications 
--   WHERE notification_type IN ('online_deposit', 'online_withdrawal')
-- );
