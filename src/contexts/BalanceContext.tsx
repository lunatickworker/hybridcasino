import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getInfo } from '../lib/investApi';
import { Partner } from '../types';
import { toast } from 'sonner@2.0.3';

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
      console.log('⚠️ [Balance] user.id 없음, 로드 중단');
      return;
    }

    console.log('💾 [Balance] DB에서 초기 보유금 로드 시작:', {
      partner_id: user.id,
      nickname: user.nickname,
      level: user.level
    });

    try {
      // partners 테이블에서 기본 balance 조회
      const { data, error: dbError } = await supabase
        .from('partners')
        .select('balance')
        .eq('id', user.id)
        .single();

      if (dbError) {
        console.error('❌ [Balance] partners 테이블 조회 실패:', dbError);
        setError(dbError.message);
        return;
      }

      const currentBalance = data?.balance || 0;
      setBalance(currentBalance);
      console.log('✅ [Balance] partners balance 로드:', currentBalance);

      // Lv1: api_configs 조회 (+ API 활성화 설정), Lv2: partners 조회
      if (user.level === 1) {
        // Lv1은 api_configs 사용
        console.log('💾 [Balance] [Lv1] api_configs 조회 시작...');
        const { data: apiConfigData, error: apiConfigError } = await supabase
          .from('api_configs')
          .select('invest_balance, oroplay_balance, use_invest_api, use_oroplay_api')
          .eq('partner_id', user.id)
          .maybeSingle();

        if (apiConfigError) {
          console.error('❌ [Balance] api_configs 조회 실패:', apiConfigError);
        }

        console.log('🔍 [Balance] api_configs 조회 결과:', {
          hasData: !!apiConfigData,
          data: apiConfigData
        });

        if (apiConfigData) {
          const investRaw = apiConfigData.invest_balance;
          const oroRaw = apiConfigData.oroplay_balance;
          
          const invest = typeof investRaw === 'number' && !isNaN(investRaw) ? investRaw : 0;
          const oro = typeof oroRaw === 'number' && !isNaN(oroRaw) ? oroRaw : 0;
          
          // ✅ API 활성화 설정 로드
          const useInvest = apiConfigData.use_invest_api !== false; // 기본값 true
          const useOro = apiConfigData.use_oroplay_api !== false;   // 기본값 true
          
          console.log('📊 [Balance] API별 잔고 파싱:', {
            invest_balance_raw: investRaw,
            oroplay_balance_raw: oroRaw,
            invest_balance_parsed: invest,
            oroplay_balance_parsed: oro,
            use_invest_api: useInvest,
            use_oroplay_api: useOro
          });
          
          setInvestBalance(invest);
          setOroplayBalance(oro);
          setUseInvestApi(useInvest);
          setUseOroplayApi(useOro);
        } else {
          console.log('ℹ️ [Balance] api_configs 레코드 없음 - 0으로 초기화');
          setInvestBalance(0);
          setOroplayBalance(0);
          setUseInvestApi(true);
          setUseOroplayApi(true);
        }

        console.log('✅ [Balance] [Lv1] DB 로드 완료:', {
          balance: currentBalance,
          investBalance: apiConfigData?.invest_balance || 0,
          oroplayBalance: apiConfigData?.oroplay_balance || 0
        });
      } else if (user.level === 2) {
        // Lv2는 partners 테이블의 invest_balance, oroplay_balance 사용 + Lv1 API 설정 조회
        console.log('💾 [Balance] [Lv2] partners 테이블에서 invest_balance/oroplay_balance 조회...');
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('invest_balance, oroplay_balance')
          .eq('id', user.id)
          .single();

        if (partnerError) {
          console.error('❌ [Balance] partners 조회 실패:', partnerError);
          setInvestBalance(0);
          setOroplayBalance(0);
        } else {
          const investRaw = partnerData?.invest_balance;
          const oroRaw = partnerData?.oroplay_balance;
          
          const invest = typeof investRaw === 'number' && !isNaN(investRaw) ? investRaw : 0;
          const oro = typeof oroRaw === 'number' && !isNaN(oroRaw) ? oroRaw : 0;
          
          console.log('📊 [Balance] [Lv2] partners 테이블 잔고 파싱:', {
            invest_balance_raw: investRaw,
            oroplay_balance_raw: oroRaw,
            invest_balance_parsed: invest,
            oroplay_balance_parsed: oro
          });
          
          setInvestBalance(invest);
          setOroplayBalance(oro);

          console.log('✅ [Balance] [Lv2] DB 로드 완료:', {
            balance: currentBalance,
            investBalance: invest,
            oroplayBalance: oro
          });
        }
        
        // ✅ Lv2는 Lv1의 API 설정을 따름
        const { data: lv1Config } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .limit(1)
          .single();
          
        if (lv1Config) {
          const { data: apiConfig } = await supabase
            .from('api_configs')
            .select('use_invest_api, use_oroplay_api')
            .eq('partner_id', lv1Config.id)
            .single();
            
          if (apiConfig) {
            setUseInvestApi(apiConfig.use_invest_api !== false);
            setUseOroplayApi(apiConfig.use_oroplay_api !== false);
          }
        }
      } else {
        // Lv3 이상은 API별 잔고 없음, Lv1의 API 설정만 조회
        console.log('ℹ️ [Balance] [Lv3+] API별 잔고 없음');
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
          const { data: apiConfig } = await supabase
            .from('api_configs')
            .select('use_invest_api, use_oroplay_api')
            .eq('partner_id', lv1Config.id)
            .single();
            
          if (apiConfig) {
            setUseInvestApi(apiConfig.use_invest_api !== false);
            setUseOroplayApi(apiConfig.use_oroplay_api !== false);
          }
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
      console.log('ℹ️ [Balance] Lv2 이하는 Invest+OroPlay 잔고 동기화 스킵 (현재 Lv:', user.level, ')');
      return;
    }

    // ✅ 상위 대본사의 opcode 조회 (opcodeHelper 사용)
    let opcode: string;
    let secretKey: string;
    let apiToken: string;

    try {
      const { getAdminOpcode, isMultipleOpcode } = await import('../lib/opcodeHelper');
      
      console.log('🔍 [Balance] 상위 대본사 opcode 조회 시작');
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
        console.log('✅ [Balance] 시스템관리자 - 첫 번째 opcode 사용:', opcode);
      } else {
        opcode = opcodeInfo.opcode;
        secretKey = opcodeInfo.secretKey;
        apiToken = opcodeInfo.token;
        console.log('✅ [Balance] 상위 대본사 opcode 조회 성공:', opcode);
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
      console.log('⏳ [Balance] 이미 동기화 중...');
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
      
      console.log(`📡 [Balance] API ${apiEndpoint} 호출 시작:`, {
        partner_id: user.id,
        level: user.level,
        opcode: opcode
      });

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

      console.log('📊 [Balance] API 응답:', JSON.stringify(apiData, null, 2));

      // GET /api/info 응답 파싱 (Lv1 시스템관리자만)
      if (apiData) {
        if (typeof apiData === 'object' && !apiData.is_text) {
          if (apiData.RESULT === true && apiData.DATA) {
            newBalance = parseFloat(apiData.DATA.balance || 0);
          } else if (apiData.balance !== undefined) {
            newBalance = parseFloat(apiData.balance || 0);
          }
        } else if (apiData.is_text && apiData.text_response) {
          const balanceMatch = apiData.text_response.match(/balance[\"'\\s:]+(\\d+\\.?\\d*)/i);
          if (balanceMatch) {
            newBalance = parseFloat(balanceMatch[1]);
          }
        }
      }

      console.log('💰 [Balance] Invest API 파싱된 보유금:', newBalance);

      // =====================================================
      // 🔥 OroPlay API 잔고 조회 (GET /agent/balance) - Lv1만
      // =====================================================
      let oroBalance = 0;
      
      try {
        console.log('📡 [Balance] OroPlay credentials 확인 중...');
        
        const { data: apiConfig } = await supabase
          .from('api_configs')
          .select('oroplay_client_id, oroplay_client_secret')
          .eq('partner_id', user.id)
          .maybeSingle();
        
        if (!apiConfig?.oroplay_client_id || !apiConfig?.oroplay_client_secret) {
          const errorMsg = `Lv1 시스템관리자의 OroPlay credentials가 설정되지 않았습니다. api_configs 테이블을 확인하세요.`;
          console.error('❌ [Balance]', errorMsg);
          throw new Error(errorMsg);
        }
        
        const { getAgentBalance, getOroPlayToken } = await import('../lib/oroplayApi');
        
        console.log('📡 [Balance] OroPlay API 잔고 조회 시작...');
        console.log('📡 [Balance] Partner ID:', user.id);
        
        const oroToken = await getOroPlayToken(user.id);
        console.log('📡 [Balance] OroPlay Token 조회 성공');
        
        console.log('📡 [Balance] GET /agent/balance 호출 중...');
        const rawOroBalance = await getAgentBalance(oroToken);
        
        // ✅ NaN 방지: 숫자가 아니거나 NaN이면 0으로 처리
        oroBalance = typeof rawOroBalance === 'number' && !isNaN(rawOroBalance) ? rawOroBalance : 0;
        
        console.log('✅ [Balance] OroPlay API 잔고 조회 성공:', {
          raw: rawOroBalance,
          parsed: oroBalance
        });
        
        // api_configs 테이블 업데이트
        const { error: oroUpdateError } = await supabase
          .from('api_configs')
          .update({ 
            oroplay_balance: oroBalance,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', user.id);
        
        if (oroUpdateError) {
          console.error('❌ [Balance] OroPlay 잔고 DB 저장 실패:', oroUpdateError);
        } else {
          console.log('✅ [Balance] OroPlay 잔고 DB 저장 완료');
        }
          
      } catch (oroErr: any) {
        console.error('❌ [Balance] OroPlay API 잔고 조회 실패:', oroErr);
        console.error('❌ [Balance] 에러 메시지:', oroErr.message);
        if (isManual) {
          toast.error(`OroPlay 잔고 조회 실패: ${oroErr.message}`, { duration: 5000 });
        }
        throw oroErr;
      }

      // api_configs 테이블에 Invest 잔고 업데이트
      await supabase
        .from('api_configs')
        .update({ 
          invest_balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('partner_id', user.id);

      // ⚠️ Lv1은 partners.balance를 사용하지 않음 (외부 API 지갑만 사용)
      // Lv1의 보유금은 api_configs.invest_balance + api_configs.oroplay_balance만 사용
      console.log('ℹ️ [Balance] Lv1은 partners.balance를 업데이트하지 않음 (설계 정책)');
      console.log('ℹ️ [Balance] Lv1 보유금 = api_configs.invest_balance + api_configs.oroplay_balance');

      // ✅ 항상 State 업데이트 (에러 여부 무관)
      setInvestBalance(newBalance);
      setOroplayBalance(oroBalance);
      setBalance(newBalance + oroBalance);  // 🔧 수정: Lv1은 Invest + OroPlay 합계
      setLastSyncTime(new Date());
      setError(null);
      
      console.log('✅ [Balance] React State 업데이트 완료:', {
        invest: newBalance,
        oroplay: oroBalance,
        balance: newBalance + oroBalance  // 🔧 수정: 합계 표시
      });
      
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

    // ✅ 항상 API 동기화 시도 (내부에서 DB 재조회함)
    // isManual = true: 수동 동기화 (loading 표시, 토스트 메시지)
    await syncBalanceFromAPI(true);
  }, [user, syncBalanceFromAPI]);

  // =====================================================
  // 4. 초기 로드 (컴포넌트 마운트 시 한 번만)
  // =====================================================
  
  useEffect(() => {
    if (!user?.id) return;

    console.log('🔄 [Balance] 초기화:', {
      partner_id: user.id,
      nickname: user.nickname,
      level: user.level,
      has_opcode: !!user.opcode,
      has_secret_key: !!user.secret_key
    });

    // ✅ 1단계: DB에서 초기 보유금 로드 (즉시 화면 표시)
    loadBalanceFromDB();

    // ⭐ 2단계: API 동기화 삭제됨 (사용자 요청: 보유금 카드 클릭 시에만 호출)
    // isManual = false: 자동 동기화 (loading 미표시, 토스트 없음)
    // console.log('📡 [Balance] 로그인 시 자동 동기화 시작 (Lv1만)');
    // syncBalanceFromAPI(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // =====================================================
  // 5. 30초 주기 자동 동기화 (Lv1만) - ❌ 삭제됨
  // =====================================================
  // ⭐ 사용자 요청: 자동 호출 제거, 보유금 카드 클릭 시에만 API 호출
  // useEffect(() => {
  //   if (!user?.id || user.level !== 1) return;
  //   
  //   console.log('⏰ [Balance] 30초 주기 자동 동기화 시작 (Lv1만)');
  //   
  //   // 30초마다 양쪽 API 잔고 동기화
  //   const syncInterval = setInterval(() => {
  //     console.log('🔄 [Balance] 30초 타이머 - Invest & OroPlay 잔고 동기화');
  //     // isManual = false: 자동 동기화 (loading 미표시, 토스트 없음)
  //     syncBalanceFromAPI(false);
  //   }, 30000); // 30초
  //   
  //   return () => {
  //     console.log('🛑 [Balance] 30초 주기 동기화 중지');
  //     clearInterval(syncInterval);
  //   };
  // }, [user?.id, user?.level, syncBalanceFromAPI]);

  // =====================================================
  // 6. Realtime 구독: partners 테이블 + api_configs 테이블 변경 감지
  // =====================================================
  
  useEffect(() => {
    if (!user?.id) return;

    console.log('🔔 [Balance] Realtime 구독 시작:', user.id);

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

          console.log('💰 [Balance] partners Realtime 업데이트 감지:', {
            old: oldBalance,
            new: newBalance,
            change: newBalance - oldBalance,
            level: user.level
          });

          setBalance(newBalance);
          setLastSyncTime(new Date());
          setError(null);
          
          // ✅ Lv2의 경우 invest_balance, oroplay_balance도 함께 업데이트
          if (user.level === 2) {
            const newInvest = parseFloat(payload.new?.invest_balance) || 0;
            const newOro = parseFloat(payload.new?.oroplay_balance) || 0;
            
            console.log('💰 [Balance] [Lv2] partners API별 잔고 업데이트:', {
              invest: newInvest,
              oro: newOro
            });
            
            setInvestBalance(newInvest);
            setOroplayBalance(newOro);
          }
          
          // ✅ 토스트 메시지 제거 (자동 동기화 시 깜박임 방지)
        }
      )
      .subscribe();

    // api_configs 테이블 구독
    const apiConfigsChannel = supabase
      .channel(`api_configs_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'api_configs',
          filter: `partner_id=eq.${user.id}`
        },
        (payload) => {
          console.log('🔔 [Balance] api_configs Realtime 업데이트 감지:', payload);

          const newData = payload.new as any;
          if (newData) {
            // ✅ NaN 방지: 숫자가 아니거나 NaN이면 0으로 처리
            const investRaw = newData.invest_balance;
            const oroRaw = newData.oroplay_balance;
            
            const invest = typeof investRaw === 'number' && !isNaN(investRaw) ? investRaw : 0;
            const oro = typeof oroRaw === 'number' && !isNaN(oroRaw) ? oroRaw : 0;

            console.log('📊 [Balance] API별 잔고 Realtime 업데이트:', {
              invest_raw: investRaw,
              oro_raw: oroRaw,
              invest,
              oro
            });

            setInvestBalance(invest);
            setOroplayBalance(oro);
            setLastSyncTime(new Date());
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔕 [Balance] Realtime 구독 해제:', user.id);
      supabase.removeChannel(partnersChannel);
      supabase.removeChannel(apiConfigsChannel);
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
