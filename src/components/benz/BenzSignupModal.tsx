import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner@2.0.3';
import { 
  Eye, 
  EyeOff, 
  Loader2,
  UserPlus,
  X,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { generateUUID } from '../../lib/utils';
import { ImageWithFallback } from '../figma/ImageWithFallback';

interface BenzSignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

interface Bank {
  id: string;
  bank_code: string;
  name: string;
  name_ko: string;
  name_en: string;
}

export function BenzSignupModal({ isOpen, onClose, onSwitchToLogin }: BenzSignupModalProps) {
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
        
        const uniqueBanks = data?.filter((bank, index, self) =>
          index === self.findIndex((b) => b.name_ko === bank.name_ko)
        ) || [];
        
        setBanks(uniqueBanks);
      } catch (error) {
        console.error('은행 목록 로드 오류:', error);
        setBanks([]);
      }
    };
    
    if (isOpen) {
      loadBanks();
    }
  }, [isOpen]);

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

  const handleClose = () => {
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
    setError(null);
    setNicknameCheck({ status: 'idle', message: '' });
    onClose();
  };

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
    if (!registerData.referrer_username.trim()) {
      setError('추천인 아이디를 입력해주세요.');
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

      // referrer_id 조회 (필수)
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
      const referrerId = referrer.id;

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
          status: 'pending',
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
      
      // 폼 초기화 및 로그인 모달로 전환
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
      onSwitchToLogin();
      
    } catch (error: any) {
      console.error('회원가입 오류:', error);
      setError('회원가입 중 오류가 발생했습니다.');
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
          width: 'min(90vw, 920px)', 
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

        {/* Two Column Layout */}
        <div className="flex h-full">
          {/* Left Side - Title & Description */}
          <div className="w-2/5 p-10 flex flex-col justify-between bg-[#0a0d1f] border-r border-purple-900/20">
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-6">
                <UserPlus className="w-8 h-8 text-purple-400" />
                <h3 className="text-4xl text-white font-semibold">회원가입</h3>
              </div>
              <p className="text-lg text-gray-300 leading-relaxed mb-3">
                회원가입 시 모든항목을 정확하게 기재하시기 바랍니다.
              </p>
              <p className="text-lg text-gray-300 leading-relaxed">
                회원데이터는 안전한 서버에 안전하게 보관됩니다.
              </p>
            </div>

            {/* 회원가입 버튼과 로그인 링크 */}
            <div className="space-y-5 mb-6">
              <Button
                type="submit"
                form="signup-form"
                className="w-full h-12 font-medium rounded-none"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2 text-lg">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    가입 중...
                  </span>
                ) : (
                  <span className="text-lg" style={{
                    textShadow: '0 1px 0 rgba(255,255,255,0.3), 0 2px 2px rgba(0,0,0,0.4), 0 3px 4px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2)',
                    fontWeight: '700',
                    letterSpacing: '0.05em'
                  }}>
                    회원가입
                  </span>
                )}
              </Button>

              <div className="text-center">
                <p className="text-lg text-gray-400" style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
                  이미 계정이 있으신가요?{' '}
                  <button
                    type="button"
                    onClick={onSwitchToLogin}
                    className="text-amber-400 hover:text-amber-300 font-medium underline"
                    style={{ fontFamily: '"Pretendard Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}
                  >
                    로그인
                  </button>
                </p>
              </div>
            </div>
          </div>

          {/* Right Side - Signup Form */}
          <div className="w-3/5 p-10 overflow-y-auto bg-[#0f1433]">
            <form id="signup-form" onSubmit={handleRegister} className="space-y-8">
              {error && (
                <Alert variant="destructive" className="bg-red-950/20 border-red-900/50 py-3 rounded-none">
                  <AlertDescription className="text-red-400 text-lg">{error}</AlertDescription>
                </Alert>
              )}

              {/* 기본 정보 섹션 */}
              <div className="space-y-5">
                <h4 className="text-white text-lg font-semibold mb-4">기본 정보</h4>
                
                {/* 휴대폰번호 */}
                <div>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="휴대폰번호(숫자만, 띄어쓰기, 콤마 금지)"
                    value={registerData.phone}
                    onChange={handleRegisterChange}
                    className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 h-12 text-lg rounded-none"
                    disabled={isLoading}
                  />
                </div>

                {/* 추천인 아이디 */}
                <div>
                  <Input
                    id="referrer_username"
                    name="referrer_username"
                    type="text"
                    placeholder="추천인 아이디 *"
                    value={registerData.referrer_username}
                    onChange={handleRegisterChange}
                    className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 h-12 text-lg rounded-none"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              {/* 계정 정보 섹션 */}
              <div className="space-y-5">
                <h4 className="text-white text-lg font-semibold mb-4">계정 정보</h4>
                
                {/* 아이디 */}
                <div>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="아이디 (영문+숫자 포함 5자 이상) *"
                    value={registerData.username}
                    onChange={handleRegisterChange}
                    className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 h-12 text-lg rounded-none"
                    disabled={isLoading}
                    required
                  />
                </div>

                {/* 닉네임 */}
                <div>
                  <div className="flex gap-2">
                    <Input
                      id="nickname"
                      name="nickname"
                      type="text"
                      placeholder="닉네임 (한글 또는 영문만 이상) *"
                      value={registerData.nickname}
                      onChange={handleRegisterChange}
                      className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 h-12 text-lg rounded-none flex-1"
                      disabled={isLoading}
                      required
                    />
                    <Button
                      type="button"
                      onClick={() => checkNickname(registerData.nickname)}
                      variant="outline"
                      className="border-purple-900/30 bg-[#1a1f3a] text-purple-400 hover:bg-purple-900/30 hover:text-purple-300 shrink-0 h-12 px-6 rounded-none text-lg"
                      disabled={isLoading || !registerData.nickname.trim()}
                    >
                      중복 확인
                    </Button>
                  </div>
                  {nicknameCheck.status !== 'idle' && (
                    <div className={`flex items-center gap-1.5 text-base mt-2 ${ 
                      nicknameCheck.status === 'available' ? 'text-green-400' : 
                      nicknameCheck.status === 'unavailable' ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {nicknameCheck.status === 'available' && <CheckCircle className="w-4 h-4" />}
                      {nicknameCheck.status === 'unavailable' && <XCircle className="w-4 h-4" />}
                      {nicknameCheck.message}
                    </div>
                  )}
                </div>

                {/* 비밀번호 */}
                <div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="비밀번호 (6~20자 영문 대소문자 숫자 특수문자 사용가능) *"
                      value={registerData.password}
                      onChange={handleRegisterChange}
                      className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 pr-12 h-12 text-lg rounded-none"
                      disabled={isLoading}
                      required
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

                {/* 비밀번호 확인 */}
                <div>
                  <Input
                    id="password_confirm"
                    name="password_confirm"
                    type="password"
                    placeholder="비밀번호 확인 *"
                    className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 h-12 text-lg rounded-none"
                    disabled={isLoading}
                    required
                  />
                </div>

                {/* 출금 비밀번호 */}
                <div>
                  <Input
                    id="withdrawal_password"
                    name="withdrawal_password"
                    type="password"
                    placeholder="출금 비밀번호 (숫자만 4자리) *"
                    className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 h-12 text-lg rounded-none"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              {/* 계좌 정보 섹션 */}
              <div className="space-y-5">
                <h4 className="text-white text-lg font-semibold mb-4">계좌 정보</h4>
                
                {/* 계좌번호 */}
                <div>
                  <Input
                    id="bank_account"
                    name="bank_account"
                    type="text"
                    placeholder="계좌번호"
                    value={registerData.bank_account}
                    onChange={handleRegisterChange}
                    className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 h-12 text-lg rounded-none"
                    disabled={isLoading}
                  />
                </div>

                {/* 계좌은행 */}
                <div>
                  <Select
                    value={registerData.bank_name}
                    onValueChange={(value) => {
                      setRegisterData(prev => ({ ...prev, bank_name: value }));
                      if (error) setError(null);
                    }}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="bg-[#1a1f3a] border-purple-900/30 text-white h-12 text-lg rounded-none w-auto inline-flex min-w-[200px]">
                      <SelectValue placeholder="계좌은행" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1f3a] border-purple-900/30 rounded-none">
                      {banks.map((bank) => (
                        <SelectItem 
                          key={bank.id} 
                          value={bank.name_ko}
                          className="text-white hover:text-white hover:bg-purple-900/30 rounded-none text-lg"
                        >
                          {bank.name_ko}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 예금주 */}
                <div>
                  <Input
                    id="bank_holder"
                    name="bank_holder"
                    type="text"
                    placeholder="예금주"
                    value={registerData.bank_holder}
                    onChange={handleRegisterChange}
                    className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 h-12 text-lg rounded-none"
                    disabled={isLoading}
                  />
                </div>

                {/* 계좌번호(숫자만 입력) */}
                <div>
                  <Input
                    id="email"
                    name="email"
                    type="text"
                    placeholder="계좌번호(숫자만 입력)"
                    value={registerData.email}
                    onChange={handleRegisterChange}
                    className="bg-[#1a1f3a] border-purple-900/30 text-white placeholder:text-gray-500/80 h-12 text-lg rounded-none"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}