/**
 * 활동 로그 사용 예시
 * 실제 컴포넌트에서 이렇게 사용하세요
 */

import { 
  logDepositAction,
  logWithdrawalAction,
  logUserUpdate,
  logBalanceChange,
  logGameForceEnd
} from './activityLogger';

// ============================================
// 예시 1: 입금 승인 시
// ============================================
export async function exampleDepositApprove(
  adminId: string,
  transaction: any
) {
  try {
    // 1. 입금 승인 로직 실행
    // ... 실제 입금 승인 코드 ...

    // 2. 로그 기록
    await logDepositAction(
      adminId,
      transaction.id,
      transaction.user_id,
      'approve',
      transaction.amount
    );
  } catch (error) {
    console.error('입금 승인 실패:', error);
  }
}

// ============================================
// 예시 2: 출금 거부 시
// ============================================
export async function exampleWithdrawalReject(
  adminId: string,
  transaction: any
) {
  try {
    // 1. 출금 거부 로직 실행
    // ... 실제 출금 거부 코드 ...

    // 2. 로그 기록
    await logWithdrawalAction(
      adminId,
      transaction.id,
      transaction.user_id,
      'reject',
      transaction.amount
    );
  } catch (error) {
    console.error('출금 거부 실패:', error);
  }
}

// ============================================
// 예시 3: 회원 정보 수정 시
// ============================================
export async function exampleUserUpdate(
  adminId: string,
  userId: string,
  oldData: any,
  newData: any
) {
  try {
    // 1. 변경된 필드만 추출
    const changes: Record<string, any> = {};
    Object.keys(newData).forEach(key => {
      if (oldData[key] !== newData[key]) {
        changes[key] = newData[key];
      }
    });

    // 2. 회원 정보 업데이트
    // ... 실제 업데이트 코드 ...

    // 3. 로그 기록
    await logUserUpdate(adminId, userId, changes);
  } catch (error) {
    console.error('회원 정보 수정 실패:', error);
  }
}

// ============================================
// 예시 4: 머니 지급 시
// ============================================
export async function exampleBalanceIncrease(
  adminId: string,
  userId: string,
  amount: number,
  reason: string
) {
  try {
    // 1. 현재 잔고 조회
    const { data: userData } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    const beforeBalance = userData?.balance || 0;

    // 2. 머니 지급
    // ... 실제 머니 지급 코드 ...

    const afterBalance = beforeBalance + amount;

    // 3. 로그 기록
    await logBalanceChange(
      adminId,
      userId,
      'user',
      amount,
      beforeBalance,
      afterBalance,
      reason
    );
  } catch (error) {
    console.error('머니 지급 실패:', error);
  }
}

// ============================================
// 예시 5: 게임 강제 종료 시
// ============================================
export async function exampleGameForceEnd(
  adminId: string,
  session: any
) {
  try {
    // 1. 게임 강제 종료 로직
    // ... 실제 강제 종료 코드 ...

    // 2. 로그 기록
    await logGameForceEnd(
      adminId,
      session.session_id,
      session.user_id,
      session.game_id
    );
  } catch (error) {
    console.error('게임 강제 종료 실패:', error);
  }
}

// ============================================
// TransactionManagement.tsx에서 사용하는 방법
// ============================================
/*
import { logDepositAction, logWithdrawalAction } from '../../lib/activityLogger';

// 입금 승인 핸들러 내부
const handleApproveDeposit = async (transaction: Transaction) => {
  try {
    // ... 기존 승인 로직 ...
    
    // 로그 기록 추가
    await logDepositAction(
      user.id,
      transaction.id,
      transaction.user_id,
      'approve',
      transaction.amount
    );
    
    toast.success('입금 승인 완료');
  } catch (error) {
    console.error('입금 승인 실패:', error);
    toast.error('입금 승인 실패');
  }
};

// 출금 승인 핸들러 내부
const handleApproveWithdrawal = async (transaction: Transaction) => {
  try {
    // ... 기존 승인 로직 ...
    
    // 로그 기록 추가
    await logWithdrawalAction(
      user.id,
      transaction.id,
      transaction.user_id,
      'approve',
      transaction.amount
    );
    
    toast.success('출금 승인 완료');
  } catch (error) {
    console.error('출금 승인 실패:', error);
    toast.error('출금 승인 실패');
  }
};
*/

// Supabase import (예시에서 사용)
import { supabase } from './supabase';
