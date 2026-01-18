import { useState, useEffect } from "react";
import { DataTable } from "../common/DataTable";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { TransactionBadge } from "../common/TransactionBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useLanguage } from "../../contexts/LanguageContext";
import { Partner } from "../../types";

interface Lv2TransactionManagementProps {
  user: Partner;
  activeTab: string;
  periodFilter: string;
  searchTerm: string;
  transactionTypeFilter: string;
  partnerTransactions: any[];
  loading: boolean;
}

export function TransactionManagementLv2({
  user,
  activeTab,
  periodFilter,
  searchTerm,
  transactionTypeFilter,
  partnerTransactions,
  loading
}: Lv2TransactionManagementProps) {
  const { t, formatCurrency } = useLanguage();
  const [filteredTransactions, setFilteredTransactions] = useState<any[]>([]);

  // Lv2 파트너 거래만 필터링
  useEffect(() => {
    if (!loading && partnerTransactions.length > 0) {
      // admin_deposit_send 또는 admin_withdrawal_send AND (from_partner_level === 2 OR to_partner_level === 2)
      const lv2Transactions = partnerTransactions.filter(pt => {
        // admin_deposit_send/admin_withdrawal_send만 대상
        if (pt.transaction_type !== 'admin_deposit_send' && pt.transaction_type !== 'admin_withdrawal_send') {
          return false;
        }
        // Lv2가 관련된 거래만
        if (pt.from_partner_level === 2 || pt.to_partner_level === 2) {
          return true;
        }
        return false;
      });

      setFilteredTransactions(lv2Transactions);
      
      // 🔥 Lv2 거래 상세 로그
      console.log('🔥 [Lv2 거래 필터링]:', {
        total: lv2Transactions.length,
        myLevel: user.level,
        myId: user.id,
        adminDepositSend: lv2Transactions.filter(t => t.transaction_type === 'admin_deposit_send').length,
        adminWithdrawalSend: lv2Transactions.filter(t => t.transaction_type === 'admin_withdrawal_send').length,
        // Lv2 관점에서 "받는 거래"인지 확인
        iReceivedCount: lv2Transactions.filter(t => t.to_partner_id === user.id).length,
        iSentCount: lv2Transactions.filter(t => t.from_partner_id === user.id).length,
        details: lv2Transactions.slice(0, 3).map(pt => ({
          type: pt.transaction_type,
          from_id: pt.from_partner_id,
          from_level: pt.from_partner_level,
          from_name: pt.from_partner_username,
          to_id: pt.to_partner_id,
          to_level: pt.to_partner_level,
          to_name: pt.to_partner_username,
          amount: pt.amount,
          is_to_me: pt.to_partner_id === user.id ? '✓ 받는 거래' : '송신 거래'
        }))
      });
    }
  }, [partnerTransactions, loading, user.id]);

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
      cell: (row: any) => {
        // 🔥 Lv2 특별 규칙: admin_withdrawal_send에서 from/to가 스왑됨
        // 따라서 표시상 from_partner_username이 보낸사람
        if (row.from_partner_id === user.id && user.level === 2) {
          return (
            <span className="text-cyan-400" style={{ fontSize: '15px' }}>
              나[Lv{row.from_partner_level}] (보냄)
            </span>
          );
        }
        return (
          <span className="text-slate-300" style={{ fontSize: '15px' }}>
            {row.from_partner_username ? `${row.from_partner_username}[Lv${row.from_partner_level}]` : '-'}
          </span>
        );
      }
    },
    {
      header: '받는사람',
      cell: (row: any) => {
        // 🔥 Lv2 특별 규칙: Lv2는 항상 "받는사람" (to_partner_id = Lv2)
        if (row.to_partner_id === user.id && user.level === 2) {
          return (
            <span className="text-pink-400" style={{ fontSize: '15px' }}>
              나[Lv{row.to_partner_level}] (받음) ✓
            </span>
          );
        }
        return (
          <span className="text-slate-300" style={{ fontSize: '15px' }}>
            {row.to_partner_username ? `${row.to_partner_username}[Lv${row.to_partner_level}]` : '-'}
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
          {formatCurrency(row.balance_after_total || row.balance_after)}
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
    },
    {
      header: '처리자',
      cell: (row: any) => (
        <span className="text-slate-400 text-sm">
          {row.processed_by_username || '-'}
        </span>
      )
    }
  ];

  if (loading) {
    return <LoadingSpinner />;
  }

  if (user.level === 2 && filteredTransactions.length === 0) {
    return (
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white">Lv2 운영자 거래</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-slate-400 py-8">
            Lv2 운영자 거래가 없습니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-white">Lv2 운영자 거래</CardTitle>
          <div className="text-sm text-slate-400">
            총 {filteredTransactions.length}건
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 p-2 bg-blue-900 rounded text-blue-200 text-sm">
          🔥 Lv2 규칙: Lv2는 모든 거래를 "받는 거래"로 표시됩니다 (to_partner_id = Lv2)
        </div>
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
