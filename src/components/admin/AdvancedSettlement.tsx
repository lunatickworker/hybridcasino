import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, TrendingUp, TrendingDown, DollarSign, Wallet, AlertCircle } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Button } from "../ui/button";
import { MetricCard } from "./MetricCard";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";
import { ko } from "date-fns/locale";

interface AdvancedSettlementProps {
  user: Partner;
}

interface DailySettlementRow {
  date: string;
  deposit: number;
  withdrawal: number;
  adminDeposit: number;
  adminWithdrawal: number;
  pointGiven: number;
  pointRecovered: number;
  depositWithdrawalDiff: number;
  casinoBet: number;
  casinoWin: number;
  casinoWinLoss: number;
  slotBet: number;
  slotWin: number;
  slotWinLoss: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  casinoRolling: number;
  slotRolling: number;
  totalRolling: number;
  settlementProfit: number;
  actualSettlementProfit: number;
}

interface SummaryStats {
  totalDeposit: number;
  totalWithdrawal: number;
  adminTotalDeposit: number;
  adminTotalWithdrawal: number;
  pointGiven: number;
  pointRecovered: number;
  depositWithdrawalDiff: number;
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  totalRolling: number;
  totalSettlementProfit: number;
  totalActualSettlementProfit: number;
}

export default function AdvancedSettlement({ user }: AdvancedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [data, setData] = useState<DailySettlementRow[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({
    totalDeposit: 0,
    totalWithdrawal: 0,
    adminTotalDeposit: 0,
    adminTotalWithdrawal: 0,
    pointGiven: 0,
    pointRecovered: 0,
    depositWithdrawalDiff: 0,
    casinoBet: 0,
    casinoWin: 0,
    slotBet: 0,
    slotWin: 0,
    totalBet: 0,
    totalWin: 0,
    totalWinLoss: 0,
    totalRolling: 0,
    totalSettlementProfit: 0,
    totalActualSettlementProfit: 0
  });

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      console.log('🔍 [일일정산] 데이터 조회 시작', {
        dateRange: {
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString()
        },
        user: { id: user.id, username: user.username, level: user.level }
      });

      // 1. 본인의 하위 파트너 및 회원 ID 목록 조회
      let allowedPartnerIds: string[] = [user.id];
      let allowedUserIds: string[] = [];

      // 하위 파트너 조회 (재귀적으로 모든 하위)
      const descendantPartnerIds = await getDescendantPartnerIds(user.id);
      allowedPartnerIds.push(...descendantPartnerIds);
      console.log('✅ 허용된 파트너:', allowedPartnerIds.length, '개');

      // 모든 허용된 파트너들의 직속 회원 조회
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id')
        .in('referrer_id', allowedPartnerIds);

      if (usersError) throw usersError;
      allowedUserIds = users?.map(u => u.id) || [];
      console.log('✅ 허용된 회원:', allowedUserIds.length, '개');

      // ⚠️ 허용된 회원이 없으면 빈 배열 반환
      if (allowedUserIds.length === 0) {
        console.log('⚠️ 허용된 회원이 없어 정산 데이터가 없습니다.');
        setData([]);
        calculateSummary([]);
        setLoading(false);
        return;
      }

      // 2. 기간 내 거래 데이터 조회
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .in('user_id', allowedUserIds);

      if (transError) throw transError;
      console.log('✅ 거래 데이터:', transactions?.length || 0, '개');

      const { data: pointTransactions, error: pointError } = await supabase
        .from('point_transactions')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .in('user_id', allowedUserIds);

      if (pointError) throw pointError;
      console.log('✅ 포인트 거래:', pointTransactions?.length || 0, '개');

      const { data: gameRecords, error: gameError } = await supabase
        .from('game_records')
        .select('*')
        .gte('played_at', dateRange.from.toISOString())
        .lte('played_at', dateRange.to.toISOString())
        .in('user_id', allowedUserIds);

      if (gameError) throw gameError;
      console.log('✅ 게임 기록:', gameRecords?.length || 0, '개');

      // 3. 본인 커미션 정보 조회
      const myCommission = {
        casinoRolling: user.casino_rolling_commission || 0,
        casinoLosing: user.casino_losing_commission || 0,
        slotRolling: user.slot_rolling_commission || 0,
        slotLosing: user.slot_losing_commission || 0
      };

      // 4. 날짜별 데이터 집계
      const rows = await processDailySettlementData(
        dateRange.from,
        dateRange.to,
        transactions || [],
        pointTransactions || [],
        gameRecords || [],
        myCommission
      );
      
      console.log('✅ 일별 정산 데이터 처리 완료:', rows.length, '개');
      setData(rows);
      calculateSummary(rows);

    } catch (error) {
      console.error('❌ 정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getDescendantPartnerIds = async (partnerId: string): Promise<string[]> => {
    const { data: directChildren } = await supabase
      .from('partners')
      .select('id')
      .eq('parent_id', partnerId);

    if (!directChildren || directChildren.length === 0) {
      return [];
    }

    let allDescendants = directChildren.map(p => p.id);
    
    for (const child of directChildren) {
      const childDescendants = await getDescendantPartnerIds(child.id);
      allDescendants.push(...childDescendants);
    }
    
    return allDescendants;
  };

  const processDailySettlementData = async (
    fromDate: Date,
    toDate: Date,
    transactions: any[],
    pointTransactions: any[],
    gameRecords: any[],
    commission: any
  ): Promise<DailySettlementRow[]> => {
    const rows: DailySettlementRow[] = [];
    const days = eachDayOfInterval({ start: fromDate, end: toDate });

    for (const day of days) {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      // 해당 날짜의 거래만 필터링
      const dayTransactions = transactions.filter(t => {
        const tDate = new Date(t.created_at);
        return tDate >= dayStart && tDate <= dayEnd;
      });

      const dayPointTransactions = pointTransactions.filter(pt => {
        const ptDate = new Date(pt.created_at);
        return ptDate >= dayStart && ptDate <= dayEnd;
      });

      const dayGameRecords = gameRecords.filter(gr => {
        const grDate = new Date(gr.played_at);
        return grDate >= dayStart && grDate <= dayEnd;
      });

      // 입출금 계산
      const deposit = dayTransactions
        .filter(t => t.transaction_type === 'deposit' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const withdrawal = dayTransactions
        .filter(t => t.transaction_type === 'withdrawal' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const adminDeposit = dayTransactions
        .filter(t => t.transaction_type === 'admin_deposit' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const adminWithdrawal = dayTransactions
        .filter(t => t.transaction_type === 'admin_withdrawal' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      // 포인트 계산
      const pointGiven = dayPointTransactions
        .filter(pt => pt.type === 'admin_give')
        .reduce((sum, pt) => sum + (pt.amount || 0), 0);

      const pointRecovered = dayPointTransactions
        .filter(pt => pt.type === 'admin_deduct')
        .reduce((sum, pt) => sum + (pt.amount || 0), 0);

      // 베팅 데이터 계산
      const casinoBet = dayGameRecords
        .filter(gr => gr.game_type === 'casino')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);

      const casinoWin = dayGameRecords
        .filter(gr => gr.game_type === 'casino')
        .reduce((sum, gr) => sum + (gr.win_amount || 0), 0);

      const slotBet = dayGameRecords
        .filter(gr => gr.game_type === 'slot')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);

      const slotWin = dayGameRecords
        .filter(gr => gr.game_type === 'slot')
        .reduce((sum, gr) => sum + (gr.win_amount || 0), 0);

      const casinoWinLoss = casinoBet - casinoWin;
      const slotWinLoss = slotBet - slotWin;
      const totalBet = casinoBet + slotBet;
      const totalWin = casinoWin + slotWin;
      const totalWinLoss = totalBet - totalWin;

      // 롤링 계산
      const casinoRolling = casinoBet * (commission.casinoRolling / 100);
      const slotRolling = slotBet * (commission.slotRolling / 100);
      const totalRolling = casinoRolling + slotRolling;

      // 루징 계산
      const casinoLosable = Math.max(0, casinoWinLoss - casinoRolling);
      const slotLosable = Math.max(0, slotWinLoss - slotRolling);
      const casinoLosing = casinoLosable * (commission.casinoLosing / 100);
      const slotLosing = slotLosable * (commission.slotLosing / 100);
      const totalLosing = casinoLosing + slotLosing;

      rows.push({
        date: format(day, 'yyyy. M. d', { locale: ko }),
        deposit,
        withdrawal,
        adminDeposit,
        adminWithdrawal,
        pointGiven,
        pointRecovered,
        depositWithdrawalDiff: deposit - withdrawal + adminDeposit - adminWithdrawal,
        casinoBet,
        casinoWin,
        casinoWinLoss,
        slotBet,
        slotWin,
        slotWinLoss,
        totalBet,
        totalWin,
        totalWinLoss,
        casinoRolling,
        slotRolling,
        totalRolling,
        settlementProfit: totalWinLoss - totalRolling,
        actualSettlementProfit: totalWinLoss - totalRolling - totalLosing
      });
    }

    return rows;
  };

  const calculateSummary = (rows: DailySettlementRow[]) => {
    const summary: SummaryStats = {
      totalDeposit: rows.reduce((sum, r) => sum + r.deposit, 0),
      totalWithdrawal: rows.reduce((sum, r) => sum + r.withdrawal, 0),
      adminTotalDeposit: rows.reduce((sum, r) => sum + r.adminDeposit, 0),
      adminTotalWithdrawal: rows.reduce((sum, r) => sum + r.adminWithdrawal, 0),
      pointGiven: rows.reduce((sum, r) => sum + r.pointGiven, 0),
      pointRecovered: rows.reduce((sum, r) => sum + r.pointRecovered, 0),
      depositWithdrawalDiff: rows.reduce((sum, r) => sum + r.depositWithdrawalDiff, 0),
      casinoBet: rows.reduce((sum, r) => sum + r.casinoBet, 0),
      casinoWin: rows.reduce((sum, r) => sum + r.casinoWin, 0),
      slotBet: rows.reduce((sum, r) => sum + r.slotBet, 0),
      slotWin: rows.reduce((sum, r) => sum + r.slotWin, 0),
      totalBet: rows.reduce((sum, r) => sum + r.totalBet, 0),
      totalWin: rows.reduce((sum, r) => sum + r.totalWin, 0),
      totalWinLoss: rows.reduce((sum, r) => sum + r.totalWinLoss, 0),
      totalRolling: rows.reduce((sum, r) => sum + r.totalRolling, 0),
      totalSettlementProfit: rows.reduce((sum, r) => sum + r.settlementProfit, 0),
      totalActualSettlementProfit: rows.reduce((sum, r) => sum + r.actualSettlementProfit, 0)
    };

    setSummary(summary);
  };

  const setQuickDateRange = (type: 'today' | 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    let from: Date;
    let to: Date;

    if (type === 'yesterday') {
      from = startOfDay(subDays(today, 1));
      to = endOfDay(subDays(today, 1));
    } else if (type === 'week') {
      from = startOfDay(subDays(today, 7));
      to = endOfDay(today);
    } else if (type === 'month') {
      from = startOfDay(subDays(today, 30));
      to = endOfDay(today);
    } else {
      from = startOfDay(today);
      to = endOfDay(today);
    }

    setDateRange({ from, to });
    setDateFilterType(type);
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-cyan-400" />
            일일정산
          </h1>
          <p className="text-muted-foreground">
            하위 회원들의 날짜별 정산 데이터를 확인합니다
          </p>
        </div>
        <Button
          onClick={fetchSettlementData}
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-700 text-white"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          새로고침
        </Button>
      </div>

      {/* 주의사항 */}
      <div className="glass-card rounded-xl p-4 border-l-4 border-amber-500">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300 space-y-1">
            <p>• 관리자 일자별 정산 내역은 자신의 하위 회원들의 베팅을 기반으로 한 정산 데이터를 날짜별로 표기합니다.</p>
            <p>• 기간 검색으로 선택한 기간 내 일일 정산 데이터 값을 표기합니다.</p>
            <p>• 정산수익 = 윈로스 - 롤링금, 실정산수익 = 윈로스 - 롤링금 - 루징금</p>
          </div>
        </div>
      </div>

      {/* 통계 카드 - 첫 번째 줄 (6개) */}
      <div className="grid gap-5 md:grid-cols-6">
        <MetricCard
          title="총 입금"
          value={`${formatNumber(summary.totalDeposit)}원`}
          subtitle="승인된 입금 합계"
          icon={TrendingUp}
          color="emerald"
        />

        <MetricCard
          title="총 출금"
          value={`${formatNumber(summary.totalWithdrawal)}원`}
          subtitle="승인된 출금 합계"
          icon={TrendingDown}
          color="rose"
        />

        <MetricCard
          title="관리자 입금"
          value={`${formatNumber(summary.adminTotalDeposit)}원`}
          subtitle="관리자 입금 합계"
          icon={Wallet}
          color="blue"
        />

        <MetricCard
          title="관리자 출금"
          value={`${formatNumber(summary.adminTotalWithdrawal)}원`}
          subtitle="관리자 출금 합계"
          icon={Wallet}
          color="purple"
        />

        <MetricCard
          title="포인트 지급"
          value={`${formatNumber(summary.pointGiven)}원`}
          subtitle="관리자 포인트 지급"
          icon={TrendingUp}
          color="green"
        />

        <MetricCard
          title="포인트 회수"
          value={`${formatNumber(summary.pointRecovered)}원`}
          subtitle="관리자 포인트 회수"
          icon={TrendingDown}
          color="orange"
        />
      </div>

      {/* 통계 카드 - 두 번째 줄 (6개) */}
      <div className="grid gap-5 md:grid-cols-6">
        <MetricCard
          title="카지노 베팅"
          value={`${formatNumber(summary.casinoBet)}원`}
          subtitle="카지노 베팅 합계"
          icon={TrendingUp}
          color="blue"
        />

        <MetricCard
          title="카지노 당첨"
          value={`${formatNumber(summary.casinoWin)}원`}
          subtitle="카지노 당첨 합계"
          icon={TrendingDown}
          color="purple"
        />

        <MetricCard
          title="슬롯 베팅"
          value={`${formatNumber(summary.slotBet)}원`}
          subtitle="슬롯 베팅 합계"
          icon={TrendingUp}
          color="indigo"
        />

        <MetricCard
          title="슬롯 당첨"
          value={`${formatNumber(summary.slotWin)}원`}
          subtitle="슬롯 당첨 합계"
          icon={TrendingDown}
          color="violet"
        />

        <MetricCard
          title="총 베팅"
          value={`${formatNumber(summary.totalBet)}원`}
          subtitle="카지노 + 슬롯"
          icon={TrendingUp}
          color="blue"
        />

        <MetricCard
          title="총 당첨"
          value={`${formatNumber(summary.totalWin)}원`}
          subtitle="카지노 + 슬롯"
          icon={DollarSign}
          color="purple"
        />
      </div>

      {/* 통계 카드 - 세 번째 줄 (4개) */}
      <div className="grid gap-5 md:grid-cols-6">
        <MetricCard
          title="입출 차액"
          value={`${formatNumber(summary.depositWithdrawalDiff)}원`}
          subtitle="입금 - 출금"
          icon={DollarSign}
          color={summary.depositWithdrawalDiff >= 0 ? "cyan" : "red"}
        />

        <MetricCard
          title="GGR"
          value={`${formatNumber(summary.totalWinLoss)}원`}
          subtitle="베팅 - 당첨"
          icon={TrendingUp}
          color="amber"
        />

        <MetricCard
          title="총 롤링금"
          value={`${formatNumber(summary.totalRolling)}원`}
          subtitle="롤링 합계"
          icon={DollarSign}
          color="emerald"
        />

        <MetricCard
          title="정산 수익"
          value={`${formatNumber(summary.totalSettlementProfit)}원`}
          subtitle="GGR - 롤링금"
          icon={DollarSign}
          color="green"
        />
      </div>

      {/* 일일정산 데이터 테이블 */}
      <div className="glass-card rounded-xl p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-8 w-8 text-slate-400" />
            <h3 className="text-2xl font-semibold text-slate-100">일일 정산 데이터</h3>
          </div>
        </div>

        {/* 필터 영역 */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* 날짜 빠른 선택 */}
          <Button
            onClick={() => setQuickDateRange('today')}
            variant={dateFilterType === 'today' ? 'default' : 'outline'}
            className="h-10"
          >
            오늘
          </Button>
          <Button
            onClick={() => setQuickDateRange('yesterday')}
            variant={dateFilterType === 'yesterday' ? 'default' : 'outline'}
            className="h-10"
          >
            어제
          </Button>
          <Button
            onClick={() => setQuickDateRange('week')}
            variant={dateFilterType === 'week' ? 'default' : 'outline'}
            className="h-10"
          >
            일주일
          </Button>
          <Button
            onClick={() => setQuickDateRange('month')}
            variant={dateFilterType === 'month' ? 'default' : 'outline'}
            className="h-10"
          >
            한달
          </Button>

          {/* 날짜 범위 선택 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[280px] justify-start text-left font-normal input-premium",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "yyyy-MM-dd", { locale: ko })} -{" "}
                      {format(dateRange.to, "yyyy-MM-dd", { locale: ko })}
                    </>
                  ) : (
                    format(dateRange.from, "yyyy-MM-dd", { locale: ko })
                  )
                ) : (
                  <span>날짜 선택</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  setDateFilterType('custom');
                }}
                numberOfMonths={2}
                locale={ko}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* 데이터 테이블 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            일일 정산 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto" style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#9FA8DA #E8EAF6'
          }}>
            <style dangerouslySetInnerHTML={{
              __html: `
                .overflow-x-auto::-webkit-scrollbar {
                  height: 8px;
                }
                .overflow-x-auto::-webkit-scrollbar-track {
                  background: #E8EAF6;
                }
                .overflow-x-auto::-webkit-scrollbar-thumb {
                  background: #9FA8DA;
                  border-radius: 4px;
                }
                .overflow-x-auto::-webkit-scrollbar-thumb:hover {
                  background: #7986CB;
                }
              `
            }} />
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  {/* 날짜 */}
                  <th className="px-4 py-3 text-left text-white font-normal sticky left-0 bg-slate-900 z-10 whitespace-nowrap">날짜</th>
                  
                  {/* 입출금 관련 - 주황색 계열 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-orange-950/60 whitespace-nowrap">입금</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-orange-950/60 whitespace-nowrap">출금</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-orange-950/60 whitespace-nowrap">관리자입금</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-orange-950/60 whitespace-nowrap">관리자출금</th>
                  
                  {/* 포인트 관련 - 초록색 계열 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-green-950/60 whitespace-nowrap">포인트지급</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-green-950/60 whitespace-nowrap">포인트회수</th>
                  
                  {/* 입출차액 - 청록색 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-cyan-950/60 whitespace-nowrap">입출차액</th>
                  
                  {/* 베팅/당첨 - 파란색/보라색 계열 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-blue-950/60 whitespace-nowrap">카지노베팅</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-blue-950/60 whitespace-nowrap">카지노당첨</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-purple-950/60 whitespace-nowrap">슬롯베팅</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-purple-950/60 whitespace-nowrap">슬롯당첨</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-indigo-950/60 whitespace-nowrap">총베팅</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-indigo-950/60 whitespace-nowrap">총당첨</th>
                  
                  {/* GGR - 앰버 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-amber-950/60 whitespace-nowrap">GGR</th>
                  
                  {/* 롤링 - 에메랄드/틸 계열 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-emerald-950/60 whitespace-nowrap">카지노롤링</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-emerald-950/60 whitespace-nowrap">슬롯롤링</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-teal-950/60 whitespace-nowrap">총롤링</th>
                  
                  {/* 정산 수익 - 초록 계열 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-green-950/70 whitespace-nowrap">정산수익</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-green-950/70 whitespace-nowrap">실정산수익</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-slate-200 font-mono sticky left-0 bg-slate-900/95 z-10 whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono whitespace-nowrap">{formatNumber(row.deposit)}</td>
                    <td className="px-4 py-3 text-right text-rose-400 font-mono whitespace-nowrap">{formatNumber(row.withdrawal)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono whitespace-nowrap">{formatNumber(row.adminDeposit)}</td>
                    <td className="px-4 py-3 text-right text-rose-400 font-mono whitespace-nowrap">{formatNumber(row.adminWithdrawal)}</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-mono whitespace-nowrap">{formatNumber(row.pointGiven)}</td>
                    <td className="px-4 py-3 text-right text-orange-400 font-mono whitespace-nowrap">{formatNumber(row.pointRecovered)}</td>
                    <td className={cn("px-4 py-3 text-right font-mono whitespace-nowrap", row.depositWithdrawalDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {formatNumber(row.depositWithdrawalDiff)}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-400 font-mono whitespace-nowrap">{formatNumber(row.casinoBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.casinoWin)}</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-mono whitespace-nowrap">{formatNumber(row.slotBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.slotWin)}</td>
                    <td className="px-4 py-3 text-right text-cyan-400 font-mono whitespace-nowrap">{formatNumber(row.totalBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.totalWin)}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-mono whitespace-nowrap">{formatNumber(row.totalWinLoss)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono whitespace-nowrap">{formatNumber(row.casinoRolling)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono whitespace-nowrap">{formatNumber(row.slotRolling)}</td>
                    <td className="px-4 py-3 text-right text-teal-400 font-mono whitespace-nowrap">{formatNumber(row.totalRolling)}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-mono font-semibold whitespace-nowrap">{formatNumber(row.settlementProfit)}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-mono font-semibold whitespace-nowrap">{formatNumber(row.actualSettlementProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 계산 방식 설명 */}
      <div className="glass-card rounded-xl p-6">
        <h3 className="text-xl font-semibold text-slate-100 mb-4">계산 방식 안내</h3>
        <div className="grid md:grid-cols-2 gap-6">
          {/* 좌측: 기본 수식 */}
          <div>
            <h4 className="text-lg font-semibold text-slate-200 mb-3">기본 계산식</h4>
            <div className="space-y-2 text-slate-400">
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-semibold min-w-[120px]">윈로스:</span>
                <span>총베팅 - 총당첨</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-semibold min-w-[120px]">롤링금:</span>
                <span>베팅액 × 롤링%</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-semibold min-w-[120px]">루징금:</span>
                <span>(윈로스 - 롤링금) × 루징%</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-semibold min-w-[120px]">입출차액:</span>
                <span>입금 - 출금 + 관리자입금 - 관리자출금</span>
              </div>
            </div>
          </div>

          {/* 우측: 정산 수식 */}
          <div>
            <h4 className="text-lg font-semibold text-slate-200 mb-3">정산 수식</h4>
            <div className="space-y-2 text-slate-400">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[120px]">정산수익:</span>
                <span>윈로스 - 롤링금</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[120px]">실정산수익:</span>
                <span>윈로스 - 롤링금 - 루징금</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[120px]">날짜별 집계:</span>
                <span>각 날짜별로 하위 회원들의 데이터를 집계합니다</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}