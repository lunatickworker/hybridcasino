import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";

interface Sample1SignupProps {
  onClose: () => void;
  onSuccess: (username: string) => void;
}

interface Bank {
  id: string;
  bank_code: string;
  name: string;
  name_ko: string;
  name_en: string;
}

export function Sample1Signup({ onClose, onSuccess }: Sample1SignupProps) {
  const [registerData, setRegisterData] = useState({
    username: '',
    nickname: '',
    password: '',
    passwordConfirm: '',
    email: '',
    phone: '',
    bank_name: '',
    bank_account: '',
    bank_holder: '',
    referrer_username: ''
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [usernameCheck, setUsernameCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'unavailable';
    message: string;
  }>({ status: 'idle', message: '' });
  
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
        
        if (error) throw error;
        setBanks(data || []);
      } catch (error) {
        console.error('은행 목록 로드 오류:', error);
      }
    };
    
    loadBanks();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRegisterData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBankChange = (value: string) => {
    setRegisterData(prev => ({
      ...prev,
      bank_name: value
    }));
  };

  // 아이디 중복 체크
  const checkUsername = async (username: string) => {
    if (!username.trim()) {
      setUsernameCheck({ status: 'idle', message: '' });
      return;
    }

    if (username.length < 4 || username.length > 16) {
      setUsernameCheck({ status: 'unavailable', message: '4~16자 영문, 숫자 조합' });
      return;
    }

    setUsernameCheck({ status: 'checking', message: '확인 중...' });

    try {
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', username);

      if (error) throw error;

      if (data && data.length > 0) {
        setUsernameCheck({
          status: 'unavailable',
          message: '이미 사용 중인 아이디입니다.'
        });
      } else {
        setUsernameCheck({
          status: 'available',
          message: '사용 가능한 아이디입니다.'
        });
      }
    } catch (error) {
      console.error('아이디 체크 오류:', error);
      setUsernameCheck({ status: 'unavailable', message: '확인 중 오류가 발생했습니다.' });
    }
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
        .select('nickname')
        .eq('nickname', nickname);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 유효성 검사
    if (!registerData.username.trim()) {
      toast.error('아이디를 입력해주세요.');
      return;
    }
    
    if (usernameCheck.status !== 'available') {
      toast.error('아이디 중복 확인을 해주세요.');
      return;
    }
    
    if (!registerData.nickname.trim()) {
      toast.error('닉네임을 입력해주세요.');
      return;
    }
    
    if (nicknameCheck.status !== 'available') {
      toast.error('닉네임 중복 확인을 해주세요.');
      return;
    }
    
    if (!registerData.password || registerData.password.length < 6) {
      toast.error('비밀번호는 6자 이상 입력해주세요.');
      return;
    }
    
    if (registerData.password !== registerData.passwordConfirm) {
      toast.error('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);

    try {
      console.log('📝 회원가입 시작:', registerData.username);

      // 1. 추천인 확인 (선택사항)
      let referrerId: string | null = null;
      let partnerId: string | null = null;

      if (registerData.referrer_username.trim()) {
        const { data: referrerData, error: referrerError } = await supabase
          .from('users')
          .select('id, partner_id')
          .eq('username', registerData.referrer_username.trim())
          .maybeSingle();

        console.log('🔍 추천인 조회:', { 
          username: registerData.referrer_username.trim(), 
          found: !!referrerData,
          data: referrerData 
        });

        if (referrerError) {
          console.error('❌ 추천인 조회 에러:', referrerError);
          toast.error('추천인 조회 중 오류가 발생했습니다.');
          setIsLoading(false);
          return;
        }

        if (!referrerData) {
          console.warn('⚠️ 존재하지 않는 추천인:', registerData.referrer_username.trim());
          toast.error('존재하지 않는 추천코드입니다.');
          setIsLoading(false);
          return;
        }

        referrerId = referrerData.id;
        partnerId = referrerData.partner_id;
        
        console.log('✅ 추천인 확인:', { referrerId, partnerId });
      } else {
        // 추천인이 없으면 기본 파트너 찾기
        const { data: defaultPartner } = await supabase
          .from('partners')
          .select('id')
          .eq('level', 1)
          .limit(1)
          .maybeSingle();

        if (defaultPartner) {
          partnerId = defaultPartner.id;
        }
      }

      // 2. 사용자 계정 생성
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          username: registerData.username.trim(),
          nickname: registerData.nickname.trim(),
          password_hash: registerData.password,
          email: registerData.email.trim() || null,
          phone: registerData.phone.trim() || null,
          bank_name: registerData.bank_name || null,
          bank_account: registerData.bank_account.trim() || null,
          bank_holder: registerData.bank_holder.trim() || null,
          partner_id: partnerId,
          referrer_id: referrerId,
          status: 'pending', // 관리자 승인 대기
          vip_level: 1,
          balance: 0,
          invest_balance: 0,
          oroplay_balance: 0,
          point: 0,
          is_online: false
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ 회원가입 DB 에러:', insertError);
        
        if (insertError.code === '23505') { // unique violation
          if (insertError.message.includes('username')) {
            toast.error('이미 사용 중인 아이디입니다.');
          } else if (insertError.message.includes('nickname')) {
            toast.error('이미 사용 중인 닉네임입니다.');
          } else {
            toast.error('중복된 정보가 있습니다.');
          }
        } else {
          toast.error(insertError.message || '회원가입에 실패했습니다.');
        }
        return;
      }

      if (!newUser) {
        toast.error('회원가입 처리 중 오류가 발생했습니다.');
        return;
      }

      console.log('✅ 회원가입 완료. API 계정은 관리자 승인 시 생성됩니다.');
      
      toast.success('회원가입이 완료되었습니다! 관리자 승인 후 게임을 이용할 수 있습니다.');
      
      // 성공 시 로그인 페이지로 이동
      onSuccess(registerData.username);
      onClose();
      
    } catch (error: any) {
      console.error('회원가입 오류:', error);
      toast.error(error.message || '회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 overflow-y-auto">
      {/* 회원가입 폼 */}
      <div className="relative w-full max-w-2xl my-8 mx-4 bg-gradient-to-b from-slate-900/95 to-slate-950/95 border-2 border-red-600/50 rounded-lg shadow-2xl">
        {/* 헤더 */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-red-600/90 to-red-800/90 backdrop-blur-sm px-6 py-4 border-b border-red-500/30">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl text-white">회원가입</h2>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
        </div>

        {/* 폼 내용 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* ID */}
          <div className="space-y-2">
            <Label className="text-white">ID</Label>
            <div className="flex gap-2">
              <Input
                name="username"
                value={registerData.username}
                onChange={handleChange}
                onBlur={(e) => checkUsername(e.target.value)}
                placeholder="4~16자 영문, 숫자 조합"
                className="flex-1 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                maxLength={16}
              />
              <Button
                type="button"
                onClick={() => checkUsername(registerData.username)}
                className="px-6 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white border border-purple-500/30"
                disabled={!registerData.username || usernameCheck.status === 'checking'}
              >
                {usernameCheck.status === 'checking' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  '중복확인'
                )}
              </Button>
            </div>
            {usernameCheck.status !== 'idle' && (
              <div className={`flex items-center gap-1 text-sm ${
                usernameCheck.status === 'available' ? 'text-green-400' : 
                usernameCheck.status === 'unavailable' ? 'text-red-400' : 
                'text-yellow-400'
              }`}>
                {usernameCheck.status === 'available' && <CheckCircle2 className="w-4 h-4" />}
                {usernameCheck.status === 'unavailable' && <XCircle className="w-4 h-4" />}
                {usernameCheck.message}
              </div>
            )}
          </div>

          {/* 비밀번호 */}
          <div className="space-y-2">
            <Label className="text-white">비밀번호</Label>
            <Input
              type="password"
              name="password"
              value={registerData.password}
              onChange={handleChange}
              placeholder="6~16자 (영문, 숫자)"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              maxLength={16}
            />
          </div>

          {/* 비밀번호 확인 */}
          <div className="space-y-2">
            <Label className="text-white">비밀번호 확인</Label>
            <Input
              type="password"
              name="passwordConfirm"
              value={registerData.passwordConfirm}
              onChange={handleChange}
              placeholder="비밀번호 재입력"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              maxLength={16}
            />
          </div>

          {/* 닉네임 */}
          <div className="space-y-2">
            <Label className="text-white">닉네임</Label>
            <div className="flex gap-2">
              <Input
                name="nickname"
                value={registerData.nickname}
                onChange={handleChange}
                onBlur={(e) => checkNickname(e.target.value)}
                placeholder="닉네임 입력"
                className="flex-1 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
              <Button
                type="button"
                onClick={() => checkNickname(registerData.nickname)}
                className="px-6 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white border border-purple-500/30"
                disabled={!registerData.nickname || nicknameCheck.status === 'checking'}
              >
                {nicknameCheck.status === 'checking' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  '중복확인'
                )}
              </Button>
            </div>
            {nicknameCheck.status !== 'idle' && (
              <div className={`flex items-center gap-1 text-sm ${
                nicknameCheck.status === 'available' ? 'text-green-400' : 
                nicknameCheck.status === 'unavailable' ? 'text-red-400' : 
                'text-yellow-400'
              }`}>
                {nicknameCheck.status === 'available' && <CheckCircle2 className="w-4 h-4" />}
                {nicknameCheck.status === 'unavailable' && <XCircle className="w-4 h-4" />}
                {nicknameCheck.message}
              </div>
            )}
          </div>

          {/* 은행선택 */}
          <div className="space-y-2">
            <Label className="text-white">은행선택</Label>
            <Select value={registerData.bank_name} onValueChange={handleBankChange}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="=== 선택 ===" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {banks.map((bank) => (
                  <SelectItem 
                    key={bank.id} 
                    value={bank.name_ko}
                    className="text-white hover:bg-slate-700"
                  >
                    {bank.name_ko}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 계좌번호 */}
          <div className="space-y-2">
            <Label className="text-white">계좌번호</Label>
            <Input
              name="bank_account"
              value={registerData.bank_account}
              onChange={handleChange}
              placeholder="0000"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
            <p className="text-xs text-slate-400">(국민은행 - 입이 숫자만 기입하여 주시기 바랍니다.)</p>
          </div>

          {/* 예금주 */}
          <div className="space-y-2">
            <Label className="text-white">예금주</Label>
            <Input
              name="bank_holder"
              value={registerData.bank_holder}
              onChange={handleChange}
              placeholder="예금주"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          {/* 핸드폰 */}
          <div className="space-y-2">
            <Label className="text-white">핸드폰</Label>
            <Input
              name="phone"
              value={registerData.phone}
              onChange={handleChange}
              placeholder="핸드폰 번호"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          {/* 추천코드 */}
          <div className="space-y-2">
            <Label className="text-white">추천코드</Label>
            <Input
              name="referrer_username"
              value={registerData.referrer_username}
              onChange={handleChange}
              placeholder="추천인 아이디 (선택)"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          {/* 회원가입 버튼 */}
          <div className="pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-6 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white border border-red-400/30"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  회원가입 중...
                </>
              ) : (
                '회원가입완료'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}