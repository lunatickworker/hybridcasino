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
import { toast } from "sonner@2.0.3";
import { useLanguage } from "../../contexts/LanguageContext";

interface UserSupportProps {
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

export function UserSupport({ user, onRouteChange }: UserSupportProps) {
  const { t } = useLanguage();
  
  const inquiryCategories = [
    { value: 'deposit', label: t.user.depositInquiry },
    { value: 'withdrawal', label: t.user.withdrawalInquiry },
    { value: 'game', label: t.user.gameInquiry },
    { value: 'account', label: t.user.accountInquiry },
    { value: 'bonus', label: t.user.bonusInquiry },
    { value: 'technical', label: t.user.technicalInquiry },
    { value: 'other', label: t.user.otherInquiry }
  ];
  
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<SupportMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewInquiry, setShowNewInquiry] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedMessages, setExpandedMessages] = useState<string[]>([]);

  // 새 문의 폼 상태
  const [newInquiry, setNewInquiry] = useState({
    category: '',
    subject: '',
    content: ''
  });

  // 답글 폼 상태
  const [replyContent, setReplyContent] = useState<{ [key: string]: string }>({});

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
      toast.error(t.user.inquiryLoadFailed);
    } finally {
      setIsLoading(false);
    }
  };

  // 새 문의 작성
  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newInquiry.category || !newInquiry.subject.trim() || !newInquiry.content.trim()) {
      toast.error(t.user.fillAllRequired);
      return;
    }

    setIsSubmitting(true);

    try {
      const messageData = {
        sender_type: 'user',
        sender_id: user.id,
        receiver_type: 'partner',
        receiver_id: user.referrer_id, // 사용자의 상위 파트너에게 전송
        subject: `[${inquiryCategories.find(cat => cat.value === newInquiry.category)?.label}] ${newInquiry.subject}`,
        content: newInquiry.content,
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
            category: newInquiry.category,
            subject: newInquiry.subject
          }
        }]);

      // 폼 초기화
      setNewInquiry({ category: '', subject: '', content: '' });
      setShowNewInquiry(false);

      // 목록 새로고침
      fetchMessages();

      toast.success(t.user.inquirySubmitted);
    } catch (error: any) {
      console.error('문의 등록 오류:', error);
      toast.error(error.message || t.user.inquirySubmitFailed);
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
    if (statusFilter !== 'all') {
      filtered = filtered.filter(msg => {
        if (statusFilter === 'waiting') {
          return msg.sender_id === user.id && msg.status !== 'replied';
        }
        if (statusFilter === 'replied') {
          return msg.replies && msg.replies.length > 0;
        }
        if (statusFilter === 'unread') {
          return msg.receiver_id === user.id && msg.status === 'unread';
        }
        return msg.status === statusFilter;
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
          label: t.user.repliedStatus
        };
      } else {
        return { 
          color: 'bg-yellow-500', 
          textColor: 'text-yellow-400', 
          icon: Clock, 
          label: t.user.waitingStatus
        };
      }
    } else {
      // 관리자가 보낸 메시지
      if (message.status === 'unread') {
        return { 
          color: 'bg-blue-500', 
          textColor: 'text-blue-400', 
          icon: MessageCircle, 
          label: t.user.newReplyStatus
        };
      } else {
        return { 
          color: 'bg-slate-500', 
          textColor: 'text-slate-400', 
          icon: MessageCircle, 
          label: t.user.replyStatus
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
          toast.info(t.user.newReplyArrived);
        }
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, [user.id]);

  useEffect(() => {
    handleFilter();
  }, [messages, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t.user.supportTitle}</h1>
          <p className="text-slate-400">{t.user.supportSubtitle}</p>
        </div>
        <Dialog open={showNewInquiry} onOpenChange={setShowNewInquiry}>
          <DialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              {t.user.newInquiry}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle>{t.user.writeInquiry}</DialogTitle>
              <DialogDescription className="text-slate-400">
                {t.user.inquiryWriteDesc}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitInquiry} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category" className="text-slate-300">{t.user.inquiryType} *</Label>
                <Select value={newInquiry.category} onValueChange={(value) => setNewInquiry(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder={t.user.selectInquiryType} />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {inquiryCategories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject" className="text-slate-300">{t.user.inquiryTitle} *</Label>
                <Input
                  id="subject"
                  placeholder={t.user.enterInquiryTitle}
                  value={newInquiry.subject}
                  onChange={(e) => setNewInquiry(prev => ({ ...prev, subject: e.target.value }))}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content" className="text-slate-300">{t.user.inquiryContent} *</Label>
                <Textarea
                  id="content"
                  placeholder={t.user.enterInquiryContent}
                  value={newInquiry.content}
                  onChange={(e) => setNewInquiry(prev => ({ ...prev, content: e.target.value }))}
                  className="bg-slate-700/50 border-slate-600 text-white min-h-32"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewInquiry(false)}
                  className="flex-1"
                >
                  {t.user.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      {t.user.requesting}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {t.user.submit}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 필터 및 검색 */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder={t.user.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48 bg-slate-700/50 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">{t.common.all}</SelectItem>
                <SelectItem value="waiting">{t.user.waitingReply}</SelectItem>
                <SelectItem value="replied">{t.user.repliedStatus}</SelectItem>
                <SelectItem value="unread">{t.customerSupport.unread}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 문의 목록 */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center text-white">
            <MessageSquare className="w-5 h-5 mr-2 text-blue-400" />
            {t.user.inquiryHistory} ({filteredMessages.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : filteredMessages.length > 0 ? (
            <div className="space-y-4">
              {filteredMessages.map((message) => {
                const statusInfo = getStatusInfo(message);
                const StatusIcon = statusInfo.icon;
                const isExpanded = expandedMessages.includes(message.id);
                
                return (
                  <div key={message.id} className="p-4 bg-slate-700/30 rounded-lg">
                    <Collapsible open={isExpanded} onOpenChange={() => toggleMessageExpansion(message.id)}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-start justify-between cursor-pointer hover:bg-slate-700/50 p-2 -m-2 rounded">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                              message.receiver_id === user.id && message.status === 'unread' ? 'bg-blue-400' : 'bg-slate-500'
                            }`} />
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <StatusIcon className={`w-4 h-4 ${statusInfo.textColor}`} />
                                <Badge className={`${statusInfo.color} text-white text-xs`}>
                                  {statusInfo.label}
                                </Badge>
                                {message.replies && message.replies.length > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {message.replies.length}{t.user.repliesCount}
                                  </Badge>
                                )}
                              </div>
                              <h3 className="font-medium text-white truncate">{message.subject}</h3>
                              <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatRelativeTime(message.created_at)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {message.sender_id === user.id ? t.user.myInquiry : t.user.adminReply}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="flex-shrink-0">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="mt-4 space-y-4">
                          {/* 원본 메시지 */}
                          <div className="p-4 bg-slate-600/30 rounded border-l-4 border-blue-500">
                            <div className="flex items-center gap-2 mb-2">
                              <User className="w-4 h-4 text-blue-400" />
                              <span className="text-sm font-medium text-blue-400">
                                {message.sender_id === user.id ? user.nickname : t.user.admin}
                              </span>
                              <span className="text-xs text-slate-500">
                                {formatDateTime(message.created_at)}
                              </span>
                            </div>
                            <div className="text-slate-300 text-sm whitespace-pre-wrap">
                              {message.content}
                            </div>
                          </div>

                          {/* 답글들 */}
                          {message.replies && message.replies.map((reply) => (
                            <div key={reply.id} className="p-4 bg-slate-600/30 rounded border-l-4 border-green-500 ml-8">
                              <div className="flex items-center gap-2 mb-2">
                                <User className="w-4 h-4 text-green-400" />
                                <span className="text-sm font-medium text-green-400">
                                  {reply.sender_id === user.id ? user.nickname : t.user.admin}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {formatDateTime(reply.created_at)}
                                </span>
                              </div>
                              <div className="text-slate-300 text-sm whitespace-pre-wrap">
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
            <div className="text-center py-12">
              <MessageSquare className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-white mb-2">
                {searchQuery || statusFilter !== 'all' ? t.user.noSearchResults : t.user.noInquiries}
              </h3>
              <p className="text-slate-400 mb-4">
                {searchQuery || statusFilter !== 'all'
                  ? t.user.changeSearchCondition 
                  : t.user.askAnytime
                }
              </p>
              {(searchQuery || statusFilter !== 'all') ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                >
                  {t.user.viewAllInquiries}
                </Button>
              ) : (
                <Button
                  onClick={() => setShowNewInquiry(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t.user.firstInquiry}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
