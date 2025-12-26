import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { 
  LogOut, Bell,
  TrendingUp, TrendingDown, Users, Wallet, AlertTriangle
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
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
import { formatCurrency, formatNumber } from "../../lib/utils";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../lib/supabase";
import { AnimatedCurrency } from "../common/AnimatedNumber";
// import { getInfo } from "../../lib/investApi"; // ❌ 사용 중지
import { getAgentBalance, getOroPlayToken } from "../../lib/oroplayApi";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { getInvestCredentials, updateInvestBalance, updateOroplayBalance } from "../../lib/apiConfigHelper";
import { getTodayStartUTC, getCachedTimezoneOffset, convertUTCToSystemTime } from "../../utils/timezone";
import { NotificationsModal } from "./NotificationsModal";

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
      const { getUnreadNotificationCount } = await import('../../lib/notificationHelper');
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

      // Dynamic import
      const investApiModule = await import('../../lib/investApi');
      const { checkApiActiveByPartnerId } = await import('../../lib/apiStatusChecker');
      
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
          .single();
        
        if (!lv1Partner) {
          throw new Error('Lv1 파트너를 찾을 수 없습니다');
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

      // ✅ BalanceContext 상태 갱신
      await syncBalance();

      toast.success(`Invest 보유금 동기화 완료: ${formatCurrency(balance)}`);
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
          .single();
        
        if (!lv1Partner) {
          throw new Error('Lv1 파트너를 찾을 수 없습니다');
        }
        partnerId = lv1Partner.id;
      }

      // ✅ OroPlay API 활성화 체크
      const { checkApiActiveByPartnerId } = await import('../../lib/apiStatusChecker');
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

      // ✅ BalanceContext 상태 갱신
      await syncBalance();

      toast.success(`OroPlay 보유금 동기화 완료: ${formatCurrency(balance)}`);
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
      const { checkApiActiveByPartnerId } = await import('../../lib/apiStatusChecker');
      const isFamilyApiActive = await checkApiActiveByPartnerId(user.id, 'familyapi');
      if (!isFamilyApiActive) {
        toast.info('FamilyAPI가 비활성화되어 있습니다.');
        return;
      }

      // Dynamic import
      const familyApiModule = await import('../../lib/familyApi');
      
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

      // ✅ BalanceContext 상태 갱신
      await syncBalance();

      toast.success(`FamilyAPI 보유금 동기화 완료: ${formatCurrency(balance)}`);
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
      const { checkApiActiveByPartnerId } = await import('../../lib/apiStatusChecker');
      const isHonorApiActive = await checkApiActiveByPartnerId(partnerId, 'honorapi');
      if (!isHonorApiActive) {
        toast.info('HonorAPI가 비활성화되어 있습니다.');
        return;
      }

      // Dynamic import
      const honorApiModule = await import('../../lib/honorApi');
      const { getLv1HonorApiCredentials, updateHonorApiBalance } = await import('../../lib/apiConfigHelper');
      
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

      // ✅ BalanceContext 상태 갱신
      await syncBalance();

      toast.success(`HonorAPI 보유금 동기화 완료: ${formatCurrency(balance)}`);
    } catch (error: any) {
      console.error('❌ [AdminHeader] HonorAPI 보유금 동기화 실패:', error);
      toast.error(`HonorAPI 보유금 동기화 실패: ${error.message}`);
    } finally {
      setIsSyncingHonor(false);
    }
  };

  // ✅ 실제 데이터 로드 (사용자 + 관리자 입출금 포함) - 계층 구조 필터링
  useEffect(() => {
    const fetchHeaderStats = async () => {
      try {
        // 시스템 타임존 기준 오늘 0시
        const todayStartISO = getTodayStartUTC();
        
        // 🔍 Hierarchical filtering: self + child partners' users
        let allowedUserIds: string[] = [];
        
        if (user.level === 1) {
          // System admin: all users
          const { data: allUsers } = await supabase
            .from('users')
            .select('id');
          allowedUserIds = allUsers?.map(u => u.id) || [];
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
          
          // Get users with these partners as referrer_id
          const { data: partnerUsers, error: usersError } = await supabase
            .from('users')
            .select('id, username, referrer_id')
            .in('referrer_id', partnerIds);
          
          if (usersError) {
            console.error('❌ Partner users fetch failed:', usersError);
          }
          
          allowedUserIds = partnerUsers?.map(u => u.id) || [];
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

        // 1️⃣ 입금 합계 (deposit + admin_deposit) - 소속 사용자만
        const { data: depositData, error: depositError } = await supabase
          .from('transactions')
          .select('amount')
          .in('transaction_type', ['deposit', 'admin_deposit'])
          .eq('status', 'completed')
          .gte('created_at', todayStartISO)
          .in('user_id', allowedUserIds);

        if (depositError) {
          console.error('❌ 입금 조회 실패:', depositError);
        }

        const dailyDeposit = depositData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

        // 2️⃣ 출금 합계 (withdrawal + admin_withdrawal) - 소속 사용자만
        const { data: withdrawalData, error: withdrawalError } = await supabase
          .from('transactions')
          .select('amount')
          .in('transaction_type', ['withdrawal', 'admin_withdrawal'])
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

        // 🔔 7️⃣ 입금요청 대기 수 - 소속 사용자만
        const { count: pendingDepositsCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('transaction_type', 'deposit')
          .eq('status', 'pending')
          .in('user_id', allowedUserIds);

        // 🔔 8️⃣ 출금요청 대기 수 - 소속 사용자만
        const { count: pendingWithdrawalsCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('transaction_type', 'withdrawal')
          .eq('status', 'pending')
          .in('user_id', allowedUserIds);

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
        (payload) => {
          console.log('💰 [헤더 알림] transactions 변경 감지:', payload.eventType);
          fetchHeaderStats(); // 즉시 갱신
          
          // 새 입금/출금 요청 시 토스트 알림
          if (payload.eventType === 'INSERT' && payload.new) {
            const transaction = payload.new as any;
            
            if (transaction.status === 'pending') {
              if (transaction.transaction_type === 'deposit') {
                toast.info('새로운 입금 요청이 있습니.', {
                  description: `금액: ${formatCurrency(Number(transaction.amount))} | 회원: ${transaction.user_id}\n클릭하면 사라집니다.`,
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
                  description: `금액: ${formatCurrency(Number(transaction.amount))} | 회원: ${transaction.user_id}\n클릭하면 사라집니다.`,
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
          table: 'notifications'
        },
        (payload) => {
          console.log('🔔 [헤더 알림] notifications 변경 감지:', payload.eventType);
          loadNotificationCount(); // 알림 개수 갱신
        }
      )
      .subscribe();

    // 초기 알림 개수 로드
    loadNotificationCount();

    return () => {
      console.log('🔕 헤더 Realtime 구독 해제');
      clearTimeout(midnightTimer);
      supabase.removeChannel(transactionChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(gameSessionsChannel);
      supabase.removeChannel(notificationsChannel);
    };
  }, [user.id]);

  // 베팅 알림 상태
  const [bettingAlerts, setBettingAlerts] = useState({
    all_betting: 0,
    large_betting: 0,
    high_win: 0,
    suspicious: 0,
  });

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
        (payload) => {
          const record = payload.new as any;
          
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
  }, [onRouteChange]);

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
      onRouteChange('/admin/transactions#deposit-request');
      toast.info('입금 관리 페이지로 이동합니다.');
    }
  };

  const handleWithdrawalClick = () => {
    if (onRouteChange) {
      onRouteChange('/admin/transactions#withdrawal-request');
      toast.info('출금 관리 페이지로 이동합니다.');
    }
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
              {/* 시스템관리자(1): Invest/Oro/Family 각각 표시 */}
              {user.level === 1 && (
                <>
                  {/* Invest 보유금 - useInvestApi가 true일 때만 표시 */}
                  {useInvestApi && (
                    <div 
                      className={`px-3 py-1.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 transition-all min-w-[100px] cursor-pointer hover:scale-105 ${balanceLoading ? 'animate-pulse' : ''} ${isSyncingInvest ? 'opacity-50' : ''}`}
                      onClick={handleSyncInvestBalance}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-6 w-6 text-blue-400" />
                        <div>
                          <div className="text-lg text-blue-300 font-medium">Invest</div>
                          <div className="text-lg font-bold text-white whitespace-nowrap">
                            {typeof investBalance === 'number' ? <AnimatedCurrency value={investBalance} duration={800} currencySymbol={t.common.currency} /> : `${t.common.currency}0`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* OroPlay 보유금 - useOroplayApi가 true일 때만 표시 */}
                  {useOroplayApi && (
                    <div 
                      className={`px-3 py-1.5 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 transition-all min-w-[100px] cursor-pointer hover:scale-105 ${balanceLoading ? 'animate-pulse' : ''} ${isSyncingOroplay ? 'opacity-50' : ''}`}
                      onClick={handleSyncOroplayBalance}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-6 w-6 text-green-400" />
                        <div>
                          <div className="text-lg text-green-300 font-medium">GMS 보유금</div>
                          <div className="text-lg font-bold text-white whitespace-nowrap">
                            {typeof oroplayBalance === 'number' ? <AnimatedCurrency value={oroplayBalance} duration={800} currencySymbol={t.common.currency} /> : `${t.common.currency}0`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* FamilyAPI 보유금 - useFamilyApi가 true일 때만 표시 */}
                  {useFamilyApi && (
                    <div 
                      className={`px-3 py-1.5 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 transition-all min-w-[100px] cursor-pointer hover:scale-105 ${balanceLoading ? 'animate-pulse' : ''} ${isSyncingFamily ? 'opacity-50' : ''}`}
                      onClick={handleSyncFamilyBalance}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-6 w-6 text-purple-400" />
                        <div>
                          <div className="text-lg text-purple-300 font-medium">Family 보유금</div>
                          <div className="text-lg font-bold text-white whitespace-nowrap">
                            {typeof familyapiBalance === 'number' ? <AnimatedCurrency value={familyapiBalance} duration={800} currencySymbol={t.common.currency} /> : `${t.common.currency}0`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* HonorAPI 보유금 - useHonorApi가 true일 때만 표시 */}
                  {useHonorApi && (
                    <div 
                      className={`px-3 py-1.5 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 transition-all min-w-[100px] cursor-pointer hover:scale-105 ${balanceLoading ? 'animate-pulse' : ''} ${isSyncingHonor ? 'opacity-50' : ''}`}
                      onClick={handleSyncHonorBalance}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-6 w-6 text-amber-400" />
                        <div>
                          <div className="text-lg text-amber-300 font-medium">Honor 보유금</div>
                          <div className="text-lg font-bold text-white whitespace-nowrap">
                            {typeof honorapiBalance === 'number' ? <AnimatedCurrency value={honorapiBalance} duration={800} currencySymbol={t.common.currency} /> : `${t.common.currency}0`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

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
                      className="px-2 py-1.5 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:scale-105 transition-all cursor-pointer min-w-[80px]"
                      onClick={() => onRouteChange?.('/admin/users')}
                    >
                      <div className="text-lg text-cyan-300 font-medium text-center">{t.header.signupApproval}</div>
                      <div className="text-lg font-bold text-white text-center">{stats.pending_approvals}</div>
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
                      className="px-2 py-1.5 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 hover:scale-105 transition-all cursor-pointer min-w-[80px]"
                      onClick={() => onRouteChange?.('/admin/customer-service')}
                    >
                      <div className="text-lg text-purple-300 font-medium text-center">{t.header.customerInquiry}</div>
                      <div className="text-lg font-bold text-white text-center">{stats.pending_messages}</div>
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
                      className="px-2 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 hover:scale-105 transition-all cursor-pointer min-w-[80px]"
                      onClick={() => onRouteChange?.('/admin/transactions#deposit-request')}
                    >
                      <div className="text-lg text-emerald-300 font-medium text-center">{t.dashboard.pendingDeposits}</div>
                      <div className="text-lg font-bold text-white text-center">{stats.pending_deposits}</div>
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
                      className="px-2 py-1.5 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30 hover:scale-105 transition-all cursor-pointer min-w-[80px]"
                      onClick={() => onRouteChange?.('/admin/transactions#withdrawal-request')}
                    >
                      <div className="text-lg text-orange-300 font-medium text-center">{t.dashboard.pendingWithdrawals}</div>
                      <div className="text-lg font-bold text-white text-center">{stats.pending_withdrawals}</div>
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

              {/* 사용자 메뉴 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-full hover:bg-slate-700">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-500 text-white font-semibold text-sm">
                        {user.nickname.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-slate-800 border-slate-700">
                  <div className="px-2 py-2 border-b border-slate-700">
                    <p className="text-xl font-semibold text-slate-100">{user.nickname}</p>
                    <p className="text-base text-slate-400">{user.username}</p>
                    <p className="text-base text-slate-500 mt-0.5">관리자 계정</p>
                  </div>
                  <DropdownMenuItem onClick={handleLogout} className="text-rose-400 cursor-pointer hover:bg-slate-700">
                    <LogOut className="h-4 w-4 mr-2" />
                    로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
    </>
  );
}