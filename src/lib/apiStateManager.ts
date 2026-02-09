/**
 * API 상태 관리자 모듈
 * - Supabase Realtime으로 api_configs 변경 감지
 * - 각 모듈에서 API 활성화/비활성화 상태를 동적으로 구독
 */

import { supabase } from './supabase';

export interface ApiStatus {
  invest: boolean;
  oroplay: boolean;
  familyapi: boolean;
  honorapi: boolean;
}

type ApiStatusCallback = (status: ApiStatus) => void;

class ApiStateManager {
  private listeners: Map<string, Set<ApiStatusCallback>> = new Map();
  private channels: Map<string, any> = new Map();
  private cachedStatus: Map<string, ApiStatus> = new Map();

  /**
   * 특정 파트너의 API 상태 조회 (DB에서)
   */
  async fetchApiStatus(partnerId: string): Promise<ApiStatus> {
    try {
      const { data: configs, error } = await supabase
        .from('api_configs')
        .select('api_provider, is_active')
        .eq('partner_id', partnerId);

      if (error) throw error;

      const status: ApiStatus = {
        invest: configs?.some(c => c.api_provider === 'invest' && c.is_active) ?? false,
        oroplay: configs?.some(c => c.api_provider === 'oroplay' && c.is_active) ?? false,
        familyapi: configs?.some(c => c.api_provider === 'familyapi' && c.is_active) ?? false,
        honorapi: configs?.some(c => c.api_provider === 'honorapi' && c.is_active) ?? false,
      };

      // 캐시 저장
      this.cachedStatus.set(partnerId, status);
      return status;
    } catch (error) {
      console.error(`❌ [ApiStateManager] API 상태 조회 실패 (partnerId=${partnerId}):`, error);
      // 캐시된 상태가 있으면 반환, 없으면 모두 false
      return this.cachedStatus.get(partnerId) ?? {
        invest: false,
        oroplay: false,
        familyapi: false,
        honorapi: false,
      };
    }
  }

  /**
   * 특정 파트너의 API 상태 변경 감시 (Realtime)
   */
  watchApiStatus(
    partnerId: string,
    callback: ApiStatusCallback
  ): () => void {
    // 리스너 등록
    if (!this.listeners.has(partnerId)) {
      this.listeners.set(partnerId, new Set());
    }
    this.listeners.get(partnerId)!.add(callback);

    // 기존 채널이 있으면 재사용, 없으면 새로 생성
    if (!this.channels.has(partnerId)) {
      this.setupRealtimeChannel(partnerId);
    }

    // 초기값 전달 (캐시 또는 DB에서)
    this.fetchApiStatus(partnerId).then(status => {
      callback(status);
    });

    // 언서브스크라이브 함수 반환
    return () => {
      this.unsubscribeApiStatus(partnerId, callback);
    };
  }

  /**
   * Realtime 채널 설정 (한 번만)
   */
  private setupRealtimeChannel(partnerId: string) {
    const channel = supabase
      .channel(`api_configs_${partnerId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'api_configs',
          filter: `partner_id=eq.${partnerId}`,
        },
        async (payload) => {
          console.log(
            `🔄 [ApiStateManager] api_configs 변경 감지 (partnerId=${partnerId}):`,
            payload
          );

          // 최신 상태 조회 및 캐시 업데이트
          const newStatus = await this.fetchApiStatus(partnerId);

          // 등록된 모든 리스너에 알림
          const callbacks = this.listeners.get(partnerId);
          if (callbacks) {
            callbacks.forEach(callback => {
              try {
                callback(newStatus);
              } catch (error) {
                console.error(`❌ [ApiStateManager] 콜백 실행 오류:`, error);
              }
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(
            `✅ [ApiStateManager] Realtime 구독 성공 (partnerId=${partnerId})`
          );
        }
      });

    this.channels.set(partnerId, channel);
  }

  /**
   * 특정 파트너의 API 상태 감시 취소
   */
  private unsubscribeApiStatus(
    partnerId: string,
    callback: ApiStatusCallback
  ) {
    const callbacks = this.listeners.get(partnerId);
    if (callbacks) {
      callbacks.delete(callback);

      // 더 이상 리스너가 없으면 채널 정리
      if (callbacks.size === 0) {
        this.listeners.delete(partnerId);
        const channel = this.channels.get(partnerId);
        if (channel) {
          supabase.removeChannel(channel);
          this.channels.delete(partnerId);
          console.log(
            `🛑 [ApiStateManager] Realtime 구독 해제 (partnerId=${partnerId})`
          );
        }
      }
    }
  }

  /**
   * 모든 구독 정리
   */
  cleanup() {
    this.channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    this.channels.clear();
    this.listeners.clear();
    this.cachedStatus.clear();
    console.log('🛑 [ApiStateManager] 모든 구독 정리 완료');
  }
}

// 싱글톤 인스턴스
export const apiStateManager = new ApiStateManager();
