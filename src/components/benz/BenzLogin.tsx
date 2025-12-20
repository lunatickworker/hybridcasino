import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner@2.0.3';
import { 
  Eye, 
  EyeOff, 
  Wallet, 
  TrendingUp, 
  Award, 
  Lock, 
  User, 
  Mail, 
  Phone,
  Loader2,
  LogIn,
  UserPlus,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { generateUUID } from '../../lib/utils';
import { logLogin, getClientIP, getUserAgent } from '../../lib/activityLogger';

interface BenzLoginProps {
  onLoginSuccess: (user: any) => void;
  onRouteChange: (route: string) => void;
}

interface Bank {
  id: string;
  bank_code: string;
  name: string;
  name_ko: string;
  name_en: string;
}

export function BenzLogin({ onLoginSuccess, onRouteChange }: BenzLoginProps) {
  const [activeTab, setActiveTab] = useState("login");
  
  // 로그인 폼 데이터
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
  });
  
  // 회원가입 폼 데이터
  const [registerData, setRegisterData] = useState({
    username: '',
    nickname: '',
    password: '',
    email: '',
    phone: '',
    bank_name: '',
    bank_account: '',
    bank_holder: '',
    referrer_username: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [nicknameCheck, setNicknameCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'unavailable';
    message: string;
  }>({ status: 'idle', message: '' });

  // 은행 목록 로드
  useEffect(() => {
    const loadBanks = async () => {
      try {
        const { data, error } = await supabase
          .from('banks')
          .select('*')
          .eq('status', 'active')
          .order('display_order');
        
        if (error) {
          console.error('은행 목록 로드 오류:', error);
          setBanks([]);
          return;
        }
        
        // 중복 제거: name_ko 기준으로 고유한 은행만 유지
        const uniqueBanks = data?.filter((bank, index, self) =>
          index === self.findIndex((b) => b.name_ko === bank.name_ko)
        ) || [];
        
        setBanks(uniqueBanks);
      } catch (error) {
        console.error('은행 목록 로드 오류:', error);
        setBanks([]);
      }
    };
    
    loadBanks();
  }, []);

  // 로그인 폼 핸들러
  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLoginData(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) setError(null);
  };

  // 회원가입 폼 핸들러
  const handleRegisterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRegisterData(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) setError(null);
  };

  // 닉네임 중복 체크
  const checkNickname = async (nickname: string) => {
    if (!nickname.trim()) {
      setNicknameCheck({ status: 'idle', message: '' });
      return;
    }

    setNicknameCheck({ status: 'checking', message: '확인 중...' });

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('nickname', nickname.trim())
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        setNicknameCheck({
          status: 'unavailable',
          message: '이미 사용 중인 닉네임입니다.'
        });
      } else {
        setNicknameCheck({
          status: 'available',
          message: '사용 가능한 닉네임입니다.'
        });
      }
    } catch (error) {
      console.error('닉네임 체크 오류:', error);
      setNicknameCheck({ status: 'unavailable', message: '확인 중 오류가 발생했습니다.' });
    }
  };

  // 로그인 처리
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginData.username.trim() || !loginData.password.trim()) {
      setError('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔐 Benz 사용자 로그인 시도:', loginData.username.trim());

      // 사용자 로그인 - 직접 SELECT 쿼리 사용
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
        return;
      }

      const user = data;
      console.log('✅ 로그인 성공:', { 
        username: user.username, 
        nickname: user.nickname,
        status: user.status,
        vip_level: user.vip_level 
      });

      // 사용자 상태 확인
      if (user.status === 'blocked') {
        console.warn('⚠️ 차단된 계정:', user.username);
        setError('차단된 계정입니다. 고객센터에 문의해주세요.');
        return;
      }

      if (user.status === 'pending') {
        console.warn('⚠️ 승인 대기 중인 계정:', user.username);
        setError('승인 대기 중인 계정입니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      // 온라인 상태 업데이트
      await supabase
        .from('users')
        .update({
          is_online: true,
          balance_sync_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      // user_sessions 테이블에 세션 기록
      const sessionId = generateUUID();
      await supabase.from('user_sessions').insert([{
        id: sessionId,
        user_id: user.id,
        is_active: true,
        login_at: new Date().toISOString()
      }]);

      // activity_logs 기록
      const clientIP = await getClientIP();
      const userAgent = getUserAgent();
      await logLogin(user.id, 'user', clientIP, userAgent, true);

      console.log('✅ 로그인 처리 완료');
      
      toast.success(`${user.nickname}님 환영합니다!`);
      onLoginSuccess(user);
      onRouteChange('/benz/casino');
    } catch (error: any) {
      console.error('❌ 로그인 오류:', error);
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 회원가입 처리
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // 유효성 검사
    if (!registerData.username.trim()) {
      setError('아이디를 입력해주세요.');
      return;
    }
    if (!registerData.nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }
    if (nicknameCheck.status !== 'available') {
      setError('닉네임 중복 확인이 필요합니다.');
      return;
    }
    if (!registerData.password || registerData.password.length < 4) {
      setError('비밀번호는 4자리 이상이어야 합니다.');
      return;
    }
    if (!registerData.bank_name) {
      setError('은행을 선택해주세요.');
      return;
    }
    if (!registerData.bank_account.trim()) {
      setError('계좌번호를 입력해주세요.');
      return;
    }
    if (!registerData.bank_holder.trim()) {
      setError('예금주명을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('📝 회원가입 시도:', registerData.username.trim());

      // 아이디 중복 확인
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', registerData.username.trim())
        .maybeSingle();

      if (existingUser) {
        setError('이미 사용 중인 아이디입니다.');
        return;
      }

      // referrer_id 조회 (추천인이 있는 경우)
      let referrerId = null;
      if (registerData.referrer_username.trim()) {
        const { data: referrer } = await supabase
          .from('partners')
          .select('id')
          .eq('username', registerData.referrer_username.trim())
          .eq('status', 'active')
          .maybeSingle();

        if (!referrer) {
          setError('존재하지 않는 추천인 아이디입니다.');
          return;
        }
        referrerId = referrer.id;
      }

      // 기본 추천인 설정 (추천인이 없으면 최상위 Lv1 파트너)
      if (!referrerId) {
        const { data: defaultPartner } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();

        if (defaultPartner) {
          referrerId = defaultPartner.id;
        }
      }

      // 신규 사용자 등록
      const newUserId = generateUUID();
      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          id: newUserId,
          username: registerData.username.trim(),
          nickname: registerData.nickname.trim(),
          password_hash: registerData.password,
          email: registerData.email.trim() || null,
          phone: registerData.phone.trim() || null,
          bank_name: registerData.bank_name,
          bank_account: registerData.bank_account.trim(),
          bank_holder: registerData.bank_holder.trim(),
          referrer_id: referrerId,
          status: 'pending', // 관리자 승인 대기
          balance: 0,
          points: 0,
          vip_level: 1,
          is_online: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (insertError) {
        console.error('회원가입 오류:', insertError);
        setError('회원가입 중 오류가 발생했습니다.');
        return;
      }

      // activity_logs 기록
      await supabase.from('activity_logs').insert([{
        actor_type: 'user',
        actor_id: newUserId,
        action: 'register',
        details: { 
          username: registerData.username.trim(),
          register_time: new Date().toISOString() 
        }
      }]);

      toast.success('회원가입이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.');
      
      // 로그인 탭으로 이동
      setActiveTab('login');
      setRegisterData({
        username: '',
        nickname: '',
        password: '',
        email: '',
        phone: '',
        bank_name: '',
        bank_account: '',
        bank_holder: '',
        referrer_username: ''
      });
      setNicknameCheck({ status: 'idle', message: '' });
      
    } catch (error: any) {
      console.error('회원가입 오류:', error);
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e27] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent mb-2">
            BENZ CASINO
          </h1>
          <p className="text-gray-400">
            <a href="#/admin" className="hover:text-purple-400 transition-colors">
              최고의 카지노 경험
            </a>
          </p>
        </div>

        <Card className="bg-[#1a1f3a] border-purple-900/30">
          <CardHeader>
            <CardTitle className="text-2xl text-white">로그인 / 회원가입</CardTitle>
            <CardDescription className="text-gray-400">
              계정으로 로그인하거나 새로운 계정을 만드세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-[#0f1433]">
                <TabsTrigger 
                  value="login"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white"
                >
                  로그인
                </TabsTrigger>
                <TabsTrigger 
                  value="register"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white"
                >
                  회원가입
                </TabsTrigger>
              </TabsList>

              {/* 로그인 탭 */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  {error && (
                    <Alert variant="destructive" className="bg-red-950/20 border-red-900/50">
                      <AlertDescription className="text-red-400">{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="login-username" className="text-gray-300">아이디</Label>
                    <Input
                      id="login-username"
                      name="username"
                      type="text"
                      placeholder="아이디를 입력하세요"
                      value={loginData.username}
                      onChange={handleLoginChange}
                      className="bg-[#0f1433] border-purple-900/30 text-white placeholder:text-gray-500"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-gray-300">비밀번호</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="비밀번호를 입력하세요"
                        value={loginData.password}
                        onChange={handleLoginChange}
                        className="bg-[#0f1433] border-purple-900/30 text-white placeholder:text-gray-500 pr-10"
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        로그인 중...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <LogIn className="w-4 h-4" />
                        로그인
                      </span>
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* 회원가입 탭 (간단 버전) */}
              <TabsContent value="register">
                <p className="text-center text-gray-400 py-8">
                  회원가입은 관리자 페이지 또는 고객센터를 통해 진행해주세요.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
