import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { DataTable } from "../common/DataTable";
import { 
  UserPlus, Save, Eye, EyeOff, Building2, 
  Database, Shield, Trash2, Edit, RefreshCw, 
  AlertCircle, Users 
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { createApiAccounts } from "../../lib/apiAccountManager";
import { useLanguage } from "../../contexts/LanguageContext";

interface PartnerFormData {
  username: string;
  nickname: string;
  password: string;
  partner_type: string;
  parent_id: string;
  level: number;
  commission_rolling: number;
  commission_losing: number;
  withdrawal_fee: number;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  contact_info: string;
  selected_parent_id?: string; // Lv1이 Lv3~Lv6 생성 시 소속 파트너 선택
}

interface PartnerCreationProps {
  user: Partner;
}

export function PartnerCreation({ user }: PartnerCreationProps) {
  const { t } = useLanguage();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [availableParents, setAvailableParents] = useState<Partner[]>([]); // 소속 파트너 목록
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState<PartnerFormData>({
    username: '',
    nickname: '',
    password: '',
    partner_type: 'head_office',
    parent_id: user.id,
    level: 2,
    commission_rolling: 0.5,
    commission_losing: 5.0,
    withdrawal_fee: 1.0,
    bank_name: '',
    bank_account: '',
    bank_holder: '',
    contact_info: '',
  });

  const partnerTypes = [
    { value: 'head_office', label: t.partnerCreation.partnerTypes.head_office, level: 2 },
    { value: 'main_office', label: t.partnerCreation.partnerTypes.main_office, level: 3 },
    { value: 'sub_office', label: t.partnerCreation.partnerTypes.sub_office, level: 4 },
    { value: 'distributor', label: t.partnerCreation.partnerTypes.distributor, level: 5 },
    { value: 'store', label: t.partnerCreation.partnerTypes.store, level: 6 },
  ];

  useEffect(() => {
    loadPartners();
    if (user.partner_type === 'system_admin') {
      loadAvailableParents();
    }
  }, []);

  const loadPartners = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('partners')
        .select('*')
        .order('created_at', { ascending: false });

      // 시스템관리자가 아니면 본인과 하위 파트너만 조회
      if (user.level > 1) {
        query = query.or(`parent_id.eq.${user.id},id.eq.${user.id}`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPartners(data || []);
    } catch (error) {
      console.error('Failed to load partners:', error);
      toast.error(t.partnerCreation.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Lv1(시스템관리자)이 Lv3~Lv6 생성 시 선택 가능한 파트너 목록 로드
   */
  const loadAvailableParents = async () => {
    try {
      // 대본사(Lv2) 목록 조회
      const { data: headOffices } = await supabase
        .from('partners')
        .select('id, username, nickname, partner_type, level')
        .eq('partner_type', 'head_office')
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      // 본사~매장 목록 조회
      const { data: otherPartners } = await supabase
        .from('partners')
        .select('id, username, nickname, partner_type, level')
        .in('partner_type', ['main_office', 'sub_office', 'distributor', 'store'])
        .eq('status', 'active')
        .order('level', { ascending: true })
        .order('created_at', { ascending: true });

      setAvailableParents([...(headOffices || []), ...(otherPartners || [])]);
    } catch (error) {
      console.error('소속 파트너 목록 로드 실패:', error);
    }
  };

  const handleInputChange = (field: keyof PartnerFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // 파트너 타입 변경 시 레벨 자동 설정
    if (field === 'partner_type') {
      const selectedType = partnerTypes.find(type => type.value === value);
      if (selectedType) {
        setFormData(prev => ({ ...prev, level: selectedType.level }));
      }
    }
  };

  const validateForm = () => {
    if (!formData.username.trim()) {
      toast.error(t.partnerCreation.enterUsername);
      return false;
    }
    if (!formData.nickname.trim()) {
      toast.error(t.partnerCreation.enterNickname);
      return false;
    }
    if (!formData.password.trim() || formData.password.length < 6) {
      toast.error(t.partnerCreation.enterPassword);
      return false;
    }
    
    // Lv1이 Lv3~Lv6 생성 시 소속 파트너 선택 필수
    if (user.partner_type === 'system_admin' && formData.partner_type !== 'head_office') {
      if (!formData.selected_parent_id) {
        toast.error(t.partnerCreation.selectParent);
        return false;
      }
    }
    
    return true;
  };

  const savePartner = async () => {
    if (!validateForm()) return;

    setSaving(true);
    const toastId = toast.loading(t.partnerCreation.creatingPartner);
    
    try {
      // 1. 아이디 중복 체크 (partners + users 테이블 모두 확인)
      const { data: existingPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('username', formData.username)
        .maybeSingle();

      if (existingPartner) {
        toast.error(t.partnerCreation.duplicatePartner.replace('{{username}}', formData.username), { id: toastId });
        setSaving(false);
        return;
      }

      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', formData.username)
        .maybeSingle();

      if (existingUser) {
        toast.error(t.partnerCreation.duplicateUser.replace('{{username}}', formData.username), { id: toastId });
        setSaving(false);
        return;
      }

      // 2. 실제 parent_id 결정
      let actualParentId = formData.parent_id;
      if (user.partner_type === 'system_admin' && formData.selected_parent_id) {
        actualParentId = formData.selected_parent_id;
      }

      toast.loading(t.partnerCreation.creatingStep, { id: toastId });

      // 3. 파트너 생성 (opcode 관련 컬럼 제거됨)
      const partnerData = {
        username: formData.username,
        nickname: formData.nickname,
        password_hash: formData.password, // 트리거에서 해시 처리
        partner_type: formData.partner_type,
        parent_id: actualParentId,
        level: formData.level,
        commission_rolling: formData.commission_rolling,
        commission_losing: formData.commission_losing,
        withdrawal_fee: formData.withdrawal_fee,
        bank_name: formData.bank_name,
        bank_account: formData.bank_account,
        bank_holder: formData.bank_holder,
        contact_info: formData.contact_info ? JSON.parse(`{"memo": "${formData.contact_info}"}`) : null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: newPartner, error: createError } = await supabase
        .from('partners')
        .insert([partnerData])
        .select()
        .single();

      if (createError) throw createError;

      // 4. api_configs는 Lv1(시스템관리자)만 사용
      //    DB 트리거(trigger_auto_create_api_config)가 Lv1 생성 시에만 빈 레코드 자동 생성
      //    Lv2(대본사)는 api_configs를 사용하지 않음

      toast.success(t.partnerCreation.createSuccess, { id: toastId });
      
      // 6. 폼 초기화
      setFormData({
        username: '',
        nickname: '',
        password: '',
        partner_type: 'head_office',
        parent_id: user.id,
        level: 2,
        commission_rolling: 0.5,
        commission_losing: 5.0,
        withdrawal_fee: 1.0,
        bank_name: '',
        bank_account: '',
        bank_holder: '',
        contact_info: '',
        selected_parent_id: undefined,
      });
      
      await loadPartners();
    } catch (error: any) {
      console.error('Failed to create partner:', error);
      toast.error(t.partnerCreation.createFailed.replace('{{error}}', error.message), { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const deletePartner = async (partnerId: string) => {
    try {
      // 1. 하위 파트너 확인
      const { data: childPartners, error: childCheckError } = await supabase
        .from('partners')
        .select('id, nickname, username')
        .eq('parent_id', partnerId);

      if (childCheckError) throw childCheckError;

      if (childPartners && childPartners.length > 0) {
        toast.error(t.partnerCreation.deleteHasChildren.replace('{{count}}', childPartners.length.toString()));
        return;
      }

      // 2. 소속 회원 확인
      const { data: users, error: userCheckError } = await supabase
        .from('users')
        .select('id, username, nickname')
        .eq('referrer_id', partnerId);

      if (userCheckError) throw userCheckError;

      if (users && users.length > 0) {
        toast.error(t.partnerCreation.deleteHasUsers.replace('{{count}}', users.length.toString()));
        return;
      }

      // 3. 최종 확인
      if (!confirm(t.partnerCreation.deleteConfirm)) return;

      // 4. 삭제 실행
      const { error } = await supabase
        .from('partners')
        .delete()
        .eq('id', partnerId);

      if (error) throw error;

      toast.success(t.partnerCreation.deleteSuccess);
      await loadPartners();
    } catch (error: any) {
      console.error('파트너 삭제 실패:', error);
      toast.error(t.partnerCreation.deleteFailed.replace('{{error}}', error.message));
    }
  };

  const getPartnerLevelText = (level: number): string => {
    return t.partnerCreation.levelText[level as keyof typeof t.partnerCreation.levelText] || t.partnerCreation.levelText.unknown;
  };

  const partnerColumns = [
    {
      key: "username",
      title: t.partnerCreation.username,
      sortable: true,
    },
    {
      key: "nickname",
      title: t.partnerCreation.nickname,
      sortable: true,
    },
    {
      key: "level",
      title: t.partnerCreation.grade,
      cell: (partner: Partner) => (
        <Badge variant={partner.level === 2 ? 'default' : 'secondary'}>
          {getPartnerLevelText(partner.level)}
        </Badge>
      ),
    },
    {
      key: "status",
      title: t.partnerCreation.status,
      cell: (partner: Partner) => (
        <Badge variant={partner.status === 'active' ? 'default' : 'secondary'}>
          {partner.status === 'active' ? t.partnerCreation.active : t.partnerCreation.inactive}
        </Badge>
      ),
    },
    {
      key: "balance",
      title: t.partnerCreation.balance,
      cell: (partner: Partner) => (
        <div className="text-right font-mono">
          {new Intl.NumberFormat('ko-KR').format(partner.balance || 0)}{t.partnerCreation.won}
        </div>
      ),
    },
    {
      key: "created_at",
      title: t.partnerCreation.createdAt,
      cell: (partner: Partner) => (
        <div className="text-sm text-muted-foreground">
          {new Date(partner.created_at).toLocaleDateString('ko-KR')}
        </div>
      ),
    },
    {
      key: "actions",
      title: t.partnerCreation.actions,
      cell: (partner: Partner) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => deletePartner(partner.id)}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
            disabled={partner.id === user.id}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">{t.partnerCreation.title}</h1>
          <p className="text-sm text-slate-400">
            {t.partnerCreation.description}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadPartners} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t.common.refresh}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {t.partnerCreation.createPartner}
            </CardTitle>
            <CardDescription>
              {t.partnerCreation.createDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t.partnerCreation.username}</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder={t.partnerCreation.usernamePlaceholder}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nickname">{t.partnerCreation.nickname}</Label>
                <Input
                  id="nickname"
                  value={formData.nickname}
                  onChange={(e) => handleInputChange('nickname', e.target.value)}
                  placeholder={t.partnerCreation.nicknamePlaceholder}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="password">{t.partnerCreation.password}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder={t.partnerCreation.passwordPlaceholder}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner_type">{t.partnerCreation.partnerGrade}</Label>
                <Select value={formData.partner_type} onValueChange={(value) => handleInputChange('partner_type', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.partnerCreation.selectGrade} />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerTypes
                      .filter(type => {
                        // ✅ 시스템관리자(level 1)는 모든 파트너 등급 생성 가능
                        if (user.level === 1) return true;
                        // 다른 레벨은 자신보다 하위 레벨만 생성 가능
                        return type.level > user.level;
                      })
                      .map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label} ({t.partnerCreation.level} {type.level})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t.partnerCreation.level}</Label>
                <Input
                  value={`${t.partnerCreation.level} ${formData.level}`}
                  readOnly
                  className="bg-muted"
                />
              </div>
            </div>

            {/* Lv1이 Lv3~Lv6 생성 시 소속 파트너 선택 */}
            {user.partner_type === 'system_admin' && formData.partner_type !== 'head_office' && availableParents.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="selected_parent">{t.partnerCreation.selectParentLabel}</Label>
                <Select 
                  value={formData.selected_parent_id || ''} 
                  onValueChange={(value) => handleInputChange('selected_parent_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.partnerCreation.selectParentPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableParents.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.nickname || parent.username} ({getPartnerLevelText(parent.level)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t.partnerCreation.parentDescription}
                </p>
              </div>
            )}

            {/* Lv2(대본사) 생성 시 안내 메시지 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span className="font-medium">{t.partnerCreation.commissionSettings}</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commission_rolling">{t.partnerCreation.rollingCommission}</Label>
                  <Input
                    id="commission_rolling"
                    type="number"
                    step="0.1"
                    value={formData.commission_rolling}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      handleInputChange('commission_rolling', isNaN(value) ? 0 : value);
                    }}
                    placeholder="0.5"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commission_losing">{t.partnerCreation.losingCommission}</Label>
                  <Input
                    id="commission_losing"
                    type="number"
                    step="0.1"
                    value={formData.commission_losing}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      handleInputChange('commission_losing', isNaN(value) ? 0 : value);
                    }}
                    placeholder="5.0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="withdrawal_fee">{t.partnerCreation.withdrawalFee}</Label>
                  <Input
                    id="withdrawal_fee"
                    type="number"
                    step="0.1"
                    value={formData.withdrawal_fee}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      handleInputChange('withdrawal_fee', isNaN(value) ? 0 : value);
                    }}
                    placeholder="1.0"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="font-medium">{t.partnerCreation.bankInfo}</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bank_name">{t.partnerCreation.bankName}</Label>
                  <Input
                    id="bank_name"
                    value={formData.bank_name}
                    onChange={(e) => handleInputChange('bank_name', e.target.value)}
                    placeholder={t.partnerCreation.bankNamePlaceholder}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bank_account">{t.partnerCreation.bankAccount}</Label>
                  <Input
                    id="bank_account"
                    value={formData.bank_account}
                    onChange={(e) => handleInputChange('bank_account', e.target.value)}
                    placeholder={t.partnerCreation.bankAccountPlaceholder}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bank_holder">{t.partnerCreation.bankHolder}</Label>
                  <Input
                    id="bank_holder"
                    value={formData.bank_holder}
                    onChange={(e) => handleInputChange('bank_holder', e.target.value)}
                    placeholder={t.partnerCreation.bankHolderPlaceholder}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_info">{t.partnerCreation.contactInfo}</Label>
              <Textarea
                id="contact_info"
                value={formData.contact_info}
                onChange={(e) => handleInputChange('contact_info', e.target.value)}
                placeholder={t.partnerCreation.contactInfoPlaceholder}
                rows={3}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={savePartner}
                disabled={saving}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? t.partnerCreation.creating : t.partnerCreation.createButton}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t.partnerCreation.partnerList}
            </CardTitle>
            <CardDescription>
              {t.partnerCreation.listDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <DataTable
                data={partners}
                columns={partnerColumns}
                loading={loading}
                searchPlaceholder={t.partnerCreation.searchPlaceholder}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}