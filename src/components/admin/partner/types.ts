export interface Partner {
  id: string;
  username: string;
  nickname: string;
  partner_type: 'system_admin' | 'head_office' | 'main_office' | 'sub_office' | 'distributor' | 'store';
  parent_id?: string;
  parent_nickname?: string;
  level: number;
  status: 'active' | 'inactive' | 'blocked';
  balance: number;
  commission_rolling: number;
  commission_losing: number;
  withdrawal_fee: number;
  min_withdrawal_amount?: number;
  max_withdrawal_amount?: number;
  daily_withdrawal_limit?: number;
  bank_name?: string;
  bank_account?: string;
  bank_holder?: string;
  last_login_at?: string;
  created_at: string;
  child_count?: number;
  user_count?: number;
  // Lv1(시스템관리자)용 API별 잔고
  invest_balance?: number;
  oroplay_balance?: number;
}

export const partnerTypeColors = {
  system_admin: 'bg-purple-500',
  head_office: 'bg-red-500',
  main_office: 'bg-orange-500',
  sub_office: 'bg-yellow-500',
  distributor: 'bg-blue-500',
  store: 'bg-green-500'
};

export const statusColors = {
  active: 'bg-green-500',
  inactive: 'bg-gray-500',
  blocked: 'bg-red-500'
};

export type TransferMode = 'deposit' | 'withdrawal';
export type ForceTransactionType = 'deposit' | 'withdrawal';
