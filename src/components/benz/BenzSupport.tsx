import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { 
  MessageSquare, 
  Send,
  Clock,
  CheckCircle,
  MessageCircle,
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  Calendar
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { supabase } from "../../lib/supabase";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { toast } from "sonner";

interface BenzSupportProps {
  user: any;
  onRouteChange: (route: string) => void;
}

interface SupportMessage {
  id: string;
  subject: string;
  content: string;
  message_type: 'normal' | 'system' | 'urgent';
  status: 'unread' | 'read' | 'replied';
  created_at: string;
  read_at?: string;
  parent_id?: string;
  sender_type: 'user' | 'partner';
  sender_id: string;
  receiver_type: 'user' | 'partner';
  receiver_id: string;
  replies?: SupportMessage[];
}

export function BenzSupport({ user, onRouteChange }: BenzSupportProps) {
  // Guard against null user - AFTER all hooks
  if (!user) {
    return (
      <Card className="bg-[#1a1f3a] border-purple-900/30 text-white">
        <CardContent className="p-8 text-center">
          <p className="text-gray-400">사용자 정보를 불러올 수 없습니다.</p>
        </CardContent>
      </Card>
    );
  }
  
  const inquiryCategories = [
    { value: 'deposit', label: '입금문의' },
    { value: 'withdrawal', label: '출금문의' },
    { value: 'game', label: '게임문의' },
    { value: 'account', label: '계정문의' },
    { value: 'bonus', label: '보너스문의' },
    { value: 'account_number', label: '계좌문의' }
  ];
  
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<SupportMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showNewInquiryDialog, setShowNewInquiryDialog] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<string[]>([]);

  // 새 문의 폼 상태
  const [newInquiryForm, setNewInquiryForm] = useState({
    category: '',
    subject: '',
    content: ''
  });

  // 문의 내역 조회
  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      
      // 사용자가 보낸 문의와 받은 답변 모두 조회
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 메시지를 그룹화 (parent_id 기준)
      const groupedMessages: { [key: string]: SupportMessage[] } = {};
      const rootMessages: SupportMessage[] = [];

      (data || []).forEach((message: any) => {
        if (message.parent_id) {
          if (!groupedMessages[message.parent_id]) {
            groupedMessages[message.parent_id] = [];
          }
          groupedMessages[message.parent_id].push(message);
        } else {
          rootMessages.push(message);
        }
      });

      // 각 루트 메시지에 답글 추가
      const messagesWithReplies = rootMessages.map(message => ({
        ...message,
        replies: groupedMessages[message.id] || []
      }));

      setMessages(messagesWithReplies);
      setFilteredMessages(messagesWithReplies);
    } catch (error) {
      console.error('문의 내역 조회 오류:', error);
      toast.error('문의 내역을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 새 문의 작성
  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newInquiryForm.category || !newInquiryForm.subject.trim() || !newInquiryForm.content.trim()) {
      toast.error('모든 필수 항목을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      const messageData = {
        sender_type: 'user',
        sender_id: user.id,
        receiver_type: 'partner',
        receiver_id: user.referrer_id, // 사용자의 상위 파트너에게 전송
        subject: `[${inquiryCategories.find(cat => cat.value === newInquiryForm.category)?.label}] ${newInquiryForm.subject}`,
        content: newInquiryForm.content,
        message_type: 'normal',
        status: 'unread'
      };

      const { data, error } = await supabase
        .from('messages')
        .insert([messageData])
        .select()
        .single();

      if (error) throw error;

      // 활동 로그 기록
      await supabase
        .from('activity_logs')
        .insert([{
          actor_type: 'user',
          actor_id: user.id,
          action: 'inquiry_submit',
          target_type: 'message',
          target_id: data.id,
          details: {
            category: newInquiryForm.category,
            subject: newInquiryForm.subject
          }
        }]);

      // 폼 초기화
      setNewInquiryForm({ category: '', subject: '', content: '' });
      setShowNewInquiryDialog(false);

      // 목록 새로고침
      fetchMessages();

      toast.success('문의가 성공적으로 등록되었습니다.');
    } catch (error: any) {
      console.error('문의 등록 오류:', error);
      toast.error(error.message || '문의 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 메시지 읽음 처리
  const markAsRead = async (messageId: string) => {
    try {
      await supabase
        .from('messages')
        .update({ 
          status: 'read',
          read_at: new Date().toISOString()
        })
        .eq('id', messageId)
        .eq('receiver_id', user.id);

      // 로컬 상태 업데이트
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, status: 'read' as any, read_at: new Date().toISOString() }
          : msg
      ));
      setFilteredMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, status: 'read' as any, read_at: new Date().toISOString() }
          : msg
      ));
    } catch (error) {
      console.error('읽음 처리 오류:', error);
    }
  };

  // 메시지 확장/축소
  const toggleMessageExpansion = (messageId: string) => {
    setExpandedMessages(prev => 
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    );

    // 확장 시 읽음 처리
    const message = messages.find(msg => msg.id === messageId);
    if (message && message.receiver_id === user.id && message.status === 'unread') {
      markAsRead(messageId);
    }
  };

  // 필터링
  const handleFilter = () => {
    let filtered = messages;

    // 상태 필터
    if (filterStatus !== 'all') {
      filtered = filtered.filter(msg => {
        if (filterStatus === 'waiting') {
          return msg.sender_id === user.id && msg.status !== 'replied';
        }
        if (filterStatus === 'replied') {
          return msg.replies && msg.replies.length > 0;
        }
        if (filterStatus === 'unread') {
          return msg.receiver_id === user.id && msg.status === 'unread';
        }
        return msg.status === filterStatus;
      });
    }

    // 검색 필터
    if (searchQuery.trim()) {
      filtered = filtered.filter(msg =>
        msg.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.content.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredMessages(filtered);
  };

  // 상태별 색상 및 아이콘
  const getStatusInfo = (message: SupportMessage) => {
    if (message.sender_id === user.id) {
      // 사용자가 보낸 메시지
      if (message.replies && message.replies.length > 0) {
        return { 
          color: 'bg-green-500', 
          textColor: 'text-green-400', 
          icon: CheckCircle, 
          label: '답변완료'
        };
      } else {
        return { 
          color: 'bg-yellow-500', 
          textColor: 'text-yellow-400', 
          icon: Clock, 
          label: '답변대기'
        };
      }
    } else {
      // 관리자가 보낸 메시지
      if (message.status === 'unread') {
        return { 
          color: 'bg-blue-500', 
          textColor: 'text-blue-400', 
          icon: MessageCircle, 
          label: '새 답변'
        };
      } else {
        return { 
          color: 'bg-slate-500', 
          textColor: 'text-slate-400', 
          icon: MessageCircle, 
          label: '답변'
        };
      }
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  const formatRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return '방금 전';
    if (diffInHours < 24) return `${diffInHours}시간 전`;
    return `${Math.floor(diffInHours / 24)}일 전`;
  };

  useEffect(() => {
    fetchMessages();

    // 실시간 메시지 업데이트 구독
    const subscription = supabase
      .channel('support_messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${user.id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          fetchMessages();
          toast.info('새로운 답변이 도착했습니다.');
        }
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, [user.id]);

  useEffect(() => {
    handleFilter();
  }, [messages, searchQuery, filterStatus]);

  return (
    <div className="min-h-screen text-white p-6" style={{ fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif' }}>
      <div className="flex gap-6 justify-center">
        <div className="flex-1" style={{ maxWidth: '70%' }}>
          {/* 제목 */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-1.5 h-8 bg-gradient-to-b from-purple-400 to-pink-500"></div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">고객센터</h1>
              </div>
              <p className="text-slate-400 ml-5">문의하신 내용에 대해 빠르게 답변해 드립니다</p>
            </div>
            <Dialog open={showNewInquiryDialog} onOpenChange={setShowNewInquiryDialog}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 h-12 px-6 text-base">
                  <Plus className="w-5 h-5 mr-2" />
                  새 문의 작성
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl bg-[#1a1f3a] border-purple-900/30 text-white" style={{
                backdropFilter: 'blur(8px)',
                backgroundColor: 'rgba(26, 31, 58, 0.95)'
              }}>
                <DialogHeader>
                  <DialogTitle className="text-2xl">문의 작성하기</DialogTitle>
                  <DialogDescription className="text-slate-400 text-base">
                    문의하실 내용을 자세히 작성해주시면 빠르게 답변드리겠습니다.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmitInquiry} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-slate-300 text-base">문의 유형 *</Label>
                    <Select value={newInquiryForm.category} onValueChange={(value) => setNewInquiryForm(prev => ({ ...prev, category: value }))}>
                      <SelectTrigger className="bg-[#0f1433] border-purple-900/30 text-white h-12 text-base">
                        <SelectValue placeholder="문의 유형을 선택해주세요" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1f3a] border-purple-900/30">
                        {inquiryCategories.map((category) => (
                          <SelectItem key={category.value} value={category.value} className="text-white">
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject" className="text-slate-300 text-base">제목 *</Label>
                    <Input
                      id="subject"
                      placeholder="문의 제목을 입력해주세요"
                      value={newInquiryForm.subject}
                      onChange={(e) => setNewInquiryForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="bg-[#0f1433] border-purple-900/30 text-white h-12 text-base"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="content" className="text-slate-300 text-base">내용 *</Label>
                    <Textarea
                      id="content"
                      placeholder="문의 내용을 자세히 입력해주세요"
                      value={newInquiryForm.content}
                      onChange={(e) => setNewInquiryForm(prev => ({ ...prev, content: e.target.value }))}
                      className="bg-[#0f1433] border-purple-900/30 text-white min-h-32 text-base"
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowNewInquiryDialog(false)}
                      className="flex-1 h-12 text-base border-purple-900/30 hover:bg-purple-900/20 text-white"
                    >
                      취소
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 h-12 text-base"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          처리 중...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          제출
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* 필터 및 검색 */}
          <Card className="bg-[#1a1f3a] border-purple-900/30 mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="문의 내역 검색..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-[#0f1433] border-purple-900/30 text-white h-12 text-base"
                    />
                  </div>
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48 bg-[#0f1433] border-purple-900/30 text-white h-12 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1f3a] border-purple-900/30">
                    <SelectItem value="all" className="text-white">전체</SelectItem>
                    <SelectItem value="waiting" className="text-white">답변대기</SelectItem>
                    <SelectItem value="replied" className="text-white">답변완료</SelectItem>
                    <SelectItem value="unread" className="text-white">읽지않음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 문의 목록 */}
          <Card className="bg-[#1a1f3a] border-purple-900/30">
            <CardHeader>
              <CardTitle className="flex items-center text-white text-2xl">
                <MessageSquare className="w-6 h-6 mr-3 text-purple-400" />
                문의 내역 ({filteredMessages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <LoadingSpinner />
                    <p className="text-slate-300 mt-4">로딩 중...</p>
                  </div>
                </div>
              ) : filteredMessages.length > 0 ? (
                <div className="space-y-3">
                  {filteredMessages.map((message) => {
                    const statusInfo = getStatusInfo(message);
                    const StatusIcon = statusInfo.icon;
                    const isExpanded = expandedMessages.includes(message.id);
                    
                    return (
                      <div key={message.id} className="p-5 bg-[#0f1433] border border-purple-900/30">
                        <Collapsible open={isExpanded} onOpenChange={() => toggleMessageExpansion(message.id)}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-start justify-between cursor-pointer hover:bg-[#151a3f] p-2 -m-2">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                                  message.receiver_id === user.id && message.status === 'unread' ? 'bg-purple-400' : 'bg-slate-500'
                                }`} />
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <StatusIcon className={`w-5 h-5 ${statusInfo.textColor}`} />
                                    <Badge className={`${statusInfo.color} text-white text-sm px-2 py-1`}>
                                      {statusInfo.label}
                                    </Badge>
                                    {message.replies && message.replies.length > 0 && (
                                      <Badge variant="outline" className="text-sm border-purple-900/30 text-purple-400">
                                        {message.replies.length}개 답변
                                      </Badge>
                                    )}
                                  </div>
                                  <h3 className="font-semibold text-white truncate text-lg mb-2">{message.subject}</h3>
                                  <div className="flex items-center gap-4 text-sm text-slate-400">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-4 h-4" />
                                      {formatRelativeTime(message.created_at)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <User className="w-4 h-4" />
                                      {message.sender_id === user.id ? '내 문의' : '관리자 답변'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" className="flex-shrink-0 w-8 h-8 p-0 text-purple-400 hover:text-purple-300">
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5" />
                                ) : (
                                  <ChevronDown className="w-5 h-5" />
                                )}
                              </Button>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="mt-4 space-y-4">
                              {/* 원본 메시지 */}
                              <div className="p-4 bg-[#0a0f2a] border-l-4 border-purple-500">
                                <div className="flex items-center gap-2 mb-3">
                                  <User className="w-5 h-5 text-purple-400" />
                                  <span className="text-base font-semibold text-purple-400">
                                    {message.sender_id === user.id ? user.nickname : '관리자'}
                                  </span>
                                  <span className="text-sm text-slate-400">
                                    {formatDateTime(message.created_at)}
                                  </span>
                                </div>
                                <div className="text-slate-300 text-base whitespace-pre-wrap">
                                  {message.content}
                                </div>
                              </div>

                              {/* 답글들 */}
                              {message.replies && message.replies.map((reply) => (
                                <div key={reply.id} className="p-4 bg-[#0a0f2a] border-l-4 border-green-500 ml-8">
                                  <div className="flex items-center gap-2 mb-3">
                                    <User className="w-5 h-5 text-green-400" />
                                    <span className="text-base font-semibold text-green-400">
                                      {reply.sender_id === user.id ? user.nickname : '관리자'}
                                    </span>
                                    <span className="text-sm text-slate-400">
                                      {formatDateTime(reply.created_at)}
                                    </span>
                                  </div>
                                  <div className="text-slate-300 text-base whitespace-pre-wrap">
                                    {reply.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-20">
                  <MessageSquare className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {searchQuery || filterStatus !== 'all' ? '검색 결과가 없습니다' : '등록된 문의 내역이 없습니다'}
                  </h3>
                  <p className="text-slate-400 mb-4">
                    {searchQuery || filterStatus !== 'all'
                      ? '다른 검색 조건으로 시도해보세요' 
                      : '궁금하신 사항이 있으시면 언제든지 문의해주세요'
                    }
                  </p>
                  {(searchQuery || filterStatus !== 'all') ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchQuery('');
                        setFilterStatus('all');
                      }}
                      className="border-purple-900/30 hover:bg-purple-900/20 text-white"
                    >
                      전체 문의 보기
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setShowNewInquiryDialog(true)}
                      className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      첫 문의 작성하기
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
