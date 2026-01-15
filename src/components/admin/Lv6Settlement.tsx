import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Search, ChevronDown, ChevronRight, TrendingUp, Wallet, Coins, ArrowUpRight, ArrowDownRight, Activity, DollarSign, Gift, Percent, X } from "lucide-react";
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

interface Lv6SettlementProps {
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
  // 보유 자산
  balance: number;
  points: number;
  // 온라인 입출금
  onlineDeposit: number;
  onlineWithdrawal: number;
  // 수동 충환전
  manualCharge: number;
  manualExchange: number;
  // 파트너 충환전
  partnerCharge: number;
  partnerExchange: number;
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
  type?: 'partner' | 'member';
}

interface SummaryStats {
  totalBalance: number;
  totalPoints: number;
  onlineDeposit: number;
  onlineWithdrawal: number;
  manualCharge: number;
  manualExchange: number;
  partnerCharge: number;
  partnerExchange: number;
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

export function Lv6Settlement({ user }: Lv6SettlementProps) {
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
    totalBalance: 0,
    totalPoints: 0,
    onlineDeposit: 0,
    onlineWithdrawal: 0,
    manualCharge: 0,
    manualExchange: 0,
    partnerCharge: 0,
    partnerExchange: 0,
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

  // ✅ 검색/필터 변경 시 통계 재계산
  useEffect(() => {
    if (data.length > 0) {
      calculateSummary(data);
    }
  }, [codeSearch]);

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
      case 6: return 'rgba(236, 72, 153, 0.08)'; // 매장 - 핑크색
      default: return 'transparent';
    }
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 1: return '슈퍼관리자';
      case 2: return '운영사(대본)';
      case 3: return '본사';
      case 4: return '부본사';
      case 5: return '총판';
      case 6: return '매장';
      case 7: return '회원';
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
      totalBalance: filtered.reduce((sum, r) => sum + r.balance, 0),
      totalPoints: filtered.reduce((sum, r) => sum + r.points, 0),
      onlineDeposit: filtered.reduce((sum, r) => sum + r.onlineDeposit + r.partnerCharge, 0),
      onlineWithdrawal: filtered.reduce((sum, r) => sum + r.onlineWithdrawal + r.partnerExchange, 0),
      manualCharge: filtered.reduce((sum, r) => sum + r.manualCharge, 0),
      manualExchange: filtered.reduce((sum, r) => sum + r.manualExchange, 0),
      partnerCharge: filtered.reduce((sum, r) => sum + r.partnerCharge, 0),
      partnerExchange: filtered.reduce((sum, r) => sum + r.partnerExchange, 0),
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
      // ✅ Lv6: 본인 매장과 하위 모든 레벨 조회 (조직격리 로직)
      let allowedPartnerIds: string[] = [];
      let visiblePartnerIdArray: string[] = [];

      let partners: any[] = [];
      let users: any[] = [];

      if (user.level === 1) {
        // Lv1: 모든 매장(Lv6)과 그 직속 회원 표시
        const { data: allPartners, error: allPartnersError } = await supabase
          .from('partners')
          .select('*')
          .eq('level', 6) // Lv6 매장만
          .order('username', { ascending: true });

        if (allPartnersError) throw allPartnersError;
        partners = allPartners || [];

        const partnerIds = partners.map(p => p.id);

        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('*')
          .in('referrer_id', partnerIds)
          .order('username', { ascending: true });

        if (usersError) throw usersError;
        users = usersData || [];
      } else {
        // Lv6: 본인 매장 직속 회원만
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('*')
          .eq('referrer_id', user.id)
          .order('username', { ascending: true });

        if (usersError) throw usersError;
        users = usersData || [];
      }

      const targetUserIds = users?.map(u => u.id) || [];

      let transactionsQuery = supabase.from('transactions').select('*').in('user_id', targetUserIds);
      transactionsQuery = transactionsQuery
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      const { data: transactionsData, error: transError } = await transactionsQuery;
      if (transError) throw transError;

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

      // ✅ 베팅 데이터 로드 확인 (디버깅)
      console.log('[Lv6 정산 페이지] 베팅 데이터 로드:', {
        targetUserIds: targetUserIds.length,
        gameRecordsCount: gameRecords?.length || 0,
        casinoBets: gameRecords?.filter(gr => gr.game_type === 'casino').length || 0,
        slotBets: gameRecords?.filter(gr => gr.game_type === 'slot').length || 0,
        dateRange: { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }
      });

      // ✅ partner_balance_logs 조회 - 전체입출금내역과 동일한 방식
      let partnerBalanceLogsQuery = supabase
        .from('partner_balance_logs')
        .select('*')
        .in('transaction_type', ['deposit', 'withdrawal']);
      
      if (user.level === 6) {
        partnerBalanceLogsQuery = partnerBalanceLogsQuery.eq('partner_id', user.id);
      }
      
      partnerBalanceLogsQuery = partnerBalanceLogsQuery
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());
      
      const { data: partnerBalanceLogs, error: partnerBalanceError } = await partnerBalanceLogsQuery;
      if (partnerBalanceError) throw partnerBalanceError;

      // ✅ TransactionManagement와 동일한 completedTransactions 생성 (입출금 + 포인트)
      const completedTransactions = getCompletedTransactionsForSettlement(
        transactionsData || [], 
        partnerBalanceLogs || [],
        pointTransactions || []
      );
      
      // ✅ 정산 계산 (completedTransactions 기반)
      const rows = processSettlementData(partners, users || [], completedTransactions, pointTransactions || [], gameRecords || [], partnerBalanceLogs || []);
      setData(rows);
      calculateSummary(rows);
      
      // ✅ 정산 결과 확인 (디버깅)
      console.log('[Lv6 정산 페이지] 계산 완료:', {
        totalRows: rows.length,
        totalCasinoBet: rows.reduce((sum, r) => sum + r.casinoBet, 0),
        totalSlotBet: rows.reduce((sum, r) => sum + r.slotBet, 0),
        totalGGR: rows.reduce((sum, r) => sum + r.ggr, 0)
      });

    } catch (error) {
      console.error('❌ 정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
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

  // ✅ TransactionManagement와 동일한 completedTransactions 구성 (입출금 + 포인트)
  const getCompletedTransactionsForSettlement = (transactions: any[], partnerBalanceLogs: any[], pointTransactions: any[]) => {
    // 완성된 입출금만 필터링
    const filteredTransactions = transactions.filter(t => t.status === 'completed' || t.status === 'rejected');
    
    // partner_balance_logs 변환 (deposit/withdrawal만)
    const mappedPartnerTransactions = partnerBalanceLogs
      .filter(pt => pt.transaction_type === 'deposit' || pt.transaction_type === 'withdrawal')
      .map(pt => ({
        ...pt,
        status: 'completed',
        is_partner_transaction: true
      }));
    
    // point_transactions 변환
    const mappedPointTransactions = pointTransactions
      .map(pt => ({
        ...pt,
        status: 'completed',
        is_point_transaction: true
      }));
    
    // 입출금 + 포인트 합쳐서 시간순 정렬
    return [...filteredTransactions, ...mappedPartnerTransactions, ...mappedPointTransactions].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  };

  const processSettlementData = (
    partners: any[],
    users: any[],
    completedTransactions: any[],
    allPointTransactions: any[],
    gameRecords: any[],
    partnerBalanceLogs: any[]
  ): SettlementRow[] => {
    // ✅ completedTransactions에서 입출금 트랜잭션만 분리
    const depositWithdrawalTransactions = completedTransactions.filter(t => 
      !t.is_point_transaction && (t.transaction_type || t.user_id)
    );
    
    // ✅ 포인트 트랜잭션만 필터링
    const pointTransactions = completedTransactions.filter(t => t.is_point_transaction) || allPointTransactions || [];
    
    const rows: SettlementRow[] = [];

    // ✅ 파트너 데이터 추가
    for (const partner of partners) {
      const hasChildren = partners.some(p => p.parent_id === partner.id) || users.some(u => u.referrer_id === partner.id);
      const row = calculateRowData(partner.id, partner.username, partner.level, partner.balance || 0, 0,
        partner.casino_rolling_commission || 0, partner.casino_losing_commission || 0,
        partner.slot_rolling_commission || 0, partner.slot_losing_commission || 0,
        depositWithdrawalTransactions, pointTransactions, gameRecords, partnerBalanceLogs, partners, users);
      rows.push({
        ...row,
        type: 'partner',
        parentId: partner.parent_id,
        hasChildren
      });
    }

    // ✅ 등급 회원 데이터 추가 (레벨 7 = 회원)
    for (const userItem of users) {
      const row = calculateRowData(userItem.id, userItem.username, 7, userItem.balance || 0, userItem.points || 0,
        userItem.casino_rolling_commission || userItem.casino_rolling_rate || 0,
        userItem.casino_losing_commission || userItem.casino_losing_rate || 0,
        userItem.slot_rolling_commission || userItem.slot_rolling_rate || 0,
        userItem.slot_losing_commission || userItem.slot_losing_rate || 0,
        depositWithdrawalTransactions, pointTransactions, gameRecords, partnerBalanceLogs, partners, users);
      rows.push({
        ...row,
        type: 'member',
        parentId: userItem.referrer_id,
        hasChildren: false
      });
    }

    return rows;
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
    partnerBalanceLogs: any[],
    partners: any[],
    users: any[]
  ): SettlementRow => {
    // ✅ 수정: 직속 회원 데이터 합산
    // 각 파트너 행은 "해당 파트너의 직속 회원들"의 게임 데이터를 기반으로 계산
    let relevantUserIdsForTransactions: string[] = [];

    if (level === 6) {
      // ✅ Lv6 파트너: 직속 회원들의 데이터만 합산 (본인 제외)
      const directUserIds = users.filter(u => u.referrer_id === entityId).map(u => u.id);
      relevantUserIdsForTransactions = directUserIds;
    } else {
      // Lv7 회원: 본인 데이터만 계산
      relevantUserIdsForTransactions = [entityId];
    }

    const userTransactions = transactions.filter(t => relevantUserIdsForTransactions.includes(t.user_id));

    // ✅ 온라인 입출금: 사용자 직접 입금/출금만 (deposit/withdrawal)
    const onlineDeposit = userTransactions
      .filter(t => t.transaction_type === 'deposit' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const onlineWithdrawal = userTransactions
      .filter(t => t.transaction_type === 'withdrawal' && t.status === 'completed')
      .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    // ✅ 3️⃣ 수동 충전 (Guidelines.md Phase 2: admin_deposit_send)
    const manualCharge = userTransactions
      .filter(t => t.transaction_type === 'admin_deposit_send' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    // ✅ 4️⃣ 수동 환전 (Guidelines.md Phase 2: admin_withdrawal_send)
    const manualExchange = userTransactions
      .filter(t => t.transaction_type === 'admin_withdrawal_send' && t.status === 'completed')
      .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    // ✅ 5️⃣ 파트너 충전 (Guidelines.md: partner_balance_logs에서 'deposit')
    const partnerCharge = partnerBalanceLogs
      .filter(pbl => pbl.to_partner_id === entityId && pbl.transaction_type === 'deposit')
      .reduce((sum, pbl) => sum + (pbl.amount || 0), 0);

    // ✅ 6️⃣ 파트너 환전 (Guidelines.md: partner_balance_logs에서 'withdrawal')
    const partnerExchange = partnerBalanceLogs
      .filter(pbl => pbl.from_partner_id === entityId && pbl.transaction_type === 'withdrawal')
      .reduce((sum, pbl) => sum + Math.abs(pbl.amount || 0), 0);

    // ✅ 입출차액 = (온라인 입금 + 수동 충전 + 파트너 충전) - (온라인 출금 + 수동 환전 + 파트너 환전)
    const depositWithdrawalDiff = onlineDeposit + manualCharge + partnerCharge - onlineWithdrawal - manualExchange - partnerExchange;

    // ✅ 게임 기록 (직속 회원 데이터 합산)
    const relevantGameRecords = gameRecords.filter(gr => relevantUserIdsForTransactions.includes(gr.user_id));
    const casinoBetRecords = relevantGameRecords.filter(gr => gr.game_type === 'casino');
    const slotBetRecords = relevantGameRecords.filter(gr => gr.game_type === 'slot');

    const casinoBet = Math.abs(casinoBetRecords.reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const casinoWin = casinoBetRecords.reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
    const slotBet = Math.abs(slotBetRecords.reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const slotWin = slotBetRecords.reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
    
    // ✅ 게임 데이터 로드 확인 (디버깅)
    if (casinoBet > 0 || slotBet > 0) {
      console.log(`[Lv6 정산계산] ${username}:`, {
        relevantUserCount: relevantUserIdsForTransactions.length,
        totalGameRecords: relevantGameRecords.length,
        casinoBets: casinoBetRecords.length,
        slotBets: slotBetRecords.length,
        casinoBet, casinoWin, slotBet, slotWin
      });
    }

    // ✅ GGR 게임별 계산
    const casinoGgr = casinoBet - casinoWin;  // 카지노 GGR
    const slotGgr = slotBet - slotWin;        // 슬롯 GGR
    const ggr = casinoGgr + slotGgr;          // 합계 GGR

    const casinoTotalRolling = casinoBet * (casinoRollingRate / 100);
    const slotTotalRolling = slotBet * (slotRollingRate / 100);
    const totalRolling = casinoTotalRolling + slotTotalRolling;

    // ✅ 루징 가능 금액 = 게임별 GGR - 게임별 롤링금 (중요: 게임타입별로 개별 계산!)
    const casinoLosableAmount = Math.max(0, casinoGgr - casinoTotalRolling);
    const slotLosableAmount = Math.max(0, slotGgr - slotTotalRolling);
    const casinoTotalLosing = casinoLosableAmount * (casinoLosingRate / 100);
    const slotTotalLosing = slotLosableAmount * (slotLosingRate / 100);
    const totalLosing = casinoTotalLosing + slotTotalLosing;

    const individualRolling = totalRolling;
    const individualLosing = totalLosing;

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
      manualCharge,
      manualExchange,
      partnerCharge,
      partnerExchange,
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
            <TrendingUp className="h-6 w-6 text-pink-400" />
            통합 정산 관리
          </h1>
          {/* <p className="text-muted-foreground">
            매장(Lv6) 전용 개별 정산 페이지입니다
          </p> */}
        </div>
        <Button onClick={fetchSettlementData} disabled={loading} className="bg-pink-600 hover:bg-pink-700 text-white">
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          새로고침
        </Button>
      </div>

      {/* 필터 영역 */}
      <div className="glass-card rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 mb-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600/50 transition-all shadow-lg shadow-slate-900/20">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-cyan-500/20 rounded-lg"><Wallet className="h-6 w-6 text-cyan-400" /></div><span className="text-2xl text-slate-400 font-medium">보유 머니</span></div>
          <div className="text-3xl font-bold text-slate-100 font-asiahead ml-12">{formatNumber(summary.totalBalance)}</div>
        </div>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600/50 transition-all shadow-lg shadow-slate-900/20">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-purple-500/20 rounded-lg"><Coins className="h-6 w-6 text-purple-400" /></div><span className="text-2xl text-slate-400 font-medium">보유 포인트</span></div>
          <div className="text-3xl font-bold text-purple-400 font-asiahead ml-12">{formatNumber(summary.totalPoints)}</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-900/50 to-slate-900 rounded-xl p-4 border border-emerald-700/30 hover:border-emerald-600/50 transition-all shadow-lg shadow-emerald-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-emerald-500/20 rounded-lg"><ArrowUpRight className="h-6 w-6 text-emerald-400" /></div><span className="text-2xl text-slate-400 font-medium">총 입금</span></div>
          <div className="text-3xl font-bold text-emerald-400 font-asiahead ml-12">{formatNumber(summary.onlineDeposit)}</div>
        </div>
        <div className="bg-gradient-to-br from-rose-900/50 to-slate-900 rounded-xl p-4 border border-rose-700/30 hover:border-rose-600/50 transition-all shadow-lg shadow-rose-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-rose-500/20 rounded-lg"><ArrowDownRight className="h-6 w-6 text-rose-400" /></div><span className="text-2xl text-slate-400 font-medium">총 출금</span></div>
          <div className="text-3xl font-bold text-rose-400 font-asiahead ml-12">{formatNumber(summary.onlineWithdrawal)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/50 to-slate-900 rounded-xl p-4 border border-blue-700/30 hover:border-blue-600/50 transition-all shadow-lg shadow-blue-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-blue-500/20 rounded-lg"><DollarSign className="h-6 w-6 text-blue-400" /></div><span className="text-2xl text-slate-400 font-medium">수동 충전</span></div>
          <div className="text-3xl font-bold text-blue-400 font-asiahead ml-12">{formatNumber(summary.manualCharge)}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-900/50 to-slate-900 rounded-xl p-4 border border-orange-700/30 hover:border-orange-600/50 transition-all shadow-lg shadow-orange-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-orange-500/20 rounded-lg"><DollarSign className="h-6 w-6 text-orange-400" /></div><span className="text-2xl text-slate-400 font-medium">수동 환전</span></div>
          <div className="text-3xl font-bold text-orange-400 font-asiahead ml-12">{formatNumber(summary.manualExchange)}</div>
        </div>
        <div className="bg-gradient-to-br from-indigo-900/50 to-slate-900 rounded-xl p-4 border border-indigo-700/30 hover:border-indigo-600/50 transition-all shadow-lg shadow-indigo-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-indigo-500/20 rounded-lg"><Gift className="h-6 w-6 text-indigo-400" /></div><span className="text-2xl text-slate-400 font-medium">파트너 충전</span></div>
          <div className="text-3xl font-bold text-indigo-400 font-asiahead ml-12">{formatNumber(summary.partnerCharge)}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-900/50 to-slate-900 rounded-xl p-4 border border-amber-700/30 hover:border-amber-600/50 transition-all shadow-lg shadow-amber-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-amber-500/20 rounded-lg"><Gift className="h-6 w-6 text-amber-400" /></div><span className="text-2xl text-slate-400 font-medium">파트너 환전</span></div>
          <div className="text-3xl font-bold text-amber-400 font-asiahead ml-12">{formatNumber(summary.partnerExchange)}</div>
        </div>
        <div className="bg-gradient-to-br from-cyan-900/50 to-slate-900 rounded-xl p-4 border border-cyan-700/30 hover:border-cyan-600/50 transition-all shadow-lg shadow-cyan-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-cyan-500/20 rounded-lg"><Activity className="h-6 w-6 text-cyan-400" /></div><span className="text-2xl text-slate-400 font-medium">현금정산</span></div>
          <div className="text-3xl font-bold text-cyan-400 font-asiahead ml-12">{formatNumber(summary.depositWithdrawalDiff)}</div>
        </div>
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
        <div className="bg-gradient-to-br from-amber-800/50 to-slate-900 rounded-xl p-4 border border-amber-600/30 hover:border-amber-500/50 transition-all shadow-lg shadow-amber-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-amber-500/20 rounded-lg"><TrendingUp className="h-6 w-6 text-amber-400" /></div><span className="text-2xl text-slate-400 font-medium">GGR 합산</span></div>
          <div className="text-3xl font-bold text-amber-400 font-asiahead ml-12">{formatNumber(summary.ggr)}</div>
        </div>
        <div className="bg-gradient-to-br from-sky-900/50 to-slate-900 rounded-xl p-4 border border-sky-700/30 hover:border-sky-600/50 transition-all shadow-lg shadow-sky-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-sky-500/20 rounded-lg"><Percent className="h-6 w-6 text-sky-400" /></div><span className="text-2xl text-slate-400 font-medium">총 롤링금</span></div>
          <div className="text-3xl font-bold text-sky-400 font-asiahead ml-12">{formatNumber(summary.totalRolling)}</div>
        </div>
        <div className="bg-gradient-to-br from-red-900/50 to-slate-900 rounded-xl p-4 border border-red-700/30 hover:border-red-600/50 transition-all shadow-lg shadow-red-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-red-500/20 rounded-lg"><Percent className="h-6 w-6 text-red-400" /></div><span className="text-2xl text-slate-400 font-medium">총 루징</span></div>
          <div className="text-3xl font-bold text-red-400 font-asiahead ml-12">{formatNumber(summary.totalLosing)}</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-900/50 to-slate-900 rounded-xl p-4 border border-emerald-700/30 hover:border-emerald-600/50 transition-all shadow-lg shadow-emerald-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-emerald-500/20 rounded-lg"><Percent className="h-6 w-6 text-emerald-400" /></div><span className="text-2xl text-slate-400 font-medium">코드별 롤링금</span></div>
          <div className="text-3xl font-bold text-emerald-400 font-asiahead ml-12">{formatNumber(summary.individualRolling)}</div>
        </div>
        <div className="bg-gradient-to-br from-pink-900/50 to-slate-900 rounded-xl p-4 border border-pink-700/30 hover:border-pink-600/50 transition-all shadow-lg shadow-pink-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-pink-500/20 rounded-lg"><Percent className="h-6 w-6 text-pink-400" /></div><span className="text-2xl text-slate-400 font-medium">코드별 루징</span></div>
          <div className="text-3xl font-bold text-pink-400 font-asiahead ml-12">{formatNumber(summary.individualLosing)}</div>
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
                {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "yyyy-MM-dd", { locale: ko })} - {format(dateRange.to, "yyyy-MM-dd", { locale: ko })}</>) : format(dateRange.from, "yyyy-MM-dd", { locale: ko })) : <span>날짜 선택</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700" align="start">
              <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ko} />
            </PopoverContent>
          </Popover>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-6 w-6 text-slate-400" />
            <Input placeholder="코드 검색..." className="pl-10 pr-10 input-premium" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} />
            {codeSearch && (
              <button
                onClick={() => setCodeSearch("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            )}
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
                    
                    {/* 보유 자산 (머니/포인트) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-indigo-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">보유 자산</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">머니</div>
                          <div className="flex-1 py-2">포인트</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 온라인 입출금 (입금/출금) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-orange-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">온라인 입출금</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">입금</div>
                          <div className="flex-1 py-2">출금</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 수동 충환전 (충전/환전) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-rose-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">수동 충환전</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">충전</div>
                          <div className="flex-1 py-2">환전</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 파트너 충환전 (충전/환전) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-purple-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">파트너 충환전</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">충전</div>
                          <div className="flex-1 py-2">환전</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 현금정산 */}
                    <th className="px-4 py-3 text-center text-white font-normal bg-cyan-950/60 whitespace-nowrap">현금정산</th>
                    
                    {/* 게임 실적 (카지노 베팅/카지노 당첨/슬롯베팅/슬롯당첨) - 2단 */}
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
                    
                    {/* 실정산 (총 롤링금/총 루징) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-teal-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50">실정산</div>
                        <div className="flex">
                          <div className="flex-1 py-2 border-r border-slate-700/50">총 롤링금</div>
                          <div className="flex-1 py-2">총 루징</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 코드별 실정산 (롤링금/루징) - 2단 */}
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
                        <td className="px-4 py-3 text-slate-300 sticky left-0 z-10 whitespace-nowrap" style={{ backgroundColor: bgColor }}>
                          <div className="flex items-center gap-1">
                            {row.hasChildren && (
                              expandedRows.has(row.id) ? (
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                              )
                            )}
                            {row.levelName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-200 font-asiahead whitespace-nowrap">{row.username}</td>
                        
                        {/* 보유 자산 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-slate-300 font-asiahead">{formatNumber(row.balance)}</div>
                            <div className="flex-1 text-slate-300 font-asiahead">{formatNumber(row.points)}</div>
                          </div>
                        </td>
                        
                        {/* 온라인 입출금 (입금/출금) */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.onlineDeposit)}</div>
                            <div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.onlineWithdrawal)}</div>
                          </div>
                        </td>
                        
                        {/* 수동 충환전 (충전/환전) */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.manualCharge)}</div>
                            <div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.manualExchange)}</div>
                          </div>
                        </td>
                        
                        {/* 파트너 충환전 (충전/환전) */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.partnerCharge)}</div>
                            <div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.partnerExchange)}</div>
                          </div>
                        </td>
                        
                        {/* 현금정산 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="text-cyan-400 font-asiahead">{formatNumber(row.depositWithdrawalDiff)}</div>
                        </td>
                        
                        {/* 게임 실적 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.casinoBet)}</div>
                            <div className="flex-1 text-purple-400 font-asiahead">{formatNumber(row.casinoWin)}</div>
                            <div className="flex-1 text-orange-400 font-asiahead">{formatNumber(row.slotBet)}</div>
                            <div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.slotWin)}</div>
                          </div>
                        </td>
                        
                        {/* GGR 합산 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="text-amber-400 font-asiahead">{formatNumber(row.ggr)}</div>
                        </td>
                        
                        {/* 실정산 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.totalRolling)}</div>
                            <div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.totalLosing)}</div>
                          </div>
                        </td>
                        
                        {/* 코드별 실정산 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.individualRolling)}</div>
                            <div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.individualLosing)}</div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-slate-400">
                  총 {visibleRows.length}개 중 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, visibleRows.length)}개 표시
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-8">첫 페이지</Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8">이전</Button>
                  <span className="text-sm text-slate-300 px-2">{currentPage} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8">다음</Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-8">마지막</Button>
                </div>
                <Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10개</SelectItem>
                    <SelectItem value="20">20개</SelectItem>
                    <SelectItem value="50">50개</SelectItem>
                    <SelectItem value="100">100개</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </div>


    </div>
  );
}
