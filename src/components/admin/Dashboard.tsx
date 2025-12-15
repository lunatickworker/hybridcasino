import { useState, useEffect } from "react";
import { Badge } from "../ui/badge";
import { MetricCard } from "./MetricCard";
import { PremiumSectionCard, SectionRow } from "./PremiumSectionCard";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { useBalance } from "../../contexts/BalanceContext";
// import { getInfo } from "../../lib/investApi"; // ❌ 사용 중지
import { getAgentBalance, getOroPlayToken } from "../../lib/oroplayApi";
import { 
  Users, Wallet, TrendingUp, TrendingDown,
  Activity, DollarSign, AlertCircle, Clock, Shield,
  Target, Zap, BarChart3, MessageSquare
} from "lucide-react";
import { formatCurrency as formatCurrencyUtil, formatNumber, getPartnerLevelText } from "../../lib/utils";
import { DashboardStats, Partner } from "../../types";
import { calculatePendingDeposits } from "../../lib/settlementCalculator";
import { useLanguage } from "../../contexts/LanguageContext";
import { getCurrentTimeFormatted } from "../../lib/timezoneHelper";

interface DashboardProps {
  user: Partner;
}

export function Dashboard({ user }: DashboardProps) {
  // ✅ 전역 balance 사용 (AdminHeader와 동일한 상태 공유)
  const { balance, investBalance, oroplayBalance } = useBalance();
  const { t, formatCurrency } = useLanguage();
  
  const [stats, setStats] = useState<DashboardStats>({
    total_users: 0,
    total_balance: 0,
    daily_deposit: 0,
    daily_withdrawal: 0,
    daily_net_deposit: 0,
    casino_betting: 0,
    slot_betting: 0,
    total_betting: 0,
    online_users: 0,
    pending_approvals: 0,
    pending_messages: 0,
    pending_deposits: 0,
    pending_withdrawals: 0,
  });
  
  // 직속 회원 통계
  const [directStats, setDirectStats] = useState({
    deposit: 0,
    withdrawal: 0,
    netDeposit: 0,
    casinoBetting: 0,
    slotBetting: 0,
    totalBetting: 0,
    betAmount: 0, // 게임 베팅액
    winAmount: 0, // 게임 당첨액
    gameProfit: 0 // 게임 손익 (베팅 - 당첨)
  });
  
  // 하위 파트너 회원 통계
  const [subPartnerStats, setSubPartnerStats] = useState({
    deposit: 0,
    withdrawal: 0,
    netDeposit: 0,
    casinoBetting: 0,
    slotBetting: 0,
    totalBetting: 0,
    betAmount: 0, // 게임 베팅액
    winAmount: 0, // 게임 당첨액
    gameProfit: 0 // 게임 손익 (베팅 - 당첨)
  });
  const [pendingDeposits, setPendingDeposits] = useState(0); // 만충금 (pending deposits)
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [formattedTime, setFormattedTime] = useState<string>('');
  const [isSyncingInvest, setIsSyncingInvest] = useState(false);
  const [isSyncingOroplay, setIsSyncingOroplay] = useState(false);

  // ✅ balance가 변경되면 stats 업데이트
  useEffect(() => {
    setStats(prev => ({ ...prev, total_balance: balance }));
  }, [balance]);

  // =====================================================
  // Invest 보유금 수동 동기화 (카드 클릭 시) - ❌ 비활성화
  // =====================================================
  const handleSyncInvestBalance = async () => {
    // ❌ getInfo API 사용 중지로 인해 비활성화
    console.log('⚠️ Invest 수동 동기화 기능은 현재 비활성화되어 있습니다.');
    return;
  };

  // =====================================================
  // OroPlay 보유금 수동 동기화 (카드 클릭 시)
  // =====================================================
  const handleSyncOroplayBalance = async () => {
    if (user.level !== 1) {
      toast.error('Lv1 시스템관리자만 API 잔고를 조회할 수 있습니다.');
      return;
    }

    setIsSyncingOroplay(true);
    try {
      console.log('💰 [Dashboard] OroPlay 보유금 수동 동기화 시작');

      // 토큰 조회 (자동 갱신 포함)
      const token = await getOroPlayToken(user.id);

      // GET /agent/balance 호출
      const balance = await getAgentBalance(token);

      console.log('✅ [Dashboard] OroPlay API 응답:', { balance });

      // api_configs 업데이트 (새 구조: api_provider='oroplay' 필터 추가)
      const { error: updateError } = await supabase
        .from('api_configs')
        .update({
          balance: balance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', user.id)
        .eq('api_provider', 'oroplay');

      if (updateError) {
        throw new Error(`DB 업데이트 실패: ${updateError.message}`);
      }

      toast.success(`OroPlay 보유금 동기화 완료: ${formatCurrency(balance)}`);
    } catch (error: any) {
      console.error('❌ [Dashboard] OroPlay 보유금 동기화 실패:', error);
      toast.error(`OroPlay 보유금 동기화 실패: ${error.message}`);
    } finally {
      setIsSyncingOroplay(false);
    }
  };

  // 사용자 정보가 없으면 로딩 표시
  if (!user || typeof user.level !== 'number') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="loading-premium mx-auto"></div>
          <p className="text-muted-foreground">{t.dashboard.loadingDashboard}</p>
        </div>
      </div>
    );
  }



  // ✅ 실제 데이터 기반 대시보드 통계 가져오기 (Guidelines 준수)
  const loadDashboardStats = async () => {
    setIsLoadingStats(true);
    
    try {
      // ✅ 실제 DB 데이터 직접 확인 (디버깅)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 1. transactions 테이블 직접 조회
      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('transaction_type, status, amount, created_at')
        .gte('created_at', today.toISOString());
      
      if (transData && transData.length > 0) {
        // 입금 계산
        const deposits = transData
          .filter(t => 
            (t.transaction_type === 'deposit' && ['approved', 'completed'].includes(t.status)) ||
            (t.transaction_type === 'admin_adjustment' && t.amount > 0 && ['approved', 'completed'].includes(t.status))
          )
          .reduce((sum, t) => sum + Number(t.amount), 0);
        
        // 출금 계산
        const withdrawals = transData
          .filter(t => 
            (t.transaction_type === 'withdrawal' && ['approved', 'completed'].includes(t.status)) ||
            (t.transaction_type === 'admin_adjustment' && t.amount < 0 && ['approved', 'completed'].includes(t.status))
          )
          .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
      }
      
      // 2. game_records 테이블 직접 조회
      const { data: gameData, error: gameError } = await supabase
        .from('game_records')
        .select('provider_id, bet_amount, win_amount, played_at')
        .gte('played_at', today.toISOString());
      
      if (gameData && gameData.length > 0) {
        // 카지노/슬롯 계산
        const casinoProviders = [410, 77, 2, 30, 78, 86, 11, 28, 89, 91, 44, 85, 0];
        const casino = gameData
          .filter(g => casinoProviders.includes(Number(g.provider_id)))
          .reduce((sum, g) => sum + Number(g.bet_amount), 0);
        
        const slot = gameData
          .filter(g => !casinoProviders.includes(Number(g.provider_id)))
          .reduce((sum, g) => sum + Number(g.bet_amount), 0);
      }
      
      // 오늘 날짜 (UTC 기준 오늘 00:00:00)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayStartISO = todayStart.toISOString();
      
      // ✅ 권한별 하위 파트너 ID 목록 조회
      let allowedPartnerIds: string[] = [];
      
      if (user.level === 1) {
        // 시스템관리자: 모든 파트너
        const { data: allPartners } = await supabase
          .from('partners')
          .select('id');
        allowedPartnerIds = allPartners?.map(p => p.id) || [];
      } else {
        // 하위 파트너만 (자신 포함)
        allowedPartnerIds = [user.id];
        
        // 1단계 하위
        const { data: level1 } = await supabase
          .from('partners')
          .select('id')
          .eq('parent_id', user.id);
        
        const level1Ids = level1?.map(p => p.id) || [];
        allowedPartnerIds.push(...level1Ids);
        
        if (level1Ids.length > 0) {
          // 2단계 하위
          const { data: level2 } = await supabase
            .from('partners')
            .select('id')
            .in('parent_id', level1Ids);
          
          const level2Ids = level2?.map(p => p.id) || [];
          allowedPartnerIds.push(...level2Ids);
          
          if (level2Ids.length > 0) {
            // 3단계 하위
            const { data: level3 } = await supabase
              .from('partners')
              .select('id')
              .in('parent_id', level2Ids);
            
            const level3Ids = level3?.map(p => p.id) || [];
            allowedPartnerIds.push(...level3Ids);
            
            if (level3Ids.length > 0) {
              // 4단계 하위
              const { data: level4 } = await supabase
                .from('partners')
                .select('id')
                .in('parent_id', level3Ids);
              
              const level4Ids = level4?.map(p => p.id) || [];
              allowedPartnerIds.push(...level4Ids);
              
              if (level4Ids.length > 0) {
                // 5단계 하위
                const { data: level5 } = await supabase
                  .from('partners')
                  .select('id')
                  .in('parent_id', level4Ids);
                
                const level5Ids = level5?.map(p => p.id) || [];
                allowedPartnerIds.push(...level5Ids);
              }
            }
          }
        }
      }
      
      // ✅ 직속 회원 ID 목록 (referrer_id = user.id)
      let directUserIds: string[] = [];
      const { data: directUsersData } = await supabase
        .from('users')
        .select('id')
        .eq('referrer_id', user.id);
      
      directUserIds = directUsersData?.map(u => u.id) || [];
      
      // ✅ 하위 파트너 회원 ID 목록 (referrer_id가 하위 파트너들)
      let subPartnerUserIds: string[] = [];
      const subPartnerIds = allowedPartnerIds.filter(id => id !== user.id);
      
      if (subPartnerIds.length > 0) {
        const { data: subUsersData } = await supabase
          .from('users')
          .select('id')
          .in('referrer_id', subPartnerIds);
        
        subPartnerUserIds = subUsersData?.map(u => u.id) || [];
      }

      // 1️⃣ 직속 회원 입금
      let directDeposit = 0;
      if (directUserIds.length > 0) {
        const { data: depositData } = await supabase
          .from('transactions')
          .select('amount, created_at')
          .in('transaction_type', ['deposit', 'admin_deposit'])
          .in('status', ['approved', 'completed'])
          .in('user_id', directUserIds)
          .gte('created_at', todayStartISO);
        
        directDeposit = depositData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      }

      // 2️⃣ 직속 회원 출금
      let directWithdrawal = 0;
      if (directUserIds.length > 0) {
        const { data: withdrawalData } = await supabase
          .from('transactions')
          .select('amount, created_at')
          .in('transaction_type', ['withdrawal', 'admin_withdrawal'])
          .in('status', ['approved', 'completed'])
          .in('user_id', directUserIds)
          .gte('created_at', todayStartISO);
        
        directWithdrawal = withdrawalData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      }

      // 3️⃣ 하위 파트너 회원 입금
      let subPartnerDeposit = 0;
      if (subPartnerUserIds.length > 0) {
        const { data: depositData } = await supabase
          .from('transactions')
          .select('amount, created_at')
          .in('transaction_type', ['deposit', 'admin_deposit'])
          .in('status', ['approved', 'completed'])
          .in('user_id', subPartnerUserIds)
          .gte('created_at', todayStartISO);
        
        subPartnerDeposit = depositData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      }

      // 4️⃣ 하위 파트너 회원 출금
      let subPartnerWithdrawal = 0;
      if (subPartnerUserIds.length > 0) {
        const { data: withdrawalData } = await supabase
          .from('transactions')
          .select('amount, created_at')
          .in('transaction_type', ['withdrawal', 'admin_withdrawal'])
          .in('status', ['approved', 'completed'])
          .in('user_id', subPartnerUserIds)
          .gte('created_at', todayStartISO);
        
        subPartnerWithdrawal = withdrawalData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      }

      // 3️⃣ 사용자 수
      let totalUsers = 0;
      
      if (allowedPartnerIds.length > 0) {
        const { count } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .in('referrer_id', allowedPartnerIds);
        
        totalUsers = count || 0;
      }

      // 4️⃣ 온라인 사용자 수 - users 테이블에서 is_online=true인 회원 카운트
      let onlineCount = 0;
      
      if (allowedPartnerIds.length > 0) {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('is_online', true)
          .in('referrer_id', allowedPartnerIds);
        
        onlineCount = count || 0;
      }

      // 5️⃣ 만충금 조회 (직속 + 하위 파트너 회원) - ✅ 통합 모듈 사용
      const allUserIds = [...directUserIds, ...subPartnerUserIds];
      const pendingDepositAmount = await calculatePendingDeposits(
        allUserIds,
        todayStartISO,
        new Date().toISOString()
      );
      
      // 6️⃣ 직속 회원 베팅 통계 + 게임 손익
      let directCasinoBetting = 0;
      let directSlotBetting = 0;
      let directBetAmount = 0; // 총 베팅액 (파트너 수입)
      let directWinAmount = 0; // 총 당첨액 (파트너 지출)
      
      if (directUserIds.length > 0) {
        const { data: bettingData } = await supabase
          .from('game_records')
          .select('provider_id, bet_amount, win_amount')
          .in('user_id', directUserIds)
          .gte('played_at', todayStartISO);

        if (bettingData && bettingData.length > 0) {
          const casinoProviders = [410, 77, 2, 30, 78, 86, 11, 28, 89, 91, 44, 85, 0];
          directCasinoBetting = bettingData
            .filter(b => casinoProviders.includes(Number(b.provider_id)))
            .reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          directSlotBetting = bettingData
            .filter(b => !casinoProviders.includes(Number(b.provider_id)))
            .reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          
          // 게임 손익 계산
          directBetAmount = bettingData.reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          directWinAmount = bettingData.reduce((sum, b) => sum + Number(b.win_amount || 0), 0);
        }
      }

      // 7️⃣ 하위 파트너 회원 베팅 통계 + 게임 손익
      let subPartnerCasinoBetting = 0;
      let subPartnerSlotBetting = 0;
      let subPartnerBetAmount = 0; // 총 베팅액 (파트너 수입)
      let subPartnerWinAmount = 0; // 총 당첨액 (파트너 지출)
      
      if (subPartnerUserIds.length > 0) {
        const { data: bettingData } = await supabase
          .from('game_records')
          .select('provider_id, bet_amount, win_amount')
          .in('user_id', subPartnerUserIds)
          .gte('played_at', todayStartISO);

        if (bettingData && bettingData.length > 0) {
          const casinoProviders = [410, 77, 2, 30, 78, 86, 11, 28, 89, 91, 44, 85, 0];
          subPartnerCasinoBetting = bettingData
            .filter(b => casinoProviders.includes(Number(b.provider_id)))
            .reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          subPartnerSlotBetting = bettingData
            .filter(b => !casinoProviders.includes(Number(b.provider_id)))
            .reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          
          // 게임 손익 계산
          subPartnerBetAmount = bettingData.reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          subPartnerWinAmount = bettingData.reduce((sum, b) => sum + Number(b.win_amount || 0), 0);
        }
      }
      
      // ✅ 통합 정산: 실제 입출금 + 게임 손익
      // - 입금 = 실제 입금 + 베팅액 (사용자가 베팅 = 파트너가 받음)
      // - 출금 = 실제 출금 + 당첨액 (사용자가 당첨 = 파트너가 지급)
      const totalDeposit = directDeposit + subPartnerDeposit;
      const totalWithdrawal = directWithdrawal + subPartnerWithdrawal;
      
      setStats(prev => ({
        ...prev,
        total_users: totalUsers || 0,
        daily_deposit: totalDeposit,
        daily_withdrawal: totalWithdrawal,
        daily_net_deposit: totalDeposit - totalWithdrawal,
        online_users: onlineCount || 0,
        casino_betting: directCasinoBetting + subPartnerCasinoBetting,
        slot_betting: directSlotBetting + subPartnerSlotBetting,
        total_betting: directCasinoBetting + directSlotBetting + subPartnerCasinoBetting + subPartnerSlotBetting,
        pending_approvals: 0,
        pending_messages: 0,
        pending_deposits: 0,
        pending_withdrawals: 0,
      }));
      
      setDirectStats({
        deposit: directDeposit, // ✅ 실제 입금만
        withdrawal: directWithdrawal, // ✅ 실제 출금만
        netDeposit: directDeposit - directWithdrawal, // ✅ 순입출금
        casinoBetting: directCasinoBetting,
        slotBetting: directSlotBetting,
        totalBetting: directCasinoBetting + directSlotBetting,
        betAmount: directBetAmount, // 게임 베팅액
        winAmount: directWinAmount, // 게임 당첨액
        gameProfit: directBetAmount - directWinAmount // 게임 손익
      });
      
      setSubPartnerStats({
        deposit: subPartnerDeposit, // ✅ 실제 입금만
        withdrawal: subPartnerWithdrawal, // ✅ 실제 출금만
        netDeposit: subPartnerDeposit - subPartnerWithdrawal, // ✅ 순입출금
        casinoBetting: subPartnerCasinoBetting,
        slotBetting: subPartnerSlotBetting,
        totalBetting: subPartnerCasinoBetting + subPartnerSlotBetting,
        betAmount: subPartnerBetAmount, // 게임 베팅액
        winAmount: subPartnerWinAmount, // 게임 당첨액
        gameProfit: subPartnerBetAmount - subPartnerWinAmount // 게임 손익
      });
      
      setPendingDeposits(pendingDepositAmount);
      
      setIsLoadingStats(false);
    } catch (error: any) {
      console.error('❌ [Dashboard] 통계 로드 실패:', error);
      toast.error(`통계 로드 실패: ${error.message}`);
      setIsLoadingStats(false);
    }
  };

  // 컴포넌트 마운트 시 통계 데이터 로드
  useEffect(() => {
    loadDashboardStats();
  }, []);

  // 실시간 시간 업데이트
  useEffect(() => {
    // ✅ 파트너 타임존 기준 시간 포맷팅
    const updateTime = async () => {
      const formatted = await getCurrentTimeFormatted(user.id, user.level);
      setFormattedTime(formatted);
    };

    // 초기 시간 설정
    updateTime();

    // 1초마다 시간 업데이트
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      updateTime();
    }, 1000);

    return () => clearInterval(timer);
  }, [user.id, user.level]);

  // ✅ Realtime 구독: 모든 테이블 변경 시 즉시 업데이트 (이벤트 발생 업데이트)
  useEffect(() => {
    console.log('🔔 대시보드 Realtime 구독 시작:', user.id);
    
    // 1. transactions 테이블 변경 감지 (입출금)
    const transactionChannel = supabase
      .channel('dashboard_transactions')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모두 감지
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          console.log('💰 [대시보드] transactions 변경 감지:', payload.eventType);
          loadDashboardStats(); // 즉시 갱신
        }
      )
      .subscribe();

    // 2. partners 테이블 변경 감지 (보유금)
    const partnerChannel = supabase
      .channel('dashboard_partners')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'partners',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          console.log('💰 [대시보드] partners 보유금 변경 감지:', payload.new);
          loadDashboardStats(); // 즉시 갱신
        }
      )
      .subscribe();

    // 3. game_records 테이블 변경 감지 (베팅)
    const gameRecordChannel = supabase
      .channel('dashboard_game_records')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_records'
        },
        (payload) => {
          console.log('🎮 [대시보드] game_records 변경 감지:', payload.eventType);
          loadDashboardStats(); // 즉시 갱신
        }
      )
      .subscribe();

    // 4. users 테이블 변경 감지 (회원 보유금)
    const usersChannel = supabase
      .channel('dashboard_users')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users'
        },
        (payload) => {
          console.log('👤 [대시보드] users 변경 감지:', payload.eventType);
          loadDashboardStats(); // 즉시 갱신
        }
      )
      .subscribe();

    return () => {
      console.log('🔕 대시보드 Realtime 구독 해제');
      supabase.removeChannel(transactionChannel);
      supabase.removeChannel(partnerChannel);
      supabase.removeChannel(gameRecordChannel);
      supabase.removeChannel(usersChannel);
    };
  }, [user.id]);



  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">
            {t.dashboard.adminDashboard}
          </h1>
          <p className="text-sm text-slate-400">
            {getPartnerLevelText(user.level)} · {user.nickname}{t.dashboard.realtimeStatus}
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5 text-xs badge-premium-primary">
          <Clock className="h-3.5 w-3.5" />
          {formattedTime}
        </Badge>
      </div>

      {/* 상단 주요 지표 - 모든 레벨 동일하게 표시 */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t.dashboard.totalUsers}
          value={formatNumber(stats.total_users)}
          subtitle={`↑ ${t.dashboard.registeredUsers}`}
          icon={Users}
          color="blue"
        />
        
        <MetricCard
          title={t.dashboard.todayNetRevenue}
          value={formatCurrency(stats.daily_net_deposit)}
          subtitle={stats.daily_net_deposit >= 0 ? `↑ ${t.dashboard.profitToday}` : `↓ ${t.dashboard.lossToday}`}
          icon={Activity}
          color={stats.daily_net_deposit >= 0 ? "green" : "pink"}
        />
        
        <MetricCard
          title={t.dashboard.todayTotalBetting}
          value={formatCurrency(stats.total_betting)}
          subtitle={`↑ ${t.dashboard.customerActivity}`}
          icon={Target}
          color="purple"
        />
        
        <MetricCard
          title={t.dashboard.pendingCharges}
          value={formatCurrency(pendingDeposits)}
          subtitle={`↑ ${t.dashboard.pendingChargesDesc}`}
          icon={DollarSign}
          color="orange"
        />
      </div>
      
      {/* 하단 4열 섹션 - 자신 직속 / 하위파트너 구분 */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* 자신의 사용자 입출금 현황 */}
        <PremiumSectionCard
          title={t.dashboard.directUserTransactions}
          icon={TrendingUp}
          iconColor="text-cyan-400"
        >
          <SectionRow
            label={t.dashboard.dailyDeposit}
            value={formatCurrency(directStats.deposit)}
            valueColor="text-cyan-400"
            icon={TrendingUp}
            iconColor="text-cyan-400"
          />
          <SectionRow
            label={t.dashboard.dailyWithdrawal}
            value={formatCurrency(directStats.withdrawal)}
            valueColor="text-rose-400"
            icon={TrendingDown}
            iconColor="text-rose-400"
          />
          <SectionRow
            label={t.dashboard.dailyNetDeposit}
            value={formatCurrency(directStats.netDeposit)}
            valueColor="text-cyan-400"
            icon={DollarSign}
            iconColor="text-cyan-400"
          />
        </PremiumSectionCard>

        {/* 자신의 사용자 베팅 현황 */}
        <PremiumSectionCard
          title={t.dashboard.directUserBetting}
          icon={Zap}
          iconColor="text-amber-400"
        >
          <SectionRow
            label={t.dashboard.casinoTotalBetting}
            value={formatCurrency(directStats.casinoBetting)}
            valueColor="text-cyan-400"
            icon={Target}
            iconColor="text-cyan-400"
          />
          <SectionRow
            label={t.dashboard.slotTotalBetting}
            value={formatCurrency(directStats.slotBetting)}
            valueColor="text-amber-400"
            icon={Zap}
            iconColor="text-amber-400"
          />
          <SectionRow
            label={t.dashboard.totalBetting}
            value={formatCurrency(directStats.totalBetting)}
            valueColor="text-cyan-400"
            icon={BarChart3}
            iconColor="text-cyan-400"
          />
        </PremiumSectionCard>

        {/* 하위 파트너 사용자 입출금 현황 */}
        <PremiumSectionCard
          title={t.dashboard.subPartnerTransactions}
          icon={TrendingUp}
          iconColor="text-purple-400"
        >
          <SectionRow
            label={t.dashboard.dailyDeposit}
            value={formatCurrency(subPartnerStats.deposit)}
            valueColor="text-cyan-400"
            icon={TrendingUp}
            iconColor="text-cyan-400"
          />
          <SectionRow
            label={t.dashboard.dailyWithdrawal}
            value={formatCurrency(subPartnerStats.withdrawal)}
            valueColor="text-rose-400"
            icon={TrendingDown}
            iconColor="text-rose-400"
          />
          <SectionRow
            label={t.dashboard.dailyNetDeposit}
            value={formatCurrency(subPartnerStats.netDeposit)}
            valueColor="text-cyan-400"
            icon={DollarSign}
            iconColor="text-cyan-400"
          />
        </PremiumSectionCard>

        {/* 하위 파트너 사용자 베팅 현황 */}
        <PremiumSectionCard
          title={t.dashboard.subPartnerBetting}
          icon={Zap}
          iconColor="text-green-400"
        >
          <SectionRow
            label={t.dashboard.casinoTotalBetting}
            value={formatCurrency(subPartnerStats.casinoBetting)}
            valueColor="text-cyan-400"
            icon={Target}
            iconColor="text-cyan-400"
          />
          <SectionRow
            label={t.dashboard.slotTotalBetting}
            value={formatCurrency(subPartnerStats.slotBetting)}
            valueColor="text-amber-400"
            icon={Zap}
            iconColor="text-amber-400"
          />
          <SectionRow
            label={t.dashboard.totalBetting}
            value={formatCurrency(subPartnerStats.totalBetting)}
            valueColor="text-cyan-400"
            icon={BarChart3}
            iconColor="text-cyan-400"
          />
        </PremiumSectionCard>
      </div>

      {/* 통합 정산 섹션 */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* 자신의 사용자 통합 정산 */}
        <PremiumSectionCard
          title="자신의 사용자 통합 정산"
          icon={Activity}
          iconColor="text-emerald-400"
        >
          <SectionRow
            label="실제 입출금 순액"
            value={formatCurrency(directStats.netDeposit)}
            valueColor={directStats.netDeposit >= 0 ? "text-cyan-400" : "text-rose-400"}
            icon={DollarSign}
            iconColor="text-cyan-400"
          />
          <SectionRow
            label="게임 손익 (베팅-당첨)"
            value={formatCurrency(directStats.gameProfit)}
            valueColor={directStats.gameProfit >= 0 ? "text-emerald-400" : "text-rose-400"}
            icon={Target}
            iconColor="text-emerald-400"
          />
          <div className="pt-2 border-t border-slate-700/50">
            <SectionRow
              label="최종 정산 금액"
              value={formatCurrency(directStats.netDeposit + directStats.gameProfit)}
              valueColor={
                (directStats.netDeposit + directStats.gameProfit) >= 0 
                  ? "text-emerald-400" 
                  : "text-rose-400"
              }
              icon={Activity}
              iconColor="text-emerald-400"
            />
          </div>
        </PremiumSectionCard>

        {/* 하위 파트너 사용자 통합 정산 */}
        <PremiumSectionCard
          title="하위 파트너 사용자 통합 정산"
          icon={Activity}
          iconColor="text-violet-400"
        >
          <SectionRow
            label="실제 입출금 순액"
            value={formatCurrency(subPartnerStats.netDeposit)}
            valueColor={subPartnerStats.netDeposit >= 0 ? "text-cyan-400" : "text-rose-400"}
            icon={DollarSign}
            iconColor="text-cyan-400"
          />
          <SectionRow
            label="게임 손익 (베팅-당첨)"
            value={formatCurrency(subPartnerStats.gameProfit)}
            valueColor={subPartnerStats.gameProfit >= 0 ? "text-emerald-400" : "text-rose-400"}
            icon={Target}
            iconColor="text-violet-400"
          />
          <div className="pt-2 border-t border-slate-700/50">
            <SectionRow
              label="최종 정산 금액"
              value={formatCurrency(subPartnerStats.netDeposit + subPartnerStats.gameProfit)}
              valueColor={
                (subPartnerStats.netDeposit + subPartnerStats.gameProfit) >= 0 
                  ? "text-emerald-400" 
                  : "text-rose-400"
              }
              icon={Activity}
              iconColor="text-violet-400"
            />
          </div>
        </PremiumSectionCard>
      </div>

      {/* 모든 Frontend 바로가기 (작은 버튼) */}
      {user.level === 1 && (
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              // Figma Make 환경에서는 같은 창에서 해시 변경
              window.location.hash = '/user/casino';
            }}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg text-sm transition-all duration-200 shadow-md hover:shadow-lg"
          >
            🎰 User Page
          </button>
          <button
            onClick={() => {
              window.location.hash = '/sample1/casino';
            }}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg text-sm transition-all duration-200 shadow-md hover:shadow-lg"
          >
            🎮 Sample1 Page
          </button>
          <button
            onClick={() => {
              window.location.hash = '/indo/casino';
            }}
            className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg text-sm transition-all duration-200 shadow-md hover:shadow-lg"
          >
            🌏 Indo Page
          </button>
        </div>
      )}
    </div>
  );
}

// Default export 추가
export default Dashboard;