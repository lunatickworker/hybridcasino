import { useState, useEffect } from "react";
import { X, MessageSquare } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";

interface BenzMessagePopupProps {
  userId: string;
}

interface Message {
  id: string;
  sender_type: 'user' | 'partner';
  sender_id: string;
  receiver_type: 'user' | 'partner';
  receiver_id: string;
  subject: string;
  content: string;
  message_type: 'normal' | 'system' | 'urgent';
  status: 'unread' | 'read' | 'replied';
  created_at: string;
  read_at?: string;
  parent_id?: string;
}

export function BenzMessagePopup({ userId }: BenzMessagePopupProps) {
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // 새 메시지 확인 및 표시
  const checkNewMessages = async () => {
    // userId가 없으면 조회하지 않음
    if (!userId) {
      console.warn('BenzMessagePopup: userId가 없어 메시지를 조회할 수 없습니다.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('receiver_type', 'user')
        .eq('receiver_id', userId)
        .eq('sender_type', 'partner')
        .eq('status', 'unread')
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('메시지 조회 오류:', error);
        return;
      }

      if (data) {
        setCurrentMessage(data);
        setIsVisible(true);
      }
    } catch (error) {
      console.error('메시지 확인 오류:', error);
    }
  };

  // 실시간 메시지 구독
  useEffect(() => {
    // userId가 없으면 구독하지 않음
    if (!userId) {
      console.warn('BenzMessagePopup: userId가 없어 메시지 구독을 시작할 수 없습니다.');
      return;
    }

    console.log('🔔 Benz 메시지 팝업 실시간 구독 시작:', userId);

    // 초기 메시지 확인
    checkNewMessages();

    // Realtime 구독
    const messagesChannel = supabase
      .channel('benz_message_popup')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`
        },
        (payload) => {
          console.log('📨 새 메시지 도착 (Benz):', payload);
          const newMsg = payload.new as Message;
          
          // 파트너가 사용자에게 보낸 메시지만 팝업 표시
          if (newMsg.sender_type === 'partner' && 
              newMsg.receiver_type === 'user' && 
              !newMsg.parent_id) {
            setCurrentMessage(newMsg);
            setIsVisible(true);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔕 Benz 메시지 팝업 구독 해제');
      supabase.removeChannel(messagesChannel);
    };
  }, [userId]);

  // 메시지 읽음 처리 및 닫기
  const handleConfirm = async () => {
    if (!currentMessage) return;

    try {
      // 읽음 처리
      const { error } = await supabase
        .from('messages')
        .update({
          status: 'read',
          read_at: new Date().toISOString()
        })
        .eq('id', currentMessage.id);

      if (error) throw error;

      toast.success('메시지를 확인했습니다.');
      setIsVisible(false);
      setCurrentMessage(null);

      // 다음 메시지 확인
      setTimeout(() => {
        checkNewMessages();
      }, 500);
    } catch (error) {
      console.error('메시지 읽음 처리 오류:', error);
      toast.error('메시지 처리 중 오류가 발생했습니다.');
    }
  };

  if (!isVisible || !currentMessage) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
      <Card className="w-full max-w-lg mx-4 bg-gradient-to-br from-[#1a1f3a] via-[#0a0e27] to-[#1a1f3a] border-2 shadow-2xl" style={{
        borderColor: '#a855f7',
        boxShadow: '0 0 30px rgba(168, 85, 247, 0.5), 0 0 60px rgba(236, 72, 153, 0.3)'
      }}>
        <CardHeader className="border-b bg-gradient-to-r from-purple-600/20 to-pink-600/20" style={{
          borderColor: 'rgba(168, 85, 247, 0.3)'
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg shadow-lg" style={{
                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                boxShadow: '0 0 20px rgba(168, 85, 247, 0.6)'
              }}>
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl text-white font-black">
                  📢 관리자 메시지
                </CardTitle>
                <p className="text-xs text-purple-300 mt-1">
                  {new Date(currentMessage.created_at).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6 pb-6">
          {/* 제목 */}
          <div className="mb-4">
            <div className="text-sm text-purple-400 font-medium mb-2">제목</div>
            <div className="text-lg text-white font-semibold bg-[#0a0e27]/50 p-3 rounded-lg border" style={{
              borderColor: 'rgba(168, 85, 247, 0.3)'
            }}>
              {currentMessage.subject}
            </div>
          </div>

          {/* 내용 */}
          <div className="mb-6">
            <div className="text-sm text-purple-400 font-medium mb-2">내용</div>
            <div className="text-base text-slate-200 bg-[#0a0e27]/50 p-4 rounded-lg border min-h-[120px] whitespace-pre-wrap" style={{
              borderColor: 'rgba(168, 85, 247, 0.3)'
            }}>
              {currentMessage.content}
            </div>
          </div>

          {/* 확인 버튼 */}
          <div className="flex justify-end">
            <Button
              onClick={handleConfirm}
              className="relative bg-transparent border-2 hover:bg-purple-900/30 text-white font-black px-8 py-6 shadow-lg transition-all duration-300"
              style={{
                borderColor: '#a855f7',
                boxShadow: '0 0 20px rgba(168, 85, 247, 0.6), 0 0 40px rgba(236, 72, 153, 0.4)'
              }}
            >
              <span style={{
                textShadow: '0 0 10px rgba(168, 85, 247, 0.8), 0 0 20px rgba(236, 72, 153, 0.6)'
              }}>확인</span>
            </Button>
          </div>

          {/* 안내 메시지 */}
          <div className="mt-4 p-3 bg-purple-500/10 border rounded-lg" style={{
            borderColor: 'rgba(168, 85, 247, 0.3)'
          }}>
            <p className="text-xs text-purple-300 text-center">
              💡 메시지를 확인하시려면 '확인' 버튼을 눌러주세요.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
