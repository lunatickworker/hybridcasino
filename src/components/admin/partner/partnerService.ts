import { supabase } from "../../../lib/supabase";
import { Partner } from "./types";

/**
 * 파트너 목록 조회
 */
export const fetchPartners = async (currentUserId: string, userLevel: number) => {
  let query = supabase
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
      withdrawal_fee,
      status,
      created_at,
      updated_at,
      parent:parent_id (
        nickname
      )
    `)
    .order('level', { ascending: true })
    .order('created_at', { ascending: false });

  const isSystemAdmin = userLevel === 1;
  
  const { data, error } = isSystemAdmin
    ? await query
    : await supabase.rpc('get_hierarchical_partners', { p_partner_id: currentUserId });

  if (error) throw error;

  // 하위 파트너와 사용자 수 집계 + 보유금 실시간 표시
  const partnersWithCounts = await Promise.all(
    (data || []).map(async (partner) => {
      // 하위 파트너 수 조회
      const { count: childCount } = await supabase
        .from('partners')
        .select('*', { count: 'exact' })
        .eq('parent_id', partner.id);

      // 관리하는 사용자 수 조회
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('referrer_id', partner.id);

      let investBalance = 0;
      let oroplayBalance = 0;
      
      if (partner.level === 1) {
        // Lv1: api_configs 테이블에서 조회
        const { data: investData } = await supabase
          .from('api_configs')
          .select('balance')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'invest')
          .maybeSingle();
        
        const { data: oroplayData } = await supabase
          .from('api_configs')
          .select('balance')
          .eq('partner_id', partner.id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();
        
        investBalance = investData?.balance || 0;
        oroplayBalance = oroplayData?.balance || 0;
      } else if (partner.level === 2) {
        // Lv2: 두 개 지갑 사용
        investBalance = partner.invest_balance || 0;
        oroplayBalance = partner.oroplay_balance || 0;
      }

      return {
        ...partner,
        parent_nickname: partner.parent?.nickname || '-',
        child_count: childCount || 0,
        user_count: userCount || 0,
        balance: partner.level === 1 || partner.level === 2 ? 0 : (partner.balance || 0),
        invest_balance: investBalance,
        oroplay_balance: oroplayBalance
      };
    })
  );

  return partnersWithCounts;
};

/**
 * 특정 파트너의 커미션 조회
 */
export const loadPartnerCommissionById = async (partnerId: string) => {
  try {
    const { data, error } = await supabase
      .from('partners')
      .select('commission_rolling, commission_losing, withdrawal_fee, partner_type, nickname')
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
      .select('balance, level, invest_balance, oroplay_balance')
      .eq('id', partnerId)
      .single();
    
    if (error) throw error;
    
    let result: {
      balance?: number;
      investBalance?: number;
      oroplayBalance?: number;
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
      
      result.investBalance = investData?.balance || 0;
      result.oroplayBalance = oroplayData?.balance || 0;
    } else if (data?.level === 2) {
      // Lv2: 두 개 지갑
      result.investBalance = data?.invest_balance || 0;
      result.oroplayBalance = data?.oroplay_balance || 0;
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
