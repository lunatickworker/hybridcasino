import { useState, useEffect, useCallback, useRef } from "react";
import { 
  CreditCard, TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, 
  AlertTriangle, Banknote, Users, Plus, Search, Trash2, RefreshCw, Check, ChevronsUpDown, Gift, MinusCircle
} from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle, AdminDialogFooter as DialogFooter } from "./AdminDialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { DataTable } from "../common/DataTable";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { toast } from "sonner@2.0.3";
import { Partner, Transaction, User } from "../../types";
import { supabase } from "../../lib/supabase";
import { useWebSocketContext } from "../../contexts/WebSocketContext";
import { cn } from "../../lib/utils";
import { MetricCard } from "./MetricCard";
import { depositBalance, withdrawBalance, extractBalanceFromResponse } from "../../lib/investApi";
import { getAdminOpcode, isMultipleOpcode } from "../../lib/opcodeHelper";
import { useLanguage } from "../../contexts/LanguageContext";
import { getTransactionDisplay, getSimpleTransactionDisplay } from "../../lib/transactionDisplayHelper";

/**
 * 거래유형 시스템 (TRANSACTION_TYPE_GUIDE.md 참조)
 * 
 * ✅ transactions 테이블:
 *   - user_online_deposit: 회원 → 운영사 입금
 *   - user_online_withdrawal: 회원 → 운영사 출금
 *   - partner_online_deposit: 파트너 → 상위자 입금
 *   - partner_online_withdrawal: 파트너 → 상위자 출금
 *   - partner_manual_deposit: 상위자 → 하위자/회원 충전
 *   - partner_manual_withdrawal: 상위자 → 하위자/회원 환전
 * 
 * ✅ partner_balance_logs 테이블:
 *   - partner_deposit: 파트너 간 충전
 *   - partner_withdrawal: 파트너 간 환전
 * 
 * 🔑 핵심: from_partner_id, to_partner_id로 방향성 판단
 */

interface TransactionManagementProps {
  user: Partner;
}

console.log('🔄 TransactionManagement 컴포넌트 마운트됨');

export function TransactionManagement({ user }: TransactionManagementProps) {
  const { t, language, formatCurrency } = useLanguage();
  const { lastMessage, sendMessage } = useWebSocketContext();
  const [initialLoading, setInitialLoading] = useState(false); // ⚡ 초기 로딩 제거
  const [refreshing, setRefreshing] = useState(false);
  
  // URL 해시에서 탭 정보 읽기
  const getInitialTab = () => {
    const fullHash = window.location.hash; // #/admin/transactions#deposit-request
    const anchorIndex = fullHash.indexOf('#', 1); // 두 번째 # 찾기

    if (anchorIndex !== -1) {
      const anchor = fullHash.substring(anchorIndex + 1); // deposit-request
      if (anchor === 'deposit-request' || anchor === 'withdrawal-request' || anchor === 'completed-history') {
        return anchor;
      }
    }
    return "completed-history";
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  
  // 데이터 상태
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pointTransactions, setPointTransactions] = useState<any[]>([]);
  const [partnerTransactions, setPartnerTransactions] = useState<any[]>([]); // 파트너 거래 추가
  const [users, setUsers] = useState<User[]>([]);

  // ✅ 조직 관리: 허용된 파트너 ID 리스트 (자신 + 하위 조직)
  const [allowedPartnerIds, setAllowedPartnerIds] = useState<string[]>([]);

  // ✅ 백그라운드에서 허용된 파트너 ID 로드 (초기 로드 대기 없음)
  useEffect(() => {
    const loadAllowedPartners = async () => {
      if (user.level === 1) {
        setAllowedPartnerIds([]);
      } else {
        const { data } = await supabase.rpc('get_hierarchical_partners', { p_partner_id: user.id });
        const partnerIds = [user.id, ...(data?.map((p: any) => p.id) || [])];
        setAllowedPartnerIds(partnerIds);
      }
    };

    loadAllowedPartners();
  }, [user.id, user.level]);

  // 필터 상태
  const [periodFilter, setPeriodFilter] = useState("today");
  const [searchTerm, setSearchTerm] = useState("");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState("all"); // all, user, admin, point
  
  // 데이터 리로드 트리거 (Realtime 이벤트용)
  const [reloadTrigger, setReloadTrigger] = useState(0);
  
  // 통계 데이터
  const [stats, setStats] = useState({
    totalDeposit: 0,
    totalWithdrawal: 0,
    pendingDepositCount: 0,
    pendingWithdrawalCount: 0
  });

  // 승인/거절 Dialog 상태
  const [actionDialog, setActionDialog] = useState({
    open: false,
    transaction: null as Transaction | null,
    action: 'approve' as 'approve' | 'reject',
    memo: ''
  });

  // 강제 입출금 Dialog 상태
  const [forceDialog, setForceDialog] = useState({
    open: false,
    type: 'deposit' as 'deposit' | 'withdrawal',
    userId: '',
    amount: '',
    memo: ''
  });

  // 회원 검색 Popover 상태
  const [userSearchOpen, setUserSearchOpen] = useState(false);

  // 금액 단축 버튼 값들 (포인트 모달과 동일하게)
  const amountShortcuts = [
    1000,
    3000, 
    5000,
    10000,
    30000,
    50000,
    100000,
    300000,
    500000,
    1000000
  ];

  // ⚡ 마운트 시 URL 해시 확인 및 탭 설정
  useEffect(() => {
    const checkHash = () => {
      const fullHash = window.location.hash;
      const anchorIndex = fullHash.indexOf('#', 1);

      if (anchorIndex !== -1) {
        const anchor = fullHash.substring(anchorIndex + 1);
        if (anchor === 'deposit-request' || anchor === 'withdrawal-request' || anchor === 'deposit-history' || anchor === 'withdrawal-history') {
          setActiveTab(anchor);
        }
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // ⚡ 초기 데이터 로드 - 마운트 시 즉시 로드
  useEffect(() => {
    loadData(true, false);
  }, []); // 의존성 배열 비움 = 마운트 시 한 번만

  // ⚡ 탭 전환 시 데이터 로드
  useEffect(() => {
    // ✅ 초기 로드는 위에서 처리했으므로, 실제 탭 변경 시만 로드
    loadData(false);
  }, [activeTab]);
  const loadData = async (isInitial = false, skipSetRefreshing = false) => {
    // Determine current tab from URL hash to ensure correct date range
    const fullHash = window.location.hash;
    const anchorIndex = fullHash.indexOf('#', 1);
    const currentTab = anchorIndex !== -1 ? fullHash.substring(anchorIndex + 1) : 'completed-history';

    try {
      if (!isInitial) {
        setRefreshing(true);
      }

      // 날짜 필터 적용 (모든 탭에서 동일하게 적용)
      const dateRange = getDateRange(periodFilter);

      // ✅ 파트너 ID 직접 계산 (allowedPartnerIds 의존성 제거) - 최적화
      let allowedPartnerIdsForQuery: string[] = [];
      let partnerIds: string[] = [user.id];

      if (user.level === 1) {
        // Lv1: 빈 배열 = 모든 파트너 허용 (필터링 없음)
        allowedPartnerIdsForQuery = [];
        partnerIds = [user.id];
      } else {
        // Lv2+: 이미 로드된 allowedPartnerIds 사용 (있으면) 또는 빠른 로드
        partnerIds = allowedPartnerIds.length > 0 ? allowedPartnerIds : [user.id];
        allowedPartnerIdsForQuery = partnerIds;
        
        // ⚡ 백그라운드에서 업데이트 (초기 로드는 기다리지 않음)
        if (allowedPartnerIds.length === 0 && isInitial) {
          supabase.rpc('get_hierarchical_partners', { p_partner_id: user.id }).then(result => {
            const hierarchyData = result.data || [];
            setAllowedPartnerIds([user.id, ...hierarchyData.map((p: any) => p.id)]);
          });
        }
      }

      // ⚡ 2단계: 회원 ID 목록 조회
      let targetUserIds: string[] = [];

      // ✅ Lv1: 모든 회원 조회, Lv2+: 자신의 하위 조직 회원만 조회
      if (user.level === 1) {
        // Lv1: 모든 회원 조회
        const { data: allUsers } = await supabase
          .from('users')
          .select('id');
        targetUserIds = allUsers?.map(u => u.id).filter(id => id != null) || [];
      } else if (user.level > 1) {
        // Lv2+: 자신의 하위 조직 회원만 조회
        const { data: userList } = await supabase
          .from('users')
          .select('id')
          .in('referrer_id', partnerIds);

        targetUserIds = userList?.map(u => u.id) || [];
      }

      // ✅ 사용자가 없어도 관리자 거래(partner_deposit/partner_withdrawal)는 있을 수 있으므로 계속 진행
      // if (targetUserIds.length === 0) {
      //   setTransactions([]);
      //   setUsers([]);
      //   setStats({ totalDeposit: 0, totalWithdrawal: 0, pendingDepositCount: 0, pendingWithdrawalCount: 0 });
      //   return;
      // }
      
      // ⚡ 3단계: 거래 데이터 + 포인트 거래 데이터 + 활성 사용자 목록 병렬 조회
      // ✅ Lv1: 모든 거래 조회 (대기중 + 처리한 거래), Lv1이하: 자신이 처리한 거래 + 자신의 하부 조직의 pending 요청
      let transactionQuery = supabase
        .from('transactions')
        .select('*')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
        .order('created_at', { ascending: false });

      // ✅ Lv1은 모든 거래 조회, Lv1이하는 자신이 처리한 거래 + 자신의 하부 조직의 pending 요청
      if (user.level !== 1) {
        // Lv2+의 경우: 자신이 처리한 거래 OR 자신의 하부 조직의 pending 요청
        const conditions = [
          `processed_by.eq.${user.id}`, // 자신이 처리한 거래
          `and(status.eq.pending,transaction_type.in.(user_online_deposit,user_online_withdrawal),user_id.in.(${targetUserIds.join(',')}))`, // 하부 조직 회원들의 user_online_deposit/user_online_withdrawal
          `and(status.eq.pending,transaction_type.in.(partner_online_deposit,partner_online_withdrawal),partner_id.in.(${allowedPartnerIdsForQuery.join(',')}))` // 하부 조직 파트너들의 partner_online_deposit/partner_online_withdrawal
        ];
        transactionQuery = transactionQuery.or(conditions.join(','));
      }
      // Lv1은 processed_by 필터 없이 모든 거래 조회 (대기중 + 처리완료 모두)
      
      // 포인트 거래 조회
      // ✅ "내가 처리한" 포인트 거래만 (partner_id = 내 ID)
      let pointTransactionQuery = supabase
        .from('point_transactions')
        .select('*')
        .eq('partner_id', user.id)  // ✅ 내가 처리한 포인트 거래만
        .order('created_at', { ascending: false })
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end);
      
      let userListQuery = supabase
        .from('users')
        .select('id, nickname, username, balance, bank_name, bank_account, bank_holder')
        .eq('status', 'active')
        .order('nickname');

      // ✅ Lv1: 모든 하부 레벨의 회원 목록 조회 가능하도록 수정
      if (user.level === 1 || user.level > 1) {
        userListQuery = userListQuery.in('referrer_id', partnerIds);
      }
      
  // 파트너 거래 조회 (partner_balance_logs) - deposit/withdrawal + partner_online_deposit/partner_online_withdrawal
  // ✅ KST 날짜 필터 적용 (transactions 쿼리와 동일한 방식)
  let partnerTransactionQuery = supabase
    .from('partner_balance_logs')
    .select('*')
    .in('transaction_type', ['user_online_deposit', 'user_online_withdrawal', 'partner_manual_deposit', 'partner_manual_withdrawal', 'partner_online_deposit', 'partner_online_withdrawal'])
    .gte('created_at', dateRange.start)
    .lte('created_at', dateRange.end)
    .order('created_at', { ascending: false });

  if (user.level > 1) {
    // ✅ 조직격리: Lv2+ 관리자는 자신의 하부 조직 파트너들의 거래만 조회
    partnerTransactionQuery = partnerTransactionQuery.in('partner_id', allowedPartnerIds);
  }
  // ⚠️ Lv1 시스템 관리자도 전체 파트너 거래 조회 (통계 표시를 위해) - 별도 처리
      
      const [transactionsResult, pointTransactionsResult, partnerTransactionsResult, usersResult] = await Promise.all([
        transactionQuery,
        pointTransactionQuery,
        partnerTransactionQuery,
        userListQuery
      ]);
      
      const transactionsData = transactionsResult.data || [];
      const pointTransactionsData = pointTransactionsResult.data || [];
      const partnerTransactionsData = partnerTransactionsResult.data || [];
      setUsers(usersResult.data || []);
      
      // console.log 제거
      
      // 포인트 거래 데이터 처리
      const pointUserIds = [...new Set(pointTransactionsData.map(t => t.user_id).filter(Boolean))];
      const pointPartnerIds = [...new Set(pointTransactionsData.map(t => t.partner_id).filter(Boolean))];
      
      const [pointUsersResult, pointPartnersResult] = await Promise.all([
        pointUserIds.length > 0 
          ? supabase.from('users').select('id, nickname, username').in('id', pointUserIds)
          : Promise.resolve({ data: [], error: null }),
        pointPartnerIds.length > 0 
          ? supabase.from('partners').select('id, nickname').in('id', pointPartnerIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      
      const pointUsersMap = new Map((pointUsersResult.data || []).map(u => [u.id, u]));
      const pointPartnersMap = new Map((pointPartnersResult.data || []).map(p => [p.id, p]));
      
      const processedPointTransactions = pointTransactionsData.map(pt => ({
        ...pt,
        user_username: pointUsersMap.get(pt.user_id)?.username || '',
        user_nickname: pointUsersMap.get(pt.user_id)?.nickname || '',
        partner_nickname: pointPartnersMap.get(pt.partner_id)?.nickname || ''
      }));
      
      setPointTransactions(processedPointTransactions);
      
      // 파트너 거래 데이터 처리
      const partnerFromIds = [...new Set(partnerTransactionsData.map(t => t.from_partner_id).filter(Boolean))];
      const partnerToIds = [...new Set(partnerTransactionsData.map(t => t.to_partner_id).filter(Boolean))];
      const partnerProcessedByIds = [...new Set(partnerTransactionsData.map(t => t.processed_by).filter(Boolean))];
      const partnerMainIds = [...new Set(partnerTransactionsData.map(t => t.partner_id).filter(Boolean))];
      
      const allPartnerIds = [...new Set([...partnerFromIds, ...partnerToIds, ...partnerProcessedByIds, ...partnerMainIds])];
      
      const [partnerInfoResult] = await Promise.all([
        allPartnerIds.length > 0 
          ? supabase.from('partners').select('id, nickname, username, level, balance, invest_balance, oroplay_balance, familyapi_balance, honorapi_balance').in('id', allPartnerIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      
      const partnerInfoMap = new Map((partnerInfoResult.data || []).map(p => [p.id, p]));
      
      // Lv2의 총 보유금 계산 (4개 지갑 합계)
      const calculateTotalBalance = (partner: any) => {
        if (partner.level === 2) {
          return (parseFloat(partner.invest_balance?.toString() || '0') || 0) +
                 (parseFloat(partner.oroplay_balance?.toString() || '0') || 0) +
                 (parseFloat(partner.familyapi_balance?.toString() || '0') || 0) +
                 (parseFloat(partner.honorapi_balance?.toString() || '0') || 0);
        }
        return parseFloat(partner.balance?.toString() || '0') || 0;
      };
      
      const processedPartnerTransactions = partnerTransactionsData.map(pt => {
        const partnerInfo = partnerInfoMap.get(pt.partner_id);
        const fromPartnerInfo = partnerInfoMap.get(pt.from_partner_id);
        const toPartnerInfo = partnerInfoMap.get(pt.to_partner_id);
        
        return {
          ...pt,
          partner_nickname: partnerInfo?.nickname || '',
          partner_username: partnerInfo?.username || '',
          from_partner_nickname: fromPartnerInfo?.nickname || '',
          from_partner_username: fromPartnerInfo?.username || '',
          to_partner_nickname: toPartnerInfo?.nickname || '',
          to_partner_username: toPartnerInfo?.username || '',
          processed_by_nickname: partnerInfoMap.get(pt.processed_by)?.nickname || '',
          // ✅ 파트너 레벨 정보 추가 (Lv2 거래 필터링용)
          from_partner_level: fromPartnerInfo?.level || 0,
          to_partner_level: toPartnerInfo?.level || 0,
          // ✅ Lv2인 경우 총 보유금(4개 지갑 합계) 표시, 그 외는 balance 사용
          balance_after_total: partnerInfo ? calculateTotalBalance(partnerInfo) : parseFloat(pt.balance_after?.toString() || '0')
        };
      });
      
      setPartnerTransactions(processedPartnerTransactions);
      
      // ⚡ 4단계: 관련 데이터 배치 조회 (병렬)
      const userIds = [...new Set(transactionsData.map(t => t.user_id).filter(Boolean))];
      const partnerIdsInTransactions = [...new Set(transactionsData.map(t => t.partner_id).filter(Boolean))];
      
      // ✅ 관리자 거래(partner_id만 있음) + 사용자 거래(user_id만 있음) 둘 다 없으면 종료
      if (userIds.length === 0 && partnerIdsInTransactions.length === 0) {
        setTransactions([]);
        setStats({ totalDeposit: 0, totalWithdrawal: 0, pendingDepositCount: 0, pendingWithdrawalCount: 0 });
        return;
      }
      
      const processedByIds = [...new Set(transactionsData.map(t => t.processed_by).filter(Boolean))];
      
      const [usersInfoResult, partnersInfoResult, transactionPartnersResult] = await Promise.all([
        userIds.length > 0
          ? supabase.from('users').select('id, nickname, username, balance, bank_name, bank_account, bank_holder, referrer_id').in('id', userIds)
          : Promise.resolve({ data: [], error: null }),
        processedByIds.length > 0 
          ? supabase.from('partners').select('id, nickname, level').in('id', processedByIds)
          : Promise.resolve({ data: [], error: null }),
        partnerIdsInTransactions.length > 0
          ? supabase.from('partners').select('id, nickname, username, level').in('id', partnerIdsInTransactions)
          : Promise.resolve({ data: [], error: null })
      ]);
      
      const usersInfo = usersInfoResult.data || [];
      const partnersInfo = partnersInfoResult.data || [];
      const transactionPartnersInfo = transactionPartnersResult.data || [];
      
      // ⚡ 5단계: referrer 정보 조회
      const referrerIds = [...new Set(usersInfo.map(u => u.referrer_id).filter(Boolean))];
      const referrersResult = referrerIds.length > 0
        ? await supabase.from('partners').select('id, nickname, level').in('id', referrerIds)
        : { data: [], error: null };
      
      // ⚡ 6단계: Map 생성 및 데이터 병합 (클라이언트 사이드)
      const usersMap = new Map(usersInfo.map(u => [u.id, u]));
      const referrersMap = new Map((referrersResult.data || []).map(p => [p.id, p]));
      const partnersMap = new Map(partnersInfo.map(p => [p.id, p]));
      const transactionPartnersMap = new Map(transactionPartnersInfo.map(p => [p.id, p]));

      const transactionsWithRelations = transactionsData.map(t => {
        const userInfo = t.user_id ? usersMap.get(t.user_id) : null;
        const partnerInfo = t.partner_id ? transactionPartnersMap.get(t.partner_id) : null;
        return {
          ...t,
          user: userInfo ? {
            ...userInfo,
            referrer: userInfo.referrer_id ? referrersMap.get(userInfo.referrer_id) : null
          } : null,
          partner: partnerInfo,
          processed_partner: t.processed_by ? partnersMap.get(t.processed_by) : null
        };
      });

      setTransactions(transactionsWithRelations);

      // 통계 계산 - "전체입출금내역" 탭 기준으로 계산 (completed-history tab의 모든 항목 포함)
      // ✅ 날짜 범위 필터 적용
      const dateRangeStart = new Date(dateRange.start);
      const dateRangeEnd = new Date(dateRange.end);
      
      // 1️⃣ transactions 테이블에서 입출금 집계 (승인된 것만 포함, 날짜 필터 적용)
      const transactionDepositSum = transactionsData
        .filter(t => {
          if (t.status !== 'completed') return false; // ✅ 승인된 것만
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          const type = t.transaction_type;
          const inDateRange = createdAt >= dateRangeStart && createdAt <= dateRangeEnd;
          // completed-history 탭의 필터와 동일하게
          if (type === 'deposit') return inDateRange;
          if (type === 'partner_manual_deposit') return inDateRange;
          if (type === 'partner_online_deposit') return inDateRange;
          if (type === 'admin_adjustment' && parseFloat(t.amount.toString()) > 0) return inDateRange; // 양수만 입금
          return false;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      const transactionWithdrawalSum = transactionsData
        .filter(t => {
          if (t.status !== 'completed') return false; // ✅ 승인된 것만
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          const type = t.transaction_type;
          const inDateRange = createdAt >= dateRangeStart && createdAt <= dateRangeEnd;
          // completed-history 탭의 필터와 동일하게
          if (type === 'withdrawal') return inDateRange;
          if (type === 'partner_manual_withdrawal') return inDateRange;
          if (type === 'partner_online_withdrawal') return inDateRange;
          if (type === 'admin_adjustment' && parseFloat(t.amount.toString()) < 0) return inDateRange; // 음수만 출금
          return false;
        })
        .reduce((sum, t) => sum - parseFloat(t.amount.toString()), 0); // 출금은 음수로 표시
      
      // 2️⃣ partner_balance_logs 테이블에서 입출금 집계 (날짜 필터 적용)
      const partnerDepositSum = partnerTransactionsData
        .filter(t => {
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          return t.transaction_type === 'user_online_deposit' && 
                 createdAt >= dateRangeStart && 
                 createdAt <= dateRangeEnd;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      const partnerWithdrawalSum = partnerTransactionsData
        .filter(t => {
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          return t.transaction_type === 'user_online_withdrawal' && 
                 createdAt >= dateRangeStart && 
                 createdAt <= dateRangeEnd;
        })
        .reduce((sum, t) => sum - parseFloat(t.amount.toString()), 0); // 음수로 변환
      
      // 3️⃣ point_transactions 테이블에서 입출금 집계 (날짜 필터 적용)
      const pointDepositSum = pointTransactionsData
        .filter(t => {
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          // 포인트 지급: earn 타입 또는 admin_adjustment에서 양수
          return (t.transaction_type === 'earn' || 
                  (t.transaction_type === 'admin_adjustment' && parseFloat(t.amount.toString()) > 0)) && 
                 createdAt >= dateRangeStart && 
                 createdAt <= dateRangeEnd;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      const pointWithdrawalSum = pointTransactionsData
        .filter(t => {
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          // 포인트 회수: use 타입 또는 admin_adjustment에서 음수
          return (t.transaction_type === 'use' || 
                  (t.transaction_type === 'admin_adjustment' && parseFloat(t.amount.toString()) < 0)) && 
                 createdAt >= dateRangeStart && 
                 createdAt <= dateRangeEnd;
        })
        .reduce((sum, t) => {
          const amount = parseFloat(t.amount.toString());
          // use는 이미 음수이므로 그대로, admin_adjustment도 이미 음수
          return sum + amount;
        }, 0);
      
      // 4️⃣ 전체 합산 (통계 카드는 completed-history 탭의 거래만 집계)
      const totalDepositSum = transactionDepositSum; // ✅ transactions 테이블만 집계
      const totalWithdrawalSum = transactionWithdrawalSum; // ✅ transactions 테이블만 집계
      
      // 대기 중인 입금 신청 (사용자 + 관리자)
      const pendingDeposits = transactionsData.filter(t => 
        (t.transaction_type === 'user_online_deposit' || t.transaction_type === 'partner_online_deposit') && 
        t.status === 'pending'
      );
      
      // 대기 중인 출금 신청 (사용자 + 관리자)
      const pendingWithdrawals = transactionsData.filter(t => 
        (t.transaction_type === 'user_online_withdrawal' || t.transaction_type === 'partner_online_withdrawal') && 
        t.status === 'pending'
      );

      // 통계 계산 완료

      setStats({
        totalDeposit: totalDepositSum,
        totalWithdrawal: totalWithdrawalSum,
        pendingDepositCount: pendingDeposits.length,
        pendingWithdrawalCount: pendingWithdrawals.length
      });
    } catch (error) {
      console.error('❌ 데이터 로드 실패:', error);
      toast.error(t.transactionManagement.loadDataFailed);
    } finally {
      if (isInitial) {
        setInitialLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  // 날짜 범위 계산 - 한국 시간(KST) 기준
  const getDateRange = (filter: string) => {
    // 한국 시간 기준으로 현재 날짜/시간 가져오기
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000; // UTC+9 (밀리초)
    
    // 한국 시간 기준으로 Date 객체 생성
    const kstNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + kstOffset);
    
    // 날짜만 추출 (시간을 00:00:00으로 설정)
    const kstToday = new Date(kstNow);
    kstToday.setHours(0, 0, 0, 0);
    
    // 날짜만 추출 (시간을 23:59:59.999로 설정)
    const kstTodayEnd = new Date(kstNow);
    kstTodayEnd.setHours(23, 59, 59, 999);
    
    switch (filter) {
      case 'all':
        return { start: '1970-01-01T00:00:00.000Z', end: now.toISOString() };
      case 'today':
        return { 
          start: kstToday.toISOString(), 
          end: kstTodayEnd.toISOString() 
        };
      case 'yesterday':
        const yesterday = new Date(kstToday);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { 
          start: yesterday.toISOString(), 
          end: yesterdayEnd.toISOString() 
        };
      case 'week':
        const weekStart = new Date(kstToday);
        weekStart.setDate(kstToday.getDate() - 7);
        return { 
          start: weekStart.toISOString(), 
          end: kstTodayEnd.toISOString() 
        };
      case 'month':
        const monthStart = new Date(kstToday);
        monthStart.setDate(kstToday.getDate() - 30);
        return { 
          start: monthStart.toISOString(), 
          end: kstTodayEnd.toISOString() 
        };
      default:
        return { 
          start: kstToday.toISOString(), 
          end: kstTodayEnd.toISOString() 
        };
    }
  };

  // ✅ 페이지 진입 시 자동으로 데이터 로드
  useEffect(() => {
    loadData(true);
  }, []);

  // 필터 변경 시 데이터 재로드
  useEffect(() => {
    if (!initialLoading) {
      loadData(false);
    }
  }, [periodFilter, reloadTrigger]);



  // Realtime 구독: transactions 테이블 변경 감지
  useEffect(() => {
    const channel = supabase
      .channel('transactions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          // console.log 제거
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // WebSocket 메시지 수신 처리
  useEffect(() => {
    if (lastMessage) {
      // 입출금 관련 메시지 수신 시 데이터 재로드
      if (['deposit_approved', 'withdrawal_approved', 'deposit_rejected', 'withdrawal_rejected'].includes(lastMessage.type)) {
        // console.log 제거
        setReloadTrigger(prev => prev + 1);
      }
    }
  }, [lastMessage]);

  // 승인/거절 Dialog 열기
  const openActionDialog = (transaction: Transaction, action: 'approve' | 'reject') => {
    setActionDialog({
      open: true,
      transaction,
      action,
      memo: ''
    });
  };

  // 승인/거절 처리
  const handleTransactionAction = async () => {
    if (!actionDialog.transaction) return;

    try {
      setRefreshing(true);
      const { action, transaction, memo } = actionDialog;
      const amount = Math.floor(parseFloat(transaction.amount.toString()));
      
      // 승인인 경우 GMS 머니 보유금 확인
      if (action === 'approve') {
        
        // ✅ 관리자 입출금 신청 승인 처리 (partner_online_deposit, partner_online_withdrawal)
        if (transaction.transaction_type === 'partner_online_deposit' || transaction.transaction_type === 'partner_online_withdrawal') {
          // Lv2만 승인 가능
          if (user.level !== 2) {
            toast.error('Lv2 본사만 관리자 입출금을 승인할 수 있습니다.');
            setRefreshing(false);
            return;
          }

          // 신청한 파트너 정보 조회
          const requestPartnerId = (transaction as any).partner_id;
          if (!requestPartnerId) {
            throw new Error('신청자 정보가 없습니다.');
          }

          const { data: requestPartnerData, error: requestPartnerError } = await supabase
            .from('partners')
            .select('balance, username, level, nickname')
            .eq('id', requestPartnerId)
            .single();

          if (requestPartnerError || !requestPartnerData) {
            throw new Error('신청자 정보를 찾을 수 없습니다.');
          }

          // 입금 신청 승인: 본사(Lv2) 보유금 확인
          if (transaction.transaction_type === 'partner_online_deposit') {
            const { data: approverData, error: approverError } = await supabase
              .from('partners')
              .select('invest_balance, oroplay_balance, familyapi_balance, honorapi_balance')
              .eq('id', user.id)
              .single();

            if (approverError || !approverData) {
              throw new Error('승인자 정보를 찾을 수 없습니다.');
            }

            // Lv2는 4개 지갑 합계
            const approverBalance = (parseFloat(approverData.invest_balance?.toString() || '0') || 0) +
                          (parseFloat(approverData.oroplay_balance?.toString() || '0') || 0) +
                          (parseFloat(approverData.familyapi_balance?.toString() || '0') || 0) +
                          (parseFloat(approverData.honorapi_balance?.toString() || '0') || 0);

            if (approverBalance < amount) {
              toast.error(`보유금이 부족합니다. (현재: ${approverBalance.toLocaleString()}원, 필요: ${amount.toLocaleString()}원)`);
              setRefreshing(false);
              return;
            }

            console.log('✅ 관리자 입금 승인 가능:', {
              requestPartner: requestPartnerData.username,
              approverBalance,
              amount,
              remaining: approverBalance - amount
            });
          }
          
          // 출금 신청 승인: 신청자 보유금 확인
          if (transaction.transaction_type === 'partner_online_withdrawal') {
            const requestPartnerBalance = parseFloat(requestPartnerData.balance?.toString() || '0');

            if (requestPartnerBalance < amount) {
              toast.error(`신청자 보유금이 부족합니다. (현재: ${requestPartnerBalance.toLocaleString()}원)`);
              setRefreshing(false);
              return;
            }

            console.log('✅ 관리자 출금 승인 가능:', {
              requestPartner: requestPartnerData.username,
              requestPartnerBalance,
              amount,
              remaining: requestPartnerBalance - amount
            });
          }
        }
        
        // 입금 승인: 로그인한 관리자의 보유금 확인 (✅ 상위 권한자 입출금 가능)
        if (transaction.transaction_type === 'user_online_deposit' || transaction.transaction_type === 'partner_manual_deposit') {
          // 로그인한 관리자의 보유금 조회
          const { data: adminPartnerData, error: adminPartnerError } = await supabase
            .from('partners')
            .select('balance, username, level, invest_balance, oroplay_balance, familyapi_balance, honorapi_balance')
            .eq('id', user.id)
            .single();

          if (adminPartnerError || !adminPartnerData) {
            throw new Error('관리자 정보를 찾을 수 없습니다.');
          }

          let adminBalance = 0;
          
          // 레벨별 보유금 계산
          if (adminPartnerData.level === 1) {
            // Lv1: api_configs에서 실제 보유금 조회
            const { data: apiConfigsData } = await supabase
              .from('api_configs')
              .select('balance')
              .eq('partner_id', user.id);
            
            adminBalance = apiConfigsData?.reduce((sum: number, config: any) => sum + (parseFloat(config.balance?.toString() || '0')), 0) || 0;
          } else if (adminPartnerData.level === 2) {
            // Lv2: 4개 지갑 합계
            adminBalance = (parseFloat(adminPartnerData.invest_balance?.toString() || '0') || 0) +
                          (parseFloat(adminPartnerData.oroplay_balance?.toString() || '0') || 0) +
                          (parseFloat(adminPartnerData.familyapi_balance?.toString() || '0') || 0) +
                          (parseFloat(adminPartnerData.honorapi_balance?.toString() || '0') || 0);
          } else {
            // Lv3~Lv6: GMS 머니
            adminBalance = parseFloat(adminPartnerData.balance?.toString() || '0');
          }

          // 보유금 검증
          if (adminBalance < amount) {
            toast.error(`보유금이 부족합니다. (현재: ${adminBalance.toLocaleString()}원, 필요: ${amount.toLocaleString()}원)`);
            setRefreshing(false);
            return;
          }

          console.log('✅ 입금 승인 가능:', {
            adminUsername: adminPartnerData.username,
            adminLevel: adminPartnerData.level,
            adminBalance,
            amount,
            remaining: adminBalance - amount
          });
        }
        
        // 출금 승인: 회원 보유금 확인
        if (transaction.transaction_type === 'user_online_withdrawal' || transaction.transaction_type === 'partner_manual_withdrawal') {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('balance, nickname')
            .eq('id', transaction.user_id)
            .single();

          if (userError || !userData) {
            throw new Error(t.transactionManagement.userInfoNotFound);
          }

          const userBalance = parseFloat(userData.balance?.toString() || '0');

          // 보유금 검증
          if (userBalance < amount) {
            toast.error('회원 보유금이 부족합니다');
            setRefreshing(false);
            return;
          }

          console.log('✅ 출금 승인 가능:', {
            userBalance,
            amount,
            remaining: userBalance - amount
          });
        }
      }

      // ✅ from_partner_id, to_partner_id 계산
      const getFromToPartnerIds = () => {
        if (transaction.transaction_type === 'user_online_deposit' || transaction.transaction_type === 'partner_manual_deposit') {
          return { from_partner_id: user.id, to_partner_id: transaction.user_id };
        } else if (transaction.transaction_type === 'user_online_withdrawal' || transaction.transaction_type === 'partner_manual_withdrawal') {
          return { from_partner_id: transaction.user_id, to_partner_id: user.id };
        } else if (transaction.transaction_type === 'partner_online_deposit') {
          return { from_partner_id: user.id, to_partner_id: (transaction as any).partner_id };
        } else if (transaction.transaction_type === 'partner_online_withdrawal') {
          return { from_partner_id: (transaction as any).partner_id, to_partner_id: user.id };
        }
        return { from_partner_id: null, to_partner_id: null };
      };

      const { from_partner_id, to_partner_id } = getFromToPartnerIds();

      // DB 상태 업데이트
      const { error } = await supabase
        .from('transactions')
        .update({
          status: action === 'approve' ? 'completed' : 'rejected',
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          memo: memo || transaction.memo,  // ✅ 승인/거절 모두 사용자가 입력한 메모 저장
          from_partner_id,
          to_partner_id
        })
        .eq('id', transaction.id);

      if (error) throw error;

      // ✅ 승인인 경우: 처리 로직 (사용자 입출금 vs 관리자 입출금)
      if (action === 'approve') {
        const now = new Date().toISOString();
        
        // ✅ 관리자 입출금 신청 처리
        if (transaction.transaction_type === 'partner_online_deposit' || transaction.transaction_type === 'partner_online_withdrawal') {
          const requestPartnerId = (transaction as any).partner_id;
          
          // 신청자 현재 보유금 조회
          const { data: requestPartnerData, error: requestPartnerError } = await supabase
            .from('partners')
            .select('balance, username, nickname')
            .eq('id', requestPartnerId)
            .single();

          if (requestPartnerError || !requestPartnerData) {
            throw new Error('신청자 정보를 조회할 수 없습니다.');
          }

          const currentBalance = parseFloat(requestPartnerData.balance?.toString() || '0');
          let newBalance = currentBalance;

          if (transaction.transaction_type === 'partner_online_deposit') {
            // 입금: 신청자 보유금 증가
            newBalance = currentBalance + amount;
          } else if (transaction.transaction_type === 'partner_online_withdrawal') {
            // 출금: 신청자 보유금 차감
            newBalance = currentBalance - amount;
            
            if (newBalance < 0) {
              throw new Error(`잔고가 음수가 될 수 없습니다. (현재: ${currentBalance}, 출금: ${amount})`);
            }
          }

          // 신청자 보유금 업데이트
          const { error: balanceUpdateError } = await supabase
            .from('partners')
            .update({
              balance: newBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', requestPartnerId);

          if (balanceUpdateError) {
            console.error('❌ [신청자 보유금 업데이트 실패]:', balanceUpdateError);
            throw new Error('신청자 보유금 업데이트에 실패했습니다.');
          }

          console.log('✅ [신청자 보유금 업데이트 완료]:', {
            partner_id: requestPartnerId,
            username: requestPartnerData.username,
            before: currentBalance,
            after: newBalance,
            transaction_type: transaction.transaction_type
          });

          // 승인자(본사) 보유금 조정
          const { data: approverData, error: approverError } = await supabase
            .from('partners')
            .select('balance, username, invest_balance, oroplay_balance, familyapi_balance, honorapi_balance')
            .eq('id', user.id)
            .single();

          if (approverError || !approverData) {
            throw new Error('승인자 정보를 찾을 수 없습니다.');
          }

          // Lv2는 4개 지갑 중 invest_balance만 조정 (편의상)
          const currentApproverBalance = parseFloat(approverData.invest_balance?.toString() || '0');
          let newApproverBalance = currentApproverBalance;

          if (transaction.transaction_type === 'partner_online_deposit') {
            // 입금 승인: 본사 보유금 차감
            newApproverBalance = currentApproverBalance - amount;
          } else if (transaction.transaction_type === 'partner_online_withdrawal') {
            // 출금 승인: 본사 보유금 증가
            newApproverBalance = currentApproverBalance + amount;
          }

          const { error: approverUpdateError } = await supabase
            .from('partners')
            .update({
              invest_balance: newApproverBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

          if (approverUpdateError) {
            console.error('❌ [승인자 보유금 업데이트 실패]:', approverUpdateError);
            throw new Error('승인자 보유금 업데이트에 실패했습니다.');
          }

          console.log('✅ [승인자 보유금 업데이트 완료]:', {
            approver_id: user.id,
            username: approverData.username,
            before: currentApproverBalance,
            after: newApproverBalance
          });

          // 로그 기록
          await supabase.from('partner_balance_logs').insert([
            {
              partner_id: requestPartnerId,
              balance_before: currentBalance,
              balance_after: newBalance,
              amount: transaction.transaction_type === 'partner_online_deposit' ? amount : -amount,
              transaction_type: transaction.transaction_type,
              from_partner_id: transaction.transaction_type === 'partner_online_deposit' ? user.id : requestPartnerId,  // ✅ 추가
              to_partner_id: transaction.transaction_type === 'partner_online_deposit' ? requestPartnerId : user.id,    // ✅ 추가
              processed_by: user.id,
              memo: `관리자 ${transaction.transaction_type === 'partner_online_deposit' ? '입금' : '출금'} 승인 (승인자: ${user.username})`,  // ✅ 추가
              created_at: new Date().toISOString()
            },
            {
              partner_id: user.id,
              balance_before: currentApproverBalance,
              balance_after: newApproverBalance,
              amount: transaction.transaction_type === 'partner_online_deposit' ? -amount : amount,
              transaction_type: 'admin_adjustment',
              from_partner_id: transaction.transaction_type === 'partner_online_deposit' ? user.id : requestPartnerId,  // ✅ 추가
              to_partner_id: transaction.transaction_type === 'partner_online_deposit' ? requestPartnerId : user.id,    // ✅ 추가
              processed_by: user.id,
              memo: `${requestPartnerData.username} 관리자 ${transaction.transaction_type === 'partner_online_deposit' ? '입금' : '출금'} 승인`,  // ✅ 추가
              created_at: new Date().toISOString()
            }
          ]);
        }
        // ✅ 사용자 입출금 처리
        else if (transaction.transaction_type === 'user_online_deposit' || transaction.transaction_type === 'user_online_withdrawal') {
          // 1️⃣ 현재 사용자 잔고 확인
          const { data: currentUserData, error: currentUserError } = await supabase
            .from('users')
            .select('balance, username')
            .eq('id', transaction.user_id)
            .single();

          if (currentUserError) {
            console.error('❌ [사용자 조회 실패]:', currentUserError);
            throw new Error('사용자 정보를 조회할 수 없습니다.');
          }

          const currentBalance = parseFloat(currentUserData?.balance?.toString() || '0');
        
        // 2️⃣ 새로운 잔고 계산
        let newBalance = currentBalance;
        if (transaction.transaction_type === 'user_online_deposit') {
          newBalance = currentBalance + amount;
        } else if (transaction.transaction_type === 'user_online_withdrawal') {
          newBalance = currentBalance - amount;
          
          // 출금 시 음수 방지
          if (newBalance < 0) {
            throw new Error(`잔고가 음수가 될 수 없습니다. (현재: ${currentBalance}, 출금: ${amount})`);
          }
        }

        console.log('💰 [잔고 업데이트 준비]:', {
          user_id: transaction.user_id,
          username: currentUserData?.username,
          transaction_type: transaction.transaction_type,
          current_balance: currentBalance,
          amount: amount,
          new_balance: newBalance
        });

        // 3️⃣ users 테이블 balance 업데이트
        const { data: updatedUser, error: balanceUpdateError } = await supabase
          .from('users')
          .update({
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', transaction.user_id)
          .select('balance, username')
          .single();

        if (balanceUpdateError) {
          console.error('❌ [잔고 업데이트 실패]:', balanceUpdateError);
          throw new Error('사용자 잔고 업데이트에 실패했습니다.');
        }

        console.log('✅✅✅ [잔고 업데이트 완료]:', {
          user_id: transaction.user_id,
          username: updatedUser?.username,
          before: currentBalance,
          after: updatedUser?.balance,
          expected: newBalance,
          match: updatedUser?.balance === newBalance
        });

        // 4️⃣ 로그인한 관리자의 보유금 조정 (✅ 상위 권한자가 하위 조직 입출금 가능)
        const responsiblePartnerId = user.id; // 로그인한 관리자

        // 5️⃣ 로그인한 관리자의 보유금 조회
        const { data: partnerData, error: partnerQueryError } = await supabase
          .from('partners')
          .select('balance, username, level, invest_balance, oroplay_balance, familyapi_balance, honorapi_balance')
          .eq('id', responsiblePartnerId)
          .single();

        if (partnerQueryError) {
          console.error('❌ [관리자 보유금 조회 실패]:', partnerQueryError);
          throw new Error('관리자 보유금을 조회할 수 없습니다.');
        }

        // 레벨별 보유금 계산
        let currentPartnerBalance = 0;
        if (partnerData.level === 1) {
          // Lv1: api_configs에서 실제 보유금 조회
          const { data: apiConfigsData } = await supabase
            .from('api_configs')
            .select('balance')
            .eq('partner_id', responsiblePartnerId);
          
          currentPartnerBalance = apiConfigsData?.reduce((sum: number, config: any) => sum + (parseFloat(config.balance?.toString() || '0')), 0) || 0;
        } else if (partnerData.level === 2) {
          // Lv2: 4개 지갑 합계
          currentPartnerBalance = (parseFloat(partnerData.invest_balance?.toString() || '0') || 0) +
                        (parseFloat(partnerData.oroplay_balance?.toString() || '0') || 0) +
                        (parseFloat(partnerData.familyapi_balance?.toString() || '0') || 0) +
                        (parseFloat(partnerData.honorapi_balance?.toString() || '0') || 0);
        } else {
          // Lv3~Lv6: GMS 머니
          currentPartnerBalance = parseFloat(partnerData?.balance?.toString() || '0');
        }

        console.log('💰 [로그인한 관리자 정보]:', {
          partner_id: responsiblePartnerId,
          username: partnerData?.username,
          level: partnerData?.level,
          balance: currentPartnerBalance
        });

        // 6️⃣ 입금/출금에 따른 파트너 보유금 계산 및 업데이트
        if (transaction.transaction_type === 'user_online_deposit') {
          // 입금: 파트너 보유금 차감
          if (currentPartnerBalance < amount) {
            throw new Error(
              `담당 관리자(${partnerData?.username})의 보유금이 부족하여 입금을 승인할 수 없습니다.\n\n` +
              `현재 보유금: ₩${currentPartnerBalance.toLocaleString()}\n` +
              `승인 금액: ₩${amount.toLocaleString()}\n` +
              `부족 금액: ₩${(amount - currentPartnerBalance).toLocaleString()}`
            );
          }

          const newPartnerBalance = currentPartnerBalance - amount;

          const { error: partnerUpdateError } = await supabase
            .from('partners')
            .update({
              balance: newPartnerBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', responsiblePartnerId);

          if (partnerUpdateError) {
            console.error('❌ [관리자 보유금 차감 실패]:', partnerUpdateError);
            throw new Error('관리자 보유금 차감에 실패했습니다.');
          }

          console.log('✅ [관리자 보유금 차감 완료]:', {
            partner_id: responsiblePartnerId,
            partner_username: partnerData?.username,
            before: currentPartnerBalance,
            after: newPartnerBalance,
            deducted: amount
          });

          // 관리자 잔고 변경 로그 기록
          await supabase.from('partner_balance_logs').insert({
            partner_id: responsiblePartnerId,
            balance_before: currentPartnerBalance,
            balance_after: newPartnerBalance,
            amount: -amount,
            transaction_type: 'deposit_to_user',
            from_partner_id: responsiblePartnerId,  // ✅ 추가: 보낸사람 (관리자)
            to_partner_id: transaction.user_id,     // ✅ 추가: 받는사람 (사용자)
            processed_by: user.id,
            memo: null,  // ✅ 시스템 메모 제거 (processed_by에 처리자 정보 있음)
            created_at: new Date().toISOString()
          });

        } else if (transaction.transaction_type === 'user_online_withdrawal') {
          // 출금: 관리자 보유금 증가
          const newPartnerBalance = currentPartnerBalance + amount;

          const { error: partnerUpdateError } = await supabase
            .from('partners')
            .update({
              balance: newPartnerBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', responsiblePartnerId);

          if (partnerUpdateError) {
            console.error('❌ [관리자 보유금 증가 실패]:', partnerUpdateError);
            throw new Error('관리자 보유금 증가에 실패했습니다.');
          }

          console.log('✅ [관리자 보유금 증가 완료]:', {
            partner_id: responsiblePartnerId,
            partner_username: partnerData?.username,
            before: currentPartnerBalance,
            after: newPartnerBalance,
            added: amount
          });

          // 관리자 잔고 변경 로그 기록
          await supabase.from('partner_balance_logs').insert({
            partner_id: responsiblePartnerId,
            balance_before: currentPartnerBalance,
            balance_after: newPartnerBalance,
            amount: amount,
            transaction_type: 'withdrawal_from_user',
            from_partner_id: transaction.user_id,      // ✅ 추가: 보낸사람 (사용자)
            to_partner_id: responsiblePartnerId,       // ✅ 추가: 받는사람 (관리자)
            processed_by: user.id,
            memo: null,  // ✅ 시스템 메모 제거 (processed_by에 처리자 정보 있음)
            created_at: new Date().toISOString()
          });
        }
        }
      }

      toast.success(action === 'approve' ? t.transactionManagement.transactionApproved : t.transactionManagement.transactionRejected);
      
      // WebSocket으로 실시간 알림 - 올바른 형식으로 수정
      sendMessage('transaction_processed', { 
        transactionId: transaction.id, 
        action, 
        processedBy: user.nickname,
        userId: transaction.user_id || null,
        partnerId: (transaction as any).partner_id || null
      });
      
      setActionDialog({ open: false, transaction: null, action: 'approve', memo: '' });
      // loadData 호출 제거 - Realtime subscription이 자동으로 처리
    } catch (error) {
      console.error('거래 처리 실패:', error);
      toast.error(error instanceof Error ? error.message : t.transactionManagement.transactionProcessFailed);
    } finally {
      setRefreshing(false);
    }
  };

  // 강제 입출금 처리 (UserManagement와 동일한 로직)
  const handleForceTransaction = async () => {
    try {
      setRefreshing(true);
      const { type, userId, amount, memo } = forceDialog;

      if (!userId || !amount) {
        toast.error(t.transactionManagement.enterMemberAndAmount);
        return;
      }

      const selectedUser = users.find(u => u.id === userId);
      if (!selectedUser) {
        toast.error(t.transactionManagement.memberNotFoundError);
        return;
      }

      if (!selectedUser.username) {
        toast.error(t.transactionManagement.memberUsernameNotFound);
        return;
      }

      // amount를 정수로 변환 (Guidelines: 입금액/출금액은 숫자만)
      const amountNum = Math.floor(parseFloat(amount.replace(/,/g, '') || '0'));
      const balanceBefore = parseFloat(selectedUser.balance?.toString() || '0');

      console.log('💰 강제 입출금 처리 시작:', {
        type,
        username: selectedUser.username,
        amount: amountNum,
        balanceBefore
      });

      // 출금 시 보유금 검증
      if (type === 'withdrawal' && amountNum > balanceBefore) {
        toast.error(t.transactionManagement.withdrawalExceedsBalance.replace('{{balance}}', balanceBefore.toLocaleString()));
        setRefreshing(false);
        return;
      }
      
      // ✅ 강제 지급 시: 관리자(Lv2~Lv6)의 GMS 머니 잔고 검증
      if (type === 'deposit' && user.level >= 2 && user.level <= 6) {
        const { data: adminPartner, error: adminPartnerError } = await supabase
          .from('partners')
          .select('balance')
          .eq('id', user.id)
          .single();

        if (adminPartnerError || !adminPartner) {
          toast.error('관리자 정보를 찾을 수 없습니다.');
          setRefreshing(false);
          return;
        }

        const adminBalance = parseFloat(adminPartner.balance?.toString() || '0');
        
        if (adminBalance < amountNum) {
          toast.error(`보유금이 부족합니다 (현재: ${adminBalance.toLocaleString()}원, 필요: ${amountNum.toLocaleString()}원)`);
          setRefreshing(false);
          return;
        }

        console.log('✅ 관리자 GMS 머니 잔고 확인:', {
          level: user.level,
          currentBalance: adminBalance,
          requiredAmount: amountNum,
          afterBalance: adminBalance - amountNum
        });
      }
      
      // OPCODE 정보 조회
      const opcodeInfo = await getAdminOpcode(user);
      
      // 시스템관리자면 첫 번째 OPCODE 사용
      const config = isMultipleOpcode(opcodeInfo) 
        ? opcodeInfo.opcodes[0] 
        : opcodeInfo;

    // ✅ OPCODE 설정 로그에서 민감한 정보 제거 (보안)
    if (import.meta.env.DEV) {
      console.log('🔑 OPCODE 설정 (개발 모드):', {
        opcode: config.opcode,
        token: '***' + config.token.slice(-4),
        secretKey: '***' + config.secretKey.slice(-4)
      });
    }

    // Invest API를 통한 실제 입출금 처리
    let apiResult;
    if (type === 'deposit') {
      console.log('📥 입금 API 호출 중...', { user: selectedUser.username, amount: amountNum });
      apiResult = await depositBalance(
        selectedUser.username,
        amountNum,
        config.opcode,
        config.token,
        config.secretKey
      );
    } else {
      console.log('📤 출금 API 호출 중...', { user: selectedUser.username, amount: amountNum });
      apiResult = await withdrawalBalance(
        selectedUser.username,
        amountNum,
        config.opcode,
        config.token,
        config.secretKey
      );
    }

    // API 응답에서 balance_after 파싱 (리소스 재사용: extractBalanceFromResponse 사용)
    const balanceAfter = extractBalanceFromResponse(apiResult.data, selectedUser.username);
    console.log('💰 실제 잔고:', balanceAfter);

    // 거래 기록 생성 (관리자 강제 입출금 타입 사용)
    const now = new Date().toISOString();
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert({
        id: crypto.randomUUID(), // ✅ id 명시적 설정
        user_id: userId,
        partner_id: user.id,
        transaction_type: type === 'deposit' ? 'partner_manual_deposit' : 'partner_manual_withdrawal',
        amount: amountNum,
        status: 'completed',
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        memo: memo || `[관리자 강제 ${type === 'deposit' ? '입금' : '출금'}]`,
        processed_by: user.id,
        processed_at: now,
        created_at: now, // ✅ created_at 명시적 설정
        updated_at: now, // ✅ updated_at도 설정
        external_response: apiResult.data,
        from_partner_id: type === 'deposit' ? user.id : userId,  // ✅ 입금: 관리자가 보냄, 출금: 회원이 보냄
        to_partner_id: type === 'deposit' ? userId : user.id     // ✅ 입금:会员가 받음, 출금: 관리자가 받음
      });

    if (transactionError) throw transactionError;

    // ✅ 트리거가 자동으로 users.balance 업데이트 (251번 SQL)
    // ✅ Realtime 이벤트 자동 발생 → UserHeader 즉시 업데이트
    console.log('✅ transactions INSERT 완료 → 트리거가 users.balance 자동 업데이트');

    // ✅ Lv2~Lv6 관리자가 사용자에게 입출금하는 경우: GMS 머니(balance) 차감/증가
    if (user.level >= 2 && user.level <= 6) {
      const { data: adminPartner, error: adminPartnerError } = await supabase
        .from('partners')
        .select('balance')
        .eq('id', user.id)
        .single();

      if (adminPartnerError || !adminPartner) {
        console.warn(`⚠️ Lv${user.level} 관리자의 partners 정보를 찾을 수 없습니다.`);
      } else {
        const currentBalance = adminPartner.balance || 0;
        const newBalance = type === 'deposit' 
          ? currentBalance - amountNum 
          : currentBalance + amountNum;

        const { error: updateBalanceError } = await supabase
          .from('partners')
          .update({ 
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (updateBalanceError) {
          console.error(`❌ Lv${user.level} balance 업데이트 실패:`, updateBalanceError);
        } else {
          console.log(`✅ Lv${user.level} balance 업데이트: ${currentBalance} → ${newBalance}`);
          
          // 관리자 잔고 변경 로그 기록
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: user.id,
              balance_before: currentBalance,
              balance_after: newBalance,
              amount: type === 'deposit' ? -amountNum : amountNum,
              transaction_type: type === 'deposit' ? 'withdrawal' : 'deposit',
              from_partner_id: type === 'deposit' ? user.id : userId,
              to_partner_id: type === 'deposit' ? userId : user.id,
              processed_by: user.id,
              memo: `[강제${type === 'deposit' ? '입금' : '출금'}] ${selectedUser.username}에게 ${amountNum.toLocaleString()}원 ${type === 'deposit' ? '입금' : '회수'}${memo ? `: ${memo}` : ''}`
            });
        }
      }
    }

    const successMsg = type === 'deposit' 
      ? t.transactionManagement.forceDepositSuccess.replace('{{balance}}', balanceAfter.toLocaleString())
      : t.transactionManagement.forceWithdrawalSuccess.replace('{{balance}}', balanceAfter.toLocaleString());
    toast.success(successMsg);
    
    // WebSocket으로 실시간 알림
    sendMessage({
      type: 'admin_force_transaction',
      data: { 
        userId, 
        type, 
        amount: amountNum,
          balanceAfter,
          processedBy: user.nickname
        }
      });

      setForceDialog({ open: false, type: 'deposit', userId: '', amount: '', memo: '' });
      // loadData 호출 제거 - Realtime subscription이 자동으로 처리
    } catch (error) {
      console.error('강제 입출금 실패:', error);
      toast.error(error instanceof Error ? error.message : t.transactionManagement.forceTransactionFailed);
    } finally {
      setRefreshing(false);
    }
  };

  // 초기 로드
  useEffect(() => {
    loadData(true);
  }, []);

  // reloadTrigger 변경 시 데이터 로드 (Realtime 이벤트 처리)
  useEffect(() => {
    if (reloadTrigger > 0 && !initialLoading) {
      // console.log 제거
      loadData(false);
    }
  }, [reloadTrigger]);

  // 필터 변경 시 자동 새로고침 (깜박임 없이)
  useEffect(() => {
    if (!initialLoading) {
      // console.log 제거
      loadData(false);
    }
  }, [periodFilter]);

  // ✅ transactionTypeFilter 변경 시 통계 재계산
  useEffect(() => {
    if (!initialLoading) {
      // console.log 제거
      loadData(false);
    }
  }, [transactionTypeFilter]);

  // Realtime subscription for transactions table (즉시 업데이트)
  useEffect(() => {
    // console.log 제거
    
    const transactionsChannel = supabase
      .channel('transactions-realtime-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          // console.log 제거
          // reloadTrigger 증가로 데이터 리로드 트리거
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        // console.log 제거
      });

    // users 테이블 변경 감지 (보유금 업데이트 감지)
    const usersChannel = supabase
      .channel('users-realtime-balance-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users'
        },
        (payload) => {
          // console.log 제거
          // reloadTrigger 증가로 데이터 리로드 트리거
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        // console.log 제거
      });

    // partner_balance_logs 테이블 변경 감지 (파트너 거래 감지)
    const partnerBalanceLogsChannel = supabase
      .channel('partner-balance-logs-realtime-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'partner_balance_logs'
        },
        (payload) => {
          // console.log 제거
          // reloadTrigger 증가로 데이터 리로드 트리거
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        // console.log 제거
      });

    // point_transactions 테이블 변경 감지
    const pointTransactionsChannel = supabase
      .channel('point-transactions-realtime-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'point_transactions'
        },
        (payload) => {
          // console.log 제거
          // reloadTrigger 증가로 데이터 리로드 트리거
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        // console.log 제거
      });

    return () => {
      // console.log 제거
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(partnerBalanceLogsChannel);
      supabase.removeChannel(pointTransactionsChannel);
    };
  }, []);

  // WebSocket 메시지 처리
  useEffect(() => {
    if (lastMessage?.type === 'transaction_update' || 
        lastMessage?.type === 'deposit_request' || 
        lastMessage?.type === 'withdrawal_request' ||
        lastMessage?.type === 'admin_force_transaction' ||
        lastMessage?.type === 'transaction_processed') {
      // console.log 제거
      setReloadTrigger(prev => prev + 1);
    }
  }, [lastMessage]);

  if (initialLoading) {
    return <LoadingSpinner />;
  }

  // 탭별 데이터 필터링
  const filterBySearch = (t: any) => {
    const searchLower = searchTerm.toLowerCase();
    
    // 파트너 거래 (partner_balance_logs)는 partner_nickname으로 검색
    if (t.is_partner_transaction) {
      return searchTerm === '' || 
        String(t.partner_nickname || '').toLowerCase().includes(searchLower) ||
        String(t.from_partner_nickname || '').toLowerCase().includes(searchLower) ||
        String(t.to_partner_nickname || '').toLowerCase().includes(searchLower);
    }
    // 포인트 거래는 user_nickname으로 검색
    if (t.is_point_transaction) {
      return searchTerm === '' || String(t.user_nickname || '').toLowerCase().includes(searchLower);
    }
    // 관리자 입출금 신청은 partner 정보로 검색
    if (t.transaction_type === 'partner_online_deposit' || t.transaction_type === 'partner_online_withdrawal') {
      return searchTerm === '' || String(t.partner?.nickname || '').toLowerCase().includes(searchLower);
    }
    // 사용자 입출금 신청은 user 정보로 검색
    return searchTerm === '' || String(t.user?.nickname || '').toLowerCase().includes(searchLower);
  };

  const depositRequests = transactions.filter(t => 
    (t.transaction_type === 'deposit' || t.transaction_type === 'partner_online_deposit') && 
    t.status === 'pending' &&
    filterBySearch(t)
  );

  const withdrawalRequests = transactions.filter(t => 
    (t.transaction_type === 'withdrawal' || t.transaction_type === 'partner_online_withdrawal') && 
    t.status === 'pending' &&
    filterBySearch(t)
  );

  // ✅ 통계 계산용: 검색 필터 없이 모든 pending 요청
  const allDepositRequests = transactions.filter(t => 
    (t.transaction_type === 'deposit' || t.transaction_type === 'partner_online_deposit') && 
    t.status === 'pending'
  );

  const allWithdrawalRequests = transactions.filter(t => 
    (t.transaction_type === 'withdrawal' || t.transaction_type === 'partner_online_withdrawal') && 
    t.status === 'pending'
  );

  // 전체입출금내역: 사용자 + 관리자 입출금 + 파트너 거래 + 포인트 거래 통합
  // ✅ 이 부분을 getTabStats() 전에 정의해야 함!
  const completedTransactions = (() => {
    const dateRange = getDateRange(periodFilter);
    
    // 입출금 거래 필터링
    const filteredTransactions = transactions.filter(t => {
      // 상태 및 검색 필터 (pending, completed, rejected 모두 포함)
      const statusMatch = t.status === 'pending' || t.status === 'completed' || t.status === 'rejected';
      const searchMatch = filterBySearch(t);
      
      // 거래 타입 필터
      const typeMatch = (() => {
        // 전체 필터: 모든 입출금 거래 표시
        if (transactionTypeFilter === 'all') {
          return t.transaction_type === 'user_online_deposit' || 
                 t.transaction_type === 'user_online_withdrawal' ||
                 t.transaction_type === 'partner_manual_deposit' ||
                 t.transaction_type === 'partner_manual_withdrawal' ||
                 t.transaction_type === 'admin_adjustment';
        }
        
        // 온라인 입금
        if (transactionTypeFilter === 'online_deposit') {
          return t.transaction_type === 'user_online_deposit';
        }
        
        // 온라인 출금
        if (transactionTypeFilter === 'online_withdrawal') {
          return t.transaction_type === 'user_online_withdrawal';
        }
        
        // 수동 충전 (manual_charge)
        if (transactionTypeFilter === 'manual_charge') {
          return t.transaction_type === 'partner_manual_deposit';
        }
        
        // 수동 환전 (manual_withdrawal)
        if (transactionTypeFilter === 'manual_withdrawal') {
          return t.transaction_type === 'partner_manual_withdrawal';
        }
        
        // 파트너 충전: 현재 사용자가 수신자인 파트너 거래
        if (transactionTypeFilter === 'partner_charge') {
          return t.is_partner_transaction && t.transaction_type === 'deposit' && t.to_partner_id === user.id;
        }
        
        // 파트너 환전: 현재 사용자가 송금자인 파트너 거래
        if (transactionTypeFilter === 'partner_withdrawal') {
          return t.is_partner_transaction && t.transaction_type === 'withdrawal' && t.from_partner_id === user.id;
        }
        
        // 포인트 지급
        if (transactionTypeFilter === 'point_give') {
          return t.transaction_type === 'admin_adjustment' && t.amount > 0 && t.points_before !== undefined;
        }
        
        // 포인트 회수
        if (transactionTypeFilter === 'point_recover') {
          return t.transaction_type === 'admin_adjustment' && t.amount < 0 && t.points_before !== undefined;
        }
        
        return false;
      })();
      
      return statusMatch && searchMatch && typeMatch;
    });
    
    // console.log 제거
    
    const mappedPartnerTransactions = (transactionTypeFilter === 'all' || 
                                       transactionTypeFilter === 'partner_charge' || 
                                       transactionTypeFilter === 'partner_withdrawal')
      ? partnerTransactions
        .filter(pt => {
          // ✅ Lv2가 출금하고 다른 레벨이 입금하는 경우 제외
          // from_partner_level이 2(Lv2)이고 to_partner_level이 2가 아닌 경우 제외
          if (pt.from_partner_level === 2 && pt.to_partner_level !== 2 && pt.transaction_type === 'withdrawal') {
            return false; // Lv2 출금 제외
          }
          // to_partner_level이 2(Lv2)이고 from_partner_level이 2가 아닌 경우 제외
          if (pt.to_partner_level === 2 && pt.from_partner_level !== 2 && pt.transaction_type === 'deposit') {
            return false; // Lv2 입금 제외
          }
          
          // 날짜 필터 (created_at이 null인 경우 포함)
          const dateMatch = !pt.created_at || (
            new Date(pt.created_at) >= new Date(dateRange.start) && 
            new Date(pt.created_at) <= new Date(dateRange.end)
          );
          
          const searchMatch = searchTerm === '' || 
            pt.partner_nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pt.from_partner_nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pt.to_partner_nickname?.toLowerCase().includes(searchTerm.toLowerCase());
          
          // 필터별 파트너 거래 타입 매칭
          const typeMatch = (() => {
            if (transactionTypeFilter === 'all') return true;
            // 파트너 충전: 현재 사용자가 수신자 (to_partner_id) + deposit 거래만
            if (transactionTypeFilter === 'partner_charge') {
              return pt.to_partner_id === user.id && pt.transaction_type === 'deposit';
            }
            // 파트너 환전: 현재 사용자가 송금자 (from_partner_id) + withdrawal 거래만
            if (transactionTypeFilter === 'partner_withdrawal') {
              return pt.from_partner_id === user.id && pt.transaction_type === 'withdrawal';
            }
            return false;
          })();
          
          return dateMatch && searchMatch && typeMatch;
        })
        .map(pt => ({
          ...pt,
          status: 'completed',
          user: {
            nickname: pt.partner_nickname,
            username: pt.partner_username
          },
          is_partner_transaction: true
        }))
      : [];
    
    // 포인트 거래 필터링 및 변환
    const filteredPointTransactions = (transactionTypeFilter === 'all' || 
                                       transactionTypeFilter === 'point_give' || 
                                       transactionTypeFilter === 'point_recover')
      ? pointTransactions
        .filter(pt => {
          // 날짜 필터 (created_at이 null인 경우 포함)
          const dateMatch = !pt.created_at || (
            new Date(pt.created_at) >= new Date(dateRange.start) && 
            new Date(pt.created_at) <= new Date(dateRange.end)
          );
          
          const searchMatch = searchTerm === '' || 
            pt.user_nickname?.toLowerCase().includes(searchTerm.toLowerCase());
          
          const typeMatch = (() => {
            if (transactionTypeFilter === 'all') return true;
            if (transactionTypeFilter === 'point_give') {
              // 포인트 지급: earn 타입 또는 admin_adjustment에서 양수
              return pt.transaction_type === 'earn' || 
                     (pt.transaction_type === 'admin_adjustment' && pt.amount > 0);
            }
            if (transactionTypeFilter === 'point_recover') {
              // 포인트 회수: use 타입 또는 admin_adjustment에서 음수
              return pt.transaction_type === 'use' || 
                     (pt.transaction_type === 'admin_adjustment' && pt.amount < 0);
            }
            return false;
          })();
          
          return dateMatch && searchMatch && typeMatch;
        })
        .map(pt => ({
          ...pt,
          status: 'completed',
          user: {
            nickname: pt.user_nickname,
            username: pt.user_username
          },
          is_point_transaction: true
        }))
      : [];
    
    // 입출금 거래와 파트너 거래와 포인트 거래 병합 후 시간순 정렬
    const result = [...filteredTransactions, ...mappedPartnerTransactions, ...filteredPointTransactions].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return result;
  })();
  
  // ✅ 탭별 통계 계산 (activeTab 변경 시마다 재계산)
  const getTabStats = () => {
    if (activeTab === 'deposit-request') {
      // 입금신청 탭: pending 입금 요청의 신청 금액 합계
      const totalDeposit = allDepositRequests.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      return {
        totalDeposit: totalDeposit,
        totalWithdrawal: 0,
        pendingDepositCount: allDepositRequests.length,
        pendingWithdrawalCount: 0
      };
    } else if (activeTab === 'withdrawal-request') {
      // 출금신청 탭: pending 출금 요청의 신청 금액 합계 (음수 표시)
      const totalWithdrawal = allWithdrawalRequests.reduce((sum, t) => sum - parseFloat(t.amount.toString()), 0);
      return {
        totalDeposit: 0,
        totalWithdrawal: totalWithdrawal,
        pendingDepositCount: 0,
        pendingWithdrawalCount: allWithdrawalRequests.length
      };
    } else {
      // 전체입출금내역 탭: transactions 테이블만 집계 (completed-history 기준)
      // ✅ partner_deposit, partner_withdrawal, admin_adjustment, point_transactions는 제외
      const totalDeposit = completedTransactions
        .filter(t => 
          t.transaction_type === 'deposit' ||                    // 온라인 입금만
          t.transaction_type === 'partner_manual_deposit'            // 수동 충전만
        )
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      const totalWithdrawal = completedTransactions
        .filter(t => 
          t.transaction_type === 'withdrawal' ||                 // 온라인 출금만
          t.transaction_type === 'partner_manual_withdrawal'         // 수동 환전만
        )
        .reduce((sum, t) => {
          const amount = parseFloat(t.amount.toString());
          // partner_manual_withdrawal는 이미 음수
          if (t.transaction_type === 'partner_manual_withdrawal') {
            return sum + amount;
          }
          return sum - amount; // withdrawal은 음수로 변환
        }, 0);
      
      return {
        totalDeposit: totalDeposit,
        totalWithdrawal: totalWithdrawal,
        pendingDepositCount: allDepositRequests.length,
        pendingWithdrawalCount: allWithdrawalRequests.length
      };
    }
  };

  // ✅ 통계 카드: 항상 전체입출금내역(completed-history) 탭의 데이터만 표시
  const displayStats = (() => {
    const totalDeposit = completedTransactions
      .filter(t => 
        t.transaction_type === 'deposit' ||                    // 온라인 입금만
        t.transaction_type === 'partner_manual_deposit'        // 수동 충전만
      )
      .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
    
    const totalWithdrawal = completedTransactions
      .filter(t => 
        t.transaction_type === 'withdrawal' ||                 // 온라인 출금만
        t.transaction_type === 'partner_manual_withdrawal'         // 수동 환전만
      )
      .reduce((sum, t) => {
        const amount = parseFloat(t.amount.toString());
        if (t.transaction_type === 'partner_manual_withdrawal') {
          return sum + amount;
        }
        return sum - amount;
      }, 0);
    
    return {
      totalDeposit: totalDeposit,
      totalWithdrawal: totalWithdrawal,
      pendingDepositCount: allDepositRequests.length,
      pendingWithdrawalCount: allWithdrawalRequests.length
    };
  })();

  // ✅ 관리자 입금 로그만 출력
  const adminDepositTransactions = completedTransactions.filter((t: any) => {
    // transactions 테이블의 partner_online_deposit
    const isPartnerDepositFromTransactions = t.transaction_type === 'partner_online_deposit' && !t.is_partner_transaction;
    // partner_balance_logs 테이블의 deposit
    const isDepositFromPartnerBalanceLogs = t.is_partner_transaction && t.transaction_type === 'deposit';
    return isPartnerDepositFromTransactions || isDepositFromPartnerBalanceLogs;
  });

  // 거래 테이블 컬럼 - 순서: 거래일시|아이디|보낸사람|받는사람|거래유형|보유금|신청금액|변경후 금액|상태|메모|처리자
  const getColumns = (showActions = false) => [
    // 1. 거래일시
    {
      header: t.transactionManagement.transactionDate,
      cell: (row: any) => (
        <span className="text-slate-300" style={{ fontSize: '15px' }}>
          {row.created_at ? new Date(row.created_at).toLocaleString('ko-KR') : '날짜 없음'}
        </span>
      )
    },
    // 2. 아이디
    {
      header: '아이디',
      cell: (row: any) => {
        // 파트너 거래인 경우
        if (row.is_partner_transaction) {
          return (
            <span className="text-purple-400" style={{ fontSize: '15px' }}>
              {row.from_partner_username || row.to_partner_username || row.partner_username || '-'}
            </span>
          );
        }
        
        // ✅ 관리자 입출금 신청인 경우 (partner_online_deposit, partner_online_withdrawal)
        if (row.transaction_type === 'partner_online_deposit' || row.transaction_type === 'partner_online_withdrawal') {
          return (
            <span className="text-purple-400" style={{ fontSize: '15px' }}>
              {row.partner?.username || row.from_partner_username || row.to_partner_username || '-'}
            </span>
          );
        }
        
        // 일반 회원 거래
        return (
          <span className="text-slate-300" style={{ fontSize: '15px' }}>
            {row.user?.username || row.user_username || '-'}
          </span>
        );
      }
    },
    // 3. 보낸사람
    {
      header: '보낸사람',
      cell: (row: any) => {
        // 파트너 거래인 경우
        if (row.is_partner_transaction && row.from_partner_username) {
          return (
            <span className="text-blue-400" style={{ fontSize: '15px' }}>
              {row.from_partner_username}
            </span>
          );
        }

        // ✅ partner_online_deposit/partner_online_withdrawal: 신청자 파트너 표시
        if (row.transaction_type === 'partner_online_deposit' || row.transaction_type === 'partner_online_withdrawal') {
          return (
            <span className="text-blue-400" style={{ fontSize: '15px' }}>
              {row.partner?.nickname || '[신청자]'}
            </span>
          );
        }

        // ✅ 관리자 입금/출금 거래: from_partner_id/to_partner_id 표시
        const isAdminDepositType = row.transaction_type === 'admin_deposit_initial' || row.transaction_type === 'partner_manual_deposit';
        const isAdminWithdrawalType = row.transaction_type === 'partner_manual_withdrawal';
        
        if (isAdminDepositType || isAdminWithdrawalType) {
          // 관리자 입금/출금: 보낸사람 = 담당 파트너
          if (row.user?.referrer) {
            return (
              <span className="text-blue-400" style={{ fontSize: '15px' }}>
                {row.user.referrer.nickname}
              </span>
            );
          }
        }

        // 일반 회원 거래에서 소속 표시 (deposit/withdrawal)
        if (row.user?.referrer) {
          return (
            <span className="text-blue-400" style={{ fontSize: '15px' }}>
              {row.user.referrer.nickname}
            </span>
          );
        }

        return <span className="text-slate-500" style={{ fontSize: '15px' }}>-</span>;
      }
    },
    // 4. 받는사람
    {
      header: '받는사람',
      cell: (row: any) => {
        // 파트너 거래인 경우
        if (row.is_partner_transaction && row.to_partner_username) {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {row.to_partner_username}
            </span>
          );
        }
        
        // ✅ partner_online_deposit/partner_online_withdrawal: 승인자 파트너 표시
        if (row.transaction_type === 'partner_online_deposit' || row.transaction_type === 'partner_online_withdrawal') {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {row.partner?.nickname || '[승인자]'}
            </span>
          );
        }

        // ✅ 관리자 입금/출금 거래: 받는 사람 표시
        const isAdminDepositType = row.transaction_type === 'admin_deposit_initial' || row.transaction_type === 'partner_manual_deposit';
        const isAdminWithdrawalType = row.transaction_type === 'partner_manual_withdrawal';
        
        if (isAdminDepositType) {
          // 관리자 입금: 받는사람 = 회원 (user.username)
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {row.user?.username || '-'}
            </span>
          );
        }
        
        if (isAdminWithdrawalType) {
          // 관리자 출금: 받는사람 = 담당 파트너
          if (row.user?.referrer) {
            return (
              <span className="text-pink-400" style={{ fontSize: '15px' }}>
                {row.user.referrer.nickname}
              </span>
            );
          }
        }
        
        return <span className="text-slate-500" style={{ fontSize: '15px' }}>-</span>;
      }
    },
    // 5. 거래유형
    {
      header: t.transactionManagement.transactionType,
      cell: (row: any) => {
        // 파트너 거래인 경우 - 현재 사용자 기준으로 표시
        if (row.is_partner_transaction) {
          // deposit/withdrawal 거래: 현재 사용자 기준으로 파트너 환전/충전 판단
          if (row.transaction_type === 'deposit' || row.transaction_type === 'withdrawal') {
            // 현재 사용자가 송금자(from_partner_id)인 경우 → 파트너 환전 (출금)
            if (row.from_partner_id === user.id && row.transaction_type === 'withdrawal') {
              return <Badge className="bg-pink-600 text-white text-sm px-3 py-1">파트너 환전</Badge>;
            }
            // 현재 사용자가 수신자(to_partner_id)인 경우 → 파트너 충전 (입금)
            if (row.to_partner_id === user.id && row.transaction_type === 'deposit') {
              return <Badge className="bg-purple-600 text-white text-sm px-3 py-1">파트너 충전</Badge>;
            }
          }
          
          // 그 외 파트너 거래 타입
          const partnerTypeMap: any = {
            deposit: { text: '파트너 충전', color: 'bg-purple-600' },
            withdrawal: { text: '파트너 환전', color: 'bg-pink-600' },
            admin_adjustment: { text: '파트너조정', color: 'bg-indigo-600' },
            commission: { text: '파트너수수료', color: 'bg-violet-600' },
            refund: { text: '파트너환급', color: 'bg-sky-600' }
          };
          const type = partnerTypeMap[row.transaction_type] || { text: row.transaction_type, color: 'bg-slate-600' };
          return <Badge className={`${type.color} text-white text-sm px-3 py-1`}>{type.text}</Badge>;
        }
        
        const typeMap: any = {
          // 회원 온라인 입출금
          user_online_deposit: { text: '온라인 입금', color: 'bg-emerald-600' },
          user_online_withdrawal: { text: '온라인 출금', color: 'bg-orange-600' },
          // 파트너 온라인 입출금
          partner_online_deposit: { text: '온라인 입금', color: 'bg-emerald-600' },
          partner_online_withdrawal: { text: '온라인 출금', color: 'bg-orange-600' },
          // 수동 충전/환전
          partner_manual_deposit: { text: '수동 충전', color: 'bg-blue-600' },
          partner_manual_withdrawal: { text: '수동 환전', color: 'bg-red-600' },
          // 포인트 거래
          admin_adjustment: { 
            text: row.amount > 0 && row.points_before !== undefined ? '포인트 지급' : '포인트 회수', 
            color: row.amount > 0 && row.points_before !== undefined ? 'bg-amber-600' : 'bg-purple-600'
          }
        };
        
        // Display 로직: 발신자/수신자 레벨에 따라 다를 수 있음
        let displayText = typeMap[row.transaction_type]?.text || row.transaction_type;
        
        // 파트너 온라인 입출금의 경우 레벨에 따라 Display 달라짐
        if ((row.transaction_type === 'partner_online_deposit' || row.transaction_type === 'partner_online_withdrawal') &&
            row.from_partner_id && row.to_partner_id) {
          // 발신자/수신자 파트너 레벨 조회 필요 - 현재는 간단한 Display 사용
          displayText = getSimpleTransactionDisplay(row.transaction_type);
        } else if ((row.transaction_type === 'partner_manual_deposit' || row.transaction_type === 'partner_manual_withdrawal') &&
                   row.from_partner_id && row.to_partner_id) {
          // 수동 충전/환전도 레벨에 따라 다름
          displayText = getSimpleTransactionDisplay(row.transaction_type);
        }
        
        const type = { text: displayText, color: typeMap[row.transaction_type]?.color || 'bg-slate-600' };
        return <Badge className={`${type.color} text-white text-sm px-3 py-1`} style={{ letterSpacing: '0.02em' }}>{type.text}</Badge>;
      },
      width: '120px'
    },
    // 6. 신청금액
    {
      header: t.transactionManagement.amount,
      cell: (row: any) => {
        // 금액 포맷팅 (원화 표시 없이 숫자만)
        const formatNumberOnly = (num: number) => new Intl.NumberFormat('ko-KR').format(num);
        
        // 파트너 거래인 경우
        if (row.is_partner_transaction) {
          const isNegative = row.transaction_type === 'withdrawal' || row.amount < 0;
          return (
            <span className={cn(
              "font-asiahead font-semibold",
              isNegative ? 'text-red-400' : 'text-green-400'
            )} style={{ fontSize: '16px', letterSpacing: '0.02em', marginLeft: '-10em' }}>
              {isNegative ? '-' : '+'}
              {formatNumberOnly(Math.abs(parseFloat(row.amount?.toString() || '0')))}
            </span>
          );
        }
        
        // 포인트 거래인 경우
        if (row.points_before !== undefined) {
          const isNegative = row.amount < 0;
          return (
            <span className={cn(
              "font-asiahead font-semibold",
              isNegative ? 'text-red-400' : 'text-green-400'
            )} style={{ fontSize: '16px', letterSpacing: '0.1em', marginLeft: '-10em' }}>
              {isNegative ? '' : '+'}
              {Math.abs(row.amount).toLocaleString()}P
            </span>
          );
        }
        
        // 일반 입출금 거래 (관리자입금신청/관리자출금신청/입금/출금)
        const isWithdrawal = row.transaction_type === 'withdrawal' || 
                             row.transaction_type === 'admin_withdrawal' ||
                             row.transaction_type === 'partner_online_withdrawal' ||
                             (row.transaction_type === 'admin_adjustment' && row.memo?.includes('강제 출금'));
        return (
          <span className={cn(
            "font-asiahead font-semibold",
            isWithdrawal ? 'text-red-400' : 'text-green-400'
          )} style={{ fontSize: '16px', letterSpacing: '0.1em', marginLeft: '-10em' }}>
            {formatNumberOnly(parseFloat(row.amount.toString()))}
          </span>
        );
      },
      className: "text-right"
    },
    // 7. 보유금 (거래 전 잔액)
    {
      header: '보유금',
      cell: (row: any) => {
        // 금액 포맷팅 (원화 표시 없이 숫자만)
        const formatNumberOnly = (num: number) => new Intl.NumberFormat('ko-KR').format(num);
        
        // 파트너 거래인 경우: Lv2는 총 보유금(4개 지갑 합계), 그 외는 balance_before
        if (row.is_partner_transaction) {
          const balanceValue = row.balance_before_total !== undefined 
            ? row.balance_before_total 
            : parseFloat(row.balance_before?.toString() || '0');
          return (
            <span className="font-asiahead text-cyan-300" style={{ fontSize: '15px', letterSpacing: '0.1em' }}>
              {formatNumberOnly(balanceValue)}
            </span>
          );
        }
        
        // 포인트 거래인 경우
        if (row.points_before !== undefined) {
          return (
            <span className="font-asiahead text-amber-300" style={{ fontSize: '15px', letterSpacing: '0.1em' }}>
              {row.points_before.toLocaleString()}P
            </span>
          );
        }
        
        // 일반 입출금 거래
        return (
          <span className="font-asiahead text-cyan-300" style={{ fontSize: '15px', letterSpacing: '0.1em' }}>
            {formatNumberOnly(parseFloat(row.balance_before?.toString() || '0'))}
          </span>
        );
      },
      className: "text-right"
    },
    // 8. 변경후 금액
    {
      header: '변경후 금액',
      cell: (row: any) => {
        // 금액 포맷팅 (원화 표시 없이 숫자만)
        const formatNumberOnly = (num: number) => new Intl.NumberFormat('ko-KR').format(num);
        
        // 파트너 거래인 경우: balance_after (거래 후 잔액)
        if (row.is_partner_transaction) {
          const balanceValue = parseFloat(row.balance_after?.toString() || '0');
          return (
            <span className="font-asiahead text-purple-400" style={{ fontSize: '15px', letterSpacing: '0.1em' }}>
              {formatNumberOnly(balanceValue)}
            </span>
          );
        }
        
        // 포인트 거래인 경우
        if (row.points_after !== undefined) {
          return (
            <span className="font-asiahead text-amber-400" style={{ fontSize: '15px', letterSpacing: '0.1em' }}>
              {row.points_after.toLocaleString()}P
            </span>
          );
        }
        
        // ✅ pending 상태 입출금 신청인 경우: 보유금 + 신청금액 계산
        if (row.status === 'pending') {
          const balanceBefore = parseFloat(row.balance_before?.toString() || '0');
          const amount = parseFloat(row.amount?.toString() || '0');
          const isWithdrawal = row.transaction_type === 'withdrawal' || row.transaction_type === 'partner_online_withdrawal';
          const afterBalance = isWithdrawal ? balanceBefore - amount : balanceBefore + amount;
          return (
            <span className="font-asiahead text-cyan-400" style={{ fontSize: '15px', letterSpacing: '0.1em' }}>
              {formatNumberOnly(afterBalance)}
            </span>
          );
        }
        
        // 일반 입출금 거래 (completed/rejected)
        return (
          <span className="font-asiahead text-cyan-400" style={{ fontSize: '15px', letterSpacing: '0.1em' }}>
            {formatNumberOnly(parseFloat(row.balance_after?.toString() || '0'))}
          </span>
        );
      },
      className: "text-right"
    },
    // 9. 상태
    {
      header: t.transactionManagement.status,
      cell: (row: any) => {
        const statusMap: any = {
          pending: { text: t.transactionManagement.pending, color: 'bg-amber-600' },
          completed: { text: t.transactionManagement.completed, color: 'bg-emerald-600' },
          rejected: { text: t.transactionManagement.rejected, color: 'bg-rose-600' }
        };
        const status = statusMap[row.status] || { text: row.status, color: 'bg-slate-600' };
        return <Badge className={`${status.color} text-white text-sm px-3 py-1`}>{status.text}</Badge>;
      },
      className: "text-center"
    },
    // 10. 메모
    {
      header: t.transactionManagement.memo,
      cell: (row: any) => {
        let displayMemo = '-';

        if (!row.memo) {
          return (
            <div className="max-w-xs">
              <span className="text-base text-slate-400 block truncate">-</span>
            </div>
          );
        }

        // ✅ partner_online_deposit/partner_online_withdrawal: 승인시 입력한 메모는 항상 표시
        if (row.transaction_type === 'partner_online_deposit' || row.transaction_type === 'partner_online_withdrawal') {
          displayMemo = row.memo;
        }
        // ✅ 거절 사유는 그대로 표시
        else if (row.status === 'rejected') {
          displayMemo = row.memo;
        }
        // ✅ UUID 패턴 (거래 ID)는 숨김
        else if (row.memo.match(/^[0-9a-f-]{8,}/)) {
          displayMemo = '-';
        }
        // ✅ 시스템 메모로 시작하는 패턴은 모두 숨김
        else if (
          row.memo.startsWith('[관리자') ||
          row.memo.startsWith('[강제') ||
          row.memo.startsWith('[회원급') ||
          row.memo.startsWith('회원 ') ||
          row.memo.includes('승인') ||
          row.memo.includes('거래') ||
          row.memo.includes('수신') ||
          row.memo.includes('발송') ||
          row.memo.includes('로부터') ||
          row.memo.includes('에게') ||
          row.memo.includes('ID:') ||
          row.memo.includes('원 ')
        ) {
          displayMemo = '-';
        }
        // ✅ ": " 기준으로 사용자 입력 메모만 추출
        else if (row.memo.includes(': ')) {
          // "[시스템메모]: 사용자메모" 형태에서 사용자메모만 추출
          const parts = row.memo.split(': ');
          const userMemo = parts.slice(1).join(': '); // ": " 뒤의 모든 내용
          // 추출한 메모도 시스템 패턴이면 숨김
          if (userMemo && !userMemo.includes('원 ') && !userMemo.match(/^[0-9a-f-]{36}/)) {
            displayMemo = userMemo;
          }
        }
        // ✅ 그 외 순수 사용자 메모는 그대로 표시
        else {
          displayMemo = row.memo;
        }

        return (
          <div className="max-w-xs">
            <span className="text-base text-slate-400 block truncate" title={displayMemo}>
              {displayMemo}
            </span>
          </div>
        );
      },
      className: "text-left pl-8"
    },
    // 11. 처리자
    {
      header: t.transactionManagement.processor,
      cell: (row: any) => {
        // ✅ 처리자: 입출금을 처리하는 액션하는 계정의 닉네임 표시
        let processorNickname = '-';

        // 파트너 거래인 경우
        if (row.is_partner_transaction) {
          processorNickname = row.processed_by_nickname || '-';
        }
        // 포인트 거래인 경우
        else if (row.is_point_transaction) {
          processorNickname = row.partner_nickname || '-';
        }
        // 일반 거래인 경우
        else {
          processorNickname = row.processed_partner?.nickname || '-';
        }

        return (
          <span className="text-base text-slate-400">
            {processorNickname}
          </span>
        );
      }
    },
    ...(showActions ? [{
      header: t.transactionManagement.actions,
      cell: (row: Transaction) => {
        // ✅ partner_online_deposit/partner_online_withdrawal 승인 대기 중인 경우
        if ((row.transaction_type === 'partner_online_deposit' || row.transaction_type === 'partner_online_withdrawal') &&
            row.status === 'pending') {

          // ✅ 승인 권한 확인: Lv1은 모두, Lv2+는 자신의 하부 조직만 (단, 자신의 신청은 승인 불가)
          const canApprove = (() => {
            if (user.level === 1) return true; // Lv1: 모든 파트너 입출금 승인 가능

            // Lv2+: 자신의 하부 조직 파트너의 신청만 승인 가능 (자신의 신청은 승인 불가)
            const partnerId = (row as any).partner_id;
            if (!partnerId || partnerId === user.id) return false; // 자신의 신청은 승인 불가

            // allowedPartnerIds에 포함되어 있는지 확인
            return allowedPartnerIds.includes(partnerId);
          })();

          if (canApprove) {
            // ✅ 승인 권한이 있는 경우: 승인/거절 버튼 표시
            return (
              <div className="flex items-center gap-2">
                <Button
                  size="default"
                  onClick={() => openActionDialog(row, 'approve')}
                  disabled={refreshing}
                  className="h-10 px-5 text-base bg-green-600 hover:bg-green-700"
                >
                  {t.transactionManagement.approve}
                </Button>
                <Button
                  size="default"
                  variant="outline"
                  onClick={() => openActionDialog(row, 'reject')}
                  disabled={refreshing}
                  className="h-10 px-5 text-base border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  {t.transactionManagement.reject}
                </Button>
              </div>
            );
          } else {
            // ✅ 승인 권한이 없는 경우: "승인대기중" 텍스트 표시
            return (
              <span className="text-amber-400 font-medium text-base">
                승인대기중
              </span>
            );
          }
        }

        // 일반 승인/거절 버튼 (사용자 입출금)
        return (
          <div className="flex items-center gap-2">
            <Button
              size="default"
              onClick={() => openActionDialog(row, 'approve')}
              disabled={refreshing}
              className="h-10 px-5 text-base bg-green-600 hover:bg-green-700"
            >
              {t.transactionManagement.approve}
            </Button>
            <Button
              size="default"
              variant="outline"
              onClick={() => openActionDialog(row, 'reject')}
              disabled={refreshing}
              className="h-10 px-5 text-base border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
            >
              {t.transactionManagement.reject}
            </Button>
          </div>
        );
      }
    }] : [])
  ];

  return (
    <>
      <style>{`
        .compact-table .table-premium thead th {
          padding: 0.875rem 1rem !important;
          font-size: 1rem !important;
        }
        .compact-table .table-premium tbody td {
          padding: 0.875rem 1rem !important;
        }
        .compact-table .table-premium tbody tr {
          border-bottom: 1px solid rgba(71, 85, 105, 0.2) !important;
        }
      `}</style>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold text-slate-100">{t.transactionManagement.title}</h1>
          <p className="text-xl text-slate-400">{t.transactionManagement.subtitle}</p>
        </div>
        <Button onClick={() => setForceDialog({ ...forceDialog, open: true })} className="btn-premium-primary h-14 px-8 text-xl">
          <Plus className="h-7 w-7 mr-3" />
          {t.transactionManagement.forceTransaction}
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <MetricCard
          title={t.transactionManagement.totalDeposit}
          value={formatCurrency(displayStats.totalDeposit)}
          subtitle={t.transactionManagement.accumulatedDeposit}
          icon={TrendingUp}
          color="green"
        />
        
        <MetricCard
          title={t.transactionManagement.totalWithdrawal}
          value={formatCurrency(displayStats.totalWithdrawal)}
          subtitle={t.transactionManagement.accumulatedWithdrawal}
          icon={TrendingDown}
          color="red"
        />
        
        <MetricCard
          title={t.transactionManagement.depositRequests}
          value={`${displayStats.pendingDepositCount}건`}
          subtitle={t.transactionManagement.pendingProcessing}
          icon={Clock}
          color="amber"
        />
        
        <MetricCard
          title={t.transactionManagement.withdrawalRequests}
          value={`${displayStats.pendingWithdrawalCount}건`}
          subtitle={t.transactionManagement.pendingProcessing}
          icon={AlertTriangle}
          color="orange"
        />
      </div>

      {/* 탭 컨텐츠 */}
      <div className="glass-card rounded-xl p-5">
        {/* 탭 리스트 */}
        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          if (!initialLoading) {
            loadData(false);
          }
        }} className="space-y-4">
          <div className="bg-slate-800/30 rounded-xl p-1.5 border border-slate-700/40">
            <TabsList className="bg-transparent h-auto p-0 border-0 gap-2 w-full grid grid-cols-3">
              <TabsTrigger 
                value="completed-history"
                className="bg-transparent text-slate-400 text-lg rounded-lg px-6 py-4 data-[state=active]:bg-gradient-to-br data-[state=active]:from-green-500/20 data-[state=active]:to-emerald-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-green-500/20 data-[state=active]:border data-[state=active]:border-green-400/30 transition-all duration-200"
              >
                {t.transactionManagement.completedHistoryTab}
              </TabsTrigger>
              <TabsTrigger 
                value="deposit-request"
                className="bg-transparent text-slate-400 text-lg rounded-lg px-6 py-4 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500/20 data-[state=active]:to-cyan-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20 data-[state=active]:border data-[state=active]:border-blue-400/30 transition-all duration-200"
              >
                {t.transactionManagement.depositRequestTab}
              </TabsTrigger>
              <TabsTrigger 
                value="withdrawal-request"
                className="bg-transparent text-slate-400 text-lg rounded-lg px-6 py-4 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500/20 data-[state=active]:to-pink-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 data-[state=active]:border data-[state=active]:border-purple-400/30 transition-all duration-200"
              >
                {t.transactionManagement.withdrawalRequestTab}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 필터 영역 - 컴팩트하게 한 줄로 */}
          <div className="flex items-center gap-3 bg-slate-800/20 rounded-lg p-3 border border-slate-700/30">
            {/* 기간 정렬 */}
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[160px] h-11 text-base bg-slate-800/50 border-slate-600">
                <SelectValue placeholder={t.transactionManagement.period} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="today">{t.transactionManagement.today}</SelectItem>
                <SelectItem value="yesterday">어제</SelectItem>
                <SelectItem value="week">{t.transactionManagement.lastWeek}</SelectItem>
                <SelectItem value="month">{t.transactionManagement.lastMonth}</SelectItem>
              </SelectContent>
            </Select>

            {/* 검색 - 좁게 */}
            <div className="w-[200px] relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                placeholder="회원검색"
                className="pl-10 h-11 text-base bg-slate-800/50 border-slate-600"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* 거래 유형 필터 버튼 (전체입출금내역 탭에서만 표시) - Glass Morphism 디자인 */}
            {activeTab === 'completed-history' && (
              <div className="flex gap-2 ml-auto flex-wrap">
                <Button
                  onClick={() => setTransactionTypeFilter('all')}
                  variant={transactionTypeFilter === 'all' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'all' 
                      ? "bg-white/20 border border-white/30 hover:bg-white/30 text-white shadow-lg" 
                      : "bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300"
                  )}
                >
                  전체
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('online_deposit')}
                  variant={transactionTypeFilter === 'online_deposit' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'online_deposit' 
                      ? "bg-emerald-500/30 border border-emerald-400/50 hover:bg-emerald-500/40 text-emerald-100 shadow-lg" 
                      : "bg-emerald-500/10 border border-emerald-400/20 hover:bg-emerald-500/20 text-slate-300"
                  )}
                >
                  온라인 입금
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('online_withdrawal')}
                  variant={transactionTypeFilter === 'online_withdrawal' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'online_withdrawal' 
                      ? "bg-orange-500/30 border border-orange-400/50 hover:bg-orange-500/40 text-orange-100 shadow-lg" 
                      : "bg-orange-500/10 border border-orange-400/20 hover:bg-orange-500/20 text-slate-300"
                  )}
                >
                  온라인 출금
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('manual_charge')}
                  variant={transactionTypeFilter === 'manual_charge' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'manual_charge' 
                      ? "bg-blue-500/30 border border-blue-400/50 hover:bg-blue-500/40 text-blue-100 shadow-lg" 
                      : "bg-blue-500/10 border border-blue-400/20 hover:bg-blue-500/20 text-slate-300"
                  )}
                >
                  수동 충전
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('manual_withdrawal')}
                  variant={transactionTypeFilter === 'manual_withdrawal' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'manual_withdrawal' 
                      ? "bg-red-500/30 border border-red-400/50 hover:bg-red-500/40 text-red-100 shadow-lg" 
                      : "bg-red-500/10 border border-red-400/20 hover:bg-red-500/20 text-slate-300"
                  )}
                >
                  수동 환전
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('point_give')}
                  variant={transactionTypeFilter === 'point_give' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'point_give' 
                      ? "bg-amber-500/30 border border-amber-400/50 hover:bg-amber-500/40 text-amber-100 shadow-lg" 
                      : "bg-amber-500/10 border border-amber-400/20 hover:bg-amber-500/20 text-slate-300"
                  )}
                >
                  포인트 지급
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('point_recover')}
                  variant={transactionTypeFilter === 'point_recover' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'point_recover' 
                      ? "bg-purple-500/30 border border-purple-400/50 hover:bg-purple-500/40 text-purple-100 shadow-lg" 
                      : "bg-purple-500/10 border border-purple-400/20 hover:bg-purple-500/20 text-slate-300"
                  )}
                >
                  포인트 회수
                </Button>
              </div>
            )}

            {/* 새로고침 */}
            <Button
              onClick={() => {
                // console.log 제거
                loadData(false);
              }}
              disabled={refreshing}
              variant="outline"
              className="h-11 px-5 text-base bg-slate-800/50 border-slate-600 hover:bg-slate-700"
            >
              <RefreshCw className={cn("h-5 w-5 mr-2", refreshing && "animate-spin")} />
              {t.transactionManagement.refresh}
            </Button>
          </div>

          {/* 입금 신청 탭 */}
          <TabsContent value="deposit-request" className="compact-table">
            <DataTable
              searchable={false}
              columns={getColumns(true)}
              data={depositRequests}
              loading={initialLoading}
              emptyMessage={t.transactionManagement.noDepositRequests}
            />
          </TabsContent>

          {/* 출금 신청 탭 */}
          <TabsContent value="withdrawal-request" className="compact-table">
            <DataTable
              searchable={false}
              columns={getColumns(true)}
              data={withdrawalRequests}
              loading={initialLoading}
              emptyMessage={t.transactionManagement.noWithdrawalRequests}
            />
          </TabsContent>

          {/* 전체입출금내역 탭 (사용자 + 관리자 입출금 통합) */}
          <TabsContent value="completed-history" className="compact-table">
            <DataTable
              searchable={false}
              columns={getColumns(false)}
              data={completedTransactions}
              loading={initialLoading}
              emptyMessage={t.transactionManagement.noTransactionHistory}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* 승인/거절 확인 Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
        <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">
              {actionDialog.action === 'approve' ? t.transactionManagement.approveTransaction : t.transactionManagement.rejectTransaction}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-lg">
              {actionDialog.action === 'approve' 
                ? t.transactionManagement.confirmApproveMessage
                : t.transactionManagement.enterRejectReason}
            </DialogDescription>
          </DialogHeader>
          
          {actionDialog.transaction && (
            <div className="space-y-4">
              <div className="p-6 bg-slate-800/50 rounded-lg space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-400 text-lg">{t.transactionManagement.member}:</span>
                  <span className="text-white text-lg">{actionDialog.transaction.user?.nickname}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-lg">{t.transactionManagement.transactionType}:</span>
                  <span className="text-white text-lg">
                    {(() => {
                      // ✅ 파트너 거래인 경우 처리
                      if (actionDialog.transaction.is_partner_transaction) {
                        const tx = actionDialog.transaction;
                        
                        // partner_online_deposit / partner_online_withdrawal는 transactionDisplayHelper 사용해서 표시
                        if (tx.transaction_type === 'partner_online_deposit' || tx.transaction_type === 'partner_online_withdrawal') {
                          const isFromRecord = tx.from_partner_id === user.id;
                          const fromLevel = tx.from_partner?.level;
                          const toLevel = tx.to_partner?.level;
                          
                          // Display Helper 로직 적용
                          if (tx.transaction_type === 'partner_online_deposit') {
                            const isSenderHigher = (fromLevel || 0) > (toLevel || 0);
                            if (isFromRecord) {
                              return '온라인 입금';
                            } else {
                              return isSenderHigher ? '온라인 출금' : '온라인 입금';
                            }
                          } else { // partner_online_withdrawal
                            const isSenderHigher = (fromLevel || 0) > (toLevel || 0);
                            if (isFromRecord) {
                              return '온라인 출금';
                            } else {
                              return isSenderHigher ? '온라인 입금' : '온라인 출금';
                            }
                          }
                        }
                        
                        // partner_manual_deposit / partner_manual_withdrawal
                        if (tx.transaction_type === 'partner_manual_deposit' || tx.transaction_type === 'partner_manual_withdrawal') {
                          const isFromRecord = tx.from_partner_id === user.id || !tx.from_partner_id;
                          const fromLevel = tx.from_partner?.level || tx.partner?.level;
                          
                          if (tx.transaction_type === 'partner_manual_deposit') {
                            if (fromLevel === 2) {
                              return '수동 충전';
                            } else if (fromLevel && fromLevel >= 3) {
                              return isFromRecord ? '수동 환전' : '수동 충전';
                            }
                            return '수동 충전';
                          } else { // partner_manual_withdrawal
                            if (fromLevel === 2) {
                              return '수동 환전';
                            } else if (fromLevel && fromLevel >= 3) {
                              return isFromRecord ? '수동 충전' : '수동 환전';
                            }
                            return '수동 환전';
                          }
                        }
                        
                        // deposit / withdrawal (partner_balance_logs)
                        if (tx.transaction_type === 'deposit' || tx.transaction_type === 'withdrawal') {
                          const isFromRecord = tx.from_partner_id === user.id;
                          const fromLevel = tx.from_partner?.level;
                          const toLevel = tx.to_partner?.level;
                          
                          if (tx.transaction_type === 'deposit') {
                            if (fromLevel === 2) {
                              return '파트너 충전';
                            } else if (fromLevel && fromLevel >= 3) {
                              return isFromRecord ? '파트너 환전' : '파트너 충전';
                            }
                            return '파트너 충전';
                          } else { // withdrawal
                            if (fromLevel === 2) {
                              return '파트너 환전';
                            } else if (fromLevel && fromLevel >= 3) {
                              return isFromRecord ? '파트너 충전' : '파트너 환전';
                            }
                            return '파트너 환전';
                          }
                        }

                        // 그 외 파트너 거래 타입
                        const partnerTypeMap: any = {
                          admin_adjustment: '파트너조정',
                          commission: '파트너수수료',
                          refund: '파트너환급'
                        };
                        return partnerTypeMap[tx.transaction_type] || tx.transaction_type;
                      }

                      // ✅ 일반 거래
                      const typeMap: any = {
                        user_online_deposit: '온라인 입금',
                        user_online_withdrawal: '온라인 출금',
                        partner_online_deposit: '온라인 입금',
                        partner_online_withdrawal: '온라인 출금',
                        partner_manual_deposit: '수동 충전',
                        partner_manual_withdrawal: '수동 환전',
                        admin_adjustment: '포인트 조정',
                        commission: '수수료',
                        refund: '환급'
                      };
                      return typeMap[actionDialog.transaction.transaction_type] || actionDialog.transaction.transaction_type;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-lg">{t.transactionManagement.amount}:</span>
                  <span className="text-green-400 font-mono text-xl">
                    {formatCurrency(parseFloat(actionDialog.transaction.amount.toString()))}
                  </span>
                </div>
              </div>

              {/* ✅ 승인/거절 모두 메모 입력 가능 */}
              <div className="space-y-2">
                <Label htmlFor="transaction-memo" className="text-slate-300 text-lg">
                  {actionDialog.action === 'reject' ? t.transactionManagement.rejectReason : '메모 (선택사항)'}
                </Label>
                <Textarea
                  id="transaction-memo"
                  name="transaction_memo"
                  value={actionDialog.memo}
                  onChange={(e) => setActionDialog({ ...actionDialog, memo: e.target.value })}
                  placeholder={actionDialog.action === 'reject' ? t.transactionManagement.rejectReasonPlaceholder : '메모를 입력하세요 (선택사항)'}
                  className="bg-slate-800 border-slate-700 text-white text-lg"
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setActionDialog({ ...actionDialog, open: false })}
              disabled={refreshing}
              className="h-12 px-6 text-lg"
            >
              {t.transactionManagement.cancel}
            </Button>
            <Button 
              onClick={handleTransactionAction}
              disabled={refreshing || (actionDialog.action === 'reject' && !actionDialog.memo)}
              className={`h-12 px-6 text-lg ${actionDialog.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {actionDialog.action === 'approve' ? t.transactionManagement.approve : t.transactionManagement.reject}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 강제 입출금 Dialog */}
      <Dialog open={forceDialog.open} onOpenChange={(open) => setForceDialog({ ...forceDialog, open })}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl">
              {forceDialog.type === 'deposit' ? (
                <>
                  <Gift className="h-8 w-8 text-emerald-500" />
                  {t.transactionManagement.forceDeposit}
                </>
              ) : (
                <>
                  <MinusCircle className="h-8 w-8 text-rose-500" />
                  {t.transactionManagement.forceWithdrawal}
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-lg">
              {t.transactionManagement.adjustMemberBalance}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="grid gap-3">
              <Label htmlFor="force-dialog-type" className="text-lg">{t.transactionManagement.transactionTypeLabel}</Label>
              <Select value={forceDialog.type} onValueChange={(value: 'deposit' | 'withdrawal') => setForceDialog({ ...forceDialog, type: value })}>
                <SelectTrigger id="force-dialog-type" className="input-premium h-14 text-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="deposit" className="text-lg py-3">{t.transactionManagement.deposit}</SelectItem>
                  <SelectItem value="withdrawal" className="text-lg py-3">{t.transactionManagement.withdrawal}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3">
              <Label htmlFor="force-dialog-user-search" className="text-lg">{t.transactionManagement.selectMember}</Label>
              <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="force-dialog-user-search"
                    variant="outline"
                    role="combobox"
                    aria-expanded={userSearchOpen}
                    className="justify-between input-premium h-14 text-lg"
                  >
                    {forceDialog.userId
                      ? users.find(u => u.id === forceDialog.userId)?.username + 
                        ` (${users.find(u => u.id === forceDialog.userId)?.nickname})` +
                        ` - ${parseFloat(users.find(u => u.id === forceDialog.userId)?.balance?.toString() || '0').toLocaleString()}원`
                      : t.transactionManagement.selectMemberPlaceholder}
                    <ChevronsUpDown className="ml-2 h-6 w-6 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[580px] p-0 bg-slate-800 border-slate-700">
                  <Command className="bg-slate-800">
                    <CommandInput 
                      placeholder={t.transactionManagement.selectMemberPlaceholder}
                      className="h-12 text-lg text-slate-100 placeholder:text-slate-500"
                    />
                    <CommandList>
                      <CommandEmpty className="text-slate-400 py-8 text-center text-lg">{t.transactionManagement.memberNotFound}</CommandEmpty>
                      <CommandGroup className="max-h-80 overflow-auto">
                        {users.map(u => (
                          <CommandItem
                            key={u.id}
                            value={`${u.username} ${u.nickname}`}
                            onSelect={() => {
                              setForceDialog({ ...forceDialog, userId: u.id });
                              setUserSearchOpen(false);
                            }}
                            className="flex items-center justify-between cursor-pointer hover:bg-slate-700/50 text-slate-300 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <Check
                                className={`mr-2 h-6 w-6 ${
                                  forceDialog.userId === u.id ? `opacity-100 ${forceDialog.type === 'deposit' ? 'text-emerald-500' : 'text-rose-500'}` : "opacity-0"
                                }`}
                              />
                              <div>
                                <div className="font-medium text-slate-100 text-lg">{u.username}</div>
                                <div className="text-base text-slate-400">{u.nickname}</div>
                              </div>
                            </div>
                            <div className="text-lg">
                              <span className="text-cyan-400 font-mono">{parseFloat(u.balance?.toString() || '0').toLocaleString()}원</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* 선택된 회원 정보 표시 */}
            {forceDialog.userId && (() => {
              const selectedUser = users.find(u => u.id === forceDialog.userId);
              return selectedUser ? (
                <div className="p-5 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg text-slate-400">{t.transactionManagement.selectedMember}</span>
                    <span className="text-cyan-400 font-medium text-xl">{selectedUser.nickname}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg text-slate-400">{t.transactionManagement.currentBalance}</span>
                    <span className="font-mono text-cyan-400 text-xl">
                      {parseFloat(selectedUser.balance?.toString() || '0').toLocaleString()}원
                    </span>
                  </div>
                </div>
              ) : null;
            })()}

            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="force-dialog-amount" className="text-lg">{t.transactionManagement.amountLabel}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForceDialog({ ...forceDialog, amount: '' })}
                  className={`h-10 px-4 text-base text-slate-400 ${
                    forceDialog.type === 'deposit' 
                      ? 'hover:text-orange-400 hover:bg-orange-500/10' 
                      : 'hover:text-red-400 hover:bg-red-500/10'
                  }`}
                >
                  {t.transactionManagement.deleteAll}
                </Button>
              </div>
              <Input
                id="force-dialog-amount"
                name="amount"
                type="text"
                value={forceDialog.amount}
                onChange={(e) => {
                  const numericValue = e.target.value.replace(/[^\d]/g, '');
                  if (numericValue === '') {
                    setForceDialog({ ...forceDialog, amount: '' });
                    return;
                  }
                  
                  const inputAmount = parseInt(numericValue);
                  
                  // 출금 타입이고 회원이 선택된 경우 보유금 검증
                  if (forceDialog.type === 'withdrawal' && forceDialog.userId) {
                    const selectedUser = users.find(u => u.id === forceDialog.userId);
                    if (selectedUser) {
                      const userBalance = parseFloat(selectedUser.balance?.toString() || '0');
                      if (inputAmount > userBalance) {
                        toast.error(`출금 금액이 보유금(${userBalance.toLocaleString()}원)을 초과할 수 없습니다.`);
                        setForceDialog({ ...forceDialog, amount: userBalance.toLocaleString() });
                        return;
                      }
                    }
                  }
                  
                  setForceDialog({ ...forceDialog, amount: inputAmount.toLocaleString() });
                }}
                placeholder={t.transactionManagement.enterAmountPlaceholder}
                className="input-premium h-14 text-lg"
              />
            </div>

            {/* 금액 단축 버튼 */}
            <div className="grid gap-3">
              <Label className="text-slate-400 text-lg">{t.transactionManagement.quickInput}</Label>
              <div className="grid grid-cols-4 gap-2">
                {amountShortcuts.map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const currentAmount = parseFloat(forceDialog.amount.replace(/,/g, '') || '0');
                      const newAmount = currentAmount + amt;
                      
                      // 출금 타입이고 회원이 선택된 경우 보유금 검증
                      if (forceDialog.type === 'withdrawal' && forceDialog.userId) {
                        const selectedUser = users.find(u => u.id === forceDialog.userId);
                        if (selectedUser) {
                          const userBalance = parseFloat(selectedUser.balance?.toString() || '0');
                          if (newAmount > userBalance) {
                            toast.error(`출금 금액이 보유금(${userBalance.toLocaleString()}원)을 초과할 수 없습니다.`);
                            setForceDialog({ ...forceDialog, amount: userBalance.toLocaleString() });
                            return;
                          }
                        }
                      }
                      
                      setForceDialog({ 
                        ...forceDialog, 
                        amount: newAmount.toLocaleString() 
                      });
                    }}
                    className={`h-12 text-base transition-all bg-slate-800/50 border-slate-700 text-slate-300 ${
                      forceDialog.type === 'deposit'
                        ? 'hover:bg-orange-500/20 hover:border-orange-500/60 hover:text-orange-400 hover:shadow-[0_0_15px_rgba(251,146,60,0.3)]'
                        : 'hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                    }`}
                  >
                    +{amt >= 10000 ? `${amt / 10000}만` : `${amt / 1000}천`}
                  </Button>
                ))}
              </div>
            </div>

            {/* 전액출금 버튼 (출금 시에만) */}
            {forceDialog.type === 'withdrawal' && forceDialog.userId && (
              <div className="grid gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const selectedUser = users.find(u => u.id === forceDialog.userId);
                    if (selectedUser) {
                      const balance = parseFloat(selectedUser.balance?.toString() || '0');
                      setForceDialog({ ...forceDialog, amount: balance.toLocaleString() });
                    }
                  }}
                  className="w-full h-12 text-lg bg-red-900/20 border-red-500/50 text-red-400 hover:bg-red-900/40 hover:border-red-500"
                >
                  <Trash2 className="h-6 w-6 mr-3" />
                  {t.transactionManagement.fullWithdrawal}
                </Button>
              </div>
            )}

            {/* 메모 */}
            <div className="grid gap-3">
              <Label htmlFor="force-dialog-memo" className="text-lg">{t.transactionManagement.memoLabel}</Label>
              <Textarea
                id="force-dialog-memo"
                name="memo"
                value={forceDialog.memo}
                onChange={(e) => setForceDialog({ ...forceDialog, memo: e.target.value })}
                placeholder={t.transactionManagement.memoPlaceholder}
                className="input-premium min-h-[120px] text-lg"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="button"
              onClick={handleForceTransaction}
              disabled={refreshing || !forceDialog.userId || !forceDialog.amount || parseFloat(forceDialog.amount.replace(/,/g, '') || '0') <= 0}
              className={`w-full h-14 text-xl ${forceDialog.type === 'deposit' ? 'btn-premium-warning' : 'btn-premium-danger'}`}
            >
              {refreshing ? t.transactionManagement.processing : forceDialog.type === 'deposit' ? t.transactionManagement.forceDeposit : t.transactionManagement.forceWithdrawal}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
}

export default TransactionManagement;