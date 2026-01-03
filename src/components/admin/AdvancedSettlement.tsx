import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Info } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
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
  slotBet: number;
  slotWin: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  totalRolling: number;
  settlementProfit: number;
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
}

export default function AdvancedSettlement({ user }: AdvancedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
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
    totalSettlementProfit: 0
  });

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      // 1. 본인의 하위 파트너 및 회원 ID 목록 조회
      let allowedPartnerIds: string[] = [user.id];
      let allowedUserIds: string[] = [];

      // 하위 파트너 조회 (재귀적으로 모든 하위)
      const descendantPartnerIds = await getDescendantPartnerIds(user.id);
      allowedPartnerIds.push(...descendantPartnerIds);

      // 모든 허용된 파트너들의 직속 회원 조회
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id')
        .in('referrer_id', allowedPartnerIds);

      if (usersError) throw usersError;
      allowedUserIds = users?.map(u => u.id) || [];

      // 2. 기간 내 거래 데이터 조회
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .in('user_id', allowedUserIds);

      if (transError) throw transError;

      const { data: pointTransactions, error: pointError } = await supabase
        .from('point_transactions')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .in('user_id', allowedUserIds);

      if (pointError) throw pointError;

      const { data: gameRecords, error: gameError } = await supabase
        .from('game_records')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .in('user_id', allowedUserIds);

      if (gameError) throw gameError;

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
      
      setData(rows);
      calculateSummary(rows);

    } catch (error) {
      console.error('정산 데이터 조회 실패:', error);
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
        const grDate = new Date(gr.created_at);
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

      const totalBet = casinoBet + slotBet;
      const totalWin = casinoWin + slotWin;
      const totalWinLoss = totalBet - totalWin;

      // 롤링 계산
      const casinoRolling = casinoBet * (commission.casinoRolling / 100);
      const slotRolling = slotBet * (commission.slotRolling / 100);
      const totalRolling = casinoRolling + slotRolling;

      // 루징 계산
      const casinoLosable = Math.max(0, (casinoBet - casinoWin) - casinoRolling);
      const slotLosable = Math.max(0, (slotBet - slotWin) - slotRolling);
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
        slotBet,
        slotWin,
        totalBet,
        totalWin,
        totalWinLoss,
        totalRolling,
        settlementProfit: totalRolling + totalLosing
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
      totalSettlementProfit: rows.reduce((sum, r) => sum + r.settlementProfit, 0)
    };

    setSummary(summary);
  };

  const setQuickDateRange = (type: 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    let from: Date;
    let to: Date;

    if (type === 'yesterday') {
      from = startOfDay(subDays(today, 1));
      to = endOfDay(subDays(today, 1));
    } else if (type === 'week') {
      from = startOfDay(subDays(today, 7));
      to = endOfDay(today);
    } else {
      from = startOfDay(subDays(today, 30));
      to = endOfDay(today);
    }

    setDateRange({ from, to });
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR').format(Math.round(num));
  };

  return (
    <div className="space-y-6 p-6">
      {/* 1열: 제목 및 주의사항 */}
      <div className="space-y-2">
        <h1 className="text-2xl">관리자 일자 별 정산 내역</h1>
        <div className="flex items-start gap-2 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
          <Info className="size-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-900 dark:text-amber-100">
            <p>• 관리자 일자별 정산 내역은 자신의 하위 회원들의 베팅을 기반으로 한 정산 데이터를 날짜별로 표기합니다.</p>
            <p>• 기간 검색으로 선택한 기간 내 일일 정산 데이터 값을 표기합니다.</p>
            <p>• 정산수익은 롤링금과 루징금의 합계입니다.</p>
          </div>
        </div>
      </div>

      {/* 2열: 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총입금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalDeposit)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총출금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalWithdrawal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">관리자 총입금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.adminTotalDeposit)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">관리자 총출금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.adminTotalWithdrawal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">포인트지급</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.pointGiven)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">포인트회수</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.pointRecovered)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">입출차액</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.depositWithdrawalDiff)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">카지노 베팅</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.casinoBet)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">카지노 당첨</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.casinoWin)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">슬롯 베팅</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.slotBet)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">슬롯 당첨</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.slotWin)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총베팅</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalBet)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총당첨</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalWin)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">윈로스</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalWinLoss)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총롤링금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalRolling)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">정산수익</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalSettlementProfit)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 3열: 필터 영역 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* 기간 검색 */}
            <div className="space-y-2">
              <label className="text-xs">기간 검색</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left", !dateRange && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 size-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "yyyy년 MM월 dd일", { locale: ko })} - {format(dateRange.to, "yyyy년 MM월 dd일", { locale: ko })}
                        </>
                      ) : (
                        format(dateRange.from, "yyyy년 MM월 dd일", { locale: ko })
                      )
                    ) : (
                      <span>날짜를 선택하세요</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
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
            </div>

            {/* 단축 날짜 버튼 */}
            <div className="space-y-2">
              <label className="text-xs">단축 선택</label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setQuickDateRange('yesterday')}>
                  어제
                </Button>
                <Button size="sm" variant="outline" onClick={() => setQuickDateRange('week')}>
                  일주일
                </Button>
                <Button size="sm" variant="outline" onClick={() => setQuickDateRange('month')}>
                  한달
                </Button>
              </div>
            </div>

            {/* 새로고침 */}
            <div className="space-y-2">
              <label className="text-xs">&nbsp;</label>
              <Button onClick={fetchSettlementData} disabled={loading}>
                <RefreshCw className={cn("size-4 mr-2", loading && "animate-spin")} />
                새로고침
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4열: 데이터 테이블 */}
      <Card>
        <CardContent className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left" rowSpan={2}>날짜</th>
                    <th className="p-2 text-right" rowSpan={2}>총입금</th>
                    <th className="p-2 text-right" rowSpan={2}>총출금</th>
                    <th className="p-2 text-right" rowSpan={2}>관리자<br/>총입금</th>
                    <th className="p-2 text-right" rowSpan={2}>관리자<br/>총출금</th>
                    <th className="p-2 text-right" rowSpan={2}>포인트<br/>지급</th>
                    <th className="p-2 text-right" rowSpan={2}>포인트<br/>회수</th>
                    <th className="p-2 text-right" rowSpan={2}>입출<br/>차액</th>
                    <th className="p-2 text-center" colSpan={2}>카지노</th>
                    <th className="p-2 text-center" colSpan={2}>슬롯</th>
                    <th className="p-2 text-right" rowSpan={2}>총베팅</th>
                    <th className="p-2 text-right" rowSpan={2}>총당첨</th>
                    <th className="p-2 text-right" rowSpan={2}>윈로스</th>
                    <th className="p-2 text-right" rowSpan={2}>총롤링금</th>
                    <th className="p-2 text-right" rowSpan={2}>정산수익</th>
                  </tr>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-center">베팅</th>
                    <th className="p-2 text-center">당첨</th>
                    <th className="p-2 text-center">베팅</th>
                    <th className="p-2 text-center">당첨</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr key={row.date} className={cn(
                      "border-b",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/30"
                    )}>
                      <td className="p-2">{row.date}</td>
                      <td className="p-2 text-right">{formatNumber(row.deposit)}</td>
                      <td className="p-2 text-right">{formatNumber(row.withdrawal)}</td>
                      <td className="p-2 text-right">{formatNumber(row.adminDeposit)}</td>
                      <td className="p-2 text-right">{formatNumber(row.adminWithdrawal)}</td>
                      <td className="p-2 text-right">{formatNumber(row.pointGiven)}</td>
                      <td className="p-2 text-right">{formatNumber(row.pointRecovered)}</td>
                      <td className="p-2 text-right">{formatNumber(row.depositWithdrawalDiff)}</td>
                      <td className="p-2 text-right">{formatNumber(row.casinoBet)}</td>
                      <td className="p-2 text-right">{formatNumber(row.casinoWin)}</td>
                      <td className="p-2 text-right">{formatNumber(row.slotBet)}</td>
                      <td className="p-2 text-right">{formatNumber(row.slotWin)}</td>
                      <td className="p-2 text-right">{formatNumber(row.totalBet)}</td>
                      <td className="p-2 text-right">{formatNumber(row.totalWin)}</td>
                      <td className="p-2 text-right">{formatNumber(row.totalWinLoss)}</td>
                      <td className="p-2 text-right">{formatNumber(row.totalRolling)}</td>
                      <td className="p-2 text-right">{formatNumber(row.settlementProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5열: 계산 방식 설명 */}
      <Card>
        <CardHeader>
          <CardTitle>계산 방식</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="font-medium mb-2">기본 계산</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 총롤링금 = 총베팅 × 롤링률</li>
                <li>• 루징금 = (윈로스 - 롤링금) × 루징률</li>
                <li>• 윈로스 = 총베팅 - 총당첨</li>
              </ul>
            </div>
            
            <div>
              <p className="font-medium mb-2">정산 수익</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 정산수익 = 총롤링금 + 루징금</li>
                <li>• 입출차액 = 총입금 - 총출금 + 관리자입금 - 관리자출금</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
