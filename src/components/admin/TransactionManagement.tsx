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
  const [pendingDeposits, setPendingDeposits] = useState<Transaction[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<Transaction[]>([]);
  const [completedDeposits, setCompletedDeposits] = useState<Transaction[]>([]);
  const [completedWithdrawals, setCompletedWithdrawals] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  // 검색/필터 상태
  const [depositSearch, setDepositSearch] = useState("");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // 다이얼로그 상태
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    transaction: Transaction | null;
    action: 'approve' | 'reject';
    memo: string;
  }>({
    open: false,
    transaction: null,
    action: 'approve',
    memo: ''
  });

  // 데이터 로드
  const loadData = useCallback(async () => {
    try {
      // 대기 중인 입금 신청
      const { data: depositsData } = await supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_user_id_fkey (
            id, username, nickname, bank_name, account_number
          )
        `)
        .eq('transaction_type', 'deposit')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      // 대기 중인 출금 신청
      const { data: withdrawalsData } = await supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_user_id_fkey (
            id, username, nickname, bank_name, account_number
          )
        `)
        .eq('transaction_type', 'withdrawal')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      // 처리 완료된 입금 기록
      const { data: completedDepositsData } = await supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_user_id_fkey (
            id, username, nickname, bank_name, account_number
          ),
          processor:partners!transactions_processed_by_fkey (
            username, nickname
          )
        `)
        .eq('transaction_type', 'deposit')
        .in('status', ['completed', 'rejected'])
        .order('processed_at', { ascending: false })
        .limit(100);

      // 처리 완료된 출금 기록
      const { data: completedWithdrawalsData } = await supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_user_id_fkey (
            id, username, nickname, bank_name, account_number
          ),
          processor:partners!transactions_processed_by_fkey (
            username, nickname
          )
        `)
        .eq('transaction_type', 'withdrawal')
        .in('status', ['completed', 'rejected'])
        .order('processed_at', { ascending: false })
        .limit(100);

      // 사용자 목록 (포인트 지급용)
      const { data: usersData } = await supabase
        .from('users')
        .select('*')
        .order('username');

      setPendingDeposits(depositsData || []);
      setPendingWithdrawals(withdrawalsData || []);
      setCompletedDeposits(completedDepositsData || []);
      setCompletedWithdrawals(completedWithdrawalsData || []);
      setUsers(usersData || []);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
      toast.error(t.transactionManagement.dataLoadFailed);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket 메시지 수신 처리
  useEffect(() => {
    if (lastMessage?.type === 'transaction_created' || 
        lastMessage?.type === 'transaction_processed') {
      loadData();
    }
  }, [lastMessage, loadData]);

  // 새로고침
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // 승인/거절 다이얼로그 열기
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
          
          // ✅ Lv1: API별 잔고 사용 (활성화된 API 중 가장 작은 금액)
          if (adminPartnerData.level === 1) {
            const { data: apiConfigs } = await supabase
              .from('api_configs')
              .select('balance, api_provider, is_active')
              .eq('partner_id', user.id)
              .eq('is_active', true);
            
            const balances = apiConfigs?.map((c: any) => c.balance || 0) || [];
            adminBalance = balances.length > 0 ? Math.min(...balances) : 0;
            
            console.log('💰 Lv1 관리자 보유금 (API별 최소값):', {
              apiConfigs: apiConfigs?.map((c: any) => ({ provider: c.api_provider, balance: c.balance })),
              minBalance: adminBalance
            });
          }
          // ✅ Lv2: 4개 지갑 합산
          else if (adminPartnerData.level === 2) {
            adminBalance = 
              (adminPartnerData.invest_balance || 0) +
              (adminPartnerData.oroplay_balance || 0) +
              (adminPartnerData.familyapi_balance || 0) +
              (adminPartnerData.honorapi_balance || 0);
            
            console.log('💰 Lv2 관리자 보유금 (4개 지갑 합산):', {
              invest: adminPartnerData.invest_balance,
              oroplay: adminPartnerData.oroplay_balance,
              familyapi: adminPartnerData.familyapi_balance,
              honorapi: adminPartnerData.honorapi_balance,
              total: adminBalance
            });
          }
          // ✅ Lv3~Lv6: GMS 머니 (partners.balance)
          else {
            adminBalance = parseFloat(adminPartnerData.balance?.toString() || '0');
            
            console.log('💰 Lv3~Lv6 관리자 보유금 (GMS 머니):', {
              level: adminPartnerData.level,
              balance: adminBalance
            });
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

      // 승인인 경우 balance 업데이트
      if (action === 'approve') {
        const amount = Math.floor(parseFloat(transaction.amount.toString()));
        
        // 1️⃣ 현재 사용자 정보 조회
        const { data: currentUserData, error: currentUserError } = await supabase
          .from('users')
          .select('balance, username')
          .eq('id', transaction.user_id)
          .single();

        if (currentUserError || !currentUserData) {
          throw new Error(t.transactionManagement.userBalanceUpdateFailed);
        }

        const currentBalance = parseFloat(currentUserData.balance?.toString() || '0');
        
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

        let currentPartnerBalance = 0;
        
        // ✅ Lv1: API별 잔고 사용 (활성화된 API 중 가장 작은 금액)
        if (partnerData.level === 1) {
          const { data: apiConfigs } = await supabase
            .from('api_configs')
            .select('balance, api_provider, is_active')
            .eq('partner_id', responsiblePartnerId)
            .eq('is_active', true);
          
          const balances = apiConfigs?.map((c: any) => c.balance || 0) || [];
          currentPartnerBalance = balances.length > 0 ? Math.min(...balances) : 0;
        }
        // ✅ Lv2: 4개 지갑 합산
        else if (partnerData.level === 2) {
          currentPartnerBalance = 
            (partnerData.invest_balance || 0) +
            (partnerData.oroplay_balance || 0) +
            (partnerData.familyapi_balance || 0) +
            (partnerData.honorapi_balance || 0);
        }
        // ✅ Lv3~Lv6: GMS 머니 (partners.balance)
        else {
          currentPartnerBalance = parseFloat(partnerData?.balance?.toString() || '0');
        }

        console.log('💰 [로그인한 관리자 정보]:', {
          partner_id: responsiblePartnerId,
          username: partnerData?.username,
          level: partnerData?.level,
          balance: currentPartnerBalance
        });

        // 6️⃣ 입금/출금에 따른 관리자 보유금 계산 및 업데이트
        if (transaction.transaction_type === 'deposit') {
          // 입금: 관리자 보유금 차감
          if (currentPartnerBalance < amount) {
            throw new Error(
              `관리자(${partnerData?.username})의 보유금이 부족하여 입금을 승인할 수 없습니다.\\n\\n` +
              `현재 보유금: ₩${currentPartnerBalance.toLocaleString()}\\n` +
              `승인 금액: ₩${amount.toLocaleString()}\\n` +
              `부족 금액: ₩${(amount - currentPartnerBalance).toLocaleString()}`
            );
          }

          const newPartnerBalance = currentPartnerBalance - amount;

          // ✅ Lv3~Lv6: GMS 머니 차감
          if (partnerData.level && partnerData.level >= 3) {
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
          }
          // ✅ Lv1, Lv2는 별도 처리 필요 (여기서는 검증만 통과)
          else {
            console.log('⚠️ Lv1/Lv2는 보유금 차감을 별도로 처리합니다 (API 동기화)');
          }

          console.log('✅ [관리자 보유금 차감 완료]:', {
            partner_id: responsiblePartnerId,
            partner_username: partnerData?.username,
            level: partnerData?.level,
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

          // ✅ Lv3~Lv6: GMS 머니 증가
          if (partnerData.level && partnerData.level >= 3) {
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
          }
          // ✅ Lv1, Lv2는 별도 처리 필요
          else {
            console.log('⚠️ Lv1/Lv2는 보유금 증가를 별도로 처리합니다 (API 동기화)');
          }

          console.log('✅ [관리자 보유금 증가 완료]:', {
            partner_id: responsiblePartnerId,
            partner_username: partnerData?.username,
            level: partnerData?.level,
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
      
      setActionDialog({ ...actionDialog, open: false });
      await loadData();
    } catch (error: any) {
      console.error('거래 처리 실패:', error);
      toast.error(`거래 처리 실패: ${error.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  // 거래 상태 뱃지
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" }> = {
      pending: { label: t.transactionManagement.statusPending, variant: "outline" },
      completed: { label: t.transactionManagement.statusCompleted, variant: "success" },
      rejected: { label: t.transactionManagement.statusRejected, variant: "destructive" }
    };

    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // 입금 신청 필터링
  const filteredPendingDeposits = pendingDeposits.filter(t => {
    const searchLower = depositSearch.toLowerCase();
    return (
      (t.user as any)?.username?.toLowerCase().includes(searchLower) ||
      (t.user as any)?.nickname?.toLowerCase().includes(searchLower) ||
      t.amount.toString().includes(searchLower)
    );
  });

  // 출금 신청 필터링
  const filteredPendingWithdrawals = pendingWithdrawals.filter(t => {
    const searchLower = withdrawalSearch.toLowerCase();
    return (
      (t.user as any)?.username?.toLowerCase().includes(searchLower) ||
      (t.user as any)?.nickname?.toLowerCase().includes(searchLower) ||
      t.amount.toString().includes(searchLower)
    );
  });

  // 처리 완료 입금 필터링
  const filteredCompletedDeposits = completedDeposits.filter(t => {
    const searchLower = historySearch.toLowerCase();
    const statusMatch = statusFilter === 'all' || t.status === statusFilter;
    return statusMatch && (
      (t.user as any)?.username?.toLowerCase().includes(searchLower) ||
      (t.user as any)?.nickname?.toLowerCase().includes(searchLower) ||
      t.amount.toString().includes(searchLower)
    );
  });

  // 처리 완료 출금 필터링
  const filteredCompletedWithdrawals = completedWithdrawals.filter(t => {
    const searchLower = historySearch.toLowerCase();
    const statusMatch = statusFilter === 'all' || t.status === statusFilter;
    return statusMatch && (
      (t.user as any)?.username?.toLowerCase().includes(searchLower) ||
      (t.user as any)?.nickname?.toLowerCase().includes(searchLower) ||
      t.amount.toString().includes(searchLower)
    );
  });

  if (initialLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>{t.transactionManagement.title}</h1>
          <p className="text-gray-500">{t.transactionManagement.subtitle}</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          {t.common.refresh}
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title={t.transactionManagement.pendingDeposits}
          value={pendingDeposits.length}
          icon={Clock}
          trend={{ value: 0, isPositive: true }}
          color="blue"
        />
        <MetricCard
          title={t.transactionManagement.pendingWithdrawals}
          value={pendingWithdrawals.length}
          icon={AlertTriangle}
          trend={{ value: 0, isPositive: false }}
          color="orange"
        />
        <MetricCard
          title={t.transactionManagement.completedDeposits}
          value={completedDeposits.length}
          icon={TrendingUp}
          trend={{ value: 0, isPositive: true }}
          color="green"
        />
        <MetricCard
          title={t.transactionManagement.completedWithdrawals}
          value={completedWithdrawals.length}
          icon={TrendingDown}
          trend={{ value: 0, isPositive: true }}
          color="purple"
        />
      </div>

      {/* 탭 */}
      <Tabs 
        value={activeTab} 
        onValueChange={(value) => {
          setActiveTab(value);
          window.location.hash = value;
        }}
      >
        <TabsList>
          <TabsTrigger value="deposit-request">
            {t.transactionManagement.depositRequests} ({pendingDeposits.length})
          </TabsTrigger>
          <TabsTrigger value="withdrawal-request">
            {t.transactionManagement.withdrawalRequests} ({pendingWithdrawals.length})
          </TabsTrigger>
          <TabsTrigger value="deposit-history">
            {t.transactionManagement.depositHistory}
          </TabsTrigger>
          <TabsTrigger value="withdrawal-history">
            {t.transactionManagement.withdrawalHistory}
          </TabsTrigger>
        </TabsList>

        {/* 입금 신청 탭 */}
        <TabsContent value="deposit-request">
          <Card>
            <CardHeader>
              <CardTitle>{t.transactionManagement.depositRequests}</CardTitle>
              <div className="flex items-center gap-2 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t.common.search}
                    value={depositSearch}
                    onChange={(e) => setDepositSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={[
                  {
                    key: 'created_at',
                    header: t.transactionManagement.requestTime,
                    render: (_, row) => new Date(row.created_at).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')
                  },
                  {
                    key: 'user',
                    header: t.transactionManagement.username,
                    render: (_, row) => (
                      <div>
                        <div>{(row.user as any)?.username}</div>
                        <div className="text-sm text-gray-500">{(row.user as any)?.nickname}</div>
                      </div>
                    )
                  },
                  {
                    key: 'amount',
                    header: t.transactionManagement.amount,
                    render: (value) => formatCurrency(value)
                  },
                  {
                    key: 'memo',
                    header: t.transactionManagement.memo,
                    render: (value) => value || '-'
                  },
                  {
                    key: 'actions',
                    header: t.common.actions,
                    render: (_, row) => (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => openActionDialog(row, 'approve')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {t.transactionManagement.approve}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openActionDialog(row, 'reject')}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          {t.transactionManagement.reject}
                        </Button>
                      </div>
                    )
                  }
                ]}
                data={filteredPendingDeposits}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 출금 신청 탭 */}
        <TabsContent value="withdrawal-request">
          <Card>
            <CardHeader>
              <CardTitle>{t.transactionManagement.withdrawalRequests}</CardTitle>
              <div className="flex items-center gap-2 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t.common.search}
                    value={withdrawalSearch}
                    onChange={(e) => setWithdrawalSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={[
                  {
                    key: 'created_at',
                    header: t.transactionManagement.requestTime,
                    render: (_, row) => new Date(row.created_at).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')
                  },
                  {
                    key: 'user',
                    header: t.transactionManagement.username,
                    render: (_, row) => (
                      <div>
                        <div>{(row.user as any)?.username}</div>
                        <div className="text-sm text-gray-500">{(row.user as any)?.nickname}</div>
                      </div>
                    )
                  },
                  {
                    key: 'amount',
                    header: t.transactionManagement.amount,
                    render: (value) => formatCurrency(value)
                  },
                  {
                    key: 'bank_info',
                    header: t.transactionManagement.bankInfo,
                    render: (_, row) => (
                      <div className="text-sm">
                        <div>{(row.user as any)?.bank_name}</div>
                        <div className="text-gray-500">{(row.user as any)?.account_number}</div>
                      </div>
                    )
                  },
                  {
                    key: 'memo',
                    header: t.transactionManagement.memo,
                    render: (value) => value || '-'
                  },
                  {
                    key: 'actions',
                    header: t.common.actions,
                    render: (_, row) => (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => openActionDialog(row, 'approve')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {t.transactionManagement.approve}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openActionDialog(row, 'reject')}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          {t.transactionManagement.reject}
                        </Button>
                      </div>
                    )
                  }
                ]}
                data={filteredPendingWithdrawals}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 입금 내역 탭 */}
        <TabsContent value="deposit-history">
          <Card>
            <CardHeader>
              <CardTitle>{t.transactionManagement.depositHistory}</CardTitle>
              <div className="flex items-center gap-2 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t.common.search}
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.common.all}</SelectItem>
                    <SelectItem value="completed">{t.transactionManagement.statusCompleted}</SelectItem>
                    <SelectItem value="rejected">{t.transactionManagement.statusRejected}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={[
                  {
                    key: 'processed_at',
                    header: t.transactionManagement.processedTime,
                    render: (_, row) => row.processed_at ? new Date(row.processed_at).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US') : '-'
                  },
                  {
                    key: 'user',
                    header: t.transactionManagement.username,
                    render: (_, row) => (
                      <div>
                        <div>{(row.user as any)?.username}</div>
                        <div className="text-sm text-gray-500">{(row.user as any)?.nickname}</div>
                      </div>
                    )
                  },
                  {
                    key: 'amount',
                    header: t.transactionManagement.amount,
                    render: (value) => formatCurrency(value)
                  },
                  {
                    key: 'status',
                    header: t.transactionManagement.status,
                    render: (value) => getStatusBadge(value)
                  },
                  {
                    key: 'processor',
                    header: t.transactionManagement.processor,
                    render: (_, row) => (row.processor as any)?.username || '-'
                  },
                  {
                    key: 'memo',
                    header: t.transactionManagement.memo,
                    render: (value) => value || '-'
                  }
                ]}
                data={filteredCompletedDeposits}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 출금 내역 탭 */}
        <TabsContent value="withdrawal-history">
          <Card>
            <CardHeader>
              <CardTitle>{t.transactionManagement.withdrawalHistory}</CardTitle>
              <div className="flex items-center gap-2 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t.common.search}
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.common.all}</SelectItem>
                    <SelectItem value="completed">{t.transactionManagement.statusCompleted}</SelectItem>
                    <SelectItem value="rejected">{t.transactionManagement.statusRejected}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={[
                  {
                    key: 'processed_at',
                    header: t.transactionManagement.processedTime,
                    render: (_, row) => row.processed_at ? new Date(row.processed_at).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US') : '-'
                  },
                  {
                    key: 'user',
                    header: t.transactionManagement.username,
                    render: (_, row) => (
                      <div>
                        <div>{(row.user as any)?.username}</div>
                        <div className="text-sm text-gray-500">{(row.user as any)?.nickname}</div>
                      </div>
                    )
                  },
                  {
                    key: 'amount',
                    header: t.transactionManagement.amount,
                    render: (value) => formatCurrency(value)
                  },
                  {
                    key: 'bank_info',
                    header: t.transactionManagement.bankInfo,
                    render: (_, row) => (
                      <div className="text-sm">
                        <div>{(row.user as any)?.bank_name}</div>
                        <div className="text-gray-500">{(row.user as any)?.account_number}</div>
                      </div>
                    )
                  },
                  {
                    key: 'status',
                    header: t.transactionManagement.status,
                    render: (value) => getStatusBadge(value)
                  },
                  {
                    key: 'processor',
                    header: t.transactionManagement.processor,
                    render: (_, row) => (row.processor as any)?.username || '-'
                  },
                  {
                    key: 'memo',
                    header: t.transactionManagement.memo,
                    render: (value) => value || '-'
                  }
                ]}
                data={filteredCompletedWithdrawals}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 승인/거절 다이얼로그 */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === 'approve' ? t.transactionManagement.confirmApproval : t.transactionManagement.confirmRejection}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.transaction && (
                <div className="space-y-2 mt-4">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.transactionManagement.username}:</span>
                    <span>{(actionDialog.transaction.user as any)?.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.transactionManagement.amount}:</span>
                    <span>{formatCurrency(actionDialog.transaction.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.transactionManagement.type}:</span>
                    <span>
                      {actionDialog.transaction.transaction_type === 'deposit' 
                        ? t.transactionManagement.deposit 
                        : t.transactionManagement.withdrawal}
                    </span>
                  </div>
                  {actionDialog.action === 'reject' && (
                    <div className="mt-4">
                      <Label>{t.transactionManagement.rejectReason}</Label>
                      <Textarea
                        value={actionDialog.memo}
                        onChange={(e) => setActionDialog({ ...actionDialog, memo: e.target.value })}
                        placeholder={t.transactionManagement.rejectReasonPlaceholder}
                        className="mt-2"
                      />
                    </div>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ ...actionDialog, open: false })}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleTransactionAction}
              className={actionDialog.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
              variant={actionDialog.action === 'reject' ? 'destructive' : 'default'}
            >
              {actionDialog.action === 'approve' ? t.transactionManagement.approve : t.transactionManagement.reject}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
