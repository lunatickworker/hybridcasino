import { useState, useEffect } from "react";
import { Badge } from "../ui/badge";
import { MetricCard } from "./MetricCard";
import { PremiumSectionCard, SectionRow } from "./PremiumSectionCard";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { useBalance } from "../../contexts/BalanceContext";
import { getAgentBalance, getOroPlayToken, createOroPlayToken } from "../../lib/oroplayApi";
import { checkApiActiveByPartnerId } from '../../lib/apiStatusChecker';
import * as familyApiModule from '../../lib/familyApi';
import * as honorApiModule from '../../lib/honorApi';
import { getLv1HonorApiCredentials } from "../../lib/apiConfigHelper";
import { 
  Users, Wallet, TrendingUp, TrendingDown,
  Activity, DollarSign, AlertCircle, Clock, Shield,
  Target, Zap, BarChart3, MessageSquare, FlaskConical,
  RefreshCw
} from "lucide-react";
import { formatCurrency as formatCurrencyUtil, formatNumber, getPartnerLevelText } from "../../lib/utils";
import { DashboardStats, Partner } from "../../types";
import { calculatePendingDeposits } from "../../lib/settlementCalculator";
import { useLanguage } from "../../contexts/LanguageContext"; // v2.0 - Updated with fallback support
import { getCurrentTimeFormatted } from "../../lib/timezoneHelper";
import { gameApi } from "../../lib/gameApi";

interface DashboardProps {
  user: Partner;
}

export function Dashboard({ user }: DashboardProps) {
  // ✅ 전역 balance 사용 (AdminHeader와 동일한 상태 공유)
  const { balance, investBalance, oroplayBalance, familyapiBalance, honorapiBalance } = useBalance();
  const { t, formatCurrency } = useLanguage();
  
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
  
  // 직속 회원 통계
  const [directStats, setDirectStats] = useState({
    deposit: 0,
    withdrawal: 0,
    netDeposit: 0,
    casinoBetting: 0,
    slotBetting: 0,
    totalBetting: 0,
    betAmount: 0, // 게임 베팅액
    winAmount: 0, // 게임 당첨액
    gameProfit: 0 // 게임 손익 (베팅 - 당첨)
  });
  
  // 하위 파트너 회원 통계
  const [subPartnerStats, setSubPartnerStats] = useState({
    deposit: 0,
    withdrawal: 0,
    netDeposit: 0,
    casinoBetting: 0,
    slotBetting: 0,
    totalBetting: 0,
    betAmount: 0, // 게임 베팅액
    winAmount: 0, // 게임 당첨액
    gameProfit: 0 // 게임 손익 (베팅 - 당첨)
  });
  const [pendingDeposits, setPendingDeposits] = useState(0); // 만충금 (pending deposits)
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [formattedTime, setFormattedTime] = useState<string>('');
  const [isSyncingInvest, setIsSyncingInvest] = useState(false);
  const [isSyncingOroplay, setIsSyncingOroplay] = useState(false);
  const [isSyncingFamily, setIsSyncingFamily] = useState(false);
  const [isSyncingHonor, setIsSyncingHonor] = useState(false);

  // 특정 Lv2 파트너별 보유금 상태
  const [lv2Partners, setLv2Partners] = useState<{
    id: string;
    nickname: string;
    selected_apis: string[] | null;
    invest_balance: number;
    oroplay_balance: number;
    familyapi_balance: number;
    honorapi_balance: number;
  }[]>([]);
  const [isLoadingLv2Partners, setIsLoadingLv2Partners] = useState(false);
  const [syncingPartnerId, setSyncingPartnerId] = useState<string | null>(null);

  // 게임 동기화 결과 추적
  const [lastSyncResults, setLastSyncResults] = useState<{
    invest?: { time: string; newGames: number; updatedGames: number };
    oroplay?: { time: string; newGames: number; updatedGames: number };
    familyapi?: { time: string; newGames: number; updatedGames: number };
    honorapi?: { time: string; newProviders: number; newGames: number };
  }>({});

  // 게임 동기화 결과 로드
  const loadSyncResults = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['last_sync_invest', 'last_sync_oroplay', 'last_sync_familyapi', 'last_sync_honorapi']);

      if (error) throw error;

      const results: any = {};
      data?.forEach(item => {
        try {
          const value = JSON.parse(item.setting_value);
          const key = item.setting_key.replace('last_sync_', '');
          results[key] = value;
        } catch {
          // JSON 파싱 실패 시 무시
        }
      });

      setLastSyncResults(results);
    } catch (error) {
      console.error('동기화 결과 로드 실패:', error);
    }
  };

  // =====================================================
  // Lv2 파트너별 보유금 동기화
  // =====================================================
  const syncLv2PartnerBalance = async (partnerId: string, apiProvider: string) => {
    setSyncingPartnerId(`${partnerId}-${apiProvider}`);
    try {
      console.log(`💰 [Dashboard] Lv2 파트너 ${partnerId} - ${apiProvider} 동기화 시작`);

      if (apiProvider === 'familyapi') {
        // FamilyAPI 동기화
        const config = await familyApiModule.getFamilyApiConfig(partnerId);
        let token = await familyApiModule.getFamilyApiToken(partnerId);
        
        let balanceData;
        try {
          balanceData = await familyApiModule.getAgentBalance(config.apiKey, token);
        } catch (error: any) {
          console.warn('⚠️ 토큰 오류 감지, 새 토큰으로 재시도:', error.message);
          token = await familyApiModule.getFamilyApiToken(partnerId, true);
          balanceData = await familyApiModule.getAgentBalance(config.apiKey, token);
        }
        
        const balance = balanceData.credit || 0;

        const { error: updateError } = await supabase
          .from('api_configs')
          .update({ balance, updated_at: new Date().toISOString() })
          .eq('partner_id', partnerId)
          .eq('api_provider', 'familyapi');

        if (updateError) throw new Error(updateError.message);
        
        // 상태 업데이트
        setLv2Partners(prev => prev.map(p => 
          p.id === partnerId ? { ...p, familyapi_balance: balance } : p
        ));
        
        toast.success(`${partnerId.slice(0, 8)}... FamilyAPI: ${formatCurrency(balance)}`);
      }
      else if (apiProvider === 'honorapi') {
        // HonorAPI 동기화
        const credentials = await getLv1HonorApiCredentials(partnerId);
        if (!credentials.api_key) throw new Error('HonorAPI API Key가 설정되지 않았습니다.');
        
        const agentInfo = await honorApiModule.getAgentInfo(credentials.api_key);
        const balance = parseFloat(agentInfo.balance) || 0;

        const { error: updateError } = await supabase
          .from('api_configs')
          .update({ balance, updated_at: new Date().toISOString() })
          .eq('partner_id', partnerId)
          .eq('api_provider', 'honorapi');

        if (updateError) throw new Error(updateError.message);
        
        setLv2Partners(prev => prev.map(p => 
          p.id === partnerId ? { ...p, honorapi_balance: balance } : p
        ));
        
        toast.success(`${partnerId.slice(0, 8)}... HonorAPI: ${formatCurrency(balance)}`);
      }
      else if (apiProvider === 'oroplay') {
        // OroPlay 동기화
        const { data: config, error: configError } = await supabase
          .from('api_configs')
          .select('token, token_expires_at, client_id, client_secret')
          .eq('partner_id', partnerId)
          .eq('api_provider', 'oroplay')
          .maybeSingle();

        if (configError || !config) throw new Error('OroPlay API 설정이 없습니다.');
        if (!config.client_id || !config.client_secret) throw new Error('credentials 미설정');

        let token = config.token || '';
        const isTokenExpired = !config.token_expires_at || 
          new Date(config.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000;

        if (isTokenExpired || !config.token) {
          const tokenData = await createOroPlayToken(config.client_id, config.client_secret);
          token = tokenData.token;
          await supabase
            .from('api_configs')
            .update({ 
              token: tokenData.token, 
              token_expires_at: new Date(tokenData.expiration * 1000).toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('partner_id', partnerId)
            .eq('api_provider', 'oroplay');
        }

        const balance = await getAgentBalance(token);

        const { error: updateError } = await supabase
          .from('api_configs')
          .update({ balance, updated_at: new Date().toISOString() })
          .eq('partner_id', partnerId)
          .eq('api_provider', 'oroplay');

        if (updateError) throw new Error(updateError.message);
        
        setLv2Partners(prev => prev.map(p => 
          p.id === partnerId ? { ...p, oroplay_balance: balance } : p
        ));
        
        toast.success(`${partnerId.slice(0, 8)}... oroplay: ${formatCurrency(balance)}`);
      }

      // 데이터 다시 로드
      loadLv2Partners();
    } catch (error: any) {
      console.error(`❌ [Dashboard] 동기화 실패:`, error);
      toast.error(`동기화 실패: ${error.message}`);
    } finally {
      setSyncingPartnerId(null);
    }
  };

  // 특정 Lv2 파트너 ID 목록 (하드코딩)
  const TARGET_LV2_PARTNER_IDS = [
    '82781e5f-7982-496b-a036-be9277454626',
    'ad6eef4d-200e-4aa6-b8b2-cf6ba3337355'
  ];

  // ✅ Lv2 파트너 데이터 로드
  const loadLv2Partners = async () => {
    setIsLoadingLv2Partners(true);
    try {
      // 1. 파트너基本信息 조회
      const { data: partnersData, error: partnersError } = await supabase
        .from('partners')
        .select('id, nickname, selected_apis')
        .in('id', TARGET_LV2_PARTNER_IDS);

      if (partnersError) {
        throw new Error(`파트너 조회 실패: ${partnersError.message}`);
      }

      if (!partnersData || partnersData.length === 0) {
        setLv2Partners([]);
        setIsLoadingLv2Partners(false);
        return;
      }

      // 2. 각 파트너의 api_configs에서 보유금 조회
      const partnersWithBalances = await Promise.all(
        partnersData.map(async (partner) => {
          const { data: apiConfigs } = await supabase
            .from('api_configs')
            .select('api_provider, balance')
            .eq('partner_id', partner.id);

          const configMap = apiConfigs?.reduce((acc, config) => {
            acc[config.api_provider] = config.balance;
            return acc;
          }, {} as Record<string, number>) || {};

          return {
            id: partner.id,
            nickname: partner.nickname,
            selected_apis: partner.selected_apis,
            invest_balance: configMap['invest'] || 0,
            oroplay_balance: configMap['oroplay'] || 0,
            familyapi_balance: configMap['familyapi'] || 0,
            honorapi_balance: configMap['honorapi'] || 0,
          };
        })
      );

      setLv2Partners(partnersWithBalances);
      console.log('✅ [Dashboard] Lv2 파트너 데이터 로드 완료:', partnersWithBalances);
    } catch (error: any) {
      console.error('❌ [Dashboard] Lv2 파트너 로드 실패:', error);
      toast.error(`Lv2 파트너 데이터 로드 실패: ${error.message}`);
    } finally {
      setIsLoadingLv2Partners(false);
    }
  };

  // 컴포넌트 마운트 시 Lv2 파트너 데이터 로드
  useEffect(() => {
    if (user.level === 1) {
      loadLv2Partners();
      loadSyncResults();
    }
  }, [user.level]);

  // ✅ balance가 변경되면 stats 업데이트
  useEffect(() => {
    setStats(prev => ({ ...prev, total_balance: balance }));
  }, [balance]);

  // =====================================================
  // Invest 보유금 수동 동기화 (카드 클릭 시) - ❌ 비활성화
  // =====================================================
  const handleSyncInvestBalance = async () => {
    // ❌ getInfo API 사용 중지로 인해 비활성화
    console.log('⚠️ Invest 수동 동기화 기능은 현재 비활성화되어 있습니다.');
    toast.info('Invest API는 현재 비활성화되어 있습니다.');
    return;
  };

  // =====================================================
  // FamilyAPI 보유금 수동 동기화 (카드 클릭 시)
  // =====================================================
  const handleSyncFamilyBalance = async () => {
    if (user.level !== 1) {
      toast.error('API 잔고를 조회할 수 있는 권한이 없습니다.');
      return;
    }

    setIsSyncingFamily(true);
    try {
      console.log('💰 [Dashboard] FamilyAPI 보유금 수동 동기화 시작');

      // API Key와 Token 조회
      const config = await familyApiModule.getFamilyApiConfig();
      let token = await familyApiModule.getFamilyApiToken(config.partnerId);
      
      // Agent 잔고 조회 (실패 시 토큰 재발급 후 재시도)
      let balanceData;
      try {
        balanceData = await familyApiModule.getAgentBalance(config.apiKey, token);
      } catch (error: any) {
        console.warn('⚠️ 토큰 오류 감지, 새 토큰으로 재시도:', error.message);
        token = await familyApiModule.getFamilyApiToken(config.partnerId, true);
        balanceData = await familyApiModule.getAgentBalance(config.apiKey, token);
      }
      
      const balance = balanceData.credit || 0;

      console.log('✅ [Dashboard] FamilyAPI API 응답:', { balance });

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
        throw new Error(`DB 업데이트 실패: ${updateError.message}`);
      }

      toast.success(`FamilyAPI 보유금 동기화 완료: ${formatCurrency(balance)}`);
    } catch (error: any) {
      console.error('❌ [Dashboard] FamilyAPI 보유금 동기화 실패:', error);
      toast.error(`FamilyAPI 보유금 동기화 실패: ${error.message}`);
    } finally {
      setIsSyncingFamily(false);
    }
  };

  // =====================================================
  // HonorAPI 보유금 수동 동기화 (카드 클릭 시)
  // =====================================================
  const handleSyncHonorBalance = async () => {
    if (user.level !== 1) {
      toast.error('API 잔고를 조회할 수 있는 권한이 없습니다.');
      return;
    }

    setIsSyncingHonor(true);
    try {
      console.log('💰 [Dashboard] HonorAPI 보유금 수동 동기화 시작');

      // API Key 조회
      const credentials = await getLv1HonorApiCredentials(user.id);
      
      if (!credentials.api_key) {
        throw new Error('HonorAPI API Key가 설정되지 않았습니다.');
      }
      
      // Agent 정보 조회 (잔고 포함)
      const agentInfo = await honorApiModule.getAgentInfo(credentials.api_key);
      
      const balance = parseFloat(agentInfo.balance) || 0;

      console.log('✅ [Dashboard] HonorAPI API 응답:', { balance });

      // DB 업데이트
      const { error: updateError } = await supabase
        .from('api_configs')
        .update({
          balance: balance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', user.id)
        .eq('api_provider', 'honorapi');

      if (updateError) {
        throw new Error(`DB 업데이트 실패: ${updateError.message}`);
      }

      toast.success(`HonorAPI 보유금 동기화 완료: ${formatCurrency(balance)}`);
    } catch (error: any) {
      console.error('❌ [Dashboard] HonorAPI 보유금 동기화 실패:', error);
      toast.error(`HonorAPI 보유금 동기화 실패: ${error.message}`);
    } finally {
      setIsSyncingHonor(false);
    }
  };

  // =====================================================
  // OroPlay 보유금 수동 동기화 (카드 클릭 시)
  // =====================================================
  const handleSyncOroplayBalance = async () => {
    if (user.level !== 1 && user.level !== 2) {  // ✅ Lv2 추가
      toast.error('API 잔고를 조회할 수 있는 권한이 없습니다.');
      return;
    }

    setIsSyncingOroplay(true);
    try {
      console.log('💰 [Dashboard] OroPlay 보유금 수동 동기화 시작');

      // Lv2는 Lv1의 API 설정 사용
      let partnerId = user.id;
      if (user.level === 2) {
        const { data: lv1Partner } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (!lv1Partner) {
          throw new Error('Lv1 파트너를 찾을 수 없습니다.');
        }
        partnerId = lv1Partner.id;
      }

      // 1. 기존 토큰 조회
      const { data: config, error: configError } = await supabase
        .from('api_configs')
        .select('token, token_expires_at, client_id, client_secret')
        .eq('partner_id', partnerId)
        .eq('api_provider', 'oroplay')
        .maybeSingle();

      if (configError || !config) {
        throw new Error('OroPlay API 설정이 없습니다.');
      }

      if (!config.client_id || !config.client_secret) {
        throw new Error('OroPlay credentials가 설정되지 않았습니다.');
      }

      // 2. 토큰 만료 체크 및 재발급
      let token = config.token || '';
      
      const isTokenExpired = !config.token_expires_at || 
        new Date(config.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000; // 5분 전에 만료 예정

      if (isTokenExpired || !config.token) {
        console.log('🔄 [Dashboard] 토큰 재발급 필요');
        
        // 직접 토큰 생성 호출
        const tokenData = await createOroPlayToken(
          config.client_id,
          config.client_secret
        );
        
        token = tokenData.token;

        // DB에 새 토큰 저장
        const { error: updateError } = await supabase
          .from('api_configs')
          .update({
            token: tokenData.token,
            token_expires_at: new Date(tokenData.expiration * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', partnerId)
          .eq('api_provider', 'oroplay');

        if (updateError) {
          console.warn('⚠️ 토큰 저장 실패:', updateError.message);
        } else {
          console.log('✅ 토큰 재발급 및 저장 완료');
        }
      }

      // 3. GET /agent/balance 호출
      const balance = await getAgentBalance(token);

      console.log('✅ [Dashboard] OroPlay API 응답:', { balance });

      // 4. DB 업데이트 (Lv1은 api_configs, Lv2는 partners)
      if (user.level === 1) {
        // Lv1: api_configs 업데이트
        const { error: updateError } = await supabase
          .from('api_configs')
          .update({
            balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', user.id)
          .eq('api_provider', 'oroplay');

        if (updateError) {
          throw new Error(`DB 업데이트 실패: ${updateError.message}`);
        }
      } else if (user.level === 2) {
        // Lv2: partners.oroplay_balance 업데이트
        const { error: updateError } = await supabase
          .from('partners')
          .update({
            oroplay_balance: balance,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (updateError) {
          throw new Error(`DB 업데이트 실패: ${updateError.message}`);
        }
      }

      toast.success(`OroPlay 보유금 동기화 완료: ${formatCurrency(balance)}`);
    } catch (error: any) {
      console.error('❌ [Dashboard] OroPlay 보유금 동기화 실패:', error);
      toast.error(`OroPlay 보유금 동기화 실패: ${error.message}`);
    } finally {
      setIsSyncingOroplay(false);
    }
  };

  // 사용자 정보가 없으면 로딩 표시
  if (!user || typeof user.level !== 'number') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="loading-premium mx-auto"></div>
          <p className="text-muted-foreground">{t.dashboard.loadingDashboard}</p>
        </div>
      </div>
    );
  }



  // ✅ 실제 데이터 기반 대시보드 통계 가져오기 (Guidelines 준수)
  const loadDashboardStats = async () => {
    setIsLoadingStats(true);
    
    try {
      // ✅ 실제 DB 데이터 직접 확인 (디버깅)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 1. transactions 테이블 직접 조회
      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('transaction_type, status, amount, created_at')
        .gte('created_at', today.toISOString());
      
      if (transData && transData.length > 0) {
        // 입금 계산
        const deposits = transData
          .filter(t => 
            (t.transaction_type === 'deposit' && ['approved', 'completed'].includes(t.status))
          )
          .reduce((sum, t) => sum + Number(t.amount), 0);
        
        // 출금 계산
        const withdrawals = transData
          .filter(t => 
            (t.transaction_type === 'withdrawal' && ['approved', 'completed'].includes(t.status))
          )
          .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
      }
      
      // 2. game_records 테이블 직접 조회
      const { data: gameData, error: gameError } = await supabase
        .from('game_records')
        .select('provider_id, bet_amount, win_amount, played_at')
        .gte('played_at', today.toISOString());
      
      if (gameData && gameData.length > 0) {
        // 카지노/슬롯 계산
        const casinoProviders = [410, 77, 2, 30, 78, 86, 11, 28, 89, 91, 44, 85, 0];
        const casino = gameData
          .filter(g => casinoProviders.includes(Number(g.provider_id)))
          .reduce((sum, g) => sum + Number(g.bet_amount), 0);
        
        const slot = gameData
          .filter(g => !casinoProviders.includes(Number(g.provider_id)))
          .reduce((sum, g) => sum + Number(g.bet_amount), 0);
      }
      
      // 오늘 날짜 (UTC 기준 오늘 00:00:00)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayStartISO = todayStart.toISOString();
      
      // ✅ 권한별 하위 파트너 ID 목록 조회
      let allowedPartnerIds: string[] = [];
      
      if (user.level === 1) {
        // 시스템관리자: 모든 파트너
        const { data: allPartners } = await supabase
          .from('partners')
          .select('id');
        allowedPartnerIds = allPartners?.map(p => p.id) || [];
      } else {
        // 하위 파트너만 (자신 포함)
        allowedPartnerIds = [user.id];
        
        // 1단계 하위
        const { data: level1 } = await supabase
          .from('partners')
          .select('id')
          .eq('parent_id', user.id);
        
        const level1Ids = level1?.map(p => p.id) || [];
        allowedPartnerIds.push(...level1Ids);
        
        if (level1Ids.length > 0) {
          // 2단계 하위
          const { data: level2 } = await supabase
            .from('partners')
            .select('id')
            .in('parent_id', level1Ids);
          
          const level2Ids = level2?.map(p => p.id) || [];
          allowedPartnerIds.push(...level2Ids);
          
          if (level2Ids.length > 0) {
            // 3단계 하위
            const { data: level3 } = await supabase
              .from('partners')
              .select('id')
              .in('parent_id', level2Ids);
            
            const level3Ids = level3?.map(p => p.id) || [];
            allowedPartnerIds.push(...level3Ids);
            
            if (level3Ids.length > 0) {
              // 4단계 하위
              const { data: level4 } = await supabase
                .from('partners')
                .select('id')
                .in('parent_id', level3Ids);
              
              const level4Ids = level4?.map(p => p.id) || [];
              allowedPartnerIds.push(...level4Ids);
              
              if (level4Ids.length > 0) {
                // 5단계 하위
                const { data: level5 } = await supabase
                  .from('partners')
                  .select('id')
                  .in('parent_id', level4Ids);
                
                const level5Ids = level5?.map(p => p.id) || [];
                allowedPartnerIds.push(...level5Ids);
              }
            }
          }
        }
      }
      
      // ✅ 직속 회원 ID 목록 (referrer_id = user.id)
      let directUserIds: string[] = [];
      const { data: directUsersData } = await supabase
        .from('users')
        .select('id')
        .eq('referrer_id', user.id);
      
      directUserIds = directUsersData?.map(u => u.id).filter(id => id && id !== 'null') || [];
      
      // ✅ 하위 파트너 회원 ID 목록 (referrer_id가 하위 파트너들)
      let subPartnerUserIds: string[] = [];
      const subPartnerIds = allowedPartnerIds.filter(id => id !== user.id);
      
      if (subPartnerIds.length > 0) {
        const { data: subUsersData } = await supabase
          .from('users')
          .select('id')
          .in('referrer_id', subPartnerIds);
        
        subPartnerUserIds = subUsersData?.map(u => u.id).filter(id => id && id !== 'null') || [];
      }

      // 1️⃣ 직속 회원 입금
      let directDeposit = 0;
      if (directUserIds.length > 0) {
        const { data: depositData } = await supabase
          .from('transactions')
          .select('amount, created_at')
          .in('transaction_type', ['deposit', 'partner_deposit'])
          .in('status', ['approved', 'completed'])
          .in('user_id', directUserIds)
          .gte('created_at', todayStartISO);
        
        directDeposit = depositData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      }

      // 2️⃣ 직속 회원 출금
      let directWithdrawal = 0;
      if (directUserIds.length > 0) {
        const { data: withdrawalData } = await supabase
          .from('transactions')
          .select('amount, created_at')
          .in('transaction_type', ['withdrawal', 'partner_withdrawal'])
          .in('status', ['approved', 'completed'])
          .in('user_id', directUserIds)
          .gte('created_at', todayStartISO);
        
        directWithdrawal = withdrawalData?.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0) || 0;
      }

      // 3️⃣ 하위 파트너 회원 입금
      let subPartnerDeposit = 0;
      if (subPartnerUserIds.length > 0) {
        const { data: depositData } = await supabase
          .from('transactions')
          .select('amount, created_at')
          .in('transaction_type', ['deposit', 'partner_deposit'])
          .in('status', ['approved', 'completed'])
          .in('user_id', subPartnerUserIds)
          .gte('created_at', todayStartISO);
        
        subPartnerDeposit = depositData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      }

      // 4️⃣ 하위 파트너 회원 출금
      let subPartnerWithdrawal = 0;
      if (subPartnerUserIds.length > 0) {
        const { data: withdrawalData } = await supabase
          .from('transactions')
          .select('amount, created_at')
          .in('transaction_type', ['withdrawal', 'partner_withdrawal'])
          .in('status', ['approved', 'completed'])
          .in('user_id', subPartnerUserIds)
          .gte('created_at', todayStartISO);
        
        subPartnerWithdrawal = withdrawalData?.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0) || 0;
      }

      // 3️⃣ 사용자 수
      let totalUsers = 0;
      
      if (allowedPartnerIds.length > 0) {
        const { count } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .in('referrer_id', allowedPartnerIds);
        
        totalUsers = count || 0;
      }

      // 4️⃣ 온라인 사용자 수 - users 테이블에서 is_online=true인 회원 카운트
      let onlineCount = 0;
      
      if (allowedPartnerIds.length > 0) {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('is_online', true)
          .in('referrer_id', allowedPartnerIds);
        
        onlineCount = count || 0;
      }

      // 5️⃣ 만충금 조회 (직속 + 하위 파트너 회원) - ✅ 통합 모듈 사용
      const allUserIds = [...directUserIds, ...subPartnerUserIds];
      const pendingDepositAmount = await calculatePendingDeposits(
        allUserIds,
        todayStartISO,
        new Date().toISOString()
      );
      
      // 6️⃣ 직속 회원 베팅 통계 + 게임 손익
      let directCasinoBetting = 0;
      let directSlotBetting = 0;
      let directBetAmount = 0; // 총 베팅액 (파트너 수입)
      let directWinAmount = 0; // 총 당첨액 (파트너 지출)
      
      if (directUserIds.length > 0) {
        const { data: bettingData } = await supabase
          .from('game_records')
          .select('provider_id, bet_amount, win_amount')
          .in('user_id', directUserIds)
          .gte('played_at', todayStartISO);

        if (bettingData && bettingData.length > 0) {
          const casinoProviders = [410, 77, 2, 30, 78, 86, 11, 28, 89, 91, 44, 85, 0];
          directCasinoBetting = bettingData
            .filter(b => casinoProviders.includes(Number(b.provider_id)))
            .reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          directSlotBetting = bettingData
            .filter(b => !casinoProviders.includes(Number(b.provider_id)))
            .reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          
          // 게임 손익 계산
          directBetAmount = bettingData.reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          directWinAmount = bettingData.reduce((sum, b) => sum + Number(b.win_amount || 0), 0);
        }
      }

      // 7️⃣ 하위 파트너 회원 베팅 통계 + 게임 손익
      let subPartnerCasinoBetting = 0;
      let subPartnerSlotBetting = 0;
      let subPartnerBetAmount = 0; // 총 베팅액 (파트너 수입)
      let subPartnerWinAmount = 0; // 총 당첨액 (파트너 지출)
      
      if (subPartnerUserIds.length > 0) {
        const { data: bettingData } = await supabase
          .from('game_records')
          .select('provider_id, bet_amount, win_amount')
          .in('user_id', subPartnerUserIds)
          .gte('played_at', todayStartISO);

        if (bettingData && bettingData.length > 0) {
          const casinoProviders = [410, 77, 2, 30, 78, 86, 11, 28, 89, 91, 44, 85, 0];
          subPartnerCasinoBetting = bettingData
            .filter(b => casinoProviders.includes(Number(b.provider_id)))
            .reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          subPartnerSlotBetting = bettingData
            .filter(b => !casinoProviders.includes(Number(b.provider_id)))
            .reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          
          // 게임 손익 계산
          subPartnerBetAmount = bettingData.reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
          subPartnerWinAmount = bettingData.reduce((sum, b) => sum + Number(b.win_amount || 0), 0);
        }
      }
      
      // ✅ 통합 정산: 실제 입출금 + 게임 손익
      // - 입금 = 실제 입금 + 베팅액 (사용자가 베팅 = 파트너가 받음)
      // - 출금 = 실제 출금 + 당첨액 (사용자가 당첨 = 파트너가 지급)
      const totalDeposit = directDeposit + subPartnerDeposit;
      const totalWithdrawal = directWithdrawal + subPartnerWithdrawal;
      
      setStats(prev => ({
        ...prev,
        total_users: totalUsers || 0,
        daily_deposit: totalDeposit,
        daily_withdrawal: totalWithdrawal,
        daily_net_deposit: totalDeposit - totalWithdrawal,
        online_users: onlineCount || 0,
        casino_betting: directCasinoBetting + subPartnerCasinoBetting,
        slot_betting: directSlotBetting + subPartnerSlotBetting,
        total_betting: directCasinoBetting + directSlotBetting + subPartnerCasinoBetting + subPartnerSlotBetting,
        pending_approvals: 0,
        pending_messages: 0,
        pending_deposits: 0,
        pending_withdrawals: 0,
      }));
      
      setDirectStats({
        deposit: directDeposit, // ✅ 실제 입금만
        withdrawal: directWithdrawal, // ✅ 실제 출금만
        netDeposit: directDeposit - directWithdrawal, // ✅ 순입출금
        casinoBetting: directCasinoBetting,
        slotBetting: directSlotBetting,
        totalBetting: directCasinoBetting + directSlotBetting,
        betAmount: directBetAmount, // 게임 베팅액
        winAmount: directWinAmount, // 게임 당첨액
        gameProfit: directBetAmount - directWinAmount // 게임 손익
      });
      
      setSubPartnerStats({
        deposit: subPartnerDeposit, // ✅ 실제 입금만
        withdrawal: subPartnerWithdrawal, // ✅ 실제 출금만
        netDeposit: subPartnerDeposit - subPartnerWithdrawal, // ✅ 순입출금
        casinoBetting: subPartnerCasinoBetting,
        slotBetting: subPartnerSlotBetting,
        totalBetting: subPartnerCasinoBetting + subPartnerSlotBetting,
        betAmount: subPartnerBetAmount, // 게임 베팅액
        winAmount: subPartnerWinAmount, // 게임 당첨액
        gameProfit: subPartnerBetAmount - subPartnerWinAmount // 게임 손익
      });
      
      setPendingDeposits(pendingDepositAmount);
      
      setIsLoadingStats(false);
    } catch (error: any) {
      console.error('❌ [Dashboard] 통계 로드 실패:', error);
      toast.error(`통계 로드 실패: ${error.message}`);
      setIsLoadingStats(false);
    }
  };

  // 컴포넌트 마운트 시 통계 데이터 로드
  useEffect(() => {
    loadDashboardStats();
  }, []);

  // 실시간 시간 업데이트
  useEffect(() => {
    // ✅ 파트너 타임존 기준 시간 포맷팅
    const updateTime = async () => {
      const formatted = await getCurrentTimeFormatted(user.id, user.level);
      setFormattedTime(formatted);
    };

    // 초기 시간 설정
    updateTime();

    // 1초마다 시간 업데이트
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      updateTime();
    }, 1000);

    return () => clearInterval(timer);
  }, [user.id, user.level]);

  // ✅ Realtime 구독: 모든 테이블 변경 시 즉시 업데이트 (이벤트 발생 업데이트)
  useEffect(() => {
    console.log('🔔 대시보드 Realtime 구독 시작:', user.id);
    
    // 1. transactions 테이블 변경 감지 (입출금)
    const transactionChannel = supabase
      .channel('dashboard_transactions')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모두 감지
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          console.log('💰 [대시보드] transactions 변경 감지:', payload.eventType);
          loadDashboardStats(); // 즉시 갱신
        }
      )
      .subscribe();

    // 2. partners 테이블 변경 감지 (보유금)
    const partnerChannel = supabase
      .channel('dashboard_partners')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'partners',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          loadDashboardStats(); // 즉시 갱신
        }
      )
      .subscribe();

    // 3. game_records 테이블 변경 감지 (베팅)
    const gameRecordChannel = supabase
      .channel('dashboard_game_records')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_records'
        },
        (payload) => {
          loadDashboardStats(); // 즉시 갱신
        }
      )
      .subscribe();

    // 4. users 테이블 변경 감지 (회원 보유금)
    const usersChannel = supabase
      .channel('dashboard_users')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users'
        },
        (payload) => {
          console.log('👤 [대시보드] users 변경 감지:', payload.eventType);
          loadDashboardStats(); // 즉시 갱신
        }
      )
      .subscribe();

    return () => {
      console.log('🔕 대시보드 Realtime 구독 해제');
      supabase.removeChannel(transactionChannel);
      supabase.removeChannel(partnerChannel);
      supabase.removeChannel(gameRecordChannel);
      supabase.removeChannel(usersChannel);
    };
  }, [user.id]);

  // ✅ API 자동 동기화 (4초 주기)
  // ❌ 자동 동기화 비활성화: HonorAPI가 4초마다 다른 값을 반환하여 불필요한 업데이트 발생
  // 수동 동기화(카드 클릭)만 사용
  /*
  useEffect(() => {
    if (user.level !== 1 && user.level !== 2) {
      return;
    }

    console.log('🔄 [Dashboard] API 자동 동기화 시작 (4초 주기)');

    let isMounted = true;
    let isAutoSyncing = false;
    
    // 마지막 업데이트된 값 캐싱 (불필요한 DB 업데이트 방지)
    const lastValuesRef = { honorapi: null as number | null, oroplay: null as number | null };

    // 자동 동기화 함수
    const performAutoSync = async () => {
      if (isAutoSyncing || !isMounted) return;
      isAutoSyncing = true;

      try {
        const { data: lv1Partner } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!lv1Partner || !isMounted) {
          isAutoSyncing = false;
          return;
        }

        const partnerId = lv1Partner.id;

        // 활성화된 API만 동기화
        const { data: honorConfig } = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('partner_id', partnerId)
          .eq('api_provider', 'honorapi')
          .maybeSingle();

        const { data: oroplayConfig } = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('partner_id', partnerId)
          .eq('api_provider', 'oroplay')
          .maybeSingle();

        // HonorAPI 동기화
        if (honorConfig?.is_active !== false && isMounted) {
          try {
            console.log('🔄 [Dashboard] HonorAPI 자동 동기화 (4초 주기)');
            const credentials = await getLv1HonorApiCredentials(partnerId);
            if (credentials?.api_key) {
              const agentInfo = await honorApiModule.getAgentInfo(credentials.api_key);
              const balance = agentInfo?.hold_amount;
              
              // balance가 유효한 숫자이고 변경되었을 때만 업데이트
              if (typeof balance === 'number' && balance >= 0 && lastValuesRef.honorapi !== balance) {
                lastValuesRef.honorapi = balance;
                
                if (user.level === 1) {
                  await supabase
                    .from('api_configs')
                    .update({
                      balance: balance,
                      updated_at: new Date().toISOString()
                    })
                    .eq('partner_id', user.id)
                    .eq('api_provider', 'honorapi');
                } else if (user.level === 2) {
                  await supabase
                    .from('partners')
                    .update({
                      honorapi_balance: balance,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', user.id);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ [Dashboard] HonorAPI 자동 동기화 실패:', error);
          }
        }

        // OroPlay 동기화
        if (oroplayConfig?.is_active !== false && isMounted) {
          try {
            console.log('🔄 [Dashboard] OroPlay 자동 동기화 (4초 주기)');
            
            const { data: config } = await supabase
              .from('api_configs')
              .select('token, token_expires_at, client_id, client_secret')
              .eq('partner_id', partnerId)
              .eq('api_provider', 'oroplay')
              .maybeSingle();

            if (config?.client_id && config?.client_secret) {
              let token = config.token || '';
              
              const isTokenExpired = !config.token_expires_at || 
                new Date(config.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000;

              if (isTokenExpired || !config.token) {
                const tokenData = await createOroPlayToken(
                  config.client_id,
                  config.client_secret
                );
                
                token = tokenData.token;

                await supabase
                  .from('api_configs')
                  .update({
                    token: tokenData.token,
                    token_expires_at: new Date(tokenData.expiration * 1000).toISOString(),
                    updated_at: new Date().toISOString()
                  })
                  .eq('partner_id', partnerId)
                  .eq('api_provider', 'oroplay');
              }

              const balance = await getAgentBalance(token);

              if (user.level === 1) {
                await supabase
                  .from('api_configs')
                  .update({
                    balance: balance,
                    updated_at: new Date().toISOString()
                  })
                  .eq('partner_id', user.id)
                  .eq('api_provider', 'oroplay');
              } else if (user.level === 2) {
                await supabase
                  .from('partners')
                  .update({
                    oroplay_balance: balance,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', user.id);
              }
            }
          } catch (error) {
            console.warn('⚠️ [Dashboard] OroPlay 자동 동기화 실패:', error);
          }
        }
      } catch (error) {
        console.error('❌ [Dashboard] 자동 동기화 오류:', error);
      } finally {
        isAutoSyncing = false;
      }
    };

    // 즉시 첫 동기화 실행
    performAutoSync();

    // 4초마다 동기화
    const autoSyncInterval = setInterval(() => {
      performAutoSync();
    }, 4000);

    return () => {
      console.log('🧹 [Dashboard] API 자동 동기화 정리');
      isMounted = false;
      clearInterval(autoSyncInterval);
    };
  }, [user.id, user.level]);
  */




  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">
            {t.dashboard.adminDashboard}
          </h1>
          <p className="text-xl text-slate-400">
            {getPartnerLevelText(user.level)} · {user.nickname}{t.dashboard.realtimeStatus}
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-3 px-4 py-2 text-base badge-premium-primary">
          <Clock className="h-5 w-5" />
          {formattedTime}
        </Badge>
      </div>

      {/* 상단 주요 지표 - 모든 레벨 동일하게 표시 */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t.dashboard.totalUsers}
          value={formatNumber(stats.total_users)}
          subtitle={`↑ ${t.dashboard.registeredUsers}`}
          icon={Users}
          color="blue"
        />
        
        <MetricCard
          title={t.dashboard.todayNetRevenue}
          value={formatCurrency(stats.daily_net_deposit)}
          subtitle={stats.daily_net_deposit >= 0 ? `↑ ${t.dashboard.profitToday}` : `↓ ${t.dashboard.lossToday}`}
          icon={Activity}
          color={stats.daily_net_deposit >= 0 ? "green" : "pink"}
        />
        
        <MetricCard
          title={t.dashboard.todayTotalBetting}
          value={formatCurrency(stats.total_betting)}
          subtitle={`↑ ${t.dashboard.customerActivity}`}
          icon={Target}
          color="purple"
        />
        
        <MetricCard
          title={t.dashboard.pendingCharges}
          value={formatCurrency(pendingDeposits)}
          subtitle={`↑ ${t.dashboard.pendingChargesDesc}`}
          icon={DollarSign}
          color="orange"
        />
      </div>
      
      {/* Lv1 보유금 카드 - 새로운 디자인 */}
      {user.level === 1 && (
        <div className="rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm border border-white/10 shadow-xl bg-gradient-to-br from-slate-800/90 via-slate-800/90 to-slate-900/90">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative z-10">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-white/15 backdrop-blur-md shadow-lg">
                  <Wallet className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white/95">🎯 내 보유금 현황</h3>
              </div>
              <div className="flex gap-1">
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">Invest</span>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-300">oroplay</span>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">Family</span>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300">Honor</span>
              </div>
            </div>

            {/* 보유금 그리드 */}
            <div className="grid grid-cols-4 gap-3">
              {/* Invest */}
              <div 
                className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors"
                onClick={handleSyncInvestBalance}
              >
                <div className="flex justify-between items-start">
                  <p className="text-xs text-blue-400 mb-1">Invest</p>
                  <RefreshCw className="h-3 w-3 text-blue-400" />
                </div>
                <p className="text-lg font-bold text-white">
                  ₩{(investBalance || 0).toLocaleString()}
                </p>
              </div>

              {/* oroplay */}
              <div 
                className="bg-green-500/10 rounded-xl p-3 border border-green-500/20 cursor-pointer hover:bg-green-500/20 transition-colors"
                onClick={handleSyncOroplayBalance}
              >
                <div className="flex justify-between items-start">
                  <p className="text-xs text-green-400 mb-1">oroplay</p>
                  {isSyncingOroplay ? (
                    <RefreshCw className="h-3 w-3 text-green-400 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 text-green-400" />
                  )}
                </div>
                <p className="text-lg font-bold text-white">
                  ₩{(oroplayBalance || 0).toLocaleString()}
                </p>
              </div>

              {/* Family */}
              <div 
                className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/20 cursor-pointer hover:bg-purple-500/20 transition-colors"
                onClick={handleSyncFamilyBalance}
              >
                <div className="flex justify-between items-start">
                  <p className="text-xs text-purple-400 mb-1">Family</p>
                  {isSyncingFamily ? (
                    <RefreshCw className="h-3 w-3 text-purple-400 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 text-purple-400" />
                  )}
                </div>
                <p className="text-lg font-bold text-white">
                  ₩{(familyapiBalance || 0).toLocaleString()}
                </p>
              </div>

              {/* Honor */}
              <div 
                className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20 cursor-pointer hover:bg-amber-500/20 transition-colors"
                onClick={handleSyncHonorBalance}
              >
                <div className="flex justify-between items-start">
                  <p className="text-xs text-amber-400 mb-1">Honor</p>
                  {isSyncingHonor ? (
                    <RefreshCw className="h-3 w-3 text-amber-400 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 text-amber-400" />
                  )}
                </div>
                <p className="text-lg font-bold text-white">
                  ₩{(honorapiBalance || 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* 총 보유금 */}
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">총 보유금</span>
                <span className="text-xl font-bold text-cyan-400">
                  ₩{(
                    (investBalance || 0) +
                    (oroplayBalance || 0) +
                    (familyapiBalance || 0) +
                    (honorapiBalance || 0)
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 게임 동기화 결과 및 버튼 - Lv1 전용 */}
      {user.level === 1 && (
        <div className="rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm border border-white/10 shadow-xl bg-gradient-to-br from-slate-800/90 via-slate-800/90 to-slate-900/90">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-white/15 backdrop-blur-md shadow-lg">
                  <Activity className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white/95">🎮 게임 동기화 현황</h3>
              </div>
              <span className="text-xs text-slate-400">설정페이지 API 탭에서 동기화 가능</span>
            </div>

            {/* 동기화 결과 그리드 */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {/* Invest 동기화 결과 */}
              <div className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs text-blue-400">Invest</p>
                  <span className="text-xs text-slate-500">게임사</span>
                </div>
                {lastSyncResults.invest ? (
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-white">
                      +{lastSyncResults.invest.newGames}개
                    </p>
                    <p className="text-xs text-slate-400">
                      {lastSyncResults.invest.time}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">미동기화</p>
                )}
              </div>

              {/* oroplay 동기화 결과 */}
              <div className="bg-green-500/10 rounded-xl p-3 border border-green-500/20">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs text-green-400">oroplay</p>
                  <span className="text-xs text-slate-500">게임사</span>
                </div>
                {lastSyncResults.oroplay ? (
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-white">
                      +{lastSyncResults.oroplay.newGames}개
                    </p>
                    <p className="text-xs text-slate-400">
                      {lastSyncResults.oroplay.time}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">미동기화</p>
                )}
              </div>

              {/* Family 동기화 결과 */}
              <div className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/20">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs text-purple-400">Family</p>
                  <span className="text-xs text-slate-500">게임사</span>
                </div>
                {lastSyncResults.familyapi ? (
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-white">
                      +{lastSyncResults.familyapi.newGames}개
                    </p>
                    <p className="text-xs text-slate-400">
                      {lastSyncResults.familyapi.time}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">미동기화</p>
                )}
              </div>

              {/* Honor 동기화 결과 */}
              <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs text-amber-400">Honor</p>
                  <span className="text-xs text-slate-500">게임사</span>
                </div>
                {lastSyncResults.honorapi ? (
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-white">
                      +{lastSyncResults.honorapi.newGames}개
                    </p>
                    <p className="text-xs text-slate-400">
                      {lastSyncResults.honorapi.time}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">미동기화</p>
                )}
              </div>
            </div>

            {/* 동기화 버튼 */}
            <div className="flex gap-2">
              <button
                onClick={() => window.location.hash = '/admin/settings?tab=api'}
                className="flex-1 px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                설정에서 게임 동기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 하단 4열 섹션 - 자신 직속 / 하위파트너 구분 - Lv1에게는 표시 안함 */}
      {user.level !== 1 && (
        <div className="grid gap-5 md:grid-cols-2">
          {/* 자신의 사용자 입출금 현황 */}
          <PremiumSectionCard
            title={t.dashboard.directUserTransactions}
            icon={TrendingUp}
            iconColor="text-cyan-400"
          >
            <SectionRow
              label={t.dashboard.dailyDeposit}
              value={formatCurrency(directStats.deposit)}
              valueColor="text-cyan-400"
              icon={TrendingUp}
              iconColor="text-cyan-400"
            />
            <SectionRow
              label={t.dashboard.dailyWithdrawal}
              value={formatCurrency(directStats.withdrawal)}
              valueColor="text-rose-400"
              icon={TrendingDown}
              iconColor="text-rose-400"
            />
            <SectionRow
              label={t.dashboard.dailyNetDeposit}
              value={formatCurrency(directStats.netDeposit)}
              valueColor="text-cyan-400"
              icon={DollarSign}
              iconColor="text-cyan-400"
            />
          </PremiumSectionCard>

          {/* 자신의 사용자 베팅 현황 */}
          <PremiumSectionCard
            title={t.dashboard.directUserBetting}
            icon={Zap}
            iconColor="text-amber-400"
          >
            <SectionRow
              label={t.dashboard.casinoTotalBetting}
              value={formatCurrency(directStats.casinoBetting)}
              valueColor="text-cyan-400"
              icon={Target}
              iconColor="text-cyan-400"
            />
            <SectionRow
              label={t.dashboard.slotTotalBetting}
              value={formatCurrency(directStats.slotBetting)}
              valueColor="text-amber-400"
              icon={Zap}
              iconColor="text-amber-400"
            />
            <SectionRow
              label={t.dashboard.totalBetting}
              value={formatCurrency(directStats.totalBetting)}
              valueColor="text-cyan-400"
              icon={BarChart3}
              iconColor="text-cyan-400"
            />
          </PremiumSectionCard>

          {/* 하위 파트너 사용자 입출금 현황 */}
          <PremiumSectionCard
            title={t.dashboard.subPartnerTransactions}
            icon={TrendingUp}
            iconColor="text-purple-400"
          >
            <SectionRow
              label={t.dashboard.dailyDeposit}
              value={formatCurrency(subPartnerStats.deposit)}
              valueColor="text-cyan-400"
              icon={TrendingUp}
              iconColor="text-cyan-400"
            />
            <SectionRow
              label={t.dashboard.dailyWithdrawal}
              value={formatCurrency(subPartnerStats.withdrawal)}
              valueColor="text-rose-400"
              icon={TrendingDown}
              iconColor="text-rose-400"
            />
            <SectionRow
              label={t.dashboard.dailyNetDeposit}
              value={formatCurrency(subPartnerStats.netDeposit)}
              valueColor="text-cyan-400"
              icon={DollarSign}
              iconColor="text-cyan-400"
            />
          </PremiumSectionCard>

          {/* 하위 파트너 사용자 베팅 현황 */}
          <PremiumSectionCard
            title={t.dashboard.subPartnerBetting}
            icon={Zap}
            iconColor="text-green-400"
          >
            <SectionRow
              label={t.dashboard.casinoTotalBetting}
              value={formatCurrency(subPartnerStats.casinoBetting)}
              valueColor="text-cyan-400"
              icon={Target}
              iconColor="text-cyan-400"
            />
            <SectionRow
              label={t.dashboard.slotTotalBetting}
              value={formatCurrency(subPartnerStats.slotBetting)}
              valueColor="text-amber-400"
              icon={Zap}
              iconColor="text-amber-400"
            />
            <SectionRow
              label={t.dashboard.totalBetting}
              value={formatCurrency(subPartnerStats.totalBetting)}
              valueColor="text-cyan-400"
              icon={BarChart3}
              iconColor="text-cyan-400"
            />
          </PremiumSectionCard>
        </div>
      )}

      {/* Lv2 파트너별 보유금 카드 */}
      {user.level === 1 && lv2Partners.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-bold text-slate-100 mb-4">🎯 Lv2 파트너 보유금 현황</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {lv2Partners.map((partner) => (
              <div
                key={partner.id}
                className="rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm border border-white/10 shadow-xl bg-gradient-to-br from-slate-800/90 via-slate-800/90 to-slate-900/90"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
                <div className="relative z-10">
                  {/* 파트너 정보 */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-white/15 backdrop-blur-md shadow-lg">
                        <Users className="h-5 w-5 text-cyan-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white/95">{partner.nickname}</h3>
                    </div>
                    <div className="flex gap-1">
                      {partner.selected_apis?.map((api) => (
                        <span
                          key={api}
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            api === 'invest' ? 'bg-blue-500/20 text-blue-300' :
                            api === 'oroplay' ? 'bg-green-500/20 text-green-300' :
                            api === 'familyapi' ? 'bg-purple-500/20 text-purple-300' :
                            'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {api === 'invest' ? 'Invest' :
                           api === 'oroplay' ? 'oroplay' :
                           api === 'familyapi' ? 'Family' :
                           api === 'honorapi' ? 'Honor' : api}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 보유금 그리드 (클릭 시 동기화) */}
                  <div className="grid grid-cols-2 gap-3">
                    {partner.selected_apis?.includes('invest') && (
                      <div 
                        className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors"
                        onClick={() => toast.info('Invest 동기화는 비활성화되어 있습니다.')}
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-xs text-blue-400 mb-1">Invest</p>
                          <RefreshCw className="h-3 w-3 text-blue-400" />
                        </div>
                        <p className="text-lg font-bold text-white">
                          ₩{(partner.invest_balance || 0).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {partner.selected_apis?.includes('oroplay') && (
                      <div 
                        className="bg-green-500/10 rounded-xl p-3 border border-green-500/20 cursor-pointer hover:bg-green-500/20 transition-colors"
                        onClick={() => syncLv2PartnerBalance(partner.id, 'oroplay')}
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-xs text-green-400 mb-1">oroplay</p>
                          {syncingPartnerId === `${partner.id}-oroplay` ? (
                            <RefreshCw className="h-3 w-3 text-green-400 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3 text-green-400" />
                          )}
                        </div>
                        <p className="text-lg font-bold text-white">
                          ₩{(partner.oroplay_balance || 0).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {partner.selected_apis?.includes('familyapi') && (
                      <div 
                        className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/20 cursor-pointer hover:bg-purple-500/20 transition-colors"
                        onClick={() => syncLv2PartnerBalance(partner.id, 'familyapi')}
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-xs text-purple-400 mb-1">Family</p>
                          {syncingPartnerId === `${partner.id}-familyapi` ? (
                            <RefreshCw className="h-3 w-3 text-purple-400 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3 text-purple-400" />
                          )}
                        </div>
                        <p className="text-lg font-bold text-white">
                          ₩{(partner.familyapi_balance || 0).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {partner.selected_apis?.includes('honorapi') && (
                      <div 
                        className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20 cursor-pointer hover:bg-amber-500/20 transition-colors"
                        onClick={() => syncLv2PartnerBalance(partner.id, 'honorapi')}
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-xs text-amber-400 mb-1">Honor</p>
                          {syncingPartnerId === `${partner.id}-honorapi` ? (
                            <RefreshCw className="h-3 w-3 text-amber-400 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3 text-amber-400" />
                          )}
                        </div>
                        <p className="text-lg font-bold text-white">
                          ₩{(partner.honorapi_balance || 0).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 총 보유금 */}
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">총 보유금</span>
                      <span className="text-xl font-bold text-cyan-400">
                        ₩{(
                          (partner.selected_apis?.includes('invest') ? partner.invest_balance : 0) +
                          (partner.selected_apis?.includes('oroplay') ? partner.oroplay_balance : 0) +
                          (partner.selected_apis?.includes('familyapi') ? partner.familyapi_balance : 0) +
                          (partner.selected_apis?.includes('honorapi') ? partner.honorapi_balance : 0)
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 모든 Frontend 바로가기 (작은 버튼) */}
      {user.level === 1 && (
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              // Figma Make 환경에서는 같은 창에서 해시 변경
              window.location.hash = '/user/casino';
            }}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg text-sm transition-all duration-200 shadow-md hover:shadow-lg"
          >
            🎰 User Page
          </button>
          <button
            onClick={() => {
              window.location.hash = '/sample1/casino';
            }}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg text-sm transition-all duration-200 shadow-md hover:shadow-lg"
          >
            🎮 Sample1 Page
          </button>
          <button
            onClick={() => {
              window.location.hash = '/benz';
            }}
            className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg text-sm transition-all duration-200 shadow-md hover:shadow-lg"
          >
            🌏 Benz Page
          </button>
        </div>
      )}
    </div>
  );
}

// Default export 추가
export default Dashboard;
