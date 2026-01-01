// 공통 타입 정의
export interface User {
  id: string;
  username: string;
  nickname: string;
  status: 'pending' | 'active' | 'blocked';
  balance: number;
  points: number;
  referrer_id?: string;
  vip_level: number;
  is_online: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at?: string;
  email?: string;
  phone?: string;
  bank_name?: string;
  bank_account?: string;
  bank_holder?: string;
}

export interface Partner {
  id: string;
  username: string;
  nickname: string;
  name?: string;
  partner_type: 'system_admin' | 'head_office' | 'main_office' | 'sub_office' | 'distributor' | 'store';
  level: number; // 1-6
  parent_id?: string;
  parent_chain?: string[];
  status: 'active' | 'inactive' | 'blocked';
  balance: number;
  opcode?: string;
  secret_key?: string;
  token?: string;
  api_token?: string;
  commission_rolling: number;
  commission_losing: number;
  // 카지노/슬롯 커미션 분리
  casino_rolling_commission?: number;
  casino_losing_commission?: number;
  slot_rolling_commission?: number;
  slot_losing_commission?: number;
  withdrawal_fee: number;
  last_login_at?: string;
  created_at: string;
  menu_permissions?: string[]; // 파트너별 허용된 메뉴 ID 배열
}

export interface Transaction {
  id: string;
  user_id: string;
  partner_id?: string;
  transaction_type: 'deposit' | 'withdrawal' | 'point_conversion' | 'admin_adjustment' | 'admin_deposit' | 'admin_withdrawal';
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  balance_before: number;
  balance_after: number;
  bank_name?: string;
  bank_account?: string;
  bank_holder?: string;
  memo?: string;
  processed_at?: string;
  external_response?: any;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    username: string;
    nickname: string;
    external_token?: string;
  };
  owner_partner?: {
    id: string;
    nickname: string;
    level: number;
  };
  processed_partner?: {
    id: string;
    nickname: string;
    level: number;
  };
}

export interface Settlement {
  id: string;
  partner_id: string;
  settlement_type: 'rolling' | 'losing';
  period_start: string;
  period_end: string;
  total_bet_amount: number;
  total_win_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: 'pending' | 'completed';
  processed_at?: string;
  created_at: string;
  partner?: {
    id: string;
    nickname: string;
    level: number;
  };
}

export interface GameRecord {
  id: string;
  external_txid: number;
  user_id: string;
  game_id: number;
  provider_id: number;
  bet_amount: number;
  win_amount: number;
  balance_before: number;
  balance_after: number;
  played_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  sender_type: 'user' | 'partner';
  sender_id: string;
  receiver_type: 'user' | 'partner';
  receiver_id: string;
  subject?: string;
  content: string;
  message_type: 'inquiry' | 'notice' | 'message';
  status: 'unread' | 'read' | 'replied';
  parent_id?: string;
  read_at?: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  partner_id: string;
  title: string;
  content: string;
  target_type: 'users' | 'partners' | 'all';
  target_level?: number;
  is_popup: boolean;
  is_pinned: boolean;
  status: 'active' | 'inactive';
  view_count: number;
  created_at: string;
}

export interface DashboardStats {
  total_users: number;
  total_balance: number;
  daily_deposit: number;
  daily_withdrawal: number;
  daily_net_deposit: number;
  casino_betting: number;
  slot_betting: number;
  total_betting: number;
  online_users: number;
  pending_approvals: number;
  pending_messages: number;
  pending_deposits: number;
  pending_withdrawals: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: Partner | null;
  token: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface GameProvider {
  id: number;
  provider_id?: number;
  name: string;
  name_ko?: string;  // 한국어 이름
  name_en?: string;  // 영어 이름
  api_type: 'invest' | 'oroplay';
  type: 'slot' | 'casino' | 'minigame';
  status: 'visible' | 'hidden' | 'maintenance';
  is_visible?: boolean;
  logo_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Game {
  id: string;
  game_id: number;
  provider_id: string;
  name: string;
  name_ko?: string;  // 한국어 이름
  name_en?: string;  // 영어 이름
  api_type: 'invest' | 'oroplay';
  type: 'slot' | 'casino' | 'minigame';
  status: 'visible' | 'hidden' | 'maintenance';
  is_visible?: boolean;
  thumbnail_url?: string;
  demo_available?: boolean;
  created_at?: string;
  updated_at?: string;
  // 조인된 제공사 정보
  provider_name_ko?: string;
  provider_name_en?: string;
}