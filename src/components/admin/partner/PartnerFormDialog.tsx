/**
 * 파트너 생성/수정 다이얼로그 - Lv1과 동일한 디자인
 */
import { useState, useEffect } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Badge } from "../../ui/badge";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from "../AdminDialog";
import { UserPlus, Building2, AlertCircle, Eye, EyeOff } from "lucide-react";
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
  currentUserId?: string;
  currentUserNickname?: string;
}

// 파트너 레벨 텍스트 반환 함수
const getPartnerLevelText = (level: number): string => {
  switch (level) {
    case 1: return "시스템관리자";
    case 2: return "운영사";
    case 3: return "본사";
    case 4: return "부본사";
    case 5: return "총판";
    case 6: return "매장";
    case 7: return "회원";
    default: return `Lv${level}`;
  }
};

export function PartnerFormDialog({
  open,
  onOpenChange,
  mode,
  partner,
  userLevel,
  onSuccess,
  onWebSocketUpdate,
  currentUserId,
  currentUserNickname
}: PartnerFormDialogProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // 파트너 타입 목록
  const partnerTypes = [
    { value: 'main_office', label: t.partnerCreation?.partnerTypes?.main_office || '본사', level: 3 },
    { value: 'sub_office', label: t.partnerCreation?.partnerTypes?.sub_office || '부본사', level: 4 },
    { value: 'distributor', label: t.partnerCreation?.partnerTypes?.distributor || '총판', level: 5 },
    { value: 'store', label: t.partnerCreation?.partnerTypes?.store || '매장', level: 6 },
  ];

  // userLevel에 따른 기본 partner_type 결정
  const getDefaultPartnerType = (): Partner['partner_type'] => {
    if (userLevel === 2) return 'main_office';
    if (userLevel === 3) return 'sub_office';
    if (userLevel === 4) return 'distributor';
    if (userLevel === 5) return 'store';
    return 'main_office';
  };

  const [formData, setFormData] = useState({
    username: "",
    nickname: "",
    password: "",
    password_confirm: "",
    partner_type: getDefaultPartnerType() as Partner['partner_type'],
    parent_id: "",
    selected_parent_id: "", // Lv2가 Lv3~Lv6 생성 시 소속 파트너 선택
    casino_rolling_commission: 0,
    losing_commission: 0, // 통합된 루징 커미션 (카지노/슬롯 공통)
    slot_rolling_commission: 0,
    withdrawal_fee: 0,
  });

  const [availableParents, setAvailableParents] = useState<Partner[]>([]); // 소속 가능한 상위 파트너 목록
  const [upperLevelPartners, setUpperLevelPartners] = useState<Partner[]>([]); // 상위 레벨 파트너 목록

  // 파트너 데이터 로드 (수정 모드)
  useEffect(() => {
    if (mode === 'edit' && partner) {
      loadPartnerData();
    } else if (mode === 'create' && open) {
      setFormData(prev => ({
        ...prev,
        partner_type: getDefaultPartnerType(),
        parent_id: currentUserId || ''
      }));
      loadAvailableParentsAndUpperLevelPartners();
    }
  }, [mode, partner, open, userLevel, currentUserId]);

  // 파트너 데이터 로드 (수정 모드)
  const loadPartnerData = async () => {
    if (!partner) return;

    setFormData({
      username: partner.username,
      nickname: partner.nickname,
      password: "",
      password_confirm: "",
      partner_type: partner.partner_type,
      parent_id: partner.parent_id || "",
      selected_parent_id: "",
      casino_rolling_commission: partner.casino_rolling_commission || 0,
      losing_commission: partner.casino_losing_commission || 0, // 통합된 루징 커미션 (카지노/슬롯 공통)
      slot_rolling_commission: partner.slot_rolling_commission || 0,
      withdrawal_fee: partner.withdrawal_fee || 0,
    });
  };

  // 소속 파트너 및 상위 레벨 파트너 목록 로드
  const loadAvailableParentsAndUpperLevelPartners = async () => {
    if (!currentUserId || userLevel === undefined) return;

    try {
      // 현재 선택된 파트너 타입의 레벨
      const selectedLevel = partnerTypes.find(type => type.value === formData.partner_type)?.level || 0;

      // Lv2~Lv5: 본인이 상위 파트너 (고정)
      if (userLevel >= 2 && userLevel <= 5) {
        setUpperLevelPartners([]);
        setAvailableParents([]);
        return;
      }

      // Lv1만 소속 파트너 선택 가능
      if (userLevel === 1 && selectedLevel > 2) {
        // Lv1이 Lv3~Lv6 생성 시: 모든 상위 파트너 조회 (Lv1은 모든 조직 접근 가능)
        const targetParentLevel = selectedLevel - 1;
        const { data: parentsData } = await supabase
          .from('partners')
          .select('*')
          .eq('level', targetParentLevel)
          .order('created_at', { ascending: false });

        setAvailableParents(parentsData || []);
      }
    } catch (error) {
      console.error('소속 파트너 목록 로드 실패:', error);
    }
  };

  // 파트너 타입 변경 시 소속 파트너 목록 갱신
  useEffect(() => {
    if (mode === 'create' && open) {
      loadAvailableParentsAndUpperLevelPartners();
    }
  }, [formData.partner_type]);

  const resetForm = () => {
    setFormData({
      username: "",
      nickname: "",
      password: "",
      password_confirm: "",
      partner_type: getDefaultPartnerType(),
      parent_id: "",
      selected_parent_id: "",
      casino_rolling_commission: 0,
      losing_commission: 0, // 통합된 루징 커미션 (카지노/슬롯 공통)
      slot_rolling_commission: 0,
      withdrawal_fee: 0,
    });
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      if (mode === 'create') {
        // 생성 로직
        if (!formData.username.trim()) {
          toast.error(t.partnerManagement.enterUsernameError || "아이디를 입력하세요");
          return;
        }
        if (!formData.nickname.trim()) {
          toast.error(t.partnerManagement.enterNicknameError || "닉네임을 입력하세요");
          return;
        }
        if (!formData.password.trim()) {
          toast.error(t.partnerManagement.enterPasswordError || "비밀번호를 입력하세요");
          return;
        }
        if (formData.password !== formData.password_confirm) {
          toast.error(t.partnerManagement.passwordMismatchError || "비밀번호가 일치하지 않습니다");
          return;
        }

        const newPartnerId = crypto.randomUUID();

        // 실제 parent_id 결정: selected_parent_id가 있으면 우선, 없으면 parent_id
        const actualParentId = formData.selected_parent_id || formData.parent_id;

        const partnerLevel = partnerTypes.find(type => type.value === formData.partner_type)?.level || 3;

        const createData = {
          id: newPartnerId,
          username: formData.username.trim(),
          nickname: formData.nickname.trim(),
          password_hash: formData.password.trim(),
          partner_type: formData.partner_type,
          parent_id: actualParentId || null,
          level: partnerLevel,
          status: 'active',
          balance: 0,
          casino_rolling_commission: formData.casino_rolling_commission || 0,
          casino_losing_commission: formData.losing_commission || 0, // 통합된 루징 커미션 (카지노/슬롯 공통)
          slot_rolling_commission: formData.slot_rolling_commission || 0,
          slot_losing_commission: formData.losing_commission || 0, // 통합된 루징 커미션 (카지노/슬롯 공통)
          commission_rolling: formData.casino_rolling_commission || 0,
          commission_losing: formData.losing_commission || 0, // 통합된 루징 커미션 (카지노/슬롯 공통)
          withdrawal_fee: formData.withdrawal_fee || 0,
          invest_balance: 0,
          oroplay_balance: 0,
          familyapi_balance: 0,
          honorapi_balance: 0,
          selected_apis: [],
        };

        console.log('🔧 파트너 생성 데이터:', createData);

        const { data: newPartner, error: createError } = await supabase
          .from('partners')
          .insert([createData])
          .select()
          .single();

        if (createError) {
          console.error('❌ 파트너 생성 실패:', createError);
          throw createError;
        }

        console.log('✅ 파트너 생성 성공:', newPartner);

        toast.success(t.partnerManagement.partnerCreatedSuccess || "파트너가 생성되었습니다");
        onSuccess();
        onOpenChange(false);
        resetForm();
      } else {
        // 수정 로직
        if (!partner) return;

        // 비밀번호 변경 시 확인 검증
        if (formData.password && formData.password.trim() !== '') {
          if (formData.password !== formData.password_confirm) {
            toast.error(t.partnerManagement.passwordMismatchError || "비밀번호가 일치하지 않습니다");
            return;
          }
        }

        const updateData: any = {
          nickname: formData.nickname,
          casino_rolling_commission: formData.casino_rolling_commission,
          casino_losing_commission: formData.losing_commission, // 통합된 루징 커미션 (카지노/슬롯 공통)
          slot_rolling_commission: formData.slot_rolling_commission,
          slot_losing_commission: formData.losing_commission, // 통합된 루징 커미션 (카지노/슬롯 공통)
          commission_rolling: formData.casino_rolling_commission,
          commission_losing: formData.losing_commission, // 통합된 루징 커미션 (카지노/슬롯 공통)
          withdrawal_fee: formData.withdrawal_fee,
          updated_at: new Date().toISOString(),
        };

        if (formData.password && formData.password.trim() !== '') {
          updateData.password_hash = formData.password;
        }

        const { error } = await supabase
          .from('partners')
          .update(updateData)
          .eq('id', partner.id);

        if (error) throw error;

        toast.success(t.partnerManagement.partnerUpdatedSuccess || "파트너 정보가 수정되었습니다");
        
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
        ? (t.partnerManagement.createPartnerError || "파트너 생성 실패")
        : (t.partnerManagement.updatePartnerError || "파트너 수정 실패")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlus className="h-6 w-6" />
            {mode === 'create' ? (t.partnerCreation?.createPartner || '새 파트너 생성') : '파트너 정보 수정'}
          </DialogTitle>
          <DialogDescription className="text-base">
            {mode === 'create' 
              ? (t.partnerCreation?.createDescription || '새로운 파트너를 생성합니다.')
              : '파트너의 정보를 수정합니다.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-5 py-3">
          {/* 아이디/닉네임 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-base">{t.partnerCreation?.username || '아이디'}</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                placeholder={t.partnerCreation?.usernamePlaceholder || '아이디를 입력하세요'}
                disabled={mode === 'edit'}
                className={`h-11 text-base ${mode === 'edit' ? 'bg-muted' : ''}`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname" className="text-base">{t.partnerCreation?.nickname || '닉네임'}</Label>
              <Input
                id="nickname"
                value={formData.nickname}
                onChange={(e) => handleInputChange('nickname', e.target.value)}
                placeholder={t.partnerCreation?.nicknamePlaceholder || '닉네임을 입력하세요'}
                className="h-11 text-base"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="password" className="text-base">
                {mode === 'create' ? (t.partnerCreation?.password || '비밀번호') : '비밀번호 변경'}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder={mode === 'create' 
                    ? (t.partnerCreation?.passwordPlaceholder || '비밀번호를 입력하세요')
                    : '변경할 비밀번호를 입력하세요 (변경 시에만)'
                  }
                  className="h-11 text-base pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-11 px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="password_confirm" className="text-base">
                {mode === 'create' ? (t.partnerCreation?.passwordConfirm || '비밀번호 확인') : '비밀번호 확인'}
              </Label>
              <div className="relative">
                <Input
                  id="password_confirm"
                  type={showPasswordConfirm ? "text" : "password"}
                  value={formData.password_confirm}
                  onChange={(e) => handleInputChange('password_confirm', e.target.value)}
                  placeholder={mode === 'create' 
                    ? (t.partnerCreation?.passwordConfirmPlaceholder || '비밀번호를 다시 입력하세요')
                    : '변경할 비밀번호를 다시 입력하세요 (변경 시에만)'
                  }
                  className="h-11 text-base pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-11 px-3 hover:bg-transparent"
                  onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                >
                  {showPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* 파트너 등급 (생성시에만) */}
            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="partner_type" className="text-base">{t.partnerCreation?.partnerGrade || '파트너 등급'}</Label>
                <Select value={formData.partner_type} onValueChange={(value) => handleInputChange('partner_type', value)}>
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue placeholder={t.partnerCreation?.selectGrade || '등급 선택'} />
                  </SelectTrigger>
                  <SelectContent className="text-base">
                    {partnerTypes
                      .filter(type => {
                        // Lv2: 본사만
                        if (userLevel === 2) return type.value === 'main_office';
                        // Lv3: 부본사만
                        if (userLevel === 3) return type.value === 'sub_office';
                        // Lv4: 총판만
                        if (userLevel === 4) return type.value === 'distributor';
                        // Lv5: 매장만
                        if (userLevel === 5) return type.value === 'store';
                        return false;
                      })
                      .map((type) => (
                        <SelectItem key={type.value} value={type.value} className="text-base py-2">
                          {type.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 상위 파트너 (생성시에만) */}
            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="upper_partner" className="text-base">상위 파트너</Label>
                {upperLevelPartners.length > 0 ? (
                  <Select 
                    value={formData.parent_id || ''} 
                    onValueChange={(value) => handleInputChange('parent_id', value)}
                  >
                    <SelectTrigger className="h-11 text-base" id="upper_partner">
                      <SelectValue placeholder="상위 파트너를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent className="text-base">
                      {upperLevelPartners.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-base py-2">
                          {p.nickname || p.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="upper_partner"
                    value={currentUserNickname || '현재 계정'}
                    readOnly
                    className="bg-muted h-11 text-base"
                  />
                )}
              </div>
            )}
          </div>

          {/* Lv2가 Lv3~Lv6 생성 시 소속 파트너 선택 */}
          {userLevel === 2 && mode === 'create' && formData.partner_type !== 'main_office' && availableParents.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="selected_parent" className="text-base">{t.partnerCreation?.selectParentLabel || '소속 파트너 선택'}</Label>
              <Select 
                value={formData.selected_parent_id || ''} 
                onValueChange={(value) => handleInputChange('selected_parent_id', value)}
              >
                <SelectTrigger className="h-11 text-base">
                  <SelectValue placeholder={t.partnerCreation?.selectParentPlaceholder || '소속될 파트너를 선택하세요'} />
                </SelectTrigger>
                <SelectContent className="text-base">
                  {availableParents.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id} className="text-base py-2">
                      {parent.nickname || parent.username} ({getPartnerLevelText(parent.level)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {t.partnerCreation?.parentDescription || '생성될 파트너가 소속될 상위 파트너를 선택합니다.'}
              </p>
            </div>
          )}

          {/* 커미션 설정 */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <span className="text-base font-medium">{t.partnerCreation?.commissionSettings || '커미션 설정'}</span>
            </div>
            
            {/* 카지노 커미션 */}
            <div className="space-y-3">
              <Label className="text-base text-blue-400">카지노 커미션</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="casino_rolling_commission" className="text-sm text-muted-foreground">카지노 롤링 커미션 (%)</Label>
                  <Input
                    id="casino_rolling_commission"
                    type="number"
                    step="0.1"
                    value={formData.casino_rolling_commission === 0 ? '' : formData.casino_rolling_commission}
                    onChange={(e) => {
                      if (e.target.value === '') {
                        handleInputChange('casino_rolling_commission', 0);
                        return;
                      }
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        handleInputChange('casino_rolling_commission', value);
                      }
                    }}
                    onBlur={(e) => {
                      let value = parseFloat(e.target.value);
                      if (isNaN(value) || value < 0) value = 0;
                      if (value > 100) value = 100;
                      handleInputChange('casino_rolling_commission', value);
                    }}
                    placeholder="10"
                    className="h-11 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="losing_commission" className="text-sm text-muted-foreground">루징 커미션 (%) - 카지노/슬롯 공통</Label>
                  <Input
                    id="losing_commission"
                    type="number"
                    step="0.1"
                    value={formData.losing_commission === 0 ? '' : formData.losing_commission}
                    onChange={(e) => {
                      if (e.target.value === '') {
                        handleInputChange('losing_commission', 0);
                        return;
                      }
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        handleInputChange('losing_commission', value);
                      }
                    }}
                    onBlur={(e) => {
                      let value = parseFloat(e.target.value);
                      if (isNaN(value) || value < 0) value = 0;
                      if (value > 100) value = 100;
                      handleInputChange('losing_commission', value);
                    }}
                    placeholder="10"
                    className="h-11 text-base"
                  />
                </div>
              </div>
            </div>

            {/* 슬롯 커미션 */}
            <div className="space-y-3">
              <Label className="text-base text-purple-400">슬롯 커미션</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="slot_rolling_commission" className="text-sm text-muted-foreground">슬롯 롤링 커미션 (%)</Label>
                  <Input
                    id="slot_rolling_commission"
                    type="number"
                    step="0.1"
                    value={formData.slot_rolling_commission === 0 ? '' : formData.slot_rolling_commission}
                    onChange={(e) => {
                      if (e.target.value === '') {
                        handleInputChange('slot_rolling_commission', 0);
                        return;
                      }
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        handleInputChange('slot_rolling_commission', value);
                      }
                    }}
                    onBlur={(e) => {
                      let value = parseFloat(e.target.value);
                      if (isNaN(value) || value < 0) value = 0;
                      if (value > 100) value = 100;
                      handleInputChange('slot_rolling_commission', value);
                    }}
                    placeholder="10"
                    className="h-11 text-base"
                  />
                </div>
              </div>
            </div>

            {/* 출금 수수료 */}
            <div className="space-y-2">
              <Label htmlFor="withdrawal_fee" className="text-base">출금 수수료 (%)</Label>
              <Input
                id="withdrawal_fee"
                type="number"
                step="0.1"
                value={formData.withdrawal_fee === 0 ? '' : formData.withdrawal_fee}
                onChange={(e) => {
                  if (e.target.value === '') {
                    handleInputChange('withdrawal_fee', 0);
                    return;
                  }
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value)) {
                    handleInputChange('withdrawal_fee', value);
                  }
                }}
                onBlur={(e) => {
                  let value = parseFloat(e.target.value);
                  if (isNaN(value) || value < 0) value = 0;
                  if (value > 100) value = 100;
                  handleInputChange('withdrawal_fee', value);
                }}
                placeholder="0"
                className="h-11 text-base"
              />
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
            className="h-11 text-base px-6"
          >
            {t.common?.cancel || '취소'}
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading}
            className="h-11 text-base px-6"
          >
            {loading 
              ? (mode === 'create' ? (t.partnerManagement?.creating || '생성 중...') : '수정 중...') 
              : (mode === 'create' ? (t.partnerManagement?.createPartnerButton || '파트너 생성') : (t.common?.save || '저장'))
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}