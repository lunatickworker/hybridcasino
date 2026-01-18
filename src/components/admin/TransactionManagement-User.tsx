import { useState, useEffect } from "react";
import { DataTable } from "../common/DataTable";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { TransactionBadge } from "../common/TransactionBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useLanguage } from "../../contexts/LanguageContext";
import { supabase } from "../../lib/supabase";
import { Partner, Transaction, User } from "../../types";

interface UserTransactionManagementProps {
  user: Partner;
  activeTab: string;
  periodFilter: string;
  searchTerm: string;
  transactionTypeFilter: string;
  loading: boolean;
  transactions: Transaction[];
}

export function TransactionManagementUser({
  user,
  activeTab,
  periodFilter,
  searchTerm,
  transactionTypeFilter,
  loading,
  transactions
}: UserTransactionManagementProps) {
  const { t, formatCurrency } = useLanguage();
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);

  // 회원 거래만 필터링
  useEffect(() => {
    if (!loading) {
      // 이전 데이터로부터 회원 거래만 필터링
      const userTransactions = transactions.filter(t => 
        t.transaction_type === 'deposit' || 
        t.transaction_type === 'withdrawal' ||
        t.transaction_type === 'admin_deposit' ||
        t.transaction_type === 'admin_withdrawal'
      );
      
      setFilteredTransactions(userTransactions);
      
      console.log('📊 [회원 거래] 필터링 완료:', {
        total: userTransactions.length,
        types: Array.from(new Set(userTransactions.map(t => t.transaction_type)))
      });
    }
  }, [transactions, loading]);

  // 거래 테이블 컬럼 정의
  const getColumns = (showActions = false) => [
    {
      header: '거래일시',
      cell: (row: any) => (
        <span className="text-slate-300" style={{ fontSize: '15px' }}>
          {row.created_at ? new Date(row.created_at).toLocaleString('ko-KR') : '날짜 없음'}
        </span>
      )
    },
    {
      header: '아이디',
      cell: (row: any) => (
        <span className="text-slate-300" style={{ fontSize: '15px' }}>
          {row.id}
        </span>
      )
    },
    {
      header: '보낸사람',
      cell: (row: any) => (
        <span className="text-slate-300" style={{ fontSize: '15px' }}>
          {row.from_partner_username || row.partner_username || '-'}
        </span>
      )
    },
    {
      header: '받는사람',
      cell: (row: any) => (
        <span className="text-pink-400" style={{ fontSize: '15px' }}>
          {row.user?.username || row.to_partner_username || '-'}
        </span>
      )
    },
    {
      header: '거래유형',
      cell: (row: any) => <TransactionBadge type={row.transaction_type} />
    },
    {
      header: '금액',
      cell: (row: any) => (
        <span className={row.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
          {formatCurrency(row.amount)}
        </span>
      )
    },
    {
      header: '변경후 금액',
      cell: (row: any) => (
        <span className="text-slate-300">
          {formatCurrency(row.balance_after)}
        </span>
      )
    },
    {
      header: '상태',
      cell: (row: any) => (
        <span className={row.status === 'completed' ? 'text-green-400' : row.status === 'rejected' ? 'text-red-400' : 'text-yellow-400'}>
          {row.status}
        </span>
      )
    },
    {
      header: '메모',
      cell: (row: any) => (
        <span className="text-slate-400 text-sm max-w-xs truncate">
          {row.memo || '-'}
        </span>
      )
    }
  ];

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-white">회원 거래</CardTitle>
          <div className="text-sm text-slate-400">
            총 {filteredTransactions.length}건
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          searchable={false}
          columns={getColumns()}
          data={filteredTransactions}
          emptyMessage="거래 내역이 없습니다."
        />
      </CardContent>
    </Card>
  );
}
