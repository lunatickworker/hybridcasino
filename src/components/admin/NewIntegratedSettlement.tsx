import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Search, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Users } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from "../../lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { Partner } from "../../types";

interface NewIntegratedSettlementProps {
  user: Partner;
}

interface SettlementRow {
  level: number;
  levelName: string;
  id: string;
  username: string;
  // 정산률
  casinoRollingRate: number;
  slotRollingRate: number;
  casinoLosingRate: number;
  slotLosingRate: number;
  // 보유자산
  balance: number;
  points: number;
  // 온라인 입출금
  onlineDeposit: number;
  onlineWithdrawal: number;
  // 수동 입출금
  manualDeposit: number;
  manualWithdrawal: number;
  // 포인트 관리
  pointGiven: number;
  pointRecovered: number;
  // 입출차액
  depositWithdrawalDiff: number;
  // 게임 실적
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
  // GGR 합산
  ggr: number;
  // 실정산 (총 롤링금/총 루징)
  totalRolling: number;
  totalLosing: number;
  // 코드별 실정산 (롤링금/루징)
  individualRolling: number;
  individualLosing: number;
  parentId?: string;
  hasChildren?: boolean;
}

interface SummaryStats {
  casinoRollingRate: number;
  slotRollingRate: number;
  casinoLosingRate: number;
  slotLosingRate: number;
  totalBalance: number;
  totalPoints: number;
  onlineDeposit: number;
  onlineWithdrawal: number;
  manualDeposit: number;
  manualWithdrawal: number;
  pointGiven: number;
  pointRecovered: number;
  depositWithdrawalDiff: number;
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
  ggr: number;
  totalRolling: number;
  totalLosing: number;
  individualRolling: number;
  individualLosing: number;
}

export function NewIntegratedSettlement({ user }: NewIntegratedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [data, setData] = useState<SettlementRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [summary, setSummary] = useState<SummaryStats>({
    casinoRollingRate: 0,
    slotRollingRate: 0,
    casinoLosingRate: 0,
    slotLosingRate: 0,
    totalBalance: 0,
    totalPoints: 0,
    onlineDeposit: 0,
    onlineWithdrawal: 0,
    manualDeposit: 0,
    manualWithdrawal: 0,
    pointGiven: 0,
    pointRecovered: 0,
    depositWithdrawalDiff: 0,
    casinoBet: 0,
    casinoWin: 0,
    slotBet: 0,
    slotWin: 0,
    ggr: 0,
    totalRolling: 0,
    totalLosing: 0,
    individualRolling: 0,
    individualLosing: 0
  });

  // ✅ 모든 레벨 접근 가능 (Lv1~Lv6)

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

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
      const allIds = new Set(data.filter(r => r.hasChildren).map(r => r.id));
      setExpandedRows(allIds);
      setExpandAll(true);
    }
  };

  const getRowBackgroundColor = (level: number): string => {
    switch (level) {
      case 1: return 'rgba(147, 51, 234, 0.08)';
      case 2: return 'rgba(239, 68, 68, 0.08)';
      default: return 'transparent';
    }
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 1: return '슈퍼관리자';
      case 2: return '운영사';
      default: return '회원';
    }
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const calculateSummary = (rows: SettlementRow[]) => {
    const filtered = getFilteredRows(rows);
    const s: SummaryStats = {
      casinoRollingRate: 0,
      slotRollingRate: 0,
      casinoLosingRate: 0,
      slotLosingRate: 0,
      totalBalance: filtered.reduce((sum, r) => sum + r.balance, 0),
      totalPoints: filtered.reduce((sum, r) => sum + r.points, 0),
      onlineDeposit: filtered.reduce((sum, r) => sum + r.onlineDeposit, 0),
      onlineWithdrawal: filtered.reduce((sum, r) => sum + r.onlineWithdrawal, 0),
      manualDeposit: filtered.reduce((sum, r) => sum + r.manualDeposit, 0),
      manualWithdrawal: filtered.reduce((sum, r) => sum + r.manualWithdrawal, 0),
      pointGiven: filtered.reduce((sum, r) => sum + r.pointGiven, 0),
      pointRecovered: filtered.reduce((sum, r) => sum + r.pointRecovered, 0),
      depositWithdrawalDiff: filtered.reduce((sum, r) => sum + r.depositWithdrawalDiff, 0),
      casinoBet: filtered.reduce((sum, r) => sum + r.casinoBet, 0),
      casinoWin: filtered.reduce((sum, r) => sum + r.casinoWin, 0),
      slotBet: filtered.reduce((sum, r) => sum + r.slotBet, 0),
      slotWin: filtered.reduce((sum, r) => sum + r.slotWin, 0),
      ggr: filtered.reduce((sum, r) => sum + r.ggr, 0),
      totalRolling: filtered.reduce((sum, r) => sum + r.totalRolling, 0),
      totalLosing: filtered.reduce((sum, r) => sum + r.totalLosing, 0),
      individualRolling: filtered.reduce((sum, r) => sum + r.individualRolling, 0),
      individualLosing: filtered.reduce((sum, r) => sum + r.individualLosing, 0)
    };
    setSummary(s);
  };

  const getFilteredRows = (rows: SettlementRow[]): SettlementRow[] => {
    let filtered = rows;
    if (codeSearch.trim()) {
      filtered = filtered.filter(r => r.username.toLowerCase().includes(codeSearch.toLowerCase()));
    }
    return filtered;
  };

  const getVisibleRows = (): SettlementRow[] => {
    const filtered = getFilteredRows(data);
    const visible: SettlementRow[] = [];

    const addRowWithChildren = (row: SettlementRow) => {
      visible.push(row);
      if (row.level > 0 && expandedRows.has(row.id)) {
        const childPartners = filtered.filter(r => r.parentId === row.id);
        childPartners.forEach(child => addRowWithChildren(child));
        const childUsers = filtered.filter(r => r.level === 0 && (r as any).referrerId === row.id);
        childUsers.forEach(user => visible.push(user));
      }
    };

    const topLevelRows = filtered.filter(r => {
      if (r.level === 0) return false;
      if (!r.parentId) return true;
      return !filtered.some(parent => parent.id === r.parentId);
    });

    topLevelRows.forEach(row => addRowWithChildren(row));
    return visible;
  };

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      let allowedPartnerIds: string[] = [];
      
      if (user.level === 1) {
        const { data: allPartners, error: partnersError } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 2);
        
        if (partnersError) {
          console.error('❌ 파트너 조회 실패:', partnersError);
          allowedPartnerIds = [];
        } else {
          allowedPartnerIds = (allPartners || []).map(p => p.id);
        }
      } else {
        allowedPartnerIds = [user.id];
      }

      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('*')
        .in('id', allowedPartnerIds)
        .order('username', { ascending: true });

      if (partnersError) throw partnersError;

      const filteredPartners = (partners || []).filter(p => p.id !== user.id);

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('referrer_id', allowedPartnerIds)
        .order('username', { ascending: true });

      if (usersError) throw usersError;

      const targetUserIds = [...(users?.map(u => u.id) || []), ...(partners?.map(p => p.id) || [])];
      
      let transactionsQuery = supabase.from('transactions').select('*');
      const userOnlyIds = users?.map(u => u.id) || [];
      const partnerOnlyIds = partners?.map(p => p.id) || [];
      
      if (userOnlyIds.length > 0 && partnerOnlyIds.length > 0) {
        transactionsQuery = transactionsQuery.or(`user_id.in.(${userOnlyIds.join(',')}),partner_id.in.(${partnerOnlyIds.join(',')})`);
      } else if (userOnlyIds.length > 0) {
        transactionsQuery = transactionsQuery.in('user_id', userOnlyIds);
      } else if (partnerOnlyIds.length > 0) {
        transactionsQuery = transactionsQuery.in('partner_id', partnerOnlyIds);
      }
      
      transactionsQuery = transactionsQuery
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());
      
      const { data: transactionsData, error: transError } = await transactionsQuery;
      if (transError) throw transError;

      let partnerBalanceLogsQuery = supabase.from('partner_balance_logs').select('*').in('transaction_type', ['deposit', 'withdrawal']);
      if (user.level > 1) {
        partnerBalanceLogsQuery = partnerBalanceLogsQuery.or(
          `partner_id.in.(${allowedPartnerIds.join(',')}),from_partner_id.in.(${allowedPartnerIds.join(',')}),to_partner_id.in.(${allowedPartnerIds.join(',')})`
        );
      }
      partnerBalanceLogsQuery = partnerBalanceLogsQuery
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());
      
      const { data: partnerBalanceLogs, error: balanceLogsError } = await partnerBalanceLogsQuery;
      if (balanceLogsError) throw balanceLogsError;

      let pointTransactionsQuery = supabase.from('point_transactions').select('*').in('user_id', targetUserIds);
      pointTransactionsQuery = pointTransactionsQuery
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());
      
      const { data: pointTransactions, error: pointError } = await pointTransactionsQuery;
      if (pointError) throw pointError;

      let gameRecordsQuery = supabase.from('game_records').select('*').in('user_id', targetUserIds);
      gameRecordsQuery = gameRecordsQuery
        .gte('played_at', dateRange.from.toISOString())
        .lte('played_at', dateRange.to.toISOString());
      
      const { data: gameRecords, error: gameError } = await gameRecordsQuery;
      if (gameError) throw gameError;

      const rows = processSettlementData(filteredPartners || [], users || [], transactionsData || [], pointTransactions || [], gameRecords || [], partnerBalanceLogs || []);
      setData(rows);
      calculateSummary(rows);

    } catch (error) {
      console.error('❌ 정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const processSettlementData = (
    partners: any[],
    users: any[],
    transactions: any[],
    pointTransactions: any[],
    gameRecords: any[],
    partnerBalanceLogs: any[]
  ): SettlementRow[] => {
    const rows: SettlementRow[] = [];

    for (const partner of partners) {
      const hasChildren = partners.some(p => p.parent_id === partner.id) || users.some(u => u.referrer_id === partner.id);
      const row = calculateRowData(partner.id, partner.username, partner.level, partner.balance || 0, 0,
        partner.casino_rolling_commission || 0, partner.casino_losing_commission || 0,
        partner.slot_rolling_commission || 0, partner.slot_losing_commission || 0,
        transactions, pointTransactions, gameRecords, partners, users, partnerBalanceLogs);
      rows.push({ ...row, parentId: partner.parent_id, hasChildren });
    }

    for (const userItem of users) {
      const row = calculateRowData(userItem.id, userItem.username, 0, userItem.balance || 0, userItem.points || 0,
        userItem.casino_rolling_commission || userItem.casino_rolling_rate || 0,
        userItem.casino_losing_commission || userItem.casino_losing_rate || 0,
        userItem.slot_rolling_commission || userItem.slot_rolling_rate || 0,
        userItem.slot_losing_commission || userItem.slot_losing_rate || 0,
        transactions, pointTransactions, gameRecords, partners, users, partnerBalanceLogs);
      rows.push({ ...row, hasChildren: false });
    }

    return rows;
  };

  const getAllDescendantUserIds = (partnerId: string, allPartners: any[], allUsers: any[]): string[] => {
    const directUsers = allUsers.filter(u => u.referrer_id === partnerId).map(u => u.id);
    const childPartners = allPartners.filter(p => p.parent_id === partnerId);
    let allUsers_ids = [...directUsers];
    for (const childPartner of childPartners) {
      allUsers_ids = allUsers_ids.concat(getAllDescendantUserIds(childPartner.id, allPartners, allUsers));
    }
    return allUsers_ids;
  };

  const getAllDescendantPartnerIds = (partnerId: string, allPartners: any[]): string[] => {
    const directChildren = allPartners.filter(p => p.parent_id === partnerId);
    let allDescendants = directChildren.map(p => p.id);
    for (const child of directChildren) {
      allDescendants = allDescendants.concat(getAllDescendantPartnerIds(child.id, allPartners));
    }
    return allDescendants;
  };

  const calculateRowData = (
    entityId: string,
    username: string,
    level: number,
    balance: number,
    points: number,
    casinoRollingRate: number,
    casinoLosingRate: number,
    slotRollingRate: number,
    slotLosingRate: number,
    transactions: any[],
    pointTransactions: any[],
    gameRecords: any[],
    partners: any[],
    users: any[],
    partnerBalanceLogs: any[]
  ): SettlementRow => {
    const isPartner = level > 0;

    let relevantUserIdsForTransactions: string[] = isPartner
      ? getAllDescendantUserIds(entityId, partners, users)
      : [entityId];

    const userTransactions = transactions.filter(t => relevantUserIdsForTransactions.includes(t.user_id));
    
    let relevantPartnerIdsForTransactions: string[] = isPartner
      ? [entityId, ...getAllDescendantPartnerIds(entityId, partners)]
      : [];

    const partnerTransactions = transactions.filter(t => 
      (t.transaction_type === 'partner_deposit' || t.transaction_type === 'partner_withdrawal') && 
      relevantPartnerIdsForTransactions.includes(t.partner_id)
    );

    // ✅ 온라인 입출금
    const onlineDeposit = userTransactions
      .filter(t => (t.transaction_type === 'deposit' || t.transaction_type === 'admin_deposit') && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const onlineWithdrawal = userTransactions
      .filter(t => (t.transaction_type === 'withdrawal' || t.transaction_type === 'admin_withdrawal') && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    // ✅ 수동 입출금
    const adminDepositFromTransactions = partnerTransactions
      .filter(t => t.transaction_type === 'partner_deposit' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const adminWithdrawalFromTransactions = partnerTransactions
      .filter(t => t.transaction_type === 'partner_withdrawal' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const relevantBalanceLogs = partnerBalanceLogs.filter(l => 
      relevantPartnerIdsForTransactions.includes(l.partner_id) ||
      relevantPartnerIdsForTransactions.includes(l.from_partner_id) ||
      relevantPartnerIdsForTransactions.includes(l.to_partner_id)
    );
    
    const manualDepositFromLogs = relevantBalanceLogs
      .filter(l => l.transaction_type === 'deposit')
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    const manualWithdrawalFromLogs = relevantBalanceLogs
      .filter(l => l.transaction_type === 'withdrawal')
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    const manualDeposit = adminDepositFromTransactions + manualDepositFromLogs;
    const manualWithdrawal = adminWithdrawalFromTransactions + manualWithdrawalFromLogs;

    // ✅ 포인트 거래
    const userPointTrans = pointTransactions.filter(pt => relevantUserIdsForTransactions.includes(pt.user_id));
    const pointGiven = userPointTrans
      .filter(pt => pt.type === 'commission_earned')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);
    const pointRecovered = userPointTrans
      .filter(pt => pt.type === 'point_to_balance')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);

    // ✅ 게임 기록
    let relevantUserIds: string[] = isPartner
      ? getAllDescendantUserIds(entityId, partners, users)
      : [entityId];
    const relevantGameRecords = gameRecords.filter(gr => relevantUserIds.includes(gr.user_id));

    const casinoBet = Math.abs(relevantGameRecords
      .filter(gr => gr.game_type === 'casino')
      .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const casinoWin = relevantGameRecords
      .filter(gr => gr.game_type === 'casino')
      .reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
    const slotBet = Math.abs(relevantGameRecords
      .filter(gr => gr.game_type === 'slot')
      .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const slotWin = relevantGameRecords
      .filter(gr => gr.game_type === 'slot')
      .reduce((sum, gr) => sum + (gr.win_amount || 0), 0);

    const casinoWinLoss = casinoBet + casinoWin;
    const slotWinLoss = slotBet + slotWin;
    const ggr = casinoWinLoss + slotWinLoss;

    const casinoTotalRolling = casinoBet * (casinoRollingRate / 100);
    const slotTotalRolling = slotBet * (slotRollingRate / 100);
    const totalRolling = casinoTotalRolling + slotTotalRolling;

    const casinoLosableAmount = Math.max(0, casinoWinLoss - casinoTotalRolling);
    const slotLosableAmount = Math.max(0, slotWinLoss - slotTotalRolling);
    const casinoTotalLosing = casinoLosableAmount * (casinoLosingRate / 100);
    const slotTotalLosing = slotLosableAmount * (slotLosingRate / 100);
    const totalLosing = casinoTotalLosing + slotTotalLosing;

    const individualRolling = totalRolling;
    const individualLosing = totalLosing;

    const depositWithdrawalDiff = onlineDeposit + onlineWithdrawal + manualDeposit + manualWithdrawal;

    return {
      level,
      levelName: getLevelName(level),
      id: entityId,
      username,
      casinoRollingRate,
      slotRollingRate,
      casinoLosingRate,
      slotLosingRate,
      balance,
      points,
      onlineDeposit,
      onlineWithdrawal,
      manualDeposit,
      manualWithdrawal,
      pointGiven,
      pointRecovered,
      depositWithdrawalDiff,
      casinoBet,
      casinoWin,
      slotBet,
      slotWin,
      ggr,
      totalRolling,
      totalLosing,
      individualRolling,
      individualLosing
    };
  };

  const visibleRows = getVisibleRows();
  const totalPages = Math.ceil(visibleRows.length / itemsPerPage);
  const paginatedRows = visibleRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
    setDateFilterType(type);
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-cyan-400" />
            New 통합정산
          </h1>
          <p className="text-muted-foreground">
            운영사(Lv1, Lv2) 전용 개별 정산 페이지입니다
          </p>
        </div>
        <Button onClick={fetchSettlementData} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white">
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          새로고침
        </Button>
      </div>

      {/* 필터 영역 */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Button onClick={() => { setDateFilterType('today'); const today = new Date(); setDateRange({ from: startOfDay(today), to: endOfDay(today) }); }} variant={dateFilterType === 'today' ? 'default' : 'outline'} className="h-10">오늘</Button>
          <Button onClick={() => setQuickDateRange('yesterday')} variant={dateFilterType === 'yesterday' ? 'default' : 'outline'} className="h-10">어제</Button>
          <Button onClick={() => setQuickDateRange('week')} variant={dateFilterType === 'week' ? 'default' : 'outline'} className="h-10">일주일</Button>
          <Button onClick={() => setQuickDateRange('month')} variant={dateFilterType === 'month' ? 'default' : 'outline'} className="h-10">한달</Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal input-premium", !dateRange && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "yyyy-MM-dd", { locale: ko })} - {format(dateRange.to, "yyyy-MM-dd", { locale: ko })}</>) : format(dateRange.from, "yyyy-MM-dd", { locale: ko })) : <span>날짜 선택</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700" align="start">
              <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ko} />
            </PopoverContent>
          </Popover>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-6 w-6 text-slate-400" />
            <Input placeholder="코드 검색..." className="pl-10 input-premium" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} />
          </div>

          <Button onClick={toggleExpandAll} variant="outline" className="h-10">
            {expandAll ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
            {expandAll ? '전체 접기' : '전체 펼치기'}
          </Button>
        </div>

        {/* 데이터 테이블 */}
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
        ) : (
          <>
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9FA8DA #E8EAF6' }}>
              <style dangerouslySetInnerHTML={{ __html: `.overflow-x-auto::-webkit-scrollbar { height: 8px; } .overflow-x-auto::-webkit-scrollbar-track { background: #E8EAF6; } .overflow-x-auto::-webkit-scrollbar-thumb { background: #9FA8DA; border-radius: 4px; } .overflow-x-auto::-webkit-scrollbar-thumb:hover { background: #7986CB; } .settlement-table th, .settlement-table td { min-width: max-content; white-space: nowrap; } .settlement-table .compound-cell { display: flex; width: 100%; } .settlement-table .compound-cell > div { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }` }} />
              <table className="w-full settlement-table">
                <thead>
                  <tr className="border-b border-slate-700">
                    {/* 등급 / 아이디 */}
                    <th className="px-4 py-3 text-center text-white font-normal sticky left-0 bg-slate-900 z-10 whitespace-nowrap">등급</th>
                    <th className="px-4 py-3 text-center text-white font-normal bg-slate-900 whitespace-nowrap">아이디</th>
                    
                    {/* 정산 기준 설정 (카지노/슬롯/루징) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-slate-800/70" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">정산 기준 설정</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">카지노</div>
                          <div className="flex-1 py-2 border-r border-slate-700/50">슬롯</div>
                          <div className="flex-1 py-2">루징</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 보유자산 (보유머니/포인트) - 2단 2열 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-indigo-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">보유자산</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">보유머니</div>
                          <div className="flex-1 py-2">포인트</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 온라인 입출금 (입금/출금) - 2단 2열 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-orange-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">온라인 입출금</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">입금</div>
                          <div className="flex-1 py-2">출금</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 수동 입출금 (수동 입금/수동 출금) - 2단 2열 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-rose-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">수동 입출금</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">수동 입금</div>
                          <div className="flex-1 py-2">수동 출금</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 포인트 관리 (포인트지급/포인트회수) - 2단 2열 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-green-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">포인트 관리</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">포인트지급</div>
                          <div className="flex-1 py-2">포인트회수</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 입출차액 */}
                    <th className="px-4 py-3 text-center text-white font-normal bg-cyan-950/60 whitespace-nowrap">입출차액</th>
                    
                    {/* 게임 실적 (카지노 베팅/카지노 당첨/슬롯베팅/슬롯당첨) - 2단 2열 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-blue-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">게임 실적</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">카지노 베팅</div>
                          <div className="flex-1 py-2 border-r border-slate-700/50">카지노 당첨</div>
                          <div className="flex-1 py-2 border-r border-slate-700/50">슬롯베팅</div>
                          <div className="flex-1 py-2">슬롯당첨</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* GGR 합산 */}
                    <th className="px-4 py-3 text-center text-white font-normal bg-amber-950/60 whitespace-nowrap">GGR 합산</th>
                    
                    {/* 실정산 (총 롤링금/총 루징) - 2단 2열 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-teal-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">실정산</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">총 롤링금</div>
                          <div className="flex-1 py-2">총 루징</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 코드별 실정산 (롤링금/루징) - 2단 2열 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-emerald-950/70" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">코드별 실정산</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">롤링금</div>
                          <div className="flex-1 py-2">루징</div>
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => {
                    const bgColor = getRowBackgroundColor(row.level);
                    return (
                      <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors" style={{ backgroundColor: bgColor }}>
                        <td className="px-4 py-3 text-slate-300 sticky left-0 z-10 whitespace-nowrap" style={{ backgroundColor: bgColor, cursor: row.hasChildren ? 'pointer' : 'default' }} onClick={() => row.hasChildren && toggleRow(row.id)}>
                          <div className="flex items-center gap-1">
                            {row.hasChildren && row.level > 0 && (expandedRows.has(row.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />)}
                            {row.levelName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-200 font-asiahead whitespace-nowrap">{row.username}</td>
                        
                        {/* 정산 기준 설정 (카지노/슬롯/루징) */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-cyan-400 font-asiahead">{row.casinoRollingRate}%</div>
                            <div className="flex-1 text-purple-400 font-asiahead">{row.slotRollingRate}%</div>
                            <div className="flex-1 text-orange-400 font-asiahead">{row.casinoLosingRate}%</div>
                          </div>
                        </td>
                        
                        {/* 보유자산 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-slate-300 font-asiahead">{formatNumber(row.balance)}</div>
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.points)}</div>
                          </div>
                        </td>
                        
                        {/* 온라인 입출금 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.onlineDeposit)}</div>
                            <div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.onlineWithdrawal)}</div>
                          </div>
                        </td>
                        
                        {/* 수동 입출금 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.manualDeposit)}</div>
                            <div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.manualWithdrawal)}</div>
                          </div>
                        </td>
                        
                        {/* 포인트 관리 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-blue-400 font-asiahead">{formatNumber(row.pointGiven)}</div>
                            <div className="flex-1 text-orange-400 font-asiahead">{formatNumber(row.pointRecovered)}</div>
                          </div>
                        </td>
                        
                        {/* 입출차액 */}
                        <td className={cn("px-4 py-3 text-center font-asiahead whitespace-nowrap", row.depositWithdrawalDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {formatNumber(row.depositWithdrawalDiff)}
                        </td>
                        
                        {/* 게임 실적 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.casinoBet)}</div>
                            <div className="flex-1 text-purple-400 font-asiahead">{formatNumber(row.casinoWin)}</div>
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.slotBet)}</div>
                            <div className="flex-1 text-purple-400 font-asiahead">{formatNumber(row.slotWin)}</div>
                          </div>
                        </td>
                        
                        {/* GGR 합산 */}
                        <td className="px-4 py-3 text-center text-amber-400 font-asiahead whitespace-nowrap">{formatNumber(row.ggr)}</td>
                        
                        {/* 실정산 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-teal-400 font-asiahead">{formatNumber(row.totalRolling)}</div>
                            <div className="flex-1 text-teal-400 font-asiahead">{formatNumber(row.totalLosing)}</div>
                          </div>
                        </td>
                        
                        {/* 코드별 실정산 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-green-400 font-asiahead font-semibold">{formatNumber(row.individualRolling)}</div>
                            <div className="flex-1 text-green-400 font-asiahead font-semibold">{formatNumber(row.individualLosing)}</div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-700/50">
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-400">총 {visibleRows.length}개 중 {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, visibleRows.length)}개 표시</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">페이지당:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                    <SelectTrigger className="w-[80px] h-9 input-premium"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-9">처음</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="h-9">이전</Button>
                <span className="text-sm text-slate-300 px-4">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="h-9">다음</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-9">마지막</Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
