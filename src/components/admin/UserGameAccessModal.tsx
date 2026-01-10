import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from './AdminDialog';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner@2.0.3';
import { GameAccessSelectorSimple } from './GameAccessSelectorSimple';
import { Gamepad2 } from 'lucide-react';

interface GameAccess {
  api_provider: string;
  game_provider_id?: string;
  game_id?: string;
  access_type: 'provider' | 'game';
}

interface UserGameAccessModalProps {
  user: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function UserGameAccessModal({ user, open, onOpenChange, onSuccess }: UserGameAccessModalProps) {
  const [selectedApis, setSelectedApis] = useState<string[]>([]);
  const [gameAccess, setGameAccess] = useState<GameAccess[]>([]);
  const [parentGameAccess, setParentGameAccess] = useState<GameAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadData();
    }
  }, [open, user]);

  const loadData = async () => {
    try {
      setLoading(true);

      // 1. 사용자의 referrer (파트너) 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('referrer_id')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      const referrerId = userData?.referrer_id;
      if (!referrerId) {
        toast.error('사용자의 소속 파트너를 찾을 수 없습니다.');
        return;
      }

      // 2. 파트너의 selected_apis 조회
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('selected_apis')
        .eq('id', referrerId)
        .single();

      if (partnerError) throw partnerError;

      const apis = partnerData?.selected_apis || [];
      setSelectedApis(apis);

      // 3. 파트너의 게임 접근 권한 조회 (부모 권한)
      const { data: partnerAccess, error: parentAccessError } = await supabase
        .from('partner_game_access')
        .select('*')
        .eq('partner_id', referrerId);

      if (parentAccessError) throw parentAccessError;

      const parentAccess = partnerAccess?.map((access: any) => ({
        api_provider: access.api_provider,
        game_provider_id: access.game_provider_id || undefined,
        game_id: access.game_id || undefined,
        access_type: access.access_type as 'provider' | 'game',
      })) || [];

      setParentGameAccess(parentAccess);

      // 4. 사용자의 현재 게임 접근 권한 조회
      const { data: userAccess, error: userAccessError } = await supabase
        .from('partner_game_access')
        .select('*')
        .eq('partner_id', user.id);

      if (userAccessError) throw userAccessError;

      const currentAccess = userAccess?.map((access: any) => ({
        api_provider: access.api_provider,
        game_provider_id: access.game_provider_id || undefined,
        game_id: access.game_id || undefined,
        access_type: access.access_type as 'provider' | 'game',
      })) || [];

      setGameAccess(currentAccess);

    } catch (error) {
      console.error('데이터 로드 실패:', error);
      toast.error('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // 1. 기존 게임 접근 권한 삭제
      const { error: deleteError } = await supabase
        .from('partner_game_access')
        .delete()
        .eq('partner_id', user.id);

      if (deleteError) throw deleteError;

      // 2. 새로운 게임 접근 권한 저장
      // gameAccess가 비어있으면 전체 상속 (아무것도 저장하지 않음)
      if (gameAccess.length > 0) {
        const insertData = gameAccess.map(access => ({
          partner_id: user.id,
          api_provider: access.api_provider,
          game_provider_id: access.game_provider_id || null,
          game_id: access.game_id || null,
          access_type: access.access_type,
        }));

        const { error: insertError } = await supabase
          .from('partner_game_access')
          .insert(insertData);

        if (insertError) throw insertError;
      }

      toast.success('게임 접근 권한이 저장되었습니다.');
      onSuccess?.();
      onOpenChange(false);

    } catch (error) {
      console.error('저장 실패:', error);
      toast.error('게임 접근 권한 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-2 border-purple-500/30">
        <DialogHeader className="px-8 py-6 border-b border-slate-700 bg-gradient-to-r from-purple-600/20 to-pink-600/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Gamepad2 className="h-7 w-7 text-white" />
            </div>
            <div>
              <DialogTitle className="text-3xl">사용자 게임 권한 관리</DialogTitle>
              <DialogDescription className="text-lg mt-1">
                {user?.username}님이 접근 가능한 게임을 설정합니다
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
          ) : (
            <GameAccessSelectorSimple
              availableApis={selectedApis}
              value={gameAccess}
              onChange={setGameAccess}
              parentGameAccess={parentGameAccess}
              restrictToParentProviders={true}
            />
          )}
        </div>

        <DialogFooter className="px-8 py-6 border-t border-slate-700 bg-slate-800/50">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="px-8 py-6 text-lg"
          >
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-premium-primary px-8 py-6 text-lg"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
