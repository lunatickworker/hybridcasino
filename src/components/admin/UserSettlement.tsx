import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, Search, Calendar as CalendarIcon, Users, Wallet } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { MetricCard } from "./MetricCard";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ko } from "date-fns/locale";

interface UserSettlementProps {
  user: Partner;
}

interface UserSettlementRow {
  id: string;
  username: string;
  balance: number;
  points: number;
  deposit: number;
  withdrawal: number;
  adminDeposit: number;
  adminWithdrawal: number;
  pointGiven: number;
  pointRecovered: number;
  depositWithdrawalDiff: number;
  casinoRollingRate: number;
  casinoLosingRate: number;
  slotRollingRate: number;
  slotLosingRate: number;
  casinoBet: number;
  casinoWin: number;
  casinoWinLoss: number;
  slotBet: number;
  slotWin: number;
  slotWinLoss: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  ggr: number;
  casinoIndividualRolling: number;
  slotIndividualRolling: number;
  totalRolling: number;
  totalLosing: number;
  rollingAmount: number;
  losingAmount: number;
}

interface SummaryStats {
  totalBalance: number;
  totalPoints: number;
  totalDeposit: number;
  totalWithdrawal: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  totalRolling: number;
}

export default function UserSettlement({ user }: UserSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [data, setData] = useState<UserSettlementRow[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({
    totalBalance: 0,
    totalPoints: 0,
    totalDeposit: 0,
    totalWithdrawal: 0,
    totalBet: 0,
    totalWin: 0,
    totalWinLoss: 0,
    totalRolling: 0
  });

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      console.log('🔍 [회원별정산] 데이터 조회 시작', {
        dateRange: {
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString()
        },
        user: { id: user.id, username: user.username, level: user.level }
      });

      // 1. 본인의 하위 파트너 조회 (재귀적)
      const descendantPartnerIds = await getDescendantPartnerIds(user.id);
      const allPartnerIds = [user.id, ...descendantPartnerIds];
      console.log('✅ 허용된 파트너:', allPartnerIds.length, '개');

      // 2. 하위 파트너들의 회원만 조회
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('referrer_id', allPartnerIds)
        .order('username', { ascending: true });

      if (usersError) throw usersError;
      console.log('✅ 회원 데이터:', users?.length || 0, '개');

      if (!users || users.length === 0) {
        console.log('⚠️ 조회된 회원이 없습니다.');
        setData([]);
        setSummary({
          totalBalance: 0,
          totalPoints: 0,
          totalDeposit: 0,
          totalWithdrawal: 0,
          totalBet: 0,
          totalWin: 0,
          totalWinLoss: 0,
          totalRolling: 0
        });
        return;
      }

      // 3. 각 회원별 정산 데이터 조회
      const rows: UserSettlementRow[] = [];

      for (const userItem of users) {
        // 입출금 데이터
        const { data: transactions } = await supabase
          .from('transactions')
          .select('*')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .eq('user_id', userItem.id);

        const deposit = transactions
          ?.filter(t => t.transaction_type === 'deposit' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const withdrawal = transactions
          ?.filter(t => t.transaction_type === 'withdrawal' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const adminDeposit = transactions
          ?.filter(t => (t.transaction_type === 'admin_deposit_initial' || t.transaction_type === 'admin_deposit_send') && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const adminWithdrawal = transactions
          ?.filter(t => t.transaction_type === 'partner_manual_withdrawal' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        // 포인트 데이터
        const { data: pointTransactions } = await supabase
          .from('point_transactions')
          .select('*')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .eq('user_id', userItem.id);

        const pointGiven = pointTransactions
          ?.filter(pt => pt.type === 'admin_give')
          .reduce((sum, pt) => sum + (pt.amount || 0), 0) || 0;

        const pointRecovered = pointTransactions
          ?.filter(pt => pt.type === 'admin_deduct')
          .reduce((sum, pt) => sum + (pt.amount || 0), 0) || 0;

        // 게임 데이터
        const { data: gameRecords } = await supabase
          .from('game_records')
          .select('*')
          .gte('played_at', dateRange.from.toISOString())
          .lte('played_at', dateRange.to.toISOString())
          .eq('user_id', userItem.id);

        const casinoBet = gameRecords
          ?.filter(gr => gr.game_type === 'casino')
          .reduce((sum, gr) => sum + Math.abs(gr.bet_amount || 0), 0) || 0;

        const casinoWin = gameRecords
          ?.filter(gr => gr.game_type === 'casino')
          .reduce((sum, gr) => sum + (gr.win_amount || 0), 0) || 0;

        const slotBet = gameRecords
          ?.filter(gr => gr.game_type === 'slot')
          .reduce((sum, gr) => sum + Math.abs(gr.bet_amount || 0), 0) || 0;

        const slotWin = gameRecords
          ?.filter(gr => gr.game_type === 'slot')
          .reduce((sum, gr) => sum + (gr.win_amount || 0), 0) || 0;

        console.log(`📊 [${userItem.username}] 게임 데이터:`, {
          gameRecordsCount: gameRecords?.length || 0,
          casinoBet,
          casinoWin,
          slotBet,
          slotWin
        });

        const casinoWinLoss = casinoBet - casinoWin;
        const slotWinLoss = slotBet - slotWin;
        const totalBet = casinoBet + slotBet;
        const totalWin = casinoWin + slotWin;
        const totalWinLoss = totalBet - totalWin;

        // 회원 개별 롤링/루징 계산
        const casinoRollingRate = userItem.casino_rolling_commission || userItem.casino_rolling_rate || 0;
        const casinoLosingRate = userItem.casino_losing_commission || userItem.casino_losing_rate || 0;
        const slotRollingRate = userItem.slot_rolling_commission || userItem.slot_rolling_rate || 0;
        const slotLosingRate = userItem.slot_losing_commission || userItem.slot_losing_rate || 0;

        const casinoIndividualRolling = casinoBet * (casinoRollingRate / 100);
        const slotIndividualRolling = slotBet * (slotRollingRate / 100);
        const totalRolling = casinoIndividualRolling + slotIndividualRolling;

        const casinoLosing = casinoWinLoss > 0 ? casinoWinLoss * (casinoLosingRate / 100) : 0;
        const slotLosing = slotWinLoss > 0 ? slotWinLoss * (slotLosingRate / 100) : 0;
        const totalLosing = casinoLosing + slotLosing;

        // 회원은 하위가 없으므로 롤링금 = 총롤링금, 낙첨금 = 총루징
        const rollingAmount = totalRolling;
        const losingAmount = totalLosing;

        rows.push({
          id: userItem.id,
          username: userItem.username,
          balance: userItem.balance || 0,
          points: userItem.point || 0,
          deposit,
          withdrawal,
          adminDeposit,
          adminWithdrawal,
          pointGiven,
          pointRecovered,
          depositWithdrawalDiff: deposit - withdrawal + adminDeposit - adminWithdrawal,
          casinoRollingRate,
          casinoLosingRate,
          slotRollingRate,
          slotLosingRate,
          casinoBet,
          casinoWin,
          casinoWinLoss,
          slotBet,
          slotWin,
          slotWinLoss,
          totalBet,
          totalWin,
          totalWinLoss,
          ggr: totalWinLoss,
          casinoIndividualRolling,
          slotIndividualRolling,
          totalRolling,
          totalLosing,
          rollingAmount,
          losingAmount
        });
      }

      console.log('✅ 회원별 정산 데이터 처리 완료:', rows.length, '개');
      setData(rows);

      // 요약 통계 계산
      const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
      const totalPoints = rows.reduce((sum, row) => sum + row.points, 0);
      const totalDeposit = rows.reduce((sum, row) => sum + row.deposit, 0);
      const totalWithdrawal = rows.reduce((sum, row) => sum + row.withdrawal, 0);
      const totalBet = rows.reduce((sum, row) => sum + row.totalBet, 0);
      const totalWin = rows.reduce((sum, row) => sum + row.totalWin, 0);
      const totalWinLoss = rows.reduce((sum, row) => sum + row.totalWinLoss, 0);
      const totalRolling = rows.reduce((sum, row) => sum + row.totalRolling, 0);

      setSummary({
        totalBalance,
        totalPoints,
        totalDeposit,
        totalWithdrawal,
        totalBet,
        totalWin,
        totalWinLoss,
        totalRolling
      });

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

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
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

  const filteredData = data.filter(row => {
    if (!codeSearch) return true;
    return row.username.toLowerCase().includes(codeSearch.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="h-6 w-6 text-cyan-400" />
            회원별 일일정산
          </h1>
          <p className="text-muted-foreground">
            하위 회원들의 입출금, 베팅, 정산 내역을 확인합니다
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

      {/* 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-4">
        <MetricCard
          title="총 보유머니"
          value={`${formatNumber(summary.totalBalance)}원`}
          subtitle="회원 전체 보유액"
          icon={Wallet}
          color="purple"
        />

        <MetricCard
          title="총 베팅액"
          value={`${formatNumber(summary.totalBet)}원`}
          subtitle="카지노 + 슬롯"
          icon={TrendingUp}
          color="blue"
        />

        <MetricCard
          title="총 당첨액"
          value={`${formatNumber(summary.totalWin)}원`}
          subtitle="총 베팅 대비 당첨"
          icon={TrendingDown}
          color="green"
        />

        <MetricCard
          title="총 롤링금"
          value={`${formatNumber(summary.totalRolling)}원`}
          subtitle="정산 롤링 합계"
          icon={DollarSign}
          color="cyan"
        />
      </div>

      {/* 세부 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-4">
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
          title="입출 차액"
          value={`${formatNumber(summary.totalDeposit - summary.totalWithdrawal)}원`}
          subtitle="입금 - 출금"
          icon={DollarSign}
          color={summary.totalDeposit - summary.totalWithdrawal >= 0 ? "green" : "red"}
        />

        <MetricCard
          title="총 윈로스"
          value={`${formatNumber(summary.totalWinLoss)}원`}
          subtitle="베팅 - 당첨"
          icon={TrendingUp}
          color="blue"
        />
      </div>

      {/* 회원별 정산 데이터 테이블 */}
      <div className="glass-card rounded-xl p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-8 w-8 text-slate-400" />
            <h3 className="text-2xl font-semibold text-slate-100">회원별 정산 데이터</h3>
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

          {/* 검색 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-6 w-6 text-slate-400" />
            <Input
              placeholder="회원 ID 검색..."
              className="pl-10 input-premium"
              value={codeSearch}
              onChange={(e) => setCodeSearch(e.target.value)}
            />
          </div>
        </div>

        {/* 데이터 테이블 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            회원 정산 데이터가 없습니다.
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
                  {/* 기본 정보 */}
                  <th className="px-4 py-3 text-left text-white font-normal sticky left-0 bg-slate-900 z-10 whitespace-nowrap">아이디</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-slate-900 whitespace-nowrap">보유머니</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-slate-900 whitespace-nowrap">롤링포인트</th>
                  
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
                  
                  {/* 요율 정보 - 회색 계열 */}
                  <th className="px-4 py-3 text-center text-white font-normal bg-slate-800/70 whitespace-nowrap">카지노롤링%</th>
                  <th className="px-4 py-3 text-center text-white font-normal bg-slate-800/70 whitespace-nowrap">카지노루징%</th>
                  <th className="px-4 py-3 text-center text-white font-normal bg-slate-800/70 whitespace-nowrap">슬롯롤링%</th>
                  <th className="px-4 py-3 text-center text-white font-normal bg-slate-800/70 whitespace-nowrap">슬롯루징%</th>
                  
                  {/* 베팅/당첨 - 파란색/보라색 계열 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-blue-950/60 whitespace-nowrap">카지노베팅</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-blue-950/60 whitespace-nowrap">카지노당첨</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-purple-950/60 whitespace-nowrap">슬롯베팅</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-purple-950/60 whitespace-nowrap">슬롯당첨</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-indigo-950/60 whitespace-nowrap">총베팅</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-indigo-950/60 whitespace-nowrap">총당첨</th>
                  
                  {/* 정산 결과 - 에메랄드/틸 계열 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-amber-950/60 whitespace-nowrap">윈로스</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-emerald-950/60 whitespace-nowrap">롤링금</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-teal-950/60 whitespace-nowrap">낙첨금</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-slate-200 font-mono sticky left-0 bg-slate-900/95 z-10 whitespace-nowrap">{row.username}</td>
                    <td className="px-4 py-3 text-right text-slate-300 font-mono whitespace-nowrap">{formatNumber(row.balance)}</td>
                    <td className="px-4 py-3 text-right text-cyan-400 font-mono whitespace-nowrap">{formatNumber(row.points)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono whitespace-nowrap">{formatNumber(row.deposit)}</td>
                    <td className="px-4 py-3 text-right text-rose-400 font-mono whitespace-nowrap">{formatNumber(row.withdrawal)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono whitespace-nowrap">{formatNumber(row.adminDeposit)}</td>
                    <td className="px-4 py-3 text-right text-rose-400 font-mono whitespace-nowrap">{formatNumber(row.adminWithdrawal)}</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-mono whitespace-nowrap">{formatNumber(row.pointGiven)}</td>
                    <td className="px-4 py-3 text-right text-orange-400 font-mono whitespace-nowrap">{formatNumber(row.pointRecovered)}</td>
                    <td className={cn("px-4 py-3 text-right font-mono whitespace-nowrap", row.depositWithdrawalDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {formatNumber(row.depositWithdrawalDiff)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-300 whitespace-nowrap">{row.casinoRollingRate}%</td>
                    <td className="px-4 py-3 text-center text-slate-300 whitespace-nowrap">{row.casinoLosingRate}%</td>
                    <td className="px-4 py-3 text-center text-slate-300 whitespace-nowrap">{row.slotRollingRate}%</td>
                    <td className="px-4 py-3 text-center text-slate-300 whitespace-nowrap">{row.slotLosingRate}%</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-mono whitespace-nowrap">{formatNumber(row.casinoBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.casinoWin)}</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-mono whitespace-nowrap">{formatNumber(row.slotBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.slotWin)}</td>
                    <td className="px-4 py-3 text-right text-cyan-400 font-mono whitespace-nowrap">{formatNumber(row.totalBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.totalWin)}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-mono whitespace-nowrap">{formatNumber(row.totalWinLoss)}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-mono font-semibold whitespace-nowrap">{formatNumber(row.rollingAmount)}</td>
                    <td className="px-4 py-3 text-right text-teal-400 font-mono font-semibold whitespace-nowrap">{formatNumber(row.losingAmount)}</td>
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
                <span className="text-cyan-400 font-semibold min-w-[100px]">윈로스:</span>
                <span>총베팅 - 총당첨</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-semibold min-w-[100px]">GGR:</span>
                <span>총 윈로스</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-semibold min-w-[100px]">입출차액:</span>
                <span>입금 - 출금 + 관리자입금 - 관리자출금</span>
              </div>
            </div>
          </div>

          {/* 우측: 회원 정산 특이사항 */}
          <div>
            <h4 className="text-lg font-semibold text-slate-200 mb-3">회원 정산 특이사항</h4>
            <div className="space-y-2 text-slate-400">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[100px]">개별 롤링:</span>
                <span>회원은 개별 롤링만 표시됩니다</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[100px]">분리 집계:</span>
                <span>카지노/슬롯으로 분리하여 집계됩니다</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[100px]">하위 정산:</span>
                <span>회원은 하위가 없으므로 정산 관련 컬럼은 비어있습니다</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}