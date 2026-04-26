import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { toast } from 'sonner@2.0.3';
import { 
  Eye, 
  EyeOff, 
  Loader2,
  LogIn,
  X,
  RefreshCw
} from 'lucide-react';
import { generateUUID } from '../../lib/utils';
import { logLogin, getClientIP, getUserAgent } from '../../lib/activityLogger';
import { ImageWithFallback } from "@figma/ImageWithFallback";
import * as bcrypt from 'bcryptjs';

interface BenzLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any) => void;
  onSwitchToSignup: () => void;
}

export function BenzLoginModal({ isOpen, onClose, onLoginSuccess, onSwitchToSignup }: BenzLoginModalProps) {
  const [loginData, setLoginData] = useState({
    username: '',
    password: '',
    captcha: ''
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaCode, setCaptchaCode] = useState(generateCaptcha());

  function generateCaptcha() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  const refreshCaptcha = () => {
    setCaptchaCode(generateCaptcha());
    setLoginData(prev => ({ ...prev, captcha: '' }));
  };

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLoginData(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) setError(null);
  };

  const handleClose = () => {
    setLoginData({ username: '', password: '', captcha: '' });
    setError(null);
    refreshCaptcha();
    onClose();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginData.username.trim() || !loginData.password.trim()) {
      setError('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    if (!loginData.captcha.trim()) {
      setError('자동입력방지 코드를 입력해주세요.');
      return;
    }

    if (loginData.captcha !== captchaCode) {
      setError('자동입력방지 코드가 일치하지 않습니다.');
      refreshCaptcha();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔐 Benz 사용자 로그인 시도:', loginData.username.trim());

      const { data, error: loginError } = await supabase
        .from('users')
        .select('*')
        .eq('username', loginData.username.trim())
        .maybeSingle();

      console.log('🔐 로그인 응답:', { data, error: loginError });

      if (loginError) {
        console.error('❌ 로그인 쿼리 에러:', loginError);
        setError('로그인 중 오류가 발생했습니다.');
        return;
      }

      if (!data) {
        console.log('❌ 아이디 또는 비밀번호 불일치');
        
        // 🔍 디버깅: 해당 username이 존재하는지 확인
        const { data: userCheck } = await supabase
          .from('users')
          .select('username, status')
          .eq('username', loginData.username.trim())
          .maybeSingle();
        
        console.log('🔍 사용자 존재 여부:', userCheck);
        
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
        refreshCaptcha();
        return;
      }

      const user = data;
      console.log('✅ 로그인 성공:', { 
        username: user.username, 
        nickname: user.nickname,
        status: user.status,
        vip_level: user.vip_level 
      });

      if (user.status === 'blocked') {
        console.warn('⚠️ 차단된 계정:', user.username);
        setError('차단된 계정입니다. 고객센터에 문의해주세요.');
        refreshCaptcha();
        return;
      }

      if (user.status === 'pending') {
        console.warn('⚠️ 승인 대기 중인 계정:', user.username);
        setError('승인 대기 중인 계정입니다. 잠시 후 다시 시도해주세요.');
        refreshCaptcha();
        return;
      }

      console.log('🔐 비밀번호 검증 시작...');
      const isPasswordMatch = await bcrypt.compare(loginData.password, user.password_hash);
      console.log('🔐 비밀번호 검증 완료:', isPasswordMatch);
      
      if (!isPasswordMatch) {
        console.log('❌ 비밀번호 불일치');
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
        refreshCaptcha();
        return;
      }

      console.log('💾 사용자 온라인 상태 업데이트 시작...');
      await supabase
        .from('users')
        .update({
          is_online: true,
          balance_sync_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      const sessionId = generateUUID();
      await supabase.from('user_sessions').insert([{
        id: sessionId,
        user_id: user.id,
        is_active: true,
        login_at: new Date().toISOString()
      }]);

      console.log('✅ 로그인 처리 완료 - UI 즉시 업데이트');
      
      // ✅ 로그인 성공 처리 (UI 즉시 업데이트)
      onLoginSuccess(user);
      onClose();
      
      // 로그인 후 폼 초기화
      setLoginData({ username: '', password: '', captcha: '' });
      refreshCaptcha();

      // ⭐ 로그인 활동 기록은 백그라운드에서 처리 (UI 블로킹 없음)
      setTimeout(async () => {
        try {
          const clientIP = await getClientIP();
          const userAgent = getUserAgent();
          await logLogin(user.id, 'user', clientIP, userAgent, true);
          console.log('✅ 로그인 활동 기록 완료');
        } catch (error) {
          console.warn('⚠️ 로그인 활동 기록 실패 (무시):', error);
          // 활동 기록 실패는 무시 - UI에 영향 없음
        }
      }, 500); // 더 긴 지연으로 다른 요청과 충돌 방지
    } catch (error: any) {
      console.error('❌ 로그인 오류:', error);
      setError('로그인 중 오류가 발생했습니다.');
      refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      {/* Background Logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
        <ImageWithFallback
          src="https://iqkgwsdgxmxxvpydrlrm.supabase.co/storage/v1/object/public/casino/images/benzcasinologo%20(1).png"
          alt="BENZ CASINO Background"
          className="w-auto h-[40vh] md:h-[50vh] object-contain opacity-10"
          style={{
            filter: 'blur(2px)'
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-4xl shadow-2xl border-2 overflow-hidden" style={{
        background: 'linear-gradient(135deg, rgba(20, 20, 30, 0.98) 0%, rgba(15, 15, 25, 0.98) 100%)',
        borderColor: 'rgba(193, 154, 107, 0.4)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(193, 154, 107, 0.1)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 text-gray-400 hover:text-white transition-all p-2 hover:bg-white/10 rounded-lg"
          style={{
            color: '#E6C9A8'
          }}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col md:flex-row h-full">
          {/* Left Side - Game Image (모바일에서 숨김) */}
          <div className="hidden md:block md:w-1/2 relative overflow-hidden">
            <ImageWithFallback
              src="https://iqkgwsdgxmxxvpydrlrm.supabase.co/storage/v1/object/public/casino/images/benz_login_v1.png"
              alt="Benz Casino"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-end justify-center pb-8" style={{
              background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, transparent 50%, rgba(166, 124, 82, 0.15) 100%)'
            }}>
              <div className="text-center px-6">
                <h2 className="text-6xl font-bold mb-2" style={{ 
                  fontFamily: 'Georgia, serif', 
                  fontStyle: 'italic',
                  background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 50%, #A67C52 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow: '0 4px 12px rgba(193, 154, 107, 0.3)'
                }}>
                  
                </h2>
                <p className="text-base" style={{
                  color: '#E6C9A8',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)'
                }}>
                  최고의 카지노 경험
                </p>
              </div>
            </div>
          </div>

          {/* Right Side - Login Form */}
          <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-center" style={{
            background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.95) 0%, rgba(15, 15, 25, 0.95) 100%)'
          }}>
            <div className="max-w-sm mx-auto w-full">
              <div className="text-center mb-6 md:mb-8">
                <h3 className="text-2xl md:text-3xl font-bold" style={{
                  color: '#E6C9A8',
                  textShadow: '0 2px 8px rgba(193, 154, 107, 0.4)'
                }}>로그인</h3>
              </div>

              <form onSubmit={handleLogin} className="space-y-3 md:space-y-3.5">
                {error && (
                  <Alert variant="destructive" className="py-2.5 rounded-lg border" style={{
                    background: 'rgba(220, 38, 38, 0.1)',
                    borderColor: 'rgba(220, 38, 38, 0.3)'
                  }}>
                    <AlertDescription className="text-red-400 text-base">{error}</AlertDescription>
                  </Alert>
                )}

                <div>
                  <Input
                    id="login-username"
                    name="username"
                    type="text"
                    placeholder="아이디"
                    value={loginData.username}
                    onChange={handleLoginChange}
                    className="h-12 text-lg rounded-lg text-white placeholder:text-gray-500 transition-all duration-300 focus:scale-[1.02]"
                    style={{
                      background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
                      borderColor: 'rgba(193, 154, 107, 0.3)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                    }}
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="비밀번호"
                      value={loginData.password}
                      onChange={handleLoginChange}
                      className="pr-12 h-12 text-lg rounded-lg text-white placeholder:text-gray-500 transition-all duration-300 focus:scale-[1.02]"
                      style={{
                        background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                      }}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      style={{
                        color: '#A67C52'
                      }}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* CAPTCHA Field */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 px-4 py-2.5 border-2 rounded-lg flex items-center justify-center min-w-[120px] h-12" style={{
                      background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F5F5 100%)',
                      borderColor: '#C19A6B'
                    }}>
                      <span className="text-3xl font-bold select-none tracking-widest" style={{ 
                        color: '#000000',
                        fontFamily: 'Consolas, "Courier New", monospace',
                        letterSpacing: '0.15em'
                      }}>
                        {captchaCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={refreshCaptcha}
                      className="flex-shrink-0 p-2.5 border transition-all h-12 w-12 flex items-center justify-center rounded-lg hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                        color: '#E6C9A8'
                      }}
                      disabled={isLoading}
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                    <Input
                      id="login-captcha"
                      name="captcha"
                      type="text"
                      placeholder="자동입력방지코드"
                      value={loginData.captcha}
                      onChange={handleLoginChange}
                      className="flex-1 h-12 text-lg rounded-lg text-white placeholder:text-gray-500 transition-all duration-300 focus:scale-[1.02]"
                      style={{
                        background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                      }}
                      disabled={isLoading}
                      maxLength={4}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full h-12 font-bold mt-5 rounded-lg transition-all duration-300 hover:scale-105 relative overflow-hidden group"
                  disabled={isLoading}
                  style={{
                    background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                    boxShadow: '0 4px 15px rgba(193, 154, 107, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(230, 201, 168, 0.3)'
                  }}
                >
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(135deg, #D4AF87 0%, #C19A6B 100%)'
                    }}
                  ></div>
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2 text-lg relative z-10" style={{
                      color: '#FFFFFF',
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                    }}>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      로그인 중...
                    </span>
                  ) : (
                    <span className="text-lg relative z-10 tracking-wide" style={{
                      color: '#FFFFFF',
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                      fontWeight: '700',
                      letterSpacing: '0.05em'
                    }}>
                      로그인
                    </span>
                  )}
                </button>
              </form>

              <div className="mt-5 text-center">
                <p className="text-base text-gray-400" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
                  아이디가 없으신가요?{' '}
                  <button
                    onClick={onSwitchToSignup}
                    className="font-semibold underline transition-colors"
                    style={{ 
                      fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
                      color: '#E6C9A8'
                    }}
                  >
                    회원가입
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}