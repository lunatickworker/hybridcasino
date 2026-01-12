import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Search, ChevronDown, ChevronRight, TrendingUp, Wallet, Coins, ArrowUpRight, ArrowDownRight, Activity, DollarSign, Gift, Percent } from "lucide-react";
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
import { Lv35Settlement } from "./Lv35Settlement";
import { Lv6Settlement } from "./Lv6Settlement";

interface NewIntegratedSettlementProps { user: Partner; }
interface SettlementRow {
  level: number; levelName: string; id: string; username: string;
  casinoRollingRate: number; slotRollingRate: number; casinoLosingRate: number; slotLosingRate: number;
  balance: number; points: number; onlineDeposit: number; onlineWithdrawal: number;
  manualDeposit: number; manualWithdrawal: number; pointGiven: number; pointRecovered: number;
  depositWithdrawalDiff: number; casinoBet: number; casinoWin: number; slotBet: number; slotWin: number;
  ggr: number; totalRolling: number; totalLosing: number; individualRolling: number; individualLosing: number;
  parentId?: string; hasChildren?: boolean;
}
interface SummaryStats {
  totalBalance: number; totalPoints: number; onlineDeposit: number; onlineWithdrawal: number;
  manualDeposit: number; manualWithdrawal: number; pointGiven: number; pointRecovered: number;
  depositWithdrawalDiff: number; casinoBet: number; casinoWin: number; slotBet: number; slotWin: number;
  ggr: number; totalRolling: number; totalLosing: number; individualRolling: number; individualLosing: number;
}

export function NewIntegratedSettlement({ user }: NewIntegratedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [partnerLevelFilter, setPartnerLevelFilter] = useState<'all' | 3 | 4 | 5 | 6>('all');
  const [data, setData] = useState<SettlementRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [summary, setSummary] = useState<SummaryStats>({ totalBalance: 0, totalPoints: 0, onlineDeposit: 0, onlineWithdrawal: 0, manualDeposit: 0, manualWithdrawal: 0, pointGiven: 0, pointRecovered: 0, depositWithdrawalDiff: 0, casinoBet: 0, casinoWin: 0, slotBet: 0, slotWin: 0, ggr: 0, totalRolling: 0, totalLosing: 0, individualRolling: 0, individualLosing: 0 });

  useEffect(() => { fetchSettlementData(); }, [dateRange]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id); else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const toggleExpandAll = () => {
    if (expandAll) { setExpandedRows(new Set()); setExpandAll(false); }
    else { const allIds = new Set(data.filter(r => r.hasChildren).map(r => r.id)); setExpandedRows(allIds); setExpandAll(true); }
  };

  const getRowBackgroundColor = (level: number): string => {
    switch (level) {
      case 1: return 'rgba(168, 85, 247, 0.08)';
      case 2: return 'rgba(239, 68, 68, 0.08)';
      case 3: return 'rgba(59, 130, 246, 0.08)';
      case 4: return 'rgba(34, 197, 94, 0.08)';
      case 5: return 'rgba(245, 158, 11, 0.08)';
      case 6: return 'rgba(236, 72, 153, 0.08)';
      default: return 'transparent';
    }
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 0: return '회원'; case 1: return '슈퍼관리자'; case 2: return '운영사(대본)';
      case 3: return '본사'; case 4: return '부본사'; case 5: return '총판'; case 6: return '매장';
      default: return '회원';
    }
  };

  const formatNumber = (num: number): string => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);

  const calculateSummary = (rows: SettlementRow[]) => {
    const filtered = getFilteredRows(rows);
    setSummary({
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
    });
  };

  const getFilteredRows = (rows: SettlementRow[]): SettlementRow[] => {
    let filtered = rows;
    if (codeSearch.trim()) filtered = filtered.filter(r => r.username.toLowerCase().includes(codeSearch.toLowerCase()));
    if (partnerLevelFilter !== 'all') filtered = filtered.filter(r => r.level === partnerLevelFilter);
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
      }
    };
    const topLevelRows = filtered.filter(r => { if (r.level === 0) return false; if (!r.parentId) return true; return !filtered.some(parent => parent.id === r.parentId); });
    topLevelRows.forEach(row => addRowWithChildren(row));
    return visible;
  };

  const getDescendantPartnerIds = (partnerId: string, partners: any[]): string[] => {
    const directChildren = partners.filter(p => p.parent_id === partnerId);
    const childIds = directChildren.map(p => p.id);
    for (const child of directChildren) childIds.push(...getDescendantPartnerIds(child.id, partners));
    return childIds;
  };

  const getAllDescendantUserIds = (partnerId: string, allPartners: any[], allUsers: any[]): string[] => {
    const directUsers = allUsers.filter(u => u.referrer_id === partnerId).map(u => u.id);
    const childPartners = allPartners.filter(p => p.parent_id === partnerId);
    let allUsers_ids = [...directUsers];
    for (const childPartner of childPartners) allUsers_ids = allUsers_ids.concat(getAllDescendantUserIds(childPartner.id, allPartners, allUsers));
    return allUsers_ids;
  };

  const getAllDescendantPartnerIds = (partnerId: string, allPartners: any[]): string[] => {
    const directChildren = allPartners.filter(p => p.parent_id === partnerId);
    let allDescendants = directChildren.map(p => p.id);
    for (const child of directChildren) allDescendants = allDescendants.concat(getAllDescendantPartnerIds(child.id, allPartners));
    return allDescendants;
  };

  const calculateRowData = (
    entityId: string, username: string, level: number, balance: number, points: number,
    casinoRollingRate: number, casinoLosingRate: number, slotRollingRate: number, slotLosingRate: number,
    transactions: any[], pointTransactions: any[], gameRecords: any[], partners: any[], users: any[], partnerBalanceLogs: any[]
  ): SettlementRow => {
    // 모든 레벨에서 본인 데이터만 계산 (하위 데이터 합산 제거)
    const relevantUserIdsForTransactions: string[] = [entityId];
    const userTransactions = transactions.filter(t => relevantUserIdsForTransactions.includes(t.user_id));

    // 파트너의 경우 본인의 잔액 로그만 계산
    const relevantPartnerIdsForTransactions: string[] = level > 0 ? [entityId] : [];
    const partnerTransactions = transactions.filter(t => (t.transaction_type === 'partner_deposit' || t.transaction_type === 'partner_withdrawal') && relevantPartnerIdsForTransactions.includes(t.partner_id));

    const onlineDeposit = userTransactions.filter(t => (t.transaction_type === 'deposit' || t.transaction_type === 'admin_deposit') && t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
    const onlineWithdrawal = userTransactions.filter(t => (t.transaction_type === 'withdrawal' || t.transaction_type === 'admin_withdrawal') && t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
    const adminDepositFromTransactions = partnerTransactions.filter(t => t.transaction_type === 'partner_deposit' && t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
    const adminWithdrawalFromTransactions = partnerTransactions.filter(t => t.transaction_type === 'partner_withdrawal' && t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
    const relevantBalanceLogs = partnerBalanceLogs.filter(l => relevantPartnerIdsForTransactions.includes(l.partner_id) || relevantPartnerIdsForTransactions.includes(l.from_partner_id) || relevantPartnerIdsForTransactions.includes(l.to_partner_id));
    const manualDepositFromLogs = relevantBalanceLogs.filter(l => l.transaction_type === 'deposit').reduce((sum, l) => sum + (l.amount || 0), 0);
    const manualWithdrawalFromLogs = relevantBalanceLogs.filter(l => l.transaction_type === 'withdrawal').reduce((sum, l) => sum + (l.amount || 0), 0);
    const manualDeposit = adminDepositFromTransactions + manualDepositFromLogs;
    const manualWithdrawal = adminWithdrawalFromTransactions + manualWithdrawalFromLogs;
    const userPointTrans = pointTransactions.filter(pt => relevantUserIdsForTransactions.includes(pt.user_id));
    const pointGiven = userPointTrans.filter(pt => pt.type === 'commission_earned').reduce((sum, pt) => sum + (pt.amount || 0), 0);
    const pointRecovered = userPointTrans.filter(pt => pt.type === 'point_to_balance').reduce((sum, pt) => sum + (pt.amount || 0), 0);

    // 본인의 게임 기록만 계산
    const relevantGameRecords = gameRecords.filter(gr => relevantUserIdsForTransactions.includes(gr.user_id));
    const casinoBet = Math.abs(relevantGameRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const casinoWin = relevantGameRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
    const slotBet = Math.abs(relevantGameRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const slotWin = relevantGameRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
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
    return { level, levelName: getLevelName(level), id: entityId, username, casinoRollingRate, slotRollingRate, casinoLosingRate, slotLosingRate, balance, points, onlineDeposit, onlineWithdrawal, manualDeposit, manualWithdrawal, pointGiven, pointRecovered, depositWithdrawalDiff, casinoBet, casinoWin, slotBet, slotWin, ggr, totalRolling, totalLosing, individualRolling, individualLosing };
  };

  const processSettlementData = (partners: any[], users: any[], transactions: any[], pointTransactions: any[], gameRecords: any[], partnerBalanceLogs: any[]): SettlementRow[] => {
    const rows: SettlementRow[] = [];
    for (const partner of partners) {
      const hasChildren = partners.some(p => p.parent_id === partner.id) || users.some(u => u.referrer_id === partner.id);
      const row = calculateRowData(partner.id, partner.username, partner.level, partner.balance || 0, 0, partner.casino_rolling_commission || 0, partner.casino_losing_commission || 0, partner.slot_rolling_commission || 0, partner.slot_losing_commission || 0, transactions, pointTransactions, gameRecords, partners, users, partnerBalanceLogs);
      rows.push({ ...row, parentId: partner.parent_id, hasChildren });
    }
    for (const userItem of users) {
      const row = calculateRowData(userItem.id, userItem.username, 0, userItem.balance || 0, userItem.points || 0, userItem.casino_rolling_commission || userItem.casino_rolling_rate || 0, userItem.casino_losing_commission || userItem.casino_losing_rate || 0, userItem.slot_rolling_commission || userItem.slot_rolling_rate || 0, userItem.slot_losing_commission || userItem.slot_losing_rate || 0, transactions, pointTransactions, gameRecords, partners, users, partnerBalanceLogs);
      rows.push({ ...row, parentId: userItem.referrer_id, hasChildren: false });
    }
    return rows;
  };

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    try {
      const { data: allPartners, error: allPartnersError } = await supabase.from('partners').select('*').order('level', { ascending: true }).order('username', { ascending: true });
      if (allPartnersError) throw allPartnersError;
      const userLevel = user.level;
      const visiblePartnerIds = new Set<string>([user.id]);
      const descendantIds = getDescendantPartnerIds(user.id, allPartners || []);
      descendantIds.forEach(id => visiblePartnerIds.add(id));
      const visiblePartners = (allPartners || []).filter(p => p.level > userLevel && visiblePartnerIds.has(p.id));
      const visiblePartnerIdArray = Array.from(visiblePartnerIds);
      const { data: users, error: usersError } = await supabase.from('users').select('*').in('referrer_id', visiblePartnerIdArray).order('username', { ascending: true });
      if (usersError) throw usersError;
      const partners = visiblePartners;
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
      transactionsQuery = transactionsQuery.gte('created_at', dateRange.from.toISOString()).lte('created_at', dateRange.to.toISOString());
      const { data: transactionsData, error: transError } = await transactionsQuery;
      if (transError) throw transError;
      let partnerBalanceLogsQuery = supabase.from('partner_balance_logs').select('*').in('transaction_type', ['deposit', 'withdrawal']);
      if (user.level > 1) {
        partnerBalanceLogsQuery = partnerBalanceLogsQuery.or(`partner_id.in.(${visiblePartnerIdArray.join(',')}),from_partner_id.in.(${visiblePartnerIdArray.join(',')}),to_partner_id.in.(${visiblePartnerIdArray.join(',')})`);
      }
      partnerBalanceLogsQuery = partnerBalanceLogsQuery.gte('created_at', dateRange.from.toISOString()).lte('created_at', dateRange.to.toISOString());
      const { data: partnerBalanceLogs, error: balanceLogsError } = await partnerBalanceLogsQuery;
      if (balanceLogsError) throw balanceLogsError;
      let pointTransactionsQuery = supabase.from('point_transactions').select('*').in('user_id', targetUserIds);
      pointTransactionsQuery = pointTransactionsQuery.gte('created_at', dateRange.from.toISOString()).lte('created_at', dateRange.to.toISOString());
      const { data: pointTransactions, error: pointError } = await pointTransactionsQuery;
      if (pointError) throw pointError;
      let gameRecordsQuery = supabase.from('game_records').select('*').in('user_id', targetUserIds);
      gameRecordsQuery = gameRecordsQuery.gte('played_at', dateRange.from.toISOString()).lte('played_at', dateRange.to.toISOString());
      const { data: gameRecords, error: gameError } = await gameRecordsQuery;
      if (gameError) throw gameError;
      const rows = processSettlementData(partners || [], users || [], transactionsData || [], pointTransactions || [], gameRecords || [], partnerBalanceLogs || []);
      setData(rows);
      calculateSummary(rows);
    } catch (error) {
      console.error('정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const visibleRows = getVisibleRows();
  const totalPages = Math.ceil(visibleRows.length / itemsPerPage);
  const paginatedRows = visibleRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const setQuickDateRange = (type: 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    let from: Date;
    let to: Date;
    if (type === 'yesterday') { from = startOfDay(subDays(today, 1)); to = endOfDay(subDays(today, 1)); }
    else if (type === 'week') { from = startOfDay(subDays(today, 7)); to = endOfDay(today); }
    else { from = startOfDay(subDays(today, 30)); to = endOfDay(today); }
    setDateRange({ from, to });
    setDateFilterType(type);
  };

  // Lv3~Lv5 사용자는 Lv35Settlement 페이지로 리다이렉트
  if ([3, 4, 5].includes(user.level)) {
    return <Lv35Settlement user={user} />;
  }

  // Lv6 사용자는 Lv6Settlement 페이지로 리다이렉트
  if (user.level === 6) {
    return <Lv6Settlement user={user} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><TrendingUp className="h-6 w-6 text-cyan-400" />통합 정산 관리</h1>
        <Button onClick={fetchSettlementData} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white"><RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />새로고침</Button>
      </div>
      <div className="glass-card rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 mb-6">
        {/* 1행: 총입금 / 총출금 / 수동입금 / 수동출금 */}
        <div className="bg-gradient-to-br from-emerald-900/50 to-slate-900 rounded-xl p-4 border border-emerald-700/30 hover:border-emerald-600/50 transition-all shadow-lg shadow-emerald-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-emerald-500/20 rounded-lg"><ArrowUpRight className="h-6 w-6 text-emerald-400" /></div><span className="text-2xl text-slate-400 font-medium">총 입금</span></div>
          <div className="text-3xl font-bold text-emerald-400 font-asiahead ml-12">{formatNumber(summary.onlineDeposit)}</div>
        </div>
        <div className="bg-gradient-to-br from-rose-900/50 to-slate-900 rounded-xl p-4 border border-rose-700/30 hover:border-rose-600/50 transition-all shadow-lg shadow-rose-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-rose-500/20 rounded-lg"><ArrowDownRight className="h-6 w-6 text-rose-400" /></div><span className="text-2xl text-slate-400 font-medium">총 출금</span></div>
          <div className="text-3xl font-bold text-rose-400 font-asiahead ml-12">{formatNumber(summary.onlineWithdrawal)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/50 to-slate-900 rounded-xl p-4 border border-blue-700/30 hover:border-blue-600/50 transition-all shadow-lg shadow-blue-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-blue-500/20 rounded-lg"><DollarSign className="h-6 w-6 text-blue-400" /></div><span className="text-2xl text-slate-400 font-medium">수동 입금</span></div>
          <div className="text-3xl font-bold text-blue-400 font-asiahead ml-12">{formatNumber(summary.manualDeposit)}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-900/50 to-slate-900 rounded-xl p-4 border border-orange-700/30 hover:border-orange-600/50 transition-all shadow-lg shadow-orange-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-orange-500/20 rounded-lg"><DollarSign className="h-6 w-6 text-orange-400" /></div><span className="text-2xl text-slate-400 font-medium">수동 출금</span></div>
          <div className="text-3xl font-bold text-orange-400 font-asiahead ml-12">{formatNumber(summary.manualWithdrawal)}</div>
        </div>

        {/* 2행: 전체 머니 / 전체 포인트 / 포인트지급 / 포인트회수 */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600/50 transition-all shadow-lg shadow-slate-900/20">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-cyan-500/20 rounded-lg"><Wallet className="h-6 w-6 text-cyan-400" /></div><span className="text-2xl text-slate-400 font-medium">전체 머니</span></div>
          <div className="text-3xl font-bold text-slate-100 font-asiahead ml-12">{formatNumber(summary.totalBalance)}</div>
        </div>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600/50 transition-all shadow-lg shadow-slate-900/20">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-purple-500/20 rounded-lg"><Coins className="h-6 w-6 text-purple-400" /></div><span className="text-2xl text-slate-400 font-medium">전체 포인트</span></div>
          <div className="text-3xl font-bold text-purple-400 font-asiahead ml-12">{formatNumber(summary.totalPoints)}</div>
        </div>
        <div className="bg-gradient-to-br from-indigo-900/50 to-slate-900 rounded-xl p-4 border border-indigo-700/30 hover:border-indigo-600/50 transition-all shadow-lg shadow-indigo-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-indigo-500/20 rounded-lg"><Gift className="h-6 w-6 text-indigo-400" /></div><span className="text-2xl text-slate-400 font-medium">포인트 지급</span></div>
          <div className="text-3xl font-bold text-indigo-400 font-asiahead ml-12">{formatNumber(summary.pointGiven)}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-900/50 to-slate-900 rounded-xl p-4 border border-amber-700/30 hover:border-amber-600/50 transition-all shadow-lg shadow-amber-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-amber-500/20 rounded-lg"><Gift className="h-6 w-6 text-amber-400" /></div><span className="text-2xl text-slate-400 font-medium">포인트 회수</span></div>
          <div className="text-3xl font-bold text-amber-400 font-asiahead ml-12">{formatNumber(summary.pointRecovered)}</div>
        </div>

        {/* 3행: 카지노베팅 / 카지노당첨 / 슬롯베팅 / 슬롯당첨 */}
        <div className="bg-gradient-to-br from-violet-900/50 to-slate-900 rounded-xl p-4 border border-violet-700/30 hover:border-violet-600/50 transition-all shadow-lg shadow-violet-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-violet-500/20 rounded-lg"><TrendingUp className="h-6 w-6 text-violet-400" /></div><span className="text-2xl text-slate-400 font-medium">카지노 베팅</span></div>
          <div className="text-3xl font-bold text-violet-400 font-asiahead ml-12">{formatNumber(summary.casinoBet)}</div>
        </div>
        <div className="bg-gradient-to-br from-fuchsia-900/50 to-slate-900 rounded-xl p-4 border border-fuchsia-700/30 hover:border-fuchsia-600/50 transition-all shadow-lg shadow-fuchsia-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-fuchsia-500/20 rounded-lg"><TrendingUp className="h-6 w-6 text-fuchsia-400" /></div><span className="text-2xl text-slate-400 font-medium">카지노 당첨</span></div>
          <div className="text-3xl font-bold text-fuchsia-400 font-asiahead ml-12">{formatNumber(summary.casinoWin)}</div>
        </div>
        <div className="bg-gradient-to-br from-teal-900/50 to-slate-900 rounded-xl p-4 border border-teal-700/30 hover:border-teal-600/50 transition-all shadow-lg shadow-teal-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-teal-500/20 rounded-lg"><Coins className="h-6 w-6 text-teal-400" /></div><span className="text-2xl text-slate-400 font-medium">슬롯 베팅</span></div>
          <div className="text-3xl font-bold text-teal-400 font-asiahead ml-12">{formatNumber(summary.slotBet)}</div>
        </div>
        <div className="bg-gradient-to-br from-lime-900/50 to-slate-900 rounded-xl p-4 border border-lime-700/30 hover:border-lime-600/50 transition-all shadow-lg shadow-lime-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-lime-500/20 rounded-lg"><Coins className="h-6 w-6 text-lime-400" /></div><span className="text-2xl text-slate-400 font-medium">슬롯 당첨</span></div>
          <div className="text-3xl font-bold text-lime-400 font-asiahead ml-12">{formatNumber(summary.slotWin)}</div>
        </div>

        {/* 4행: GGR 합산 / 총 롤링금 / 입출차액 / 총루징 */}
        <div className="bg-gradient-to-br from-amber-800/50 to-slate-900 rounded-xl p-4 border border-amber-600/30 hover:border-amber-500/50 transition-all shadow-lg shadow-amber-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-amber-500/20 rounded-lg"><TrendingUp className="h-6 w-6 text-amber-400" /></div><span className="text-2xl text-slate-400 font-medium">GGR 합산</span></div>
          <div className="text-3xl font-bold text-amber-400 font-asiahead ml-12">{formatNumber(summary.ggr)}</div>
        </div>
        <div className="bg-gradient-to-br from-sky-900/50 to-slate-900 rounded-xl p-4 border border-sky-700/30 hover:border-sky-600/50 transition-all shadow-lg shadow-sky-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-sky-500/20 rounded-lg"><Percent className="h-6 w-6 text-sky-400" /></div><span className="text-2xl text-slate-400 font-medium">총 롤링금</span></div>
          <div className="text-3xl font-bold text-sky-400 font-asiahead ml-12">{formatNumber(summary.totalRolling)}</div>
        </div>
        <div className="bg-gradient-to-br from-cyan-900/50 to-slate-900 rounded-xl p-4 border border-cyan-700/30 hover:border-cyan-600/50 transition-all shadow-lg shadow-cyan-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-cyan-500/20 rounded-lg"><Activity className="h-6 w-6 text-cyan-400" /></div><span className="text-2xl text-slate-400 font-medium">입출차액</span></div>
          <div className={cn("text-3xl font-bold font-asiahead ml-12", summary.depositWithdrawalDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatNumber(summary.depositWithdrawalDiff)}</div>
        </div>
        <div className="bg-gradient-to-br from-red-900/50 to-slate-900 rounded-xl p-4 border border-red-700/30 hover:border-red-600/50 transition-all shadow-lg shadow-red-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-red-500/20 rounded-lg"><Percent className="h-6 w-6 text-red-400" /></div><span className="text-2xl text-slate-400 font-medium">총 루징</span></div>
          <div className="text-3xl font-bold text-red-400 font-asiahead ml-12">{formatNumber(summary.totalLosing)}</div>
        </div>
      </div>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Button onClick={() => { setDateFilterType('today'); const today = new Date(); setDateRange({ from: startOfDay(today), to: endOfDay(today) }); }} variant={dateFilterType === 'today' ? 'default' : 'outline'} className="h-10">오늘</Button>
          <Button onClick={() => setQuickDateRange('yesterday')} variant={dateFilterType === 'yesterday' ? 'default' : 'outline'} className="h-10">어제</Button>
          <Button onClick={() => setQuickDateRange('week')} variant={dateFilterType === 'week' ? 'default' : 'outline'} className="h-10">일주일</Button>
          <Button onClick={() => setQuickDateRange('month')} variant={dateFilterType === 'month' ? 'default' : 'outline'} className="h-10">한달</Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal input-premium", !dateRange && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (dateRange.to ? (format(dateRange.from, "yyyy-MM-dd", { locale: ko }) + " - " + format(dateRange.to, "yyyy-MM-dd", { locale: ko })) : format(dateRange.from, "yyyy-MM-dd", { locale: ko })) : <span>날짜 선택</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ko} /></PopoverContent>
          </Popover>
          <div className="flex items-center gap-2">
            <Button onClick={() => setPartnerLevelFilter('all')} variant={partnerLevelFilter === 'all' ? 'default' : 'outline'} className="h-10 px-3">전체</Button>
            <Button onClick={() => setPartnerLevelFilter(3)} variant={partnerLevelFilter === 3 ? 'default' : 'outline'} className="h-10 px-3">본사</Button>
            <Button onClick={() => setPartnerLevelFilter(4)} variant={partnerLevelFilter === 4 ? 'default' : 'outline'} className="h-10 px-3">부본사</Button>
            <Button onClick={() => setPartnerLevelFilter(5)} variant={partnerLevelFilter === 5 ? 'default' : 'outline'} className="h-10 px-3">총판</Button>
            <Button onClick={() => setPartnerLevelFilter(6)} variant={partnerLevelFilter === 6 ? 'default' : 'outline'} className="h-10 px-3">매장</Button>
          </div>
          <div className="flex-1 relative"><Search className="absolute left-3 top-2.5 h-6 w-6 text-slate-400" /><Input placeholder="코드 검색..." className="pl-10 input-premium" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} /></div>
          <Button onClick={toggleExpandAll} variant="outline" className="h-10">{expandAll ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}{expandAll ? '전체 접기' : '전체 펼치기'}</Button>
        </div>
        {loading ? (<div className="flex items-center justify-center py-12"><LoadingSpinner /></div>) : (
          <div>
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9FA8DA #E8EAF6' }}>
              <style dangerouslySetInnerHTML={{ __html: `.overflow-x-auto::-webkit-scrollbar { height: 8px; } .overflow-x-auto::-webkit-scrollbar-track { background: #E8EAF6; } .overflow-x-auto::-webkit-scrollbar-thumb { background: #9FA8DA; border-radius: 4px; }` }} />
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-center text-white font-normal sticky left-0 bg-slate-900 z-10 whitespace-nowrap">등급</th>
                    <th className="px-4 py-3 text-center text-white font-normal bg-slate-900 whitespace-nowrap">아이디</th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-slate-800/70"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50">정산 기준</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50">카지노</div><div className="flex-1 py-2 border-r border-slate-700/50">슬롯</div><div className="flex-1 py-2">루징</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-indigo-950/60"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50">보유자산</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50">머니</div><div className="flex-1 py-2">포인트</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-orange-950/60"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50">온라인 입출금</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50">입금</div><div className="flex-1 py-2">출금</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-rose-950/60"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50">수동 입출금</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50">수동 입금</div><div className="flex-1 py-2">수동 출금</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-green-950/60"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50">포인트 관리</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50">지급</div><div className="flex-1 py-2">회수</div></div></div></th>
                    <th className="px-4 py-3 text-center text-white font-normal bg-cyan-950/60 whitespace-nowrap">입출차액</th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-blue-950/60"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50">게임 실적</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50">카지노 Bet</div><div className="flex-1 py-2 border-r border-slate-700/50">카지노 Win</div><div className="flex-1 py-2 border-r border-slate-700/50">슬롯 Bet</div><div className="flex-1 py-2">슬롯 Win</div></div></div></th>
                    <th className="px-4 py-3 text-center text-white font-normal bg-amber-950/60 whitespace-nowrap">GGR</th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-teal-950/60"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50">실정산</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50">총 롤링</div><div className="flex-1 py-2">총 루징</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-emerald-950/70"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50">코드별 실정산</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50">롤링</div><div className="flex-1 py-2">루징</div></div></div></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => {
                    const bgColor = getRowBackgroundColor(row.level);
                    return (
                      <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors" style={{ backgroundColor: bgColor }}>
                        <td className="px-4 py-3 text-slate-300 sticky left-0 z-10 whitespace-nowrap" style={{ backgroundColor: bgColor, cursor: row.hasChildren ? 'pointer' : 'default' }} onClick={() => row.hasChildren && toggleRow(row.id)}>
                          <div className="flex items-center gap-1">{row.hasChildren && row.level > 0 && (expandedRows.has(row.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />)}{row.levelName}</div>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-200 font-asiahead whitespace-nowrap">{row.username}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-cyan-400 font-asiahead">{row.casinoRollingRate}%</div><div className="flex-1 text-purple-400 font-asiahead">{row.slotRollingRate}%</div><div className="flex-1 text-orange-400 font-asiahead">{row.casinoLosingRate}%</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-slate-300 font-asiahead">{formatNumber(row.balance)}</div><div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.points)}</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.onlineDeposit)}</div><div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.onlineWithdrawal)}</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.manualDeposit)}</div><div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.manualWithdrawal)}</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-blue-400 font-asiahead">{formatNumber(row.pointGiven)}</div><div className="flex-1 text-orange-400 font-asiahead">{formatNumber(row.pointRecovered)}</div></div></td>
                        <td className={cn("px-4 py-3 text-center font-asiahead whitespace-nowrap", row.depositWithdrawalDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatNumber(row.depositWithdrawalDiff)}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.casinoBet)}</div><div className="flex-1 text-purple-400 font-asiahead">{formatNumber(row.casinoWin)}</div><div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.slotBet)}</div><div className="flex-1 text-purple-400 font-asiahead">{formatNumber(row.slotWin)}</div></div></td>
                        <td className="px-4 py-3 text-center text-amber-400 font-asiahead whitespace-nowrap">{formatNumber(row.ggr)}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-teal-400 font-asiahead">{formatNumber(row.totalRolling)}</div><div className="flex-1 text-teal-400 font-asiahead">{formatNumber(row.totalLosing)}</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-green-400 font-asiahead font-semibold">{formatNumber(row.individualRolling)}</div><div className="flex-1 text-green-400 font-asiahead font-semibold">{formatNumber(row.individualLosing)}</div></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-700/50">
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-400">총 {visibleRows.length}개 중 {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, visibleRows.length)}개 표시</span>
                <div className="flex items-center gap-2"><span className="text-sm text-slate-400">페이지당:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                    <SelectTrigger className="w-[80px] h-9 input-premium"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700"><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
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
          </div>
        )}
      </div>
    </div>
  );
}
