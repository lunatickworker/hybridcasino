import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { 
  Play, 
  Bell,
  HelpCircle,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { gameApi } from "../../lib/gameApi";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner@2.0.3";
import { GamePreparingDialog } from "../user/GamePreparingDialog";

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
}

interface MiniGame {
  id: string;
  game_name: string;
  game_code: string;
  thumbnail_url?: string;
  is_active: boolean;
}

interface Notice {
  id: string;
  title: string;
  created_at: string;
}

interface Support {
  id: string;
  title: string;
  created_at: string;
}

// Fallback 데이터 (데이터베이스에 데이터가 없을 경우 사용)
const FALLBACK_CASINO_PROVIDERS = [
  { id: 1, name: 'Evolution', name_ko: '에볼루션', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/16.png', status: 'visible' },
  { id: 2, name: 'Pragmatic Play Live', name_ko: '프라그마틱 라이브', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/17.png', status: 'visible' },
  { id: 3, name: 'Dream Gaming', name_ko: '드림게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/18.png', status: 'visible' },
  { id: 4, name: 'Microgaming', name_ko: '마이크로게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/19.png', status: 'visible' },
  { id: 5, name: 'Asia Gaming', name_ko: '아시아게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/20.png', status: 'visible' },
  { id: 6, name: 'Sexy Gaming', name_ko: '섹시게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/21.png', status: 'visible' },
  { id: 7, name: 'BBIN', name_ko: '비비아이엔', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/22.png', status: 'visible' },
  { id: 8, name: 'Oriental Game', name_ko: '오리엔탈게임', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/16.png', status: 'visible' },
  { id: 9, name: 'Vivo Gaming', name_ko: 'Vivo 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/17.png', status: 'visible' },
  { id: 10, name: 'Ezugi', name_ko: '이주기', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/18.png', status: 'visible' },
  { id: 11, name: 'Playtech', name_ko: '플레이텍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/19.png', status: 'visible' },
  { id: 12, name: 'Bota', name_ko: '보타', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/20.png', status: 'visible' },
];

const FALLBACK_SLOT_PROVIDERS = [
  { id: 101, name: '프라그마틱 플레이', name_ko: '프라그마틱 플레이', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s1.png', status: 'visible' },
  { id: 102, name: 'PG소프트', name_ko: 'PG소프트', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s2.png', status: 'visible' },
  { id: 103, name: '넷엔트', name_ko: '넷엔트', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s10.png', status: 'visible' },
  { id: 104, name: '레드타이거', name_ko: '레드타이거', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s11.png', status: 'visible' },
  { id: 105, name: '플레이앤고', name_ko: '플레이앤고', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s12.png', status: 'visible' },
  { id: 106, name: '퀵스핀', name_ko: '퀵스핀', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s13.png', status: 'visible' },
  { id: 107, name: '이그드라실', name_ko: '이그드라실', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s14.png', status: 'visible' },
  { id: 108, name: '하바네로', name_ko: '하바네로', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s15.png', status: 'visible' },
  { id: 109, name: '블루프린트', name_ko: '블루프린트', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s16.png', status: 'visible' },
  { id: 110, name: '빅타임게이밍', name_ko: '빅타임게이밍', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s17.png', status: 'visible' },
  { id: 111, name: '릴렉스 게이밍', name_ko: '릴렉스 게이밍', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s18.png', status: 'visible' },
  { id: 112, name: '노리밋 시티', name_ko: '노리밋 시티', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s19.png', status: 'visible' },
];

const FALLBACK_MINI_GAMES = [
  { id: '1', game_name: '파워볼', game_code: 'powerball', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/powerball.png', is_active: true },
  { id: '2', game_name: '파워사다리', game_code: 'powerladder', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/powerladder.png', is_active: true },
  { id: '3', game_name: '스피드키노', game_code: 'speedkino', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/speedkino.png', is_active: true },
  { id: '4', game_name: '키노사다리', game_code: 'kinoladder', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/kinoladder.png', is_active: true },
  { id: '5', game_name: '룰렛', game_code: 'roulette', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/roulette.png', is_active: true },
  { id: '6', game_name: '홀짝', game_code: 'oddeven', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/oddeven.png', is_active: true },
  { id: '7', game_name: '다리다리', game_code: 'ladder', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/mini1.png', is_active: true },
  { id: '8', game_name: '스피드바카라', game_code: 'speedbaccarat', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/mini2.png', is_active: true },
  { id: '9', game_name: '달팽이', game_code: 'snail', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/mini3.png', is_active: true },
  { id: '10', game_name: '로투스바카라', game_code: 'lotusbaccarat', thumbnail_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/mini4.png', is_active: true },
];

export function BenzMain({ user, onRouteChange }: BenzMainProps) {
  const [casinoProviders, setCasinoProviders] = useState<GameProvider[]>([]);
  const [slotProviders, setSlotProviders] = useState<GameProvider[]>([]);
  const [inoutGames, setInoutGames] = useState<any[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<any[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [supports, setSupports] = useState<Support[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoginMessage, setShowLoginMessage] = useState(false);
  
  const casinoScrollRef = useRef<HTMLDivElement>(null);
  const slotScrollRef = useRef<HTMLDivElement>(null);
  const miniScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // 카지노 제공사 - 하드코딩된 이미지 사용
      setCasinoProviders(FALLBACK_CASINO_PROVIDERS);

      // 슬롯 제공사 - 무조건 FALLBACK 이미지 사용
      setSlotProviders(FALLBACK_SLOT_PROVIDERS);

      // Inout 미니게임 로드 - 슬롯과 동일한 로직
      const { data: inoutProvider } = await supabase
        .from('game_providers')
        .select('id')
        .eq('vendor_code', 'mini-inout')
        .single();

      if (inoutProvider) {
        const gamesData = await gameApi.getUserVisibleGames({
          type: 'minigame',
          provider_id: inoutProvider.id
        });

        const formattedGames = gamesData?.map(game => ({
          id: game.id,
          name: game.name,
          game_name: game.name,
          thumbnail_url: game.image_url,
          game_code: game.game_code || `game_${game.id}`,
          provider_id: inoutProvider.id,
          is_active: true
        })) || [];

        console.log('✅ Inout 게임 로드 완료:', formattedGames.length, '개');
        setInoutGames(formattedGames);
      } else {
        console.log('⚠️ Inout 제공사 없음');
        
        // 모든 미니게임 제공사 확인
        const { data: allProviders } = await supabase
          .from('game_providers')
          .select('id, name, vendor_code, type, api_type')
          .eq('type', 'minigame');
        
        console.log('📋 미니게임 제공사 목록:', allProviders);
        
        // Inout이 없으면 첫 번째 미니게임 제공사 사용
        if (allProviders && allProviders.length > 0) {
          const firstProvider = allProviders[0];
          console.log('🔄 첫 번째 미니게임 제공사 사용:', firstProvider);
          
          const gamesData = await gameApi.getUserVisibleGames({
            type: 'minigame',
            provider_id: firstProvider.id
          });

          const formattedGames = gamesData?.map(game => ({
            id: game.id,
            name: game.name,
            game_name: game.name,
            thumbnail_url: game.image_url,
            game_code: game.game_code || `game_${game.id}`,
            provider_id: firstProvider.id,
            is_active: true
          })) || [];

          console.log('✅ 미니게임 로드 완료:', formattedGames.length, '개');
          setInoutGames(formattedGames);
        } else {
          setInoutGames([]);
        }
      }

      // 출금현황 데이터
      const { data: withdrawals } = await supabase
        .from('transactions')
        .select(`
          id,
          amount,
          created_at,
          users!inner (username, nickname)
        `)
        .eq('transaction_type', 'withdrawal')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20);

      setRecentWithdrawals(withdrawals || []);

      // 공지사항 데이터
      const { data: noticeData } = await supabase
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);

      setNotices(noticeData || []);

      // FAQ 데이터
      const { data: supportData } = await supabase
        .from('supports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);

      setSupports(supportData || []);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount || 0);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const scroll = (ref: React.RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = 400;
      ref.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleProviderClick = (provider: GameProvider, type: 'casino' | 'slot') => {
    if (!user) {
      setShowLoginMessage(true);
      setTimeout(() => setShowLoginMessage(false), 3000);
      return;
    }
    
    if (type === 'casino') {
      onRouteChange('/benz/casino');
    } else {
      onRouteChange('/benz/slot');
    }
  };

  const handleMiniGameClick = async (game: any) => {
    if (!user) {
      setShowLoginMessage(true);
      setTimeout(() => setShowLoginMessage(false), 3000);
      return;
    }

    try {
      console.log('🎮 미니게임 클릭:', game);
      
      // ⭐ 1. 활성화된 세션 체크 (중복 실행 방지)
      const activeSession = await gameApi.checkActiveSession(user.id);
      
      // ⭐ 2. 다른 API 게임이 실행 중인지 체크
      if (activeSession?.isActive) {
        // 게임 데이터에서 api_type 가져오기
        const { data: gameData } = await supabase
          .from('games')
          .select('api_type')
          .eq('id', parseInt(game.id))
          .single();
        
        const newGameApiType = gameData?.api_type || 'oroplay';
        
        if (activeSession.api_type !== newGameApiType) {
          const apiNames = {
            invest: 'Invest API',
            oroplay: 'OroPlay API',
            familyapi: 'FamilyAPI',
            honorapi: 'HonorAPI'
          };
          
          toast.error(
            `${apiNames[activeSession.api_type!] || activeSession.api_type} 게임이 실행 중입니다.\\n` +
            `현재 게임: ${activeSession.game_name}\\n\\n` +
            `다른 API 게임을 실행하려면 현재 게임을 종료해주세요.`,
            { duration: 5000 }
          );
          
          return;
        }
        
        // ⭐ 3. 같은 API 내에서 다른 게임으로 전환 시 기존 게임 출금
        if (activeSession.game_id !== game.id) {
          console.log('🔄 [게임 전환] 기존 게임 출금 후 새 게임 실행:', {
            oldGameId: activeSession.game_id,
            newGameId: game.id
          });
          
          // 기존 게임 출금 + 보유금 동기화
          await gameApi.syncBalanceOnSessionEnd(user.id, activeSession.api_type);
          console.log('✅ [게임 전환] 기존 게임 출금 완료, 새 게임 실행 시작');
        }
        
        // ⭐ 4. 같은 게임의 active 세션이 있는지 체크 (중복 실행 방지)
        if (activeSession.game_id === game.id && 
            activeSession.status === 'active' && 
            activeSession.launch_url) {
          
          console.log('🔄 [미니게임 입장] active 세션 재사용 - 기존 URL 사용:', activeSession.session_id);
          
          // 기존 launch_url로 게임창 오픈
          const gameWindow = window.open(
            activeSession.launch_url,
            '_blank',
            'width=1200,height=800,scrollbars=yes,resizable=yes'
          );

          if (!gameWindow) {
            // ⭐ 팝업 차단 시나리오
            toast.error('팝업이 차단되었습니다. 팝업 허용 후 다시 클릭해주세요.');
            
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
            toast.success(`${game.game_name || game.name} 게임에 입장했습니다.`);
            
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
          
          return;
        }
      }
      
      // ⭐ 5. 새로운 게임 실행 (API 입금 포함)
      const result = await gameApi.generateGameLaunchUrl(user.id, parseInt(game.id));
      
      if (result.success && result.launchUrl) {
        const sessionId = result.sessionId;
        
        const gameWindow = window.open(
          result.launchUrl,
          '_blank',
          'width=1200,height=800,scrollbars=yes,resizable=yes'
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
        } else {
          // ⭐ 팝업 오픈 성공: ready_status를 'popup_opened'로 업데이트
          toast.success(`${game.game_name || game.name} 게임에 입장했습니다.`);
          
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
              
              // withdrawal API 호출 (syncBalanceAfterGame 내부에서 처리)
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
        toast.error(result.error || '게임 실행에 실패했습니다.');
      }
    } catch (error) {
      console.error('게임 실행 오류:', error);
      toast.error('게임 실행에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-12 max-w-full overflow-x-hidden pb-16 md:pb-16 mb-16 md:mb-0" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
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
            <div className="relative bg-[#0a0e27]/95 backdrop-blur-sm border-2 px-10 py-5 shadow-2xl" style={{
              borderColor: 'rgba(168, 85, 247, 0.4)',
              boxShadow: '0 0 30px rgba(168, 85, 247, 0.3), 0 0 60px rgba(236, 72, 153, 0.2), inset 0 0 20px rgba(168, 85, 247, 0.1)'
            }}>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full animate-pulse" style={{
                  background: 'radial-gradient(circle, rgba(168, 85, 247, 1) 0%, rgba(168, 85, 247, 0.4) 70%)',
                  boxShadow: '0 0 10px rgba(168, 85, 247, 0.8), 0 0 20px rgba(168, 85, 247, 0.5)'
                }}></div>
                <p className="font-bold text-lg" style={{
                  color: '#e0d5ff',
                  textShadow: '0 0 10px rgba(168, 85, 247, 0.6), 0 0 20px rgba(236, 72, 153, 0.4), 0 0 30px rgba(168, 85, 247, 0.3)',
                  letterSpacing: '0.5px'
                }}>로그인이 필요한 서비스입니다</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Banner */}
      <div className="relative md:h-[400px] h-[250px] overflow-visible">
        <ImageWithFallback
          src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/loginmenu1.png"
          alt="Casino Banner"
          className="w-full h-full object-cover"
        />
        {/* 헤더와 배너 경계에 걸친 로고 - 최상단 레이어 - Desktop only */}
        <div className="hidden md:block fixed left-1/2 transform -translate-x-1/2 z-[100]" style={{ top: '20px' }}>
          <ImageWithFallback
            src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/benzlogo%20(1).png"
            alt="BENZ CASINO"
            className="h-48 w-auto object-contain"
            style={{
              filter: 'drop-shadow(0 0 20px rgba(168, 85, 247, 0.6)) drop-shadow(0 0 40px rgba(236, 72, 153, 0.4))'
            }}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent">
          <div className="flex items-center h-full px-12 md:px-12 px-6">
            <div className="max-w-2xl space-y-6 md:space-y-6 space-y-3">
              <p className="text-xl md:text-xl text-base text-gray-200">
                프리미엄 카지노 경험을 지금 시작하세요
              </p>
              <Button
                size="lg"
                onClick={() => {
                  if (!user) {
                    setShowLoginMessage(true);
                    setTimeout(() => setShowLoginMessage(false), 3000);
                    return;
                  }
                  onRouteChange('/benz/casino');
                }}
                className="relative border-2 text-white px-8 py-4 md:px-8 md:py-4 px-6 py-3 transition-all duration-300 overflow-hidden group"
                style={{
                  background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                  borderColor: '#a855f7'
                }}
              >
                {/* 호버 시 밝아지는 효과 */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                  background: 'linear-gradient(135deg, #c084fc, #f472b6)'
                }}></div>
                
                <div className="relative flex items-center gap-2">
                  <Play className="w-5 h-5 md:w-5 md:h-5 w-4 h-4" />
                  <span className="font-black text-white tracking-tight" style={{ 
                    fontSize: '1.02rem',
                    textRendering: 'geometricPrecision',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale'
                  }}>게임 시작하기</span>
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 라이브카지노 섹션 */}
      <section className="relative px-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-1 h-8 bg-gradient-to-b from-purple-500 to-pink-500"></div>
            <h2 className="text-3xl font-black">
              <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                LIVE CASINO
              </span>
            </h2>
          </div>
          <button
            onClick={() => onRouteChange('/benz/casino')}
            className="text-base text-purple-400 hover:text-purple-300 transition-colors"
          >
            전체보기 →
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => scroll(casinoScrollRef, 'left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center transition-all duration-300 hover:scale-110"
            style={{
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(236, 72, 153, 0.8))',
              boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)'
            }}
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          <div 
            ref={casinoScrollRef}
            className="flex gap-6 overflow-x-auto scrollbar-hide px-16"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {loading ? (
              // 로딩 스켈레톤
              Array(12).fill(0).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[294px]">
                  <div className="relative aspect-square bg-gray-800 animate-pulse"></div>
                </div>
              ))
            ) : (
              casinoProviders.map((provider) => (
                <div key={provider.id} className="flex-shrink-0 w-[294px]">
                  <motion.div
                    whileHover={{ 
                      scale: 1.05,
                      rotateY: 5,
                      boxShadow: '0 20px 40px rgba(168, 85, 247, 0.6), 0 0 60px rgba(236, 72, 153, 0.4)'
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="cursor-pointer bg-[#1a1f3a] group"
                    onClick={() => handleProviderClick(provider, 'casino')}
                    style={{
                      transformStyle: 'preserve-3d',
                      perspective: '1000px'
                    }}
                  >
                    <div className="relative aspect-square flex items-center justify-center overflow-hidden">
                      {provider.logo_url || provider.thumbnail_url ? (
                        <ImageWithFallback
                          src={provider.logo_url || provider.thumbnail_url || ''}
                          alt={provider.name}
                          className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
                        />
                      ) : (
                        <Sparkles className="w-16 h-16 text-purple-500/50" />
                      )}
                      
                      {/* 호버 오버레이 */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      
                      {/* 제공사명 또는 로고 */}
                      {(() => {
                        const logoMap: { [key: number]: string } = {
                          1: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/evolution%20(1).png',
                          2: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/pragmatic.png',
                          3: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/dream.png',
                          4: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/wmcasino.png',
                          5: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/asian.png',
                          6: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/sexycasino.png',
                          7: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/dowin.png',
                          8: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/oriental.png',
                          9: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/vivo.png',
                          10: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/ezugi.png',
                          11: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/playtech.png',
                          12: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/bota.png',
                        };

                        const logoUrl = logoMap[provider.id];

                        return logoUrl ? (
                          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent z-30 flex items-center justify-center">
                            <ImageWithFallback
                              src={logoUrl}
                              alt={provider.name}
                              className="h-24 w-auto object-contain"
                            />
                          </div>
                        ) : (
                          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent z-30">
                            <p className="font-black text-lg text-center text-white" style={{
                              textShadow: '0 0 20px rgba(236, 72, 153, 0.8), 0 2px 10px rgba(0, 0, 0, 1)'
                            }}>
                              {provider.name_ko || provider.name}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </motion.div>
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => scroll(casinoScrollRef, 'right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center transition-all duration-300 hover:scale-110"
            style={{
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(236, 72, 153, 0.8))',
              boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)'
            }}
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </div>
      </section>

      {/* 슬롯게임 섹션 */}
      <section className="relative px-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-1 h-8 bg-gradient-to-b from-pink-500 to-purple-500"></div>
            <h2 className="text-3xl font-black">
              <span className="bg-gradient-to-r from-pink-500 to-purple-400 bg-clip-text text-transparent">
                SLOT GAMES
              </span>
            </h2>
          </div>
          <button
            onClick={() => onRouteChange('/benz/slot')}
            className="text-base text-pink-400 hover:text-pink-300 transition-colors"
          >
            전체보기 →
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => scroll(slotScrollRef, 'left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center transition-all duration-300 hover:scale-110"
            style={{
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.8), rgba(168, 85, 247, 0.8))',
              boxShadow: '0 0 20px rgba(236, 72, 153, 0.5)'
            }}
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          <div 
            ref={slotScrollRef}
            className="flex gap-6 overflow-x-auto scrollbar-hide px-16"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {loading ? (
              Array(12).fill(0).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[294px]">
                  <div className="relative aspect-[4/3.15] bg-gray-800 animate-pulse"></div>
                </div>
              ))
            ) : (
              slotProviders.map((provider) => (
                <div key={provider.id} className="flex-shrink-0 w-[294px]">
                  <motion.div
                    whileHover={{ 
                      scale: 1.05,
                      rotateY: 5,
                      boxShadow: '0 20px 40px rgba(236, 72, 153, 0.6), 0 0 60px rgba(168, 85, 247, 0.4)'
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="cursor-pointer group"
                    onClick={() => handleProviderClick(provider, 'slot')}
                    style={{
                      transformStyle: 'preserve-3d',
                      perspective: '1000px'
                    }}
                  >
                    <div className="relative aspect-[4/3.15] flex items-center justify-center overflow-hidden">
                      {/* 배경 이미지 */}
                      <div 
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/slotbackground.png)'
                        }}
                      ></div>
                      
                      {/* 제공사 로고 이미지 - 오버레이 */}
                      {provider.logo_url || provider.thumbnail_url ? (
                        <div className="absolute inset-0 z-10">
                          <ImageWithFallback
                            src={provider.logo_url || provider.thumbnail_url || ''}
                            alt={provider.name}
                            className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
                          />
                        </div>
                      ) : (
                        <Sparkles className="w-16 h-16 text-pink-500/50 relative z-10" />
                      )}
                      
                      {/* 호버 오버레이 */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20"></div>
                      
                      {/* 제공사명 또는 로고 */}
                      {(() => {
                        const slotLogoMap: { [key: number]: string } = {
                          101: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/blue.png',
                          102: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/booming.png',
                          103: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/btg.png',
                          104: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/habanero.png',
                          105: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/mirogaming.png',
                          106: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/netent.png',
                          107: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/pans.png',
                          108: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/playgo.png',
                          109: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/playstar.png',
                          110: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/redtiger.png',
                          111: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/skywind.png',
                          112: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/slotname/rela.png',
                        };

                        const logoUrl = slotLogoMap[provider.id];
                        
                        // 101, 102, 103, 105, 108, 110번은 검은 배경, 나머지는 흰색 배경
                        const isDarkBackground = [101, 102, 103, 105, 108, 110].includes(provider.id);
                        const bgGradient = isDarkBackground 
                          ? 'from-black/95 via-black/80 to-transparent'
                          : 'from-white/95 via-white/80 to-transparent';

                        return logoUrl ? (
                          <div className={`absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t ${bgGradient} z-30 flex items-center justify-center`}>
                            <ImageWithFallback
                              src={logoUrl}
                              alt={provider.name}
                              className="h-24 w-auto object-contain"
                            />
                          </div>
                        ) : (
                          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent z-30">
                            <p className="font-black text-lg text-center text-white" style={{
                              textShadow: '0 0 20px rgba(236, 72, 153, 0.8), 0 2px 10px rgba(0, 0, 0, 1)'
                            }}>
                              {provider.name}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </motion.div>
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => scroll(slotScrollRef, 'right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center transition-all duration-300 hover:scale-110"
            style={{
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.8), rgba(168, 85, 247, 0.8))',
              boxShadow: '0 0 20px rgba(236, 72, 153, 0.5)'
            }}
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </div>
      </section>

      {/* 미니게임 섹션 */}
      <section className="relative px-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-cyan-500"></div>
            <h2 className="text-3xl font-black">
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                MINI GAMES
              </span>
            </h2>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => scroll(miniScrollRef, 'left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center transition-all duration-300 hover:scale-110"
            style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(6, 182, 212, 0.8))',
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)'
            }}
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          <div 
            ref={miniScrollRef}
            className="flex gap-6 overflow-x-auto scrollbar-hide px-16"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {loading ? (
              Array(6).fill(0).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[294px]">
                  <div className="relative aspect-[4/3] bg-gray-800 animate-pulse"></div>
                </div>
              ))
            ) : (
              <>
                {/* Inout 게임만 표시 */}
                {inoutGames.map((game) => (
                  <div key={game.id} className="flex-shrink-0 w-[294px]">
                    <motion.div
                      whileHover={{ 
                        scale: 1.05,
                        rotateY: 5,
                        boxShadow: '0 20px 40px rgba(59, 130, 246, 0.6), 0 0 60px rgba(6, 182, 212, 0.4)'
                      }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="cursor-pointer bg-[#1a1f3a] group"
                      onClick={() => handleMiniGameClick(game)}
                      style={{
                        transformStyle: 'preserve-3d',
                        perspective: '1000px'
                      }}
                    >
                      <div className="relative aspect-[4/3] bg-gradient-to-br from-blue-900/20 to-cyan-900/20 flex items-center justify-center overflow-hidden">
                        {game.thumbnail_url ? (
                          <ImageWithFallback
                            src={game.thumbnail_url}
                            alt={game.game_name || game.name || '미니게임'}
                            className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
                          />
                        ) : (
                          <Sparkles className="w-16 h-16 text-blue-500/50" />
                        )}
                        
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        
                        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
                          <p className="font-black text-lg text-center text-white" style={{
                            textShadow: '0 0 20px rgba(59, 130, 246, 0.8), 0 2px 10px rgba(0, 0, 0, 1)'
                          }}>
                            {game.game_name || game.name || '미니게임'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                ))}
              </>
            )}
          </div>

          <button
            onClick={() => scroll(miniScrollRef, 'right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center transition-all duration-300 hover:scale-110"
            style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(6, 182, 212, 0.8))',
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)'
            }}
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </div>
      </section>

      {/* 하단 정보 섹션 */}
      <section className="px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 공지사항 */}
          <Card className="bg-[#1a1f3a] border-purple-500/30 cursor-pointer hover:border-yellow-400/50 transition-all duration-300" onClick={() => onRouteChange('/benz/notice')}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Bell className="w-6 h-6 text-yellow-400" />
                <h3 className="text-xl font-black text-yellow-400">공지사항</h3>
              </div>
              <div className="space-y-4">
                {notices.length > 0 ? (
                  notices.map((notice) => (
                    <div key={notice.id} className="flex items-start justify-between border-b border-purple-900/20 pb-4">
                      <div className="flex-1">
                        <p className="text-white mb-1" style={{ fontSize: '120%' }}>{notice.title}</p>
                        <p className="text-gray-400" style={{ fontSize: '120%' }}>{formatDate(notice.created_at)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start justify-between border-b border-purple-900/20 pb-4">
                      <div className="flex-1">
                        <p className="text-white mb-1" style={{ fontSize: '120%' }}>카지노 출금 및 이용에 관한 안내</p>
                        <p className="text-gray-400" style={{ fontSize: '120%' }}>2025-11-18</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card className="bg-[#1a1f3a] border-purple-500/30 cursor-pointer hover:border-blue-400/50 transition-all duration-300" onClick={() => onRouteChange('/benz/support')}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <HelpCircle className="w-6 h-6 text-blue-400" />
                <h3 className="text-xl font-black text-blue-400">FAQ</h3>
              </div>
              <div className="space-y-4">
                {supports.length > 0 ? (
                  supports.map((support) => (
                    <div key={support.id} className="flex items-start justify-between border-b border-purple-900/20 pb-4">
                      <div className="flex-1">
                        <p className="text-white mb-1" style={{ fontSize: '120%' }}>{support.title}</p>
                        <p className="text-gray-400" style={{ fontSize: '120%' }}>{formatDate(support.created_at)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start justify-between border-b border-purple-900/20 pb-4">
                      <div className="flex-1">
                        <p className="text-white mb-1" style={{ fontSize: '120%' }}>카지노 게임 이용 가이드</p>
                        <p className="text-gray-400" style={{ fontSize: '120%' }}>2025-11-18</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* 출금현황 */}
          <Card className="bg-[#1a1f3a] border-purple-500/30 overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <ArrowDownLeft className="w-6 h-6 text-red-400" />
                <h3 className="text-xl font-black text-red-400">출금현황</h3>
              </div>
              <div className="h-[180px] overflow-hidden relative">
                <style>{`
                  @keyframes depositScroll {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(-50%); }
                  }
                  .animate-deposit-scroll {
                    animation: depositScroll 20s linear infinite;
                  }
                  .animate-deposit-scroll:hover {
                    animation-play-state: paused;
                  }
                `}</style>
                <div className="animate-deposit-scroll">
                  {recentWithdrawals.concat(recentWithdrawals).map((withdrawal, index) => (
                    <div key={index} className="flex items-center justify-between border-b border-purple-900/20 pb-4 mb-4">
                      <div className="flex-1">
                        <p className="text-white mb-1" style={{ fontSize: '120%' }}>
                          {withdrawal.users?.nickname || withdrawal.users?.username || '익명'} 님, {formatCurrency(withdrawal.amount)}원 출금
                        </p>
                        <p className="text-gray-400" style={{ fontSize: '120%' }}>{formatDate(withdrawal.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}