/**
 * Transaction Badge 컴포넌트
 * 거래 타입을 보기 좋게 표시
 */

import React from 'react';
import { TransactionType, TRANSACTION_CONFIG } from '../../types/transactions';

interface TransactionBadgeProps {
  type: TransactionType;
  size?: 'sm' | 'md' | 'lg';
}

// 색상 매핑
const COLOR_MAP: Record<TransactionType, { bg: string; text: string; border: string }> = {
  deposit: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/50' },
  withdrawal: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/50' },
  admin_deposit: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
  admin_withdrawal: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
  admin_deposit_send: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50' },
  admin_withdrawal_send: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/50' },
  partner_deposit: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/50' },
  partner_withdrawal: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/50' },
  partner_deposit_request: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/50' },
  partner_withdrawal_request: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/50' },
  admin_adjustment: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/50' },
  commission: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50' },
  refund: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/50' }
};

export function TransactionBadge({ type, size = 'md' }: TransactionBadgeProps) {
  const config = TRANSACTION_CONFIG[type];
  const colors = COLOR_MAP[type];
  
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full
        ${colors.bg} ${colors.text} border ${colors.border}
        transition-all hover:scale-105 cursor-default
        ${sizeClasses[size]}
      `}
      title={config.description}
    >
      {config.label}
    </span>
  );
}

// Export 편의 함수
export function renderTransactionBadge(type: TransactionType, size?: 'sm' | 'md' | 'lg') {
  return <TransactionBadge type={type} size={size} />;
}
