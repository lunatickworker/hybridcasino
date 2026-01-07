import { Gamepad2 } from "lucide-react";
import { ApiMetadata, ApiType, GameType, GameTypeMetadata } from "./types";

// API 메타데이터
export const API_METADATA: Record<ApiType, ApiMetadata> = {
  invest: { label: "Invest API", color: "from-purple-600 to-pink-600" },
  oroplay: { label: "OroPlay API", color: "from-green-600 to-teal-600" },
  familyapi: { label: "Family API", color: "from-blue-600 to-cyan-600" },
  honorapi: { label: "Honor API", color: "from-red-600 to-rose-600" },
};

// 모든 게임 타입 메타데이터
export const ALL_GAME_TYPES: GameTypeMetadata[] = [
  { value: "casino", label: "카지노", icon: Gamepad2 },
  { value: "slot", label: "슬롯", icon: Gamepad2 },
  { value: "minigame", label: "미니게임", icon: Gamepad2 },
];

// API별 사용 가능한 게임 타입을 반환하는 함수
export const getAvailableGameTypes = (api: ApiType | null): GameTypeMetadata[] => {
  // Invest API와 FamilyAPI는 미니게임 제외 (OroPlay와 HonorAPI만 미니게임 지원)
  if (api === "invest" || api === "familyapi") {
    return ALL_GAME_TYPES.filter(type => type.value !== "minigame");
  }
  
  return ALL_GAME_TYPES;
};

// Debounce 지연 시간 (ms)
export const DEBOUNCE_DELAY = 300;

// 초기 게임 타입
export const DEFAULT_GAME_TYPE: GameType = "casino";
