import { useState, useEffect } from "react";
import { DataTable } from "../common/DataTable";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { TransactionBadge } from "../common/TransactionBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useLanguage } from "../../contexts/LanguageContext";
import { Partner } from "../../types";

interface PartnerTransactionManagementProps {
  user: Partner;
  activeTab: string;
  periodFilter: string;
  searchTerm: string;
  transactionTypeFilter: string;
  partnerTransactions: any[];
  loading: boolean;
}

export function TransactionManagementPartner({
  user,
  activeTab,
  periodFilter,
  searchTerm,
  transactionTypeFilter,
  partnerTransactions,
  loading
}: PartnerTransactionManagementProps) {
  const { t, formatCurrency } = useLanguage();
  const [filteredTransactions, setFilteredTransactions] = useState<any[]>([]);

  // Lv3+ 파트너 거래만 필터링 (Lv2 제외)
  useEffect(() => {
    if (!loading && partnerTransactions.length > 0) {
      // Lv2 제외: from_partner_level !== 2 && to_partner_level !== 2
      const lv3PlusTransactions = partnerTransactions.filter(pt => {
        // admin_deposit_send/admin_withdrawal_send는 Lv2컴포넌트에서 처리
        if (pt.transaction_type === 'admin_deposit_send' || pt.transaction_type === 'admin_withdrawal_send') {
          return false;
        }
        // Lv2 거래 제외
        if (pt.from_partner_level === 2 || pt.to_partner_level === 2) {
          return false;
        }
        return true;
      });

      setFilteredTransactions(lv3PlusTransactions);
      
      // 🔥 파트너 거래 상세 로그
      console.log('🔥 [파트너 거래 Lv3+ 필터링]:', {
        total: lv3PlusTransactions.length,
        myLevel: user.level,
        myId: user.id,
        types: Array.from(new Set(lv3PlusTransactions.map(t => t.transaction_type))),
        // 내가 받은 거래
        receivedCount: lv3PlusTransactions.filter(t => t.to_partner_id === user.id).length,
        // 내가 보낸 거래
        sentCount: lv3PlusTransactions.filter(t => t.from_partner_id === user.id && t.to_partner_id === null).length,
        details: lv3PlusTransactions.slice(0, 3).map(pt => ({
          type: pt.transaction_type,
          from_id: pt.from_partner_id,
          from_level: pt.from_partner_level,
          from_name: pt.from_partner_username,
          to_id: pt.to_partner_id,
          to_level: pt.to_partner_level,
          to_name: pt.to_partner_username,
          amount: pt.amount,
          relation: pt.to_partner_id === user.id ? '✓ 받는 거래' : (pt.from_partner_id === user.id ? '보낸 거래' : '관련 없음')
        }))
      });
    }
  }, [partnerTransactions, loading]);

  // 거래 테이블 컬럼 정의
  const getColumns = () => [
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
          {row.from_partner_username ? `${row.from_partner_username}[${row.from_partner_nickname || 'Lv' + row.from_partner_level}]` : '-'}
        </span>
      )
    },
    {
      header: '받는사람',
      cell: (row: any) => {
        // 🔥 "to" 거래: to_partner_id가 있으면 받는사람으로 표시
        if (row.to_partner_id === user.id) {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              {row.to_partner_username ? `${row.to_partner_username}[${row.to_partner_nickname || 'Lv' + row.to_partner_level}]` : '-'} (받음)
            </span>
          );
        }
        return (
          <span className="text-slate-300" style={{ fontSize: '15px' }}>
            {row.to_partner_username ? `${row.to_partner_username}[${row.to_partner_nickname || 'Lv' + row.to_partner_level}]` : '-'}
          </span>
        );
      }
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
        <span className="text-green-400">
          완료
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
          <CardTitle className="text-white">파트너 간 거래 (Lv3+)</CardTitle>
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
