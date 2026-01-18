import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, ChevronDown, ChevronRight, TrendingUp, TrendingDown, DollarSign, Wallet, AlertCircle, Users } from "lucide-react";
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
  casinoRollingRate: number;
  casinoLosingRate: number;
  slotRollingRate: number;
  slotLosingRate: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  ggr: number;
  casinoIndividualRolling: number;
  slotIndividualRolling: number;
  totalRolling: number;
  totalLosing: number;
  totalIndividualRolling: number;
  totalIndividualLosing: number;
  hasChildren?: boolean;
  depth?: number;
}

interface SummaryStats {
  totalDeposit: number;
  totalWithdrawal: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  totalRolling: number;
  totalLosing: number;
}

export function CommissionSettlement({ user }: CommissionSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [data, setData] = useState<PartnerSettlementRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [summary, setSummary] = useState<SummaryStats>({
    totalDeposit: 0,
    totalWithdrawal: 0,
    totalBet: 0,
    totalWin: 0,
    totalWinLoss: 0,
    totalRolling: 0,
    totalLosing: 0
  });

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

  const getRowBackgroundColor = (level: number): string => {
    switch (level) {
      case 2: return 'rgba(239, 68, 68, 0.15)'; // 대본 - 빨강
      case 3: return 'rgba(59, 130, 246, 0.15)'; // 본사 - 파랑
      case 4: return 'rgba(34, 197, 94, 0.15)'; // 부본 - 초록
      case 5: return 'rgba(234, 179, 8, 0.15)'; // 총판 - 노랑
      case 6: return 'rgba(168, 85, 247, 0.15)'; // 매장 - 보라
      default: return 'transparent';
    }
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 2: return "대본";
      case 3: return "본사";
      case 4: return "부본";
      case 5: return "총판";
      case 6: return "매장";
      default: return "";
    }
  };

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      console.log('🔍 [파트너별정산] 데이터 조회 시작', {
        dateRange: {
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString()
        },
        user: { id: user.id, username: user.username, level: user.level }
      });

      // 본인의 하위 파트너 조회 (재귀적)
      const descendantPartnerIds = await getDescendantPartnerIds(user.id);
      const allPartnerIds = [user.id, ...descendantPartnerIds];
      console.log('✅ 허용된 파트너:', allPartnerIds.length, '개');

      // 파트너 정보 조회 (Lv2~Lv6만)
      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('*')
        .in('id', allPartnerIds)
        .gte('level', 2)
        .lte('level', 6)
        .order('level', { ascending: true })
        .order('username', { ascending: true });

      if (partnersError) throw partnersError;
      console.log('✅ 파트너 데이터:', partners?.length || 0, '개');

      // 병렬 처리를 위한 Promise 배열
      const partnerPromises = (partners || []).map(async (partner) => {
        // ✅ 전체 하위 회원 ID 조회 (재귀)
        const userIds = await getAllDescendantUserIds(partner.id);
        console.log(`  🎯 [${partner.username}] 전체 하위 회원: ${userIds.length}명`);

        // 병렬로 데이터 조회
        const [transactionsResult, pointTransactionsResult, gameRecordsResult, childrenResult, childrenRolling, childrenLosing] = await Promise.all([
          // 입출금 데이터
          supabase
            .from('transactions')
            .select('*')
            .gte('created_at', dateRange.from!.toISOString())
            .lte('created_at', dateRange.to!.toISOString())
            .in('user_id', userIds),
          
          // 포인트 데이터
          supabase
            .from('point_transactions')
            .select('*')
            .gte('created_at', dateRange.from!.toISOString())
            .lte('created_at', dateRange.to!.toISOString())
            .in('user_id', userIds),
          
          // 게임 데이터
          supabase
            .from('game_records')
            .select('game_type, bet_amount, win_amount')
            .gte('played_at', dateRange.from!.toISOString())
            .lte('played_at', dateRange.to!.toISOString())
            .in('user_id', userIds),
          
          // 하위 파트너 확인
          supabase
            .from('partners')
            .select('id')
            .eq('parent_id', partner.id)
            .limit(1),
          
          // 하위 파트너 롤링
          getChildrenRolling(partner.id, dateRange.from!, dateRange.to!),
          
          // 하위 파트너 루징
          getChildrenLosing(partner.id, dateRange.from!, dateRange.to!)
        ]);

        const transactions = transactionsResult.data || [];
        const pointTransactions = pointTransactionsResult.data || [];
        const gameRecords = gameRecordsResult.data || [];
        const children = childrenResult.data || [];

        const deposit = transactions
          .filter(t => t.transaction_type === 'deposit' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0);

        const withdrawal = transactions
          .filter(t => t.transaction_type === 'withdrawal' && t.status === 'approved')
          .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

        const adminDeposit = transactions
          .filter(t => t.transaction_type === 'partner_deposit' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0);

        const adminWithdrawal = transactions
          .filter(t => t.transaction_type === 'partner_withdrawal' && t.status === 'approved')
          .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

        const pointGiven = pointTransactions
          .filter(pt => pt.type === 'admin_give')
          .reduce((sum, pt) => sum + (pt.amount || 0), 0);

        const pointRecovered = pointTransactions
          .filter(pt => pt.type === 'admin_deduct')
          .reduce((sum, pt) => sum + (pt.amount || 0), 0);

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

        const totalBet = casinoBet + slotBet;
        const totalWin = casinoWin + slotWin;
        const totalWinLoss = totalBet - totalWin;

        // 커미션 계산
        const casinoRollingRate = partner.casino_rolling_commission || 0;
        const casinoLosingRate = partner.casino_losing_commission || 0;
        const slotRollingRate = partner.slot_rolling_commission || 0;
        const slotLosingRate = partner.slot_losing_commission || 0;

        // 롤링 계산
        const casinoTotalRolling = casinoBet * (casinoRollingRate / 100);
        const slotTotalRolling = slotBet * (slotRollingRate / 100);

        const casinoIndividualRolling = Math.max(0, casinoTotalRolling - childrenRolling.casino);
        const slotIndividualRolling = Math.max(0, slotTotalRolling - childrenRolling.slot);

        // 루징 계산
        const casinoWinLoss = casinoBet - casinoWin;
        const slotWinLoss = slotBet - slotWin;
        
        const casinoLosable = Math.max(0, casinoWinLoss - casinoTotalRolling);
        const slotLosable = Math.max(0, slotWinLoss - slotTotalRolling);
        
        const casinoTotalLosing = casinoLosable * (casinoLosingRate / 100);
        const slotTotalLosing = slotLosable * (slotLosingRate / 100);

        const casinoIndividualLosing = Math.max(0, casinoTotalLosing - childrenLosing.casino);
        const slotIndividualLosing = Math.max(0, slotTotalLosing - childrenLosing.slot);

        return {
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
          casinoRollingRate,
          casinoLosingRate,
          slotRollingRate,
          slotLosingRate,
          totalBet,
          totalWin,
          totalWinLoss,
          ggr: totalWinLoss,
          casinoIndividualRolling,
          slotIndividualRolling,
          totalRolling: casinoTotalRolling + slotTotalRolling,
          totalLosing: casinoTotalLosing + slotTotalLosing,
          totalIndividualRolling: casinoIndividualRolling + slotIndividualRolling,
          totalIndividualLosing: casinoIndividualLosing + slotIndividualLosing,
          hasChildren: children.length > 0,
          depth: 0
        };
      });

      // 모든 파트너 데이터를 병렬로 처리
      const rows = await Promise.all(partnerPromises);

      console.log('✅ 파트너별 정산 데이터 처리 완료:', rows.length, '개');
      setData(rows);
      calculateSummary(rows);

    } catch (error) {
      console.error('❌ 정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = (rows: PartnerSettlementRow[]) => {
    const summary: SummaryStats = {
      totalDeposit: rows.reduce((sum, r) => sum + r.deposit, 0),
      totalWithdrawal: rows.reduce((sum, r) => sum + r.withdrawal, 0),
      totalBet: rows.reduce((sum, r) => sum + r.totalBet, 0),
      totalWin: rows.reduce((sum, r) => sum + r.totalWin, 0),
      totalWinLoss: rows.reduce((sum, r) => sum + r.totalWinLoss, 0),
      totalRolling: rows.reduce((sum, r) => sum + r.totalIndividualRolling, 0),
      totalLosing: rows.reduce((sum, r) => sum + r.totalIndividualLosing, 0)
    };
    setSummary(summary);
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

  // ✅ NEW: 파트너의 전체 하위 회원 ID 조회 (재귀)
  const getAllDescendantUserIds = async (partnerId: string): Promise<string[]> => {
    // 1. 직속 회원
    const { data: directUsers } = await supabase
      .from('users')
      .select('id')
      .eq('referrer_id', partnerId);
    
    let allUserIds = directUsers?.map(u => u.id) || [];
    
    // 2. 하위 파트너들
    const { data: childPartners } = await supabase
      .from('partners')
      .select('id')
      .eq('parent_id', partnerId);
    
    // 3. 하위 파트너들의 회원까지 재귀적으로 조회
    if (childPartners && childPartners.length > 0) {
      for (const childPartner of childPartners) {
        const childUserIds = await getAllDescendantUserIds(childPartner.id);
        allUserIds.push(...childUserIds);
      }
    }
    
    return allUserIds;
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
        .gte('played_at', fromDate.toISOString())
        .lte('played_at', toDate.toISOString())
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
        .gte('played_at', fromDate.toISOString())
        .lte('played_at', toDate.toISOString())
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

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const toggleExpandAll = () => {
    if (expandAll) {
      setExpandedRows(new Set());
      setExpandAll(false);
    } else {
      const allIds = data.filter(r => r.hasChildren).map(r => r.id);
      setExpandedRows(new Set(allIds));
      setExpandAll(true);
    }
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
            파트너별 정산
          </h1>
          <p className="text-muted-foreground">
            하위 파트너들의 정산 데이터를 확인합니다
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
            <p>• 파트너별 정산 내역은 각 파트너의 직속 회원들의 베팅 데이터를 기반으로 정산 내역을 표시합니다.</p>
            <p>• 개별롤링 = 본인 전체 롤링 - 하위 파트너 전체 롤링으로 계산됩니다.</p>
            <p>• 롤링금/낙첨금은 하위 파트너를 제외한 본인의 순수 정산 수익입니다.</p>
          </div>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-4">
        <MetricCard
          title="총 입금"
          value={`${formatNumber(summary.totalDeposit)}원`}
          subtitle="파트너 전체 입금"
          icon={TrendingUp}
          color="emerald"
        />

        <MetricCard
          title="총 출금"
          value={`${formatNumber(summary.totalWithdrawal)}원`}
          subtitle="파트너 전체 출금"
          icon={TrendingDown}
          color="rose"
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
          subtitle="베팅 대비 당첨"
          icon={DollarSign}
          color="purple"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <MetricCard
          title="윈로스"
          value={`${formatNumber(summary.totalWinLoss)}원`}
          subtitle="베팅 - 당첨"
          icon={TrendingUp}
          color="amber"
        />

        <MetricCard
          title="총 롤링금"
          value={`${formatNumber(summary.totalRolling)}원`}
          subtitle="개별 롤링 합계"
          icon={DollarSign}
          color="emerald"
        />

        <MetricCard
          title="총 루징금"
          value={`${formatNumber(summary.totalLosing)}원`}
          subtitle="개별 루징 합계"
          icon={DollarSign}
          color="teal"
        />

        <MetricCard
          title="정산 수익"
          value={`${formatNumber(summary.totalRolling + summary.totalLosing)}원`}
          subtitle="롤링금 + 루징금"
          icon={Wallet}
          color="green"
        />
      </div>

      {/* 파트너별 정산 데이터 테이블 */}
      <div className="glass-card rounded-xl p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-8 w-8 text-slate-400" />
            <h3 className="text-2xl font-semibold text-slate-100">파트너별 정산 데이터</h3>
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
            <Input
              placeholder="파트너 ID 검색..."
              className="input-premium"
              value={codeSearch}
              onChange={(e) => setCodeSearch(e.target.value)}
            />
          </div>

          {/* 전체 펼치기/접기 */}
          <Button
            onClick={toggleExpandAll}
            variant="outline"
            className="h-10"
          >
            {expandAll ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
            {expandAll ? '전체 접기' : '전체 펼치기'}
          </Button>
        </div>

        {/* 데이터 테이블 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            파트너 정산 데이터가 없습니다.
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
                  <th className="px-4 py-3 text-center text-white font-normal sticky left-0 bg-slate-900 z-10 whitespace-nowrap">등급</th>
                  <th className="px-4 py-3 text-left text-white font-normal sticky left-[80px] bg-slate-900 z-10 whitespace-nowrap">아이디</th>
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
                  <th className="px-4 py-3 text-right text-white font-normal bg-blue-950/60 whitespace-nowrap">총베팅</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-blue-950/60 whitespace-nowrap">총당첨</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-purple-950/60 whitespace-nowrap">GGR</th>
                  
                  {/* 개별 롤링 - 에메랄드 계열 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-emerald-950/60 whitespace-nowrap">카지노개별롤링</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-emerald-950/60 whitespace-nowrap">슬롯개별롤링</th>
                  
                  {/* 정산 결과 - 틸/로즈 계열 */}
                  <th className="px-4 py-3 text-right text-white font-normal bg-teal-950/60 whitespace-nowrap">전체롤링</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-teal-950/60 whitespace-nowrap">전체루징</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-green-950/70 whitespace-nowrap">롤링금</th>
                  <th className="px-4 py-3 text-right text-white font-normal bg-green-950/70 whitespace-nowrap">루징금</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row) => (
                  <tr 
                    key={row.id} 
                    className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                    style={{ backgroundColor: getRowBackgroundColor(row.level) }}
                  >
                    <td className="px-4 py-3 text-center text-slate-200 font-semibold sticky left-0 z-10 whitespace-nowrap" style={{ backgroundColor: getRowBackgroundColor(row.level) || 'rgb(15 23 42 / 0.95)' }}>
                      <div className="flex items-center justify-center gap-1">
                        {row.hasChildren && (
                          <button
                            onClick={() => toggleRow(row.id)}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            {expandedRows.has(row.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                        <span>{row.levelName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-mono sticky left-[80px] z-10 whitespace-nowrap" style={{ backgroundColor: getRowBackgroundColor(row.level) || 'rgb(15 23 42 / 0.95)' }}>
                      {row.username}
                    </td>
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
                    <td className="px-4 py-3 text-right text-blue-400 font-mono whitespace-nowrap">{formatNumber(row.totalBet)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.totalWin)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-mono whitespace-nowrap">{formatNumber(row.ggr)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono whitespace-nowrap">{formatNumber(row.casinoIndividualRolling)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono whitespace-nowrap">{formatNumber(row.slotIndividualRolling)}</td>
                    <td className="px-4 py-3 text-right text-teal-400 font-mono whitespace-nowrap">{formatNumber(row.totalRolling)}</td>
                    <td className="px-4 py-3 text-right text-teal-400 font-mono whitespace-nowrap">{formatNumber(row.totalLosing)}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-mono font-semibold whitespace-nowrap">{formatNumber(row.totalIndividualRolling)}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-mono font-semibold whitespace-nowrap">{formatNumber(row.totalIndividualLosing)}</td>
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
                <span className="text-cyan-400 font-semibold min-w-[120px]">전체롤링:</span>
                <span>베팅액 × 롤링%</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-semibold min-w-[120px]">개별롤링:</span>
                <span>전체롤링 - 하위 파트너 전체롤링</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-semibold min-w-[120px]">전체루징:</span>
                <span>(윈로스 - 전체롤링) × 루징%</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-semibold min-w-[120px]">개별루징:</span>
                <span>전체루징 - 하위 파트너 전체루징</span>
              </div>
            </div>
          </div>

          {/* 우측: 정산 특이사항 */}
          <div>
            <h4 className="text-lg font-semibold text-slate-200 mb-3">파트너 정산 특이사항</h4>
            <div className="space-y-2 text-slate-400">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[120px]">롤링금:</span>
                <span>본인의 순수 개별롤링 (하위 제외)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[120px]">루징금:</span>
                <span>본인의 순수 개별루징 (하위 제외)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[120px]">정산수익:</span>
                <span>롤링금 + 루징금</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-semibold min-w-[120px]">계층구조:</span>
                <span>대본 → 본사 → 부본 → 총판 → 매장</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}