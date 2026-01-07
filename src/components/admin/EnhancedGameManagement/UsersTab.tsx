import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "../../ui/card";
import { ScrollArea } from "../../ui/scroll-area";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { User as UserIcon, Search, RefreshCw, ChevronDown, ChevronRight, Ban, Check, Wrench, X } from "lucide-react";
import { Partner, User } from "../../../types";
import { gameApi, GameProvider, Game } from "../../../lib/gameApi";
import { toast } from "sonner@2.0.3";
import { useDebounce } from "../game-management/hooks/useDebounce";
import { supabase } from "../../../lib/supabase";
import type { ApiType, GameType } from "../game-management/types";
import { API_METADATA, getAvailableGameTypes, DEFAULT_GAME_TYPE, DEBOUNCE_DELAY } from "../game-management/constants";

interface UsersTabProps {
  user: Partner;
}

export function UsersTab({ user }: UsersTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [allGames, setAllGames] = useState<Game[]>([]);
  
  const [selectedApi, setSelectedApi] = useState<ApiType | null>(null);
  const [selectedGameType, setSelectedGameType] = useState<GameType>(DEFAULT_GAME_TYPE);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<number>>(new Set());

  const [userBlockedProviders, setUserBlockedProviders] = useState<Set<number>>(new Set());
  const [userBlockedGames, setUserBlockedGames] = useState<Set<number>>(new Set());
  const [userMaintenanceProviders, setUserMaintenanceProviders] = useState<Set<number>>(new Set());
  const [userMaintenanceGames, setUserMaintenanceGames] = useState<Set<number>>(new Set());
  
  // 🆕 매장 레벨 차단 데이터 추가
  const [storeBlockedProviders, setStoreBlockedProviders] = useState<Set<number>>(new Set());
  const [storeBlockedGames, setStoreBlockedGames] = useState<Set<number>>(new Set());
  
  const [loadingBlockedData, setLoadingBlockedData] = useState(false);

  const debouncedUserSearchTerm = useDebounce(userSearchTerm, DEBOUNCE_DELAY);
  const debouncedSearchTerm = useDebounce(searchTerm, DEBOUNCE_DELAY);

  useEffect(() => {
    loadUsers();
    loadProvidersAndGames();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      loadUserBlockedData();
      if (allGames.length > 0 && selectedApi) {
        const apiGames = allGames.filter(g => g.api_type === selectedApi);
        setGames(apiGames);
      }
    }
  }, [selectedUser]);

  useEffect(() => {
    if (selectedApi && allGames.length > 0) {
      const apiGames = allGames.filter(g => g.api_type === selectedApi);
      setGames(apiGames);
    }
  }, [selectedApi, allGames]);

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      
      console.log('🔍 [UsersTab] 사용자 조회 시작');
      console.log('  - user.id:', user.id);
      console.log('  - user.username:', user.username);
      console.log('  - user.level:', user.level);
      
      // ✅ 조직격리: 재귀적으로 하위 조직의 모든 사용자 조회
      const getAllDescendantUsers = async (partnerId: string): Promise<User[]> => {
        // 1. 현재 파트너의 직속 사용자 조회
        const { data: directUsers } = await supabase
          .from('users')
          .select('*')
          .eq('referrer_id', partnerId)
          .order('created_at', { ascending: false });

        // 2. 현재 파트너의 하위 파트너 조회
        const { data: childPartners } = await supabase
          .from('partners')
          .select('id')
          .eq('parent_id', partnerId)
          .eq('status', 'active');

        if (!childPartners || childPartners.length === 0) {
          return directUsers || [];
        }

        // 3. 각 하위 파트너의 사용자도 재귀 조회
        const allDescendantUsers = [...(directUsers || [])];
        for (const child of childPartners) {
          const childUsers = await getAllDescendantUsers(child.id);
          allDescendantUsers.push(...childUsers);
        }

        return allDescendantUsers;
      };

      // Lv1: 모든 사용자 조회
      if (user.level === 1) {
        const { data: allUsersData, error } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('❌ 사용자 목록 조회 실패:', error);
          throw error;
        }

        console.log(`✅ [Lv1] 전체 사용자: ${allUsersData?.length || 0}명`);
        setUsers(allUsersData || []);
        return;
      }

      // Lv2~Lv6: 하위 조직의 모든 사용자 조회
      const descendantUsers = await getAllDescendantUsers(user.id);
      
      console.log(`✅ [Lv${user.level}] 하위 사용자: ${descendantUsers.length}명`);
      console.log('📋 사용자 데이터:', descendantUsers);
      
      setUsers(descendantUsers);
    } catch (error) {
      console.error("❌ 사용자 목록 로드 실패:", error);
      toast.error("사용자 목록 로드에 실패했습니다.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadProvidersAndGames = async () => {
    try {
      const [providersData, allGamesData] = await Promise.all([
        gameApi.getProviders({ partner_id: user.id }),
        gameApi.getGames({})
      ]);

      // 🆕 game_visible이 'hidden'인 제공사 필터링
      const visibleProviders = providersData.filter(p => p.game_visible !== 'hidden');
      
      // 🆕 game_visible이 'hidden'인 게임 필터링
      const visibleGames = allGamesData.filter(g => {
        // game_visible 필드가 있으면 체크, 없으면 기본값으로 'visible' 간주
        const gameVisible = (g as any).game_visible || 'visible';
        return gameVisible !== 'hidden';
      });
      
      setProviders(visibleProviders);
      setAllGames(visibleGames);

      const uniqueApiTypes = [...new Set(visibleProviders.map(p => p.api_type))];
      if (uniqueApiTypes.length > 0 && !selectedApi) {
        const firstApi = uniqueApiTypes[0];
        setSelectedApi(firstApi);
        const apiGames = visibleGames.filter(g => g.api_type === firstApi);
        setGames(apiGames);
      }
      
      console.log(`✅ 제공사 로드 완료: 전체 ${providersData.length}개 중 표시 ${visibleProviders.length}개 (game_visible !== 'hidden')`);
      console.log(`✅ 게임 로드 완료: 전체 ${allGamesData.length}개 중 표시 ${visibleGames.length}개 (game_visible !== 'hidden')`);
    } catch (error) {
      console.error("❌ 제공사/게임 로드 실패:", error);
    }
  };

  const loadUserBlockedData = async () => {
    if (!selectedUser) return;

    try {
      setLoadingBlockedData(true);
      
      // 🆕 사용자의 매장(referrer_id) 조회
      const { data: referrerData, error: referrerError } = await supabase
        .from('partners')
        .select('id')
        .eq('id', selectedUser.referrer_id)
        .single();

      if (referrerError) {
        console.error('❌ referrer 조회 실패:', referrerError);
      }

      // 🆕 매장 레벨 차단 데이터 로드 (referrer_id가 partner_id인 경우)
      let storeBlockedProviderIds = new Set<number>();
      let storeBlockedGameIds = new Set<number>();

      if (referrerData) {
        const { data: storeBlockedData, error: storeError } = await supabase
          .from('partner_game_access')
          .select('game_id, game_provider_id, api_provider')
          .eq('partner_id', referrerData.id)
          .is('user_id', null);

        if (!storeError && storeBlockedData) {
          storeBlockedData.forEach(item => {
            if (item.game_provider_id && !item.game_id) {
              storeBlockedProviderIds.add(Number(item.game_provider_id));
            }
            if (item.game_id) {
              storeBlockedGameIds.add(Number(item.game_id));
            }
          });
          
          console.log('✅ 매장 레벨 차단 데이터:', {
            storeId: referrerData.id,
            blockedProviders: Array.from(storeBlockedProviderIds),
            blockedGames: Array.from(storeBlockedGameIds)
          });
        }
      }

      setStoreBlockedProviders(storeBlockedProviderIds);
      setStoreBlockedGames(storeBlockedGameIds);

      // 사용자 레벨 차단 데이터 로드
      const { data: blockedData, error } = await supabase
        .from('partner_game_access')
        .select('game_id, game_provider_id, api_provider, access_type, game_status')
        .eq('user_id', selectedUser.id);

      if (error) throw error;

      const blockedProviderIds = new Set<number>();
      const blockedGameIds = new Set<number>();
      const maintenanceProviderIds = new Set<number>();
      const maintenanceGameIds = new Set<number>();

      blockedData?.forEach(item => {
        if (item.game_provider_id && !item.game_id) {
          // 제공사 레벨 차단/점검
          if (item.access_type === 'maintenance' || item.game_status === 'maintenance') {
            maintenanceProviderIds.add(Number(item.game_provider_id));
          } else {
            blockedProviderIds.add(Number(item.game_provider_id));
          }
        }
        if (item.game_id) {
          // 게임 레벨 차단/점검
          if (item.access_type === 'maintenance' || item.game_status === 'maintenance') {
            maintenanceGameIds.add(Number(item.game_id));
          } else {
            blockedGameIds.add(Number(item.game_id));
          }
        }
      });

      setUserBlockedProviders(blockedProviderIds);
      setUserBlockedGames(blockedGameIds);
      setUserMaintenanceProviders(maintenanceProviderIds);
      setUserMaintenanceGames(maintenanceGameIds);
      
      console.log(`✅ 사용자 차단 데이터 로드:`, {
        blockedProviders: blockedProviderIds.size,
        blockedGames: blockedGameIds.size,
        maintenanceProviders: maintenanceProviderIds.size,
        maintenanceGames: maintenanceGameIds.size,
        rawData: blockedData
      });
    } catch (error) {
      console.error("❌ 사용자 차단 데이터 로드 실패:", error);
      toast.error("사용자 차단 데이터 로드에 실패했습니다.");
    } finally {
      setLoadingBlockedData(false);
    }
  };

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    setSearchTerm("");
    setExpandedProviderIds(new Set());
    
    // 첫 번째 API를 자동 선택
    const uniqueApiTypes = [...new Set(providers.map(p => p.api_type))];
    if (uniqueApiTypes.length > 0) {
      const firstApi = uniqueApiTypes[0];
      setSelectedApi(firstApi);
    } else {
      setSelectedApi(null);
    }
  };

  const handleToggleProvider = async (providerId: number, targetStatus: 'visible' | 'maintenance' | 'hidden') => {
    if (!selectedUser) return;

    try {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) return;

      const isBlocked = userBlockedProviders.has(providerId);
      const isMaintenance = userMaintenanceProviders.has(providerId);
      
      // 현재 상태 확인
      const currentStatus = isBlocked ? 'hidden' : isMaintenance ? 'maintenance' : 'visible';
      
      // 같은 상태를 클릭하면 아무것도 하지 않음
      if (currentStatus === targetStatus) return;
      
      if (targetStatus === 'visible') {
        // 노출로 변경 (레코드 삭제)
        const { error } = await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id)
          .eq('game_provider_id', String(providerId))
          .is('game_id', null);

        if (error) throw error;
        
        toast.success("제공사가 노출로 변경되었습니다.");
        setUserBlockedProviders(prev => {
          const newSet = new Set(prev);
          newSet.delete(providerId);
          return newSet;
        });
        setUserMaintenanceProviders(prev => {
          const newSet = new Set(prev);
          newSet.delete(providerId);
          return newSet;
        });
      } else {
        // 먼저 기존 레코드 삭제
        await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id)
          .eq('game_provider_id', String(providerId))
          .is('game_id', null);

        // 새 레코드 생성 (upsert 사용)
        const { error } = await supabase
          .from('partner_game_access')
          .upsert({
            user_id: selectedUser.id,
            partner_id: null,
            api_provider: provider.api_type,
            game_provider_id: String(providerId),
            game_id: null,
            access_type: targetStatus === 'maintenance' ? 'maintenance' : 'provider',
            game_status: targetStatus === 'maintenance' ? 'maintenance' : 'hidden' // 🆕 비노출일 때 'hidden'
          }, {
            onConflict: 'partner_id,user_id,api_provider,game_provider_id,game_id,access_type',
            ignoreDuplicates: false
          });

        if (error) throw error;
        
        if (targetStatus === 'maintenance') {
          toast.success("제공사가 점검 상태로 설정되었습니다.");
          setUserMaintenanceProviders(prev => new Set(prev).add(providerId));
          setUserBlockedProviders(prev => {
            const newSet = new Set(prev);
            newSet.delete(providerId);
            return newSet;
          });
        } else {
          toast.success("제공사가 비노출로 변경되었습니다.");
          setUserBlockedProviders(prev => new Set(prev).add(providerId));
          setUserMaintenanceProviders(prev => {
            const newSet = new Set(prev);
            newSet.delete(providerId);
            return newSet;
          });
        }
      }
      
      // ✅ 데이터 즉시 재로드
      await loadUserBlockedData();
    } catch (error) {
      console.error("❌ 제공사 상태 변경 실패:", error);
      toast.error("제공사 상태 변경에 실패했습니다.");
    }
  };

  const handleToggleGame = async (gameId: number, targetStatus: 'visible' | 'maintenance' | 'hidden') => {
    if (!selectedUser) return;

    try {
      const isBlocked = userBlockedGames.has(gameId);
      const isMaintenance = userMaintenanceGames.has(gameId);
      
      // 현재 상태 확인
      const currentStatus = isBlocked ? 'hidden' : isMaintenance ? 'maintenance' : 'visible';
      
      // 같은 상태를 클릭하면 아무것도 하지 않음
      if (currentStatus === targetStatus) return;
      
      const game = games.find(g => g.id === gameId);
      if (!game) return;
      
      if (targetStatus === 'visible') {
        // 노출로 변경 (레코드 삭제)
        const { error } = await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id)
          .eq('game_id', String(gameId));

        if (error) throw error;
        
        toast.success("게임이 노출로 변경되었습니다.");
        setUserBlockedGames(prev => {
          const newSet = new Set(prev);
          newSet.delete(gameId);
          return newSet;
        });
        setUserMaintenanceGames(prev => {
          const newSet = new Set(prev);
          newSet.delete(gameId);
          return newSet;
        });
      } else {
        // 먼저 기존 레코드 삭제
        await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id)
          .eq('game_id', String(gameId));

        // 새 레코드 생성 (upsert 사용)
        const { error } = await supabase
          .from('partner_game_access')
          .upsert({
            user_id: selectedUser.id,
            partner_id: null,
            api_provider: game.api_type,
            game_provider_id: String(game.provider_id),
            game_id: String(gameId),
            access_type: targetStatus === 'maintenance' ? 'maintenance' : 'game',
            game_status: targetStatus === 'maintenance' ? 'maintenance' : 'hidden' // 🆕 비노출일 때 'hidden'
          }, {
            onConflict: 'partner_id,user_id,api_provider,game_provider_id,game_id,access_type',
            ignoreDuplicates: false
          });

        if (error) throw error;
        
        if (targetStatus === 'maintenance') {
          toast.success("게임이 점검 상태로 설정되었습니다.");
          setUserMaintenanceGames(prev => new Set(prev).add(gameId));
          setUserBlockedGames(prev => {
            const newSet = new Set(prev);
            newSet.delete(gameId);
            return newSet;
          });
        } else {
          toast.success("게임이 비노출로 변경되었습니다.");
          setUserBlockedGames(prev => new Set(prev).add(gameId));
          setUserMaintenanceGames(prev => {
            const newSet = new Set(prev);
            newSet.delete(gameId);
            return newSet;
          });
        }
      }
      
      // ✅ 데이터 즉시 재로드
      await loadUserBlockedData();
    } catch (error) {
      console.error("❌ 게임 상태 변경 실패:", error);
      toast.error("게임 상태 변경에 실패했습니다.");
    }
  };

  const handleToggleMaintenance = async (gameId: number) => {
    if (!selectedUser) return;

    try {
      const isMaintenance = userMaintenanceGames.has(gameId);
      
      if (isMaintenance) {
        // 유지보수 해제 (레코드 삭제)
        const { error } = await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id)
          .eq('game_id', String(gameId))
          .eq('access_type', 'maintenance');

        if (error) throw error;
        
        toast.success("게임 점검이 해제되었습니다.");
        setUserMaintenanceGames(prev => {
          const newSet = new Set(prev);
          newSet.delete(gameId);
          return newSet;
        });
      } else {
        // 먼저 기존 차단 레코드 삭제 (있다면)
        await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id)
          .eq('game_id', String(gameId));

        // 유지보수 레코드 생성
        const game = games.find(g => g.id === gameId);
        if (!game) return;

        const { error } = await supabase
          .from('partner_game_access')
          .insert({
            user_id: selectedUser.id,
            api_provider: game.api_type,
            game_provider_id: String(game.provider_id),
            game_id: String(gameId),
            access_type: 'maintenance',
            game_status: 'maintenance'
          });

        if (error) throw error;
        
        toast.success("게임이 점검 상태로 설정되었습니다.");
        setUserBlockedGames(prev => {
          const newSet = new Set(prev);
          newSet.delete(gameId);
          return newSet;
        });
        setUserMaintenanceGames(prev => new Set(prev).add(gameId));
      }
    } catch (error) {
      console.error("❌ 게임 점검 설정/해제 실패:", error);
      toast.error("게임 점검 설정/해제에 실패했습니다.");
    }
  };

  // 🆕 게임 전체 상태 변경
  const handleBulkAllGames = async (targetStatus: 'visible' | 'maintenance' | 'hidden') => {
    if (!selectedUser) return;
    if (!confirm(`정말 모든 게임을 ${targetStatus === 'visible' ? '노출' : targetStatus === 'maintenance' ? '점검' : '비노출'}로 변경하시겠습니까?`)) return;

    try {
      const allCurrentGames = Array.from(providerGamesMap.values()).flat();
      
      if (targetStatus === 'visible') {
        // 모든 게임 노출 (모든 레코드 삭제)
        const { error } = await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id);

        if (error) throw error;
        toast.success(`모든 게임이 노출로 변경되었습니다.`);
      } else {
        // 먼저 모든 레코드 삭제
        await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id);

        // 새 레코드 일괄 삽입
        const records = allCurrentGames.map(game => ({
          user_id: selectedUser.id,
          api_provider: game.api_type,
          game_provider_id: String(game.provider_id),
          game_id: String(game.id),
          access_type: targetStatus === 'maintenance' ? 'maintenance' : 'game',
          game_status: targetStatus === 'maintenance' ? 'maintenance' : 'hidden' // 🆕 비노출일 때 'hidden'
        }));

        const { error } = await supabase
          .from('partner_game_access')
          .insert(records);

        if (error) throw error;
        
        toast.success(`모든 게임이 ${targetStatus === 'maintenance' ? '점검' : '비노출'}로 변경되었습니다.`);
      }
      
      await loadUserBlockedData();
    } catch (error) {
      console.error("❌ 게임 전체 상태 변경 실패:", error);
      toast.error("게임 전체 상태 변경에 실패했습니다.");
    }
  };

  // 🆕 게임사별 게임 전체 상태 변경
  const handleBulkProviderGames = async (providerId: number, targetStatus: 'visible' | 'maintenance' | 'hidden') => {
    if (!selectedUser) return;
    
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    
    if (!confirm(`정말 ${provider.name}의 모든 게임을 ${targetStatus === 'visible' ? '노출' : targetStatus === 'maintenance' ? '점검' : '비노출'}로 변경하시겠습니까?`)) return;

    try {
      const providerGames = providerGamesMap.get(providerId) || [];
      const gameIds = providerGames.map(g => String(g.id));
      
      if (targetStatus === 'visible') {
        // 해당 제공사의 모든 게임 레코드 삭제
        const { error } = await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id)
          .eq('game_provider_id', String(providerId))
          .not('game_id', 'is', null);

        if (error) throw error;
        toast.success(`${provider.name}의 모든 게임이 노출로 변경되었습니다.`);
      } else {
        // 먼저 해당 제공사의 게임 레코드 삭제
        await supabase
          .from('partner_game_access')
          .delete()
          .eq('user_id', selectedUser.id)
          .eq('game_provider_id', String(providerId))
          .not('game_id', 'is', null);

        // 새 레코드 일괄 삽입
        const records = providerGames.map(game => ({
          user_id: selectedUser.id,
          api_provider: game.api_type,
          game_provider_id: String(providerId),
          game_id: String(game.id),
          access_type: targetStatus === 'maintenance' ? 'maintenance' : 'game',
          game_status: targetStatus === 'maintenance' ? 'maintenance' : 'hidden' // 🆕 비노출일 때 'hidden'
        }));

        const { error } = await supabase
          .from('partner_game_access')
          .insert(records);

        if (error) throw error;
        
        toast.success(`${provider.name}의 모든 게임이 ${targetStatus === 'maintenance' ? '점검' : '비노출'}로 변경되었습니다.`);
      }
      
      await loadUserBlockedData();
    } catch (error) {
      console.error("❌ 게임사별 상태 변경 실패:", error);
      toast.error("게임사별 상태 변경에 실패했습니다.");
    }
  };

  const availableApis = useMemo(() => {
    const uniqueApiTypes = [...new Set(providers.map(p => p.api_type))] as ApiType[];
    return uniqueApiTypes.map(apiType => ({
      value: apiType,
      label: API_METADATA[apiType]?.label || apiType.toUpperCase(),
      color: API_METADATA[apiType]?.color || "from-blue-600 to-cyan-600",
    }));
  }, [providers]);

  const availableGameTypes = getAvailableGameTypes(selectedApi);

  const currentProviders = useMemo(() => {
    if (!selectedApi) return [];
    
    const apiProviders = providers.filter(p => p.api_type === selectedApi && p.status === "visible");
    
    return apiProviders.filter(provider => {
      return games.some(game => {
        if (game.provider_id !== provider.id) return false;
        if (game.api_type !== selectedApi) return false;
        if (game.status !== "visible") return false;
        if (selectedGameType !== "all" && game.type !== selectedGameType) return false;
        return true;
      });
    });
  }, [providers, selectedApi, selectedGameType, games]);

  const providerGamesMap = useMemo(() => {
    const map = new Map<number, Game[]>();
    const searchNormalized = debouncedSearchTerm.replace(/\s/g, '').toLowerCase();
    
    currentProviders.forEach(provider => {
      const providerNameNormalized = provider.name.replace(/\s/g, '').toLowerCase();
      
      // 🆕 멀티 API 제공사인 경우 모든 source_apis에서 게임 조회
      const sourceApis = provider.multi_api && provider.source_apis 
        ? provider.source_apis 
        : [provider.api_type];
      
      const providerGames = games.filter(game => {
        // 멀티 API 제공사: 모든 source_apis에서 같은 이름의 제공사 게임 조회
        if (provider.multi_api && provider.source_apis) {
          // 제공사 이름으로 매칭 (API가 달라도 같은 제공사)
          const gameProviderNormalized = (game.provider_name || '').replace(/\s/g, '').toLowerCase();
          const isMatchingProvider = 
            providerNameNormalized.includes(gameProviderNormalized.replace('slot', '')) ||
            gameProviderNormalized.includes(providerNameNormalized.replace('slot', '')) ||
            providerNameNormalized === gameProviderNormalized;
          
          if (!isMatchingProvider) return false;
          if (!sourceApis.includes(game.api_type)) return false;
        } else {
          // 일반 제공사: provider_id와 api_type으로 매칭
          if (game.provider_id !== provider.id) return false;
          if (game.api_type !== selectedApi) return false;
        }
        
        if (game.status !== "visible") return false;
        if (selectedGameType !== "all" && game.type !== selectedGameType) return false;
        
        if (!searchNormalized) return true;
        
        const gameNameNormalized = game.name.replace(/\s/g, '').toLowerCase();
        const gameNameKoNormalized = (game.name_ko || '').replace(/\s/g, '').toLowerCase();
        
        return providerNameNormalized.includes(searchNormalized) ||
               gameNameNormalized.includes(searchNormalized) ||
               gameNameKoNormalized.includes(searchNormalized);
      });
      
      if (providerGames.length > 0) {
        map.set(provider.id, providerGames);
      }
    });
    
    return map;
  }, [games, currentProviders, selectedApi, selectedGameType, debouncedSearchTerm]);

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(debouncedUserSearchTerm.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* 왼쪽: 사용자 목록 */}
      <Card className="bg-slate-800/30 border-slate-700 lg:col-span-1">
        <CardContent className="p-3">
          <div className="space-y-3">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">사용자 목록</h3>
              <p className="text-base text-slate-300">사용자를 선택하세요</p>
            </div>

            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                placeholder="사용자 검색..."
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                className="pl-10 pr-9 text-sm bg-slate-800/50 border-slate-700/50 text-white"
              />
              {userSearchTerm && (
                <button
                  onClick={() => setUserSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {loadingUsers ? (
              <div className="text-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                <p className="text-base text-slate-400">로딩 중...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <UserIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-base">사용자가 없습니다</p>
              </div>
            ) : (
              <ScrollArea className="h-[700px]">
                <div className="space-y-2">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleUserSelect(u)}
                      className={`w-full p-4 rounded-lg text-left transition-all ${
                        selectedUser?.id === u.id
                          ? "bg-purple-600/30 border-2 border-purple-400 shadow-lg shadow-purple-500/20"
                          : "bg-slate-700/40 border-2 border-slate-600 hover:bg-slate-700/60 hover:border-slate-500"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <UserIcon className="w-5 h-5 text-purple-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-bold text-white truncate">
                            {u.username}
                          </p>
                          <p className="text-sm text-slate-400">
                            {u.name || "이름 없음"}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 오른쪽: 사용자 게임 관리 */}
      <Card className="bg-slate-800/30 border-slate-700 lg:col-span-4">
        <CardContent className="p-6">
          {!selectedUser ? (
            <div className="text-center py-12 text-slate-400">
              <UserIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">사용자를 선택하세요</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 헤더 */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {selectedUser.username} - 게임 관리
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    차단된 게임은 해당 사용자가 플레이할 수 없습니다
                  </p>
                </div>
              </div>

              {/* 필터 영역 */}
              <div className="bg-slate-900/30 border border-slate-700/50 rounded-lg p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* API 선택 */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-white">API 제공사</label>
                    <div className="flex flex-wrap gap-2">
                      {availableApis.map(api => (
                        <Button
                          key={api.value}
                          size="sm"
                          variant={selectedApi === api.value ? "default" : "outline"}
                          onClick={() => setSelectedApi(api.value)}
                          className={`rounded-none ${
                            selectedApi === api.value
                              ? `bg-gradient-to-r ${api.color} text-white border-0`
                              : 'bg-slate-800/50 border-slate-600 text-slate-300'
                          }`}
                        >
                          {api.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* 게임 타입 */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-white">게임 타입</label>
                    <div className="flex flex-wrap gap-2">
                      {availableGameTypes.map(type => (
                        <Button
                          key={type.value}
                          size="sm"
                          variant={selectedGameType === type.value ? "default" : "outline"}
                          onClick={() => setSelectedGameType(type.value)}
                          className={`rounded-none ${
                            selectedGameType === type.value
                              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-0'
                              : 'bg-slate-800/50 border-slate-600 text-slate-300'
                          }`}
                        >
                          {type.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 검색 */}
                <div className="mt-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="게임 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-11 pr-10 bg-slate-800/50 border-slate-700/50 text-white"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* 게임 목록 */}
              {loadingBlockedData ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-400" />
                  <p className="text-slate-400">로딩 중...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentProviders.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      제공사가 없습니다
                    </div>
                  ) : (
                    currentProviders
                      .filter(provider => providerGamesMap.has(provider.id))
                      .map(provider => {
                        const isExpanded = expandedProviderIds.has(provider.id);
                        const providerGames = providerGamesMap.get(provider.id) || [];
                        const isProviderBlocked = userBlockedProviders.has(provider.id);
                        const isProviderMaintenance = userMaintenanceProviders.has(provider.id);

                        // 🆕 게임사의 모든 게임 상태 계산
                        const allGamesVisible = providerGames.every(game => 
                          !userBlockedGames.has(game.id) && !userMaintenanceGames.has(game.id)
                        );
                        const allGamesMaintenance = providerGames.every(game => 
                          userMaintenanceGames.has(game.id)
                        );
                        const allGamesHidden = providerGames.every(game => 
                          userBlockedGames.has(game.id)
                        );

                        return (
                          <div key={provider.id} className="bg-slate-900/50 border border-slate-700/50 rounded-lg overflow-hidden">
                            {/* 제공사 헤더 */}
                            <div className="p-4 bg-slate-800/50 space-y-3">
                              {/* 제공사 정보 & 펼치기 */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  <button
                                    onClick={() => {
                                      setExpandedProviderIds(prev => {
                                        const newSet = new Set(prev);
                                        if (newSet.has(provider.id)) {
                                          newSet.delete(provider.id);
                                        } else {
                                          newSet.add(provider.id);
                                        }
                                        return newSet;
                                      });
                                    }}
                                    className="text-slate-400 hover:text-white"
                                  >
                                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                  </button>
                                  <h4 className="text-lg font-bold text-white">{provider.name}</h4>
                                  <span className="text-sm text-slate-400">
                                    ({providerGames.length}개 게임)
                                  </span>
                                </div>
                                
                                {/* 제공사 상태 버튼 3개 */}
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleToggleProvider(provider.id, 'visible')}
                                    className={`text-xs ${
                                      !isProviderBlocked && !isProviderMaintenance
                                        ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700'
                                        : 'bg-emerald-900/10 border-emerald-600/30 text-emerald-400/60 hover:bg-emerald-900/20'
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5 mr-1" />
                                    노출
                                  </Button>
                                  
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleToggleProvider(provider.id, 'maintenance')}
                                    className={`text-xs ${
                                      isProviderMaintenance
                                        ? 'bg-yellow-600 border-yellow-500 text-white hover:bg-yellow-700'
                                        : 'bg-yellow-900/10 border-yellow-600/30 text-yellow-400/60 hover:bg-yellow-900/20'
                                    }`}
                                  >
                                    <Wrench className="w-3.5 h-3.5 mr-1" />
                                    점검
                                  </Button>
                                  
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleToggleProvider(provider.id, 'hidden')}
                                    className={`text-xs ${
                                      isProviderBlocked
                                        ? 'bg-red-600 border-red-500 text-white hover:bg-red-700'
                                        : 'bg-red-900/10 border-red-600/30 text-red-400/60 hover:bg-red-900/20'
                                    }`}
                                  >
                                    <Ban className="w-3.5 h-3.5 mr-1" />
                                    비노출
                                  </Button>
                                </div>
                              </div>

                              {/* 🆕 게임사별 게임 전체 관리 버튼 */}
                              <div className="bg-gradient-to-r from-blue-900/20 to-cyan-900/20 border border-blue-700/50 rounded-lg p-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h5 className="text-sm font-bold text-white">게임사 게임 전체 관리</h5>
                                    <p className="text-xs text-slate-400">{provider.name}의 모든 게임에 대해 일괄 작업합니다</p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleBulkProviderGames(provider.id, 'visible')}
                                      className={
                                        allGamesVisible
                                          ? 'text-xs bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700'
                                          : 'text-xs bg-emerald-900/10 border-emerald-600/30 text-emerald-400/60 hover:bg-emerald-900/20'
                                      }
                                    >
                                      <Check className="w-3.5 h-3.5 mr-1" />
                                      게임사노출
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleBulkProviderGames(provider.id, 'maintenance')}
                                      className={
                                        allGamesMaintenance
                                          ? 'text-xs bg-yellow-600 border-yellow-500 text-white hover:bg-yellow-700'
                                          : 'text-xs bg-yellow-900/10 border-yellow-600/30 text-yellow-400/60 hover:bg-yellow-900/20'
                                      }
                                    >
                                      <Wrench className="w-3.5 h-3.5 mr-1" />
                                      게임사점검
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleBulkProviderGames(provider.id, 'hidden')}
                                      className={
                                        allGamesHidden
                                          ? 'text-xs bg-red-600 border-red-500 text-white hover:bg-red-700'
                                          : 'text-xs bg-red-900/10 border-red-600/30 text-red-400/60 hover:bg-red-900/20'
                                      }
                                    >
                                      <Ban className="w-3.5 h-3.5 mr-1" />
                                      게임사비노출
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 게임 목록 */}
                            {isExpanded && (
                              <div className="p-4">
                                {/* 게임 그리드 */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                  {providerGames.map(game => {
                                    const isGameBlocked = userBlockedGames.has(game.id);
                                    const isGameMaintenance = userMaintenanceGames.has(game.id);
                                    
                                    // 🆕 매장 레벨에서 차단된 게임/제공사인지 확인
                                    const isStoreProviderBlocked = storeBlockedProviders.has(provider.id);
                                    const isStoreGameBlocked = storeBlockedGames.has(game.id);
                                    const isBlockedByStore = isStoreProviderBlocked || isStoreGameBlocked;
                                    
                                    return (
                                      <div
                                        key={game.id}
                                        className={`relative border-2 rounded-lg p-3 transition-all ${
                                          isBlockedByStore
                                            ? 'bg-orange-900/20 border-orange-600/40'
                                            : isGameBlocked
                                            ? 'bg-red-900/10 border-red-600/30'
                                            : isGameMaintenance
                                              ? 'bg-yellow-900/10 border-yellow-600/30'
                                              : 'bg-slate-800/50 border-slate-700/50'
                                        }`}
                                      >
                                        {/* 🆕 매장 차단 배지 */}
                                        {isBlockedByStore && (
                                          <div className="absolute -top-2 -right-2 z-10 bg-orange-600 text-white text-xs px-2 py-0.5 rounded-full font-bold shadow-lg">
                                            매장차단
                                          </div>
                                        )}
                                        
                                        {/* 게임 이미지 with 오버레이 */}
                                        <div className="relative aspect-video bg-slate-900/50 rounded mb-2 flex items-center justify-center overflow-hidden">
                                          <span className="text-xs text-slate-500">No Image</span>
                                          
                                          {/* 매장 차단 오버레이 */}
                                          {isBlockedByStore && (
                                            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
                                              <Ban className="w-8 h-8 text-orange-400 mb-1" />
                                              <span className="text-orange-400 font-bold text-sm">매장차단</span>
                                            </div>
                                          )}
                                          
                                          {/* 점검 중 오버레이 */}
                                          {!isBlockedByStore && isGameMaintenance && (
                                            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
                                              <Wrench className="w-8 h-8 text-yellow-400 mb-1" />
                                              <span className="text-yellow-400 font-bold text-sm">점검중</span>
                                            </div>
                                          )}
                                        </div>
                                        
                                        <p className="text-sm font-semibold text-white truncate mb-2">
                                          {game.name_ko || game.name}
                                        </p>
                                        
                                        {/* 버튼 그룹 */}
                                        <div className="flex gap-1">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleToggleGame(game.id, 'visible')}
                                            disabled={isBlockedByStore}
                                            className={`flex-1 text-xs ${
                                              isBlockedByStore
                                                ? 'bg-slate-700/50 border-slate-600/50 text-slate-500 cursor-not-allowed'
                                                : !isGameBlocked && !isGameMaintenance
                                                ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700'
                                                : 'bg-emerald-900/10 border-emerald-600/30 text-emerald-400/60 hover:bg-emerald-900/20'
                                            }`}
                                          >
                                            <Check className="w-3 h-3 mr-0.5" />
                                            노출
                                          </Button>
                                          
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleToggleGame(game.id, 'maintenance')}
                                            disabled={isBlockedByStore}
                                            className={`flex-1 text-xs ${
                                              isBlockedByStore
                                                ? 'bg-slate-700/50 border-slate-600/50 text-slate-500 cursor-not-allowed'
                                                : isGameMaintenance
                                                ? 'bg-yellow-600 border-yellow-500 text-white hover:bg-yellow-700'
                                                : 'bg-yellow-900/10 border-yellow-600/30 text-yellow-400/60 hover:bg-yellow-900/20'
                                            }`}
                                          >
                                            <Wrench className="w-3 h-3 mr-0.5" />
                                            점검
                                          </Button>
                                          
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleToggleGame(game.id, 'hidden')}
                                            disabled={isBlockedByStore}
                                            className={`flex-1 text-xs ${
                                              isBlockedByStore
                                                ? 'bg-slate-700/50 border-slate-600/50 text-slate-500 cursor-not-allowed'
                                                : isGameBlocked
                                                ? 'bg-red-600 border-red-500 text-white hover:bg-red-700'
                                                : 'bg-red-900/10 border-red-600/30 text-red-400/60 hover:bg-red-900/20'
                                            }`}
                                          >
                                            <Ban className="w-3 h-3 mr-0.5" />
                                            비노출
                                          </Button>
                                        </div>
                                        
                                        {/* 🆕 매장 차단 안내 메시지 */}
                                        {isBlockedByStore && (
                                          <div className="mt-2 text-xs text-orange-400 text-center">
                                            매장에서 차단된 게임입니다
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}