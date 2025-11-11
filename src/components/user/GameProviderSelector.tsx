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
    <div className="w-full bg-black/20 rounded-lg p-3">
      {/* 제공사 선택 버튼들 - flex-wrap으로 자동 줄바꿈 */}
      <div className="flex flex-wrap gap-2">
        {/* 전체 선택 버튼 */}
        <Button
          variant="ghost"
          onClick={() => onProviderChange("all")}
          className={`
            h-9 px-4 rounded-md transition-all duration-300
            ${selectedProvider === "all" 
              ? 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400 text-black shadow-[0_0_20px_rgba(251,191,36,0.8),0_0_40px_rgba(251,191,36,0.4)] hover:shadow-[0_0_25px_rgba(251,191,36,1),0_0_50px_rgba(251,191,36,0.6)] scale-105' 
              : 'bg-amber-600/60 text-amber-100 shadow-[0_0_10px_rgba(251,191,36,0.3)] hover:bg-amber-500/70 hover:shadow-[0_0_15px_rgba(251,191,36,0.5)] hover:scale-105'
            }
          `}
        >
          <span className={selectedProvider === "all" ? "drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]" : ""}>
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
                h-9 px-4 rounded-md transition-all duration-300
                ${isSelected 
                  ? 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400 text-black shadow-[0_0_20px_rgba(251,191,36,0.8),0_0_40px_rgba(251,191,36,0.4)] hover:shadow-[0_0_25px_rgba(251,191,36,1),0_0_50px_rgba(251,191,36,0.6)] scale-105' 
                  : 'bg-amber-600/60 text-amber-100 shadow-[0_0_10px_rgba(251,191,36,0.3)] hover:bg-amber-500/70 hover:shadow-[0_0_15px_rgba(251,191,36,0.5)] hover:scale-105'
                }
              `}
            >
              <span className={isSelected ? "drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]" : ""}>
                {provider.name}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}