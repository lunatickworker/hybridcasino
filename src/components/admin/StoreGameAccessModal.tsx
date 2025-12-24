import { useState, useEffect } from "react";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from "./AdminDialog";
import { Button } from "../ui/button";
import { Gamepad2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { GameAccessSelectorSimple } from "./GameAccessSelectorSimple";

// 게임 접근 권한 인터페이스
interface GameAccess {
  api_provider: string;
  game_provider_id?: string;
  game_id?: string;
  access_type: 'provider' | 'game';
}

interface StoreGameAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId?: string; // 파트너 ID (선택적)
  userId?: string; // 사용자 ID (선택적)
  storeName: string;
  partnerLevel?: number; // 파트너 레벨 (6=매장, 7=사용자)
  onSuccess?: () => void;
}

export function StoreGameAccessModal({ 
  open, 
  onOpenChange, 
  storeId,
  userId,
  storeName,
  partnerLevel = 6,
  onSuccess 
}: StoreGameAccessModalProps) {
  const [gameAccess, setGameAccess] = useState<GameAccess[]>([]);
  const [availableApis, setAvailableApis] = useState<string[]>([]);
  const [parentGameAccess, setParentGameAccess] = useState<GameAccess[]>([]); // Lv6의 제한사항
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 타이틀 결정
  const modalTitle = userId ? '사용자 게임 설정' : (partnerLevel === 7 ? '사용자 게임 설정' : '매장 게임 설정');
  const modalDescription = userId 
    ? `${storeName} 사용자의 게임 제공사와 게임을 선택하세요`
    : (partnerLevel === 7 
      ? `${storeName} 사용자의 게임 제공사와 게임을 선택하세요`
      : `${storeName} 매장의 게임 제공사와 게임을 선택하세요`);

  // 매장의 상위 파트너의 API 목록 가져오기
  useEffect(() => {
    if (open && (storeId || userId)) {
      loadStoreData();
    }
  }, [open, storeId, userId]);

  const loadStoreData = async () => {
    setLoading(true);
    try {
      let uniqueApis: string[] = [];
      
      // ========================================
      // Case A: 사용자(userId) 설정 - 상위 매장(Lv6)의 게임 상속
      // ========================================
      if (userId) {
        console.log('📌 [Case A] User 설정 - 상위 매장(Lv6)의 게임 상속');
        
        // 1. 사용자 정보 조회 (referrer_id로 매장 찾기)
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('referrer_id')
          .eq('id', userId)
          .single();
        
        if (userError) throw userError;
        
        const storePartnerId = userData.referrer_id; // Lv6 매장 ID
        
        // 2. 매장(Lv6)의 partner_game_access 조회
        const { data: storeGameAccess, error: storeError } = await supabase
          .from('partner_game_access')
          .select('*')
          .eq('partner_id', storePartnerId);
        
        if (storeError) throw storeError;
        
        console.log('🔍 [Lv6 Store GameAccess]:', storeGameAccess);
        
        if (storeGameAccess && storeGameAccess.length > 0) {
          setParentGameAccess(storeGameAccess);
          uniqueApis = [...new Set(storeGameAccess.map(a => a.api_provider))];
          console.log('✅ [Case A] uniqueApis from Lv6 Store:', uniqueApis);
        } else {
          // 매장도 설정 안 했으면 빈 배열
          setParentGameAccess([]);
          uniqueApis = [];
          console.log('⚠️ [Case A] 매장에 게임 설정이 없음');
        }
        
        setAvailableApis(uniqueApis);
        
        // 3. 사용자의 기존 게임 접근 권한 로드
        const { data: existingAccess, error: accessError } = await supabase
          .from('partner_game_access')
          .select('*')
          .eq('user_id', userId);
        
        if (accessError) throw accessError;
        
        console.log('🎮 [User Existing GameAccess]:', existingAccess);
        
        const cleanedAccess: GameAccess[] = (existingAccess || []).map(access => ({
          api_provider: access.api_provider,
          game_provider_id: access.game_provider_id,
          game_id: access.game_id,
          access_type: access.access_type as 'provider' | 'game',
        }));
        
        console.log('✅ [Cleaned User GameAccess]:', cleanedAccess);
        setGameAccess(cleanedAccess);
        setLoading(false);
        return;
      }
      
      // ========================================
      // Case B: 파트너(storeId) 설정 - partners 테이블에서 로드
      // ========================================
      // 1. 현재 파트너 정보 로드
      const { data: currentPartnerData, error: currentPartnerError } = await supabase
        .from('partners')
        .select('parent_id, level')
        .eq('id', storeId)
        .single();

      if (currentPartnerError) throw currentPartnerError;

      const currentLevel = currentPartnerData.level;
      
      console.log('🔍 [StoreGameAccessModal] Current:', { storeId, currentLevel, parent_id: currentPartnerData.parent_id });

      // ========================================
      // Case 1: Lv2 설정 - Lv1의 partner_game_access 조회 (범위 제한용)
      //         하지만 API 탭은 api_configs의 모든 활성 API 표시
      // ========================================
      if (currentLevel === 2) {
        console.log('📌 [Case 1] Lv2 설정 - api_configs에서 활성 API 조회 + Lv1의 partner_game_access는 참고용');
        const parentId = currentPartnerData.parent_id; // Lv1 ID
        
        // 1. Lv1의 partner_game_access 조회 (참고용)
        const { data: lv1GameAccess, error: lv1Error } = await supabase
          .from('partner_game_access')
          .select('*')
          .eq('partner_id', parentId);
        
        if (lv1Error) throw lv1Error;
        
        console.log('🔍 [Lv1 GameAccess]:', lv1GameAccess);
        
        if (lv1GameAccess && lv1GameAccess.length > 0) {
          setParentGameAccess(lv1GameAccess);
        } else {
          setParentGameAccess([]);
        }
        
        // 2. api_configs에서 활성화된 모든 API 조회
        const { data: apiConfigs, error: apiError } = await supabase
          .from('api_configs')
          .select('api_provider')
          .eq('is_active', true);
        
        if (apiError) throw apiError;
        
        if (apiConfigs && apiConfigs.length > 0) {
          uniqueApis = [...new Set(apiConfigs.map(c => c.api_provider))];
          console.log('✅ [Case 1] uniqueApis from api_configs:', uniqueApis);
        } else {
          uniqueApis = [];
          console.log('⚠️ [Case 1] api_configs에 활성 API가 없음');
        }
      }
      
      // ========================================
      // Case 2: Lv6 설정 - api_configs의 모든 활성 API 표시
      // ========================================
      else if (currentLevel === 6) {
        console.log('📌 [Case 2] Lv6 설정 - api_configs에서 활성 API 조회');
        
        // api_configs에서 활성화된 모든 API 조회
        const { data: apiConfigs, error: apiError } = await supabase
          .from('api_configs')
          .select('api_provider')
          .eq('is_active', true);
        
        if (apiError) throw apiError;
        
        if (apiConfigs && apiConfigs.length > 0) {
          uniqueApis = [...new Set(apiConfigs.map(c => c.api_provider))];
          console.log('✅ [Case 2] uniqueApis from api_configs:', uniqueApis);
        } else {
          uniqueApis = [];
          console.log('⚠️ [Case 2] api_configs에 활성 API가 없음');
        }
        
        setParentGameAccess([]); // Lv6는 제한 없음
      }
      
      // ========================================
      // Case 3: Lv7 설정 - 직계 부모(Lv6) 조회
      // ========================================
      else if (currentLevel === 7) {
        console.log('📌 [Case 3] Lv7 설정 - 직계 부모(Lv6) 조회');
        const parentId = currentPartnerData.parent_id;
        
        const { data: lv6GameAccess, error: lv6Error } = await supabase
          .from('partner_game_access')
          .select('*')
          .eq('partner_id', parentId);

        if (lv6Error) throw lv6Error;
        
        console.log('🔍 [Lv6 GameAccess]:', lv6GameAccess);
        
        if (lv6GameAccess && lv6GameAccess.length > 0) {
          setParentGameAccess(lv6GameAccess);
          uniqueApis = [...new Set(lv6GameAccess.map(a => a.api_provider))];
          console.log('✅ [Case 3] uniqueApis from Lv6:', uniqueApis);
        }
      }
      
      console.log('🎯 [Final] availableApis:', uniqueApis);
      setAvailableApis(uniqueApis);

      // 5. 기존 게임 접근 권한 로드 (user_id가 NULL인 것만)
      const { data: existingAccess, error: accessError } = await supabase
        .from('partner_game_access')
        .select('*')
        .eq('partner_id', storeId)
        .is('user_id', null); // ✅ 파트너 설정만 로드

      if (accessError) throw accessError;

      console.log('🎮 [Existing GameAccess]:', existingAccess);
      
      // ✅ DB에서 불러온 데이터를 GameAccess 형식으로 변환 (불필요한 필드 제거)
      const cleanedAccess: GameAccess[] = (existingAccess || []).map(access => ({
        api_provider: access.api_provider,
        game_provider_id: access.game_provider_id,
        game_id: access.game_id,
        access_type: access.access_type as 'provider' | 'game',
      }));
      
      console.log('✅ [Cleaned GameAccess]:', cleanedAccess);
      setGameAccess(cleanedAccess);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
      toast.error('정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // ========================================
      // Case A: 사용자(userId) 저장
      // ========================================
      if (userId) {
        // 0. 사용자의 referrer_id (매장 ID) 조회
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('referrer_id')
          .eq('id', userId)
          .single();
        
        if (userError) throw userError;
        
        const storePartnerId = userData.referrer_id; // Lv6 매장 ID
        
        // 1. 현재 저장하려는 API 목록 추출
        let apiProvidersToUpdate = [...new Set(gameAccess.map(a => a.api_provider))];
        
        // 빈 배열 + availableApis 있으면 → availableApis 전체 삭제
        if (gameAccess.length === 0 && availableApis.length > 0) {
          apiProvidersToUpdate = availableApis;
        }
        
        // 2. 해당 API의 기존 데이터만 삭제 (다른 API 데이터는 유지!)
        if (apiProvidersToUpdate.length > 0) {
          const { error: deleteError } = await supabase
            .from('partner_game_access')
            .delete()
            .eq('user_id', userId)
            .in('api_provider', apiProvidersToUpdate);

          if (deleteError) throw deleteError;
        }

        // 3. 빈 배열이면 상속 (INSERT 하지 않음)
        if (gameAccess.length === 0) {
          toast.success('사용자가 상위 매장의 모든 게임을 상속합니다.');
          onSuccess?.();
          onOpenChange(false);
          return;
        }

        // 4. 선택한 게임만 저장 (partner_id와 user_id 둘 다 설정)
        const gameAccessData = gameAccess.map(access => ({
          partner_id: storePartnerId, // ✅ 매장 ID (NOT NULL 제약 만족)
          user_id: userId, // ✅ 사용자 ID (개별 설정 표시)
          api_provider: access.api_provider,
          game_provider_id: access.game_provider_id,
          game_id: access.game_id,
          access_type: access.access_type,
        }));

        const { error: insertError } = await supabase
          .from('partner_game_access')
          .insert(gameAccessData);

        if (insertError) throw insertError;

        toast.success(`사용자 게임 ${gameAccess.length}개가 개별 설정되었습니다.`);
        onSuccess?.();
        onOpenChange(false);
        return;
      }
      
      // ========================================
      // Case B: 파트너(storeId) 저장
      // ========================================
      // 1. 현재 저장하려는 API 목록 추출
      let apiProvidersToUpdate = [...new Set(gameAccess.map(a => a.api_provider))];
      
      // 빈 배열 + availableApis 있으면 → availableApis 전체 삭제 (전체 상속)
      if (gameAccess.length === 0 && availableApis.length > 0) {
        apiProvidersToUpdate = availableApis;
      }
      
      console.log('💾 [Save] API providers to update:', apiProvidersToUpdate);
      console.log('💾 [Save] gameAccess count:', gameAccess.length);
      
      // 2. 해당 API의 기존 데이터만 삭제 (다른 API 데이터는 유지!)
      if (apiProvidersToUpdate.length > 0) {
        const { error: deleteError } = await supabase
          .from('partner_game_access')
          .delete()
          .eq('partner_id', storeId)
          .is('user_id', null) // ✅ 파트너 설정만 삭제 (사용자 개별 설정은 유지)
          .in('api_provider', apiProvidersToUpdate);

        if (deleteError) throw deleteError;
        
        console.log('✅ [Save] Deleted data for APIs:', apiProvidersToUpdate);
      }

      // 3. 빈 배열이면 상속 (INSERT 하지 않음)
      if (gameAccess.length === 0) {
        toast.success('상위의 모든 게임을 상속합니다. 중복 데이터 없이 효율적으로 관리됩니다.');
        onSuccess?.();
        onOpenChange(false);
        return;
      }

      // 4. 선택한 게임만 저장
      const gameAccessData = gameAccess.map(access => ({
        partner_id: storeId,
        api_provider: access.api_provider,
        game_provider_id: access.game_provider_id,
        game_id: access.game_id,
        access_type: access.access_type,
      }));

      const { error: insertError } = await supabase
        .from('partner_game_access')
        .insert(gameAccessData);

      if (insertError) throw insertError;

      console.log('✅ [Save] Inserted games:', gameAccess.length);
      toast.success(`게임 ${gameAccess.length}개가 저장되었습니다. 다른 API 게임은 유지됩니다.`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('게임 접근 권한 업데이트 실패:', error);
      toast.error('게임 접근 권한 업데이트에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] overflow-hidden bg-slate-900 border-slate-700 flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3 text-3xl">
            <Gamepad2 className="h-8 w-8 text-purple-400" />
            <span>{modalTitle}</span>
          </DialogTitle>
          <DialogDescription className="text-xl text-slate-300 mt-2">
            {modalDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-6 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
          ) : (
            <GameAccessSelectorSimple
              availableApis={availableApis}
              value={gameAccess}
              onChange={setGameAccess}
              parentGameAccess={parentGameAccess}
              restrictToParentProviders={!!userId}
            />
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-lg px-6 py-3 h-auto"
          >
            <X className="h-5 w-5 mr-2" />
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg px-6 py-3 h-auto"
          >
            <Gamepad2 className="h-5 w-5 mr-2" />
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}