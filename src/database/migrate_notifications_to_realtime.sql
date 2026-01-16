-- ============================================
-- Migration: transactions에서 pending 데이터 → realtime_notifications
-- 
-- Trigger가 이미 설정되었다면, 이후부터는 자동으로 기록됩니다.
-- 기존의 pending transaction 데이터만 복사하면 됩니다.
-- ============================================

-- ✅ STEP 1: Trigger 존재 확인
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname = 'trg_notify_transaction_deposit';

-- ✅ STEP 2: transactions에서 pending 데이터 확인
SELECT id, user_id, partner_id, transaction_type, amount, status, created_at
FROM public.transactions 
WHERE status = 'pending';

-- 참고: 모든 pending transaction의 transaction_type 확인
SELECT DISTINCT transaction_type, COUNT(*) as cnt
FROM public.transactions 
WHERE status = 'pending'
GROUP BY transaction_type;

-- STEP 2-1: partner_id가 NULL인지 확인
SELECT id, partner_id, transaction_type
FROM public.transactions 
WHERE status = 'pending' AND partner_id IS NULL;

-- ✅ STEP 3: 기존 pending transaction → realtime_notifications로 복사
-- 조건별 확인

-- STEP 3-1: partner_deposit 데이터 확인
SELECT id, partner_id, transaction_type, status
FROM public.transactions 
WHERE transaction_type = 'partner_deposit';

-- STEP 3-2: pending + partner_deposit 확인
SELECT id, partner_id, transaction_type, status
FROM public.transactions 
WHERE status = 'pending' AND transaction_type = 'partner_deposit';

-- STEP 3-3: 최종 INSERT될 데이터 확인
SELECT *
FROM public.transactions t
WHERE t.status = 'pending'
  AND t.partner_id IS NOT NULL;

-- ✅ STEP 4: 복사 완료 확인
SELECT COUNT(*) as copied_count, notification_type
FROM public.realtime_notifications
WHERE notification_type IN ('online_deposit', 'online_withdrawal')
  AND status = 'pending'
GROUP BY notification_type;

-- STEP 4-1: realtime_notifications에 모든 pending 기록 확인
SELECT id, recipient_type, recipient_id, notification_type, status, created_at
FROM public.realtime_notifications
WHERE status = 'pending'
LIMIT 10;

