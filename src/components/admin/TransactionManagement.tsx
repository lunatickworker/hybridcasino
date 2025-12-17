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
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // URL 해시에서 탭 정보 읽기
  const getInitialTab = () => {
    const hash = window.location.hash.substring(1);
    if (hash === 'deposit-request' || hash === 'withdrawal-request' || hash === 'deposit-history' || hash === 'withdrawal-history') {
      return hash;
    }
    return "deposit-request";
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  
  // 데이터 상태
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  // 필터 상태
  const [periodFilter, setPeriodFilter] = useState("today");
  const [searchTerm, setSearchTerm] = useState("");
  
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

  // 데이터 로드 (깜박임 없이)
  const loadData = async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }
      
      console.log('🔄 데이터 로드 시작:', { isInitial, periodFilter, userLevel: user.level });
      
      const dateRange = getDateRange(periodFilter);
      
      // 거래 데이터 로드
      let query = supabase
        .from('transactions')
        .select(`
          *,
          user:users(id, nickname, username, balance, bank_name, bank_account, bank_holder),
          processed_partner:partners!transactions_processed_by_fkey(nickname, level)
        `)
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end);

      // ✅ 계층 구조 필터링: 시스템관리자가 아니면 하위 파트너들의 회원까지 포함
      if (user.level > 1) {
        // get_hierarchical_partners RPC로 모든 하위 파트너 조회
        const { data: hierarchicalPartners } = await supabase
          .rpc('get_hierarchical_partners', { p_partner_id: user.id });
        
        // ✅ 안전장치: 현재 사용자보다 level이 큰 파트너만 포함 (하위만)
        const childPartnerIds = (hierarchicalPartners || [])
          .filter((p: any) => p.level > user.level)
          .map((p: any) => p.id);
        
        const partnerIds = [user.id, ...childPartnerIds];
        
        // 자신과 하위 파트너들의 회원 조회
        const { data: userList } = await supabase
          .from('users')
          .select('id')
          .in('referrer_id', partnerIds);
        
        const userIds = userList?.map(u => u.id) || [];
        
        if (userIds.length > 0) {
          query = query.in('user_id', userIds);
        } else {
          setTransactions([]);
          setStats({
            totalDeposit: 0,
            totalWithdrawal: 0,
            pendingDepositCount: 0,
            pendingWithdrawalCount: 0
          });
          if (isInitial) setInitialLoading(false);
          return;
        }
      }

      const { data: transactionsData, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      console.log('✅ 거래 데이터 로드 완료:', transactionsData?.length || 0, '건');
      setTransactions(transactionsData || []);

      // 사용자 목록 로드 (강제 입출금용)
      let userQuery = supabase
        .from('users')
        .select('id, nickname, username, balance, bank_name, bank_account, bank_holder')
        .eq('status', 'active');

      // ✅ 계층 구조 필터링: 하위 파트너들의 회원까지 포함
      if (user.level > 1) {
        // get_hierarchical_partners RPC로 모든 하위 파트너 조회
        const { data: hierarchicalPartners } = await supabase
          .rpc('get_hierarchical_partners', { p_partner_id: user.id });
        
        // ✅ 안전장치: 현재 사용자보다 level이 큰 파트너만 포함 (하위만)
        const childPartnerIds = (hierarchicalPartners || [])
          .filter((p: any) => p.level > user.level)
          .map((p: any) => p.id);
        
        const partnerIds = [user.id, ...childPartnerIds];
        
        // 자신과 하위 파트너들의 회원만 조회
        userQuery = userQuery.in('referrer_id', partnerIds);
      }

      const { data: usersData } = await userQuery.order('nickname');
      setUsers(usersData || []);

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

      // 승인인 경우 Invest API를 통한 실제 입출금 처리
      if (action === 'approve') {
        // OPCODE 정보 조회
        const opcodeInfo = await getAdminOpcode(user);
        
        // 시스템관리자면 첫 번째 OPCODE 사용
        const config = isMultipleOpcode(opcodeInfo) 
          ? opcodeInfo.opcodes[0] 
          : opcodeInfo;

        // 사용자 username 조회
        if (!transaction.user?.username) {
          throw new Error(t.transactionManagement.userInfoNotFound);
        }

        // amount를 정수로 변환 (Guidelines: 입금액/출금액은 숫자만)
        const amount = Math.floor(parseFloat(transaction.amount.toString()));
        
        console.log('💰 거래 승인 처리 시작:', {
          transaction_type: transaction.transaction_type,
          username: transaction.user.username,
          amount,
          opcode: config.opcode
        });

        let apiResult;

        // Invest API 호출 (입금 또는 출금)
        if (transaction.transaction_type === 'deposit') {
          console.log('📥 입금 API 호출 중...');
          apiResult = await depositBalance(
            transaction.user.username,
            amount,
            config.opcode,
            config.token,
            config.secretKey
          );
        } else if (transaction.transaction_type === 'withdrawal') {
          console.log('📤 출금 API 호출 중...');
          apiResult = await withdrawBalance(
            transaction.user.username,
            amount,
            config.opcode,
            config.token,
            config.secretKey
          );
        }

        // API 호출 실패 시
        if (apiResult && !apiResult.success) {
          console.error('❌ Invest API 호출 실패:', apiResult);
          throw new Error(apiResult.error || 'Invest API 호출 실패');
        }

        console.log('✅ Invest API 처리 완료:', apiResult);
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

      toast.success(action === 'approve' ? t.transactionManagement.transactionApproved : t.transactionManagement.transactionRejected);
      
      // WebSocket으로 실시간 알림
      sendMessage({
        type: 'transaction_processed',
        data: { 
          transactionId: transaction.id, 
          action, 
          processedBy: user.nickname,
          userId: transaction.user_id
        }
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
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          partner_id: user.id,
          transaction_type: type === 'deposit' ? 'admin_deposit' : 'admin_withdrawal',
          amount: amountNum,
          status: 'completed',
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          memo: memo || `[관리자 강제 ${type === 'deposit' ? '입금' : '출금'}]`,
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          external_response: apiResult.data
        });

      if (transactionError) throw transactionError;

      // ✅ 트리거가 자동으로 users.balance 업데이트 (251번 SQL)
      // ✅ Realtime 이벤트 자동 발생 → UserHeader 즉시 업데이트
      console.log('✅ transactions INSERT 완료 → 트리거가 users.balance 자동 업데이트');

      // ✅ Lv2가 Lv7 사용자에게 입출금하는 경우: GMS 머니(balance) 차감/증가
      if (user.level === 2) {
        const { data: adminPartner, error: adminPartnerError } = await supabase
          .from('partners')
          .select('balance')
          .eq('id', user.id)
          .single();

        if (adminPartnerError || !adminPartner) {
          console.warn('⚠️ Lv2 관리자의 partners 정보를 찾을 수 없습니다.');
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
            console.error('❌ Lv2 balance 업데이트 실패:', updateBalanceError);
          } else {
            console.log(`✅ Lv2 balance 업데이트: ${currentBalance} → ${newBalance}`);
            
            // Lv2 잔고 변경 로그 기록
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

    return () => {
      console.log('🔌 Realtime subscription 정리 중...');
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(usersChannel);
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

  // 입출금내역: 사용자가 요청한 입출금만 (deposit, withdrawal)
  const completedTransactions = transactions.filter(t => 
    (t.transaction_type === 'deposit' || t.transaction_type === 'withdrawal') &&
    t.status === 'completed' &&
    filterBySearch(t)
  );

  // 관리자 입출금내역: 관리자가 강제 처리한 입출금만 (admin_deposit, admin_withdrawal, admin_adjustment)
  const adminTransactions = transactions.filter(t => 
    (t.transaction_type === 'admin_deposit' || 
     t.transaction_type === 'admin_withdrawal' || 
     t.transaction_type === 'admin_adjustment') &&
    t.status === 'completed' &&
    filterBySearch(t)
  );

  // 거래 테이블 컬럼
  const getColumns = (showActions = false) => [
    {
      header: t.transactionManagement.transactionDate,
      cell: (row: Transaction) => (
        <span className="text-lg text-slate-300">
          {new Date(row.created_at).toLocaleString('ko-KR')}
        </span>
      )
    },
    {
      header: t.transactionManagement.member,
      cell: (row: Transaction) => (
        <div>
          <p className="font-medium text-slate-200 text-lg">{row.user?.nickname}</p>
          <p className="text-base text-slate-500">{row.user?.username}</p>
        </div>
      )
    },
    {
      header: t.transactionManagement.transactionType,
      cell: (row: Transaction) => {
        const typeMap: any = {
          deposit: { text: t.transactionManagement.deposit, color: 'bg-green-500' },
          withdrawal: { text: t.transactionManagement.withdrawal, color: 'bg-red-500' },
          admin_deposit: { text: t.transactionManagement.adminDeposit, color: 'bg-green-600' },
          admin_withdrawal: { text: t.transactionManagement.adminWithdrawal, color: 'bg-red-600' },
          admin_adjustment: { 
            text: row.memo?.includes('강제 출금') ? t.transactionManagement.withdrawal : t.transactionManagement.deposit, 
            color: row.memo?.includes('강제 출금') ? 'bg-red-600' : 'bg-green-600'
          }
        };
        const type = typeMap[row.transaction_type] || { text: row.transaction_type, color: 'bg-gray-500' };
        return <Badge className={`${type.color} text-white text-base px-4 py-2`}>{type.text}</Badge>;
      }
    },
    {
      header: t.transactionManagement.amount,
      cell: (row: Transaction) => {
        // withdrawal 계열은 마이너스, deposit 계열은 플러스
        const isWithdrawal = row.transaction_type === 'withdrawal' || 
                             row.transaction_type === 'admin_withdrawal' ||
                             (row.transaction_type === 'admin_adjustment' && row.memo?.includes('강제 출금'));
        return (
          <span className={cn(
            "font-mono font-semibold text-xl",
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
      cell: (row: Transaction) => (
        <span className="font-mono text-cyan-400 text-xl">
          {formatCurrency(parseFloat(row.balance_after?.toString() || '0'))}
        </span>
      )
    },
    {
      header: t.transactionManagement.status,
      cell: (row: Transaction) => {
        const statusMap: any = {
          pending: { text: t.transactionManagement.pending, color: 'bg-yellow-500' },
          completed: { text: t.transactionManagement.completed, color: 'bg-green-500' },
          rejected: { text: t.transactionManagement.rejected, color: 'bg-red-500' }
        };
        const status = statusMap[row.status] || { text: row.status, color: 'bg-gray-500' };
        return <Badge className={`${status.color} text-white text-base px-4 py-2`}>{status.text}</Badge>;
      }
    },
    {
      header: t.transactionManagement.memo,
      cell: (row: Transaction) => (
        <div className="max-w-xs">
          <span className="text-lg text-slate-400 block truncate" title={row.memo || ''}>
            {row.memo || '-'}
          </span>
        </div>
      )
    },
    {
      header: t.transactionManagement.processor,
      cell: (row: Transaction) => (
        <span className="text-lg text-slate-400">
          {row.processed_partner?.nickname || '-'}
        </span>
      )
    },
    ...(showActions ? [{
      header: t.transactionManagement.actions,
      cell: (row: Transaction) => (
        <div className="flex items-center gap-2">
          <Button
            size="lg"
            onClick={() => openActionDialog(row, 'approve')}
            disabled={refreshing}
            className="h-12 px-6 text-lg bg-green-600 hover:bg-green-700"
          >
            {t.transactionManagement.approve}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => openActionDialog(row, 'reject')}
            disabled={refreshing}
            className="h-12 px-6 text-lg border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
          >
            {t.transactionManagement.reject}
          </Button>
        </div>
      )
    }] : [])
  ];

  return (
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
      <div className="glass-card rounded-xl p-6">
        {/* 탭 리스트 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="bg-slate-800/30 rounded-xl p-1.5 border border-slate-700/40">
            <TabsList className="bg-transparent h-auto p-0 border-0 gap-2 w-full grid grid-cols-4">
              <TabsTrigger 
                value="deposit-request"
                className="bg-transparent text-slate-400 text-xl rounded-lg px-8 py-5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500/20 data-[state=active]:to-cyan-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20 data-[state=active]:border data-[state=active]:border-blue-400/30 transition-all duration-200"
              >
                {t.transactionManagement.depositRequestTab}
              </TabsTrigger>
              <TabsTrigger 
                value="withdrawal-request"
                className="bg-transparent text-slate-400 text-xl rounded-lg px-8 py-5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500/20 data-[state=active]:to-pink-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 data-[state=active]:border data-[state=active]:border-purple-400/30 transition-all duration-200"
              >
                {t.transactionManagement.withdrawalRequestTab}
              </TabsTrigger>
              <TabsTrigger 
                value="completed-history"
                className="bg-transparent text-slate-400 text-xl rounded-lg px-8 py-5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-green-500/20 data-[state=active]:to-emerald-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-green-500/20 data-[state=active]:border data-[state=active]:border-green-400/30 transition-all duration-200"
              >
                {t.transactionManagement.completedHistoryTab}
              </TabsTrigger>
              <TabsTrigger 
                value="admin-history"
                className="bg-transparent text-slate-400 text-xl rounded-lg px-8 py-5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500/20 data-[state=active]:to-amber-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-orange-500/20 data-[state=active]:border data-[state=active]:border-orange-400/30 transition-all duration-200"
              >
                {t.transactionManagement.adminHistoryTab}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 헤더 및 필터 */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-slate-400" />
              <h3 className="font-semibold text-slate-100">
                {activeTab === 'deposit-request' && t.transactionManagement.depositRequestTab}
                {activeTab === 'withdrawal-request' && t.transactionManagement.withdrawalRequestTab}
                {activeTab === 'completed-history' && t.transactionManagement.completedHistoryTab}
                {activeTab === 'admin-history' && t.transactionManagement.adminHistoryTab}
              </h3>
            </div>
          </div>

          {/* 필터 영역 */}
          <div className="flex items-center gap-3">
            {/* 기간 정렬 */}
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[140px] input-premium">
                <SelectValue placeholder={t.transactionManagement.period} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="today">{t.transactionManagement.today}</SelectItem>
                <SelectItem value="week">{t.transactionManagement.lastWeek}</SelectItem>
                <SelectItem value="month">{t.transactionManagement.lastMonth}</SelectItem>
              </SelectContent>
            </Select>

            {/* 검색 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder={t.transactionManagement.searchMembers}
                className="pl-10 input-premium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* 새로고침 */}
            <Button
              onClick={() => {
                console.log('🔄 수동 새로고침');
                loadData(false);
              }}
              disabled={refreshing}
              variant="outline"
              className="btn-premium-primary"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
              {t.transactionManagement.refresh}
            </Button>
          </div>

          {/* 입금 신청 탭 */}
          <TabsContent value="deposit-request">
            <DataTable
              searchable={false}
              columns={getColumns(true)}
              data={depositRequests}
              loading={initialLoading}
              emptyMessage={t.transactionManagement.noDepositRequests}
            />
          </TabsContent>

          {/* 출금 신청 탭 */}
          <TabsContent value="withdrawal-request">
            <DataTable
              searchable={false}
              columns={getColumns(true)}
              data={withdrawalRequests}
              loading={initialLoading}
              emptyMessage={t.transactionManagement.noWithdrawalRequests}
            />
          </TabsContent>

          {/* 입출금 내역 탭 (승인된 모든 거래) */}
          <TabsContent value="completed-history">
            <DataTable
              searchable={false}
              columns={getColumns(false)}
              data={completedTransactions}
              loading={initialLoading}
              emptyMessage={t.transactionManagement.noTransactionHistory}
            />
          </TabsContent>

          {/* 관리자 입출금 내역 탭 */}
          <TabsContent value="admin-history">
            <DataTable
              searchable={false}
              columns={getColumns(false)}
              data={adminTransactions}
              loading={initialLoading}
              emptyMessage={t.transactionManagement.noAdminTransactionHistory}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* 승인/거절 확인 Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
        <DialogContent className="bg-slate-900 border-slate-700">
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
  );
}

export default TransactionManagement;