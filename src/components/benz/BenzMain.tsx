import { useState, useEffect } from "react";
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
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner@2.0.3";

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

export function BenzMain({ user, onRouteChange }: BenzMainProps) {
  const [casinoProviders, setCasinoProviders] = useState<GameProvider[]>([]);
  const [slotProviders, setSlotProviders] = useState<GameProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoginMessage, setShowLoginMessage] = useState(false);

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
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setCasinoProviders(FALLBACK_CASINO_PROVIDERS);
      setSlotProviders(FALLBACK_SLOT_PROVIDERS);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
    } finally {
      setLoading(false);
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
              src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benzicon/Banner-Text.png"
              alt="LIVE CASINO"
              className="w-full h-auto object-contain"
              style={{ maxWidth: '600px' }}
            />
            
            {/* 이미지 내 버튼 위치에 클릭 영역 */}
            <button
              onClick={() => {
                if (!user) {
                  setShowLoginMessage(true);
                  setTimeout(() => setShowLoginMessage(false), 3000);
                  return;
                }
                onRouteChange('/benz/casino');
              }}
              className="absolute cursor-pointer transition-transform hover:scale-105"
              style={{
                left: '10%',
                bottom: '18%',
                width: '35%',
                height: '15%',
                background: 'transparent'
              }}
              aria-label="Play Now"
            />
          </div>
        </div>
      </section>

      {/* 간격 */}
      <div className="h-[40px] md:h-[80px]" style={{ backgroundColor: '#141414' }}></div>

      {/* 2단 배경 이미지 - Casino List */}
      <section 
        className="relative w-[1700]] bg-cover bg-center bg-no-repeat py-8 md:py-16 min-h-[200px] md:min-h-[400px]"
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
          className="absolute z-20 w-[200px] md:w-auto"
          style={{ top: '-35px', left: '20px' }}
        />
        
        <div className="relative z-10 px-4 md:px-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 w-full">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="aspect-square bg-gray-800/50 animate-pulse rounded-2xl"></div>
              ))
            ) : (
              casinoProviders.map((provider, index) => (
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
                  className="cursor-pointer group"
                  onClick={() => handleProviderClick(provider, 'casino')}
                >
                  <div 
                    className="relative aspect-square rounded-2xl overflow-hidden"
                    style={{
                      border: '2px solid rgba(193, 154, 107, 0.5)',
                    }}
                  >
                    {provider.logo_url && (
                      <img
                        src={provider.logo_url}
                        alt={provider.name}
                        className="w-full object-cover"
                        style={{
                          height: '105%',
                          marginTop: '-2.5%'
                        }}
                      />
                    )}
                  </div>
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
        className="relative w-[1700]] bg-cover bg-center bg-no-repeat py-8 md:py-16 min-h-[200px] md:min-h-[400px]"
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
          className="absolute z-20 w-[200px] md:w-auto"
          style={{ top: '-40px', left: '20px' }}
        />
        
        <div className="relative z-10 px-4 md:px-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 w-full">
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
                  className="cursor-pointer group"
                  onClick={() => handleProviderClick(provider, 'slot')}
                >
                  <div 
                    className="relative aspect-square rounded-2xl overflow-hidden"
                    style={{
                      border: '2px solid rgba(193, 154, 107, 0.5)',
                    }}
                  >
                    {provider.logo_url && (
                      <img
                        src={provider.logo_url}
                        alt={provider.name}
                        className="w-full object-cover"
                        style={{
                          height: '105%',
                          marginTop: '-2.5%'
                        }}
                      />
                    )}
                  </div>
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