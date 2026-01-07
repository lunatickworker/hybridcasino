/**
 * Lv1 파트너 조회 헬퍼
 * 
 * Lv1 파트너를 찾지 못하는 에러를 방지하고 명확한 에러 메시지를 제공합니다.
 */

import { supabase } from './supabase';
import { toast } from 'sonner@2.0.3';

interface Lv1Partner {
  id: string;
  username?: string;
  nickname?: string;
}

interface Lv1Result {
  success: boolean;
  partner: Lv1Partner | null;
  error?: string;
}

/**
 * Lv1 파트너 조회 (에러 없이 안전하게)
 */
export async function getLv1Partner(): Promise<Lv1Result> {
  try {
    const { data, error } = await supabase
      .from('partners')
      .select('id, username, nickname')
      .eq('level', 1)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('❌ [Lv1Helper] 조회 에러:', error);
      return {
        success: false,
        partner: null,
        error: `Lv1 파트너 조회 중 오류: ${error.message}`
      };
    }

    if (!data) {
      console.warn('⚠️ [Lv1Helper] Lv1 파트너를 찾을 수 없습니다');
      return {
        success: false,
        partner: null,
        error: 'Lv1 파트너가 존재하지 않습니다. 먼저 시스템 관리자(Lv1)를 생성하세요.'
      };
    }

    console.log('✅ [Lv1Helper] Lv1 파트너 찾음:', data.username);
    return {
      success: true,
      partner: data
    };
  } catch (err: any) {
    console.error('❌ [Lv1Helper] 예외 발생:', err);
    return {
      success: false,
      partner: null,
      error: err.message || '알 수 없는 오류'
    };
  }
}

/**
 * Lv1 파트너 ID만 조회 (에러 발생 시 토스트 표시)
 */
export async function getLv1PartnerId(showToast: boolean = true): Promise<string | null> {
  const result = await getLv1Partner();
  
  if (!result.success) {
    if (showToast) {
      toast.error(result.error || 'Lv1 파트너를 찾을 수 없습니다');
    }
    return null;
  }
  
  return result.partner?.id || null;
}

/**
 * Lv1 파트너 존재 여부 확인
 */
export async function hasLv1Partner(): Promise<boolean> {
  const result = await getLv1Partner();
  return result.success;
}

/**
 * Lv1 파트너 생성 가이드 표시
 */
export function showLv1CreationGuide() {
  toast.error(
    '시스템 관리자(Lv1) 파트너가 존재하지 않습니다.\n\n' +
    'Supabase SQL Editor에서 다음을 실행하세요:\n\n' +
    'INSERT INTO partners (username, nickname, level, partner_type, status)\n' +
    'VALUES (\'admin\', \'시스템관리자\', 1, \'system_admin\', \'active\');',
    { duration: 10000 }
  );
}
