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

interface Lv35SettlementProps {
  user: Partner;
}

interface SettlementRow {
  level: number;
  levelName: string;
  id: string;
  username: string;
  type: 'partner' | 'member'; // ✅ 타입 구분 추가
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
  // 파트너 충전/환전 (partner_balance_logs)
  partnerDeposit: number;
  partnerWithdrawal: number;
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
  totalBalance: number;
  totalPoints: number;
  onlineDeposit: number;
  onlineWithdrawal: number;
  partnerDeposit: number;
  partnerWithdrawal: number;
  depositWithdrawalDiff: number;
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
  ggr: number;
  totalRolling: number;
  rollingProfit: number;
}

export function Lv35Settlement({ user }: Lv35SettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [partnerLevelFilter, setPartnerLevelFilter] = useState<'all' | 4 | 5 | 6>('all');
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
    partnerDeposit: 0,
    partnerWithdrawal: 0,
    depositWithdrawalDiff: 0,
    casinoBet: 0,
    casinoWin: 0,
    slotBet: 0,
    slotWin: 0,
    ggr: 0,
    totalRolling: 0,
    rollingProfit: 0
  });

  // ✅ 모든 레벨 접근 가능 (Lv1~Lv6)
  // 단, Lv1, Lv2는 하위 파트너 데이터만 조회

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

  // ✅ 검색/필터 변경 시 통계 재계산
  useEffect(() => {
    if (data.length > 0) {
      calculateSummary(data);
    }
  }, [codeSearch, partnerLevelFilter]);

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
      case 3: return 'rgba(59, 130, 246, 0.08)'; // 본사 - 파란색
      case 4: return 'rgba(34, 197, 94, 0.08)'; // 부본사 - 초록색
      case 5: return 'rgba(245, 158, 11, 0.08)'; // 총판 - 주황색
      case 6: return 'rgba(236, 72, 153, 0.08)'; // 매장 - 핑크색
      default: return 'transparent';
    }
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 0: return '회원';
      case 3: return '본사';
      case 4: return '부본사';
      case 5: return '총판';
      case 6: return '매장';
      default: return '운영사';
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
      onlineDeposit: filtered.reduce((sum, r) => sum + r.onlineDeposit, 0),
      onlineWithdrawal: filtered.reduce((sum, r) => sum + r.onlineWithdrawal, 0),
      partnerDeposit: filtered.reduce((sum, r) => sum + r.partnerDeposit, 0),
      partnerWithdrawal: filtered.reduce((sum, r) => sum + r.partnerWithdrawal, 0),
      depositWithdrawalDiff: filtered.reduce((sum, r) => sum + r.depositWithdrawalDiff, 0),
      casinoBet: filtered.reduce((sum, r) => sum + r.casinoBet, 0),
      casinoWin: filtered.reduce((sum, r) => sum + r.casinoWin, 0),
      slotBet: filtered.reduce((sum, r) => sum + r.slotBet, 0),
      slotWin: filtered.reduce((sum, r) => sum + r.slotWin, 0),
      ggr: filtered.reduce((sum, r) => sum + r.ggr, 0),
      totalRolling: filtered.reduce((sum, r) => sum + r.totalRolling, 0),
      rollingProfit: filtered.reduce((sum, r) => sum + r.totalRolling - r.totalLosing, 0)
    };
    setSummary(s);
  };

  const getFilteredRows = (rows: SettlementRow[]): SettlementRow[] => {
    let filtered = rows;
    if (codeSearch.trim()) {
      filtered = filtered.filter(r => r.username.toLowerCase().includes(codeSearch.toLowerCase()));
    }
    if (partnerLevelFilter !== 'all') {
      filtered = filtered.filter(r => r.level === partnerLevelFilter);
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
      // ✅ Lv3~Lv5: 하위 파트너만 조회
      let allowedPartnerIds: string[] = [];

      // get_hierarchical_partners RPC 사용
      const { data: hierarchicalPartners } = await supabase
        .rpc('get_hierarchical_partners', { p_partner_id: user.id });

      if (hierarchicalPartners) {
        allowedPartnerIds = hierarchicalPartners.map((p: any) => p.id);
      }

      // 본인 제외
      allowedPartnerIds = allowedPartnerIds.filter(id => id !== user.id);

      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('*')
        .in('id', allowedPartnerIds)
        .order('level', { ascending: true })
        .order('username', { ascending: true });

      if (partnersError) throw partnersError;

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
      console.log('[Lv35 정산 페이지] 베팅 데이터 로드:', {
        targetUserIds: targetUserIds.length,
        gameRecordsCount: gameRecords?.length || 0,
        casinoBets: gameRecords?.filter(gr => gr.game_type === 'casino').length || 0,
        slotBets: gameRecords?.filter(gr => gr.game_type === 'slot').length || 0,
        dateRange: { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }
      });

      // ✅ partner_balance_logs 조회 (관리자입금/관리자출금용) - 전체입출금내역과 동일한 방식
      let partnerBalanceLogsQuery = supabase
        .from('partner_balance_logs')
        .select('*')
        .in('transaction_type', ['deposit', 'withdrawal'])
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      // 조직격리: 허용된 파트너 ID만 조회
      partnerBalanceLogsQuery = partnerBalanceLogsQuery.in('partner_id', allowedPartnerIds);

      const { data: partnerBalanceLogs, error: partnerBalanceError } = await partnerBalanceLogsQuery;
      if (partnerBalanceError) throw partnerBalanceError;

      // ✅ TransactionManagement와 동일한 completedTransactions 생성 (입출금 + 포인트)
      const completedTransactions = getCompletedTransactionsForSettlement(
        transactionsData || [], 
        partnerBalanceLogs || [],
        pointTransactions || []
      );
      
      // ✅ 정산 계산 (completedTransactions 기반)
      const rows = processSettlementData(partners || [], users || [], completedTransactions, pointTransactions || [], gameRecords || []);
      setData(rows);
      calculateSummary(rows);
      
      // ✅ 정산 결과 확인 (디버깅)
      console.log('[Lv35 정산 페이지] 계산 완료:', {
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
    gameRecords: any[]
  ): SettlementRow[] => {
    // ✅ completedTransactions에서 입출금 트랜잭션만 분리
    const depositWithdrawalTransactions = completedTransactions.filter(t => 
      !t.is_point_transaction && (t.transaction_type || t.user_id)
    );
    
    // ✅ 포인트 트랜잭션만 필터링
    const pointTransactions = completedTransactions.filter(t => t.is_point_transaction) || allPointTransactions || [];
    
    // ✅ partner_balance_logs 분리
    const partnerBalanceLogs = completedTransactions.filter(t => t.is_partner_transaction) || [];
    
    const rows: SettlementRow[] = [];

    // ✅ 파트너 데이터 추가
    for (const partner of partners) {
      const hasChildren = partners.some(p => p.parent_id === partner.id) || users.some(u => u.referrer_id === partner.id);
      const row = calculateRowData(partner.id, partner.username, partner.level, partner.balance || 0, 0,
        partner.casino_rolling_commission || 0, partner.casino_losing_commission || 0,
        partner.slot_rolling_commission || 0, partner.slot_losing_commission || 0,
        depositWithdrawalTransactions, partnerBalanceLogs, pointTransactions, gameRecords, partners, users);
      rows.push({ 
        ...row, 
        type: 'partner', // ✅ 파트너 타입
        parentId: partner.parent_id, 
        hasChildren 
      });
    }

    // ✅ 등급 회원 데이터 추가 (레벨 0 = 회원)
    for (const member of users) {
      const row = calculateRowData(member.id, member.username, 0, member.balance || 0, member.points || 0,
        member.casino_rolling_commission || 0, member.casino_losing_commission || 0,
        member.slot_rolling_commission || 0, member.slot_losing_commission || 0,
        depositWithdrawalTransactions, partnerBalanceLogs, pointTransactions, gameRecords, partners, users);
      rows.push({ 
        ...row, 
        type: 'member', // ✅ 회원 타입
        parentId: member.referrer_id, 
        hasChildren: false 
      });
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
    partnerBalanceLogs: any[],
    pointTransactions: any[],
    gameRecords: any[],
    partners: any[],
    users: any[]
  ): SettlementRow => {
    // ✅ 수정: 직속 회원 데이터 합산
    // 각 파트너 행은 "해당 파트너의 직속 회원들"의 게임 데이터를 기반으로 계산
    let relevantUserIdsForTransactions: string[] = [];

    if (level >= 3 && level <= 6) {
      // ✅ 해당 파트너의 직속 회원들의 데이터만 합산
      const directUserIds = users.filter(u => u.referrer_id === entityId).map(u => u.id);
      relevantUserIdsForTransactions = directUserIds;
    } else if (level === 0) {
      // 회원: 본인 데이터만 계산
      relevantUserIdsForTransactions = [entityId];
    } else {
      // Lv1, Lv2: 본인 데이터만 계산
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

    // ✅ 파트너 충전/환전 (partner_balance_logs 기준)
    // 데이터 소스: partner_balance_logs 테이블
    // 파트너 충전: to_partner_id = 본인, transaction_type = 'deposit'
    const partnerDeposit = partnerBalanceLogs
      .filter(l => l.to_partner_id === entityId && l.transaction_type === 'deposit')
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    // 파트너 환전: from_partner_id = 본인, transaction_type = 'withdrawal'
    const partnerWithdrawal = partnerBalanceLogs
      .filter(l => l.from_partner_id === entityId && l.transaction_type === 'withdrawal')
      .reduce((sum, l) => sum + Math.abs(l.amount || 0), 0);

    // ✅ 게임 기록 (본인 데이터만)
    const relevantGameRecords = gameRecords.filter(gr => relevantUserIdsForTransactions.includes(gr.user_id));
    const casinoBetRecords = relevantGameRecords.filter(gr => gr.game_type === 'casino');
    const slotBetRecords = relevantGameRecords.filter(gr => gr.game_type === 'slot');

    const casinoBet = Math.abs(casinoBetRecords.reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const casinoWin = casinoBetRecords.reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
    const slotBet = Math.abs(slotBetRecords.reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const slotWin = slotBetRecords.reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
    
    // ✅ 게임 데이터 로드 확인 (디버깅)
    if (casinoBet > 0 || slotBet > 0) {
      console.log(`[Lv35 정산계산] ${username}:`, {
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

    // ✅ 입출차액 = (온라인 입금 + 파트너 충전) - (온라인 출금 + 파트너 환전)
    const depositWithdrawalDiff = onlineDeposit + partnerDeposit - onlineWithdrawal - partnerWithdrawal;

    return {
      level,
      levelName: getLevelName(level),
      id: entityId,
      username,
      type: level > 0 ? 'partner' : 'member', // ✅ 타입 반환
      casinoRollingRate,
      slotRollingRate,
      casinoLosingRate,
      slotLosingRate,
      balance,
      points,
      onlineDeposit,
      onlineWithdrawal,
      partnerDeposit,
      partnerWithdrawal,
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
            통합 정산 관리
          </h1>
          {/* <p className="text-muted-foreground">
          개별 정산 페이지입니다
          </p> */}
        </div>
        <Button onClick={fetchSettlementData} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white">
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          새로고침
        </Button>
      </div>

      {/* 필터 영역 */}
      <div className="glass-card rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 mb-6">
        {/* 첫 번째 행: 총입금 / 총출금 / 파트너충전 / 파트너환전 */}
        <div className="bg-gradient-to-br from-emerald-900/50 to-slate-900 rounded-xl p-4 border border-emerald-700/30 hover:border-emerald-600/50 transition-all shadow-lg shadow-emerald-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-emerald-500/20 rounded-lg"><ArrowUpRight className="h-6 w-6 text-emerald-400" /></div><span className="text-2xl text-slate-400 font-medium">총 입금</span></div>
          <div className="text-3xl font-bold text-emerald-400 font-asiahead ml-12">{formatNumber(summary.onlineDeposit)}</div>
        </div>
        <div className="bg-gradient-to-br from-rose-900/50 to-slate-900 rounded-xl p-4 border border-rose-700/30 hover:border-rose-600/50 transition-all shadow-lg shadow-rose-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-rose-500/20 rounded-lg"><ArrowDownRight className="h-6 w-6 text-rose-400" /></div><span className="text-2xl text-slate-400 font-medium">총 출금</span></div>
          <div className="text-3xl font-bold text-rose-400 font-asiahead ml-12">{formatNumber(summary.onlineWithdrawal)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/50 to-slate-900 rounded-xl p-4 border border-blue-700/30 hover:border-blue-600/50 transition-all shadow-lg shadow-blue-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-blue-500/20 rounded-lg"><DollarSign className="h-6 w-6 text-blue-400" /></div><span className="text-2xl text-slate-400 font-medium">파트너 충전</span></div>
          <div className="text-3xl font-bold text-blue-400 font-asiahead ml-12">{formatNumber(summary.partnerDeposit)}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-900/50 to-slate-900 rounded-xl p-4 border border-orange-700/30 hover:border-orange-600/50 transition-all shadow-lg shadow-orange-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-orange-500/20 rounded-lg"><DollarSign className="h-6 w-6 text-orange-400" /></div><span className="text-2xl text-slate-400 font-medium">파트너 환전</span></div>
          <div className="text-3xl font-bold text-orange-400 font-asiahead ml-12">{formatNumber(summary.partnerWithdrawal)}</div>
        </div>

        {/* 두 번째 행: 카지노베팅 / 카지노 당첨 / 슬롯 베팅 / 슬롯 당첨 */}
        <div className="bg-gradient-to-br from-violet-900/50 to-slate-900 rounded-xl p-4 border border-violet-700/30 hover:border-violet-600/50 transition-all shadow-lg shadow-violet-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-violet-500/20 rounded-lg"><TrendingUp className="h-6 w-6 text-violet-400" /></div><span className="text-2xl text-slate-400 font-medium">카지노베팅</span></div>
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

        {/* 세 번째 행: 입출 차액 / GGR / 총 롤링금 / 롤링수익 */}
        <div className="bg-gradient-to-br from-cyan-900/50 to-slate-900 rounded-xl p-4 border border-cyan-700/30 hover:border-cyan-600/50 transition-all shadow-lg shadow-cyan-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-cyan-500/20 rounded-lg"><Activity className="h-6 w-6 text-cyan-400" /></div><span className="text-2xl text-slate-400 font-medium">입출 차액</span></div>
          <div className={cn("text-3xl font-bold font-asiahead ml-12", summary.depositWithdrawalDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatNumber(summary.depositWithdrawalDiff)}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-800/50 to-slate-900 rounded-xl p-4 border border-amber-600/30 hover:border-amber-500/50 transition-all shadow-lg shadow-amber-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-amber-500/20 rounded-lg"><TrendingUp className="h-6 w-6 text-amber-400" /></div><span className="text-2xl text-slate-400 font-medium">GGR</span></div>
          <div className="text-3xl font-bold text-amber-400 font-asiahead ml-12">{formatNumber(summary.ggr)}</div>
        </div>
        <div className="bg-gradient-to-br from-sky-900/50 to-slate-900 rounded-xl p-4 border border-sky-700/30 hover:border-sky-600/50 transition-all shadow-lg shadow-sky-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-sky-500/20 rounded-lg"><Percent className="h-6 w-6 text-sky-400" /></div><span className="text-2xl text-slate-400 font-medium">총 롤링금</span></div>
          <div className="text-3xl font-bold text-sky-400 font-asiahead ml-12">{formatNumber(summary.totalRolling)}</div>
        </div>
        <div className="bg-gradient-to-br from-green-900/50 to-slate-900 rounded-xl p-4 border border-green-700/30 hover:border-green-600/50 transition-all shadow-lg shadow-green-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-green-500/20 rounded-lg"><Gift className="h-6 w-6 text-green-400" /></div><span className="text-2xl text-slate-400 font-medium">롤링수익</span></div>
          <div className="text-3xl font-bold text-green-400 font-asiahead ml-12">{formatNumber(summary.rollingProfit)}</div>
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

          <div className="flex items-center gap-2">
            <Button onClick={() => setPartnerLevelFilter('all')} variant={partnerLevelFilter === 'all' ? 'default' : 'outline'} className="h-10 px-3">전체</Button>
            <Button onClick={() => setPartnerLevelFilter(4)} variant={partnerLevelFilter === 4 ? 'default' : 'outline'} className="h-10 px-3">부본사</Button>
            <Button onClick={() => setPartnerLevelFilter(5)} variant={partnerLevelFilter === 5 ? 'default' : 'outline'} className="h-10 px-3">총판</Button>
            <Button onClick={() => setPartnerLevelFilter(6)} variant={partnerLevelFilter === 6 ? 'default' : 'outline'} className="h-10 px-3">매장</Button>
          </div>
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
                    <th className="px-4 py-0 text-center text-white font-normal bg-slate-800/70" rowSpan={1} style={{ minWidth: '120px' }}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50 whitespace-nowrap">정산 기준 설정</div>
                        <div className="flex">
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '40px', flexShrink: 0 }}>카지노</div>
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '40px', flexShrink: 0 }}>슬롯</div>
                          <div className="py-2 whitespace-nowrap" style={{ flexBasis: '40px', flexShrink: 0 }}>루징</div>
                        </div>
                      </div>
                    </th>

                    {/* 보유 자산 (머니/포인트) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-indigo-950/60" rowSpan={1} style={{ minWidth: '160px' }}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50 whitespace-nowrap">보유 자산</div>
                        <div className="flex">
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>머니</div>
                          <div className="py-2 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>포인트</div>
                        </div>
                      </div>
                    </th>

                    {/* 온라인 입출금 (입금/출금) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-orange-950/60" rowSpan={1} style={{ minWidth: '160px' }}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50 whitespace-nowrap">온라인 입출금</div>
                        <div className="flex">
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>입금</div>
                          <div className="py-2 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>출금</div>
                        </div>
                      </div>
                    </th>

                    {/* 파트너 충전/환전 (충전/환전) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-rose-950/60" rowSpan={1} style={{ minWidth: '160px' }}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50 whitespace-nowrap">파트너 충전/환전</div>
                        <div className="flex">
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>충전</div>
                          <div className="py-2 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>환전</div>
                        </div>
                      </div>
                    </th>
                    
                    {/* 입출 차액 */}
                    <th className="px-4 py-3 text-center text-white font-normal bg-cyan-950/60 whitespace-nowrap" style={{ minWidth: '120px' }}>입출 차액</th>

                    {/* 게임 실적 (카지노 베팅/카지노 당첨/슬롯베팅/슬롯당첨) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-blue-950/60" rowSpan={1}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50 whitespace-nowrap">게임 실적</div>
                        <div className="flex">
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>카지노 베팅</div>
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>카지노 당첨</div>
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>슬롯베팅</div>
                          <div className="py-2 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>슬롯당첨</div>
                        </div>
                      </div>
                    </th>

                    {/* GGR 합산 */}
                    <th className="px-4 py-3 text-center text-white font-normal bg-amber-950/60 whitespace-nowrap" style={{ minWidth: '140px' }}>GGR 합산</th>
                    
                    {/* 실정산 (총 롤링금/총 루징) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-teal-950/60" rowSpan={1} style={{ minWidth: '160px' }}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50 whitespace-nowrap">실정산</div>
                        <div className="flex">
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>총 롤링금</div>
                          <div className="py-2 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>총 루징</div>
                        </div>
                      </div>
                    </th>

                    {/* 코드별 실정산 (롤링금/루징) - 2단 */}
                    <th className="px-4 py-0 text-center text-white font-normal bg-emerald-950/70" rowSpan={1} style={{ minWidth: '160px' }}>
                      <div className="flex flex-col">
                        <div className="py-2 border-b border-slate-700/50 whitespace-nowrap">코드별 실정산</div>
                        <div className="flex">
                          <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>롤링금</div>
                          <div className="py-2 whitespace-nowrap" style={{ flexBasis: '80px', flexShrink: 0 }}>루징</div>
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
                        
                        {/* 파트너 충전/환전 (충전/환전) */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.partnerDeposit)}</div>
                            <div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.partnerWithdrawal)}</div>
                          </div>
                        </td>
                        
                        {/* 입출차액 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="text-cyan-400 font-asiahead">{formatNumber(row.depositWithdrawalDiff)}</div>
                        </td>
                        
                        {/* 게임 실적 (카지노 베팅/카지노 당첨/슬롯 베팅/슬롯 당첨) */}
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
                        
                        {/* 실정산 (총 롤링금/총 루징) */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.totalRolling)}</div>
                            <div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.totalLosing)}</div>
                          </div>
                        </td>
                        
                        {/* 코드별 실정산 (롤링금/루징) */}
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
                  <span className="text-sm text-slate-300 px-2">
                    {currentPage} / {totalPages}
                  </span>
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
