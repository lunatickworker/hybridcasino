import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner@2.0.3";
import { createAdminNotification } from '../../lib/notificationHelper';
import { filterVisibleProviders } from '../../lib/benzGameVisibility';

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

interface Game {
  id: string;
  name: string;
  name_ko?: string;
  game_code: string;
  provider_id: number;
  api_type?: string;
  vendor_code?: string;
}

export function BenzMain({ user, onRouteChange }: BenzMainProps) {
  console.log('🚀🚀🚀 [BenzMain] 컴포넌트 렌더링됨! user:', user?.login_id);
  
  const [casinoProviders, setCasinoProviders] = useState<GameProvider[]>([]);
  const [slotProviders, setSlotProviders] = useState<GameProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoginMessage, setShowLoginMessage] = useState(false);
  const [isHoveringBanner, setIsHoveringBanner] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // 🆕 백그라운드 프로세스 상태
  const [launchingGameId, setLaunchingGameId] = useState<string | null>(null);
  const closeProcessingRef = useRef<Map<number, boolean>>(new Map()); // 🆕 세션별 종료 처리 중 상태

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

  // 🆕 카지노 게임사 이름으로 logo_url 찾기
  const getCasinoLogoUrlByProviderName = (provider: GameProvider): string | undefined => {
    const name = (provider.name_ko || provider.name || '').toLowerCase();
    
    if (name.includes('evolution') || name.includes('에볼루션')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/evolution.jpg';
    }
    if ((name.includes('pragmatic') || name.includes('프라그마틱')) && (name.includes('live') || name.includes('라이브'))) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pragmaticlive.jpg';
    }
    if (name.includes('microgaming') || name.includes('마이크로')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/microgaming.jpg';
    }
    if (name.includes('asia') || name.includes('아시아')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/asiagaming.jpg';
    }
    if (name.includes('sa gaming') || name.includes('sa게이밍') || name === 'sa') {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/sagaming.jpg';
    }
    if (name.includes('ezugi') || name.includes('이주기')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/ezugi.jpg';
    }
    if (name.includes('dream') || name.includes('드림')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/dreamgaming.jpg';
    }
    if (name.includes('playace') || name.includes('플레이') || name.includes('에이스')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/playace.jpg';
    }
    
    return provider.logo_url;
  };

  // 🆕 슬롯 게임사 이름으로 logo_url 찾기
  const getSlotLogoUrlByProviderName = (provider: GameProvider): string | undefined => {
    const name = (provider.name_ko || provider.name || '').toLowerCase();
    
    if ((name.includes('pragmatic') || name.includes('프라그마틱')) && (name.includes('slot') || name.includes('슬롯') || name.includes('play'))) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pragmaticslot.jpg';
    }
    if (name.includes('pg') || name.includes('pocket')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pgsoft.jpg';
    }
    if (name.includes('habanero') || name.includes('하바네로')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/habanero.jpg';
    }
    if (name.includes('booongo') || name.includes('bng') || name.includes('부운고')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/bng.jpg';
    }
    if (name.includes('cq9')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/cq9.jpg';
    }
    if (name.includes('evoplay') || name.includes('에보플레이')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/evoplay.jpg';
    }
    if (name.includes('nolimit') || name.includes('노리밋')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/nolimit.jpg';
    }
    if (name.includes('jing') || name.includes('진지') || name.includes('바오')) {
      return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/jinjibaoxi.jpg';
    }
    
    return provider.logo_url;
  };

  // 🆕 랜덤 카지노 이미지 선택
  const getRandomCasinoImage = () => {
    const randomIndex = Math.floor(Math.random() * FALLBACK_CASINO_PROVIDERS.length);
    return FALLBACK_CASINO_PROVIDERS[randomIndex].logo_url;
  };

  // 🆕 랜덤 슬롯 이미지 선택
  const getRandomSlotImage = () => {
    const randomIndex = Math.floor(Math.random() * FALLBACK_SLOT_PROVIDERS.length);
    return FALLBACK_SLOT_PROVIDERS[randomIndex].logo_url;
  };

  useEffect(() => {
    console.log('🏠 [BenzMain] useEffect 시작 - Realtime 구독 설정 중...');
    loadData();

    if (!user) {
      console.log('ℹ️ [BenzMain] 비로그인 상태 - Realtime 구독 스킵');
      return;
    }

    // ✅ Realtime: games, game_providers, honor_games, honor_games_provider, partner_game_access 테이블 변경 감지
    const channelBuilder = supabase
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
      );

    // partner_game_access는 user.referrer_id가 있을 때만 구독
    if (user.referrer_id) {
      channelBuilder.on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'partner_game_access',
          filter: `partner_id=eq.${user.referrer_id}` // ✅ 현재 사용자 파트너만 필터링
        },
        (payload) => {
          console.log('🔄🔄🔄 [BenzMain] partner_game_access 테이블 변경 감지!!!', payload);
          // ⚡ 게임 스위칭 설정이 변경되면 즉시 게임사 목록 새로고침
          console.log('🎮 [BenzMain] 게임 스위칭 설정 변경 감지! 즉시 새로고침...');
          loadData();
        }
      );
    }

    const gamesChannel = channelBuilder.subscribe((status, err) => {
      console.log('📡📡📡 [BenzMain] Realtime 구독 상태:', status);
      if (err) {
        console.error('❌❌❌ [BenzMain] Realtime 구독 에러:', err);
      }
      if (status === 'SUBSCRIBED') {
        console.log('✅✅✅ [BenzMain] Realtime 구독 성공! partner_game_access 테이블 감지 중... (partner_id:', user.referrer_id, ')');
      }
    });

    return () => {
      supabase.removeChannel(gamesChannel);
    };
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // ⭐⭐⭐ 새로운 노출 로직 사용
      const { filterVisibleProviders } = await import('../../lib/benzGameVisibility');
      
      const allCasinoProviders = await gameApi.getProviders({ type: 'casino' });
      const casinoData = await filterVisibleProviders(allCasinoProviders, user?.id);
      
      const allSlotProviders = await gameApi.getProviders({ type: 'slot' });
      const slotData = await filterVisibleProviders(allSlotProviders, user?.id);
      
      // 🔥 카지노/슬롯 게임사 제외 필터링 (DB에 type이 잘못 저장된 경우 대비)
      const SLOT_PROVIDERS = [
        'pragmatic', 'pg', 'pocket', 'habanero', 'booongo', 'bng',
        'cq9', 'evoplay', 'nolimit', 'jingzibao', '진지바오',
        '프라그마틱 슬롯', 'pragmatic slot', 'pg soft', 'pg소프트',
        '하바네로', '부운고', '에보플레이', '노리밋'
      ];
      
      const CASINO_PROVIDERS = [
        'evolution', 'ezugi', 'microgaming', 'asia', 'sa',
        'dream', 'playace', 'pragmatic live', 'sexy',
        '에볼루션', '이주기', '마이크로', '아시아', '드림', 
        '플레이', '프라그마틱 라이브', '섹시'
      ];
      
      // 카지노 페이지용: 슬롯 게임사 제외
      const casinoOnlyProviders = casinoData.filter(p => {
        const name = (p.name_ko || p.name || '').toLowerCase();
        
        // Pragmatic의 경우 Live만 카지노
        if (name.includes('pragmatic') || name.includes('프라그마틱')) {
          return name.includes('live') || name.includes('라이브');
        }
        
        // 슬롯 게임사는 제외
        return !SLOT_PROVIDERS.some(slot => name.includes(slot.toLowerCase()));
      });
      
      // 슬롯 페이지용: 카지노 게임사 제외
      const slotOnlyProviders = slotData.filter(p => {
        const name = (p.name_ko || p.name || '').toLowerCase();
        
        // Pragmatic의 경우 Slot만 슬롯
        if (name.includes('pragmatic') || name.includes('프라그마틱')) {
          // Live가 아니면 슬롯으로 간주
          return !(name.includes('live') || name.includes('라이브'));
        }
        
        // 카지노 게임사는 제외
        return !CASINO_PROVIDERS.some(casino => name.includes(casino.toLowerCase()));
      });
      
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
      
      for (const provider of casinoOnlyProviders) {
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
      
      for (const provider of slotOnlyProviders) {
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
            if (name.includes('sa') && name.includes('gaming')) return 'sa gaming';
            
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

  // ✨ 게임 실행 핸들러 - 메인 페이지에서 바로 게임 실행
  const handleProviderClick = async (provider: GameProvider, type: 'casino' | 'slot') => {
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
    
    // 🆕 백그라운드 프로세스 중 클릭 방지
    if (isProcessing) {
      toast.error('잠시 후 다시 시도해주세요.');
      return;
    }

    const providerName = (provider.name || '').toLowerCase();
    const providerNameKo = (provider.name_ko || '').toLowerCase();
    
    // ===== 카지노 게임사 =====
    if (type === 'casino') {
      // ⭐ Evolution
      if (providerName.includes('evolution') || providerNameKo.includes('에볼루션')) {
        console.log('🎰 [BenzMain] Evolution 바로 실행 - 특정 게임 ID: 5254616');
        setIsProcessing(true);
        
        try {
          // 🎯 특정 Evolution Top Games 게임 바로 실행 (id: 5254616)
          const { data: evolutionGame, error: evolutionError } = await supabase
            .from('honor_games')
            .select('id, name, name_ko, game_code, vendor_code, api_type')
            .eq('id', '5254616')
            .maybeSingle();

          if (evolutionError || !evolutionGame) {
            console.error('❌ [Evolution] 특정 게임(ID: 5254616)을 찾을 수 없습니다:', evolutionError);
            toast.error('Evolution 게임을 찾을 수 없습니다.');
            setIsProcessing(false);
            return;
          }

          const game: Game = {
            id: evolutionGame.id,
            name: evolutionGame.name,
            name_ko: evolutionGame.name_ko || evolutionGame.name,
            game_code: evolutionGame.game_code,
            provider_id: 0,
            api_type: evolutionGame.api_type || 'honor',
            vendor_code: evolutionGame.vendor_code
          };
          
          await handleGameClick(game);
        } catch (error) {
          console.error('Evolution 게임 실행 오류:', error);
          toast.error('Evolution 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ Pragmatic Live - OroPlay는 lobby 게임, HonorAPI는 5246855
      if (providerName.includes('pragmatic') || providerNameKo.includes('프라그마틱')) {
        console.log('🎰 [BenzMain] Pragmatic Live 실행');
        setIsProcessing(true);
        
        try {
          // 1️⃣ OroPlay: casino-pragmatic lobby 게임 조회 (优先)
          console.log('🎰 [Pragmatic Live] OroPlay - casino-pragmatic lobby 조회');
          const { data: oroplayGame, error: oroplayError } = await supabase
            .from('games')
            .select('id, name, name_ko, game_code, vendor_code, api_type, provider_id')
            .eq('vendor_code', 'casino-pragmatic')
            .eq('name', 'lobby')
            .limit(1)
            .maybeSingle();

          if (oroplayGame && !oroplayError) {
            console.log('✅ [Pragmatic Live] OroPlay lobby 게임 발견:', oroplayGame.name);
            const game: Game = {
              id: oroplayGame.id,
              name: oroplayGame.name,
              name_ko: oroplayGame.name_ko || oroplayGame.name,
              game_code: oroplayGame.game_code,
              provider_id: oroplayGame.provider_id,
              api_type: oroplayGame.api_type || 'oroplay',
              vendor_code: oroplayGame.vendor_code
            };
            
            await handleGameClick(game);
            return;
          } else {
            console.log('⚠️ [Pragmatic Live] OroPlay lobby 게임 없음, HonorAPI로 fallback');
          }

          // 2️⃣ HonorAPI: 하드코딩 ID 5246855 (fallback)
          console.log('🎰 [Pragmatic Live] HonorAPI - 하드코딩 ID 5246855');
          const { data: honorGame, error: honorError } = await supabase
            .from('honor_games')
            .select('id, name, name_ko, game_code, vendor_code, api_type')
            .eq('id', '5246855')
            .maybeSingle();

          if (honorError || !honorGame) {
            console.error('❌ [Pragmatic Live] HonorAPI 게임(ID: 5246855)을 찾을 수 없습니다:', honorError);
            toast.error('Pragmatic Live 게임을 찾을 수 없습니다.');
            setIsProcessing(false);
            return;
          }

          console.log('✅ [Pragmatic Live] HonorAPI 게임 발견:', honorGame.name);
          const game: Game = {
            id: honorGame.id,
            name: honorGame.name,
            name_ko: honorGame.name_ko || honorGame.name,
            game_code: honorGame.game_code,
            provider_id: 0,
            api_type: honorGame.api_type || 'honor',
            vendor_code: honorGame.vendor_code
          };
          
          await handleGameClick(game);
        } catch (error) {
          console.error('Pragmatic Live 실행 오류:', error);
          toast.error('Pragmatic Live 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ SA Gaming
      if (providerName.includes('sa') || providerNameKo.includes('sa') || providerNameKo.includes('게이밍')) {
        console.log('🎰 [BenzMain] SA Gaming 바로 실행');
        setIsProcessing(true);
        
        try {
          const { data: games, error } = await supabase
            .from('games')
            .select('id, name, name_ko, game_code, vendor_code, api_type, provider_id')
            .eq('vendor_code', 'casino-sa')
            .eq('name', 'lobby')
            .limit(1)
            .maybeSingle();

          if (error || !games) {
            console.error('❌ [SA Gaming] DB에서 게임을 찾을 수 없습니다:', error);
            toast.error('SA Gaming 게임을 찾을 수 없습니다.');
            setIsProcessing(false);
            return;
          }

          await handleGameClick(games);
        } catch (error) {
          console.error('SA Gaming 실행 오류:', error);
          toast.error('SA Gaming 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ Microgaming
      const isMicrogaming = providerName.includes('micro') || 
                            providerNameKo.includes('마이크로');
      
      if (isMicrogaming) {
        console.log('🎰 [BenzMain] Microgaming 바로 실행');
        setIsProcessing(true);
        
        try {
          const { data: games, error } = await supabase
            .from('games')
            .select('id, name, name_ko, game_code, vendor_code, api_type, provider_id')
            .eq('vendor_code', 'casino-micro')
            .eq('name', 'lobby')
            .limit(1)
            .maybeSingle();

          if (error || !games) {
            console.error('❌ [Microgaming] DB에서 게임을 찾을 수 없습니다:', error);
            toast.error('Microgaming 게임을 찾을 수 없습니다.');
            setIsProcessing(false);
            return;
          }

          await handleGameClick(games);
        } catch (error) {
          console.error('Microgaming 실행 오류:', error);
          toast.error('Microgaming 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ Play Ace
      if (providerName.includes('playace') || providerName.includes('play') || providerNameKo.includes('플레이') || providerNameKo.includes('에이스')) {
        console.log('🎰 [BenzMain] Play Ace 바로 실행');
        setIsProcessing(true);
        
        try {
          const { data: games, error } = await supabase
            .from('games')
            .select('id, name, name_ko, game_code, vendor_code, api_type, provider_id')
            .eq('vendor_code', 'casino-playace')
            .eq('name', 'lobby')
            .limit(1)
            .maybeSingle();

          if (error || !games) {
            console.error('❌ [Play Ace] DB에서 게임을 찾을 수 없습니다:', error);
            toast.error('Play Ace 게임을 찾을 수 없습니다.');
            setIsProcessing(false);
            return;
          }

          await handleGameClick(games);
        } catch (error) {
          console.error('Play Ace 실행 오류:', error);
          toast.error('Play Ace 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ Dream Gaming
      if (providerName.includes('dream') || providerNameKo.includes('드림')) {
        console.log('🎰 [BenzMain] Dream Gaming 바로 실행');
        setIsProcessing(true);
        
        try {
          const { data: games, error } = await supabase
            .from('games')
            .select('id, name, name_ko, game_code, vendor_code, api_type, provider_id')
            .eq('vendor_code', 'casino-dream')
            .eq('name', 'lobby')
            .limit(1)
            .maybeSingle();

          if (error || !games) {
            console.error('❌ [Dream Gaming] DB에서 게임을 찾을 수 없습니다:', error);
            toast.error('Dream Gaming 게임을 찾을 수 없습니다.');
            setIsProcessing(false);
            return;
          }

          await handleGameClick(games);
        } catch (error) {
          console.error('Dream Gaming 실행 오류:', error);
          toast.error('Dream Gaming 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ Asia Gaming
      if (providerName.includes('asia') || providerNameKo.includes('아시아')) {
        console.log('🎰 [BenzMain] Asia Gaming 바로 실행');
        setIsProcessing(true);
        
        try {
          const { data: games, error } = await supabase
            .from('games')
            .select('id, name, name_ko, game_code, vendor_code, api_type, provider_id')
            .eq('vendor_code', 'casino-ag')
            .eq('name', 'lobby')
            .limit(1)
            .maybeSingle();

          if (error || !games) {
            console.error('❌ [Asia Gaming] DB에서 게임을 찾을 수 없습니다:', error);
            toast.error('Asia Gaming 게임을 찾을 수 없습니다.');
            setIsProcessing(false);
            return;
          }

          await handleGameClick(games);
        } catch (error) {
          console.error('Asia Gaming 실행 오류:', error);
          toast.error('Asia Gaming 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ Ezugi (이주기)
      if (providerName.includes('ezugi') || providerName.includes('ezu') || providerNameKo.includes('이주기') || providerNameKo.includes('주기')) {
        console.log('🎰 [BenzMain] Ezugi 바로 실행 - 특정 게임 ID: 5254603');
        setIsProcessing(true);
        
        try {
          // 🎯 특정 Ezugi 게임 바로 실행 (id: 5254603)
          const { data: ezugiGame, error: ezugiError } = await supabase
            .from('honor_games')
            .select('id, name, name_ko, game_code, vendor_code, api_type')
            .eq('id', '5254603')
            .maybeSingle();

          if (ezugiError || !ezugiGame) {
            console.error('❌ [Ezugi] 특정 게임(ID: 5254603)을 찾을 수 없습니다:', ezugiError);
            toast.error('Ezugi 게임을 찾을 수 없습니다.');
            setIsProcessing(false);
            return;
          }

          const game: Game = {
            id: ezugiGame.id,
            name: ezugiGame.name,
            name_ko: ezugiGame.name_ko || ezugiGame.name,
            game_code: ezugiGame.game_code,
            provider_id: 0,
            api_type: ezugiGame.api_type || 'honor',
            vendor_code: ezugiGame.vendor_code
          };
          
          await handleGameClick(game);
        } catch (error) {
          console.error('Ezugi 게임 실행 오류:', error);
          toast.error('Ezugi 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ Skywind (스카이윈드)
      if (providerName.includes('skywind') || providerName.includes('sky') || providerNameKo.includes('스카이윈드') || providerNameKo.includes('스카이')) {
        console.log('🎰 [BenzMain] Skywind 바로 실행');
        setIsProcessing(true);
        
        try {
          const { data: skywindGames, error: skywindError } = await supabase
            .from('honor_games')
            .select('id, name, name_ko, game_code, vendor_code, api_type')
            .ilike('vendor_code', '%skywind%')
            .eq('type', 'casino')
            .eq('is_visible', true)
            .limit(10);

          if (skywindError || !skywindGames || skywindGames.length === 0) {
            console.error('❌ [Skywind] DB에서 게임을 찾을 수 없습니다:', skywindError);
            toast.error('Skywind 게임을 찾을 수 없습니다.');
            setIsProcessing(false);
            return;
          }

          let skywindGame = skywindGames.find(g => 
            g.name?.toLowerCase().includes('lobby') || 
            g.name_ko?.toLowerCase().includes('로비')
          );

          if (!skywindGame) {
            skywindGame = skywindGames[0];
          }

          const game: Game = {
            id: skywindGame.id,
            name: skywindGame.name,
            name_ko: skywindGame.name_ko || skywindGame.name,
            game_code: skywindGame.game_code,
            provider_id: 0,
            api_type: skywindGame.api_type || 'honor',
            vendor_code: skywindGame.vendor_code
          };
          
          await handleGameClick(game);
        } catch (error) {
          console.error('Skywind 실행 오류:', error);
          toast.error('Skywind 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ 다른 카지노 게임사들 - 준비 중 메시지만 표시
      console.log(`⚠️ [BenzMain] ${provider.name_ko || provider.name} 준비 중`);
      toast.error('해당 게임사는 준비 중입니다.');
      return;
    }
    
    // ===== 슬롯 게임사 =====
    if (type === 'slot') {
      // ⭐ Skywind
      if (providerName.includes('skywind') || providerNameKo.includes('스카이윈드')) {
        console.log('🎰 [BenzMain] Skywind 바로 실행');
        setIsProcessing(true);
        
        try {
          const skywindGame: Game = {
            id: '0',
            name: 'lobby',
            name_ko: 'lobby',
            game_code: 'lobby',
            provider_id: 0,
            api_type: 'honorapi',
            vendor_code: 'slot-skywind'
          };
          
          await handleGameClick(skywindGame);
        } catch (error) {
          console.error('Skywind 게임 실행 오류:', error);
          toast.error('Skywind 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ 다른 슬롯 게임사들 - 페이지로 이동
      localStorage.setItem('benz_selected_provider', JSON.stringify(provider));
      onRouteChange('/benz/slot');
      return;
    }
  };

  const handleGameClick = async (game: Game) => {
    setLaunchingGameId(game.id);
    setIsProcessing(true);
    
    try {
      const activeSession = await gameApi.checkActiveSession(user.id);
      
      // ⭐ 0. 세션 종료 중(ending)인지 체크 - 게임 실행 차단
      if (activeSession?.isActive && activeSession.status === 'ending') {
        console.log('⏳ [게임 실행 차단] 이전 세션 종료 중...');
        toast.warning('이전 게임 종료 중입니다. 잠시 후 다시 시도해주세요.', { duration: 3000 });
        setLaunchingGameId(null);
        setIsProcessing(false);
        return;
      }
      
      // 다른 API 게임이 실행 중인지 체크
      if (activeSession?.isActive && activeSession.status === 'active' && activeSession.api_type !== game.api_type) {
        toast.error('잠시 후 다시 시도해주세요.');
        setLaunchingGameId(null);
        setIsProcessing(false);
        return;
      }

      // 같은 API 내에서 다른 게임으로 전환 시 기존 게임 출금
      if (activeSession?.isActive && 
          activeSession.api_type === game.api_type && 
          activeSession.game_id !== parseInt(game.id)) {
        
        const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
        await syncBalanceOnSessionEnd(user.id, activeSession.api_type);
      }

      // 같은 게임의 active 세션이 있는지 체크 (중복 실행 방지)
      if (activeSession?.isActive && 
          activeSession.game_id === parseInt(game.id) && 
          activeSession.status === 'active' && 
          activeSession.launch_url) {
        
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
            .eq('id', activeSession.session_id!);
        } else {
          toast.success(`${game.name} 게임에 입장했습니다.`);
          
          await supabase
            .from('game_launch_sessions')
            .update({ 
              ready_status: 'popup_opened',
              last_activity_at: new Date().toISOString()
            })
            .eq('id', activeSession.session_id!);
          
          if (!(window as any).gameWindows) {
            (window as any).gameWindows = new Map();
          }
          (window as any).gameWindows.set(activeSession.session_id!, gameWindow);
          
          if (!(window as any).gameWindowCheckers) {
            (window as any).gameWindowCheckers = new Map();
          }
          
          const handleGameWindowClose = async () => {
            if (closeProcessingRef.current.get(activeSession.session_id!)) {
              return;
            }
            
            closeProcessingRef.current.set(activeSession.session_id!, true);
            
            try {
              const checker = (window as any).gameWindowCheckers?.get(activeSession.session_id!);
              if (checker) {
                clearInterval(checker);
                (window as any).gameWindowCheckers?.delete(activeSession.session_id!);
              }
              
              (window as any).gameWindows?.delete(activeSession.session_id!);
              await (window as any).syncBalanceAfterGame?.(activeSession.session_id!);
              
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('refresh-betting-history'));
              }, 5000);
            } catch (error) {
              console.error('❌ [게임 종료] 에러:', error);
            } finally {
              closeProcessingRef.current.delete(activeSession.session_id!);
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
          
          (window as any).gameWindowCheckers.set(activeSession.session_id!, checkGameWindow);
        }
        
        setLaunchingGameId(null);
        setIsProcessing(false);
        return;
      }
      
      // 새로운 게임 실행 (API 입금 포함)
      const result = await gameApi.generateGameLaunchUrl(user.id, parseInt(game.id));
      
      if (result.success && result.launchUrl) {
        const sessionId = result.sessionId;
        
        const gameWindow = window.open(
          result.launchUrl,
          '_blank',
          'width=1920,height=1080,scrollbars=yes,resizable=yes,fullscreen=yes'
        );

        if (!gameWindow) {
          toast.error('팝업이 차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
          
          if (sessionId && typeof sessionId === 'number') {
            await supabase
              .from('game_launch_sessions')
              .update({ 
                ready_status: 'popup_blocked',
                last_activity_at: new Date().toISOString()
              })
              .eq('id', sessionId);
          }
          
          setLaunchingGameId(null);
          setIsProcessing(false);
          return;
        } else {
          toast.success(`${game.name} 게임에 입장했습니다.`);
          
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
            
            const handleGameWindowClose = async () => {
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
                await (window as any).syncBalanceAfterGame?.(sessionId);
                
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('refresh-betting-history'));
                }, 5000);
              } catch (error) {
                console.error('❌ [게임 종료] 에러:', error);
              } finally {
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
        const errorMessage = result.error || '게임을 실행할 수 없습니다.';
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('게임 실행 오류:', error);
      const errorMessage = error instanceof Error ? error.message : '게임을 실행할 수 없습니다.';
      if (errorMessage.includes('보유금')) {
        toast.error(errorMessage);
      } else {
        toast.error('게임을 실행할 수 없습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setLaunchingGameId(null);
      setIsProcessing(false);
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
                  {/* ✅ logo_url이 있으면 이미지 표시, 없으면 fallback 이미지 표시 */}
                  <img
                    src={provider.logo_url || getCasinoLogoUrlByProviderName(provider) || getRandomCasinoImage()}
                    alt={provider.name_ko || provider.name}
                    className="w-full object-contain"
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
                  {/* ✅ logo_url이 있으면 이미지 표시, 없으면 fallback 이미지 표시 */}
                  <img
                    src={provider.logo_url || getSlotLogoUrlByProviderName(provider) || getRandomSlotImage()}
                    alt={provider.name_ko || provider.name}
                    className="w-[120%] object-contain"
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
