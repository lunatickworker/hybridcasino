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
        // ✅ 관리자 페이지가 열려있을 때 자동으로 베팅 동기화
        // Lv2AutoSync와 중복 방지를 위해 Presence를 통해 하나의 세션만 동작
        
        // Lv1 파트너 ID 찾기
        let topLevelPartnerId = user.id;
        if (user.level !== 1) {
          // Lv1까지 올라가기
          let currentId = user.id;
          let currentReferrerId = user.referrer_id;
          
          while (currentReferrerId) {
            const { data: parentPartner } = await supabase
              .from('partners')
              .select('id, level, referrer_id')
              .eq('id', currentReferrerId)
              .single();
            
            if (!parentPartner) break;
            
            if (parentPartner.level === 1) {
              topLevelPartnerId = parentPartner.id;
              break;
            }
            
            currentId = parentPartner.id;
            currentReferrerId = parentPartner.referrer_id;
          }
        }

        console.log(`[${apiType}] 동기화 시작 (Lv1 Partner: ${topLevelPartnerId})`);

        const { data, error } = await supabase.functions.invoke('sync-game-records', {
          body: {
            api_type: apiType,
            partner_id: topLevelPartnerId,
          },
        });

        if (error) {
          console.error(`❌ [${apiType}] 동기화 실패:`, error);
        } else {
          console.log(`✅ [${apiType}] 동기화 완료:`, data);
        }

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