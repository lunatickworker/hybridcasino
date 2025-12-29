import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { 
  Search, 
  Bell, 
  Eye,
  Calendar,
  Pin,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { supabase } from "../../lib/supabase";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { toast } from "sonner";

interface BenzNoticeProps {
  user: any;
  onRouteChange?: (route: string) => void;
}

interface Notice {
  id: string;
  title: string;
  content: string;
  is_popup: boolean;
  is_pinned: boolean;
  view_count: number;
  created_at: string;
  partner_id: string;
  partners?: {
    nickname: string;
  };
  is_read?: boolean;
}

interface PopupNotice {
  id: string;
  title: string;
  content: string;
  created_at: string;
  hide_today?: boolean;
}

export function BenzNotice({ user, onRouteChange }: BenzNoticeProps) {
  // Guard against null user
  if (!user) {
    return (
      <Card className="bg-[#1a1f3a] border-purple-900/30 text-white">
        <CardContent className="p-8 text-center">
          <p className="text-gray-400">사용자 정보를 불러올 수 없습니다.</p>
        </CardContent>
      </Card>
    );
  }
  
  const [notices, setNotices] = useState<Notice[]>([]);
  const [filteredNotices, setFilteredNotices] = useState<Notice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [showNoticeDialog, setShowNoticeDialog] = useState(false);
  const [expandedNotices, setExpandedNotices] = useState<string[]>([]);
  const [popupNotices, setPopupNotices] = useState<PopupNotice[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  // 공지사항 목록 조회
  const fetchNotices = async (page = 1) => {
    try {
      setIsLoading(true);
      
      const offset = (page - 1) * itemsPerPage;
      
      const { data, error, count } = await supabase
        .from('announcements')
        .select(`
          *,
          partners (
            nickname
          )
        `, { count: 'exact' })
        .eq('status', 'active')
        .in('target_type', ['users', 'all'])
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + itemsPerPage - 1);

      if (error) throw error;

      // 읽음 상태 확인 (로그인한 경우에만)
      let readNoticeIds: string[] = [];
      if (user?.id) {
        const noticeIds = data?.map(notice => notice.id) || [];
        const { data: readData } = await supabase
          .from('announcement_reads')
          .select('announcement_id')
          .eq('user_id', user.id)
          .in('announcement_id', noticeIds);

        readNoticeIds = readData?.map(read => read.announcement_id) || [];
      }

      const noticesWithReadStatus = data?.map(notice => ({
        ...notice,
        is_read: readNoticeIds.includes(notice.id)
      })) || [];

      setNotices(noticesWithReadStatus);
      setFilteredNotices(noticesWithReadStatus);
      setTotalPages(Math.ceil((count || 0) / itemsPerPage));
      setCurrentPage(page);
    } catch (error) {
      console.error('공지사항 조회 오류:', error);
      toast.error('공지사항을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 팝업 공지사항 조회
  const fetchPopupNotices = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, content, created_at')
        .eq('status', 'active')
        .eq('is_popup', true)
        .in('target_type', ['users', 'all'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 오늘 숨기기 설정 확인
      const hiddenToday = JSON.parse(localStorage.getItem('hidden_popups_today') || '[]');
      const today = new Date().toDateString();
      const hiddenTodayIds = hiddenToday
        .filter((item: any) => item.date === today)
        .map((item: any) => item.id);

      const visiblePopups = (data || [])
        .filter(notice => !hiddenTodayIds.includes(notice.id))
        .map(notice => ({
          ...notice,
          hide_today: false
        }));

      setPopupNotices(visiblePopups);
    } catch (error) {
      console.error('팝업 공지사항 조회 오류:', error);
    }
  };

  // 공지사항 검색
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredNotices(notices);
      return;
    }

    const filtered = notices.filter(notice =>
      notice.title.toLowerCase().includes(query.toLowerCase()) ||
      notice.content.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredNotices(filtered);
  };

  // 공지사항 상세보기
  const handleNoticeClick = async (notice: Notice) => {
    setSelectedNotice(notice);
    setShowNoticeDialog(true);

    // 읽음 처리 (로그인한 경우에만)
    if (!notice.is_read && user?.id) {
      try {
        // 읽음 기록 추가
        await supabase
          .from('announcement_reads')
          .insert([{
            announcement_id: notice.id,
            user_id: user.id
          }]);

        // 조회수 증가
        await supabase
          .from('announcements')
          .update({ view_count: notice.view_count + 1 })
          .eq('id', notice.id);

        // 로컬 상태 업데이트
        setNotices(prev => prev.map(n => 
          n.id === notice.id 
            ? { ...n, is_read: true, view_count: n.view_count + 1 }
            : n
        ));
        setFilteredNotices(prev => prev.map(n => 
          n.id === notice.id 
            ? { ...n, is_read: true, view_count: n.view_count + 1 }
            : n
        ));
      } catch (error) {
        console.error('읽음 처리 오류:', error);
      }
    } else if (!user?.id) {
      // 로그인하지 않은 경우 조회수만 증가
      try {
        await supabase
          .from('announcements')
          .update({ view_count: notice.view_count + 1 })
          .eq('id', notice.id);
      } catch (error) {
        console.error('조회수 증가 오류:', error);
      }
    }
  };

  // 공지사항 확장/축소
  const toggleNoticeExpansion = (noticeId: string) => {
    setExpandedNotices(prev => 
      prev.includes(noticeId)
        ? prev.filter(id => id !== noticeId)
        : [...prev, noticeId]
    );
  };

  // 팝업 닫기
  const closePopup = (noticeId: string, hideToday = false) => {
    setPopupNotices(prev => prev.filter(notice => notice.id !== noticeId));
    
    if (hideToday) {
      const hiddenToday = JSON.parse(localStorage.getItem('hidden_popups_today') || '[]');
      const today = new Date().toDateString();
      const newHidden = [...hiddenToday, { id: noticeId, date: today }];
      localStorage.setItem('hidden_popups_today', JSON.stringify(newHidden));
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

  const truncateContent = (content: string, maxLength = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  useEffect(() => {
    fetchNotices();
    fetchPopupNotices();

    // 실시간 공지사항 업데이트 구독
    const subscription = supabase
      .channel('announcement_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'announcements'
      }, () => {
        fetchNotices(currentPage);
        fetchPopupNotices();
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, [user?.id]);

  return (
    <div className="min-h-screen text-white p-4 md:p-6 pb-20 md:pb-6" style={{ 
      fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif',
      background: 'linear-gradient(135deg, rgba(15, 15, 25, 0.95) 0%, rgba(10, 10, 20, 0.95) 100%)'
    }}>
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 justify-center">
        <div className="flex-1 w-full md:max-w-[70%]">
          {/* 팝업 공지사항 */}
          {popupNotices.map((popup) => (
            <div key={popup.id} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <Card className="w-full max-w-md lg:max-w-lg relative rounded-lg border-2" style={{
                background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.98) 0%, rgba(15, 15, 25, 0.98) 100%)',
                borderColor: 'rgba(193, 154, 107, 0.4)'
              }}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base md:text-lg text-white pr-8">{popup.title}</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => closePopup(popup.id)}
                      className="absolute top-2 right-2 w-8 h-8 p-0 text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div 
                    className="text-slate-300 text-sm max-h-60 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: popup.content }}
                  />
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-4 border-t" style={{
                    borderColor: 'rgba(193, 154, 107, 0.2)'
                  }}>
                    <span className="text-xs text-slate-500">
                      {formatDateTime(popup.created_at)}
                    </span>
                    <div className="flex gap-2 w-full md:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => closePopup(popup.id, true)}
                        className="border hover:bg-opacity-20 flex-1 md:flex-initial text-xs md:text-sm"
                        style={{
                          borderColor: 'rgba(193, 154, 107, 0.3)',
                          color: '#E6C9A8'
                        }}
                      >
                        오늘 하루 보지 않기
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => closePopup(popup.id)}
                        className="rounded-lg flex-1 md:flex-initial text-xs md:text-sm"
                        style={{
                          background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                          boxShadow: '0 4px 15px rgba(193, 154, 107, 0.3)'
                        }}
                      >
                        확인
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}

          {/* 제목 */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1.5 h-8" style={{
                background: 'linear-gradient(180deg, #C19A6B 0%, #A67C52 100%)'
              }}></div>
              <h1 className="text-2xl md:text-3xl font-bold" style={{
                background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>공지사항</h1>
            </div>
            <p className="text-slate-400 ml-5 text-sm md:text-base">최신 소식과 중요한 안내사항을 확인하세요</p>
          </div>

          {/* 검색 */}
          <Card className="mb-6 rounded-lg border" style={{
            background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
            borderColor: 'rgba(193, 154, 107, 0.3)'
          }}>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{
                  color: '#A67C52'
                }} />
                <Input
                  placeholder="공지사항 검색..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10 text-white text-base h-12 rounded-lg"
                  style={{
                    background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.8) 0%, rgba(15, 15, 25, 0.8) 100%)',
                    borderColor: 'rgba(193, 154, 107, 0.3)'
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* 공지사항 목록 */}
          <Card className="rounded-lg border-2" style={{
            background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
            borderColor: 'rgba(193, 154, 107, 0.3)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
          }}>
            <CardHeader>
              <CardTitle className="flex items-center text-white text-2xl">
                <Bell className="w-6 h-6 mr-3" style={{ color: '#E6C9A8' }} />
                공지사항 ({filteredNotices.length})
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
              ) : filteredNotices.length > 0 ? (
                <div className="space-y-3">
                  {filteredNotices.map((notice) => {
                    const isExpanded = expandedNotices.includes(notice.id);
                    return (
                      <div 
                        key={notice.id} 
                        className="p-5 transition-all duration-300 border rounded-lg hover:scale-[1.02]"
                        style={{
                          background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.6) 0%, rgba(15, 15, 25, 0.6) 100%)',
                          borderColor: 'rgba(193, 154, 107, 0.2)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {/* 읽음 상태 표시 */}
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0`} style={{
                            background: notice.is_read ? '#64748b' : 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                            boxShadow: notice.is_read ? 'none' : '0 0 8px rgba(193, 154, 107, 0.6)'
                          }} />
                          
                          <div className="flex-1 min-w-0">
                            {/* 헤더 */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  {notice.is_pinned && (
                                    <Badge className="text-white text-xs px-2 py-1" style={{
                                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                    }}>
                                      <Pin className="w-3 h-3 mr-1" />
                                      고정
                                    </Badge>
                                  )}
                                  {notice.is_popup && (
                                    <Badge className="text-white text-xs px-2 py-1" style={{
                                      background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                                    }}>
                                      팝업
                                    </Badge>
                                  )}
                                </div>
                                <h3 
                                  className={`font-semibold cursor-pointer transition-colors text-lg ${
                                    notice.is_read ? 'text-slate-300' : ''
                                  }`}
                                  style={{
                                    color: notice.is_read ? '#cbd5e1' : '#E6C9A8'
                                  }}
                                  onClick={() => handleNoticeClick(notice)}
                                >
                                  {notice.title}
                                </h3>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleNoticeExpansion(notice.id)}
                                className="flex-shrink-0 w-8 h-8 p-0 transition-colors"
                                style={{
                                  color: '#E6C9A8'
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5" />
                                ) : (
                                  <ChevronDown className="w-5 h-5" />
                                )}
                              </Button>
                            </div>

                            {/* 메타 정보 */}
                            <div className="flex items-center gap-4 text-sm text-slate-400 mb-2">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {formatRelativeTime(notice.created_at)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Eye className="w-4 h-4" />
                                {notice.view_count.toLocaleString()}
                              </span>
                              {notice.partners?.nickname && (
                                <span>관리자: {notice.partners.nickname}</span>
                              )}
                            </div>

                            {/* 내용 미리보기 */}
                            <Collapsible open={isExpanded} onOpenChange={() => toggleNoticeExpansion(notice.id)}>
                              <CollapsibleContent>
                                <div 
                                  className="text-slate-300 text-base mt-4 p-4 border-l-4 rounded"
                                  style={{
                                    background: 'linear-gradient(135deg, rgba(10, 10, 20, 0.8) 0%, rgba(5, 5, 15, 0.8) 100%)',
                                    borderColor: '#C19A6B'
                                  }}
                                  dangerouslySetInnerHTML={{ __html: notice.content }}
                                />
                              </CollapsibleContent>
                            </Collapsible>

                            {!isExpanded && (
                              <p className="text-slate-400 text-base">
                                {truncateContent(notice.content.replace(/<[^>]*>/g, ''))}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* 페이지네이션 */}
                  {totalPages > 1 && (
                    <div className="flex justify-center gap-2 pt-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchNotices(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="border text-white hover:scale-105 transition-all duration-300"
                        style={{
                          borderColor: 'rgba(193, 154, 107, 0.3)',
                          background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)'
                        }}
                      >
                        이전
                      </Button>
                      <span className="flex items-center px-4 text-slate-300 text-base">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchNotices(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        className="border text-white hover:scale-105 transition-all duration-300"
                        style={{
                          borderColor: 'rgba(193, 154, 107, 0.3)',
                          background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)'
                        }}
                      >
                        다음
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-20">
                  <Bell className="w-16 h-16 mx-auto mb-4" style={{ color: '#475569' }} />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {searchQuery ? '검색 결과가 없습니다' : '등록된 공지사항이 없습니다'}
                  </h3>
                  <p className="text-slate-400 mb-4">
                    {searchQuery 
                      ? '다른 검색어로 시도해보세요' 
                      : '새로운 공지사항이 등록되면 알려드리겠습니다'
                    }
                  </p>
                  {searchQuery && (
                    <Button
                      variant="outline"
                      onClick={() => handleSearch('')}
                      className="border text-white"
                      style={{
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                        background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)'
                      }}
                    >
                      전체 보기
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 공지사항 상세 다이얼로그 */}
      <Dialog open={showNoticeDialog} onOpenChange={setShowNoticeDialog}>
        <DialogContent className="max-w-2xl text-white max-h-[80vh] overflow-y-auto rounded-lg border-2" style={{
          background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.98) 0%, rgba(15, 15, 25, 0.98) 100%)',
          borderColor: 'rgba(193, 154, 107, 0.4)'
        }}>
          {selectedNotice && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl" style={{ color: '#E6C9A8' }}>{selectedNotice.title}</DialogTitle>
                <DialogDescription className="text-slate-400">
                  중요한 공지사항입니다
                </DialogDescription>
                <div className="flex items-center gap-4 text-sm text-slate-400 pt-2">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDateTime(selectedNotice.created_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    {selectedNotice.view_count.toLocaleString()}
                  </span>
                  {selectedNotice.partners?.nickname && (
                    <span>관리자: {selectedNotice.partners.nickname}</span>
                  )}
                </div>
              </DialogHeader>
              <div className="pt-4">
                <div 
                  className="prose prose-invert max-w-none text-slate-300 text-base"
                  dangerouslySetInnerHTML={{ __html: selectedNotice.content }}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}