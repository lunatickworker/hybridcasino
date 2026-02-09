import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle, Calendar as CalendarIcon, Search, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "../../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Calendar } from "../../ui/calendar";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Badge } from "../../ui/badge";
import { MetricCard } from "../MetricCard";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../../types";
import { supabase } from "../../../lib/supabase";
import { cn } from "../../../lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ko } from "date-fns/locale";

interface IntegratedSettlementProps {
  user: Partner;
}

interface SettlementRow {
  level: number;
  levelName: string;
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
  casinoRollingRate: number;
  losingRate: number; // 통합된 루징 요율
  slotRollingRate: number;
  casinoTotalRolling: number;
  slotTotalRolling: number;
  casinoChildrenRolling: number;
  slotChildrenRolling: number;
  casinoIndividualRolling: number;
  slotIndividualRolling: number;
  totalIndividualRolling: number;
  totalRolling: number;
  casinoTotalLosing: number;
  slotTotalLosing: number;
  casinoChildrenLosing: number;
  slotChildrenLosing: number;
  casinoIndividualLosing: number;
  slotIndividualLosing: number;
  totalIndividualLosing: number;
  totalLosing: number;
  totalSettlement: number;
  settlementProfit: number;
  actualSettlementProfit: number;
  parentId?: string;
  referrerId?: string;
  hasChildren?: boolean;
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
  errorBetAmount: number;
  errorBetCount: number;
}

export function IntegratedSettlementV2({ user }: IntegratedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'all' | '2' | '3' | '4' | '5' | '6' | 'user'>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [showCumulative, setShowCumulative] = useState(false);
  const [data, setData] = useState<SettlementRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  
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
    totalActualSettlementProfit: 0,
    errorBetAmount: 0,
    errorBetCount: 0
  });
  
  const [bettingErrors, setBettingErrors] = useState({ errorBetAmount: 0, errorBetCount: 0 });

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange, showCumulative]);

  // Import the existing fetchSettlementData logic here
  const fetchSettlementData = async () => {
    // Placeholder - 기존 로직 유지
    setLoading(true);
    try {
      // TODO: 기존 IntegratedSettlement.tsx의 fetchSettlementData 로직 사용
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("정산 데이터 조회 완료");
    } catch (error) {
      console.error("정산 데이터 조회 오류:", error);
      toast.error("정산 데이터 조회 실패");
    } finally {
      setLoading(false);
    }
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

  // 필터링된 데이터
  const filteredData = useMemo(() => {
    let filtered = data;
    
    if (levelFilter !== 'all') {
      if (levelFilter === 'user') {
        filtered = filtered.filter(r => r.level === 0);
      } else {
        filtered = filtered.filter(r => r.level === parseInt(levelFilter));
      }
    }
    
    if (codeSearch.trim()) {
      filtered = filtered.filter(r => r.username.toLowerCase().includes(codeSearch.toLowerCase()));
    }
    
    return filtered;
  }, [data, levelFilter, codeSearch]);

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-cyan-400" />
            통합 정산 관리
          </h1>
          <p className="text-muted-foreground">
            파트너 및 회원의 입출금, 베팅, 정산 내역을 확인합니다
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
          color="purple"
        />

        <MetricCard
          title="총 롤링금"
          value={`${formatNumber(summary.totalRolling)}원`}
          subtitle="정산 롤링 합계"
          icon={DollarSign}
          color="green"
        />

        <MetricCard
          title="정산 수익"
          value={`${formatNumber(summary.totalSettlementProfit)}원`}
          subtitle="롤링 + 루징 정산"
          icon={DollarSign}
          color="cyan"
        />
      </div>

      {/* 세부 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-4">
        <MetricCard
          title="입출 차액"
          value={`${formatNumber(summary.depositWithdrawalDiff)}원`}
          subtitle="입금 - 출금"
          icon={TrendingUp}
          color={summary.depositWithdrawalDiff >= 0 ? "green" : "red"}
        />

        <MetricCard
          title="카지노 베팅"
          value={`${formatNumber(summary.casinoBet)}원`}
          subtitle="카지노 게임 베팅"
          icon={TrendingUp}
          color="blue"
        />

        <MetricCard
          title="슬롯 베팅"
          value={`${formatNumber(summary.slotBet)}원`}
          subtitle="슬롯 게임 베팅"
          icon={TrendingUp}
          color="purple"
        />

        <MetricCard
          title="베팅정보오류"
          value={`${formatNumber(summary.errorBetAmount)}원`}
          subtitle={`오류 ${summary.errorBetCount}건`}
          icon={AlertCircle}
          color="red"
        />
      </div>

      {/* 정산 데이터 테이블 */}
      <div className="glass-card rounded-xl p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-8 w-8 text-slate-400" />
            <h3 className="text-2xl font-semibold text-slate-100">정산 데이터</h3>
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
                onSelect={setDateRange}
                numberOfMonths={2}
                locale={ko}
              />
            </PopoverContent>
          </Popover>

          {/* 레벨 필터 */}
          <Select value={levelFilter} onValueChange={(value: any) => setLevelFilter(value)}>
            <SelectTrigger className="w-[140px] input-premium">
              <SelectValue placeholder="레벨" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="2">Lv2</SelectItem>
              <SelectItem value="3">Lv3</SelectItem>
              <SelectItem value="4">Lv4</SelectItem>
              <SelectItem value="5">Lv5</SelectItem>
              <SelectItem value="6">Lv6</SelectItem>
              <SelectItem value="user">회원</SelectItem>
            </SelectContent>
          </Select>

          {/* 검색 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-6 w-6 text-slate-400" />
            <Input
              placeholder="코드 검색..."
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
            정산 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  {/* 기본 정보 */}
                  <th className="px-4 py-3 text-left text-white sticky left-0 bg-slate-800 z-10 whitespace-nowrap">레벨</th>
                  <th className="px-4 py-3 text-left text-white bg-slate-800 whitespace-nowrap">코드</th>
                  <th className="px-4 py-3 text-right text-white bg-slate-800 whitespace-nowrap">보유머니</th>
                  <th className="px-4 py-3 text-right text-white bg-slate-800 whitespace-nowrap">롤링포인트</th>
                  
                  {/* 입출금 관련 - 주황색 계열 */}
                  <th className="px-4 py-3 text-right text-white bg-orange-900/40 whitespace-nowrap">입금</th>
                  <th className="px-4 py-3 text-right text-white bg-orange-900/40 whitespace-nowrap">출금</th>
                  <th className="px-4 py-3 text-right text-white bg-orange-900/40 whitespace-nowrap">관리자입금</th>
                  <th className="px-4 py-3 text-right text-white bg-orange-900/40 whitespace-nowrap">관리자출금</th>
                  
                  {/* 포인트 관련 - 초록색 계열 */}
                  <th className="px-4 py-3 text-right text-white bg-green-900/40 whitespace-nowrap">포인트지급</th>
                  <th className="px-4 py-3 text-right text-white bg-green-900/40 whitespace-nowrap">포인트회수</th>
                  
                  {/* 입출차액 - 청록색 */}
                  <th className="px-4 py-3 text-right text-white bg-cyan-900/40 whitespace-nowrap">입출차액</th>
                  
                  {/* 요율 정보 - 회색 계열 */}
                  <th className="px-4 py-3 text-center text-white bg-slate-700/50 whitespace-nowrap">카지노롤링%</th>
                  <th className="px-4 py-3 text-center text-white bg-slate-700/50 whitespace-nowrap">루징%</th>
                  <th className="px-4 py-3 text-center text-white bg-slate-700/50 whitespace-nowrap">슬롯롤링%</th>
                  
                  {/* 베팅/당첨 - 파란색/보라색 계열 */}
                  <th className="px-4 py-3 text-right text-white bg-blue-900/40 whitespace-nowrap">카지노베팅</th>
                  <th className="px-4 py-3 text-right text-white bg-blue-900/40 whitespace-nowrap">카지노당첨</th>
                  <th className="px-4 py-3 text-right text-white bg-purple-900/40 whitespace-nowrap">슬롯베팅</th>
                  <th className="px-4 py-3 text-right text-white bg-purple-900/40 whitespace-nowrap">슬롯당첨</th>
                  <th className="px-4 py-3 text-right text-white bg-indigo-900/40 whitespace-nowrap">총베팅</th>
                  <th className="px-4 py-3 text-right text-white bg-indigo-900/40 whitespace-nowrap">총당첨</th>
                  
                  {/* 윈로스/GGR - 앰버 계열 */}
                  <th className="px-4 py-3 text-right text-white bg-amber-900/40 whitespace-nowrap">윈로스</th>
                  <th className="px-4 py-3 text-right text-white bg-amber-900/40 whitespace-nowrap">GGR</th>
                  
                  {/* 정산 결과 - 에메랄드/틸 계열 */}
                  <th className="px-4 py-3 text-right text-white bg-emerald-900/40 whitespace-nowrap">총롤링금</th>
                  <th className="px-4 py-3 text-right text-white bg-teal-900/40 whitespace-nowrap">총루징</th>
                  <th className="px-4 py-3 text-right text-white bg-green-900/50 whitespace-nowrap">정산수익</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-slate-300 sticky left-0 bg-slate-900/95 z-10 whitespace-nowrap">{row.levelName}</td>
                    <td className="px-4 py-3 text-slate-200 font-mono whitespace-nowrap">{row.username}</td>
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
                    <td className="px-4 py-3 text-center text-slate-300 whitespace-nowrap">{row.losingRate}%</td>
                    <td className="px-4 py-3 text-center text-slate-300 whitespace-nowrap">{row.slotRollingRate}%</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-mono whitespace-nowrap">{formatNumber(row.casinoBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.casinoWin)}</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-mono whitespace-nowrap">{formatNumber(row.slotBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.slotWin)}</td>
                    <td className="px-4 py-3 text-right text-cyan-400 font-mono whitespace-nowrap">{formatNumber(row.totalBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.totalWin)}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-mono whitespace-nowrap">{formatNumber(row.totalWinLoss)}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-mono whitespace-nowrap">{formatNumber(row.ggr)}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-mono whitespace-nowrap">{formatNumber(row.totalRolling)}</td>
                    <td className="px-4 py-3 text-right text-teal-400 font-mono whitespace-nowrap">{formatNumber(row.totalLosing)}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-mono font-semibold whitespace-nowrap">{formatNumber(row.settlementProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}