import { PartnerTransferDialog } from "./partner/PartnerTransferDialog";
import { PartnerFormDialog } from "./partner/PartnerFormDialog";
import { MetricCard } from "./MetricCard";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { usePartnerManagement } from "./partner/usePartnerManagement";
import { Partner } from "./partner/types";
import { handleForceTransaction as executeForceTransaction } from "./partner/handleForceTransaction";
import { useState } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useBalance } from "../../contexts/BalanceContext";
import { ChevronDown, ChevronRight, Building2, Users, Edit, DollarSign, ArrowDown, Download, Plus, Search, Eye, Shield, TrendingUp, Trash2, UserPlus } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";

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

export function PartnerManagementV2() {
  const { t } = useLanguage();
  const { balance, investBalance, oroplayBalance, syncBalance } = useBalance();
  
  const {
    // State
    partners,
    loading,
    searchTerm,
    setSearchTerm,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    showTransferDialog,
    setShowTransferDialog,
    transferTargetPartner,
    setTransferTargetPartner,
    transferMode,
    setTransferMode,
    transferAmount,
    setTransferAmount,
    transferMemo,
    setTransferMemo,
    transferLoading,
    showForceTransactionModal,
    setShowForceTransactionModal,
    forceTransactionType,
    setForceTransactionType,
    forceTransactionTarget,
    setForceTransactionTarget,
    currentUserBalance,
    currentUserInvestBalance,
    currentUserOroplayBalance,
    currentUserFamilyapiBalance,
    
    // Methods
    fetchPartners,
    
    // Context
    authState,
    connected,
    sendMessage
  } = usePartnerManagement();

  // 로컬 state: 계층 구조 관리
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [currentTab, setCurrentTab] = useState("hierarchy");
  const [dashboardData, setDashboardData] = useState<any>({});
  const [levelDistribution, setLevelDistribution] = useState<{
    level: number;
    type: string;
    typeName: string;
    partnerCount: number;
    usersBalance: number;
  }[]>([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [hierarchyWarning, setHierarchyWarning] = useState<string>("");
  const [parentCommission, setParentCommission] = useState<{
    rolling: number;
    losing: number;
    fee: number;
    nickname?: string;
  } | null>(null);
  
  // 삭제 확인 다이얼로그 state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTargetPartner, setDeleteTargetPartner] = useState<Partner | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  const [systemDefaultCommission] = useState({
    rolling: 0.5,
    losing: 5.0,
    fee: 1.0
  });
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

  // 번역 텍스트
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

  // 필터링된 파트너 목록
  const filteredPartners = partners.filter(partner => {
    const matchesSearch = !searchTerm || 
      partner.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      partner.nickname.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || partner.partner_type === typeFilter;
    const matchesStatus = statusFilter === "all" || partner.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

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

    // 🔧 created_at 기준으로 정렬 (생성일 오름차순 - 오래된 것부터)
    const sortByCreatedAt = (a: Partner, b: Partner) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    };

    // 모든 children 배열 정렬
    partnerMap.forEach((partner) => {
      if (partner.children && partner.children.length > 0) {
        partner.children.sort(sortByCreatedAt);
      }
    });

    // rootPartners도 정렬
    rootPartners.sort(sortByCreatedAt);

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

  // 계층 구조 데이터
  const hierarchyData = buildHierarchy(filteredPartners);

  // 트리 노드 렌더링 함수
  const renderTreeNode = (partner: any, depth: number): JSX.Element => {
    const isExpanded = expandedPartners.has(partner.id);
    const hasChildren = partner.children && partner.children.length > 0;
    const indentWidth = depth * 36; // 36px씩 들여쓰기 (50% 증가)

    return (
      <div key={partner.id}>
        {/* 파트너 행 */}
        <div 
          className="flex items-center gap-4 p-5 rounded-lg hover:bg-slate-800/50 transition-colors border border-slate-700/30 bg-slate-800/20 min-w-[1600px]"
        >
          {/* 토글 버튼 + 아이디 (동적 너비, 들여쓰기 적용) */}
          <div className="flex items-center gap-3 min-w-[200px] flex-shrink-0" style={{ paddingLeft: `${indentWidth}px` }}>
            <button
              onClick={() => hasChildren && togglePartner(partner.id)}
              className={`flex items-center justify-center w-8 h-8 rounded transition-colors flex-shrink-0 ${
                hasChildren 
                  ? 'hover:bg-slate-700 text-slate-300 cursor-pointer' 
                  : 'invisible'
              }`}
            >
              {hasChildren && (
                isExpanded ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )
              )}
            </button>

            {/* 아이디 */}
            <span className="font-medium text-white text-xl truncate">{partner.username}</span>
          </div>

          {/* 나머지 컬럼들 (고정 너비로 헤더와 정렬) */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* 닉네임 */}
            <div className="min-w-[150px] flex-shrink-0">
              <span className="text-slate-300 text-xl truncate">{partner.nickname}</span>
            </div>

            {/* 파트너 등급 */}
            <div className="min-w-[130px] flex-shrink-0">
              <Badge className={`px-4 py-2.5 text-white text-base border-0 ${
                partner.partner_type === 'system_admin' ? 'bg-purple-500/80' :
                partner.partner_type === 'head_office' ? 'bg-red-500/80' :
                partner.partner_type === 'main_office' ? 'bg-orange-500/80' :
                partner.partner_type === 'sub_office' ? 'bg-yellow-500/80' :
                partner.partner_type === 'distributor' ? 'bg-blue-500/80' :
                'bg-green-500/80'
              }`}>
                {partnerTypeTexts[partner.partner_type]}
              </Badge>
            </div>

            {/* 상태 */}
            <div className="min-w-[65px] flex-shrink-0 -ml-1.5">
              {(() => {
                return partner.status === 'active' ? (
                  <Badge className="px-4 py-2.5 bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 text-base">
                    {statusTexts[partner.status]}
                  </Badge>
                ) : partner.status === 'inactive' ? (
                  <Badge className="px-4 py-2.5 bg-slate-500/30 text-slate-300 border border-slate-500/50 text-base">
                    {statusTexts[partner.status]}
                  </Badge>
                ) : (
                  <Badge className="px-4 py-2.5 bg-red-500/30 text-red-300 border border-red-500/50 text-base">
                    {statusTexts[partner.status]}
                  </Badge>
                );
              })()}
            </div>

            {/* 보유금 */}
            <div className="min-w-[80px] text-right flex-shrink-0">
              <span className="font-mono text-cyan-400 text-xl">
                {/* ✅ Lv1, Lv2: 활성화된 API 잔고 합산, Lv3~7: balance */}
                {partner.level === 1 || partner.level === 2
                  ? (() => {
                      const selectedApis = partner.selected_apis || [];
                      let total = 0;
                      
                      // 활성화된 API들의 잔고만 합산
                      if (selectedApis.includes('invest')) total += (partner.invest_balance || 0);
                      if (selectedApis.includes('oroplay')) total += (partner.oroplay_balance || 0);
                      if (selectedApis.includes('familyapi')) total += (partner.familyapi_balance || 0);
                      if (selectedApis.includes('honorapi')) total += (partner.honorapi_balance || 0);
                      
                      return total.toLocaleString();
                    })()
                  : partner.balance.toLocaleString()}원
              </span>
              {/* Lv1, Lv2 활성화된 API별 잔고 툴팁 표시 */}
              {(partner.level === 1 || partner.level === 2) && partner.selected_apis && partner.selected_apis.length > 0 && (
                <div className="text-sm text-slate-400 mt-1">
                  ({partner.selected_apis.map((api: string) => {
                    const balances: Record<string, number> = {
                      invest: partner.invest_balance || 0,
                      oroplay: partner.oroplay_balance || 0,
                      familyapi: partner.familyapi_balance || 0,
                      honorapi: partner.honorapi_balance || 0
                    };
                    const apiLabels: Record<string, string> = {
                      invest: 'I',
                      oroplay: 'O',
                      familyapi: 'F',
                      honorapi: 'H'
                    };
                    return `${apiLabels[api]}:${balances[api].toLocaleString()}`;
                  }).join(' + ')})
                </div>
              )}
            </div>

            {/* Lv2 API 선택 정보 - Lv1만 조회 가능 */}
            {authState.user?.level === 1 && partner.level === 2 && partner.selected_apis && (
              <div className="min-w-[200px] flex-shrink-0">
                <div className="flex flex-wrap gap-1.5">
                  {partner.selected_apis.map((api: string) => (
                    <Badge 
                      key={api}
                      variant="outline" 
                      className="bg-purple-500/15 text-purple-300 border-purple-500/40 text-xs px-2 py-1"
                    >
                      {api.toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 커미션 정보 - Casino/Slot 분리 */}
            <div className="min-w-[320px] flex-shrink-0">
              <div className="flex flex-col gap-2">
                {/* Casino 커미션 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400 w-14">카지노</span>
                  <Badge variant="outline" className="text-slate-300 border-slate-600 text-sm px-3 py-1.5">
                    롤링 {partner.casino_rolling_commission || 0}%
                  </Badge>
                  <Badge variant="outline" className="text-slate-300 border-slate-600 text-sm px-3 py-1.5">
                    루징 {partner.casino_losing_commission || 0}%
                  </Badge>
                </div>
                {/* Slot 커미션 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400 w-14">슬롯</span>
                  <Badge variant="outline" className="text-slate-300 border-slate-600 text-sm px-3 py-1.5">
                    롤링 {partner.slot_rolling_commission || 0}%
                  </Badge>
                  <Badge variant="outline" className="text-slate-300 border-slate-600 text-sm px-3 py-1.5">
                    루징 {partner.slot_losing_commission || 0}%
                  </Badge>
                  <Badge variant="outline" className="text-slate-300 border-slate-600 text-sm px-3 py-1.5">
                    수수료 {partner.withdrawal_fee || 0}%
                  </Badge>
                </div>
              </div>
            </div>

            {/* 하위/회원 수 */}
            <div className="flex items-center gap-4 min-w-[150px] flex-shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-6 w-6 text-slate-400" />
                <span className="text-base text-slate-300">{partner.child_count || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-6 w-6 text-slate-400" />
                <span className="text-base text-slate-300">{partner.user_count || 0}</span>
              </div>
            </div>

            {/* 최근 접속 */}
            <div className="min-w-[180px] flex-shrink-0">
              {partner.last_login_at ? (() => {
                const date = new Date(partner.last_login_at);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hour = String(date.getHours()).padStart(2, '0');
                const minute = String(date.getMinutes()).padStart(2, '0');
                return <span className="text-base text-slate-300">{`${year}/${month}/${day} ${hour}:${minute}`}</span>;
              })() : (
                <span className="text-base text-slate-500">-</span>
              )}
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center justify-center gap-2 w-[320px] flex-shrink-0">
            {/* 입출금 버튼 - 상위 권한자는 모든 하위 조직에 대해 입출금 가능 */}
            {authState.user && authState.user.level < partner.level && partner.id !== authState.user.id && (() => {
              // ✅ 모든 레벨에서 PartnerTransferDialog 사용으로 통일
              return (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTransferTargetPartner(partner);
                      setTransferMode('deposit');
                      setShowTransferDialog(true);
                    }}
                    className="bg-green-500/10 border-green-500/50 text-green-400 hover:bg-green-500/20 flex-shrink-0 h-10 w-10 p-0"
                    title="보유금 지급"
                  >
                    <DollarSign className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTransferTargetPartner(partner);
                      setTransferMode('withdrawal');
                      setShowTransferDialog(true);
                    }}
                    className="bg-orange-500/10 border-orange-500/50 text-orange-400 hover:bg-orange-500/20 flex-shrink-0 h-10 w-10 p-0"
                    title="보유금 회수"
                  >
                    <ArrowDown className="h-5 w-5" />
                  </Button>
                </>
              );
            })()}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditPartner(partner)}
              className="bg-blue-500/10 border-blue-500/50 text-blue-400 hover:bg-blue-500/20 flex-shrink-0 h-10 w-10 p-0"
              title="수정"
            >
              <Edit className="h-5 w-5" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteTargetPartner(partner);
                setShowDeleteDialog(true);
              }}
              className="bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 flex-shrink-0 h-10 w-10 p-0"
              title="파트너 삭제"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* 하위 파트너 렌더링 */}
        {isExpanded && hasChildren && (
          <div>
            {partner.children.map((child: any) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ForceTransaction 핸들러
  const handleForceTransaction = async (data: {
    targetId: string;
    type: 'deposit' | 'withdrawal';
    amount: number;
    memo: string;
    apiType?: 'invest' | 'oroplay';
  }) => {
    if (!authState.user?.id) return;
    
    await executeForceTransaction(
      data,
      authState.user.id,
      t,
      connected,
      sendMessage,
      fetchPartners
    );
  };

  // 보유금 입출금 성공 핸들러
  const handleTransferSuccess = async () => {
    setTransferTargetPartner(null);
    setTransferAmount("");
    setTransferMemo("");
    setTransferMode('deposit');
    fetchPartners();
    // ✅ 보유금 실시간 업데이트
    await syncBalance();
  };

  // 파트너 삭제 핸들러
  const handleDeletePartner = async () => {
    if (!deleteTargetPartner) return;

    try {
      setDeleteLoading(true);

      // 1. 하위 회원 삭제 (users 테이블)
      const { error: usersError } = await supabase
        .from('users')
        .delete()
        .eq('referrer_id', deleteTargetPartner.id);

      if (usersError) {
        console.error('하위 회원 삭제 오류:', usersError);
        throw new Error('하위 회원 삭제에 실패했습니다.');
      }

      // 2. 하위 파트너 재귀 삭제 함수
      const deleteChildPartners = async (partnerId: string) => {
        // 현재 파트너의 하위 파트너 조회
        const { data: childPartners, error: fetchError } = await supabase
          .from('partners')
          .select('id')
          .eq('parent_id', partnerId);

        if (fetchError) throw fetchError;

        // 하위 파트너가 있으면 재귀적으로 삭제
        if (childPartners && childPartners.length > 0) {
          for (const child of childPartners) {
            await deleteChildPartners(child.id);
          }
        }

        // 현재 파트너의 회원 삭제
        await supabase
          .from('users')
          .delete()
          .eq('referrer_id', partnerId);

        // 현재 파트너 삭제
        await supabase
          .from('partners')
          .delete()
          .eq('id', partnerId);
      };

      // 3. 하위 파트너와 그들의 회원 모두 삭제
      await deleteChildPartners(deleteTargetPartner.id);

      toast.success(`파트너 "${deleteTargetPartner.nickname}"와 모든 하위 조직이 삭제되었습니다.`);
      
      setShowDeleteDialog(false);
      setDeleteTargetPartner(null);
      fetchPartners();

      // WebSocket 알림
      if (sendMessage && connected) {
        sendMessage({
          type: 'partner_deleted',
          data: { partnerId: deleteTargetPartner.id }
        });
      }
    } catch (error) {
      console.error('파트너 삭제 오류:', error);
      toast.error('파트너 삭제에 실패했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // 파트너 수정 핸들러
  const handleEditPartner = (partner: Partner) => {
    setSelectedPartner(partner);
    setShowEditDialog(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-100">{t.partnerManagement.title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="text-lg px-6 py-3 h-auto">
            <Download className="h-6 w-6 mr-2" />
            {t.partnerManagement.export}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} className="text-lg px-6 py-3 h-auto">
            <Plus className="h-6 w-6 mr-2" />
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
        
        {/* 운영사(2): 본사 */}
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
        
        {/* 운영사(2): 부본사/총판/매장 */}
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
              title={t.partnerManagement.emptyLabel || "-"}
              value="0"
              subtitle={t.partnerManagement.noSubPartnerLabel || "하위 없음"}
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
        <div className="bg-slate-800/30 rounded-xl p-2 border border-slate-700/40">
          <TabsList className="bg-transparent h-auto p-0 border-0 gap-3 w-full grid grid-cols-2">
            <TabsTrigger 
              value="hierarchy"
              className="bg-transparent text-slate-400 rounded-lg px-9 py-4.5 text-xl data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500/20 data-[state=active]:to-cyan-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20 data-[state=active]:border data-[state=active]:border-blue-400/30 transition-all duration-200"
            >
              {t.partnerManagement.partnerHierarchyManagement}
            </TabsTrigger>
            <TabsTrigger 
              value="dashboard"
              className="bg-transparent text-slate-400 rounded-lg px-9 py-4.5 text-xl data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500/20 data-[state=active]:to-pink-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 data-[state=active]:border data-[state=active]:border-purple-400/30 transition-all duration-200"
            >
              {t.partnerManagement.partnerDashboard}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 파트너 계층 관리 탭 */}
        <TabsContent value="hierarchy" className="space-y-4">
          <Card className="bg-slate-900/40 border-slate-700/50 backdrop-blur">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-2xl">{t.partnerManagement.hierarchyManagementTitle}</CardTitle>
                <Button 
                  onClick={() => window.location.hash = '#/admin/partner-creation'}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-lg px-6 py-3 h-auto"
                >
                  <UserPlus className="h-6 w-6 mr-2" />
                  파트너 생성
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-4 h-6 w-6 text-slate-400" />
                    <Input
                      placeholder={t.partnerManagement.searchIdOrNickname}
                      className="pl-12 text-lg py-6 bg-slate-800/50 border-slate-700 text-white"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <Button 
                  onClick={toggleAllPartners}
                  variant="outline"
                  className="border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:border-blue-400/50 text-lg px-6 py-3 h-auto"
                >
                  {allExpanded ? (
                    <>
                      <ChevronDown className="h-6 w-6 mr-2" />
                      {t.partnerManagement.collapseView}
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-6 w-6 mr-2" />
                      {t.partnerManagement.expandView}
                    </>
                  )}
                </Button>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[220px] text-lg py-6 bg-slate-800/50 border-slate-700 text-white">
                    <SelectValue placeholder={t.partnerManagement.partnerGradeFilter} />
                  </SelectTrigger>
                  <SelectContent className="text-lg">
                    <SelectItem value="all" className="text-lg py-3">{t.partnerManagement.allGrades}</SelectItem>
                    <SelectItem value="head_office" className="text-lg py-3">{t.partnerManagement.headOffice}</SelectItem>
                    <SelectItem value="main_office" className="text-lg py-3">{t.partnerManagement.mainOffice}</SelectItem>
                    <SelectItem value="sub_office" className="text-lg py-3">{t.partnerManagement.subOffice}</SelectItem>
                    <SelectItem value="distributor" className="text-lg py-3">{t.partnerManagement.distributor}</SelectItem>
                    <SelectItem value="store" className="text-lg py-3">{t.partnerManagement.store}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[220px] text-lg py-6 bg-slate-800/50 border-slate-700 text-white">
                    <SelectValue placeholder={t.partnerManagement.statusFilter} />
                  </SelectTrigger>
                  <SelectContent className="text-lg">
                    <SelectItem value="all" className="text-lg py-3">{t.partnerManagement.allStatus}</SelectItem>
                    <SelectItem value="active" className="text-lg py-3">{t.partnerManagement.active}</SelectItem>
                    <SelectItem value="inactive" className="text-lg py-3">{t.partnerManagement.inactive}</SelectItem>
                    <SelectItem value="blocked" className="text-lg py-3">{t.partnerManagement.blocked}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 테이블 영역 - 헤더와 데이터 함께 스크롤 */}
              <div className="overflow-x-auto">
                {/* 컬럼 헤더 */}
                <div className="mb-4 px-4 py-4 bg-slate-800/50 rounded-lg border border-slate-700/30 min-w-[1600px]">
                  <div className="flex items-center gap-4">
                    {/* 토글 + 아이디 영역 */}
                    <div className="min-w-[200px] flex-shrink-0">
                      <div className="font-bold text-slate-200">{t.partnerManagement.id}</div>
                    </div>
                    {/* 나머지 컬럼들 */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="min-w-[150px] font-bold text-slate-200">{t.partnerManagement.nickname}</div>
                      <div className="min-w-[130px] font-bold text-slate-200">{t.partnerManagement.gradeLabel}</div>
                      <div className="min-w-[65px] font-bold text-slate-200">{t.partnerManagement.statusLabel}</div>
                      <div className="min-w-[80px] font-bold text-slate-200 text-right">{t.partnerManagement.balanceLabel}</div>
                      <div className="min-w-[320px] font-bold text-slate-200">{t.partnerManagement.commissionLabel}</div>
                      <div className="min-w-[150px] font-bold text-slate-200">하위/회원</div>
                      <div className="min-w-[180px] font-bold text-slate-200">{t.partnerManagement.recentAccess}</div>
                    </div>
                    <div className="w-[320px] font-bold text-slate-200 text-center flex-shrink-0">{t.partnerManagement.management}</div>
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
                  <div className="space-y-1">
                    {hierarchyData.map((partner: any) => renderTreeNode(partner, 0))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 파트너 대시보드 탭 */}
        <TabsContent value="dashboard" className="space-y-6">
          <Card className="bg-slate-900/40 border-slate-700/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-white text-2xl">
                <TrendingUp className="h-8 w-8" />
                파트너 대시보드
              </CardTitle>
              <CardDescription className="text-slate-400 text-lg">
                파트너별 성과 및 수익 현황을 확인합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-3 mb-9">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-lg font-medium">이번달 순수익</CardTitle>
                    <DollarSign className="h-6 w-6 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">
                      {(dashboardData.monthlyCommission || 0).toLocaleString()}원
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      내 수입 - 하위 파트너 지급
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-lg font-medium">총 파트너 수</CardTitle>
                    <Building2 className="h-6 w-6 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">
                      {partners.length.toLocaleString()}개
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      +2 new this month
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-lg font-medium">활성 회원 수</CardTitle>
                    <Users className="h-6 w-6 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600">
                      {partners.reduce((sum, p) => sum + (p.user_count || 0), 0).toLocaleString()}명
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      +5% from last month
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">상위 성과 파트너</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-5">
                      {partners
                        .filter(p => p.partner_type !== 'system_admin')
                        .sort((a, b) => (b.user_count || 0) - (a.user_count || 0))
                        .slice(0, 5)
                        .map((partner, index) => (
                          <div key={partner.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <Badge className={`${partnerTypeColors[partner.partner_type]} text-white text-base px-3 py-1.5`}>
                                #{index + 1}
                              </Badge>
                              <div>
                                <p className="font-medium text-base">{partner.nickname}</p>
                                <p className="text-base text-muted-foreground">
                                  {partnerTypeTexts[partner.partner_type]}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-base">{(partner.user_count || 0)}명</p>
                              <p className="text-base text-muted-foreground">관리 회원</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">파트너 레벨별 분포</CardTitle>
                    <CardDescription className="text-sm">
                      각 레벨 파트너들이 보유한 사용자들의 총 보유금
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {levelDistribution.length > 0 ? (
                        <>
                          {levelDistribution.map((item) => {
                            const maxBalance = Math.max(...levelDistribution.map(d => d.usersBalance), 1);
                            const percentage = Math.round((item.usersBalance / maxBalance) * 100);
                            
                            return (
                              <div key={item.type} className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Badge className={`${partnerTypeColors[item.type as keyof typeof partnerTypeColors]} text-white text-sm px-3 py-1.5`}>
                                      LV.{item.level}
                                    </Badge>
                                    <span className="text-base font-medium">{item.typeName}</span>
                                    <span className="text-sm text-muted-foreground">({item.partnerCount}개)</span>
                                  </div>
                                  <span className="text-base font-medium text-blue-600">
                                    ₩{item.usersBalance.toLocaleString()}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-800/40 rounded-full h-4 overflow-hidden">
                                  <div 
                                    className={`h-4 rounded-full transition-all duration-500 ${partnerTypeColors[item.type as keyof typeof partnerTypeColors]}`}
                                    style={{ width: `${Math.max(percentage, 2)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          <div className="pt-4 border-t border-slate-700/50">
                            <div className="flex items-center justify-between">
                              <span className="text-base font-medium text-slate-300">총 사용자 보유금</span>
                              <span className="text-base font-bold text-emerald-400">
                                ₩{levelDistribution.reduce((sum, item) => sum + item.usersBalance, 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground text-base">
                          하위 파트너가 없습니
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

      {/* PartnerTransferDialog (GMS 머니) */}
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
        currentUserBalance={currentUserBalance}
        currentUserInvestBalance={currentUserInvestBalance}
        currentUserOroplayBalance={currentUserOroplayBalance}
        onSuccess={handleTransferSuccess}
        onWebSocketUpdate={(data) => {
          if (sendMessage && connected) {
            sendMessage(data.type, data.data);
          }
        }}
      />

      {/* 파트너 생성 다이얼로그 */}
      <PartnerFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        mode="create"
        userLevel={authState.user?.level}
        currentUserId={authState.user?.id}
        currentUserNickname={authState.user?.nickname}
        onSuccess={() => {
          fetchPartners();
        }}
        onWebSocketUpdate={(data) => {
          if (sendMessage && connected) {
            sendMessage(data.type, data.data);
          }
        }}
      />

      {/* 파트너 수정 다이얼로그 */}
      <PartnerFormDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        mode="edit"
        partner={selectedPartner}
        userLevel={authState.user?.level}
        onSuccess={() => {
          fetchPartners();
        }}
        onWebSocketUpdate={(data) => {
          if (sendMessage && connected) {
            sendMessage(data.type, data.data);
          }
        }}
      />

      {/* 파트너 삭제 확인 다이얼로그 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>파트너 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              파트너 "{deleteTargetPartner?.nickname}"와 모든 하위 조직을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePartner}
              className="bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 hover:border-red-400/50"
            >
              {deleteLoading ? (
                <LoadingSpinner />
              ) : (
                "삭제"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PartnerManagementV2;