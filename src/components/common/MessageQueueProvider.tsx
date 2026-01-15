import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import { toast } from 'sonner@2.0.3';

interface MessageQueueMessage {
  id: string;
  message_type: string;
  priority: number;
  status: string;
  sender_type: string;
  sender_id: string;
  target_type: string;
  target_id: string;
  subject: string;
  message_data: any;
  reference_type?: string;
  reference_id?: string;
  created_at: string;
  scheduled_at: string;
}

interface RealtimeNotification {
  id: string;
  notification_type: string;
  title: string;
  content: string;
  action_url?: string;
  status: string;
  created_at: string;
  read_at?: string;
}

interface MessageQueueContextValue {
  // 메시지 큐 관련
  pendingMessages: MessageQueueMessage[];
  sendMessage: (type: string, data: any, priority?: number) => Promise<boolean>;
  processMessages: (silent: boolean) => Promise<void>;
  
  // 알림 관련
  notifications: RealtimeNotification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  
  // 상태
  isProcessing: boolean;
  lastProcessed: Date | null;
}

const MessageQueueContext = createContext<MessageQueueContextValue | null>(null);

export function useMessageQueue() {
  const context = useContext(MessageQueueContext);
  if (!context) {
    throw new Error('useMessageQueue must be used within a MessageQueueProvider');
  }
  return context;
}

interface MessageQueueProviderProps {
  children: React.ReactNode;
  userType: 'admin' | 'user';
  userId: string | null;
}

export const MessageQueueProvider = React.memo(({ children, userType, userId }: MessageQueueProviderProps) => {
  const { sendMessage: sendWebSocketMessage, lastMessage } = useWebSocketContext();
  
  const [pendingMessages, setPendingMessages] = useState<MessageQueueMessage[]>([]);
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastProcessed, setLastProcessed] = useState<Date | null>(null);

  // 대기 중인 메시지 조회 (관리자용)
  const fetchPendingMessages = useCallback(async () => {
    if (userType !== 'admin' || !userId) return;
    
    try {
      const { data, error } = await supabase
        .from('message_queue')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;
      setPendingMessages(data || []);
    } catch (error: any) {
      // Supabase 연결 안 됨 - 조용히 실패
      if (error?.message?.includes('Failed to fetch')) return;
      console.error('대기 메시지 조회 실패:', error);
    }
  }, [userType, userId]);

  // 알림 조회
  const fetchNotifications = useCallback(async () => {
    if (!userId) return; // userId가 없으면 조회하지 않음
    
    try {
      const { data, error } = await supabase
        .from('realtime_notifications')
        .select('*')
        .eq('recipient_type', userType)
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setNotifications(data || []);
      
      // 읽지 않은 알림 수 계산
      const unread = (data || []).filter(n => n.status !== 'read').length;
      setUnreadCount(unread);
    } catch (error: any) {
      // Supabase 연결 안 됨 - 조용히 실패
      if (error?.message?.includes('Failed to fetch')) return;
      console.error('알림 조회 실패:', error);
    }
  }, [userType, userId]);

  // 메시지 큐에 메시지 추가
  const sendMessage = useCallback(async (
    type: string, 
    data: any, 
    priority: number = 5
  ): Promise<boolean> => {
    try {
      // type이 유효한 문자열인지 확인
      if (!type || typeof type !== 'string') {
        console.error('Invalid message type:', type);
        return false;
      }

      // target_id 처리: null일 경우 sender_id로 대체 (자기 자신에게)
      const targetType = type.includes('request') ? 'admin' : 'user';
      const targetId = data.target_user_id || userId; // null 방지

      const { data: result, error } = await supabase
        .rpc('add_to_message_queue', {
          p_message_type: type,
          p_sender_type: userType,
          p_sender_id: userId,
          p_target_type: targetType,
          p_target_id: targetId,
          p_subject: data.subject || `${type} 메시지`,
          p_message_data: data,
          p_reference_type: data.reference_type || null,
          p_reference_id: data.reference_id || null,
          p_priority: priority
        });

      if (error) throw error;

      // WebSocket으로도 실시간 전송 (타입은 이미 sendWebSocketMessage의 첫 번째 매개변수로 전달됨)
      sendWebSocketMessage(type, {
        ...data,
        queue_id: result,
        sender: { type: userType, id: userId },
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error('메시지 전송 실패:', error);
      return false;
    }
  }, [userType, userId, sendWebSocketMessage]);

  // 메시지 큐 처리 (관리자용)
  const processMessages = useCallback(async (silent: boolean = false) => {
    if (userType !== 'admin' || isProcessing) return;
    
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.rpc('process_message_queue');
      
      if (error) throw error;
      
      const processedCount = data?.[0]?.processed_count || 0;
      if (processedCount > 0) {
        // 수동 호출일 때만 토스트 표시
        if (!silent) {
          toast.success(`${processedCount}개의 메시지를 처리했습니다.`);
        }
        await fetchPendingMessages();
        await fetchNotifications();
      }
      
      setLastProcessed(new Date());
    } catch (error) {
      console.error('메시지 처리 실패:', error);
      // 에러는 항상 표시
      if (!silent) {
        toast.error('메시지 처리 중 오류가 발생했습니다.');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [userType, isProcessing, fetchPendingMessages, fetchNotifications]);

  // 알림 읽음 처리
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .rpc('mark_notification_as_read', {
          p_notification_id: notificationId,
          p_recipient_id: userId
        });

      if (error) throw error;
      
      // 로컬 상태 업데이트
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId
            ? { ...n, status: 'read', read_at: new Date().toISOString() }
            : n
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('알림 읽음 처리 실패:', error);
    }
  }, [userId]);

  // 모든 알림 삭제
  const clearAllNotifications = useCallback(async () => {
    try {
      // 모든 읽지 않은 알림을 읽음으로 처리
      const unreadNotifications = notifications.filter(n => n.status !== 'read');
      
      for (const notification of unreadNotifications) {
        await markAsRead(notification.id);
      }
      
      toast.success('모든 알림을 확인했습니다.');
    } catch (error) {
      console.error('알림 일괄 처리 실패:', error);
      toast.error('알림 처리 중 오류가 발생했습니다.');
    }
  }, [notifications, markAsRead]);

  // WebSocket 메시지 처리
  useEffect(() => {
    if (!lastMessage) return;

    // 메시지 구조 정규화
    const rawMessage = lastMessage;
    const messageType = typeof rawMessage.type === 'string' ? rawMessage.type : rawMessage.data?.type;
    const messageData = rawMessage.data || rawMessage;
    
    // type이 유효한 문자열인지 확인
    if (!messageType || typeof messageType !== 'string') {
      console.error('Invalid message type received:', { messageType, messageData, lastMessage });
      return;
    }

    // 실시간 알림 처리
    if (messageType.includes('request') || messageType.includes('approved') || messageType.includes('rejected') || messageType.includes('processed') || messageType.includes('completed')) {
      // 사용자별 메시지 필터링
      const isForMe = 
        (userType === 'admin' && messageType.includes('request')) ||
        (userType === 'user' && (messageData.target_user_id === userId || messageData.username === userId));
      
      if (isForMe) {
        // 토스트 알림 표시
        const isUrgent = messageType.includes('request');
        const toastType = messageType.includes('approved') || messageType.includes('completed') || (messageType.includes('processed') && messageData.action === 'approve') ? 'success' : 
                         messageType.includes('rejected') || (messageType.includes('processed') && messageData.action === 'reject') ? 'error' : 'info';
        
        const title = messageType.includes('deposit') ? '입금 알림' :
                     messageType.includes('withdrawal') ? '출금 알림' : 
                     messageType.includes('transaction_processed') ? '거래 처리 알림' :
                     '거래 알림';
        
        // transaction_processed 타입에 대한 특별 처리
        let description = '';
        if (messageType === 'transaction_processed') {
          const { action, amount, newBalance, processedBy } = messageData;
          const actionText = action === 'approve' ? '승인' : '거절';
          const amountText = amount ? `₩${Number(amount).toLocaleString()}` : '';
          const balanceText = newBalance !== undefined ? `잔고: ₩${Number(newBalance).toLocaleString()}` : '';
          description = `${actionText}되었습니다. ${amountText} ${balanceText} (처리자: ${processedBy || '시스템'})`;
        }

        if (toastType === 'success') {
          toast.success(title, { description: description || messageData.message || '처리가 완료되었습니다.' });
        } else if (toastType === 'error') {
          toast.error(title, { description: description || messageData.message || '요청이 거절되었습니다.' });
        } else {
          toast.info(title, { 
            description: description || messageData.message || '새로운 요청이 있습니다.',
            duration: isUrgent ? 8000 : 4000
          });
        }
        
        // 알림 목록 새로고침
        setTimeout(() => {
          fetchNotifications();
          if (userType === 'admin') {
            fetchPendingMessages();
          }
        }, 500);
      }
    }
  }, [lastMessage, userType, userId, fetchNotifications, fetchPendingMessages]);

  // 실시간 구독 설정
  useEffect(() => {
    // 알림 테이블 구독
    const notificationSubscription = supabase
      .channel('user-notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'realtime_notifications',
        filter: `recipient_type=eq.${userType}`
      }, (payload) => {
        if (payload.new && payload.new.recipient_id === userId) {
          fetchNotifications();
        }
      })
      .subscribe();

    // 메시지 큐 구독 (관리자용)
    let messageQueueSubscription: any = null;
    if (userType === 'admin') {
      messageQueueSubscription = supabase
        .channel('admin-message-queue')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'message_queue'
        }, () => {
          fetchPendingMessages();
        })
        .subscribe();
    }

    return () => {
      notificationSubscription.unsubscribe();
      if (messageQueueSubscription) {
        messageQueueSubscription.unsubscribe();
      }
    };
  }, [userType, userId, fetchNotifications, fetchPendingMessages]);

  // 초기 데이터 로드
  useEffect(() => {
    fetchNotifications();
    if (userType === 'admin') {
      fetchPendingMessages();
    }
  }, [fetchNotifications, fetchPendingMessages, userType]);

  // 자동 메시지 처리 (관리자용)
  useEffect(() => {
    if (userType !== 'admin') return;

    const interval = setInterval(() => {
      if (pendingMessages.length > 0 && !isProcessing) {
        processMessages(true); // 자동 호출 시 silent 설정
      }
    }, 60000); // 1분마다

    return () => clearInterval(interval);
  }, [userType, pendingMessages.length, isProcessing, processMessages]);

  const value: MessageQueueContextValue = {
    pendingMessages,
    sendMessage,
    processMessages,
    notifications,
    unreadCount,
    markAsRead,
    clearAllNotifications,
    isProcessing,
    lastProcessed
  };

  const memoizedValue = React.useMemo(() => value, [
    pendingMessages,
    sendMessage,
    processMessages,
    notifications,
    unreadCount,
    markAsRead,
    clearAllNotifications,
    isProcessing,
    lastProcessed
  ]);

  return (
    <MessageQueueContext.Provider value={memoizedValue}>
      {children}
    </MessageQueueContext.Provider>
  );
});