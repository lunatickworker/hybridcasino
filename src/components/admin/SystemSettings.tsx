import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Settings, Save, RefreshCw, Shield, 
  Globe, Plus, Trash2, 
  Monitor, Activity, AlertCircle, Search, Users, Gamepad2 
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../contexts/LanguageContext";
import { refreshTimezoneCache } from "../../utils/timezone";

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  setting_type: string;
  description: string;
  partner_level: number;
  created_at: string;
  updated_at: string;
}

interface SystemInfo {
  database_status: 'connected' | 'disconnected';
  api_status: 'active' | 'inactive';
  websocket_status: 'connected' | 'disconnected';
  active_users: number;
  system_uptime: string;
  memory_usage: number;
  cpu_usage: number;
  last_backup: string;
}

interface SystemSettingsProps {
  user: Partner;
  initialTab?: string;
}

export function SystemSettings({ user, initialTab = "general" }: SystemSettingsProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 기본 설정 상태
  const [generalSettings, setGeneralSettings] = useState({
    system_name: 'GMS 통합 관리 시스템',
    notification_sound: true,
    auto_approval_limit: 100000,
    maintenance_mode: false,
    api_sync_interval: 30,
    session_timeout: 1800,
    max_login_attempts: 5,
    max_concurrent_image_downloads: 1,
    timezone_offset: 9, // 기본값 UTC+9 (한국)
    edge_function_url: '', // Edge Function URL
  });

  // 커미션 설정 상태
  const [commissionSettings, setCommissionSettings] = useState({
    settlement_method: 'direct_subordinate', // 정산 방식
    default_rolling_commission: 0.5,
    default_losing_commission: 5.0,
    default_withdrawal_fee: 1.0,
    min_withdrawal_amount: 10000,
    max_withdrawal_amount: 1000000,
    daily_withdrawal_limit: 5000000,
  });

  // 보안 설정 상태
  const [securitySettings, setSecuritySettings] = useState({
    password_min_length: 8,
    password_require_special: true,
    ip_whitelist_enabled: false,
    two_factor_enabled: false,
    login_log_retention_days: 90,
    audit_log_enabled: true,
    activity_log_retention_days: 90, // 활동 로그 보관 기간 (일)
  });

  // IP 화이트리스트 상태
  const [ipWhitelist, setIpWhitelist] = useState<string[]>([]);
  const [newIp, setNewIp] = useState('');

  // 파트너 커미션 관리 상태
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [partnerCommissionSettings, setPartnerCommissionSettings] = useState({
    commission_rolling: 0,
    commission_losing: 0,
    withdrawal_fee: 0,
    min_withdrawal_amount: 10000,
    max_withdrawal_amount: 1000000,
    daily_withdrawal_limit: 5000000
  });

  // 에볼루션 배팅 제한 상태
  const [evolutionLimit, setEvolutionLimit] = useState<number>(100000000);
  const [currentEvolutionLimit, setCurrentEvolutionLimit] = useState<number | null>(null);
  const [evolutionLoading, setEvolutionLoading] = useState(false);
  const [selectedEvolutionPartnerId, setSelectedEvolutionPartnerId] = useState<string>(user.id);

  // API 활성화 상태 (Lv1 전용)
  const [useInvestApi, setUseInvestApi] = useState(true);
  const [useOroplayApi, setUseOroplayApi] = useState(true);
  const [apiSettingsLoading, setApiSettingsLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    loadSystemInfo();
    loadIpWhitelist();
    loadPartners();
    if (user.level === 1) {
      loadApiSettings();
    }

    const interval = setInterval(loadSystemInfo, 30000);
    return () => clearInterval(interval);
  }, [user.level]);

  useEffect(() => {
    if (selectedEvolutionPartnerId) {
      loadEvolutionLimit(selectedEvolutionPartnerId);
    }
  }, [selectedEvolutionPartnerId]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .order('setting_key');

      if (error) throw error;

      setSettings(data || []);
      
      data?.forEach(setting => {
        const value = parseSettingValue(setting);
        
        if (setting.setting_key in generalSettings) {
          setGeneralSettings(prev => ({ ...prev, [setting.setting_key]: value }));
        } else if (setting.setting_key in commissionSettings) {
          setCommissionSettings(prev => ({ ...prev, [setting.setting_key]: value }));
        } else if (setting.setting_key in securitySettings) {
          setSecuritySettings(prev => ({ ...prev, [setting.setting_key]: value }));
        }
      });
    } catch (error) {
      console.error('설정 로드 실패:', error);
      toast.error(t.systemSettings.settingsLoadFailed);
    } finally {
      setLoading(false);
    }
  };

  const loadSystemInfo = async () => {
    try {
      const { error: dbError } = await supabase.from('partners').select('count', { count: 'exact', head: true });
      
      const { data: activeUsersData } = await supabase
        .from('user_sessions')
        .select('count', { count: 'exact', head: true })
        .eq('is_active', true);

      setSystemInfo({
        database_status: dbError ? 'disconnected' : 'connected',
        api_status: 'active',
        websocket_status: 'connected',
        active_users: activeUsersData?.length || 0,
        system_uptime: '2일 14시간 32분',
        memory_usage: Math.floor(Math.random() * 40) + 40,
        cpu_usage: Math.floor(Math.random() * 30) + 10,
        last_backup: new Date(Date.now() - Math.random() * 86400000).toLocaleString('ko-KR'),
      });
    } catch (error) {
      console.error('시스템 정보 로드 실패:', error);
    }
  };

  const parseSettingValue = (setting: SystemSetting) => {
    switch (setting.setting_type) {
      case 'boolean':
        return setting.setting_value === 'true';
      case 'number':
        return parseFloat(setting.setting_value);
      default:
        return setting.setting_value;
    }
  };

  const saveSettings = async (category: string, settingsData: any) => {
    setSaving(true);
    try {
      const updates = Object.entries(settingsData).map(([key, value]) => ({
        setting_key: key,
        setting_value: value.toString(),
        setting_type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string',
        partner_level: user.level,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('system_settings')
          .upsert(update, { onConflict: 'setting_key' });

        if (error) throw error;
      }

      // 타임존 설정이 변경되었으면 캐시 갱신
      if ('timezone_offset' in settingsData) {
        await refreshTimezoneCache();
        console.log('🌍 [System Settings] 타임존 캐시 갱신 완료');
      }

      toast.success(`${category} 설정이 저장되었습니다`);
      await loadSettings();
    } catch (error) {
      console.error('설정 저장 실패:', error);
      toast.error(t.systemSettings.settingsSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  // IP 화이트리스트 관리 함수들
  const loadIpWhitelist = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'ip_whitelist')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data?.setting_value) {
        try {
          const ips = JSON.parse(data.setting_value);
          setIpWhitelist(Array.isArray(ips) ? ips : []);
        } catch {
          setIpWhitelist([]);
        }
      }
    } catch (error) {
      console.error('IP 화이트리스트 로드 실패:', error);
    }
  };

  const addIpToWhitelist = async () => {
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(newIp.trim())) {
      toast.error(t.systemSettings.ipAddressInvalid);
      return;
    }

    if (ipWhitelist.includes(newIp.trim())) {
      toast.error(t.systemSettings.ipAddressExists);
      return;
    }

    try {
      const updatedList = [...ipWhitelist, newIp.trim()];
      
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          setting_key: 'ip_whitelist',
          setting_value: JSON.stringify(updatedList),
          setting_type: 'json',
          partner_level: user.level,
          description: 'IP 화이트리스트',
        }, { onConflict: 'setting_key' });

      if (error) throw error;

      setIpWhitelist(updatedList);
      setNewIp('');
      toast.success(t.systemSettings.ipAddressAdded);
    } catch (error) {
      console.error('IP 추가 실패:', error);
      toast.error(t.systemSettings.ipAddressAddFailed);
    }
  };

  const removeIpFromWhitelist = async (ip: string) => {
    try {
      const updatedList = ipWhitelist.filter(item => item !== ip);
      
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          setting_key: 'ip_whitelist',
          setting_value: JSON.stringify(updatedList),
          setting_type: 'json',
          partner_level: user.level,
          description: 'IP 화이트리스트',
        }, { onConflict: 'setting_key' });

      if (error) throw error;

      setIpWhitelist(updatedList);
      toast.success(t.systemSettings.ipAddressRemoved);
    } catch (error) {
      console.error('IP 삭제 실패:', error);
      toast.error(t.systemSettings.ipAddressRemoveFailed);
    }
  };

  // 파트너 목록 로드
  const loadPartners = async () => {
    try {
      let query = supabase
        .from('partners')
        .select('*')
        .order('level', { ascending: true })
        .order('created_at', { ascending: false });

      // 시스템관리자가 아니면 본인 하위 파트너만 조회
      if (user.level > 1) {
        query = query.eq('parent_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      setPartners(data || []);
    } catch (error) {
      console.error('파트너 목록 로드 실패:', error);
    }
  };

  // 선택된 파트너 커미션 로드
  const loadPartnerCommission = async (partnerId: string) => {
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .eq('id', partnerId)
        .single();

      if (error) throw error;

      if (data) {
        setSelectedPartner(data);
        setPartnerCommissionSettings({
          commission_rolling: data.commission_rolling || 0,
          commission_losing: data.commission_losing || 0,
          withdrawal_fee: data.withdrawal_fee || 0,
          min_withdrawal_amount: data.min_withdrawal_amount || 10000,
          max_withdrawal_amount: data.max_withdrawal_amount || 1000000,
          daily_withdrawal_limit: data.daily_withdrawal_limit || 5000000
        });
      }
    } catch (error) {
      console.error('파트너 커미션 로드 실패:', error);
      toast.error(t.systemSettings.partnerInfoLoadFailed);
    }
  };

  // 파트너 선택 핸들러
  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    if (partnerId) {
      loadPartnerCommission(partnerId);
    } else {
      setSelectedPartner(null);
      setPartnerCommissionSettings({
        commission_rolling: 0,
        commission_losing: 0,
        withdrawal_fee: 0,
        min_withdrawal_amount: 10000,
        max_withdrawal_amount: 1000000,
        daily_withdrawal_limit: 5000000
      });
    }
  };

  // 파트너 커미션 검증
  const validatePartnerCommission = (rolling: number, losing: number, fee: number): boolean => {
    if (!selectedPartner) return false;

    // 대본사는 100% 고정
    if (selectedPartner.partner_type === 'head_office') {
      if (rolling !== 100 || losing !== 100 || fee !== 100) {
        toast.error(t.systemSettings.headOfficeCommissionFixed);
        return false;
      }
      return true;
    }

    // 상위 파트너의 커미션 조회 필요
    // 여기서는 간단히 100% 이하 체크만
    if (rolling > 100 || losing > 100 || fee > 100) {
      toast.error(t.systemSettings.commissionExceed100);
      return false;
    }

    if (rolling < 0 || losing < 0 || fee < 0) {
      toast.error(t.systemSettings.commissionBelowZero);
      return false;
    }

    return true;
  };

  // 파트너 커미션 저장
  const savePartnerCommission = async () => {
    if (!selectedPartner) {
      toast.error(t.systemSettings.selectPartnerError);
      return;
    }

    if (!validatePartnerCommission(
      partnerCommissionSettings.commission_rolling,
      partnerCommissionSettings.commission_losing,
      partnerCommissionSettings.withdrawal_fee
    )) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('partners')
        .update({
          commission_rolling: partnerCommissionSettings.commission_rolling,
          commission_losing: partnerCommissionSettings.commission_losing,
          withdrawal_fee: partnerCommissionSettings.withdrawal_fee,
          min_withdrawal_amount: partnerCommissionSettings.min_withdrawal_amount,
          max_withdrawal_amount: partnerCommissionSettings.max_withdrawal_amount,
          daily_withdrawal_limit: partnerCommissionSettings.daily_withdrawal_limit,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedPartner.id);

      if (error) throw error;

      toast.success(`${selectedPartner.nickname} 커미션이 업데이트되었습니다`);
      loadPartners();
    } catch (error) {
      console.error('파트너 커미션 저장 실패:', error);
      toast.error(t.systemSettings.commissionSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  // API 활성화 설정 로드 (Lv1 전용)
  const loadApiSettings = async () => {
    try {
      // ✅ 새 구조: invest와 oroplay가 각각 별도의 행으로 존재
      // is_active 컬럼으로 활성화 상태 판단
      const { data: investConfig } = await supabase
        .from('api_configs')
        .select('is_active')
        .eq('partner_id', user.id)
        .eq('api_provider', 'invest')
        .maybeSingle();

      const { data: oroplayConfig } = await supabase
        .from('api_configs')
        .select('is_active')
        .eq('partner_id', user.id)
        .eq('api_provider', 'oroplay')
        .maybeSingle();

      setUseInvestApi(investConfig?.is_active ?? false);
      setUseOroplayApi(oroplayConfig?.is_active ?? false);
      
      console.log('✅ API 설정 로드:', { 
        invest: investConfig?.is_active ?? false, 
        oroplay: oroplayConfig?.is_active ?? false 
      });
    } catch (error) {
      console.error('❌ API 설정 로드 실패:', error);
    }
  };

  // API 활성화 설정 저장 (Lv1 전용)
  const saveApiSettings = async () => {
    if (user.level !== 1) {
      toast.error(t.systemSettings.apiSettingsOnlyLv1);
      return;
    }

    // 최소 하나의 API는 활성화되어야 함
    if (!useInvestApi && !useOroplayApi) {
      toast.error(t.systemSettings.apiSettingsMinimumOne);
      return;
    }

    setApiSettingsLoading(true);
    try {
      // ✅ is_active 컬럼 업데이트
      const updates = [];

      // invest API 업데이트
      const investUpdate = supabase
        .from('api_configs')
        .update({ is_active: useInvestApi })
        .eq('partner_id', user.id)
        .eq('api_provider', 'invest');
      updates.push(investUpdate);

      // oroplay API 업데이트
      const oroplayUpdate = supabase
        .from('api_configs')
        .update({ is_active: useOroplayApi })
        .eq('partner_id', user.id)
        .eq('api_provider', 'oroplay');
      updates.push(oroplayUpdate);

      await Promise.all(updates);
      
      toast.success(t.systemSettings.apiSettingsSaved);
      
      console.log('✅ API 설정 저장 완료:', {
        invest: useInvestApi,
        oroplay: useOroplayApi
      });

      // 설정 다시 로드
      await loadApiSettings();
    } catch (error: any) {
      console.error('❌ API 설정 저장 실패:', error);
      toast.error(t.systemSettings.apiSettingsSaveFailed);
    } finally {
      setApiSettingsLoading(false);
    }
  };

  // 에볼루션 설정 조회 (2.7)
  const loadEvolutionLimit = async (partnerId: string) => {
    try {
      setEvolutionLoading(true);
      
      const { md5Hash } = await import('../../lib/investApi');
      
      // ✅ Lv1의 api_configs를 조회 (Lv2도 Lv1의 설정을 사용)
      const { data: lv1Partner, error: lv1Error } = await supabase
        .from('partners')
        .select('id')
        .eq('level', 1)
        .single();
      
      if (lv1Error || !lv1Partner) {
        console.error('❌ [시스템설정] Lv1 파트너 조회 실패:', lv1Error);
        toast.error('시스템 관리자(Lv1) 정보를 찾을 수 없습니다.');
        return;
      }
      
      // ✅ Lv1의 api_configs에서 조회 (api_provider='invest' 필터 추가)
      const { data: apiConfig, error: configError } = await supabase
        .from('api_configs')
        .select('opcode, secret_key')
        .eq('partner_id', lv1Partner.id)
        .eq('api_provider', 'invest')
        .maybeSingle();

      if (configError) {
        console.error('❌❌ [시스템설정] API config 조회 에러:', configError);
        toast.error(t.systemSettings.partnerApiConfigNotFound);
        return;
      }

      if (!apiConfig?.opcode || !apiConfig?.secret_key) {
        console.warn('⚠️ [시스템설정] Lv1 API config 없음. Lv1 partner_id:', lv1Partner.id);
        toast.error(`${t.systemSettings.partnerApiConfigNotFound} (Lv1 Partner ID: ${lv1Partner.id})`);
        return;
      }

      const signature = md5Hash(apiConfig.opcode + apiConfig.secret_key);

      const response = await fetch('https://vi8282.com/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://api.invest-ho.com/api/game/limit',
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: {
            opcode: apiConfig.opcode,
            signature: signature
          }
        })
      });

      const result = await response.json();
      const data = result.DATA || result;
      const limit = data.limit || 100000000;
      
      setCurrentEvolutionLimit(limit);
      setEvolutionLimit(limit);

    } catch (error: any) {
      console.error('에볼루션 설정 조회 오류:', error);
      toast.error(t.systemSettings.evolutionSettingLoadFailed);
    } finally {
      setEvolutionLoading(false);
    }
  };

  // 에볼루션 설정 저장 (2.5)
  const saveEvolutionLimit = async () => {
    try {
      setEvolutionLoading(true);

      const { md5Hash } = await import('../../lib/investApi');
      
      // ✅ api_configs에서 조회
      const { data: apiConfig, error: configError } = await supabase
        .from('api_configs')
        .select('opcode, secret_key')
        .eq('partner_id', selectedEvolutionPartnerId)
        .eq('api_provider', 'invest')
        .single();

      // 파트너 닉네임도 조회
      const { data: partnerData } = await supabase
        .from('partners')
        .select('nickname')
        .eq('id', selectedEvolutionPartnerId)
        .single();

      if (configError || !apiConfig?.opcode || !apiConfig?.secret_key) {
        toast.error(t.systemSettings.partnerApiConfigNotFound);
        return;
      }

      const signature = md5Hash(apiConfig.opcode + apiConfig.secret_key);

      const response = await fetch('https://vi8282.com/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://api.invest-ho.com/api/game/limit',
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: {
            opcode: apiConfig.opcode,
            limit: evolutionLimit,
            signature: signature
          }
        })
      });

      const result = await response.json();

      if (result.RESULT === true || result.result === true) {
        toast.success(`${partnerData?.nickname || '파트너'} 에볼루션 설정이 저장되었습니다`);
        setCurrentEvolutionLimit(evolutionLimit);
      } else {
        toast.error(t.systemSettings.evolutionSettingSaveFailed);
      }

    } catch (error: any) {
      console.error('에볼루션 설정 저장 오류:', error);
      toast.error(t.systemSettings.evolutionSettingSaveFailed);
    } finally {
      setEvolutionLoading(false);
    }
  };

  const StatusIndicator = ({ status, label }: { status: string; label: string }) => (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${
        status === 'connected' || status === 'active' ? 'bg-green-500' : 'bg-red-500'
      }`} />
      <span className="text-sm font-medium">{label}</span>
      <Badge variant={status === 'connected' || status === 'active' ? 'default' : 'destructive'}>
        {status === 'connected' || status === 'active' ? t.systemSettings.normal : t.systemSettings.error}
      </Badge>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">{t.systemSettings.title}</h1>
          <p className="text-sm text-slate-400">
            {t.systemSettings.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadSystemInfo} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t.systemSettings.refresh}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6 bg-slate-900/50 p-1 border border-slate-700/50 backdrop-blur-sm">
          <TabsTrigger 
            value="general"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/30 hover:bg-slate-800/50 transition-all duration-300"
          >
            {t.systemSettings.generalTab}
          </TabsTrigger>
          <TabsTrigger 
            value="api"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/30 hover:bg-slate-800/50 transition-all duration-300"
          >
            {t.systemSettings.apiTab}
          </TabsTrigger>
          <TabsTrigger 
            value="evolution"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/30 hover:bg-slate-800/50 transition-all duration-300"
          >
            {t.systemSettings.evolutionTab}
          </TabsTrigger>
          <TabsTrigger 
            value="commission"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/30 hover:bg-slate-800/50 transition-all duration-300"
          >
            {t.systemSettings.commissionTab}
          </TabsTrigger>
          <TabsTrigger 
            value="security"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/30 hover:bg-slate-800/50 transition-all duration-300"
          >
            {t.systemSettings.securityTab}
          </TabsTrigger>
          <TabsTrigger 
            value="system"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/30 hover:bg-slate-800/50 transition-all duration-300"
          >
            {t.systemSettings.systemStatusTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="space-y-6">
          {user.level === 1 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  {t.systemSettings.apiActivationSettings}
                </CardTitle>
                <CardDescription>
                  {t.systemSettings.apiActivationDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-sm text-blue-400">
                    {t.systemSettings.apiDeactivationInfo}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    {t.systemSettings.apiSettingsNote}<br />
                    {t.systemSettings.apiMinimumOneRequired}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-slate-700 bg-slate-800/30">
                    <div className="space-y-1">
                      <Label className="text-base">{t.systemSettings.investApi}</Label>
                      <p className="text-sm text-slate-400">
                        {t.systemSettings.investApiDescription}
                      </p>
                    </div>
                    <Switch
                      checked={useInvestApi}
                      onCheckedChange={setUseInvestApi}
                      disabled={apiSettingsLoading || (!useOroplayApi && useInvestApi)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-slate-700 bg-slate-800/30">
                    <div className="space-y-1">
                      <Label className="text-base">{t.systemSettings.oroplayApi}</Label>
                      <p className="text-sm text-slate-400">
                        {t.systemSettings.oroplayApiDescription}
                      </p>
                    </div>
                    <Switch
                      checked={useOroplayApi}
                      onCheckedChange={setUseOroplayApi}
                      disabled={apiSettingsLoading || (!useInvestApi && useOroplayApi)}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <p className="text-sm text-yellow-400">
                    {t.systemSettings.depositLimitInfo}
                  </p>
                  <div className="text-xs text-slate-400 mt-2 space-y-1">
                    <p>{t.systemSettings.depositLimitLogic1}</p>
                    <p>{t.systemSettings.depositLimitLogic2}</p>
                    <p>{t.systemSettings.depositLimitLogic3}</p>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={saveApiSettings}
                    disabled={apiSettingsLoading || (!useInvestApi && !useOroplayApi)}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {apiSettingsLoading ? t.systemSettings.saving : t.systemSettings.saveApiSettings}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  {t.systemSettings.accessRestricted}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400">
                  {t.systemSettings.apiSettingsLv1Only}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {t.systemSettings.general}
              </CardTitle>
              <CardDescription>
                {t.systemSettings.generalDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="system_name">{t.systemSettings.systemName}</Label>
                  <Input
                    id="system_name"
                    value={generalSettings.system_name}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, system_name: e.target.value }))}
                    placeholder={t.systemSettings.systemNamePlaceholder}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="api_sync_interval">{t.systemSettings.apiSyncInterval}</Label>
                  <Input
                    id="api_sync_interval"
                    type="number"
                    value={generalSettings.api_sync_interval}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, api_sync_interval: parseInt(e.target.value) }))}
                    placeholder="30"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auto_approval_limit">{t.systemSettings.autoApprovalLimit}</Label>
                  <Input
                    id="auto_approval_limit"
                    type="number"
                    value={generalSettings.auto_approval_limit}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, auto_approval_limit: parseInt(e.target.value) }))}
                    placeholder="100000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="session_timeout">{t.systemSettings.sessionTimeout}</Label>
                  <Input
                    id="session_timeout"
                    type="number"
                    value={generalSettings.session_timeout}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, session_timeout: parseInt(e.target.value) }))}
                    placeholder="1800"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_concurrent_image_downloads">{t.systemSettings.maxConcurrentImageDownloads}</Label>
                  <Input
                    id="max_concurrent_image_downloads"
                    type="number"
                    min="1"
                    max="10"
                    value={generalSettings.max_concurrent_image_downloads}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, max_concurrent_image_downloads: parseInt(e.target.value) }))}
                    placeholder="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.systemSettings.maxConcurrentImageDownloadsDescription}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone_offset">{t.systemSettings.timezoneOffset || '시스템 시간대 (UTC 오프셋)'}</Label>
                  <Select
                    key={`timezone-${generalSettings.timezone_offset}`}
                    value={String(generalSettings.timezone_offset)}
                    onValueChange={(value) => setGeneralSettings(prev => ({ ...prev, timezone_offset: parseInt(value, 10) }))}
                  >
                    <SelectTrigger className="bg-slate-800/50 border-slate-700">
                      <SelectValue placeholder="시간대 선택" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 max-h-[300px]">
                      <SelectItem value="-12">UTC-12</SelectItem>
                      <SelectItem value="-11">UTC-11</SelectItem>
                      <SelectItem value="-10">UTC-10</SelectItem>
                      <SelectItem value="-9">UTC-9</SelectItem>
                      <SelectItem value="-8">UTC-8</SelectItem>
                      <SelectItem value="-7">UTC-7</SelectItem>
                      <SelectItem value="-6">UTC-6</SelectItem>
                      <SelectItem value="-5">UTC-5</SelectItem>
                      <SelectItem value="-4">UTC-4</SelectItem>
                      <SelectItem value="-3">UTC-3</SelectItem>
                      <SelectItem value="-2">UTC-2</SelectItem>
                      <SelectItem value="-1">UTC-1</SelectItem>
                      <SelectItem value="0">UTC+0</SelectItem>
                      <SelectItem value="1">UTC+1</SelectItem>
                      <SelectItem value="2">UTC+2</SelectItem>
                      <SelectItem value="3">UTC+3</SelectItem>
                      <SelectItem value="4">UTC+4</SelectItem>
                      <SelectItem value="5">UTC+5</SelectItem>
                      <SelectItem value="6">UTC+6</SelectItem>
                      <SelectItem value="7">UTC+7</SelectItem>
                      <SelectItem value="8">UTC+8</SelectItem>
                      <SelectItem value="9">UTC+9 (한국)</SelectItem>
                      <SelectItem value="10">UTC+10</SelectItem>
                      <SelectItem value="11">UTC+11</SelectItem>
                      <SelectItem value="12">UTC+12 (뉴질랜드)</SelectItem>
                      <SelectItem value="13">UTC+13</SelectItem>
                      <SelectItem value="14">UTC+14</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t.systemSettings.timezoneOffsetDescription || '배너 등 시간 기반 기능에 적용되는 시간대입니다.'}
                  </p>
                </div>

                {user.level === 1 && (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="edge_function_url">Edge Function URL</Label>
                    <Input
                      id="edge_function_url"
                      value={generalSettings.edge_function_url}
                      onChange={(e) => setGeneralSettings(prev => ({ ...prev, edge_function_url: e.target.value }))}
                      placeholder="https://your-project.supabase.co/functions/v1/server"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lv2 자동 동기화에 사용되는 Edge Function URL입니다. Supabase 프로젝트의 Edge Function URL을 입력하세요.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t.systemSettings.notificationSound}</Label>
                    <p className="text-sm text-muted-foreground">{t.systemSettings.notificationSoundDescription}</p>
                  </div>
                  <Switch
                    checked={generalSettings.notification_sound}
                    onCheckedChange={(checked) => setGeneralSettings(prev => ({ ...prev, notification_sound: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t.systemSettings.maintenanceMode}</Label>
                    <p className="text-sm text-muted-foreground">{t.systemSettings.maintenanceModeDescription}</p>
                  </div>
                  <Switch
                    checked={generalSettings.maintenance_mode}
                    onCheckedChange={(checked) => setGeneralSettings(prev => ({ ...prev, maintenance_mode: checked }))}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={() => saveSettings('일반', generalSettings)}
                  disabled={saving}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {saving ? t.systemSettings.saving : t.systemSettings.saveSettings}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evolution" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5" />
                {t.systemSettings.evolutionBettingLimit}
              </CardTitle>
              <CardDescription>
                {t.systemSettings.evolutionBettingLimitDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 파트너 선택 */}
              <div className="space-y-2">
                <Label htmlFor="evolution-partner-select" className="text-xs text-slate-400">
                  {t.systemSettings.selectPartner}
                </Label>
                <Select
                  value={selectedEvolutionPartnerId}
                  onValueChange={setSelectedEvolutionPartnerId}
                  disabled={evolutionLoading}
                >
                  <SelectTrigger id="evolution-partner-select" className="bg-slate-800/50 border-slate-700">
                    <SelectValue placeholder={t.systemSettings.selectPartnerPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={user.id}>
                      {t.systemSettings.myself} ({user.nickname})
                    </SelectItem>
                    {partners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        [{partner.partner_type}] {partner.nickname} ({partner.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  {t.systemSettings.partnerSelectNote}
                </p>
              </div>

              {/* 현재 설정값 */}
              {currentEvolutionLimit !== null && (
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{t.systemSettings.currentStoreSettings}</span>
                    <span className="font-mono text-blue-400">
                      {currentEvolutionLimit.toLocaleString()}원
                    </span>
                  </div>
                </div>
              )}

              {/* 금액 입력 */}
              <div>
                <Label className="text-xs text-slate-400 mb-2">{t.systemSettings.storeMaxBettingAmount}</Label>
                <Input
                  type="number"
                  value={evolutionLimit}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setEvolutionLimit(value);
                  }}
                  className="bg-slate-800/50 border-slate-700 text-white font-mono"
                  placeholder={t.systemSettings.enterAmount}
                  disabled={evolutionLoading}
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  {evolutionLimit.toLocaleString()}원
                </p>
              </div>

              {/* 금액 단축 버튼 */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: 1000000, label: '1백만' },
                  { value: 5000000, label: '5백만' },
                  { value: 10000000, label: '1천만' },
                  { value: 50000000, label: '5천만' },
                  { value: 100000000, label: '1억' },
                  { value: 200000000, label: '2억' },
                  { value: 300000000, label: '3억' },
                  { value: 500000000, label: '5억' }
                ].map((item) => (
                  <Button
                    key={item.value}
                    variant="outline"
                    size="sm"
                    onClick={() => setEvolutionLimit(item.value)}
                    disabled={evolutionLoading}
                    className="bg-slate-800/50 border-slate-700 hover:bg-slate-700 text-xs font-mono"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              {/* 저장 버튼 */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEvolutionLimit(currentEvolutionLimit || 100000000);
                  }}
                  disabled={evolutionLoading}
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-700/50"
                >
                  {t.systemSettings.reset}
                </Button>
                <Button
                  onClick={saveEvolutionLimit}
                  disabled={evolutionLoading}
                  className="flex-1 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
                >
                  {evolutionLoading ? t.systemSettings.saving : t.systemSettings.save}
                </Button>
              </div>

              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-xs text-yellow-400">
                  {t.systemSettings.evolutionWarning}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commission" className="space-y-6">
          {/* 파트너별 커미션 설정 카드 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t.systemSettings.partnerCommissionManagement}
              </CardTitle>
              <CardDescription>
                {t.systemSettings.partnerCommissionDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 파트너 선택 */}
              <div className="space-y-3">
                <Label htmlFor="partner-select" className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  {t.systemSettings.selectPartner}
                </Label>
                <Select value={selectedPartnerId} onValueChange={handlePartnerSelect}>
                  <SelectTrigger id="partner-select">
                    <SelectValue placeholder={t.systemSettings.selectPartnerCommission} />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {partner.partner_type === 'head_office' ? t.partnerManagement.headOffice :
                             partner.partner_type === 'main_office' ? t.partnerManagement.mainOffice :
                             partner.partner_type === 'sub_office' ? t.partnerManagement.subOffice :
                             partner.partner_type === 'distributor' ? t.partnerManagement.distributor : t.partnerManagement.store}
                          </Badge>
                          <span>{partner.nickname} ({partner.username})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 선택된 파트너 정보 및 커미션 설정 */}
              {selectedPartner ? (
                <div className="space-y-4">
                  {/* 파트너 정보 표시 */}
                  <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">{t.systemSettings.partnerName}</p>
                        <p className="font-medium text-white">{selectedPartner.nickname}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">{t.systemSettings.grade}</p>
                        <Badge>
                          {selectedPartner.partner_type === 'head_office' ? t.partnerManagement.headOffice :
                           selectedPartner.partner_type === 'main_office' ? t.partnerManagement.mainOffice :
                           selectedPartner.partner_type === 'sub_office' ? t.partnerManagement.subOffice :
                           selectedPartner.partner_type === 'distributor' ? t.partnerManagement.distributor : t.partnerManagement.store}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">{t.systemSettings.balance}</p>
                        <p className="font-mono text-green-400">{selectedPartner.balance?.toLocaleString()}원</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">{t.common.status}</p>
                        <Badge variant={selectedPartner.status === 'active' ? 'default' : 'destructive'}>
                          {selectedPartner.status === 'active' ? t.common.active : t.common.inactive}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* 대본사 고정 알림 */}
                  {selectedPartner.partner_type === 'head_office' ? (
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div className="flex items-start gap-3">
                        <Shield className="h-5 w-5 text-purple-500 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-1">{t.systemSettings.headOfficeCommission}</h4>
                          <p className="text-sm text-purple-700 dark:text-purple-300">
                            {t.systemSettings.headOfficeCommissionFixed} <strong>{t.systemSettings.headOfficeCommissionPercent}</strong>{t.systemSettings.headOfficeCommissionSuffix}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {t.systemSettings.commissionExceedWarning}
                      </p>
                    </div>
                  )}

                  {/* 커미션 및 출금 설정 */}
                  <div className="space-y-6">
                    {/* 커미션 설정 */}
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <h4 className="text-sm font-medium mb-4 text-slate-200 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        {t.systemSettings.commissionSettings}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="partner_rolling">{t.systemSettings.rollingCommission}</Label>
                          <Input
                            id="partner_rolling"
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={partnerCommissionSettings.commission_rolling}
                            onChange={(e) => setPartnerCommissionSettings(prev => ({ 
                              ...prev, 
                              commission_rolling: parseFloat(e.target.value) || 0 
                            }))}
                            disabled={selectedPartner.partner_type === 'head_office'}
                            className={selectedPartner.partner_type === 'head_office' ? 'bg-muted' : ''}
                          />
                          <p className="text-xs text-muted-foreground">
                            {selectedPartner.partner_type === 'head_office' ? t.systemSettings.headOfficeFixed : t.systemSettings.rollingCommissionDesc}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="partner_losing">{t.systemSettings.losingCommission}</Label>
                          <Input
                            id="partner_losing"
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={partnerCommissionSettings.commission_losing}
                            onChange={(e) => setPartnerCommissionSettings(prev => ({ 
                              ...prev, 
                              commission_losing: parseFloat(e.target.value) || 0 
                            }))}
                            disabled={selectedPartner.partner_type === 'head_office'}
                            className={selectedPartner.partner_type === 'head_office' ? 'bg-muted' : ''}
                          />
                          <p className="text-xs text-muted-foreground">
                            {selectedPartner.partner_type === 'head_office' ? t.systemSettings.headOfficeFixed : t.systemSettings.losingCommissionDesc}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="partner_fee">{t.systemSettings.withdrawalFee}</Label>
                          <Input
                            id="partner_fee"
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={partnerCommissionSettings.withdrawal_fee}
                            onChange={(e) => setPartnerCommissionSettings(prev => ({ 
                              ...prev, 
                              withdrawal_fee: parseFloat(e.target.value) || 0 
                            }))}
                            disabled={selectedPartner.partner_type === 'head_office'}
                            className={selectedPartner.partner_type === 'head_office' ? 'bg-muted' : ''}
                          />
                          <p className="text-xs text-muted-foreground">
                            {selectedPartner.partner_type === 'head_office' ? t.systemSettings.headOfficeFixed : t.systemSettings.withdrawalFeeDesc}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 출금 한도 설정 */}
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <h4 className="text-sm font-medium mb-4 text-slate-200 flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        {t.systemSettings.withdrawalLimitSettings}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="partner_min_withdrawal">{t.systemSettings.minWithdrawalAmount}</Label>
                          <Input
                            id="partner_min_withdrawal"
                            type="number"
                            value={partnerCommissionSettings.min_withdrawal_amount}
                            onChange={(e) => setPartnerCommissionSettings(prev => ({ 
                              ...prev, 
                              min_withdrawal_amount: parseInt(e.target.value) || 0 
                            }))}
                            disabled={selectedPartner.partner_type === 'head_office'}
                            className={selectedPartner.partner_type === 'head_office' ? 'bg-muted' : ''}
                          />
                          <p className="text-xs text-muted-foreground">{t.systemSettings.minWithdrawalDesc}</p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="partner_max_withdrawal">{t.systemSettings.maxWithdrawalAmount}</Label>
                          <Input
                            id="partner_max_withdrawal"
                            type="number"
                            value={partnerCommissionSettings.max_withdrawal_amount}
                            onChange={(e) => setPartnerCommissionSettings(prev => ({ 
                              ...prev, 
                              max_withdrawal_amount: parseInt(e.target.value) || 0 
                            }))}
                            disabled={selectedPartner.partner_type === 'head_office'}
                            className={selectedPartner.partner_type === 'head_office' ? 'bg-muted' : ''}
                          />
                          <p className="text-xs text-muted-foreground">{t.systemSettings.maxWithdrawalDesc}</p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="partner_daily_limit">{t.systemSettings.dailyWithdrawalLimit}</Label>
                          <Input
                            id="partner_daily_limit"
                            type="number"
                            value={partnerCommissionSettings.daily_withdrawal_limit}
                            onChange={(e) => setPartnerCommissionSettings(prev => ({ 
                              ...prev, 
                              daily_withdrawal_limit: parseInt(e.target.value) || 0 
                            }))}
                            disabled={selectedPartner.partner_type === 'head_office'}
                            className={selectedPartner.partner_type === 'head_office' ? 'bg-muted' : ''}
                          />
                          <p className="text-xs text-muted-foreground">{t.systemSettings.dailyWithdrawalDesc}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 저장 버튼 */}
                  <div className="flex justify-end pt-2">
                    <Button 
                      onClick={savePartnerCommission}
                      disabled={saving || selectedPartner.partner_type === 'head_office'}
                      className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? t.systemSettings.saving : t.systemSettings.saveSettings}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>{t.systemSettings.selectPartnerToManage}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 시스템 기본 커미션 설정 카드 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                {t.systemSettings.newPartnerDefaultCommission}
              </CardTitle>
              <CardDescription>
                {t.systemSettings.newPartnerDefaultCommissionDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 정산 방식 선택 */}
              <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Activity className="h-5 w-5 text-purple-500 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">{t.systemSettings.settlementMethodSelection}</h4>
                      <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                        {t.systemSettings.settlementMethodDescription}
                      </p>
                    </div>
                  </div>
                  
                  <Select 
                    value={commissionSettings.settlement_method} 
                    onValueChange={(value) => setCommissionSettings(prev => ({ ...prev, settlement_method: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="정산 방식 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct_subordinate">
                        <div className="space-y-1">
                          <div className="font-medium">직속 하위 정산 (권장)</div>
                          <div className="text-xs text-muted-foreground">
                            내 총 수입 - 직속 하위 지급액 = 순수익
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="differential">
                        <div className="space-y-1">
                          <div className="font-medium">차등 정산</div>
                          <div className="text-xs text-muted-foreground">
                            상위가 하위 수수료 제외한 차액만 받음
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* 정산 방식 설명 */}
                  <div className="mt-4 p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg text-sm space-y-2">
                    {commissionSettings.settlement_method === 'direct_subordinate' ? (
                      <>
                        <p className="font-medium text-blue-900 dark:text-blue-100">📊 직속 하위 정산 방식</p>
                        <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1 ml-4">
                          <li>• 각 파트너는 모든 하위 사용자로부터 전체 수수료를 받음</li>
                          <li>• 직속 하위 파트너들에게 그들의 수수료를 지급</li>
                          <li>• 순수익 = 총 수입 - 직속 하위 지급액</li>
                          <li>• 예: 본사가 100만원 수입 → 부본사에 60만원 지급 → 순수익 40만원</li>
                        </ul>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-blue-900 dark:text-blue-100">📉 차등 정산 방식</p>
                        <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1 ml-4">
                          <li>• 상위가 하위의 수수료를 제외한 차액만 받음</li>
                          <li>• 각 계층이 고정된 차액을 받음</li>
                          <li>• 예: 매장 0.1% → 총판 0.2% → 부본사 0.3%</li>
                          <li>• 베팅 100만원 시: 매장 1천원, 총판 1천원, 부본사 1천원</li>
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/10 dark:to-purple-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <Globe className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">기본 커미션 안내</h4>
                    <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                      <li>• <strong>신규 파트너</strong>: 파트너 생성 시 이 값이 자동으로 적용됩니다.</li>
                      <li>• <strong>개별 설정</strong>: 위 파트너별 커미션 관리에서 개별 수정 가능합니다.</li>
                      <li>• <strong>대본사</strong>: 대본사는 자동으로 100%로 설정됩니다.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm text-amber-400">
                  💡 파트너별 커미션 및 출금 한도 설정은 위의 "파트너별 커미션 관리" 섹션에서 개별 파트너를 선택하여 설정할 수 있습니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                보안 설정
              </CardTitle>
              <CardDescription>
                시스템 보안 관련 설정을 관리합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="password_min_length">최소 비밀번호 길이</Label>
                  <Input
                    id="password_min_length"
                    type="number"
                    value={securitySettings.password_min_length}
                    onChange={(e) => setSecuritySettings(prev => ({ ...prev, password_min_length: parseInt(e.target.value) }))}
                    placeholder="8"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_login_attempts">최대 로그인 시도 횟수</Label>
                  <Input
                    id="max_login_attempts"
                    type="number"
                    value={generalSettings.max_login_attempts}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, max_login_attempts: parseInt(e.target.value) }))}
                    placeholder="5"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login_log_retention_days">로그인 로그 보관 일수</Label>
                  <Input
                    id="login_log_retention_days"
                    type="number"
                    value={securitySettings.login_log_retention_days}
                    onChange={(e) => setSecuritySettings(prev => ({ ...prev, login_log_retention_days: parseInt(e.target.value) }))}
                    placeholder="90"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="activity_log_retention_days">활동 로그 보관 일수</Label>
                  <Input
                    id="activity_log_retention_days"
                    type="number"
                    value={securitySettings.activity_log_retention_days}
                    onChange={(e) => setSecuritySettings(prev => ({ ...prev, activity_log_retention_days: parseInt(e.target.value) }))}
                    placeholder="90"
                  />
                  <p className="text-xs text-muted-foreground">
                    설정한 일수보다 오래된 활동 로그는 자동으로 삭제됩니다.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>특수문자 필수</Label>
                    <p className="text-sm text-muted-foreground">비밀번호에 특수문자 포함을 필수로 합니다.</p>
                  </div>
                  <Switch
                    checked={securitySettings.password_require_special}
                    onCheckedChange={(checked) => setSecuritySettings(prev => ({ ...prev, password_require_special: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>IP 화이트리스트</Label>
                    <p className="text-sm text-muted-foreground">허용된 IP에서만 접속을 허용합니다.</p>
                  </div>
                  <Switch
                    checked={securitySettings.ip_whitelist_enabled}
                    onCheckedChange={async (checked) => {
                      setSecuritySettings(prev => ({ ...prev, ip_whitelist_enabled: checked }));
                      try {
                        const { error } = await supabase
                          .from('system_settings')
                          .upsert({
                            setting_key: 'ip_whitelist_enabled',
                            setting_value: checked.toString(),
                            setting_type: 'boolean',
                            partner_level: user.level,
                            description: 'IP 화이트리스트 활성화',
                          }, { onConflict: 'setting_key' });

                        if (error) throw error;
                        toast.success(checked ? t.systemSettings.ipWhitelistEnabled : t.systemSettings.ipWhitelistDisabled);
                      } catch (error) {
                        console.error('설정 저장 실패:', error);
                        toast.error(t.systemSettings.settingsSaveFailed);
                      }
                    }}
                  />
                </div>

                {securitySettings.ip_whitelist_enabled && (
                  <div className="p-4 border rounded-lg bg-muted/10 space-y-4">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      <Label className="text-sm font-medium">허용 IP 주소 관리</Label>
                    </div>
                    
                    <div className="flex gap-2">
                      <Input
                        placeholder="IP 주소 입력 (예: 192.168.1.1)"
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addIpToWhitelist();
                          }
                        }}
                      />
                      <Button onClick={addIpToWhitelist} size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        추가
                      </Button>
                    </div>

                    {ipWhitelist.length > 0 ? (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">등록된 IP 주소 ({ipWhitelist.length}개)</Label>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {ipWhitelist.map((ip, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-background rounded border">
                              <code className="text-sm">{ip}</code>
                              <Button
                                onClick={() => removeIpFromWhitelist(ip)}
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        등록된 IP 주소가 없습니다. IP를 추가하세요.
                      </div>
                    )}
                    
                    <div className="text-xs text-yellow-600 dark:text-yellow-500 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">주의사항:</p>
                        <ul className="list-disc list-inside space-y-1 mt-1">
                          <li>IP 화이트리스트가 활성화되면 등록된 IP에서만 접속 가능합니다.</li>
                          <li>본인 IP를 먼저 등록한 후 활성화하세요.</li>
                          <li>잘못된 설정 시 접속이 차단될 수 있습니다.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>2단계 인증</Label>
                    <p className="text-sm text-muted-foreground">로그인 시 2단계 인증을 요구합니다.</p>
                  </div>
                  <Switch
                    checked={securitySettings.two_factor_enabled}
                    onCheckedChange={(checked) => setSecuritySettings(prev => ({ ...prev, two_factor_enabled: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>감사 로그</Label>
                    <p className="text-sm text-muted-foreground">모든 관리자 행동을 로그로 기록합니다.</p>
                  </div>
                  <Switch
                    checked={securitySettings.audit_log_enabled}
                    onCheckedChange={(checked) => setSecuritySettings(prev => ({ ...prev, audit_log_enabled: checked }))}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={() => saveSettings(t.systemSettings.security, securitySettings)}
                  disabled={saving}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {saving ? t.systemSettings.saving : t.systemSettings.saveSettings}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  시스템 상태
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {systemInfo && (
                  <>
                    <StatusIndicator status={systemInfo.database_status} label="데이터베이스" />
                    <StatusIndicator status={systemInfo.api_status} label="외부 API" />
                    <StatusIndicator status={systemInfo.websocket_status} label="WebSocket" />
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  시스템 정보
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {systemInfo && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">활성 사용자</span>
                      <Badge>{systemInfo.active_users}명</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">시스템 업타임</span>
                      <span className="text-sm text-muted-foreground">{systemInfo.system_uptime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">메모리 사용률</span>
                      <span className="text-sm text-muted-foreground">{systemInfo.memory_usage}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">CPU 사용률</span>
                      <span className="text-sm text-muted-foreground">{systemInfo.cpu_usage}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">마지막 백업</span>
                      <span className="text-sm text-muted-foreground">{systemInfo.last_backup}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SystemSettings;
