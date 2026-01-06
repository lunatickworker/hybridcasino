import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { DataTable } from "../common/DataTable";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner@2.0.3";
import { CreditCard, ArrowUpDown, DollarSign, Search, Calendar } from "lucide-react";
import { MetricCard } from "./MetricCard";
import { useLanguage } from "../../contexts/LanguageContext";

interface PartnerTransaction {
  id: string;
  partner_id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  from_partner_id: string | null;
  to_partner_id: string | null;
  processed_by: string | null;
  memo: string | null;
  api_type?: string | null;
  created_at: string;
  from_partner?: {
    username: string;
    nickname: string;
    partner_type: string;
  };
  to_partner?: {
    username: string;
    nickname: string;
    partner_type: string;
  };
}

export function PartnerTransactions() {
  const { authState } = useAuth();
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todayDeposits: 0,
    todayWithdrawals: 0,
    netTransfer: 0
  });
  
  // 필터 상태
  const [sortOrder, setSortOrder] = useState<string>('latest');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // 파트너 간 거래 내역 조회
  const fetchTransactions = async () => {
    try {
      setLoading(true);

      if (!authState.isAuthenticated || !authState.user) {
        setTransactions([]);
        return;
      }

      // ✅ 파트너 입출금 내역 조회 (from/to가 null이어도 포함)
      let query = supabase
        .from('partner_balance_logs')
        .select('*')
        .in('transaction_type', ['deposit', 'withdrawal']);

      // 시스템관리자(level 1)가 아닌 경우 자신과 연관된 내역만 필터링
      if (authState.user.level !== 1) {
        const currentPartnerId = authState.user.id;
        // ✅ partner_id, from_partner_id, to_partner_id 중 하나라도 자신이면 조회
        query = query.or(`partner_id.eq.${currentPartnerId},from_partner_id.eq.${currentPartnerId},to_partner_id.eq.${currentPartnerId}`);
      }

      // 날짜 필터 적용
      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59`);
      }

      const { data: logsData, error } = await query
        .order('created_at', { ascending: sortOrder === 'oldest' })
        .limit(1000);

      console.log('🔍 [PartnerTransactions] 조회 결과:', {
        count: logsData?.length || 0,
        currentPartnerId: authState.user.level !== 1 ? authState.user.id : 'ALL',
        userLevel: authState.user.level,
        startDate,
        endDate,
        sample: logsData?.slice(0, 2).map(d => ({
          id: d.id,
          partner_id: d.partner_id,
          from_partner_id: d.from_partner_id,
          to_partner_id: d.to_partner_id,
          transaction_type: d.transaction_type,
          amount: d.amount,
          created_at: d.created_at
        })),
        error
      });

      if (error) {
        console.error('partner_balance_logs 조회 오류:', error);
        throw error;
      }

      if (!logsData || logsData.length === 0) {
        setTransactions([]);
        setStats({
          todayDeposits: 0,
          todayWithdrawals: 0,
          netTransfer: 0
        });
        return;
      }

      // 관련된 모든 파트너 ID 수집
      const allPartnerIds = new Set<string>();
      logsData.forEach(log => {
        if (log.from_partner_id) allPartnerIds.add(log.from_partner_id);
        if (log.to_partner_id) allPartnerIds.add(log.to_partner_id);
      });

      // 파트너 정보 일괄 조회
      const { data: partnersData, error: partnersError } = await supabase
        .from('partners')
        .select('id, username, nickname, partner_type')
        .in('id', Array.from(allPartnerIds));

      if (partnersError) {
        console.error('partners 조회 오류:', partnersError);
      }

      // 파트너 정보를 Map으로 변환
      const partnersMap = new Map(
        (partnersData || []).map(p => [p.id, p])
      );

      // 데이터 조합
      const formattedData: PartnerTransaction[] = logsData.map(log => ({
        id: log.id,
        partner_id: log.partner_id,
        transaction_type: log.transaction_type || '',
        amount: log.amount || 0,
        balance_before: log.balance_before || 0,
        balance_after: log.balance_after || 0,
        from_partner_id: log.from_partner_id || null,
        to_partner_id: log.to_partner_id || null,
        processed_by: log.processed_by || null,
        memo: log.memo || null,
        created_at: log.created_at,
        from_partner: log.from_partner_id ? partnersMap.get(log.from_partner_id) : undefined,
        to_partner: log.to_partner_id ? partnersMap.get(log.to_partner_id) : undefined
      }));

      setTransactions(formattedData);

      // 오늘 통계 계산
      const today = new Date().toISOString().split('T')[0];
      const todayTransactions = formattedData.filter(t => 
        t.created_at && t.created_at.startsWith(today)
      );

      const deposits = todayTransactions
        .filter(t => t.transaction_type === 'deposit')
        .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

      const withdrawals = todayTransactions
        .filter(t => t.transaction_type === 'withdrawal')
        .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

      setStats({
        todayDeposits: deposits,
        todayWithdrawals: withdrawals,
        netTransfer: deposits - withdrawals
      });
    } catch (error) {
      console.error('파트너 거래 내역 조회 오류:', error);
      toast.error(t.partnerTransactions.loadFailed);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [sortOrder, startDate, endDate]);

  useEffect(() => {
    // Realtime 구독 - partner_balance_logs 테이블 변경 감지
    const channel = supabase
      .channel('partner_balance_logs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'partner_balance_logs'
        },
        () => {
          console.log('파트너 보유금 변경 감지 - 목록 새로고침');
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 거래 유형 표시
  const getTransactionTypeBadge = (type: string) => {
    const badgeStyles: { [key: string]: { text: string; className: string } } = {
      deposit: { 
        text: t.partnerTransactions.deposit, 
        className: 'px-3 py-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/50 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
      },
      withdrawal: { 
        text: t.partnerTransactions.withdrawal, 
        className: 'px-3 py-1 bg-gradient-to-r from-rose-500/20 to-red-500/20 text-rose-400 border border-rose-500/50 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]' 
      },
      admin_adjustment: { 
        text: t.partnerTransactions.adminAdjustment, 
        className: 'px-3 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/50 rounded-full shadow-[0_0_10px_rgba(251,146,60,0.5)]' 
      },
      commission: { 
        text: t.partnerTransactions.commission, 
        className: 'px-3 py-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 border border-blue-500/50 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]' 
      },
      refund: { 
        text: t.partnerTransactions.refund, 
        className: 'px-3 py-1 bg-gradient-to-r from-purple-500/20 to-violet-500/20 text-purple-400 border border-purple-500/50 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]' 
      }
    };
    
    const typeInfo = badgeStyles[type] || { 
      text: type, 
      className: 'px-3 py-1 bg-slate-500/20 text-slate-400 border border-slate-500/50 rounded-full' 
    };
    return <Badge className={typeInfo.className}>{typeInfo.text}</Badge>;
  };

  // 파트너 타입 표시
  const getPartnerTypeBadge = (partnerType: string) => {
    const typeMap: { [key: string]: { text: string; className: string } } = {
      system_admin: { text: t.partnerManagement.systemAdmin, className: 'bg-purple-500/20 text-purple-400 border-purple-500/50' },
      head_office: { text: t.partnerManagement.headOffice, className: 'bg-red-500/20 text-red-400 border-red-500/50' },
      main_office: { text: t.partnerManagement.mainOffice, className: 'bg-orange-500/20 text-orange-400 border-orange-500/50' },
      sub_office: { text: t.partnerManagement.subOffice, className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' },
      distributor: { text: t.partnerManagement.distributor, className: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
      store: { text: t.partnerManagement.store, className: 'bg-green-500/20 text-green-400 border-green-500/50' }
    };
    
    const type = typeMap[partnerType] || { text: partnerType, className: 'bg-slate-500/20 text-slate-400 border-slate-500/50' };
    return <Badge className={`${type.className} border text-xs`}>{type.text}</Badge>;
  };

  // 테이블 컬럼 정의
  const columns = [
    {
      key: 'created_at',
      header: '날짜일시',
      cell: (row: PartnerTransaction) => {
        if (!row.created_at) {
          return (
            <div className="text-slate-400 text-xl whitespace-nowrap">
              날짜 없음
            </div>
          );
        }
        const date = new Date(row.created_at);
        // 유효한 날짜인지 확인
        if (isNaN(date.getTime())) {
          return (
            <div className="text-slate-400 text-xl whitespace-nowrap">
              날짜 없음
            </div>
          );
        }
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return (
          <div className="text-slate-400 text-xl whitespace-nowrap">
            {year}. {month.toString().padStart(2, '0')}. {day.toString().padStart(2, '0')}. {hours}:{minutes}
          </div>
        );
      }
    },
    {
      key: 'transaction_type',
      header: t.partnerTransactions.transactionType,
      cell: (row: PartnerTransaction) => (
        <div className="flex flex-col gap-1">
          {getTransactionTypeBadge(row.transaction_type)}
          {row.api_type && (
            <Badge className={`px-3 py-1.5 text-base ${
              row.api_type === 'invest' 
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' 
                : 'bg-purple-500/20 text-purple-400 border-purple-500/50'
            } border rounded-full`}>
              {row.api_type === 'invest' ? 'Invest' : 'OroPlay'}
            </Badge>
          )}
        </div>
      )
    },
    {
      key: 'from_partner',
      header: t.partnerTransactions.sender,
      cell: (row: PartnerTransaction) => {
        if (!row.from_partner) return <span className="text-slate-600">-</span>;
        return (
          <div className="text-xl text-slate-200">
            {row.from_partner.nickname || row.from_partner.username}
          </div>
        );
      }
    },
    {
      key: 'arrow',
      header: '',
      cell: () => <span className="text-slate-500 text-2xl">→</span>
    },
    {
      key: 'to_partner',
      header: t.partnerTransactions.recipient,
      cell: (row: PartnerTransaction) => {
        if (!row.to_partner) return <span className="text-slate-600">-</span>;
        return (
          <div className="text-xl text-slate-200">
            {row.to_partner.nickname || row.to_partner.username}
          </div>
        );
      }
    },
    {
      key: 'amount',
      header: t.partnerTransactions.amount,
      cell: (row: PartnerTransaction) => {
        const isPositive = row.transaction_type === 'deposit';
        return (
          <div className={`font-mono text-xl ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : ''}{Math.abs(row.amount).toLocaleString()}원
          </div>
        );
      }
    },
    {
      key: 'balance_before',
      header: t.partnerTransactions.balanceBefore,
      cell: (row: PartnerTransaction) => (
        <div className="font-mono text-slate-400 text-xl">
          {row.balance_before.toLocaleString()}원
        </div>
      )
    },
    {
      key: 'balance_after',
      header: t.partnerTransactions.balanceAfter,
      cell: (row: PartnerTransaction) => (
        <div className="font-mono text-cyan-400 text-xl">
          {row.balance_after.toLocaleString()}원
        </div>
      )
    },
    {
      key: 'memo',
      header: t.partnerTransactions.memo,
      cell: (row: PartnerTransaction) => {
        // 대괄호와 그 안의 내용 모두 제거
        const cleanMemo = row.memo ? row.memo.replace(/\[.*?\]/g, '').trim() : '-';
        return (
          <div className="max-w-[250px] text-xl text-slate-400 truncate" title={cleanMemo}>
            {cleanMemo || '-'}
          </div>
        );
      }
    }
  ];

  // 검색 및 필터링된 데이터
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;
    
    // 거래 유형 필터
    if (typeFilter !== 'all') {
      filtered = filtered.filter(t => t.transaction_type === typeFilter);
    }
    
    // 검색어 필터
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(t => {
        const fromName = t.from_partner?.nickname || t.from_partner?.username || '';
        const toName = t.to_partner?.nickname || t.to_partner?.username || '';
        const memo = t.memo || '';
        const amount = t.amount.toString();
        
        return (
          fromName.toLowerCase().includes(term) ||
          toName.toLowerCase().includes(term) ||
          memo.toLowerCase().includes(term) ||
          amount.includes(term)
        );
      });
    }
    
    return filtered;
  }, [transactions, searchTerm, typeFilter]);

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-cyan-400" />
            {t.partnerTransactions.title}
          </h1>
          <p className="text-muted-foreground">
            {t.partnerTransactions.subtitle}
          </p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-3">
        <MetricCard
          title={t.partnerTransactions.todayDeposit}
          value={`${stats.todayDeposits.toLocaleString()}원`}
          subtitle={t.partnerTransactions.depositTotal}
          icon={ArrowUpDown}
          color="green"
        />

        <MetricCard
          title={t.partnerTransactions.todayWithdrawal}
          value={`${stats.todayWithdrawals.toLocaleString()}원`}
          subtitle={t.partnerTransactions.withdrawalTotal}
          icon={ArrowUpDown}
          color="red"
        />

        <MetricCard
          title={t.partnerTransactions.netTransfer}
          value={`${stats.netTransfer.toLocaleString()}원`}
          subtitle={t.partnerTransactions.depositMinusWithdrawal}
          icon={DollarSign}
          color="cyan"
        />
      </div>

      {/* 파트너 입출금 내역 */}
      <div className="glass-card rounded-xl p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <Calendar className="h-8 w-8 text-slate-400" />
            <h3 className="text-2xl font-semibold text-slate-100">{t.partnerTransactions.title}</h3>
          </div>
        </div>

        {/* 필터 영역 */}
        <div className="flex items-center gap-3 mb-6">
          {/* 기간 정렬 */}
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="w-[140px] input-premium">
              <SelectValue placeholder={t.partnerTransactions.period} />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="latest">{t.partnerTransactions.latest}</SelectItem>
              <SelectItem value="oldest">{t.partnerTransactions.oldest}</SelectItem>
            </SelectContent>
          </Select>

          {/* 날짜 범위 */}
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-[160px] input-premium"
            placeholder={t.partnerTransactions.startDate}
          />
          <span className="text-slate-500">-</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-[160px] input-premium"
            placeholder={t.partnerTransactions.endDate}
          />

          {/* 구분 필터 */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] input-premium">
              <SelectValue placeholder={t.partnerTransactions.type} />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">{t.partnerTransactions.allTypes}</SelectItem>
              <SelectItem value="deposit">{t.partnerTransactions.deposit}</SelectItem>
              <SelectItem value="withdrawal">{t.partnerTransactions.withdrawal}</SelectItem>
              <SelectItem value="admin_adjustment">{t.partnerTransactions.adminAdjustment}</SelectItem>
              <SelectItem value="commission">{t.partnerTransactions.commission}</SelectItem>
              <SelectItem value="refund">{t.partnerTransactions.refund}</SelectItem>
            </SelectContent>
          </Select>

          {/* 검색 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-6 w-6 text-slate-400" />
            <Input
              placeholder={t.partnerTransactions.searchPlaceholder}
              className="pl-10 input-premium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        {/* 테이블 */}
        <DataTable 
          columns={columns} 
          data={filteredTransactions}
          searchable={false}
          loading={loading}
          emptyMessage={t.partnerTransactions.noData}
          rowKey="id"
        />
      </div>
    </div>
  );
}