import { useState, useEffect, useCallback } from "react";
import { 
  CreditCard, TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, 
  AlertTriangle, Banknote, Users, Plus, Search, Trash2, RefreshCw, Check, ChevronsUpDown, Gift, MinusCircle
} from "lucide-react";
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

interface TransactionManagementProps {
  user: Partner;
}

export function TransactionManagement({ user }: TransactionManagementProps) {
  const { t, language, formatCurrency } = useLanguage();
  const { lastMessage, sendMessage } = useWebSocketContext();
  const [initialLoading, setInitialLoading] = useState(false); // ⚡ 초기 로딩 제거
  const [refreshing, setRefreshing] = useState(false);
  
  // URL 해시에서 탭 정보 읽기
  const getInitialTab = () => {
    const hash = window.location.hash.substring(1);
    if (hash === 'deposit-request' || hash === 'withdrawal-request' || hash === 'completed-history') {
      return hash;
    }
    return "completed-history";
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  
  // 데이터 상태
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pointTransactions, setPointTransactions] = useState<any[]>([]);
  const [partnerTransactions, setPartnerTransactions] = useState<any[]>([]); // 파트너 거래 추가
  const [users, setUsers] = useState<User[]>([]);
  
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
      
      if (anchorIndex !== -1) {
        const anchor = fullHash.substring(anchorIndex + 1); // deposit-request
        if (anchor === 'deposit-request' || anchor === 'withdrawal-request' || anchor === 'deposit-history' || anchor === 'withdrawal-history') {
          setActiveTab(anchor);
        }
      }
    };

    checkHash(); // 마운트 시 즉시 실행

    const handleHashChange = () => {
      checkHash();
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // ⚡ 데이터 로드 최적화 (병렬 쿼리)
  const loadData = async (isInitial = false) => {
    try {
      if (!isInitial) {
        setRefreshing(true);
      }
      
      const dateRange = getDateRange(periodFilter);
      
      // ⚡ 1단계: 계층 정보를 먼저 조회 (중복 제거)
      let hierarchicalPartners: any[] = [];
      let partnerIds: string[] = [user.id];
      
      if (user.level > 1) {
        const { data } = await supabase.rpc('get_hierarchical_partners', { p_partner_id: user.id });
        hierarchicalPartners = data || [];
        const childPartnerIds = hierarchicalPartners
          .filter((p: any) => p.level > user.level)
          .map((p: any) => p.id);
        partnerIds = [user.id, ...childPartnerIds];
      }
      
      // ⚡ 2단계: 회원 ID 목록 조회
      let targetUserIds: string[] = [];
      
      if (user.level > 1) {
        const { data: userList } = await supabase
          .from('users')
          .select('id')
          .in('referrer_id', partnerIds);
        
        targetUserIds = userList?.map(u => u.id) || [];
        
        if (targetUserIds.length === 0) {
          setTransactions([]);
          setUsers([]);
          setStats({ totalDeposit: 0, totalWithdrawal: 0, pendingDepositCount: 0, pendingWithdrawalCount: 0 });
          return;
        }
      }
      
      // ⚡ 3단계: 거래 데이터 + 포인트 거래 데이터 + 활성 사용자 목록 병렬 조회
      let transactionQuery = supabase
        .from('transactions')
        .select('*')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
        .order('created_at', { ascending: false });
        
      if (user.level > 1 && targetUserIds.length > 0) {
        transactionQuery = transactionQuery.in('user_id', targetUserIds);
      }
      
      // 포인트 거래 조회
      let pointTransactionQuery = supabase
        .from('point_transactions')
        .select('*')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
        .order('created_at', { ascending: false });
        
      if (user.level > 1 && targetUserIds.length > 0) {
        pointTransactionQuery = pointTransactionQuery.in('user_id', targetUserIds);
      }
      
      let userListQuery = supabase
        .from('users')
        .select('id, nickname, username, balance, bank_name, bank_account, bank_holder')
        .eq('status', 'active')
        .order('nickname');
        
      if (user.level > 1) {
        userListQuery = userListQuery.in('referrer_id', partnerIds);
      }
      
      // 파트너 거래 조회 (partner_balance_logs)
      let partnerTransactionQuery = supabase
        .from('partner_balance_logs')
        .select('*')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
        .order('created_at', { ascending: false });
        
      if (user.level > 1) {
        partnerTransactionQuery = partnerTransactionQuery.in('partner_id', partnerIds);
      }
      
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
          ? supabase.from('partners').select('id, nickname, username, level').in('id', allPartnerIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      
      const partnerInfoMap = new Map((partnerInfoResult.data || []).map(p => [p.id, p]));
      
      const processedPartnerTransactions = partnerTransactionsData.map(pt => ({
        ...pt,
        partner_nickname: partnerInfoMap.get(pt.partner_id)?.nickname || '',
        partner_username: partnerInfoMap.get(pt.partner_id)?.username || '',
        from_partner_nickname: partnerInfoMap.get(pt.from_partner_id)?.nickname || '',
        to_partner_nickname: partnerInfoMap.get(pt.to_partner_id)?.nickname || '',
        processed_by_nickname: partnerInfoMap.get(pt.processed_by)?.nickname || ''
      }));
      
      setPartnerTransactions(processedPartnerTransactions);
      
      // ⚡ 4단계: 관련 데이터 배치 조회 (병렬)
      const userIds = [...new Set(transactionsData.map(t => t.user_id).filter(Boolean))];
      
      if (userIds.length === 0) {
        setTransactions([]);
        setStats({ totalDeposit: 0, totalWithdrawal: 0, pendingDepositCount: 0, pendingWithdrawalCount: 0 });
        return;
      }
      
      const processedByIds = [...new Set(transactionsData.map(t => t.processed_by).filter(Boolean))];
      
      const [usersInfoResult, partnersInfoResult] = await Promise.all([
        supabase.from('users').select('id, nickname, username, balance, bank_name, bank_account, bank_holder, referrer_id').in('id', userIds),
        processedByIds.length > 0 
          ? supabase.from('partners').select('id, nickname, level').in('id', processedByIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      
      const usersInfo = usersInfoResult.data || [];
      const partnersInfo = partnersInfoResult.data || [];
      
      // ⚡ 5단계: referrer 정보 조회
      const referrerIds = [...new Set(usersInfo.map(u => u.referrer_id).filter(Boolean))];
      const referrersResult = referrerIds.length > 0
        ? await supabase.from('partners').select('id, nickname, level').in('id', referrerIds)
        : { data: [], error: null };
      
      // ⚡ 6단계: Map 생성 및 데이터 병합 (클라이언트 사이드)
      const usersMap = new Map(usersInfo.map(u => [u.id, u]));
      const referrersMap = new Map((referrersResult.data || []).map(p => [p.id, p]));
      const partnersMap = new Map(partnersInfo.map(p => [p.id, p]));

      const transactionsWithRelations = transactionsData.map(t => {
        const userInfo = t.user_id ? usersMap.get(t.user_id) : null;
        return {
          ...t,
          user: userInfo ? {
            ...userInfo,
            referrer: userInfo.referrer_id ? referrersMap.get(userInfo.referrer_id) : null
          } : null,
          processed_partner: t.processed_by ? partnersMap.get(t.processed_by) : null
        };
      });

      setTransactions(transactionsWithRelations);

      // 통계 계산 - 모든 입출금 타입 포함 (deposit, admin_deposit, withdrawal, admin_withdrawal)
      if (transactionsData) {
        // 입금: deposit + admin_deposit (completed만)
        const depositSum = transactionsData
          .filter(t => 
            (t.transaction_type === 'deposit' || t.transaction_type === 'admin_deposit') && 
            t.status === 'completed'
          )
          .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
        
        // 출금: withdrawal + admin_withdrawal (completed만)
        const withdrawalSum = transactionsData
          .filter(t => 
            (t.transaction_type === 'withdrawal' || t.transaction_type === 'admin_withdrawal') && 
            t.status === 'completed'
          )
          .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
        
        // 대기 중인 입금 신청 (사용자 요청만)
        const pendingDeposits = transactionsData.filter(t => 
          t.transaction_type === 'deposit' && t.status === 'pending'
        );
        
        // 대기 중인 출금 신청 (사용자 요청만)
        const pendingWithdrawals = transactionsData.filter(t => 
          t.transaction_type === 'withdrawal' && t.status === 'pending'
        );

        console.log('📊 통계 계산:', {
          depositSum,
          withdrawalSum,
          depositCount: transactionsData.filter(t => 
            (t.transaction_type === 'deposit' || t.transaction_type === 'admin_deposit') && 
            t.status === 'completed'
          ).length,
          withdrawalCount: transactionsData.filter(t => 
            (t.transaction_type === 'withdrawal' || t.transaction_type === 'admin_withdrawal') && 
            t.status === 'completed'
          ).length
        });

        setStats({
          totalDeposit: depositSum,
          totalWithdrawal: withdrawalSum,
          pendingDepositCount: pendingDeposits.length,
          pendingWithdrawalCount: pendingWithdrawals.length
        });
      }
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

  // 날짜 범위 계산
  const getDateRange = (filter: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (filter) {
      case 'all':
        // 전체: 2020년 1월 1일부터 현재까지
        return { start: '2020-01-01T00:00:00.000Z', end: now.toISOString() };
      case 'today':
        return { start: today.toISOString(), end: now.toISOString() };
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        return { start: weekStart.toISOString(), end: now.toISOString() };
      case 'month':
        const monthStart = new Date(today);
        monthStart.setMonth(today.getMonth() - 1);
        return { start: monthStart.toISOString(), end: now.toISOString() };
      default:
        return { start: today.toISOString(), end: now.toISOString() };
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
          console.log('💰 transactions 테이블 변경 감지:', payload);
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
        console.log('💬 WebSocket 입출금 알림:', lastMessage);
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

      // 승인인 경우 GMS 머니 보유금 확인
      if (action === 'approve') {
        const amount = Math.floor(parseFloat(transaction.amount.toString()));
        
        // 입금 승인: 로그인한 관리자의 보유금 확인 (✅ 상위 권한자 입출금 가능)
        if (transaction.transaction_type === 'deposit') {
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
        if (transaction.transaction_type === 'withdrawal') {
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

      // DB 상태 업데이트
      const { error } = await supabase
        .from('transactions')
        .update({
          status: action === 'approve' ? 'completed' : 'rejected',
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          memo: action === 'reject' ? memo : transaction.memo
        })
        .eq('id', transaction.id);

      if (error) throw error;

      // ✅ 승인인 경우: users 테이블 balance 업데이트 (CRITICAL FIX)
      if (action === 'approve') {
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
        const amount = parseFloat(transaction.amount?.toString() || '0');
        
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

          // 관리자 잔고 변경 로그 기록
          await supabase.from('partner_balance_logs').insert({
            partner_id: responsiblePartnerId,
            balance_before: currentPartnerBalance,
            balance_after: newPartnerBalance,
            amount: -amount,
            transaction_type: 'deposit_to_user',
            processed_by: user.id,
            memo: `회원 ${currentUserData?.username} 입금 승인 (처리자: ${user.username})`
          });

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

          // 관리자 잔고 변경 로그 기록
          await supabase.from('partner_balance_logs').insert({
            partner_id: responsiblePartnerId,
            balance_before: currentPartnerBalance,
            balance_after: newPartnerBalance,
            amount: amount,
            transaction_type: 'withdrawal_from_user',
            processed_by: user.id,
            memo: `회원 ${currentUserData?.username} 출금 승인 (처리자: ${user.username})`
          });
        }
      }

      toast.success(action === 'approve' ? t.transactionManagement.transactionApproved : t.transactionManagement.transactionRejected);
      
      // WebSocket으로 실시간 알림 - 올바른 형식으로 수정
      sendMessage('transaction_processed', { 
        transactionId: transaction.id, 
        action, 
        processedBy: user.nickname,
        userId: transaction.user_id
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
      const amountNum = Math.floor(parseFloat(amount));
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

      console.log('🔑 OPCODE 설정:', {
        opcode: config.opcode,
        token: '***' + config.token.slice(-4),
        secretKey: '***' + config.secretKey.slice(-4)
      });

      // Invest API를 통한 실제 입출금 처리
      let apiResult;
      if (type === 'deposit') {
        console.log('📥 입금 API 호출 중...');
        apiResult = await depositBalance(
          selectedUser.username,
          amountNum,
          config.opcode,
          config.token,
          config.secretKey
        );
      } else {
        console.log('📤 출금 API 호출 중...');
        apiResult = await withdrawBalance(
          selectedUser.username,
          amountNum,
          config.opcode,
          config.token,
          config.secretKey
        );
      }

      // API 호출 실패 시
      if (!apiResult.success || apiResult.error) {
        throw new Error(apiResult.error || 'Invest API 호출 실패');
      }

      console.log('✅ Invest API 강제 입출금 완료:', apiResult);

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
          transaction_type: type === 'deposit' ? 'admin_deposit' : 'admin_withdrawal',
          amount: amountNum,
          status: 'completed',
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          memo: memo || `[관리자 강제 ${type === 'deposit' ? '입금' : '출금'}]`,
          processed_by: user.id,
          processed_at: now,
          created_at: now, // ✅ created_at 명시적 설정
          updated_at: now, // ✅ updated_at도 설정
          external_response: apiResult.data
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
      console.log('🔄 Realtime 트리거 데이터 로드:', reloadTrigger);
      loadData(false);
    }
  }, [reloadTrigger]);

  // 필터 변경 시 자동 새로고침 (깜박임 없이)
  useEffect(() => {
    if (!initialLoading) {
      console.log('📅 기간 필터 변경:', periodFilter);
      loadData(false);
    }
  }, [periodFilter]);

  // Realtime subscription for transactions table (즉시 업데이트)
  useEffect(() => {
    console.log('🔌 Realtime subscription 설정 중...');
    
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
          console.log('💳 transactions 테이블 변경 감지:', payload.eventType, payload.new);
          // reloadTrigger 증가로 데이터 리로드 트리거
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        console.log('💳 transactions 채널 구독 상태:', status);
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
          console.log('👤 users 테이블 변경 감지:', payload.new);
          // reloadTrigger 증가로 데이터 리로드 트리거
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        console.log('👤 users 채널 구독 상태:', status);
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
          console.log('💼 partner_balance_logs 테이블 변경 감지:', payload.eventType, payload.new);
          // reloadTrigger 증가로 데이터 리로드 트리거
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        console.log('💼 partner_balance_logs 채널 구독 상태:', status);
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
          console.log('🎁 point_transactions 테이블 변경 감지:', payload.eventType, payload.new);
          // reloadTrigger 증가로 데이터 리로드 트리거
          setReloadTrigger(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        console.log('🎁 point_transactions 채널 구독 상태:', status);
      });

    return () => {
      console.log('🔌 Realtime subscription 정리 중...');
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
      console.log('📨 WebSocket 메시지 수신:', lastMessage.type);
      setReloadTrigger(prev => prev + 1);
    }
  }, [lastMessage]);

  if (initialLoading) {
    return <LoadingSpinner />;
  }

  // 탭별 데이터 필터링
  const filterBySearch = (t: Transaction) => 
    searchTerm === '' || t.user?.nickname?.toLowerCase().includes(searchTerm.toLowerCase());

  const depositRequests = transactions.filter(t => 
    t.transaction_type === 'deposit' && 
    t.status === 'pending' &&
    filterBySearch(t)
  );

  const withdrawalRequests = transactions.filter(t => 
    t.transaction_type === 'withdrawal' && 
    t.status === 'pending' &&
    filterBySearch(t)
  );

  // 전체입출금내역: 사용자 + 관리자 입출금 + 파트너 거래 + 포인트 거래 통합
  const completedTransactions = (() => {
    // 입출금 거래 필터링
    const filteredTransactions = transactions.filter(t => {
      const typeMatch = (() => {
        if (transactionTypeFilter === 'all') return true;
        if (transactionTypeFilter === 'user_deposit') return t.transaction_type === 'deposit';
        if (transactionTypeFilter === 'user_withdrawal') return t.transaction_type === 'withdrawal';
        if (transactionTypeFilter === 'admin_deposit') return t.transaction_type === 'admin_deposit';
        if (transactionTypeFilter === 'admin_withdrawal') return t.transaction_type === 'admin_withdrawal';
        return false;
      })();
      
      return (t.transaction_type === 'deposit' || 
       t.transaction_type === 'withdrawal' ||
       t.transaction_type === 'admin_deposit' || 
       t.transaction_type === 'admin_withdrawal' || 
       t.transaction_type === 'admin_adjustment') &&
      (t.status === 'completed' || t.status === 'rejected') &&
      filterBySearch(t) &&
      typeMatch;
    });
    
    // 파트너 거래 필터링 (관리자 입금/출금에 포함)
    const mappedPartnerTransactions = (transactionTypeFilter === 'all' || 
                                       transactionTypeFilter === 'admin_deposit' || 
                                       transactionTypeFilter === 'admin_withdrawal')
      ? partnerTransactions
        .filter(pt => {
          const searchMatch = searchTerm === '' || 
            pt.partner_nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pt.from_partner_nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pt.to_partner_nickname?.toLowerCase().includes(searchTerm.toLowerCase());
          
          // 필터별 파트너 거래 타입 매칭
          const typeMatch = (() => {
            if (transactionTypeFilter === 'all') return true;
            if (transactionTypeFilter === 'admin_deposit') {
              return pt.transaction_type === 'deposit' || pt.amount > 0;
            }
            if (transactionTypeFilter === 'admin_withdrawal') {
              return pt.transaction_type === 'withdrawal' || pt.amount < 0;
            }
            return false;
          })();
          
          return searchMatch && typeMatch;
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
          
          return searchMatch && typeMatch;
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
    return [...filteredTransactions, ...mappedPartnerTransactions, ...filteredPointTransactions].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  })();
  
  // 🔍 디버깅: 데이터 확인
  console.log('🔍 전체입출금내역 데이터:', {
    filteredTransactionsCount: completedTransactions.filter((t: any) => !t.is_partner_transaction && !t.is_point_transaction).length,
    partnerTransactionsCount: completedTransactions.filter((t: any) => t.is_partner_transaction).length,
    pointTransactionsCount: completedTransactions.filter((t: any) => t.is_point_transaction).length,
    totalCount: completedTransactions.length,
    partnerTransactionsSample: completedTransactions.filter((t: any) => t.is_partner_transaction).slice(0, 2)
  });

  // 거래 테이블 컬럼
  const getColumns = (showActions = false) => [
    {
      header: t.transactionManagement.transactionDate,
      cell: (row: any) => (
        <span className="text-base text-slate-300">
          {new Date(row.created_at).toLocaleString('ko-KR')}
        </span>
      )
    },
    {
      header: t.transactionManagement.member,
      cell: (row: any) => {
        // 파트너 거래인 경우
        if (row.is_partner_transaction) {
          return (
            <div>
              <p className="font-medium text-purple-300 text-base">
                [{row.partner_nickname || row.partner_username}]
              </p>
              {row.from_partner_nickname && (
                <p className="text-sm text-blue-400 mt-0.5">
                  From: {row.from_partner_nickname}
                </p>
              )}
              {row.to_partner_nickname && (
                <p className="text-sm text-pink-400 mt-0.5">
                  To: {row.to_partner_nickname}
                </p>
              )}
              {row.processed_by_nickname && (
                <p className="text-xs text-slate-500 mt-0.5">
                  처리: {row.processed_by_nickname}
                </p>
              )}
            </div>
          );
        }
        
        // 일반 회원 거래
        return (
          <div>
            <p className="font-medium text-slate-200 text-base">{row.user?.nickname || row.user_nickname}</p>
            <p className="text-sm text-slate-500">{row.user?.username || row.user_username}</p>
            {row.user?.referrer && (
              <p className="text-sm text-blue-400 mt-0.5">
                소속: {row.user.referrer.nickname}
              </p>
            )}
          </div>
        );
      }
    },
    {
      header: t.transactionManagement.transactionType,
      cell: (row: any) => {
        // 파트너 거래인 경우
        if (row.is_partner_transaction) {
          const partnerTypeMap: any = {
            deposit: { text: '파트너입금', color: 'bg-cyan-600' },
            withdrawal: { text: '파트너출금', color: 'bg-pink-600' },
            admin_adjustment: { text: '파트너조정', color: 'bg-indigo-600' },
            commission: { text: '파트너수수료', color: 'bg-violet-600' },
            refund: { text: '파트너환급', color: 'bg-sky-600' },
            deposit_to_user: { text: '→회원입금', color: 'bg-teal-600' },
            withdrawal_from_user: { text: '←회원출금', color: 'bg-rose-600' }
          };
          const type = partnerTypeMap[row.transaction_type] || { text: row.transaction_type, color: 'bg-slate-600' };
          return <Badge className={`${type.color} text-white text-sm px-3 py-1`}>{type.text}</Badge>;
        }
        
        const typeMap: any = {
          deposit: { text: t.transactionManagement.deposit, color: 'bg-emerald-600' },
          withdrawal: { text: t.transactionManagement.withdrawal, color: 'bg-orange-600' },
          admin_deposit: { text: t.transactionManagement.adminDeposit, color: 'bg-teal-600' },
          admin_withdrawal: { text: t.transactionManagement.adminWithdrawal, color: 'bg-rose-600' },
          admin_adjustment: { 
            text: row.memo?.includes('강제 출금') ? t.transactionManagement.withdrawal : t.transactionManagement.deposit, 
            color: row.memo?.includes('강제 출금') ? 'bg-rose-600' : 'bg-teal-600'
          },
          // 포인트 거래 타입
          earn: { text: '포인트획득', color: 'bg-amber-600' },
          use: { text: '포인트사용', color: 'bg-purple-600' },
          convert_to_balance: { text: '머니전환', color: 'bg-blue-600' }
        };
        
        // admin_adjustment for points
        if (row.transaction_type === 'admin_adjustment' && row.points_before !== undefined) {
          const isGive = row.amount > 0;
          return <Badge className={`${isGive ? 'bg-amber-600' : 'bg-purple-600'} text-white text-sm px-3 py-1`}>
            {isGive ? '포인트지급' : '포인트회수'}
          </Badge>;
        }
        
        const type = typeMap[row.transaction_type] || { text: row.transaction_type, color: 'bg-slate-600' };
        return <Badge className={`${type.color} text-white text-sm px-3 py-1`}>{type.text}</Badge>;
      }
    },
    {
      header: t.transactionManagement.amount,
      cell: (row: any) => {
        // 파트너 거래인 경우
        if (row.is_partner_transaction) {
          const isNegative = row.transaction_type === 'withdrawal' || row.amount < 0;
          return (
            <span className={cn(
              "font-mono font-semibold text-2xl",
              isNegative ? 'text-red-400' : 'text-green-400'
            )}>
              {isNegative ? '-' : '+'}
              {formatCurrency(Math.abs(parseFloat(row.amount?.toString() || '0')))}
            </span>
          );
        }
        
        // 포인트 거래인 경우
        if (row.points_before !== undefined) {
          const isNegative = row.amount < 0;
          return (
            <span className={cn(
              "font-mono font-semibold text-2xl",
              isNegative ? 'text-red-400' : 'text-green-400'
            )}>
              {isNegative ? '' : '+'}
              {Math.abs(row.amount).toLocaleString()}P
            </span>
          );
        }
        
        // 일반 입출금 거래
        const isWithdrawal = row.transaction_type === 'withdrawal' || 
                             row.transaction_type === 'admin_withdrawal' ||
                             (row.transaction_type === 'admin_adjustment' && row.memo?.includes('강제 출금'));
        return (
          <span className={cn(
            "font-mono font-semibold text-2xl",
            isWithdrawal ? 'text-red-400' : 'text-green-400'
          )}>
            {isWithdrawal ? '-' : '+'}
            {formatCurrency(parseFloat(row.amount.toString()))}
          </span>
        );
      }
    },
    {
      header: t.transactionManagement.balanceAfter,
      cell: (row: any) => {
        // 파트너 거래인 경우
        if (row.is_partner_transaction) {
          return (
            <span className="font-mono text-purple-400 text-2xl">
              {formatCurrency(parseFloat(row.balance_after?.toString() || '0'))}
            </span>
          );
        }
        
        // 포인트 거래인 경우
        if (row.points_after !== undefined) {
          return (
            <span className="font-mono text-amber-400 text-2xl">
              {row.points_after.toLocaleString()}P
            </span>
          );
        }
        
        // 일반 입출금 거래
        return (
          <span className="font-mono text-cyan-400 text-2xl">
            {formatCurrency(parseFloat(row.balance_after?.toString() || '0'))}
          </span>
        );
      }
    },
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
    {
      header: t.transactionManagement.memo,
      cell: (row: any) => (
        <div className="max-w-xs">
          <span className="text-base text-slate-400 block truncate" title={row.memo || ''}>
            {row.memo || '-'}
          </span>
        </div>
      )
    },
    {
      header: t.transactionManagement.processor,
      cell: (row: any) => (
        <span className="text-base text-slate-400">
          {row.processed_partner?.nickname || row.partner_nickname || '-'}
        </span>
      )
    },
    ...(showActions ? [{
      header: t.transactionManagement.actions,
      cell: (row: Transaction) => (
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
      )
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
          value={formatCurrency(stats.totalDeposit)}
          subtitle={t.transactionManagement.accumulatedDeposit}
          icon={TrendingUp}
          color="green"
        />
        
        <MetricCard
          title={t.transactionManagement.totalWithdrawal}
          value={formatCurrency(stats.totalWithdrawal)}
          subtitle={t.transactionManagement.accumulatedWithdrawal}
          icon={TrendingDown}
          color="red"
        />
        
        <MetricCard
          title={t.transactionManagement.depositRequests}
          value={`${stats.pendingDepositCount}건`}
          subtitle={t.transactionManagement.pendingProcessing}
          icon={Clock}
          color="amber"
        />
        
        <MetricCard
          title={t.transactionManagement.withdrawalRequests}
          value={`${stats.pendingWithdrawalCount}건`}
          subtitle={t.transactionManagement.pendingProcessing}
          icon={AlertTriangle}
          color="orange"
        />
      </div>

      {/* 탭 컨텐츠 */}
      <div className="glass-card rounded-xl p-5">
        {/* 탭 리스트 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
                <SelectItem value="week">{t.transactionManagement.lastWeek}</SelectItem>
                <SelectItem value="month">{t.transactionManagement.lastMonth}</SelectItem>
              </SelectContent>
            </Select>

            {/* 검색 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                placeholder={t.transactionManagement.searchMembers}
                className="pl-10 h-11 text-base bg-slate-800/50 border-slate-600"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* 거래 유형 필터 버튼 (전체입출금내역 탭에서만 표시) */}
            {activeTab === 'completed-history' && (
              <div className="flex gap-2">
                <Button
                  onClick={() => setTransactionTypeFilter('all')}
                  variant={transactionTypeFilter === 'all' ? 'default' : 'outline'}
                  className={cn(
                    "h-11 px-4 text-sm",
                    transactionTypeFilter === 'all' 
                      ? "bg-blue-600 hover:bg-blue-700 text-white" 
                      : "bg-slate-800/50 border-slate-600 hover:bg-slate-700 text-slate-300"
                  )}
                >
                  전체
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('user_deposit')}
                  variant={transactionTypeFilter === 'user_deposit' ? 'default' : 'outline'}
                  className={cn(
                    "h-11 px-4 text-sm",
                    transactionTypeFilter === 'user_deposit' 
                      ? "bg-green-600 hover:bg-green-700 text-white" 
                      : "bg-slate-800/50 border-slate-600 hover:bg-slate-700 text-slate-300"
                  )}
                >
                  사용자입금
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('user_withdrawal')}
                  variant={transactionTypeFilter === 'user_withdrawal' ? 'default' : 'outline'}
                  className={cn(
                    "h-11 px-4 text-sm",
                    transactionTypeFilter === 'user_withdrawal' 
                      ? "bg-red-600 hover:bg-red-700 text-white" 
                      : "bg-slate-800/50 border-slate-600 hover:bg-slate-700 text-slate-300"
                  )}
                >
                  사용자출금
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('admin_deposit')}
                  variant={transactionTypeFilter === 'admin_deposit' ? 'default' : 'outline'}
                  className={cn(
                    "h-11 px-4 text-sm",
                    transactionTypeFilter === 'admin_deposit' 
                      ? "bg-cyan-600 hover:bg-cyan-700 text-white" 
                      : "bg-slate-800/50 border-slate-600 hover:bg-slate-700 text-slate-300"
                  )}
                >
                  관리자입금
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('admin_withdrawal')}
                  variant={transactionTypeFilter === 'admin_withdrawal' ? 'default' : 'outline'}
                  className={cn(
                    "h-11 px-4 text-sm",
                    transactionTypeFilter === 'admin_withdrawal' 
                      ? "bg-orange-600 hover:bg-orange-700 text-white" 
                      : "bg-slate-800/50 border-slate-600 hover:bg-slate-700 text-slate-300"
                  )}
                >
                  관리자출금
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('point_give')}
                  variant={transactionTypeFilter === 'point_give' ? 'default' : 'outline'}
                  className={cn(
                    "h-11 px-4 text-sm",
                    transactionTypeFilter === 'point_give' 
                      ? "bg-amber-600 hover:bg-amber-700 text-white" 
                      : "bg-slate-800/50 border-slate-600 hover:bg-slate-700 text-slate-300"
                  )}
                >
                  포인트지급
                </Button>
                <Button
                  onClick={() => setTransactionTypeFilter('point_recover')}
                  variant={transactionTypeFilter === 'point_recover' ? 'default' : 'outline'}
                  className={cn(
                    "h-11 px-4 text-sm",
                    transactionTypeFilter === 'point_recover' 
                      ? "bg-purple-600 hover:bg-purple-700 text-white" 
                      : "bg-slate-800/50 border-slate-600 hover:bg-slate-700 text-slate-300"
                  )}
                >
                  포인트회수
                </Button>
              </div>
            )}

            {/* 새로고침 */}
            <Button
              onClick={() => {
                console.log('🔄 수동 새로고침');
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

              {actionDialog.action === 'reject' && (
                <div className="space-y-2">
                  <Label htmlFor="transaction-reject-reason" className="text-slate-300 text-lg">{t.transactionManagement.rejectReason}</Label>
                  <Textarea
                    id="transaction-reject-reason"
                    name="reject_reason"
                    value={actionDialog.memo}
                    onChange={(e) => setActionDialog({ ...actionDialog, memo: e.target.value })}
                    placeholder={t.transactionManagement.rejectReasonPlaceholder}
                    className="bg-slate-800 border-slate-700 text-white text-lg"
                    rows={4}
                  />
                </div>
              )}
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
                  onClick={() => setForceDialog({ ...forceDialog, amount: '0' })}
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
                type="number"
                value={forceDialog.amount}
                onChange={(e) => {
                  const inputAmount = parseFloat(e.target.value || '0');
                  
                  // 출금 타입이고 회원이 선택된 경우 보유금 검증
                  if (forceDialog.type === 'withdrawal' && forceDialog.userId) {
                    const selectedUser = users.find(u => u.id === forceDialog.userId);
                    if (selectedUser) {
                      const userBalance = parseFloat(selectedUser.balance?.toString() || '0');
                      if (inputAmount > userBalance) {
                        toast.error(`출금 금액이 보유금(${userBalance.toLocaleString()}원)을 초과할 수 없습니다.`);
                        setForceDialog({ ...forceDialog, amount: userBalance.toString() });
                        return;
                      }
                    }
                  }
                  
                  setForceDialog({ ...forceDialog, amount: e.target.value });
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
                      const currentAmount = parseFloat(forceDialog.amount || '0');
                      const newAmount = currentAmount + amt;
                      
                      // 출금 타입이고 회원이 선택된 경우 보유금 검증
                      if (forceDialog.type === 'withdrawal' && forceDialog.userId) {
                        const selectedUser = users.find(u => u.id === forceDialog.userId);
                        if (selectedUser) {
                          const userBalance = parseFloat(selectedUser.balance?.toString() || '0');
                          if (newAmount > userBalance) {
                            toast.error(`출금 금액이 보유금(${userBalance.toLocaleString()}원)을 초과할 수 없습니다.`);
                            setForceDialog({ ...forceDialog, amount: userBalance.toString() });
                            return;
                          }
                        }
                      }
                      
                      setForceDialog({ 
                        ...forceDialog, 
                        amount: newAmount.toString() 
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
                      setForceDialog({ ...forceDialog, amount: balance.toString() });
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
              disabled={refreshing || !forceDialog.userId || !forceDialog.amount || parseFloat(forceDialog.amount) <= 0}
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