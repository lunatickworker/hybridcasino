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

  const loadBalanceFromDB = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    try {
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
        return;
      }

      if (!data) {
        setBalance(0);
        setLoading(false);
        return;
      }

      const currentBalance = data?.balance || 0;
      setBalance(currentBalance);

      if (user.level === 1) {
        const { data: investData } = await supabase
          .from('api_configs')
          .select('balance, is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'invest')
          .maybeSingle();

        const { data: oroplayData } = await supabase
          .from('api_configs')
          .select('balance, is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();

        const { data: familyapiData } = await supabase
          .from('api_configs')
          .select('balance, is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'familyapi')
          .maybeSingle();

        const { data: honorapiData } = await supabase
          .from('api_configs')
          .select('balance, is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'honorapi')
          .maybeSingle();

        const invest = parseFloat(investData?.balance?.toString() || '0') || 0;
        const oro = parseFloat(oroplayData?.balance?.toString() || '0') || 0;
        const family = parseFloat(familyapiData?.balance?.toString() || '0') || 0;
        const honor = parseFloat(honorapiData?.balance?.toString() || '0') || 0;

        setInvestBalance(invest);
        setOroplayBalance(oro);
        setFamilyapiBalance(family);
        setHonorapiBalance(honor);
        setUseInvestApi(investData?.is_active !== false);
        setUseOroplayApi(oroplayData?.is_active !== false);
        setUseFamilyApi(familyapiData?.is_active !== false);
        setUseHonorApi(honorapiData?.is_active !== false);

      } else if (user.level === 2) {
        const { data: lv2Data } = await supabase
          .from('partners')
          .select('invest_balance, oroplay_balance, familyapi_balance, honorapi_balance')
          .eq('id', user.id)
          .single();

        if (lv2Data) {
          setInvestBalance(parseFloat(lv2Data.invest_balance?.toString() || '0') || 0);
          setOroplayBalance(parseFloat(lv2Data.oroplay_balance?.toString() || '0') || 0);
          setFamilyapiBalance(parseFloat(lv2Data.familyapi_balance?.toString() || '0') || 0);
          setHonorapiBalance(parseFloat(lv2Data.honorapi_balance?.toString() || '0') || 0);
        }

        const { data: lv1Config } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .limit(1)
          .single();

        if (lv1Config) {
          const { data: investConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'invest')
            .maybeSingle();

          const { data: oroplayConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'oroplay')
            .maybeSingle();

          const { data: familyapiConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'familyapi')
            .maybeSingle();

          const { data: honorapiConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'honorapi')
            .maybeSingle();

          setUseInvestApi(investConfig?.is_active !== false);
          setUseOroplayApi(oroplayConfig?.is_active !== false);
          setUseFamilyApi(familyapiConfig?.is_active !== false);
          setUseHonorApi(honorapiConfig?.is_active !== false);
        }
      } else {
        setInvestBalance(0);
        setOroplayBalance(0);
        setFamilyapiBalance(0);
        setHonorapiBalance(0);

        const { data: lv1Config } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .limit(1)
          .single();

        if (lv1Config) {
          const { data: investConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'invest')
            .maybeSingle();

          const { data: oroplayConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'oroplay')
            .maybeSingle();

          const { data: familyapiConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'familyapi')
            .maybeSingle();

          const { data: honorapiConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'honorapi')
            .maybeSingle();

          setUseInvestApi(investConfig?.is_active !== false);
          setUseOroplayApi(oroplayConfig?.is_active !== false);
          setUseFamilyApi(familyapiConfig?.is_active !== false);
          setUseHonorApi(honorapiConfig?.is_active !== false);
        }
      }

      setLastSyncTime(new Date());
      setError(null);
    } catch (err: any) {
      console.error('❌ [Balance] DB 조회 오류:', err);
      setError(err.message || 'DB 조회 오류');
    }
  }, [user]);

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

      try {
        const { data: oroConfig } = await supabase
          .from('api_configs')
          .select('client_id, client_secret')
          .eq('partner_id', user.id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();

        if (!oroConfig?.client_id || !oroConfig?.client_secret) {
          const errorMsg = `OroPlay credentials가 설정되지 않았습니다.`;
          console.error('❌ [Balance]', errorMsg);
          if (isManual) {
            toast.error(errorMsg);
          }
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
        console.error('❌ [Balance] OroPlay API 잔고 조회 실패:', oroErr);
        if (isManual) {
          toast.error(`OroPlay 잔고 조회 실패: ${oroErr.message}`);
        }
      }

      setInvestBalance(newInvestBalance);
      setOroplayBalance(newOroBalance);
      setFamilyapiBalance(newFamilyBalance);
      setHonorapiBalance(newHonorBalance);
      setBalance(newInvestBalance + newOroBalance + newFamilyBalance + newHonorBalance);
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
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

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
          const newBalance = parseFloat(payload.new?.balance) || 0;
          setBalance(newBalance);

          if (user.level === 2) {
            setInvestBalance(parseFloat(payload.new?.invest_balance) || 0);
            setOroplayBalance(parseFloat(payload.new?.oroplay_balance) || 0);
            setFamilyapiBalance(parseFloat(payload.new?.familyapi_balance) || 0);
          }

          setLastSyncTime(new Date());
          setError(null);
        }
      )
      .subscribe();

    let apiConfigsChannel: any = null;

    if (user.level === 1) {
      apiConfigsChannel = supabase
        .channel(`api_configs_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'api_configs',
            filter: `partner_id=eq.${user.id}`
          },
          (payload) => {
            const apiProvider = payload.new?.api_provider;
            const newBalance = parseFloat(payload.new?.balance) || 0;

            if (apiProvider === 'invest') {
              setInvestBalance(newBalance);
            } else if (apiProvider === 'oroplay') {
              setOroplayBalance(newBalance);
            } else if (apiProvider === 'familyapi') {
              setFamilyapiBalance(newBalance);
            } else if (apiProvider === 'honorapi') {
              setHonorapiBalance(newBalance);
            }

            const isActive = payload.new?.is_active;
            if (isActive !== undefined) {
              if (apiProvider === 'invest') setUseInvestApi(isActive);
              else if (apiProvider === 'oroplay') setUseOroplayApi(isActive);
              else if (apiProvider === 'familyapi') setUseFamilyApi(isActive);
              else if (apiProvider === 'honorapi') setUseHonorApi(isActive);
            }

            setLastSyncTime(new Date());
            setError(null);
          }
        )
        .subscribe();
    }

    return () => {
      supabase.removeChannel(partnersChannel);
      if (apiConfigsChannel) {
        supabase.removeChannel(apiConfigsChannel);
      }
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
