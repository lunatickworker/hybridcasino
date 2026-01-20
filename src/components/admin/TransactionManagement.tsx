import { useState, useEffect, useCallback } from "react";
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
import { useBalance } from "../../contexts/BalanceContext";
import { cn } from "../../lib/utils";
import { MetricCard } from "./MetricCard";
import { depositBalance, withdrawBalance, extractBalanceFromResponse } from "../../lib/investApi";
import { getAdminOpcode, isMultipleOpcode } from "../../lib/opcodeHelper";
import { useLanguage } from "../../contexts/LanguageContext";
import { TransactionType, PARTNER_BALANCE_TABLE_TYPES, TRANSACTION_TABLE_TYPES, TRANSACTION_CONFIG, COMPLETED_TYPES, PENDING_TYPES } from "../../types/transactions";
import { TransactionBadge } from "../common/TransactionBadge";
import { depositToUser, withdrawFromUser } from "../../lib/operatorManualTransferUsage";
import { filterUserTransactions, filterPartnerTransactions, filterLv2Transactions, isReceivedTransaction } from "../../lib/transactionFilters";

interface TransactionManagementProps {
  user: Partner;
}

console.log('🔄 TransactionManagement 컴포넌트 마운트됨');

export function TransactionManagement({ user }: TransactionManagementProps) {
  const { t, language, formatCurrency } = useLanguage();
  const { lastMessage, sendMessage } = useWebSocketContext();
  
  // ⭐ Balance Context 사용 (승인 후 즉시 동기화)
  let syncBalance = async () => {};
  try {
    const balanceContext = useBalance();
    syncBalance = balanceContext.syncBalance;
  } catch (error) {
    // BalanceProvider 외부에서 렌더링되는 경우 (정상 동작)
  }
  
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

  // ✅ 허용된 파트너 ID 로드
  useEffect(() => {
    const loadAllowedPartners = async () => {
      if (user.level === 1) {
        // Lv1: 모든 파트너 허용 (빈 배열 = 필터링 없음)
        setAllowedPartnerIds([]);
      } else {
        // 자신과 하위 파트너 조회
        const { data } = await supabase.rpc('get_hierarchical_partners', { p_partner_id: user.id });
        const partnerIds = [user.id, ...(data?.map((p: any) => p.id) || [])];
        setAllowedPartnerIds(partnerIds);
        console.log('🗂️ [TransactionManagement] 허용 파트너 ID 로드 완료:', partnerIds);

        // ✅ 파트너 ID 로드 완료 (상태만 갱신)
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

  // URL 해시 변경 감지하여 탭 업데이트
  useEffect(() => {
    // 컴포넌트 마운트 시에도 해시 확인
    const checkHash = () => {
      const fullHash = window.location.hash; // #/admin/transactions#deposit-request
      const anchorIndex = fullHash.indexOf('#', 1); // 두 번째 # 찾기

      console.log('🔍🔍🔍 [TransactionManagement] checkHash 실행:', { 
        fullHash, 
        anchorIndex,
        hasAnchor: anchorIndex !== -1
      });

      if (anchorIndex !== -1) {
        const anchor = fullHash.substring(anchorIndex + 1); // deposit-request
        console.log('🔄 [TransactionManagement] 해시 변경 감지:', { fullHash, anchor, anchorIndex });

        if (anchor === 'deposit-request' || anchor === 'withdrawal-request' || anchor === 'completed-history') {
          console.log('✅ [TransactionManagement] 탭 변경:', anchor);
          // ✅ URL 해시 변경 시에는 activeTab만 변경 (onValueChange가 loadData 호출)
          setActiveTab(anchor);
        } else {
          console.log('❌ [TransactionManagement] 지원하지 않는 탭:', anchor);
        }
      } else {
        console.log('⚠️ [TransactionManagement] 앵커 없음');
      }
    };

    checkHash(); // 마운트 시 즉시 실행

    const handleHashChange = () => {
      console.log('🎯 [TransactionManagement] hashchange 이벤트 발생');
      checkHash();
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []); // ✅ initialLoading 의존성 제거

  // ⚡ 데이터 로드 최적화 (병렬 쿼리)
  const loadData = async (isInitial = false, skipSetRefreshing = false) => {
    // Determine current tab from URL hash to ensure correct date range
    const fullHash = window.location.hash;
    const anchorIndex = fullHash.indexOf('#', 1);
    const currentTab = anchorIndex !== -1 ? fullHash.substring(anchorIndex + 1) : 'completed-history';

    console.log('🔄 loadData 호출됨, isInitial:', isInitial, 'periodFilter:', periodFilter, 'activeTab:', activeTab, 'currentTab:', currentTab);

    try {
      if (!isInitial) {
        setRefreshing(true);
      }

      // 날짜 필터 적용 (모든 탭에서 동일하게 적용)
      const dateRange = getDateRange(periodFilter);

      // ✅ 파트너 ID 직접 계산 (allowedPartnerIds 의존성 제거)
      // 병렬로 계산하기 위해 Promise 사용
      const getPartnerIds = async () => {
        if (user.level === 1) {
          return [];
        } else {
          const { data } = await supabase.rpc('get_hierarchical_partners', { p_partner_id: user.id });
          return [user.id, ...(data?.map((p: any) => p.id) || [])];
        }
      };

      // ⚡ 1단계: 파트너 ID 및 하위 파트너 정보 병렬 조회
      const [allowedPartnerIdsForQuery, hierarchicalPartners] = await Promise.all([
        getPartnerIds(),
        user.level === 1
          ? supabase
              .from('partners')
              .select('id, level, nickname, username')
              .neq('level', 1)
              .then(r => r.data || [])
          : Promise.resolve([])
      ]);

      console.log('🔍 [loadData] 파트너 ID 조회:', {
        userLevel: user.level,
        allowedPartnerIdsForQuery,
        hierarchicalPartnersCount: hierarchicalPartners.length,
        hierarchicalPartners
      });

      const partnerIds = user.level === 1 
        ? [user.id, ...hierarchicalPartners.map((p: any) => p.id)]
        : allowedPartnerIdsForQuery;

      // 사용자 ID 목록은 partnerIds 기준으로 조회해야 함 (하위 파트너가 소유한 회원들)
      let targetUserIds: string[] = [];
      if (user.level === 1) {
        const res = await supabase.from('users').select('id');
        targetUserIds = res.data?.map((u: any) => u.id).filter((id: any) => id != null) || [];
      } else {
        if (partnerIds && partnerIds.length > 0) {
          const res = await supabase.from('users').select('id').in('referrer_id', partnerIds);
          targetUserIds = res.data?.map((u: any) => u.id) || [];
        } else {
          targetUserIds = [];
        }
      }
      
      // 🎯 파트너 거래 중복 제거 함수 (모든 탭에서 사용)
      const deduplicatePartnerTransactions = (transactions: any[]) => {
        const seenTransactions = new Map<string, any>();
        const removed: any[] = [];
        
        const result = transactions.filter((tx: any) => {
          // partner_balance_logs만 처리
          if (!tx.is_from_partner_balance_logs) {
            return true;
          }
          
          // Lv2 거래 (is_from_lv2)는 중복 제거 제외
          if (tx.is_from_lv2) {
            return true;
          }
          
          // 거래 키: transaction_type|from_partner_id|to_partner_id
          const transactionKey = `${tx.transaction_type}|${[tx.from_partner_id, tx.to_partner_id]
            .sort()
            .join('|')}`;
          
          if (seenTransactions.has(transactionKey)) {
            removed.push({
              id: tx.id,
              type: tx.transaction_type,
              from: tx.from_partner_id,
              to: tx.to_partner_id
            });
            return false;
          }
          
          seenTransactions.set(transactionKey, tx);
          return true;
        });
        
        if (removed.length > 0) {
          console.log('🗑️ [deduplicatePartnerTransactions] 제거된 거래:', removed);
        }
        
        return result;
      };
      
      // ✅ 기본 쿼리 설정
      const baseTransactionQuery = supabase
        .from('transactions')
        .select('id,user_id,partner_id,transaction_type,status,amount,balance_before,balance_after,created_at,processed_at,processed_by,memo,bank_name,bank_account,bank_holder')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
        .order('created_at', { ascending: false });

      let transactionsResultPromise: Promise<any>;

      // ✅ 탭에 따라 상태 필터 적용
      if (activeTab === 'completed-history') {
        // 📊 전체입출금내역: transactions + partner_balance_logs + point_transactions 통합
        transactionsResultPromise = (async () => {
          try {
            // 1️⃣ transactions 조회
            let transactionsQ = baseTransactionQuery.in('status', ['completed', 'rejected']);
            
            // 필터 적용: Lv1(필터 없음) / Lv2+(자신의 거래만)
            if (user.level > 1) {
              // ✅ partner_withdrawal_request는 partner_id로, 다른 거래는 to_partner_id로 필터
              transactionsQ = transactionsQ.or(`partner_id.eq.${user.id},to_partner_id.eq.${user.id}`);
            }
            
            const transRes = await transactionsQ;
            
            // 2️⃣ partner_balance_logs 조회
            let pblQ = supabase
              .from('partner_balance_logs')
              .select('id,transaction_id,transaction_type,amount,balance_before,balance_after,created_at,processed_by,memo,from_partner_id,to_partner_id,partner_id')
              .gte('created_at', dateRange.start)
              .lte('created_at', dateRange.end);
            
            // 필터: Lv1(필터 없음) / Lv2+(자신의 거래만)
            if (user.level > 1) {
              // Lv2+: 자신의 partner_id 기록만
              pblQ = pblQ.eq('partner_id', user.id);
            }
            
            pblQ = pblQ.order('created_at', { ascending: false });
            const pblRes = await pblQ;
            
            const transData = transRes.data || [];
            const pblData = pblRes.data || [];
            
            // 3️⃣ 파트너 정보 조회 (from, to 모두 포함)
            const partnerIdsSet = new Set<string>();
            transData.forEach(t => {
              if (t.partner_id) partnerIdsSet.add(t.partner_id);
              if (t.processed_by) partnerIdsSet.add(t.processed_by);
            });
            pblData.forEach(p => {
              if (p.from_partner_id) partnerIdsSet.add(p.from_partner_id);
              if (p.to_partner_id) partnerIdsSet.add(p.to_partner_id);
              if (p.partner_id) partnerIdsSet.add(p.partner_id);
              if (p.processed_by) partnerIdsSet.add(p.processed_by);
            });
            
            const partnerList = Array.from(partnerIdsSet);
            const partnerInfo = partnerList.length > 0
              ? await supabase.from('partners').select('id, username, nickname').in('id', partnerList)
              : { data: [], error: null };
            
            const partnerMap = new Map((partnerInfo.data || []).map((p: any) => [p.id, p]));
            
            // 4️⃣ 데이터 변환 및 통합
            const combinedData: any[] = [];
            
            // transactions 추가
            // transactions will be mapped after partner info is fetched so we can attach partner username/nickname
            
            // partner_balance_logs 변환 후 추가
            pblData.forEach(pbl => {
              const fromPartner = pbl.from_partner_id ? partnerMap.get(pbl.from_partner_id) : null;
              const toPartner = pbl.to_partner_id ? partnerMap.get(pbl.to_partner_id) : null;
              
              const record = {
                ...pbl,
                user_id: null,
                status: 'completed',
                from_partner_username: fromPartner?.username || '',
                from_partner_nickname: fromPartner?.nickname || '',
                to_partner_username: toPartner?.username || '',
                to_partner_nickname: toPartner?.nickname || '',
                is_from_partner_balance_logs: true
              };
              
              combinedData.push(record);
            });

            // transactions 변환 (partner info가 준비된 이후에 partner username/nickname 추가)
            combinedData.push(...(transData || []).map(t => {
              const partner = t.partner_id ? partnerMap.get(t.partner_id) : null;
              return {
                ...t,
                status: 'completed',
                is_from_partner_balance_logs: false,
                partner_username: partner?.username || '',
                partner_nickname: partner?.nickname || ''
              };
            }));
            
            // 5️⃣ 정렬
            combinedData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            
            console.log('🔍 [completed-history] 최종 결과:', {
              transData_count: transData.length,
              pblData_count: pblData.length,
              combined_count: combinedData.length,
              user_level: user.level,
              user_id: user.id
            });
            
            return {
              data: combinedData,
              error: transRes.error || pblRes.error
            };
          } catch (err) {
            console.error('❌ [completed-history] 에러:', err);
            return { data: [], error: err };
          }
        })();
      } else if (activeTab === 'deposit-request' || activeTab === 'withdrawal-request') {
        // 📋 입금신청/출금신청: pending 및 rejected 상태 (Lv3+가 자신의 요청 이력을 볼 수 있도록)
        transactionsResultPromise = (async () => {
          try {
            // ✅ Lv3+는 자신의 pending + rejected 요청을 봄
            // Lv1-2는 pending만 봄 (관리자 화면)
            const statuses = (user.level > 2) ? ['pending', 'rejected'] : ['pending'];
            let query = baseTransactionQuery.in('status', statuses);
            
            // 거래 타입 필터: 회원 거래 + 파트너 거래
            const txnTypes = activeTab === 'deposit-request' 
              ? ['deposit', 'partner_deposit_request']
              : ['withdrawal', 'partner_withdrawal_request'];
            query = query.in('transaction_type', txnTypes);
            
            // 필터: Lv1(모두) / Lv2+(자신+하위)
            if (user.level === 1) {
              // Lv1: 제약 없음 (모든 거래 조회)
            } else if (user.level === 2) {
              // Lv2: 자신의 하위 조직 파트너 요청만 조회
              if (partnerIds && partnerIds.length > 0) {
                query = query.in('partner_id', partnerIds);
              }
            } else if (user.level > 2) {
              // ✅ Lv3+: 본인 신청(pending + rejected)은 봄
              // (partner_deposit_request/partner_withdrawal_request는 신청자(partner_id)가 본인인 경우만 조회)
              const partnerFilter = supabase
                .from('transactions')
                .select('*')
                .in('status', statuses)
                .in('transaction_type', txnTypes);
              
              // 복잡한 OR 조건: 
              // (partner_id = 본인) OR (partner_id != 본인 AND transaction_type = 'deposit'/'withdrawal')
              // → 두 개 쿼리로 분리
              
              // 1. 본인이 보낸 모든 요청 (pending + rejected)
              const ownRequests = await supabase
                .from('transactions')
                .select('*')
                .in('status', statuses)
                .in('transaction_type', txnTypes)
                .eq('partner_id', user.id);
              
              // 2. 다른 파트너의 회원 입출금만 (pending만)
              const othersUserTransactions = await supabase
                .from('transactions')
                .select('*')
                .eq('status', 'pending')
                .in('transaction_type', ['deposit', 'withdrawal'])
                .neq('partner_id', user.id);
              
              if (partnerIds && partnerIds.length > 0) {
                const filteredOthers = (othersUserTransactions.data || []).filter((t: any) => 
                  partnerIds.includes(t.partner_id)
                );
                const combined = [...(ownRequests.data || []), ...filteredOthers];
                return { data: combined, error: ownRequests.error || othersUserTransactions.error };
              } else {
                return ownRequests;
              }
            }
            
            const result = await query;
            
            console.log('🔍 [pending-request] 최종 결과:', {
              activeTab,
              count: (result.data || []).length,
              user_level: user.level,
              user_id: user.id,
              statuses
            });
            
            return result;
          } catch (err) {
            console.error('❌ [pending-request] 에러:', err);
            return { data: [], error: err };
          }
        })();
      } else {
        // fallback: no specific filter
        transactionsResultPromise = baseTransactionQuery;
      }
      
      // 포인트 거래 조회
      // ✅ 계층 구조 필터링: 자신과 하위 파트너들의 포인트 거래 조회
      let pointTransactionQuery = supabase
        .from('point_transactions')
        .select('*, from_partner_id, to_partner_id');
      
      // ✅ Lv1 또는 다중 레벨인 경우 하위 파트너들의 거래도 포함
      if (user.level === 1) {
        // Lv1: 모든 거래 조회
      } else if (user.level > 1) {
        // Lv2+: 자신과 하위 파트너들의 거래만 조회
        pointTransactionQuery = pointTransactionQuery.in('partner_id', partnerIds);
      } else {
        // Lv0: 자신의 거래만 조회
        pointTransactionQuery = pointTransactionQuery.eq('partner_id', user.id);
      }
      
      pointTransactionQuery = pointTransactionQuery
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
      
  // 파트너 거래 조회 (partner_balance_logs) - 조직격리 로직 적용 (PointManagement 방식)
  // ✅ 통일된 필터링: Lv1(모두) > Lv2+(자신+하위) > Lv0(자신만)
  let partnerTransactionsPromise: Promise<any>;
  
  if (user.level === 1) {
    // ✅ Lv1: 모든 파트너 거래 조회 (제약 없음)
    partnerTransactionsPromise = supabase
      .from('partner_balance_logs')
      .select('id,transaction_type,status,amount,partner_id,from_partner_id,to_partner_id,created_at,processed_at,processed_by,memo,balance_before,balance_after,processed_by_username')
      .in('transaction_type', PARTNER_BALANCE_TABLE_TYPES)
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end)
      .order('created_at', { ascending: false });
  } else if (user.level > 1) {
    // ✅ Lv2+: 자신과 하위 파트너들의 거래 조회 (partner_id 기준 - 처리자)
    partnerTransactionsPromise = supabase
      .from('partner_balance_logs')
      .select('id,transaction_type,status,amount,partner_id,from_partner_id,to_partner_id,created_at,processed_at,processed_by,memo,balance_before,balance_after,processed_by_username')
      .in('transaction_type', PARTNER_BALANCE_TABLE_TYPES)
      .in('partner_id', partnerIds)  // ✅ 자신과 하위 파트너들
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end)
      .order('created_at', { ascending: false });
  } else {
    // ✅ Lv0: 자신이 처리한 거래만 조회
    partnerTransactionsPromise = supabase
      .from('partner_balance_logs')
      .select('id,transaction_type,status,amount,partner_id,from_partner_id,to_partner_id,created_at,processed_at,processed_by,memo,balance_before,balance_after,processed_by_username')
      .in('transaction_type', PARTNER_BALANCE_TABLE_TYPES)
      .eq('partner_id', user.id)
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end)
      .order('created_at', { ascending: false });
  }
      
      const [transactionsResult, pointTransactionsResult, partnerTransactionsResult, usersResult] = await Promise.all([
        transactionsResultPromise,
        pointTransactionQuery,
        partnerTransactionsPromise,
        userListQuery
      ]);
      
      const transactionsData = transactionsResult.data || [];
      const pointTransactionsData = pointTransactionsResult.data || [];
      const partnerTransactionsData = partnerTransactionsResult.data || [];
      setUsers(usersResult.data || []);
      
      console.log('🔍 [loadData] transactionsData:', {
        len: transactionsData.length,
        sample: transactionsData.slice(0, 2),
        hasPartnerDepositRequest: transactionsData.some((t: any) => t.transaction_type === 'partner_deposit_request')
      });
      
      // 포인트 거래 데이터 처리
      const pointUserIds = [...new Set(pointTransactionsData.map(t => t.user_id).filter(Boolean))];
      const pointPartnerIds = [...new Set(
        pointTransactionsData.flatMap(t => [t.partner_id, t.from_partner_id, t.to_partner_id]).filter(Boolean)
      )];
      
      const [pointUsersResult, pointPartnersResult] = await Promise.all([
        pointUserIds.length > 0 
          ? supabase.from('users').select('id, nickname, username').in('id', pointUserIds)
          : Promise.resolve({ data: [], error: null }),
        pointPartnerIds.length > 0 
          ? supabase.from('partners').select('id, nickname, username').in('id', pointPartnerIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      
      const pointUsersMap = new Map((pointUsersResult.data || []).map(u => [u.id, u]));
      const pointPartnersMap = new Map((pointPartnersResult.data || []).map(p => [p.id, p]));
      
      const processedPointTransactions = pointTransactionsData.map(pt => ({
        ...pt,
        user_username: pointUsersMap.get(pt.user_id)?.username || '',
        user_nickname: pointUsersMap.get(pt.user_id)?.nickname || '',
        partner_nickname: pointPartnersMap.get(pt.partner_id)?.nickname || '',
        from_partner_username: pointPartnersMap.get(pt.from_partner_id)?.username || '',
        from_partner_nickname: pointPartnersMap.get(pt.from_partner_id)?.nickname || '',
        to_partner_username: pointPartnersMap.get(pt.to_partner_id)?.username || '',
        to_partner_nickname: pointPartnersMap.get(pt.to_partner_id)?.nickname || '',
        is_point_transaction: true  // 포인트 거래 플래그 추가
      }));
      
      setPointTransactions(processedPointTransactions);
      
      // 파트너 거래 데이터 처리
      const partnerFromIds = [...new Set(partnerTransactionsData.map(t => t.from_partner_id).filter(Boolean))];
      const partnerToIds = [...new Set(partnerTransactionsData.map(t => t.to_partner_id).filter(Boolean))];
      const partnerProcessedByIds = [...new Set(partnerTransactionsData.map(t => t.processed_by).filter(Boolean))];
      const partnerMainIds = [...new Set(partnerTransactionsData.map(t => t.partner_id).filter(Boolean))];
      
      const allPartnerIds = [...new Set([...partnerFromIds, ...partnerToIds, ...partnerProcessedByIds, ...partnerMainIds])];
      
      console.log('🔍 [loadData] partnerTransactionsData:', {
        len: partnerTransactionsData.length,
        sample: partnerTransactionsData.slice(0, 2),
        partnerFromIds: partnerFromIds.slice(0, 3),
        partnerToIds: partnerToIds.slice(0, 3),
        allPartnerIds: allPartnerIds.slice(0, 5)
      });
      
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
        const processedByInfo = partnerInfoMap.get(pt.processed_by);
        // ✅ processed_by_username 직接 사용 (DB에 저장된 값)
        const processedByUsername = pt.processed_by_username || processedByInfo?.username;
        
        // 🔥 admin_withdrawal_send: from/to 스왑
        const isAdminWithdrawal = pt.transaction_type === 'admin_withdrawal_send';
        const swappedFromPartnerInfo = isAdminWithdrawal ? toPartnerInfo : fromPartnerInfo;
        const swappedToPartnerInfo = isAdminWithdrawal ? fromPartnerInfo : toPartnerInfo;
        const swappedFromPartnerId = isAdminWithdrawal ? pt.to_partner_id : pt.from_partner_id;
        const swappedToPartnerId = isAdminWithdrawal ? pt.from_partner_id : pt.to_partner_id;
        
        return {
          ...pt,
          partner_nickname: partnerInfo?.nickname || '',
          partner_username: partnerInfo?.username || '',
          from_partner_id: swappedFromPartnerId,  // 🔥 스왑됨
          from_partner_nickname: swappedFromPartnerInfo?.nickname || '',
          from_partner_username: swappedFromPartnerInfo?.username || '',
          to_partner_id: swappedToPartnerId,  // 🔥 스왑됨
          to_partner_nickname: swappedToPartnerInfo?.nickname || '',
          to_partner_username: swappedToPartnerInfo?.username || '',
          processed_by_username: processedByUsername || '',
          processed_by_nickname: processedByInfo?.nickname || '',
          is_partner_transaction: true,  // 파트너 거래 플래그 추가
          is_from_partner_balance_logs: true, // 🔥 partner_balance_logs 출처 표시 (렌더링 조건 구분용)
          // ✅ 파트너 레벨 정보 추가 (Lv2 거래 필터링용)
          from_partner_level: swappedFromPartnerInfo?.level || 0,
          to_partner_level: swappedToPartnerInfo?.level || 0,
          // ✅ Lv2인 경우 총 보유금(4개 지갑 합계) 표시, 그 외는 balance 사용
          balance_after_total: partnerInfo ? calculateTotalBalance(partnerInfo) : parseFloat(pt.balance_after?.toString() || '0')
        };
      });
      
      setPartnerTransactions(processedPartnerTransactions);
      
      // ⚡ 4단계: 관련 데이터 배치 조회 (병렬)
      const userIds = [...new Set(transactionsData.map(t => t.user_id).filter(Boolean))];
      const partnerIdsInTransactions = [...new Set(transactionsData.map(t => t.partner_id).filter(Boolean))];
      
      // ✅ Lv1 partner_balance_logs 데이터 확인
      const hasPartnerBalanceLogsData = transactionsData.some(t => t.is_from_partner_balance_logs);
      
      console.log('🔍 [loadData 데이터 추출]:', {
        userIds: userIds,
        partnerIdsInTransactions: partnerIdsInTransactions,
        hasPartnerBalanceLogsData: hasPartnerBalanceLogsData,
        transactionsData_sample: transactionsData.slice(0, 2)
      });
      
      // ✅ 관리자 거래(partner_id만 있음) + 사용자 거래(user_id만 있음) + partner_balance_logs 모두 없으면 종료
      if (userIds.length === 0 && partnerIdsInTransactions.length === 0 && !hasPartnerBalanceLogsData) {
        // ✅ 데이터 로드 중에는 기존 데이터 유지 (깜박임 방지)
        // setTransactions([])를 호출하지 않음
        setStats({ totalDeposit: 0, totalWithdrawal: 0, pendingDepositCount: 0, pendingWithdrawalCount: 0 });
        if (!isInitial) setRefreshing(false);
        return;
      }
      
      const processedByIds = [...new Set(transactionsData.map(t => t.processed_by).filter(Boolean))];
      
      // 🔥 Lv3+: partnerTransactionsData의 모든 from/to_partner_id 수집
      const partnerTransactionPartnerIds = [...new Set([
        ...partnerTransactionsData.map(t => t.from_partner_id).filter(Boolean),
        ...partnerTransactionsData.map(t => t.to_partner_id).filter(Boolean),
        ...partnerTransactionsData.map(t => t.processed_by).filter(Boolean)
      ])];
      
      const [usersInfoResult, partnersInfoResult, transactionPartnersResult, partnerTransactionPartnersResult] = await Promise.all([
        userIds.length > 0
          ? supabase.from('users').select('id, nickname, username, balance, bank_name, bank_account, bank_holder, referrer_id').in('id', userIds)
          : Promise.resolve({ data: [], error: null }),
        processedByIds.length > 0 
          ? supabase.from('partners').select('id, nickname, level').in('id', processedByIds)
          : Promise.resolve({ data: [], error: null }),
        partnerIdsInTransactions.length > 0
          ? supabase.from('partners').select('id, nickname, username, level').in('id', partnerIdsInTransactions)
          : Promise.resolve({ data: [], error: null }),
        partnerTransactionPartnerIds.length > 0
          ? supabase.from('partners').select('id, nickname, username, level').in('id', partnerTransactionPartnerIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      
      const usersInfo = usersInfoResult.data || [];
      const partnersInfo = partnersInfoResult.data || [];
      const transactionPartnersInfo = transactionPartnersResult.data || [];
      const partnerTransactionPartnersInfo = partnerTransactionPartnersResult.data || [];  // 🔥 Lv3+: from/to_partner_id 정보
      
      // 🔥 partnerInfoMap 업데이트: from/to_partner_id 정보 추가
      (partnerTransactionPartnersInfo || []).forEach((p: any) => {
        partnerInfoMap.set(p.id, p);
      });
      
      // ⚡ 5단계: referrer 정보 조회
      const referrerIds = [...new Set(usersInfo.map(u => u.referrer_id).filter(Boolean))];
      const referrersResult = referrerIds.length > 0
        ? await supabase.from('partners').select('id, nickname, username, level').in('id', referrerIds)
        : { data: [], error: null };
      
      // ⚡ 6단계: Map 생성 및 데이터 병합 (클라이언트 사이드)
      const usersMap = new Map(usersInfo.map(u => [u.id, u]));
      const referrersMap = new Map((referrersResult.data || []).map(p => [p.id, p]));
      const partnersMap = new Map(partnersInfo.map(p => [p.id, p]));
      const transactionPartnersMap = new Map(transactionPartnersInfo.map(p => [p.id, p]));

      const transactionsWithRelations = transactionsData.map(t => {
        const userInfo = t.user_id ? usersMap.get(t.user_id) : null;
        const partnerInfo = t.partner_id ? transactionPartnersMap.get(t.partner_id) : null;
        const processedByInfo = t.processed_by ? partnersMap.get(t.processed_by) : null;
        return {
          ...t,
          user: userInfo ? {
            ...userInfo,
            referrer: userInfo.referrer_id ? referrersMap.get(userInfo.referrer_id) : null
          } : null,
          partner: partnerInfo,
          // ✅ processed_by_username 및 processed_by_nickname 추가
          processed_by_username: t.processed_by_username || (processedByInfo?.username) || '',
          processed_by_nickname: processedByInfo?.nickname || '',
          processed_partner: processedByInfo || null
        };
      });

      console.log('🔍 [setTransactions 호출 전]:', {
        transactionsWithRelations_len: transactionsWithRelations.length,
        sample: transactionsWithRelations.slice(0, 1)
      });

      console.log('🔍 [transactionsData 상세 정보]:', {
        len: transactionsData.length,
        detail: transactionsData.map(t => ({
          id: t.id,
          type: t.transaction_type,
          is_from_lv2: t.is_from_lv2,
          from_partner_id: t.from_partner_id,
          to_partner_id: t.to_partner_id,
          partner_id: t.partner_id,
          user_id: t.user_id,
          is_from_partner_balance_logs: t.is_from_partner_balance_logs,
          amount: t.amount
        })),
        userLevel: user.level,
        userId: user.id
      });
      
      // pblQ2만 상세 확인
      const pblQ2Records = transactionsData.filter(t => t.is_from_lv2);
      console.log('🔍 [pblQ2 상세 검증]:', {
        count: pblQ2Records.length,
        currentUserId: user.id,
        detail: pblQ2Records.map(t => ({
          type: t.transaction_type,
          from: t.from_partner_id,
          to: t.to_partner_id,
          partner_id: t.partner_id,
          isSending: t.from_partner_id === user.id ? 'YES(보낸거)' : 'NO',
          isReceiving: t.to_partner_id === user.id ? 'YES(받은거)' : 'NO'
        }))
      });

      setTransactions(transactionsWithRelations);
      
      // 🔍 state 업데이트 확인용 (다음 렌더링에서 확인할 수 있도록 setTimeout으로 감쌈)
      setTimeout(() => {
        console.log('🔍 [setTransactions 호출 후 - state 확인]:', transactionsWithRelations.length);
      }, 0);

      // 통계 계산 - transactions + partner_balance_logs + point_transactions 모두 포함
      // ✅ 날짜 범위 필터 적용
      const dateRangeStart = new Date(dateRange.start);
      const dateRangeEnd = new Date(dateRange.end);
      
      // ✅ transactionTypeFilter에 따른 필터링 헬퍼 함수
      const shouldIncludeInStats = (type: string, source: 'transaction' | 'partner' | 'point') => {
        if (transactionTypeFilter === 'all') return true;
        
        // 사용자 입금: 사용자 요청 + 관리자 강제 입금
        if (transactionTypeFilter === 'user_deposit') {
          return source === 'transaction' && (type === 'deposit' || type === 'admin_deposit');
        }
        
        // 사용자 출금: 사용자 요청 + 관리자 강제 출금
        if (transactionTypeFilter === 'user_withdrawal') {
          return source === 'transaction' && (type === 'withdrawal' || type === 'admin_withdrawal');
        }
        
        // 관리자 입금: 파트너 요청 + 파트너 처리
        if (transactionTypeFilter === 'admin_deposit') {
          return (source === 'transaction' && type === 'partner_deposit') ||
                 (source === 'partner' && type === 'deposit');
        }
        
        // 관리자 출금: 파트너 요청 + 파트너 처리
        if (transactionTypeFilter === 'admin_withdrawal') {
          return (source === 'transaction' && type === 'partner_withdrawal') ||
                 (source === 'partner' && type === 'withdrawal');
        }
        
        // 포인트 지급 (point_transactions의 earn 양수)
        if (transactionTypeFilter === 'point_give') {
          return source === 'point' && type === 'earn';
        }
        
        // 포인트 회수 (point_transactions의 use 음수)
        if (transactionTypeFilter === 'point_recover') {
          return source === 'point' && type === 'use';
        }
        
        return false;
      };
      
      // 1️⃣ transactions 테이블에서 입출금 집계 (클라이언트 날짜 필터 추가)
      const transactionDepositSum = transactionsData
        .filter(t => {
          if (t.status !== 'completed') return false;
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          const type = t.transaction_type;
          const inDateRange = createdAt >= dateRangeStart && createdAt <= dateRangeEnd;
          if (type === 'deposit') return inDateRange && shouldIncludeInStats('deposit', 'transaction');
          if (type === 'admin_deposit' || type === 'partner_deposit') return inDateRange && shouldIncludeInStats(type, 'transaction');
          return false;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      const transactionWithdrawalSum = transactionsData
        .filter(t => {
          if (t.status !== 'completed') return false;
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          const type = t.transaction_type;
          const inDateRange = createdAt >= dateRangeStart && createdAt <= dateRangeEnd;
          if (type === 'withdrawal') return inDateRange && shouldIncludeInStats('withdrawal', 'transaction');
          if (type === 'admin_withdrawal' || type === 'partner_withdrawal') return inDateRange && shouldIncludeInStats(type, 'transaction');
          return false;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      // 2️⃣ partner_balance_logs 테이블에서 입출금 집계 (클라이언트 날짜 필터 추가)
      // 🔥 completed-history 탭에서는 제외 (이미 transactionsData에 포함됨)
      const partnerDepositSum = (activeTab !== 'completed-history' ? partnerTransactionsData : [])
        .filter(t => {
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          return t.transaction_type === 'deposit' && 
                 createdAt >= dateRangeStart && 
                 createdAt <= dateRangeEnd &&
                 shouldIncludeInStats('deposit', 'partner');
        })
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      const partnerWithdrawalSum = (activeTab !== 'completed-history' ? partnerTransactionsData : [])
        .filter(t => {
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          return t.transaction_type === 'withdrawal' && 
                 createdAt >= dateRangeStart && 
                 createdAt <= dateRangeEnd &&
                 shouldIncludeInStats('withdrawal', 'partner');
        })
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      // 3️⃣ point_transactions 테이블에서 입출금 집계 (클라이언트 날짜 필터 추가)
      const pointDepositSum = pointTransactionsData
        .filter(t => {
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          // 포인트 지급: earn 타입 (양수)
          return t.transaction_type === 'earn' && 
                 createdAt >= dateRangeStart && 
                 createdAt <= dateRangeEnd &&
                 shouldIncludeInStats(t.transaction_type, 'point');
        })
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      const pointWithdrawalSum = pointTransactionsData
        .filter(t => {
          if (!t.created_at) return false;
          const createdAt = new Date(t.created_at);
          // 포인트 회수: use 타입 (음수)
          return t.transaction_type === 'use' && 
                 createdAt >= dateRangeStart && 
                 createdAt <= dateRangeEnd &&
                 shouldIncludeInStats(t.transaction_type, 'point');
        })
        .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
      
      // 4️⃣ 전체 합산
      const totalDepositSum = transactionDepositSum + partnerDepositSum + pointDepositSum;
      const totalWithdrawalSum = transactionWithdrawalSum + partnerWithdrawalSum + pointWithdrawalSum; // ✅ 음수 그대로 사용
      
      // 대기 중인 입금 신청 (사용자 + 관리자)
      const pendingDeposits = transactionsData.filter(t => 
        (t.transaction_type === 'deposit' || t.transaction_type === 'partner_deposit') && 
        t.status === 'pending'
      );
      
      // 대기 중인 출금 신청 (사용자 + 관리자)
      const pendingWithdrawals = transactionsData.filter(t => 
        (t.transaction_type === 'withdrawal' || t.transaction_type === 'partner_withdrawal') && 
        t.status === 'pending'
      );

      console.log('📊 통계 계산 (3개 테이블 통합):', {
        transactions: { deposit: transactionDepositSum, withdrawal: transactionWithdrawalSum },
        partnerLogs: { deposit: partnerDepositSum, withdrawal: partnerWithdrawalSum },
        pointTransactions: { deposit: pointDepositSum, withdrawal: pointWithdrawalSum },
        total: { deposit: totalDepositSum, withdrawal: totalWithdrawalSum },
        pending: { deposits: pendingDeposits.length, withdrawals: pendingWithdrawals.length }
      });

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
    // 서버 시간(UTC)을 기준으로 KST 시간 계산
    const now = new Date();
    
    // KST = UTC + 9시간
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstTime = new Date(now.getTime() + kstOffset);
    
    // UTC 기준 오늘의 시작 (KST 자정)
    const kstToday = new Date(kstTime);
    kstToday.setUTCHours(0, 0, 0, 0);
    kstToday.setTime(kstToday.getTime() - kstOffset);  // UTC로 변환
    
    // UTC 기준 오늘의 끝 (KST 23:59:59.999)
    const kstTodayEnd = new Date(kstTime);
    kstTodayEnd.setUTCHours(23, 59, 59, 999);
    kstTodayEnd.setTime(kstTodayEnd.getTime() - kstOffset);  // UTC로 변환
    
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
        yesterday.setDate(yesterday.getUTCDate() - 1);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setUTCHours(23, 59, 59, 999);
        return { 
          start: yesterday.toISOString(), 
          end: yesterdayEnd.toISOString() 
        };
      case 'week':
        const weekStart = new Date(kstToday);
        weekStart.setDate(weekStart.getUTCDate() - 7);
        return { 
          start: weekStart.toISOString(), 
          end: kstTodayEnd.toISOString() 
        };
      case 'month':
        const monthStart = new Date(kstToday);
        monthStart.setDate(monthStart.getUTCDate() - 30);
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

  // 필터 변경 시 데이터 재로드 (non-blocking)
  // ✅ activeTab도 의존성에 포함 (탭별로 다른 상태 데이터 로드 필요)
  useEffect(() => {
    if (!initialLoading) {
      // 즉시 반응하기 위해 백그라운드에서 로드
      setRefreshing(true);
      // 스크롤 위치 저장
      const scrollY = window.scrollY;
      
      // setTimeout으로 다음 렌더링 사이클에서 실행
      const timer = setTimeout(() => {
        loadData(false);
        // 로드 완료 후 스크롤 복원 (테이블이 새로 그려진 후)
        setTimeout(() => {
          window.scrollTo(0, scrollY);
        }, 100);
      }, 50); // 부자연스러운 깜빡임 방지
      
      return () => clearTimeout(timer);
    }
  }, [periodFilter, reloadTrigger, activeTab]);



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
        
        // ✅ 관리자 입출금 신청 승인 처리 (partner_deposit_request, partner_withdrawal_request)
        if (transaction.transaction_type === 'partner_deposit_request' || transaction.transaction_type === 'partner_withdrawal_request') {
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
          if (transaction.transaction_type === 'partner_deposit') {
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
          if (transaction.transaction_type === 'partner_withdrawal_request') {
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
        
        // 입금 승인: 이미 위에서 보유금 처리됨, 별도 로직 불필요 ✅
        if (transaction.transaction_type === 'deposit') {
          console.log('✅ 입금 승인 처리 완료:', { amount });
        }
        
        // 출금 승인: 이미 위에서 보유금 처리됨, 별도 로직 불필요 ✅
        if (transaction.transaction_type === 'withdrawal') {
          console.log('✅ 출금 승인 처리 완료:', { amount });
        }
      }

      // ✅ from_partner_id, to_partner_id 계산
      const getFromToPartnerIds = () => {
        // ✅ 사용자 입출금: from/to_partner_id는 NULL (사용자 거래는 파트너 ID를 저장하지 않음)
        if (transaction.transaction_type === 'deposit' || transaction.transaction_type === 'withdrawal') {
          return { from_partner_id: null, to_partner_id: null };
        } else if (transaction.transaction_type === 'partner_deposit_request' || transaction.transaction_type === 'partner_withdrawal_request') {
          // ✅ 파트너 요청 거래: 기존 값 유지 (AdminHeader에서 이미 제대로 설정됨)
          return { 
            from_partner_id: (transaction as any).from_partner_id,
            to_partner_id: (transaction as any).to_partner_id
          };
        } else if (transaction.transaction_type === 'partner_deposit') {
          // ✅ 파트너 입금: 신청자(파트너)가 받는사람
          const partnerId = (transaction as any).partner_id;
          return { from_partner_id: user.id, to_partner_id: partnerId };
        } else if (transaction.transaction_type === 'partner_withdrawal') {
          // ✅ 파트너 출금: 신청자(파트너)가 보낸사람
          const partnerId = (transaction as any).partner_id;
          return { from_partner_id: partnerId, to_partner_id: user.id };
        }
        return { from_partner_id: null, to_partner_id: null };
      };
      const { from_partner_id, to_partner_id } = getFromToPartnerIds();

      // ✅ balance_before, balance_after 계산 (실시간 최신 값 사용)
      let balanceBefore = null;
      let balanceAfter = null;

      // user_id 거래인 경우
      if (transaction.user_id) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('balance')
          .eq('id', transaction.user_id)
          .single();
        
        if (userError) {
          console.warn('⚠️ 사용자 정보 조회 실패, 기존 값 사용:', userError);
          balanceBefore = parseFloat(transaction.balance_before?.toString() || '0');
        } else {
          balanceBefore = parseFloat(userData?.balance?.toString() || '0');
        }
        
        // 거래 처리에 따른 balance_after 계산
        if (action === 'approve') {
          if (transaction.transaction_type === 'deposit') {
            balanceAfter = balanceBefore + amount;
          } else if (transaction.transaction_type === 'withdrawal') {
            balanceAfter = balanceBefore - amount;
          } else {
            balanceAfter = balanceBefore;
          }
        } else {
          // rejected 상태: balance_after = balance_before (변화 없음)
          balanceAfter = balanceBefore;
        }

        console.log('✅ [사용자 balance 계산]:', {
          user_id: transaction.user_id,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          amount,
          transaction_type: transaction.transaction_type
        });
      }
      // partner_id 거래인 경우
      else if (transaction.partner_id) {
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('balance')
          .eq('id', transaction.partner_id)
          .single();
        
        if (partnerError) {
          console.warn('⚠️ 파트너 정보 조회 실패, 기존 값 사용:', partnerError);
          balanceBefore = parseFloat(transaction.balance_before?.toString() || '0');
        } else {
          balanceBefore = parseFloat(partnerData?.balance?.toString() || '0');
        }
        
        console.log('🔍 [파트너 balance 계산 전]:', {
          transaction_type: transaction.transaction_type,
          partner_id: transaction.partner_id,
          balance_before: balanceBefore,
          transaction_balance_before: parseFloat(transaction.balance_before?.toString() || '0'),
          amount,
          action
        });
        
        // 거래 처리에 따른 balance_after 계산
        if (action === 'approve') {
          if (transaction.transaction_type === 'partner_deposit' || transaction.transaction_type === 'partner_deposit_request') {
            balanceAfter = balanceBefore + amount;
          } else if (transaction.transaction_type === 'partner_withdrawal' || transaction.transaction_type === 'partner_withdrawal_request') {
            balanceAfter = balanceBefore - amount;
          } else {
            balanceAfter = balanceBefore;
          }
        } else {
          // rejected 상태: balance_after = balance_before (변화 없음)
          balanceAfter = balanceBefore;
        }

        console.log('✅ [파트너 balance 계산]:', {
          partner_id: transaction.partner_id,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          amount,
          transaction_type: transaction.transaction_type
        });
      }

      // ⭐ 출금 승인 전에 잔고 확인 (transaction update 전에)
      let preApprovedPartnerBalance = null;
      if (action === 'approve' && transaction.partner_id && 
          (transaction.transaction_type === 'partner_withdrawal' || transaction.transaction_type === 'partner_withdrawal_request')) {
        const { data: requestPartnerData, error: requestPartnerError } = await supabase
          .from('partners')
          .select('balance, username, nickname')
          .eq('id', transaction.partner_id)
          .single();

        if (requestPartnerError || !requestPartnerData) {
          throw new Error('신청자 정보를 조회할 수 없습니다.');
        }

        const currentBalance = parseFloat(requestPartnerData.balance?.toString() || '0');
        const newBalance = currentBalance - amount;
        
        // 부동소수점 오류 허용 (±0.01원)
        if (newBalance < -0.01) {
          throw new Error(`❌ 잔고 부족: 현재 보유금 ${currentBalance.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원에서 ${amount.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원을 출금할 수 없습니다.`);
        }
        
        preApprovedPartnerBalance = requestPartnerData;
      }

      // DB 상태 업데이트
      const updateData: any = {
        status: action === 'approve' ? 'completed' : 'rejected',
        processed_by: user.id,
        processed_at: new Date().toISOString(),
        memo: memo || transaction.memo,  // ✅ 승인/거절 모두 사용자가 입력한 메모 저장
        balance_before: balanceBefore
      };

      // ✅ partner_deposit_request/partner_withdrawal_request는 DB에서 balance_after 계산
      // 다른 거래는 프론트에서 계산한 값 사용
      if (transaction.transaction_type !== 'partner_deposit_request' && transaction.transaction_type !== 'partner_withdrawal_request') {
        updateData.balance_after = balanceAfter;
      }

      const { error } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transaction.id);

      if (error) throw error;

      // ✅ 승인인 경우: 처리 로직 (파트너 출입금 처리)
      if (action === 'approve') {
        const now = new Date().toISOString();
        
        // ✅ 파트너 입출금 신청 처리
        if (transaction.transaction_type === 'partner_deposit' || transaction.transaction_type === 'partner_withdrawal' || transaction.transaction_type === 'partner_deposit_request' || transaction.transaction_type === 'partner_withdrawal_request') {
          const requestPartnerId = (transaction as any).partner_id;
          
          // 신청자 현재 보유금 조회 (이미 위에서 조회했으면 사용)
          let requestPartnerData = preApprovedPartnerBalance;
          if (!requestPartnerData) {
            const { data: queryData, error: queryError } = await supabase
              .from('partners')
              .select('balance, username, nickname')
              .eq('id', requestPartnerId)
              .single();

            if (queryError || !queryData) {
              throw new Error('신청자 정보를 조회할 수 없습니다.');
            }
            requestPartnerData = queryData;
          }

          const currentBalance = parseFloat(requestPartnerData.balance?.toString() || '0');
          let newBalance = currentBalance;

          if (transaction.transaction_type === 'partner_deposit' || transaction.transaction_type === 'partner_deposit_request') {
            // 입금: 신청자 보유금 증가
            newBalance = currentBalance + amount;
          } else if (transaction.transaction_type === 'partner_withdrawal' || transaction.transaction_type === 'partner_withdrawal_request') {
            // 출금: 신청자 보유금 차감 (이미 위에서 잔고 확인했으므로 안전)
            newBalance = currentBalance - amount;
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

          if (transaction.transaction_type === 'partner_deposit' || transaction.transaction_type === 'partner_deposit_request') {
            // 입금 승인: 본사 보유금 차감
            newApproverBalance = currentApproverBalance - amount;
          } else if (transaction.transaction_type === 'partner_withdrawal' || transaction.transaction_type === 'partner_withdrawal_request') {
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

          // ✅ DB 트리거가 자동으로 balance_after를 계산하므로 수동 설정 불필요
          // transactions UPDATE 시 BEFORE UPDATE 트리거가 작동하여 balance_after 재계산

          // ✅ partner_deposit_request/partner_withdrawal_request는 transactions 테이블에만 기록
          // partner_balance_logs에는 기록하지 않음 (중복 방지)
          
          // 로그 기록: partner_deposit/partner_withdrawal (승인자가 Lv1/Lv2가 아닌 경우만)
          if (user.level !== 2 && 
              (transaction.transaction_type === 'partner_deposit' || transaction.transaction_type === 'partner_withdrawal')) {
            await supabase.from('partner_balance_logs').insert([
              {
                partner_id: requestPartnerId,
                balance_before: currentBalance,
                balance_after: newBalance,
                amount: (transaction.transaction_type === 'partner_deposit') ? amount : -amount,
                transaction_type: (transaction.transaction_type === 'partner_deposit') ? 'deposit' : 'withdrawal',
                from_partner_id: (transaction.transaction_type === 'partner_deposit') ? user.id : requestPartnerId,
                to_partner_id: (transaction.transaction_type === 'partner_deposit') ? requestPartnerId : user.id,
                processed_by_username: user.username,
                memo: `관리자 ${(transaction.transaction_type === 'partner_deposit') ? '입금' : '출금'} 승인 (승인자: ${user.username})`,
                created_at: new Date().toISOString()
              }
            ]);
          }
          
          // ✅ partner_deposit_request/partner_withdrawal_request는 새로운 거래 생성 없이 상태만 변경
        }
        // ✅ 사용자 입출금 처리
        else if (transaction.transaction_type === 'deposit' || transaction.transaction_type === 'withdrawal') {
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
        if (transaction.transaction_type === 'deposit') {
          newBalance = currentBalance + amount;
        } else if (transaction.transaction_type === 'withdrawal') {
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
        if (transaction.transaction_type === 'deposit') {
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

          // ✅ 사용자 거래는 partner_balance_logs에 기록하지 않음 (파트너 거래 로그 테이블이므로)

        } else if (transaction.transaction_type === 'withdrawal') {
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

          // ✅ 사용자 거래는 partner_balance_logs에 기록하지 않음 (파트너 거래 로그 테이블이므로)
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

      // ⭐ 승인인 경우 balance 동기화
      if (action === 'approve') {
        console.log('💰 [TransactionManagement] 승인 후 balance 동기화 시작');
        setTimeout(async () => {
          try {
            await syncBalance();
            console.log('✅ [TransactionManagement] balance 동기화 완료');
          } catch (err) {
            console.error('❌ [TransactionManagement] balance 동기화 실패:', err);
          }
        }, 300); // 0.3초 후 동기화 (DB 업데이트 완료 대기)
      }
      
      // ✅ 로컬 상태에서 해당 거래 제거 (즉시 UI 업데이트)
      setTransactions(prevTransactions => 
        prevTransactions.filter(t => t.id !== transaction.id)
      );
      
      // ✅ 데이터 강제 새로고침 (Realtime 이벤트가 없을 경우 대비)
      setTimeout(() => {
        loadData(false);
      }, 500);
      
      // ✅ 거래 처리 완료 후 전체입출금내역 탭으로 이동
      setActionDialog({ open: false, transaction: null, action: 'approve', memo: '' });
      setActiveTab('completed-history');
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
      // TODO: withdrawBalance API 호출 구현 필요
      // apiResult = await withdrawBalance(...);
    }

    // API 응답에서 balance_after 파싱 (리소스 재사용: extractBalanceFromResponse 사용)
    const balanceAfter = extractBalanceFromResponse(apiResult.data, selectedUser.username);
    console.log('💰 실제 잔고:', balanceAfter);

    // 거래 기록 생성 (관리자 강제 입출금 타입 사용)
    const now = new Date().toISOString();
    const transactionId = crypto.randomUUID();
    
    // 회원의 소속 파트너 ID (직접 상위)
    const referrerPartnerId = selectedUser.referrer_id;
    console.log('📌 회원의 소속 파트너 ID:', referrerPartnerId);
    
    // Lv2 ID 찾기: referrer에서 시작해서 Lv2까지 탐색
    let lv2PartnerId = null;
    let currentPartnerId = referrerPartnerId;
    
    for (let i = 0; i < 10; i++) {  // 무한 루프 방지 (최대 10단계)
      if (!currentPartnerId) break;
      
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, level, parent_id')
        .eq('id', currentPartnerId)
        .single();
      
      if (partnerError) {
        console.warn(`⚠️ 파트너 조회 실패 (${currentPartnerId}):`, partnerError);
        break;
      }
      
      if (partner?.level === 2) {
        lv2PartnerId = partner.id;
        console.log('✅ Lv2 ID 찾음:', lv2PartnerId);
        break;
      }
      
      currentPartnerId = partner?.parent_id;
    }
    
    // 거래 기록: 이제는 저장하지 않음 (partner_balance_logs에 자동 생성되는 것을 방지)
    // admin_deposit/admin_withdrawal은 회원 거래이므로 기록할 필요 없음
    // (관리자 파트너 잔고만 업데이트하면 됨)

    // 사용자 잔고 업데이트 (users 테이블)
    const newUserBalance = type === 'deposit' ? balanceAfter : balanceAfter;
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        balance: newUserBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (userUpdateError) throw userUpdateError;
    console.log('✅ 사용자 잔고 업데이트:', { userId, balance: newUserBalance });

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
          console.log('🔄 [Realtime] 거래 변경 감지 - Event Type:', payload.eventType, 'ID:', payload.new?.id || payload.old?.id, 'Status:', payload.new?.status);
          
          // ✅ UPDATE 이벤트인 경우만 처리 (상태 변경)
          if (payload.eventType === 'UPDATE') {
            const transactionId = payload.new?.id;
            const oldStatus = payload.old?.status;
            const newStatus = payload.new?.status;
            
            console.log('✅ [Realtime UPDATE] ID:', transactionId, 'Old Status:', oldStatus, 'New Status:', newStatus);
            
            // pending → completed/rejected 상태 변경시 로컬 상태 제거
            if ((oldStatus === 'pending') && (newStatus === 'completed' || newStatus === 'rejected')) {
              console.log('✅✅ [Realtime] 거래 즉시 제거:', transactionId);
              setTransactions(prevTransactions => {
                const filtered = prevTransactions.filter(t => t.id !== transactionId);
                console.log('📊 거래 제거 후 남은 개수:', filtered.length);
                return filtered;
              });
              return;
            }
          }
          
          // 그 외의 경우 전체 리로드
          console.log('🔄 [Realtime] 전체 리로드 트리거');
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        console.log('📡 [Realtime] Transactions 구독 상태:', status);
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
  // 거래 타입을 한국어 거래명으로 변환
  const getTransactionDisplayName = (transaction: any): string => {
    const type = transaction.transaction_type;
    
    if (type === 'deposit') return '온라인 입금신청';
    if (type === 'withdrawal') return '온라인 출금신청';
    if (type === 'admin_deposit') return '수동 입금';
    if (type === 'admin_withdrawal') return '수동 출금';
    if (type === 'admin_deposit_send') return '수동 입금';
    if (type === 'admin_withdrawal_send') return '수동 출금';
    if (type === 'partner_deposit_request') return '온라인 입금신청';
    if (type === 'partner_withdrawal_request') return '온라인 출금신청';
    if (type === 'partner_deposit') return '파트너 입금';
    if (type === 'partner_withdrawal') return '파트너 출금';
    if (transaction.is_point_transaction) {
      if (type === 'earn') return '포인트 지급';
      if (type === 'use') return '포인트 회수';
    }
    return type;
  };

  // 필터 버튼 값을 한국어 거래명으로 변환
  const getFilterDisplayName = (filterValue: string): string => {
    if (filterValue === 'all') return '전체';
    if (filterValue === 'admin_request_deposit') return '온라인 입금신청';
    if (filterValue === 'admin_request_withdrawal') return '온라인 출금신청';
    if (filterValue === 'manual_deposit') return '수동 입금';
    if (filterValue === 'manual_withdrawal') return '수동 출금';
    if (filterValue === 'partner_deposit') return '파트너 입금';
    if (filterValue === 'partner_withdrawal') return '파트너 출금';
    if (filterValue === 'point_give') return '포인트 지급';
    if (filterValue === 'point_recover') return '포인트 회수';
    return filterValue;
  };

  const filterBySearch = (t: any) => {
    const searchLower = searchTerm.toLowerCase();
    
    // 파트너 거래 (partner_balance_logs): from_partner_nickname 또는 to_partner_nickname으로 검색
    if (t.is_from_partner_balance_logs) {
      return searchTerm === '' || 
        String(t.from_partner_nickname || '').toLowerCase().includes(searchLower) ||
        String(t.to_partner_nickname || '').toLowerCase().includes(searchLower);
    }
    // 포인트 거래는 user_nickname으로 검색
    if (t.is_point_transaction) {
      return searchTerm === '' || String(t.user_nickname || '').toLowerCase().includes(searchLower);
    }
    // 관리자 입출금 신청은 partner 정보로 검색
    if (t.transaction_type === 'partner_deposit' || t.transaction_type === 'partner_withdrawal') {
      return searchTerm === '' || String(t.partner?.nickname || '').toLowerCase().includes(searchLower);
    }
    // 사용자 입출금 신청은 user 정보로 검색
    return searchTerm === '' || String(t.user?.nickname || '').toLowerCase().includes(searchLower);
  };

  const depositRequests = transactions.filter(t => {
    const isRelevantType = t.transaction_type === 'deposit' || t.transaction_type === 'partner_deposit_request';
    // Lv3+는 pending + rejected 모두 봄, Lv1-2는 pending만 봄
    const isRelevantStatus = user.level > 2 
      ? (t.status === 'pending' || t.status === 'rejected')
      : (t.status === 'pending');
    return isRelevantType && isRelevantStatus && filterBySearch(t);
  });

  const withdrawalRequests = transactions.filter(t => {
    const isRelevantType = t.transaction_type === 'withdrawal' || t.transaction_type === 'partner_withdrawal_request';
    // Lv3+는 pending + rejected 모두 봄, Lv1-2는 pending만 봄
    const isRelevantStatus = user.level > 2 
      ? (t.status === 'pending' || t.status === 'rejected')
      : (t.status === 'pending');
    return isRelevantType && isRelevantStatus && filterBySearch(t);
  });

  // 디버깅 로그
  if (activeTab === 'deposit-request') {
    console.log('📥 [Deposit Request Tab] 입금신청 데이터:', {
      total_transactions: transactions.length,
      deposit_requests_count: depositRequests.length,
      deposit_requests_data: depositRequests.map(t => ({
        id: t.id,
        type: t.transaction_type,
        status: t.status,
        amount: t.amount,
        user: t.user?.nickname
      }))
    });
  }

  // 전체입출금내역: 사용자 + 관리자 입출금 + 파트너 거래 + 포인트 거래 통합
  const completedTransactions = (() => {
    const dateRange = getDateRange(periodFilter);
    
    console.log('📋 [completedTransactions 계산 전]:', {
      totalTransactions: transactions.length,
      transactionTypes: transactions.map(t => t.transaction_type),
      adminWithdrawalCount: transactions.filter(t => t.transaction_type === 'admin_withdrawal_send').length,
      activeTab,
      periodFilter,
      transactionTypeFilter
    });
    
    // 입출금 거래 필터링
    const filteredTransactions = transactions.filter(t => {
      // ❌ admin_adjustment는 리스트에 표시하지 않음
      if (t.transaction_type === 'admin_adjustment') {
        return false;
      }
      
      // ✅ 날짜 필터 추가 (completedTransactions에서 날짜 범위 필터링)
      const dateMatch = new Date(t.created_at) >= new Date(dateRange.start) && 
                        new Date(t.created_at) <= new Date(dateRange.end);
      
      // ✅ 상태 필터: pending 제외 (completed, rejected만 표시)
      // partner_balance_logs의 레코드는 status 필드가 없으므로 is_from_partner_balance_logs로 구분
      const statusMatch = t.is_from_partner_balance_logs || t.status === 'completed' || t.status === 'rejected';
      const searchMatch = filterBySearch(t);
      
      // 거래 타입 필터 (한국어 거래명으로 비교)
      const typeMatch = (() => {
        if (transactionTypeFilter === 'all') {
          return true; // 전체: 모든 거래 표시
        }
        
        const transactionDisplayName = getTransactionDisplayName(t);
        const filterDisplayName = getFilterDisplayName(transactionTypeFilter);
        
        return transactionDisplayName === filterDisplayName;
      })();
      
      return dateMatch && statusMatch && searchMatch && typeMatch;
    });
    
    console.log('📋 [filteredTransactions 결과]:', {
      beforeFilterCount: transactions.length,
      afterFilterCount: filteredTransactions.length,
      adminWithdrawalBefore: transactions.filter(t => t.transaction_type === 'admin_withdrawal_send').length,
      adminWithdrawalAfter: filteredTransactions.filter(t => t.transaction_type === 'admin_withdrawal_send').length,
      detailedFilter: transactions.map(t => ({
        type: t.transaction_type,
        dateMatch: new Date(t.created_at) >= new Date(dateRange.start) && new Date(t.created_at) <= new Date(dateRange.end),
        statusMatch: t.is_from_partner_balance_logs || t.status === 'completed' || t.status === 'rejected',
        is_from_partner_balance_logs: t.is_from_partner_balance_logs,
        status: t.status
      }))
    });
    
    // 🔥 필터 제거 - 모든 파트너 거래 표시해서 문제 파악
    console.log('🔥 DEBUG mappedPartnerTransactions:', {
      total: partnerTransactions.length,
      sample: partnerTransactions.slice(0, 3).map(pt => ({
        id: pt.id,
        type: pt.transaction_type,
        from_id: pt.from_partner_id,
        from_username: pt.from_partner_username,
        to_id: pt.to_partner_id,
        to_username: pt.to_partner_username,
        user_id: user.id
      })),
      // 🔥 admin_deposit_send와 admin_withdrawal_send 거래만 별도로 로그
      admin_send_types: partnerTransactions.filter(pt => pt.transaction_type === 'admin_deposit_send' || pt.transaction_type === 'admin_withdrawal_send').map(pt => ({
        type: pt.transaction_type,
        from_id: pt.from_partner_id,
        from_username: pt.from_partner_username,
        to_id: pt.to_partner_id,
        to_username: pt.to_partner_username
      }))
    });
    
    const mappedPartnerTransactions = partnerTransactions
      .map(pt => ({
        ...pt,
        status: 'completed',
        user: {
          nickname: pt.partner_nickname,
          username: pt.partner_username
        },
        is_partner_transaction: true
      }));
    
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
            if (transactionTypeFilter === 'all') {
              // 'all' 필터에서는 모든 포인트 거래 표시 (earn, use, convert_to_balance 모두)
              return true;
            }
            if (transactionTypeFilter === 'point_give') {
              // 포인트 지급: earn 타입만
              return pt.transaction_type === 'earn' && pt.amount > 0;
            }
            if (transactionTypeFilter === 'point_recover') {
              // 포인트 회수: use 타입만
              return pt.transaction_type === 'use' && pt.amount < 0;
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
    
    console.log('📋 [completedTransactions 최종]:', {
      filteredTransactions: filteredTransactions.length,
      mappedPartnerTransactions: mappedPartnerTransactions ? mappedPartnerTransactions.length : 0,
      filteredPointTransactions: filteredPointTransactions ? filteredPointTransactions.length : 0,
      total: result.length,
      adminWithdrawalInFinal: result.filter(t => t.transaction_type === 'admin_withdrawal_send').length,
      adminDepositInFinal: result.filter(t => t.transaction_type === 'admin_deposit_send').length,
      // 🔥 모든 to_partner_id 거래 확인
      toPartnerIdTransactions: result.filter(t => t.to_partner_id).map(t => ({
        type: t.transaction_type,
        to_id: t.to_partner_id,
        to_username: t.to_partner_username,
        is_partner_transaction: t.is_partner_transaction,
        is_from_partner_balance_logs: t.is_from_partner_balance_logs
      }))
    });
    
    return result;
  })();
  
  
  // ✅ 관리자 입금 로그만 출력
  const adminDepositTransactions = completedTransactions.filter((t: any) => {
    // transactions 테이블의 partner_deposit
    const isPartnerDepositFromTransactions = t.transaction_type === 'partner_deposit' && !t.is_partner_transaction;
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
        // 온라인 입금/출금 신청 (회원 또는 파트너)
        if (row.transaction_type === 'deposit' || row.transaction_type === 'withdrawal') {
          return (
            <span className="text-purple-400" style={{ fontSize: '15px' }}>
              {row.user ? `${row.user.username}${row.user.nickname ? `[${row.user.nickname}]` : ''}` : '-'}
            </span>
          );
        }
        
        // 파트너 온라인 입금/출금 요청 (Lv3+이 Lv2에게 보냄)
        if (row.transaction_type === 'partner_deposit_request' || row.transaction_type === 'partner_withdrawal_request') {
          return (
            <span className="text-purple-400" style={{ fontSize: '15px' }}>
              {row.partner ? `${row.partner.username}${row.partner.nickname ? `[${row.partner.nickname}]` : ''}` : row.partner_id || '-'}
            </span>
          );
        }
        
        // 포인트 거래
        if (row.is_point_transaction) {
          return (
            <span className="text-purple-400" style={{ fontSize: '15px' }}>
              {row.user_username}
            </span>
          );
        }
        
        // 수동 입출금 (파트너가 회원에게)
        if (row.transaction_type === 'admin_deposit' || row.transaction_type === 'admin_withdrawal') {
          return (
            <span className="text-purple-400" style={{ fontSize: '15px' }}>
              {row.partner_username ? `${row.partner_username}[${row.partner_nickname}]` : '-'}
            </span>
          );
        }
        
        // 기본: 수신 파트너
        return (
          <span className="text-purple-400" style={{ fontSize: '15px' }}>
            {row.to_partner_username || '-'}
          </span>
        );
      }
    },
    // 3. 등급
    {
      header: '등급',
      cell: (row: any) => {
        let level = '-';
        
        // 사용자 거래: 파트너 레벨 표시
        if (row.user?.referrer?.level) {
          const levelMap: any = {
             1: '',
            2: '회원',
            3: '회원',
            4: '회원',
            5: '회원',
            6: '회원'
          };
          level = levelMap[row.user.referrer.level] || `Lv${row.user.referrer.level}`;
        }
        // 파트너 거래: 파트너 레벨 표시
        else if (row.from_partner_level) {
          const levelMap: any = {
            1: '',
            2: '운영사',
            3: '본사',
            4: '부본사',
            5: '총판',
            6: '매장'
          };
          level = levelMap[row.from_partner_level] || `Lv${row.from_partner_level}`;
        }
        // partner_level 필드 직접 확인
        else if (row.partner_level) {
          const levelMap: any = {
            1: '',
            2: '운영사',
            3: '본사',
            4: '부본사',
            5: '총판',
            6: '매장'
          };
          level = levelMap[row.partner_level] || `Lv${row.partner_level}`;
        }
        // 요청 파트너의 레벨 (partner_deposit_request, partner_withdrawal_request)
        else if (row.partner?.level) {
          const levelMap: any = {
            1: '',
            2: '운영사',
            3: '본사',
            4: '부본사',
            5: '총판',
            6: '매장'
          };
          level = levelMap[row.partner.level] || `Lv${row.partner.level}`;
        }
        
        return (
          <span className="text-blue-300" style={{ fontSize: '15px' }}>
            {level}
          </span>
        );
      }
    },
    // 4. 보낸사람
    {
      header: '보낸사람',
      cell: (row: any) => {
        // ✅ 포인트 거래: username[nickname] 형식으로 표시
        if (row.is_point_transaction) {
          return (
            <span className="text-blue-400" style={{ fontSize: '15px' }}>
              {row.from_partner_username ? `${row.from_partner_username}[${row.from_partner_nickname}]` : '-'}
            </span>
          );
        }
        
        // 파트너 거래: to_partner_id 표시 (to 거래내역)
        if (row.is_from_partner_balance_logs) {
          return (
            <span className="text-blue-400" style={{ fontSize: '15px' }}>
              {`${row.to_partner_username || '-'}${row.to_partner_nickname ? `[${row.to_partner_nickname}]` : ''}`}
            </span>
          );
        }
        
        // ✅ partner_deposit_request / partner_withdrawal_request - 운영사(processed_by)
        if (row.transaction_type === 'partner_deposit_request' || row.transaction_type === 'partner_withdrawal_request') {
          return (
            <span className="text-blue-400" style={{ fontSize: '15px' }}>
              {row.processed_by_username || '[운영사]'}
            </span>
          );
        }
        
        // ✅ partner_deposit/partner_withdrawal: 처리자(승인권자)의 username 표시
        if (row.transaction_type === 'partner_deposit' || row.transaction_type === 'partner_withdrawal') {
          return (
            <span className="text-blue-400" style={{ fontSize: '15px' }}>
              {row.processed_by_username || '[운영사]'}
            </span>
          );
        }

        // ✅ 관리자 입금/출금 거래: from_partner_id/to_partner_id 표시
        const isAdminDepositType = row.transaction_type === 'admin_deposit';
        const isAdminWithdrawalType = row.transaction_type === 'admin_withdrawal';
        
        if (isAdminDepositType || isAdminWithdrawalType) {
          // 관리자 입금/출금: 보낸사람 = 담당 파트너
          if (row.user?.referrer) {
            return (
              <span className="text-blue-400" style={{ fontSize: '15px' }}>
                {`[${row.user.referrer.username || ''}]${row.user.referrer.nickname || ''}`}
              </span>
            );
          }
        }

        // 일반 회원 거래에서 소속 표시 (deposit/withdrawal)
        if (row.user?.referrer) {
          return (
            <span className="text-blue-400" style={{ fontSize: '15px' }}>
              {`[${row.user.referrer.username || ''}]${row.user.referrer.nickname || ''}`}
            </span>
          );
        }

        return <span className="text-slate-500" style={{ fontSize: '15px' }}>-</span>;
      }
    },
    // 5. 받는사람
    {
      header: '받는사람',
      cell: (row: any) => {
        // ✅ 포인트 거래: username[nickname] 형식으로 표시
        if (row.is_point_transaction) {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {row.to_partner_username ? `${row.to_partner_username}[${row.to_partner_nickname}]` : '-'}
            </span>
          );
        }
        
        // 🔥 모든 admin_deposit_send/admin_withdrawal_send 거래 디버그
        if (row.transaction_type === 'admin_deposit_send' || row.transaction_type === 'admin_withdrawal_send') {
          console.log(`🔥 [받는사람셀] ${row.transaction_type}:`, {
            to_partner_id: row.to_partner_id,
            to_partner_username: row.to_partner_username,
            to_partner_nickname: row.to_partner_nickname,
            is_from_partner_balance_logs: row.is_from_partner_balance_logs,
            is_partner_transaction: row.is_partner_transaction
          });
        }
        
        // 🔥 우선순위 1: admin_deposit_send/admin_withdrawal_send - 항상 to_partner_username 표시
        if (row.transaction_type === 'admin_deposit_send' || row.transaction_type === 'admin_withdrawal_send') {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {`${row.to_partner_username || '-'}${row.to_partner_nickname ? `[${row.to_partner_nickname}]` : ''}`}
            </span>
          );
        }
        
        // 🔥 우선순위 2: partner_balance_logs의 다른 거래 - to_partner_username 표시
        if (row.is_from_partner_balance_logs) {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {`${row.to_partner_username || '-'}${row.to_partner_nickname ? `[${row.to_partner_nickname}]` : ''}`}
            </span>
          );
        }
        
        // 파트너 거래인 경우 - username 표시
        if (row.is_partner_transaction && row.to_partner_username) {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {row.to_partner_username}
            </span>
          );
        }
        
        // ✅ partner_deposit/partner_withdrawal: 신청인 파트너 표시 (받는사람)
        if (row.transaction_type === 'partner_deposit' || row.transaction_type === 'partner_withdrawal') {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {row.partner?.username || '[신청자]'}
            </span>
          );
        }
        
        // ✅ partner_deposit_request / partner_withdrawal_request - 본사(상위 조직)
        if (row.transaction_type === 'partner_deposit_request' || row.transaction_type === 'partner_withdrawal_request') {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {`${user?.username || '[본사]'}${user?.nickname ? `[${user.nickname}]` : ''}`}
            </span>
          );
        }

        // ✅ 사용자 입금/출금 신청 (deposit/withdrawal) - 신청한 사용자 정보 표시
        if (row.transaction_type === 'deposit' || row.transaction_type === 'withdrawal') {
          // user_id로 users 배열에서 사용자 정보 찾기
          const requestUser = users.find((u: any) => u.id === row.user_id);
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {requestUser 
                ? `${requestUser.username}${requestUser.nickname ? `[${requestUser.nickname}]` : ''}`
                : row.user?.username ? `${row.user.username}${row.user.nickname ? `[${row.user.nickname}]` : ''}` : '-'
              }
            </span>
          );
        }

        // ✅ admin_deposit/admin_withdrawal (강제 입금/출금): 받는 사람 표시
        if (row.transaction_type === 'admin_deposit' || row.transaction_type === 'admin_withdrawal') {
          // to_partner_id를 기준으로 받는사람 결정 (to_partner_id가 user_id인 경우)
          if (row.user?.username) {
            return (
              <span className="text-pink-400" style={{ fontSize: '15px' }}>
                {`[${row.user.username}]${row.user.nickname || ''}`}
              </span>
            );
          }
        }

        // ✅ 관리자 입금/출금 거래: 받는 사람 표시
        const isAdminDepositType = row.transaction_type === 'admin_deposit';
        const isAdminWithdrawalType = row.transaction_type === 'admin_withdrawal';
        
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
                {`[${row.user.referrer.username || ''}]${row.user.referrer.nickname || ''}`}
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
            if (row.from_partner_id === user.id) {
              return <Badge className="bg-pink-600 text-white text-sm px-3 py-1">파트너 환전</Badge>;
            }
            // 현재 사용자가 수신자(to_partner_id)인 경우 → 파트너 충전 (입금)
            if (row.to_partner_id === user.id) {
              return <Badge className="bg-cyan-600 text-white text-sm px-3 py-1">파트너 충전</Badge>;
            }
          }
          
          // 그 외 파트너 거래 타입
          const partnerTypeMap: any = {
            admin_deposit_send: { text: '수동 충전', color: 'bg-cyan-600' },
            admin_deposit_receive: { text: '수동 충전', color: 'bg-cyan-600' },
            admin_withdrawal_send: { text: '수동 환전', color: 'bg-pink-600' },
            admin_withdrawal_receive: { text: '파트너 환전', color: 'bg-pink-600' },
            commission: { text: '파트너수수료', color: 'bg-violet-600' },
            refund: { text: '파트너환급', color: 'bg-sky-600' },
            deposit_to_user: { text: '→회원입금', color: 'bg-teal-600' },
            withdrawal_from_user: { text: '←회원출금', color: 'bg-rose-600' }
          };
          const type = partnerTypeMap[row.transaction_type] || { text: row.transaction_type, color: 'bg-slate-600' };
          return <Badge className={`${type.color} text-white text-sm px-3 py-1`}>{type.text}</Badge>;
        }
        
        // ✅ admin_deposit / admin_withdrawal: Lv1 또는 Lv2이면 수동 충전/수동 환전
        if (row.transaction_type === 'admin_deposit') {
          const fromLevel = row.from_partner_level || 1;
          if (fromLevel === 1 || fromLevel === 2) {
            return <Badge className="bg-cyan-600 text-white text-sm px-3 py-1">수동 충전</Badge>;
          }
        }
        
        if (row.transaction_type === 'admin_withdrawal') {
          const fromLevel = row.from_partner_level || 2;
          if (fromLevel === 1 || fromLevel === 2) {
            return <Badge className="bg-pink-600 text-white text-sm px-3 py-1">수동 환전</Badge>;
          }
        }
        
        const typeMap: any = {
          deposit: { text: '온라인 입금 신청', color: 'bg-emerald-600' },
          withdrawal: { text: '온라인 출금 신청', color: 'bg-orange-600' },
          admin_deposit: { text: '수동 입금', color: 'bg-cyan-600' },
          admin_withdrawal: { text: '수동 출금', color: 'bg-orange-600' },
          partner_deposit_request: { text: '온라인 입금신청', color: 'bg-cyan-600' },
          partner_withdrawal_request: { text: '온라인 출금신청', color: 'bg-pink-600' },
          point_conversion: { text: '포인트 전환', color: 'bg-purple-600' },
          user_online_withdrawal: { text: '온라인 출금', color: 'bg-orange-600' },
          partner_deposit: { text: '파트너 충전', color: 'bg-cyan-600' },
          partner_withdrawal: { text: '파트너 환전', color: 'bg-pink-600' },
          admin_deposit_send: { text: '수동 충전', color: 'bg-cyan-600' },
          admin_withdrawal_send: { text: '수동 환전', color: 'bg-pink-600' },
          // 포인트 거래 타입
          earn: { text: '포인트획득', color: 'bg-amber-600' },
          use: { text: '포인트사용', color: 'bg-purple-600' },
          convert_to_balance: { text: '머니전환', color: 'bg-blue-600' },
          point_conversion: { text: '포인트전환', color: 'bg-amber-600' },
          commission: { text: '커미션', color: 'bg-violet-600' },
          refund: { text: '환불', color: 'bg-sky-600' }
        };
        
        const type = typeMap[row.transaction_type] || { text: row.transaction_type, color: 'bg-slate-600' };
        return <Badge className={`${type.color} text-white text-sm px-3 py-1`}>{type.text}</Badge>;
      }
    },
    // 6. 보유금 (거래 전 잔액)
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
            <span className="font-asiahead text-cyan-300" style={{ fontSize: '15px' }}>
              {formatNumberOnly(balanceValue)}
            </span>
          );
        }
        
        // 포인트 거래인 경우
        if (row.points_before !== undefined) {
          return (
            <span className="font-asiahead text-amber-300" style={{ fontSize: '15px' }}>
              {row.points_before.toLocaleString()}P
            </span>
          );
        }
        
        // 일반 입출금 거래
        return (
          <span className="font-asiahead text-cyan-300" style={{ fontSize: '15px' }}>
            {formatNumberOnly(parseFloat(row.balance_before?.toString() || '0'))}
          </span>
        );
      },
      className: "text-right"
    },
    // 7. 신청금액
    {
      header: '신청금액',
      cell: (row: any) => {
        // 금액 포맷팅 (원화 표시 없이 숫자만)
        const formatNumberOnly = (num: number) => new Intl.NumberFormat('ko-KR').format(num);
        
        // 파트너 거래인 경우
        if (row.is_partner_transaction) {
          const amount = parseFloat(row.amount?.toString() || '0');
          // admin_withdrawal_send는 DB에서 이미 음수이므로, 마이너스 기호 추가하지 않음
          const shouldShowMinus = (row.transaction_type === 'withdrawal' || 
                                   row.transaction_type === 'partner_withdrawal') && amount > 0;
          const isNegative = row.transaction_type === 'withdrawal' || 
                             row.transaction_type === 'admin_withdrawal_send' ||
                             row.transaction_type === 'partner_withdrawal' ||
                             amount < 0;
          return (
            <span className="font-asiahead font-semibold" style={{ 
              fontSize: '16px',
              color: isNegative ? '#ef4444' : '#4ade80'
            }}>
              {shouldShowMinus && <span style={{ color: '#ef4444' }}>-</span>}
              {formatNumberOnly(Math.abs(amount))}
            </span>
          );
        }
        
        // 포인트 거래인 경우
        if (row.points_before !== undefined) {
          const isNegative = row.amount < 0;
          return (
            <span className="font-asiahead font-semibold" style={{ 
              fontSize: '16px',
              color: isNegative ? '#ef4444' : '#4ade80'
            }}>
              {isNegative && <span style={{ color: '#ef4444' }}>-</span>}
              {Math.abs(row.amount).toLocaleString()}P
            </span>
          );
        }
        
        // 일반 입출금 거래 (온라인입금신청/관리자출금신청/입금/출금)
        const isWithdrawal = row.transaction_type === 'withdrawal' || 
                             row.transaction_type === 'admin_withdrawal' ||
                             row.transaction_type === 'admin_withdrawal_send' ||
                             row.transaction_type === 'partner_withdrawal' ||
                             row.transaction_type === 'partner_withdrawal_request';
        const amount = parseFloat(row.amount.toString());
        return (
          <span className="font-asiahead font-semibold" style={{ 
            fontSize: '16px',
            color: isWithdrawal ? '#ef4444' : '#4ade80'
          }}>
            {isWithdrawal && <span style={{ color: '#ef4444' }}>-</span>}
            {formatNumberOnly(Math.abs(amount))}
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
        
        // 파트너 거래인 경우: Lv2는 총 보유금(4개 지갑 합계), 그 외는 balance_after
        if (row.is_partner_transaction) {
          const balanceValue = row.balance_after_total !== undefined 
            ? row.balance_after_total 
            : parseFloat(row.balance_after?.toString() || '0');
          return (
            <span className="font-asiahead text-purple-400" style={{ fontSize: '15px' }}>
              {formatNumberOnly(balanceValue)}
            </span>
          );
        }
        
        // 포인트 거래인 경우
        if (row.points_after !== undefined) {
          return (
            <span className="font-asiahead text-amber-400" style={{ fontSize: '15px' }}>
              {row.points_after.toLocaleString()}P
            </span>
          );
        }
        
        // 일반 입출금 거래
        return (
          <span className="font-asiahead text-cyan-400" style={{ fontSize: '15px' }}>
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
      }
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

        // ✅ partner_deposit/partner_withdrawal: 승인시 입력한 메모는 항상 표시
        if (row.transaction_type === 'partner_deposit' || row.transaction_type === 'partner_withdrawal') {
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
    // 12. 작업
    ...(showActions ? [{
      header: t.transactionManagement.actions,
      cell: (row: Transaction) => {
        // 디버깅: 거래 타입 및 상태 확인
        console.log('🔍 Transaction Row:', {
          transaction_type: row.transaction_type,
          status: row.status,
          partner_id: (row as any).partner_id,
          user_id: user.id
        });

        // ✅ partner_deposit_request/partner_withdrawal_request 승인 대기 중인 경우
        if ((row.transaction_type === 'partner_deposit_request' || row.transaction_type === 'partner_withdrawal_request') &&
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
            // ✅ 승인 권한이 없는 경우: "취소 버튼 / 승인대기중" 표시
            return (
              <div className="flex items-center gap-2">
                <Button
                  size="default"
                  onClick={() => openActionDialog(row, 'reject')}
                  disabled={refreshing}
                  className="h-10 px-5 text-base bg-red-600 hover:bg-red-700 border-0"
                >
                  취소
                </Button>
                <span className="text-yellow-400 font-semibold text-base">
                  승인대기
                </span>
              </div>
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
        <div onClick={() => setActiveTab('completed-history')} className="cursor-pointer hover:opacity-80 transition-opacity">
          <MetricCard
            title={t.transactionManagement.totalDeposit}
            value={formatCurrency(stats.totalDeposit)}
            subtitle={t.transactionManagement.accumulatedDeposit}
            icon={TrendingUp}
            color="green"
          />
        </div>
        
        <div onClick={() => setActiveTab('completed-history')} className="cursor-pointer hover:opacity-80 transition-opacity">
          <MetricCard
            title={t.transactionManagement.totalWithdrawal}
            value={formatCurrency(stats.totalWithdrawal)}
            subtitle={t.transactionManagement.accumulatedWithdrawal}
            icon={TrendingDown}
            color="red"
          />
        </div>
        
        <div onClick={() => setActiveTab('deposit-request')} className="cursor-pointer hover:opacity-80 transition-opacity">
          <MetricCard
            title={t.transactionManagement.depositRequests}
            value={`${stats.pendingDepositCount}건`}
            subtitle={t.transactionManagement.pendingProcessing}
            icon={Clock}
            color="amber"
          />
        </div>
        
        <div onClick={() => setActiveTab('withdrawal-request')} className="cursor-pointer hover:opacity-80 transition-opacity">
          <MetricCard
            title={t.transactionManagement.withdrawalRequests}
            value={`${stats.pendingWithdrawalCount}건`}
            subtitle={t.transactionManagement.pendingProcessing}
            icon={AlertTriangle}
            color="orange"
          />
        </div>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="glass-card rounded-xl p-5">
        {/* 탭 리스트 */}
        <Tabs value={activeTab} onValueChange={(value) => {
          console.log('📑 [Tab Change] 탭 변경:', { from: activeTab, to: value });
          setActiveTab(value);
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
            <div className="relative">
              <Select value={periodFilter} onValueChange={setPeriodFilter} disabled={refreshing}>
                <SelectTrigger className={cn(
                  "w-[160px] h-11 text-base bg-slate-800/50 border-slate-600 transition-all",
                  refreshing && "opacity-75"
                )}>
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
              {refreshing && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin"></div>
                </div>
              )}
            </div>

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
                  onClick={() => setTransactionTypeFilter('admin_request_deposit')}
                  variant={transactionTypeFilter === 'admin_request_deposit' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'admin_request_deposit' 
                      ? "bg-cyan-500/30 border border-cyan-400/50 hover:bg-cyan-500/40 text-cyan-100 shadow-lg" 
                      : "bg-cyan-500/10 border border-cyan-400/20 hover:bg-cyan-500/20 text-slate-300"
                  )}
                >
                  온라인입금신청
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('admin_request_withdrawal')}
                  variant={transactionTypeFilter === 'admin_request_withdrawal' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'admin_request_withdrawal' 
                      ? "bg-pink-500/30 border border-pink-400/50 hover:bg-pink-500/40 text-pink-100 shadow-lg" 
                      : "bg-pink-500/10 border border-pink-400/20 hover:bg-pink-500/20 text-slate-300"
                  )}
                >
                  온라인출금신청
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('manual_deposit')}
                  variant={transactionTypeFilter === 'manual_deposit' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'manual_deposit' 
                      ? "bg-cyan-500/30 border border-cyan-400/50 hover:bg-cyan-500/40 text-cyan-100 shadow-lg" 
                      : "bg-cyan-500/10 border border-cyan-400/20 hover:bg-cyan-500/20 text-slate-300"
                  )}
                >
                  수동 입금
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('manual_withdrawal')}
                  variant={transactionTypeFilter === 'manual_withdrawal' ? 'default' : 'outline'}
                  className={cn(
                    "h-9 px-4 text-sm font-medium rounded-lg backdrop-blur-md transition-all duration-200",
                    transactionTypeFilter === 'manual_withdrawal' 
                      ? "bg-orange-500/30 border border-orange-400/50 hover:bg-orange-500/40 text-orange-100 shadow-lg" 
                      : "bg-orange-500/10 border border-orange-400/20 hover:bg-orange-500/20 text-slate-300"
                  )}
                >
                  수동 출금
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
              loading={initialLoading || refreshing}
              emptyMessage={t.transactionManagement.noDepositRequests}
            />
          </TabsContent>

          {/* 출금 신청 탭 */}
          <TabsContent value="withdrawal-request" className="compact-table">
            <DataTable
              searchable={false}
              columns={getColumns(true)}
              data={withdrawalRequests}
              loading={initialLoading || refreshing}
              emptyMessage={t.transactionManagement.noWithdrawalRequests}
            />
          </TabsContent>

          {/* 전체입출금내역 탭 (사용자 + 관리자 입출금 통합) */}
          <TabsContent value="completed-history" className="compact-table">
            <DataTable
              searchable={false}
              columns={getColumns(false)}
              data={completedTransactions}
              loading={initialLoading || refreshing}
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
                  <span className="text-white text-lg">{`[${actionDialog.transaction.user?.username || ''}]${actionDialog.transaction.user?.nickname || ''}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-lg">{t.transactionManagement.transactionType}:</span>
                  <span className="text-white text-lg">
                    {actionDialog.transaction.transaction_type === 'deposit' ? t.transactionManagement.deposit : t.transactionManagement.withdrawal}
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