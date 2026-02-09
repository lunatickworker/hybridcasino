import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  User, 
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Coins,
  Eye,
  EyeOff,
  Edit,
  Save,
  X,
  Calendar,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Gamepad2,
  Trophy,
  Crown,
  Settings
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Alert, AlertDescription } from "../ui/alert";
import { supabase } from "../../lib/supabase";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { toast } from "sonner@2.0.3";
import { AnimatedCurrency } from "../common/AnimatedNumber";
import { useLanguage } from "../../contexts/LanguageContext";

interface UserProfileProps {
  user: any;
  onRouteChange: (route: string) => void;
}

interface Transaction {
  id: string;
  transaction_type: 'deposit' | 'withdrawal' | 'point_conversion' | 'admin_adjustment';
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  balance_before: number;
  balance_after: number;
  bank_name?: string;
  bank_account?: string;
  memo?: string;
  created_at: string;
  processed_at?: string;
}

interface PointTransaction {
  id: string;
  transaction_type: 'earn' | 'use' | 'convert_to_balance' | 'admin_adjustment';
  amount: number;
  points_before: number;
  points_after: number;
  memo?: string;
  created_at: string;
}

interface GameRecord {
  id: string;
  bet_amount: number;
  win_amount: number;
  balance_before: number;
  balance_after: number;
  played_at: string;
  games?: {
    name: string;
    type: string;
  };
  game_providers?: {
    name: string;
  };
}

interface UserStats {
  total_deposits: number;
  total_withdrawals: number;
  total_bets: number;
  total_wins: number;
  game_count: number;
  win_rate: number;
}

export function UserProfile({ user, onRouteChange }: UserProfileProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('info');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pointTransactions, setPointTransactions] = useState<PointTransaction[]>([]);
  const [gameRecords, setGameRecords] = useState<GameRecord[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showBalance, setShowBalance] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showPointConvertDialog, setShowPointConvertDialog] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [currentPoints, setCurrentPoints] = useState(0);

  // 편집 가능한 정보
  const [editableInfo, setEditableInfo] = useState({
    nickname: '',
    bank_name: '',
    bank_account: '',
    bank_holder: ''
  });

  // 비밀번호 변경
  const [passwordChange, setPasswordChange] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

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
  
  // 현재 잔고 및 포인트 조회
  const fetchCurrentBalance = async () => {
    try {
      // ⭐ Lv2(운영사)는 partners 테이블에서 balance 조회
      if (user.level === 2) {
        const { data, error } = await supabase
          .from('partners')
          .select('balance')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        
        setCurrentBalance(parseFloat(data.balance) || 0);
        setCurrentPoints(0); // 운영사는 포인트 없음
        return;
      }

      // ⭐ 일반 사용자 (users 테이블에서 조회)
      const { data, error } = await supabase
        .from('users')
        .select('balance, points')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      const currentDbBalance = parseFloat(data.balance) || 0;
      let displayBalance = currentDbBalance;
      
      // ⭐ 2. balance가 0이면 최근 세션의 balance_before를 사용 (게임 중일 가능성)
      if (currentDbBalance === 0) {
        const { data: recentSession } = await supabase
          .from('game_launch_sessions')
          .select('balance_before, status, launched_at')
          .eq('user_id', user.id)
          .order('launched_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentSession && recentSession.balance_before > 0) {
          // 최근 10분 이내 세션이면 balance_before 사용
          const sessionTime = new Date(recentSession.launched_at).getTime();
          const now = Date.now();
          const diffMinutes = (now - sessionTime) / 1000 / 60;
          
          if (diffMinutes <= 10) {
            displayBalance = parseFloat(recentSession.balance_before) || 0;
            console.log(`💰 [UI] DB balance=0, 최근 세션 balance_before 표시: ${displayBalance}원 (세션: ${recentSession.status}, ${diffMinutes.toFixed(1)}분 전)`);
          }
        }
      } else {
        // ⭐ 3. balance가 0이 아니어도 active/ending 세션이 있으면 balance_before 사용
        const { data: activeSession } = await supabase
          .from('game_launch_sessions')
          .select('balance_before, status')
          .eq('user_id', user.id)
          .in('status', ['active', 'ending'])
          .order('launched_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeSession && activeSession.balance_before > 0) {
          displayBalance = parseFloat(activeSession.balance_before) || 0;
          console.log(`💰 [UI] 게임 중 (${activeSession.status}) - balance_before 표시: ${displayBalance}원 (DB: ${currentDbBalance}원)`);
        }
      }
      
      setCurrentBalance(displayBalance);
      setCurrentPoints(parseFloat(data.points) || 0);
    } catch (error) {
      console.error('잔고 조회 오류:', error);
    }
  };

  // 입출금 내역 조회
  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .in('transaction_type', ['deposit', 'withdrawal'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('거래 내역 조회 오류:', error);
    }
  };

  // 포인트 내역 조회
  const fetchPointTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('point_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setPointTransactions(data || []);
    } catch (error) {
      console.error('포인트 내역 조회 오류:', error);
    }
  };

  // 베팅 내역 조회
  const fetchGameRecords = async () => {
    try {
      // 348번 SQL에서 game_id FK를 의도적으로 제거했으므로 조인 불가
      // game_records에 이미 game_title, provider_name이 저장되어 있음
      const { data, error } = await supabase
        .from('game_records')
        .select('*')
        .eq('user_id', user.id)
        .order('played_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setGameRecords(data || []);
    } catch (error) {
      console.error('게임 기록 조회 오류:', error);
    }
  };

  // 사용자 통계 조회
  const fetchUserStats = async () => {
    try {
      // 입출금 통계
      const { data: transactionStats } = await supabase
        .from('transactions')
        .select('transaction_type, amount, status')
        .eq('user_id', user.id)
        .eq('status', 'completed');

      const totalDeposits = (transactionStats || [])
        .filter(t => t.transaction_type === 'deposit')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      const totalWithdrawals = (transactionStats || [])
        .filter(t => t.transaction_type === 'withdrawal')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      // 게임 통계
      const { data: gameStats } = await supabase
        .from('game_records')
        .select('bet_amount, win_amount')
        .eq('user_id', user.id);

      const totalBets = (gameStats || []).reduce((sum, g) => sum + parseFloat(g.bet_amount), 0);
      const totalWins = (gameStats || []).reduce((sum, g) => sum + parseFloat(g.win_amount), 0);
      const gameCount = gameStats?.length || 0;
      const winRate = gameCount > 0 ? ((gameStats || []).filter(g => parseFloat(g.win_amount) > parseFloat(g.bet_amount)).length / gameCount) * 100 : 0;

      setUserStats({
        total_deposits: totalDeposits,
        total_withdrawals: totalWithdrawals,
        total_bets: totalBets,
        total_wins: totalWins,
        game_count: gameCount,
        win_rate: winRate
      });
    } catch (error) {
      console.error('통계 조회 오류:', error);
    }
  };

  // 정보 수정
  const handleUpdateInfo = async () => {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          nickname: editableInfo.nickname,
          bank_name: editableInfo.bank_name,
          bank_account: editableInfo.bank_account,
          bank_holder: editableInfo.bank_holder
        })
        .eq('id', user.id);

      if (error) throw error;

      // 활동 로그 기록
      await supabase
        .from('activity_logs')
        .insert([{
          actor_type: 'user',
          actor_id: user.id,
          action: 'profile_update',
          details: {
            nickname: editableInfo.nickname,
            bank_updated: !!(editableInfo.bank_name || editableInfo.bank_account)
          }
        }]);

      setIsEditing(false);
      toast.success(t.user.infoUpdatedSuccess);
    } catch (error: any) {
      console.error('정보 수정 오류:', error);
      toast.error(error.message || t.user.infoUpdateFailed);
    }
  };

  // 비밀번호 변경
  const handlePasswordChange = async () => {
    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      toast.error(t.user.passwordMismatch);
      return;
    }

    if (passwordChange.newPassword.length < 6) {
      toast.error(t.user.passwordTooShort);
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
        toast.error(t.user.currentPasswordIncorrect);
        return;
      }

      // 새 비밀번호로 업데이트
      const { error } = await supabase
        .from('users')
        .update({ 
          password_hash: passwordChange.newPassword // 실제로는 해시화해야 함
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
      setShowPasswordDialog(false);
      toast.success(t.user.passwordChangedSuccess);
    } catch (error: any) {
      console.error('비밀번호 변경 오류:', error);
      toast.error(error.message || t.user.passwordChangeFailed);
    }
  };

  // 포인트를 잔고로 전환
  const convertPointsToBalance = async (points: number) => {
    if (points > currentPoints) {
      toast.error(t.user.insufficientPoints);
      return;
    }

    try {
      // 포인트 차감 및 잔고 증가
      const { error: userError } = await supabase
        .from('users')
        .update({
          points: currentPoints - points,
          balance: currentBalance + points
        })
        .eq('id', user.id);

      if (userError) throw userError;

      // 포인트 거래 기록
      await supabase
        .from('point_transactions')
        .insert([{
          user_id: user.id,
          transaction_type: 'convert_to_balance',
          amount: points,
          points_before: currentPoints,
          points_after: currentPoints - points,
          memo: '포인트를 잔고로 전환',
          created_at: new Date().toISOString()
        }]);

      // 잔고 거래 기록
      await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          transaction_type: 'point_conversion',
          amount: points,
          status: 'completed',
          balance_before: currentBalance,
          balance_after: currentBalance + points,
          memo: '포인트 전환'
        }]);

      fetchCurrentBalance();
      fetchTransactions();
      fetchPointTransactions();

      toast.success(t.user.pointsConvertedSuccess.replace('{{points}}', points.toLocaleString()));
    } catch (error: any) {
      console.error('포인트 전환 오류:', error);
      toast.error(error.message || t.user.pointsConvertFailed);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return { color: 'bg-yellow-500', textColor: 'text-yellow-400', icon: Clock, label: t.user.statusPending };
      case 'approved':
        return { color: 'bg-blue-500', textColor: 'text-blue-400', icon: RefreshCw, label: t.user.statusApproved };
      case 'completed':
        return { color: 'bg-green-500', textColor: 'text-green-400', icon: CheckCircle, label: t.user.statusCompleted };
      case 'rejected':
        return { color: 'bg-red-500', textColor: 'text-red-400', icon: XCircle, label: t.user.statusRejected };
      default:
        return { color: 'bg-slate-500', textColor: 'text-slate-400', icon: Clock, label: t.user.statusUnknown };
    }
  };

  const getVipBadge = (vipLevel: number) => {
    if (vipLevel >= 5) return { label: 'DIAMOND', color: 'bg-purple-600', textColor: 'text-purple-300' };
    if (vipLevel >= 4) return { label: 'PLATINUM', color: 'bg-gray-400', textColor: 'text-gray-300' };
    if (vipLevel >= 3) return { label: 'GOLD', color: 'bg-yellow-500', textColor: 'text-yellow-300' };
    if (vipLevel >= 2) return { label: 'SILVER', color: 'bg-gray-300', textColor: 'text-gray-700' };
    if (vipLevel >= 1) return { label: 'BRONZE', color: 'bg-orange-400', textColor: 'text-orange-300' };
    return { label: 'MEMBER', color: 'bg-slate-500', textColor: 'text-slate-300' };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  const vipBadge = getVipBadge(user?.vip_level || 0);

  // user 데이터가 로드되면 editableInfo 초기화
  useEffect(() => {
    if (user) {
      setEditableInfo({
        nickname: user.nickname || '',
        bank_name: user.bank_name || '',
        bank_account: user.bank_account || '',
        bank_holder: user.bank_holder || ''
      });
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchCurrentBalance(),
        fetchTransactions(),
        fetchPointTransactions(),
        fetchGameRecords(),
        fetchUserStats()
      ]);
      setIsLoading(false);
    };

    loadData();

    // 실시간 업데이트 구독
    const subscription = supabase
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
        table: 'transactions',
        filter: `user_id=eq.${user.id}`
      }, () => {
        fetchTransactions();
        fetchUserStats();
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-4 md:p-6 pb-20 md:pb-6" style={{ fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif' }}>
      <div className="flex gap-6 justify-center">
        {/* 컨텐츠 영역 - 입금/출금과 동일한 너비 */}
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
              }}>{t.user.myInfo}</h1>
            </div>
            <p className="text-gray-400 ml-6">{t.user.checkAccountInfo}</p>
          </div>

          {/* 사용자 정보 카드 */}
          <Card className="border-0 mb-6" style={{
            background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, rgba(166, 124, 82, 0.1) 100%)',
            border: '1px solid rgba(193, 154, 107, 0.3)',
            borderRadius: '8px'
          }}>
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{
                    background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                  }}>
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-bold text-white">{user.nickname}</h2>
                      <Badge className={`${vipBadge.color} text-white px-3 py-1`}>
                        <Crown className="w-4 h-4 mr-1" />
                        {vipBadge.label}
                      </Badge>
                    </div>
                    <p className="text-slate-300">@{user.username}</p>
                    <p className="text-slate-400 text-sm">
                      {t.user.joinedDate} {formatDateTime(user.created_at)}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400 flex items-center justify-center gap-2">
                      {showBalance ? (
                        <AnimatedCurrency value={currentBalance} duration={800} currencySymbol={t.common.currencySymbol} />
                      ) : (
                        '••••••••'
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowBalance(!showBalance)}
                        className="w-6 h-6 p-0"
                      >
                        {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <div className="text-sm text-slate-400">{t.user.balance}</div>
                  </div>
                  <div className="text-center">
                    {currentPoints > 0 ? (
                      <Button
                        variant="ghost"
                        className="flex flex-col items-center p-2 h-auto hover:bg-yellow-500/10 transition-colors"
                        onClick={() => setShowPointConvertDialog(true)}
                      >
                        <div className="text-2xl font-bold text-yellow-400 flex items-center gap-2">
                          {formatCurrency(currentPoints)}P
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                        <div className="text-sm text-slate-400">{t.user.points} {t.user.clickToConvert}</div>
                      </Button>
                    ) : (
                      <>
                        <div className="text-2xl font-bold text-yellow-400">
                          {formatCurrency(currentPoints)}P
                        </div>
                        <div className="text-sm text-slate-400">포인트</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 통계 카드 */}
          {userStats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <CardContent className="p-4 text-center">
                  <TrendingUp className="w-11 h-11 text-green-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{t.common.currencySymbol}{formatCurrency(userStats.total_deposits)}</div>
                  <div className="text-base text-slate-400">{t.user.totalDeposits}</div>
                </CardContent>
              </Card>
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <CardContent className="p-4 text-center">
                  <TrendingDown className="w-11 h-11 text-blue-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{t.common.currencySymbol}{formatCurrency(userStats.total_withdrawals)}</div>
                  <div className="text-base text-slate-400">{t.user.totalWithdrawals}</div>
                </CardContent>
              </Card>
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <CardContent className="p-4 text-center">
                  <Gamepad2 className="w-11 h-11 mx-auto mb-2" style={{ color: '#C19A6B' }} />
                  <div className="text-2xl font-bold text-white">{userStats.game_count.toLocaleString()}</div>
                  <div className="text-base text-slate-400">{t.user.gameCount}</div>
                </CardContent>
              </Card>
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <CardContent className="p-4 text-center">
                  <Trophy className="w-11 h-11 text-yellow-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{userStats.win_rate.toFixed(1)}%</div>
                  <div className="text-base text-slate-400">{t.user.winRate}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 탭 메뉴 */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5 border-0" style={{
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(193, 154, 107, 0.2)',
              borderRadius: '8px'
            }}>
              <TabsTrigger 
                value="info" 
                className="flex items-center justify-center gap-2 rounded-none data-[state=active]:text-white px-2 py-3"
                style={{
                  '--active-bg': 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                } as any}
                data-state={activeTab === 'info' ? 'active' : 'inactive'}
              >
                <User className="w-4 h-4 flex-shrink-0" />
                <span className="hidden md:inline text-sm">{t.user.basicInfoTab}</span>
              </TabsTrigger>
              <TabsTrigger 
                value="transactions" 
                className="flex items-center justify-center gap-2 rounded-none data-[state=active]:text-white px-2 py-3"
                style={{
                  '--active-bg': 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                } as any}
                data-state={activeTab === 'transactions' ? 'active' : 'inactive'}
              >
                <CreditCard className="w-4 h-4 flex-shrink-0" />
                <span className="hidden md:inline text-sm">{t.user.transactionHistoryTab}</span>
              </TabsTrigger>
              <TabsTrigger 
                value="points" 
                className="flex items-center justify-center gap-2 rounded-none data-[state=active]:text-white px-2 py-3"
                style={{
                  '--active-bg': 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                } as any}
                data-state={activeTab === 'points' ? 'active' : 'inactive'}
              >
                <Coins className="w-4 h-4 flex-shrink-0" />
                <span className="hidden md:inline text-sm">{t.user.pointHistoryTab}</span>
              </TabsTrigger>
              <TabsTrigger 
                value="games" 
                className="flex items-center justify-center gap-2 rounded-none data-[state=active]:text-white px-2 py-3"
                style={{
                  '--active-bg': 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                } as any}
                data-state={activeTab === 'games' ? 'active' : 'inactive'}
              >
                <Gamepad2 className="w-4 h-4 flex-shrink-0" />
                <span className="hidden md:inline text-sm">{t.user.bettingHistoryTab}</span>
              </TabsTrigger>
              <TabsTrigger 
                value="settings" 
                className="flex items-center justify-center gap-2 rounded-none data-[state=active]:text-white px-2 py-3"
                style={{
                  '--active-bg': 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                } as any}
                data-state={activeTab === 'settings' ? 'active' : 'inactive'}
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                <span className="hidden md:inline text-sm">{t.user.settingsTab}</span>
              </TabsTrigger>
            </TabsList>

            {/* 기본정보 탭 */}
            <TabsContent value="info">
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle style={{
                      background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}>{t.user.basicInfoTitle}</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-0 text-white"
                      style={{
                        background: 'rgba(193, 154, 107, 0.2)',
                        border: '1px solid rgba(193, 154, 107, 0.3)'
                      }}
                      onClick={() => {
                        if (isEditing) {
                          setEditableInfo({
                            nickname: user.nickname || '',
                            bank_name: user.bank_name || '',
                            bank_account: user.bank_account || '',
                            bank_holder: user.bank_holder || ''
                          });
                          setIsEditing(false);
                        } else {
                          setIsEditing(true);
                        }
                      }}
                    >
                      {isEditing ? (
                        <>
                          <X className="w-4 h-4 mr-2" />
                          {t.user.cancel}
                        </>
                      ) : (
                        <>
                          <Edit className="w-4 h-4 mr-2" />
                          {t.user.edit}
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label style={{ color: '#E6C9A8' }}>{t.user.userId}</Label>
                      <Input
                        value={user.username}
                        disabled
                        className="border-0 text-slate-400"
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(193, 154, 107, 0.2)'
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label style={{ color: '#E6C9A8' }}>{t.user.nickname}</Label>
                      <Input
                        value={editableInfo.nickname}
                        onChange={(e) => setEditableInfo(prev => ({ ...prev, nickname: e.target.value }))}
                        disabled={!isEditing}
                        className="border-0 text-white"
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(193, 154, 107, 0.2)'
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label style={{ color: '#E6C9A8' }}>{t.user.bankName}</Label>
                      <Select
                        value={editableInfo.bank_name}
                        onValueChange={(value) => setEditableInfo(prev => ({ ...prev, bank_name: value }))}
                        disabled={!isEditing}
                      >
                        <SelectTrigger className="border-0 text-white" style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(193, 154, 107, 0.2)'
                        }}>
                          <SelectValue placeholder={t.user.selectBank} />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {['KB국민은행', '신한은행', '우리은행', '하나은행', '농협은행', 'IBK기업은행'].map((bank) => (
                            <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label style={{ color: '#E6C9A8' }}>{t.user.accountNumber}</Label>
                      <Input
                        value={editableInfo.bank_account}
                        onChange={(e) => setEditableInfo(prev => ({ ...prev, bank_account: e.target.value }))}
                        disabled={!isEditing}
                        className="border-0 text-white"
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(193, 154, 107, 0.2)'
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label style={{ color: '#E6C9A8' }}>{t.user.accountHolder}</Label>
                      <Input
                        value={editableInfo.bank_holder}
                        onChange={(e) => setEditableInfo(prev => ({ ...prev, bank_holder: e.target.value }))}
                        disabled={!isEditing}
                        className="border-0 text-white"
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(193, 154, 107, 0.2)'
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label style={{ color: '#E6C9A8' }}>{t.user.vipGrade}</Label>
                      <div className="flex items-center gap-2">
                        <Badge className={`${vipBadge.color} text-white px-3 py-1`}>
                          <Crown className="w-4 h-4 mr-1" />
                          {vipBadge.label}
                        </Badge>
                        <span className="text-slate-400 text-sm">{t.user.level} {user.vip_level || 0}</span>
                      </div>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        onClick={handleUpdateInfo}
                        className="border-0 text-white"
                        style={{
                          background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                        }}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {t.user.save}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 입출금내역 탭 */}
            <TabsContent value="transactions">
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <CardHeader>
                  <CardTitle style={{
                    background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>{t.user.transactionHistory}</CardTitle>
                </CardHeader>
                <CardContent>
                  {transactions.length > 0 ? (
                    <div className="space-y-4">
                      {transactions.map((transaction) => {
                        const statusInfo = getStatusInfo(transaction.status);
                        const StatusIcon = statusInfo.icon;
                        const isDeposit = transaction.transaction_type === 'deposit';
                        
                        return (
                          <div key={transaction.id} className="p-4 border-0" style={{
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(193, 154, 107, 0.2)',
                            borderRadius: '8px'
                          }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {isDeposit ? (
                                  <ArrowUpRight className="w-6 h-6 text-green-400" />
                                ) : (
                                  <ArrowDownLeft className="w-6 h-6 text-blue-400" />
                                )}
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-white text-lg">
                                      {isDeposit ? t.user.deposit : t.user.withdrawal}
                                    </span>
                                    <Badge className={`${statusInfo.color} text-white text-sm`}>
                                      <StatusIcon className="w-4 h-4 mr-1" />
                                      {statusInfo.label}
                                    </Badge>
                                  </div>
                                  <div className="text-base text-slate-400">
                                    {formatDateTime(transaction.created_at)}
                                  </div>
                                  {transaction.bank_name && (
                                    <div className="text-base text-slate-500">
                                      {transaction.bank_name} {transaction.bank_account}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-xl font-bold ${isDeposit ? 'text-green-400' : 'text-blue-400'}`}>
                                  {isDeposit ? '+' : '-'}{t.common.currencySymbol}{formatCurrency(transaction.amount)}
                                </div>
                                <div className="text-base text-slate-400">
                                  {t.user.balance}: {t.common.currencySymbol}{formatCurrency(transaction.balance_after)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <CreditCard className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400">{t.user.noTransactionHistory}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 포인트내역 탭 */}
            <TabsContent value="points">
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle style={{
                      background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}>{t.user.pointHistory}</CardTitle>
                    {currentPoints > 0 && (
                      <Button
                        onClick={() => convertPointsToBalance(currentPoints)}
                        size="sm"
                        className="border-0 text-white"
                        style={{
                          background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                        }}
                      >
                        <Coins className="w-4 h-4 mr-2" />
                        전체 전환 ({formatCurrency(currentPoints)}P)
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {pointTransactions.length > 0 ? (
                    <div className="space-y-4">
                      {pointTransactions.map((transaction) => {
                        const isEarn = transaction.transaction_type === 'earn';
                        const isConvert = transaction.transaction_type === 'convert_to_balance';
                        
                        return (
                          <div key={transaction.id} className="p-4 border-0" style={{
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(193, 154, 107, 0.2)',
                            borderRadius: '8px'
                          }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Coins className={`w-6 h-6 ${isEarn ? 'text-yellow-400' : isConvert ? 'text-blue-400' : 'text-slate-400'}`} />
                                <div>
                                  <div className="font-medium text-white mb-1 text-lg">
                                    {transaction.transaction_type === 'earn' && '포인트 적립'}
                                    {transaction.transaction_type === 'use' && '포인트 사용'}
                                    {transaction.transaction_type === 'convert_to_balance' && '잔고 전환'}
                                    {transaction.transaction_type === 'admin_adjustment' && '관리자 조정'}
                                  </div>
                                  <div className="text-base text-slate-400">
                                    {formatDateTime(transaction.created_at)}
                                  </div>
                                  {transaction.memo && (
                                    <div className="text-base text-slate-500">
                                      {transaction.memo}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-xl font-bold ${isEarn ? 'text-yellow-400' : 'text-slate-400'}`}>
                                  {isEarn ? '+' : '-'}{formatCurrency(transaction.amount)}P
                                </div>
                                <div className="text-base text-slate-400">
                                  포인트: {formatCurrency(transaction.points_after)}P
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Coins className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400">포인트 내역이 없습니다</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 베팅내역 탭 */}
            <TabsContent value="games">
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <CardHeader>
                  <CardTitle style={{
                    background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>베팅 내역</CardTitle>
                </CardHeader>
                <CardContent>
                  {gameRecords.length > 0 ? (
                    <div className="space-y-4">
                      {gameRecords.map((record) => {
                        const betAmount = Math.abs(parseFloat(record.bet_amount)); // ✅ 베팅 금액은 양수로
                        const winAmount = parseFloat(record.win_amount) || 0;
                        // ✅ 손익 = 당첨금액 - 베팅금액
                        const profit = winAmount - betAmount;
                        const isWin = profit > 0;
                        
                        return (
                          <div key={record.id} className="p-4 border-0" style={{
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(193, 154, 107, 0.2)',
                            borderRadius: '8px'
                          }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Gamepad2 className="w-6 h-6" style={{ color: '#C19A6B' }} />
                                <div>
                                  <div className="font-medium text-white mb-1 text-lg">
                                    {record.game_title || '알 수 없는 게임'}
                                  </div>
                                  <div className="text-base text-slate-400">
                                    {formatDateTime(record.played_at)}
                                  </div>
                                  <div className="text-base text-slate-500">
                                    {record.provider_name || '제공사 정보 없음'}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-base text-slate-400 mb-1">
                                  베팅: {t.common.currencySymbol}{formatCurrency(betAmount)}
                                </div>
                                {winAmount > 0 && (
                                  <div className="text-base text-slate-400 mb-1">
                                    당첨: {t.common.currencySymbol}{formatCurrency(winAmount)}
                                  </div>
                                )}
                                <div className={`text-xl font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                                  {isWin ? '+' : ''}{t.common.currencySymbol}{formatCurrency(profit)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Gamepad2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400">베팅 내역이 없습니다</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 설정 탭 */}
            <TabsContent value="settings">
              <Card className="border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <CardHeader>
                  <CardTitle style={{
                    background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>계정 설정</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start border-0 text-white" style={{
                        background: 'rgba(193, 154, 107, 0.2)',
                        border: '1px solid rgba(193, 154, 107, 0.3)'
                      }}>
                        <Settings className="w-4 h-4 mr-2" />
                        비밀번호 변경
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="border-0 text-white" style={{
                      background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                      border: '1px solid rgba(193, 154, 107, 0.3)'
                    }}>
                      <DialogHeader>
                        <DialogTitle style={{
                          background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}>비밀번호 변경</DialogTitle>
                        <DialogDescription className="text-slate-400">
                          현재 비밀번호를 확인하고 새로운 비밀번호로 변경하세요.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label style={{ color: '#E6C9A8' }}>현재 비밀번호</Label>
                          <Input
                            type="password"
                            value={passwordChange.currentPassword}
                            onChange={(e) => setPasswordChange(prev => ({ ...prev, currentPassword: e.target.value }))}
                            className="border-0 text-white"
                            style={{
                              background: 'rgba(0, 0, 0, 0.3)',
                              border: '1px solid rgba(193, 154, 107, 0.2)'
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label style={{ color: '#E6C9A8' }}>새 비밀번호</Label>
                          <Input
                            type="password"
                            value={passwordChange.newPassword}
                            onChange={(e) => setPasswordChange(prev => ({ ...prev, newPassword: e.target.value }))}
                            className="border-0 text-white"
                            style={{
                              background: 'rgba(0, 0, 0, 0.3)',
                              border: '1px solid rgba(193, 154, 107, 0.2)'
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label style={{ color: '#E6C9A8' }}>새 비밀번호 확인</Label>
                          <Input
                            type="password"
                            value={passwordChange.confirmPassword}
                            onChange={(e) => setPasswordChange(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            className="border-0 text-white"
                            style={{
                              background: 'rgba(0, 0, 0, 0.3)',
                              border: '1px solid rgba(193, 154, 107, 0.2)'
                            }}
                          />
                        </div>
                        <Alert className="border-0" style={{
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.3)'
                        }}>
                          <AlertDescription className="text-yellow-300">
                            비밀번호는 6자리 이상이어야 합니다.
                          </AlertDescription>
                        </Alert>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setShowPasswordDialog(false)}
                            className="flex-1 border-0 text-white"
                            style={{
                              background: 'rgba(0, 0, 0, 0.5)',
                              border: '1px solid rgba(193, 154, 107, 0.3)'
                            }}
                          >
                            취소
                          </Button>
                          <Button
                            onClick={handlePasswordChange}
                            className="flex-1 border-0 text-white"
                            style={{
                              background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)'
                            }}
                            disabled={!passwordChange.currentPassword || !passwordChange.newPassword || !passwordChange.confirmPassword}
                          >
                            변경
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* 포인트 전환 확인 다이얼로그 */}
          <Dialog open={showPointConvertDialog} onOpenChange={setShowPointConvertDialog}>
            <DialogContent className="bg-slate-800 border-slate-700 text-white">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-yellow-400" />
                  포인트 → 보유금 전환
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  보유하신 포인트를 보유금으로 전환합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-4 bg-slate-700/30 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400 mb-2">
                      {formatCurrency(currentPoints)}P
                    </div>
                    <div className="text-sm text-slate-400 mb-4">
                      전환할 포인트
                    </div>
                    <div className="text-lg font-bold text-green-400">
                      {t.common.currencySymbol}{formatCurrency(currentPoints)}
                    </div>
                    <div className="text-sm text-slate-400">
                      전환 후 추가될 보유금
                    </div>
                  </div>
                </div>
                
                <Alert className="border-blue-600 bg-blue-900/20">
                  <AlertDescription className="text-blue-300">
                    포인트를 보유금으로 전환하면 되돌릴 수 없습니다. 전환하시겠습니까?
                  </AlertDescription>
                </Alert>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowPointConvertDialog(false)}
                    className="flex-1"
                  >
                    취소
                  </Button>
                  <Button
                    onClick={() => {
                      convertPointsToBalance(currentPoints);
                      setShowPointConvertDialog(false);
                    }}
                    className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                  >
                    <ArrowUpRight className="w-4 h-4 mr-2" />
                    전환하기
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}