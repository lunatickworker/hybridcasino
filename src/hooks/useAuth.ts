import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { Partner, User as CustomUser } from '../types';
// import { getInfo } from '../lib/investApi'; // ❌ 사용 중지
import { updateInvestBalance, updateOroplayBalance, getInvestCredentials, getOroplayCredentials } from '../lib/apiConfigHelper';
import { storage } from '../lib/utils';
import { logLogin, getClientIP, getUserAgent } from '../lib/activityLogger';

interface AuthState {
  isAuthenticated: boolean;
  user: Partner | null;
  token: string | null;
}

const AuthContext = createContext<{
  authState: AuthState;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  quickLogin: () => Promise<{ success: boolean; error?: string }>;
  checkAuth: () => Promise<void>;
} | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function useAuthProvider() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
  });

  // 초기 인증 상태 확인
  useEffect(() => {
    const token = storage.get('auth_token');
    const user = storage.get('auth_user');
    
    if (token && user && typeof user.level === 'number') {
      setAuthState({
        isAuthenticated: true,
        user,
        token,
      });
    }
  }, []);

  const login = async (username: string, password: string) => {
    try {
      // ✅ DB 기반 로그인 (bcrypt 비밀번호 검증은 RPC 필요)
      const { data: loginData, error: loginError } = await supabase
        .rpc('partner_login', {
          p_username: username,
          p_password: password
        });

      if (loginError) {
        console.error('로그인 RPC 오류:', loginError);
        return { 
          success: false, 
          error: `로그인 오류: ${loginError.message || '알 수 없는 오류'}` 
        };
      }

      if (!loginData || loginData.length === 0) {
        console.error('❌ 로그인 실패: 사용자 데이터 없음', { username });
        
        // 🔍 디버깅: DB에 계정이 있는지 확인
        const { data: checkUser } = await supabase
          .from('partners')
          .select('id, username, status, password_hash')
          .eq('username', username)
          .single();
        
        console.log('🔍 DB 계정 확인:', checkUser);
        
        if (checkUser) {
          console.error('❌ 계정은 존재하지만 비밀번호 불일치 또는 status 문제:', {
            id: checkUser.id,
            username: checkUser.username,
            status: checkUser.status,
            hasPasswordHash: !!checkUser.password_hash,
            hashPrefix: checkUser.password_hash?.substring(0, 7)
          });
          
          return { 
            success: false, 
            error: '비밀번호가 올바르지 않거나 계정이 비활성화되었습니다.' 
          };
        }
        
        return { 
          success: false, 
          error: '존재하지 않는 계정입니다.' 
        };
      }

      // ✅ DB에서 조회한 실제 데이터만 사용 (RPC는 배열 반환)
      const partnerData = loginData[0];
      
      // 🔍 DEBUG: 실제 DB에서 가져온 데이터 확인
      console.log('🔍 partnerData 원본:', partnerData);
      console.log('🔍 partnerData.id 타입:', typeof partnerData.id, '값:', partnerData.id);
      console.log('🔍 카지노/슬롯 커미션 확인:', {
        casino_rolling: partnerData.casino_rolling_commission,
        casino_losing: partnerData.casino_losing_commission,
        slot_rolling: partnerData.slot_rolling_commission,
        slot_losing: partnerData.slot_losing_commission,
        withdrawal_fee: partnerData.withdrawal_fee
      });

      // ❌ ID가 없으면 로그인 실패
      if (!partnerData.id) {
        console.error('❌ 로그인 실패: partner ID가 없습니다!', partnerData);
        return {
          success: false,
          error: '사용자 데이터가 올바르지 않습니다. DB를 확인하세요.'
        };
      }
      
      const systemAdminUser: Partner = {
        id: partnerData.id,
        username: partnerData.username,
        nickname: partnerData.nickname,
        partner_type: partnerData.partner_type,
        level: partnerData.level,
        parent_id: partnerData.parent_id || undefined,
        status: partnerData.status,
        balance: partnerData.balance,
        commission_rolling: partnerData.commission_rolling,
        commission_losing: partnerData.commission_losing,
        casino_rolling_commission: partnerData.casino_rolling_commission,
        casino_losing_commission: partnerData.casino_losing_commission,
        slot_rolling_commission: partnerData.slot_rolling_commission,
        slot_losing_commission: partnerData.slot_losing_commission,
        withdrawal_fee: partnerData.withdrawal_fee,
        last_login_at: partnerData.last_login_at,
        created_at: partnerData.created_at,
      };

      console.log('✅ 파트너 로그인 성공:', {
        id: systemAdminUser.id,
        username: systemAdminUser.username,
        partner_type: systemAdminUser.partner_type,
        level: systemAdminUser.level
      });

      const newAuthState = {
        isAuthenticated: true,
        user: systemAdminUser,
        token: `partner-token-${systemAdminUser.id}`,
      };

      setAuthState(newAuthState);
      storage.set('auth_token', newAuthState.token);
      storage.set('auth_user', systemAdminUser);

      // ✅ Lv1, Lv2: 로그인 시 Invest & OroPlay API 보유금 동기화 - ❌ 비활성화
      // getInfo API 사용 중지로 인해 로그인 시 자동 동기화도 비활성화
      /*
      if (systemAdminUser.level === 1 || systemAdminUser.level === 2) {
        if (systemAdminUser.opcode && systemAdminUser.secret_key) {
          console.log('🔄 Invest & OroPlay API 보유금 동기화 시작...');
          
          // 백그라운드에서 동기화 (로그인 딜레이 방지)
          setTimeout(async () => {
            try {
              // 3️⃣ API 보유금 동기화 (헬퍼 함수 사용)
              const investCreds = await getInvestCredentials(systemAdminUser.id);
              
              let investBalance = systemAdminUser.balance || 0;
              let oroplayBalance = 0;

              // Invest API 잔액 조회
              if (investCreds.opcode && investCreds.secret_key) {
                const apiResult = await getInfo(investCreds.opcode, investCreds.secret_key);
                
                if (!apiResult.error && apiResult.data) {
                  if (apiResult.data.DATA?.balance !== undefined) {
                    investBalance = parseFloat(apiResult.data.DATA.balance) || 0;
                  } else if (apiResult.data.balance !== undefined) {
                    investBalance = parseFloat(apiResult.data.balance) || 0;
                  }
                }
              }

              // API configs 테이블에 잔액 업데이트
              await updateInvestBalance(systemAdminUser.id, investBalance);
              await updateOroplayBalance(systemAdminUser.id, oroplayBalance);

              console.log('✅ API 보유금 동기화 완료:', {
                invest: investBalance,
                oroplay: oroplayBalance
              });
            } catch (syncError) {
              console.error('❌ API 동기화 오류:', syncError);
            }
          }, 500);
        }
      }
      */

      // ✅ 로그인 활동 기록
      const clientIP = await getClientIP();
      const userAgent = getUserAgent();
      await logLogin(systemAdminUser.id, 'partner', clientIP, userAgent, true);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: '로그인 중 오류가 발생했습니다.' };
    }
  };

  const quickLogin = async () => {
    // ✅ 빠른 로그인 = 일반 로그인과 동일 (smcdev11 계정)
    return await login('smcdev11', 'smcdev11!');
  };

  const logout = () => {
    setAuthState({
      isAuthenticated: false,
      user: null,
      token: null,
    });
    storage.remove('auth_token');
    storage.remove('auth_user');
  };

  const checkAuth = async () => {
    const token = storage.get('auth_token');
    const user = storage.get('auth_user');
    
    if (token && user && typeof user.level === 'number') {
      setAuthState({
        isAuthenticated: true,
        user,
        token,
      });
    }
  };

  return {
    authState,
    login,
    logout,
    quickLogin,
    checkAuth,
  };
}

export { AuthContext };