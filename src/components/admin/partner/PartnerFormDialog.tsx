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
import { Key, DollarSign } from "lucide-react";
import { Partner } from "./types";
import { useLanguage } from "../../../contexts/LanguageContext";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../../lib/supabase";

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
    casino_rolling_commission: 0.5,
    casino_losing_commission: 5.0,
    slot_rolling_commission: 0.5,
    slot_losing_commission: 5.0,
    withdrawal_fee: 1.0
  });

  // 파트너 데이터 로드 (수정 모드)
  useEffect(() => {
    if (mode === 'edit' && partner) {
      setFormData({
        username: partner.username,
        nickname: partner.nickname,
        password: "",
        partner_type: partner.partner_type,
        parent_id: partner.parent_id || "",
        opcode: "",
        secret_key: "",
        api_token: "",
        casino_rolling_commission: partner.casino_rolling_commission || partner.commission_rolling || 0.5,
        casino_losing_commission: partner.casino_losing_commission || partner.commission_losing || 5.0,
        slot_rolling_commission: partner.slot_rolling_commission || partner.commission_rolling || 0.5,
        slot_losing_commission: partner.slot_losing_commission || partner.commission_losing || 5.0,
        withdrawal_fee: partner.withdrawal_fee
      });
    } else if (mode === 'create') {
      resetForm();
    }
  }, [mode, partner, open]);

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
      casino_rolling_commission: 0.5,
      casino_losing_commission: 5.0,
      slot_rolling_commission: 0.5,
      slot_losing_commission: 5.0,
      withdrawal_fee: 1.0
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
          updated_at: new Date().toISOString()
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
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t.partnerManagement.newPartner : '파트너 정보 수정'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' 
              ? t.partnerManagement.createPartnerDescription 
              : '파트너의 정보를 수정합니다.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* 아이디/닉네임 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={mode === 'create' ? "username" : "edit_username"}>
                {t.partnerManagement.partnerUsername}
              </Label>
              <Input
                id={mode === 'create' ? "username" : "edit_username"}
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                placeholder={t.partnerManagement.partnerUsernameInput}
                disabled={mode === 'edit'}
                className={mode === 'edit' ? 'bg-muted' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={mode === 'create' ? "nickname" : "edit_nickname"}>
                {t.partnerManagement.partnerNickname}
              </Label>
              <Input
                id={mode === 'create' ? "nickname" : "edit_nickname"}
                value={formData.nickname}
                onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                placeholder={t.partnerManagement.partnerNicknameInput}
              />
            </div>
          </div>

          {/* 비밀번호 */}
          <div className="space-y-2">
            <Label htmlFor={mode === 'create' ? "password" : "edit_password"}>
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
            />
            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground">
                {t.partnerManagement.passwordChangeNote}
              </p>
            )}
          </div>

          {/* 파트너 등급 (생성시에만) */}
          {mode === 'create' && (
            <div className="space-y-2">
              <Label htmlFor="partner_type">{t.partnerManagement.partnerGrade}</Label>
              <Select 
                value={formData.partner_type} 
                onValueChange={(value: Partner['partner_type']) => {
                  setFormData(prev => ({ ...prev, partner_type: value }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {userLevel === 1 && (
                    <SelectItem value="head_office">{t.partnerManagement.headOffice}</SelectItem>
                  )}
                  {userLevel === 2 && (
                    <SelectItem value="main_office">{t.partnerManagement.mainOffice}</SelectItem>
                  )}
                  {userLevel === 3 && (
                    <SelectItem value="sub_office">{t.partnerManagement.subOffice}</SelectItem>
                  )}
                  {userLevel === 4 && (
                    <SelectItem value="distributor">{t.partnerManagement.distributor}</SelectItem>
                  )}
                  {userLevel === 5 && (
                    <SelectItem value="store">{t.partnerManagement.store}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {hierarchyWarning && (
                <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-xs text-red-700 dark:text-red-300">
                    {hierarchyWarning}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 커미션 설정 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-base">
                <DollarSign className="h-4 w-4 text-green-500" />
                {t.partnerManagement.commissionSettingsLabel}
              </Label>
              {formData.partner_type !== 'head_office' && parentCommission && (
                <Badge variant="outline" className="text-xs bg-slate-800/50 border-slate-600">
                  상위: C {parentCommission.casinoRolling}%/{parentCommission.casinoLosing}% | S {parentCommission.slotRolling}%/{parentCommission.slotLosing}%
                </Badge>
              )}
            </div>
            
            {formData.partner_type === 'head_office' ? (
              <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/30">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                    🏢
                  </div>
                  <div>
                    <p className="text-sm font-medium text-purple-300">대본사 계정</p>
                    <p className="text-xs text-purple-400/80 mt-1">
                      최상위 파트너로 커미션이 100%로 고정됩니다.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                    ⚠️
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-300">커미션 설정 안내</p>
                    <p className="text-xs text-amber-400/80 mt-1">
                      커미션 변경 시 정산에 즉시 반영되며, 상위 파트너 요율을 초과할 수 없습니다.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* 카지노 커미션 */}
            <div className="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-700/50">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30">
                  <span className="text-sm">🎲</span>
                </div>
                <Label className="text-sm font-medium text-slate-200">카지노 커미션</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="casino_commission_rolling" className="text-xs text-slate-400">
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
                    className={`bg-slate-800/50 border-slate-600 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-[10px] text-slate-500">
                    {formData.partner_type === 'head_office' ? '고정값' : '총 베팅액 기준'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="casino_commission_losing" className="text-xs text-slate-400">
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
                    className={`bg-slate-800/50 border-slate-600 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-[10px] text-slate-500">
                    {formData.partner_type === 'head_office' ? '고정값' : '회원 순손실 기준'}
                  </p>
                </div>
              </div>
            </div>

            {/* 슬롯 커미션 */}
            <div className="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-700/50">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                  <span className="text-sm">🎰</span>
                </div>
                <Label className="text-sm font-medium text-slate-200">슬롯 커미션</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="slot_commission_rolling" className="text-xs text-slate-400">
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
                    className={`bg-slate-800/50 border-slate-600 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-[10px] text-slate-500">
                    {formData.partner_type === 'head_office' ? '고정값' : '총 베팅액 기준'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot_commission_losing" className="text-xs text-slate-400">
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
                    className={`bg-slate-800/50 border-slate-600 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-[10px] text-slate-500">
                    {formData.partner_type === 'head_office' ? '고정값' : '회원 순손실 기준'}
                  </p>
                </div>
              </div>
            </div>

            {/* 출금 수수료 */}
            <div className="space-y-2">
              <Label htmlFor="withdrawal_fee" className="text-sm text-slate-300">
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
                className={`bg-slate-800/50 border-slate-600 ${formData.partner_type === 'head_office' ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <p className="text-xs text-slate-500">
                {formData.partner_type === 'head_office' ? '대본사 고정값' : t.partnerManagement.withdrawalFeeDesc}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
          >
            {t.common.cancel}
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading}
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