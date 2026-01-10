import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, CheckCheck, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../../lib/notificationHelper';
import { toast } from 'sonner@2.0.3';

interface Notification {
  id: string;
  recipient_id: string;
  notification_type: string;
  title: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationCountChange: (count: number) => void;
  currentPartnerId: string; // 현재 로그인한 관리자 ID
}

export function NotificationsModal({ isOpen, onClose, onNotificationCountChange, currentPartnerId }: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // 알림 목록 로드
  const loadNotifications = async () => {
    setLoading(true);
    try {
      console.log('🔍 [알림 로드] currentPartnerId:', currentPartnerId);
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_type', 'partner')
        .eq('recipient_id', currentPartnerId)
        .order('created_at', { ascending: false })
        .limit(100);

      console.log('🔍 [알림 로드] 쿼리 결과:', { data, error, count: data?.length });

      if (error) throw error;

      setNotifications(data || []);
      setFilteredNotifications(data || []);
      
      // 읽지 않은 알림 개수 업데이트
      const unreadCount = (data || []).filter(n => !n.is_read).length;
      onNotificationCountChange(unreadCount);
    } catch (error) {
      console.error('❌ 알림 로드 실패:', error);
      toast.error('알림을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 검색 및 필터링
  useEffect(() => {
    let filtered = notifications;

    // 읽음/안읽음 필터
    if (filter === 'unread') {
      filtered = filtered.filter(n => !n.is_read);
    }

    // 검색어 필터
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n => {
        const contentData = n.content ? JSON.parse(n.content) : {};
        return (
          n.title.toLowerCase().includes(query) ||
          (contentData.username || '').toLowerCase().includes(query) ||
          (contentData.user_login_id || '').toLowerCase().includes(query) ||
          (contentData.log_message || '').toLowerCase().includes(query)
        );
      });
    }

    setFilteredNotifications(filtered);
  }, [searchQuery, notifications, filter]);

  // 모달 열릴 때 데이터 로드
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  // 실시간 알림 구독
  useEffect(() => {
    if (!isOpen) return;

    const channel = supabase
      .channel('notifications_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications'
        },
        (payload) => {
          console.log('🔔 알림 변경 감지:', payload.eventType);
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen]);

  // 알림 읽음 처리
  const handleMarkAsRead = async (notificationId: string) => {
    const success = await markNotificationAsRead(notificationId);
    if (success) {
      loadNotifications();
    }
  };

  // 전체 읽음 처리
  const handleMarkAllAsRead = async () => {
    const success = await markAllNotificationsAsRead(currentPartnerId); // ✅ partnerId 전달
    if (success) {
      toast.success('모든 알림을 읽음 처리했습니다.');
      loadNotifications();
    }
  };

  // 알림 삭제
  const handleDelete = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      toast.success('알림이 삭제되었습니다.');
      loadNotifications();
    } catch (error) {
      console.error('❌ 알림 삭제 실패:', error);
      toast.error('알림 삭제에 실패했습니다.');
    }
  };

  if (!isOpen) return null;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'balance_insufficient':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'game_error':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'api_error':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'balance_insufficient':
        return '잔고 부족';
      case 'game_error':
        return '게임 오류';
      case 'api_error':
        return 'API 오류';
      default:
        return '시스템';
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-start justify-end">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 알림 사이드바 */}
      <div className="relative w-full max-w-2xl h-full bg-slate-900 shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300 border-l border-slate-700">
        {/* 헤더 */}
        <div className="sticky top-0 z-10 bg-slate-800 px-6 py-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl text-slate-100">관리자 알림</h2>
              <p className="text-sm text-slate-400 mt-1">
                사용자 페이지에서 발생한 중요 이벤트
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* 검색 및 필터 */}
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                placeholder="아이디, 사용자명, 메시지 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800/50 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant={filter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('all')}
                  className={filter === 'all' 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'text-slate-300 border-slate-600 hover:bg-slate-700'}
                >
                  전체 ({notifications.length})
                </Button>
                <Button
                  variant={filter === 'unread' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('unread')}
                  className={filter === 'unread' 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'text-slate-300 border-slate-600 hover:bg-slate-700'}
                >
                  읽지 않음 ({notifications.filter(n => !n.is_read).length})
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="text-slate-300 hover:text-slate-100 hover:bg-slate-700"
              >
                <CheckCheck className="w-4 h-4 mr-2" />
                전체 읽음
              </Button>
            </div>
          </div>
        </div>

        {/* 알림 목록 */}
        <div className="overflow-y-auto h-[calc(100vh-200px)] p-4 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>알림을 불러오는 중...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-lg mb-2">📭</p>
              <p>{searchQuery ? '검색 결과가 없습니다.' : '알림이 없습니다.'}</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => {
              const contentData = notification.content ? JSON.parse(notification.content) : {};
              
              return (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border transition-all ${
                    notification.is_read
                      ? 'bg-slate-800/50 border-slate-700/50'
                      : 'bg-slate-800 border-blue-500/30 shadow-lg'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <Badge className={`${getTypeColor(notification.notification_type)} text-xs border`}>
                        {getTypeName(notification.notification_type)}
                      </Badge>
                      {!notification.is_read && (
                        <Badge className="bg-blue-600 text-white text-xs">새 알림</Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {!notification.is_read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="h-8 px-2 text-blue-400 hover:text-blue-300 hover:bg-slate-700"
                        >
                          <CheckCheck className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(notification.id)}
                        className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-slate-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">사용자:</span>
                      <span className="text-slate-100 font-medium">{contentData.username || '알 수 없음'}</span>
                      <span className="text-slate-500">({contentData.user_login_id || '-'})</span>
                    </div>

                    <div className="bg-slate-900/50 rounded p-3 space-y-1 border border-slate-700/50">
                      <div className="text-sm">
                        <span className="text-slate-400">알림 내용:</span>
                        <p className="text-slate-100 mt-1">{notification.title}</p>
                      </div>
                      {contentData.log_message && contentData.log_message !== notification.title && (
                        <div className="text-sm text-slate-300 mt-2 border-t border-slate-700/50 pt-2">
                          <span className="text-slate-400">상세 로그:</span>
                          <p className="mt-1 leading-relaxed">
                            {contentData.log_message.replace(/Lv\d+\s*/g, '')}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-slate-500">
                      {formatDistanceToNow(new Date(notification.created_at), { 
                        addSuffix: true,
                        locale: ko 
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}