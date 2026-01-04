import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Play } from 'lucide-react';
import { Button } from '../ui/button';
import { gameApi } from '../../lib/gameApi';
import { supabase } from '../../lib/supabase';
import { motion } from 'motion/react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { toast } from 'sonner@2.0.3';
import { createAdminNotification } from '../../lib/notificationHelper';

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
  
  // Evolution
  if (name.includes('evolution') || name.includes('에볼루션')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/evolution.jpg';
  }
  // Pragmatic Play Live
  if ((name.includes('pragmatic') || name.includes('프라그마틱')) && (name.includes('live') || name.includes('라이브'))) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/pragmaticlive.jpg';
  }
  // Microgaming
  if (name.includes('microgaming') || name.includes('마이크로')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/microgaming.jpg';
  }
  // Asia Gaming
  if (name.includes('asia') || name.includes('아시아')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/asiagaming.jpg';
  }
  // SA Gaming
  if (name.includes('sa gaming') || name.includes('sa게이밍') || name === 'sa') {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/sagaming.jpg';
  }
  // Ezugi
  if (name.includes('ezugi') || name.includes('이주기')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/ezugi.jpg';
  }
  // Dream Gaming
  if (name.includes('dream') || name.includes('드림')) {
    return 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/dreamgaming.jpg';
  }
  // Play Ace
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

  // ⚡ 페이지가 포커스될 때 자동 새로고침 (백업 메커니즘)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('👁️ [BenzCasino] 페이지 포커스 감지 - 데이터 새로고침');
        loadProviders();
        if (selectedProviderRef.current) {
          loadGames(selectedProviderRef.current);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    loadProviders();
    
    // ⚡ Realtime: games, game_providers, honor_games, honor_games_provider, partner_game_access 테이블 변경 감지
    const gamesChannel = supabase
      .channel('benz_casino_games_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games' },
        (payload) => {
          console.log('🔄 [BenzCasino] games 테이블 UPDATE 감지:', payload);
          loadProviders();
          // ⚡ ref로 최신 selectedProvider 참조
          if (selectedProviderRef.current) {
            console.log('🔄 [BenzCasino] 게임 목록 새로고침 시작...');
            loadGames(selectedProviderRef.current);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_providers' },
        (payload) => {
          console.log('🔄 [BenzCasino] game_providers 테이블 UPDATE 감지:', payload);
          loadProviders();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'honor_games' },
        (payload) => {
          console.log('🔄 [BenzCasino] honor_games 테이블 UPDATE 감지:', payload);
          loadProviders();
          // ⚡ ref로 최신 selectedProvider 참조
          if (selectedProviderRef.current) {
            console.log('🔄 [BenzCasino] 게임 목록 새로고침 시작...');
            loadGames(selectedProviderRef.current);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'honor_games_provider' },
        (payload) => {
          console.log('🔄 [BenzCasino] honor_games_provider 테이블 UPDATE 감지:', payload);
          loadProviders();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partner_game_access' },
        (payload) => {
          console.log('🔄 [BenzCasino] partner_game_access 테이블 변경 감지:', payload);
          // ⚡ 현재 사용자의 접근 권한이 변경된 경우만 새로고침
          loadProviders();
          if (selectedProviderRef.current) {
            console.log('🔄 [BenzCasino] 게임 목록 새로고침 시작...');
            loadGames(selectedProviderRef.current);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 [BenzCasino] Realtime 구독 상태:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ [BenzCasino] Realtime 구독 성공!');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('❌ [BenzCasino] Realtime 구독 실패:', status);
        }
      });
    
    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(gamesChannel);
    };
  }, []);
  
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
            console.log('🎯 [BenzCasino] localStorage에서 선택한 provider 자동 로드:', matchingProvider);
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
      const { filterVisibleProviders } = await import('../../lib/benzGameVisibility');
      const allProviders = await gameApi.getProviders({ type: 'casino' });
      const providersData = await filterVisibleProviders(allProviders, user.id);
      
      console.log('🎰 [BenzCasino] API 응답 게임사:', providersData.length, '개');
      console.log('🎰 [BenzCasino] 게임사 상세:', providersData.map(p => ({
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
        
        // 프라그마틱 관련 통합
        if (name.includes('pragmatic') || name.includes('프라그마틱')) {
          if (name.includes('slot') || name.includes('슬롯')) {
            return 'pragmatic_slot';
          }
          if (name.includes('live') || name.includes('라이브')) {
            return 'pragmatic_live';
          }
          // 기본 프라그마틱 (라이브로 간주)
          return 'pragmatic_live';
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
      
      for (const provider of providersData) {
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
      
      // 🆕 원하는 순서대로 정렬
      const casinoOrder = [
        'evolution', 'pragmatic_live', 'microgaming', 'asiagaming', 
        'sa gaming', 'ezugi', 'dream gaming', 'playace'
      ];
      
      const sortedProviders = mergedProviders.sort((a, b) => {
        const normalizeForSort = (provider: GameProvider): string => {
          const name = (provider.name_ko || provider.name || '').toLowerCase();
          
          // Evolution
          if (name.includes('evolution') || name.includes('에볼루션')) return 'evolution';
          
          // Pragmatic Play Live
          if ((name.includes('pragmatic') || name.includes('프라그마틱')) && 
              (name.includes('live') || name.includes('라이브'))) return 'pragmatic_live';
          
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
          
          return name;
        };
        
        const aKey = normalizeForSort(a);
        const bKey = normalizeForSort(b);
        const aIndex = casinoOrder.indexOf(aKey);
        const bIndex = casinoOrder.indexOf(bKey);
        
        // 순서에 없는 게임사는 뒤로
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        
        return aIndex - bIndex;
      });
      
      console.log('🎰 [BenzCasino] 정렬된 게임사:', sortedProviders.map(p => p.name_ko || p.name));
      
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

    // ⭐ 디버깅: 게임사 정보 출력
    console.log('🎯 [Provider Click]', {
      name: provider.name,
      name_ko: provider.name_ko,
      vendor_code: provider.vendor_code,
      provider_ids: provider.provider_ids
    });

    // ⭐ Evolution 게임사는 game_id=5185869를 바로 실행
    const providerName = (provider.name || '').toLowerCase();
    const providerNameKo = (provider.name_ko || '').toLowerCase();
    const vendorCode = (provider.vendor_code || '').toLowerCase();
    
    if (providerName.includes('evolution') || providerNameKo.includes('에볼루션')) {
      console.log('🎰 [Evolution] game_id=5185869 직접 실행');
      setIsProcessing(true);
      
      try {
        // Evolution Top Games 게임 객체 생성
        const evolutionGame: Game = {
          id: '5185869',
          name: 'Evolution Top Games',
          name_ko: 'Evolution Top Games',
          game_code: 'evolution_top_games',
          provider_id: 6717,
          api_type: 'honor'
        };
        
        await handleGameClick(evolutionGame);
      } catch (error) {
        console.error('Evolution 게임 실행 오류:', error);
        toast.error('Evolution 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ⭐ 프라그마틱 라이브 카드 클릭 시 로비 게임(id: 2283279) 바로 실행
    if ((providerName.includes('pragmatic') || providerNameKo.includes('프라그마틱')) && 
        (providerName.includes('live') || providerNameKo.includes('라이브'))) {
      
      console.log('🎰 [Pragmatic Live] game_id=2283279 직접 실행');
      setIsProcessing(true);
      
      try {
        // Pragmatic Live 로비 게임 객체 생성
        const pragmaticLobbyGame: Game = {
          id: '2283279',
          name: 'lobby',
          name_ko: 'lobby',
          game_code: 'lobby',
          provider_id: 0,
          api_type: 'honor',
          vendor_code: 'casino-pragmatic'
        };
        
        await handleGameClick(pragmaticLobbyGame);
      } catch (error) {
        console.error('Pragmatic Live 로비 실행 오류:', error);
        toast.error('Pragmatic Live 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ⭐ SA Gaming 카드 클릭 시 로비 게임(id: 2534627) 바로 실행
    if (providerName.includes('sa') || providerNameKo.includes('sa') || providerNameKo.includes('게이밍')) {
      
      console.log('🎰 [SA Gaming] game_id=2534627 직접 실행');
      setIsProcessing(true);
      
      try {
        // SA Gaming 로비 게임 객체 생성
        const saLobbyGame: Game = {
          id: '2534627',
          name: 'lobby',
          name_ko: 'lobby',
          game_code: 'lobby',
          provider_id: 0,
          api_type: 'honor',
          vendor_code: 'casino-sa'
        };
        
        await handleGameClick(saLobbyGame);
      } catch (error) {
        console.error('SA Gaming 로비 실행 오류:', error);
        toast.error('SA Gaming 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ⭐ Microgaming 카드 클릭 시 로비 게임(id: 2159875) 바로 실행
    const isMicrogaming = providerName.includes('micro') || 
                          providerNameKo.includes('마이크로') || 
                          vendorCode.includes('micro');
    
    if (isMicrogaming) {
      console.log('🎰 [Microgaming] game_id=2159875 직접 실행');
      setIsProcessing(true);
      
      try {
        const microLobbyGame: Game = {
          id: '2159875',
          name: 'lobby',
          name_ko: 'lobby',
          game_code: 'lobby',
          provider_id: 0,
          api_type: 'honor',
          vendor_code: 'casino-micro'
        };
        
        await handleGameClick(microLobbyGame);
      } catch (error) {
        console.error('Microgaming 로비 실행 오류:', error);
        toast.error('Microgaming 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ⭐ Play Ace 카드 클릭 시 로비 게임(id: 2026066) 바로 실행
    if (providerName.includes('playace') || providerNameKo.includes('플레이') || providerNameKo.includes('에이스')) {
      console.log('🎰 [Play Ace] game_id=2026066 직접 실행');
      setIsProcessing(true);
      
      try {
        const playaceLobbyGame: Game = {
          id: '2026066',
          name: 'lobby',
          name_ko: 'lobby',
          game_code: 'lobby',
          provider_id: 0,
          api_type: 'honor',
          vendor_code: 'casino-playace'
        };
        
        await handleGameClick(playaceLobbyGame);
      } catch (error) {
        console.error('Play Ace 로비 실행 오류:', error);
        toast.error('Play Ace 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ⭐ Dream Gaming 카드 클릭 시 로비 게임(id: 2222238) 바로 실행
    if (providerName.includes('dream') || providerNameKo.includes('드림')) {
      console.log('🎰 [Dream Gaming] game_id=2222238 직접 실행');
      setIsProcessing(true);
      
      try {
        const dreamLobbyGame: Game = {
          id: '2222238',
          name: 'lobby',
          name_ko: 'lobby',
          game_code: 'lobby',
          provider_id: 0,
          api_type: 'honor',
          vendor_code: 'casino-dream'
        };
        
        await handleGameClick(dreamLobbyGame);
      } catch (error) {
        console.error('Dream Gaming 로비 실행 오류:', error);
        toast.error('Dream Gaming 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ⭐ Asia Gaming 카드 클릭 시 로비 게임(id: 2290046) 바로 실행
    if (providerName.includes('asia') || providerNameKo.includes('아시아')) {
      console.log('🎰 [Asia Gaming] game_id=2290046 직접 실행');
      setIsProcessing(true);
      
      try {
        const asiaLobbyGame: Game = {
          id: '2290046',
          name: 'lobby',
          name_ko: 'lobby',
          game_code: 'lobby',
          provider_id: 0,
          api_type: 'honor',
          vendor_code: 'casino-ag'
        };
        
        await handleGameClick(asiaLobbyGame);
      } catch (error) {
        console.error('Asia Gaming 로비 실행 오류:', error);
        toast.error('Asia Gaming 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ⭐ Ezugi 카드 클릭 시 로비 게임(id: 5185843) 바로 실행
    if (providerName.includes('ezugi') || providerNameKo.includes('이주기')) {
      console.log('🎰 [Ezugi] game_id=5185843 직접 실행');
      setIsProcessing(true);
      
      try {
        const ezugiLobbyGame: Game = {
          id: '5185843',
          name: 'Ezugi',
          name_ko: 'Ezugi',
          game_code: 'Ezugi',
          provider_id: 0,
          api_type: 'honor',
          vendor_code: 'ezugi'
        };
        
        await handleGameClick(ezugiLobbyGame);
      } catch (error) {
        console.error('Ezugi 로비 실행 오류:', error);
        toast.error('Ezugi 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ⭐ Skywind Live 카드 클릭 시 로비 게임 바로 실행
    if (providerName.includes('skywind') || providerNameKo.includes('스카이윈드')) {
      console.log('🎰 [Skywind Live] 로비 게임 직접 실행');
      setIsProcessing(true);
      
      try {
        // 🔍 DB에서 Skywind Live 카지노 게임 조회
        const { data: skywindGames, error: skywindError } = await supabase
          .from('honor_games')
          .select('id, name, name_ko, game_code, vendor_code, api_type')
          .ilike('vendor_code', '%skywind%')
          .eq('type', 'casino')
          .eq('is_visible', true)
          .limit(10);

        if (skywindError || !skywindGames || skywindGames.length === 0) {
          console.error('❌ [Skywind Live] DB에서 게임을 찾을 수 없습니다:', skywindError);
          toast.error('Skywind Live 게임을 찾을 수 없습니다.');
          setIsProcessing(false);
          return;
        }

        console.log('✅ [Skywind Live] 조회된 게임:', skywindGames);

        // 로비 게임 찾기 (이름에 'lobby' 포함)
        let skywindGame = skywindGames.find(g => 
          g.name?.toLowerCase().includes('lobby') || 
          g.name_ko?.toLowerCase().includes('로비')
        );

        // 로비가 없으면 첫 번째 게임 사용
        if (!skywindGame) {
          skywindGame = skywindGames[0];
          console.log('⚠️ [Skywind Live] 로비 게임이 없어 첫 번째 게임 사용:', skywindGame.name);
        }

        const skywindLiveGame: Game = {
          id: skywindGame.id,
          name: skywindGame.name,
          name_ko: skywindGame.name_ko || skywindGame.name,
          game_code: skywindGame.game_code,
          provider_id: 0,
          api_type: skywindGame.api_type || 'honor',
          vendor_code: skywindGame.vendor_code
        };
        
        await handleGameClick(skywindLiveGame);
      } catch (error) {
        console.error('Skywind Live 로비 실행 오류:', error);
        toast.error('Skywind Live 게임 실행에 실패했습니다.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ⭐ 다른 모든 게임사는 게임 목록으로 이동하지 않고 토스트 메시지만 표시
    console.log(`⚠️ [${provider.name_ko || provider.name}] 로비 게임이 등록되지 않았습니다.`);
    toast.error('해당 게임사는 준비 중입니다.');
  };

  // ⚡ 게임 목록 로드 함수 (Realtime 콜백에서도 사용)
  const loadGames = async (provider: GameProvider) => {
    try {
      setGamesLoading(true);

      // 🆕 통합된 게임사의 모든 provider_id로 게임 로드
      const providerIds = provider.provider_ids || [provider.id];
      let allGames: Game[] = [];

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

      // ⭐ 점검중 상태 추가 (benzGameVisibility 사용)
      const { filterVisibleGames } = await import('../../lib/benzGameVisibility');
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
      
      // ⭐ 1. 다른 API 게임이 실행 중인지 체크
      if (activeSession?.isActive && activeSession.api_type !== game.api_type) {
        toast.error('잠시 후 다시 시도해주세요.');
        
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
        
        console.log('🔄 [카지노 입장] active 세션 재사용 - 기존 URL 사용:', activeSession.session_id);
        
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
          toast.success(`${game.name} 카지노에 입장했습니다.`);
          
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
              console.log('⚠️ [중복 방지] 이미 처리 중인 세션:', sessionId);
              return;
            }
            
            console.log('🔄 [게임 종료] 처리 시작:', sessionId);
            closeProcessingRef.current.set(sessionId, true);
            
            try {
              const checker = (window as any).gameWindowCheckers?.get(sessionId);
              if (checker) {
                clearInterval(checker);
                (window as any).gameWindowCheckers?.delete(sessionId);
              }
              
              (window as any).gameWindows?.delete(sessionId);
              await (window as any).syncBalanceAfterGame?.(sessionId);
              
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
          toast.success(`${game.name} 카지노에 입장했습니다.`);
          
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
                console.log('⚠️ [중복 방지] 이미 처리 중인 세션:', sessionId);
                return;
              }
              
              console.log('🔄 [게임 종료] 처리 시작:', sessionId);
              closeProcessingRef.current.set(sessionId, true);
              
              try {
                const checker = (window as any).gameWindowCheckers?.get(sessionId);
                if (checker) {
                  clearInterval(checker);
                  (window as any).gameWindowCheckers?.delete(sessionId);
                }
                
                (window as any).gameWindows?.delete(sessionId);
                
                // withdrawal API 호출 (syncBalanceAfterGame 내부에서 처리)
                await (window as any).syncBalanceAfterGame?.(sessionId);
                
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
                {selectedProvider ? selectedProvider.name_ko || selectedProvider.name : '라이브 카지노'}
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
                  {provider.logo_url && (
                    <img
                      src={provider.logo_url}
                      alt=""
                      className="w-[100%] object-cover"
                      style={{
                        height: '100%',
                        marginTop: '0%'
                      }}
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
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    // 🆕 로비 게임은 골드 테두리로 강조
                    border: (game.name?.toLowerCase().includes('lobby') || game.name_ko?.includes('로비')) 
                      ? '3px solid rgba(230, 201, 168, 0.8)' 
                      : 'none'
                  }}>
                    {/* 🆕 로비 뱃지 */}
                    {(game.name?.toLowerCase().includes('lobby') || game.name_ko?.includes('로비')) && (
                      <div className="absolute top-3 right-3 z-20 px-4 py-2 rounded-full" style={{
                        background: 'linear-gradient(135deg, rgba(230, 201, 168, 0.95) 0%, rgba(193, 154, 107, 0.95) 100%)',
                        boxShadow: '0 4px 15px rgba(230, 201, 168, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.3)'
                      }}>
                        <span className="text-black font-black text-sm tracking-wider" style={{
                          fontFamily: 'AsiaHead, -apple-system, sans-serif',
                          textShadow: '0 1px 2px rgba(255,255,255,0.3)'
                        }}>
                          LOBBY
                        </span>
                      </div>
                    )}
                    
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