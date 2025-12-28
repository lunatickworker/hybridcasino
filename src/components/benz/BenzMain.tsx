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
    { id: 1, name: 'Evolution', name_ko: '에볼루션', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/16.png', status: 'visible' },
    { id: 2, name: 'Pragmatic Play Live', name_ko: '프라그마틱 라이브', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/17.png', status: 'visible' },
    { id: 3, name: 'Microgaming', name_ko: '마이크로 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/19.png', status: 'visible' },
    { id: 4, name: 'Asia Gaming', name_ko: '아시아 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/20.png', status: 'visible' },
    { id: 5, name: 'SA Gaming', name_ko: 'SA 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/21.png', status: 'visible' },
    { id: 6, name: 'Ezugi', name_ko: '이주기', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/18.png', status: 'visible' },
    { id: 7, name: 'Dream Gaming', name_ko: '드림 게이밍', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/18.png', status: 'visible' },
    { id: 8, name: 'Play Ace', name_ko: '플레이 에이스', type: 'casino', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/16.png', status: 'visible' },
  ];

  const FALLBACK_SLOT_PROVIDERS = [
    { id: 101, name: 'Pragmatic Play', name_ko: '프라그마틱 플레이', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s1.png', status: 'visible' },
    { id: 102, name: 'PG Soft', name_ko: 'PG 소프트', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s2.png', status: 'visible' },
    { id: 103, name: 'Habanero', name_ko: '하바네로', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s10.png', status: 'visible' },
    { id: 104, name: 'Booongo', name_ko: '부운고', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s11.png', status: 'visible' },
    { id: 105, name: 'CQ9', name_ko: 'CQ9', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s12.png', status: 'visible' },
    { id: 106, name: 'Evoplay', name_ko: '에보플레이', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s13.png', status: 'visible' },
    { id: 107, name: 'Nolimit City', name_ko: '노리밋시티', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s1.png', status: 'visible' },
    { id: 108, name: 'Jingzibao', name_ko: '진지바오시', type: 'slot', logo_url: 'https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/user1/s2.png', status: 'visible' },
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
        className="relative w-[1700]] min-h-[500px] bg-cover bg-center bg-no-repeat py-16"
        style={{
          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/photo_2025-12-28_09-50-58.jpg)',
          backgroundPosition: 'center center'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60"></div>
        <div className="relative z-10 flex items-center justify-center h-full px-8">
          <div className="text-center space-y-6 max-w-4xl">
            {/* 메인 타이틀 - 세련된 로즈 골드 그라디언트 */}
            <h1 className="text-7xl md:text-8xl font-black tracking-[0.15em] mb-2" style={{
              fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
            }}>
              <span className="inline-block" style={{
                backgroundImage: 'linear-gradient(135deg, #E6C9A8 0%, #D4AF87 35%, #C19A6B 70%, #A67C52 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 2px 8px rgba(212, 175, 135, 0.4))'
              }}>
                BENZ CASINO
              </span>
            </h1>
            
            {/* 서브 타이틀 - 부드러운 아이보리 */}
            <p className="text-xl md:text-2xl tracking-[0.2em] mb-8" style={{
              color: '#E8DCC8',
              fontWeight: '400',
              textShadow: '0 2px 8px rgba(212, 175, 135, 0.2)',
              letterSpacing: '0.25em'
            }}>
              프리미엄 카지노 경험을 지금 시작하세요
            </p>
            
            {/* CTA 버튼 - 우아한 로즈 골드 */}
            <div className="pt-4">
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
                className="relative text-white px-16 py-7 text-lg font-bold transition-all duration-300 overflow-hidden group hover:scale-105 hover:shadow-2xl"
                style={{
                  background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 50%, #8B6F47 100%)',
                  border: '1px solid rgba(230, 201, 168, 0.3)',
                  borderRadius: '50px',
                  boxShadow: '0 8px 32px rgba(193, 154, 107, 0.3), 0 0 20px rgba(166, 124, 82, 0.2)'
                }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                  background: 'linear-gradient(135deg, #D4AF87 0%, #C19A6B 50%, #A67C52 100%)'
                }}></div>
                
                <div className="relative flex items-center gap-3">
                  <Play className="w-5 h-5" />
                  <span className="tracking-[0.15em]">게임 시작하기</span>
                </div>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 카지노 경계선 */}
      <div className="relative w-[1150px] h-[70px] flex justify-end" style={{ backgroundColor: '#141414' }}>
        <img
          src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/casino%20border.png"
          alt="Casino Border"
          className="ml-auto h-full"
          //className="w-full h-full object-fill"
        />
      </div>

      {/* 2단 배경 이미지 - Casino List */}
      <section 
        className="relative w-[1700]] min-h-[500px] bg-cover bg-center bg-no-repeat py-16"
        style={{
          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/photo_2025-12-28_09-51-03.jpg)',
          backgroundPosition: 'center center'
        }}
      >
        <div className="absolute inset-0 bg-black/70"></div>
        
        <div className="relative z-10 px-8 md:px-16">
          <div className="grid grid-cols-4 gap-8 max-w-[1400px] mx-auto">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="aspect-[4/5] bg-gray-800/50 animate-pulse rounded-2xl"></div>
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
                  className="cursor-pointer group perspective-1000"
                  onClick={() => handleProviderClick(provider, 'casino')}
                >
                  <div 
                    className="relative aspect-[4/5] rounded-2xl overflow-hidden transition-all duration-500"
                    style={{
                      background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.95) 0%, rgba(20, 20, 35, 0.98) 100%)',
                      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(193, 154, 107, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                      transform: 'translateZ(0)',
                    }}
                  >
                    {/* 골드 테두리 애니메이션 */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                      style={{
                        background: 'linear-gradient(135deg, transparent, rgba(193, 154, 107, 0.3), transparent)',
                        animation: 'shimmer 2s infinite'
                      }}
                    ></div>

                    {/* 상단 글로우 */}
                    <div 
                      className="absolute top-0 left-0 right-0 h-1 opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                      style={{
                        background: 'linear-gradient(90deg, transparent, #C19A6B, transparent)'
                      }}
                    ></div>

                    {/* 로고 영역 */}
                    <div className="relative h-[65%] flex items-center justify-center p-8">
                      <div className="relative w-full h-full flex items-center justify-center">
                        {/* 배경 글로우 */}
                        <div 
                          className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-500 blur-xl"
                          style={{
                            background: 'radial-gradient(circle, rgba(193, 154, 107, 0.4) 0%, transparent 70%)'
                          }}
                        ></div>
                        
                        {provider.logo_url ? (
                          <ImageWithFallback
                            src={provider.logo_url}
                            alt={provider.name}
                            className="relative w-full h-full object-contain transition-all duration-500 group-hover:scale-110 group-hover:brightness-125 group-hover:drop-shadow-2xl"
                            style={{
                              filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5))'
                            }}
                          />
                        ) : (
                          <div className="text-white text-center">
                            <div className="text-lg font-bold">{provider.name_ko || provider.name}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 하단 명칭 영역 */}
                    <div 
                      className="absolute bottom-0 left-0 right-0 h-[35%] flex items-center justify-center px-6 py-4"
                      style={{
                        background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 40%, rgba(0, 0, 0, 0.8) 100%)',
                        borderTop: '1px solid rgba(193, 154, 107, 0.15)'
                      }}
                    >
                      <div className="text-center space-y-2">
                        <p 
                          className="font-black text-2xl tracking-wide transition-all duration-300 group-hover:scale-110"
                          style={{
                            color: '#E6C9A8',
                            textShadow: '0 2px 8px rgba(193, 154, 107, 0.6), 0 0 20px rgba(193, 154, 107, 0.3)',
                            fontSize: '1.75rem',
                            lineHeight: '1.2'
                          }}
                        >
                          {provider.name_ko || provider.name}
                        </p>
                        
                        {/* PLAY 버튼 */}
                        <div 
                          className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0"
                        >
                          <div 
                            className="inline-flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold"
                            style={{
                              background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                              boxShadow: '0 4px 15px rgba(193, 154, 107, 0.4)',
                              color: '#fff'
                            }}
                          >
                            <Play className="w-3 h-3" />
                            <span>PLAY NOW</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 코너 장식 */}
                    <div className="absolute top-0 left-0 w-12 h-12 opacity-40 group-hover:opacity-70 transition-opacity duration-500">
                      <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: 'linear-gradient(90deg, #C19A6B, transparent)' }}></div>
                      <div className="absolute top-0 left-0 h-full w-[2px]" style={{ background: 'linear-gradient(180deg, #C19A6B, transparent)' }}></div>
                    </div>
                    <div className="absolute bottom-0 right-0 w-12 h-12 opacity-40 group-hover:opacity-70 transition-opacity duration-500">
                      <div className="absolute bottom-0 right-0 w-full h-[2px]" style={{ background: 'linear-gradient(270deg, #C19A6B, transparent)' }}></div>
                      <div className="absolute bottom-0 right-0 h-full w-[2px]" style={{ background: 'linear-gradient(0deg, #C19A6B, transparent)' }}></div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 슬롯 경계선 */}
      <div className="relative w-[1157px] h-[70px] flex justify-end" style={{ backgroundColor: '#141414' }}>
        <img
          src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/slot%20boder.png"
          alt="Slot Border"
          className="ml-auto h-full"
        />
      </div>

      {/* 3단 배경 이미지 - Slot List */}
      <section 
        className="relative w-[1700]] min-h-[600px] bg-cover bg-center bg-no-repeat py-16"
        style={{
          backgroundImage: 'url(https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/benz/photo_2025-12-28_09-50-48.jpg)',
          backgroundPosition: 'center center'
        }}
      >
        <div className="absolute inset-0 bg-black/70"></div>
        
        <div className="relative z-10 px-8 md:px-16">
          <div className="grid grid-cols-4 gap-8 max-w-[1400px] mx-auto">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="aspect-[4/5] bg-gray-800/50 animate-pulse rounded-2xl"></div>
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
                  className="cursor-pointer group perspective-1000"
                  onClick={() => handleProviderClick(provider, 'slot')}
                >
                  <div 
                    className="relative aspect-[4/5] rounded-2xl overflow-hidden transition-all duration-500"
                    style={{
                      background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.95) 0%, rgba(20, 20, 35, 0.98) 100%)',
                      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(193, 154, 107, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                      transform: 'translateZ(0)',
                    }}
                  >
                    {/* 골드 테두리 애니메이션 */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                      style={{
                        background: 'linear-gradient(135deg, transparent, rgba(193, 154, 107, 0.3), transparent)',
                        animation: 'shimmer 2s infinite'
                      }}
                    ></div>

                    {/* 상단 글로우 */}
                    <div 
                      className="absolute top-0 left-0 right-0 h-1 opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                      style={{
                        background: 'linear-gradient(90deg, transparent, #C19A6B, transparent)'
                      }}
                    ></div>

                    {/* 로고 영역 */}
                    <div className="relative h-[65%] flex items-center justify-center p-8">
                      <div className="relative w-full h-full flex items-center justify-center">
                        {/* 배경 글로우 */}
                        <div 
                          className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-500 blur-xl"
                          style={{
                            background: 'radial-gradient(circle, rgba(193, 154, 107, 0.4) 0%, transparent 70%)'
                          }}
                        ></div>
                        
                        {provider.logo_url ? (
                          <ImageWithFallback
                            src={provider.logo_url}
                            alt={provider.name}
                            className="relative w-full h-full object-contain transition-all duration-500 group-hover:scale-110 group-hover:brightness-125 group-hover:drop-shadow-2xl"
                            style={{
                              filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5))'
                            }}
                          />
                        ) : (
                          <div className="text-white text-center">
                            <div className="text-lg font-bold">{provider.name_ko || provider.name}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 하단 명칭 영역 */}
                    <div 
                      className="absolute bottom-0 left-0 right-0 h-[35%] flex items-center justify-center px-6 py-4"
                      style={{
                        background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 40%, rgba(0, 0, 0, 0.8) 100%)',
                        borderTop: '1px solid rgba(193, 154, 107, 0.15)'
                      }}
                    >
                      <div className="text-center space-y-2">
                        <p 
                          className="font-black text-2xl tracking-wide transition-all duration-300 group-hover:scale-110"
                          style={{
                            color: '#E6C9A8',
                            textShadow: '0 2px 8px rgba(193, 154, 107, 0.6), 0 0 20px rgba(193, 154, 107, 0.3)',
                            fontSize: '1.75rem',
                            lineHeight: '1.2'
                          }}
                        >
                          {provider.name_ko || provider.name}
                        </p>
                        
                        {/* PLAY 버튼 */}
                        <div 
                          className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0"
                        >
                          <div 
                            className="inline-flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold"
                            style={{
                              background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                              boxShadow: '0 4px 15px rgba(193, 154, 107, 0.4)',
                              color: '#fff'
                            }}
                          >
                            <Play className="w-3 h-3" />
                            <span>PLAY NOW</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 코너 장식 */}
                    <div className="absolute top-0 left-0 w-12 h-12 opacity-40 group-hover:opacity-70 transition-opacity duration-500">
                      <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: 'linear-gradient(90deg, #C19A6B, transparent)' }}></div>
                      <div className="absolute top-0 left-0 h-full w-[2px]" style={{ background: 'linear-gradient(180deg, #C19A6B, transparent)' }}></div>
                    </div>
                    <div className="absolute bottom-0 right-0 w-12 h-12 opacity-40 group-hover:opacity-70 transition-opacity duration-500">
                      <div className="absolute bottom-0 right-0 w-full h-[2px]" style={{ background: 'linear-gradient(270deg, #C19A6B, transparent)' }}></div>
                      <div className="absolute bottom-0 right-0 h-full w-[2px]" style={{ background: 'linear-gradient(0deg, #C19A6B, transparent)' }}></div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}