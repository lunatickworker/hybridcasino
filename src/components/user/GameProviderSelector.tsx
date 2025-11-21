import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

interface GameProvider {
  id: number;
  name: string;
  logo_url?: string;
  status: 'active' | 'inactive' | 'maintenance';
  type: string;
  game_count?: number;
}

interface GameProviderSelectorProps {
  selectedProvider: string;
  onProviderChange: (providerId: string) => void;
  gameType: 'slot' | 'casino' | 'minigame';
  providers?: GameProvider[];
}

export function GameProviderSelector({ 
  selectedProvider, 
  onProviderChange, 
  gameType, 
  providers = [] 
}: GameProviderSelectorProps) {
  const [displayProviders, setDisplayProviders] = useState<GameProvider[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    // 게임 타입에 맞는 제공사만 필터링
    const filteredProviders = providers.filter(p => 
      p.type === gameType && (p.status === 'visible' || p.status === 'active')
    );
    
    console.log('🎮 GameProviderSelector - 필터링된 제공사:', filteredProviders.length, '개');
    
    setDisplayProviders(filteredProviders);
  }, [providers, gameType]);

  useEffect(() => {
    // 모바일 감지
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 모바일에서 표시할 제공사 수 제한
  const visibleProviders = isMobile && !showAll 
    ? displayProviders.slice(0, 9) 
    : displayProviders;

  return (
    <div className="w-full bg-slate-900/40 backdrop-blur-sm rounded-xl p-4 md:p-6 border border-slate-700/30">
      {/* 데스크톱 레이아웃 */}
      <div className="hidden md:flex flex-wrap gap-3">
        {/* 전체 선택 버튼 */}
        <Button
          variant="ghost"
          onClick={() => onProviderChange("all")}
          className={`
            h-14 px-8 rounded-lg transition-all duration-300 text-xl font-bold whitespace-nowrap
            ${selectedProvider === "all" 
              ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black shadow-lg shadow-yellow-500/50 hover:shadow-xl hover:shadow-yellow-500/60 scale-105 border-2 border-yellow-400' 
              : 'bg-slate-800/60 text-yellow-100/80 border border-slate-600/50 hover:bg-slate-700/70 hover:text-yellow-100 hover:border-yellow-500/30 hover:scale-105'
            }
          `}
        >
          <span className={selectedProvider === "all" ? "drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" : ""}>
            {t.user.all}
          </span>
        </Button>

        {/* 개별 제공사 버튼들 */}
        {displayProviders.map((provider) => {
          const isSelected = selectedProvider === provider.id.toString();
          
          return (
            <Button
              key={provider.id}
              variant="ghost"
              onClick={() => onProviderChange(provider.id.toString())}
              className={`
                h-14 px-8 rounded-lg transition-all duration-300 text-xl font-bold whitespace-nowrap
                ${isSelected 
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black shadow-lg shadow-yellow-500/50 hover:shadow-xl hover:shadow-yellow-500/60 scale-105 border-2 border-yellow-400' 
                  : 'bg-slate-800/60 text-yellow-100/80 border border-slate-600/50 hover:bg-slate-700/70 hover:text-yellow-100 hover:border-yellow-500/30 hover:scale-105'
                }
              `}
            >
              <span className={isSelected ? "drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" : ""}>
                {provider.name}
              </span>
            </Button>
          );
        })}
      </div>

      {/* 모바일 레이아웃 - 3열 그리드 */}
      <div className="md:hidden">
        <div className="grid grid-cols-3 gap-2">
          {/* 전체 선택 버튼 */}
          <Button
            variant="ghost"
            onClick={() => onProviderChange("all")}
            className={`
              h-auto py-3 px-2 rounded-lg transition-all duration-200 font-bold text-sm
              ${selectedProvider === "all" 
                ? 'bg-gradient-to-r from-yellow-500 to-amber-600 text-black shadow-md border-2 border-yellow-400' 
                : 'bg-slate-800/80 text-yellow-100 border border-slate-600/50 active:bg-slate-700'
              }
            `}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-base leading-tight">{t.user.all}</span>
              {selectedProvider === "all" && (
                <CheckCircle className="w-3 h-3" />
              )}
            </div>
          </Button>

          {/* 개별 제공사 버튼들 */}
          {visibleProviders.map((provider) => {
            const isSelected = selectedProvider === provider.id.toString();
            
            return (
              <Button
                key={provider.id}
                variant="ghost"
                onClick={() => onProviderChange(provider.id.toString())}
                className={`
                  h-auto py-3 px-2 rounded-lg transition-all duration-200 font-bold text-sm
                  ${isSelected 
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-600 text-black shadow-md border-2 border-yellow-400' 
                    : 'bg-slate-800/80 text-yellow-100 border border-slate-600/50 active:bg-slate-700'
                  }
                `}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs leading-tight text-center line-clamp-2">
                    {provider.name}
                  </span>
                  {isSelected && (
                    <CheckCircle className="w-3 h-3" />
                  )}
                </div>
              </Button>
            );
          })}
        </div>

        {/* 더보기/접기 버튼 (모바일에서 10개 이상일 때만) */}
        {isMobile && displayProviders.length > 9 && (
          <Button
            variant="ghost"
            onClick={() => setShowAll(!showAll)}
            className="w-full mt-3 h-10 bg-slate-800/60 text-yellow-300 border border-slate-600/50 hover:bg-slate-700/70 hover:text-yellow-100 text-sm"
          >
            {showAll ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                {t.user.collapse}
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                {t.user.showMore} ({displayProviders.length - 9}{t.user.moreItems})
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}