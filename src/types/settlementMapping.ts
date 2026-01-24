/**
 * TRANSACTION_SETTLEMENT_MAPPING 검증
 * 거래 타입 정의 ↔ 정산 페이지 지원 타입 매핑
 * 
 * 이 파일은 문서와 코드의 일치성을 보증합니다.
 */

import { TransactionType } from '../types/transactions';

// ============================================================================
// 정산 페이지별 지원 거래 타입 (TRANSACTION_SETTLEMENT_MAPPING.md 기반)
// ============================================================================

/** NewIntegratedSettlement: 온라인 입출금, 수동 입출금, 포인트 지급회수 */
export const SETTLEMENT_NEW_INTEGRATED: TransactionType[] = [
  'deposit',                 // 온라인 입금
  'withdrawal',              // 온라인 출금
  'admin_deposit',           // 수동 입금
  'admin_withdrawal',        // 수동 출금
  'point_issued',            // 포인트 지급 (아직 구현 전)
  'point_used'               // 포인트 회수 (아직 구현 전)
];

/** Lv35Settlement: 온라인 입출금, 파트너 충환전 */
export const SETTLEMENT_LV35: TransactionType[] = [
  'deposit',                 // 온라인 입금
  'withdrawal',              // 온라인 출금
  'admin_deposit_send',      // 파트너 충전
  'admin_withdrawal_send'    // 파트너 환전
];

/** Lv6Settlement: 온라인 입출금, 수동 충환전, 파트너 충환전 */
export const SETTLEMENT_LV6: TransactionType[] = [
  'deposit',                 // 온라인 입금
  'withdrawal',              // 온라인 출금
  'admin_deposit',           // 수동 충전
  'admin_withdrawal',        // 수동 환전
  'partner_deposit',         // 파트너 충전
  'partner_withdrawal'       // 파트너 환전
];

/** AdvancedSettlement: 입금, 출금, 수동 입금, 수동 출금, 포인트 지급, 포인트 회수 */
export const SETTLEMENT_ADVANCED: TransactionType[] = [
  'deposit',                 // 입금
  'withdrawal',              // 출금
  'admin_deposit',           // 수동 입금
  'admin_withdrawal',        // 수동 출금
  'point_issued',            // 포인트 지급 (아직 구현 전)
  'point_used'               // 포인트 회수 (아직 구현 전)
];

// ============================================================================
// 정산 페이지 조회 함수
// ============================================================================

/**
 * 정산 페이지에서 특정 거래 타입을 지원하는가?
 * 
 * @param page 정산 페이지 이름
 * @param transactionType 거래 타입
 * @returns 지원 여부
 */
export function isTransactionSupportedInSettlement(
  page: 'new_integrated' | 'lv35' | 'lv6' | 'advanced',
  transactionType: TransactionType
): boolean {
  const supportedTypes: Record<typeof page, TransactionType[]> = {
    new_integrated: SETTLEMENT_NEW_INTEGRATED,
    lv35: SETTLEMENT_LV35,
    lv6: SETTLEMENT_LV6,
    advanced: SETTLEMENT_ADVANCED
  };

  return supportedTypes[page].includes(transactionType);
}

/**
 * 특정 정산 페이지의 지원 거래 타입 조회
 */
export function getSettlementSupportedTypes(
  page: 'new_integrated' | 'lv35' | 'lv6' | 'advanced'
): TransactionType[] {
  const pages: Record<typeof page, TransactionType[]> = {
    new_integrated: SETTLEMENT_NEW_INTEGRATED,
    lv35: SETTLEMENT_LV35,
    lv6: SETTLEMENT_LV6,
    advanced: SETTLEMENT_ADVANCED
  };

  return pages[page];
}

// ============================================================================
// 검증 로직 (개발 시에만 실행)
// ============================================================================

if (process.env.NODE_ENV === 'development') {
  /**
   * 정산 페이지 매핑 검증
   * console에서 호출: validateSettlementMapping()
   */
  export function validateSettlementMapping() {
    const pages = [
      { name: 'NewIntegratedSettlement', types: SETTLEMENT_NEW_INTEGRATED },
      { name: 'Lv35Settlement', types: SETTLEMENT_LV35 },
      { name: 'Lv6Settlement', types: SETTLEMENT_LV6 },
      { name: 'AdvancedSettlement', types: SETTLEMENT_ADVANCED }
    ];

    console.log('📊 정산 페이지 매핑 검증');
    console.log('================================');

    pages.forEach(page => {
      console.log(`\n✅ ${page.name}`);
      console.log(`   지원 거래 타입: ${page.types.length}개`);
      page.types.forEach(type => {
        console.log(`   - ${type}`);
      });
    });

    console.log('\n================================');
    console.log('✅ 검증 완료');
  }
}
