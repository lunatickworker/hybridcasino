import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useWebSocketContext } from "../../../contexts/WebSocketContext";
import { supabase } from "../../../lib/supabase";
import { Partner, TransferMode, ForceTransactionType } from "./types";
import * as partnerService from "./partnerService";
import { toast } from "sonner@2.0.3";

export const usePartnerManagement = () => {
  const { authState } = useAuth();
  const { connected, sendMessage } = useWebSocketContext();

  // State
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
  const [levelDistribution, setLevelDistribution] = useState<any[]>([]);
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [hierarchyWarning, setHierarchyWarning] = useState<string>("");
  const [systemDefaultCommission, setSystemDefaultCommission] = useState({
    rolling: 0.5,
    losing: 5.0,
    fee: 1.0
  });
  const [showForceTransactionModal, setShowForceTransactionModal] = useState(false);
  const [forceTransactionType, setForceTransactionType] = useState<ForceTransactionType>('deposit');
  const [forceTransactionTarget, setForceTransactionTarget] = useState<Partner | null>(null);
  const [adminApiBalances, setAdminApiBalances] = useState<{ invest: number; oroplay: number }>({ invest: 0, oroplay: 0 });
  const [currentUserBalance, setCurrentUserBalance] = useState(0);
  const [currentUserInvestBalance, setCurrentUserInvestBalance] = useState(0);
  const [currentUserOroplayBalance, setCurrentUserOroplayBalance] = useState(0);
  const [currentUserFamilyapiBalance, setCurrentUserFamilyapiBalance] = useState(0);
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
  const [transferMode, setTransferMode] = useState<TransferMode>('deposit');
  const [transferLoading, setTransferLoading] = useState(false);

  // 파트너 목록 조회
  const fetchPartnersData = useCallback(async () => {
    if (!authState.user?.id) return;
    
    try {
      setLoading(true);
      const data = await partnerService.fetchPartners(authState.user.id, authState.user.level || 1);
      setPartners(data);
    } catch (error) {
      console.error('[Partner List Fetch Error]:', error);
      toast.error('파트너 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [authState.user?.id, authState.user?.level]);

  // 상위 파트너 커미션 조회
  const loadParentCommissionData = useCallback(async () => {
    if (!authState.user?.id) return;
    const commission = await partnerService.loadPartnerCommissionById(authState.user.id);
    if (commission) {
      setParentCommission(commission);
    }
  }, [authState.user?.id]);

  // 시스템 기본 커미션 로드
  const loadSystemDefaultCommissionData = useCallback(async () => {
    const defaults = await partnerService.loadSystemDefaultCommission();
    if (defaults) {
      setSystemDefaultCommission(defaults);
      setFormData(prev => ({
        ...prev,
        commission_rolling: defaults.rolling,
        commission_losing: defaults.losing,
        withdrawal_fee: defaults.fee
      }));
    }
  }, []);

  // Lv1 관리자의 API 보유금 조회
  const fetchAdminApiBalancesData = useCallback(async () => {
    if (!authState.user?.id || authState.user?.level !== 1) {
      setAdminApiBalances({ invest: 0, oroplay: 0 });
      return;
    }

    const balances = await partnerService.fetchAdminApiBalances(authState.user.id);
    setAdminApiBalances(balances);
  }, [authState.user?.id, authState.user?.level]);

  // 현재 사용자의 보유금 조회
  const fetchCurrentUserBalanceData = useCallback(async () => {
    if (!authState.user?.id) return;
    
    const result = await partnerService.fetchCurrentUserBalance(authState.user.id);
    
    if (result.investBalance !== undefined) {
      setCurrentUserInvestBalance(result.investBalance);
    }
    if (result.oroplayBalance !== undefined) {
      setCurrentUserOroplayBalance(result.oroplayBalance);
    }
    if (result.balance !== undefined) {
      setCurrentUserBalance(result.balance);
    }
    if (result.familyapiBalance !== undefined) {
      setCurrentUserFamilyapiBalance(result.familyapiBalance);
    }
  }, [authState.user?.id]);

  // 초기 로드
  useEffect(() => {
    if (authState.user?.id) {
      loadSystemDefaultCommissionData();
      loadParentCommissionData();
      fetchPartnersData();
      fetchAdminApiBalancesData();
      fetchCurrentUserBalanceData();
    }
  }, [authState.user?.id]);

  // Realtime 구독
  useEffect(() => {
    if (!authState.user?.id) return;

    console.log('✅ Realtime 구독: partners.balance 변경 감지');

    // Lv3~Lv6용 partners.balance 변경 감지
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
          
          if (oldBalance === newBalance) return;
          
          setPartners(prev => {
            const partner = prev.find(p => p.id === partnerId);
            if (!partner) return prev;
            
            if (partner.level === 1 || partner.level === 2) return prev;
            
            console.log(`💰 Lv${partner.level} 보유금 변경 (partner_id: ${partnerId}): ${oldBalance} → ${newBalance}`);
            return prev.map(p => 
              p.id === partnerId ? { ...p, balance: newBalance } : p
            );
          });
        }
      )
      .subscribe();

    // Lv1 api_configs 테이블 변경 감지
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
          
          if (oldBalance === newBalance) return;
          
          console.log(`💰 API 보유금 변경 (partner_id: ${partnerId}, provider: ${apiProvider}): ${oldBalance} → ${newBalance}`);
          
          if (partnerId === authState.user?.id && authState.user?.level === 1) {
            setAdminApiBalances(prev => ({
              ...prev,
              [apiProvider]: newBalance
            }));
          }
          
          setPartners(prev => {
            const partner = prev.find(p => p.id === partnerId);
            if (!partner || partner.level !== 1) return prev;
            
            return prev.map(p => {
              if (p.id === partnerId) {
                const updates: any = {
                  ...p,
                  balance: 0
                };
                
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

    // Lv2 invest_balance, oroplay_balance 변경 감지
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
          const oldFamilyapiBalance = (payload.old as any).familyapi_balance || 0;
          const newFamilyapiBalance = (payload.new as any).familyapi_balance || 0;
          const oldHonorapiBalance = (payload.old as any).honorapi_balance || 0;
          const newHonorapiBalance = (payload.new as any).honorapi_balance || 0;
          
          const hasBalanceChange = 
            oldInvestBalance !== newInvestBalance || 
            oldOroplayBalance !== newOroplayBalance ||
            oldFamilyapiBalance !== newFamilyapiBalance ||
            oldHonorapiBalance !== newHonorapiBalance;
          
          if (!hasBalanceChange) return;
          
          setPartners(prev => {
            const partner = prev.find(p => p.id === partnerId);
            if (!partner || partner.level !== 2) return prev;
            
            console.log(`💰 Lv2 보유금 변경 (partner_id: ${partnerId}):`, {
              invest_balance: newInvestBalance,
              oroplay_balance: newOroplayBalance,
              familyapi_balance: newFamilyapiBalance,
              honorapi_balance: newHonorapiBalance
            });
            
            return prev.map(p => {
              if (p.id === partnerId) {
                return {
                  ...p,
                  invest_balance: newInvestBalance,
                  oroplay_balance: newOroplayBalance,
                  familyapi_balance: newFamilyapiBalance,
                  honorapi_balance: newHonorapiBalance
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
  }, [authState.user?.id, authState.user?.level]);

  return {
    // State
    partners,
    setPartners,
    loading,
    setLoading,
    searchTerm,
    setSearchTerm,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    selectedPartner,
    setSelectedPartner,
    showCreateDialog,
    setShowCreateDialog,
    showEditDialog,
    setShowEditDialog,
    showDeleteDialog,
    setShowDeleteDialog,
    partnerToDelete,
    setPartnerToDelete,
    deleteConfirmText,
    setDeleteConfirmText,
    deleteLoading,
    setDeleteLoading,
    showHierarchyView,
    setShowHierarchyView,
    currentTab,
    setCurrentTab,
    dashboardData,
    setDashboardData,
    levelDistribution,
    setLevelDistribution,
    expandedPartners,
    setExpandedPartners,
    allExpanded,
    setAllExpanded,
    hierarchyWarning,
    setHierarchyWarning,
    systemDefaultCommission,
    setSystemDefaultCommission,
    showForceTransactionModal,
    setShowForceTransactionModal,
    forceTransactionType,
    setForceTransactionType,
    forceTransactionTarget,
    setForceTransactionTarget,
    adminApiBalances,
    setAdminApiBalances,
    currentUserBalance,
    setCurrentUserBalance,
    currentUserInvestBalance,
    setCurrentUserInvestBalance,
    currentUserOroplayBalance,
    setCurrentUserOroplayBalance,
    currentUserFamilyapiBalance,
    setCurrentUserFamilyapiBalance,
    parentCommission,
    setParentCommission,
    formData,
    setFormData,
    showTransferDialog,
    setShowTransferDialog,
    transferTargetPartner,
    setTransferTargetPartner,
    transferAmount,
    setTransferAmount,
    transferMemo,
    setTransferMemo,
    transferMode,
    setTransferMode,
    transferLoading,
    setTransferLoading,

    // Methods
    fetchPartners: fetchPartnersData,
    loadParentCommission: loadParentCommissionData,
    loadSystemDefaultCommission: loadSystemDefaultCommissionData,
    fetchAdminApiBalances: fetchAdminApiBalancesData,
    fetchCurrentUserBalance: fetchCurrentUserBalanceData,

    // Context
    authState,
    connected,
    sendMessage
  };
};