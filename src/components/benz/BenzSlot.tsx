import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Play } from 'lucide-react';
import { Button } from '../ui/button';
import { gameApi } from '../../lib/gameApi';
import { supabase } from '../../lib/supabase';
import { motion } from 'motion/react';
import { ImageWithFallback } from "@figma/ImageWithFallback";
import { toast } from 'sonner@2.0.3';
import { createAdminNotification } from '../../lib/notificationHelper';
import { filterVisibleProviders, filterVisibleGames } from '../../lib/benzGameVisibility';

interface BenzSlotProps {
  user: any;
  onRouteChange: (route: string) => void;
}

interface GameProvider {
  id: number;
  name: string;
  name_ko?: string;
  type: string;
  logo_url?: string;
  thumbnail_url?: string;
  status: string;
  vendor_code?: string;
  provider_ids?: number[]; // 🆕 통합된 게임사의 모든 provider_id
}

interface Game {
  id: string;
  name: string;
  name_ko?: string;
  game_code: string;
  image_url?: string;
  provider_id: number;
  api_type?: string;
  status?: string;
}

const FALLBACK_PROVIDERS = [
  { id: 101, name: 'Pragmatic Play', name_ko: '프라그마틱 플레이', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pragmaticslot.jpg', status: 'visible' },
  { id: 102, name: 'PG Soft', name_ko: 'PG 소프트', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pgsoft.jpg', status: 'visible' },
  { id: 103, name: 'Habanero', name_ko: '하바네로', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/habanero.jpg', status: 'visible' },
  { id: 104, name: 'Booongo', name_ko: '부운고', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/bng.jpg', status: 'visible' },
  { id: 105, name: 'CQ9', name_ko: 'CQ9', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/cq9.jpg', status: 'visible' },
  { id: 106, name: 'Evoplay', name_ko: '에보플레이', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/evoplay.jpg', status: 'visible' },
  { id: 107, name: 'Nolimit City', name_ko: '노리밋시티', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/nolimit.jpg', status: 'visible' },
  { id: 108, name: 'Jingzibao', name_ko: '진지바오시', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/jinjibaoxi.jpg', status: 'visible' },
];

// 게임사 이름으로 logo_url 찾기
const getLogoUrlByProviderName = (provider: GameProvider): string | undefined => {
  const name = (provider.name_ko || provider.name || '').toLowerCase();
  
  // Pragmatic Play Slot
  if ((name.includes('pragmatic') || name.includes('프라그마틱')) && (name.includes('slot') || name.includes('슬롯') || name.includes('play'))) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pragmaticslot.jpg';
  }
  // PG Soft
  if (name.includes('pg') || name.includes('pocket')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pgsoft.jpg';
  }
  // Habanero
  if (name.includes('habanero') || name.includes('하바네로')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/habanero.jpg';
  }
  // Booongo
  if (name.includes('booongo') || name.includes('bng') || name.includes('부운고')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/bng.jpg';
  }
  // CQ9
  if (name.includes('cq9')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/cq9.jpg';
  }
  // Evoplay
  if (name.includes('evoplay') || name.includes('에보플레이')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/evoplay.jpg';
  }
  // Nolimit City
  if (name.includes('nolimit') || name.includes('노리밋')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/nolimit.jpg';
  }
  // Jingzibao
  if (name.includes('jing') || name.includes('진지') || name.includes('바오')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/jinjibaoxi.jpg';
  }
  
  return provider.logo_url;
};

// 랜덤 이미지 선택 함수
const getRandomSlotImage = () => {
  const randomIndex = Math.floor(Math.random() * FALLBACK_PROVIDERS.length);
  return FALLBACK_PROVIDERS[randomIndex].logo_url;
};

export function BenzSlot({ user, onRouteChange }: BenzSlotProps) {
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<GameProvider | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // 🆕 백그라운드 프로세스 상태
  const isMountedRef = useRef(true);
  const closeProcessingRef = useRef<Map<number, boolean>>(new Map()); // 🆕 세션별 종료 처리 중 상태
  const selectedProviderRef = useRef<GameProvider | null>(null); // ⚡ 최신 selectedProvider 추적

  // ⚡ selectedProvider 변경 시 ref 업데이트
  useEffect(() => {
    selectedProviderRef.current = selectedProvider;
  }, [selectedProvider]);

  useEffect(() => {
    loadProviders();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // ✅ Realtime 구독: partner_game_access 변경 감지
  useEffect(() => {
    if (!user?.id || !user?.referrer_id) return;

    console.log('🔔 [BenzSlot] Realtime 구독 시작 - partner_id:', user.referrer_id);
    
    const channel = supabase
      .channel('benz_slot_game_access')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모두 감지
          schema: 'public',
          table: 'partner_game_access',
          filter: `partner_id=eq.${user.referrer_id}` // ✅ 현재 사용자 파트너만 필터링
        },
        (payload) => {
          console.log('🎮 [BenzSlot] 게임 노출 설정 변경 감지:', payload.eventType, payload);
          
          // 제공사 목록 새로고침
          loadProviders();
          
          // 🆕 현재 열려있는 게임 목록도 새로고침
          if (selectedProviderRef.current) {
            console.log('🔄 [BenzSlot] 게임 목록 새로고침:', selectedProviderRef.current.name_ko);
            loadGames(selectedProviderRef.current);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔕 [BenzSlot] Realtime 구독 해제');
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.referrer_id]);
  
  // 🆕 providers 로드 완료 후 localStorage에서 선택한 provider 자동 로드
  useEffect(() => {
    if (providers.length > 0) {
      const savedProvider = localStorage.getItem('benz_selected_provider');
      if (savedProvider) {
        try {
          const providerData = JSON.parse(savedProvider);
          
          // providers 배열에서 매칭되는 provider 찾기 (통합된 provider 기준)
          const matchingProvider = providers.find(p => {
            // ID로 매칭
            if (p.id === providerData.id) return true;
            
            // provider_ids 배열에 포함되어 있는지 체크
            if (p.provider_ids && providerData.provider_ids) {
              return p.provider_ids.some(id => providerData.provider_ids.includes(id));
            }
            
            return false;
          });
          
          if (matchingProvider) {
            console.log('🎯 [BenzSlot] localStorage에서 선택한 provider 자동 로드:', matchingProvider);
            handleProviderClick(matchingProvider);
          }
          
          // localStorage 클리어
          localStorage.removeItem('benz_selected_provider');
        } catch (e) {
          console.error('localStorage provider 파싱 오류:', e);
          localStorage.removeItem('benz_selected_provider');
        }
      }
    }
  }, [providers]);

  const loadProviders = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // ⭐⭐⭐ 새로운 노출 로직 사용
      const allProviders = await gameApi.getProviders({ type: 'slot' });
      const providersData = await filterVisibleProviders(allProviders, user.id);
      
      // 🔥 카지노 게임사 제외 필터링 (DB에 type이 잘못 저장된 경우 대비)
      const CASINO_PROVIDERS = [
        'evolution', 'ezugi', 'microgaming', 'asia', 'sa',
        'dream', 'playace', 'pragmatic live', 'sexy',
        '에볼루션', '이주기', '마이크로', '아시아', '드림', 
        '플레이', '프라그마틱 라이브', '섹시'
      ];
      
      // 슬롯 페이지용: 카지노 게임사 제외
      const slotOnlyProviders = providersData.filter(p => {
        const name = (p.name_ko || p.name || '').toLowerCase();
        
        // Pragmatic의 경우 Live가 아닌 것만 슬롯
        if (name.includes('pragmatic') || name.includes('프라그마틱')) {
          return !(name.includes('live') || name.includes('라이브'));
        }
        
        // 카지노 게임사는 제외
        return !CASINO_PROVIDERS.some(casino => name.includes(casino.toLowerCase()));
      });
      
      console.log('🎰 [BenzSlot] API 응답 게임사:', slotOnlyProviders.length, '개');
      console.log('🎰 [BenzSlot] 게임사 상세:', slotOnlyProviders.map(p => ({
        id: p.id,
        name: p.name,
        name_ko: p.name_ko,
        status: p.status,
        api_type: p.api_type
      })));
      
      // 🆕 같은 이름의 게임사를 하나로 통합 (유연한 매핑)
      const providerMap = new Map<string, GameProvider>();
      
      // 프라그마틱 통합을 위한 정규화 함수
      const normalizeProviderName = (provider: GameProvider): string => {
        const name = (provider.name_ko || provider.name || '').toLowerCase();
        
        // 프라그마틱 관련 통합 (슬롯만)
        if (name.includes('pragmatic') || name.includes('프라그마틱')) {
          if (name.includes('slot') || name.includes('슬롯')) {
            return 'pragmatic_slot';
          }
          // Live가 아니면 슬롯으로 간주
          if (!(name.includes('live') || name.includes('라이브'))) {
            return 'pragmatic_slot';
          }
        }
        
        // 다른 게임사들은 name_ko 또는 name 사용
        return provider.name_ko || provider.name;
      };
      
      for (const provider of slotOnlyProviders) {
        const key = normalizeProviderName(provider);
        
        if (providerMap.has(key)) {
          // 이미 존재하는 게임사 - provider_ids 배열에 추가
          const existing = providerMap.get(key)!;
          if (!existing.provider_ids) {
            existing.provider_ids = [existing.id];
          }
          existing.provider_ids.push(provider.id);
        } else {
          // 새로운 게임사 - DB에서 가져온 logo_url 그대로 사용
          providerMap.set(key, {
            ...provider,
            provider_ids: [provider.id]
          });
        }
      }
      
      const mergedProviders = Array.from(providerMap.values());
      
      console.log('🔍 [BenzSlot] 정렬 전 게임사:', mergedProviders.map(p => ({
        id: p.id,
        name: p.name,
        name_ko: p.name_ko
      })));
      
      // 🆕 원하는 순서대로 정렬
      const slotOrder = [
        'pragmatic', 'pg', 'habanero', 'booongo', 
        'cq9', 'evoplay', 'nolimit', 'jingzibao'
      ];
      
      const sortedProviders = mergedProviders.sort((a, b) => {
        const normalizeForSort = (provider: GameProvider): string => {
          const name = (provider.name_ko || provider.name || '').toLowerCase();
          
          // Pragmatic Play (모든 프라그마틱)
          if (name.includes('pragmatic') || name.includes('프라그마틱')) return 'pragmatic';
          
          // PG Soft
          if (name.includes('pg') && !name.includes('pragmatic')) return 'pg';
          if (name.includes('pocket')) return 'pg';
          if (name.includes('소프트')) return 'pg';
          
          // Habanero
          if (name.includes('habanero') || name.includes('하바네로')) return 'habanero';
          
          // Booongo
          if (name.includes('booongo') || name.includes('bng') || name.includes('부운고')) return 'booongo';
          
          // CQ9
          if (name.includes('cq9')) return 'cq9';
          
          // Evoplay
          if (name.includes('evoplay') || name.includes('에보플레이')) return 'evoplay';
          
          // Nolimit City
          if (name.includes('nolimit') || name.includes('노리밋')) return 'nolimit';
          
          // Jingzibao
          if (name.includes('jing') || name.includes('진지') || name.includes('바오')) return 'jingzibao';
          
          return name;
        };
        
        const aKey = normalizeForSort(a);
        const bKey = normalizeForSort(b);
        
        console.log(`🔍 [BenzSlot] 정렬 비교: ${a.name_ko || a.name} (${aKey}) vs ${b.name_ko || b.name} (${bKey})`);
        
        const aIndex = slotOrder.indexOf(aKey);
        const bIndex = slotOrder.indexOf(bKey);
        
        // 순서에 없는 게임사는 뒤로
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        
        return aIndex - bIndex;
      });
      
      console.log('✅ [BenzSlot] 정렬된 게임사:', sortedProviders.map(p => p.name_ko || p.name));
      
      setProviders(sortedProviders);
    } catch (error) {
      console.error('❌ 제공사 로드 오류:', error);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderClick = async (provider: GameProvider) => {
    // 🆕 백그라운드 프로세스 중 클릭 방지
    if (isProcessing) {
      toast.error('잠시 후 다시 시도해주세요.');
      return;
    }

    // ⭐ Skywind 슬롯 카드 클릭 시 로비 게임 바로 실행
    const providerName = (provider.name || '').toLowerCase();
    const providerNameKo = (provider.name_ko || '').toLowerCase();
    
    if (providerName.includes('skywind') || providerNameKo.includes('스카이윈드')) {
      console.log('🎰 [Skywind] 로비 게임 직접 실행');
      setIsProcessing(true);
      
      try {
        const skywindLobbyGame: Game = {
          id: '0',
          name: 'lobby',
          name_ko: 'lobby',
          game_code: 'lobby',
          provider_id: 0,
          api_type: 'honorapi',  // ✅ 수정: 'honor' → 'honorapi'
          vendor_code: 'slot-skywind'
        };
        
        await handleGameClick(skywindLobbyGame);
      } catch (error) {
        console.error('Skywind 로비 실행 오류:', error);
        toast.error('Skywind 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setSelectedProvider(provider);
    await loadGames(provider);
  };

  // ⚡ 게임 목록 로드 함수 (Realtime 콜백에서도 사용)
  const loadGames = async (provider: GameProvider) => {
    try {
      setGamesLoading(true);

      // 🆕 통합된 게임사의 모든 provider_id로 게임 로드
      const providerIds = provider.provider_ids || [provider.id];
      let allGames: Game[] = [];

      for (const providerId of providerIds) {
        const gamesData = await gameApi.getGames({
          type: 'slot',
          provider_id: providerId
        });

        if (gamesData && gamesData.length > 0) {
          allGames = [...allGames, ...gamesData];
        }
      }

      // ⭐ benzGameVisibility로 매장+사용자 차단 및 점검 상태 처리
      const gamesWithStatus = await filterVisibleGames(allGames, user.id);
      
      setGames(gamesWithStatus);
    } catch (error) {
      console.error('게임 로드 오류:', error);
      setGames([]);
    } finally {
      setGamesLoading(false);
    }
  };

  const handleBackToProviders = () => {
    // 🆕 백그라운드 프로세스 중 또는 게임 실행 중 클릭 방지
    if (isProcessing || launchingGameId) {
      toast.error('잠시 후 다시 시도해주세요.');
      
      // ⭐ 관리자 알림 생성
      createAdminNotification({
        user_id: user.id,
        username: user.username || '알 수 없음',
        user_login_id: user.login_id || '알 수 없음',
        partner_id: user.referrer_id,
        message: '게임 실행 중 뒤로가기 시도',
        notification_type: 'system_error'
      });
      
      return;
    }

    setSelectedProvider(null);
    setGames([]);
  };

  const handleGameClick = async (game: Game) => {
    // 🚫 점검중인 게임은 클릭 불가
    if (game.status === 'maintenance') {
      toast.warning('현재 점검 중인 게임입니다.');
      return;
    }

    // 🆕 백그라운드 프로세스 중 또는 게임 실행 중 클릭 방지
    if (isProcessing || launchingGameId) {
      toast.error('잠시 후 다시 시도해주세요.');
      
      // ⭐ 관리자 알림 생성
      createAdminNotification({
        user_id: user.id,
        username: user.username || '알 수 없음',
        user_login_id: user.login_id || '알 수 없음',
        partner_id: user.referrer_id,
        message: '게임 실행 중 다른 게임 클릭 시도',
        notification_type: 'system_error'
      });
      
      return;
    }

    setLaunchingGameId(game.id);
    setIsProcessing(true); // 🆕 프로세스 시작
    
    try {
      // 🆕 디버깅 로그: 게임 정보 출력
      console.log('🎮 [슬롯 게임 클릭]', {
        game_id: game.id,
        game_name: game.name,
        api_type: game.api_type,
        provider_id: game.provider_id
      });
      
      const activeSession = await gameApi.checkActiveSession(user.id);
      
      // 🆕 디버깅 로그: 활성 세션 정보 출력
      console.log('🔍 [활성 세션 체크]', activeSession);
      
      // ⭐ 0. 세션 종료 중(ending)인지 체크 - 게임 실행 차단
      if (activeSession?.isActive && activeSession.status === 'ending') {
        console.log('⏳ [게임 실행 차단] 이전 세션 종료 중...');
        toast.warning('이전 게임 종료 중입니다. 잠시 후 다시 시도해주세요.', { duration: 3000 });
        setLaunchingGameId(null);
        setIsProcessing(false);
        return;
      }
      
      // ⭐ 1. 다른 API 게임이 실행 중인지 체크
      if (activeSession?.isActive && activeSession.status === 'active' && activeSession.api_type !== game.api_type) {
        console.error('❌ [다른 API 게임 실행 중]', {
          current_api: activeSession.api_type,
          trying_api: game.api_type,
          current_game: activeSession.game_name
        });
        
        toast.error(`다른 게임을 종료한 후 다시 시도해주세요. (현재: ${activeSession.game_name})`);
        
        // ⭐ 관리자 알림 생성
        createAdminNotification({
          user_id: user.id,
          username: user.username || '알 수 없음',
          user_login_id: user.login_id || '알 수 없음',
          partner_id: user.referrer_id,
          message: `다른 API 게임 실행 중 클릭 시도 (현재: ${activeSession.api_type}, 시도: ${game.api_type})`,
          log_message: `현재 게임: ${activeSession.game_name}`,
          notification_type: 'game_error'
        });
        
        setLaunchingGameId(null);
        setIsProcessing(false); // 🆕 프로세스 종료
        return;
      }

      // ⭐ 2. 같은 API 내에서 다른 게임으로 전환 시 기존 게임 출금
      if (activeSession?.isActive && 
          activeSession.api_type === game.api_type && 
          activeSession.game_id !== parseInt(game.id)) {
        
        console.log('🔄 [게임 전환] 기존 게임 출금 후 새 게임 실행:', {
          oldGameId: activeSession.game_id,
          newGameId: game.id
        });
        
        // 기존 게임 출금 + 보유금 동기화
        const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
        await syncBalanceOnSessionEnd(user.id, activeSession.api_type);
        
        console.log('✅ [게임 전환] 기존 게임 출금 완료, 새 게임 실행 시작');
        
        // 이후 새 게임 실행 로직으로 진행 (break 없이 계속)
      }

      // ⭐ 3. 같은 게임의 active 세션이 있는지 체크 (중복 실행 방지)
      if (activeSession?.isActive && 
          activeSession.game_id === parseInt(game.id) && 
          activeSession.status === 'active' && 
          activeSession.launch_url) {
        
        console.log('🔄 [슬롯 입장] active 세션 재사용 - 기존 URL 사용:', activeSession.session_id);
        
        // 기존 launch_url로 게임창 오픈
        const gameWindow = window.open(
          activeSession.launch_url,
          '_blank',
          'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
        );

        if (!gameWindow) {
          // ⭐ 팝업 차단 시나리오
          toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          const sessionId = activeSession.session_id!;
          
          // ready_status를 'popup_blocked'로 업데이트 (세션은 유지)
          await supabase
            .from('game_launch_sessions')
            .update({ 
              ready_status: 'popup_blocked',
              last_activity_at: new Date().toISOString()
            })
            .eq('id', sessionId);
            
          console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료 (active 세션 재사용)');
        } else {
          // ⭐ 팝업 오픈 성공: ready_status를 'popup_opened'로 업데이트
          toast.success(`${game.name} 슬롯에 입장했습니다.`);
          
          const sessionId = activeSession.session_id!;
          
          await supabase
            .from('game_launch_sessions')
            .update({ 
              ready_status: 'popup_opened',
              last_activity_at: new Date().toISOString()
            })
            .eq('id', sessionId);
          
          if (!(window as any).gameWindows) {
            (window as any).gameWindows = new Map();
          }
          (window as any).gameWindows.set(sessionId, gameWindow);
          
          if (!(window as any).gameWindowCheckers) {
            (window as any).gameWindowCheckers = new Map();
          }
          
          // 🆕 중복 방지를 위해 ref 사용
          const handleGameWindowClose = async () => {
            // 🔥 중복 실행 방지 - ref 체크
            if (closeProcessingRef.current.get(sessionId)) {
              return;
            }
            
            closeProcessingRef.current.set(sessionId, true);
            
            try {
              const checker = (window as any).gameWindowCheckers?.get(sessionId);
              if (checker) {
                clearInterval(checker);
                (window as any).gameWindowCheckers?.delete(sessionId);
              }
              
              (window as any).gameWindows?.delete(sessionId);
              
              if ((window as any).syncBalanceAfterGame) {
                await (window as any).syncBalanceAfterGame(sessionId);
              } else {
                // ⭐ syncBalanceAfterGame 함수가 없으면 직접 처리
                try {
                  const { data: session, error: sessionError } = await supabase
                    .from('game_launch_sessions')
                    .select('user_id, api_type, status')
                    .eq('id', sessionId)
                    .single();

                  if (sessionError || !session) {
                    console.error('❌ [게임 종료] 세션 조회 실패:', sessionError);
                    return;
                  }

                  if (session.status !== 'active') {
                    return;
                  }

                  const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
                  await syncBalanceOnSessionEnd(session.user_id, session.api_type);
                } catch (directError) {
                  console.error('❌ [게임 종료] 직접 출금 처리 오류:', directError);
                }
              }
              
              // ✅ 게임 종료 5초 후 베팅 내역 새로고침 이벤트 발생
              setTimeout(() => {
                console.log('🔄 [베팅 내역] 새로고침 이벤트 발생');
                window.dispatchEvent(new CustomEvent('refresh-betting-history'));
              }, 5000);
              
              console.log('✅ [게임 종료] 처리 완료:', sessionId);
            } catch (error) {
              console.error('❌ [게임 종료] 에러:', error);
            } finally {
              // 처리 완료 후 플래그 제거
              closeProcessingRef.current.delete(sessionId);
            }
          };
          
          const checkGameWindow = setInterval(() => {
            try {
              if (gameWindow.closed) {
                handleGameWindowClose();
              }
            } catch (error) {
              // 무시
            }
          }, 1000);
          
          (window as any).gameWindowCheckers.set(sessionId, checkGameWindow);
        }
        
        setLaunchingGameId(null);
        setIsProcessing(false); // 🆕 프로세스 종료
        return;
      }
      
      // ⭐ 4. 새로운 게임 실행 (API 입금 포함)
      const result = await gameApi.generateGameLaunchUrl(user.id, parseInt(game.id));
      
      if (result.success && result.launchUrl) {
        const sessionId = result.sessionId;
        
        const gameWindow = window.open(
          result.launchUrl,
          '_blank',
          'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
        );

        if (!gameWindow) {
          // ⭐ 팝업 차단 시나리오: 세션 종료하지 않고 ready_status만 업데이트
          toast.error('팝업이 차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          if (sessionId && typeof sessionId === 'number') {
            // ready_status를 'popup_blocked'로 업데이트 (세션은 유지)
            await supabase
              .from('game_launch_sessions')
              .update({ 
                ready_status: 'popup_blocked',
                last_activity_at: new Date().toISOString()
              })
              .eq('id', sessionId);
              
            console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료. 재클릭 시 기존 URL 재사용됩니다.');
          }
          
          // ⭐ 팝업 차단 시에는 여기서 종료
          setLaunchingGameId(null);
          setIsProcessing(false);
          return;
        } else {
          // ⭐ 팝업 오픈 성공: ready_status를 'popup_opened'로 업데이트
          toast.success(`${game.name} 슬롯에 입장했습니다.`);
          
          if (sessionId && typeof sessionId === 'number') {
            await supabase
              .from('game_launch_sessions')
              .update({ 
                ready_status: 'popup_opened',
                last_activity_at: new Date().toISOString()
              })
              .eq('id', sessionId);
              
            if (!(window as any).gameWindows) {
              (window as any).gameWindows = new Map();
            }
            (window as any).gameWindows.set(sessionId, gameWindow);
          }
          
          if (sessionId && typeof sessionId === 'number') {
            if (!(window as any).gameWindowCheckers) {
              (window as any).gameWindowCheckers = new Map();
            }
            
            // 🆕 중복 방지를 위해 ref 사용
            const handleGameWindowClose = async () => {
              // 🔥 중복 실행 방지 - ref 체크
              if (closeProcessingRef.current.get(sessionId)) {
                return;
              }
              
              closeProcessingRef.current.set(sessionId, true);
              
              try {
                const checker = (window as any).gameWindowCheckers?.get(sessionId);
                if (checker) {
                  clearInterval(checker);
                  (window as any).gameWindowCheckers?.delete(sessionId);
                }
                
                (window as any).gameWindows?.delete(sessionId);
                
                if ((window as any).syncBalanceAfterGame) {
                  await (window as any).syncBalanceAfterGame(sessionId);
                } else {
                  // ⭐ syncBalanceAfterGame 함수가 없으면 직접 처리
                  try {
                    const { data: session, error: sessionError } = await supabase
                      .from('game_launch_sessions')
                      .select('user_id, api_type, status')
                      .eq('id', sessionId)
                      .single();

                    if (sessionError || !session) {
                      console.error('❌ [게임 종료] 세션 조회 실패:', sessionError);
                      return;
                    }

                    if (session.status !== 'active') {
                      return;
                    }

                    const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
                    await syncBalanceOnSessionEnd(session.user_id, session.api_type);
                  } catch (directError) {
                    console.error('❌ [게임 종료] 직접 출금 처리 오류:', directError);
                  }
                }
                
                // ✅ 게임 종료 5초 후 베팅 내역 새로고침 이벤트 발생
                setTimeout(() => {
                  console.log('🔄 [베팅 내역] 새로고침 이벤트 발생');
                  window.dispatchEvent(new CustomEvent('refresh-betting-history'));
                }, 5000);
                
                console.log('✅ [게임 종료] 처리 완료:', sessionId);
              } catch (error) {
                console.error('❌ [게임 종료] 에러:', error);
              } finally {
                // 처리 완료 후 플래그 제거
                closeProcessingRef.current.delete(sessionId);
              }
            };
            
            const checkGameWindow = setInterval(() => {
              try {
                if (gameWindow.closed) {
                  handleGameWindowClose();
                }
              } catch (error) {
                // 무시
              }
            }, 1000);
            
            (window as any).gameWindowCheckers.set(sessionId, checkGameWindow);
          }
        }
      } else {
        // 에러 메시지를 더 친절하게 표시
        const errorMessage = result.error || '게임을 실행할 수 없습니다.';
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('게임 실행 오류:', error);
      // catch 블록에서도 친절한 메시지 표시
      const errorMessage = error instanceof Error ? error.message : '게임을 실행할 수 없습니다.';
      if (errorMessage.includes('보유금')) {
        toast.error(errorMessage);
      } else {
        toast.error('게임을 실행할 수 없습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setLaunchingGameId(null);
      setIsProcessing(false); // 🆕 프로세스 종료
    }
  };

  return (
    <div className="relative min-h-screen" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
      {/* 깔끔한 다크 배경 */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          background: '#0a0a0f',
        }}
      />

      <div className="relative z-10 p-8 lg:p-12 space-y-10 max-w-[1400px] mx-auto">
        {/* 미니멀 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {selectedProvider && (
              <Button
                onClick={handleBackToProviders}
                variant="ghost"
                className="text-white/60 hover:text-white hover:bg-white/5 transition-all"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                뒤로가기
              </Button>
            )}
            <h1 className="text-4xl font-bold tracking-tight">
              <span style={{
                background: 'linear-gradient(90deg, #ffffff 0%, #E6C9A8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                {selectedProvider ? selectedProvider.name_ko || selectedProvider.name : '슬롯 게임'}
              </span>
            </h1>
          </div>
        </div>

        {/* 제공사 목록 - 5칸 정렬 */}
        {!selectedProvider && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl animate-pulse" style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
                }}></div>
              ))
            ) : providers.length === 0 ? (
              <div className="col-span-full text-center py-20">
                <p className="text-white/60 text-2xl">이용 가능한 게임사가 없습니다.</p>
                <p className="text-white/40 text-lg mt-2">관리자에게 문의하세요.</p>
              </div>
            ) : (
              providers.map((provider, index) => (
                <motion.div
                  key={provider.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ 
                    y: -12,
                    scale: 1.05,
                    transition: { duration: 0.3 }
                  }}
                  className="cursor-pointer group relative"
                  onClick={() => handleProviderClick(provider)}
                > 
                  {/* ✅ logo_url이 있으면 이미지 표시, 없으면 fallback 이미지 표시 */}
                  <img
                    src={provider.logo_url || getLogoUrlByProviderName(provider) || getRandomSlotImage()}
                    alt={provider.name_ko || provider.name}
                    className="w-full h-full object-cover"
                  />
                  {/* 🚫 점검중 오버레이 */}
                  {provider.status === 'maintenance' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                      <img
                        src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Stop.png"
                        alt="점검중"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* 게임 목록 - 5칸 정렬 */}
        {selectedProvider && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {gamesLoading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl animate-pulse" style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
                }}></div>
              ))
            ) : games.length === 0 ? (
              <div className="col-span-full text-center py-20">
                <p className="text-white/40 text-lg">게임이 없습니다.</p>
              </div>
            ) : (
              games.map((game) => (
                <motion.div
                  key={game.id}
                  whileHover={game.status === 'maintenance' ? {} : { scale: 1.05, y: -8 }}
                  whileTap={game.status === 'maintenance' ? {} : { scale: 0.98 }}
                  className={`relative ${game.status === 'maintenance' ? 'cursor-not-allowed' : 'cursor-pointer group'}`}
                  onClick={() => handleGameClick(game)}
                >
                  <div className="relative aspect-square overflow-hidden rounded-2xl transition-all duration-500" style={{
                    background: '#16161f',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                  }}>
                    {/* 게임 이미지 */}
                    {game.image_url ? (
                      <ImageWithFallback
                        src={game.image_url}
                        alt={game.name_ko || game.name}
                        className={`w-full h-full object-cover transition-all duration-700 ${
                          game.status === 'maintenance' ? '' : 'group-hover:scale-110'
                        }`}
                        style={{ objectPosition: 'center 30%' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{
                        background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)'
                      }}>
                        <Play className="w-16 h-16 text-white/20" />
                      </div>
                    )}
                    
                    {/* 그라디언트 오버레이 */}
                    <div className={`absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent transition-opacity duration-500 ${
                      game.status === 'maintenance' ? 'opacity-70' : 'opacity-70 group-hover:opacity-80'
                    }`}></div>
                    
                    {/* 한글 게임명 - 하단 고정 */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/50 z-10">
                      <p className="text-white text-center line-clamp-2" style={{
                        fontFamily: 'AsiaHead, -apple-system, sans-serif',
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        textShadow: '0 3px 15px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,0.9)',
                        letterSpacing: '-0.01em',
                        lineHeight: '1.4'
                      }}>
                        {game.name_ko || game.name}
                      </p>
                    </div>
                    
                    {/* 호버 시 로즈 골드 테두리 */}
                    {game.status !== 'maintenance' && (
                      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-20" style={{
                        boxShadow: 'inset 0 0 0 2px rgba(193, 154, 107, 0.5)'
                      }}></div>
                    )}
                    
                    {/* 호버 시 플레이 버튼 */}
                    {game.status !== 'maintenance' && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 z-20">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-24 h-24 rounded-full backdrop-blur-xl flex items-center justify-center transition-all duration-500" style={{
                            background: 'rgba(193, 154, 107, 0.15)',
                            boxShadow: '0 0 40px rgba(193, 154, 107, 0.3), inset 0 0 20px rgba(255,255,255,0.1)',
                            border: '2px solid rgba(193, 154, 107, 0.4)'
                          }}>
                            <Play className="w-12 h-12" style={{ color: '#E6C9A8', fill: '#E6C9A8' }} />
                          </div>
                          <span className="text-white font-black text-xl tracking-wide" style={{
                            textShadow: '0 2px 20px rgba(0,0,0,0.8)',
                            color: '#E6C9A8',
                            letterSpacing: '0.05em'
                          }}>
                            PLAY
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* 🚫 점검중 오버레이 - motion.div 직접 자식 */}
                  {game.status === 'maintenance' && (
                    <div className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none" style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      zIndex: 50
                    }}>
                      <img
                        src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Stop.png"
                        alt="점검중"
                        className="w-1/2 h-1/2 object-contain"
                      />
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}