import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { DataTable } from "../common/DataTable";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle, AdminDialogTrigger as DialogTrigger } from "./AdminDialog";
import { Label } from "../ui/label";
import { MessageSquare, Send, Reply, Search, User, Clock, CheckCircle, AlertCircle, Users, Filter, Mail, Info, FileText } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../lib/supabase";
import { useWebSocketContext } from "../../contexts/WebSocketContext";
import { useLanguage } from "../../contexts/LanguageContext";

interface User {
  id: string;
  level: number;
  username?: string;
}

interface MessageCenterProps {
  user: User;
}

interface Message {
  id: string;
  sender_type: string;
  sender_id: string;
  sender_username: string;
  recipient_type: string;
  recipient_id: string;
  recipient_username: string;
  title?: string;
  content: string;
  message_type: string;
  is_read: boolean;
  read_at?: string;
  parent_message_id?: string;
  created_at: string;
  reply_count?: number;
}

export function MessageCenter({ user }: MessageCenterProps) {
  const { t } = useLanguage();
  
  // 접근 권한 확인 (매장 등급 이상, level 6 이상)
  if (user.level > 6) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <MessageSquare className="h-12 w-12 text-yellow-500 mx-auto" />
          <p className="text-muted-foreground">{t.messageCenter.accessDenied}</p>
        </div>
      </div>
    );
  }

  const [loading, setLoading] = useState(false); // ⚡ 초기 로딩을 false로 변경
  const [messages, setMessages] = useState<Message[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]); // ⚡ 전체 데이터 캐시
  const [activeTab, setActiveTab] = useState('received'); // received, sent
  const [messageTypeFilter, setMessageTypeFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isComposingNew, setIsComposingNew] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // 새 메시지 작성 폼
  const [newMessageForm, setNewMessageForm] = useState({
    recipient_type: 'user',
    recipient_username: '',
    broadcast_type: 'single', // single, selected, all
    selected_users: [] as string[],
    title: '',
    content: '',
    message_type: 'normal'
  });

  // 답장 폼
  const [replyContent, setReplyContent] = useState('');

  const { lastMessage, sendMessage } = useWebSocketContext();

  // Supabase Realtime subscription (이벤트 발생시 자동 업데이트)
  useEffect(() => {
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('🔔 메시지 테이블 변경 감지:', payload);
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 사용자 검색 필터링
  useEffect(() => {
    if (!userSearchTerm.trim()) {
      setFilteredUsers(availableUsers);
    } else {
      const filtered = availableUsers.filter(u => 
        u.username.toLowerCase().includes(userSearchTerm.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [userSearchTerm, availableUsers]);

  // 사용자 목록 조회 (브로드캐스트용)
  const fetchAvailableUsers = async () => {
    try {
      setLoadingUsers(true);
      
      const table = newMessageForm.recipient_type === 'user' ? 'users' : 'partners';
      const { data, error } = await supabase
        .from(table)
        .select('id, username')
        .order('username');

      if (error) throw error;
      setAvailableUsers(data || []);
      setFilteredUsers(data || []);
      setUserSearchTerm('');
    } catch (error) {
      console.error('사용자 목록 조회 오류:', error);
      toast.error(t.messageCenter.loadUsersFailed);
    } finally {
      setLoadingUsers(false);
    }
  };

  // ⚡ 최적화된 메시지 목록 조회 (배치 쿼리)
  const fetchMessages = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      
      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false });

      // 받은 메시지 / 보낸 메시지 필터
      if (activeTab === 'received') {
        query = query
          .eq('receiver_type', 'partner')
          .eq('receiver_id', user.id);
      } else {
        query = query
          .eq('sender_type', 'partner')
          .eq('sender_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        setAllMessages([]);
        applyFilters([]);
        return;
      }

      // ⚡ 배치 쿼리로 최적화 - 답글 수와 사용자 정보를 병렬로 조회
      const messageIds = data.map(m => m.id);
      const senderIds = [...new Set(data.map(m => m.sender_id))];
      const receiverIds = [...new Set(data.map(m => m.receiver_id))];
      
      // sender_type과 receiver_type별로 ID 그룹화
      const userSenderIds = [...new Set(data.filter(m => m.sender_type === 'user').map(m => m.sender_id))];
      const partnerSenderIds = [...new Set(data.filter(m => m.sender_type === 'partner').map(m => m.sender_id))];
      const userReceiverIds = [...new Set(data.filter(m => m.receiver_type === 'user').map(m => m.receiver_id))];
      const partnerReceiverIds = [...new Set(data.filter(m => m.receiver_type === 'partner').map(m => m.receiver_id))];

      // 병렬로 모든 데이터 조회
      const [repliesResult, userSendersResult, partnerSendersResult, userReceiversResult, partnerReceiversResult] = await Promise.all([
        // 모든 답글 수를 한 번에 조회
        supabase
          .from('messages')
          .select('parent_id')
          .in('parent_id', messageIds),
        // 사용자 sender 정보
        userSenderIds.length > 0 
          ? supabase.from('users').select('id, username').in('id', userSenderIds)
          : Promise.resolve({ data: [] }),
        // 파트너 sender 정보
        partnerSenderIds.length > 0
          ? supabase.from('partners').select('id, username').in('id', partnerSenderIds)
          : Promise.resolve({ data: [] }),
        // 사용자 receiver 정보
        userReceiverIds.length > 0
          ? supabase.from('users').select('id, username').in('id', userReceiverIds)
          : Promise.resolve({ data: [] }),
        // 파트너 receiver 정보
        partnerReceiverIds.length > 0
          ? supabase.from('partners').select('id, username').in('id', partnerReceiverIds)
          : Promise.resolve({ data: [] })
      ]);

      // 답글 수를 parent_id별로 그룹화
      const replyCounts: Record<string, number> = {};
      (repliesResult.data || []).forEach((reply: any) => {
        replyCounts[reply.parent_id] = (replyCounts[reply.parent_id] || 0) + 1;
      });

      // sender/receiver 정보를 맵으로 변환
      const userSendersMap = new Map((userSendersResult.data || []).map(u => [u.id, u.username]));
      const partnerSendersMap = new Map((partnerSendersResult.data || []).map(p => [p.id, p.username]));
      const userReceiversMap = new Map((userReceiversResult.data || []).map(u => [u.id, u.username]));
      const partnerReceiversMap = new Map((partnerReceiversResult.data || []).map(p => [p.id, p.username]));

      // 데이터 조합
      const messagesWithDetails = data.map((message: any) => {
        // sender username 조회
        let senderUsername = '알 수 없음';
        if (message.sender_type === 'user') {
          senderUsername = userSendersMap.get(message.sender_id) || '사용자';
        } else if (message.sender_type === 'partner') {
          senderUsername = partnerSendersMap.get(message.sender_id) || '관리자';
        }

        // receiver username 조회
        let recipientUsername = '알 수 없음';
        if (message.receiver_type === 'user') {
          recipientUsername = userReceiversMap.get(message.receiver_id) || '사용자';
        } else if (message.receiver_type === 'partner') {
          recipientUsername = partnerReceiversMap.get(message.receiver_id) || '관리자';
        }

        return {
          id: message.id,
          sender_type: message.sender_type,
          sender_id: message.sender_id,
          sender_username: senderUsername,
          recipient_type: message.receiver_type,
          recipient_id: message.receiver_id,
          recipient_username: recipientUsername,
          title: message.subject,
          content: message.content,
          message_type: message.message_type,
          is_read: message.status === 'read',
          read_at: message.read_at,
          parent_message_id: message.parent_id,
          created_at: message.created_at,
          reply_count: replyCounts[message.id] || 0
        };
      });

      setAllMessages(messagesWithDetails);
      applyFilters(messagesWithDetails);
    } catch (error) {
      console.error('메시지 조회 오류:', error);
      toast.error(t.messageCenter.loadMessagesFailed);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  // ⚡ 클라이언트 사이드 필터링
  const applyFilters = (data: Message[] = allMessages) => {
    let filtered = [...data];

    // 메시지 유형 필터
    if (messageTypeFilter !== 'all') {
      filtered = filtered.filter(m => m.message_type === messageTypeFilter);
    }

    // 읽음/안읽음 필터
    if (readFilter !== 'all') {
      const isRead = readFilter === 'read';
      filtered = filtered.filter(m => m.is_read === isRead);
    }

    // 검색어 필터
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      filtered = filtered.filter(m =>
        (m.title && m.title.toLowerCase().includes(query)) ||
        m.content.toLowerCase().includes(query)
      );
    }

    setMessages(filtered);
  };

  // 메시지 읽음 처리
  const markAsRead = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ 
          status: 'read', 
          read_at: new Date().toISOString() 
        })
        .eq('id', messageId)
        .eq('status', 'unread'); // 이미 읽은 메시지는 업데이트 안함

      if (error) throw error;

      // 로컬 상태 업데이트
      setMessages(prev => prev.map(message => 
        message.id === messageId ? { ...message, is_read: true, read_at: new Date().toISOString() } : message
      ));
    } catch (error) {
      console.error('메시지 읽음 처리 오류:', error);
    }
  };

  // 새 메시지 전송
  const sendNewMessage = async () => {
    if (!newMessageForm.content.trim()) {
      toast.error(t.messageCenter.enterMessageContent);
      return;
    }

    // 브로드캐스트 타입별 유효성 검사
    if (newMessageForm.broadcast_type === 'single' && !newMessageForm.recipient_username.trim()) {
      toast.error(t.messageCenter.enterRecipient);
      return;
    }

    if (newMessageForm.broadcast_type === 'selected' && newMessageForm.selected_users.length === 0) {
      toast.error(t.messageCenter.selectRecipients);
      return;
    }

    try {
      let recipients: any[] = [];

      if (newMessageForm.broadcast_type === 'single') {
        // 단일 수신자
        const table = newMessageForm.recipient_type === 'user' ? 'users' : 'partners';
        const { data: recipient, error: recipientError } = await supabase
          .from(table)
          .select('id, username')
          .eq('username', newMessageForm.recipient_username.trim())
          .single();

        if (recipientError || !recipient) {
          toast.error(t.messageCenter.recipientNotFound);
          return;
        }
        recipients = [recipient];

      } else if (newMessageForm.broadcast_type === 'selected') {
        // 선택된 수신자들
        const table = newMessageForm.recipient_type === 'user' ? 'users' : 'partners';
        const { data: selectedRecipients, error: recipientError } = await supabase
          .from(table)
          .select('id, username')
          .in('username', newMessageForm.selected_users);

        if (recipientError) {
          toast.error(t.messageCenter.recipientLoadFailed);
          return;
        }
        recipients = selectedRecipients || [];

      } else if (newMessageForm.broadcast_type === 'all') {
        // 모든 사용자
        const table = newMessageForm.recipient_type === 'user' ? 'users' : 'partners';
        const { data: allRecipients, error: recipientError } = await supabase
          .from(table)
          .select('id, username');

        if (recipientError) {
          toast.error(t.messageCenter.allRecipientsLoadFailed);
          return;
        }
        recipients = allRecipients || [];
      }

      if (recipients.length === 0) {
        toast.error(t.messageCenter.noRecipientsToSend);
        return;
      }

      // 메시지 데이터 준비
      const messagesData = recipients.map(recipient => ({
        sender_type: 'partner',
        sender_id: user.id,
        receiver_type: newMessageForm.recipient_type,
        receiver_id: recipient.id,
        subject: newMessageForm.title || null,
        content: newMessageForm.content.trim(),
        message_type: newMessageForm.message_type
      }));

      // 배치 전송
      const { error } = await supabase
        .from('messages')
        .insert(messagesData);

      if (error) throw error;

      const recipientCount = recipients.length;
      toast.success(t.messageCenter.messageSentToCount.replace('{count}', recipientCount.toString()));
      
      // WebSocket으로 실시간 알림 전송
      if (sendMessage) {
        recipients.forEach(recipient => {
          sendMessage('new_message', {
            recipient_type: newMessageForm.recipient_type,
            recipient_id: recipient.id,
            title: newMessageForm.title,
            content: newMessageForm.content
          });
        });
      }

      setNewMessageForm({
        recipient_type: 'user',
        recipient_username: '',
        broadcast_type: 'single',
        selected_users: [],
        title: '',
        content: '',
        message_type: 'normal'
      });
      setIsComposingNew(false);
      setIsDialogOpen(false);
      fetchMessages();
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      toast.error(t.messageCenter.messageSendFailed);
    }
  };

  // 답장 전송
  const sendReply = async () => {
    if (!selectedMessage || !replyContent.trim()) {
      toast.error(t.messageCenter.enterReplyContent);
      return;
    }

    try {
      const replyData = {
        sender_type: 'partner',
        sender_id: user.id,
        receiver_type: selectedMessage.sender_type,
        receiver_id: selectedMessage.sender_id,
        subject: selectedMessage.title ? `Re: ${selectedMessage.title}` : null,
        content: replyContent.trim(),
        message_type: 'normal',
        parent_id: selectedMessage.id
      };

      const { error } = await supabase
        .from('messages')
        .insert([replyData]);

      if (error) throw error;

      toast.success(t.messageCenter.replySent);
      setReplyContent('');
      setIsDialogOpen(false);
      fetchMessages();
    } catch (error) {
      console.error('답장 전송 오류:', error);
      toast.error(t.messageCenter.replyFailed);
    }
  };

  // WebSocket으로 새 메시지 알림 수신
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'new_message') {
      toast.info(t.messageCenter.newMessageArrived);
      fetchMessages(); // 목록 새로고침
    }
  }, [lastMessage]);

  // ⚡ 초기 로드 (한 번만)
  useEffect(() => {
    fetchMessages(true);
  }, [activeTab]); // activeTab 변경시에만 서버 재조회

  // ⚡ 필터 변경시 클라이언트 사이드 필터링
  useEffect(() => {
    applyFilters();
  }, [messageTypeFilter, readFilter]);

  // ⚡ 디바운스 검색 (클라이언트 사이드)
  useEffect(() => {
    const timer = setTimeout(() => {
      applyFilters();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const columns = [
    {
      key: 'sender_username',
      title: activeTab === 'received' ? t.messageCenter.sender : t.messageCenter.recipient,
      render: (value: string, row: Message) => (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{activeTab === 'received' ? row.sender_username : row.recipient_username}</div>
            <div className="text-xs text-muted-foreground">
              {activeTab === 'received' ? row.sender_type : row.recipient_type}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'title',
      title: t.messageCenter.subject + '/' + t.messageCenter.content,
      render: (value: string, row: Message) => (
        <div className={`${!row.is_read && activeTab === 'received' ? 'font-semibold' : ''}`}>
          <div className="text-sm">{value || t.messageCenter.noTitle}</div>
          <div className="text-xs text-muted-foreground truncate max-w-[300px]">
            {row.content}
          </div>
          {row.reply_count > 0 && (
            <Badge variant="outline" className="text-xs mt-1">
              {t.messageCenter.replyCount.replace('{count}', row.reply_count.toString())}
            </Badge>
          )}
        </div>
      )
    },
    {
      key: 'message_type',
      title: t.messageCenter.type,
      render: (value: string) => {
        const typeConfig: Record<string, { label: string, variant: any }> = {
          'normal': { label: t.messageCenter.normalMessage, variant: 'secondary' },
          'system': { label: t.messageCenter.systemMessage, variant: 'outline' },
          'urgent': { label: t.messageCenter.urgentMessage, variant: 'destructive' }
        };
        const config = typeConfig[value] || typeConfig.normal;
        return <Badge variant={config.variant}>{config.label}</Badge>;
      }
    },
    {
      key: 'is_read',
      title: t.messageCenter.status,
      render: (value: boolean, row: Message) => (
        <div className="flex items-center gap-1">
          {value ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
          <span className="text-xs">
            {value ? t.messageCenter.read : t.messageCenter.notRead}
          </span>
        </div>
      )
    },
    {
      key: 'created_at',
      title: t.messageCenter.date,
      render: (value: string) => (
        <div className="text-sm">
          {new Date(value).toLocaleDateString('ko-KR')}
          <div className="text-xs text-muted-foreground">
            {new Date(value).toLocaleTimeString('ko-KR')}
          </div>
        </div>
      )
    },
    {
      key: 'actions',
      title: t.common.actions,
      render: (value: any, row: Message) => (
        <Dialog open={isDialogOpen && selectedMessage?.id === row.id} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (open) {
            setSelectedMessage(row);
            setReplyContent('');
            setIsComposingNew(false);
            // 메시지 읽음 처리
            if (!row.is_read && activeTab === 'received') {
              markAsRead(row.id);
            }
          } else {
            setSelectedMessage(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 flex items-center gap-1"
            >
              <MessageSquare className="h-4 w-4" />
              보기
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {activeTab === 'received' ? '받은 메시지' : '보낸 메시지'} - {row.title || '(제목 없음)'}
              </DialogTitle>
              <DialogDescription>
                메시지 내용을 확인하고 {activeTab === 'received' ? '답장을 작성할 수 있습니다' : '전송된 메시지의 상세 정보를 확인할 수 있습니다'}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>발신자</Label>
                  <p className="text-sm font-medium">{row.sender_username}</p>
                </div>
                <div>
                  <Label>수신자</Label>
                  <p className="text-sm font-medium">{row.recipient_username}</p>
                </div>
                <div>
                  <Label>전송일시</Label>
                  <p className="text-sm">{new Date(row.created_at).toLocaleString('ko-KR')}</p>
                </div>
                <div>
                  <Label>메시지 유형</Label>
                  <p className="text-sm">{row.message_type}</p>
                </div>
              </div>
              
              <div>
                <Label>메시지 내용</Label>
                <div className="p-3 bg-muted rounded-md mt-1">
                  <p className="text-sm whitespace-pre-wrap">{row.content}</p>
                </div>
              </div>

              {activeTab === 'received' && (
                <div>
                  <Label htmlFor="reply">답장 작성</Label>
                  <Textarea
                    id="reply"
                    placeholder="답장 내용을 입력하세요..."
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    rows={4}
                    className="mt-1"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  닫기
                </Button>
                {activeTab === 'received' && (
                  <Button
                    onClick={sendReply}
                    disabled={!replyContent.trim()}
                  >
                    <Reply className="h-4 w-4 mr-2" />
                    답장 보내기
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">{t.messageCenter.title}</h1>
          <p className="text-sm text-slate-400">
            {t.messageCenter.subtitle}
          </p>
        </div>
        <Dialog open={isDialogOpen && isComposingNew} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (open) {
            setIsComposingNew(true);
            setSelectedMessage(null);
            setUserSearchTerm('');
          } else {
            setUserSearchTerm('');
            setAvailableUsers([]);
            setFilteredUsers([]);
          }
        }}>
          <DialogTrigger asChild>
            <Button className="btn-premium-primary">
              <Send className="h-4 w-4 mr-2" />
              {t.messageCenter.newMessage}
            </Button>
          </DialogTrigger>
            <DialogContent className="!max-w-[800px] w-[95vw] max-h-[85vh] overflow-hidden glass-card p-0 flex flex-col">
              {/* 헤더 - 강조된 디자인 */}
              <DialogHeader className="pb-5 border-b border-slate-700/50 bg-gradient-to-r from-blue-500/10 to-purple-500/10 px-8 pt-6 rounded-t-lg bg-slate-900 backdrop-blur-xl flex-shrink-0">
                <DialogTitle className="flex items-center gap-3 text-2xl text-slate-50">
                  <div className="p-2.5 bg-blue-500/20 rounded-lg">
                    <Send className="h-7 w-7 text-blue-400" />
                  </div>
                  {t.messageCenter.composeNewMessage}
                </DialogTitle>
                <DialogDescription className="text-slate-300 mt-2 text-base">
                  {t.messageCenter.composeNewMessageDesc}
                </DialogDescription>
              </DialogHeader>

              {/* 메인 컨텐츠 */}
              <div className="px-8 py-6 space-y-6 overflow-y-auto flex-1">
                {/* 기본 설정 섹션 */}
                <div className="space-y-4 p-5 border border-slate-700/50 rounded-xl bg-gradient-to-br from-slate-900/50 to-slate-800/30 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-1 w-8 bg-blue-500 rounded-full"></div>
                    <h4 className="font-semibold text-slate-100">{t.messageCenter.sendSettings}</h4>
                  </div>
                  
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label htmlFor="recipient_type" className="text-slate-200 flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-blue-400" />
                      수신자 유형
                    </Label>
                    <Select 
                      value={newMessageForm.recipient_type} 
                      onValueChange={(value) => {
                        setNewMessageForm(prev => ({ 
                          ...prev, 
                          recipient_type: value,
                          recipient_username: '',
                          selected_users: []
                        }));
                        setAvailableUsers([]);
                      }}
                    >
                      <SelectTrigger className="h-11 bg-slate-800/50 border-slate-600 hover:border-blue-500 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="user">👤 사용자</SelectItem>
                        <SelectItem value="partner">🤝 관리자</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="broadcast_type" className="text-slate-200 flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-blue-400" />
                      전송 방식
                    </Label>
                    <Select 
                      value={newMessageForm.broadcast_type} 
                      onValueChange={(value) => {
                        setNewMessageForm(prev => ({ 
                          ...prev, 
                          broadcast_type: value,
                          recipient_username: '',
                          selected_users: []
                        }));
                        if (value === 'selected' || value === 'all') {
                          fetchAvailableUsers();
                        }
                      }}
                    >
                      <SelectTrigger className="h-11 bg-slate-800/50 border-slate-600 hover:border-blue-500 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="single">📧 개별 전송</SelectItem>
                        <SelectItem value="selected">📬 선택 전송</SelectItem>
                        <SelectItem value="all">📢 전체 전송</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                </div>

                {/* 개별 전송일 때만 수신자 입력 필드 표시 */}
                {newMessageForm.broadcast_type === 'single' && (
                  <div className="space-y-4 p-5 border border-slate-700/50 rounded-xl bg-gradient-to-br from-slate-900/50 to-slate-800/30 shadow-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-1 w-8 bg-green-500 rounded-full"></div>
                      <h4 className="font-semibold text-slate-100">수신자 정보</h4>
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="recipient_username" className="text-slate-200 flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-green-400" />
                        수신자 검색
                      </Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                        <Input
                          id="recipient_username"
                          value={newMessageForm.recipient_username}
                          onChange={(e) => setNewMessageForm(prev => ({ ...prev, recipient_username: e.target.value }))}
                          placeholder="수신자 ID를 입력하세요 (예: smcdev111)"
                          className="pl-9 input-premium h-11 bg-slate-800/50 border-slate-600 focus:border-green-500"
                        />
                      </div>
                      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <p className="text-xs text-blue-300 flex items-center gap-2">
                          <Info className="h-3.5 w-3.5" />
                          사용자가 많은 경우 "선택 전송"을 이용하시면 검색하여 선택할 수 있습니다.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 선택 전송일 때 사용자 선택 리스트 */}
                {newMessageForm.broadcast_type === 'selected' && (
                  <div className="space-y-4 p-5 border border-slate-700/50 rounded-xl bg-gradient-to-br from-slate-900/50 to-slate-800/30 shadow-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-1 w-8 bg-green-500 rounded-full"></div>
                      <h4 className="font-semibold text-slate-100">수신자 선택</h4>
                    </div>
                    <div className="space-y-3">
                      {loadingUsers ? (
                        <div className="flex items-center justify-center p-8 text-slate-400">
                          <div className="loading-premium w-8 h-8"></div>
                          <span className="ml-3">사용자 목록 로딩 중...</span>
                        </div>
                      ) : (
                        <>
                          {/* 검색 필터 */}
                          <div className="relative">
                            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                            <Input
                              value={userSearchTerm}
                              onChange={(e) => setUserSearchTerm(e.target.value)}
                              placeholder="사용자 ID로 검색..."
                              className="pl-9 input-premium"
                            />
                          </div>
                          
                          {/* 전체 선택/해제 버튼 */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-300">
                              {filteredUsers.length}명 표시 중 / 총 {availableUsers.length}명
                            </span>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const allUsernames = filteredUsers.map(u => u.username);
                                  setNewMessageForm(prev => ({
                                    ...prev,
                                    selected_users: Array.from(new Set([...prev.selected_users, ...allUsernames]))
                                  }));
                                }}
                                className="btn-premium-success text-xs px-2 py-1 h-7"
                              >
                                현재 페이지 전체 선택
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setNewMessageForm(prev => ({
                                    ...prev,
                                    selected_users: []
                                  }));
                                }}
                                className="text-xs px-2 py-1 h-7"
                              >
                                전체 해제
                              </Button>
                            </div>
                          </div>

                          {/* 사용자 목록 */}
                          <div className="max-h-64 overflow-y-auto border border-slate-600 rounded-lg bg-slate-900/50 p-3 space-y-1">
                            {filteredUsers.map((availableUser) => (
                              <label 
                                key={availableUser.id} 
                                className="flex items-center space-x-3 cursor-pointer hover:bg-slate-800/50 p-2 rounded transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={newMessageForm.selected_users.includes(availableUser.username)}
                                  onChange={(e) => {
                                    const username = availableUser.username;
                                    if (e.target.checked) {
                                      setNewMessageForm(prev => ({
                                        ...prev,
                                        selected_users: [...prev.selected_users, username]
                                      }));
                                    } else {
                                      setNewMessageForm(prev => ({
                                        ...prev,
                                        selected_users: prev.selected_users.filter(u => u !== username)
                                      }));
                                    }
                                  }}
                                  className="rounded w-4 h-4"
                                />
                                <span className="text-sm text-slate-200">{availableUser.username}</span>
                              </label>
                            ))}
                            {filteredUsers.length === 0 && (
                              <div className="text-center text-sm text-slate-500 py-8">
                                {userSearchTerm ? '검색 결과가 없습니다.' : '사용자가 없습니다.'}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      
                      {newMessageForm.selected_users.length > 0 && (
                        <div className="mt-3 p-3 bg-blue-900/30 border border-blue-600/30 rounded-lg">
                          <div className="text-sm text-blue-300 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" />
                            <strong>선택된 사용자:</strong> {newMessageForm.selected_users.length}명
                          </div>
                          <div className="text-xs text-blue-400 mt-2 max-h-24 overflow-y-auto">
                            {newMessageForm.selected_users.join(', ')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 전체 전송일 때 확인 메시지 */}
                {newMessageForm.broadcast_type === 'all' && (
                  <div className="space-y-4 p-5 border border-yellow-500/50 rounded-xl bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 shadow-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-1 w-8 bg-yellow-500 rounded-full"></div>
                      <h4 className="font-semibold text-slate-100">전체 전송 확인</h4>
                    </div>
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <div className="flex items-center gap-2 text-yellow-300 mb-2">
                        <AlertCircle className="h-5 w-5" />
                        <span className="font-medium">주의사항</span>
                      </div>
                      <p className="text-sm text-yellow-200">
                        모든 {newMessageForm.recipient_type === 'user' ? '사용자' : '관리자'}에게 메시지가 전송됩니다.
                        {availableUsers.length > 0 && (
                          <span className="font-semibold"> (총 {availableUsers.length}명)</span>
                        )}
                      </p>
                      {availableUsers.length > 0 && availableUsers.length <= 10 && (
                        <div className="mt-2 text-xs text-yellow-300">
                          대상: {availableUsers.map(u => u.username).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 메시지 내용 섹션 */}
                <div className="space-y-4 p-5 border border-slate-700/50 rounded-xl bg-gradient-to-br from-slate-900/50 to-slate-800/30 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-1 w-8 bg-purple-500 rounded-full"></div>
                    <h4 className="font-semibold text-slate-100">메시지 내용</h4>
                  </div>
                  
                  <div className="space-y-3">
                    <Label htmlFor="new_title" className="text-slate-200 flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-purple-400" />
                      제목
                    </Label>
                    <Input
                      id="new_title"
                      value={newMessageForm.title}
                      onChange={(e) => setNewMessageForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="메시지 제목을 입력하세요 (선택사항)"
                      className="input-premium h-11 bg-slate-800/50 border-slate-600 focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="new_content" className="text-slate-200 flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
                      내용 *
                    </Label>
                    <Textarea
                      id="new_content"
                      value={newMessageForm.content}
                      onChange={(e) => setNewMessageForm(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="메시지 내용을 입력하세요"
                      rows={6}
                      className="input-premium bg-slate-800/50 border-slate-600 focus:border-purple-500 resize-none"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="message_type" className="text-slate-200">메시지 유형</Label>
                    <Select value={newMessageForm.message_type} onValueChange={(value) => setNewMessageForm(prev => ({ ...prev, message_type: value }))}>
                      <SelectTrigger className="h-11 bg-slate-800/50 border-slate-600 hover:border-purple-500 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="normal">💬 일반</SelectItem>
                        <SelectItem value="system">⚙️ 시스템</SelectItem>
                        <SelectItem value="urgent">🚨 긴급</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

              </div>

              {/* 하단 액션 버튼 */}
              <div className="flex gap-4 pt-6 border-t border-slate-700/50 px-8 pb-6 bg-slate-900 backdrop-blur-xl flex-shrink-0">
                <Button 
                  onClick={sendNewMessage}
                  disabled={
                    !newMessageForm.content.trim() || 
                    (newMessageForm.broadcast_type === 'single' && !newMessageForm.recipient_username.trim()) ||
                    (newMessageForm.broadcast_type === 'selected' && newMessageForm.selected_users.length === 0)
                  }
                  className="btn-premium-primary flex items-center gap-3 flex-1 h-12 text-base shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all"
                >
                  <Send className="h-5 w-5" />
                  전송 
                  {newMessageForm.broadcast_type === 'single' && ' (1명)'}
                  {newMessageForm.broadcast_type === 'selected' && ` (${newMessageForm.selected_users.length}명)`}
                  {newMessageForm.broadcast_type === 'all' && ` (${availableUsers.length}명)`}
                </Button>
                <Button 
                  onClick={() => setIsDialogOpen(false)}
                  variant="outline"
                  className="border-slate-600 hover:bg-slate-700/50 h-12 px-8 text-base"
                >
                  취소
                </Button>
              </div>
            </DialogContent>
          </Dialog>
      </div>

      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
          <div>
            <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-400" />
              {t.messageCenter.messageList}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {t.messageCenter.messageListDesc}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex gap-2">
              <Button
                variant={activeTab === 'received' ? 'default' : 'outline'}
                onClick={() => setActiveTab('received')}
                className={activeTab === 'received' ? 'btn-premium-primary' : ''}
              >
                받은 메시지
              </Button>
              <Button
                variant={activeTab === 'sent' ? 'default' : 'outline'}
                onClick={() => setActiveTab('sent')}
                className={activeTab === 'sent' ? 'btn-premium-primary' : ''}
              >
                보낸 메시지
              </Button>
            </div>
            
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                <Input
                  placeholder="제목, 내용으로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 input-premium"
                />
              </div>
            </div>
            
            <Select value={messageTypeFilter} onValueChange={setMessageTypeFilter}>
              <SelectTrigger className="w-[120px] bg-slate-800/50 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                <SelectItem value="normal">일반</SelectItem>
                <SelectItem value="system">시스템</SelectItem>
                <SelectItem value="urgent">긴급</SelectItem>
              </SelectContent>
            </Select>
            
            {activeTab === 'received' && (
              <Select value={readFilter} onValueChange={setReadFilter}>
                <SelectTrigger className="w-[120px] bg-slate-800/50 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="unread">안읽음</SelectItem>
                  <SelectItem value="read">읽음</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <DataTable
              data={messages}
              columns={columns}
              enableSearch={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageCenter;