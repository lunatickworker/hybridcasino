import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription } from "../ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { investApi } from "../../lib/investApi";
import { toast } from "sonner@2.0.3";
import { useLanguage } from "../../contexts/LanguageContext";
// API 계정 생성은 관리자 승인 시 수행 (회원가입 시 제거)

interface UserLoginProps {
  onLoginSuccess: (user: any) => void;
}

interface Bank {
  id: string;
  bank_code: string;
  name: string;
  name_ko: string;
  name_en: string;
}

// UUID 생성 헬퍼 함수
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID 생성
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export function UserLogin({ onLoginSuccess }: UserLoginProps) {
  const { t, language, setLanguage } = useLanguage();
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
          console.error('❌ 은행 목록 로드 오류:', error);
          // 에러가 발생해도 빈 배열로 처리 (은행 정보는 선택사항)
          setBanks([]);
          return;
        }
        setBanks(data || []);
        console.log('✅ 은행 목록 로드 완료:', data?.length || 0, '개');
      } catch (error) {
        console.error('❌ 은행 목록 로드 오류:', error);
        // 네트워크 오류 등으로 실패해도 빈 배열로 처리
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

  // 닉네임 중복 체크 (직접 SELECT)
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
      console.log('🔐 사용자 로그인 시도:', loginData.username.trim());

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

      // 기기 타입 자동 감지
      const ua = navigator.userAgent.toLowerCase();
      let deviceType = 'PC';
      
      if (
        ua.includes('mobile') || 
        ua.includes('android') || 
        ua.includes('iphone') ||
        ua.includes('ipod') ||
        ua.includes('blackberry') ||
        ua.includes('windows phone') ||
        ua.includes('iemobile') ||
        ua.includes('opera mini') ||
        ua.includes('ipad') ||
        ua.includes('tablet')
      ) {
        deviceType = 'Mobile';
      }

      // 로그인 성공 시 세션 생성
      const sessionData = {
        user_id: user.id,
        session_token: generateUUID(),
        ip_address: null,
        device_info: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          device: deviceType
        }
      };

      const { error: sessionError } = await supabase
        .from('user_sessions')
        .insert([sessionData]);

      if (sessionError) {
        console.error('세션 생성 오류:', sessionError);
      }

      // 온라인 상태 및 기기 정보 업데이트
      await supabase
        .from('users')
        .update({ 
          is_online: true,
          last_login_at: new Date().toISOString(),
          device_info: sessionData.device_info
        })
        .eq('id', user.id);

      // 로그인 로그 기록
      await supabase
        .from('activity_logs')
        .insert([{
          actor_type: 'user',
          actor_id: user.id,
          action: 'login',
          details: {
            username: user.username,
            login_time: new Date().toISOString()
          }
        }]);

      // 로컬 스토리지에 사용자 정보 저장
      localStorage.setItem('user_session', JSON.stringify(user));

      toast.success(`${user.nickname}님, 환영합니다!`);
      onLoginSuccess(user);

    } catch (error: any) {
      console.error('로그인 오류:', error);
      setError(error.message || '로그인 중 오류가 발생했습니다.');
      toast.error('로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 회원가입 처리
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 필수 필드 검증
    if (!registerData.username.trim()) {
      setError('아이디를 입력해주세요.');
      return;
    }
    
    if (!registerData.nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }
    
    if (nicknameCheck.status !== 'available') {
      setError('닉네임 중복 확인을 완료해주세요.');
      return;
    }
    
    if (!registerData.password.trim()) {
      setError('비밀번호를 입력해주세요.');
      return;
    }
    
    if (!registerData.referrer_username.trim()) {
      setError('추천인을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1단계: 추천인 확인 (partners 테이블에서 조회)
      const { data: referrerData, error: referrerError } = await supabase
        .from('partners')
        .select('id')
        .eq('username', registerData.referrer_username.trim())
        .maybeSingle();

      if (referrerError) {
        console.error('추천인 조회 에러:', referrerError);
        setError('추천인 조회 중 오류가 발생했습니다.');
        return;
      }

      if (!referrerData) {
        setError('존재하지 않는 추천인입니다.');
        return;
      }

      // 2단계: 아이디 중복 체크 (users + partners 테이블)
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', registerData.username.trim())
        .maybeSingle();

      if (existingUser) {
        setError('이미 사용 중인 아이디입니다.');
        return;
      }

      const { data: existingPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('username', registerData.username.trim())
        .maybeSingle();

      if (existingPartner) {
        setError('이미 사용 중인 아이디입니다. (파트너 계정과 중복)');
        return;
      }

      // 3단계: 로컬 DB에 사용자 생성 (직접 INSERT)
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          username: registerData.username.trim(),
          nickname: registerData.nickname.trim(),
          password_hash: registerData.password, // 283 트리거에서 자동 암호화
          email: registerData.email.trim() || null,
          phone: registerData.phone.trim() || null,
          bank_name: registerData.bank_name || null,
          bank_account: registerData.bank_account.trim() || null,
          bank_holder: registerData.bank_holder.trim() || null,
          referrer_id: referrerData.id,
          status: 'pending',
          balance: 0,
          points: 0
        }])
        .select('id, username')
        .single();

      if (insertError) {
        if (insertError.code === '23505') { // Unique violation
          if (insertError.message.includes('username')) {
            setError('이미 사용 중인 아이디입니다.');
          } else if (insertError.message.includes('nickname')) {
            setError('이미 사용 중인 닉네임입니다.');
          } else {
            setError('중복된 정보가 있습니다.');
          }
        } else {
          setError(insertError.message || '회원가입에 실패했습니다.');
        }
        return;
      }

      if (!newUser) {
        setError('회원가입 처리 중 오류가 발생했습니다.');
        return;
      }

      // 4단계: 회원가입 완료 (API 계정은 관리자 승인 시 생성)
      // 정책 변경: 관리자 승인 전까지 게임 불가이므로 회원가입 시 API 계정 생성 불필요
      console.log('✅ 회원가입 완료. API 계정은 관리자 승인 시 생성됩니다.');
      
      toast.success('회원가입이 완료되었습니다! 관리자 승인 후 게임을 이용할 수 있습니다.');

      // 회원가입 성공 시 로그인 탭으로 이동하고 아이디 자동 입력
      setActiveTab('login');
      setLoginData(prev => ({
        ...prev,
        username: registerData.username
      }));
      
      // 회원가입 폼 초기화
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
      setError(error.message || '회원가입 중 오류가 발생했습니다.');
      toast.error('회원가입에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center casino-gradient-bg p-4">
      <div className="w-full max-w-md">
        {/* VIP 제목 */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold gold-text neon-glow mb-2 tracking-wide">VIP CASINO</h1>
          <p className="text-yellow-300/80 text-lg tracking-wider">LUXURY GAMING EXPERIENCE</p>
        </div>

        <Card className="luxury-card border-2 border-yellow-600/40 shadow-2xl backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4 relative">
            {/* 언어 변경 버튼 */}
            <button
              onClick={() => setLanguage(language === 'ko' ? 'en' : 'ko')}
              className="absolute top-4 right-4 w-8 h-8 rounded-full overflow-hidden hover:scale-110 transition-transform shadow-lg border-2 border-yellow-600/50"
              title={language === 'ko' ? 'Switch to English' : '한국어로 변경'}
            >
              {language === 'ko' ? (
                <img src="https://flagcdn.com/w40/kr.png" alt="한국어" className="w-full h-full object-cover" />
              ) : (
                <img src="https://flagcdn.com/w40/us.png" alt="English" className="w-full h-full object-cover" />
              )}
            </button>
            
            <CardTitle className="text-2xl text-center gold-text neon-glow">{t.user.loginTitle}</CardTitle>
            <CardDescription className="text-center text-yellow-300/80">
              {t.user.loginSubtitle}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-black/50 mb-6 border border-yellow-600/30">
                <TabsTrigger value="login" className="text-yellow-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-600 data-[state=active]:to-amber-600 data-[state=active]:text-white data-[state=active]:font-bold data-[state=active]:shadow-lg">
                  {t.user.vipLogin}
                </TabsTrigger>
                <TabsTrigger value="register" className="text-yellow-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-600 data-[state=active]:to-amber-600 data-[state=active]:text-white data-[state=active]:font-bold data-[state=active]:shadow-lg">
                  {t.user.vipSignup}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username" className="text-yellow-300 font-semibold">{t.user.vipId}</Label>
                    <Input
                      id="login-username"
                      name="username"
                      type="text"
                      placeholder={t.user.enterVipId}
                      value={loginData.username}
                      onChange={handleLoginChange}
                      disabled={isLoading}
                      className="bg-black/50 border-yellow-600/30 text-white placeholder:text-yellow-200/50 focus:border-yellow-500 focus:ring-yellow-500/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-slate-300">{t.user.password}</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t.user.enterPassword}
                        value={loginData.password}
                        onChange={handleLoginChange}
                        disabled={isLoading}
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white py-3"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t.user.loggingIn}
                      </>
                    ) : (
                      t.user.loginButton
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="space-y-4">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-username" className="text-slate-300">
                        {t.user.username} <span className="text-red-400">{t.user.required}</span>
                      </Label>
                      <Input
                        id="register-username"
                        name="username"
                        type="text"
                        placeholder={t.user.enterUsername}
                        value={registerData.username}
                        onChange={handleRegisterChange}
                        disabled={isLoading}
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-nickname" className="text-slate-300">
                        {t.user.nickname} <span className="text-red-400">{t.user.required}</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="register-nickname"
                          name="nickname"
                          type="text"
                          placeholder={t.user.enterNickname}
                          value={registerData.nickname}
                          onChange={(e) => {
                            handleRegisterChange(e);
                            if (e.target.value.trim()) {
                              checkNickname(e.target.value);
                            }
                          }}
                          disabled={isLoading}
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500 pr-10"
                        />
                        {nicknameCheck.status === 'checking' && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
                        )}
                        {nicknameCheck.status === 'available' && (
                          <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                        )}
                        {nicknameCheck.status === 'unavailable' && (
                          <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                        )}
                      </div>
                      {nicknameCheck.message && (
                        <p className={`text-sm ${nicknameCheck.status === 'available' ? 'text-green-400' : 'text-red-400'}`}>
                          {nicknameCheck.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password" className="text-slate-300">
                      {t.user.password} <span className="text-red-400">{t.user.required}</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="register-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t.user.enterPassword}
                        value={registerData.password}
                        onChange={handleRegisterChange}
                        disabled={isLoading}
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-email" className="text-slate-300">{t.user.email}</Label>
                      <Input
                        id="register-email"
                        name="email"
                        type="email"
                        placeholder={t.user.enterEmail}
                        value={registerData.email}
                        onChange={handleRegisterChange}
                        disabled={isLoading}
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-phone" className="text-slate-300">{t.user.phone}</Label>
                      <Input
                        id="register-phone"
                        name="phone"
                        type="tel"
                        placeholder={t.user.enterPhone}
                        value={registerData.phone}
                        onChange={handleRegisterChange}
                        disabled={isLoading}
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* 은행 정보 - 한국어 버전에만 표시 */}
                  {language === 'ko' && (
                    <div className="space-y-2">
                      <Label className="text-slate-300">{t.user.bankInfo}</Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <Select value={registerData.bank_name} onValueChange={(value) => 
                          setRegisterData(prev => ({ ...prev, bank_name: value }))
                        }>
                          <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                            <SelectValue placeholder={t.user.selectBank} />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-700 border-slate-600">
                            {banks.map((bank) => (
                              <SelectItem key={bank.id} value={bank.name_ko} className="text-white">
                                {bank.name_ko}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Input
                          name="bank_account"
                          placeholder={t.user.enterAccountNumber}
                          value={registerData.bank_account}
                          onChange={handleRegisterChange}
                          disabled={isLoading}
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500"
                        />
                        
                        <Input
                          name="bank_holder"
                          placeholder={t.user.enterAccountHolder}
                          value={registerData.bank_holder}
                          onChange={handleRegisterChange}
                          disabled={isLoading}
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="register-referrer" className="text-slate-300">
                      {t.user.referrer} <span className="text-red-400">{t.user.required}</span>
                    </Label>
                    <Input
                      id="register-referrer"
                      name="referrer_username"
                      type="text"
                      placeholder={t.user.enterReferrerUsername}
                      value={registerData.referrer_username}
                      onChange={handleRegisterChange}
                      disabled={isLoading}
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading || nicknameCheck.status !== 'available'}
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white py-3"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t.user.signingUp}
                      </>
                    ) : (
                      t.user.signupButton
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            {error && (
              <Alert className="border-red-600 bg-red-900/20">
                <AlertDescription className="text-red-400">
                  {error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* 하단 정보 */}
        <div className="text-center mt-8 text-sm text-slate-400">
          <p>© 2025 GMS Casino. All rights reserved.</p>
          <p className="mt-2 text-slate-500">{t.user.responsibleGaming}</p>
        </div>
      </div>
    </div>
  );
}

// Default export 추가
export default UserLogin;