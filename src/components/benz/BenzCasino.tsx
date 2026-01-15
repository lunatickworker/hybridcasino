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

interface BenzCasinoProps {
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
  image_url?: string;
  provider_id: number;
  api_type?: string;
  status?: string;
  vendor_code?: string;
}

const FALLBACK_PROVIDERS = [
  { id: 1, name: 'Evolution', name_ko: '에볼루션', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/evolution.jpg', status: 'visible' },
  { id: 2, name: 'Pragmatic Play Live', name_ko: '프라그마틱 라이브', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pragmaticlive.jpg', status: 'visible' },
  { id: 3, name: 'Microgaming', name_ko: '마이크로 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/microgaming.jpg', status: 'visible' },
  { id: 4, name: 'Asia Gaming', name_ko: '아시아 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/asiagaming.jpg', status: 'visible' },
  { id: 5, name: 'SA Gaming', name_ko: 'SA 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/sagaming.jpg', status: 'visible' },
  { id: 6, name: 'Ezugi', name_ko: '이주기', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/ezugi.jpg', status: 'visible' },
  { id: 7, name: 'Dream Gaming', name_ko: '드림 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/dreamgaming.jpg', status: 'visible' },
  { id: 8, name: 'Play Ace', name_ko: '플레이 에이스', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/playace.jpg', status: 'visible' },
];

// 게임사 이름으로 logo_url 찾기
const getLogoUrlByProviderName = (provider: GameProvider): string | undefined => {
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

// 랜덤 이미지 선택 함수
const getRandomCasinoImage = () => {
  const randomIndex = Math.floor(Math.random() * FALLBACK_PROVIDERS.length);
  return FALLBACK_PROVIDERS[randomIndex].logo_url;
};

export function BenzCasino({ user, onRouteChange }: BenzCasinoProps) {
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

    console.log('🔔 [BenzCasino] Realtime 구독 시작 - partner_id:', user.referrer_id);
    
    const channel = supabase
      .channel('benz_casino_game_access')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모두 감지
          schema: 'public',
          table: 'partner_game_access',
          filter: `partner_id=eq.${user.referrer_id}` // ✅ 현재 사용자 파트너만 필터링
        },
        (payload) => {
          console.log('🎮 [BenzCasino] 게임 노출 설정 변경 감지:', payload.eventType, payload);
          
          // 제공사 목록 새로고침
          loadProviders();
          
          // 🆕 현재 열려있는 게임 목록도 새로고침
          if (selectedProviderRef.current) {
            console.log('🔄 [BenzCasino] 게임 목록 새로고침:', selectedProviderRef.current.name_ko);
            loadGames(selectedProviderRef.current);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔕 [BenzCasino] Realtime 구독 해제');
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.referrer_id]);
  
  // 🆕 providers 로드 완료 후 localStorage에서 선택한 provider 자동 로드
  useEffect(() => {
    if (providers.length > 0) {
      const savedProvider = localStorage.getItem('benz_selected_casino_provider');
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
            console.log('🎯 [BenzCasino] localStorage에서 선택한 provider 자동 로드:', matchingProvider);
            handleProviderClick(matchingProvider);
          }
          
          // localStorage 클리어
          localStorage.removeItem('benz_selected_casino_provider');
        } catch (e) {
          console.error('localStorage provider 파싱 오류:', e);
          localStorage.removeItem('benz_selected_casino_provider');
        }
      }
    }
  }, [providers]);

  // ⭐ HEARTBEAT: 30초마다 last_activity_at 업데이트 (게임 진행 중 자동 종료 방지)
  useEffect(() => {
    const heartbeatInterval = setInterval(async () => {
      try {
        // 현재 active 세션 확인
        const activeSession = await gameApi.checkActiveSession(user.id);
        
        if (activeSession?.isActive && activeSession.session_id) {
          // ✅ 게임 진행 중이면 last_activity_at 업데이트
          const { error } = await supabase
            .from('game_launch_sessions')
            .update({
              last_activity_at: new Date().toISOString()
            })
            .eq('id', activeSession.session_id);
          
          if (!error) {
            console.log(`💓 [Heartbeat] 게임 진행 감지 - last_activity_at 업데이트 (세션: ${activeSession.session_id})`);
          } else {
            console.error('❌ [Heartbeat] 업데이트 실패:', error);
          }
        }
      } catch (error) {
        console.error('❌ [Heartbeat] 오류:', error);
      }
    }, 30 * 1000); // 30초마다 실행
    
    return () => clearInterval(heartbeatInterval);
  }, [user.id]);

  const loadProviders = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // ⭐⭐⭐ 새로운 노출 로직 사용
      const allProviders = await gameApi.getProviders({ type: 'casino' });
      let providersData = await filterVisibleProviders(allProviders, user.id);
      
      // 🚫 슬롯 전용 게임사 제외 (카지노에 표시되면 안됨)
      const SLOT_ONLY_PROVIDERS = [
        'pragmatic play', 'pg soft', 'habanero', 'booongo', 
        'cq9', 'evoplay', 'nolimit', 'jingzibao',
        '프라그마틱 플레이', 'pg 소프트', '하바네로', '부운고',
        '에보플레이', '노리밋시티', '노리밋', '진지바오'
      ];
      
      providersData = providersData.filter(p => {
        const name = (p.name_ko || p.name || '').toLowerCase();
        
        // Pragmatic Live는 카지노이므로 허용
        if ((name.includes('pragmatic') || name.includes('프라그마틱')) && 
            (name.includes('live') || name.includes('라이브'))) {
          return true;
        }
        
        // 슬롯 전용 게임사는 제외
        return !SLOT_ONLY_PROVIDERS.some(slot => name.includes(slot.toLowerCase()));
      });
      
      console.log('🎰 [BenzCasino] API 응답 게임사:', providersData.length, '개');
      console.log('🎰 [BenzCasino] 게임사 상세:', providersData.map(p => ({
        id: p.id,
        name: p.name,
        name_ko: p.name_ko,
        status: p.status,
        api_type: p.api_type
      })));
      
      // 🆕 같은 이름의 게임사를 하나로 통합
      const providerMap = new Map<string, GameProvider>();
      
      const normalizeProviderName = (provider: GameProvider): string => {
        const name = (provider.name_ko || provider.name || '').toLowerCase();
        
        // ⭐ Pragmatic Play Live는 통합하지 않음 (카지노)
        // 다른 게임사들은 id를 키로 사용 (통합하지 않음)
        return `${provider.id}_${provider.name_ko || provider.name}`;
      };
      
      for (const provider of providersData) {
        const key = normalizeProviderName(provider);
        
        if (providerMap.has(key)) {
          // 이미 있으면 provider_ids에 추가
          const existing = providerMap.get(key)!;
          if (!existing.provider_ids) {
            existing.provider_ids = [existing.id];
          }
          existing.provider_ids.push(provider.id);
        } else {
          // 없으면 새로 추가 - 원본 logo_url 우선, 없으면 fallback 사용
          const logo = provider.logo_url || getLogoUrlByProviderName(provider);
          providerMap.set(key, {
            ...provider,
            logo_url: logo,
            provider_ids: [provider.id]
          });
        }
      }
      
      const mergedProviders = Array.from(providerMap.values());
      
      console.log('🎰 [BenzCasino] 통합 후 게임사:', mergedProviders.length, '개');
      console.log('🎰 [BenzCasino] 통합 상세:', mergedProviders.map(p => ({
        name: p.name,
        name_ko: p.name_ko,
        logo_url: p.logo_url,
        provider_ids: p.provider_ids
      })));
      
      // 🆕 원하는 순서대로 정렬
      const casinoOrder = [
        'evolution', 'pragmatic_live', 'microgaming', 'asiagaming', 
        'sa gaming', 'ezugi', 'dream gaming', 'playace'
      ];
      
      const sortProviders = (providers: GameProvider[], order: string[]) => {
        return providers.sort((a, b) => {
          const normalizeForSort = (provider: GameProvider): string => {
            const name = (provider.name_ko || provider.name || '').toLowerCase();
            
            // Evolution
            if (name.includes('evolution') || name.includes('에볼루션')) return 'evolution';
            
            // Pragmatic Play Live
            if (name.includes('pragmatic') || name.includes('프라그마틱')) {
              if (name.includes('live') || name.includes('라이브')) return 'pragmatic_live';
            }
            
            // Microgaming
            if (name.includes('microgaming') || name.includes('마이크로')) return 'microgaming';
            
            // Asia Gaming
            if (name.includes('asia') || name.includes('아시아')) return 'asiagaming';
            
            // SA Gaming
            if (name.includes('sa gaming') || name.includes('sa게이밍') || name === 'sa') return 'sa gaming';
            
            // Ezugi
            if (name.includes('ezugi') || name.includes('이주기')) return 'ezugi';
            
            // Dream Gaming
            if (name.includes('dream') || name.includes('드림')) return 'dream gaming';
            
            // PlayAce
            if (name.includes('playace') || name.includes('플레이') || name.includes('에이스')) return 'playace';
            
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
      
      const sortedProviders = sortProviders(mergedProviders, casinoOrder);
      
      console.log('🎰 [BenzCasino] 정렬된 카지노 게임사:', sortedProviders.map(p => p.name_ko || p.name));
      
      setProviders(sortedProviders);
    } catch (error) {
      console.error('❌ 제공사 로드 오류:', error);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  // ⭐ 게임사 클릭 시: api_type에 따라 동적으로 처리
  const handleProviderClick = async (provider: GameProvider) => {
    // 백그라운드 프로세스 중 클릭 방지
    if (isProcessing) {
      toast.error('잠시 후 다시 시도해주세요.');
      return;
    }

    console.log('🎯 [Provider Click]', {
      name: provider.name,
      name_ko: provider.name_ko,
      vendor_code: provider.vendor_code,
      api_type: provider.api_type,
      provider_ids: provider.provider_ids
    });

    setIsProcessing(true);
    
    try {
      let lobbyGame: any = null;
      const providerName = (provider.name || '').toLowerCase();
      const providerNameKo = (provider.name_ko || '').toLowerCase();
      
      // ⭐ Evolution (에볼루션) - honor_games 테이블에서 동적 조회
      if (providerName.includes('evolution') || providerNameKo.includes('에볼루션')) {
        console.log('🎰 [BenzCasino] Evolution 바로 실행 - 특정 게임 ID: 5254616');
        
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
        console.log('🎰 [BenzCasino] Pragmatic Live 실행');
        
        try {
          // 🆕 api_type에 따라 다른 로직 실행
          if (provider.api_type === 'oroplay') {
            // OroPlay: casino-pragmatic lobby 게임 조회
            console.log('🎰 [Pragmatic Live] OroPlay - casino-pragmatic lobby 조회');
            const { data: oroplayGame, error: oroplayError } = await supabase
              .from('games')
              .select('id, name, name_ko, game_code, vendor_code, api_type, provider_id')
              .eq('vendor_code', 'casino-pragmatic')
              .eq('game_code', 'lobby')
              .maybeSingle();

            if (oroplayError || !oroplayGame) {
              console.error('❌ [Pragmatic Live] OroPlay lobby 게임을 찾을 수 없습니다:', oroplayError);
              toast.error('Pragmatic Live 게임을 찾을 수 없습니다.');
              setIsProcessing(false);
              return;
            }

            console.log('✅ [Pragmatic Live] OroPlay lobby 게임 발견:', oroplayGame.name);
            const game: Game = {
              id: oroplayGame.id,
              name: oroplayGame.name,
              name_ko: oroplayGame.name_ko || oroplayGame.name,
              game_code: oroplayGame.game_code,
              provider_id: oroplayGame.provider_id,
              api_type: oroplayGame.api_type,
              vendor_code: oroplayGame.vendor_code
            };
            await handleGameClick(game);
          } else {
            // HonorAPI: 하드코딩 ID 5246855
            console.log('🎰 [Pragmatic Live] HonorAPI - 하드코딩 ID 5246855');
            const { data: honorGame, error: honorError } = await supabase
              .from('honor_games')
              .select('id, name, name_ko, game_code, vendor_code, api_type')
              .eq('id', 5246855)
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
              api_type: honorGame.api_type || 'honorapi',
              vendor_code: honorGame.vendor_code
            };
            await handleGameClick(game);
          }
        } catch (error) {
          console.error('Pragmatic Live 실행 오류:', error);
          toast.error('Pragmatic Live 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ Ezugi (이주기) - honor_games 테이블에서 동적 조회
      if (providerName.includes('ezugi') || providerName.includes('ezu') || providerNameKo.includes('이주기') || providerNameKo.includes('주기')) {
        console.log('🎰 [BenzCasino] Ezugi 바로 실행 - 특정 게임 ID: 5254603');
        
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
          console.error('Ezugi 실행 오류:', error);
          toast.error('Ezugi 게임 실행에 실패했습니다.');
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      
      // ⭐ Skywind - honor_games 테이블에서 vendor_code로 조회
      if (providerName.includes('skywind') || providerName.includes('sky') || providerNameKo.includes('스카이윈드') || providerNameKo.includes('스카이')) {
        console.log('🎰 [BenzCasino] Skywind 바로 실행');
        
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
            api_type: skywindGame.api_type || 'honorapi',
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

      // ⭐ 기타 게임사들
      const providerIds = provider.provider_ids || [provider.id];
      console.log(`🎰 [${provider.name}] 조회할 provider_ids:`, providerIds);

      // api_type에 따라 테이블 선택
      if (provider.api_type === 'honorapi') {
        console.log(`🎰 [${provider.name}] honor_games 테이블에서 조회`);
        
        const { data: games, error } = await supabase
          .from('honor_games')
          .select('id, name, name_ko, game_code, vendor_code, api_type, provider_id')
          .in('provider_id', providerIds)
          .limit(100);

        console.log(`🎰 [${provider.name}] 조회 결과:`, { games, error, providerIds });

        if (error || !games || games.length === 0) {
          console.error(`❌ [${provider.name}] honor_games에서 게임을 찾을 수 없습니다:`, error);
          toast.error(`${provider.name_ko || provider.name} 게임을 찾을 수 없습니다.`);
          setIsProcessing(false);
          return;
        }

        console.log(`✅ [${provider.name}] 조회된 게임:`, games);

        // 로비 게임 찾기
        lobbyGame = games.find(g => 
          g.name?.toLowerCase().includes('lobby') || 
          g.name?.toLowerCase().includes('top games') ||
          g.name_ko?.toLowerCase().includes('로비')
        );

        // 로비가 없으면 첫 번째 게임 사용
        if (!lobbyGame) {
          lobbyGame = games[0];
          console.log(`⚠️ [${provider.name}] 로비 게임이 없어 첫 번째 게임 사용:`, lobbyGame.name);
        }

        // Game 객체로 변환
        lobbyGame = {
          id: lobbyGame.id.toString(),
          name: lobbyGame.name,
          name_ko: lobbyGame.name_ko || lobbyGame.name,
          game_code: lobbyGame.game_code,
          provider_id: lobbyGame.provider_id || 0,
          api_type: lobbyGame.api_type || 'honorapi'
        };
      } else if (provider.api_type === 'oroplay' || provider.api_type === 'invest' || provider.api_type === 'familyapi') {
        console.log(`🎰 [${provider.name}] games 테이블에서 조회`);
        
        const { data: games, error } = await supabase
          .from('games')
          .select('id, name, name_ko, game_code, vendor_code, api_type, provider_id')
          .in('provider_id', providerIds)
          .eq('name', 'lobby')
          .limit(1)
          .maybeSingle();

        if (error || !games) {
          console.error(`❌ [${provider.name}] games에서 게임을 찾을 수 없습니다:`, error);
          toast.error(`${provider.name_ko || provider.name} 게임을 찾을 수 없습니다.`);
          setIsProcessing(false);
          return;
        }

        lobbyGame = games;
      } else {
        console.error(`❌ [${provider.name}] 알 수 없는 api_type:`, provider.api_type);
        toast.error('해당 게임사는 준비 중입니다.');
        setIsProcessing(false);
        return;
      }

      // 게임 실행
      await handleGameClick(lobbyGame);
    } catch (error) {
      console.error(`${provider.name} 게임 실행 오류:`, error);
      toast.error(`${provider.name_ko || provider.name} 게임 실행에 실패했습니다.`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ⚡ 게임 목록 로드 함수
  const loadGames = async (provider: GameProvider) => {
    try {
      setGamesLoading(true);

      // 통합된 게임사의 모든 provider_id로 게임 로드
      const providerIds = provider.provider_ids || [provider.id];
      let allGames: Game[] = [];

      for (const providerId of providerIds) {
        const gamesData = await gameApi.getGames({
          type: 'casino',
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
      const activeSession = await gameApi.checkActiveSession(user.id);
      
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
        toast.error('잠시 후 다시 시도해주세요.');
        setLaunchingGameId(null);
        setIsProcessing(false);
        return;
      }

      // ⭐ 2. 같은 API 내에서 다른 게임으로 전환 시 기존 게임 출금
      if (activeSession?.isActive && 
          activeSession.api_type === game.api_type && 
          activeSession.game_id !== parseInt(game.id)) {
        
        const { syncBalanceOnSessionEnd } = await import('../../lib/gameApi');
        await syncBalanceOnSessionEnd(user.id, activeSession.api_type);
      }

      // ⭐ 3. 같은 게임의 active 세션이 있는지 체크 (중복 실행 방지)
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
              
              // ⭐ Heartbeat 정리
              const heartbeat = (handleGameWindowClose as any)._heartbeat;
              if (heartbeat) {
                clearInterval(heartbeat);
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
          
          // ⭐ Heartbeat: 30초마다 게임 세션 활동 업데이트 (5분 자동 종료 방지)
          const heartbeat = setInterval(async () => {
            try {
              if (gameWindow && !gameWindow.closed) {
                await supabase
                  .from('game_launch_sessions')
                  .update({
                    last_activity_at: new Date().toISOString()
                  })
                  .eq('id', activeSession.session_id!);
              }
            } catch (error) {
              console.error('❌ [Heartbeat] 활동 업데이트 실패:', error);
            }
          }, 30 * 1000); // 30초마다
          
          (window as any).gameWindowCheckers.set(activeSession.session_id!, checkGameWindow);
          Object.defineProperty(handleGameWindowClose, '_heartbeat', { value: heartbeat });
        }
        
        setLaunchingGameId(null);
        setIsProcessing(false);
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
                
                // ⭐ Heartbeat 정리
                const heartbeat = (handleGameWindowClose as any)._heartbeat;
                if (heartbeat) {
                  clearInterval(heartbeat);
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
            
            // ⭐ Heartbeat: 30초마다 게임 세션 활동 업데이트 (5분 자동 종료 방지)
            const heartbeat = setInterval(async () => {
              try {
                if (gameWindow && !gameWindow.closed) {
                  await supabase
                    .from('game_launch_sessions')
                    .update({
                      last_activity_at: new Date().toISOString()
                    })
                    .eq('id', sessionId);
                }
              } catch (error) {
                console.error('❌ [Heartbeat] 활동 업데이트 실패:', error);
              }
            }, 30 * 1000); // 30초마다
            
            (window as any).gameWindowCheckers.set(sessionId, checkGameWindow);
            Object.defineProperty(handleGameWindowClose, '_heartbeat', { value: heartbeat });
          }
        }
      } else {
        throw new Error(result.error || '게임 URL을 받지 못했습니다.');
      }
    } catch (error: any) {
      console.error('게임 실행 오류:', error);
      toast.error(error.message || '게임 실행에 실패했습니다.');
    } finally {
      setIsProcessing(false); // 🆕 프로세스 종료
      setLaunchingGameId(null);
    }
  };

  // 게임 목록 화면
  if (selectedProvider) {
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
              <Button
                onClick={handleBackToProviders}
                variant="ghost"
                className="text-white/60 hover:text-white hover:bg-white/5 transition-all"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                뒤로가기
              </Button>
              <h1 className="text-4xl font-bold tracking-tight">
                <span style={{
                  background: 'linear-gradient(90deg, #ffffff 0%, #E6C9A8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  {selectedProvider.name_ko || selectedProvider.name}
                </span>
              </h1>
            </div>
          </div>

          {/* 게임 목록 - 5칸 정렬 */}
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
                    {/* 🔄 게임사 이미지 사용 (BenzMain과 동기화) */}
                    <img
                      src={selectedProvider.logo_url || getLogoUrlByProviderName(selectedProvider) || getRandomCasinoImage()}
                      alt={game.name_ko || game.name}
                      className={`w-full h-full object-cover transition-all duration-700 ${
                        game.status === 'maintenance' ? '' : 'group-hover:scale-110'
                      }`}
                    />
                    
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
        </div>
      </div>
    );
  }

  // 게임사 목록 화면
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
            <h1 className="text-4xl font-bold tracking-tight">
              <span style={{
                background: 'linear-gradient(90deg, #ffffff 0%, #E6C9A8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                카지노 게임
              </span>
            </h1>
          </div>
        </div>

        {/* 제공사 목록 - 5칸 정렬 */}
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
                  src={provider.logo_url || getLogoUrlByProviderName(provider) || getRandomCasinoImage()}
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
      </div>
    </div>
  );
}
