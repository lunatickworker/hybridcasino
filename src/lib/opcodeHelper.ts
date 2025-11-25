/**
 * OPCODE 조회 헬퍼 함수 (api_configs 테이블 기반)
 * 관리자 권한에 따라 올바른 OPCODE와 Secret Key를 조회합니다.
 * 
 * ✅ 모든 API 정보는 api_configs 테이블에서 조회
 * ✅ partners 테이블 참조 제거
 */

import { supabase } from "./supabase";
import { Partner } from "../types";

export interface OpcodeInfo {
  opcode: string;
  secretKey: string;
  token: string;
  partnerId: string;
  partnerName: string;
}

export interface MultipleOpcodeInfo {
  opcodes: OpcodeInfo[];
  isSystemAdmin: boolean;
}

/**
 * 관리자의 권한에 따라 사용 가능한 OPCODE 조회
 * 
 * @param admin - 현재 로그인한 관리자 정보
 * @returns 시스템관리자의 경우 본인 + 모든 대본사 OPCODE 배열, 그 외는 단일 OPCODE
 */
export async function getAdminOpcode(admin: Partner): Promise<OpcodeInfo | MultipleOpcodeInfo> {
  // 1. 시스템관리자: 본인 OPCODE + 모든 대본사 OPCODE 목록 반환
  if (admin.partner_type === 'system_admin') {
    const opcodeList: OpcodeInfo[] = [];

    // 1-1. 시스템관리자 본인의 api_configs 조회 (새 구조: api_provider='invest')
    const { data: systemConfig, error: systemError } = await supabase
      .from('api_configs')
      .select('partner_id, invest_opcode, invest_secret_key, invest_token, api_provider')
      .eq('partner_id', admin.id)
      .eq('api_provider', 'invest')
      .maybeSingle();

    if (systemConfig?.invest_opcode && systemConfig?.invest_secret_key && systemConfig?.invest_token) {
      opcodeList.push({
        opcode: systemConfig.invest_opcode,
        secretKey: systemConfig.invest_secret_key,
        token: systemConfig.invest_token,
        partnerId: admin.id,
        partnerName: admin.name || admin.nickname || '시스템관리자'
      });
    }

    // 1-2. 모든 대본사의 api_configs 조회
    const { data: headOfficePartners } = await supabase
      .from('partners')
      .select('id, username, nickname')
      .eq('partner_type', 'head_office')
      .eq('status', 'active');

    if (headOfficePartners && headOfficePartners.length > 0) {
      // 대본사 ID 목록 생성
      const headOfficeIds = headOfficePartners.map(p => p.id);

      // api_configs 조회 (새 구조: api_provider='invest')
      const { data: headOfficeConfigs } = await supabase
        .from('api_configs')
        .select('partner_id, invest_opcode, invest_secret_key, invest_token')
        .in('partner_id', headOfficeIds)
        .eq('api_provider', 'invest')
        .not('invest_opcode', 'is', null)
        .not('invest_secret_key', 'is', null)
        .not('invest_token', 'is', null);

      if (headOfficeConfigs) {
        headOfficeConfigs.forEach((config: any) => {
          const partner = headOfficePartners.find(p => p.id === config.partner_id);
          opcodeList.push({
            opcode: config.invest_opcode,
            secretKey: config.invest_secret_key,
            token: config.invest_token,
            partnerId: config.partner_id,
            partnerName: partner?.nickname || partner?.username || `대본사-${config.partner_id.slice(0, 8)}`
          });
        });
      }
    }

    if (opcodeList.length === 0) {
      throw new Error('사용 가능한 OPCODE가 없습니다. api_configs 테이블을 설정해주세요.');
    }

    return {
      opcodes: opcodeList,
      isSystemAdmin: true
    };
  }

  // 2. 대본사(Lv2): 상위 시스템관리자(Lv1)의 api_configs 조회
  if (admin.partner_type === 'head_office') {
    if (!admin.parent_id) {
      throw new Error(`대본사는 상위 시스템관리자가 필요합니다. parent_id가 설정되지 않았습니다.`);
    }

    // 상위 Lv1 파트너 조회
    const { data: lv1Partner, error: lv1Error } = await supabase
      .from('partners')
      .select('id, username, nickname, level, partner_type')
      .eq('id', admin.parent_id)
      .single();

    if (lv1Error || !lv1Partner) {
      console.error('❌ [Lv2] 상위 파트너 조회 실패:', lv1Error);
      throw new Error(`상위 파트너 조회 실패: ${lv1Error?.message}`);
    }

    if (lv1Partner.level !== 1) {
      throw new Error(`대본사의 상위 파트너는 Lv1(시스템관리자)여야 합니다. 현재: Lv${lv1Partner.level}`);
    }

    // 상위 Lv1의 api_configs 조회 (새 구조: api_provider='invest')
    const { data: config, error } = await supabase
      .from('api_configs')
      .select('invest_opcode, invest_secret_key, invest_token')
      .eq('partner_id', lv1Partner.id)
      .eq('api_provider', 'invest')
      .maybeSingle();
    
    console.log('📊 [Lv2] 상위 Lv1의 api_configs 조회 결과:', {
      lv1_id: lv1Partner.id,
      lv1_username: lv1Partner.username,
      found: !!config,
      error: error?.message
    });
    
    if (error) {
      console.error('❌ [Lv2] 상위 Lv1 api_configs 조회 DB 오류:', error);
      throw new Error(`상위 시스템관리자의 api_configs 조회 실패: ${error.message}`);
    }
    
    if (!config || !config.invest_opcode || !config.invest_secret_key || !config.invest_token) {
      console.error('❌ [Lv2] 상위 Lv1 api_configs 정보 불완전:', {
        lv1_id: lv1Partner.id,
        lv1_username: lv1Partner.username,
        has_config: !!config,
        has_opcode: !!config?.invest_opcode,
        has_secret: !!config?.invest_secret_key,
        has_token: !!config?.invest_token
      });
      throw new Error(`상위 시스템관리자(${lv1Partner.username})의 api_configs가 설정되지 않았습니다.`);
    }

    console.log('✅ [Lv2] 상위 Lv1 OPCODE 조회 성공:', config.invest_opcode);

    return {
      opcode: config.invest_opcode,
      secretKey: config.invest_secret_key,
      token: config.invest_token,
      partnerId: lv1Partner.id, // Lv1의 partner_id 사용
      partnerName: admin.nickname || admin.username || '내 조직'
    };
  }

  // 3. 본사/부본사/총판/매장: 상위 대본사의 api_configs 조회
  console.log('🔍 하위 파트너 - 대본사 찾기 시작:', {
    admin_id: admin.id,
    admin_username: admin.username,
    admin_type: admin.partner_type,
    parent_id: admin.parent_id
  });

  if (!admin.parent_id) {
    throw new Error(`${admin.partner_type}는 상위 파트너가 필요합니다. parent_id가 설정되지 않았습니다.`);
  }

  // 상위로 재귀 탐색하여 대본사 찾기
  let currentPartnerId = admin.parent_id;
  let attempts = 0;
  const maxAttempts = 10;

  while (currentPartnerId && attempts < maxAttempts) {
    console.log(`🔍 [시도 ${attempts + 1}] 파트너 조회:`, currentPartnerId);

    const { data: parentPartner, error } = await supabase
      .from('partners')
      .select('id, nickname, username, partner_type, level, parent_id')
      .eq('id', currentPartnerId)
      .single();

    console.log(`📊 [시도 ${attempts + 1}] 조회 결과:`, {
      found: !!parentPartner,
      error: error?.message,
      partner_type: parentPartner?.partner_type,
      level: parentPartner?.level,
      parent_id: parentPartner?.parent_id
    });

    if (error) {
      console.error('❌ 상위 파트너 조회 DB 오류:', error);
      throw new Error(`상위 파트너 조회 실패: ${error.message}`);
    }

    if (!parentPartner) {
      throw new Error(`상위 파트너를 찾을 수 없습니다 (ID: ${currentPartnerId})`);
    }

    // 대본사 발견
    if (parentPartner.partner_type === 'head_office') {
      console.log('✅ 대본사 발견, 대본사의 상위 Lv1 조회 시작:', {
        head_office_id: parentPartner.id,
        head_office_username: parentPartner.username,
        head_office_parent_id: parentPartner.parent_id
      });

      // ✅ 대본사의 parent_id로 Lv1 조회
      if (!parentPartner.parent_id) {
        throw new Error(`대본사(${parentPartner.username})의 상위 시스템관리자가 설정되지 않았습니다.`);
      }

      const { data: lv1Partner, error: lv1Error } = await supabase
        .from('partners')
        .select('id, username, nickname, level, partner_type')
        .eq('id', parentPartner.parent_id)
        .single();

      if (lv1Error || !lv1Partner) {
        console.error('❌ [Lv3~7] 상위 Lv1 조회 실패:', lv1Error);
        throw new Error(`상위 시스템관리자 조회 실패: ${lv1Error?.message}`);
      }

      if (lv1Partner.level !== 1) {
        throw new Error(`대본사의 상위 파트너는 Lv1(시스템관리자)여야 합니다. 현재: Lv${lv1Partner.level}`);
      }

      // ✅ Lv1의 api_configs 조회 (새 구조: api_provider='invest')
      const { data: config, error: configError } = await supabase
        .from('api_configs')
        .select('invest_opcode, invest_secret_key, invest_token')
        .eq('partner_id', lv1Partner.id)
        .eq('api_provider', 'invest')
        .maybeSingle();
      
      console.log('📊 [Lv3~7] 상위 Lv1의 api_configs 조회 결과:', {
        lv1_id: lv1Partner.id,
        lv1_username: lv1Partner.username,
        found: !!config,
        error: configError?.message
      });
      
      if (configError) {
        console.error('❌ [Lv3~7] 상위 Lv1 api_configs 조회 DB 오류:', configError);
        throw new Error(`상위 시스템관리자의 api_configs 조회 실패: ${configError.message}`);
      }
      
      if (!config || !config.invest_opcode || !config.invest_secret_key || !config.invest_token) {
        console.error('❌ [Lv3~7] 상위 Lv1 api_configs 정보 불완전:', {
          lv1_id: lv1Partner.id,
          lv1_username: lv1Partner.username,
          has_config: !!config,
          has_opcode: !!config?.invest_opcode,
          has_secret: !!config?.invest_secret_key,
          has_token: !!config?.invest_token
        });
        throw new Error(`상위 시스템관리자(${lv1Partner.username})의 api_configs가 설정되지 않았습니다.`);
      }

      console.log('✅ [Lv3~7] 상위 Lv1 OPCODE 조회 성공:', {
        lv1_id: lv1Partner.id,
        lv1_username: lv1Partner.username,
        opcode: config.invest_opcode
      });

      return {
        opcode: config.invest_opcode,
        secretKey: config.invest_secret_key,
        token: config.invest_token,
        partnerId: lv1Partner.id, // ✅ Lv1의 partner_id 사용
        partnerName: lv1Partner.nickname || lv1Partner.username || '시스템관리자'
      };
    }

    console.log(`⬆️ [시도 ${attempts + 1}] ${parentPartner.partner_type}는 대본사 아님, 상위로 이동`);
    currentPartnerId = parentPartner.parent_id || null;
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error('상위 대본사 조회 시도 횟수 초과 (최대 10회)');
  }

  throw new Error('상위 대본사를 찾을 수 없습니다. 파트너 계층 구조를 확인해주세요.');
}

/**
 * 시스템관리자인지 확인하는 헬퍼 함수
 */
export function isSystemAdmin(admin: Partner): boolean {
  return admin.partner_type === 'system_admin';
}

/**
 * 대본사인지 확인하는 헬퍼 함수
 */
export function isMasterPartner(admin: Partner): boolean {
  return admin.partner_type === 'head_office';
}

/**
 * MultipleOpcodeInfo 타입 가드
 */
export function isMultipleOpcode(info: OpcodeInfo | MultipleOpcodeInfo): info is MultipleOpcodeInfo {
  return 'opcodes' in info && 'isSystemAdmin' in info;
}