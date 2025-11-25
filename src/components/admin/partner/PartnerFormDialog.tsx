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
    rolling: number;
    losing: number;
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
    commission_rolling: 0.5,
    commission_losing: 5.0,
    withdrawal_fee: 1.0,
    min_withdrawal_amount: 10000,
    max_withdrawal_amount: 1000000,
    daily_withdrawal_limit: 5000000
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
        commission_rolling: partner.commission_rolling,
        commission_losing: partner.commission_losing,
        withdrawal_fee: partner.withdrawal_fee,
        min_withdrawal_amount: partner.min_withdrawal_amount || 10000,
        max_withdrawal_amount: partner.max_withdrawal_amount || 1000000,
        daily_withdrawal_limit: partner.daily_withdrawal_limit || 5000000
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
      commission_rolling: 0.5,
      commission_losing: 5.0,
      withdrawal_fee: 1.0,
      min_withdrawal_amount: 10000,
      max_withdrawal_amount: 1000000,
      daily_withdrawal_limit: 5000000
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
          commission_rolling: formData.commission_rolling,
          commission_losing: formData.commission_losing,
          withdrawal_fee: formData.withdrawal_fee,
          min_withdrawal_amount: formData.min_withdrawal_amount,
          max_withdrawal_amount: formData.max_withdrawal_amount,
          daily_withdrawal_limit: formData.daily_withdrawal_limit,
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
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                {t.partnerManagement.commissionSettingsLabel}
              </Label>
              {formData.partner_type !== 'head_office' && parentCommission && (
                <Badge variant="outline" className="text-xs">
                  {t.partnerManagement.upperLimit} {parentCommission.rolling}% / {parentCommission.losing}% / {parentCommission.fee}%
                </Badge>
              )}
            </div>
            
            {formData.partner_type === 'head_office' ? (
              <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  🏢 <strong>대본사</strong>는 최상위 파트너로 커미션이 <strong>100%</strong>로 고정됩니다.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠️ 커미션 변경 시 정산에 즉시 반영되며, 상위 파트너 요율을 초과할 수 없습니다.
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="commission_rolling">{t.partnerManagement.rollingCommissionLabel}</Label>
                <Input
                  id="commission_rolling"
                  type="number"
                  step="0.1"
                  min="0"
                  max={formData.partner_type === 'head_office' ? 100 : parentCommission?.rolling || 100}
                  value={formData.commission_rolling}
                  onChange={(e) => setFormData(prev => ({ ...prev, commission_rolling: parseFloat(e.target.value) || 0 }))}
                  disabled={formData.partner_type === 'head_office'}
                  className={formData.partner_type === 'head_office' ? 'bg-muted' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.partner_type === 'head_office' ? '대본사 고정값' : t.partnerManagement.totalBettingAmount}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="commission_losing">{t.partnerManagement.losingCommissionLabel}</Label>
                <Input
                  id="commission_losing"
                  type="number"
                  step="0.1"
                  min="0"
                  max={formData.partner_type === 'head_office' ? 100 : parentCommission?.losing || 100}
                  value={formData.commission_losing}
                  onChange={(e) => setFormData(prev => ({ ...prev, commission_losing: parseFloat(e.target.value) || 0 }))}
                  disabled={formData.partner_type === 'head_office'}
                  className={formData.partner_type === 'head_office' ? 'bg-muted' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.partner_type === 'head_office' ? '대본사 고정값' : t.partnerManagement.memberNetLoss}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="withdrawal_fee">{t.partnerManagement.withdrawalFeeLabel}</Label>
                <Input
                  id="withdrawal_fee"
                  type="number"
                  step="0.1"
                  min="0"
                  max={formData.partner_type === 'head_office' ? 100 : parentCommission?.fee || 100}
                  value={formData.withdrawal_fee}
                  onChange={(e) => setFormData(prev => ({ ...prev, withdrawal_fee: parseFloat(e.target.value) || 0 }))}
                  disabled={formData.partner_type === 'head_office'}
                  className={formData.partner_type === 'head_office' ? 'bg-muted' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.partner_type === 'head_office' ? '대본사 고정값' : t.partnerManagement.withdrawalFeeDesc}
                </p>
              </div>
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