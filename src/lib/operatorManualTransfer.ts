/**
 * 운영사 수동충전/환전 통합 로직
 * 
 * 통합 대상 (6가지):
 * 1. admin_deposit (회원에게 입금)
 * 2. admin_withdrawal (회원에게 출금)
 * 3. admin_deposit_send (Lv2 → Lv3+ 입금)
 * 4. admin_withdrawal_send (Lv2 → Lv3+ 출금)
 * 5. partner_deposit (Lv3+ → 직속하위 입금)
 * 6. partner_withdrawal (Lv3+ → 직속하위 출금)
 * 
 * ✅ partner_balance_logs: 수신자(to_partner_id) 기준의 1개 로그만 저장
 * - 입금: amount = +양수
 * - 출금: amount = -음수
 */

import { supabase } from './supabase';

// ============================================================================
// 거래ID 생성 함수
// ============================================================================

/**
 * 거래ID 생성 (형식: trx-YYYYMMDD-0001)
 * 같은 거래의 sender/receiver 로그를 연결하는 고유 ID
 */
export async function generateTransactionId(): Promise<string> {
  try {
    // DB 함수 호출 (PostgreSQL의 generate_transaction_id() 함수)
    const { data, error } = await supabase
      .rpc('generate_transaction_id');

    if (error) {
      console.warn('DB 거래ID 생성 실패, 클라이언트에서 생성:', error);
      // Fallback: 클라이언트에서 직접 생성
      return generateTransactionIdClient();
    }

    return data as string;
  } catch (err) {
    console.warn('거래ID 생성 중 오류, 클라이언트에서 생성:', err);
    // Fallback: 클라이언트에서 직접 생성
    return generateTransactionIdClient();
  }
}

/**
 * 클라이언트에서 거래ID 생성 (Fallback)
 * 형식: trx-YYYYMMDD-0001
 */
function generateTransactionIdClient(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${date}`;
  
  // 현재 타임스탬프를 기반으로 시퀀스 생성 (밀리초 + 랜덤)
  const timestamp = now.getTime();
  const random = Math.floor(Math.random() * 10000);
  const seq = String(((timestamp % 10000) + random) % 10000).padStart(4, '0');
  
  return `trx-${dateStr}-${seq}`;
}

// ============================================================================
// 타입 정의
// ============================================================================

export type ManualTransferType = 'deposit' | 'withdrawal';

export type TargetType = 'user' | 'lv3_partner' | 'direct_child_partner';

export interface ManualTransferParams {
  /** 입금/출금 구분 */
  type: ManualTransferType;
  
  /** 대상 타입 (회원/파트너) */
  targetType: TargetType;
  
  /** 대상 ID (user_id 또는 partner_id) */
  targetId: string;
  
  /** 송신자 ID (파트너 ID) */
  senderId: string;
  
  /** 송신자 레벨 */
  senderLevel: number;
  
  /** 금액 */
  amount: number;
  
  /** 메모 */
  memo?: string;
  
  /** API 타입 (Lv1→Lv2 입금 시에만 필요) */
  apiType?: 'invest' | 'oroplay' | 'familyapi' | 'honorapi';
}

export interface ManualTransferResult {
  success: boolean;
  message: string;
  transactionId?: string;
  error?: string;
}

// ============================================================================
// 거래 타입 결정 함수
// ============================================================================

/**
 * 송신자/수신자 레벨에 따라 거래 타입 결정
 * 
 * admin_deposit: 파트너 → 회원 직접 입금
 * admin_withdrawal: 파트너 → 회원 직접 출금
 * admin_deposit_send: Lv2 → Lv3+ 입금
 * admin_withdrawal_send: Lv2 → Lv3+ 출금
 * partner_deposit: Lv3+ → 직속하위 입금
 * partner_withdrawal: Lv3+ → 직속하위 출금
 */
function getTransactionType(
  targetType: TargetType,
  transferType: ManualTransferType,
  senderLevel: number,
  receiverLevel?: number
): string {
  // 회원 대상: admin_deposit / admin_withdrawal
  if (targetType === 'user') {
    return transferType === 'deposit' ? 'admin_deposit' : 'admin_withdrawal';
  }

  // 파트너 대상: admin_deposit_send / partner_deposit 등
  if (targetType === 'lv3_partner') {
    // Lv2 → Lv3+: admin_deposit_send / admin_withdrawal_send
    if (senderLevel === 2) {
      return transferType === 'deposit' ? 'admin_deposit_send' : 'admin_withdrawal_send';
    }
  }

  if (targetType === 'direct_child_partner') {
    // Lv3+ → 직속하위: partner_deposit / partner_withdrawal
    return transferType === 'deposit' ? 'partner_deposit' : 'partner_withdrawal';
  }

  throw new Error(`Invalid target type: ${targetType}`);
}

/**
 * 거래가 저장될 테이블 결정
 */
function getTableName(targetType: TargetType): 'transactions' | 'partner_balance_logs' {
  return targetType === 'user' ? 'transactions' : 'partner_balance_logs';
}

// ============================================================================
// 보유금 검증 함수
// ============================================================================

/**
 * 송신자 보유금 검증
 */
async function validateSenderBalance(
  params: ManualTransferParams,
  senderData: any
): Promise<{ valid: boolean; message: string }> {
  const { type, amount, senderLevel } = params;

  if (type === 'withdrawal') {
    // 출금: 송신자 보유금 검증
    if (senderLevel === 1) {
      // Lv1: api_configs에서 조회
      const { data: apiConfigs, error } = await supabase
        .from('api_configs')
        .select('balance')
        .eq('partner_id', params.senderId);

      if (error) {
        return { valid: false, message: 'API 설정 조회 실패' };
      }

      const totalBalance = (apiConfigs || []).reduce(
        (sum: number, config: any) => sum + (parseFloat(config.balance?.toString() || '0') || 0),
        0
      );

      if (totalBalance < amount) {
        return {
          valid: false,
          message: `보유금 부족 (현재: ${totalBalance.toLocaleString()}원, 필요: ${amount.toLocaleString()}원)`
        };
      }
    } else if (senderLevel === 2) {
      // Lv2: 4개 지갑 합계
      const balance =
        (parseFloat(senderData.invest_balance?.toString() || '0') || 0) +
        (parseFloat(senderData.oroplay_balance?.toString() || '0') || 0) +
        (parseFloat(senderData.familyapi_balance?.toString() || '0') || 0) +
        (parseFloat(senderData.honorapi_balance?.toString() || '0') || 0);

      if (balance < amount) {
        return {
          valid: false,
          message: `보유금 부족 (현재: ${balance.toLocaleString()}원, 필요: ${amount.toLocaleString()}원)`
        };
      }
    } else if (senderLevel >= 3) {
      // Lv3+: GMS 머니
      const balance = parseFloat(senderData.balance?.toString() || '0');

      if (balance < amount) {
        return {
          valid: false,
          message: `보유금 부족 (현재: ${balance.toLocaleString()}원, 필요: ${amount.toLocaleString()}원)`
        };
      }
    }
  }

  return { valid: true, message: '' };
}

/**
 * 수신자 보유금 검증 (출금 시)
 */
async function validateReceiverBalance(
  targetId: string,
  targetType: TargetType,
  amount: number
): Promise<{ valid: boolean; message: string; balance: number }> {
  if (targetType === 'user') {
    // 회원 출금: 회원 보유금 검증
    const { data: userData, error } = await supabase
      .from('users')
      .select('balance')
      .eq('id', targetId)
      .single();

    if (error || !userData) {
      return { valid: false, message: '회원 정보를 찾을 수 없습니다.', balance: 0 };
    }

    const balance = parseFloat(userData.balance?.toString() || '0');

    if (balance < amount) {
      return {
        valid: false,
        message: `회원 보유금 부족 (현재: ${balance.toLocaleString()}원, 필요: ${amount.toLocaleString()}원)`,
        balance
      };
    }

    return { valid: true, message: '', balance };
  } else {
    // 파트너 출금: 파트너 보유금 검증
    const { data: partnerData, error } = await supabase
      .from('partners')
      .select('balance')
      .eq('id', targetId)
      .single();

    if (error || !partnerData) {
      return { valid: false, message: '파트너 정보를 찾을 수 없습니다.', balance: 0 };
    }

    const balance = parseFloat(partnerData.balance?.toString() || '0');

    if (balance < amount) {
      return {
        valid: false,
        message: `파트너 보유금 부족 (현재: ${balance.toLocaleString()}원, 필요: ${amount.toLocaleString()}원)`,
        balance
      };
    }

    return { valid: true, message: '', balance };
  }
}

// ============================================================================
// 보유금 업데이트 함수
// ============================================================================

/**
 * 회원 보유금 업데이트
 */
async function updateUserBalance(
  userId: string,
  amount: number,
  isDeposit: boolean
): Promise<{ before: number; after: number }> {
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('balance')
    .eq('id', userId)
    .single();

  if (fetchError || !userData) {
    throw new Error('회원 정보를 찾을 수 없습니다.');
  }

  const balanceBefore = parseFloat(userData.balance?.toString() || '0');
  const balanceAfter = isDeposit ? balanceBefore + amount : balanceBefore - amount;

  const { error: updateError } = await supabase
    .from('users')
    .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateError) {
    throw new Error(`회원 보유금 업데이트 실패: ${updateError.message}`);
  }

  console.log('✅ 회원 보유금 업데이트:', { userId, balanceBefore, balanceAfter });

  return { before: balanceBefore, after: balanceAfter };
}

/**
 * 파트너 보유금 업데이트 (Lv3+)
 */
async function updatePartnerBalance(
  partnerId: string,
  amount: number,
  isDeposit: boolean
): Promise<{ before: number; after: number }> {
  const { data: partnerData, error: fetchError } = await supabase
    .from('partners')
    .select('balance')
    .eq('id', partnerId)
    .single();

  if (fetchError || !partnerData) {
    throw new Error('파트너 정보를 찾을 수 없습니다.');
  }

  const balanceBefore = parseFloat(partnerData.balance?.toString() || '0');
  const balanceAfter = isDeposit ? balanceBefore + amount : balanceBefore - amount;

  const { error: updateError } = await supabase
    .from('partners')
    .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq('id', partnerId);

  if (updateError) {
    throw new Error(`파트너 보유금 업데이트 실패: ${updateError.message}`);
  }

  console.log('✅ 파트너 보유금 업데이트:', { partnerId, balanceBefore, balanceAfter });

  return { before: balanceBefore, after: balanceAfter };
}

/**
 * Lv2 API 별 보유금 업데이트
 */
async function updateLv2ApiBalance(
  partnerId: string,
  apiType: string,
  amount: number,
  isDeposit: boolean
): Promise<{ before: number; after: number }> {
  const balanceField =
    apiType === 'invest'
      ? 'invest_balance'
      : apiType === 'oroplay'
        ? 'oroplay_balance'
        : apiType === 'familyapi'
          ? 'familyapi_balance'
          : 'honorapi_balance';

  const { data: partnerData, error: fetchError } = await supabase
    .from('partners')
    .select(balanceField)
    .eq('id', partnerId)
    .single();

  if (fetchError || !partnerData) {
    throw new Error('파트너 정보를 찾을 수 없습니다.');
  }

  const balanceBefore = parseFloat(partnerData[balanceField]?.toString() || '0');
  const balanceAfter = isDeposit ? balanceBefore + amount : balanceBefore - amount;

  const { error: updateError } = await supabase
    .from('partners')
    .update({ [balanceField]: balanceAfter, updated_at: new Date().toISOString() })
    .eq('id', partnerId);

  if (updateError) {
    throw new Error(`Lv2 API 보유금 업데이트 실패: ${updateError.message}`);
  }

  console.log('✅ Lv2 API 보유금 업데이트:', { partnerId, apiType, balanceBefore, balanceAfter });

  return { before: balanceBefore, after: balanceAfter };
}

/**
 * Lv1 API 설정 보유금 차감 (입금 시에만)
 */
async function updateLv1ApiBalance(
  partnerId: string,
  apiType: string,
  amount: number
): Promise<{ before: number; after: number }> {
  const { data: apiConfig, error: fetchError } = await supabase
    .from('api_configs')
    .select('balance')
    .eq('partner_id', partnerId)
    .eq('api_provider', apiType)
    .single();

  if (fetchError || !apiConfig) {
    throw new Error(`Lv1 API 설정을 찾을 수 없습니다.: ${apiType}`);
  }

  const balanceBefore = parseFloat(apiConfig.balance?.toString() || '0');
  const balanceAfter = balanceBefore - amount;

  const { error: updateError } = await supabase
    .from('api_configs')
    .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq('partner_id', partnerId)
    .eq('api_provider', apiType);

  if (updateError) {
    throw new Error(`Lv1 API 보유금 차감 실패: ${updateError.message}`);
  }

  console.log('✅ Lv1 API 보유금 차감:', { partnerId, apiType, balanceBefore, balanceAfter });

  return { before: balanceBefore, after: balanceAfter };
}

// ============================================================================
// 거래 기록 생성 함수
// ============================================================================

/**
 * 거래 기록 생성 (transactions 테이블)
 */
async function createUserTransactionRecord(params: ManualTransferParams, balances: any): Promise<string> {
  const transactionType = getTransactionType(params.targetType, params.type, params.senderLevel);

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: params.targetType === 'user' ? params.targetId : null,
      partner_id: params.targetType === 'user' ? params.senderId : null,
      transaction_type: transactionType,
      amount: params.type === 'deposit' ? params.amount : -params.amount,
      balance_before: balances.balanceBefore,
      balance_after: balances.balanceAfter,
      status: 'completed',
      memo: params.memo || null,
      processed_by: params.senderId,
      created_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`거래 기록 생성 실패: ${error.message}`);
  }

  console.log('✅ transactions 거래 기록 생성:', { transactionId: data.id, type: transactionType });

  return data.id;
}

/**
 * 거래 기록 생성 (partner_balance_logs 테이블)
 */
async function createPartnerTransactionRecord(
  params: ManualTransferParams,
  balances: { senderBefore: number; senderAfter: number; receiverBefore?: number; receiverAfter?: number },
  targetPartnerData?: any,
  transactionId?: string  // ✅ 거래ID 파라미터 추가
): Promise<string> {
  const transactionType = getTransactionType(params.targetType, params.type, params.senderLevel);
  const isLv1ToLv2 = params.senderLevel === 1 && targetPartnerData?.level === 2;

  // ⭐ 거래ID 생성 (파라미터가 없으면 새로 생성)
  const txId = transactionId || await generateTransactionId();

  // Lv1→Lv2 입금: 송신자(Lv1), 수신자(Lv2) 2개 로그 생성
  if (isLv1ToLv2 && params.type === 'deposit') {
    const apiName =
      params.apiType === 'invest'
        ? 'Invest'
        : params.apiType === 'oroplay'
          ? 'OroPlay'
          : params.apiType === 'familyapi'
            ? 'FamilyAPI'
            : 'HonorAPI';

    // 1️⃣ Lv1 로그 (송신자: from_partner_id = Lv1)
    const lv1Log = {
      transaction_id: txId,
      partner_id: params.senderId,
      balance_before: 0,
      balance_after: 0,
      amount: -params.amount,
      transaction_type: transactionType,
      from_partner_id: params.senderId,
      to_partner_id: null,
      processed_by: params.senderId,
      api_type: params.apiType,
      memo: `[${apiName} API 할당] ${params.memo || ''}`,
      created_at: new Date().toISOString()
    };

    // 2️⃣ Lv2 로그 (수신자: to_partner_id = Lv2)
    const lv2Log = {
      transaction_id: txId,
      partner_id: params.targetId,
      balance_before: balances.receiverBefore,
      balance_after: balances.receiverAfter,
      amount: params.amount,
      transaction_type: transactionType,
      from_partner_id: params.senderId,
      to_partner_id: params.targetId,
      processed_by: params.senderId,
      api_type: params.apiType,
      memo: `[${apiName} API 할당] ${params.memo || ''}`,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('partner_balance_logs')
      .insert([lv1Log, lv2Log])
      .select('id');

    if (error) {
      throw new Error(`Lv1→Lv2 입금 로그 생성 실패: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('Lv1→Lv2 입금 로그 생성 실패: 응답 데이터 없음');
    }

    console.log('✅ partner_balance_logs Lv1→Lv2 입금 로그 생성:', { 
      lv1TransactionId: data[0]?.id,
      lv2TransactionId: data[1]?.id
    });

    return data[1].id;
  }
  }

  // Lv1→Lv2 출금: 송신자(Lv1), 수신자(Lv2) 2개 로그 생성
  if (isLv1ToLv2 && params.type === 'withdrawal') {
    const apiName =
      params.apiType === 'invest'
        ? 'Invest'
        : params.apiType === 'oroplay'
          ? 'OroPlay'
          : params.apiType === 'familyapi'
            ? 'FamilyAPI'
            : 'HonorAPI';

    // 1️⃣ Lv1 로그 (송신자: from_partner_id = Lv1)
    const lv1Log = {
      transaction_id: txId,
      partner_id: params.senderId,
      balance_before: 0,
      balance_after: 0,
      amount: -params.amount,
      transaction_type: transactionType,
      from_partner_id: params.senderId,
      to_partner_id: null,
      processed_by: params.senderId,
      api_type: params.apiType,
      memo: `[${apiName} API 회수] ${params.memo || ''}`,
      created_at: new Date().toISOString()
    };

    // 2️⃣ Lv2 로그 (수신자: to_partner_id = Lv2)
    const lv2Log = {
      transaction_id: txId,
      partner_id: params.targetId,
      balance_before: balances.receiverBefore,
      balance_after: balances.receiverAfter,
      amount: -params.amount,
      transaction_type: transactionType,
      from_partner_id: params.senderId,
      to_partner_id: params.targetId,
      processed_by: params.senderId,
      api_type: params.apiType,
      memo: `[${apiName} API 회수] ${params.memo || ''}`,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('partner_balance_logs')
      .insert([lv1Log, lv2Log])
      .select('id');

    if (error) {
      throw new Error(`Lv1→Lv2 출금 로그 생성 실패: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('Lv1→Lv2 출금 로그 생성 실패: 응답 데이터 없음');
    }

    console.log('✅ partner_balance_logs Lv1→Lv2 출금 로그 생성:', { 
      lv1TransactionId: data[0]?.id,
      lv2TransactionId: data[1]?.id
    });

    return data[1].id;
  }

  // 일반 파트너 거래 (Lv2→Lv3+, Lv3+→직속하위)
  // ✅ 송신자/수신자 2개 로그 저장
  
  // 1️⃣ 송신자 로그
  const senderLog = {
    transaction_id: txId,
    partner_id: params.senderId,
    balance_before: balances.senderBefore || 0,
    balance_after: balances.senderAfter || 0,
    amount: params.type === 'deposit' ? -params.amount : params.amount,
    transaction_type: transactionType,
    from_partner_id: params.senderId,
    to_partner_id: params.senderLevel === 2 ? params.senderId : null,
    processed_by: params.senderId,
    memo: params.memo || null,
    created_at: new Date().toISOString()
  };

  // 2️⃣ 수신자 로그
  const receiverLog = {
    transaction_id: txId,
    partner_id: params.targetId,
    balance_before: balances.receiverBefore || 0,
    balance_after: balances.receiverAfter || 0,
    amount: params.type === 'deposit' ? params.amount : -params.amount,
    transaction_type: transactionType,
    from_partner_id: params.senderId,
    to_partner_id: params.targetId,
    processed_by: params.senderId,
    memo: params.memo || null,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('partner_balance_logs')
    .insert([senderLog, receiverLog])
    .select('id');

  if (error) {
    throw new Error(`거래 기록 생성 실패: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('거래 기록 생성 실패: 응답 데이터 없음');
  }

  console.log('✅ partner_balance_logs 거래 기록 생성:', { 
    senderTransactionId: data[0]?.id, 
    receiverTransactionId: data[1]?.id, 
    type: transactionType 
  });

  return data[0].id;
}

// ============================================================================
// 메인 함수
// ============================================================================

/**
 * 수동충전/환전 처리 (통합 함수)
 * 
 * 6가지 거래 타입을 단일 함수로 통합 처리
 * ✅ 거래ID 자동 생성 포함
 */
export async function processManualTransfer(params: ManualTransferParams): Promise<ManualTransferResult> {
  try {
    console.log('🔵 [processManualTransfer] 시작:', params);

    // 1️⃣ 거래ID 생성 (sender/receiver 로그 연결용)
    const transactionIdForLog = await generateTransactionId();
    console.log('📝 거래ID 생성:', transactionIdForLog);

    // 2️⃣ 송신자 정보 조회
    const { data: senderData, error: senderError } = await supabase
      .from('partners')
      .select('balance, invest_balance, oroplay_balance, familyapi_balance, honorapi_balance, level, username, nickname')
      .eq('id', params.senderId)
      .single();

    if (senderError || !senderData) {
      return { success: false, message: '송신자 정보를 찾을 수 없습니다.', error: senderError?.message };
    }

    // 2️⃣ 수신자 정보 조회
    let targetData = null;
    if (params.targetType === 'user') {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('balance, nickname, username')
        .eq('id', params.targetId)
        .single();

      if (userError || !userData) {
        return { success: false, message: '수신자(회원) 정보를 찾을 수 없습니다.', error: userError?.message };
      }

      targetData = userData;
    } else {
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('balance, nickname, username, level')
        .eq('id', params.targetId)
        .single();

      if (partnerError || !partnerData) {
        return { success: false, message: '수신자(파트너) 정보를 찾을 수 없습니다.', error: partnerError?.message };
      }

      targetData = partnerData;
    }

    // 3️⃣ 보유금 검증
    const senderValidation = await validateSenderBalance(params, senderData);
    if (!senderValidation.valid) {
      return { success: false, message: senderValidation.message };
    }

    if (params.type === 'withdrawal') {
      const receiverValidation = await validateReceiverBalance(params.targetId, params.targetType, params.amount);
      if (!receiverValidation.valid) {
        return { success: false, message: receiverValidation.message };
      }
    }

    // 4️⃣ 보유금 업데이트
    let transactionId = '';

    if (params.targetType === 'user') {
      // 회원 대상: transactions 테이블 사용
      const balances = await updateUserBalance(params.targetId, params.amount, params.type === 'deposit');
      transactionId = await createUserTransactionRecord(params, balances);
    } else if (params.senderLevel === 1 && targetData.level === 2) {
      // Lv1→Lv2: 특별 처리 (API별 보유금 관리)
      if (!params.apiType) {
        return { success: false, message: 'Lv1→Lv2 거래는 apiType이 필요합니다.' };
      }

      const txId = await generateTransactionId();  // ✅ 거래ID 생성
      const receiverBalances = await updateLv2ApiBalance(params.targetId, params.apiType, params.amount, params.type === 'deposit');

      if (params.type === 'deposit') {
        // 입금: Lv1 api_configs도 차감
        await updateLv1ApiBalance(params.senderId, params.apiType, params.amount);
      }

      transactionId = await createPartnerTransactionRecord(params, { senderBefore: 0, senderAfter: 0, receiverBefore: receiverBalances.before, receiverAfter: receiverBalances.after }, targetData, txId);  // ✅ txId 전달
    } else if (params.senderLevel === 2 && targetData.level >= 3) {
      // Lv2→Lv3+: 파트너 입출금
      const txId = await generateTransactionId();  // ✅ 거래ID 생성
      const receiverBalances = await updatePartnerBalance(params.targetId, params.amount, params.type === 'deposit');
      transactionId = await createPartnerTransactionRecord(params, { senderBefore: 0, senderAfter: 0, receiverBefore: receiverBalances.before, receiverAfter: receiverBalances.after }, targetData, txId);  // ✅ txId 전달
    } else if (params.senderLevel >= 3 && targetData.level >= 3) {
      // Lv3+→직속하위: 파트너 입출금
      const txId = await generateTransactionId();  // ✅ 거래ID 생성
      const receiverBalances = await updatePartnerBalance(params.targetId, params.amount, params.type === 'deposit');
      transactionId = await createPartnerTransactionRecord(params, { senderBefore: 0, senderAfter: 0, receiverBefore: receiverBalances.before, receiverAfter: receiverBalances.after }, targetData, txId);  // ✅ txId 전달
    }

    console.log('✅ [processManualTransfer] 완료:', { transactionId, type: params.type, amount: params.amount });

    return {
      success: true,
      message: `${params.type === 'deposit' ? '입금' : '출금'} 처리 완료`,
      transactionId
    };
  } catch (error) {
    console.error('❌ [processManualTransfer] 오류:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '수동충전/환전 처리 중 오류가 발생했습니다.',
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
}

/**
 * Lv1→Lv2 입금 전용 함수 (API별 보유금 관리)
 * 
 * 특수한 케이스: Lv1의 api_configs에서 차감, Lv2의 partners 테이블에서 증가
 * ✅ 거래ID 자동 생성 포함
 */
export async function processLv1ToLv2Deposit(
  lv1PartnerId: string,
  lv2PartnerId: string,
  apiType: 'invest' | 'oroplay' | 'familyapi' | 'honorapi',
  amount: number,
  memo?: string
): Promise<ManualTransferResult> {
  try {
    console.log('🔵 [processLv1ToLv2Deposit] 시작:', { lv1PartnerId, lv2PartnerId, apiType, amount });

    // 1️⃣ 거래ID 생성 (sender/receiver 로그 연결용)
    const transactionIdForLog = await generateTransactionId();
    console.log('📝 거래ID 생성:', transactionIdForLog);

    // 2️⃣ Lv2 파트너 정보 조회
    const { data: lv2Data, error: lv2Error } = await supabase
      .from('partners')
      .select('balance, invest_balance, oroplay_balance, familyapi_balance, honorapi_balance, username, nickname, level')
      .eq('id', lv2PartnerId)
      .single();

    if (lv2Error || !lv2Data) {
      return { success: false, message: 'Lv2 파트너 정보를 찾을 수 없습니다.', error: lv2Error?.message };
    }

    // 3️⃣ Lv2 API 보유금 검증 및 차감
    const receiverBalances = await updateLv2ApiBalance(lv2PartnerId, apiType, amount, true);

    // 4️⃣ Lv1 api_configs 차감
    await updateLv1ApiBalance(lv1PartnerId, apiType, amount);

    // 5️⃣ 거래 기록 생성 (거래ID 포함)
    const params: ManualTransferParams = {
      type: 'deposit',
      targetType: 'lv3_partner',
      targetId: lv2PartnerId,
      senderId: lv1PartnerId,
      senderLevel: 1,
      amount,
      memo,
      apiType: apiType as 'invest' | 'oroplay' | 'familyapi' | 'honorapi'
    };

    const transactionId = await createPartnerTransactionRecord(params, { senderBefore: 0, senderAfter: 0, receiverBefore: receiverBalances.before, receiverAfter: receiverBalances.after }, lv2Data, transactionIdForLog);  // ✅ transactionIdForLog 전달

    console.log('✅ [processLv1ToLv2Deposit] 완료:', { transactionId, transactionIdForLog, amount });

    return {
      success: true,
      message: 'Lv1→Lv2 입금 처리 완료',
      transactionId
    };
  } catch (error) {
    console.error('❌ [processLv1ToLv2Deposit] 오류:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Lv1→Lv2 입금 처리 중 오류가 발생했습니다.',
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
}
