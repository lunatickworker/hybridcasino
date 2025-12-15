import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Partner } from '../../types';

interface AdminGameRecordsSyncProps {
  user: Partner;
}

/**
 * 관리자 페이지가 열려있을 때 자동으로 게임 기록 동기화를 수행하는 컴포넌트
 * - Supabase Presence를 사용하여 여러 세션 중 하나만 동기화 실행 (중복 방지)
 * - Invest: 30초 간격
 * - OroPlay/FamilyAPI: 4초 간격
 */
export function AdminGameRecordsSync({ user }: AdminGameRecordsSyncProps) {
  const [isLeader, setIsLeader] = useState(false);
  const presenceChannel = useRef<any>(null);
  const syncTimers = useRef<{
    invest?: NodeJS.Timeout;
    oroplay?: NodeJS.Timeout;
    familyapi?: NodeJS.Timeout;
  }>({});

  useEffect(() => {
    // Presence 채널 생성 (관리자 세션 추적)
    const channelName = 'admin-sync-presence';
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: user.id.toString(),
        },
      },
    });

    // Presence 상태 변경 감지
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const sessions = Object.keys(state);
        
        // 첫 번째 세션이 리더가 됨 (알파벳 순서)
        const sortedSessions = sessions.sort();
        const leaderId = sortedSessions[0];
        const amILeader = leaderId === user.id.toString();
        
        console.log('🔄 [AdminGameRecordsSync] Presence 상태:', {
          sessions: sortedSessions,
          leader: leaderId,
          myId: user.id.toString(),
          isLeader: amILeader
        });

        setIsLeader(amILeader);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Presence에 참여
          await channel.track({
            user_id: user.id,
            level: user.level,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannel.current = channel;

    // 컴포넌트 언마운트 시 정리
    return () => {
      // 타이머 정리
      Object.values(syncTimers.current).forEach(timer => {
        if (timer) clearInterval(timer);
      });
      syncTimers.current = {};

      // Presence 채널 정리
      if (presenceChannel.current) {
        presenceChannel.current.untrack();
        presenceChannel.current.unsubscribe();
      }
    };
  }, [user.id, user.level]);

  // 리더일 때만 동기화 타이머 시작
  useEffect(() => {
    if (!isLeader) {
      // 리더가 아니면 모든 타이머 중지
      Object.values(syncTimers.current).forEach(timer => {
        if (timer) clearInterval(timer);
      });
      syncTimers.current = {};
      console.log('⏸️ [AdminGameRecordsSync] 리더가 아니므로 동기화 중지');
      return;
    }

    console.log('▶️ [AdminGameRecordsSync] 리더로 지정됨, 자동 동기화 시작');

    // API별 동기화 함수
    const syncGameRecords = async (apiType: 'invest' | 'oroplay' | 'familyapi') => {
      try {
        // ✅ Edge Function은 프로덕션 Supabase 환경에서만 작동
        // 개발/테스트 환경에서는 항상 건너뜀
        // Lv1 파트너 조회도 필요 없으므로 바로 리턴
        return;

        // ❌ 아래 코드는 프로덕션 배포 시에만 활성화
        /*
        const lv1PartnerId = await getLv1Partner();
        if (!lv1PartnerId) {
          console.warn(`⚠️ [${apiType}] Lv1 파트너를 찾을 수 없습니다`);
          return;
        }

        const { data, error } = await supabase.functions.invoke('sync-game-records', {
          body: {
            api_type: apiType,
            partner_id: lv1PartnerId,
          },
        });

        if (error) {
          console.error(`❌ [${apiType}] 동기화 실패:`, error);
        } else {
          console.log(`✅ [${apiType}] 동기화 완료:`, data);
        }
        */
      } catch (error) {
        console.error(`❌ [${apiType}] 동기화 오류:`, error);
      }
    };

    // Invest: 30초 간격
    syncTimers.current.invest = setInterval(() => {
      syncGameRecords('invest');
    }, 30000);

    // OroPlay: 4초 간격
    syncTimers.current.oroplay = setInterval(() => {
      syncGameRecords('oroplay');
    }, 4000);

    // FamilyAPI: 4초 간격
    syncTimers.current.familyapi = setInterval(() => {
      syncGameRecords('familyapi');
    }, 4000);

    // 즉시 한 번 실행
    syncGameRecords('invest');
    syncGameRecords('oroplay');
    syncGameRecords('familyapi');

    // 정리 함수
    return () => {
      Object.values(syncTimers.current).forEach(timer => {
        if (timer) clearInterval(timer);
      });
      syncTimers.current = {};
    };
  }, [isLeader, user.id]);

  // UI 없음 (백그라운드 동기화만)
  return null;
}