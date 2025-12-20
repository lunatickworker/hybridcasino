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
import { ImageWithFallback } from '../figma/ImageWithFallback';

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
        .eq('password_hash', loginData.password)
        .maybeSingle();

      console.log('🔐 로그인 응답:', { data, error: loginError });

      if (loginError) {
        console.error('❌ 로그인 쿼리 에러:', loginError);
        setError('로그인 중 오류가 발생했습니다.');
        return;
      }

      if (!data) {
        console.log('❌ 아이디 또는 비밀번호 불일치');
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

      const clientIP = await getClientIP();
      const userAgent = getUserAgent();
      await logLogin(user.id, 'user', clientIP, userAgent, true);

      console.log('✅ 로그인 처리 완료');
      
      toast.success(`${user.nickname}님 환영합니다!`);
      onLoginSuccess(user);
      onClose();
      
      // 로그인 후 폼 초기화
      setLoginData({ username: '', password: '', captcha: '' });
      refreshCaptcha();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div 
        className="relative overflow-hidden border border-purple-900/30 shadow-2xl"
        style={{ 
          width: 'min(90vw, 750px)', 
          aspectRatio: '16 / 9',
          maxHeight: '90vh',
          background: '#0f1433',
          fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif'
        }}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex h-full">
          {/* Left Side - Game Image (50%) */}
          <div className="w-1/2 relative overflow-hidden">
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1567225299676-9ebaa1d8b28f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXNpbm8lMjBnYW1pbmclMjBuaWdodHxlbnwxfHx8fDE3NjYwNjMwNTh8MA&ixlib=rb-4.1.0&q=80&w=1080"
              alt="Casino Gaming"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/60 via-pink-900/50 to-purple-900/60 flex items-center justify-center">
              <div className="text-center px-6">
                <h2 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200 mb-2" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                  First
                </h2>
                <p className="text-base text-gray-200">
                  최고의 카지노 경험
                </p>
              </div>
            </div>
          </div>

          {/* Right Side - Login Form (50%) */}
          <div className="w-1/2 p-8 flex flex-col justify-center bg-[#0f1433]">
            <div className="max-w-sm mx-auto w-full">
              <div className="text-center mb-8">
                <h3 className="text-3xl text-white font-semibold">로그인</h3>
              </div>

              <form onSubmit={handleLogin} className="space-y-3.5">
                {error && (
                  <Alert variant="destructive" className="bg-red-950/20 border-red-900/50 py-2.5 rounded-none">
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
                    className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500 h-12 text-lg rounded-none"
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
                      className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500 pr-12 h-12 text-lg rounded-none"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* CAPTCHA Field */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 bg-white px-4 py-2.5 border-2 border-gray-400 rounded-none flex items-center justify-center min-w-[120px] h-12">
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
                      className="flex-shrink-0 p-2.5 bg-[#1a1f3a] border border-purple-900/30 hover:bg-[#252a45] transition-colors text-gray-300 hover:text-white rounded-none h-12 w-12 flex items-center justify-center"
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
                      className="flex-1 bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500 h-12 text-lg rounded-none"
                      disabled={isLoading}
                      maxLength={4}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 font-medium mt-5 rounded-none"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2 text-lg">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      로그인 중...
                    </span>
                  ) : (
                    <span className="text-lg" style={{
                      textShadow: '0 1px 0 rgba(255,255,255,0.3), 0 2px 2px rgba(0,0,0,0.4), 0 3px 4px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2)',
                      fontWeight: '700',
                      letterSpacing: '0.05em'
                    }}>
                      로그인
                    </span>
                  )}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <p className="text-base text-gray-400" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
                  아이디가 없으신가요?{' '}
                  <button
                    onClick={onSwitchToSignup}
                    className="text-amber-400 hover:text-amber-300 font-medium underline"
                    style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}
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