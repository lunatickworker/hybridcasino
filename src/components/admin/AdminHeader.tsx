import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { 
  LogOut, Bell,
  TrendingUp, TrendingDown, Users, Wallet, AlertTriangle, Key, DollarSign, ArrowRightLeft
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { useAuth } from "../../hooks/useAuth";
import { useBalance } from "../../contexts/BalanceContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { Partner, DashboardStats } from "../../types";
import { formatCurrency, formatNumber, cn } from "../../lib/utils";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../lib/supabase";
import { AnimatedCurrency } from "../common/AnimatedNumber";
// import { getInfo } from "../../lib/investApi"; // ❌ 사용 중지
import { getAgentBalance, getOroPlayToken } from "../../lib/oroplayApi";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { getInvestCredentials, updateInvestBalance, updateOroplayBalance, getLv1HonorApiCredentials, updateHonorApiBalance } from "../../lib/apiConfigHelper";
import { getTodayStartUTC, getCachedTimezoneOffset, convertUTCToSystemTime } from "../../utils/timezone";
import { NotificationsModal } from "./NotificationsModal";
import { CommissionConvertModal } from "./CommissionConvertModal";
import { getUnreadNotificationCount } from '../../lib/notificationHelper';
import * as investApiModule from '../../lib/investApi';
import { checkApiActiveByPartnerId } from '../../lib/apiStatusChecker';
import * as familyApiModule from '../../lib/familyApi';
import * as honorApiModule from '../../lib/honorApi';
import { calculateMyIncome, getDescendantUserIds } from '../../lib/settlementCalculator';
import { getBettingStatsByGameType } from '../../lib/settlementCalculatorV2';

interface AdminHeaderProps {
  user: Partner;
  wsConnected: boolean;
  onToggleSidebar: () => void;
  onRouteChange?: (route: string) => void;
  currentRoute?: string;
}

export function AdminHeader({ user, wsConnected, onToggleSidebar, onRouteChange, currentRoute }: AdminHeaderProps) {
  const { logout } = useAuth();
  const { t, formatCurrency: formatCurrencyFromContext, language } = useLanguage();
  
  // formatCurrency를 formatCurrencyFromContext로 alias
  const formatCurrency = formatCurrencyFromContext;
  
  // ✅ useBalance를 안전하게 사용 (Provider 없을 때 대비)
  let balance = 0;
  let investBalance = 0;
  let oroplayBalance = 0;
  let familyapiBalance = 0;
  let honorapiBalance = 0;
  let balanceLoading = false;
  let balanceError = null;
  let lastSyncTime = null;
  let useInvestApi = false;
  let useOroplayApi = false;
  let useFamilyApi = false;
  let useHonorApi = false;
  let syncBalance = async () => {};
  
  try {
    const balanceContext = useBalance();
    balance = balanceContext.balance;
    investBalance = balanceContext.investBalance;
    oroplayBalance = balanceContext.oroplayBalance;
    familyapiBalance = balanceContext.familyapiBalance;
    honorapiBalance = balanceContext.honorapiBalance;
    balanceLoading = balanceContext.loading;
    balanceError = balanceContext.error;
    lastSyncTime = balanceContext.lastSyncTime;
    useInvestApi = balanceContext.useInvestApi;
    useOroplayApi = balanceContext.useOroplayApi;
    useFamilyApi = balanceContext.useFamilyApi;
    useHonorApi = balanceContext.useHonorApi;
    syncBalance = balanceContext.syncBalance;
  } catch (error) {
    // ✅ BalanceProvider 외부에서 렌더링되는 경우 (정상 동작 - 로그인 전)
    // 경고 메시지 제거 (개발 환경에서만 필요시 주석 해제)
    // console.warn('AdminHeader rendered outside BalanceProvider');
  }

  // 사용자 정보가 없으면 기본 헤더 표시
  if (!user) {
    return (
      <div className="w-full px-6 py-3.5 h-[72px] flex items-center border-b border-slate-200 bg-white/95">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{t.common.loading}</span>
          </div>
        </div>
      </div>
    );
  }

  const [stats, setStats] = useState<DashboardStats>({
    total_users: 0,
    total_balance: 0,
    daily_deposit: 0,
    daily_withdrawal: 0,
    daily_net_deposit: 0,
    casino_betting: 0,
    slot_betting: 0,
    total_betting: 0,
    online_users: 0,
    pending_approvals: 0,
    pending_messages: 0,
    pending_deposits: 0,
    pending_withdrawals: 0,
  });
  
  const [totalUsers, setTotalUsers] = useState(0);
  const [showLv2Warning, setShowLv2Warning] = useState(false);
  const [isSyncingInvest, setIsSyncingInvest] = useState(false);
  const [isSyncingOroplay, setIsSyncingOroplay] = useState(false);
  const [isSyncingFamily, setIsSyncingFamily] = useState(false);
  const [isSyncingHonor, setIsSyncingHonor] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  // =====================================================
  // 알림 개수 로드
  // =====================================================
  const loadNotificationCount = async () => {
    try {
      console.log('🔔 [알림 개수 로드] 현재 관리자 ID:', user.id, '레벨:', user.level);
      const count = await getUnreadNotificationCount(user.id); // ✅ partnerId 전달
      console.log('🔔 [알림 개수 로드] 결과:', count);
      setNotificationCount(count);
    } catch (error) {
      console.error('❌ 알림 개수 로드 실패:', error);
    }
  };

  // =====================================================
  // Invest 보유금 수동 동기화 (카드 클릭 시)
  // =====================================================
  const handleSyncInvestBalance = async () => {
    if (user.level !== 1 && user.level !== 2) {
      return;
    }

    setIsSyncingInvest(true);
    try {
      console.log('💰 [AdminHeader] Invest 보유금 수동 동기화 시작');
      
      // Lv1의 API 설정 조회 (Lv2도 Lv1의 API 설정 사용)
      let partnerId = user.id;
      if (user.level === 2) {
        // Lv2는 Lv1의 partner_id 찾기
        const { data: lv1Partner } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(); // ⭐ single() → maybeSingle()
        
        if (!lv1Partner) {
          console.warn('⚠️ Lv1 파트너를 찾을 수 없습니다 (Invest 동기화)');
          toast.error('Lv1 파트너가 존재하지 않습니다. 시스템 관리자에게 문의하세요.');
          return;
        }
        partnerId = lv1Partner.id;
      }
      
      // ✅ Invest API 활성화 체크
      const isInvestActive = await checkApiActiveByPartnerId(partnerId, 'invest');
      if (!isInvestActive) {
        toast.info('Invest API가 비활성화되어 있습니다.');
        return;
      }
      
      // API 설정 조회
      const apiConfig = await investApiModule.investApi.getApiConfig(partnerId);
      
      // 전체 계정 잔고 조회
      const balanceResponse = await investApiModule.investApi.getAllAccountBalances(
        apiConfig.opcode,
        apiConfig.secret_key
      );
      
      const balance = balanceResponse.data?.balance || 0;

      console.log('✅ [AdminHeader] Invest API 응답:', { balance });

      // DB 업데이트
      if (user.level === 1) {
        // Lv1: api_configs 업데이트
        const { error: updateError } = await supabase
          .from('api_configs')
          .update({
            balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', user.id)
          .eq('api_provider', 'invest');

        if (updateError) {
          throw new Error('DB 업데이트 실패');
        }
      } else if (user.level === 2) {
        // Lv2: partners.invest_balance 업데이트
        const { error: updateError } = await supabase
          .from('partners')
          .update({
            invest_balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (updateError) {
          throw new Error('DB 업데이트 실패');
        }
      }

      toast.success(`Invest 보유금 동기화 완료: ${formatCurrency(balance)}`);
      
      // ✅ BalanceContext 업데이트
      await syncBalance();
    } catch (error: any) {
      console.error('❌ [AdminHeader] Invest 보유금 동기화 실패:', error);
      toast.error(`Invest 보유금 동기화 실패: ${error.message}`);
    } finally {
      setIsSyncingInvest(false);
    }
  };

  // =====================================================
  // OroPlay 보유금 수동 동기화 (카드 클릭 시)
  // =====================================================
  const handleSyncOroplayBalance = async () => {
    if (user.level !== 1 && user.level !== 2) {
      return;
    }

    setIsSyncingOroplay(true);
    try {
      console.log('💰 [AdminHeader] OroPlay 보유금 수동 동기화 시작');

      // Lv1의 토큰 조회 (Lv2도 Lv1의 API 설정 사용)
      let partnerId = user.id;
      if (user.level === 2) {
        // Lv2는 Lv1의 partner_id 찾기
        const { data: lv1Partner } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(); // ⭐ single() → maybeSingle()
        
        if (!lv1Partner) {
          console.warn('⚠️ 시스템 파트너를 찾을 수 없습니다 (OroPlay 동기화)');
          toast.error('시스템 파트너가 존재하지 않습니다. 시스템 관리자에게 문의하세요.');
          return;
        }
        partnerId = lv1Partner.id;
      }

      // ✅ OroPlay API 활성화 체크
      const isOroPlayActive = await checkApiActiveByPartnerId(partnerId, 'oroplay');
      if (!isOroPlayActive) {
        toast.info('OroPlay API가 비활성화되어 있습니다.');
        return;
      }

      // 토큰 조회 (자동 갱신 포함)
      const token = await getOroPlayToken(partnerId);

      // GET /agent/balance 호출
      const balance = await getAgentBalance(token);

      console.log('✅ [AdminHeader] OroPlay API 응답:', { balance });

      // DB 업데이트
      if (user.level === 1) {
        // Lv1: 헬퍼 함수 사용 (api_configs + 모든 Lv2 동기화)
        const success = await updateOroplayBalance(user.id, balance);
        if (!success) {
          throw new Error('DB 업데이트 실패');
        }
      } else if (user.level === 2) {
        // Lv2: partners.oroplay_balance 업데이트 (자기 자신만)
        const { error: updateError } = await supabase
          .from('partners')
          .update({
            oroplay_balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (updateError) {
          throw new Error('DB 업데이트 실패');
        }
      }

      toast.success(`OroPlay 보유금 동기화 완료: ${formatCurrency(balance)}`);
      
      // ✅ BalanceContext 업데이트 (❌ 제거: syncBalance() 호출 시 불필요한 API 호출 방지)
      // await syncBalance();
    } catch (error: any) {
      console.error('❌ [AdminHeader] OroPlay 보유금 동기화 실패:', error);
      toast.error(`OroPlay 보유금 동기화 실패: ${error.message}`);
    } finally {
      setIsSyncingOroplay(false);
    }
  };

  // =====================================================
  // FamilyAPI 보유금 수동 동기화 (카드 클릭 시)
  // =====================================================
  const handleSyncFamilyBalance = async () => {
    if (user.level !== 1) {
      return;
    }

    setIsSyncingFamily(true);
    try {
      console.log('💰 [AdminHeader] FamilyAPI 보유금 수동 동기화 시작');

      // ✅ FamilyAPI 활성화 체크
      const isFamilyApiActive = await checkApiActiveByPartnerId(user.id, 'familyapi');
      if (!isFamilyApiActive) {
        toast.info('FamilyAPI가 비활성화되어 있습니다.');
        return;
      }
      
      // API Key와 Token 조회
      const config = await familyApiModule.getFamilyApiConfig();
      let token = await familyApiModule.getFamilyApiToken(config.partnerId);
      
      // Agent 잔고 조회 (실패 시 토큰 재발급 후 재시도)
      let balanceData;
      try {
        balanceData = await familyApiModule.getAgentBalance(config.apiKey, token);
      } catch (error: any) {
        console.warn('⚠️ 토큰 오류 감지, 새 토큰으로 재시도:', error.message);
        // 토큰 재발급 후 재시도
        token = await familyApiModule.getFamilyApiToken(config.partnerId, true);
        balanceData = await familyApiModule.getAgentBalance(config.apiKey, token);
      }
      
      const balance = balanceData.credit || 0;

      console.log('✅ [AdminHeader] FamilyAPI API 응답:', { balance });

      // DB 업데이트
      const { error: updateError } = await supabase
        .from('api_configs')
        .update({
          balance: balance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', user.id)
        .eq('api_provider', 'familyapi');

      if (updateError) {
        throw new Error('DB 업데이트 실패');
      }

      toast.success(`FamilyAPI 보유금 동기화 완료: ${formatCurrency(balance)}`);
      
      // ✅ BalanceContext 업데이트
      await syncBalance();
    } catch (error: any) {
      console.error('❌ [AdminHeader] FamilyAPI 보유금 동기화 실패:', error);
      toast.error(`FamilyAPI 보유금 동기화 실패: ${error.message}`);
    } finally {
      setIsSyncingFamily(false);
    }
  };

  // =====================================================
  // HonorAPI 보유금 수동 동기화 (카드 클릭 시)
  // =====================================================
  const handleSyncHonorBalance = async () => {
    if (user.level !== 1 && user.level !== 2) {
      return;
    }

    setIsSyncingHonor(true);
    try {
      console.log('💰 [AdminHeader] HonorAPI 보유금 수동 동기화 시작');

      // Lv1의 토큰 조회 (Lv2도 Lv1의 API 설정 사용)
      const { data: lv1Partner, error: lv1Error } = await supabase
        .from('partners')
        .select('id')
        .eq('level', 1)
        .limit(1)
        .maybeSingle();

      if (lv1Error || !lv1Partner) {
        throw new Error('Lv1 파트너를 찾을 수 없습니다.');
      }

      const partnerId = lv1Partner.id;

      // ✅ HonorAPI 활성화 체크
      const isHonorApiActive = await checkApiActiveByPartnerId(partnerId, 'honorapi');
      if (!isHonorApiActive) {
        toast.info('HonorAPI가 비활성화되어 있습니다.');
        return;
      }
      
      // API Key 조회
      const credentials = await getLv1HonorApiCredentials(partnerId);
      
      if (!credentials.api_key) {
        throw new Error('HonorAPI API Key가 설정되지 않았습니다.');
      }
      
      // Agent 정보 조회 (잔고 포함)
      const agentInfo = await honorApiModule.getAgentInfo(credentials.api_key);
      
      const balance = parseFloat(agentInfo.balance) || 0;

      console.log('✅ [AdminHeader] HonorAPI API 응답:', { balance });

      // DB 업데이트
      if (user.level === 1) {
        // Lv1: 헬퍼 함수 사용 (api_configs + 모든 Lv2 동기화)
        const success = await updateHonorApiBalance(user.id, balance);
        
        if (!success) {
          throw new Error('DB 업데이트 실패');
        }
      } else if (user.level === 2) {
        // Lv2: partners.honorapi_balance 업데이트 (자기 자신만)
        const { error: updateError } = await supabase
          .from('partners')
          .update({
            honorapi_balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (updateError) {
          throw new Error(`partners 업데이트 실패: ${updateError.message}`);
        }
      }

      toast.success(`HonorAPI 보유금 동기화 완료: ${formatCurrency(balance)}`);
      
      // ✅ Honor만 동기화 (다른 API는 호출하지 않음)
      // await syncBalance(); // 제거: Honor만 클릭했는데 다른 API까지 순차 동기화되는 문제 해결
    } catch (error: any) {
      console.error('❌ [AdminHeader] HonorAPI 보유금 동기화 실패:', error);
      toast.error(`HonorAPI 보유금 동기화 실패: ${error.message}`);
    } finally {
      setIsSyncingHonor(false);
    }
  };

  // ✅ 실제 데이터 로드 (사용자 + 관리자 입출금 포함) - 계층 구조 필터링
  useEffect(() => {
    const fetchHeaderStats = async (forceReload = false) => {
      try {
        // 시스템 타임존 기준 오늘 0시
        const todayStartISO = getTodayStartUTC();

        // 🔍 Hierarchical filtering: self + child partners' users
        let allowedUserIds: string[] = [];
        let allowedPartnerIds: string[] = [];

        if (user.level === 1) {
          // System admin: all users, all partners
          const { data: allUsers } = await supabase
            .from('users')
            .select('id');
          allowedUserIds = allUsers?.map(u => u.id).filter(id => id != null) || [];
          allowedPartnerIds = []; // 빈 배열 = 모든 파트너
        } else {
          // Partner: child partners + own users
          const { data: hierarchicalPartners, error: hierarchyError } = await supabase
            .rpc('get_hierarchical_partners', { p_partner_id: user.id });

          if (hierarchyError) {
            // Supabase 연결 안 됨 - 조용히 실패
            if (hierarchyError?.message?.includes('Failed to fetch')) {
              return;
            }
            console.error('❌ Child partners fetch failed:', hierarchyError);
          }

          const partnerIds = [user.id, ...(hierarchicalPartners?.map((p: any) => p.id) || [])];
          allowedPartnerIds = partnerIds;

          // Get users with these partners as referrer_id
          const { data: partnerUsers, error: usersError } = await supabase
            .from('users')
            .select('id, username, referrer_id')
            .in('referrer_id', partnerIds);

          if (usersError) {
            console.error('❌ Partner users fetch failed:', usersError);
          }

          allowedUserIds = partnerUsers?.map(u => u.id).filter(id => id != null) || [];
        }

        // No users = empty stats (normal situation)
        if (allowedUserIds.length === 0) {
          setStats(prev => ({
            ...prev,
            daily_deposit: 0,
            daily_withdrawal: 0,
            daily_net_deposit: 0,
            online_users: 0,
            pending_approvals: 0,
            pending_messages: 0,
            pending_deposits: 0,
            pending_withdrawals: 0,
          }));
          setTotalUsers(0);
          return;
        }

        // 1️⃣ 입금 합계 (사용자 deposit + 관리자 partner_deposit) - 소속 사용자만
        const { data: depositData, error: depositError } = await supabase
          .from('transactions')
          .select('amount')
          .in('transaction_type', ['deposit', 'partner_deposit'])
          .eq('status', 'completed')
          .gte('created_at', todayStartISO)
          .in('user_id', allowedUserIds);

        if (depositError) {
          console.error('❌ 입금 조회 실패:', depositError);
        }

        const dailyDeposit = depositData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

        // 2️⃣ 출금 합계 (사용자 withdrawal + 관리자 partner_withdrawal) - 소속 사용자만
        const { data: withdrawalData, error: withdrawalError } = await supabase
          .from('transactions')
          .select('amount')
          .in('transaction_type', ['withdrawal', 'partner_withdrawal'])
          .eq('status', 'completed')
          .gte('created_at', todayStartISO)
          .in('user_id', allowedUserIds);

        if (withdrawalError) {
          console.error('❌ 출금 조회 실패:', withdrawalError);
        }

        const dailyWithdrawal = withdrawalData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

        // 3️⃣ 게임중인 사용자 수 - game_launch_sessions 테이블에서 status='active'인 세션만
        const { count: onlineCount, error: onlineError } = await supabase
          .from('game_launch_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')  // ⭐ ready 상태 제거, active만 체크
          .in('user_id', allowedUserIds);

        if (onlineError) {
          console.error('❌ 온라인 사용자 조회 실패:', onlineError);
        }
        
        console.log('🎮 [온라인 사용자] 카운트:', onlineCount, '| allowedUserIds:', allowedUserIds.length);

        // 4️⃣ 전체 회원 수 - 소속 사용자만
        const totalUserCount = allowedUserIds.length;

        // 🔔 5️⃣ 가입승인 대기 수 - 소속 사용자만
        const { count: pendingApprovalsCount } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .in('id', allowedUserIds);

        // 🔔 6️⃣ 고객문의 대기 수 (messages 테이블에서 status='unread' 또는 'read' - 답변 전 상태)
        const { count: pendingMessagesCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('status', ['unread', 'read'])
          .eq('message_type', 'normal')
          .eq('receiver_type', 'partner')
          .is('parent_id', null);

        // 🔔 7️⃣ 입금요청 대기 수 - 사용자 입금 + 관리자 입금 (조직격리 적용)
        let pendingDepositsCount = 0;
        try {
          const { count: userDepositCount, error: userDepositError } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('transaction_type', 'deposit')
            .eq('status', 'pending')
            .in('user_id', allowedUserIds);

          if (userDepositError) {
            console.error('❌ 사용자 입금 대기 수 조회 실패:', userDepositError);
          }

          // 관리자 입금 신청도 조직격리 적용
          let adminDepositQuery = supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('transaction_type', 'partner_deposit')
            .eq('status', 'pending')
            .neq('partner_id', user.id); // 본인이 신청한 것은 제외

          // Lv1이 아닌 경우 하위 조직만
          if (user.level !== 1) {
            adminDepositQuery = adminDepositQuery.in('partner_id', allowedPartnerIds);
          }

          const { count: adminDepositCount, error: adminDepositError } = await adminDepositQuery;

          if (adminDepositError) {
            console.error('❌ 관리자 입금 대기 수 조회 실패:', adminDepositError);
          }

          pendingDepositsCount = (userDepositCount || 0) + (adminDepositCount || 0);
          console.log('🔔 입금요청 대기 수 (조직격리 적용):', {
            userDepositCount,
            adminDepositCount,
            allowedPartnerIds: user.level === 1 ? 'all' : allowedPartnerIds,
            total: pendingDepositsCount
          });
        } catch (error) {
          console.error('❌ 입금요청 대기 수 조회 실패:', error);
          pendingDepositsCount = 0;
        }

        // 🔔 8️⃣ 출금요청 대기 수 - 사용자 출금 + 관리자 출금 (조직격리 적용)
        let pendingWithdrawalsCount = 0;
        try {
          const { count: userWithdrawalCount, error: userWithdrawalError } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('transaction_type', 'withdrawal')
            .eq('status', 'pending')
            .in('user_id', allowedUserIds);

          if (userWithdrawalError) {
            console.error('❌ 사용자 출금 대기 수 조회 실패:', userWithdrawalError);
          }

          // 관리자 출금 신청도 조직격리 적용
          let adminWithdrawalQuery = supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('transaction_type', 'partner_withdrawal')
            .eq('status', 'pending')
            .neq('partner_id', user.id); // 본인이 신청한 것은 제외

          // Lv1이 아닌 경우 하위 조직만
          if (user.level !== 1) {
            adminWithdrawalQuery = adminWithdrawalQuery.in('partner_id', allowedPartnerIds);
          }

          const { count: adminWithdrawalCount, error: adminWithdrawalError } = await adminWithdrawalQuery;

          if (adminWithdrawalError) {
            console.error('❌ 관리자 출금 대기 수 조회 실패:', adminWithdrawalError);
          }

          pendingWithdrawalsCount = (userWithdrawalCount || 0) + (adminWithdrawalCount || 0);
          console.log('🔔 출금요청 대기 수 (조직격리 적용):', {
            userWithdrawalCount,
            adminWithdrawalCount,
            allowedPartnerIds: user.level === 1 ? 'all' : allowedPartnerIds,
            total: pendingWithdrawalsCount
          });
        } catch (error) {
          console.error('❌ 출금요청 대기 수 조회 실패:', error);
          pendingWithdrawalsCount = 0;
        }

        // 💰 9️⃣ 총 잔고 (소속 사용자들의 balance 합계)
        const { data: usersBalanceData } = await supabase
          .from('users')
          .select('balance')
          .in('id', allowedUserIds);
        
        const totalBalance = usersBalanceData?.reduce((sum, u) => sum + Number(u.balance || 0), 0) || 0;
        
        setStats(prev => ({
          ...prev,
          total_balance: totalBalance,
          daily_deposit: dailyDeposit,
          daily_withdrawal: dailyWithdrawal,
          daily_net_deposit: dailyDeposit - dailyWithdrawal,
          online_users: onlineCount || 0,
          pending_approvals: pendingApprovalsCount || 0,
          pending_messages: pendingMessagesCount || 0,
          pending_deposits: pendingDepositsCount || 0,
          pending_withdrawals: pendingWithdrawalsCount || 0,
        }));
        
        setTotalUsers(totalUserCount || 0);
        
        // Lv2 전용: 5% 경고 체크
        if (user.level === 2) {
          checkLv2Warning(totalBalance);
        }
      } catch (error) {
        console.error('❌ 헤더 통계 로드 실패:', error);
      }
    };
    
    // 초기 로드
    fetchHeaderStats();
    
    // ⏰ 자정 리셋 타이머 설정 (시스템 타임존 기준)
    const setupMidnightReset = () => {
      const now = new Date();
      const timezoneOffset = getCachedTimezoneOffset(); // 시스템 설정의 타임존 오프셋 사용
      const systemTime = convertUTCToSystemTime(now, timezoneOffset);
      
      // 다음 자정 계산 (시스템 타임존 기준)
      const nextMidnight = new Date(
        Date.UTC(
          systemTime.getUTCFullYear(),
          systemTime.getUTCMonth(),
          systemTime.getUTCDate() + 1,
          0, 0, 0, 0
        )
      );
      
      // UTC 기준으로 변환
      const nextMidnightUTC = new Date(nextMidnight.getTime() - (timezoneOffset * 3600000));
      const msUntilMidnight = nextMidnightUTC.getTime() - now.getTime();
      
      console.log(`⏰ [자정 리셋] 다음 자정까지: ${Math.floor(msUntilMidnight / 1000 / 60)}분 (시스템 타임존: UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset})`);
      
      return setTimeout(() => {
        console.log('🔄 [자정 리셋] 통계 리셋 실행');
        fetchHeaderStats();
        
        // 자정 이후 매일 자정마다 리셋되도록 24시간 간격으로 설정
        setInterval(() => {
          console.log('🔄 [자정 리셋] 통계 리셋 실행 (24시간 주기)');
          fetchHeaderStats();
        }, 24 * 60 * 60 * 1000);
      }, msUntilMidnight);
    };
    
    const midnightTimer = setupMidnightReset();
    
    console.log('🔔 헤더 Realtime 구독 시작:', user.id);
    
    // ✅ Realtime 구독 1: transactions 변경 시 즉시 업데이트
    const transactionChannel = supabase
      .channel('header_transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        async (payload) => {
          console.log('💰 [헤더 알림] transactions 변경 감지:', payload.eventType, payload);
          fetchHeaderStats(); // 즉시 갱신
          
          // UPDATE 이벤트: 승인/거절 처리
          if (payload.eventType === 'UPDATE' && payload.new && payload.old) {
            const oldTx = payload.old as any;
            const newTx = payload.new as any;
            
            // pending -> completed/rejected 상태 변경 감지
            if (oldTx.status === 'pending' && newTx.status !== 'pending') {
              console.log('✅ [헤더 알림] 거래 처리 완료:', {
                type: newTx.transaction_type,
                status: newTx.status,
                oldPending: oldTx.status
              });
            }
          }
          
          // 새 입금/출금 요청 시 토스트 알림
          if (payload.eventType === 'INSERT' && payload.new) {
            const transaction = payload.new as any;
            
            if (transaction.status === 'pending') {
              // ✅ 관리자 입출금 신청 처리 (partner_deposit, partner_withdrawal)
              if (transaction.transaction_type === 'partner_deposit' || transaction.transaction_type === 'partner_withdrawal') {
                // ✅ 신청자 본인에게는 알람 표시 안 함 + 조직격리 적용
                if (transaction.partner_id !== user.id) {
                  // Lv1: 모든 관리자 신청 알림, Lv2+: 자신의 하위 조직만
                  let shouldNotify = false;
                  if (user.level === 1) {
                    shouldNotify = true;
                  } else {
                    // 신청한 파트너가 자신의 하위 조직인지 확인
                    shouldNotify = allowedPartnerIds.includes(transaction.partner_id);
                  }

                  if (shouldNotify) {
                    const memo = transaction.memo || '';

                    if (transaction.transaction_type === 'partner_deposit') {
                      toast.info('새로운 관리자 입금 신청이 있습니다.', {
                        description: `금액: ${formatCurrency(Number(transaction.amount))}${memo ? ` | ${memo}` : ''}`,
                        duration: 10000,
                        position: 'bottom-left',
                        action: {
                          label: '확인',
                          onClick: () => {
                            if (onRouteChange) {
                              onRouteChange('/admin/transactions#deposit-request');
                            }
                          }
                        }
                      });
                    } else if (transaction.transaction_type === 'partner_withdrawal') {
                      toast.warning('새로운 관리자 출금 신청이 있습니다.', {
                        description: `금액: ${formatCurrency(Number(transaction.amount))}${memo ? ` | ${memo}` : ''}`,
                        duration: 10000,
                        position: 'bottom-left',
                        action: {
                          label: '확인',
                          onClick: () => {
                            if (onRouteChange) {
                              onRouteChange('/admin/transactions#withdrawal-request');
                            }
                          }
                        }
                      });
                    }
                  }
                }
                return; // 관리자 신청은 여기서 처리 완료
              }
              
              // ✅ 사용자 입출금 신청 처리 (deposit, withdrawal)
              // 🔐 조직격리: 해당 회원이 내 조직에 속하는지 확인
              const { data: transactionUser } = await supabase
                .from('users')
                .select('id, username, referrer_id')
                .eq('id', transaction.user_id)
                .single();
              
              if (!transactionUser) return; // 사용자 정보 없으면 알림 X
              
              // Lv1이면 모든 거래, Lv2+ 이면 하위 조직만
              let shouldNotify = false;
              if (user.level === 1) {
                shouldNotify = true;
              } else {
                // 하위 조직에 속하는지 확인
                const descendantIds = await getDescendantUserIds(user.id);
                shouldNotify = descendantIds.includes(transaction.user_id);
              }
              
              if (!shouldNotify) return; // 내 조직이 아니면 알림 X
              
              const username = transactionUser.username || transaction.user_id;
              
              if (transaction.transaction_type === 'deposit') {
                toast.info('새로운 입금 요청이 있습니.', {
                  description: `금액: ${formatCurrency(Number(transaction.amount))} | 회원: ${username}\n클릭하면 사라집니다.`,
                  duration: 10000,
                  position: 'bottom-left',
                  action: {
                    label: '확인',
                    onClick: () => {
                      if (onRouteChange) {
                        onRouteChange('/admin/transactions#deposit-request');
                      }
                    }
                  }
                });
              } else if (transaction.transaction_type === 'withdrawal') {
                toast.warning('새로운 출금 요청이 있습니다.', {
                  description: `금액: ${formatCurrency(Number(transaction.amount))} | 회원: ${username}\n클릭하면 사라집니다.`,
                  duration: 10000,
                  position: 'bottom-left',
                  action: {
                    label: '확인',
                    onClick: () => {
                      if (onRouteChange) {
                        onRouteChange('/admin/transactions#withdrawal-request');
                      }
                    }
                  }
                });
              }
            }
          }
        }
      )
      .subscribe();

    // ✅ Realtime 구독 2: users 변경 시 즉시 업데이트 (가입승인, 잔고 변경)
    const usersChannel = supabase
      .channel('header_users')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users'
        },
        (payload) => {
          console.log('🔔 [헤더 알림] users 변경 감지 (가입승인):', payload.eventType);
          fetchHeaderStats(); // 즉시 갱신
          
          // 새 가입 요청 시 토스트 알림
          if (payload.eventType === 'INSERT' && payload.new && (payload.new as any).status === 'pending') {
            toast.info('새로운 가입 신청이 있습니다.', {
              description: `회원 아이디: ${(payload.new as any).username}\n클릭하면 사라집니다.`,
              duration: 8000,
              position: 'bottom-left',
            });
          }
        }
      )
      .subscribe();

    // ✅ Realtime 구독 3: messages 변경 시 즉시 업데이트 (고객문의)
    const messagesChannel = supabase
      .channel('header_messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('🔔 [Header Alert] messages change detected (customer inquiry):', payload.eventType);
          fetchHeaderStats(); // Immediate refresh
          
          // Toast notification for new customer inquiry (user to partner message)
          if (payload.eventType === 'INSERT' && payload.new) {
            const newMsg = payload.new as any;
            if (newMsg.message_type === 'normal' && 
                newMsg.sender_type === 'user' && 
                newMsg.receiver_type === 'partner' &&
                !newMsg.parent_id) {
              toast.info(t.header.newDeposit || 'New customer inquiry', {
                description: `Subject: ${newMsg.subject || 'Inquiry'}\n클릭하면 사라집니다.`,
                duration: 8000,
                position: 'bottom-left',
                action: {
                  label: '확인',
                  onClick: () => {
                    if (onRouteChange) {
                      onRouteChange('/admin/customer-service');
                    }
                  }
                }
              });
            }
          }
        }
      )
      .subscribe();

    // ✅ Realtime 구독 4: game_launch_sessions 변경 시 즉시 업데이트 (게임중인 사용자)
    const gameSessionsChannel = supabase
      .channel('header_game_sessions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_launch_sessions'
        },
        (payload) => {
          console.log('🎮 [헤더 알림] game_launch_sessions 변경 감지:', payload.eventType);
          fetchHeaderStats(); // 즉시 갱신
        }
      )
      .subscribe();

    // ✅ Realtime 구독 5: notifications 변경 시 알림 개수 업데이트
    const notificationsChannel = supabase
      .channel('header_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications' // ⭐ notifications 테이블 사용
        },
        (payload) => {
          console.log('🔔 [헤더 알림] notifications 변경 감지:', {
            event: payload.eventType,
            old: payload.old,
            new: payload.new
          });
          
          // INSERT: 새 알림 추가
          if (payload.eventType === 'INSERT') {
            const newNotification = payload.new as any;
            // 내가 받을 알림인지 확인
            if (newNotification.recipient_id === user.id && newNotification.is_read === false) {
              console.log('🔔 [알림 증가] 새 알림:', newNotification.id);
              loadNotificationCount(); // 알림 개수 즉시 업데이트
            }
          }
          
          // UPDATE: 알림 읽음 처리
          else if (payload.eventType === 'UPDATE') {
            const oldNotification = payload.old as any;
            const newNotification = payload.new as any;
            
            console.log('🔔 [알림 업데이트 상세]:', {
              old_is_read: oldNotification?.is_read,
              new_is_read: newNotification?.is_read,
              recipient_id: newNotification?.recipient_id,
              current_user_id: user.id,
              is_mine: newNotification?.recipient_id === user.id
            });
            
            // is_read: false -> true 상태 변경 감지
            if (oldNotification?.is_read === false && newNotification?.is_read === true && newNotification?.recipient_id === user.id) {
              console.log('✅ [알림 감소] 읽음 처리:', newNotification.id);
              loadNotificationCount(); // 알림 개수 즉시 업데이트
            }
          }
          
          // DELETE: 알림 삭제
          else if (payload.eventType === 'DELETE') {
            const deletedNotification = payload.old as any;
            if (deletedNotification?.recipient_id === user.id && deletedNotification?.is_read === false) {
              console.log('🔔 [알림 감소] 알림 삭제:', deletedNotification.id);
              loadNotificationCount(); // 알림 개수 즉시 업데이트
            }
          }
        }
      )
      .subscribe();

    // ✅ settlements 테이블 실시간 구독 추가 (INSERT만 구독)
    const settlementsChannel = supabase
      .channel('settlements_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'settlements',
          filter: `partner_id=eq.${user.id}`
        },
        (payload) => {
          console.log('💰 [정산 생성 감지]:', payload.eventType);
          // 새로운 정산이 생성될 때마다 커미션 정보 갱신
          loadLatestCommissions();
        }
      )
      .subscribe();

    // 초기 알림 개수 로드
    loadNotificationCount();
    
    // ✅ 초기 커미션 정보 로드
    loadLatestCommissions();

    return () => {
      console.log('🔕 헤더 Realtime 구독 해제');
      clearTimeout(midnightTimer);
      supabase.removeChannel(transactionChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(gameSessionsChannel);
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(settlementsChannel);
    };
  }, [user.id]);

  // 베팅 알림 상태
  const [bettingAlerts, setBettingAlerts] = useState({
    all_betting: 0,
    large_betting: 0,
    high_win: 0,
    suspicious: 0,
  });

  // ✅ 조직 관리: 허용된 파트너 ID 리스트 (자신 + 하위 조직)
  const [allowedPartnerIds, setAllowedPartnerIds] = useState<string[]>([]);

  // ✅ 허용된 파트너 ID 로드
  useEffect(() => {
    const loadAllowedPartners = async () => {
      if (user.level === 1) {
        // Lv1은 모든 파트너 허용 (빈 배열 = 필터링 없음)
        setAllowedPartnerIds([]);
      } else {
        // 자신과 하위 파트너 조회
        const { data: childPartners } = await supabase
          .rpc('get_hierarchical_partners', { p_partner_id: user.id });
        
        const partnerIds = [user.id, ...(childPartners?.map((p: any) => p.id) || [])];
        setAllowedPartnerIds(partnerIds);
      }
    };

    loadAllowedPartners();
  }, [user.id, user.level]);

  // 실시간 통계 업데이트
  useEffect(() => {
    // Supabase Realtime으로 베팅 내역 모니터링
    const bettingChannel = supabase
      .channel('betting_alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_records'
        },
        async (payload) => {
          const record = payload.new as any;
          
          // ✅ 조직 관리 필터링: user_id로 해당 회원의 referrer_id 확인
          if (user.level !== 1 && allowedPartnerIds.length > 0) {
            const { data: userData } = await supabase
              .from('users')
              .select('referrer_id')
              .eq('id', record.user_id)
              .single();
            
            // 허용된 파트너에 속하지 않으면 무시
            if (!userData || !allowedPartnerIds.includes(userData.referrer_id)) {
              return;
            }
          }
          
          // 모든 베팅 알림
          setBettingAlerts(prev => ({
            ...prev,
            all_betting: prev.all_betting + 1
          }));

          // 대량 베팅 알림 (10만원 이상)
          if (record.bet_amount && parseFloat(record.bet_amount) >= 100000) {
            setBettingAlerts(prev => ({
              ...prev,
              large_betting: prev.large_betting + 1
            }));
            toast.warning(`대량 베팅 발생: ${formatCurrency(parseFloat(record.bet_amount))}`, {
              duration: 5000,
              action: {
                label: '확인',
                onClick: () => {
                  if (onRouteChange) {
                    onRouteChange('/admin/online-users');
                  }
                }
              }
            });
          }

          // 고액 당첨 알림 (50만원 이상)
          if (record.win_amount && parseFloat(record.win_amount) >= 500000) {
            setBettingAlerts(prev => ({
              ...prev,
              high_win: prev.high_win + 1
            }));
            toast.info(`고액 당첨 발생: ${formatCurrency(parseFloat(record.win_amount))}`, {
              duration: 5000,
              action: {
                label: '확인',
                onClick: () => {
                  if (onRouteChange) {
                    onRouteChange('/admin/online-users');
                  }
                }
              }
            });
          }

          // 의심 패턴 감지 (승률이 너무 높거나 연속 당첨)
          const winRate = record.win_amount && record.bet_amount 
            ? parseFloat(record.win_amount) / parseFloat(record.bet_amount) 
            : 0;
          
          if (winRate > 10) {
            setBettingAlerts(prev => ({
              ...prev,
              suspicious: prev.suspicious + 1
            }));
            toast.error(`의심 패턴 감지: 승률 ${(winRate * 100).toFixed(0)}%`, {
              duration: 5000,
              action: {
                label: '확인',
                onClick: () => {
                  if (onRouteChange) {
                    onRouteChange('/admin/online-users');
                  }
                }
              }
            });
          }
        }
      )
      .subscribe();



    return () => {
      supabase.removeChannel(bettingChannel);
    };
  }, [onRouteChange, user.level, allowedPartnerIds]);

  const handleLogout = () => {
    logout();
    toast.success("로그아웃되었습니다.");
  };

  const handleMessageClick = () => {
    if (onRouteChange) {
      onRouteChange('/admin/customer-service');
      toast.info('고객 지원 페이지로 이동합니다.');
    }
  };

  const handleDepositClick = () => {
    if (onRouteChange) {
      onRouteChange('/admin/transaction-approval');
      toast.info('입금 관리 페이지로 이동합니다.');
    }
  };

  const handleWithdrawalClick = () => {
    if (onRouteChange) {
      onRouteChange('/admin/transaction-approval');
      toast.info('출금 관리 페이지로 이동합니다.');
    }
  };

  // =====================================================
  // 관리자 입금/출금 신청
  // =====================================================
  const handleDepositRequest = async () => {
    if (!requestAmount || parseFloat(requestAmount.replace(/,/g, '')) <= 0) {
      toast.error('입금 금액을 입력해주세요.');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const amount = parseFloat(requestAmount.replace(/,/g, ''));

      // Lv2 본사 찾기 (자신이 속한 Lv2)
      let lv2PartnerId = user.id;
      if (user.level > 2) {
        // 상위로 올라가면서 Lv2 찾기
        let currentPartnerId = user.referrer_id;
        while (currentPartnerId) {
          const { data: parentPartner } = await supabase
            .from('partners')
            .select('id, level, referrer_id')
            .eq('id', currentPartnerId)
            .single();
          
          if (!parentPartner) break;
          
          if (parentPartner.level === 2) {
            lv2PartnerId = parentPartner.id;
            break;
          }
          
          currentPartnerId = parentPartner.referrer_id;
        }
      }

      // 트랜잭션 생성 (사용자 입출금과 동일한 transactions 테이블 사용)
      const { data: transaction, error } = await supabase
        .from('transactions')
        .insert({
          partner_id: user.id, // 관리자 입출금은 partner_id 사용
          transaction_type: 'partner_deposit',
          amount: amount,
          status: 'pending',
          balance_before: balance,
          balance_after: balance, // 승인 전까지는 동일
          created_at: new Date().toISOString(),
          memo: `[관리자 입금신청] ${user.nickname || user.username} → 본사`,
          from_partner_id: user.id,  // ✅ 보낸사람 (신청자)
          to_partner_id: lv2PartnerId // ✅ 받는사람 (본사/Lv2)
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      toast.success(`입금 신청이 완료되었습니다. (${formatCurrency(amount)})`);
      setShowDepositRequestModal(false);
      setRequestAmount('');
      
      // 알림 개수 갱신
      await loadNotificationCount();
    } catch (error: any) {
      console.error('❌ 입금 신청 실패:', error);
      toast.error(error.message || '입금 신청에 실패했습니다.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleWithdrawalRequest = async () => {
    if (!requestAmount || parseFloat(requestAmount.replace(/,/g, '')) <= 0) {
      toast.error('출금 금액을 입력해주세요.');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const amount = parseFloat(requestAmount.replace(/,/g, ''));

      // 보유 잔액 체크
      if (balance < amount) {
        toast.error('보유금이 부족합니다.');
        return;
      }

      // Lv2 본사 찾기 (자신이 속한 Lv2)
      let lv2PartnerId = user.id;
      if (user.level > 2) {
        // 상위로 올라가면서 Lv2 찾기
        let currentPartnerId = user.referrer_id;
        while (currentPartnerId) {
          const { data: parentPartner } = await supabase
            .from('partners')
            .select('id, level, referrer_id')
            .eq('id', currentPartnerId)
            .single();
          
          if (!parentPartner) break;
          
          if (parentPartner.level === 2) {
            lv2PartnerId = parentPartner.id;
            break;
          }
          
          currentPartnerId = parentPartner.referrer_id;
        }
      }

      // 트랜잭션 생성 (사용자 입출금과 동일한 transactions 테이블 사용)
      const { data: transaction, error } = await supabase
        .from('transactions')
        .insert({
          partner_id: user.id, // 관리자 입출금은 partner_id 사용
          transaction_type: 'partner_withdrawal',
          amount: amount,
          status: 'pending',
          balance_before: balance,
          balance_after: balance, // 승인 전까지는 동일
          created_at: new Date().toISOString(),
          memo: `[관리자 출금신청] ${user.nickname || user.username} → 본사`,
          from_partner_id: lv2PartnerId, // ✅ 보낸사람 (본사/Lv2)
          to_partner_id: user.id         // ✅ 받는사람 (신청자)
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      toast.success(`출금 신청이 완료되었습니다. (${formatCurrency(amount)})`);
      setShowWithdrawalRequestModal(false);
      setRequestAmount('');
      
      // 알림 개수 갱신
      await loadNotificationCount();
    } catch (error: any) {
      console.error('❌ 출금 신청 실패:', error);
      toast.error(error.message || '출금 신청에 실패했습니다.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // ✅ 금액 입력 시 3자리 콤마 포맷
  const handleAmountChange = (value: string) => {
    // 숫자와 콤마만 허용
    const numericValue = value.replace(/[^\d]/g, '');
    // 3자리마다 콤마 추가
    const formattedValue = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    setRequestAmount(formattedValue);
  };

  const handleApprovalClick = () => {
    if (onRouteChange) {
      onRouteChange('/admin/users');
      toast.info('가입 승인 관리 페이지로 이동합니다.');
    }
  };

  const handleBettingAlertClick = () => {
    if (onRouteChange) {
      onRouteChange('/admin/online-users');
      // 알림 카운트 초기화
      setBettingAlerts({
        all_betting: 0,
        large_betting: 0,
        high_win: 0,
        suspicious: 0,
      });
      toast.info('온라인 사용자 현황 페이지로 이동합니다.');
    }
  };

  // =====================================================
  // 비밀번호 변경 모달
  // =====================================================
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('모든 필드를 입력해주세요.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('새 비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setIsChangingPassword(true);
    try {
      // 현재 비밀번호 확인
      const { data: partnerData, error: fetchError } = await supabase
        .from('partners')
        .select('password')
        .eq('id', user.id)
        .single();

      if (fetchError || !partnerData) {
        throw new Error('사용자 정보를 불러올 수 없습니다.');
      }

      // 현재 비밀번호 검증
      if (partnerData.password !== passwordForm.currentPassword) {
        throw new Error('현재 비밀번호가 올바르지 않습니다.');
      }

      // 비밀번호 업데이트
      const { error: updateError } = await supabase
        .from('partners')
        .update({
          password: passwordForm.newPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        throw new Error('비밀번호 변경에 실패했습니다.');
      }

      toast.success('비밀번호가 성공적으로 변경되었습니다.');
      setShowPasswordModal(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      console.error('❌ 비밀번호 변경 실패:', error);
      toast.error(error.message || '비밀번호 변경에 실패했습니다.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // =====================================================
  // 커미션 정보 모달
  // =====================================================
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [commissionData, setCommissionData] = useState<any>(null);
  const [isLoadingCommission, setIsLoadingCommission] = useState(false);
  
  // ✅ 커미션 잔액 정보 추가 (실시간 로드)
  const [commissionBalances, setCommissionBalances] = useState({
    casino_rolling: 0,
    casino_losing: 0,
    slot_rolling: 0,
    slot_losing: 0
  });
  const [latestSettlements, setLatestSettlements] = useState<any[]>([]);
  
  // ✅ 커미션 요율 정보
  const [commissionRates, setCommissionRates] = useState({
    casino_rolling_rate: 0,
    casino_losing_rate: 0,
    slot_rolling_rate: 0,
    slot_losing_rate: 0
  });
  
  // ✅ 보유금 전환 모달
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<{
    settlementId: string;
    type: 'casino_rolling' | 'casino_losing' | 'slot_rolling' | 'slot_losing';
    amount: number;
  } | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // ✅ 입금/출금 신청 모달
  const [showDepositRequestModal, setShowDepositRequestModal] = useState(false);
  const [showWithdrawalRequestModal, setShowWithdrawalRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  const loadCommissionInfo = async () => {
    setIsLoadingCommission(true);
    try {
      const { data, error } = await supabase
        .from('partners')
        .select(`
          casino_rolling_commission,
          casino_losing_commission,
          slot_rolling_commission,
          slot_losing_commission
        `)
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setCommissionData(data);
      
      // ✅ 최신 정산 내역에서 전환 가능한 커미션 조회
      await loadLatestCommissions();
      
      setShowCommissionModal(true);
    } catch (error: any) {
      console.error('❌ 커미션 정보 로드 실패:', error);
      toast.error('커미션 정보를 불러올 수 없습니다.');
    } finally {
      setIsLoadingCommission(false);
    }
  };
  
  // ✅ 실시간 커미션 계산 + 과거 미전환 커미션 조회
  const loadLatestCommissions = async () => {
    try {
      console.log('💰 [실시간 커미션 조회] 시작 - partner_id:', user.id);
      
      // 1️⃣ 파트너의 현재 커미션 요율 조회
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('casino_rolling_commission, casino_losing_commission, slot_rolling_commission, slot_losing_commission')
        .eq('id', user.id)
        .single();
      
      if (partnerError || !partnerData) {
        console.error('❌ [커미션 조회] 파트너 정보 조회 실패:', partnerError);
        throw partnerError;
      }
      
      const commissionRates = {
        casino_rolling: partnerData.casino_rolling_commission || 0,
        casino_losing: partnerData.casino_losing_commission || 0,
        slot_rolling: partnerData.slot_rolling_commission || 0,
        slot_losing: partnerData.slot_losing_commission || 0
      };
      
      console.log('💰 [실시간 커미션] 파트너 요율:', commissionRates);
      
      // 2️⃣ 실시간 커미션 계산 (오늘 00:00부터 현재까지)
      const todayStart = getTodayStartUTC();
      const now = new Date().toISOString();
      
      console.log('💰 [실시간 커미션] 기간:', { todayStart, now });
      
      // 하위 사용자 ID 조회
      const descendantUserIds = await getDescendantUserIds(user.id);
      console.log('💰 [실시간 커미션] 하위 사용자 수:', descendantUserIds.length);
      
      let realtimeCommission = {
        casino_rolling: 0,
        casino_losing: 0,
        slot_rolling: 0,
        slot_losing: 0
      };
      
      if (descendantUserIds.length > 0) {
        // 베팅 통계 조회 (카지노/슬롯 구분)
        const stats = await getBettingStatsByGameType(descendantUserIds, todayStart, now, 'all');
        
        console.log('💰 [실시간 커미션] 베팅 통계:', stats);
        
        // 커미션 계산
        realtimeCommission = {
          casino_rolling: stats.casino.betAmount * (commissionRates.casino_rolling / 100),
          casino_losing: stats.casino.lossAmount * (commissionRates.casino_losing / 100),
          slot_rolling: stats.slot.betAmount * (commissionRates.slot_rolling / 100),
          slot_losing: stats.slot.lossAmount * (commissionRates.slot_losing / 100)
        };
        
        console.log('💰 [실시간 커미션] 계산 결과:', realtimeCommission);
      }
      
      // 3️⃣ 과거 정산 내역 조회 (오늘 이전)
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('partner_id', user.id)
        .lt('period_end', todayStart.split('T')[0]) // 오늘 이전의 정산만
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ [커미션 조회] settlements 조회 에러:', error);
        throw error;
      }
      
      console.log('🔥🔥🔥 [CRITICAL-DEBUG] 과거 정산 조회 완료:', {
        count: data?.length || 0,
        settlements: data?.map(s => ({
          id: s.id,
          period: `${s.period_start} ~ ${s.period_end}`,
          casino_rolling: s.casino_rolling_commission,
          casino_losing: s.casino_losing_commission,
          slot_rolling: s.slot_rolling_commission,
          slot_losing: s.slot_losing_commission
        }))
      });
      
      // 4️⃣ 과거 정산 중 전환되지 않은 커미션 합산
      let pastCommission = {
        casino_rolling: 0,
        casino_losing: 0,
        slot_rolling: 0,
        slot_losing: 0
      };
      
      let settlementsWithConversion: any[] = [];
      
      if (data && data.length > 0) {
        // 커미션 전환 기록 조회
        const settlementIds = data.map(s => s.id).filter(id => id != null); // null/undefined 제거
        
        let conversionLogs: any[] = [];
        
        if (settlementIds.length > 0) {
          const { data: logsData, error: conversionError } = await supabase
            .from('commission_conversion_logs')
            .select('settlement_id, commission_type')
            .in('settlement_id', settlementIds);
        
          if (conversionError) {
            console.error('❌ [커미션 조회] 전환 기록 조회 에러:', conversionError);
          } else {
            conversionLogs = logsData || [];
          }
        }
        
        console.log('🔥🔥🔥 [CRITICAL-DEBUG] 전환 기록 조회 결과:', {
          settlementIds,
          conversionLogs,
          logsCount: conversionLogs?.length || 0
        });
        
        // 전환 기록을 Map으로 변환
        const conversionMap = new Map<string, Set<string>>();
        conversionLogs?.forEach(log => {
          if (!conversionMap.has(log.settlement_id)) {
            conversionMap.set(log.settlement_id, new Set());
          }
          conversionMap.get(log.settlement_id)?.add(log.commission_type);
        });
        
        console.log('💰 [과거 정산] 전환 맵:', Array.from(conversionMap.entries()).map(([id, types]) => ({
          settlement_id: id,
          converted_types: Array.from(types)
        })));
        
        // 각 정산에 전환 상태 추가
        settlementsWithConversion = data.map(settlement => ({
          ...settlement,
          conversion_status: {
            casino_rolling: conversionMap.get(settlement.id)?.has('casino_rolling') || false,
            casino_losing: conversionMap.get(settlement.id)?.has('casino_losing') || false,
            slot_rolling: conversionMap.get(settlement.id)?.has('slot_rolling') || false,
            slot_losing: conversionMap.get(settlement.id)?.has('slot_losing') || false
          }
        }));
        
        console.log('💰 [과거 정산] 각 정산의 전환 상태:', settlementsWithConversion.map(s => ({
          id: s.id,
          period: s.period_start + ' ~ ' + s.period_end,
          casino_rolling: { amount: s.casino_rolling_commission, converted: s.conversion_status.casino_rolling },
          casino_losing: { amount: s.casino_losing_commission, converted: s.conversion_status.casino_losing },
          slot_rolling: { amount: s.slot_rolling_commission, converted: s.conversion_status.slot_rolling },
          slot_losing: { amount: s.slot_losing_commission, converted: s.conversion_status.slot_losing }
        })));
        
        // 전환되지 않은 커미션만 합산
        settlementsWithConversion.forEach(settlement => {
          if (!settlement.conversion_status.casino_rolling && (settlement.casino_rolling_commission || 0) > 0) {
            pastCommission.casino_rolling += parseFloat(settlement.casino_rolling_commission) || 0;
          }
          if (!settlement.conversion_status.casino_losing && (settlement.casino_losing_commission || 0) > 0) {
            pastCommission.casino_losing += parseFloat(settlement.casino_losing_commission) || 0;
          }
          if (!settlement.conversion_status.slot_rolling && (settlement.slot_rolling_commission || 0) > 0) {
            pastCommission.slot_rolling += parseFloat(settlement.slot_rolling_commission) || 0;
          }
          if (!settlement.conversion_status.slot_losing && (settlement.slot_losing_commission || 0) > 0) {
            pastCommission.slot_losing += parseFloat(settlement.slot_losing_commission) || 0;
          }
        });
        
        console.log('💰 [과거 정산] 미전환 커미션:', pastCommission);
      }
      
      setLatestSettlements(settlementsWithConversion);
      
      // 5️⃣ 실시간 커미션 + 과거 미전환 커미션 = 총 커미션
      const totalCommission = {
        casino_rolling: realtimeCommission.casino_rolling + pastCommission.casino_rolling,
        casino_losing: realtimeCommission.casino_losing + pastCommission.casino_losing,
        slot_rolling: realtimeCommission.slot_rolling + pastCommission.slot_rolling,
        slot_losing: realtimeCommission.slot_losing + pastCommission.slot_losing
      };
      
      console.log('💰 [총 커미션] 실시간 + 과거:', totalCommission);
      
      setCommissionBalances(totalCommission);
      
      // 6️⃣ 커미션 요율 설정 (partners 테이블의 현재 요율)
      setCommissionRates({
        casino_rolling_rate: commissionRates.casino_rolling,
        casino_losing_rate: commissionRates.casino_losing,
        slot_rolling_rate: commissionRates.slot_rolling,
        slot_losing_rate: commissionRates.slot_losing
      });
    } catch (error) {
      console.error('❌ 최신 커미션 조회 실패:', error);
      // ✅ 에러 발생 시에도 모두 0으로 설정
      setLatestSettlements([]);
      setCommissionBalances({
        casino_rolling: 0,
        casino_losing: 0,
        slot_rolling: 0,
        slot_losing: 0
      });
      setCommissionRates({
        casino_rolling_rate: 0,
        casino_losing_rate: 0,
        slot_rolling_rate: 0,
        slot_losing_rate: 0
      });
    }
  };
  
  // ✅ 커미션 클릭 핸들러
  const handleCommissionClick = (
    settlement: any,
    type: 'casino_rolling' | 'casino_losing' | 'slot_rolling' | 'slot_losing', 
    amount: number
  ) => {
    // ✅ conversion_status 확인 (별도 테이블 기반)
    const isConverted = settlement.conversion_status?.[type] || false;
    
    if (isConverted) {
      toast.info('이미 보유금으로 전환된 커미션입니다.\n전환이 완료된 커미션은 다시 전환할 수 없습니다.');
      return;
    }
    
    if (amount <= 0) {
      toast.error('전환할 수 있는 커미션이 없습니다.');
      return;
    }
    
    setSelectedCommission({ settlementId: settlement.id, type, amount });
    setShowConvertDialog(true);
  };
  
  // ✅ 커미션 -> 보유금 전환 (RPC 함수 사용)
  const handleConvertToBalance = async () => {
    if (!selectedCommission) return;

    try {
      setConvertingId(selectedCommission.settlementId);
      setShowConvertDialog(false);

      const commissionTypeText = {
        casino_rolling: '카지노 롤링 커미션',
        casino_losing: '카지노 루징 커미션',
        slot_rolling: '슬롯 롤링 커미션',
        slot_losing: '슬롯 루징 커미션'
      }[selectedCommission.type];

      console.log('💰 [커미션 전환] 시작:', {
        partner_id: user.id,
        settlement_id: selectedCommission.settlementId,
        type: selectedCommission.type,
        amount: selectedCommission.amount
      });

      // ✅ RPC 함수 호출
      const { data, error } = await supabase.rpc('convert_commission_to_balance', {
        p_partner_id: user.id,
        p_settlement_id: selectedCommission.settlementId,
        p_commission_type: selectedCommission.type,
        p_amount: selectedCommission.amount
      });

      if (error) {
        console.error('❌ [커미션 전환] RPC 에러:', error);
        
        // 에러 메시지 한글화
        let errorMessage = '보유금 전환에 실패했습니다.';
        if (error.message?.includes('Commission already converted')) {
          errorMessage = '이미 보유금으로 전환된 커미션입니다.\n전환이 완료된 커미션은 다시 전환할 수 없습니다.';
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        throw new Error(errorMessage);
      }

      console.log('✅ [커미션 전환] 성공:', data);
      toast.success(`${commissionTypeText} ${formatCurrency(selectedCommission.amount)}이(가) 보유금으로 전환되었습니다.\n전환된 금액은 즉시 사용 가능합니다.`);

      // ✅ 커미션 정보 새로고침
      await loadLatestCommissions();
      setSelectedCommission(null);
    } catch (error: any) {
      console.error('❌ 보유금 전환 실패:', error);
      toast.error(error.message || '보유금 전환에 실패했습니다.');
    } finally {
      setConvertingId(null);
    }
  };

  // Lv2 전용: 보유금 5% 경고 체크 (✅ 비활성화)
  const checkLv2Warning = (totalUsersBalance: number) => {
    // ✅ 경고 배너 비활성화
    setShowLv2Warning(false);
  };

  return (
    <>
      <div className="w-full border-b border-slate-800/50 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            {/* 왼쪽: 통계 카드 */}
            <div className="flex items-center gap-3">
              {/* 대본사(2): 총합만 표시 */}
              {user.level === 2 && (
                <div className={`px-3 py-1.5 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 transition-all min-w-[100px] ${balanceLoading ? 'animate-pulse' : ''}`}>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-6 w-6 text-green-400" />
                    <div>
                      <div className="text-lg text-green-300 font-medium">총 보유금</div>
                      <div className="text-lg font-bold text-white whitespace-nowrap">
                        {(() => {
                          let total = 0;
                          if (useInvestApi && typeof investBalance === 'number') total += investBalance;
                          if (useOroplayApi && typeof oroplayBalance === 'number') total += oroplayBalance;
                          if (useFamilyApi && typeof familyapiBalance === 'number') total += familyapiBalance;
                          if (useHonorApi && typeof honorapiBalance === 'number') total += honorapiBalance;
                          return <AnimatedCurrency value={total} duration={800} currencySymbol={t.common.currency} />;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 나머지 레벨(3~6): GMS 보유금 1개만 표시 */}
              {user.level >= 3 && (
                <div className={`px-3 py-1.5 rounded-lg bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 transition-all min-w-[100px] ${balanceLoading ? 'animate-pulse' : ''}`}>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-6 w-6 text-yellow-400" />
                    <div>
                      <div className="text-lg text-yellow-300 font-medium">{t.header.gmsBalance}</div>
                      <div className="text-lg font-bold text-white">
                        {balanceLoading ? '...' : <AnimatedCurrency value={balance || 0} duration={800} />}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 총 입금 */}
              <div className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 transition-all min-w-[100px]">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-6 w-6 text-cyan-400" />
                  <div>
                    <div className="text-lg text-cyan-300 font-medium">{t.header.totalDeposit}</div>
                    <div className="text-lg font-bold text-white">{formatCurrency(stats.daily_deposit)}</div>
                  </div>
                </div>
              </div>

              {/* 총 출금 */}
              <div className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30 transition-all min-w-[100px]">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-6 w-6 text-orange-400" />
                  <div>
                    <div className="text-lg text-orange-300 font-medium">{t.header.totalWithdrawal}</div>
                    <div className="text-lg font-bold text-white">{formatCurrency(stats.daily_withdrawal)}</div>
                  </div>
                </div>
              </div>

              {/* 총 회원 */}
              <div className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-slate-500/20 to-gray-500/20 border border-slate-500/30 transition-all min-w-[100px]">
                <div className="flex items-center gap-2">
                  <Users className="h-6 w-6 text-slate-400" />
                  <div>
                    <div className="text-lg text-slate-300 font-medium">{t.header.totalMembers}</div>
                    <div className="text-lg font-bold text-white">{formatNumber(totalUsers)}</div>
                  </div>
                </div>
              </div>

              {/* 온라인 */}
              <div className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 transition-all min-w-[100px]">
                <div className="flex items-center gap-2">
                  <Users className="h-6 w-6 text-emerald-400" />
                  <div>
                    <div className="text-lg text-emerald-300 font-medium">{t.header.online}</div>
                    <div className="text-lg font-bold text-white">{formatNumber(stats.online_users)}{t.onlineUsers.people}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 오른쪽: 4개 실시간 알림 + 종 아이콘 + 프로필 */}
            <div className="flex items-center gap-2">
              {/* 가입승인 */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className="relative px-3 py-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:scale-105 transition-all cursor-pointer min-w-[90px]"
                      onClick={() => onRouteChange?.('/admin/users')}
                    >
                      <div className="text-sm text-cyan-300 font-medium text-center mb-1">{t.header.signupApproval}</div>
                      <div className="text-2xl font-bold text-white text-center">{stats.pending_approvals}</div>
                      {stats.pending_approvals > 0 && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{t.header.signupApproval}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* 고객문의 */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className="relative px-3 py-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 hover:scale-105 transition-all cursor-pointer min-w-[90px]"
                      onClick={() => onRouteChange?.('/admin/customer-service')}
                    >
                      <div className="text-sm text-purple-300 font-medium text-center mb-1">{t.header.customerInquiry}</div>
                      <div className="text-2xl font-bold text-white text-center">{stats.pending_messages}</div>
                      {stats.pending_messages > 0 && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{t.header.customerInquiry}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* 입금요청 */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className="relative px-3 py-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 hover:scale-105 transition-all cursor-pointer min-w-[90px]"
                      onClick={() => onRouteChange?.('/admin/transactions#deposit-request')}
                    >
                      <div className="text-sm text-emerald-300 font-medium text-center mb-1">{t.dashboard.pendingDeposits}</div>
                      <div className="text-2xl font-bold text-white text-center">{stats.pending_deposits}</div>
                      {stats.pending_deposits > 0 && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{t.dashboard.pendingDeposits}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* 출금요청 */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className="relative px-3 py-2 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30 hover:scale-105 transition-all cursor-pointer min-w-[90px]"
                      onClick={() => onRouteChange?.('/admin/transactions#withdrawal-request')}
                    >
                      <div className="text-sm text-orange-300 font-medium text-center mb-1">{t.dashboard.pendingWithdrawals}</div>
                      <div className="text-2xl font-bold text-white text-center">{stats.pending_withdrawals}</div>
                      {stats.pending_withdrawals > 0 && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{t.dashboard.pendingWithdrawals}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="w-px h-8 bg-slate-700"></div>

              {/* User Notifications (사용자 페이지 알림) */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="relative h-9 w-9 p-0 hover:bg-slate-700"
                      onClick={() => setShowNotifications(true)}
                    >
                      <Bell className="h-5 w-5 text-slate-300" />
                      {notificationCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full text-[10px] bg-blue-600 hover:bg-blue-700 animate-pulse border-0">
                          {notificationCount > 99 ? '99+' : notificationCount}
                        </Badge>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>사용자 알림 ({notificationCount})</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="w-px h-8 bg-slate-700"></div>

              {/* 언어 전환 */}
              <LanguageSwitcher />

              {/* ✅ 사용자 프로필 Popover (클릭 시 표시) */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-full hover:bg-slate-700">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-500 text-white font-semibold text-sm">
                        {user.nickname.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[440px] bg-gradient-to-br from-slate-800/95 to-slate-900/95 border-2 border-purple-500/40 p-4 shadow-2xl shadow-purple-500/30">
                {/* 상단: 사용자 정보 + 로그아웃 */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-700">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14 ring-2 ring-purple-500/50">
                      <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-500 text-white font-bold text-xl">
                        {user.nickname.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-2xl font-bold text-white">{user.nickname}</p>
                      <p className="text-lg text-slate-400">{user.username}</p>
                    </div>
                  </div>
                  <Button 
                    onClick={handleLogout}
                    className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 h-12 px-6 text-lg font-semibold shadow-lg shadow-red-500/30"
                  >
                    <LogOut className="h-6 w-6 mr-2" />
                    로그아웃
                  </Button>
                </div>

                {/* 중단: 커미션 잔액 - Lv3 이상만 표시 */}
                {user.level > 2 && (
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-6 w-6 text-emerald-400" />
                      <h3 className="text-lg font-semibold text-slate-300">전환 가능 커미션</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadLatestCommissions}
                        className="h-7 px-2 text-xs hover:bg-slate-700"
                      >
                        새로고침
                      </Button>
                    </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {/* 카지노 롤링 */}
                    <div 
                      onClick={() => {
                        const settlement = latestSettlements.find(s => 
                          (s.casino_rolling_commission || 0) > 0 && 
                          !s.conversion_status?.casino_rolling
                        );
                        if (settlement) {
                          handleCommissionClick(settlement, 'casino_rolling', commissionBalances.casino_rolling);
                        } else {
                          toast.info('전환 가능한 카지노 롤링 커미션이 없습니다.');
                        }
                      }}
                      className={cn(
                        "p-2 rounded-lg border cursor-pointer transition-all",
                        commissionBalances.casino_rolling > 0 
                          ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 hover:scale-105" 
                          : "bg-slate-700/30 border-slate-600/30 opacity-50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-400">🎰 카지노 롤링</span>
                        <span className="text-xs text-slate-500">{commissionRates.casino_rolling_rate}%</span>
                      </div>
                      <div className="text-xl font-bold text-emerald-400">
                        ₩{commissionBalances.casino_rolling.toLocaleString()}
                      </div>
                    </div>

                    {/* 카지노 루징 */}
                    <div 
                      onClick={() => {
                        const settlement = latestSettlements.find(s => 
                          (s.casino_losing_commission || 0) > 0 && 
                          !s.conversion_status?.casino_losing
                        );
                        if (settlement) {
                          handleCommissionClick(settlement, 'casino_losing', commissionBalances.casino_losing);
                        } else {
                          toast.info('전환 가능한 카지노 루징 커미션이 없습니다.');
                        }
                      }}
                      className={cn(
                        "p-2 rounded-lg border cursor-pointer transition-all",
                        commissionBalances.casino_losing > 0 
                          ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 hover:scale-105" 
                          : "bg-slate-700/30 border-slate-600/30 opacity-50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-400">🎰 카지노 루징</span>
                        <span className="text-xs text-slate-500">{commissionRates.casino_losing_rate}%</span>
                      </div>
                      <div className="text-xl font-bold text-emerald-400">
                        ₩{commissionBalances.casino_losing.toLocaleString()}
                      </div>
                    </div>

                    {/* 슬롯 롤링 */}
                    <div 
                      onClick={() => {
                        const settlement = latestSettlements.find(s => 
                          (s.slot_rolling_commission || 0) > 0 && 
                          !s.conversion_status?.slot_rolling
                        );
                        if (settlement) {
                          handleCommissionClick(settlement, 'slot_rolling', commissionBalances.slot_rolling);
                        } else {
                          toast.info('전환 가능한 슬롯 롤링 커미션이 없습니다.');
                        }
                      }}
                      className={cn(
                        "p-2 rounded-lg border cursor-pointer transition-all",
                        commissionBalances.slot_rolling > 0 
                          ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 hover:scale-105" 
                          : "bg-slate-700/30 border-slate-600/30 opacity-50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-400">🎲 슬롯 롤링</span>
                        <span className="text-xs text-slate-500">{commissionRates.slot_rolling_rate}%</span>
                      </div>
                      <div className="text-xl font-bold text-emerald-400">
                        ₩{commissionBalances.slot_rolling.toLocaleString()}
                      </div>
                    </div>

                    {/* 슬롯 루징 */}
                    <div 
                      onClick={() => {
                        const settlement = latestSettlements.find(s => 
                          (s.slot_losing_commission || 0) > 0 && 
                          !s.conversion_status?.slot_losing
                        );
                        if (settlement) {
                          handleCommissionClick(settlement, 'slot_losing', commissionBalances.slot_losing);
                        } else {
                          toast.info('전환 가능한 슬롯 루징 커미션이 없습니다.');
                        }
                      }}
                      className={cn(
                        "p-2 rounded-lg border cursor-pointer transition-all",
                        commissionBalances.slot_losing > 0 
                          ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 hover:scale-105" 
                          : "bg-slate-700/30 border-slate-600/30 opacity-50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-400">🎲 슬롯 루징</span>
                        <span className="text-xs text-slate-500">{commissionRates.slot_losing_rate}%</span>
                      </div>
                      <div className="text-xl font-bold text-emerald-400">
                        ₩{commissionBalances.slot_losing.toLocaleString()}
                      </div>
                    </div>
                  </div>

                    <div className="text-xs text-slate-500 text-center mt-2">
                      💡 커미션을 클릭하면 보유금으로 전환됩니다
                    </div>
                  </div>
                )}

                {/* 보유머니 & 입금/출금 신청 - Lv3 이상만 표시 */}
                {user.level >= 3 && (
                  <div className="space-y-3 mb-3 pb-3 border-b border-slate-700">
                    {/* 보유머니 표시 */}
                    <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Wallet className="h-6 w-6 text-emerald-400" />
                          <h3 className="text-lg font-semibold text-slate-300">보유머니</h3>
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-emerald-400">
                        {formatCurrency(balance)}
                      </div>
                    </div>

                    {/* 입금/출금 신청 버튼 */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => setShowDepositRequestModal(true)}
                        className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 h-10 text-sm font-semibold shadow-lg shadow-blue-500/30"
                      >
                        <TrendingUp className="h-4 w-4 mr-1" />
                        입금신청
                      </Button>
                      <Button
                        onClick={() => setShowWithdrawalRequestModal(true)}
                        className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 h-10 text-sm font-semibold shadow-lg shadow-orange-500/30"
                      >
                        <TrendingDown className="h-4 w-4 mr-1" />
                        출금신청
                      </Button>
                    </div>
                  </div>
                )}

                {/* 하단: 비밀번호 변경 버튼 */}
                <Button
                  variant="outline"
                  onClick={() => setShowPasswordModal(true)}
                  className="w-full bg-slate-700/50 border-slate-600 hover:bg-slate-700 text-lg h-11"
                >
                  <Key className="h-5 w-5 mr-2" />
                  비밀번호 변경
                </Button>
              </PopoverContent>
            </Popover>
            </div>
          </div>
        </div>
      </div>

      {/* 알림 모달 - Portal로 body에 렌더링 */}
      <NotificationsModal 
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        onNotificationCountChange={setNotificationCount}
        currentPartnerId={user.id}
      />

      {/* 비밀번호 변경 모달 */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>비밀번호 변경</DialogTitle>
            <DialogDescription className="text-slate-400">
              관리자 계정의 비밀번호를 변경합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="text-slate-300">현재 비밀번호</Label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="현재 비밀번호를 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-slate-300">새 비밀번호</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="새 비밀번호를 입력하세요 (최소 6자)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">새 비밀번호 확인</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="새 비밀번호를 다시 입력하세요"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordModal(false)} className="bg-slate-700 border-slate-600 hover:bg-slate-600">
              취소
            </Button>
            <Button onClick={handlePasswordChange} disabled={isChangingPassword} className="bg-blue-600 hover:bg-blue-700">
              {isChangingPassword ? '변경 중...' : '변경하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 커미션 정보 모달 */}
      <Dialog open={showCommissionModal} onOpenChange={setShowCommissionModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>커미션 정보</DialogTitle>
            <DialogDescription className="text-slate-400">
              현재 설정된 커미션 비율을 확인합니다.
            </DialogDescription>
          </DialogHeader>
          {commissionData ? (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
                  <h4 className="text-sm font-medium text-cyan-400">카지노 롤링 커미션</h4>
                  <p className="text-2xl font-bold text-white">{commissionData.casino_rolling_commission}%</p>
                </div>
                <div className="space-y-2 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
                  <h4 className="text-sm font-medium text-orange-400">카지노 루징 커미션</h4>
                  <p className="text-2xl font-bold text-white">{commissionData.casino_losing_commission}%</p>
                </div>
                <div className="space-y-2 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
                  <h4 className="text-sm font-medium text-purple-400">슬롯 롤링 커미션</h4>
                  <p className="text-2xl font-bold text-white">{commissionData.slot_rolling_commission}%</p>
                </div>
                <div className="space-y-2 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
                  <h4 className="text-sm font-medium text-red-400">슬롯 루징 커미션</h4>
                  <p className="text-2xl font-bold text-white">{commissionData.slot_losing_commission}%</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400">
              커미션 정보를 불러오는 중...
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowCommissionModal(false)} className="bg-slate-700 border-slate-600 hover:bg-slate-600">
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ 보유금 전환 확인 모달 */}
      <CommissionConvertModal
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
        selectedCommission={selectedCommission}
        onConvert={handleConvertToBalance}
        converting={!!convertingId}
      />

      {/* ✅ 입금 신청 모달 */}
      <Dialog open={showDepositRequestModal} onOpenChange={setShowDepositRequestModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>입금 신청</DialogTitle>
            <DialogDescription className="text-slate-400">
              상위 관리자에게 입금을 요청합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="depositAmount" className="text-slate-300">입금 금액</Label>
              <Input
                id="depositAmount"
                type="text"
                value={requestAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="입금할 금액을 입력하세요"
              />
            </div>
            <div className="text-sm text-slate-400 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              💡 입금 신청 후 상위 관리자가 승인하면 보유머니에 반영됩니다.
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDepositRequestModal(false);
                setRequestAmount('');
              }} 
              className="bg-slate-700 border-slate-600 hover:bg-slate-600"
            >
              취소
            </Button>
            <Button 
              onClick={handleDepositRequest} 
              disabled={isSubmittingRequest}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmittingRequest ? '신청 중...' : '입금 신청'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ 출금 신청 모달 */}
      <Dialog open={showWithdrawalRequestModal} onOpenChange={setShowWithdrawalRequestModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>출금 신청</DialogTitle>
            <DialogDescription className="text-slate-400">
              상위 관리자에게 출금을 요청합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="withdrawalAmount" className="text-slate-300">출금 금액</Label>
              <Input
                id="withdrawalAmount"
                type="text"
                value={requestAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="출금할 금액을 입력하세요"
              />
            </div>
            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">현재 보유머니:</span>
                <span className="text-white font-semibold">{formatCurrency(balance)}</span>
              </div>
            </div>
            <div className="text-sm text-slate-400 bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              💡 출금 신청 후 상위 관리자가 승인하면 보유머니에서 차감됩니다.
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowWithdrawalRequestModal(false);
                setRequestAmount('');
              }} 
              className="bg-slate-700 border-slate-600 hover:bg-slate-600"
            >
              취소
            </Button>
            <Button 
              onClick={handleWithdrawalRequest} 
              disabled={isSubmittingRequest}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isSubmittingRequest ? '신청 중...' : '출금 신청'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
