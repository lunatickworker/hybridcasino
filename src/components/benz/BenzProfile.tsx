import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  User, 
  Wallet,
  Coins,
  Eye,
  EyeOff,
  Lock,
  Gamepad2,
  TrendingUp,
  TrendingDown,
  History,
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw
} from "lucide-react";
import { Alert, AlertDescription } from "../ui/alert";
import { supabase } from "../../lib/supabase";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { toast } from "sonner@2.0.3";
import { AnimatedCurrency, AnimatedPoints } from "../common/AnimatedNumber";

interface BenzProfileProps {
  user: any;
  onRouteChange: (route: string) => void;
  onOpenPointModal?: () => void; // ⭐ 포인트 모달 열기 함수 추가
}

interface PointTransaction {
  id: string;
  transaction_type: 'earn' | 'use' | 'convert_to_balance' | 'admin_adjustment' | 'rolling_commission' | 'losing_commission';
  amount: number;
  points_before: number;
  points_after: number;
  memo?: string;
  created_at: string;
}

interface GameRecord {
  id: string;
  external_txid: number;
  user_id: string;
  username: string;
  game_id: string;
  provider_id: string;
  provider_name: string;
  game_title: string;
  game_type: string;
  bet_amount: number;
  win_amount: number;
  balance_before: number;
  balance_after: number;
  played_at: string;
}

export function BenzProfile({ user, onRouteChange, onOpenPointModal }: BenzProfileProps) {
  const [pointTransactions, setPointTransactions] = useState<PointTransaction[]>([]);
  const [gameRecords, setGameRecords] = useState<GameRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBalance, setShowBalance] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [currentPoints, setCurrentPoints] = useState(0);
  const [casinoRollingCommission, setCasinoRollingCommission] = useState(0);
  const [slotRollingCommission, setSlotRollingCommission] = useState(0);
  
  // ✅ API 호출 중복 방지를 위한 ref
  const dataLoadedRef = useRef(false);
  const subscriptionRef = useRef<any>(null);

  // 비밀번호 변경
  const [passwordChange, setPasswordChange] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

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
  
  // 현재 잔고 및 포인트 조회
  const fetchCurrentBalance = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('balance, points, casino_rolling_commission, slot_rolling_commission')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      setCurrentBalance(parseFloat(data.balance) || 0);
      setCurrentPoints(parseFloat(data.points) || 0);
      setCasinoRollingCommission(parseFloat(data.casino_rolling_commission) || 0);
      setSlotRollingCommission(parseFloat(data.slot_rolling_commission) || 0);
    } catch (error) {
      // console.error('잔고 조회 오류:', error);
    }
  };

  // 포인트 내역 조회
  const fetchPointTransactions = async () => {
    try {
      if (!user?.id) {
        // console.error('❌ [BenzProfile] user.id가 없습니다.');
        return;
      }

      // console.log('🔍 [BenzProfile] 포인트 내역 조회 시작 - userId:', user.id, 'username:', user.username);

      const { data, error } = await supabase
        .from('point_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        // console.error('❌ [BenzProfile] 포인트 내역 조회 오류:', error);
        throw error;
      }

      // console.log(`✅ [BenzProfile] 포인트 내역 ${data?.length || 0}건 조회 완료`);
      setPointTransactions(data || []);
    } catch (error) {
      // console.error('포인트 내역 조회 오류:', error);
    }
  };

  // 베팅 내역 조회
  const fetchGameRecords = async () => {
    try {
      if (!user?.id) {
        // console.error('❌ [BenzProfile] user.id가 없습니다.');
        return;
      }

      // console.log('🔍 [BenzProfile] 베팅 내역 조회 시작 - userId:', user.id, 'username:', user.username, 'level:', user.level);

      // ✅ 레벨별 권한 처리
      if (user.level === 1) {
        // Lv1(시스템관리자): 모든 베팅 기록 조회 (필터 없음)
        // console.log(`✅ [BenzProfile] Lv1 - 전체 시스템 모든 베팅 기록 조회`);
        
        const { data, error } = await supabase
          .from('game_records')
          .select(`
            id,
            external_txid,
            user_id,
            username,
            game_id,
            provider_id,
            provider_name,
            game_title,
            game_type,
            bet_amount,
            win_amount,
            balance_before,
            balance_after,
            played_at
          `)
          .order('played_at', { ascending: false })
          .limit(50);

        if (error) {
          // console.error('❌ [BenzProfile] 베팅 내역 조회 오류:', error);
          throw error;
        }

        // console.log(`✅ [BenzProfile] 전체 베팅 내역 ${data?.length || 0}건 조회 완료`);
        
        const records: GameRecord[] = (data || []).map((record: any) => ({
          id: record.id,
          external_txid: record.external_txid || 0,
          user_id: record.user_id,
          username: record.username || 'Unknown',
          game_id: record.game_id,
          provider_id: record.provider_id,
          game_title: record.game_title || `Game ${record.game_id}`,
          provider_name: record.provider_name || `Provider ${record.provider_id}`,
          bet_amount: parseFloat(record.bet_amount || 0),
          win_amount: parseFloat(record.win_amount || 0),
          balance_before: parseFloat(record.balance_before || 0),
          balance_after: parseFloat(record.balance_after || 0),
          played_at: record.played_at,
          game_type: record.game_type
        }));
        
        setGameRecords(records);

      } else if (user.level >= 2) {
        // Lv2(운영사) 이상: 자신의 조직 + 하위 파트너들의 회원 베팅 기록 조회
        // console.log(`🔍 [BenzProfile] Lv${user.level} - 조직 내 하위 회원 베팅 기록 조회 중...`);
        
        // 1️⃣ 자신의 조직 내 모든 하위 파트너 ID 조회 (재귀적)
        const { data: partners, error: partnerError } = await supabase.rpc(
          'get_hierarchical_partners',
          { p_partner_id: user.id }
        );

        if (partnerError) {
          // console.error('❌ [BenzProfile] 하위 파트너 조회 실패:', partnerError);
          return;
        }

        const allPartnerIds = [user.id, ...(partners?.map((p: any) => p.id) || [])];
        // console.log(`   📊 조회된 파트너: ${allPartnerIds.length}명`);

        // 2️⃣ 이 파트너들의 소속 사용자 ID 조회
        const { data: partnerUsers, error: usersError } = await supabase
          .from('users')
          .select('id, username')
          .in('partner_id', allPartnerIds);

        if (usersError) {
          // console.error('❌ [BenzProfile] 조직 사용자 조회 실패:', usersError);
          return;
        }

        const userIds = (partnerUsers || []).map((u: any) => u.id);
        const usernames = (partnerUsers || []).map((u: any) => u.username);
        // console.log(`   👥 조직 소속 사용자: ${userIds.length}명 (ID), ${usernames.length}명 (username)`);
        // console.log(`      사용자 목록:`, usernames.slice(0, 5), usernames.length > 5 ? '...' : '');

        // 3️⃣ 조직 내 모든 사용자의 베팅 기록 조회 (user_id와 username 둘 다 필터링)
        if (userIds.length > 0) {
          // user_id와 username을 모두 포함하여 조회
          const { data, error } = await supabase
            .from('game_records')
            .select(`
              id,
              external_txid,
              user_id,
              username,
              game_id,
              provider_id,
              provider_name,
              game_title,
              game_type,
              bet_amount,
              win_amount,
              balance_before,
              balance_after,
              played_at
            `)
            .or(`user_id.in.(${userIds.join(',')}),username.in.(${usernames.map(u => `"${u}"`).join(',')})`)
            .order('played_at', { ascending: false })
            .limit(50);

          if (error) {
            // console.error('❌ [BenzProfile] 베팅 내역 조회 오류:', error);
            throw error;
          }

          // console.log(`   ✅ 베팅 내역 ${data?.length || 0}건 조회 완료`);
          
          const records: GameRecord[] = (data || []).map((record: any) => ({
            id: record.id,
            external_txid: record.external_txid || 0,
            user_id: record.user_id,
            username: record.username || 'Unknown',
            game_id: record.game_id,
            provider_id: record.provider_id,
            game_title: record.game_title || `Game ${record.game_id}`,
            provider_name: record.provider_name || `Provider ${record.provider_id}`,
            bet_amount: parseFloat(record.bet_amount || 0),
            win_amount: parseFloat(record.win_amount || 0),
            balance_before: parseFloat(record.balance_before || 0),
            balance_after: parseFloat(record.balance_after || 0),
            played_at: record.played_at,
            game_type: record.game_type
          }));
          
          setGameRecords(records);
        } else {
          // console.log('   ⚠️ 조직 사용자가 없습니다.');
          setGameRecords([]);
        }

      } else if (user.level === 0) {
        // Lv0(회원): 자신의 베팅 기록만 조회
        // console.log(`✅ [BenzProfile] Lv0 - 자신의 베팅 기록 조회`);
        
        const { data, error } = await supabase
          .from('game_records')
          .select(`
            id,
            external_txid,
            user_id,
            username,
            game_id,
            provider_id,
            provider_name,
            game_title,
            game_type,
            bet_amount,
            win_amount,
            balance_before,
            balance_after,
            played_at
          `)
          .eq('user_id', user.id)
          .order('played_at', { ascending: false })
          .limit(50);

        if (error) {
          // console.error('❌ [BenzProfile] 베팅 내역 조회 오류:', error);
          throw error;
        }

        // console.log(`✅ [BenzProfile] 자신의 베팅 내역 ${data?.length || 0}건 조회 완료`);
        
        const records: GameRecord[] = (data || []).map((record: any) => ({
          id: record.id,
          external_txid: record.external_txid || 0,
          user_id: record.user_id,
          username: record.username || 'Unknown',
          game_id: record.game_id,
          provider_id: record.provider_id,
          game_title: record.game_title || `Game ${record.game_id}`,
          provider_name: record.provider_name || `Provider ${record.provider_id}`,
          bet_amount: parseFloat(record.bet_amount || 0),
          win_amount: parseFloat(record.win_amount || 0),
          balance_before: parseFloat(record.balance_before || 0),
          balance_after: parseFloat(record.balance_after || 0),
          played_at: record.played_at,
          game_type: record.game_type
        }));
        
        setGameRecords(records);
      }
    } catch (error) {
      console.error('게임 기록 조회 오류:', error);
    }
  };

  // 비밀번호 변경
  const handlePasswordChange = async () => {
    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      toast.error('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (passwordChange.newPassword.length < 6) {
      toast.error('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    try {
      // 현재 비밀번호 확인
      const { data: authData, error: authError } = await supabase
        .rpc('user_login', {
          p_username: user.username,
          p_password: passwordChange.currentPassword
        });

      if (authError || !authData || authData.length === 0) {
        toast.error('현재 비밀번호가 올바르지 않습니다.');
        return;
      }

      // 새 비밀번호로 업데이트
      const { error } = await supabase
        .from('users')
        .update({ 
          password_hash: passwordChange.newPassword
        })
        .eq('id', user.id);

      if (error) throw error;

      // 비밀번호 변경 로그
      await supabase
        .from('activity_logs')
        .insert([{
          actor_type: 'user',
          actor_id: user.id,
          action: 'password_change',
          details: {
            changed_at: new Date().toISOString()
          }
        }]);

      setPasswordChange({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('비밀번호가 성공적으로 변경되었습니다.');
    } catch (error: any) {
      console.error('비밀번호 변경 오류:', error);
      toast.error(error.message || '비밀번호 변경에 실패했습니다.');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPointTransactionLabel = (type: string) => {
    switch (type) {
      case 'earn': return '포인트 획득';
      case 'use': return '포인트 사용';
      case 'convert_to_balance': return 'GMS 머니 전환';
      case 'rolling_commission': return '롤링 커미션';
      case 'losing_commission': return '루징 커미션';
      case 'admin_adjustment': return '관리자 조정';
      default: return type;
    }
  };

  const getPointTransactionColor = (type: string) => {
    switch (type) {
      case 'earn':
      case 'rolling_commission':
      case 'losing_commission':
        return 'text-green-400';
      case 'use':
      case 'convert_to_balance':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    // ✅ 이미 데이터가 로드되었으면 다시 호출하지 않음 (중복 방지)
    if (dataLoadedRef.current) {
      // console.log('🔄 [BenzProfile] 데이터 이미 로드됨, 건너뜀');
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      // console.log('🚀 [BenzProfile] 데이터 로드 시작');
      await Promise.all([
        fetchCurrentBalance(),
        fetchPointTransactions(),
        fetchGameRecords()
      ]);
      dataLoadedRef.current = true; // ✅ 로드 완료 표시
      setIsLoading(false);
      // console.log('✅ [BenzProfile] 데이터 로드 완료');
    };

    loadData();

    // ✅ 실시간 업데이트 구독 (한 번만 구독)
    if (!subscriptionRef.current) {
      subscriptionRef.current = supabase
        .channel('profile_updates')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`
        }, () => {
          fetchCurrentBalance();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'point_transactions',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchPointTransactions();
          fetchCurrentBalance();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'game_records',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchGameRecords();
        })
        .subscribe();
    }

    return () => {
      // ✅ 클린업에서 구독 해제 (컴포넌트 언마운트 시)
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      // ✅ user 변경 시 ref 리셋 (새로운 사용자로 로그인 시)
      dataLoadedRef.current = false;
    };
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-4 md:p-6 pb-20 md:pb-6" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
      <div className="flex gap-6 justify-center">
        {/* 컨텐츠 영역 */}
        <div className="flex-1 w-full md:max-w-[70%]">
          {/* 제목 */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1.5 h-8" style={{
                background: 'linear-gradient(180deg, #C19A6B 0%, #A67C52 100%)'
              }}></div>
              <h1 className="text-2xl font-bold" style={{
                background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 50%, #A67C52 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>내 정보</h1>
            </div>
            <p className="text-gray-400 ml-6">회원 정보와 활동 내역을 확인하세요</p>
          </div>

          {/* 사용자 프로필 카드 */}
          <Card className="border-0 mb-6" style={{
            background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, rgba(166, 124, 82, 0.1) 100%)',
            border: '1px solid rgba(193, 154, 107, 0.3)',
            borderRadius: '12px'
          }}>
            <CardContent className="p-6">
              <div className={`grid ${user.level <= 2 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-6`}>
                {/* 기본 정보 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{
                      background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                      boxShadow: '0 4px 12px rgba(193, 154, 107, 0.3)'
                    }}>
                      <User className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold" style={{ color: '#E6C9A8' }}>{user.nickname}</h2>
                      <p className="text-gray-400">@{user.username}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3 pl-2">
                    <div className="flex items-center justify-between p-3 rounded-lg" style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(193, 154, 107, 0.2)'
                    }}>
                      <span className="text-gray-300">아이디</span>
                      <span className="font-semibold" style={{ color: '#E6C9A8' }}>{user.username}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg" style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(193, 154, 107, 0.2)'
                    }}>
                      <span className="text-gray-300">닉네임</span>
                      <span className="font-semibold" style={{ color: '#E6C9A8' }}>{user.nickname}</span>
                    </div>
                  </div>
                </div>

                {/* 커미션 정보 - Lv3 이상만 표시 */}
                {user.level > 2 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold mb-3" style={{ color: '#E6C9A8' }}>롤링 커미션</h3>
                    <div className="space-y-3">
                      <div className="p-4 rounded-lg" style={{
                        background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.2) 0%, rgba(166, 124, 82, 0.1) 100%)',
                        border: '1px solid rgba(193, 154, 107, 0.3)'
                      }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Gamepad2 className="w-5 h-5" style={{ color: '#C19A6B' }} />
                            <span className="text-gray-300">카지노</span>
                          </div>
                          <span className="text-xl font-bold" style={{ color: '#E6C9A8' }}>
                            {casinoRollingCommission.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      
                      <div className="p-4 rounded-lg" style={{
                        background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.2) 0%, rgba(166, 124, 82, 0.1) 100%)',
                        border: '1px solid rgba(193, 154, 107, 0.3)'
                      }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Coins className="w-5 h-5 text-yellow-400" />
                            <span className="text-gray-300">슬롯</span>
                          </div>
                          <span className="text-xl font-bold" style={{ color: '#E6C9A8' }}>
                            {slotRollingCommission.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 보유머니 & 포인트 / 비밀번호 수정 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* 보유머니 & 포인트 */}
            <Card className="border-0" style={{
              background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
              border: '1px solid rgba(193, 154, 107, 0.2)',
              borderRadius: '12px'
            }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                  <Wallet className="w-5 h-5" />
                  자산 현황
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 보유머니 */}
                <div className="p-4 rounded-lg" style={{
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%)',
                  border: '1px solid rgba(34, 197, 94, 0.3)'
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-300">보유머니</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowBalance(!showBalance)}
                      className="w-8 h-8 p-0 hover:bg-green-500/10"
                    >
                      {showBalance ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                    </Button>
                  </div>
                  <div className="text-2xl font-bold text-green-400">
                    {showBalance ? (
                      <>
                        <AnimatedCurrency value={currentBalance} duration={800} /> 원
                      </>
                    ) : (
                      '••••••••'
                    )}
                  </div>
                </div>

                {/* 포인트 */}
                <div 
                  className="p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg" 
                  style={{
                    background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(202, 138, 4, 0.1) 100%)',
                    border: '1px solid rgba(234, 179, 8, 0.3)'
                  }}
                  onClick={() => onOpenPointModal && onOpenPointModal()}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-300">포인트</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation(); // 포인트 카드 클릭 이벤트 방지
                        setShowPoints(!showPoints);
                      }}
                      className="w-8 h-8 p-0 hover:bg-yellow-500/10"
                    >
                      {showPoints ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                    </Button>
                  </div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {showPoints ? (
                      <AnimatedPoints value={currentPoints} duration={800} />
                    ) : (
                      '••••••••'
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 비밀번호 수정 */}
            <Card className="border-0" style={{
              background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
              border: '1px solid rgba(193, 154, 107, 0.2)',
              borderRadius: '12px'
            }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                  <Lock className="w-5 h-5" />
                  비밀번호 수정
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-gray-300 mb-2 block">현재 비밀번호</Label>
                  <Input
                    type="password"
                    value={passwordChange.currentPassword}
                    onChange={(e) => setPasswordChange({ ...passwordChange, currentPassword: e.target.value })}
                    className="bg-black/30 border-gray-600 text-white"
                    placeholder="현재 비밀번호 입력"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 mb-2 block">새 비밀번호</Label>
                  <Input
                    type="password"
                    value={passwordChange.newPassword}
                    onChange={(e) => setPasswordChange({ ...passwordChange, newPassword: e.target.value })}
                    className="bg-black/30 border-gray-600 text-white"
                    placeholder="새 비밀번호 입력 (6자 이상)"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 mb-2 block">새 비밀번호 확인</Label>
                  <Input
                    type="password"
                    value={passwordChange.confirmPassword}
                    onChange={(e) => setPasswordChange({ ...passwordChange, confirmPassword: e.target.value })}
                    className="bg-black/30 border-gray-600 text-white"
                    placeholder="새 비밀번호 다시 입력"
                  />
                </div>
                <Button
                  onClick={handlePasswordChange}
                  className="w-full"
                  style={{
                    background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                    border: '1px solid rgba(230, 201, 168, 0.3)'
                  }}
                  disabled={!passwordChange.currentPassword || !passwordChange.newPassword || !passwordChange.confirmPassword}
                >
                  비밀번호 변경
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* 베팅내역 / 포인트 내역 탭 */}
          <Tabs defaultValue="betting" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 border-0 p-1" style={{
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(193, 154, 107, 0.2)',
              borderRadius: '12px'
            }}>
              <TabsTrigger 
                value="betting" 
                className="flex items-center justify-center gap-2 text-gray-400 data-[state=active]:text-white transition-all"
                style={{
                  borderRadius: '10px',
                  border: 'none'
                }}
                data-active-style="linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)"
              >
                <History className="w-4 h-4" />
                베팅내역
              </TabsTrigger>
              <TabsTrigger 
                value="points" 
                className="flex items-center justify-center gap-2 text-gray-400 data-[state=active]:text-white transition-all"
                style={{
                  borderRadius: '10px',
                  border: 'none'
                }}
                data-active-style="linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)"
              >
                <Coins className="w-4 h-4" />
                포인트 내역
              </TabsTrigger>
            </TabsList>

            {/* 베팅내역 탭 */}
            <TabsContent value="betting">
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '12px'
              }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle style={{ color: '#E6C9A8' }}>베팅 내역</CardTitle>
                    <Button
                      onClick={fetchGameRecords}
                      variant="outline"
                      size="sm"
                      className="border-0 text-white"
                      style={{
                        background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, rgba(166, 124, 82, 0.1) 100%)',
                        border: '1px solid rgba(193, 154, 107, 0.3)',
                        borderRadius: '6px'
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      새로고침
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {gameRecords.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      베팅 내역이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-0">
                      {/* 테이블 헤더 - 데스크톱에서만 표시 */}
                      <div className="hidden sm:flex px-4 py-3 rounded-t-lg font-semibold text-xs text-gray-400 mb-1 border-b"
                        style={{ borderColor: 'rgba(193, 154, 107, 0.2)' }}>
                        <div className="flex-1">게임명</div>
                        <div className="flex items-center justify-end gap-6 flex-shrink-0">
                          <div className="w-16 text-right">베팅</div>
                          <div className="w-16 text-right">적중</div>
                          <div className="w-20 text-right">수익</div>
                        </div>
                      </div>

                      {/* 베팅 내역 리스트 */}
                      <div className="space-y-2">
                        {gameRecords.map((record) => (
                        <div
                          key={record.id}
                          className="px-4 py-3 rounded-lg border transition-all hover:scale-[1.005] hover:shadow-lg"
                          style={{
                            background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%)',
                            borderColor: 'rgba(193, 154, 107, 0.3)',
                            borderWidth: '1px'
                          }}
                        >
                          {/* 한 줄 레이아웃 - 모바일 친화적 */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                            {/* 게임 정보 (왼쪽) */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span 
                                  className="font-semibold truncate text-sm md:text-base" 
                                  style={{ color: '#E6C9A8' }}
                                  title={record.game_title}
                                >
                                  {record.game_title || '게임'}
                                </span>
                                <span className="text-xs text-gray-500 whitespace-nowrap">
                                  {record.provider_name || '제공사'}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400">
                                {formatDateTime(record.played_at)}
                              </div>
                            </div>

                            {/* 수치 정보 (오른쪽) - 한 줄 정렬 */}
                            <div className="flex items-center justify-end sm:justify-end gap-4 md:gap-6 flex-shrink-0">
                              {/* 베팅액 */}
                              <div className="text-right">
                                <div className="text-xs text-gray-500">베팅</div>
                                <div className="font-semibold text-red-400 text-sm">
                                  {formatCurrency(record.bet_amount)}
                                </div>
                              </div>

                              {/* 적중액 */}
                              <div className="text-right">
                                <div className="text-xs text-gray-500">적중</div>
                                <div className="font-semibold text-green-400 text-sm">
                                  {formatCurrency(record.win_amount)}
                                </div>
                              </div>

                              {/* 수익/손실 (강조) */}
                              <div className="text-right min-w-max">
                                <div className="text-xs text-gray-500">수익</div>
                                <div 
                                  className={`font-bold text-sm ${
                                    record.win_amount > record.bet_amount 
                                      ? 'text-green-400' 
                                      : 'text-red-400'
                                  }`}
                                >
                                  {record.win_amount > record.bet_amount ? '+' : ''}
                                  {formatCurrency(record.win_amount - record.bet_amount)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 포인트 내역 탭 */}
            <TabsContent value="points">
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '12px'
              }}>
                <CardHeader>
                  <CardTitle style={{ color: '#E6C9A8' }}>포인트 내역</CardTitle>
                </CardHeader>
                <CardContent>
                  {pointTransactions.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      포인트 내역이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-0">
                      {/* 테이블 헤더 - 데스크톱에서만 표시 */}
                      <div className="hidden sm:flex px-4 py-3 rounded-t-lg font-semibold text-xs text-gray-400 mb-1 border-b"
                        style={{ borderColor: 'rgba(193, 154, 107, 0.2)' }}>
                        <div className="flex-1">거래유형</div>
                        <div className="flex items-center justify-end gap-6 flex-shrink-0">
                          <div className="w-24 text-right">변동</div>
                          <div className="w-20 text-right">조회</div>
                        </div>
                      </div>

                      {/* 포인트 내역 리스트 */}
                      <div className="space-y-2">
                        {pointTransactions.map((transaction) => {
                          const isPositive = transaction.points_after > transaction.points_before;
                          return (
                            <div
                              key={transaction.id}
                              className="px-4 py-3 rounded-lg border transition-all hover:scale-[1.005] hover:shadow-lg"
                              style={{
                                background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%)',
                                borderColor: 'rgba(193, 154, 107, 0.3)',
                                borderWidth: '1px'
                              }}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                                {/* 거래 정보 (왼쪽) */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`font-semibold text-sm md:text-base ${getPointTransactionColor(transaction.transaction_type)}`}>
                                      {getPointTransactionLabel(transaction.transaction_type)}
                                    </span>
                                    {isPositive ? (
                                      <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0" />
                                    ) : (
                                      <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {formatDateTime(transaction.created_at)}
                                  </div>
                                  {transaction.memo && (
                                    <div className="text-xs text-gray-500 mt-1 truncate">
                                      {transaction.memo}
                                    </div>
                                  )}
                                </div>

                                {/* 수치 정보 (오른쪽) - 한 줄 정렬 */}
                                <div className="flex items-center justify-end sm:justify-end gap-4 md:gap-6 flex-shrink-0">
                                  {/* 변동액 */}
                                  <div className="text-right">
                                    <div className="text-xs text-gray-500">변동</div>
                                    <div className={`font-bold text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                                      {isPositive ? '+' : ''}{formatCurrency(transaction.amount)}P
                                    </div>
                                  </div>

                                  {/* 변경 후 포인트 */}
                                  <div className="text-right min-w-max">
                                    <div className="text-xs text-gray-500">조회</div>
                                    <div className="font-semibold text-sm" style={{ color: '#E6C9A8' }}>
                                      {formatCurrency(transaction.points_after)}P
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}