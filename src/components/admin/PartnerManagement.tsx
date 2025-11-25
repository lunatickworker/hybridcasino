/**
 * ⚠️ ⚠️ ⚠️ 이 파일은 더 이상 사용되지 않습니다! ⚠️ ⚠️ ⚠️
 * 
 * 백업용으로만 보관됩니다.
 * 
 * 실제 사용 파일: /components/admin/PartnerManagementV2.tsx
 * 
 * 모듈화 완료 (3900줄 → 400줄):
 * - usePartnerManagement 커스텀 훅 사용
 * - PartnerTransferDialog 컴포넌트 분리
 * - transferService, partnerService 분리
 * 
 * ⚠️ 이 파일을 수정하지 마세요! V2를 수정하세요!
 */

import { useState, useEffect } from "react";
import { Plus, Search, Filter, Download, Edit, Eye, DollarSign, Users, Building2, Shield, Key, TrendingUp, Activity, CreditCard, ArrowUpDown, Trash2, ChevronRight, ChevronDown, Send, ArrowDown } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { DataTable, Column } from "../common/DataTable";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from "./AdminDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useAuth } from "../../hooks/useAuth";
import { useWebSocketContext } from "../../contexts/WebSocketContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { MetricCard } from "./MetricCard";
import { PartnerTransactions } from "./PartnerTransactions";
import { ForceTransactionModal } from "./ForceTransactionModal";
import { PartnerTransferDialog } from "./partner/PartnerTransferDialog";

interface Partner {
  id: string;
  username: string;
  nickname: string;
  partner_type: 'system_admin' | 'head_office' | 'main_office' | 'sub_office' | 'distributor' | 'store';
  parent_id?: string;
  parent_nickname?: string;
  level: number;
  status: 'active' | 'inactive' | 'blocked';
  balance: number;
  commission_rolling: number;
  commission_losing: number;
  withdrawal_fee: number;
  min_withdrawal_amount?: number;
  max_withdrawal_amount?: number;
  daily_withdrawal_limit?: number;
  bank_name?: string;
  bank_account?: string;
  bank_holder?: string;
  last_login_at?: string;
  created_at: string;
  child_count?: number;
  user_count?: number;
  // Lv1(시스템관리자)용 API별 잔고
  invest_balance?: number;
  oroplay_balance?: number;
}

const partnerTypeColors = {
  system_admin: 'bg-purple-500',
  head_office: 'bg-red-500',
  main_office: 'bg-orange-500',
  sub_office: 'bg-yellow-500',
  distributor: 'bg-blue-500',
  store: 'bg-green-500'
};

const statusColors = {
  active: 'bg-green-500',
  inactive: 'bg-gray-500',
  blocked: 'bg-red-500'
};

export function PartnerManagement() {
  const { authState } = useAuth();
  const { connected, sendMessage } = useWebSocketContext();
  const { t } = useLanguage();
  
  // 번역 헬퍼 함수
  const partnerTypeTexts = {
    system_admin: t.partnerManagement.systemAdmin,
    head_office: t.partnerManagement.headOffice,
    main_office: t.partnerManagement.mainOffice,
    sub_office: t.partnerManagement.subOffice,
    distributor: t.partnerManagement.distributor,
    store: t.partnerManagement.store
  };
  
  const statusTexts = {
    active: t.partnerManagement.active,
    inactive: t.partnerManagement.inactive,
    blocked: t.partnerManagement.blocked
  };
  
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<Partner | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showHierarchyView, setShowHierarchyView] = useState(false);
  const [currentTab, setCurrentTab] = useState("hierarchy");
  const [dashboardData, setDashboardData] = useState({});
  const [levelDistribution, setLevelDistribution] = useState<{
    level: number;
    type: string;
    typeName: string;
    partnerCount: number;
    usersBalance: number;
  }[]>([]);
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [hierarchyWarning, setHierarchyWarning] = useState<string>("");
  const [systemDefaultCommission, setSystemDefaultCommission] = useState({
    rolling: 0.5,
    losing: 5.0,
    fee: 1.0
  });
  const [showForceTransactionModal, setShowForceTransactionModal] = useState(false);
  const [forceTransactionType, setForceTransactionType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [forceTransactionTarget, setForceTransactionTarget] = useState<Partner | null>(null);
  const [adminApiBalances, setAdminApiBalances] = useState<{ invest: number; oroplay: number }>({ invest: 0, oroplay: 0 });
  const [currentUserBalance, setCurrentUserBalance] = useState(0); // 현재 관리자의 보유금 (Lv3~7용)
  const [currentUserInvestBalance, setCurrentUserInvestBalance] = useState(0); // Lv1/Lv2의 invest_balance
  const [currentUserOroplayBalance, setCurrentUserOroplayBalance] = useState(0); // Lv1/Lv2의 oroplay_balance
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
    commission_rolling: 0.5,
    commission_losing: 5.0,
    withdrawal_fee: 0,
    min_withdrawal_amount: 10000,
    max_withdrawal_amount: 1000000,
    daily_withdrawal_limit: 5000000
  });
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferTargetPartner, setTransferTargetPartner] = useState<Partner | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferMemo, setTransferMemo] = useState("");
  const [transferMode, setTransferMode] = useState<'deposit' | 'withdrawal'>('deposit');
  const [transferLoading, setTransferLoading] = useState(false);

  // 특정 파트너의 커미션 조회
  const loadPartnerCommissionById = async (partnerId: string) => {
    try {
      // ✅ .maybeSingle() 사용 - 0개 결과도 에러 없이 null 반환 (PGRST116 방지)
      const { data, error } = await supabase
        .from('partners')
        .select('commission_rolling, commission_losing, withdrawal_fee, partner_type, nickname')
        .eq('id', partnerId)
        .maybeSingle();

      if (error) {
        console.error('[Partner Commission Error]:', error);
        return null;
      }

      if (data) {
        return {
          rolling: data.commission_rolling || 100,
          losing: data.commission_losing || 100,
          fee: data.withdrawal_fee || 100,
          nickname: data.nickname
        };
      }
      return null;
    } catch (error) {
      console.error('[Partner Commission Fetch Failed]:', error);
      return null;
    }
  };

  // 상위 파트너 커미션 조회 (현재 로그인 사용자)
  const loadParentCommission = async () => {
    if (!authState.user?.id) return;
    const commission = await loadPartnerCommissionById(authState.user.id);
    if (commission) {
      setParentCommission(commission);
    }
  };

  // 시스템 기본 커미션 값 로드
  const loadSystemDefaultCommission = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['default_rolling_commission', 'default_losing_commission', 'default_withdrawal_fee']);

      if (error) {
        console.error('[System Default Commission Load Error]:', error);
        return;
      }

      if (data && data.length > 0) {
        const defaults = {
          rolling: 0.5,
          losing: 5.0,
          fee: 1.0
        };

        data.forEach(setting => {
          if (setting.setting_key === 'default_rolling_commission') {
            defaults.rolling = parseFloat(setting.setting_value) || 0.5;
          } else if (setting.setting_key === 'default_losing_commission') {
            defaults.losing = parseFloat(setting.setting_value) || 5.0;
          } else if (setting.setting_key === 'default_withdrawal_fee') {
            defaults.fee = parseFloat(setting.setting_value) || 1.0;
          }
        });

        setSystemDefaultCommission(defaults);
        
        // 폼 데이터에도 기본값 적용
        setFormData(prev => ({
          ...prev,
          commission_rolling: defaults.rolling,
          commission_losing: defaults.losing,
          withdrawal_fee: defaults.fee
        }));
      }
    } catch (error) {
      console.error('[System Default Commission Load Failed]:', error);
    }
  };

  // Lv1 관리자의 api_configs 보유금 조회
  const fetchAdminApiBalances = async () => {
    if (!authState.user?.id || authState.user?.level !== 1) {
      setAdminApiBalances({ invest: 0, oroplay: 0 });
      return;
    }

    try {
      // ✅ 새 구조: api_provider별로 별도 조회
      const { data: investData, error: investError } = await supabase
        .from('api_configs')
        .select('balance')
        .eq('partner_id', authState.user.id)
        .eq('api_provider', 'invest')
        .maybeSingle();

      const { data: oroplayData, error: oroplayError } = await supabase
        .from('api_configs')
        .select('balance')
        .eq('partner_id', authState.user.id)
        .eq('api_provider', 'oroplay')
        .maybeSingle();

      if (investError) {
        console.error('⚠️ Lv1 invest api_configs 조회 실패:', investError);
      }
      
      if (oroplayError) {
        console.error('⚠️ Lv1 oroplay api_configs 조회 실패:', oroplayError);
      }

      setAdminApiBalances({
        invest: investData?.balance || 0,
        oroplay: oroplayData?.balance || 0
      });
      
      console.log('💰 Lv1 API 보유금 조회:', {
        invest: investData?.balance || 0,
        oroplay: oroplayData?.balance || 0
      });
    } catch (error) {
      console.error('❌ Lv1 API 보유금 조회 실패:', error);
    }
  };

  // 현재 사용자의 보유금 조회
  const fetchCurrentUserBalance = async () => {
    if (!authState.user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('balance, level')
        .eq('id', authState.user.id)
        .single();
      
      if (error) throw error;
      
      console.log('💰 [PartnerManagement] 관리자 보유금 조회 (partners 테이블):', {
        level: data?.level,
        balance: data?.balance
      });
      
      // Lv1의 경우: api_configs에서 실제 보유금 조회
      if (data?.level === 1) {
        // ✅ 새 구조: api_provider별로 별도 조회
        const { data: investData, error: investError } = await supabase
          .from('api_configs')
          .select('balance')
          .eq('partner_id', authState.user.id)
          .eq('api_provider', 'invest')
          .maybeSingle();
        
        const { data: oroplayData, error: oroplayError } = await supabase
          .from('api_configs')
          .select('balance')
          .eq('partner_id', authState.user.id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();
        
        if (!investError && investData) {
          setCurrentUserInvestBalance(investData.balance || 0);
        } else {
          console.warn('⚠️ Lv1 invest api_configs 조회 실패:', investError);
          setCurrentUserInvestBalance(0);
        }
        
        if (!oroplayError && oroplayData) {
          setCurrentUserOroplayBalance(oroplayData.balance || 0);
        } else {
          console.warn('⚠️ Lv1 oroplay api_configs 조회 실패:', oroplayError);
          setCurrentUserOroplayBalance(0);
        }
        
        console.log('✅ Lv1 보유금 설정 (api_configs):', {
          invest: investData?.balance || 0,
          oroplay: oroplayData?.balance || 0
        });
      }
      // Lv2의 경우: invest_balance + oroplay_balance 두 개 지갑 사용
      else if (data?.level === 2) {
        // ✅ Lv2는 두 개의 지갑을 관리 (partners.invest_balance, partners.oroplay_balance)
        setCurrentUserInvestBalance(data?.invest_balance || 0);
        setCurrentUserOroplayBalance(data?.oroplay_balance || 0);
        
        console.log('✅ Lv2 보유금 설정 (두 개 지갑):', {
          invest_balance: data?.invest_balance || 0,
          oroplay_balance: data?.oroplay_balance || 0
        });
      }
      // Lv3~7의 경우 단일 balance 저장
      else {
        setCurrentUserBalance(data?.balance || 0);
        console.log('✅ Lv3~7 보유금 설정:', data?.balance || 0);
      }
    } catch (error) {
      console.error('❌ 현재 사용자 보유금 조회 실패:', error);
    }
  };

  // ✅ 초기 로드 및 Realtime 구독
  useEffect(() => {
    if (authState.user?.id) {
      loadSystemDefaultCommission();
      loadParentCommission();
      fetchPartners();
      fetchDashboardData();
      fetchAdminApiBalances(); // ✅ Lv1 api_configs 조회
      fetchCurrentUserBalance(); // ✅ 현재 사용자 보유금 조회
    }
  }, [authState.user?.id]);

  useEffect(() => {
    if (!authState.user?.id) return;

    console.log('✅ Realtime 구독: partners.balance 변경 감지');

    // ✅ Lv3~Lv6용 partners.balance 변경 감지 (Lv1/Lv2 제외)
    const partnerChannel = supabase
      .channel('partner_balance_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'partners',
        },
        (payload) => {
          const partnerId = (payload.new as any).id;
          const oldBalance = (payload.old as any).balance;
          const newBalance = (payload.new as any).balance;
          
          // balance 변경이 없으면 무시
          if (oldBalance === newBalance) return;
          
          // ✅ Lv3~Lv6만 처리 (Lv1은 api_configs, Lv2는 별도 구독에서 처리)
          setPartners(prev => {
            const partner = prev.find(p => p.id === partnerId);
            if (!partner) return prev;
            
            // Lv1은 무시 (api_configs 사용)
            if (partner.level === 1) {
              console.log(`⏭️ Lv1 balance 변경 무시 (api_configs 사용)`);
              return prev;
            }
            
            // Lv2는 무시 (invest_balance/oroplay_balance 전용 구독에서 처리)
            if (partner.level === 2) {
              console.log(`⏭️ Lv2 balance 변경 무시 (Lv2 전용 구독에서 처리)`);
              return prev;
            }
            
            // Lv3~Lv6만 업데이트
            console.log(`💰 Lv${partner.level} 보유금 변경 (partner_id: ${partnerId}): ${oldBalance} → ${newBalance}`);
            return prev.map(p => 
              p.id === partnerId ? { ...p, balance: newBalance } : p
            );
          });
        }
      )
      .subscribe();

    // Lv1(시스템관리자) api_configs 테이블 변경 감지
    const apiConfigChannel = supabase
      .channel('api_configs_balance_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'api_configs',
        },
        async (payload) => {
          const partnerId = (payload.new as any).partner_id;
          const apiProvider = (payload.new as any).api_provider;
          const oldBalance = (payload.old as any).balance || 0;
          const newBalance = (payload.new as any).balance || 0;
          
          // 변경이 없으면 무시
          if (oldBalance === newBalance) return;
          
          console.log(`💰 API 보유금 변경 (partner_id: ${partnerId}, provider: ${apiProvider}): ${oldBalance} → ${newBalance}`);
          
          // ✅ 현재 로그인한 Lv1 관리자 본인의 보유금이면 adminApiBalances도 업데이트
          if (partnerId === authState.user?.id && authState.user?.level === 1) {
            setAdminApiBalances(prev => ({
              ...prev,
              [apiProvider]: newBalance
            }));
            console.log('💰 Lv1 관리자 본인 API 보유금 업데이트:', {
              provider: apiProvider,
              balance: newBalance
            });
          }
          
          // ✅ Lv1 파트너만 업데이트 (기존 상태에서 level 확인)
          setPartners(prev => {
            const partner = prev.find(p => p.id === partnerId);
            if (!partner || partner.level !== 1) return prev;
            
            return prev.map(p => {
              if (p.id === partnerId) {
                const updates: any = {
                  ...p,
                  balance: 0 // ✅ Lv1은 partners.balance를 0으로 유지
                };
                
                // api_provider에 따라 해당 balance 업데이트
                if (apiProvider === 'invest') {
                  updates.invest_balance = newBalance;
                } else if (apiProvider === 'oroplay') {
                  updates.oroplay_balance = newBalance;
                }
                
                return updates;
              }
              return p;
            });
          });
        }
      )
      .subscribe();

    // Lv2(대본사) partners 테이블의 invest_balance, oroplay_balance 변경 감지
    const lv2BalanceChannel = supabase
      .channel('lv2_balance_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'partners',
        },
        async (payload) => {
          const partnerId = (payload.new as any).id;
          const oldInvestBalance = (payload.old as any).invest_balance || 0;
          const newInvestBalance = (payload.new as any).invest_balance || 0;
          const oldOroplayBalance = (payload.old as any).oroplay_balance || 0;
          const newOroplayBalance = (payload.new as any).oroplay_balance || 0;
          
          // invest_balance 또는 oroplay_balance 변경이 있는지 확인
          const hasBalanceChange = oldInvestBalance !== newInvestBalance || oldOroplayBalance !== newOroplayBalance;
          
          if (!hasBalanceChange) return;
          
          // ✅ Lv2만 처리 (기존 상태에서 level 확인)
          setPartners(prev => {
            const partner = prev.find(p => p.id === partnerId);
            if (!partner || partner.level !== 2) return prev;
            
            console.log(`💰 Lv2 보유금 변경 (partner_id: ${partnerId}):`, {
              invest_balance: newInvestBalance,
              oroplay_balance: newOroplayBalance
            });
            
            return prev.map(p => {
              if (p.id === partnerId) {
                return {
                  ...p,
                  invest_balance: newInvestBalance,
                  oroplay_balance: newOroplayBalance
                };
              }
              return p;
            });
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(partnerChannel);
      supabase.removeChannel(apiConfigChannel);
      supabase.removeChannel(lv2BalanceChannel);
    };
  }, [authState.user?.id]);

  // 파트너 목록 조회
  const fetchPartners = async () => {
    try {
      setLoading(true);
      
      // ✅ 디버깅: 현재 로그인 사용자 정보 확인
      console.log('🔍 [파트너 조회] authState.user:', {
        id: authState.user?.id,
        username: authState.user?.username,
        level: authState.user?.level,
        partner_type: authState.user?.partner_type
      });

      // ✅ 로그인 확인
      if (!authState.user?.id) {
        console.error('❌ [파트너 조회] 로그인된 사용자가 없습니다');
        toast.error(t.partnerManagement.fetchLoginInfoError);
        setPartners([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('partners')
        .select(`
          id,
          username,
          nickname,
          partner_type,
          level,
          parent_id,
          balance,
          invest_balance,
          oroplay_balance,
          commission_rolling,
          commission_losing,
          withdrawal_fee,
          status,
          created_at,
          updated_at,
          parent:parent_id (
            nickname
          )
        `)
        .order('level', { ascending: true })
        .order('created_at', { ascending: false });

      // 권한별 필터링
      const isSystemAdmin = authState.user.level === 1;
      console.log(`🔍 [파트너 조회] 시스템 관리자 여부: ${isSystemAdmin}`);

      const { data, error } = isSystemAdmin
        ? await query  // 시스템관리자: 모든 파트너
        : await supabase.rpc('get_hierarchical_partners', { p_partner_id: authState.user.id });  // 하위 모든 파트너

      console.log('📊 [파트너 조회] 결과:', {
        데이터개수: data?.length || 0,
        에러: error?.message || 'null'
      });

      if (error) {
        console.error('[Partner List Fetch Error]:', error);
        toast.error(t.partnerManagement.fetchPartnersError);
        throw error;
      }

      // 하위 파트너와 사용자 수 집계 + 보유금 실시간 표시
      const partnersWithCounts = await Promise.all(
        (data || []).map(async (partner) => {
          // 하위 파트너 수 조회
          const { count: childCount } = await supabase
            .from('partners')
            .select('*', { count: 'exact' })
            .eq('parent_id', partner.id);

          // 관리하는 사용자 수 조회
          const { count: userCount } = await supabase
            .from('users')
            .select('*', { count: 'exact' })
            .eq('referrer_id', partner.id);

          // ✅ 지갑 구조별 잔고 조회
          // - Lv1: api_configs.invest_balance + api_configs.oroplay_balance (외부 API 지갑)
          // - Lv2: partners.invest_balance + partners.oroplay_balance
          // - Lv3~6: partners.balance (단일 지갑)
          let investBalance = 0;
          let oroplayBalance = 0;
          
          if (partner.level === 1) {
            // Lv1: api_configs 테이블에서 조회 (새 구조: api_provider별로 별도 조회)
            const { data: investData } = await supabase
              .from('api_configs')
              .select('balance')
              .eq('partner_id', partner.id)
              .eq('api_provider', 'invest')
              .maybeSingle();
            
            const { data: oroplayData } = await supabase
              .from('api_configs')
              .select('balance')
              .eq('partner_id', partner.id)
              .eq('api_provider', 'oroplay')
              .maybeSingle();
            
            investBalance = investData?.balance || 0;
            oroplayBalance = oroplayData?.balance || 0;
          } else if (partner.level === 2) {
            // Lv2: 두 개 지갑 사용 (partners.invest_balance + partners.oroplay_balance)
            investBalance = partner.invest_balance || 0;
            oroplayBalance = partner.oroplay_balance || 0;
            
            console.log('🔍 [Lv2 보유금 조회]:', {
              partner_id: partner.id,
              nickname: partner.nickname,
              invest_balance_raw: partner.invest_balance,
              oroplay_balance_raw: partner.oroplay_balance,
              invest_balance_parsed: investBalance,
              oroplay_balance_parsed: oroplayBalance,
              total: investBalance + oroplayBalance
            });
          }

          // ✅ 보유금 계산
          // - Lv1: api_configs의 invest_balance + oroplay_balance (외부 API 지갑)
          // - Lv2: partners.invest_balance + partners.oroplay_balance (두 개 지갑)
          // - Lv3~6: partners.balance (단일 지갑)
          
          return {
            ...partner,
            parent_nickname: partner.parent?.nickname || '-',
            child_count: childCount || 0,
            user_count: userCount || 0,
            balance: partner.level === 1 || partner.level === 2 ? 0 : (partner.balance || 0), // ✅ Lv1, Lv2는 balance 미사용
            invest_balance: investBalance, // ✅ Lv1, Lv2 사용
            oroplay_balance: oroplayBalance // ✅ Lv1, Lv2 사용
          };
        })
      );

      setPartners(partnersWithCounts);
    } catch (error) {
      console.error('[Partner List Fetch Error]:', error);
      toast.error(t.partnerManagement.fetchPartnersError);
    } finally {
      setLoading(false);
    }
  };

  // 커미션 검증
  const validateCommission = (
    rolling: number,
    losing: number,
    fee: number,
    partnerType: Partner['partner_type']
  ): boolean => {
    // 대본사는 항상 100%
    if (partnerType === 'head_office') {
      if (rolling !== 100 || losing !== 100 || fee !== 100) {
        toast.error(t.partnerManagement.commissionValidation);
        return false;
      }
      return true;
    }

    // 하위 파트너는 상위 파트너 커미션을 초과할 수 없음
    if (parentCommission) {
      if (rolling > parentCommission.rolling) {
        toast.error(t.partnerManagement.exceedParentRollingError.replace('{{rate}}', parentCommission.rolling.toString()));
        return false;
      }
      if (losing > parentCommission.losing) {
        toast.error(t.partnerManagement.exceedParentLosingError.replace('{{rate}}', parentCommission.losing.toString()));
        return false;
      }
      if (fee > parentCommission.fee) {
        toast.error(t.partnerManagement.exceedParentFeeError.replace('{{rate}}', parentCommission.fee.toString()));
        return false;
      }
    }

    return true;
  };

  // 파트너 생성
  const createPartner = async () => {
    try {
      setLoading(true);

      // 필수 필드 검증
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

      // 권한 검증
      if (!canCreatePartner(formData.partner_type)) {
        toast.error(t.partnerManagement.noPermissionError);
        return;
      }

      // 계층 구조 검증 (시스템관리자 제외)
      if (authState.user?.level !== 1) {
        const hierarchyCheck = await checkHierarchyGap(formData.partner_type);
        
        if (hierarchyCheck.hasGap) {
          toast.error(hierarchyCheck.message, { duration: 5000 });
          return;
        }

        // 직접 상위 파트너 ID가 없으면 에러
        if (!hierarchyCheck.directParentId) {
          toast.error(t.partnerManagement.parentNotFoundDetailError.replace('{{partnerType}}', partnerTypeTexts[formData.partner_type]));
          return;
        }
      }

      // 대본사는 커미션 100% 강제 설정
      let rollingCommission = formData.commission_rolling;
      let losingCommission = formData.commission_losing;
      let withdrawalFee = formData.withdrawal_fee;

      if (formData.partner_type === 'head_office') {
        rollingCommission = 100;
        losingCommission = 100;
        withdrawalFee = 100;
      }

      // 커미션 검증
      if (!validateCommission(rollingCommission, losingCommission, withdrawalFee, formData.partner_type)) {
        return;
      }

      // 레벨 계산
      const level = getPartnerLevel(formData.partner_type);
      
      // parent_id 결정: 직접 상위 파트너 찾기
      let parentId = authState.user?.id || null;
      
      if (authState.user?.level !== 1) {
        const hierarchyCheck = await checkHierarchyGap(formData.partner_type);
        if (hierarchyCheck.directParentId) {
          parentId = hierarchyCheck.directParentId;
        }
      }
      
      // ✅ 비밀번호 해시 처리 (PostgreSQL crypt 함수 사용)
      // RPC 함수로 해시 생성
      const { data: hashedPassword, error: hashError } = await supabase
        .rpc('hash_password', { password: formData.password });

      if (hashError) {
        console.error('❌ 비밀번호 해시 오류:', hashError);
        toast.error(t.common.error);
        return;
      }

      // ✅ Lv2(대본사) 생성 시: API 계정 생성하지 않음
      // → api_configs 테이블에 빈 레코드만 생성하고, 관리자가 수동으로 opcode 입력
      // ✅ Lv3~Lv6 생성 시: 상위 대본사의 api_configs에서 opcode 조회하여 Invest API 계정 생성
      
      let needsApiAccount = formData.partner_type !== 'head_office'; // 대본사는 API 계정 불필요
      
      if (needsApiAccount) {
        console.log('🔍 [하위 파트너 생성] api_configs에서 API 설정 조회 시작');
        
        // opcodeHelper 사용하여 상위 대본사 API 설정 조회
        try {
          const { getAdminOpcode, isMultipleOpcode } = await import('../../lib/opcodeHelper');
          
          // ✅ 현재 로그인한 관리자 정보로 OPCODE 조회 (생성될 파트너 정보 아님!)
          console.log('🔍 [OPCODE 조회] authState.user:', {
            id: authState.user?.id,
            username: authState.user?.username,
            partner_type: authState.user?.partner_type,
            level: authState.user?.level,
            parent_id: authState.user?.parent_id
          });
          
          if (!authState.user) {
            throw new Error('로그인 정보를 찾을 수 없습니다.');
          }
          
          const opcodeInfo = await getAdminOpcode(authState.user as any);
          
          let apiOpcode: string;
          let apiSecretKey: string;
          let apiToken: string;
          
          if (isMultipleOpcode(opcodeInfo)) {
            if (opcodeInfo.opcodes.length === 0) {
              toast.error(t.partnerManagement.noApiConfigError);
              return;
            }
            apiOpcode = opcodeInfo.opcodes[0].opcode;
            apiSecretKey = opcodeInfo.opcodes[0].secretKey;
            apiToken = opcodeInfo.opcodes[0].token;
          } else {
            apiOpcode = opcodeInfo.opcode;
            apiSecretKey = opcodeInfo.secretKey;
            apiToken = opcodeInfo.token;
          }
          
          console.log('✅ api_configs에서 API 설정 조회 성공:', { opcode: apiOpcode });
          
          // API username: btn_ prefix 제거
          const apiUsername = formData.username.replace(/^btn_/, '');

          console.log('📡 [POST /api/account] Invest API 계정 생성 호출:', {
            opcode: apiOpcode,
            username: apiUsername,
            partner_type: formData.partner_type
          });

          const { createAccount } = await import('../../lib/investApi');
          const apiResult = await createAccount(apiOpcode, apiUsername, apiSecretKey);

          console.log('📊 [POST /api/account] API 응답:', apiResult);

          // API 실패 시 에러 처리 (DB 생성 안 함)
          if (apiResult.error) {
            console.error('❌ Invest API 계정 생성 실패:', apiResult.error);
            toast.error(t.partnerManagement.apiAccountCreationError.replace('{{error}}', apiResult.error));
            return;
          }

          console.log('✅ Invest API 계정 생성 성공');
          
        } catch (error: any) {
          console.error('❌ API 설정 조회 실패:', error);
          toast.error(t.partnerManagement.apiConfigFetchFailedError.replace('{{error}}', error.message));
          return;
        }
      } else {
        console.log('🏢 [대본사 생성] API 계정 생성 건너뜀 (수동 설정 필요)');
      }

      // ✅ 내부 DB 파트너 생성
      const insertData: any = {
        username: formData.username,
        nickname: formData.nickname,
        password_hash: hashedPassword,
        partner_type: formData.partner_type,
        level,
        parent_id: parentId,
        commission_rolling: rollingCommission,
        commission_losing: losingCommission,
        withdrawal_fee: withdrawalFee,
        status: 'active'
      };
      
      // ✅ Lv2의 경우: balance는 NULL, invest_balance와 oroplay_balance는 0으로 초기화
      if (level === 2) {
        insertData.balance = null;
        insertData.invest_balance = 0;
        insertData.oroplay_balance = 0;
      }
      // ✅ Lv3~7의 경우: balance는 0, invest_balance와 oroplay_balance는 NULL
      else if (level >= 3) {
        insertData.balance = 0;
        insertData.invest_balance = null;
        insertData.oroplay_balance = null;
      }

      console.log('📝 파트너 생성 데이터:', {
        username: insertData.username,
        partner_type: insertData.partner_type,
        level: insertData.level,
        parent_id: insertData.parent_id,
        current_user: authState.user?.username,
        current_user_level: authState.user?.level
      });

      const { data, error } = await supabase
        .from('partners')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        console.error('❌ 파트너 생성 DB 오류:', error);
        toast.error(t.partnerManagement.createPartnerError);
        return;
      }
      
      // ✅ Lv2(대본사) 생성 시: api_configs는 생성하지 않음
      // Lv2는 GMS 머니만 사용하며, api_configs는 Lv1 전용입니다.
      if (formData.partner_type === 'head_office') {
        console.log('ℹ️ Lv2(대본사)는 api_configs를 사용하지 않습니다 (GMS 머니만 사용)');
      }

      console.log('✅ 파트너 생성 성공:', {
        id: data.id,
        username: data.username,
        partner_type: data.partner_type,
        level: data.level,
        parent_id: data.parent_id
      });

      toast.success(t.partnerManagement.partnerCreatedSuccess);
      setShowCreateDialog(false);
      resetFormData();
      
      // 실시간 업데이트
      if (connected && sendMessage) {
        sendMessage({
          type: 'partner_created',
          data: { partner: data }
        });
      }

      fetchPartners();
    } catch (error) {
      console.error('파트너 생성 오류:', error);
      toast.error(t.partnerManagement.createPartnerError);
    } finally {
      setLoading(false);
    }
  };

  // 파트너 수정
  const updatePartner = async () => {
    if (!selectedPartner) return;

    try {
      setLoading(true);

      // 커미션 검증
      if (!validateCommission(
        formData.commission_rolling,
        formData.commission_losing,
        formData.withdrawal_fee,
        selectedPartner.partner_type
      )) {
        return;
      }

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

      // 비밀번호가 입력된 경우에만 업데이트 (트리거가 해시 처리)
      if (formData.password && formData.password.trim() !== '') {
        updateData.password_hash = formData.password;
      }

      const { error } = await supabase
        .from('partners')
        .update(updateData)
        .eq('id', selectedPartner.id);

      if (error) throw error;

      toast.success(t.partnerManagement.partnerUpdatedSuccess);
      setShowEditDialog(false);
      setSelectedPartner(null);
      
      // 실시간 업데이트
      if (connected && sendMessage) {
        sendMessage({
          type: 'partner_updated',
          data: { partnerId: selectedPartner.id, updates: updateData }
        });
      }

      fetchPartners();
    } catch (error) {
      console.error('파트너 수정 오류:', error);
      toast.error(t.partnerManagement.updatePartnerError);
    } finally {
      setLoading(false);
    }
  };

  // 파트너 삭제
  const deletePartner = async () => {
    if (!partnerToDelete) return;
    
    // 삭제 확인 텍스트 검증
    if (deleteConfirmText !== partnerToDelete.username) {
      toast.error(t.partnerManagement.deleteConfirmTextError);
      return;
    }

    try {
      setDeleteLoading(true);

      // 1. 하위 파트너 존재 여부 확인
      const { count: childCount } = await supabase
        .from('partners')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', partnerToDelete.id);

      if (childCount && childCount > 0) {
        toast.error(t.partnerManagement.hasChildPartnersError.replace('{{count}}', childCount.toString()));
        return;
      }

      // 2. 관리 중인 사용자 존재 여부 확인
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', partnerToDelete.id);

      if (userCount && userCount > 0) {
        toast.error(t.partnerManagement.hasManagedUsersError.replace('{{count}}', userCount.toString()));
        return;
      }

      // 3. 파트너 삭제
      const { error } = await supabase
        .from('partners')
        .delete()
        .eq('id', partnerToDelete.id);

      if (error) throw error;

      toast.success(t.partnerManagement.partnerDeletedWithName.replace('{{nickname}}', partnerToDelete.nickname), {
        duration: 3000,
        icon: '🗑️'
      });

      // 실시간 업데이트
      if (connected && sendMessage) {
        sendMessage({
          type: 'partner_deleted',
          data: { partnerId: partnerToDelete.id }
        });
      }

      // 다이얼로그 닫기 및 목록 새로고침
      setShowDeleteDialog(false);
      setPartnerToDelete(null);
      setDeleteConfirmText("");
      fetchPartners();

    } catch (error) {
      console.error('파트너 삭제 오류:', error);
      toast.error(t.partnerManagement.deleteFailedError);
    } finally {
      setDeleteLoading(false);
    }
  };

  // 강제 입출금 핸들러 (ForceTransactionModal 사용)
  const handleForceTransaction = async (data: {
    targetId: string;
    type: 'deposit' | 'withdrawal';
    amount: number;
    memo: string;
    apiType?: 'invest' | 'oroplay';
  }) => {
    if (!authState.user?.id) return;

    try {
      console.log('💰 [파트너 강제 입출금] 시작:', data);

      // 1. 대상 파트너 정보 조회
      const { data: targetPartner, error: targetError } = await supabase
        .from('partners')
        .select('*')
        .eq('id', data.targetId)
        .single();

      if (targetError || !targetPartner) {
        toast.error(t.partnerManagement.targetPartnerFetchError);
        console.error('❌ 대상 파트너 조회 실패:', targetError);
        return;
      }

      // 2. 관리자 정보 조회
      const { data: adminPartner, error: adminError } = await supabase
        .from('partners')
        .select('balance, level, nickname, partner_type')
        .eq('id', authState.user.id)
        .single();

      if (adminError || !adminPartner) {
        toast.error(t.partnerManagement.adminInfoFetchError);
        console.error('❌ 관리자 정보 조회 실패:', adminError);
        return;
      }

      const isSystemAdmin = adminPartner.level === 1;
      const isHeadOffice = targetPartner.partner_type === 'head_office';
      const isLv1ToLv2 = isSystemAdmin && targetPartner.level === 2;
      const isLv1ToLv3 = isSystemAdmin && targetPartner.level === 3;
      const isLv2ToLv3 = adminPartner.level === 2 && targetPartner.level === 3;

      console.log('📊 [파트너 강제 입출금] 상황:', {
        isLv1ToLv2,
        adminLevel: adminPartner.level,
        targetLevel: targetPartner.level,
        apiType: data.apiType
      });

      // 3. 출금 시 대상 파트너 보유금 검증
      if (data.type === 'withdrawal') {
        // Lv2는 두 개의 지갑 중에서 해당 API 잔고 확인
        if (isLv1ToLv2 && data.apiType) {
          const currentBalance = (data.apiType === 'invest' ? targetPartner.invest_balance : targetPartner.oroplay_balance) || 0;
          if (currentBalance < data.amount) {
            const balanceName = data.apiType === 'invest' ? 'Invest' : 'OroPlay';
            toast.error(t.partnerManagement.withdrawalExceedError.replace('{{balance}}', `${balanceName} ${currentBalance.toLocaleString()}`));
            return;
          }
        }
        // Lv3~7은 단일 balance 사용
        else if (!isLv1ToLv2 && targetPartner.balance < data.amount) {
          toast.error(t.partnerManagement.withdrawalExceedError.replace('{{balance}}', targetPartner.balance.toLocaleString()));
          return;
        }
      }

      // 4. 입금 시 관리자 보유금 검증
      if (data.type === 'deposit') {
        // Lv1 → Lv2 특별 처리: API별 검증
        if (isLv1ToLv2 && data.apiType) {
          // ✅ 새 구조: api_provider별 balance 조회
          const { data: apiConfig, error: apiConfigError } = await supabase
            .from('api_configs')
            .select('balance')
            .eq('partner_id', authState.user.id)
            .eq('api_provider', data.apiType)
            .maybeSingle();

          if (apiConfigError || !apiConfig) {
            toast.error(t.partnerManagement.apiConfigFetchError);
            console.error('❌ API 설정 조회 실패:', apiConfigError);
            return;
          }

          const availableBalance = apiConfig.balance || 0;

          console.log(`💳 Lv1 ${data.apiType.toUpperCase()} API 보유금:`, availableBalance);

          if (availableBalance < data.amount) {
            const apiName = data.apiType === 'invest' ? 'Invest' : 'OroPlay';
            toast.error(t.partnerManagement.apiBalanceInsufficientError
              .replace('{{apiName}}', apiName)
              .replace('{{balance}}', availableBalance.toLocaleString()));
            return;
          }
        }
        // Lv2 입금 시: 두 개 지갑 중 하나를 사용 (apiType 필요)
        else if (adminPartner.level === 2 && data.apiType) {
          const currentBalance = (data.apiType === 'invest' ? adminPartner.invest_balance : adminPartner.oroplay_balance) || 0;
          if (data.amount > currentBalance) {
            const balanceName = data.apiType === 'invest' ? 'Invest' : 'OroPlay';
            toast.error(t.partnerManagement.balanceInsufficientError.replace('{{balance}}', `${balanceName} ${currentBalance.toLocaleString()}`));
            return;
          }
        }
        // 일반 검증 (Lv3~6)
        else if (!isLv1ToLv2 && adminPartner.balance < data.amount) {
          toast.error(t.partnerManagement.balanceInsufficientError.replace('{{balance}}', adminPartner.balance.toLocaleString()));
          return;
        }
      }

      // ✅ 5. Lv1 → Lv2 입금은 외부 API 호출 없이 DB만 업데이트
      // ⚠️ Lv1의 외부 지갑(api_configs)은 건드리지 않고, Lv2에게만 할당
      if (isLv1ToLv2 && data.type === 'deposit' && data.apiType) {
        console.log('✅ [Lv1→Lv2 입금] Lv1 외부 지갑은 변경하지 않고 Lv2에게만 할당');
        console.log('🔍 [입금 대상 확인]', {
          'Lv1 ID (authState.user.id)': authState.user.id,
          'Lv1 닉네임': adminPartner.nickname,
          'Lv2 ID (data.targetId)': data.targetId,
          'Lv2 닉네임': targetPartner.nickname,
          'Lv2 레벨': targetPartner.level
        });
        
        // ✅ Lv2는 두 개의 지갑(invest_balance, oroplay_balance) 사용
        const balanceField = data.apiType === 'invest' ? 'invest_balance' : 'oroplay_balance';
        const currentBalance = (data.apiType === 'invest' ? targetPartner.invest_balance : targetPartner.oroplay_balance) || 0;
        const newBalance = currentBalance + data.amount;

        console.log(`🔍 Lv2 partners.${balanceField} 증가 예정 (partner_id: ${data.targetId}):`, {
          before: currentBalance,
          after: newBalance,
          amount: data.amount
        });

        // ✅ partners 테이블 API별 잔고 업데이트
        const { error: updateError } = await supabase
          .from('partners')
          .update({ 
            [balanceField]: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.targetId);

        if (updateError) {
          toast.error(t.partnerManagement.lv2BalanceUpdateError);
          console.error('❌ Lv2 partners 업데이트 실패:', updateError);
          return;
        }

        console.log(`✅ Lv2 partners.${balanceField} 증가:`, {
          before: currentBalance,
          after: newBalance,
          amount: data.amount
        });

        // 로그 기록 - Lv2 증가 (Lv1 차감 로그는 제거)
        const apiName = data.apiType === 'invest' ? 'Invest' : 'OroPlay';
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: data.targetId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: data.amount,
            transaction_type: 'deposit',
            from_partner_id: authState.user.id,
            to_partner_id: data.targetId,
            processed_by: authState.user.id,
            api_type: data.apiType,
            memo: `[${apiName} API 할당] ${adminPartner.nickname}으로부터 ${data.amount.toLocaleString()}원 할당${data.memo ? `: ${data.memo}` : ''}`
          });

        toast.success(t.partnerManagement.apiAllocationSuccess
          .replace('{{nickname}}', targetPartner.nickname)
          .replace('{{apiName}}', apiName)
          .replace('{{amount}}', data.amount.toLocaleString()));

        // 목록 새로고침
        fetchPartners();
        return;
      }

      // ✅ 6. Lv1 → Lv2 출금도 외부 API 호출 없이 DB만 업데이트
      // ⚠️ Lv1의 외부 지갑(api_configs)은 건드리지 않고, Lv2에서만 회수
      if (isLv1ToLv2 && data.type === 'withdrawal' && data.apiType) {
        console.log('✅ [Lv1→Lv2 출금] Lv1 외부 지갑은 변경하지 않고 Lv2에서만 회수');

        // ✅ Lv2는 두 개의 지갑(invest_balance, oroplay_balance) 사용
        const balanceField = data.apiType === 'invest' ? 'invest_balance' : 'oroplay_balance';
        const currentBalance = (data.apiType === 'invest' ? targetPartner.invest_balance : targetPartner.oroplay_balance) || 0;
        const newBalance = currentBalance - data.amount;

        console.log(`🔍 Lv2 partners.${balanceField} 차감 예정 (partner_id: ${data.targetId}):`, {
          before: currentBalance,
          after: newBalance,
          amount: -data.amount
        });

        // Lv2 partners 테이블 API별 잔고 업데이트
        const { error: updateError } = await supabase
          .from('partners')
          .update({ 
            [balanceField]: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.targetId);

        if (updateError) {
          toast.error(t.partnerManagement.lv2WithdrawalDeductError);
          console.error('❌ Lv2 partners 업데이트 실패:', updateError);
          return;
        }

        console.log(`✅ Lv2 partners.${balanceField} 차감:`, {
          before: currentBalance,
          after: newBalance,
          amount: -data.amount
        });

        // 로그 기록 - Lv2 차감 (Lv1 증가 로그는 제거)
        const apiName = data.apiType === 'invest' ? 'Invest' : 'OroPlay';
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: data.targetId,
            balance_before: currentBalance,
            balance_after: newBalance,
            amount: -data.amount,
            transaction_type: 'withdrawal',
            from_partner_id: data.targetId,
            to_partner_id: authState.user.id,
            processed_by: authState.user.id,
            api_type: data.apiType,
            memo: `[${apiName} API 회수] ${adminPartner.nickname}이(가) ${data.amount.toLocaleString()}원 회수${data.memo ? `: ${data.memo}` : ''}`
          });

        toast.success(t.partnerManagement.apiRecoveryCompletedFromPartner
          .replace('{{nickname}}', targetPartner.nickname)
          .replace('{{apiName}}', apiName)
          .replace('{{amount}}', data.amount.toLocaleString()));

        // 목록 새로고침
        fetchPartners();
        return;
      }

      // 7. 내부 DB 업데이트 (파트너 간 입출금은 외부 API 호출 없이 DB만 처리)
      console.log('✅ [파트너 강제 입출금] 외부 API 호출 건너뜀 - 내부 DB만 처리');
      
      let adminNewBalance = adminPartner.balance;
      let targetNewBalance = targetPartner.balance;

      if (data.type === 'deposit') { 
        // Lv1/Lv2 → Lv3 입금: Lv2 변동 없음, Lv3 balance만 증가
        if ((isLv1ToLv3 || isLv2ToLv3) && targetPartner.level === 3) {
          console.log('✅ [Lv1/Lv2→Lv3 입금] Lv2 변동 없음, Lv3 balance만 증가');
          
          // Lv1/Lv2: 변동 없음 (기록만)
          // (입금 시에도 Lv2는 변동이 없음 - Lv1과 동일한 로직)

          // Lv3: balance 증가
          const targetBalanceBefore = targetPartner.balance;
          const targetBalanceAfter = targetBalanceBefore + data.amount;

          await supabase
            .from('partners')
            .update({ 
              balance: targetBalanceAfter,
              updated_at: new Date().toISOString()
            })
            .eq('id', data.targetId);

          // ✅ 로그 기록 - Lv3 입금 내역만 기록 (나의 입장에서만)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: data.targetId,
              balance_before: targetBalanceBefore,
              balance_after: targetBalanceAfter,
              amount: data.amount,
              transaction_type: 'deposit',
              from_partner_id: authState.user.id,
              to_partner_id: data.targetId,
              processed_by: authState.user.id,
              memo: `[Lv3 수신] ${adminPartner.nickname}으로부터 ${data.amount.toLocaleString()}원 입금${data.memo ? `: ${data.memo}` : ''}`
            });

          toast.success(t.partnerManagement.depositCompleted
          .replace('{{nickname}}', targetPartner.nickname)
          .replace('{{amount}}', data.amount.toLocaleString()));
          fetchPartners();
          return;
        }
        // ✅ Lv2 → Lv4~6 입금: Lv2의 두 개 지갑 중 하나 차감, Lv4~6 증가
        if (adminPartner.level === 2 && targetPartner.level >= 4 && data.apiType) {
          // Lv2의 invest_balance 또는 oroplay_balance 차감
          const balanceField = data.apiType === 'invest' ? 'invest_balance' : 'oroplay_balance';
          const currentBalance = (data.apiType === 'invest' ? adminPartner.invest_balance : adminPartner.oroplay_balance) || 0;
          const newLv2Balance = currentBalance - data.amount;
          
          await supabase
            .from('partners')
            .update({ 
              [balanceField]: newLv2Balance,
              updated_at: new Date().toISOString()
            })
            .eq('id', authState.user.id);

          // 대상 파트너(Lv4~6) balance 증가
          targetNewBalance = targetPartner.balance + data.amount;
          await supabase
            .from('partners')
            .update({ balance: targetNewBalance, updated_at: new Date().toISOString() })
            .eq('id', data.targetId);

          // ✅ 로그 기록 - Lv4~6 입금 내역만 기록 (나의 입장에서만)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: data.targetId,
              balance_before: targetPartner.balance,
              balance_after: targetNewBalance,
              amount: data.amount,
              transaction_type: 'deposit',
              from_partner_id: authState.user.id,
              to_partner_id: data.targetId,
              processed_by: authState.user.id,
              memo: `[강제입금] ${adminPartner.nickname}으로부터 ${data.amount.toLocaleString()}원 입금${data.memo ? `: ${data.memo}` : ''}`
            });
        }
        // 일반 입금: 관리자 차감, 파트너 증가
        else {
          adminNewBalance = adminPartner.balance - data.amount;
          await supabase
            .from('partners')
            .update({ balance: adminNewBalance, updated_at: new Date().toISOString() })
            .eq('id', authState.user.id);

          targetNewBalance = targetPartner.balance + data.amount;
          await supabase
            .from('partners')
            .update({ balance: targetNewBalance, updated_at: new Date().toISOString() })
            .eq('id', data.targetId);

          // ✅ 로그 기록 - 파트너 입금 내역만 기록 (나의 입장에서만)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: data.targetId,
              balance_before: targetPartner.balance,
              balance_after: targetNewBalance,
              amount: data.amount,
              transaction_type: 'deposit',
              from_partner_id: authState.user.id,
              to_partner_id: data.targetId,
              processed_by: authState.user.id,
              memo: `[강제입금] ${adminPartner.nickname}으로부터 ${data.amount.toLocaleString()}원 입금${data.memo ? `: ${data.memo}` : ''}`
            });
        }

      } else {
        // 출금 처리
        // Lv1/Lv2 → Lv3 회수: Lv2 변동 없음, Lv3 balance만 차감
        if ((isLv1ToLv3 || isLv2ToLv3) && targetPartner.level === 3) {
          console.log(`✅ [Lv1/Lv2→Lv3 회수] Lv2 변동 없음, Lv3 balance만 차감`);
          
          // Lv3: balance 차감
          const targetBalanceBefore = targetPartner.balance;
          const targetBalanceAfter = targetBalanceBefore - data.amount;

          await supabase
            .from('partners')
            .update({ 
              balance: targetBalanceAfter,
              updated_at: new Date().toISOString()
            })
            .eq('id', data.targetId);

          // Lv1/Lv2: 변동 없음 (기록만)
          // (입금할 때도 변동이 없었으니까 회수할 때도 변동 없음)

          // ✅ 로그 기록 - Lv3 출금 내역만 기록 (나의 입장에서만)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: data.targetId,
              balance_before: targetBalanceBefore,
              balance_after: targetBalanceAfter,
              amount: -data.amount,
              transaction_type: 'withdrawal',
              from_partner_id: data.targetId,
              to_partner_id: authState.user.id,
              processed_by: authState.user.id,
              memo: `[Lv3 회수] ${adminPartner.nickname}에게 ${data.amount.toLocaleString()}원 출금${data.memo ? `: ${data.memo}` : ''}`
            });

          toast.success(t.partnerManagement.withdrawalCompleted
            .replace('{{nickname}}', targetPartner.nickname)
            .replace('{{amount}}', data.amount.toLocaleString()));
          fetchPartners();
          return;
        }
        // ✅ Lv2 → Lv4~6 출금: Lv4~6 차감, Lv2의 두 개 지갑 중 하나 증가
        if (adminPartner.level === 2 && targetPartner.level >= 4 && data.apiType) {
          // 대상 파트너(Lv4~6) balance 차감
          targetNewBalance = targetPartner.balance - data.amount;
          await supabase
            .from('partners')
            .update({ balance: targetNewBalance, updated_at: new Date().toISOString() })
            .eq('id', data.targetId);

          // Lv2의 invest_balance 또는 oroplay_balance 증가
          const balanceField = data.apiType === 'invest' ? 'invest_balance' : 'oroplay_balance';
          const currentBalance = (data.apiType === 'invest' ? adminPartner.invest_balance : adminPartner.oroplay_balance) || 0;
          const newLv2Balance = currentBalance + data.amount;
          
          await supabase
            .from('partners')
            .update({ 
              [balanceField]: newLv2Balance,
              updated_at: new Date().toISOString()
            })
            .eq('id', authState.user.id);

          // ✅ 로그 기록 - Lv4~6 출금 내역만 기록 (나의 입장에서만)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: data.targetId,
              balance_before: targetPartner.balance,
              balance_after: targetNewBalance,
              amount: -data.amount,
              transaction_type: 'withdrawal',
              from_partner_id: data.targetId,
              to_partner_id: authState.user.id,
              processed_by: authState.user.id,
              memo: `[강제출금] ${adminPartner.nickname}에게 ${data.amount.toLocaleString()}원 출금${data.memo ? `: ${data.memo}` : ''}`
            });
        }
        // 일반 출금: 파트너 차감, 관리자 증가
        else {
          targetNewBalance = targetPartner.balance - data.amount;
          await supabase
            .from('partners')
            .update({ balance: targetNewBalance, updated_at: new Date().toISOString() })
            .eq('id', data.targetId);

          adminNewBalance = adminPartner.balance + data.amount;
          await supabase
            .from('partners')
            .update({ balance: adminNewBalance, updated_at: new Date().toISOString() })
            .eq('id', authState.user.id);

          // ✅ 로그 기록 - 일반 출금 내역만 기록 (나의 입장에서만)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: data.targetId,
              balance_before: targetPartner.balance,
              balance_after: targetNewBalance,
              amount: -data.amount,
              transaction_type: 'withdrawal',
              from_partner_id: data.targetId,
              to_partner_id: authState.user.id,
              processed_by: authState.user.id,
              memo: `[강제출금] ${adminPartner.nickname}에게 ${data.amount.toLocaleString()}원 출금${data.memo ? `: ${data.memo}` : ''}`
            });
        }
      }

      // 8. 실시간 업데이트
      if (connected && sendMessage) {
        sendMessage({
          type: 'partner_balance_updated',
          data: {
            partnerId: data.targetId,
            amount: data.amount,
            type: data.type
          }
        });
      }

      // 9. 성공 메시지 및 목록 새로고침
      const typeText = data.type === 'deposit' ? t.partnerManagement.depositTypeLabel : t.partnerManagement.withdrawalTypeLabel;
      toast.success(t.partnerManagement.forceTransactionSuccess.replace('{{type}}', typeText).replace('{{amount}}', data.amount.toLocaleString()));
      fetchPartners();

    } catch (error: any) {
      console.error('❌ [파트너 강제 입출금] 오류:', error);
    }
  };

  // 하위 파트너에게 보유금 지급/회수
  const transferBalanceToPartner = async () => {
    if (!transferTargetPartner || !authState.user?.id) return;

    try {
      setTransferLoading(true);

      const amount = parseFloat(transferAmount);

      // 입력 검증
      if (!amount || amount <= 0) {
        const typeText = transferMode === 'deposit' ? t.partnerManagement.depositLabel : t.partnerManagement.withdrawalLabel;
        toast.error(t.partnerManagement.depositOrWithdrawalAmountInvalid.replace('{{type}}', typeText));
        return;
      }

      // 1. 현재 관리자의 보유금 조회
      const { data: currentPartnerData, error: fetchError } = await supabase
        .from('partners')
        .select('balance, nickname, partner_type, level')
        .eq('id', authState.user.id)
        .single();

      if (fetchError) throw fetchError;

      const isSystemAdmin = currentPartnerData.level === 1;
      const isHeadOffice = transferTargetPartner.partner_type === 'head_office';

      // 회수 모드인 경우: 대상 파트너의 보유금 검증
      if (transferMode === 'withdrawal') {
        const { data: targetBalanceData, error: targetBalanceError } = await supabase
          .from('partners')
          .select('balance')
          .eq('id', transferTargetPartner.id)
          .single();

        if (targetBalanceError) throw targetBalanceError;

        if (targetBalanceData.balance < amount) {
          toast.error(t.partnerManagement.targetBalanceInsufficientError.replace('{{balance}}', targetBalanceData.balance.toLocaleString()));
          return;
        }
      }

      // 2. 지급 모드: 보유금 검증
      if (transferMode === 'deposit' && !isSystemAdmin) {
        // ✅ Lv2는 GMS 머니(balance)만 사용
        if (currentPartnerData.balance < amount) {
          toast.error(t.partnerManagement.balanceLowError.replace('{{balance}}', currentPartnerData.balance.toLocaleString()));
          return;
        }
      }

      // 2-1. 대본사가 본사에게 지급할 때: 하위 본사들의 보유금 합계가 대본사 보유금을 초과할 수 없음
      if (transferMode === 'deposit' && currentPartnerData.level === 2 && transferTargetPartner.partner_type === 'main_office') {
        // 현재 대본사 아래의 모든 본사(main_office) 보유금 합계 조회
        const { data: childMainOffices, error: childError } = await supabase
          .from('partners')
          .select('balance')
          .eq('parent_id', authState.user.id)
          .eq('partner_type', 'main_office');

        if (childError) {
          console.error('[Child Main Office Fetch Error]:', childError);
          throw childError;
        }

        const currentChildBalanceSum = (childMainOffices || []).reduce((sum, office) => sum + (office.balance || 0), 0);
        const afterTransferChildBalanceSum = currentChildBalanceSum + amount;

        console.log('💰 [대본사→본사 지급 검증]', {
          대본사_보유금: currentPartnerData.balance,
          현재_하위본사_보유금합계: currentChildBalanceSum,
          지급액: amount,
          지급후_하위본사_보유금합계: afterTransferChildBalanceSum,
          초과여부: afterTransferChildBalanceSum > currentPartnerData.balance
        });

        if (afterTransferChildBalanceSum > currentPartnerData.balance) {
          toast.error(
            `하위 본사들의 보유금 합계가 대본사 보유금을 초과할 수 없습니다.\n` +
            `현재 하위 본사 보유금 합계: ${currentChildBalanceSum.toLocaleString()}원\n` +
            `지급 후 합계: ${afterTransferChildBalanceSum.toLocaleString()}원\n` +
            `대본사 보유금: ${currentPartnerData.balance.toLocaleString()}원`,
            { duration: 5000 }
          );
          return;
        }
      }

      // 3. 외부 API 호출 (수신자의 상위 대본사 opcode 사용)
      // ⚠️ API 실패 시 전체 트랜잭션 중단 (DB 업데이트 안 함)
      let apiUpdatedBalance: number | null = null;
      
      // 수신자의 상위 대본사 opcode 조회
      const { getAdminOpcode, isMultipleOpcode } = await import('../../lib/opcodeHelper');
      
      // 수신자 전체 정보 조회
      const { data: targetPartnerFull, error: targetError } = await supabase
        .from('partners')
        .select('*')
        .eq('id', transferTargetPartner.id)
        .single();

      if (targetError) {
        toast.error(t.partnerManagement.partnerInfoFetchFailedError.replace('{{error}}', targetError.message));
        return;
      }

      console.log('🔍 [파트너 입출금] 상위 대본사 opcode 조회 시작:', {
        partner_id: transferTargetPartner.id,
        partner_type: transferTargetPartner.partner_type,
        partner_nickname: transferTargetPartner.nickname
      });

      let opcode: string;
      let secretKey: string;
      let apiToken: string;
      let apiUsername: string;

      try {
        const opcodeInfo = await getAdminOpcode(targetPartnerFull);
        
        // 시스템 관리자인 경우 첫 번째 opcode 사용
        if (isMultipleOpcode(opcodeInfo)) {
          if (opcodeInfo.opcodes.length === 0) {
            throw new Error('No available OPCODE. Please contact system administrator.');
          }
          opcode = opcodeInfo.opcodes[0].opcode;
          secretKey = opcodeInfo.opcodes[0].secretKey;
          apiToken = opcodeInfo.opcodes[0].token;
          // 시스템 관리자는 첫 번째 opcode의 username 사용
          const { data: firstPartner } = await supabase
            .from('partners')
            .select('username')
            .eq('id', opcodeInfo.opcodes[0].partnerId)
            .single();
          apiUsername = firstPartner?.username?.replace(/^btn_/, '') || '';
        } else {
          opcode = opcodeInfo.opcode;
          secretKey = opcodeInfo.secretKey;
          apiToken = opcodeInfo.token;
          // API 호출용 username (btn_ prefix 제거)
          apiUsername = targetPartnerFull.username.replace(/^btn_/, '');
        }
      } catch (err: any) {
        const errorMsg = t.partnerManagement.upperHeadOfficeApiConfigError.replace('{{error}}', err.message);
        console.error('❌ [Partner Transaction]', errorMsg);
        toast.error(errorMsg, { 
          duration: 5000,
          description: 'Please check API configuration. Database was not updated.'
        });
        return;
      }

      console.log('💰 [파트너 입출금] 외부 API 호출 시작:', {
        partner_type: transferTargetPartner.partner_type,
        partner_nickname: transferTargetPartner.nickname,
        transfer_mode: transferMode,
        amount,
        opcode: opcode,
        apiUsername: apiUsername
      });

      // 외부 API 호출
      const { depositToAccount, withdrawFromAccount } = await import('../../lib/investApi');
      
      let apiResult;
      try {
        if (transferMode === 'deposit') {
          // 입금
          apiResult = await depositToAccount(
            opcode,
            apiUsername,
            apiToken,
            amount,
            secretKey
          );
        } else {
          // 출금
          apiResult = await withdrawFromAccount(
            opcode,
            apiUsername,
            apiToken,
            amount,
            secretKey
          );
        }
      } catch (err: any) {
        const errorMsg = t.partnerManagement.externalApiCallError.replace('{{error}}', err.message);
        console.error('❌ [Partner Transaction]', errorMsg);
        toast.error(errorMsg, {
          duration: 7000,
          description: 'Network error or API server issue. Please try again later. Database was not updated.'
        });
        return;
      }

      console.log('📡 [파트너 입출금] API 응답:', apiResult);

      // API 응답 에러 체크
      if (apiResult.error) {
        const errorMsg = t.partnerManagement.externalApiError.replace('{{error}}', apiResult.error);
        console.error('❌ [Partner Transaction]', errorMsg);
        toast.error(errorMsg, {
          duration: 7000,
          description: 'API server error occurred. Please contact system administrator. Database was not updated.'
        });
        return;
      }

      // data 내부의 에러 메시지 확인
      if (apiResult.data) {
        const responseData = apiResult.data;
        
        // RESULT === false인 경우
        if (responseData.RESULT === false) {
          const errorMsg = responseData.DATA?.message || responseData.message || 'External API processing failed';
          console.error('❌ [Partner Transaction] API Response Error:', errorMsg);
          toast.error(t.partnerManagement.externalApiError.replace('{{error}}', errorMsg), {
            duration: 7000,
            description: 'External system rejected the request. Please check balance or account status. Database was not updated.'
          });
          return;
        }
        
        // 텍스트 응답에서 에러 확인
        if (responseData.is_text && responseData.text_response) {
          const text = responseData.text_response.toLowerCase();
          if (text.includes('error') || text.includes('fail') || text.includes('exceed')) {
            console.error('❌ [Partner Transaction] API Text Response Error:', responseData.text_response);
            toast.error(t.partnerManagement.externalApiError.replace('{{error}}', responseData.text_response), {
              duration: 7000,
              description: 'Database was not updated.'
            });
            return;
          }
        }

          // API 응답��서 실제 잔고 추출
          const { extractBalanceFromResponse } = await import('../../lib/investApi');
          apiUpdatedBalance = extractBalanceFromResponse(responseData, apiUsername);
          console.log('✅ [Partner Transaction] API Success, New Balance:', apiUpdatedBalance);
        }

      const depositOrWithdrawal = transferMode === 'deposit' ? t.partnerManagement.depositText : t.partnerManagement.withdrawalText;
      toast.success(t.partnerManagement.externalApiDepositSuccess.replace('{{amount}}', amount.toLocaleString()).replace('{{type}}', depositOrWithdrawal), {
        duration: 3000,
        icon: '💰'
      });

      // 4. 내부 DB 처리
      let senderNewBalance = currentPartnerData.balance;
      let receiverNewBalance = transferTargetPartner.balance;

      if (transferMode === 'deposit') {
        // 지급: 송금자 차감, 수신자 증가
        if (!isSystemAdmin) {
          // ✅ Lv2는 GMS 머니(balance)만 사용
          senderNewBalance = currentPartnerData.balance - amount;
          const { error: deductError } = await supabase
            .from('partners')
            .update({ 
              balance: senderNewBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', authState.user.id);

          if (deductError) throw deductError;
        }

        // 수신자 보유금 증가
        // API 응답이 있으면 API 응답 값 사용, 없으면 계산값 사용
        const { data: targetPartnerData, error: targetFetchError } = await supabase
          .from('partners')
          .select('balance')
          .eq('id', transferTargetPartner.id)
          .single();

        if (targetFetchError) throw targetFetchError;
        
        if (apiUpdatedBalance !== null && !isNaN(apiUpdatedBalance)) {
          // 외부 API 응답 값 사용
          receiverNewBalance = apiUpdatedBalance;
          console.log('📊 [DB 업데이트] API 응답 잔고 사용:', receiverNewBalance);
        } else {
          // 계산 값 사용
          receiverNewBalance = targetPartnerData.balance + amount;
          console.log('📊 [DB 업데이트] 계산 잔고 사용:', receiverNewBalance);
        }

        const { error: increaseError } = await supabase
          .from('partners')
          .update({ 
            balance: receiverNewBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', transferTargetPartner.id);

        if (increaseError) throw increaseError;

        // ✅ 수신자 로그만 기록 (나의 입장에서만)
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: transferTargetPartner.id,
            balance_before: transferTargetPartner.balance,
            balance_after: receiverNewBalance,
            amount: amount,
            transaction_type: 'deposit',
            from_partner_id: isSystemAdmin ? null : authState.user.id,
            to_partner_id: transferTargetPartner.id,
            processed_by: authState.user.id,
            memo: `[Partner Deposit] Balance received from ${currentPartnerData.nickname}${transferMemo ? `: ${transferMemo}` : ''}`
          });

      } else {
        // 회수: 수신자 차감, 송금자 증가
        const { data: targetPartnerData, error: targetFetchError } = await supabase
          .from('partners')
          .select('balance')
          .eq('id', transferTargetPartner.id)
          .single();

        if (targetFetchError) throw targetFetchError;
        
        if (apiUpdatedBalance !== null && !isNaN(apiUpdatedBalance)) {
          // 외부 API 응답 값 사용
          receiverNewBalance = apiUpdatedBalance;
          console.log('📊 [DB 업데이트] API 응답 잔고 사용:', receiverNewBalance);
        } else {
          // 계산 값 사용
          receiverNewBalance = targetPartnerData.balance - amount;
          console.log('📊 [DB 업데이트] 계산 잔고 사용:', receiverNewBalance);
        }

        const { error: decreaseError } = await supabase
          .from('partners')
          .update({ 
            balance: receiverNewBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', transferTargetPartner.id);

        if (decreaseError) throw decreaseError;

        // 송금자 보유금 증가 (시스템관리자가 아닌 경우)
        if (!isSystemAdmin) {
          // ✅ Lv2는 GMS 머니(balance)만 사용
          senderNewBalance = currentPartnerData.balance + amount;
          const { error: increaseError } = await supabase
            .from('partners')
            .update({ 
              balance: senderNewBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', authState.user.id);

          if (increaseError) throw increaseError;
        }

        // ✅ 대상 파트너 로그만 기록 (나의 입장에서만)
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: transferTargetPartner.id,
            balance_before: targetPartnerData.balance,
            balance_after: receiverNewBalance,
            amount: -amount,
            transaction_type: 'withdrawal',
            from_partner_id: transferTargetPartner.id,
            to_partner_id: isSystemAdmin ? null : authState.user.id,
            processed_by: authState.user.id,
            memo: `[Partner Withdrawal] Balance withdrawn to ${currentPartnerData.nickname}${transferMemo ? `: ${transferMemo}` : ''}`
          });
      }

      const actionText = transferMode === 'deposit' ? t.partnerManagement.depositCompleted : t.partnerManagement.withdrawalCompleted;
      toast.success(actionText.replace('{{nickname}}', transferTargetPartner.nickname).replace('{{amount}}', amount.toLocaleString()), {
        duration: 3000,
        icon: transferMode === 'deposit' ? '💰' : '📥'
      });

      // 실시간 업데이트
      if (connected && sendMessage) {
        sendMessage({
          type: 'partner_balance_transfer',
          data: { 
            from: authState.user.id,
            to: transferTargetPartner.id,
            amount,
            mode: transferMode
          }
        });
      }

      // 다이얼로그 닫기 및 초기화
      setShowTransferDialog(false);
      setTransferTargetPartner(null);
      setTransferAmount("");
      setTransferMemo("");
      setTransferMode('deposit');
      
      // 목록 새로고침
      fetchPartners();

    } catch (error: any) {
      console.error('[Partner Balance Transfer Error]:', error);
      
      // 오류 메시지 파싱
      if (error.message?.includes('관리자 보유금') || error.message?.includes('admin balance') || error.message?.includes('insufficient')) {
        toast.error(t.partnerManagement.balanceInsufficientError.replace('{{balance}}', '0'));
      } else {
        const actionText = transferMode === 'deposit' ? t.partnerManagement.depositLabel : t.partnerManagement.withdrawalLabel;
        toast.error(`${actionText} failed`);
      }
    } finally {
      setTransferLoading(false);
    }
  };



  // 파트너 대시보드 데이터 조회
  const fetchDashboardData = async () => {
    try {
      if (!authState.user) return;

      const today = new Date().toISOString().split('T')[0];
      
      // 오늘의 총 입출금
      const { data: todayTransactions } = await supabase
        .from('transactions')
        .select('transaction_type, amount')
        .eq('partner_id', authState.user.id)
        .gte('created_at', today);

      // ✅ 이번달 커미션: 실제 계산된 값 (내 총 수입 - 하위 파트너 지급)
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // 통합 정산 계산 (내 수입 - 하위 지급 = 순수익)
      const { calculateIntegratedSettlement } = await import('../../lib/settlementCalculator');
      const settlement = await calculateIntegratedSettlement(
        authState.user.id,
        {
          rolling: authState.user.commission_rolling || 0,
          losing: authState.user.commission_losing || 0,
          withdrawal: authState.user.withdrawal_fee || 0
        },
        monthStart.toISOString(),
        monthEnd.toISOString()
      );

      setDashboardData({
        todayDeposits: todayTransactions?.filter(t => t.transaction_type === 'deposit').reduce((sum, t) => sum + Number(t.amount), 0) || 0,
        todayWithdrawals: todayTransactions?.filter(t => t.transaction_type === 'withdrawal').reduce((sum, t) => sum + Number(t.amount), 0) || 0,
        monthlyCommission: Math.round(settlement.netTotalProfit) // 순수익 (내 수입 - 하위 지급)
      });

      // 레벨별 분포 데이터 (하위 파트너만)
      await fetchLevelDistribution();
    } catch (error) {
      console.error('[Dashboard Data Fetch Error]:', error);
    }
  };

  // 레벨별 분포 데이터 조회 (나를 포함한 하위 파트너, 각 레벨의 사용자 보유금 합계)
  const fetchLevelDistribution = async () => {
    try {
      if (!authState.user) return;

      // 나를 포함한 모든 하위 파트너 ID 조회 (partners 배열 활용)
      const myPartnersIds = partners.map(p => p.id);
      const allPartnerIds = authState.user.level === 1 
        ? myPartnersIds 
        : [authState.user.id, ...myPartnersIds];

      if (allPartnerIds.length === 0) {
        setLevelDistribution([]);
        return;
      }

      // 각 파트너 타입별로 그룹화
      const distributionMap = new Map<string, {
        level: number;
        type: string;
        typeName: string;
        partnerIds: string[];
      }>();

      // 파트너 타입별 데이터 수집
      const relevantPartners = authState.user.level === 1 
        ? partners 
        : [authState.user, ...partners];

      relevantPartners.forEach(partner => {
        const key = partner.partner_type;
        if (!distributionMap.has(key)) {
          distributionMap.set(key, {
            level: partner.level,
            type: partner.partner_type,
            typeName: partnerTypeTexts[partner.partner_type],
            partnerIds: []
          });
        }
        distributionMap.get(key)!.partnerIds.push(partner.id);
      });

      // 각 타입별 사용자 보유금 합계 조회
      const distributionData = await Promise.all(
        Array.from(distributionMap.values()).map(async (item) => {
          const { data: usersData } = await supabase
            .from('users')
            .select('balance')
            .in('referrer_id', item.partnerIds);

          const usersBalance = usersData?.reduce((sum, u) => sum + (u.balance || 0), 0) || 0;

          return {
            level: item.level,
            type: item.type,
            typeName: item.typeName,
            partnerCount: item.partnerIds.length,
            usersBalance
          };
        })
      );

      // 레벨 순으로 정렬
      distributionData.sort((a, b) => a.level - b.level);
      setLevelDistribution(distributionData);

    } catch (error) {
      console.error('레벨별 분포 조회 오류:', error);
    }
  };

  // 계층 구조 갭 확인 (중간 계층이 비어있는지 확인)
  const checkHierarchyGap = async (targetPartnerType: Partner['partner_type']): Promise<{
    hasGap: boolean;
    missingLevels: number[];
    directParentId: string | null;
    message: string;
  }> => {
    if (!authState.user) {
      return { hasGap: true, missingLevels: [], directParentId: null, message: '사용자 정보가 없습니다.' };
    }

    const currentLevel = authState.user.level;
    const targetLevel = getPartnerLevel(targetPartnerType);
    
    // 시스템관리자는 제약 없음
    if (currentLevel === 1) {
      return { hasGap: false, missingLevels: [], directParentId: authState.user.id, message: '' };
    }

    // 직접 하위 레벨이면 문제 없음
    if (targetLevel === currentLevel + 1) {
      return { hasGap: false, missingLevels: [], directParentId: authState.user.id, message: '' };
    }

    // 중간 레벨 확인 필요
    const missingLevels: number[] = [];
    let directParentId: string | null = null;

    // 현재 레벨부터 목표 레벨까지 중간 레벨들 확인
    for (let level = currentLevel + 1; level < targetLevel; level++) {
      const { data, error } = await supabase
        .from('partners')
        .select('id, level, partner_type, nickname')
        .eq('level', level)
        .eq('status', 'active');

      if (error) {
        console.error(`레벨 ${level} 파트너 조회 오류:`, error);
        continue;
      }

      // 재귀적으로 현재 사용자의 하위인지 확인
      const { data: hierarchical, error: hierError } = await supabase
        .rpc('get_hierarchical_partners', { p_partner_id: authState.user.id });

      if (hierError) {
        console.error('계층 파트너 조회 오류:', hierError);
        missingLevels.push(level);
        continue;
      }

      const levelPartners = (hierarchical || []).filter((p: any) => p.level === level && p.status === 'active');
      
      if (levelPartners.length === 0) {
        missingLevels.push(level);
      }
    }

    // 직접 상위 파트너 찾기 (목표 레벨 - 1)
    if (missingLevels.length === 0) {
      const parentLevel = targetLevel - 1;
      const { data: hierarchical } = await supabase
        .rpc('get_hierarchical_partners', { p_partner_id: authState.user.id });

      const parentPartners = (hierarchical || []).filter((p: any) => 
        p.level === parentLevel && p.status === 'active'
      );

      if (parentPartners.length > 0) {
        // 가장 최근에 생성된 파트너를 기본 상위로 선택
        directParentId = parentPartners.sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0].id;
      }
    }

    const levelNames: Record<number, string> = {
      2: '대본사',
      3: '본사',
      4: '부본사',
      5: '총판',
      6: '매장'
    };

    let message = '';
    if (missingLevels.length > 0) {
      const missingNames = missingLevels.map(l => levelNames[l] || `Level ${l}`).join(', ');
      message = `⚠️ ${partnerTypeTexts[targetPartnerType]}을(를) 생성하려면 먼저 중간 계층(${missingNames})을 생성해야 합니다.`;
    }

    return {
      hasGap: missingLevels.length > 0,
      missingLevels,
      directParentId,
      message
    };
  };

  // 파트너 생성 권한 체크
  const canCreatePartner = (partnerType: Partner['partner_type']): boolean => {
    if (!authState.user) return false;
    
    const userLevel = authState.user.level;
    const targetLevel = getPartnerLevel(partnerType);
    
    // 시스템관리자는 모든 파트너 생성 가능
    if (userLevel === 1) return true;
    
    // 대본사는 본사부터 매장까지 생성 가능 (하위 레벨만)
    if (userLevel === 2) return targetLevel > 2;
    
    // 본인보다 하위 레벨만 생성 가능
    return targetLevel > userLevel;
  };

  // 파트너 레벨 계산
  const getPartnerLevel = (partnerType: Partner['partner_type']): number => {
    const levelMap = {
      system_admin: 1,
      head_office: 2,
      main_office: 3,
      sub_office: 4,
      distributor: 5,
      store: 6
    };
    return levelMap[partnerType];
  };

  // 폼 데이터 초기화
  const resetFormData = () => {
    setFormData({
      username: "",
      nickname: "",
      password: "",
      partner_type: "head_office",
      parent_id: "",
      opcode: "",
      secret_key: "",
      api_token: "",
      commission_rolling: systemDefaultCommission.rolling,
      commission_losing: systemDefaultCommission.losing,
      withdrawal_fee: systemDefaultCommission.fee
    });
  };

  // 수정 폼 데이터 설정
  const setEditFormData = (partner: Partner) => {
    setFormData({
      username: partner.username,
      nickname: partner.nickname,
      password: "",
      partner_type: partner.partner_type,
      parent_id: partner.parent_id || "",
      opcode: partner.opcode || "",
      secret_key: partner.secret_key || "",
      api_token: partner.api_token || "",
      commission_rolling: partner.commission_rolling,
      commission_losing: partner.commission_losing,
      withdrawal_fee: partner.withdrawal_fee
    });
  };

  // 계층 구조 빌드 (트리 형태로 변환)
  const buildHierarchy = (partnerList: Partner[]): Partner[] => {
    const partnerMap = new Map<string, Partner & { children?: Partner[] }>();
    const rootPartners: Partner[] = [];

    // 모든 파트너를 맵에 저장
    partnerList.forEach(partner => {
      partnerMap.set(partner.id, { ...partner, children: [] });
    });

    // 부모-자식 관계 설정
    partnerList.forEach(partner => {
      const partnerWithChildren = partnerMap.get(partner.id);
      if (partnerWithChildren) {
        if (partner.parent_id && partnerMap.has(partner.parent_id)) {
          const parent = partnerMap.get(partner.parent_id);
          if (parent && parent.children) {
            parent.children.push(partnerWithChildren);
          }
        } else {
          rootPartners.push(partnerWithChildren);
        }
      }
    });

    return rootPartners;
  };

  // 파트너 토글
  const togglePartner = (partnerId: string) => {
    setExpandedPartners(prev => {
      const newSet = new Set(prev);
      if (newSet.has(partnerId)) {
        newSet.delete(partnerId);
      } else {
        newSet.add(partnerId);
      }
      return newSet;
    });
  };

  // 모든 파트너 펼치기/접기
  const toggleAllPartners = () => {
    if (allExpanded) {
      // 모두 접기
      setExpandedPartners(new Set());
      setAllExpanded(false);
    } else {
      // 모두 펼치기 - 자식이 있는 모든 파트너 ID 추가
      const allPartnerIds = new Set<string>();
      const addPartnerIds = (partnerList: Partner[]) => {
        partnerList.forEach(partner => {
          if ((partner as any).children && (partner as any).children.length > 0) {
            allPartnerIds.add(partner.id);
            addPartnerIds((partner as any).children);
          }
        });
      };
      addPartnerIds(hierarchyData);
      setExpandedPartners(allPartnerIds);
      setAllExpanded(true);
    }
  };

  // 필터링된 파트너 목록
  const filteredPartners = partners.filter(partner => {
    const matchesSearch = partner.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         partner.nickname.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || partner.partner_type === typeFilter;
    const matchesStatus = statusFilter === 'all' || partner.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  // 계층 구조 데이터
  const hierarchyData = buildHierarchy(filteredPartners);

  // 트리 노드 렌더링 함수
  const renderTreeNode = (partner: any, depth: number): JSX.Element => {
    const isExpanded = expandedPartners.has(partner.id);
    const hasChildren = partner.children && partner.children.length > 0;
    const indentWidth = depth * 24; // 24px씩 들여쓰기

    return (
      <div key={partner.id}>
        {/* 파트너 행 */}
        <div 
          className="flex items-center gap-1.5 p-2.5 rounded-lg hover:bg-slate-800/50 transition-colors border border-slate-700/30 bg-slate-800/20 min-w-[1200px]"
        >
          {/* 토글 버튼 + 아이디 (동적 너비, 들여쓰기 적용) */}
          <div className="flex items-center gap-2 min-w-[130px] flex-shrink-0" style={{ paddingLeft: `${indentWidth}px` }}>
            <button
              onClick={() => hasChildren && togglePartner(partner.id)}
              className={`flex items-center justify-center w-5 h-5 rounded transition-colors flex-shrink-0 ${
                hasChildren 
                  ? 'hover:bg-slate-700 text-slate-300 cursor-pointer' 
                  : 'invisible'
              }`}
            >
              {hasChildren && (
                isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )
              )}
            </button>

            {/* 아이디 */}
            <span className="font-medium text-white text-sm truncate">{partner.username}</span>
          </div>

          {/* 나머지 컬럼들 (고정 너비로 헤더와 정렬) */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* 닉네임 */}
            <div className="min-w-[90px] flex-shrink-0">
              <span className="text-slate-300 text-sm truncate">{partner.nickname}</span>
            </div>

            {/* 파트너 등급 */}
            <div className="min-w-[85px] flex-shrink-0">
              <Badge className={`${partnerTypeColors[partner.partner_type]} text-white text-xs`}>
                {partnerTypeTexts[partner.partner_type]}
              </Badge>
            </div>

            {/* 상태 */}
            <div className="min-w-[60px] flex-shrink-0">
              <Badge className={`${statusColors[partner.status]} text-white text-xs`}>
                {statusTexts[partner.status]}
              </Badge>
            </div>

            {/* 보유금 */}
            <div className="min-w-[110px] text-right flex-shrink-0">
              <span className="font-mono text-green-400 text-sm">
                {/* ✅ Lv1, Lv2: invest + oroplay 합산, Lv3~7: balance */}
                {partner.level === 1 || partner.level === 2
                  ? ((partner.invest_balance || 0) + (partner.oroplay_balance || 0)).toLocaleString()
                  : partner.balance.toLocaleString()}원
              </span>
              {/* Lv1, Lv2 API별 잔고 툴팁 표시 */}
              {(partner.level === 1 || partner.level === 2) && (
                <div className="text-[10px] text-slate-400 mt-0.5">
                  (I:{(partner.invest_balance || 0).toLocaleString()} + O:{(partner.oroplay_balance || 0).toLocaleString()})
                </div>
              )}
            </div>

            {/* 커미션 정보 */}
            <div className="min-w-[170px] flex-shrink-0">
              <div className="flex items-center gap-1 text-xs">
                <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs px-1">
                  R:{partner.commission_rolling}%
                </Badge>
                <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs px-1">
                  L:{partner.commission_losing}%
                </Badge>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs px-1">
                  F:{partner.withdrawal_fee}%
                </Badge>
              </div>
            </div>

            {/* 하위/회원 수 */}
            <div className="flex items-center gap-1.5 min-w-[110px] flex-shrink-0">
              <div className="flex items-center gap-1">
                <Building2 className="h-3 w-3 text-slate-400" />
                <span className="text-xs text-slate-400">{partner.child_count || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 text-slate-400" />
                <span className="text-xs text-slate-400">{partner.user_count || 0}</span>
              </div>
            </div>

            {/* 최근 접속 */}
            <div className="min-w-[120px] flex-shrink-0">
              {partner.last_login_at ? (() => {
                const date = new Date(partner.last_login_at);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hour = String(date.getHours()).padStart(2, '0');
                const minute = String(date.getMinutes()).padStart(2, '0');
                return <span className="text-xs text-slate-400">{`${year}/${month}/${day} ${hour}:${minute}`}</span>;
              })() : (
                <span className="text-xs text-slate-600">-</span>
              )}
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-1.5 w-[240px] flex-shrink-0">
            {/* 보유금 지급/회수 버튼 - 시스템관리자->대본사는 ForceTransactionModal, 나머지는 PartnerTransferDialog */}
            {/* Lv1 -> Lv2 대본사: 강제 입출금 (API 호출) */}
            {authState.user?.level === 1 && partner.partner_type === 'head_office' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setForceTransactionTarget(partner);
                    setForceTransactionType('deposit');
                    setShowForceTransactionModal(true);
                  }}
                  className="bg-green-500/10 border-green-500/50 text-green-400 hover:bg-green-500/20 flex-shrink-0"
                  title="입금 (API 호출)"
                >
                  <DollarSign className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setForceTransactionTarget(partner);
                    setForceTransactionType('withdrawal');
                    setShowForceTransactionModal(true);
                  }}
                  className="bg-orange-500/10 border-orange-500/50 text-orange-400 hover:bg-orange-500/20 flex-shrink-0"
                  title="출금 (API 호출)"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </>
            )}
            {/* Lv2~Lv7 -> 직접 하위 파트너: 보유금 입출금 (GMS 머니) */}
            {partner.parent_id === authState.user?.id && partner.partner_type !== 'head_office' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTransferTargetPartner(partner);
                    setTransferMode('deposit');
                    setShowTransferDialog(true);
                  }}
                  className="bg-green-500/10 border-green-500/50 text-green-400 hover:bg-green-500/20 flex-shrink-0"
                  title="보유금 지급 (GMS 머니)"
                >
                  <DollarSign className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTransferTargetPartner(partner);
                    setTransferMode('withdrawal');
                    setShowTransferDialog(true);
                  }}
                  className="bg-orange-500/10 border-orange-500/50 text-orange-400 hover:bg-orange-500/20 flex-shrink-0"
                  title="보유금 회수 (GMS 머니)"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedPartner(partner);
                setEditFormData(partner);
                setShowEditDialog(true);
              }}
              className="bg-blue-500/10 border-blue-500/50 text-blue-400 hover:bg-blue-500/20 flex-shrink-0"
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.info(`${partner.nickname} 파트너의 상세 정보를 확인합니다.`);
              }}
              className="bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 flex-shrink-0"
            >
              <Eye className="h-3 w-3" />
            </Button>
            {partner.partner_type !== 'system_admin' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPartnerToDelete(partner);
                  setDeleteConfirmText("");
                  setShowDeleteDialog(true);
                }}
                className="bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 flex-shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* 하위 파트너들 (재귀 렌더링) */}
        {isExpanded && hasChildren && (
          <div className="mt-1 space-y-1">
            {partner.children.map((child: any) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // 테이블 컬럼 정의
  const columns: Column<Partner>[] = [
    {
      key: "username",
      title: t.partnerManagement.partnerUsername,
      sortable: true,
    },
    {
      key: "nickname", 
      title: t.partnerManagement.partnerNickname,
      sortable: true,
    },
    {
      key: "partner_type",
      title: t.partnerManagement.partnerGrade,
      render: (value: Partner['partner_type']) => (
        <Badge className={`${partnerTypeColors[value]} text-white`}>
          {partnerTypeTexts[value]}
        </Badge>
      ),
    },
    {
      key: "parent_nickname",
      title: t.partnerManagement.parentPartner,
    },
    {
      key: "status",
      title: t.partnerManagement.status,
      render: (value: Partner['status']) => (
        <Badge className={`${statusColors[value]} text-white`}>
          {statusTexts[value]}
        </Badge>
      ),
    },
    {
      key: "balance",
      title: t.partnerManagement.balance,
      sortable: true,
      render: (value: number, row: Partner) => {
        // ✅ Lv1: api_configs의 invest_balance + oroplay_balance 합산
        // ✅ Lv2: partners.invest_balance + partners.oroplay_balance 합산
        // ✅ Lv3~6: partners.balance (GMS 머니)
        const displayBalance = row.level === 1
          ? (row.invest_balance || 0) + (row.oroplay_balance || 0)
          : row.level === 2
            ? (row.invest_balance || 0) + (row.oroplay_balance || 0)
            : value;
        
        if (row.level === 2) {
          console.log('🎯 [테이블 렌더링] Lv2 보유금:', {
            partner_id: row.id,
            nickname: row.nickname,
            invest_balance: row.invest_balance,
            oroplay_balance: row.oroplay_balance,
            displayBalance: displayBalance,
            value: value
          });
        }
        
        return (
          <div className="flex flex-col">
            <span className="font-mono">
              {displayBalance.toLocaleString()}원
            </span>
            {/* Lv1, Lv2는 API별 잔고 상세 표시 */}
            {(row.level === 1 || row.level === 2) && (
              <span className="text-[10px] text-slate-400 mt-0.5">
                (I:{(row.invest_balance || 0).toLocaleString()} + O:{(row.oroplay_balance || 0).toLocaleString()})
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "commission_rolling",
      title: "커미션(%)",
      render: (_, row: Partner) => (
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">
            R:{row.commission_rolling}
          </Badge>
          <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs">
            L:{row.commission_losing}
          </Badge>
        </div>
      ),
    },
    {
      key: "opcode",
      title: "OPCODE",
      render: (value: string, row: Partner) => (
        row.partner_type === 'head_office' && value ? (
          <Badge variant="outline" className="font-mono">
            {value}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      ),
    },
    {
      key: "last_login_at",
      title: "최근 접속",
      render: (value: string) => {
        if (!value) return <span className="text-muted-foreground">-</span>;
        const date = new Date(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return <span className="text-slate-500">{`${year}/${month}/${day} ${hour}:${minute}`}</span>;
      },
    },
    {
      key: "child_count",
      title: "하위 파트너",
      render: (value: number) => (
        <div className="flex items-center gap-1">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span>{value}</span>
        </div>
      ),
    },
    {
      key: "user_count",
      title: "관리 회원",
      render: (value: number) => (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{value}</span>
        </div>
      ),
    },
    {
      key: "created_at",
      title: "생성일",
      render: (value: string) => {
        const date = new Date(value);
        return date.toLocaleDateString('ko-KR');
      },
    },
    {
      key: "actions",
      title: "관리",
      render: (_, partner: Partner) => (
        <div className="flex items-center gap-2">
          {showHierarchyView && (partner.child_count ?? 0) > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => togglePartner(partner.id)}
              title={expandedPartners.has(partner.id) ? "접기" : "펼치기"}
            >
              {expandedPartners.has(partner.id) ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
          {/* 보유금 지급/회수 버튼 - 하위 파트너에게만 표시 */}
          {partner.parent_id === authState.user?.id && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTransferTargetPartner(partner);
                  setTransferAmount("");
                  setTransferMemo("");
                  setTransferMode('deposit');
                  setShowTransferDialog(true);
                }}
                className="text-green-600 hover:bg-green-50"
                title="보유금 지급"
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTransferTargetPartner(partner);
                  setTransferAmount("");
                  setTransferMemo("");
                  setTransferMode('withdrawal');
                  setShowTransferDialog(true);
                }}
                className="text-orange-600 hover:bg-orange-50"
                title="보유금 회수"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedPartner(partner);
              setEditFormData(partner);
              setShowEditDialog(true);
            }}
            title="수정"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast.info(`${partner.nickname} 파트너의 상세 정보를 확인합니다.`);
            }}
            title="상세 보기"
          >
            <Eye className="h-4 w-4" />
          </Button>
          {partner.partner_type !== 'system_admin' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPartnerToDelete(partner);
                setDeleteConfirmText("");
                setShowDeleteDialog(true);
              }}
              className="text-red-600 hover:bg-red-50"
              title="삭제"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  useEffect(() => {
    loadSystemDefaultCommission();
    loadParentCommission();
    fetchPartners();
    fetchDashboardData();
  }, []);

  // 탭 변경시 데이터 새로고침
  useEffect(() => {
    if (currentTab === "dashboard") {
      fetchDashboardData();
    }
  }, [currentTab]);

  if (loading && partners.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">{t.partnerManagement.title}</h1>
          <p className="text-sm text-slate-400">
            {authState.user?.nickname}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={toggleAllPartners}
            variant="outline"
            className="border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:border-blue-400/50"
          >
            {allExpanded ? (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                {t.partnerManagement.collapseView}
              </>
            ) : (
              <>
                <ChevronRight className="h-4 w-4 mr-2" />
                {t.partnerManagement.expandView}
              </>
            )}
          </Button>
          <Button 
            onClick={() => setShowHierarchyView(!showHierarchyView)}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-700/50"
          >
            <Building2 className="h-4 w-4 mr-2" />
            {showHierarchyView ? t.partnerManagement.listViewToggle : t.partnerManagement.hierarchyViewToggle}
          </Button>
          <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-700/50">
            <Download className="h-4 w-4 mr-2" />
            {t.partnerManagement.export}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t.partnerManagement.createPartner}
          </Button>
        </div>
      </div>

      {/* 통계 카드 - 자신 제외, 레벨별 동적 표시 */}
      <div className="grid gap-5 md:grid-cols-4">
        <MetricCard
          title={t.partnerManagement.allSubPartners}
          value={partners.filter(p => p.id !== authState.user?.id).length.toLocaleString()}
          subtitle={t.partnerManagement.managingPartners}
          icon={Building2}
          color="purple"
        />
        
        {/* 대본사(2): 본사 */}
        {authState.user?.level === 2 && (
          <MetricCard
            title={t.partnerManagement.mainOffice}
            value={partners.filter(p => p.id !== authState.user?.id && p.partner_type === 'main_office').length.toLocaleString()}
            subtitle={`${t.partnerManagement.mainOffice} ${t.partnerManagement.partnerLabel}`}
            icon={Shield}
            color="red"
          />
        )}
        
        {/* 본사(3): 부본사 */}
        {authState.user?.level === 3 && (
          <MetricCard
            title={t.partnerManagement.subOffice}
            value={partners.filter(p => p.id !== authState.user?.id && p.partner_type === 'sub_office').length.toLocaleString()}
            subtitle={`${t.partnerManagement.subOffice} ${t.partnerManagement.partnerLabel}`}
            icon={Shield}
            color="red"
          />
        )}
        
        {/* 부본사(4): 총판 */}
        {authState.user?.level === 4 && (
          <MetricCard
            title={t.partnerManagement.distributor}
            value={partners.filter(p => p.id !== authState.user?.id && p.partner_type === 'distributor').length.toLocaleString()}
            subtitle={`${t.partnerManagement.distributor} ${t.partnerManagement.partnerLabel}`}
            icon={Shield}
            color="red"
          />
        )}
        
        {/* 대본사(2): 부본사/총판/매장 */}
        {authState.user?.level === 2 && (
          <MetricCard
            title={t.partnerManagement.subOfficeDistributorStore}
            value={partners.filter(p => p.id !== authState.user?.id && (p.partner_type === 'sub_office' || p.partner_type === 'distributor' || p.partner_type === 'store')).length.toLocaleString()}
            subtitle={t.partnerManagement.subPartnerLabel}
            icon={Building2}
            color="orange"
          />
        )}
        
        {/* 본사(3): 총판/매장 */}
        {authState.user?.level === 3 && (
          <MetricCard
            title={t.partnerManagement.distributorStore}
            value={partners.filter(p => p.id !== authState.user?.id && (p.partner_type === 'distributor' || p.partner_type === 'store')).length.toLocaleString()}
            subtitle={t.partnerManagement.subPartnerLabel}
            icon={Building2}
            color="orange"
          />
        )}
        
        {/* 부본사(4): 매장 */}
        {authState.user?.level === 4 && (
          <MetricCard
            title={t.partnerManagement.storePartner}
            value={partners.filter(p => p.id !== authState.user?.id && p.partner_type === 'store').length.toLocaleString()}
            subtitle={t.partnerManagement.storePartnerLabel}
            icon={Building2}
            color="orange"
          />
        )}
        
        {/* 총판(5): 매장만 */}
        {authState.user?.level === 5 && (
          <>
            <MetricCard
              title={t.partnerManagement.storePartner}
              value={partners.filter(p => p.id !== authState.user?.id && p.partner_type === 'store').length.toLocaleString()}
              subtitle={t.partnerManagement.storePartnerLabel}
              icon={Shield}
              color="red"
            />
            <MetricCard
              title={t.partnerManagement.emptyLabel}
              value="0"
              subtitle={t.partnerManagement.noSubPartnerLabel}
              icon={Building2}
              color="orange"
            />
          </>
        )}
        
        {/* 시스템관리자(1) 또는 매장(6): 모든 타입 */}
        {(authState.user?.level === 1 || authState.user?.level === 6) && (
          <>
            <MetricCard
              title={t.partnerManagement.headOfficePartner}
              value={partners.filter(p => p.id !== authState.user?.id && p.partner_type === 'head_office').length.toLocaleString()}
              subtitle={t.partnerManagement.headOfficePartnerLabel}
              icon={Shield}
              color="red"
            />
            <MetricCard
              title={t.partnerManagement.mainSubOffice}
              value={partners.filter(p => p.id !== authState.user?.id && (p.partner_type === 'main_office' || p.partner_type === 'sub_office')).length.toLocaleString()}
              subtitle={t.partnerManagement.middlePartner}
              icon={Building2}
              color="orange"
            />
          </>
        )}
        
        <MetricCard
          title={t.partnerManagement.activePartners}
          value={partners.filter(p => p.id !== authState.user?.id && p.status === 'active').length.toLocaleString()}
          subtitle={t.partnerManagement.normalOperation}
          icon={Eye}
          color="green"
        />
      </div>

      {/* 탭 메뉴 - 부드럽고 편안한 디자인 */}
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-6">
        <div className="bg-slate-800/30 rounded-xl p-1.5 border border-slate-700/40">
          <TabsList className="bg-transparent h-auto p-0 border-0 gap-2 w-full grid grid-cols-2">
            <TabsTrigger 
              value="hierarchy"
              className="bg-transparent text-slate-400 rounded-lg px-6 py-3 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500/20 data-[state=active]:to-cyan-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20 data-[state=active]:border data-[state=active]:border-blue-400/30 transition-all duration-200"
            >
              {t.partnerManagement.partnerHierarchyManagement}
            </TabsTrigger>
            <TabsTrigger 
              value="dashboard"
              className="bg-transparent text-slate-400 rounded-lg px-6 py-3 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500/20 data-[state=active]:to-pink-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 data-[state=active]:border data-[state=active]:border-purple-400/30 transition-all duration-200"
            >
              {t.partnerManagement.partnerDashboard}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 파트너 계층 관리 탭 */}
        <TabsContent value="hierarchy" className="space-y-4">
          <Card className="bg-slate-900/40 border-slate-700/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">{t.partnerManagement.hierarchyManagementTitle}</CardTitle>
              <CardDescription className="text-slate-400">
                {t.partnerManagement.hierarchyManagementDesc}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder={t.partnerManagement.searchIdOrNickname}
                      className="pl-8 bg-slate-800/50 border-slate-700 text-white"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700 text-white">
                    <SelectValue placeholder={t.partnerManagement.partnerGradeFilter} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.partnerManagement.allGrades}</SelectItem>
                    <SelectItem value="head_office">{t.partnerManagement.headOffice}</SelectItem>
                    <SelectItem value="main_office">{t.partnerManagement.mainOffice}</SelectItem>
                    <SelectItem value="sub_office">{t.partnerManagement.subOffice}</SelectItem>
                    <SelectItem value="distributor">{t.partnerManagement.distributor}</SelectItem>
                    <SelectItem value="store">{t.partnerManagement.store}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700 text-white">
                    <SelectValue placeholder={t.partnerManagement.statusFilter} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.partnerManagement.allStatus}</SelectItem>
                    <SelectItem value="active">{t.partnerManagement.active}</SelectItem>
                    <SelectItem value="inactive">{t.partnerManagement.inactive}</SelectItem>
                    <SelectItem value="blocked">{t.partnerManagement.blocked}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 컬럼 헤더 */}
              <div className="mb-3 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                <div className="flex items-center gap-1.5">
                  {/* 토글 + 아이디 영역 */}
                  <div className="min-w-[130px] flex-shrink-0">
                    <div className="text-xs font-medium text-slate-400">{t.partnerManagement.id}</div>
                  </div>
                  {/* 나머지 컬럼들 */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="min-w-[90px] text-xs font-medium text-slate-400">{t.partnerManagement.nickname}</div>
                    <div className="min-w-[85px] text-xs font-medium text-slate-400">{t.partnerManagement.gradeLabel}</div>
                    <div className="min-w-[60px] text-xs font-medium text-slate-400">{t.partnerManagement.statusLabel}</div>
                    <div className="min-w-[110px] text-xs font-medium text-slate-400 text-right">{t.partnerManagement.balanceLabel}</div>
                    <div className="min-w-[170px] text-xs font-medium text-slate-400">{t.partnerManagement.commissionLabel}</div>
                    <div className="min-w-[110px] text-xs font-medium text-slate-400">{t.partnerManagement.subMembers}</div>
                    <div className="min-w-[120px] text-xs font-medium text-slate-400">{t.partnerManagement.recentAccess}</div>
                  </div>
                  <div className="w-[240px] text-xs font-medium text-slate-400 text-center flex-shrink-0">{t.partnerManagement.management}</div>
                </div>
              </div>

              {/* 트리 구조 렌더링 */}
              {loading ? (
                <LoadingSpinner />
              ) : hierarchyData.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  {t.partnerManagement.noPartners}
                </div>
              ) : (
                <div className="space-y-1 overflow-x-auto">
                  {hierarchyData.map((partner: any) => renderTreeNode(partner, 0))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 파트너 입출금 관리 탭 */}
        <TabsContent value="transactions" className="space-y-4">
          <PartnerTransactions />
        </TabsContent>

        {/* 파트너 대시보드 탭 */}
        <TabsContent value="dashboard" className="space-y-4">
          <Card className="bg-slate-900/40 border-slate-700/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <TrendingUp className="h-5 w-5" />
                파트너 대시보드
              </CardTitle>
              <CardDescription className="text-slate-400">
                파트너별 성과 및 수익 현황을 확인합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">이번달 순수익</CardTitle>
                    <DollarSign className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {(dashboardData.monthlyCommission || 0).toLocaleString()}원
                    </div>
                    <p className="text-xs text-muted-foreground">
                      내 수입 - 하위 파트너 지급
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">총 파트너 수</CardTitle>
                    <Building2 className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {partners.length.toLocaleString()}개
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +2 new this month
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">활성 회원 수</CardTitle>
                    <Users className="h-4 w-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">
                      {partners.reduce((sum, p) => sum + (p.user_count || 0), 0).toLocaleString()}명
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +5% from last month
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">상위 성과 파트너</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {partners
                        .filter(p => p.partner_type !== 'system_admin')
                        .sort((a, b) => (b.user_count || 0) - (a.user_count || 0))
                        .slice(0, 5)
                        .map((partner, index) => (
                          <div key={partner.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Badge className={`${partnerTypeColors[partner.partner_type]} text-white`}>
                                #{index + 1}
                              </Badge>
                              <div>
                                <p className="font-medium">{partner.nickname}</p>
                                <p className="text-sm text-muted-foreground">
                                  {partnerTypeTexts[partner.partner_type]}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{(partner.user_count || 0)}명</p>
                              <p className="text-sm text-muted-foreground">관리 회원</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">파트너 레벨별 분포</CardTitle>
                    <CardDescription className="text-xs">
                      각 레벨 파트너들이 보유한 사용자들의 총 보유금
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {levelDistribution.length > 0 ? (
                        <>
                          {levelDistribution.map((item) => {
                            const maxBalance = Math.max(...levelDistribution.map(d => d.usersBalance), 1);
                            const percentage = Math.round((item.usersBalance / maxBalance) * 100);
                            
                            return (
                              <div key={item.type} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge className={`${partnerTypeColors[item.type as keyof typeof partnerTypeColors]} text-white text-xs`}>
                                      LV.{item.level}
                                    </Badge>
                                    <span className="text-sm font-medium">{item.typeName}</span>
                                    <span className="text-xs text-muted-foreground">({item.partnerCount}개)</span>
                                  </div>
                                  <span className="text-sm font-medium text-blue-600">
                                    ₩{item.usersBalance.toLocaleString()}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-800/40 rounded-full h-3 overflow-hidden">
                                  <div 
                                    className={`h-3 rounded-full transition-all duration-500 ${partnerTypeColors[item.type as keyof typeof partnerTypeColors]}`}
                                    style={{ width: `${Math.max(percentage, 2)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          <div className="pt-3 border-t border-slate-700/50">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-300">총 사용자 보유금</span>
                              <span className="text-sm font-bold text-emerald-400">
                                ₩{levelDistribution.reduce((sum, item) => sum + item.usersBalance, 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          하위 파트너가 없습니다
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 파트너 생성 다이얼로그 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.partnerManagement.newPartner}</DialogTitle>
            <DialogDescription>
              {t.partnerManagement.createPartnerDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t.partnerManagement.partnerUsername}</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  placeholder={t.partnerManagement.partnerUsernameInput}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">{t.partnerManagement.partnerNickname}</Label>
                <Input
                  id="nickname"
                  value={formData.nickname}
                  onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                  placeholder={t.partnerManagement.partnerNicknameInput}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t.common.password}</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={t.partnerManagement.initialPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner_type">{t.partnerManagement.partnerGrade}</Label>
                <Select 
                  value={formData.partner_type} 
                  onValueChange={async (value: Partner['partner_type']) => {
                    setFormData(prev => ({ ...prev, partner_type: value }));
                    
                    // 계층 검증 및 상위 파트너 커미션 로드
                    if (authState.user?.level !== 1) {
                      const result = await checkHierarchyGap(value);
                      setHierarchyWarning(result.message);
                      
                      // 직접 상위 파트너의 커미션 로드
                      if (result.directParentId && !result.hasGap) {
                        const commission = await loadPartnerCommissionById(result.directParentId);
                        if (commission) {
                          setParentCommission(commission);
                          console.log(`✅ ${partnerTypeTexts[value]} 상위 파트너 커미션 로드:`, commission);
                        }
                      }
                    } else {
                      // 시스템관리자: 대본사는 100% 고정
                      if (value === 'head_office') {
                        setParentCommission({
                          rolling: 100,
                          losing: 100,
                          fee: 100,
                          nickname: t.partnerManagement.system
                        });
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {authState.user?.level === 1 && (
                      <SelectItem value="head_office">{t.partnerManagement.headOffice}</SelectItem>
                    )}
                    {authState.user?.level === 2 && (
                      <SelectItem value="main_office">{t.partnerManagement.mainOffice}</SelectItem>
                    )}
                    {authState.user?.level === 3 && (
                      <SelectItem value="sub_office">{t.partnerManagement.subOffice}</SelectItem>
                    )}
                    {authState.user?.level === 4 && (
                      <SelectItem value="distributor">{t.partnerManagement.distributor}</SelectItem>
                    )}
                    {authState.user?.level === 5 && (
                      <SelectItem value="store">{t.partnerManagement.store}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                
                {/* 계층 구조 경고 메시지 */}
                {hierarchyWarning && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-700 dark:text-red-300">
                      {hierarchyWarning}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 대본사인 경우 OPCODE 관련 필드 */}
            {formData.partner_type === 'head_office' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="opcode" className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    OPCODE
                  </Label>
                  <Input
                    id="opcode"
                    value={formData.opcode}
                    onChange={(e) => setFormData(prev => ({ ...prev, opcode: e.target.value }))}
                    placeholder={t.partnerManagement.opcodeInput}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="secret_key">{t.partnerManagement.secretKey}</Label>
                    <Input
                      id="secret_key"
                      value={formData.secret_key}
                      onChange={(e) => setFormData(prev => ({ ...prev, secret_key: e.target.value }))}
                      placeholder={t.partnerManagement.secretKeyInput}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api_token">{t.partnerManagement.token}</Label>
                    <Input
                      id="api_token"
                      value={formData.api_token}
                      onChange={(e) => setFormData(prev => ({ ...prev, api_token: e.target.value }))}
                      placeholder={t.partnerManagement.apiTokenInput}
                    />
                  </div>
                </div>
              </>
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
                    {t.partnerManagement.upperLimit} {parentCommission.rolling}% / {parentCommission.losing}%
                  </Badge>
                )}
              </div>
              
              {formData.partner_type === 'head_office' ? (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
                  <p className="text-xs text-purple-700 dark:text-purple-300" dangerouslySetInnerHTML={{ __html: t.partnerManagement.headOfficeNote }} />
                </div>
              ) : (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {t.partnerManagement.commissionCreateNote}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commission_rolling">{t.partnerManagement.rollingCommissionLabel}</Label>
                  <Input
                    id="commission_rolling"
                    type="text"
                    step="0.1"
                    min="0"
                    max={formData.partner_type === 'head_office' ? 100 : parentCommission?.rolling || 100}
                    value={formData.partner_type === 'head_office' ? 100 : formData.commission_rolling}
                    onChange={(e) => {
                      if (formData.partner_type === 'head_office') return;
                      const value = e.target.value;
                      if (value === '') {
                        setFormData(prev => ({ ...prev, commission_rolling: 0 }));
                        return;
                      }
                      const numValue = parseFloat(value);
                      if (isNaN(numValue)) return;
                      const maxValue = parentCommission?.rolling || 100;
                      if (numValue > maxValue) {
                        toast.error(t.partnerManagement.rollingExceedError.replace('{{max}}', maxValue.toString()));
                        return;
                      }
                      setFormData(prev => ({ ...prev, commission_rolling: numValue }));
                    }}
                    disabled={formData.partner_type === 'head_office'}
                    className={formData.partner_type === 'head_office' ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.partner_type === 'head_office' ? t.partnerManagement.headOfficeFixed : t.partnerManagement.totalBettingAmount}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commission_losing">{t.partnerManagement.losingCommissionLabel}</Label>
                  <Input
                    id="commission_losing"
                    type="text"
                    step="0.1"
                    min="0"
                    max={formData.partner_type === 'head_office' ? 100 : parentCommission?.losing || 100}
                    value={formData.partner_type === 'head_office' ? 100 : formData.commission_losing}
                    onChange={(e) => {
                      if (formData.partner_type === 'head_office') return;
                      const value = e.target.value;
                      if (value === '') {
                        setFormData(prev => ({ ...prev, commission_losing: 0 }));
                        return;
                      }
                      const numValue = parseFloat(value);
                      if (isNaN(numValue)) return;
                      const maxValue = parentCommission?.losing || 100;
                      if (numValue > maxValue) {
                        toast.error(t.partnerManagement.losingExceedError.replace('{{max}}', maxValue.toString()));
                        return;
                      }
                      setFormData(prev => ({ ...prev, commission_losing: numValue }));
                    }}
                    disabled={formData.partner_type === 'head_office'}
                    className={formData.partner_type === 'head_office' ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.partner_type === 'head_office' ? t.partnerManagement.headOfficeFixed : t.partnerManagement.memberNetLoss}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="withdrawal_fee">{t.partnerManagement.withdrawalFeeLabel}</Label>
                  <Input
                    id="withdrawal_fee"
                    type="text"
                    step="0.1"
                    min="0"
                    max={formData.partner_type === 'head_office' ? 100 : parentCommission?.fee || 100}
                    value={formData.partner_type === 'head_office' ? 100 : formData.withdrawal_fee}
                    onChange={(e) => {
                      if (formData.partner_type === 'head_office') return;
                      const value = e.target.value;
                      if (value === '') {
                        setFormData(prev => ({ ...prev, withdrawal_fee: 0 }));
                        return;
                      }
                      const numValue = parseFloat(value);
                      if (isNaN(numValue)) return;
                      const maxValue = parentCommission?.fee || 100;
                      if (numValue > maxValue) {
                        toast.error(t.partnerManagement.feeExceedError.replace('{{max}}', maxValue.toString()));
                        return;
                      }
                      setFormData(prev => ({ ...prev, withdrawal_fee: numValue }));
                    }}
                    disabled={formData.partner_type === 'head_office'}
                    className={formData.partner_type === 'head_office' ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.partner_type === 'head_office' ? t.partnerManagement.headOfficeFixed : t.partnerManagement.withdrawalFeeDesc}
                  </p>
                </div>
              </div>
            </div>


          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateDialog(false);
                resetFormData();
                setHierarchyWarning("");
              }}
            >
              {t.common.cancel}
            </Button>
            <Button 
              onClick={createPartner} 
              disabled={loading || (!!hierarchyWarning && authState.user?.level !== 1)}
            >
              {loading ? t.partnerManagement.creating : t.partnerManagement.createPartnerButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파트너 수정 다이얼로그 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>파트너 정보 수정</DialogTitle>
            <DialogDescription>
              파트너의 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_username">아이디</Label>
                <Input
                  id="edit_username"
                  value={formData.username}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_nickname">닉네임</Label>
                <Input
                  id="edit_nickname"
                  value={formData.nickname}
                  onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_password">{t.partnerManagement.passwordChangeOnly}</Label>
              <Input
                id="edit_password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder={t.partnerManagement.passwordChangeHint}
              />
              <p className="text-xs text-muted-foreground">
                {t.partnerManagement.passwordChangeNote}
              </p>
            </div>

            {/* 대본사인 경우 OPCODE 관련 필드 */}
            {selectedPartner?.partner_type === 'head_office' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit_opcode" className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    OPCODE
                  </Label>
                  <Input
                    id="edit_opcode"
                    value={formData.opcode}
                    onChange={(e) => setFormData(prev => ({ ...prev, opcode: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_secret_key">Secret Key</Label>
                    <Input
                      id="edit_secret_key"
                      value={formData.secret_key}
                      onChange={(e) => setFormData(prev => ({ ...prev, secret_key: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_api_token">API Token</Label>
                    <Input
                      id="edit_api_token"
                      value={formData.api_token}
                      onChange={(e) => setFormData(prev => ({ ...prev, api_token: e.target.value }))}
                    />
                  </div>
                </div>
              </>
            )}

            {/* 커미션 설정 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  커미션 설정
                </Label>
                {selectedPartner?.partner_type !== 'head_office' && parentCommission && (
                  <Badge variant="outline" className="text-xs">
                    상위 한도: {parentCommission.rolling}% / {parentCommission.losing}% / {parentCommission.fee}%
                  </Badge>
                )}
              </div>
              
              {selectedPartner?.partner_type === 'head_office' ? (
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
                  <Label htmlFor="edit_commission_rolling">롤링 커미션 (%)</Label>
                  <Input
                    id="edit_commission_rolling"
                    type="number"
                    step="0.1"
                    min="0"
                    max={selectedPartner?.partner_type === 'head_office' ? 100 : parentCommission?.rolling || 100}
                    value={formData.commission_rolling}
                    onChange={(e) => setFormData(prev => ({ ...prev, commission_rolling: parseFloat(e.target.value) || 0 }))}
                    disabled={selectedPartner?.partner_type === 'head_office'}
                    className={selectedPartner?.partner_type === 'head_office' ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {selectedPartner?.partner_type === 'head_office' ? '대본사 고정값' : '회원 총 베팅액 × 커미션 요율'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_commission_losing">루징 커미션 (%)</Label>
                  <Input
                    id="edit_commission_losing"
                    type="number"
                    step="0.1"
                    min="0"
                    max={selectedPartner?.partner_type === 'head_office' ? 100 : parentCommission?.losing || 100}
                    value={formData.commission_losing}
                    onChange={(e) => setFormData(prev => ({ ...prev, commission_losing: parseFloat(e.target.value) || 0 }))}
                    disabled={selectedPartner?.partner_type === 'head_office'}
                    className={selectedPartner?.partner_type === 'head_office' ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {selectedPartner?.partner_type === 'head_office' ? '대본사 고정값' : '회원 순손실액 × 커미션 요율'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_withdrawal_fee">환전 수수료 (%)</Label>
                  <Input
                    id="edit_withdrawal_fee"
                    type="number"
                    step="0.1"
                    min="0"
                    max={selectedPartner?.partner_type === 'head_office' ? 100 : parentCommission?.fee || 100}
                    value={formData.withdrawal_fee}
                    onChange={(e) => setFormData(prev => ({ ...prev, withdrawal_fee: parseFloat(e.target.value) || 0 }))}
                    disabled={selectedPartner?.partner_type === 'head_office'}
                    className={selectedPartner?.partner_type === 'head_office' ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {selectedPartner?.partner_type === 'head_office' ? '대본사 고정값' : '환전 금액에 적용되는 수수료'}
                  </p>
                </div>
              </div>
            </div>


          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEditDialog(false);
                setSelectedPartner(null);
              }}
            >
              취소
            </Button>
            <Button onClick={updatePartner} disabled={loading}>
              {loading ? "수정 중..." : "수정 완료"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파트너 삭제 확인 다이얼로그 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">⚠️ 파트너 삭제 확인</DialogTitle>
            <DialogDescription>
              이 작업은 되돌릴 수 없습니다. 삭제하려면 아래에 파트너 아이디를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          {partnerToDelete && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">파트너</span>
                    <span className="font-medium">{partnerToDelete.nickname} ({partnerToDelete.username})</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">등급</span>
                    <Badge className={`${partnerTypeColors[partnerToDelete.partner_type]} text-white`}>
                      {partnerTypeTexts[partnerToDelete.partner_type]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">하위 파트너</span>
                    <span className="font-medium">{partnerToDelete.child_count || 0}명</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">관리 회원</span>
                    <span className="font-medium">{partnerToDelete.user_count || 0}명</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="delete-confirm" className="text-red-600">
                  삭제 확인: <span className="font-mono">{partnerToDelete.username}</span> 입력
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="파트너 아이디를 정확히 입력하세요"
                  className="border-red-300 focus:border-red-500"
                />
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>주의:</strong> 하위 파트너나 관리 회원이 있으면 삭제할 수 없습니다.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDialog(false);
                setPartnerToDelete(null);
                setDeleteConfirmText("");
              }}
              disabled={deleteLoading}
            >
              취소
            </Button>
            <Button 
              variant="destructive"
              onClick={deletePartner}
              disabled={deleteLoading || deleteConfirmText !== partnerToDelete?.username}
            >
              {deleteLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  삭제 중...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  삭제
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 강제 입출금 모달 */}
      <ForceTransactionModal
        open={showForceTransactionModal}
        onOpenChange={setShowForceTransactionModal}
        type={forceTransactionType}
        targetType="partner"
        selectedTarget={forceTransactionTarget ? {
          id: forceTransactionTarget.id,
          username: forceTransactionTarget.username,
          nickname: forceTransactionTarget.nickname,
          balance: forceTransactionTarget.level === 2
            ? ((forceTransactionTarget.invest_balance || 0) + (forceTransactionTarget.oroplay_balance || 0))
            : (forceTransactionTarget.balance || 0),
          level: forceTransactionTarget.level,
          invest_balance: forceTransactionTarget.invest_balance || 0,
          oroplay_balance: forceTransactionTarget.oroplay_balance || 0
        } : null}
        onSubmit={handleForceTransaction}
        onTypeChange={setForceTransactionType}
        currentUserLevel={authState.user?.level}
        currentUserBalance={currentUserBalance}
        currentUserInvestBalance={currentUserInvestBalance}
        currentUserOroplayBalance={currentUserOroplayBalance}
      />

      {/* 보유금 입출금 다이얼로그 (GMS 머니 시스템) */}
      <PartnerTransferDialog
        open={showTransferDialog}
        onOpenChange={setShowTransferDialog}
        targetPartner={transferTargetPartner}
        transferMode={transferMode}
        setTransferMode={setTransferMode}
        transferAmount={transferAmount}
        setTransferAmount={setTransferAmount}
        transferMemo={transferMemo}
        setTransferMemo={setTransferMemo}
        transferLoading={transferLoading}
        currentUserId={authState.user?.id || ''}
        onSuccess={() => {
          setTransferTargetPartner(null);
          setTransferAmount("");
          setTransferMemo("");
          setTransferMode('deposit');
          fetchPartners(); // 목록 새로고침
        }}
        onWebSocketUpdate={(data) => {
          if (sendMessage && connected) {
            sendMessage(data);
          }
        }}
      />
    </div>
  );
}

export default PartnerManagement;