/**
 * Transaction Type 시스템 (14가지 타입)
 * TRANSACTION_TYPE_FINAL.md 기반
 */

// ============================================================================
// 1️⃣ 거래 타입 (14가지)
// ============================================================================

export type TransactionType =
  // 회원 입출금
  | 'deposit'                    // 온라인 입금신청
  | 'withdrawal'                 // 온라인 출금신청
  // 파트너→회원 직접 지급/회수
  | 'admin_deposit'              // 수동 충전
  | 'admin_withdrawal'           // 수동 환전
  // Lv2↔Lv3+ 파트너 거래
  | 'admin_deposit_send'         // 파트너 충전
  | 'admin_withdrawal_send'      // 파트너 환전
  // Lv3+↔직속하위 파트너 거래
  | 'partner_deposit'            // 파트너 충전
  | 'partner_withdrawal'         // 파트너 환전
  // Lv3+→Lv2 요청 & 승인
  | 'partner_deposit_request'    // 온라인 입금요청
  | 'partner_withdrawal_request' // 온라인 출금요청
  // 시스템 거래
  | 'admin_adjustment'           // 시스템 조정
  | 'commission'                 // 커미션
  | 'refund'                     // 환불
  | 'point_conversion';          // 포인트 전환

// ============================================================================
// 2️⃣ 거래 타입별 설정
// ============================================================================

interface TransactionConfig {
  table: 'transactions' | 'partner_balance_logs';
  defaultStatus: 'completed' | 'pending';
  label: string;
  description: string;
}

export const TRANSACTION_CONFIG: Record<TransactionType, TransactionConfig> = {
  // 회원 입출금
  deposit: { table: 'transactions', defaultStatus: 'pending', label: '온라인 입금신청', description: '회원이 온라인 입금 신청' },
  withdrawal: { table: 'transactions', defaultStatus: 'pending', label: '온라인 출금신청', description: '회원이 온라인 출금 신청' },
  
  // 파트너→회원 직접 지급/회수
  admin_deposit: { table: 'transactions', defaultStatus: 'completed', label: '수동 충전', description: '파트너가 회원에게 보유금 수동 충전' },
  admin_withdrawal: { table: 'transactions', defaultStatus: 'completed', label: '수동 환전', description: '파트너가 회원에게 보유금 수동 환전' },
  
  // Lv2↔Lv3+ 파트너 거래
  admin_deposit_send: { table: 'partner_balance_logs', defaultStatus: 'completed', label: '수동 충전', description: 'Lv2이 Lv3+에게 입금 전송' },
  admin_withdrawal_send: { table: 'partner_balance_logs', defaultStatus: 'completed', label: '수동 환전', description: 'Lv2이 Lv3+에게 출금 전송' },
  
  // Lv3+↔직속하위 파트너 거래
  partner_deposit: { table: 'partner_balance_logs', defaultStatus: 'completed', label: '파트너 충전', description: 'Lv3+이 직속 하위에게 입금' },
  partner_withdrawal: { table: 'partner_balance_logs', defaultStatus: 'completed', label: '파트너 환전', description: 'Lv3+이 직속 하위에게 출금' },
  
  // Lv3+→Lv2 요청 & 승인
  partner_deposit_request: { table: 'transactions', defaultStatus: 'pending', label: '온라인 입금요청', description: 'Lv3+ 파트너가 Lv2에게 입금 요청' },
  partner_withdrawal_request: { table: 'transactions', defaultStatus: 'pending', label: '온라인 출금요청', description: 'Lv3+ 파트너가 Lv2에게 출금 요청' },
  
  // 시스템 거래
  commission: { table: 'partner_balance_logs', defaultStatus: 'completed', label: '커미션', description: '시스템 수수료 거래' },
  refund: { table: 'partner_balance_logs', defaultStatus: 'completed', label: '환불', description: '시스템 환불 거래' },
  point_conversion: { table: 'transactions', defaultStatus: 'completed', label: '포인트 전환', description: '포인트를 보유금으로 전환' }
};

// ============================================================================
// 3️⃣ 필터링 헬퍼
// ============================================================================

/** transactions 테이블에서 조회할 타입들 */
export const TRANSACTION_TABLE_TYPES: TransactionType[] = [
  'deposit',
  'withdrawal',
  'admin_deposit',
  'admin_withdrawal',
  'partner_deposit_request',
  'partner_withdrawal_request',
  'point_conversion'
];

/** partner_balance_logs 테이블에서 조회할 타입들 */
export const PARTNER_BALANCE_TABLE_TYPES: TransactionType[] = [
  'admin_deposit_send',
  'admin_withdrawal_send',
  'partner_deposit',
  'partner_withdrawal',
  'admin_adjustment',
  'commission',
  'refund'
];

/** 완료된 거래 (pending → completed 전환 불가) */
export const COMPLETED_TYPES: TransactionType[] = [
  'admin_deposit',
  'admin_withdrawal',
  'admin_deposit_send',
  'admin_withdrawal_send',
  'partner_deposit',
  'partner_withdrawal',
  'admin_adjustment',
  'commission',
  'refund',
  'point_conversion'
];

/** 승인 대기 중인 거래 */
export const PENDING_TYPES: TransactionType[] = [
  'deposit',
  'withdrawal',
  'partner_deposit_request',
  'partner_withdrawal_request'
];

// ============================================================================
// 4️⃣ 거래 인터페이스
// ============================================================================

export interface Transaction {
  id: string;
  transaction_type: TransactionType;
  user_id?: string;
  partner_id?: string;
  from_partner_id?: string;
  to_partner_id?: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  memo?: string;
  created_at: string;
  updated_at?: string;
  processed_by?: string;
  approved_at?: string;
}
