import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle } from "lucide-react";

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

  useEffect(() => {
    // 게임 타입에 맞는 제공사만 필터링
    const filteredProviders = providers.filter(p => 
      p.type === gameType && (p.status === 'visible' || p.status === 'active')
    );
    
    console.log('🎮 GameProviderSelector - 필터링된 제공사:', filteredProviders.length, '개');
    
    setDisplayProviders(filteredProviders);
  }, [providers, gameType]);

  return (
    <div className="w-full bg-slate-900/40 backdrop-blur-sm rounded-xl p-6 border border-slate-700/30">
      {/* 제공사 선택 버튼들 - flex-wrap으로 자동 줄바꿈 */}
      <div className="flex flex-wrap gap-3">
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
            전체
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
    </div>
  );
}