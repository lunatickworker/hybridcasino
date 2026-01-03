import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Search, Info, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ko } from "date-fns/locale";

interface CommissionSettlementProps {
  user: Partner;
}

interface PartnerSettlementRow {
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
  // 카지노
  casinoBet: number;
  casinoWin: number;
  casinoWinLoss: number;
  casinoRollingRate: number;
  casinoLosingRate: number;
  casinoTotalRolling: number;
  casinoChildrenRolling: number;
  casinoIndividualRolling: number;
  casinoTotalLosing: number;
  casinoChildrenLosing: number;
  casinoIndividualLosing: number;
  // 슬롯
  slotBet: number;
  slotWin: number;
  slotWinLoss: number;
  slotRollingRate: number;
  slotLosingRate: number;
  slotTotalRolling: number;
  slotChildrenRolling: number;
  slotIndividualRolling: number;
  slotTotalLosing: number;
  slotChildrenLosing: number;
  slotIndividualLosing: number;
  // 합계
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  ggr: number;
  totalRolling: number;
  totalIndividualRolling: number;
  totalLosing: number;
  totalIndividualLosing: number;
  totalSettlement: number;
  // 확장 상태
  isExpanded?: boolean;
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
}

export function CommissionSettlement({ user }: CommissionSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [codeSearch, setCodeSearch] = useState("");
  const [expandAll, setExpandAll] = useState(false);
  const [data, setData] = useState<PartnerSettlementRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
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

  const getLevelName = (level: number): string => {
    switch (level) {
      case 2: return "본사";
      case 3: return "부본";
      case 4: return "총판";
      case 5: return "매장";
      default: return "";
    }
  };

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      // 1. 본인의 하위 파트너 조회 (재귀적)
      const descendantPartnerIds = await getDescendantPartnerIds(user.id);
      const allPartnerIds = [user.id, ...descendantPartnerIds];

      // 2. 파트너 정보 조회 (Lv2~Lv5만)
      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('*')
        .in('id', allPartnerIds)
        .gte('level', 2)
        .lte('level', 5)
        .order('level', { ascending: true })
        .order('username', { ascending: true });

      if (partnersError) throw partnersError;

      // 3. 각 파트너별 하위 회원 조회
      const rows: PartnerSettlementRow[] = [];

      for (const partner of partners || []) {
        // 하위 회원 ID 조회
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id')
          .eq('referrer_id', partner.id);

        if (usersError) throw usersError;
        const userIds = users?.map(u => u.id) || [];

        // 입출금 데이터
        const { data: transactions } = await supabase
          .from('transactions')
          .select('*')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .in('user_id', userIds);

        const deposit = transactions
          ?.filter(t => t.transaction_type === 'deposit' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const withdrawal = transactions
          ?.filter(t => t.transaction_type === 'withdrawal' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const adminDeposit = transactions
          ?.filter(t => t.transaction_type === 'admin_deposit' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const adminWithdrawal = transactions
          ?.filter(t => t.transaction_type === 'admin_withdrawal' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        // 포인트 데이터
        const { data: pointTransactions } = await supabase
          .from('point_transactions')
          .select('*')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .in('user_id', userIds);

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
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .in('user_id', userIds);

        const casinoBet = gameRecords
          ?.filter(gr => gr.game_type === 'casino')
          .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

        const casinoWin = gameRecords
          ?.filter(gr => gr.game_type === 'casino')
          .reduce((sum, gr) => sum + (gr.win_amount || 0), 0) || 0;

        const slotBet = gameRecords
          ?.filter(gr => gr.game_type === 'slot')
          .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

        const slotWin = gameRecords
          ?.filter(gr => gr.game_type === 'slot')
          .reduce((sum, gr) => sum + (gr.win_amount || 0), 0) || 0;

        const casinoWinLoss = casinoBet - casinoWin;
        const slotWinLoss = slotBet - slotWin;
        const totalWinLoss = casinoWinLoss + slotWinLoss;

        // 커미션 계산
        const casinoRollingRate = partner.casino_rolling_commission || 0;
        const casinoLosingRate = partner.casino_losing_commission || 0;
        const slotRollingRate = partner.slot_rolling_commission || 0;
        const slotLosingRate = partner.slot_losing_commission || 0;

        // 롤링 계산
        const casinoTotalRolling = casinoBet * (casinoRollingRate / 100);
        const slotTotalRolling = slotBet * (slotRollingRate / 100);

        // 하위 파트너의 롤링 합계
        const childrenRolling = await getChildrenRolling(partner.id, dateRange.from, dateRange.to);
        const casinoChildrenRolling = childrenRolling.casino;
        const slotChildrenRolling = childrenRolling.slot;

        const casinoIndividualRolling = Math.max(0, casinoTotalRolling - casinoChildrenRolling);
        const slotIndividualRolling = Math.max(0, slotTotalRolling - slotChildrenRolling);

        // 루징 계산
        const casinoLosable = Math.max(0, casinoWinLoss - casinoTotalRolling);
        const slotLosable = Math.max(0, slotWinLoss - slotTotalRolling);
        
        const casinoTotalLosing = casinoLosable * (casinoLosingRate / 100);
        const slotTotalLosing = slotLosable * (slotLosingRate / 100);

        // 하위 파트너의 루징 합계
        const childrenLosing = await getChildrenLosing(partner.id, dateRange.from, dateRange.to);
        const casinoChildrenLosing = childrenLosing.casino;
        const slotChildrenLosing = childrenLosing.slot;

        const casinoIndividualLosing = Math.max(0, casinoTotalLosing - casinoChildrenLosing);
        const slotIndividualLosing = Math.max(0, slotTotalLosing - slotChildrenLosing);

        // 하위가 있는지 확인
        const { data: children } = await supabase
          .from('partners')
          .select('id')
          .eq('parent_id', partner.id)
          .limit(1);

        rows.push({
          level: partner.level,
          levelName: getLevelName(partner.level),
          id: partner.id,
          username: partner.username,
          balance: partner.balance || 0,
          points: partner.point || 0,
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
          casinoRollingRate,
          casinoLosingRate,
          casinoTotalRolling,
          casinoChildrenRolling,
          casinoIndividualRolling,
          casinoTotalLosing,
          casinoChildrenLosing,
          casinoIndividualLosing,
          slotBet,
          slotWin,
          slotWinLoss,
          slotRollingRate,
          slotLosingRate,
          slotTotalRolling,
          slotChildrenRolling,
          slotIndividualRolling,
          slotTotalLosing,
          slotChildrenLosing,
          slotIndividualLosing,
          totalBet: casinoBet + slotBet,
          totalWin: casinoWin + slotWin,
          totalWinLoss,
          ggr: totalWinLoss,
          totalRolling: casinoTotalRolling + slotTotalRolling,
          totalIndividualRolling: casinoIndividualRolling + slotIndividualRolling,
          totalLosing: casinoTotalLosing + slotTotalLosing,
          totalIndividualLosing: casinoIndividualLosing + slotIndividualLosing,
          totalSettlement: (casinoIndividualRolling + slotIndividualRolling) + (casinoIndividualLosing + slotIndividualLosing),
          hasChildren: (children?.length || 0) > 0
        });
      }

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

  const getChildrenRolling = async (
    parentId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{ casino: number; slot: number }> => {
    let casinoTotal = 0;
    let slotTotal = 0;

    const { data: children } = await supabase
      .from('partners')
      .select('id, casino_rolling_commission, slot_rolling_commission')
      .eq('parent_id', parentId);

    if (!children || children.length === 0) {
      return { casino: 0, slot: 0 };
    }

    for (const child of children) {
      const { data: childUsers } = await supabase
        .from('users')
        .select('id')
        .eq('referrer_id', child.id);

      const childUserIds = childUsers?.map(u => u.id) || [];

      const { data: gameRecords } = await supabase
        .from('game_records')
        .select('game_type, bet_amount')
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString())
        .in('user_id', childUserIds);

      const casinoBet = gameRecords
        ?.filter(gr => gr.game_type === 'casino')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

      const slotBet = gameRecords
        ?.filter(gr => gr.game_type === 'slot')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

      casinoTotal += casinoBet * ((child.casino_rolling_commission || 0) / 100);
      slotTotal += slotBet * ((child.slot_rolling_commission || 0) / 100);
    }

    return { casino: casinoTotal, slot: slotTotal };
  };

  const getChildrenLosing = async (
    parentId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{ casino: number; slot: number }> => {
    let casinoTotal = 0;
    let slotTotal = 0;

    const { data: children } = await supabase
      .from('partners')
      .select('id, casino_rolling_commission, casino_losing_commission, slot_rolling_commission, slot_losing_commission')
      .eq('parent_id', parentId);

    if (!children || children.length === 0) {
      return { casino: 0, slot: 0 };
    }

    for (const child of children) {
      const { data: childUsers } = await supabase
        .from('users')
        .select('id')
        .eq('referrer_id', child.id);

      const childUserIds = childUsers?.map(u => u.id) || [];

      const { data: gameRecords } = await supabase
        .from('game_records')
        .select('game_type, bet_amount, win_amount')
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString())
        .in('user_id', childUserIds);

      const casinoBet = gameRecords
        ?.filter(gr => gr.game_type === 'casino')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

      const casinoWin = gameRecords
        ?.filter(gr => gr.game_type === 'casino')
        .reduce((sum, gr) => sum + (gr.win_amount || 0), 0) || 0;

      const slotBet = gameRecords
        ?.filter(gr => gr.game_type === 'slot')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

      const slotWin = gameRecords
        ?.filter(gr => gr.game_type === 'slot')
        .reduce((sum, gr) => sum + (gr.win_amount || 0), 0) || 0;

      const casinoRolling = casinoBet * ((child.casino_rolling_commission || 0) / 100);
      const slotRolling = slotBet * ((child.slot_rolling_commission || 0) / 100);

      const casinoLosable = Math.max(0, (casinoBet - casinoWin) - casinoRolling);
      const slotLosable = Math.max(0, (slotBet - slotWin) - slotRolling);

      casinoTotal += casinoLosable * ((child.casino_losing_commission || 0) / 100);
      slotTotal += slotLosable * ((child.slot_losing_commission || 0) / 100);
    }

    return { casino: casinoTotal, slot: slotTotal };
  };

  const calculateSummary = (rows: PartnerSettlementRow[]) => {
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
      totalRolling: rows.reduce((sum, r) => sum + r.totalIndividualRolling, 0),
      totalSettlementProfit: rows.reduce((sum, r) => sum + r.totalSettlement, 0)
    };

    setSummary(summary);
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const toggleExpandAll = () => {
    if (expandAll) {
      setExpandedIds(new Set());
    } else {
      const allIds = data.filter(r => r.hasChildren).map(r => r.id);
      setExpandedIds(new Set(allIds));
    }
    setExpandAll(!expandAll);
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

  const filteredData = data.filter(row => {
    if (!codeSearch) return true;
    return row.username.toLowerCase().includes(codeSearch.toLowerCase());
  });

  return (
    <div className="space-y-6 p-6">
      {/* 1열: 제목 */}
      <div className="space-y-2">
        <h1 className="text-2xl">파트너 별 정산 내역</h1>
      </div>

      {/* 2열: 필터 영역 */}
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

            {/* 코드 검색 */}
            <div className="space-y-2">
              <label className="text-xs">코드 검색</label>
              <Input
                placeholder="파트너 ID 검색"
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value)}
                className="w-48"
              />
            </div>

            {/* 펼침/닫힘 */}
            <div className="space-y-2">
              <label className="text-xs">&nbsp;</label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={toggleExpandAll}>
                  {expandAll ? "닫힘" : "펼침"}
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

      {/* 3열: 데이터 테이블 */}
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
                    <th className="p-2 text-left" rowSpan={2}>등급</th>
                    <th className="p-2 text-left" rowSpan={2}>아이디</th>
                    <th className="p-2 text-center" colSpan={2}>보유머니 및 포인트</th>
                    <th className="p-2 text-right" rowSpan={2}>입금</th>
                    <th className="p-2 text-right" rowSpan={2}>출금</th>
                    <th className="p-2 text-right" rowSpan={2}>관리자<br/>입금</th>
                    <th className="p-2 text-right" rowSpan={2}>관리자<br/>출금</th>
                    <th className="p-2 text-right" rowSpan={2}>포인트<br/>지급</th>
                    <th className="p-2 text-right" rowSpan={2}>포인트<br/>회수</th>
                    <th className="p-2 text-right" rowSpan={2}>입출<br/>차액</th>
                    <th className="p-2 text-center" rowSpan={2}>구분</th>
                    <th className="p-2 text-center" colSpan={2}>요율</th>
                    <th className="p-2 text-right" rowSpan={2}>총베팅</th>
                    <th className="p-2 text-right" rowSpan={2}>총당첨</th>
                    <th className="p-2 text-right" rowSpan={2}>윈로스</th>
                    <th className="p-2 text-right" rowSpan={2}>GGR</th>
                    <th className="p-2 text-center" colSpan={5}>정산 내역</th>
                  </tr>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-center">보유<br/>머니</th>
                    <th className="p-2 text-center">롤링<br/>포인트</th>
                    <th className="p-2 text-center">롤링</th>
                    <th className="p-2 text-center">루징</th>
                    <th className="p-2 text-center">개별<br/>롤링</th>
                    <th className="p-2 text-center">총<br/>롤링금</th>
                    <th className="p-2 text-center">총<br/>루징</th>
                    <th className="p-2 text-center">롤링금</th>
                    <th className="p-2 text-center">낙첨금</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => {
                    const isExpanded = expandedIds.has(row.id);
                    return [
                      /* Casino Row */
                      <tr key={`${row.id}-casino`} className={cn(
                        "border-b",
                        idx % 2 === 0 ? "bg-background" : "bg-muted/30"
                      )}>
                        <td className="p-2" rowSpan={2}>
                          <div className="flex items-center gap-1">
                            {row.hasChildren && (
                              <button onClick={() => toggleExpand(row.id)} className="hover:bg-muted rounded p-1">
                                {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                              </button>
                            )}
                            {row.levelName}
                          </div>
                        </td>
                        <td className="p-2" rowSpan={2}>{row.username}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.balance)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.points)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.deposit)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.withdrawal)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.adminDeposit)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.adminWithdrawal)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.pointGiven)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.pointRecovered)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.depositWithdrawalDiff)}</td>
                        <td className="p-2 text-center">Casino</td>
                        <td className="p-2 text-center">{row.casinoRollingRate}</td>
                        <td className="p-2 text-center">{row.casinoLosingRate}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalBet)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalWin)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalWinLoss)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.ggr)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalIndividualRolling)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalRolling)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalLosing)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalIndividualRolling)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalIndividualLosing)}</td>
                      </tr>,
                      /* Slot Row */
                      <tr key={`${row.id}-slot`} className={cn(
                        "border-b",
                        idx % 2 === 0 ? "bg-background" : "bg-muted/30"
                      )}>
                        <td className="p-2 text-center">Slot</td>
                        <td className="p-2 text-center">{row.slotRollingRate}</td>
                        <td className="p-2 text-center">{row.slotLosingRate}</td>
                      </tr>
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4열: 계산 방식 설명 */}
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
                <li>• 총루징 = (윈로스 - 총롤링금) × 루징률</li>
                <li>• 윈로스 = 총베팅 - 총당첨</li>
              </ul>
            </div>
            
            <div>
              <p className="font-medium mb-2">개별 정산 계산</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 개별롤링 = 본인 전체 롤링 - 하위 파트너 전체 롤링</li>
                <li>• 롤링금 = 개별롤링 (하위 제외한 본인 몫)</li>
                <li>• 낙첨금 = 본인 전체 루징 - 하위 파트너 전체 루징</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}