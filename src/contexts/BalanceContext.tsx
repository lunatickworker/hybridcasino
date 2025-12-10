import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getInfo } from '../lib/investApi';
import { Partner } from '../types';
import { toast } from 'sonner@2.0.3';
import { useLanguage } from './LanguageContext';

interface BalanceContextType {
  balance: number;
  investBalance: number;
  oroplayBalance: number;
  loading: boolean;
  error: string | null;
  lastSyncTime: Date | null;
  syncBalance: () => Promise<void>;
  useInvestApi: boolean;  // ✅ API 활성화 상태
  useOroplayApi: boolean; // ✅ API 활성화 상태
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
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [useInvestApi, setUseInvestApi] = useState<boolean>(true);   // ✅ API 활성화 상태
  const [useOroplayApi, setUseOroplayApi] = useState<boolean>(true); // ✅ API 활성화 상태
  const isSyncingRef = useRef<boolean>(false);

  // =====================================================
  // 1. DB에서 초기 보유금 로드 (한 번만)
  // =====================================================
  
  const loadBalanceFromDB = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    try {
      // partners 테이블에서 기본 balance 조회
      const { data, error: dbError } = await supabase
        .from('partners')
        .select('balance')
        .eq('id', user.id)
        .single();

      if (dbError) {
        // Supabase 연결 안 됨 - 조용히 실패
        if (dbError?.message?.includes('Failed to fetch')) {
          setLoading(false);
          return;
        }
        console.error('❌ [Balance] partners 테이블 조회 실패:', dbError);
        setError(dbError.message);
        return;
      }

      const currentBalance = data?.balance || 0;
      setBalance(currentBalance);

      // Lv1: api_configs 조회 (+ API 활성화 설정), Lv2: partners 조회
      if (user.level === 1) {
        // Lv1은 api_configs 사용 (새 구조: api_provider별 분리)
        
        // Invest API 잔액 조회
        const { data: investData, error: investError } = await supabase
          .from('api_configs')
          .select('balance, is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'invest')
          .maybeSingle();

        if (investError) {
          console.error('❌ [Balance] Invest api_config 조회 실패:', investError);
        }

        // OroPlay API 잔액 조회
        const { data: oroplayData, error: oroplayError } = await supabase
          .from('api_configs')
          .select('balance, is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();

        if (oroplayError) {
          console.error('❌ [Balance] OroPlay api_config 조회 실패:', oroplayError);
        }

        const investRaw = investData?.balance;
        const oroRaw = oroplayData?.balance;
        
        const invest = typeof investRaw === 'number' && !isNaN(investRaw) ? investRaw : 0;
        const oro = typeof oroRaw === 'number' && !isNaN(oroRaw) ? oroRaw : 0;
        
        // ✅ API 활성화 설정 로드
        const useInvest = investData?.is_active !== false; // 기본값 true
        const useOro = oroplayData?.is_active !== false;   // 기본값 true
        
        setInvestBalance(invest);
        setOroplayBalance(oro);
        setUseInvestApi(useInvest);
        setUseOroplayApi(useOro);

      } else if (user.level === 2) {
        // Lv2는 partners 테이블에서 invest_balance + oroplay_balance 조회
        
        const { data: lv2Data, error: lv2Error } = await supabase
          .from('partners')
          .select('invest_balance, oroplay_balance')
          .eq('id', user.id)
          .single();
        
        // 변수를 블록 밖에서 선언
        let invest = 0;
        let oro = 0;
        
        if (lv2Error) {
          console.error('❌ [Balance] Lv2 partners 조회 실패:', lv2Error);
        } else {
          const investRaw = lv2Data?.invest_balance;
          const oroRaw = lv2Data?.oroplay_balance;
          
          invest = typeof investRaw === 'number' && !isNaN(investRaw) ? investRaw : 0;
          oro = typeof oroRaw === 'number' && !isNaN(oroRaw) ? oroRaw : 0;
          
          setInvestBalance(invest);
          setOroplayBalance(oro);
        }
        
        // Lv1의 API 설정을 따름
        const { data: lv1Config } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .limit(1)
          .single();
          
        if (lv1Config) {
          // Invest API 활성화 상태
          const { data: investConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'invest')
            .maybeSingle();
          
          // OroPlay API 활성화 상태  
          const { data: oroplayConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'oroplay')
            .maybeSingle();
            
          setUseInvestApi(investConfig?.is_active !== false);
          setUseOroplayApi(oroplayConfig?.is_active !== false);
        }
        
      } else {
        // Lv3 이상은 API별 잔고 없음, Lv1의 API 설정만 조회
        setInvestBalance(0);
        setOroplayBalance(0);
        
        // ✅ Lv3+도 Lv1의 API 설정을 따름
        const { data: lv1Config } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .limit(1)
          .single();
          
        if (lv1Config) {
          // Invest API 활성화 상태
          const { data: investConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'invest')
            .maybeSingle();
          
          // OroPlay API 활성화 상태  
          const { data: oroplayConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'oroplay')
            .maybeSingle();
            
          setUseInvestApi(investConfig?.is_active !== false);
          setUseOroplayApi(oroplayConfig?.is_active !== false);
        }
      }

      setLastSyncTime(new Date());
      setError(null);
    } catch (err: any) {
      console.error('❌ [Balance] DB 조회 오류:', err);
      setError(err.message || 'DB 조회 오류');
    }
  }, [user]);

  // =====================================================
  // 2. API 동기화 (Lv1만 Invest+OroPlay 잔고 동기화)
  // =====================================================
  
  const syncBalanceFromAPI = useCallback(async (isManual: boolean = false) => {
    if (!user?.id) return;

    // ✅ Lv2 이하는 잔고 동기화 안 함
    if (user.level !== 1) {
      return;
    }

    // ✅ 상위 대본사의 opcode 조회 (opcodeHelper 사용)
    let opcode: string;
    let secretKey: string;
    let apiToken: string;

    try {
      const { getAdminOpcode, isMultipleOpcode } = await import('../lib/opcodeHelper');
      
      const opcodeInfo = await getAdminOpcode(user);
      
      // 시스템 관리자인 경우 첫 번째 opcode 사용
      if (isMultipleOpcode(opcodeInfo)) {
        if (opcodeInfo.opcodes.length === 0) {
          const errorMsg = '사용 가능한 OPCODE가 없습니다. 시스템 관리자에게 문의하세요.';
          throw new Error(errorMsg);
        }
        opcode = opcodeInfo.opcodes[0].opcode;
        secretKey = opcodeInfo.opcodes[0].secretKey;
        apiToken = opcodeInfo.opcodes[0].token;
      } else {
        opcode = opcodeInfo.opcode;
        secretKey = opcodeInfo.secretKey;
        apiToken = opcodeInfo.token;
      }
    } catch (err: any) {
      console.error('❌ [Balance] opcode 조회 실패:', err);
      const errorMsg = `상위 대본사 API 설정 조회 실패: ${err.message}`;
      setError(errorMsg);
      if (isManual) {
        toast.error(errorMsg, { duration: 5000 });
      }
      return;
    }

    if (isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;
    // ✅ 수동 동기화일 때만 loading 표시 (자동 동기화는 백그라운드 처리)
    if (isManual) {
      setLoading(true);
    }

    try {
      // ✅ Lv1만 GET /api/info 호출
      const apiEndpoint = '/api/info';

      const apiStartTime = Date.now();
      const apiResult = await getInfo(opcode, secretKey);
      const apiDuration = Date.now() - apiStartTime;

      // API 호출 로그 기록
      await supabase.from('api_sync_logs').insert({
        opcode: opcode,
        api_endpoint: apiEndpoint,
        sync_type: 'manual_balance_sync',
        status: apiResult.error ? 'failed' : 'success',
        request_data: {
          opcode: opcode,
          partner_id: user.id,
          partner_nickname: user.nickname
        },
        response_data: apiResult.error ? { error: apiResult.error } : apiResult.data,
        duration_ms: apiDuration,
        error_message: apiResult.error || null
      });

      if (apiResult.error) {
        console.error('❌ [Balance] API 호출 실패:', apiResult.error);
        setError(apiResult.error);
        if (isManual) {
          toast.error(`API 동기화 실패: ${apiResult.error}`);
        }
        return;
      }

      // API 응답 파싱
      const apiData = apiResult.data;
      let newBalance = 0;

      // GET /api/info 응답 파싱 (Lv1 시스템관리자만)
      if (apiData) {
        if (typeof apiData === 'object' && !apiData.is_text) {
          if (apiData.RESULT === true && apiData.DATA) {
            newBalance = parseFloat(apiData.DATA.balance || 0);
          } else if (apiData.balance !== undefined) {
            newBalance = parseFloat(apiData.balance || 0);
          }
        } else if (apiData.is_text && apiData.text_response) {
          const balanceMatch = apiData.text_response.match(/balance[\"'\\\s:]+(\\d+\\.?\\d*)/i);
          if (balanceMatch) {
            newBalance = parseFloat(balanceMatch[1]);
          }
        }
      }

      // =====================================================
      // 🔥 OroPlay API 잔고 조회 (GET /agent/balance) - Lv1만
      // =====================================================
      let oroBalance = 0;
      
      try {
        // OroPlay API config 조회 (새 구조: api_provider='oroplay')
        const { data: oroConfig } = await supabase
          .from('api_configs')
          .select('oroplay_client_id, oroplay_client_secret')
          .eq('partner_id', user.id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();
        
        if (!oroConfig?.oroplay_client_id || !oroConfig?.oroplay_client_secret) {
          const errorMsg = `Lv1 시스템관리자의 OroPlay credentials가 설정되지 않았습니다. api_configs 테이블을 확인하세요.`;
          console.error('❌ [Balance]', errorMsg);
          throw new Error(errorMsg);
        }
        
        const { getAgentBalance, getOroPlayToken } = await import('../lib/oroplayApi');
        
        const oroToken = await getOroPlayToken(user.id);
        
        const rawOroBalance = await getAgentBalance(oroToken);
        
        // ✅ NaN 방지: 숫자가 아니거나 NaN이면 0으로 처리
        oroBalance = typeof rawOroBalance === 'number' && !isNaN(rawOroBalance) ? rawOroBalance : 0;
        
        // api_configs 테이블 업데이트 (새 구조: api_provider별)
        const { error: oroUpdateError } = await supabase
          .from('api_configs')
          .update({ 
            balance: oroBalance,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', user.id)
          .eq('api_provider', 'oroplay');
        
        if (oroUpdateError) {
          console.error('❌ [Balance] OroPlay 잔고 DB 저장 실패:', oroUpdateError);
        }
          
      } catch (oroErr: any) {
        console.error('❌ [Balance] OroPlay API 잔고 조회 실패:', oroErr);
        console.error('❌ [Balance] 에러 메시지:', oroErr.message);
        if (isManual) {
          toast.error(`OroPlay 잔고 조회 실패: ${oroErr.message}`, { duration: 5000 });
        }
        throw oroErr;
      }

      // api_configs 테이블에 Invest 잔고 업데이트 (새 구조: api_provider별)
      await supabase
        .from('api_configs')
        .update({ 
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', user.id)
        .eq('api_provider', 'invest');

      // ⚠️ Lv1은 partners.balance를 사용하지 않음 (외부 API 지갑만 사용)
      // Lv1의 보유금은 api_configs (invest + oroplay 각각의 balance) 사용

      // ✅ 항상 State 업데이트 (에러 여부 무관)
      setInvestBalance(newBalance);
      setOroplayBalance(oroBalance);
      setBalance(newBalance + oroBalance);  // 🔧 수정: Lv1은 Invest + OroPlay 합계
      setLastSyncTime(new Date());
      setError(null);
      
      // ✅ 수동 동기화일 때만 성공 토스트 표시
      if (isManual) {
        toast.success(`보유금 동기화 완료 | Invest: ₩${newBalance.toLocaleString()} | Oro: ₩${oroBalance.toLocaleString()}`, { duration: 3000 });
      }
    } catch (err: any) {
      console.error('❌ [Balance] API 동기화 오류:', err);
      setError(err.message || 'API 동기화 오류');
      if (isManual) {
        toast.error(`동기화 오류: ${err.message}`);
      }
    } finally {
      isSyncingRef.current = false;
      // ✅ 수동 동기화일 때만 loading 해제
      if (isManual) {
        setLoading(false);
      }
    }
  }, [user, balance]);

  // =====================================================
  // 3. 통합 동기화 함수 (외부에서 호출)
  // =====================================================
  
  const syncBalance = useCallback(async () => {
    if (!user?.id) return;

    // ✅ Lv1: API 동기화
    if (user.level === 1) {
      await syncBalanceFromAPI(true);
    } 
    // ✅ Lv2~7: DB 재조회
    else {
      await loadBalanceFromDB();
    }
  }, [user, syncBalanceFromAPI, loadBalanceFromDB]);

  // =====================================================
  // 4. 초기 로드 (컴포넌트 마운트 시 한 번만)
  // =====================================================
  
  useEffect(() => {
    if (!user?.id) return;

    // ✅ 1단계: DB에서 초기 보유금 로드 (즉시 화면 표시)
    loadBalanceFromDB();

    // ⭐ 2단계: API 동기화 삭제됨 (사용자 요청: 보유금 카드 클릭 시에만 호출)
    // isManual = false: 자동 동기화 (loading 미표시, 토스트 없음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // =====================================================
  // 5. 30초 주기 자동 동기화 (Lv1만) - ❌ 삭제됨
  // =====================================================
  // ⭐ 사용자 요청: 자동 호출 제거, 보유금 카드 클릭 시에만 API 호출

  // =====================================================
  // 6. Realtime 구독: partners 테이블 + api_configs 테이블 변경 감지
  // =====================================================
  
  useEffect(() => {
    if (!user?.id) return;

    console.log('🔔 [Realtime] partners 테이블 구독 시작:', { userId: user.id, level: user.level });

    // partners 테이블 구독
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
          const oldBalance = parseFloat(payload.old?.balance) || 0;

          setBalance(newBalance);
          
          // ✅ Lv2: invest_balance, oroplay_balance 변경 감지
          if (user.level === 2) {
            const newInvestBalance = parseFloat(payload.new?.invest_balance) || 0;
            const newOroplayBalance = parseFloat(payload.new?.oroplay_balance) || 0;
            
            setInvestBalance(newInvestBalance);
            setOroplayBalance(newOroplayBalance);
          }
          
          setLastSyncTime(new Date());
          setError(null);
          
          // ✅ 토스트 메시지 제거 (자동 동기화 시 깜박임 방지)
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(partnersChannel);
    };
  }, [user?.id]);

  return (
    <BalanceContext.Provider value={{ 
      balance, 
      investBalance, 
      oroplayBalance, 
      loading, 
      error, 
      lastSyncTime, 
      syncBalance,
      useInvestApi,   // ✅ API 활성화 상태 제공
      useOroplayApi   // ✅ API 활성화 상태 제공
    }}>
      {children}
    </BalanceContext.Provider>
  );
}