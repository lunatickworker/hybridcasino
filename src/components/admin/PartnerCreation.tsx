import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { DataTableLarge } from "../common/DataTableLarge";
import { 
  UserPlus, Save, Building2, 
  Database, Shield, Trash2, Edit, RefreshCw, 
  AlertCircle, Users, Gamepad2, CreditCard, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { createApiAccounts } from "../../lib/apiAccountManager";
import { useLanguage } from "../../contexts/LanguageContext";
import { GameAccessSelector } from "./GameAccessSelector";

interface GameAccess {
  api_provider: string;
  game_provider_id?: string;
  game_id?: string;
  access_type: 'provider' | 'game';
}

interface PartnerFormData {
  username: string;
  nickname: string;
  password: string;
  partner_type: string;
  parent_id: string;
  level: number;
  commission_rolling: number;
  commission_losing: number;
  casino_rolling_commission: number;
  casino_losing_commission: number;
  slot_rolling_commission: number;
  slot_losing_commission: number;
  withdrawal_fee: number;
  selected_parent_id?: string; // Lv1이 Lv3~Lv6 생성 시 소속 파트너 선택
  timezone_offset?: number; // LV2 대본사의 타임존 오프셋
  selected_apis?: string[]; // Lv2 생성 시 사용할 API 선택
  game_access?: GameAccess[]; // Lv6/Lv7 생성 시 게임 접근 권한
}

interface PartnerCreationProps {
  user: Partner;
}

export function PartnerCreation({ user }: PartnerCreationProps) {
  const { t } = useLanguage();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [availableParents, setAvailableParents] = useState<Partner[]>([]); // 소속 파트너 목록
  const [upperLevelPartners, setUpperLevelPartners] = useState<Partner[]>([]); // 상위 레벨 파트너 목록
  const [parentApis, setParentApis] = useState<string[]>([]); // 상위 파트너의 selected_apis
  const [loading, setLoading] = useState(false); // ⚡ 초기 로딩을 false로 변경
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 사용 가능한 API 목록
  const availableApis = [
    { value: 'invest', label: 'Invest API', description: '인베스트 게임 API' },
    { value: 'oroplay', label: 'OroPlay API', description: '오로플레이 게임 API' },
    { value: 'familyapi', label: 'Family API', description: '패밀리 게임 API' },
    { value: 'honorapi', label: 'Honor API', description: '아너 게임 API' },
  ];

  const partnerTypes = useMemo(() => [
    { value: 'head_office', label: t.partnerCreation.partnerTypes.head_office, level: 2 },
    { value: 'main_office', label: t.partnerCreation.partnerTypes.main_office, level: 3 },
    { value: 'sub_office', label: t.partnerCreation.partnerTypes.sub_office, level: 4 },
    { value: 'distributor', label: t.partnerCreation.partnerTypes.distributor, level: 5 },
    { value: 'store', label: t.partnerCreation.partnerTypes.store, level: 6 },
  ], [t]);

  // 🎯 현재 사용자의 바로 아래 레벨의 파트너 타입을 기본값으로 설정
  const getDefaultPartnerType = () => {
    const nextLevel = user.level + 1;
    const defaultType = partnerTypes.find(type => type.level === nextLevel);
    return defaultType || partnerTypes[0];
  };
  
  const [formData, setFormData] = useState<PartnerFormData>(() => {
    const defaultType = getDefaultPartnerType();
    return {
      username: '',
      nickname: '',
      password: '',
      partner_type: defaultType.value,
      parent_id: user.id,
      level: defaultType.level,
      commission_rolling: 0,
      commission_losing: 0,
      casino_rolling_commission: 0,
      casino_losing_commission: 0,
      slot_rolling_commission: 0,
      slot_losing_commission: 0,
      withdrawal_fee: 0,
      selected_parent_id: undefined,
      timezone_offset: 9, // 기본값 명시적으로 설정
      selected_apis: [], // API 선택 초기값
      game_access: [], // 게임 접근 권한 초기값
    };
  });

  const timezoneOptions = useMemo(() => 
    Array.from({ length: 27 }, (_, i) => {
      const offset = i - 12;
      return {
        value: String(offset),
        label: `UTC${offset >= 0 ? '+' : ''}${offset}${offset === 9 ? ' (KST)' : ''}`
      };
    }),
    []
  );

  useEffect(() => {
    loadPartners();
    if (user.partner_type === 'system_admin') {
      loadAvailableParents();
    }
    // 초기 상위 파트너 목록 로드 - 기본 파트너 타입의 레벨 사용
    const defaultType = getDefaultPartnerType();
    loadUpperLevelPartners(defaultType.level, true);

    // ✅ Supabase Realtime 구독 - partners 테이블 변경사항 실시간 감지
    const partnersSubscription = supabase
      .channel('partners-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모두 감지
          schema: 'public',
          table: 'partners'
        },
        (payload) => {
          console.log('🔔 Partners 테이블 변경 감지:', payload);
          
          // 깜박임 없이 데이터만 업데이트
          setPartners((currentPartners) => {
            if (payload.eventType === 'INSERT') {
              // ✅ 중복 방지: 이미 존재하는 파트너면 추가하지 않음
              const newPartner = payload.new as Partner;
              const exists = currentPartners.some(p => p.id === newPartner.id);
              if (exists) {
                console.warn('⚠️ [Realtime] 중복된 파트너 INSERT 무시:', newPartner.id);
                return currentPartners;
              }
              return [newPartner, ...currentPartners];
            } else if (payload.eventType === 'UPDATE') {
              // 파트너 정보 업데이트 (보유금 변경 포함)
              return currentPartners.map((p) =>
                p.id === payload.new.id ? { ...p, ...(payload.new as Partner) } : p
              );
            } else if (payload.eventType === 'DELETE') {
              // 파트너 삭제
              return currentPartners.filter((p) => p.id !== payload.old.id);
            }
            return currentPartners;
          });
        }
      )
      .subscribe();

    // Cleanup - 구독 해제
    return () => {
      partnersSubscription.unsubscribe();
    };
  }, []);

  const loadPartners = async () => {
    setLoading(true);
    try {
      let allPartners: any[] = [];

      if (user.level === 1) {
        // 시스템 관리자: 모든 파트너 직접 조회
        const { data, error } = await supabase
          .from('partners')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        allPartners = data || [];
      } else {
        // 일반 파트너: 재귀적으로 모든 하위 파트너 조회
        const allPartnerIds: string[] = [];
        let currentLevelIds = [user.id];
        
        // 최대 6단계까지 재귀 조회 (Lv2 -> Lv3,4,5,6 / Lv3 -> Lv4,5,6)
        for (let level = 0; level < 6; level++) {
          if (currentLevelIds.length === 0) break;
          
          const { data: nextLevelPartners, error } = await supabase
            .from('partners')
            .select('id')
            .in('parent_id', currentLevelIds);
          
          if (error) throw error;
          
          if (nextLevelPartners && nextLevelPartners.length > 0) {
            const nextIds = nextLevelPartners.map(p => p.id);
            allPartnerIds.push(...nextIds);
            currentLevelIds = nextIds;
          } else {
            break;
          }
        }
        
        // 모든 하위 파트너의 전체 정보 조회
        if (allPartnerIds.length > 0) {
          const { data, error } = await supabase
            .from('partners')
            .select('*')
            .in('id', allPartnerIds)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          allPartners = data || [];
        }
      }
      
      console.log('✅ [파트너생성관리] 로드된 파트너 수:', allPartners.length, '현재 사용자 ID:', user.id);
      console.log('✅ [파트너생성관리] 파트너 목록:', allPartners);
      
      // ✅ 중복 제거: ID 기준으로 유니크한 파트너만 유지
      const uniquePartners = allPartners.reduce((acc, current) => {
        const exists = acc.find(p => p.id === current.id);
        if (!exists) {
          acc.push(current);
        } else {
          console.warn('⚠️ [loadPartners] 중복된 파트너 ID 발견:', current.id, current.username);
        }
        return acc;
      }, [] as typeof allPartners);
      
      setPartners(uniquePartners);
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
    
    // 파트너 타입 변경 시 레벨 자동 설정 및 상위 레벨 파트너 로드
    if (field === 'partner_type') {
      const selectedType = partnerTypes.find(type => type.value === value);
      if (selectedType) {
        setFormData(prev => ({ ...prev, level: selectedType.level, parent_id: '' }));
        // 상위 레벨 파트너 목록 로드 (자동 선택 포함)
        loadUpperLevelPartners(selectedType.level, true);
      }
    }

    // Lv6/Lv7 생성 시 상위 Lv2의 selected_apis 자동 로드
    if (field === 'partner_type' && (value === 'store' || value === 'user')) {
      loadParentApis();
    }
  };

  // ⚡ 최적화된 상위 레벨 파트너 목록 로드
  const loadUpperLevelPartners = async (selectedLevel: number, autoSelect: boolean = false) => {
    try {
      // 선택된 레벨의 상위 레벨 계산 (예: Lv3 선택 시 Lv2 파트너 목록)
      const upperLevel = selectedLevel - 1;
      
      if (upperLevel < 1) {
        setUpperLevelPartners([]);
        return;
      }

      let partnersData: Partner[] = [];

      // ✅ Lv1: 모든 상위 레벨 파트너 조회
      if (user.level === 1) {
        const { data } = await supabase
          .from('partners')
          .select('id, username, nickname, partner_type, level')
          .eq('level', upperLevel)
          .eq('status', 'active')
          .order('created_at', { ascending: true });
        
        partnersData = data || [];
      } else {
        // ⚡ Lv2~Lv6: BFS 방식으로 하위 파트너 조회 (배치 쿼리)
        // 1. 나 자신이 해당 레벨이면 포함
        if (user.level === upperLevel) {
          partnersData.push({
            id: user.id,
            username: user.username,
            nickname: user.nickname || user.username,
            partner_type: user.partner_type,
            level: user.level
          });
        }

        // 2. BFS로 모든 하위 파트너 ID 수집
        const myDescendantIds: string[] = [user.id];
        const queue = [user.id];
        
        while (queue.length > 0) {
          const currentBatch = queue.splice(0, queue.length);
          
          const { data: children } = await supabase
            .from('partners')
            .select('id')
            .in('parent_id', currentBatch);
          
          if (children && children.length > 0) {
            const childIds = children.map(c => c.id);
            myDescendantIds.push(...childIds);
            queue.push(...childIds);
          }
        }
        
        // 3. 하위 파트너들 중 해당 레벨인 것만 필터링 (한 번의 쿼리로)
        if (myDescendantIds.length > 0) {
          const { data } = await supabase
            .from('partners')
            .select('id, username, nickname, partner_type, level')
            .in('id', myDescendantIds)
            .eq('level', upperLevel)
            .eq('status', 'active')
            .order('created_at', { ascending: true });
          
          // 나 자신은 이미 추가했으므로 중복 제거
          const additionalPartners = (data || []).filter(p => p.id !== user.id);
          partnersData.push(...additionalPartners);
        }
      }

      setUpperLevelPartners(partnersData);

      // 🎯 자동 선택: 현재 로그인한 계정이 목록에 있으면 선택, 없으면 첫 번째 선택
      if (autoSelect && partnersData.length > 0) {
        const currentUserInList = partnersData.find(p => p.id === user.id);
        const defaultParentId = currentUserInList ? user.id : partnersData[0].id;
        setFormData(prev => ({ ...prev, parent_id: defaultParentId }));
      }
    } catch (error) {
      console.error('상위 레벨 파트너 로드 실패:', error);
      setUpperLevelPartners([]);
    }
  };

  // 상위 Lv2의 selected_apis 로드
  const loadParentApis = async () => {
    try {
      // 현재 사용자에서 Lv2까지 추적
      let currentParentId = user.parent_id || user.id;
      let lv2Partner = null;

      // Lv2를 찾을 때까지 상위로 추적
      for (let i = 0; i < 10; i++) {
        const { data: parent } = await supabase
          .from('partners')
          .select('id, level, parent_id, selected_apis')
          .eq('id', currentParentId)
          .single();

        if (!parent) break;

        if (parent.level === 2) {
          lv2Partner = parent;
          break;
        }

        if (!parent.parent_id) break;
        currentParentId = parent.parent_id;
      }

      if (lv2Partner && lv2Partner.selected_apis) {
        setParentApis(lv2Partner.selected_apis as string[]);
      } else {
        setParentApis([]);
      }
    } catch (error) {
      console.error('상위 파트너 API 로드 실패:', error);
      setParentApis([]);
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

    // Lv3~Lv6 생성 시 상위 파트너 선택 필수
    if (formData.level >= 3 && (!formData.parent_id || formData.parent_id.trim() === '')) {
      toast.error('파트너 생성 시 상위 파트너를 반드시 선택해야 합니다.');
      return false;
    }

    return true;
  };

  const savePartner = async () => {
    if (!validateForm()) return;

    // ⚠️ 중복 실행 방지: saving이 이미 true면 즉시 리턴
    if (saving) {
      console.warn('⚠️ [파트너 생성] 이미 생성 중입니다. 중복 실행 방지.');
      return;
    }

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
      const partnerData:  any = {
        username: formData.username,
        nickname: formData.nickname,
        password_hash: formData.password, // 트리거에서 해시 처리
        partner_type: formData.partner_type,
        parent_id: actualParentId,
        level: formData.level,
        commission_rolling: formData.commission_rolling,
        commission_losing: formData.commission_losing,
        casino_rolling_commission: formData.casino_rolling_commission,
        casino_losing_commission: formData.casino_losing_commission,
        slot_rolling_commission: formData.slot_rolling_commission,
        slot_losing_commission: formData.slot_losing_commission,
        withdrawal_fee: formData.withdrawal_fee,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // LV2(대본사)인 경우 timezone_offset 추가
      if (formData.partner_type === 'head_office' && formData.timezone_offset !== undefined) {
        partnerData.timezone_offset = formData.timezone_offset;
      }

      // ✅ LV2(대본사)인 경우 selected_apis 저장 (하위 파트너들이 상위 API를 상속받기 위함)
      if (formData.partner_type === 'head_office' && formData.selected_apis && formData.selected_apis.length > 0) {
        partnerData.selected_apis = formData.selected_apis;
      }

      const { data: newPartner, error: createError } = await supabase
        .from('partners')
        .insert([partnerData])
        .select()
        .single();

      if (createError) throw createError;

      // 4. ✅ api_configs는 Lv1(시스템관리자)만 생성
      // Lv2~Lv7은 GMS 머니만 사용하므로 api_configs 불필요
      if (formData.partner_type === 'system_admin') {
        const { error: apiConfigError } = await supabase
          .from('api_configs')
          .insert([
            {
              partner_id: newPartner.id,
              api_provider: 'invest',
              balance: 0,
              is_active: true,
            },
            {
              partner_id: newPartner.id,
              api_provider: 'oroplay',
              balance: 0,
              is_active: false,
            }
          ]);

        if (apiConfigError) {
          console.warn('⚠️ [파트너 생성] API config 생성 실패 (무시):', apiConfigError);
        } else {
          console.log('✅ [파트너 생성] API config 생성 완료:', newPartner.id);
        }
      }

      // 5. LV2(대본사) 생성 시 선택한 API 추가
      if (formData.partner_type === 'head_office' && formData.selected_apis && formData.selected_apis.length > 0) {
        const apiConfigData = formData.selected_apis.map(api => ({
          partner_id: newPartner.id,
          api_provider: api,
          balance: 0,
          is_active: true,
        }));

        const { error: apiConfigError } = await supabase
          .from('api_configs')
          .insert(apiConfigData);

        if (apiConfigError) {
          console.warn('⚠️ [파트너 생성] API config 생성 실패 (무시):', apiConfigError);
        } else {
          console.log('✅ [파트너 생성] API config 생성 완료:', newPartner.id);
        }
      }

      // 6. LV6/LV7 생성 시 게임 접근 권한 추가
      if (formData.game_access && formData.game_access.length > 0) {
        const gameAccessData = formData.game_access.map(access => ({
          partner_id: newPartner.id,
          api_provider: access.api_provider,
          game_provider_id: access.game_provider_id,
          game_id: access.game_id,
          access_type: access.access_type,
        }));

        const { error: gameAccessError } = await supabase
          .from('partner_game_access')
          .insert(gameAccessData);

        if (gameAccessError) {
          console.warn('⚠️ [파트너 생성] 게임 접근 권한 생성 실패 (무시):', gameAccessError);
        } else {
          console.log('✅ [파트너 생성] 게임 접근 권한 생성 완료:', newPartner.id);
        }
      }

      toast.success(t.partnerCreation.createSuccess, { id: toastId });
      
      // 7. 폼 초기화
      setFormData({
        username: '',
        nickname: '',
        password: '',
        partner_type: 'head_office',
        parent_id: user.id,
        level: 2,
        commission_rolling: 0,
        commission_losing: 0,
        casino_rolling_commission: 0,
        casino_losing_commission: 0,
        slot_rolling_commission: 0,
        slot_losing_commission: 0,
        withdrawal_fee: 0,
        selected_parent_id: undefined,
        timezone_offset: 9, // 기본값 명시적으로 설정
        selected_apis: [], // API 선택 초기값
        game_access: [], // 게임 접근 권한 초기값
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
    const levelTexts: Record<string, string> = {
      '1': t.partnerCreation.levelText['1'],
      '2': t.partnerCreation.levelText['2'],
      '3': t.partnerCreation.levelText['3'],
      '4': t.partnerCreation.levelText['4'],
      '5': t.partnerCreation.levelText['5'],
      '6': t.partnerCreation.levelText['6'],
    };
    return levelTexts[String(level)] || t.partnerCreation.levelText.unknown;
  };

  const getPartnerTypeText = (partner_type: string): string => {
    const typeTexts: Record<string, string> = {
      'system_admin': t.partnerCreation.partnerTypes.system_admin,
      'head_office': t.partnerCreation.partnerTypes.head_office,
      'main_office': t.partnerCreation.partnerTypes.main_office,
      'sub_office': t.partnerCreation.partnerTypes.sub_office,
      'distributor': t.partnerCreation.partnerTypes.distributor,
      'store': t.partnerCreation.partnerTypes.store,
    };
    return typeTexts[partner_type] || '';
  };

  const partnerColumns = [
    {
      key: "username",
      title: "아이디",
      sortable: true,
    },
    {
      key: "nickname",
      title: "닉네임",
      sortable: true,
    },
    {
      key: "level",
      title: "등급",
      cell: (partner: Partner) => (
        <Badge variant={partner.level === 2 ? 'default' : 'secondary'} className="text-base py-2 px-3">
          {getPartnerTypeText(partner.partner_type)}
        </Badge>
      ),
    },
    {
      key: "rolling_rate",
      title: "롤링률",
      cell: (partner: Partner) => (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-blue-400">카지노:</span>
            <span className="font-mono">{partner.casino_rolling_commission || 0}%</span>
          </div>
          <span className="text-muted-foreground">/</span>
          <div className="flex items-center gap-1">
            <span className="text-purple-400">슬롯:</span>
            <span className="font-mono">{partner.slot_rolling_commission || 0}%</span>
          </div>
        </div>
      ),
    },
    {
      key: "losing_rate",
      title: "루징률",
      cell: (partner: Partner) => (
        <div className="font-mono">
          {partner.casino_losing_commission || 0}%
        </div>
      ),
    },
    {
      key: "status",
      title: "상태",
      cell: (partner: Partner) => (
        <Badge variant={partner.status === 'active' ? 'default' : 'secondary'} className="text-base py-2 px-3">
          {partner.status === 'active' ? '활성' : '비활성'}
        </Badge>
      ),
    },
    {
      key: "created_at",
      title: "생성일",
      cell: (partner: Partner) => (
        <div className="text-muted-foreground">
          {new Date(partner.created_at).toLocaleDateString('ko-KR')}
        </div>
      ),
    },
    {
      key: "actions",
      title: "관리",
      cell: (partner: Partner) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => deletePartner(partner.id)}
            className="h-12 w-12 p-0 text-red-600 hover:text-red-700"
            disabled={partner.id === user.id}
          >
            <Trash2 className="h-6 w-6" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-100">{t.partnerCreation.title}</h1>
          <p className="text-lg text-slate-400">
            {t.partnerCreation.description}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadPartners} variant="outline" className="text-lg px-6 py-3 h-auto">
            <RefreshCw className="h-6 w-6 mr-2" />
            {t.common.refresh}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <UserPlus className="h-8 w-8" />
              {t.partnerCreation.createPartner}
            </CardTitle>
            <CardDescription className="text-lg">
              {t.partnerCreation.createDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-lg">{t.partnerCreation.username}</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder={t.partnerCreation.usernamePlaceholder}
                  className="text-lg py-6"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nickname" className="text-lg">{t.partnerCreation.nickname}</Label>
                <Input
                  id="nickname"
                  value={formData.nickname}
                  onChange={(e) => handleInputChange('nickname', e.target.value)}
                  placeholder={t.partnerCreation.nicknamePlaceholder}
                  className="text-lg py-6"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="password" className="text-lg">{t.partnerCreation.password}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder={t.partnerCreation.passwordPlaceholder}
                    className="text-lg py-6 pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner_type" className="text-lg">{t.partnerCreation.partnerGrade}</Label>
                <Select value={formData.partner_type} onValueChange={(value) => handleInputChange('partner_type', value)}>
                  <SelectTrigger className="text-lg py-6">
                    <SelectValue placeholder={t.partnerCreation.selectGrade} />
                  </SelectTrigger>
                  <SelectContent className="text-lg">
                    {partnerTypes
                      .filter(type => {
                        // ✅ 시스템관리자(level 1)는 모든 파트너 등급 생성 가능
                        if (user.level === 1) return true;
                        // 다른 레벨은 자신보다 하위 레벨만 생성 가능
                        return type.level > user.level;
                      })
                      .map((type) => (
                        <SelectItem key={type.value} value={type.value} className="text-lg py-3">
                          {type.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="upper_partner" className="text-lg">상위 파트너</Label>
                {upperLevelPartners.length > 0 ? (
                  <Select 
                    value={formData.parent_id || ''} 
                    onValueChange={(value) => handleInputChange('parent_id', value)}
                  >
                    <SelectTrigger className="text-lg py-6" id="upper_partner">
                      <SelectValue placeholder="상위 파트너를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent className="text-lg">
                      {upperLevelPartners.map((partner) => (
                        <SelectItem key={partner.id} value={partner.id} className="text-lg py-3">
                          {partner.nickname || partner.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="upper_partner"
                    value={user.nickname || user.username}
                    readOnly
                    className="bg-muted text-lg py-6"
                  />
                )}
              </div>
            </div>

            {/* Lv1이 Lv3~Lv6 생성 시 소속 파트너 선택 */}
            {user.partner_type === 'system_admin' && formData.partner_type !== 'head_office' && availableParents.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="selected_parent" className="text-lg">{t.partnerCreation.selectParentLabel}</Label>
                <Select 
                  value={formData.selected_parent_id || ''} 
                  onValueChange={(value) => handleInputChange('selected_parent_id', value)}
                >
                  <SelectTrigger className="text-lg py-6">
                    <SelectValue placeholder={t.partnerCreation.selectParentPlaceholder} />
                  </SelectTrigger>
                  <SelectContent className="text-lg">
                    {availableParents.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id} className="text-lg py-3">
                        {parent.nickname || parent.username} ({getPartnerLevelText(parent.level)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-base text-muted-foreground">
                  {t.partnerCreation.parentDescription}
                </p>
              </div>
            )}

            {/* LV2(대본사) 생성 시 타임존 설정 */}
            {formData.partner_type === 'head_office' && user.level === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="timezone_offset" className="text-lg">{t.partnerCreation.timezoneOffset || "타임존 설정"}</Label>
                  <Select 
                    value={String(formData.timezone_offset ?? 9)} 
                    onValueChange={(value) => handleInputChange('timezone_offset', parseInt(value, 10))}
                  >
                    <SelectTrigger className="text-lg py-6" id="timezone_offset">
                      <SelectValue placeholder={t.partnerCreation.selectTimezone || "타임존 선택"} />
                    </SelectTrigger>
                    <SelectContent className="text-lg max-h-[300px]">
                      <SelectItem value="9" className="text-lg py-3">UTC+9 (KST)</SelectItem>
                      <SelectItem value="-12" className="text-lg py-3">UTC-12</SelectItem>
                      <SelectItem value="-11" className="text-lg py-3">UTC-11</SelectItem>
                      <SelectItem value="-10" className="text-lg py-3">UTC-10</SelectItem>
                      <SelectItem value="-9" className="text-lg py-3">UTC-9</SelectItem>
                      <SelectItem value="-8" className="text-lg py-3">UTC-8</SelectItem>
                      <SelectItem value="-7" className="text-lg py-3">UTC-7</SelectItem>
                      <SelectItem value="-6" className="text-lg py-3">UTC-6</SelectItem>
                      <SelectItem value="-5" className="text-lg py-3">UTC-5</SelectItem>
                      <SelectItem value="-4" className="text-lg py-3">UTC-4</SelectItem>
                      <SelectItem value="-3" className="text-lg py-3">UTC-3</SelectItem>
                      <SelectItem value="-2" className="text-lg py-3">UTC-2</SelectItem>
                      <SelectItem value="-1" className="text-lg py-3">UTC-1</SelectItem>
                      <SelectItem value="0" className="text-lg py-3">UTC+0</SelectItem>
                      <SelectItem value="1" className="text-lg py-3">UTC+1</SelectItem>
                      <SelectItem value="2" className="text-lg py-3">UTC+2</SelectItem>
                      <SelectItem value="3" className="text-lg py-3">UTC+3</SelectItem>
                      <SelectItem value="4" className="text-lg py-3">UTC+4</SelectItem>
                      <SelectItem value="5" className="text-lg py-3">UTC+5</SelectItem>
                      <SelectItem value="6" className="text-lg py-3">UTC+6</SelectItem>
                      <SelectItem value="7" className="text-lg py-3">UTC+7</SelectItem>
                      <SelectItem value="8" className="text-lg py-3">UTC+8</SelectItem>
                      <SelectItem value="10" className="text-lg py-3">UTC+10</SelectItem>
                      <SelectItem value="11" className="text-lg py-3">UTC+11</SelectItem>
                      <SelectItem value="12" className="text-lg py-3">UTC+12</SelectItem>
                      <SelectItem value="13" className="text-lg py-3">UTC+13</SelectItem>
                      <SelectItem value="14" className="text-lg py-3">UTC+14</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-base text-muted-foreground">
                    {t.partnerCreation.timezoneDescription || "대본사의 기준 타임존을 설정합니다. 통계 및 시간 표시에 적용됩니다."}
                  </p>
                </div>

                {/* API 선택 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-400" />
                    <Label className="text-lg">사용할 API 선택</Label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                    {availableApis.map((api) => (
                      <label
                        key={api.value}
                        className="flex items-start gap-3 p-3 rounded-md border border-slate-600 hover:border-blue-500 hover:bg-slate-700/30 cursor-pointer transition-all"
                      >
                        <input
                          type="checkbox"
                          checked={formData.selected_apis?.includes(api.value) || false}
                          onChange={(e) => {
                            const currentApis = formData.selected_apis || [];
                            const newApis = e.target.checked
                              ? [...currentApis, api.value]
                              : currentApis.filter(a => a !== api.value);
                            handleInputChange('selected_apis', newApis);
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-400 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-200">{api.label}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{api.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-slate-400 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>선택된 API만 api_configs 테이블에 추가됩니다. 나중에 수정할 수 있습니다.</span>
                  </p>
                </div>
              </>
            )}

            {/* Lv2(대본사) 생성 시 안내 메시지 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-6 w-6" />
                <span className="text-lg font-medium">{t.partnerCreation.commissionSettings}</span>
              </div>
              
              {/* 커미션 설정 */}
              <div className="space-y-3">
                <Label className="text-lg text-blue-400">커미션 설정</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="casino_rolling_commission" className="text-lg">카지노 롤링 커미션 (%)</Label>
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
                      placeholder="0"
                      className="text-lg py-6"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="slot_rolling_commission" className="text-lg">슬롯 롤링 커미션 (%)</Label>
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
                      placeholder="0"
                      className="text-lg py-6"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="casino_losing_commission" className="text-lg">루징 커미션 (%)</Label>
                    <Input
                      id="casino_losing_commission"
                      type="number"
                      step="0.1"
                      value={formData.casino_losing_commission === 0 ? '' : formData.casino_losing_commission}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          handleInputChange('casino_losing_commission', 0);
                          handleInputChange('slot_losing_commission', 0);
                          return;
                        }
                        const value = parseFloat(e.target.value);
                        if (!isNaN(value)) {
                          handleInputChange('casino_losing_commission', value);
                          handleInputChange('slot_losing_commission', value);
                        }
                      }}
                      onBlur={(e) => {
                        let value = parseFloat(e.target.value);
                        if (isNaN(value) || value < 0) value = 0;
                        if (value > 100) value = 100;
                        handleInputChange('casino_losing_commission', value);
                        handleInputChange('slot_losing_commission', value);
                      }}
                      placeholder="0"
                      className="text-lg py-6"
                    />
                  </div>
                </div>
              </div>

              {/* 롤링 수수료 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="withdrawal_fee" className="text-lg">{t.partnerCreation.withdrawalFee}</Label>
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
                    placeholder="0"
                    className="text-lg py-6"
                  />
                </div>
              </div>
            </div>

            {/* LV6/LV7 생성 시 게임 접근 권한 선택 - 제거됨 */}
            {/* 파트너 계층관리 페이지에서만 설정 가능 */}

            <div className="flex justify-end pt-4">
              <Button
                type="button"
                onClick={savePartner}
                disabled={saving}
                className="flex items-center gap-2 text-lg px-6 py-3 h-auto"
              >
                <Save className="h-6 w-6" />
                {saving ? t.partnerCreation.creating : t.partnerCreation.createButton}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Users className="h-8 w-8" />
              {t.partnerCreation.partnerList}
            </CardTitle>
            <CardDescription className="text-lg">
              {t.partnerCreation.listDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <DataTableLarge
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
