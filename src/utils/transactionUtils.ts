/**
 * Transaction 유틸 함수
 */

import {
  TransactionType,
  TRANSACTION_CONFIG,
  TRANSACTION_TABLE_TYPES,
  PARTNER_BALANCE_TABLE_TYPES,
  COMPLETED_TYPES,
  PENDING_TYPES
} from './transactions';

// ============================================================================
// 1️⃣ 거래 타입 검증
// ============================================================================

/** 거래 타입이 유효한가 */
export function isValidTransactionType(type: any): type is TransactionType {
  return Object.keys(TRANSACTION_CONFIG).includes(type);
}

/** 거래 타입이 transactions 테이블인가 */
export function isTransactionTableType(type: TransactionType): boolean {
  return TRANSACTION_TABLE_TYPES.includes(type);
}

/** 거래 타입이 partner_balance_logs 테이블인가 */
export function isPartnerBalanceTableType(type: TransactionType): boolean {
  return PARTNER_BALANCE_TABLE_TYPES.includes(type);
}

// ============================================================================
// 2️⃣ 거래 상태 검증
// ============================================================================

/** 이미 완료된 거래인가 (승인 불가) */
export function isCompletedType(type: TransactionType): boolean {
  return COMPLETED_TYPES.includes(type);
}

/** 승인 대기 중인 거래인가 */
export function isPendingType(type: TransactionType): boolean {
  return PENDING_TYPES.includes(type);
}

// ============================================================================
// 3️⃣ 거래 정보 조회
// ============================================================================

/** 거래 타입의 한국어 라벨 */
export function getTransactionLabel(type: TransactionType): string {
  return TRANSACTION_CONFIG[type].label;
}

/** 거래 타입의 설명 */
export function getTransactionDescription(type: TransactionType): string {
  return TRANSACTION_CONFIG[type].description;
}

/** 거래 타입의 기본 상태 */
export function getTransactionDefaultStatus(type: TransactionType): 'pending' | 'completed' {
  return TRANSACTION_CONFIG[type].defaultStatus;
}

/** 거래 타입이 어느 테이블에 속하는가 */
export function getTransactionTable(type: TransactionType): 'transactions' | 'partner_balance_logs' {
  return TRANSACTION_CONFIG[type].table;
}

// ============================================================================
// 4️⃣ 거래 필터링
// ============================================================================

/** 테이블별로 거래 타입 필터링 */
export function filterTransactionsByTable(
  types: TransactionType[],
  table: 'transactions' | 'partner_balance_logs'
): TransactionType[] {
  return types.filter(type => TRANSACTION_CONFIG[type].table === table);
}

/** 상태별로 거래 타입 필터링 */
export function filterTransactionsByStatus(
  types: TransactionType[],
  status: 'pending' | 'completed'
): TransactionType[] {
  return types.filter(type => TRANSACTION_CONFIG[type].defaultStatus === status);
}
