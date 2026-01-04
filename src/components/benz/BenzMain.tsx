import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { 
  Play, 
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner@2.0.3";
import { createAdminNotification } from '../../lib/notificationHelper';

// Benz Casino & Slot Main Page
interface BenzMainProps {
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
  api_type?: string;
  provider_ids?: number[]; // 🆕 통합된 게임사의 모든 provider_id
}

export function BenzMain({ user, onRouteChange }: BenzMainProps) {
  const [casinoProviders, setCasinoProviders] = useState<GameProvider[]>([]);
  const [slotProviders, setSlotProviders] = useState<GameProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoginMessage, setShowLoginMessage] = useState(false);
  const [isHoveringBanner, setIsHoveringBanner] = useState(false); // 🆕 배너 hover 상태
  const [isProcessing, setIsProcessing] = useState(false); // 🆕 백엔드 처리 중 상태
  const [launchingProviderId, setLaunchingProviderId] = useState<number | null>(null); // 🆕 실행 중인 게임사 ID
  const closeProcessingRef = useRef<Map<number, boolean>>(new Map()); // 🆕 세션별 종료 처리 상태

  // Fallback 데이터
  const FALLBACK_CASINO_PROVIDERS = [
    { id: 1, name: 'Evolution', name_ko: '에볼루션', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/evolution.jpg', status: 'visible' },
    { id: 2, name: 'Pragmatic Play Live', name_ko: '프라그마틱 라이브', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pragmaticlive.jpg', status: 'visible' },
    { id: 3, name: 'Microgaming', name_ko: '마이크로 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/microgaming.jpg', status: 'visible' },
    { id: 4, name: 'Asia Gaming', name_ko: '아시아 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/asiagaming.jpg', status: 'visible' },
    { id: 5, name: 'SA Gaming', name_ko: 'SA 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/sagaming.jpg', status: 'visible' },
    { id: 6, name: 'Ezugi', name_ko: '이주기', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/ezugi.jpg', status: 'visible' },
    { id: 7, name: 'Dream Gaming', name_ko: '드림 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/dreamgaming.jpg', status: 'visible' },
    { id: 8, name: 'Play Ace', name_ko: '플레이 에이스', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/playace.jpg', status: 'visible' },
  ];

  const FALLBACK_SLOT_PROVIDERS = [
    { id: 101, name: 'Pragmatic Play', name_ko: '프라그마틱 플레이', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pragmaticslot.jpg', status: 'visible' },
    { id: 102, name: 'PG Soft', name_ko: 'PG 소프트', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pgsoft.jpg', status: 'visible' },
    { id: 103, name: 'Habanero', name_ko: '하바네로', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/habanero.jpg', status: 'visible' },
    { id: 104, name: 'Booongo', name_ko: '부운고', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/bng.jpg', status: 'visible' },
    { id: 105, name: 'CQ9', name_ko: 'CQ9', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/cq9.jpg', status: 'visible' },
    { id: 106, name: 'Evoplay', name_ko: '에보플레이', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/evoplay.jpg', status: 'visible' },
    { id: 107, name: 'Nolimit City', name_ko: '노리밋시티', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/nolimit.jpg', status: 'visible' },
    { id: 108, name: 'Jingzibao', name_ko: '진지바오시', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/jinjibaoxi.jpg', status: 'visible' },
  ];

  useEffect(() => {
    loadData();

    // ✅ Realtime: games, game_providers, honor_games, honor_games_provider 테이블 변경 감지
    const gamesChannel = supabase
      .channel('benz_main_games_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        () => {
          console.log('🔄 [BenzMain] games 테이블 변경 감지 - 리로드');
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_providers' },
        () => {
          console.log('🔄 [BenzMain] game_providers 테이블 변경 감지 - 리로드');
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'honor_games' },
        () => {
          console.log('🔄 [BenzMain] honor_games 테이블 변경 감지 - 리로드');
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'honor_games_provider' },
        () => {
          console.log('🔄 [BenzMain] honor_games_provider 테이블 변경 감지 - 리로드');
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gamesChannel);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // ⭐⭐⭐ 새로운 노출 로직 사용
      const { filterVisibleProviders } = await import('../../lib/benzGameVisibility');
      
      const allCasinoProviders = await gameApi.getProviders({ type: 'casino' });
      const casinoData = await filterVisibleProviders(allCasinoProviders, user?.id);
      
      const allSlotProviders = await gameApi.getProviders({ type: 'slot' });
      const slotData = await filterVisibleProviders(allSlotProviders, user?.id);
      
      // 🆕 카지노 게임사 통합 (같은 이름끼리 합치기)
      const casinoProviderMap = new Map<string, GameProvider>();
      
      const normalizeCasinoName = (provider: GameProvider): string => {
        const name = (provider.name_ko || provider.name || '').toLowerCase();
        
        // Pragmatic Play Live 통합
        if (name.includes('pragmatic') || name.includes('프라그마틱')) {
          if (name.includes('live') || name.includes('라이브')) {
            return 'pragmatic_live';
          }
        }
        
        // Evolution 통합
        if (name.includes('evolution') || name.includes('에볼루션')) {
          return 'evolution';
        }
        
        // Asia Gaming 통합
        if (name.includes('asia') || name.includes('아시아')) {
          return 'asiagaming';
        }
        
        // 다른 게임사들은 name_ko 또는 name 사용
        return provider.name_ko || provider.name;
      };
      
      for (const provider of casinoData) {
        const key = normalizeCasinoName(provider);
        
        if (casinoProviderMap.has(key)) {
          // 이미 존재하는 게임사 - provider_ids 배열에 추가
          const existing = casinoProviderMap.get(key)!;
          if (!existing.provider_ids) {
            existing.provider_ids = [existing.id];
          }
          existing.provider_ids.push(provider.id);
        } else {
          // 새로운 게임사
          casinoProviderMap.set(key, {
            ...provider,
            provider_ids: [provider.id]
          });
        }
      }
      
      // 🆕 슬롯 게임사 통합 (같은 이름끼리 합치기)
      const slotProviderMap = new Map<string, GameProvider>();
      
      const normalizeSlotName = (provider: GameProvider): string => {
        const name = (provider.name_ko || provider.name || '').toLowerCase();
        
        // 프라그마틱 관련 통합
        if (name.includes('pragmatic') || name.includes('프라그마틱')) {
          if (name.includes('slot') || name.includes('슬롯')) {
            return 'pragmatic_slot';
          }
          if (name.includes('live') || name.includes('라이브')) {
            return 'pragmatic_live';
          }
          // 기본 프라그마틱
          return 'pragmatic_slot';
        }
        
        // 다른 게임사들은 name_ko 또는 name 사용
        return provider.name_ko || provider.name;
      };
      
      for (const provider of slotData) {
        const key = normalizeSlotName(provider);
        
        if (slotProviderMap.has(key)) {
          // 이미 존재하는 게임사 - provider_ids 배열에 추가
          const existing = slotProviderMap.get(key)!;
          if (!existing.provider_ids) {
            existing.provider_ids = [existing.id];
          }
          existing.provider_ids.push(provider.id);
        } else {
          // 새로운 게임사
          slotProviderMap.set(key, {
            ...provider,
            provider_ids: [provider.id]
          });
        }
      }
      
      const mergedCasino = Array.from(casinoProviderMap.values());
      const mergedSlot = Array.from(slotProviderMap.values());
      
      console.log('🔍 [BenzMain] 정렬 전 슬롯 게임사:', mergedSlot.map(p => ({
        id: p.id,
        name: p.name,
        name_ko: p.name_ko
      })));
      
      // 🆕 원하는 순서대로 정렬
      const casinoOrder = [
        'evolution', 'pragmatic_live', 'microgaming', 'asiagaming', 
        'sa gaming', 'ezugi', 'dream gaming', 'playace'
      ];
      const slotOrder = [
        'pragmatic', 'pg', 'habanero', 'booongo', 
        'cq9', 'evoplay', 'nolimit', 'jingzibao'
      ];
      
      const sortProviders = (providers: GameProvider[], order: string[]) => {
        return providers.sort((a, b) => {
          const normalizeForSort = (provider: GameProvider): string => {
            const name = (provider.name_ko || provider.name || '').toLowerCase();
            
            // Evolution
            if (name.includes('evolution') || name.includes('에볼루션')) return 'evolution';
            
            // Pragmatic Play (모든 프라그마틱)
            if (name.includes('pragmatic') || name.includes('프라그마틱')) {
              if (name.includes('live') || name.includes('라이브')) return 'pragmatic_live';
              return 'pragmatic'; // 슬롯용
            }
            
            // Microgaming
            if (name.includes('microgaming') || name.includes('마이크로')) return 'microgaming';
            
            // Asia Gaming
            if (name.includes('asia') || name.includes('아시아')) return 'asiagaming';
            
            // SA Gaming
            if (name.includes('sa') || name.includes('게이밍')) return 'sa gaming';
            
            // Ezugi
            if (name.includes('ezugi') || name.includes('이주기')) return 'ezugi';
            
            // Dream Gaming
            if (name.includes('dream') || name.includes('드림')) return 'dream gaming';
            
            // Play Ace
            if (name.includes('playace') || name.includes('플레이') || name.includes('에이스')) return 'playace';
            
            // PG Soft
            if ((name.includes('pg') && !name.includes('pragmatic')) || name.includes('pocket') || name.includes('소프트')) return 'pg';
            
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
          const aIndex = order.indexOf(aKey);
          const bIndex = order.indexOf(bKey);
          
          // 순서에 없는 게임사는 뒤로
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          
          return aIndex - bIndex;
        });
      };
      
      const sortedCasino = sortProviders(mergedCasino, casinoOrder);
      const sortedSlot = sortProviders(mergedSlot, slotOrder);
      
      console.log('🎰 [BenzMain] 정렬된 카지노 게임사:', sortedCasino.map(p => p.name_ko || p.name));
      console.log('🎰 [BenzMain] 정렬된 슬롯 게임사:', sortedSlot.map(p => p.name_ko || p.name));
      
      setCasinoProviders(sortedCasino.length > 0 ? sortedCasino : FALLBACK_CASINO_PROVIDERS);
      setSlotProviders(sortedSlot.length > 0 ? sortedSlot : FALLBACK_SLOT_PROVIDERS);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      // 오류 시 fallback 사용
      setCasinoProviders(FALLBACK_CASINO_PROVIDERS);
      setSlotProviders(FALLBACK_SLOT_PROVIDERS);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderClick = (provider: GameProvider, type: 'casino' | 'slot') => {
    // 🚫 점검중인 게임사는 클릭 불가
    if (provider.status === 'maintenance') {
      toast.warning('현재 점검 중인 게임사입니다.');
      return;
    }

    if (!user) {
      setShowLoginMessage(true);
      setTimeout(() => setShowLoginMessage(false), 3000);
      return;
    }
    
    // 🆕 백엔드 처리 중 또는 게임 실행 중에는 클릭 방지
    if (isProcessing || launchingProviderId) {
      toast.error('잠시 후 다시 시도해주세요.');
      
      // ⭐ 관리자 알림 생성
      createAdminNotification({
        user_id: user.id,
        username: user.username || '알 수 없음',
        user_login_id: user.login_id || '알 수 없음',
        partner_id: user.referrer_id,
        message: '게임 실행 중 다른 게임사 클릭 시도',
        notification_type: 'system_error'
      });
      
      return;
    }
    
    // 🆕 카지노의 경우 바로 로비 게임 실행
    if (type === 'casino') {
      launchCasinoLobby(provider);
    } else {
      // 🆕 슬롯은 게임사 정보를 localStorage에 저장하고 슬롯 페이지로 이동
      localStorage.setItem('benz_selected_provider', JSON.stringify(provider));
      onRouteChange('/benz/slot');
    }
  };

  // 🆕 카지노 로비 게임 자동 실행
  const launchCasinoLobby = async (provider: GameProvider) => {
    try {
      // 로딩 표시
      toast.info(`${provider.name_ko || provider.name} 로비를 불러오는 중...`);
      setIsProcessing(true);
      setLaunchingProviderId(provider.id);

      // ⭐ Evolution 게임사는 game_id=5185869를 바로 실행
      const providerName = (provider.name || '').toLowerCase();
      const providerNameKo = (provider.name_ko || '').toLowerCase();
      
      if (providerName.includes('evolution') || providerNameKo.includes('에볼루션')) {
        console.log('🎰 [Evolution] game_id=5185869 직접 실행');
        
        // 🆕 active 세션 체크
        const activeSession = await gameApi.checkActiveSession(user.id);
        
        // ⭐ 1. 다른 API 게임이 실행 중인지 체크
        if (activeSession?.isActive && activeSession.game_id !== 5185869) {
          toast.error('잠시 후 다시 시도해주세요.');
          
          // ⭐ 관리자 알림 생성
          createAdminNotification({
            user_id: user.id,
            username: user.username || '알 수 없음',
            user_login_id: user.login_id || '알 수 없음',
            partner_id: user.referrer_id,
            message: `다른 게임 실행 중 Evolution 클릭 시도`,
            log_message: `현재 게임: ${activeSession.game_name}`,
            notification_type: 'game_error'
          });
          
          setIsProcessing(false);
          setLaunchingProviderId(null);
          return;
        }

        // ⭐ 2. 같은 게임의 active 세션이 있는지 체크 (중복 실행 방지)
        if (activeSession?.isActive && 
            activeSession.game_id === 5185869 && 
            activeSession.status === 'active' && 
            activeSession.launch_url) {
          
          console.log('🔄 [Evolution 재입장] active 세션 재사용:', activeSession.session_id);
          
          // 기존 launch_url로 게임창 오픈
          const gameWindow = window.open(
            activeSession.launch_url,
            '_blank',
            'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
          );

          if (!gameWindow) {
            toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
            
            await supabase
              .from('game_launch_sessions')
              .update({ 
                ready_status: 'popup_blocked',
                last_activity_at: new Date().toISOString()
              })
              .eq('id', activeSession.session_id);
              
            console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료');
          } else {
            toast.success(`Evolution 카지노에 입장했습니다.`);
            
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
            
            // 🆕 세션별 종료 처리 상태 추적
            let isProcessing = false;
            const handleGameWindowClose = async () => {
              if (isProcessing) return;
              isProcessing = true;
              
              const checker = (window as any).gameWindowCheckers?.get(sessionId);
              if (checker) {
                clearInterval(checker);
                (window as any).gameWindowCheckers?.delete(sessionId);
              }
              
              (window as any).gameWindows?.delete(sessionId);
              await (window as any).syncBalanceAfterGame?.(sessionId);
            };
            
            const checker = setInterval(() => {
              if (gameWindow.closed) {
                handleGameWindowClose();
              }
            }, 1000);
            
            (window as any).gameWindowCheckers.set(sessionId, checker);
          }
          
          setIsProcessing(false);
          setLaunchingProviderId(null);
          return;
        }

        // ⭐ 3. 새로운 세션으로 Evolution 게임 실행
        const launchResult = await gameApi.generateGameLaunchUrl(user.id, 5185869);
        
        if (!launchResult.success || !launchResult.launchUrl) {
          toast.error(launchResult.error || 'Evolution 게임을 시작할 수 없습니다.');
          setIsProcessing(false);
          setLaunchingProviderId(null);
          return;
        }

        const gameWindow = window.open(
          launchResult.launchUrl,
          '_blank',
          'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
        );

        if (!gameWindow) {
          toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          if (launchResult.sessionId) {
            await supabase
              .from('game_launch_sessions')
              .update({ 
                ready_status: 'popup_blocked',
                last_activity_at: new Date().toISOString()
              })
              .eq('id', launchResult.sessionId);
              
            console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료');
          }
        } else {
          toast.success('Evolution 카지노에 입장했습니다.');
          
          if (launchResult.sessionId) {
            await supabase
              .from('game_launch_sessions')
              .update({ 
                ready_status: 'popup_opened',
                last_activity_at: new Date().toISOString()
              })
              .eq('id', launchResult.sessionId);
          }
          
          const sessionId = launchResult.sessionId!;
          if (!(window as any).gameWindows) {
            (window as any).gameWindows = new Map();
          }
          (window as any).gameWindows.set(sessionId, gameWindow);
          
          if (!(window as any).gameWindowCheckers) {
            (window as any).gameWindowCheckers = new Map();
          }
          
          // 🆕 세션별 종료 처리 상태 추적
          let isProcessing = false;
          const handleGameWindowClose = async () => {
            if (isProcessing) return;
            isProcessing = true;
            
            const checker = (window as any).gameWindowCheckers?.get(sessionId);
            if (checker) {
              clearInterval(checker);
              (window as any).gameWindowCheckers?.delete(sessionId);
            }
            
            (window as any).gameWindows?.delete(sessionId);
            await (window as any).syncBalanceAfterGame?.(sessionId);
          };
          
          const checker = setInterval(() => {
            if (gameWindow.closed) {
              handleGameWindowClose();
            }
          }, 1000);
          
          (window as any).gameWindowCheckers.set(sessionId, checker);
        }
        
        setIsProcessing(false);
        setLaunchingProviderId(null);
        return;
      }

      // 게임사의 모든 provider_id로 게임 로드
      const providerIds = provider.provider_ids || [provider.id];
      let allGames: any[] = [];

      for (const providerId of providerIds) {
        const gamesData = await gameApi.getUserVisibleGames({
          type: 'casino',
          provider_id: providerId,
          userId: user.id
        });

        if (gamesData && gamesData.length > 0) {
          allGames = [...allGames, ...gamesData];
        }
      }

      // 로비 게임 찾기
      const lobbyGame = allGames.find(game => 
        game.name?.toLowerCase().includes('lobby') || 
        game.name_ko?.includes('로비')
      );

      if (!lobbyGame) {
        toast.error('로비가 없습니다. 리스트로 이동합니다.');
        localStorage.setItem('benz_selected_provider', JSON.stringify(provider));
        onRouteChange('/benz/casino');
        return;
      }

      // 🆕 active 세션 체크
      const activeSession = await gameApi.checkActiveSession(user.id);
      
      // ⭐ 1. 다른 API 게임이 실행 중인지 체크
      if (activeSession?.isActive && activeSession.api_type !== lobbyGame.api_type) {
        toast.error('잠시 후 다시 시도해주세요.');
        
        // ⭐ 관리자 알림 생성
        createAdminNotification({
          user_id: user.id,
          username: user.username || '알 수 없음',
          user_login_id: user.login_id || '알 수 없음',
          partner_id: user.referrer_id,
          message: `다른 API 게임 실행 중 클릭 시도 (현재: ${activeSession.api_type}, 시도: ${lobbyGame.api_type})`,
          log_message: `현재 게임: ${activeSession.game_name}`,
          notification_type: 'game_error'
        });
        
        setIsProcessing(false);
        setLaunchingProviderId(null);
        return;
      }

      // ⭐ 2. 같은 API 내에서 다른 게임으로 전환 시 기존 게임 출금
      if (activeSession?.isActive && 
          activeSession.api_type === lobbyGame.api_type && 
          activeSession.game_id !== parseInt(lobbyGame.id)) {
        
        console.log('🔄 [게임 전환] 기존 게임 출금 후 새 게임 실행:', {
          oldGameId: activeSession.game_id,
          newGameId: lobbyGame.id
        });
        
        // 기존 게임 출금 + 보유금 동기화
        const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
        await syncBalanceOnSessionEnd(user.id, activeSession.api_type);
        
        console.log('✅ [게임 전환] 기존 게임 출금 완료, 새 게임 실행 시작');
      }

      // ⭐ 3. 같은 게임의 active 세션이 있는지 체크 (중복 실행 방지)
      if (activeSession?.isActive && 
          activeSession.game_id === parseInt(lobbyGame.id) && 
          activeSession.status === 'active' && 
          activeSession.launch_url) {
        
        console.log('🔄 [로비 입장] active 세션 재사용 - 기존 URL 사용:', activeSession.session_id);
        
        // 기존 launch_url로 게임창 오픈
        const gameWindow = window.open(
          activeSession.launch_url,
          '_blank',
          'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
        );

        if (!gameWindow) {
          toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          const sessionId = activeSession.session_id!;
          
          await supabase
            .from('game_launch_sessions')
            .update({ 
              ready_status: 'popup_blocked',
              last_activity_at: new Date().toISOString()
            })
            .eq('id', sessionId);
            
          console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료 (active 세션 재사용)');
        } else {
          toast.success(`${provider.name_ko || provider.name} 카지노에 입장했습니다.`);
          
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
          
          // 🆕 세션별 종료 처리 상태 추적
          let isProcessing = false;
          const handleGameWindowClose = async () => {
            if (isProcessing) return;
            isProcessing = true;
            
            const checker = (window as any).gameWindowCheckers?.get(sessionId);
            if (checker) {
              clearInterval(checker);
              (window as any).gameWindowCheckers?.delete(sessionId);
            }
            
            (window as any).gameWindows?.delete(sessionId);
            await (window as any).syncBalanceAfterGame?.(sessionId);
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
        
        setIsProcessing(false);
        setLaunchingProviderId(null);
        return;
      }

      // ⭐ 4. 새로운 게임 실행 (API 입금 포함)
      console.log('🎰 [BenzMain] 로비 게임 실행:', lobbyGame.name);
      
      const result = await gameApi.generateGameLaunchUrl(user.id, parseInt(lobbyGame.id));
      
      if (result.success && result.launchUrl) {
        const sessionId = result.sessionId;
        
        const gameWindow = window.open(
          result.launchUrl,
          '_blank',
          'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
        );

        if (!gameWindow) {
          toast.error('차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          if (sessionId && typeof sessionId === 'number') {
            await supabase
              .from('game_launch_sessions')
              .update({ 
                ready_status: 'popup_blocked',
                last_activity_at: new Date().toISOString()
              })
              .eq('id', sessionId);
              
            console.log('⚠️ [팝업 차단] ready_status=popup_blocked 업데이트 완료. 재클릭 시 기존 URL 재사용됩니다.');
          }
        } else {
          toast.success(`${provider.name_ko || provider.name} 카지노에 입장했습니다.`);
          
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
            
            // 🆕 세션별 종료 처리 상태 추적
            let isProcessing = false;
            const handleGameWindowClose = async () => {
              if (isProcessing) return;
              isProcessing = true;
              
              const checker = (window as any).gameWindowCheckers?.get(sessionId);
              if (checker) {
                clearInterval(checker);
                (window as any).gameWindowCheckers?.delete(sessionId);
              }
              
              (window as any).gameWindows?.delete(sessionId);
              await (window as any).syncBalanceAfterGame?.(sessionId);
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
        toast.error(result.message || '게임 실행에 실패했습니다.');
      }
    } catch (error) {
      console.error('❌ 카지노 로비 실행 오류:', error);
      toast.error('게임 실행 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setLaunchingProviderId(null);
    }
  };

  return (
    <>
      {/* 로그인 필요 메시지 */}
      <AnimatePresence>
        {showLoginMessage && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[120]"
          >
            <div className="relative px-10 py-5" style={{ backgroundColor: '#000000', border: '4px solid #444444' }}>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse"></div>
                <p className="font-bold text-lg text-white">로그인이 필요한 서비스입니다</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1단 배경 이미지 - 상단 배너 */}
      <section 
        className="relative w-auto bg-cover bg-center bg-no-repeat h-[250px] md:h-[500px]"
        style={{
          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/photo_2025-12-28_09-50-58.jpg?v=2)',
          backgroundPosition: 'center center'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60"></div>
        <div className="relative z-10 flex items-start justify-start h-full -ml-7 md:mt-1">
          <div className="relative text-left">
            {/* 배너 텍스트 이미지 */}
            <img
              src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Banner-Text.png?t=20241229"
              alt="LIVE CASINO"
              className="w-full h-auto object-contain max-w-[330px] md:max-w-[2000px]"
            />
            
            {/* 이미지 내 버튼 위치에 클릭 영역 */}
            <button
              onMouseEnter={() => setIsHoveringBanner(true)}
              onMouseLeave={() => setIsHoveringBanner(false)}
              onClick={() => {
                if (!user) {
                  setShowLoginMessage(true);
                  setTimeout(() => setShowLoginMessage(false), 3000);
                  return;
                }
                onRouteChange('/benz/casino');
              }}
              className="absolute cursor-pointer"
              style={{
                left: '12.5%',
                bottom: '19.6%',
                width: '35.72%',
                height: '14.8%',
                background: 'transparent'
              }}
              aria-label="Play Now"
            >
              {/* Hover 이미지 - 버튼 위에만 표시 */}
              {isHoveringBanner && (
                <img
                  src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/hover1.png"
                  alt="Play Now Hover"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 간격 */}
      <div className="h-[40px] md:h-[80px]" style={{ backgroundColor: '#141414' }}></div>

      {/* 2단 배경 이미지 - Casino List */}
      <section 
        className="relative w-full bg-cover bg-center bg-no-repeat py-8 md:py-16 min-h-[200px] md:min-h-[400px]"
        style={{
          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/photo_2025-12-28_09-51-03.jpg)',
          backgroundPosition: 'center center'
        }}
      >
        <div className="absolute inset-0 bg-black/70"></div>
        
        {/* Casino 게임 리스트 타이틀 이미지 - 배너 위에 겹쳐서 왼쪽 정렬 */}
        <img
          src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Casino-game-list.png"
          alt="Casino Game List"
          className="absolute z-20 w-[200px] md:w-auto top-[-35px] left-[18px] md:top-[-74px] md:left-[44px]"
        />
        
        <div className="relative z-10 px-4 md:px-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-8 w-full">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="aspect-square bg-gray-800/50 animate-pulse rounded-2xl"></div>
              ))
            ) : (
              casinoProviders.map((provider, index) => (
                <motion.div
                  key={provider.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileHover={{
                    y: -12,
                    scale: 1.05,
                    transition: { duration: 0.3 }
                  }}
                  className={`group relative ${provider.status === 'maintenance' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={() => handleProviderClick(provider, 'casino')}
                >
                  {provider.logo_url && (
                    <img
                      src={provider.logo_url}
                      alt=""
                      className="w-full object-contain"
                    />
                  )}
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
        </div>
      </section>

      {/* 간격 */}
      <div className="h-[40px] md:h-[80px]" style={{ backgroundColor: '#141414' }}></div>

      {/* 3단 배경 이미지 - Slot List */}
      <section 
        className="relative w-full bg-cover bg-center bg-no-repeat py-8 md:py-16 min-h-[200px] md:min-h-[400px]"
        style={{
          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/photo_2025-12-28_09-50-48.jpg)',
          backgroundPosition: 'center center'
        }}
      >
        <div className="absolute inset-0 bg-black/70"></div>
        
        {/* Slot 게임 리스트 타이틀 이미지 - 배너 위에 겹쳐서 왼쪽 정렬 */}
        <img
          src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Slot-game-list.png"
          alt="Slot Game List"
          className="absolute z-20 w-[200px] md:w-auto top-[-37px] left-[13px] md:top-[-74px] md:left-[44px]"          
        />
        
        <div className="relative z-10 px-4 md:px-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-8 w-full">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="aspect-square bg-gray-800/50 animate-pulse rounded-2xl"></div>
              ))
            ) : (
              slotProviders.map((provider, index) => (
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
                  className={`group relative ${provider.status === 'maintenance' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={() => handleProviderClick(provider, 'slot')}
                >
                  {provider.logo_url && (
                    <img
                      src={provider.logo_url}
                      alt=""
                      className="w-[120%] object-contain"
                    />
                  )}
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
        </div>
      </section>

      {/* Bottom 영역 - 로고 섹션 */}
      <section 
        className="relative w-full bg-center bg-no-repeat h-[70px] md:h-[300px]"
        style={{
          backgroundColor: '#141414'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 z-0"></div>
        
        <img
          src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Gaming_bottom.png"
          alt="Partner Logos"
          className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-auto object-contain"
          style={{
            width: '100%',
            maxWidth: 'none',
            filter: 'brightness(0.95)',
            zIndex: 10
          }}
        />
      </section>
    </>
  );
}