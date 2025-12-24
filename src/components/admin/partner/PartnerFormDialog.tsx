/**
 * 파트너 생성/수정 다이얼로그
 */
import { useState, useEffect } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Badge } from "../../ui/badge";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from "../AdminDialog";
import { Key, DollarSign, Gamepad2 } from "lucide-react";
import { Partner } from "./types";
import { useLanguage } from "../../../contexts/LanguageContext";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../../lib/supabase";
import { GameAccessSelectorSimple } from "../GameAccessSelectorSimple";

interface PartnerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  partner?: Partner | null;
  userLevel?: number;
  onSuccess: () => void;
  onWebSocketUpdate?: (data: any) => void;
}

export function PartnerFormDialog({
  open,
  onOpenChange,
  mode,
  partner,
  userLevel,
  onSuccess,
  onWebSocketUpdate
}: PartnerFormDialogProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [hierarchyWarning, setHierarchyWarning] = useState("");
  const [parentCommission, setParentCommission] = useState<{
    casinoRolling: number;
    casinoLosing: number;
    slotRolling: number;
    slotLosing: number;
    fee: number;
    nickname?: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    username: "",
    nickname: "",
    password: "",
    partner_type: "head_office" as Partner['partner_type'],
    parent_id: "",
    opcode: "",
    secret_key: "",
    api_token: "",
    casino_rolling_commission: 0,
    casino_losing_commission: 0,
    slot_rolling_commission: 0,
    slot_losing_commission: 0,
    withdrawal_fee: 0,
    game_access: [] as any[], // Lv6/Lv7 게임 접근 권한
  });

  const [parentApis, setParentApis] = useState<string[]>([]); // 상위 Lv2의 selected_apis
  const [partnerLevel, setPartnerLevel] = useState<number>(0); // 파트너 레벨

  // 파트너 데이터 로드 (수정 모드)
  useEffect(() => {
    if (mode === 'edit' && partner) {
      loadPartnerData();
    }
    // ✅ 생성 모드일 때는 resetForm 호출하지 않음 (마지막 입력값 유지)
  }, [mode, partner, open]);

  // 파트너 데이터 로드 (수정 모드)
  const loadPartnerData = async () => {
    if (!partner) return;

    setFormData({
      username: partner.username,
      nickname: partner.nickname,
      password: "",
      partner_type: partner.partner_type,
      parent_id: partner.parent_id || "",
      opcode: "",
      secret_key: "",
      api_token: "",
      casino_rolling_commission: partner.casino_rolling_commission || partner.commission_rolling || 0,
      casino_losing_commission: partner.casino_losing_commission || partner.commission_losing || 0,
      slot_rolling_commission: partner.slot_rolling_commission || partner.commission_rolling || 0,
      slot_losing_commission: partner.slot_losing_commission || partner.commission_losing || 0,
      withdrawal_fee: partner.withdrawal_fee || 0,
      game_access: [] as any[],
    });
    setPartnerLevel(partner.level || 0);

    // Lv6/Lv7인 경우 게임 접근 권한 로드
    if (partner.level >= 6) {
      try {
        // 기존 게임 접근 권한 로드
        const { data: gameAccess } = await supabase
          .from('partner_game_access')
          .select('*')
          .eq('partner_id', partner.id);

        if (gameAccess) {
          setFormData(prev => ({ ...prev, game_access: gameAccess }));
        }

        // 상위 Lv2의 selected_apis 로드
        let currentParentId = partner.parent_id;
        let lv2Partner = null;

        for (let i = 0; i < 10; i++) {
          if (!currentParentId) break;

          const { data: parentData } = await supabase
            .from('partners')
            .select('id, level, parent_id, selected_apis')
            .eq('id', currentParentId)
            .single();

          if (!parentData) break;

          if (parentData.level === 2) {
            lv2Partner = parentData;
            break;
          }

          currentParentId = parentData.parent_id;
        }

        if (lv2Partner && lv2Partner.selected_apis) {
          setParentApis(lv2Partner.selected_apis as string[]);
        } else {
          setParentApis([]);
        }
      } catch (error) {
        console.error('게임 접근 권한 로드 실패:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      username: "",
      nickname: "",
      password: "",
      partner_type: "head_office",
      parent_id: "",
      opcode: "",
      secret_key: "",
      api_token: "",
      casino_rolling_commission: 0,
      casino_losing_commission: 0,
      slot_rolling_commission: 0,
      slot_losing_commission: 0,
      withdrawal_fee: 0,
      game_access: [] as any[], // Lv6/Lv7 게임 접근 권한
    });
    setHierarchyWarning("");
    setParentCommission(null);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      if (mode === 'create') {
        // 생성 로직
        if (!formData.username.trim()) {
          toast.error(t.partnerManagement.enterUsernameError);
          return;
        }
        if (!formData.nickname.trim()) {
          toast.error(t.partnerManagement.enterNicknameError);
          return;
        }
        if (!formData.password.trim()) {
          toast.error(t.partnerManagement.enterPasswordError);
          return;
        }

        toast.success(t.partnerManagement.partnerCreatedSuccess);
        onSuccess();
        onOpenChange(false);
        resetForm();
      } else {
        // 수정 로직
        if (!partner) return;

        const updateData: any = {
          nickname: formData.nickname,
          // 카지노/슬롯 분리 커미션 (실제 DB 컬럼명)
          casino_rolling_commission: formData.casino_rolling_commission,
          casino_losing_commission: formData.casino_losing_commission,
          slot_rolling_commission: formData.slot_rolling_commission,
          slot_losing_commission: formData.slot_losing_commission,
          // 하위 호환성을 위한 기존 컬럼 (평균값 또는 카지노 값 사용)
          commission_rolling: formData.casino_rolling_commission,
          commission_losing: formData.casino_losing_commission,
          withdrawal_fee: formData.withdrawal_fee,
          updated_at: new Date().toISOString(),
        };

        // 비밀번호가 입력된 경우에만 업데이트
        if (formData.password && formData.password.trim() !== '') {
          updateData.password_hash = formData.password;
        }

        const { error } = await supabase
          .from('partners')
          .update(updateData)
          .eq('id', partner.id);

        if (error) throw error;

        // Lv6/Lv7인 경우 게임 접근 권한 업데이트
        if (partner.level >= 6) {
          // 기존 데이터 삭제
          await supabase
            .from('partner_game_access')
            .delete()
            .eq('partner_id', partner.id);

          // 새 데이터 추가
          if (formData.game_access && formData.game_access.length > 0) {
            const gameAccessData = formData.game_access.map(access => ({
              partner_id: partner.id,
              api_provider: access.api_provider,
              game_provider_id: access.game_provider_id,
              game_id: access.game_id,
              access_type: access.access_type,
            }));

            const { error: gameAccessError } = await supabase
              .from('partner_game_access')
              .insert(gameAccessData);

            if (gameAccessError) {
              console.error('게임 접근 권한 업데이트 실패:', gameAccessError);
              toast.error('게임 접근 권한 업데이트에 실패했습니다.');
            }
          }
        }

        toast.success(t.partnerManagement.partnerUpdatedSuccess);
        
        if (onWebSocketUpdate) {
          onWebSocketUpdate({
            type: 'partner_updated',
            data: { partnerId: partner.id, updates: updateData }
          });
        }

        onSuccess();
        onOpenChange(false);
      }
    } catch (error) {
      console.error('파트너 저장 오류:', error);
      toast.error(mode === 'create' 
        ? t.partnerManagement.createPartnerError 
        : t.partnerManagement.updatePartnerError
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {mode === 'create' ? t.partnerManagement.newPartner : '파트너 정보 수정'}
          </DialogTitle>
          <DialogDescription className="text-lg">
            {mode === 'create' 
              ? t.partnerManagement.createPartnerDescription 
              : '파트너의 정보를 수정합니다.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-6">
          {/* 아이디/닉네임 */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor={mode === 'create' ? "username" : "edit_username"} className="text-lg">
                {t.partnerManagement.partnerUsername}
              </Label>
              <Input
                id={mode === 'create' ? "username" : "edit_username"}
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                placeholder={t.partnerManagement.partnerUsernameInput}
                disabled={mode === 'edit'}
                className={`text-base h-12 ${mode === 'edit' ? 'bg-muted' : ''}`}
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor={mode === 'create' ? "nickname" : "edit_nickname"} className="text-lg">
                {t.partnerManagement.partnerNickname}
              </Label>
              <Input
                id={mode === 'create' ? "nickname" : "edit_nickname"}
                value={formData.nickname}
                onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                placeholder={t.partnerManagement.partnerNicknameInput}
                className="text-base h-12"
              />
            </div>
          </div>

          {/* 비밀번호 */}
          <div className="space-y-3">
            <Label htmlFor={mode === 'create' ? "password" : "edit_password"} className="text-lg">
              {mode === 'create' ? t.common.password : t.partnerManagement.passwordChangeOnly}
            </Label>
            <Input
              id={mode === 'create' ? "password" : "edit_password"}
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder={mode === 'create' 
                ? t.partnerManagement.initialPassword 
                : t.partnerManagement.passwordChangeHint
              }
              className="text-base h-12"
            />
            {mode === 'edit' && (
              <p className="text-sm text-muted-foreground">
                {t.partnerManagement.passwordChangeNote}
              </p>
            )}
          </div>

          {/* 파트너 등급 (생성시에만) */}
          {mode === 'create' && (
            <div className="space-y-3">
              <Label htmlFor="partner_type" className="text-lg">{t.partnerManagement.partnerGrade}</Label>
              <Select 
                value={formData.partner_type} 
                onValueChange={(value: Partner['partner_type']) => {
                  setFormData(prev => ({ ...prev, partner_type: value }));
                }}
              >
                <SelectTrigger className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {userLevel === 1 && (
                    <SelectItem value="head_office" className="text-base py-3">{t.partnerManagement.headOffice}</SelectItem>
                  )}
                  {userLevel === 2 && (
                    <SelectItem value="main_office" className="text-base py-3">{t.partnerManagement.mainOffice}</SelectItem>
                  )}
                  {userLevel === 3 && (
                    <SelectItem value="sub_office" className="text-base py-3">{t.partnerManagement.subOffice}</SelectItem>
                  )}
                  {userLevel === 4 && (
                    <SelectItem value="distributor" className="text-base py-3">{t.partnerManagement.distributor}</SelectItem>
                  )}
                  {userLevel === 5 && (
                    <SelectItem value="store" className="text-base py-3">{t.partnerManagement.store}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {hierarchyWarning && (
                <div className="p-5 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {hierarchyWarning}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 커미션 설정 */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-3 text-xl">
                <DollarSign className="h-6 w-6 text-green-500" />
                {t.partnerManagement.commissionSettingsLabel}
              </Label>
              {formData.partner_type !== 'head_office' && parentCommission && (
                <Badge variant="outline" className="text-sm bg-slate-800/50 border-slate-600 px-4 py-2">
                  상위: C {parentCommission.casinoRolling}%/{parentCommission.casinoLosing}% | S {parentCommission.slotRolling}%/{parentCommission.slotLosing}%
                </Badge>
              )}
            </div>
            
            {formData.partner_type === 'head_office' ? (
              <div className="p-6 bg-purple-500/10 rounded-lg border border-purple-500/30">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-xl">
                    🏢
                  </div>
                  <div>
                    <p className="text-base font-medium text-purple-300">대본사 계정</p>
                    <p className="text-sm text-purple-400/80 mt-1.5">
                      최상위 파트너로 커미션이 100%로 고정됩니다.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-amber-500/10 rounded-lg border border-amber-500/30">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-xl">
                    ⚠️
                  </div>
                  <div>
                    <p className="text-base font-medium text-amber-300">커미션 설정 안내</p>
                    <p className="text-sm text-amber-400/80 mt-1.5">
                      커미션 변경 시 정산에 즉시 반영되며, 상위 파트너 요율을 초과할 수 없습니다.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* 카지노 커미션 */}
            <div className="space-y-4 p-6 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-700/50">
                <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-blue-500/20 border border-blue-500/30">
                  <span className="text-lg">🎲</span>
                </div>
                <Label className="text-lg font-medium text-slate-200">카지노 커미션</Label>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="casino_commission_rolling" className="text-sm text-slate-400">
                    롤링 커미션 (%)
                  </Label>
                  <Input
                    id="casino_commission_rolling"
                    type="number"
                    step="0.1"
                    min="0"
                    max={formData.partner_type === 'head_office' ? 100 : parentCommission?.casinoRolling || 100}
                    value={formData.casino_rolling_commission}
                    onChange={(e) => setFormData(prev => ({ ...prev, casino_rolling_commission: parseFloat(e.target.value) || 0 }))}
                    disabled={formData.partner_type === 'head_office'}
                    className={`bg-slate-800/50 border-slate-600 text-base h-12 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-xs text-slate-500">
                    {formData.partner_type === 'head_office' ? '고정값' : '총 베팅액 기준'}
                  </p>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="casino_commission_losing" className="text-sm text-slate-400">
                    루징 커미션 (%)
                  </Label>
                  <Input
                    id="casino_commission_losing"
                    type="number"
                    step="0.1"
                    min="0"
                    max={formData.partner_type === 'head_office' ? 100 : parentCommission?.casinoLosing || 100}
                    value={formData.casino_losing_commission}
                    onChange={(e) => setFormData(prev => ({ ...prev, casino_losing_commission: parseFloat(e.target.value) || 0 }))}
                    disabled={formData.partner_type === 'head_office'}
                    className={`bg-slate-800/50 border-slate-600 text-base h-12 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-xs text-slate-500">
                    {formData.partner_type === 'head_office' ? '고정값' : '회원 순손실 기준'}
                  </p>
                </div>
              </div>
            </div>

            {/* 슬롯 커미션 */}
            <div className="space-y-4 p-6 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-700/50">
                <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                  <span className="text-lg">🎰</span>
                </div>
                <Label className="text-lg font-medium text-slate-200">슬롯 커미션</Label>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="slot_commission_rolling" className="text-sm text-slate-400">
                    롤링 커미션 (%)
                  </Label>
                  <Input
                    id="slot_commission_rolling"
                    type="number"
                    step="0.1"
                    min="0"
                    max={formData.partner_type === 'head_office' ? 100 : parentCommission?.slotRolling || 100}
                    value={formData.slot_rolling_commission}
                    onChange={(e) => setFormData(prev => ({ ...prev, slot_rolling_commission: parseFloat(e.target.value) || 0 }))}
                    disabled={formData.partner_type === 'head_office'}
                    className={`bg-slate-800/50 border-slate-600 text-base h-12 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-xs text-slate-500">
                    {formData.partner_type === 'head_office' ? '고정값' : '총 베팅액 기준'}
                  </p>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="slot_commission_losing" className="text-sm text-slate-400">
                    루징 커미션 (%)
                  </Label>
                  <Input
                    id="slot_commission_losing"
                    type="number"
                    step="0.1"
                    min="0"
                    max={formData.partner_type === 'head_office' ? 100 : parentCommission?.slotLosing || 100}
                    value={formData.slot_losing_commission}
                    onChange={(e) => setFormData(prev => ({ ...prev, slot_losing_commission: parseFloat(e.target.value) || 0 }))}
                    disabled={formData.partner_type === 'head_office'}
                    className={`bg-slate-800/50 border-slate-600 text-base h-12 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-xs text-slate-500">
                    {formData.partner_type === 'head_office' ? '고정값' : '회원 순손실 기준'}
                  </p>
                </div>
              </div>
            </div>

            {/* 출금 수수료 */}
            <div className="space-y-3">
              <Label htmlFor="withdrawal_fee" className="text-lg text-slate-300">
                {t.partnerManagement.withdrawalFeeLabel}
              </Label>
              <Input
                id="withdrawal_fee"
                type="number"
                step="0.1"
                min="0"
                max={formData.partner_type === 'head_office' ? 100 : parentCommission?.fee || 100}
                value={formData.withdrawal_fee}
                onChange={(e) => setFormData(prev => ({ ...prev, withdrawal_fee: parseFloat(e.target.value) || 0 }))}
                disabled={formData.partner_type === 'head_office'}
                className={`bg-slate-800/50 border-slate-600 text-base h-12 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <p className="text-sm text-slate-500">
                {formData.partner_type === 'head_office' ? '대본사 고정값' : t.partnerManagement.withdrawalFeeDesc}
              </p>
            </div>
          </div>

          {/* Lv6/Lv7 게임 접근 권한 - 제거됨 */}
          {/* 파트너 계층관리 페이지에서만 설정 가능 */}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
            className="text-base px-6 py-6 h-auto"
          >
            {t.common.cancel}
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading}
            className="text-base px-6 py-6 h-auto"
          >
            {loading 
              ? (mode === 'create' ? t.partnerManagement.creating : '수정 중...') 
              : (mode === 'create' ? t.partnerManagement.createPartnerButton : t.common.save)
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}