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
  useInvestApi: boolean;  // ✅ API 활성화 상태
  useOroplayApi: boolean; // ✅ API 활성화 상태
  useFamilyApi: boolean;  // ✅ API 활성화 상태
  useHonorApi: boolean;   // ✅ API 활성화 상태
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
  const [useInvestApi, setUseInvestApi] = useState<boolean>(true);   // ✅ API 활성화 상태
  const [useOroplayApi, setUseOroplayApi] = useState<boolean>(true); // ✅ API 활성화 상태
  const [useFamilyApi, setUseFamilyApi] = useState<boolean>(true);   // ✅ API 활성화 상태
  const [useHonorApi, setUseHonorApi] = useState<boolean>(true);     // ✅ API 활성화 상태
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

        // FamilyAPI 잔액 조회
        const { data: familyapiData, error: familyapiError } = await supabase
          .from('api_configs')
          .select('balance, is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'familyapi')
          .maybeSingle();

        if (familyapiError) {
          console.error('❌ [Balance] FamilyAPI api_config 조회 실패:', familyapiError);
        }

        // HonorAPI 잔액 조회
        const { data: honorapiData, error: honorapiError } = await supabase
          .from('api_configs')
          .select('balance, is_active')
          .eq('partner_id', user.id)
          .eq('api_provider', 'honorapi')
          .maybeSingle();

        if (honorapiError) {
          console.error('❌ [Balance] HonorAPI api_config 조회 실패:', honorapiError);
        }

        console.log('📊 [Balance] Lv1 api_configs 조회 결과:', {
          user_id: user.id,
          invest: investData,
          oroplay: oroplayData,
          familyapi: familyapiData,
          honorapi: honorapiData
        });

        const investRaw = investData?.balance;
        const oroRaw = oroplayData?.balance;
        const familyRaw = familyapiData?.balance;
        const honorRaw = honorapiData?.balance;
        
        const invest = typeof investRaw === 'number' && !isNaN(investRaw) ? investRaw : 0;
        const oro = typeof oroRaw === 'number' && !isNaN(oroRaw) ? oroRaw : 0;
        const family = typeof familyRaw === 'number' && !isNaN(familyRaw) ? familyRaw : 0;
        const honor = typeof honorRaw === 'number' && !isNaN(honorRaw) ? honorRaw : 0;
        
        // ✅ API 활성화 설정 로드
        const useInvest = investData?.is_active !== false; // 기본값 true
        const useOro = oroplayData?.is_active !== false;   // 기본값 true
        const useFamily = familyapiData?.is_active !== false; // 기본값 true
        const useHonor = honorapiData?.is_active !== false; // 기본값 true
        
        setInvestBalance(invest);
        setOroplayBalance(oro);
        setFamilyapiBalance(family);
        setHonorapiBalance(honor);
        setUseInvestApi(useInvest);
        setUseOroplayApi(useOro);
        setUseFamilyApi(useFamily);
        setUseHonorApi(useHonor);

      } else if (user.level === 2) {
        // Lv2는 partners 테이블에서 invest_balance + oroplay_balance + familyapi_balance + honorapi_balance 조회
        
        const { data: lv2Data, error: lv2Error } = await supabase
          .from('partners')
          .select('invest_balance, oroplay_balance, familyapi_balance, honorapi_balance')
          .eq('id', user.id)
          .single();
        
        // 변수를 블록 밖에서 선언
        let invest = 0;
        let oro = 0;
        let family = 0;
        let honor = 0;
        
        if (lv2Error) {
          console.error('❌ [Balance] Lv2 partners 조회 실패:', lv2Error);
        } else {
          const investRaw = lv2Data?.invest_balance;
          const oroRaw = lv2Data?.oroplay_balance;
          const familyRaw = lv2Data?.familyapi_balance;
          const honorRaw = lv2Data?.honorapi_balance;
          
          invest = typeof investRaw === 'number' && !isNaN(investRaw) ? investRaw : 0;
          oro = typeof oroRaw === 'number' && !isNaN(oroRaw) ? oroRaw : 0;
          family = typeof familyRaw === 'number' && !isNaN(familyRaw) ? familyRaw : 0;
          honor = typeof honorRaw === 'number' && !isNaN(honorRaw) ? honorRaw : 0;
          
          setInvestBalance(invest);
          setOroplayBalance(oro);
          setFamilyapiBalance(family);
          setHonorapiBalance(honor);
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

          // FamilyAPI 활성화 상태
          const { data: familyapiConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'familyapi')
            .maybeSingle();

          // HonorAPI 활성화 상태
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
        // Lv3 이상은 API별 잔고 없음, Lv1의 API 설정만 조회
        setInvestBalance(0);
        setOroplayBalance(0);
        setFamilyapiBalance(0);
        setHonorapiBalance(0);
        
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

          // FamilyAPI 활성화 상태
          const { data: familyapiConfig } = await supabase
            .from('api_configs')
            .select('is_active')
            .eq('partner_id', lv1Config.id)
            .eq('api_provider', 'familyapi')
            .maybeSingle();

          // HonorAPI 활성화 상태
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
      // ✅ 각 API별 잔고 변수 초기화
      let newInvestBalance = 0;
      let newOroBalance = 0;
      let newFamilyBalance = 0;
      let newHonorBalance = 0;

      // ✅ Invest API: getAllAccountBalances 호출
      console.log('💰 [Balance] Invest API 동기화 시작');
      
      // Dynamic import
      const investApiModule = await import('../lib/investApi');
      const { checkApiActiveByPartnerId } = await import('../lib/apiStatusChecker');
      
      // Lv1 파트너 ID 조회 (모든 레벨에서 Lv1의 API 설정 사용)
      let partnerId = user.id;
      
      if (user.level !== 1) {
        // Lv2+는 Lv1의 partner_id 찾기
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
        console.log('⚠️ [Balance] Invest API가 비활성화되어 있습니다. 동기화를 건너뜁니다.');
        if (isManual) {
          toast.info('Invest API가 비활성화되어 있습니다.');
        }
        newInvestBalance = 0;
      } else {
        // API 설정 조회
        const apiConfig = await investApiModule.investApi.getApiConfig(partnerId);
        
        // 전체 계정 잔고 조회
        const apiStartTime = Date.now();
        const balanceResponse = await investApiModule.investApi.getAllAccountBalances(
          apiConfig.opcode,
          apiConfig.secret_key
        );
        const apiDuration = Date.now() - apiStartTime;

        // API 호출 로그 기록
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
          console.error('❌ [Balance] API 응답 데이터:', balanceResponse.data);
          console.error('❌ [Balance] API Config:', { opcode: apiConfig.opcode, partnerId });
          setError(balanceResponse.error);
          if (isManual) {
            toast.error(`API 동기화 실패: ${balanceResponse.error}`);
          }
          return;
        }

        // API 응답 파싱
        console.log('✅ [Balance] API 응답:', balanceResponse.data);
        newInvestBalance = balanceResponse.data?.balance || 0;

        // api_configs 테이블에 Invest 잔고 업데이트 (새 구조: api_provider별)
        await supabase
          .from('api_configs')
          .update({ 
            balance: newInvestBalance,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', user.id)
          .eq('api_provider', 'invest');
      }

      // =====================================================
      // 🔥 OroPlay API 잔고 조회 (GET /agent/balance) - Lv1만
      // =====================================================
      try {
        // OroPlay API config 조회 (새 구조: api_provider='oroplay')
        const { data: oroConfig } = await supabase
          .from('api_configs')
          .select('client_id, client_secret')
          .eq('partner_id', user.id)
          .eq('api_provider', 'oroplay')
          .maybeSingle();
        
        if (!oroConfig?.client_id || !oroConfig?.client_secret) {
          const errorMsg = `Lv1 시스템관리자의 OroPlay credentials가 설정되지 않았습니다. api_configs 테이블을 확인하세요.`;
          console.error('❌ [Balance]', errorMsg);
          throw new Error(errorMsg);
        }
        
        const { getAgentBalance, getOroPlayToken } = await import('../lib/oroplayApi');
        
        const oroToken = await getOroPlayToken(user.id);
        
        const rawOroBalance = await getAgentBalance(oroToken);
        
        // ✅ NaN 방지: 숫자가 아니거나 NaN이면 0으로 처리
        newOroBalance = typeof rawOroBalance === 'number' && !isNaN(rawOroBalance) ? rawOroBalance : 0;
        
        // api_configs 테이블 업데이트 (새 구조: api_provider별)
        const { error: oroUpdateError } = await supabase
          .from('api_configs')
          .update({ 
            balance: newOroBalance,
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

      // FamilyAPI 잔고 동기화 시도
      try {
        // ✅ familyApi는 dynamic import
        const familyApiModule = await import('../lib/familyApi');
        const rawFamilyBalance = await familyApiModule.getAgentBalance(
          // API Key와 Token은 getFamilyApiConfig로 조회
          (await familyApiModule.getFamilyApiConfig()).apiKey,
          await familyApiModule.getFamilyApiToken(user.id)
        );
        
        newFamilyBalance = rawFamilyBalance?.credit || 0;
        
        // api_configs 테이블 업데이트
        await supabase
          .from('api_configs')
          .update({ 
            balance: newFamilyBalance,
            updated_at: new Date().toISOString()
          })
          .eq('partner_id', user.id)
          .eq('api_provider', 'familyapi');
          
      } catch (familyErr: any) {
        console.error('❌ [Balance] FamilyAPI 잔고 조회 실패:', familyErr);
      }

      // HonorAPI 잔고 동기화 시도
      try {
        // ✅ honorApi는 dynamic import
        const honorApiModule = await import('../lib/honorApi');
        const { getLv1HonorApiCredentials } = await import('../lib/apiConfigHelper');
        
        const credentials = await getLv1HonorApiCredentials(user.id);
        
        if (credentials?.api_key) {
          const agentInfo = await honorApiModule.getAgentInfo(credentials.api_key);
          newHonorBalance = parseFloat(agentInfo.balance) || 0;
          
          // api_configs 테이블 업데이트
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
        console.error('❌ [Balance] HonorAPI 잔고 조회 실패:', honorErr);
      }

      // ✅ 항상 State 업데이트 (에러 여부 무관)
      setInvestBalance(newInvestBalance);
      setOroplayBalance(newOroBalance);
      setFamilyapiBalance(newFamilyBalance);
      setHonorapiBalance(newHonorBalance);
      setBalance(newInvestBalance + newOroBalance + newFamilyBalance + newHonorBalance);  // 🔧 수정: Lv1은 Invest + OroPlay + FamilyAPI + HonorAPI 합계
      setLastSyncTime(new Date());
      setError(null);
      
      // ✅ 수동 동기화일 때만 성공 토스트 표시
      if (isManual) {
        toast.success(`보유금 동기화 완료 | Invest: ₩${newInvestBalance.toLocaleString()} | Oro: ₩${newOroBalance.toLocaleString()} | Family: ₩${newFamilyBalance.toLocaleString()} | Honor: ₩${newHonorBalance.toLocaleString()}`, { duration: 3000 });
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
            const newFamilyapiBalance = parseFloat(payload.new?.familyapi_balance) || 0;
            
            setInvestBalance(newInvestBalance);
            setOroplayBalance(newOroplayBalance);
            setFamilyapiBalance(newFamilyapiBalance);
          }
          
          setLastSyncTime(new Date());
          setError(null);
          
          // ✅ 토스트 메시지 제거 (자동 동기화 시 깜박임 방지)
        }
      )
      .subscribe();

    // ✅ Lv1: api_configs 테이블 구독 추가
    let apiConfigsChannel: any = null;
    
    if (user.level === 1) {
      console.log('🔔 [Realtime] api_configs 테이블 구독 시작 (Lv1):', { userId: user.id });
      
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
            console.log('💰 [Realtime] api_configs 업데이트 감지:', payload);
            
            const apiProvider = payload.new?.api_provider;
            const newBalance = parseFloat(payload.new?.balance) || 0;
            
            if (apiProvider === 'invest') {
              console.log('✅ [Realtime] Invest 잔고 업데이트:', newBalance);
              setInvestBalance(newBalance);
            } else if (apiProvider === 'oroplay') {
              console.log('✅ [Realtime] OroPlay 잔고 업데이트:', newBalance);
              setOroplayBalance(newBalance);
            } else if (apiProvider === 'familyapi') {
              console.log('✅ [Realtime] FamilyAPI 잔고 업데이트:', newBalance);
              setFamilyapiBalance(newBalance);
            } else if (apiProvider === 'honorapi') {
              console.log('✅ [Realtime] HonorAPI 잔고 업데이트:', newBalance);
              setHonorapiBalance(newBalance);
            }
            
            // ✅ API 활성화 상태 업데이트
            const isActive = payload.new?.is_active;
            if (isActive !== undefined) {
              if (apiProvider === 'invest') {
                setUseInvestApi(isActive);
              } else if (apiProvider === 'oroplay') {
                setUseOroplayApi(isActive);
              } else if (apiProvider === 'familyapi') {
                setUseFamilyApi(isActive);
              } else if (apiProvider === 'honorapi') {
                setUseHonorApi(isActive);
              }
            }
            
            setLastSyncTime(new Date());
            setError(null);
          }
        )
        .subscribe();
    }

    return () => {
      console.log('🔕 [Realtime] 구독 해제');
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
      useInvestApi,   // ✅ API 활성화 상태 제공
      useOroplayApi,  // ✅ API 활성화 상태 제공
      useFamilyApi,   // ✅ API 활성화 상태 제공
      useHonorApi     // ✅ API 활성화 상태 제공
    }}>
      {children}
    </BalanceContext.Provider>
  );
}