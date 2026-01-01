// 게임 리스트 관리 타입 정의

export interface RawProvider {
  id: number;
  name: string;
  name_ko?: string;
  vendor_code?: string;
  type: 'slot' | 'casino' | 'minigame';
  api_type: string;
  status: 'visible' | 'maintenance' | 'hidden';
  logo_url?: string;
  order_index: number;
  source_table: 'game_providers' | 'honor_game_providers';
}

export interface MergedProvider {
  mergedKey: string;
  name: string;
  name_ko?: string;
  vendor_code?: string;
  logo_url?: string;
  
  sources: Array<{
    id: number;
    api_type: string;
    table: 'game_providers' | 'honor_game_providers';
    status: 'visible' | 'maintenance' | 'hidden';
    order_index: number;
    is_blocked: boolean;
  }>;
  
  combinedStatus: 'visible' | 'maintenance' | 'hidden';
  game_count: number;
  visible_game_count: number;
  maintenance_game_count: number;
  hidden_game_count: number;
  priority: number;
}

export interface Game {
  id: number;
  name: string;
  provider_id: number;
  type: 'slot' | 'casino' | 'minigame';
  api_type: string;
  status: 'visible' | 'maintenance' | 'hidden';
  vendor_code?: string;
  game_code?: string;
  image_url?: string;
  is_blocked: boolean;
  priority: number;
  source_table: 'games' | 'honor_games';
}

export interface StoreOrUser {
  id: string;
  username: string;
  nickname?: string;
  level: number;
  partner_type: string;
}
