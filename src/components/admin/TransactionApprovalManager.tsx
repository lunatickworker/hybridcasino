import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ArrowDownCircle, ArrowUpCircle, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner@2.0.3';
import { formatCurrency } from '../../lib/utils';
import { TransactionType, TRANSACTION_CONFIG } from '../../types/transactions';

interface Transaction {
  id: string;
  user_id: string;
  transaction_type: TransactionType;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed';
  created_at: string;
  processed_at?: string;
  processed_by?: string;
  memo?: string;
  balance_before?: number;
  users?: {
    username: string;
    nickname: string;
    balance: number;
    bank_name?: string;
    bank_account?: string;
    bank_holder?: string;
  };
  processors?: {
    username: string;
  };
}

interface TransactionApprovalManagerProps {
  user: any;
}

export function TransactionApprovalManager({ user }: TransactionApprovalManagerProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('deposit');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalDeposit: 0,
    totalWithdrawal: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
  });

  // 통계 및 거래 내역 조회
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. 오늘 날짜 범위
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // 2. 소속 사용자 ID 조회
      let allowedUserIds: string[] = [];
      let allowedPartnerIds: string[] = []; // ✅ 파트너 ID도 추가
      
      if (user.level === 1 || user.level === 2) {
        // Lv1/Lv2: 모든 사용자
        const { data: allUsers } = await supabase
          .from('users')
          .select('id');
        allowedUserIds = allUsers?.map(u => u.id) || [];

        // ✅ 모든 파트너도 포함
        const { data: allPartners } = await supabase
          .from('partners')
          .select('id');
        allowedPartnerIds = allPartners?.map(p => p.id) || [];
      } else {
        // Lv3~6: 직속 + 하위 파트너의 사용자
        const { data: directUsers } = await supabase
          .from('users')
          .select('id')
          .eq('referrer_id', user.id);
        
        const { data: subPartners } = await supabase
          .rpc('get_all_sub_partners', { input_partner_id: user.id });
        
        const subPartnerIds = subPartners?.map((p: any) => p.id) || [];
        
        const { data: subPartnerUsers } = await supabase
          .from('users')
          .select('id')
          .in('referrer_id', subPartnerIds);

        allowedUserIds = [
          ...(directUsers?.map(u => u.id) || []),
          ...(subPartnerUsers?.map(u => u.id) || [])
        ];

        // ✅ 본인 + 하위 파트너 ID 포함
        allowedPartnerIds = [user.id, ...subPartnerIds];
      }

      if (allowedUserIds.length === 0) {
        setTransactions([]);
        setStats({ totalDeposit: 0, totalWithdrawal: 0, pendingDeposits: 0, pendingWithdrawals: 0 });
        setLoading(false);
        return;
      }

      // 3. 오늘 입금 합계 (사용자 입금 + 파트너 입금)
      const { data: depositData } = await supabase
        .from('transactions')
        .select('amount')
        .in('transaction_type', ['deposit', 'admin_deposit'])
        .in('status', ['approved', 'completed'])
        .in('user_id', allowedUserIds)
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString());

      // ✅ 파트너 간 입금도 포함
      const { data: partnerDepositData } = await supabase
        .from('partner_transactions')
        .select('amount')
        .eq('transaction_type', 'deposit')
        .in('partner_id', allowedPartnerIds)
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString());

      const totalDeposit = (depositData?.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0) || 0) +
                          (partnerDepositData?.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0) || 0);

      // 4. 오늘 출금 합계 (사용자 출금 + 파트너 출금)
      const { data: withdrawalData } = await supabase
        .from('transactions')
        .select('amount')
        .in('transaction_type', ['withdrawal', 'admin_withdrawal'])
        .in('status', ['approved', 'completed'])
        .in('user_id', allowedUserIds)
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString());

      // ✅ 파트너 간 출금도 포함 (amount가 음수이므로 절대값 사용)
      const { data: partnerWithdrawalData } = await supabase
        .from('partner_transactions')
        .select('amount')
        .eq('transaction_type', 'withdrawal')
        .in('partner_id', allowedPartnerIds)
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString());

      console.log('🔍 출금 데이터 디버깅:', {
        todayStart: todayStart.toISOString(),
        todayEnd: todayEnd.toISOString(),
        withdrawalData,
        partnerWithdrawalData,
        userCount: withdrawalData?.length || 0,
        partnerCount: partnerWithdrawalData?.length || 0
      });

      const totalWithdrawal = (withdrawalData?.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0) || 0) +
                              Math.abs(partnerWithdrawalData?.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0) || 0);

      console.log('💰 총 출금 계산:', totalWithdrawal);

      // 5. 대기 중인 입금 신청 (사용자 + 관리자 입금 모두 포함)
      const { count: pendingDeposits } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .in('transaction_type', ['deposit', 'admin_deposit']) // ✅ 관리자 입금 포함
        .eq('status', 'pending')
        .in('user_id', allowedUserIds);

      // 6. 대기 중인 출금 신청 (사용자 + 관리자 출금 모두 포함)
      const { count: pendingWithdrawals } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .in('transaction_type', ['withdrawal', 'admin_withdrawal']) // ✅ 관리자 출금 포함
        .eq('status', 'pending')
        .in('user_id', allowedUserIds);

      setStats({
        totalDeposit,
        totalWithdrawal,
        pendingDeposits: pendingDeposits || 0,
        pendingWithdrawals: pendingWithdrawals || 0,
      });

      // 7. 거래 내역 조회
      let query = supabase
        .from('transactions')
        .select(`
          *,
          users!transactions_user_id_fkey (
            username,
            nickname,
            balance,
            bank_name,
            bank_account,
            bank_holder
          ),
          processors:partners!transactions_processed_by_fkey (
            username
          )
        `)
        .in('user_id', allowedUserIds)
        .order('created_at', { ascending: false });

      // 탭별 필터
      if (activeTab === 'deposit') {
        query = query.eq('transaction_type', 'deposit').eq('status', 'pending');
      } else if (activeTab === 'withdrawal') {
        query = query.eq('transaction_type', 'withdrawal').eq('status', 'pending');
      } else if (activeTab === 'history') {
        // ⭐ 전체입출금내역: 사용자 + 관리자 입출금 모두 표시
        query = query.in('transaction_type', ['deposit', 'withdrawal', 'admin_deposit', 'admin_withdrawal']);
        if (filterStatus !== 'all') {
          query = query.eq('status', filterStatus);
        }
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;

      setTransactions(data || []);
      setLoading(false);
    } catch (error: any) {
      console.error('❌ 데이터 로드 실패:', error);
      toast.error(`데이터 로드 실패: ${error.message}`);
      setLoading(false);
    }
  }, [user, activeTab, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 검색 필터링
  const filteredTransactions = transactions.filter(t => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      t.users?.username?.toLowerCase().includes(query) ||
      t.users?.nickname?.toLowerCase().includes(query) ||
      t.id.toLowerCase().includes(query)
    );
  });

  // 상태 텍스트 변환
  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: '대기 중',
      approved: '승인됨',
      rejected: '거부됨',
      processing: '처리 중',
      completed: '완료',
      failed: '실패'
    };
    return statusMap[status] || status;
  };

  // 거래 유형 텍스트 변환
  const getTransactionTypeText = (type: string) => {
    return TRANSACTION_CONFIG[type as TransactionType]?.label || type;
  };

  return (
    <div className="space-y-6 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl">입출금 관리</h1>
          <p className="text-gray-400 mt-1">회원 입출금 신청 및 처리 관리</p>
        </div>
        <Button onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 총 입금 */}
        <Card className="bg-gradient-to-br from-green-600 to-green-700 border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-green-100 mb-2">
                  <ArrowDownCircle className="w-5 h-5" />
                  <span className="text-sm">총 입금</span>
                </div>
                <div className="text-3xl text-white">
                  {formatCurrency(stats.totalDeposit)}
                </div>
                <div className="text-green-100 text-sm mt-1">오늘 입금액</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 총 출금 */}
        <Card className="bg-gradient-to-br from-red-600 to-red-700 border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-red-100 mb-2">
                  <ArrowUpCircle className="w-5 h-5" />
                  <span className="text-sm">총 출금</span>
                </div>
                <div className="text-3xl text-white">
                  {formatCurrency(stats.totalWithdrawal)}
                </div>
                <div className="text-red-100 text-sm mt-1">오늘 출금액</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 입금 신청 */}
        <Card className="bg-gradient-to-br from-orange-600 to-orange-700 border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-orange-100 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">입금 신청</span>
                </div>
                <div className="text-3xl text-white">
                  {stats.pendingDeposits}건
                </div>
                <div className="text-orange-100 text-sm mt-1">대기 중</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 출금 신청 */}
        <Card className="bg-gradient-to-br from-orange-500 to-red-600 border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-orange-100 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">출금 신청</span>
                </div>
                <div className="text-3xl text-white">
                  {stats.pendingWithdrawals}건
                </div>
                <div className="text-orange-100 text-sm mt-1">대기 중</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 탭과 테이블 */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-slate-700/50 mb-6">
              <TabsTrigger value="deposit" className="data-[state=active]:bg-purple-600">
                입금 신청
              </TabsTrigger>
              <TabsTrigger value="withdrawal" className="data-[state=active]:bg-purple-600">
                출금 신청
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-purple-600">
                전체입출금내역
              </TabsTrigger>
            </TabsList>

            {/* 필터 영역 */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">전체 상태</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40 bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="pending">대기 중</SelectItem>
                    <SelectItem value="approved">승인됨</SelectItem>
                    <SelectItem value="rejected">거부됨</SelectItem>
                    <SelectItem value="completed">완료</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1" />

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-slate-700 border-slate-600 w-64"
                  />
                </div>
                <Button onClick={fetchData} variant="outline" size="icon">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* 테이블 */}
            <TabsContent value={activeTab} className="mt-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-700">
                    <tr className="text-gray-400 text-sm">
                      <th className="text-left p-3">거래 일시</th>
                      <th className="text-left p-3">회원</th>
                      <th className="text-left p-3">거래 유형</th>
                      <th className="text-right p-3">금액</th>
                      <th className="text-right p-3">변경 전 보유금</th>
                      <th className="text-center p-3">상태</th>
                      <th className="text-left p-3">메모</th>
                      <th className="text-left p-3">처리자</th>
                      <th className="text-center p-3">처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="text-center p-8 text-gray-400">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                          로딩 중...
                        </td>
                      </tr>
                    ) : filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center p-8 text-gray-400">
                          표시할 데이터가 없습니다
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="p-3 text-sm font-asiahead">
                            {new Date(transaction.created_at).toLocaleString('ko-KR')}
                          </td>
                          <td className="p-3">
                            <div>
                              <div className="text-sm font-asiahead">{transaction.users?.username || '-'}</div>
                              <div className="text-xs text-gray-400 font-asiahead">{transaction.users?.nickname || '-'}</div>
                            </div>
                          </td>
                          <td className="p-3 text-sm font-asiahead">
                            {getTransactionTypeText(transaction.transaction_type)}
                          </td>
                          <td className="p-3 text-right font-asiahead">
                            {formatCurrency(transaction.amount)}
                          </td>
                          <td className="p-3 text-right text-sm text-gray-400 font-asiahead">
                            {transaction.balance_before ? formatCurrency(transaction.balance_before) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-asiahead ${
                                transaction.status === 'pending'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : transaction.status === 'approved' || transaction.status === 'completed'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {getStatusText(transaction.status)}
                            </span>
                          </td>
                          <td className="p-3 text-sm text-gray-400 font-asiahead">
                            {transaction.memo || '-'}
                          </td>
                          <td className="p-3 text-sm text-gray-400 font-asiahead">
                            {transaction.processors?.username || '-'}
                          </td>
                          <td className="p-3 text-center">
                            {transaction.status === 'pending' && (
                              <div className="flex items-center gap-2 justify-center">
                                <Button size="sm" variant="outline" className="bg-green-600 hover:bg-green-700 border-0">
                                  승인
                                </Button>
                                <Button size="sm" variant="outline" className="bg-red-600 hover:bg-red-700 border-0">
                                  거부
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default TransactionApprovalManager;