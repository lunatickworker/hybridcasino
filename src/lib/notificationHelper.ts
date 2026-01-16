import { supabase } from './supabase';

export interface NotificationData {
  user_id: string;
  username: string;
  user_login_id: string;
  partner_id: string; // 알림을 받을 관리자 ID (사용자의 referrer_id)
  message: string;
  log_message?: string;
  notification_type: 'balance_insufficient' | 'game_error' | 'api_error' | 'system_error' | 'online_deposit' | 'online_withdrawal';
}

/**
 * 관리자 알림 생성 (사용자 페이지에서 중요한 에러 발생 시)
 */
export async function createAdminNotification(data: NotificationData) {
  try {
    const { error } = await supabase
      .from('realtime_notifications')
      .insert({
        recipient_type: 'partner',
        recipient_id: data.partner_id, // ✅ 관리자 ID로 설정
        notification_type: data.notification_type,
        title: data.message,
        content: JSON.stringify({
          username: data.username,
          user_login_id: data.user_login_id,
          log_message: data.log_message || data.message,
        }),
        status: 'pending',
      });

    if (error) {
      console.error('❌ [알림 생성 실패]', error);
      return false;
    }

    console.log('✅ [관리자 알림 생성]', data);
    return true;
  } catch (error) {
    console.error('❌ [알림 생성 예외]', error);
    return false;
  }
}

/**
 * 읽지 않은 알림 개수 조회
 */
export async function getUnreadNotificationCount(partnerId?: string) {
  try {
    let query = supabase
      .from('realtime_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_type', 'partner')
      .eq('status', 'pending');

    // partnerId가 제공되면 해당 파트너의 알림만 조회
    if (partnerId) {
      query = query.eq('recipient_id', partnerId);
    }

    const { count, error } = await query;

    if (error) {
      console.error('❌ [알림 개수 조회 실패]', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('❌ [알림 개수 조회 예외]', error);
    return 0;
  }
}

/**
 * 알림 읽음 처리
 */
export async function markNotificationAsRead(notificationId: string) {
  try {
    const { error } = await supabase
      .from('realtime_notifications')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId);

    if (error) {
      console.error('❌ [알림 읽음 처리 실패]', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ [알림 읽음 처리 예외]', error);
    return false;
  }
}

/**
 * 모든 알림 읽음 처리
 */
export async function markAllNotificationsAsRead(partnerId?: string) {
  try {
    let query = supabase
      .from('realtime_notifications')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('recipient_type', 'partner')
      .eq('status', 'pending');

    // partnerId가 제공되면 해당 파트너의 알림만 업데이트
    if (partnerId) {
      query = query.eq('recipient_id', partnerId);
    }

    const { error } = await query;

    if (error) {
      console.error('❌ [전체 알림 읽음 처리 실패]', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ [전체 알림 읽음 처리 예외]', error);
    return false;
  }
}