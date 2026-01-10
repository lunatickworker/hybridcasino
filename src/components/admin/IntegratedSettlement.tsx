import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Search, Info, ChevronDown, ChevronRight, TrendingUp, TrendingDown, DollarSign, Wallet } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { MetricCard } from "./MetricCard";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
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
  partnerRequestDeposit: number;  // ✅ 파트너요청금 - 입금
  partnerRequestWithdrawal: number;  // ✅ 파트너요청금 - 출금
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
  casinoLosingRate: number;
  slotRollingRate: number;
  slotLosingRate: number;
  casinoTotalRolling: number;
  slotTotalRolling: number;
  totalRolling: number;
  casinoChildrenRolling: number;
  slotChildrenRolling: number;
  casinoIndividualRolling: number;
  slotIndividualRolling: number;
  totalIndividualRolling: number;
  casinoTotalLosing: number;
  slotTotalLosing: number;
  totalLosing: number;
  casinoChildrenLosing: number;
  slotChildrenLosing: number;
  casinoIndividualLosing: number;
  slotIndividualLosing: number;
  totalIndividualLosing: number;
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
  partnerRequestDeposit: number;  // 관리자 신청입금
  partnerRequestWithdrawal: number;  // 관리자 신청출금
  pointGiven: number;
  pointRecovered: number;
  depositWithdrawalDiff: number;
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
  totalBet: number;
  totalWin: number;
  totalRolling: number;
  totalSettlementProfit: number;
  errorBetAmount: number; // ✅ NEW: 베팅정보오류금액
  errorBetCount: number;  // ✅ NEW: 베팅정보오류건수
}

export function IntegratedSettlement({ user }: IntegratedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'all' | '2' | '3' | '4' | '5' | '6' | 'user'>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [showCumulative, setShowCumulative] = useState(false); // 기본값: 오늘 기준 정산
  const [data, setData] = useState<SettlementRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [summary, setSummary] = useState<SummaryStats>({
    totalDeposit: 0,
    totalWithdrawal: 0,
    adminTotalDeposit: 0,
    adminTotalWithdrawal: 0,
    partnerRequestDeposit: 0,
    partnerRequestWithdrawal: 0,
    pointGiven: 0,
    pointRecovered: 0,
    depositWithdrawalDiff: 0,
    casinoBet: 0,
    casinoWin: 0,
    slotBet: 0,
    slotWin: 0,
    totalBet: 0,
    totalWin: 0,
    totalRolling: 0,
    totalSettlementProfit: 0,
    errorBetAmount: 0,
    errorBetCount: 0
  });
  
  // ✅ 베팅정보오류 통계를 별도로 state 관리
  const [bettingErrors, setBettingErrors] = useState({ errorBetAmount: 0, errorBetCount: 0 });

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange, showCumulative]);

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
      // 전체 접기
      setExpandedRows(new Set());
      setExpandAll(false);
    } else {
      // 전체 펼치기
      const allIds = new Set(data.filter(r => r.hasChildren).map(r => r.id));
      setExpandedRows(allIds);
      setExpandAll(true);
    }
  };

  const getRowBackgroundColor = (level: number): string => {
    switch (level) {
      case 1: return 'rgba(147, 51, 234, 0.08)'; // 슈퍼관리자 - 보라색
      case 2: return 'rgba(239, 68, 68, 0.08)'; // 운영사(대본) - 빨간색
      case 3: return 'rgba(59, 130, 246, 0.08)'; // 본사 - 파란색
      case 4: return 'rgba(34, 197, 94, 0.08)'; // 부본사 - 초록색
      case 5: return 'rgba(245, 158, 11, 0.08)'; // 총판 - 주황색
      case 6: return 'rgba(236, 72, 153, 0.08)'; // 매장 - 핑크색
      default: return 'transparent'; // 회원 - 투명
    }
  };

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      // console.log 제거

      // ✅ 계층 구조에 따른 허용된 파트너 ID 목록 생성
      let allowedPartnerIds: string[] = [];
      
      if (user.level === 1) {
        // 레벨 1 (시스템 관리자): 모든 파트너 (lv2 이상)
        const { data: allPartners } = await supabase
          .from('partners')
          .select('id')
          .gte('level', 2); // lv2(운영사) 이상만
        allowedPartnerIds = allPartners?.map(p => p.id) || [];
        // console.log 제거
      } else {
        // 레벨 2 이상: 자기 자신 + 모든 하위 파트너
        allowedPartnerIds = [user.id];
        
        // get_hierarchical_partners RPC 사용
        const { data: hierarchicalPartners } = await supabase
          .rpc('get_hierarchical_partners', { p_partner_id: user.id });
        
        if (hierarchicalPartners) {
          allowedPartnerIds.push(...hierarchicalPartners.map((p: any) => p.id));
        }
        // console.log 제거
      }

      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('*')
        .in('id', allowedPartnerIds)
        .order('level', { ascending: true })
        .order('username', { ascending: true });

      if (partnersError) throw partnersError;
      // console.log 제거

      // ✅ 현재 로그인 사용자만 제외
      const filteredPartners = (partners || []).filter(p => p.id !== user.id);
      // console.log 제거

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('referrer_id', allowedPartnerIds)
        .order('username', { ascending: true });

      if (usersError) throw usersError;
      // console.log 제거

      // 거래 데이터 조회 (누적 정산 모드면 날짜 필터 제거)
      // ⭐ 회원 + 파트너 ID 모두 포함 (파트너 간 입금/출금도 집계하기 위해)
      const targetUserIds = [
        ...(users?.map(u => u.id) || []),
        ...(partners?.map(p => p.id) || [])
      ];
      // console.log 제거
      
      // ✅ allTransactions 변수 선언 (스코프 확장)
      let allTransactions: any[] = [];
      
      // ✅ transactions 테이블 조회: user_id + partner_id 모두 포함 (입출금관리 페이지와 동일)
      let transactionsQuery = supabase.from('transactions').select('*');
      
      const userOnlyIds = users?.map(u => u.id) || [];
      const partnerOnlyIds = partners?.map(p => p.id) || [];
      
      if (userOnlyIds.length > 0 && partnerOnlyIds.length > 0) {
        // user_id로 조회 OR partner_id로 조회
        transactionsQuery = transactionsQuery.or(`user_id.in.(${userOnlyIds.join(',')}),partner_id.in.(${partnerOnlyIds.join(',')})`);
      } else if (userOnlyIds.length > 0) {
        transactionsQuery = transactionsQuery.in('user_id', userOnlyIds);
      } else if (partnerOnlyIds.length > 0) {
        transactionsQuery = transactionsQuery.in('partner_id', partnerOnlyIds);
      }
      
      let transactionsQuery2 = transactionsQuery;
      if (!showCumulative) {
        // console.log 제거
        transactionsQuery2 = transactionsQuery2
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
      }
      // console.log 제거
      const { data: transactionsData, error: transError } = await transactionsQuery2;

      if (transError) throw transError;
      
      // ✅ allTransactions에 할당
      allTransactions = transactionsData || [];
      // console.log 제거
      
      // ✅ partner_balance_logs 조회 (관리자입금/관리자출금용) - 전체입출금내역과 동일한 방식
      let partnerBalanceLogsQuery = supabase
        .from('partner_balance_logs')
        .select('*')
        .in('transaction_type', ['deposit', 'withdrawal']);
      
      // ✅ Lv2 이상: partner_id, from_partner_id, to_partner_id 중 하나라도 매칭되면 조회
      if (user.level > 1) {
        partnerBalanceLogsQuery = partnerBalanceLogsQuery.or(
          `partner_id.in.(${allowedPartnerIds.join(',')}),` +
          `from_partner_id.in.(${allowedPartnerIds.join(',')}),` +
          `to_partner_id.in.(${allowedPartnerIds.join(',')})`
        );
      }
      // Lv1은 필터 없이 전체 조회
      
      if (!showCumulative) {
        partnerBalanceLogsQuery = partnerBalanceLogsQuery
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
      }
      const { data: partnerBalanceLogs, error: balanceLogsError } = await partnerBalanceLogsQuery;

      if (balanceLogsError) throw balanceLogsError;
      
      // 관리자 입금/출금 통계
      const adminDeposits = partnerBalanceLogs?.filter(l => l.transaction_type === 'deposit') || [];
      const adminWithdrawals = partnerBalanceLogs?.filter(l => l.transaction_type === 'withdrawal') || [];
      
      // ✅ transactions 테이블의 partner_deposit도 포함
      const partnerDepositFromTransactions = allTransactions?.filter(t => 
        t.transaction_type === 'partner_deposit' && t.status === 'completed'
      ) || [];
      
      // ✅ 관리자 입금 로그 (transactions + partner_balance_logs 통합)
      console.log('💰 관리자 입금 로그 (통합정산):', {
        fromTransactions: {
          count: partnerDepositFromTransactions.length,
          total: partnerDepositFromTransactions.reduce((sum, t) => sum + (t.amount || 0), 0),
          details: partnerDepositFromTransactions.map(t => ({
            source: 'transactions',
            id: t.id,
            user_id: t.user_id,
            partner_id: t.partner_id,
            amount: t.amount,
            status: t.status,
            created_at: t.created_at,
            memo: t.memo
          }))
        },
        fromPartnerBalanceLogs: {
          count: adminDeposits.length,
          total: adminDeposits.reduce((sum, l) => sum + (l.amount || 0), 0),
          details: adminDeposits.map(l => ({
            source: 'partner_balance_logs',
            id: l.id,
            partner_id: l.partner_id,
            from_partner_id: l.from_partner_id,
            to_partner_id: l.to_partner_id,
            amount: l.amount,
            created_at: l.created_at,
            memo: l.memo
          }))
        },
        total: partnerDepositFromTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) + 
               adminDeposits.reduce((sum, l) => sum + (l.amount || 0), 0),
        totalCount: partnerDepositFromTransactions.length + adminDeposits.length
      });

      // 포인트 거래 데이터 조회
      let pointTransactionsQuery = supabase.from('point_transactions').select('*').in('user_id', targetUserIds);
      if (!showCumulative) {
        pointTransactionsQuery = pointTransactionsQuery
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
      }
      const { data: pointTransactions, error: pointError } = await pointTransactionsQuery;

      if (pointError) throw pointError;
      // console.log 제거

      // 게임 기록 조회 (game_records는 played_at 컬럼 사용!)
      let gameRecordsQuery = supabase.from('game_records').select('*').in('user_id', targetUserIds);
      if (!showCumulative) {
        gameRecordsQuery = gameRecordsQuery
          .gte('played_at', dateRange.from.toISOString())
          .lte('played_at', dateRange.to.toISOString());
      }
      const { data: gameRecords, error: gameError } = await gameRecordsQuery;

      if (gameError) throw gameError;
      // console.log 제거
      
      // ✅ 베팅정보오류 통계 계산
      let errorBetAmount = 0;
      let errorBetCount = 0;
      
      if (gameRecords && gameRecords.length > 0) {
        for (const record of gameRecords) {
          const hasNullInfo = !record.game_title || record.game_title === 'null' || 
                             !record.provider_name || record.provider_name === 'null';
          
          if (hasNullInfo) {
            errorBetCount++;
            errorBetAmount += Math.abs(record.bet_amount || 0);
          }
        }
      }
      
      console.log('✅ 베팅정보오류:', { errorBetCount, errorBetAmount });
      
      // ✅ 오류 통계를 state에 저장
      setBettingErrors({ errorBetAmount, errorBetCount });
      
      // console.log 제거

      const rows = await processSettlementData(filteredPartners || [], users || [], allTransactions || [], pointTransactions || [], gameRecords || [], partnerBalanceLogs || []);
      
      // console.log 제거
      setData(rows);
      calculateSummary(rows);

    } catch (error) {
      console.error('❌ 정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const processSettlementData = async (
    partners: any[],
    users: any[],
    transactions: any[],
    pointTransactions: any[],
    gameRecords: any[],
    partnerBalanceLogs: any[]
  ): Promise<SettlementRow[]> => {
    const rows: SettlementRow[] = [];

    for (const partner of partners) {
      // console.log 제거

      const hasChildren = partners.some(p => p.parent_id === partner.id) || 
                         users.some(u => u.referrer_id === partner.id);
      
      const row = await calculateRowData(
        partner.id,
        partner.username,
        partner.level,
        partner.balance || 0,
        0,
        partner.casino_rolling_commission || 0,
        partner.casino_losing_commission || 0,
        partner.slot_rolling_commission || 0,
        partner.slot_losing_commission || 0,
        transactions,
        pointTransactions,
        gameRecords,
        partners,
        users,
        partnerBalanceLogs
      );
      rows.push({
        ...row,
        parentId: partner.parent_id,
        hasChildren
      });
    }

    for (const user of users) {
      // console.log 제거

      const row = await calculateRowData(
        user.id,
        user.username,
        0,
        user.balance || 0,
        user.points || 0,
        user.casino_rolling_commission || user.casino_rolling_rate || 0,
        user.casino_losing_commission || user.casino_losing_rate || 0,
        user.slot_rolling_commission || user.slot_rolling_rate || 0,
        user.slot_losing_commission || user.slot_losing_rate || 0,
        transactions,
        pointTransactions,
        gameRecords,
        partners,
        users,
        partnerBalanceLogs
      );
      rows.push({
        ...row,
        referrerId: user.referrer_id,
        hasChildren: false
      });
    }

    return rows;
  };

  const getDescendantPartnerIds = (partnerId: string, allPartners: any[]): string[] => {
    const directChildren = allPartners.filter(p => p.parent_id === partnerId);
    let allDescendants = directChildren.map(p => p.id);
    
    for (const child of directChildren) {
      allDescendants = allDescendants.concat(getDescendantPartnerIds(child.id, allPartners));
    }
    
    return allDescendants;
  };

  // ✅ 특정 파트너의 직속 회원 ID 조회
  const getDescendantUserIds = (partnerId: string, allUsers: any[]): string[] => {
    const directUsers = allUsers.filter(u => u.referrer_id === partnerId);
    return directUsers.map(u => u.id);
  };

  // ✅ NEW: 파트너의 전체 하위 회원 ID 조회 (재귀)
  const getAllDescendantUserIds = (partnerId: string, allPartners: any[], allUsers: any[]): string[] => {
    // 1. 직속 회원
    const directUsers = allUsers.filter(u => u.referrer_id === partnerId).map(u => u.id);
    
    // 2. 하위 파트너들
    const childPartners = allPartners.filter(p => p.parent_id === partnerId);
    
    // 3. 하위 파트너들의 회원까지 재귀적으로 조회
    let allUsers_ids = [...directUsers];
    for (const childPartner of childPartners) {
      allUsers_ids = allUsers_ids.concat(getAllDescendantUserIds(childPartner.id, allPartners, allUsers));
    }
    
    return allUsers_ids;
  };

  // ✅ NEW: 파트너의 전체 하위 파트너 ID 조회 (재귀)
  const getAllDescendantPartnerIds = (partnerId: string, allPartners: any[]): string[] => {
    const directChildren = allPartners.filter(p => p.parent_id === partnerId);
    let allDescendants = directChildren.map(p => p.id);
    
    for (const child of directChildren) {
      allDescendants = allDescendants.concat(getAllDescendantPartnerIds(child.id, allPartners));
    }
    
    return allDescendants;
  };

  const calculateRowData = async (
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
  ): Promise<SettlementRow> => {
    const isPartner = level > 0;

    // console.log 제거

    // ✅ 입출금 관련: 파트너는 소속 회원들의 합계, 회원은 본인!
    let relevantUserIdsForTransactions: string[];
    if (isPartner) {
      // 파트너: 전체 하위 조직의 회원 ID
      relevantUserIdsForTransactions = getAllDescendantUserIds(entityId, partners, users);
      // console.log 제거
    } else {
      // 회원: 본인만
      relevantUserIdsForTransactions = [entityId];
    }

    const userTransactions = transactions.filter(t => relevantUserIdsForTransactions.includes(t.user_id));
    
    // ✅ 관리자 입출금/신청금 관련: 파트너는 하위 파트너들의 합계 (partner_id 사용)
    let relevantPartnerIdsForTransactions: string[];
    if (isPartner) {
      // 파트너: 본인 + 전체 하위 파트너 ID
      relevantPartnerIdsForTransactions = [
        entityId, // 본인
        ...getAllDescendantPartnerIds(entityId, partners) // 하위 파트너들
      ];
    } else {
      // 회원: 해당 없음 (관리자 입출금/신청금은 파트너만 해당)
      relevantPartnerIdsForTransactions = [];
    }

    // ✅ 파트너 거래 필터링 (partner_deposit, partner_withdrawal은 partner_id 사용)
    const partnerTransactions = transactions.filter(t => 
      (t.transaction_type === 'partner_deposit' || t.transaction_type === 'partner_withdrawal') && 
      relevantPartnerIdsForTransactions.includes(t.partner_id)
    );

    // ✅ 사용자 입출금: 사용자 요청 + 관리자 강제입출금 (입출금관리 페이지와 동기화)
    const deposit = userTransactions
      .filter(t => (t.transaction_type === 'deposit' || t.transaction_type === 'admin_deposit') && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const withdrawal = userTransactions
      .filter(t => (t.transaction_type === 'withdrawal' || t.transaction_type === 'admin_withdrawal') && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    // ✅ 관리자 입출금: 파트너 요청 + 파트너 강제입출금 (입출금관리 페이지의 관리자입금/관리자출금 필터 로직 그대로 사용)
    // 1️⃣ transactions 테이블에서 파트너 요청 집계 (partner_deposit, partner_withdrawal)
    const adminDepositFromTransactions = partnerTransactions
      .filter(t => t.transaction_type === 'partner_deposit' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const adminWithdrawalFromTransactions = partnerTransactions
      .filter(t => t.transaction_type === 'partner_withdrawal' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    // 2️⃣ partner_balance_logs 테이블에서 파트너 강제입출금 집계 (deposit, withdrawal)
    // relevantPartnerIdsForTransactions와 연관된 파트너만 필터링
    const relevantBalanceLogs = partnerBalanceLogs.filter(l => 
      relevantPartnerIdsForTransactions.includes(l.partner_id)
    );
    
    const adminDepositFromLogs = relevantBalanceLogs
      .filter(l => l.transaction_type === 'deposit')
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    const adminWithdrawalFromLogs = relevantBalanceLogs
      .filter(l => l.transaction_type === 'withdrawal')
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    // 3️⃣ 관리자입금/출금 합산 (입출금관리 페이지의 관리자입금/관리자출금 필터와 동일한 방식)
    const adminDeposit = adminDepositFromTransactions + adminDepositFromLogs;
    const adminWithdrawal = adminWithdrawalFromTransactions + adminWithdrawalFromLogs;
    
    // 4️⃣ 관리자신청금/출금 (transactions의 partner_deposit/partner_withdrawal)
    // 입출금관리 페이지의 "관리자입금신청/관리자출금신청"과 동일하게 transactions에서 집계
    const partnerRequestDeposit = partnerTransactions
      .filter(t => t.transaction_type === 'partner_deposit' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const partnerRequestWithdrawal = partnerTransactions
      .filter(t => t.transaction_type === 'partner_withdrawal' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    // ✅ 관리자 입금 상세 로그 (transactions 테이블 포함)
    const adminDepositFromTransactionsDetails = partnerTransactions
      .filter(t => t.transaction_type === 'partner_deposit' && t.status === 'completed')
      .map(t => ({
        source: 'transactions',
        id: t.id,
        user_id: t.user_id,
        partner_id: t.partner_id,
        amount: t.amount,
        created_at: t.created_at,
        memo: t.memo
      }));
    
    // console.log 제거 - 개별 로그는 출력하지 않음

    // ✅ 포인트 거래 데이터 필터링 - 파트너는 소속 회원, 회원은 본인!
    const userPointTrans = pointTransactions.filter(pt => relevantUserIdsForTransactions.includes(pt.user_id));

    const pointGiven = userPointTrans
      .filter(pt => pt.type === 'commission_earned')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);

    const pointRecovered = userPointTrans
      .filter(pt => pt.type === 'point_to_balance')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);

    // ✅ 포인트 거래의 입출금 (transaction_type이 deposit/withdrawal인 경우)
    const pointDeposit = userPointTrans
      .filter(pt => pt.transaction_type === 'deposit' || pt.transaction_type === 'admin_deposit')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);

    const pointWithdrawal = userPointTrans
      .filter(pt => pt.transaction_type === 'withdrawal' || pt.transaction_type === 'admin_withdrawal')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);

    // console.log 제거

    // ✅ 게임 기록 필터링 - 파트너는 전체 하위 조직, 회원은 본인만!
    let relevantUserIds: string[];
    if (isPartner) {
      // 파트너: 전체 하위 조직의 회원 ID
      relevantUserIds = getAllDescendantUserIds(entityId, partners, users);
      // console.log 제거
    } else {
      // 회원: 본인만
      relevantUserIds = [entityId];
    }

    const relevantGameRecords = gameRecords.filter(gr => relevantUserIds.includes(gr.user_id));

    // console.log 제거

    // ✅ 베팅액 계산 - 전체 하위 조직 포함
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

    // ✅ 당첨(win)이 음수로 저장되어 있으므로 더하기로 계산
    const casinoWinLoss = casinoBet + casinoWin;
    const slotWinLoss = slotBet + slotWin;
    const totalWinLoss = casinoWinLoss + slotWinLoss;

    const casinoTotalRolling = casinoBet * (casinoRollingRate / 100);
    const slotTotalRolling = slotBet * (slotRollingRate / 100);

    // console.log 제거

    const childrenRolling = await getChildrenTotalRolling(entityId, level, gameRecords, partners, users);

    const casinoIndividualRolling = Math.max(0, casinoTotalRolling - childrenRolling.casino);
    const slotIndividualRolling = Math.max(0, slotTotalRolling - childrenRolling.slot);
    const totalIndividualRolling = casinoIndividualRolling + slotIndividualRolling;
    const totalRolling = casinoTotalRolling + slotTotalRolling;

    const casinoLosableAmount = Math.max(0, casinoWinLoss - casinoTotalRolling);
    const slotLosableAmount = Math.max(0, slotWinLoss - slotTotalRolling);
    
    const casinoTotalLosing = casinoLosableAmount * (casinoLosingRate / 100);
    const slotTotalLosing = slotLosableAmount * (slotLosingRate / 100);

    const childrenLosing = await getChildrenTotalLosing(entityId, level, gameRecords, partners, users);

    const casinoIndividualLosing = Math.max(0, casinoTotalLosing - childrenLosing.casino);
    const slotIndividualLosing = Math.max(0, slotTotalLosing - childrenLosing.slot);
    const totalIndividualLosing = casinoIndividualLosing + slotIndividualLosing;
    const totalLosing = casinoTotalLosing + slotTotalLosing;

    // console.log 제거

    // 정산수익 = 윈로스 - 롤링금 (개별롤링 사용)
    const settlementProfit = totalWinLoss - totalIndividualRolling;
    // 실정산수익 = 윈로스 - 롤링금 - 루징금 (개별롤링, 개별루징 사용)
    const actualSettlementProfit = totalWinLoss - totalIndividualRolling - totalIndividualLosing;

    return {
      level,
      levelName: getLevelName(level),
      id: entityId,
      username,
      balance,
      points,
      deposit: deposit + pointDeposit, // ✅ 포인트 거래 입금 포함
      withdrawal: withdrawal + pointWithdrawal, // ✅ 포인트 거래 출금 포함
      adminDeposit,
      adminWithdrawal,
      partnerRequestDeposit,
      partnerRequestWithdrawal,
      pointGiven,
      pointRecovered,
      depositWithdrawalDiff: (deposit + pointDeposit) + (withdrawal + pointWithdrawal) + adminDeposit + adminWithdrawal, // ✅ 출금이 음수로 저장되어 있으므로 더하기
      casinoBet,
      casinoWin,
      casinoWinLoss,
      slotBet,
      slotWin,
      slotWinLoss,
      totalBet: casinoBet + slotBet,
      totalWin: casinoWin + slotWin,
      totalWinLoss,
      ggr: totalWinLoss,
      casinoRollingRate,
      casinoLosingRate,
      slotRollingRate,
      slotLosingRate,
      casinoTotalRolling,
      slotTotalRolling,
      totalRolling,
      casinoChildrenRolling: childrenRolling.casino,
      slotChildrenRolling: childrenRolling.slot,
      casinoIndividualRolling,
      slotIndividualRolling,
      totalIndividualRolling,
      casinoTotalLosing,
      slotTotalLosing,
      totalLosing,
      casinoChildrenLosing: childrenLosing.casino,
      slotChildrenLosing: childrenLosing.slot,
      casinoIndividualLosing,
      slotIndividualLosing,
      totalIndividualLosing,
      totalSettlement: settlementProfit,
      settlementProfit,
      actualSettlementProfit
    };
  };

  const getChildrenTotalRolling = async (
    parentId: string,
    parentLevel: number,
    gameRecords: any[],
    partners: any[],
    users: any[]
  ): Promise<{ casino: number; slot: number }> => {
    let casinoTotal = 0;
    let slotTotal = 0;

    if (parentLevel === 0) {
      return { casino: 0, slot: 0 };
    }

    const children = partners.filter(p => p.parent_id === parentId);
    
    for (const child of children) {
      const childUserIds = getDescendantUserIds(child.id, users);
      const childPartnerIds = getDescendantPartnerIds(child.id, partners);
      
      let childGameRecords = gameRecords.filter(gr => childUserIds.includes(gr.user_id));
      
      for (const descendantPartnerId of childPartnerIds) {
        const descendantUserIds = getDescendantUserIds(descendantPartnerId, users);
        childGameRecords = childGameRecords.concat(
          gameRecords.filter(gr => descendantUserIds.includes(gr.user_id))
        );
      }
      
      const casinoBet = childGameRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const slotBet = childGameRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      
      casinoTotal += casinoBet * ((child.casino_rolling_commission || 0) / 100);
      slotTotal += slotBet * ((child.slot_rolling_commission || 0) / 100);
    }

    const directUsers = users.filter(u => u.referrer_id === parentId);
    
    for (const childUser of directUsers) {
      const userRecords = gameRecords.filter(gr => gr.user_id === childUser.id);
      const casinoBet = userRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const slotBet = userRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      
      casinoTotal += casinoBet * ((childUser.casino_rolling_commission || 0) / 100);
      slotTotal += slotBet * ((childUser.slot_rolling_commission || 0) / 100);
    }

    return { casino: casinoTotal, slot: slotTotal };
  };

  const getChildrenTotalLosing = async (
    parentId: string,
    parentLevel: number,
    gameRecords: any[],
    partners: any[],
    users: any[]
  ): Promise<{ casino: number; slot: number }> => {
    let casinoTotal = 0;
    let slotTotal = 0;

    if (parentLevel === 0) {
      return { casino: 0, slot: 0 };
    }

    const children = partners.filter(p => p.parent_id === parentId);
    
    for (const child of children) {
      const childUserIds = getDescendantUserIds(child.id, users);
      const childPartnerIds = getDescendantPartnerIds(child.id, partners);
      
      let childGameRecords = gameRecords.filter(gr => childUserIds.includes(gr.user_id));
      
      for (const descendantPartnerId of childPartnerIds) {
        const descendantUserIds = getDescendantUserIds(descendantPartnerId, users);
        childGameRecords = childGameRecords.concat(
          gameRecords.filter(gr => descendantUserIds.includes(gr.user_id))
        );
      }
      
      const casinoBet = childGameRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const casinoWin = childGameRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
      const slotBet = childGameRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const slotWin = childGameRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
      
      const casinoRolling = casinoBet * ((child.casino_rolling_commission || 0) / 100);
      const slotRolling = slotBet * ((child.slot_rolling_commission || 0) / 100);
      
      // ✅ 당첨(win)이 음수로 저장되어 있으므로 더하기로 계산
      const casinoLosable = Math.max(0, (casinoBet + casinoWin) - casinoRolling);
      const slotLosable = Math.max(0, (slotBet + slotWin) - slotRolling);
      
      casinoTotal += casinoLosable * ((child.casino_losing_commission || 0) / 100);
      slotTotal += slotLosable * ((child.slot_losing_commission || 0) / 100);
    }

    const directUsers = users.filter(u => u.referrer_id === parentId);
    
    for (const childUser of directUsers) {
      const userRecords = gameRecords.filter(gr => gr.user_id === childUser.id);
      const casinoBet = userRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const casinoWin = userRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
      const slotBet = userRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const slotWin = userRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
      
      const casinoRolling = casinoBet * ((childUser.casino_rolling_commission || 0) / 100);
      const slotRolling = slotBet * ((childUser.slot_rolling_commission || 0) / 100);
      
      // ✅ 당첨(win)이 음수로 저장되어 있으므로 더하기로 계산
      const casinoLosable = Math.max(0, (casinoBet + casinoWin) - casinoRolling);
      const slotLosable = Math.max(0, (slotBet + slotWin) - slotRolling);
      
      casinoTotal += casinoLosable * ((childUser.casino_rolling_commission || 0) / 100);
      slotTotal += slotLosable * ((childUser.slot_losing_commission || 0) / 100);
    }

    return { casino: casinoTotal, slot: slotTotal };
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 1: return '슈퍼관리자';
      case 2: return '운영사(대본)';
      case 3: return '본사';
      case 4: return '부본사';
      case 5: return '총판';
      case 6: return '매장';
      default: return '회원';
    }
  };

  const calculateSummary = (rows: SettlementRow[]) => {
    const filteredRows = getFilteredRows(rows);
    
    // ✅ 현재 로그인 사용자의 다음 레벨만 필터링하여 집계
    // 예: Lv2 로그인 → Lv3만 집계, Lv3 로그인 → Lv4만 집계
    const nextLevelRows = filteredRows.filter(r => r.level === user.level + 1);
    
    const summary: SummaryStats = {
      totalDeposit: nextLevelRows.reduce((sum, r) => sum + r.deposit, 0),
      totalWithdrawal: nextLevelRows.reduce((sum, r) => sum + r.withdrawal, 0),
      adminTotalDeposit: nextLevelRows.reduce((sum, r) => sum + r.adminDeposit, 0),
      adminTotalWithdrawal: nextLevelRows.reduce((sum, r) => sum + r.adminWithdrawal, 0),
      partnerRequestDeposit: nextLevelRows.reduce((sum, r) => sum + r.partnerRequestDeposit, 0),
      partnerRequestWithdrawal: nextLevelRows.reduce((sum, r) => sum + r.partnerRequestWithdrawal, 0),
      pointGiven: nextLevelRows.reduce((sum, r) => sum + r.pointGiven, 0),
      pointRecovered: nextLevelRows.reduce((sum, r) => sum + r.pointRecovered, 0),
      depositWithdrawalDiff: 0,
      casinoBet: nextLevelRows.reduce((sum, r) => sum + r.casinoBet, 0),
      casinoWin: nextLevelRows.reduce((sum, r) => sum + r.casinoWin, 0),
      slotBet: nextLevelRows.reduce((sum, r) => sum + r.slotBet, 0),
      slotWin: nextLevelRows.reduce((sum, r) => sum + r.slotWin, 0),
      totalBet: nextLevelRows.reduce((sum, r) => sum + r.totalBet, 0),
      totalWin: nextLevelRows.reduce((sum, r) => sum + r.totalWin, 0),
      totalRolling: nextLevelRows.reduce((sum, r) => sum + r.totalIndividualRolling, 0),
      totalSettlementProfit: nextLevelRows.reduce((sum, r) => sum + r.totalSettlement, 0),
      errorBetAmount: bettingErrors.errorBetAmount,
      errorBetCount: bettingErrors.errorBetCount
    };
    
    // ✅ 입출차액 = 통계카드의 실제 입출금 값으로 계산 (출금이 음수로 저장되어 있으므로 더하기)
    summary.depositWithdrawalDiff = summary.totalDeposit + summary.totalWithdrawal + summary.adminTotalDeposit + summary.adminTotalWithdrawal;

    setSummary(summary);
  };

  const getFilteredRows = (rows: SettlementRow[]): SettlementRow[] => {
    let filtered = rows;

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
  };

  const getVisibleRows = (): SettlementRow[] => {
    const filtered = getFilteredRows(data);
    const visible: SettlementRow[] = [];

    const addRowWithChildren = (row: SettlementRow) => {
      visible.push(row);
      
      if (row.level > 0 && expandedRows.has(row.id)) {
        // 하부 파트너 찾기
        const childPartners = filtered.filter(r => r.parentId === row.id);
        childPartners.forEach(child => addRowWithChildren(child));
        
        // 하부 회원 찾기
        const childUsers = filtered.filter(r => r.level === 0 && r.referrerId === row.id);
        childUsers.forEach(user => visible.push(user));
      }
    };

    // 최상위 파트너만 먼저 추가 (parent_id가 없거나 허용된 목록에 없는 경우)
    const topLevelRows = filtered.filter(r => {
      if (r.level === 0) return false; // 회원은 제외
      if (!r.parentId) return true;
      return !filtered.some(parent => parent.id === r.parentId);
    });

    topLevelRows.forEach(row => addRowWithChildren(row));

    return visible;
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
    setDateFilterType(type);
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const visibleRows = getVisibleRows();
  const totalPages = Math.ceil(visibleRows.length / itemsPerPage);
  const paginatedRows = visibleRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // 페이지 변경 시 currentPage 초기화
  useEffect(() => {
    setCurrentPage(1);
  }, [levelFilter, codeSearch, itemsPerPage]);

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

      {/* 통계 카드 - 입출금/포인트 (6개) */}
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

      {/* 통계 카드 - 베팅 (6개) */}
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

      {/* 통계 카드 - 정산 (5개) */}
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
          value={`${formatNumber(summary.totalBet + summary.totalWin)}원`}
          subtitle="베팅 + 당첨"
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

        <MetricCard
          title="관리자 신청입금"
          value={`${formatNumber(summary.partnerRequestDeposit)}원`}
          subtitle="파트너 입금 신청"
          icon={TrendingUp}
          color="cyan"
        />

        <MetricCard
          title="관리자 신청출금"
          value={`${formatNumber(summary.partnerRequestWithdrawal)}원`}
          subtitle="파트너 출금 신청"
          icon={TrendingDown}
          color="orange"
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
            onClick={() => {
              setDateFilterType('today');
              const today = new Date();
              setDateRange({ from: startOfDay(today), to: endOfDay(today) });
            }}
            variant={dateFilterType === 'today' ? 'default' : 'outline'}
            className="h-10"
          >
            오늘
          </Button>
          <Button
            onClick={() => {
              setDateFilterType('yesterday');
              const yesterday = subDays(new Date(), 1);
              setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
            }}
            variant={dateFilterType === 'yesterday' ? 'default' : 'outline'}
            className="h-10"
          >
            어제
          </Button>
          <Button
            onClick={() => {
              setDateFilterType('week');
              const today = new Date();
              setDateRange({ from: startOfDay(subDays(today, 7)), to: endOfDay(today) });
            }}
            variant={dateFilterType === 'week' ? 'default' : 'outline'}
            className="h-10"
          >
            일주일
          </Button>
          <Button
            onClick={() => {
              setDateFilterType('month');
              const today = new Date();
              setDateRange({ from: startOfDay(subDays(today, 30)), to: endOfDay(today) });
            }}
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

          {/* 단축 레벨 필터 버튼 */}
          <div className="flex items-center gap-2 border-l border-slate-700 pl-3">
            <Button
              onClick={() => setLevelFilter('3')}
              variant={levelFilter === '3' ? 'default' : 'outline'}
              className="h-10"
            >
              본사
            </Button>
            <Button
              onClick={() => setLevelFilter('4')}
              variant={levelFilter === '4' ? 'default' : 'outline'}
              className="h-10"
            >
              부본사
            </Button>
            <Button
              onClick={() => setLevelFilter('5')}
              variant={levelFilter === '5' ? 'default' : 'outline'}
              className="h-10"
            >
              총판
            </Button>
            <Button
              onClick={() => setLevelFilter('6')}
              variant={levelFilter === '6' ? 'default' : 'outline'}
              className="h-10"
            >
              매장
            </Button>
            <Button
              onClick={() => setLevelFilter('user')}
              variant={levelFilter === 'user' ? 'default' : 'outline'}
              className="h-10"
            >
              회원
            </Button>
          </div>

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

          {/* 추가 옵션 */}
          <Button
            onClick={toggleExpandAll}
            variant="outline"
            className="h-10"
          >
            {expandAll ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
            {expandAll ? '전체 접기' : '전체 펼치기'}
          </Button>

          <Button
            onClick={() => setShowCumulative(!showCumulative)}
            variant={showCumulative ? 'default' : 'outline'}
            className="h-10"
          >
            누적정산 {showCumulative ? '끔' : '표기'}
          </Button>
        </div>

        {/* 데이터 테이블 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            정산 데이터가 없습니다.
          </div>
        ) : (
          <>
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
                /* 테이블 컬럼自适应宽度样式 */
                .settlement-table th,
                .settlement-table td {
                  min-width: max-content;
                  white-space: nowrap;
                }
                .settlement-table .compound-cell {
                  display: flex;
                  width: 100%;
                }
                .settlement-table .compound-cell > div {
                  flex: 1;
                  min-width: 0;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }
              `
            }} />
            <table className="w-full settlement-table">
              <thead>
                <tr className="border-b border-slate-700">
                  {/* 기본 정보 */}
                  <th className="px-4 py-3 text-center text-white font-normal sticky left-0 bg-slate-900 z-10 whitespace-nowrap">등급</th>
                  <th className="px-4 py-3 text-center text-white font-normal bg-slate-900 whitespace-nowrap">아이디</th>
                  
                  {/* 롤링률 (카지노/슬롯) - 2단2열 */}
                  <th className="px-4 py-0 text-center text-white font-normal bg-slate-800/70 border-r border-slate-700/50" rowSpan={1}>
                    <div className="flex flex-col">
                      <div className="py-2 border-b border-slate-700/50">롤링률</div>
                      <div className="flex">
                        <div className="flex-1 py-2 border-r border-slate-700/50">카지노</div>
                        <div className="flex-1 py-2">슬롯</div>
                      </div>
                    </div>
                  </th>
                  
                  {/* 루징 - 단일 열 */}
                  <th className="px-4 py-3 text-center text-white font-normal bg-slate-800/70 whitespace-nowrap">루징</th>
                  
                  {/* 보유머니 및 포인트 - 2단2열 */}
                  <th className="px-4 py-0 text-center text-white font-normal bg-indigo-950/60" rowSpan={1}>
                    <div className="flex flex-col">
                      <div className="py-2 border-b border-slate-700/50">보유머니 및 포인트</div>
                      <div className="flex">
                        <div className="flex-1 py-2 border-r border-slate-700/50">보유머니</div>
                        <div className="flex-1 py-2">포인트</div>
                      </div>
                    </div>
                  </th>
                  
                  {/* 입출금 관련 - 주황색 계열 */}
                  <th className="px-4 py-3 text-center text-white font-normal bg-orange-950/60 whitespace-nowrap">입금</th>
                  <th className="px-4 py-3 text-center text-white font-normal bg-orange-950/60 whitespace-nowrap">출금</th>
                  <th className="px-4 py-3 text-center text-white font-normal bg-orange-950/60 whitespace-nowrap">관리자입금</th>
                  <th className="px-4 py-3 text-center text-white font-normal bg-orange-950/60 whitespace-nowrap">관리자출금</th>
                  
                  {/* 관리자신청금 (입금/출금) - 2단2열 */}
                  <th className="px-4 py-0 text-center text-white font-normal bg-rose-950/60" rowSpan={1}>
                    <div className="flex flex-col">
                      <div className="py-2 border-b border-slate-700/50">관리자신청금</div>
                      <div className="flex">
                        <div className="flex-1 py-2 border-r border-slate-700/50">입금</div>
                        <div className="flex-1 py-2">출금</div>
                      </div>
                    </div>
                  </th>
                  
                  {/* 포인트 관련 - 초록색 계열 */}
                  <th className="px-4 py-3 text-center text-white font-normal bg-green-950/60 whitespace-nowrap">포인트지급</th>
                  <th className="px-4 py-3 text-center text-white font-normal bg-green-950/60 whitespace-nowrap">포인트회수</th>
                  
                  {/* 입출차액 - 청록색 */}
                  <th className="px-4 py-3 text-center text-white font-normal bg-cyan-950/60 whitespace-nowrap">입출차액</th>
                  
                  {/* 카지노 (베팅/당첨) - 2단2열 */}
                  <th className="px-4 py-0 text-center text-white font-normal bg-blue-950/60" rowSpan={1}>
                    <div className="flex flex-col">
                      <div className="py-2 border-b border-slate-700/50">카지노</div>
                      <div className="flex">
                        <div className="flex-1 py-2 border-r border-slate-700/50">베팅</div>
                        <div className="flex-1 py-2">당첨</div>
                      </div>
                    </div>
                  </th>
                  
                  {/* 슬롯 (베팅/당첨) - 2단2열 */}
                  <th className="px-4 py-0 text-center text-white font-normal bg-purple-950/60" rowSpan={1}>
                    <div className="flex flex-col">
                      <div className="py-2 border-b border-slate-700/50">슬롯</div>
                      <div className="flex">
                        <div className="flex-1 py-2 border-r border-slate-700/50">베팅</div>
                        <div className="flex-1 py-2">당첨</div>
                      </div>
                    </div>
                  </th>
                  
                  {/* GGR합산 - 앰버 계열 */}
                  <th className="px-4 py-3 text-center text-white font-normal bg-amber-950/60 whitespace-nowrap">GGR합산</th>
                  
                  {/* 총정산 (총 롤링금/총루징) - 2단2열 */}
                  <th className="px-4 py-0 text-center text-white font-normal bg-teal-950/60" rowSpan={1}>
                    <div className="flex flex-col">
                      <div className="py-2 border-b border-slate-700/50">총정산</div>
                      <div className="flex">
                        <div className="flex-1 py-2 border-r border-slate-700/50">총 롤링금</div>
                        <div className="flex-1 py-2">총루징</div>
                      </div>
                    </div>
                  </th>
                  
                  {/* 코드별 실정산 (롤링금/루징) - 2단2열 */}
                  <th className="px-4 py-0 text-center text-white font-normal bg-green-950/70" rowSpan={1}>
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
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-8 text-center text-slate-400">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, idx) => {
                    const bgColor = getRowBackgroundColor(row.level);
                    return (
                      <tr 
                        key={row.id} 
                        className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                        style={{ 
                          backgroundColor: bgColor
                        }}
                      >
                        <td 
                          className="px-4 py-3 text-slate-300 sticky left-0 z-10 whitespace-nowrap" 
                          style={{ 
                            backgroundColor: bgColor,
                            cursor: row.hasChildren ? 'pointer' : 'default'
                          }}
                          onClick={() => row.hasChildren && toggleRow(row.id)}
                        >
                          <div className="flex items-center gap-1">
                            {row.hasChildren && row.level > 0 && (
                              expandedRows.has(row.id) ? 
                                <ChevronDown className="size-4" /> : 
                                <ChevronRight className="size-4" />
                            )}
                            {row.levelName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-200 font-asiahead whitespace-nowrap">{row.username}</td>
                        
                        {/* 롤링률 (카지노/슬롯) - 2단2열 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-slate-300 font-asiahead">{row.casinoRollingRate}%</div>
                            <div className="flex-1 text-slate-300 font-asiahead">{row.slotRollingRate}%</div>
                          </div>
                        </td>
                        
                        {/* 루징 - 단일 열 */}
                        <td className="px-4 py-3 text-center text-slate-300 font-asiahead whitespace-nowrap">
                          {row.casinoLosingRate}%
                        </td>
                        
                        {/* 보유머니 및 포인트 - 2단2열 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-slate-300 font-asiahead">{formatNumber(row.balance)}</div>
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.points)}</div>
                          </div>
                        </td>
                        
                        <td className="px-4 py-3 text-center text-emerald-400 font-asiahead whitespace-nowrap">{formatNumber(row.deposit)}</td>
                        <td className="px-4 py-3 text-center text-rose-400 font-asiahead whitespace-nowrap">{formatNumber(row.withdrawal)}</td>
                        <td className="px-4 py-3 text-center text-emerald-400 font-asiahead whitespace-nowrap">{formatNumber(row.adminDeposit)}</td>
                        <td className="px-4 py-3 text-center text-rose-400 font-asiahead whitespace-nowrap">{formatNumber(row.adminWithdrawal)}</td>
                        
                        {/* 파트너요청금 (입금/출금) - 2단2열 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.partnerRequestDeposit)}</div>
                            <div className="flex-1 text-orange-400 font-asiahead">{formatNumber(row.partnerRequestWithdrawal)}</div>
                          </div>
                        </td>
                        
                        <td className="px-4 py-3 text-center text-blue-400 font-asiahead whitespace-nowrap">{formatNumber(row.pointGiven)}</td>
                        <td className="px-4 py-3 text-center text-orange-400 font-asiahead whitespace-nowrap">{formatNumber(row.pointRecovered)}</td>
                        <td className={cn("px-4 py-3 text-center font-asiahead whitespace-nowrap", row.depositWithdrawalDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {formatNumber(row.depositWithdrawalDiff)}
                        </td>
                        
                        {/* 카지노 (베팅/당첨) - 2단2열 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.casinoBet)}</div>
                            <div className="flex-1 text-purple-400 font-asiahead">{formatNumber(row.casinoWin)}</div>
                          </div>
                        </td>
                        
                        {/* 슬롯 (베팅/당첨) - 2단2열 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.slotBet)}</div>
                            <div className="flex-1 text-purple-400 font-asiahead">{formatNumber(row.slotWin)}</div>
                          </div>
                        </td>
                        
                        <td className="px-4 py-3 text-center text-amber-400 font-asiahead whitespace-nowrap">{formatNumber(row.ggr)}</td>
                        
                        {/* 총정산 (총 롤링금/총루징) - 2단2열 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-teal-400 font-asiahead">{formatNumber(row.totalRolling)}</div>
                            <div className="flex-1 text-teal-400 font-asiahead">{formatNumber(row.totalLosing)}</div>
                          </div>
                        </td>
                        
                        {/* 코드별 실정산 (롤링금/루징) - 2단2열 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex divide-x divide-slate-700/50">
                            <div className="flex-1 text-green-400 font-asiahead font-semibold">{formatNumber(row.totalIndividualRolling)}</div>
                            <div className="flex-1 text-green-400 font-asiahead font-semibold">{formatNumber(row.totalIndividualLosing)}</div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-700/50">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">
                총 {visibleRows.length}개 중 {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, visibleRows.length)}개 표시
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">페이지당:</span>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                  <SelectTrigger className="w-[80px] h-9 input-premium">
                    <SelectValue />
                  </SelectTrigger>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="h-9"
              >
                처음
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="h-9"
              >
                이전
              </Button>
              <span className="text-sm text-slate-300 px-4">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="h-9"
              >
                다음
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="h-9"
              >
                마지막
              </Button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
