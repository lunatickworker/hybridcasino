import { supabase } from "../../../lib/supabase";
import { Partner } from "./types";

/**
 * 파트너 목록 조회
 */
export const fetchPartners = async (currentUserId: string, userLevel: number) => {
  const isSystemAdmin = userLevel === 1;
  
  let allPartners: any[] = [];
  
  if (isSystemAdmin) {
    // 시스템 관리자: 모든 파트너 직접 조회
    const { data, error } = await supabase
      .from('partners')
      .select(`
        id,
        username,
        nickname,
        partner_type,
        level,
        parent_id,
        balance,
        invest_balance,
        oroplay_balance,
        commission_rolling,
        commission_losing,
        casino_rolling_commission,
        casino_losing_commission,
        slot_rolling_commission,
        slot_losing_commission,
        withdrawal_fee,
        status,
        created_at,
        last_login_at
      `);
    
    if (error) throw error;
    allPartners = data || [];
  } else {
    // 일반 파트너: 직접 재귀적으로 모든 하위 파트너 조회 (본인 제외)
    const allPartnerIds: string[] = [];
    let currentLevelIds = [currentUserId];
    
    // 최대 6단계까지 재귀 조회 (Lv2 -> Lv3,4,5,6 / Lv3 -> Lv4,5,6)
    for (let level = 0; level < 6; level++) {
      if (currentLevelIds.length === 0) break;
      
      const { data: nextLevelPartners, error } = await supabase
        .from('partners')
        .select('id')
        .in('parent_id', currentLevelIds);
      
      if (error) throw error;
      
      if (nextLevelPartners && nextLevelPartners.length > 0) {
        const nextIds = nextLevelPartners.map(p => p.id);
        allPartnerIds.push(...nextIds);
        currentLevelIds = nextIds;
      } else {
        break;
      }
    }
    
    // 모든 하위 파트너의 전체 정보 조회 (본인 제외, 커미션 필드 포함)
    if (allPartnerIds.length > 0) {
      const { data, error } = await supabase
        .from('partners')
        .select(`
          id,
          username,
          nickname,
          partner_type,
          level,
          parent_id,
          balance,
          invest_balance,
          oroplay_balance,
          commission_rolling,
          commission_losing,
          casino_rolling_commission,
          casino_losing_commission,
          slot_rolling_commission,
          slot_losing_commission,
          withdrawal_fee,
          status,
          created_at,
          last_login_at
        `)
        .in('id', allPartnerIds);
      
      if (error) throw error;
      allPartners = data || [];
    }
  }

  // ⚡ 하위 파트너와 사용자 수 집계 + 보유금 실시간 표시 (배치 쿼리로 최적화)
  const partnerIds = allPartners.map(p => p.id);
  
  // ⚡ 병렬 배치 쿼리로 최적화
  const [childCountsResult, userCountsResult, apiConfigsResult] = await Promise.all([
    // 모든 파트너의 하위 파트너 수를 한 번에 조회
    supabase
      .from('partners')
      .select('parent_id')
      .in('parent_id', partnerIds),
    // 모든 파트너의 사용자 수를 한 번에 조회
    supabase
      .from('users')
      .select('referrer_id')
      .in('referrer_id', partnerIds),
    // Lv1 파트너들의 API 보유금을 한 번에 조회
    supabase
      .from('api_configs')
      .select('partner_id, api_provider, balance')
      .in('partner_id', partnerIds)
  ]);

  // 집계 맵 생성
  const childCountMap = new Map<string, number>();
  childCountsResult.data?.forEach(row => {
    childCountMap.set(row.parent_id, (childCountMap.get(row.parent_id) || 0) + 1);
  });

  const userCountMap = new Map<string, number>();
  userCountsResult.data?.forEach(row => {
    userCountMap.set(row.referrer_id, (userCountMap.get(row.referrer_id) || 0) + 1);
  });

  const apiBalanceMap = new Map<string, { invest: number; oroplay: number }>();
  apiConfigsResult.data?.forEach(config => {
    if (!apiBalanceMap.has(config.partner_id)) {
      apiBalanceMap.set(config.partner_id, { invest: 0, oroplay: 0 });
    }
    const balances = apiBalanceMap.get(config.partner_id)!;
    if (config.api_provider === 'invest') {
      balances.invest = config.balance || 0;
    } else if (config.api_provider === 'oroplay') {
      balances.oroplay = config.balance || 0;
    }
  });

  // 파트너 데이터에 집계 정보 추가
  const partnersWithCounts = allPartners.map(partner => {
    let investBalance = 0;
    let oroplayBalance = 0;
    
    if (partner.level === 1) {
      // Lv1: api_configs에서 조회한 데이터 사용
      const balances = apiBalanceMap.get(partner.id);
      investBalance = balances?.invest || 0;
      oroplayBalance = balances?.oroplay || 0;
    } else if (partner.level === 2) {
      // Lv2: partners 테이블의 컬럼 사용
      investBalance = partner.invest_balance || 0;
      oroplayBalance = partner.oroplay_balance || 0;
    }

    return {
      ...partner,
      parent_nickname: partner.parent?.nickname || '-',
      child_count: childCountMap.get(partner.id) || 0,
      user_count: userCountMap.get(partner.id) || 0,
      balance: partner.level === 1 || partner.level === 2 ? 0 : (partner.balance || 0),
      invest_balance: investBalance,
      oroplay_balance: oroplayBalance,
      selected_apis: undefined
    };
  });

  return partnersWithCounts;
};

/**
 * 특정 파트너의 커미션 조회
 */
export const loadPartnerCommissionById = async (partnerId: string) => {
  try {
    const { data, error } = await supabase
      .from('partners')
      .select(`
        commission_rolling, 
        commission_losing, 
        casino_rolling_commission,
        casino_losing_commission,
        slot_rolling_commission,
        slot_losing_commission,
        withdrawal_fee, 
        partner_type, 
        nickname
      `)
      .eq('id', partnerId)
      .maybeSingle();

    if (error) {
      console.error('[Partner Commission Error]:', error);
      return null;
    }

    if (data) {
      return {
        rolling: data.commission_rolling || 100,
        losing: data.commission_losing || 100,
        casinoRolling: data.casino_rolling_commission || data.commission_rolling || 100,
        casinoLosing: data.casino_losing_commission || data.commission_losing || 100,
        slotRolling: data.slot_rolling_commission || data.commission_rolling || 100,
        slotLosing: data.slot_losing_commission || data.commission_losing || 100,
        fee: data.withdrawal_fee || 100,
        nickname: data.nickname
      };
    }
    return null;
  } catch (error) {
    console.error('[Partner Commission Fetch Failed]:', error);
    return null;
  }
};

/**
 * 시스템 기본 커미션 값 로드
 */
export const loadSystemDefaultCommission = async () => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['default_rolling_commission', 'default_losing_commission', 'default_withdrawal_fee']);

    if (error) {
      console.error('[System Default Commission Load Error]:', error);
      return null;
    }

    if (data && data.length > 0) {
      const defaults = {
        rolling: 0.5,
        losing: 5.0,
        fee: 1.0
      };

      data.forEach(setting => {
        if (setting.setting_key === 'default_rolling_commission') {
          defaults.rolling = parseFloat(setting.setting_value) || 0.5;
        } else if (setting.setting_key === 'default_losing_commission') {
          defaults.losing = parseFloat(setting.setting_value) || 5.0;
        } else if (setting.setting_key === 'default_withdrawal_fee') {
          defaults.fee = parseFloat(setting.setting_value) || 1.0;
        }
      });

      return defaults;
    }
    
    return null;
  } catch (error) {
    console.error('[System Default Commission Load Failed]:', error);
    return null;
  }
};

/**
 * Lv1 관리자의 api_configs 보유금 조회
 */
export const fetchAdminApiBalances = async (partnerId: string) => {
  try {
    const { data: investData, error: investError } = await supabase
      .from('api_configs')
      .select('balance')
      .eq('partner_id', partnerId)
      .eq('api_provider', 'invest')
      .maybeSingle();

    const { data: oroplayData, error: oroplayError } = await supabase
      .from('api_configs')
      .select('balance')
      .eq('partner_id', partnerId)
      .eq('api_provider', 'oroplay')
      .maybeSingle();

    if (investError) {
      console.error('⚠️ Lv1 invest api_configs 조회 실패:', investError);
    }
    
    if (oroplayError) {
      console.error('⚠️ Lv1 oroplay api_configs 조회 실패:', oroplayError);
    }

    return {
      invest: investData?.balance || 0,
      oroplay: oroplayData?.balance || 0
    };
  } catch (error) {
    console.error('❌ Lv1 API 보유금 조회 실패:', error);
    return { invest: 0, oroplay: 0 };
  }
};

/**
 * 현재 사용자의 보유금 조회
 */
export const fetchCurrentUserBalance = async (partnerId: string) => {
  try {
    const { data, error } = await supabase
      .from('partners')
      .select('balance, level, invest_balance, oroplay_balance, familyapi_balance')
      .eq('id', partnerId)
      .single();
    
    if (error) throw error;
    
    let result: {
      balance?: number;
      investBalance?: number;
      oroplayBalance?: number;
      familyapiBalance?: number;
    } = {};
    
    if (data?.level === 1) {
      // Lv1: api_configs에서 실제 보유금 조회
      const { data: investData, error: investError } = await supabase
        .from('api_configs')
        .select('balance')
        .eq('partner_id', partnerId)
        .eq('api_provider', 'invest')
        .maybeSingle();
      
      const { data: oroplayData, error: oroplayError } = await supabase
        .from('api_configs')
        .select('balance')
        .eq('partner_id', partnerId)
        .eq('api_provider', 'oroplay')
        .maybeSingle();
      
      const { data: familyapiData, error: familyapiError } = await supabase
        .from('api_configs')
        .select('balance')
        .eq('partner_id', partnerId)
        .eq('api_provider', 'familyapi')
        .maybeSingle();
      
      result.investBalance = investData?.balance || 0;
      result.oroplayBalance = oroplayData?.balance || 0;
      result.familyapiBalance = familyapiData?.balance || 0;
    } else if (data?.level === 2) {
      // Lv2: 세 개 지갑
      result.investBalance = data?.invest_balance || 0;
      result.oroplayBalance = data?.oroplay_balance || 0;
      result.familyapiBalance = data?.familyapi_balance || 0;
    } else {
      // Lv3~7: 단일 balance
      result.balance = data?.balance || 0;
    }
    
    return result;
  } catch (error) {
    console.error('❌ 현재 사용자 보유금 조회 실패:', error);
    return {};
  }
};

/**
 * 파트너 생성
 */
export const createPartner = async (partnerData: any) => {
  const { error } = await supabase
    .from('partners')
    .insert(partnerData);

  if (error) throw error;
};

/**
 * 파트너 수정
 */
export const updatePartner = async (partnerId: string, updates: Partial<Partner>) => {
  const { error } = await supabase
    .from('partners')
    .update(updates)
    .eq('id', partnerId);

  if (error) throw error;
};

/**
 * 파트너 삭제
 */
export const deletePartner = async (partnerId: string) => {
  const { error } = await supabase
    .from('partners')
    .delete()
    .eq('id', partnerId);

  if (error) throw error;
};

/**
 * 하위 파트너 수 확인
 */
export const checkChildPartners = async (partnerId: string) => {
  const { count } = await supabase
    .from('partners')
    .select('*', { count: 'exact' })
    .eq('parent_id', partnerId);

  return count || 0;
};

/**
 * 관리하는 사용자 수 확인
 */
export const checkManagedUsers = async (partnerId: string) => {
  const { count } = await supabase
    .from('users')
    .select('*', { count: 'exact' })
    .eq('referrer_id', partnerId);

  return count || 0;
};
