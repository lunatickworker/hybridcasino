import { useMemo } from "react";
import { Button } from "../../../ui/button";
import { Badge } from "../../../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui/select";
import {
  Eye,
  EyeOff,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Building2,
} from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { ProviderSectionProps } from "../types";
import { GameCard } from "./GameCard";

interface ExtendedProviderSectionProps extends ProviderSectionProps {
  searchTerm?: string;
}

export function ProviderSection({
  provider,
  games,
  isExpanded,
  onToggleExpand,
  onToggleProviderStatus,
  selectedGameIds,
  onToggleGameSelection,
  onToggleGameFeatured,
  onChangeGameStatus,
  userLevel,
  isBlocked = false,
  blockedGameIds = new Set(),
  searchTerm = "",
}: ExtendedProviderSectionProps) {
  const { t } = useLanguage();

  // ✅ 검색 필터링만 (게임타입 필터링은 GamesTab에서 제공사 레벨에서 처리)
  const filteredGames = useMemo(() => {
    let filtered = games;

    // 검색 필터
    if (searchTerm.trim()) {
      const searchNormalized = searchTerm.replace(/\s/g, '').toLowerCase();
      filtered = filtered.filter(game => {
        const nameNormalized = game.name.replace(/\s/g, '').toLowerCase();
        const nameKoNormalized = (game.name_ko || '').replace(/\s/g, '').toLowerCase();
        return nameNormalized.includes(searchNormalized) || nameKoNormalized.includes(searchNormalized);
      });
    }

    return filtered;
  }, [games, searchTerm]);

  const stats = useMemo(() => {
    return {
      total: games.length,
      visible: games.filter(g => g.status === "visible").length,
      maintenance: games.filter(g => g.status === "maintenance").length,
      hidden: games.filter(g => g.status === "hidden").length,
    };
  }, [games]);

  const getProviderStatusIcon = () => {
    // Lv1: provider.status 기반 아이콘 표시
    if (userLevel === 1) {
      const status = provider.status || "visible";
      if (status === "visible") {
        return <Eye className="w-4 h-4 text-green-400" />;
      } else if (status === "maintenance") {
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      } else {
        return <EyeOff className="w-4 h-4 text-slate-400" />;
      }
    }
    
    // Lv2: provider.is_visible 기반 아이콘 표시
    if (userLevel === 2) {
      return provider.is_visible 
        ? <Eye className="w-4 h-4 text-green-400" /> 
        : <EyeOff className="w-4 h-4 text-slate-400" />;
    }
    
    // Lv3~Lv7: partner_game_access 차단 상태 확인 (블랙리스트 방식)
    if (isBlocked) {
      return <EyeOff className="w-4 h-4 text-slate-400" />;
    } else {
      return <Eye className="w-4 h-4 text-green-400" />;
    }
  };

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/30">
      {/* 제공사 헤더 */}
      <div className="p-4 bg-slate-800/50 flex items-center justify-between hover:bg-slate-800/70 transition-colors">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            className="p-1 h-auto hover:bg-slate-700"
          >
            {isExpanded ? (
              <ChevronDown className="w-6 h-6 text-white" />
            ) : (
              <ChevronRight className="w-6 h-6 text-white" />
            )}
          </Button>

          <Building2 className="w-6 h-6 text-slate-300" />
          
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{provider.name_ko || provider.name}</span>
            {getProviderStatusIcon()}
            <Badge variant="outline" className="text-sm font-semibold border-slate-600">
              {provider.api_type.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-base font-medium flex items-center gap-2">
            <span className="text-white">총 <span className="font-bold">{stats.total}</span>개 게임</span>
            <span className="text-slate-500">·</span>
            <span className="text-green-400">노출 <span className="font-bold">{stats.visible}</span>개</span>
            <span className="text-slate-500">·</span>
            <span className="text-yellow-400">점검 <span className="font-bold">{stats.maintenance}</span>개</span>
            <span className="text-slate-500">·</span>
            <span className="text-red-500">숨김 <span className="font-bold">{stats.hidden}</span>개</span>
          </div>
          
          <Select
            value={
              isBlocked 
                ? "hidden" 
                : userLevel === 2 
                  ? (provider.is_visible ? "visible" : "hidden")
                  : (provider.status || "visible")
            }
            onValueChange={(value: "visible" | "maintenance" | "hidden") =>
              onToggleProviderStatus(value, provider.api_type)
            }
          >
            <SelectTrigger className="h-9 w-32 text-sm font-semibold bg-slate-900 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visible">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Eye className="w-4 h-4" />
                  {t.gameManagement.visible}
                </div>
              </SelectItem>
              {/* Lv1만 점검중 옵션 사용 가능 */}
              {userLevel === 1 && (
                <SelectItem value="maintenance">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    {t.gameManagement.maintenance}
                  </div>
                </SelectItem>
              )}
              <SelectItem value="hidden">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <EyeOff className="w-4 h-4" />
                  {t.gameManagement.hidden}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 게임 그리드 */}
      {isExpanded && (
        <div className="p-4">
          {filteredGames.length === 0 ? (
            <div className="text-center py-8 text-base font-medium text-slate-300">
              {searchTerm || selectedGameType !== "all" ? "해당하는 게임이 없습니다." : "게임이 없습니다."}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              {filteredGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isSelected={selectedGameIds.has(game.id)}
                  onToggleSelection={() => onToggleGameSelection(game.id)}
                  onToggleFeatured={() => onToggleGameFeatured(game.id)}
                  onChangeStatus={(status) => onChangeGameStatus(game.id, status, game.api_type)}
                  isBlocked={blockedGameIds.has(game.id)}
                  userLevel={userLevel}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
