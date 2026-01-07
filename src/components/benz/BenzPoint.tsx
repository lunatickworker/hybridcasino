import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { 
  Gift, 
  TrendingUp, 
  ArrowRightLeft,
  Coins,
  Info
} from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AnimatedCurrency } from '../common/AnimatedNumber';

interface BenzPointProps {
  user: any;
  onRouteChange: (route: string) => void;
  onOpenPointModal?: () => void;
}

interface PointRecord {
  id: string;
  user_id: string;
  transaction_type: string;
  amount: number;
  memo?: string;
  created_at: string;
  processed_at?: string;
}

export function BenzPoint({ user, onRouteChange, onOpenPointModal }: BenzPointProps) {
  const [currentPoints, setCurrentPoints] = useState(0);
  const [pointRecords, setPointRecords] = useState<PointRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 현재 포인트 조회
  const loadCurrentPoints = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('points')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setCurrentPoints(data?.points || 0);
    } catch (error) {
      console.error('포인트 조회 실패:', error);
    }
  };

  // 포인트 내역 조회
  const loadPointRecords = async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('point_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPointRecords(data || []);
    } catch (error) {
      console.error('포인트 내역 조회 실패:', error);
      toast.error('포인트 내역을 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  // 실시간 구독 설정
  useEffect(() => {
    if (!user?.id) return;

    // 초기 데이터 로드
    loadCurrentPoints();
    loadPointRecords();

    // users 테이블 구독 (포인트 변경 감지)
    const userSubscription = supabase
      .channel('user-points-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          console.log('포인트 변경 감지:', payload);
          if (payload.new && 'points' in payload.new) {
            setCurrentPoints(payload.new.points);
          }
        }
      )
      .subscribe();

    // point_transactions 테이블 구독
    const pointSubscription = supabase
      .channel('point-transactions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'point_transactions',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('포인트 내역 변경 감지:', payload);
          loadPointRecords();
        }
      )
      .subscribe();

    return () => {
      userSubscription.unsubscribe();
      pointSubscription.unsubscribe();
    };
  }, [user?.id]);

  // 포인트 타입별 필터링
  const earnRecords = pointRecords.filter(r => r.transaction_type === 'earn');
  const convertRecords = pointRecords.filter(r => r.transaction_type === 'convert_to_balance');

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{
      background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)'
    }}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <Gift className="w-8 h-8" style={{ color: '#C19A6B' }} />
          <h1 className="text-3xl font-bold" style={{ color: '#C19A6B' }}>포인트 관리</h1>
        </div>

        {/* 현재 보유 포인트 */}
        <div 
          className="p-8 rounded-xl relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(219, 39, 119, 0.1) 100%)',
            border: '2px solid rgba(193, 154, 107, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Coins className="w-6 h-6" style={{ color: '#C19A6B' }} />
                <span className="text-lg" style={{ color: '#888773' }}>현재 보유 포인트</span>
              </div>
              
              {/* 포인트 전환 버튼 */}
              {onOpenPointModal && (
                <button
                  onClick={onOpenPointModal}
                  disabled={currentPoints <= 0}
                  className="px-6 py-2.5 rounded-lg font-bold transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  style={{
                    background: currentPoints > 0 ? 'linear-gradient(135deg, #8B5CF6 0%, #DB2777 100%)' : 'rgba(100, 100, 100, 0.3)',
                    color: 'white',
                    border: '1px solid rgba(193, 154, 107, 0.3)',
                    boxShadow: currentPoints > 0 ? '0 4px 16px rgba(139, 92, 246, 0.3)' : 'none'
                  }}
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  머니로 전환
                </button>
              )}
            </div>
            
            <div className="flex items-baseline gap-2">
              <AnimatedCurrency 
                value={currentPoints} 
                className="text-5xl font-bold"
                style={{ color: '#C19A6B' }}
              />
              <span className="text-2xl" style={{ color: '#888773' }}>P</span>
            </div>
            
            <p className="mt-4 text-sm" style={{ color: '#888773' }}>
              <Info className="inline w-4 h-4 mr-1" />
              포인트를 머니로 전환하면 되돌릴 수 없습니다
            </p>
          </div>
          
          {/* 배경 장식 */}
          <div 
            className="absolute top-0 right-0 w-64 h-64 blur-3xl opacity-20 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(193, 154, 107, 0.4) 0%, transparent 70%)'
            }}
          />
        </div>

        {/* 포인트 적립 내역 */}
        <div 
          className="p-6 rounded-xl"
          style={{
            background: 'rgba(26, 26, 26, 0.6)',
            border: '1px solid rgba(193, 154, 107, 0.2)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5" style={{ color: '#22C55E' }} />
            <h2 className="text-xl font-bold" style={{ color: '#C19A6B' }}>포인트 적립 내역</h2>
          </div>

          <div className="space-y-2">
            {earnRecords.length === 0 ? (
              <div className="text-center py-8" style={{ color: '#888773' }}>
                적립 내역이 없습니다
              </div>
            ) : (
              earnRecords.map((record) => (
                <div
                  key={record.id}
                  className="p-4 rounded-lg flex items-center justify-between hover:scale-[1.01] transition-all"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(193, 154, 107, 0.2)'
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(34, 197, 94, 0.2)' }}
                    >
                      <TrendingUp className="w-5 h-5" style={{ color: '#22C55E' }} />
                    </div>
                    <div>
                      <div className="font-bold" style={{ color: '#C19A6B' }}>
                        +{record.amount.toLocaleString()} P
                      </div>
                      <div className="text-sm" style={{ color: '#888773' }}>
                        {record.memo || '포인트 적립'}
                      </div>
                      <div className="text-xs mt-1" style={{ color: '#666' }}>
                        {formatDate(record.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 포인트 전환 내역 */}
        <div 
          className="p-6 rounded-xl"
          style={{
            background: 'rgba(26, 26, 26, 0.6)',
            border: '1px solid rgba(193, 154, 107, 0.2)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <ArrowRightLeft className="w-5 h-5" style={{ color: '#8B5CF6' }} />
            <h2 className="text-xl font-bold" style={{ color: '#C19A6B' }}>포인트 전환 내역</h2>
          </div>

          <div className="space-y-2">
            {convertRecords.length === 0 ? (
              <div className="text-center py-8" style={{ color: '#888773' }}>
                전환 내역이 없습니다
              </div>
            ) : (
              convertRecords.map((record) => (
                <div
                  key={record.id}
                  className="p-4 rounded-lg flex items-center justify-between hover:scale-[1.01] transition-all"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(193, 154, 107, 0.2)'
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(139, 92, 246, 0.2)' }}
                    >
                      <ArrowRightLeft className="w-5 h-5" style={{ color: '#8B5CF6' }} />
                    </div>
                    <div>
                      <div className="font-bold" style={{ color: '#C19A6B' }}>
                        -{record.amount.toLocaleString()} P
                      </div>
                      <div className="text-sm" style={{ color: '#888773' }}>
                        {record.memo || '포인트 → 머니 전환'}
                      </div>
                      <div className="text-xs mt-1" style={{ color: '#666' }}>
                        {formatDate(record.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}