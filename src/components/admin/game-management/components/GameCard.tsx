import { Button } from "../../../ui/button";
import { Checkbox } from "../../../ui/checkbox";
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
  Star,
  Play,
  AlertTriangle,
} from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { ImageWithFallback } from "@figma/ImageWithFallback";
import { GameCardProps } from "../types";

export function GameCard({
  game,
  isSelected,
  onToggleSelection,
  onToggleFeatured,
  onChangeStatus,
  isBlocked = false,
  userLevel,
}: GameCardProps) {
  const { t } = useLanguage();
  
  const getStatusIcon = () => {
    // Lv3~Lv7: partner_game_access 차단 상태 우선 확인 (블랙리스트 방식)
    if (isBlocked) {
      return <EyeOff className="w-4 h-4 text-slate-400" />;
    }
    
    // Lv1: status 컬럼 기준
    if (userLevel === 1) {
      if (game.status === "maintenance") {
        return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      } else if (game.status === "hidden") {
        return <EyeOff className="w-4 h-4 text-slate-400" />;
      } else {
        return <Eye className="w-4 h-4 text-green-400" />;
      }
    }
    
    // Lv2: is_visible 컬럼 기준
    if (userLevel === 2) {
      return game.is_visible 
        ? <Eye className="w-4 h-4 text-green-400" /> 
        : <EyeOff className="w-4 h-4 text-slate-400" />;
    }
    
    // 기본: is_visible과 status 모두 체크
    if (game.status === "maintenance") {
      return <AlertTriangle className="w-4 h-4 text-orange-400" />;
    } else if (!game.is_visible || game.status === "hidden") {
      return <EyeOff className="w-4 h-4 text-slate-400" />;
    } else {
      return <Eye className="w-4 h-4 text-green-400" />;
    }
  };

  return (
    <div className="group relative">
      {/* 체크박스 - 좌상단 */}
      <div className="absolute top-2 left-2 z-20">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          className="bg-black/80 border-slate-500 h-5 w-5"
        />
      </div>

      {/* Featured 별 - 우상단 */}
      {game.is_featured && (
        <div className="absolute top-2 right-2 z-20">
          <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-lg" />
        </div>
      )}

      <div className="relative aspect-square overflow-hidden rounded-2xl transition-all duration-500" style={{
        background: '#16161f',
        boxShadow: isSelected 
          ? '0 0 0 2px rgba(59, 130, 246, 0.8), 0 8px 32px rgba(0,0,0,0.4)' 
          : '0 8px 32px rgba(0,0,0,0.4)'
      }}>
        {/* 게임 이미지 */}
        {game.image_url ? (
          <ImageWithFallback
            src={game.image_url}
            alt={game.name}
            className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent opacity-70 group-hover:opacity-80 transition-opacity duration-500"></div>
        
        {/* 게임명 - 하단 고정 */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/50">
          <p className="text-white text-center line-clamp-2" style={{
            fontSize: '0.875rem',
            fontWeight: '700',
            textShadow: '0 2px 8px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.9)',
            letterSpacing: '-0.01em',
            lineHeight: '1.3'
          }}>
            {game.name_ko || game.name}
          </p>
          
          {/* RTP 표시 */}
          {game.rtp && (
            <p className="text-white/60 text-center mt-1" style={{
              fontSize: '0.625rem',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)'
            }}>
              RTP {game.rtp}%
            </p>
          )}
        </div>
        
        {/* 호버 시 로즈 골드 테두리 */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
          boxShadow: 'inset 0 0 0 2px rgba(193, 154, 107, 0.5)'
        }}></div>
        
        {/* 호버 시 관리 버튼 */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500">
          <div className="flex flex-col items-center gap-3">
            {/* Play 아이콘 */}
            <div className="w-16 h-16 rounded-full backdrop-blur-xl flex items-center justify-center transition-all duration-500" style={{
              background: 'rgba(193, 154, 107, 0.15)',
              boxShadow: '0 0 30px rgba(193, 154, 107, 0.3), inset 0 0 20px rgba(255,255,255,0.1)',
              border: '2px solid rgba(193, 154, 107, 0.4)'
            }}>
              <Play className="w-8 h-8" style={{ color: '#E6C9A8', fill: '#E6C9A8' }} />
            </div>
            
            {/* 버튼들 */}
            <div className="flex items-center gap-2">
              {/* Featured 버튼 */}
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFeatured();
                }}
                className={`h-7 px-3 border-0 text-white text-xs transition-all ${
                  game.is_featured
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-slate-700 hover:bg-slate-600"
                }`}
                title={game.is_featured ? t.gameManagement.removeFeatured : t.gameManagement.setFeatured}
              >
                <Star className={`w-3 h-3 ${game.is_featured ? "fill-white" : ""}`} />
              </Button>
              
              {/* 상태 변경 Select */}
              <Select
                value={
                  isBlocked 
                    ? "hidden" 
                    : userLevel === 2 
                      ? (game.is_visible ? "visible" : "hidden")
                      : game.status
                }
                onValueChange={(value: "visible" | "maintenance" | "hidden") => {
                  onChangeStatus(value);
                }}
              >
                <SelectTrigger 
                  className="h-7 w-24 text-xs bg-slate-800/90 border-slate-600 text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visible">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Eye className="w-3 h-3" />
                      {t.gameManagement.visible}
                    </div>
                  </SelectItem>
                  {/* Lv1만 점검중 옵션 사용 가능 */}
                  {userLevel === 1 && (
                    <SelectItem value="maintenance">
                      <div className="flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="w-3 h-3" />
                        {t.gameManagement.maintenance}
                      </div>
                    </SelectItem>
                  )}
                  <SelectItem value="hidden">
                    <div className="flex items-center gap-1.5 text-xs">
                      <EyeOff className="w-3 h-3" />
                      {t.gameManagement.hidden}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* 상태 아이콘 */}
            <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded">
              {getStatusIcon()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
