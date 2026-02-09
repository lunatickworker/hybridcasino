import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Partner } from '../types';
import { toast } from 'sonner@2.0.3';
import { useLanguage } from './LanguageContext';

interface BalanceContextType {
  balance: number;
  investBalance: number;
  oroplayBalance: number;
  familyapiBalance: number;
  honorapiBalance: number;
  loading: boolean;
  error: string | null;
  lastSyncTime: Date | null;
  syncBalance: () => Promise<void>;
  useInvestApi: boolean;
  useOroplayApi: boolean;
  useFamilyApi: boolean;
  useHonorApi: boolean;
}

const BalanceContext = createContext<BalanceContextType | null>(null);

export function useBalance() {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error('useBalance must be used within BalanceProvider');
  }
  return context;
}

interface BalanceProviderProps {
  user: Partner | null;
  children: ReactNode;
}

export function BalanceProvider({ user, children }: BalanceProviderProps) {
  const [balance, setBalance] = useState<number>(0);
  const [investBalance, setInvestBalance] = useState<number>(0);
  const [oroplayBalance, setOroplayBalance] = useState<number>(0);
  const [familyapiBalance, setFamilyapiBalance] = useState<number>(0);
  const [honorapiBalance, setHonorapiBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [useInvestApi, setUseInvestApi] = useState<boolean>(true);
  const [useOroplayApi, setUseOroplayApi] = useState<boolean>(true);
  const [useFamilyApi, setUseFamilyApi] = useState<boolean>(true);
  const [useHonorApi, setUseHonorApi] = useState<boolean>(true);
  const isSyncingRef = useRef<boolean>(false);
  const channelsRef = useRef<any[]>([]);

  const loadBalanceFromDB = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    try {
      setLoading(true);
      
      // ✅ 모든 레벨: partners.balance 조회
      const { data, error: dbError } = await supabase
        .from('partners')
        .select('balance')
        .eq('id', user.id)
        .maybeSingle();

      if (dbError) {
        if (dbError?.message?.includes('Failed to fetch')) {
          setLoading(false);
          return;
        }
        console.error('❌ [Balance] partners 테이블 조회 실패:', dbError);
        setError(dbError.message);
        setLoading(false);
        return;
      }

      if (!data) {
        console.warn(`⚠️ [Balance] 파트너 ${user.id} 조회 결과 없음`);
        setBalance(0);
        setLoading(false);
        return;
      }

      const currentBalance = parseFloat(data.balance?.toString() || '0') || 0;
      console.log(`✅ [Balance] Lv${user.level} 파트너 ${user.nickname} balance 로드:`, currentBalance);
      setBalance(currentBalance);

      // ✅ Lv1만 API 활성 상태 확인
      if (user.level === 1) {
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

        const { data: familyapiConfig } = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'familyapi')
          .maybeSingle();

        const { data: honorapiConfig } = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'honorapi')
          .maybeSingle();

        setUseInvestApi(investConfig?.is_active !== false);
        setUseOroplayApi(oroplayConfig?.is_active !== false);
        setUseFamilyApi(familyapiConfig?.is_active !== false);
        setUseHonorApi(honorapiConfig?.is_active !== false);
      }

      setError(null);
      setLoading(false);
    } catch (err: any) {
      console.error('❌ [Balance] loadBalanceFromDB 오류:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [user?.id, user?.level]);

  const syncBalanceFromAPI = useCallback(async (isManual: boolean = false) => {
    if (!user?.id) return;

    if (user.level !== 1) {
      return;
    }

    if (isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;
    if (isManual) {
      setLoading(true);
    }

    try {
      let newInvestBalance = 0;
      let newOroBalance = 0;
      let newFamilyBalance = 0;
      let newHonorBalance = 0;

      const { isManualSyncRunning } = await import('../lib/oroplayApi');

      // ✅ OroPlay 수동 동기화 중이면 Invest API만 동기화 (다른 API 호출 차단)
      const isOroPlaySyncing = isManualSyncRunning();
      if (isOroPlaySyncing) {
        console.log('🔄 [Balance] OroPlay 동기화 중, Invest만 동기화');
      }

      const investApiModule = await import('../lib/investApi');
      const { checkApiActiveByPartnerId } = await import('../lib/apiStatusChecker');

      const isInvestActive = await checkApiActiveByPartnerId(user.id, 'invest');
      if (!isInvestActive) {
        newInvestBalance = 0;
      } else {
        const apiConfig = await investApiModule.investApi.getApiConfig(user.id);

        const apiStartTime = Date.now();
        const balanceResponse = await investApiModule.investApi.getAllAccountBalances(
          apiConfig.opcode,
          apiConfig.secret_key
        );
        const apiDuration = Date.now() - apiStartTime;

        await supabase.from('api_sync_logs').insert({
          opcode: apiConfig.opcode,
          api_endpoint: '/api/account/balance',
          sync_type: isManual ? 'manual_balance_sync' : 'auto_balance_sync',
          status: balanceResponse.error ? 'failed' : 'success',
          request_data: {
            opcode: apiConfig.opcode,
            partner_id: user.id,
            partner_nickname: user.nickname
          },
          response_data: balanceResponse.error ? { error: balanceResponse.error } : balanceResponse.data,
          duration_ms: apiDuration,
          error_message: balanceResponse.error || null
        });

        if (balanceResponse.error) {
          console.error('❌ [Balance] API 호출 실패:', balanceResponse.error);
          setError(balanceResponse.error);
          if (isManual) {
            toast.error(`API 동기화 실패: ${balanceResponse.error}`);
          }
          return;
        }

        newInvestBalance = balanceResponse.data?.balance || 0;

        await supabase
          .from('api_configs')
          .update({
            balance: newInvestBalance,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', user.id)
          .eq('api_provider', 'invest');
      }

      // ✅ OroPlay API 활성화 체크
      const isOroPlayActive = await checkApiActiveByPartnerId(user.id, 'oroplay');
      if (!isOroPlayActive) {
        newOroBalance = 0;
      } else {
        try {
          const { data: oroConfig } = await supabase
            .from('api_configs')
            .select('client_id, client_secret, is_active')
            .eq('partner_id', user.id)
            .eq('api_provider', 'oroplay')
            .maybeSingle();

          if (!oroConfig?.is_active || !oroConfig?.client_id || !oroConfig?.client_secret) {
            newOroBalance = 0;
            console.log('⏭️ [Balance] OroPlay 비활성화됨');
          } else {
            const { getAgentBalance, getOroPlayToken } = await import('../lib/oroplayApi');

            const oroToken = await getOroPlayToken(user.id);
            const rawOroBalance = await getAgentBalance(oroToken);
            newOroBalance = typeof rawOroBalance === 'number' && !isNaN(rawOroBalance) ? rawOroBalance : 0;

            await supabase
              .from('api_configs')
              .update({
                balance: newOroBalance,
                updated_at: new Date().toISOString()
              })
              .eq('partner_id', user.id)
              .eq('api_provider', 'oroplay');
          }
        } catch (oroErr: any) {
          newOroBalance = 0;
          console.error('❌ [Balance] OroPlay API 잔고 조회 실패:', oroErr);
          if (isManual) {
            toast.error(`OroPlay 잔고 조회 실패: ${oroErr.message}`);
          }
        }
      }

      // ✅ HonorAPI 활성화 체크
      const isHonorApiActive = await checkApiActiveByPartnerId(user.id, 'honorapi');
      if (!isHonorApiActive) {
        newHonorBalance = 0;
      } else {
        try {
          const { data: honorConfig } = await supabase
            .from('api_configs')
            .select('api_key, is_active')
            .eq('partner_id', user.id)
            .eq('api_provider', 'honorapi')
            .maybeSingle();

          if (!honorConfig?.is_active || !honorConfig?.api_key) {
            newHonorBalance = 0;
            console.log('⏭️ [Balance] HonorAPI 비활성화됨');
          } else {
            const { getAgentBalance } = await import('../lib/honorApi');

            const rawHonorBalance = await getAgentBalance(honorConfig.api_key);
            newHonorBalance = typeof rawHonorBalance === 'number' && !isNaN(rawHonorBalance) ? rawHonorBalance : 0;

            // HonorAPI는 api_configs에 직접 업데이트
            await supabase
              .from('api_configs')
              .update({
                balance: newHonorBalance,
                updated_at: new Date().toISOString()
              })
              .eq('partner_id', user.id)
              .eq('api_provider', 'honorapi');
          }
        } catch (honorErr: any) {
          newHonorBalance = 0;
          console.error('❌ [Balance] HonorAPI 잔고 조회 실패:', honorErr);
          if (isManual) {
            toast.error(`HonorAPI 잔고 조회 실패: ${honorErr.message}`);
          }
        }
      }

      // ✅ FamilyAPI 활성화 체크 (나중에 구현)
      const isFamilyApiActive = await checkApiActiveByPartnerId(user.id, 'familyapi');
      if (!isFamilyApiActive) {
        newFamilyBalance = 0;
        console.log('⏭️ [Balance] FamilyAPI 비활성화됨 또는 미구현');
      } else {
        // TODO: FamilyAPI 조회 로직 구현
        console.log('⏭️ [Balance] FamilyAPI 구현 대기 중');
        newFamilyBalance = 0;
      }

      // ✅ partners.balance만 업데이트 (활성 API의 합산값)
      const totalBalance = newInvestBalance + newOroBalance + newFamilyBalance + newHonorBalance;
      
      const { error: updateError } = await supabase
        .from('partners')
        .update({
          balance: totalBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('❌ [Balance] partners.balance 업데이트 실패:', updateError);
      } else {
        console.log('✅ [Balance] partners.balance 업데이트 완료:', { 
          partnerId: user.id,
          balance: totalBalance,
          breakdown: { invest: newInvestBalance, oroplay: newOroBalance, honor: newHonorBalance }
        });
      }

      setBalance(totalBalance);
      setLastSyncTime(new Date());
      setError(null);

      if (isManual) {
        toast.success(`보유금 동기화 완료`);
      }
    } catch (err: any) {
      console.error('❌ [Balance] API 동기화 오류:', err);
      setError(err.message || 'API 동기화 오류');
      if (isManual) {
        toast.error(`동기화 오류: ${err.message}`);
      }
    } finally {
      isSyncingRef.current = false;
      if (isManual) {
        setLoading(false);
      }
    }
  }, [user]);

  const syncBalance = useCallback(async () => {
    if (!user?.id) return;

    if (user.level === 1) {
      await syncBalanceFromAPI(true);
    } else {
      await loadBalanceFromDB();
    }
  }, [user, syncBalanceFromAPI, loadBalanceFromDB]);

  useEffect(() => {
    if (!user?.id) return;
    loadBalanceFromDB();
  }, [user?.id, loadBalanceFromDB]);

  // ❌ 주기적 balance 동기화 제거 (GMS 머니는 동기화 불필요, Realtime 이벤트만 사용)

  useEffect(() => {
    if (!user?.id) return;

    // 이전 구독 정리
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    const partnersChannel = supabase
      .channel(`partner_balance_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'partners',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          // ✅ partners.balance만 감지
          const newBalance = parseFloat(payload.new?.balance) || 0;
          setBalance(newBalance);
          setLastSyncTime(new Date());
          setError(null);
        }
      )
      .subscribe((status) => {
        console.log('📡 [BalanceContext] Partners 채널 상태:', status);
      });

    channelsRef.current.push(partnersChannel);

    // ✅ api_configs는 backend 동기화용이고, 프론트엔드는 partners만 읽으므로 별도 구독 불필요

    return () => {
      console.log('🧹 [BalanceContext] 채널 정리:', channelsRef.current.length);
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [user?.id, user?.level]);

  return (
    <BalanceContext.Provider value={{
      balance,
      investBalance,
      oroplayBalance,
      familyapiBalance,
      honorapiBalance,
      loading,
      error,
      lastSyncTime,
      syncBalance,
      useInvestApi,
      useOroplayApi,
      useFamilyApi,
      useHonorApi
    }}>
      {children}
    </BalanceContext.Provider>
  );
}
