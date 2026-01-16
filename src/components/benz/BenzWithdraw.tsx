import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { useMessageQueue } from '../common/MessageQueueProvider';
import { AnimatedCurrency } from '../common/AnimatedNumber';
import bcrypt from 'bcryptjs';
import { CreditCard, Clock, CheckCircle, XCircle, RefreshCw, AlertCircle, ChevronDown, X } from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface BenzWithdrawProps {
  user: any;
  onRouteChange: (route: string) => void;
}

interface WithdrawRecord {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  memo?: string;
  created_at: string;
}

export function BenzWithdraw({ user, onRouteChange }: BenzWithdrawProps) {
  const { sendMessage } = useMessageQueue();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [memo, setMemo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [withdrawRecords, setWithdrawRecords] = useState<WithdrawRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isWithdrawLocked, setIsWithdrawLocked] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const availableBanks = [
    '국민은행', '신한은행', '우리은행', 'KB국민은행', 'KEB하나은행',
    'NH농협은행', 'IBK기업은행', '지역농축협', '새마을금고', '우체국',
    '카카오뱅크', '토스뱅크', '케이뱅크'
  ];

  // 출금 제한 상태 확인
  const checkWithdrawStatus = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('transaction_type', 'user_online_withdrawal')
        .in('status', ['pending', 'approved'])
        .limit(1);

      if (error) throw error;
      
      if (data && data.length > 0) {
        setIsWithdrawLocked(true);
        toast.warning('이미 진행 중인 출금 신청이 있습니다.');
      } else {
        setIsWithdrawLocked(false);
      }
    } catch (error) {
      console.error('출금 상태 확인 오류:', error);
    }
  };

  // 잔고 조회
  const loadUserBalance = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('balance')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setBalance(parseFloat(data?.balance) || 0);
    } catch (error) {
      console.error('잔고 조회 실패:', error);
    }
  };

  // 출금 내역 조회
  const loadWithdrawRecords = async () => {
    if (!user?.id) {
      setIsLoadingHistory(false);
      return;
    }

    try {
      setIsLoadingHistory(true);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('transaction_type', 'user_online_withdrawal')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setWithdrawRecords(data || []);
    } catch (error) {
      console.error('출금 내역 조회 실패:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleAmountClick = (amount: number) => {
    const currentAmount = parseFloat(withdrawAmount.replace(/,/g, '') || '0');
    const newAmount = currentAmount + amount;
    
    // 잔고를 초과하지 않도록 체크
    if (newAmount > balance) {
      toast.warning('보유 잔고를 초과할 수 없습니다.');
      return;
    }
    
    setWithdrawAmount(newAmount.toLocaleString());
  };

  const handleClear = () => {
    setWithdrawAmount('');
  };

  const handleAllAmount = () => {
    setWithdrawAmount(balance.toString());
  };

  // 드래그 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    setModalPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  const handleSubmitRequest = () => {
    if (!withdrawAmount || parseFloat(withdrawAmount.replace(/,/g, '')) <= 0) {
      toast.error('출금 금액을 입력해주세요.');
      return;
    }

    const amount = parseFloat(withdrawAmount.replace(/,/g, ''));

    if (amount < 10000) {
      toast.error('최소 출금 금액은 10,000원입니다.');
      return;
    }

    if (amount > balance) {
      toast.error(`보유머니가 부족합니다. (잔고: ${balance.toLocaleString()}원)`);
      return;
    }

    if (!bankName || !bankAccount || !bankHolder) {
      toast.error('계좌 정보를 모두 입력해주세요.');
      return;
    }

    // 비밀번호 확인 다이얼로그 표시
    setShowPasswordDialog(true);
  };

  const handleSubmit = async () => {
    if (!password) {
      toast.error('출금 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const amount = parseFloat(withdrawAmount.replace(/,/g, ''));

      // 출금 비밀번호 확인 (withdrawal_password)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('withdrawal_password')
        .eq('id', user.id)
        .single();

      if (userError) {
        throw new Error('사용자 정보를 조회할 수 없습니다.');
      }

      if (!userData.withdrawal_password) {
        throw new Error('출금 비밀번호가 설정되지 않았습니다. 고객센터에 문의해주세요.');
      }

      // 입력한 출금 비밀번호와 DB의 출금 비밀번호 비교
      const isPasswordMatch = await bcrypt.compare(password, userData.withdrawal_password);
      if (!isPasswordMatch) {
        throw new Error('출금 비밀번호가 일치하지 않습니다.');
      }

      // 현재 잔고 재조회
      await loadUserBalance();

      // ✅ 출금 후 잔고 계산
      const balanceAfterWithdraw = balance - amount;

      // 출금 신청 데이터 생성
      const withdrawData = {
        user_id: user.id,
        partner_id: user.referrer_id || null,
        transaction_type: 'user_online_withdrawal',
        amount: amount,
        status: 'pending',
        balance_before: balance,
        balance_after: balanceAfterWithdraw,
        bank_name: bankName,
        bank_account: bankAccount,
        bank_holder: bankHolder,
        memo: memo || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('💸 출금 신청 데이터:', {
        ...withdrawData,
        user_info: {
          id: user.id,
          username: user.username,
          referrer_id: user.referrer_id
        }
      });

      // 데이터베이스에 출금 신청 기록
      const { data: insertedData, error } = await supabase
        .from('transactions')
        .insert([withdrawData])
        .select()
        .single();

      if (error) throw error;

      // 메시지 큐를 통한 실시간 알림 전송
      const success = await sendMessage('withdrawal_request', {
        transaction_id: insertedData.id,
        user_id: user.id,
        username: user.username,
        nickname: user.nickname,
        amount: amount,
        bank_name: bankName,
        bank_account: bankAccount,
        bank_holder: bankHolder,
        memo: memo || null,
        subject: `${user.nickname}님의 출금 신청`,
        reference_type: 'transaction',
        reference_id: insertedData.id
      }, 3);

      if (success) {
        console.log('✅ 출금 요청 알림이 관리자에게 전송되었습니다.');
      }

      // 활동 로그 기록
      await supabase
        .from('activity_logs')
        .insert([{
          actor_type: 'user',
          actor_id: user.id,
          action: 'withdrawal_request',
          target_type: 'transaction',
          target_id: insertedData.id,
          details: {
            amount: amount,
            bank_name: bankName,
            bank_holder: bankHolder
          }
        }]);

      toast.success('출금 신청이 완료되었습니다.', {
        duration: 4000,
      });

      setWithdrawAmount('');
      setBankName('');
      setBankAccount('');
      setBankHolder('');
      setMemo('');
      setPassword('');
      setShowPasswordDialog(false);

      // 즉시 데이터 새로고침
      await Promise.all([
        loadUserBalance(),
        loadWithdrawRecords(),
        checkWithdrawStatus()
      ]);

    } catch (error: any) {
      console.error('❌ 출금 신청 실패:', error);
      toast.error(error.message || '출금 신청에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return { 
          color: 'bg-yellow-500', 
          textColor: 'text-yellow-400', 
          icon: Clock, 
          label: '대기중'
        };
      case 'approved':
        return { 
          color: 'bg-blue-500', 
          textColor: 'text-blue-400', 
          icon: RefreshCw, 
          label: '처리중'
        };
      case 'rejected':
        return { 
          color: 'bg-red-500', 
          textColor: 'text-red-400', 
          icon: XCircle, 
          label: '거부'
        };
      case 'completed':
        return { 
          color: 'bg-green-500', 
          textColor: 'text-green-400', 
          icon: CheckCircle, 
          label: '완료'
        };
      default:
        return { 
          color: 'bg-slate-500', 
          textColor: 'text-slate-400', 
          icon: AlertCircle, 
          label: '알수없음'
        };
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount);
  };

  useEffect(() => {
    // ⚠️ checkAndSyncBalance() 제거 - 출금 페이지 진입 시 자동 출금 방지 (2026-01-15)
    // checkAndSyncBalance();
    checkWithdrawStatus();
    loadUserBalance();
    loadWithdrawRecords();

    // ✅ 실시간 구독: transactions 테이블 변경 감지
    const subscription = supabase
      .channel(`benz_withdraw_${user?.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${user?.id}`
      }, (payload) => {
        console.log('🔔 [벤츠 출금] transactions 변경 감지:', payload);
        
        const newTx = payload.new as any;
        
        // 출금 거래만 처리
        if (newTx.transaction_type === 'user_online_withdrawal') {
          // 거래 목록 새로고침
          loadWithdrawRecords();
          checkWithdrawStatus();
          
          // 잔고 새로고침 (핵심!)
          loadUserBalance();
          
          console.log('✅ [벤츠 출금] 보유금 새로고침 완료');
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id]);

  return (
    <div className="min-h-screen text-white p-4 md:p-6 pb-20 md:pb-6" style={{ fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif' }}>
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 justify-center">
        {/* 왼쪽 탭 메뉴 (모바일에서 숨김) */}
        <div className="hidden md:block w-56 flex-shrink-0">
          <button
            onClick={() => onRouteChange('/benz/deposit')}
            className="w-full py-4 px-5 mb-3 text-left border text-gray-300 font-medium text-lg transition-all"
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(193, 154, 107, 0.3)',
              borderRadius: '8px'
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-gray-400"></div>
              보유머니 입금
            </div>
          </button>
          <button
            className="w-full py-4 px-5 text-left relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100"
            style={{
              background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
              boxShadow: `
                0 4px 15px rgba(193, 154, 107, 0.3),
                inset 0 2px 4px rgba(255, 255, 255, 0.2),
                inset 0 -4px 8px rgba(0, 0, 0, 0.3)
              `,
              borderRadius: '8px'
            }}
          >
            {/* 광택 효과 */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20 pointer-events-none"></div>
            <div className="relative flex items-center gap-3">
              <div className="w-2 h-2 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
              <span className="font-black text-lg text-white" style={{
                textShadow: `
                  2px 2px 0px rgba(0,0,0,0.5),
                  -1px -1px 0px rgba(255,255,255,0.3),
                  0 0 10px rgba(255,255,255,0.5)
                `,
                WebkitTextStroke: '0.5px rgba(0,0,0,0.2)'
              }}>즉시머니 출금</span>
            </div>
          </button>
        </div>

        {/* 오른쪽 컨텐츠 */}
        <div className="flex-1 w-full md:max-w-[70%]">
          {/* 제목 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-8" style={{
                  background: 'linear-gradient(180deg, #C19A6B 0%, #A67C52 100%)'
                }}></div>
                <h1 className="text-2xl font-bold" style={{
                  background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 50%, #A67C52 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>즉시머니 출금</h1>
              </div>
              <div className="px-6 py-3 border-0" style={{
                background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
                border: '1px solid rgba(193, 154, 107, 0.3)',
                borderRadius: '8px'
              }}>
                <div className="text-sm text-gray-400 mb-1">현재 잔고</div>
                <div className="text-xl font-bold" style={{
                  background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  <AnimatedCurrency value={balance} duration={800} currencySymbol="₩" />
                </div>
              </div>
            </div>
          </div>

          {/* 출금 제한 경고 */}
          {isWithdrawLocked && (
            <div className="bg-yellow-900/20 border border-yellow-600 p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="text-yellow-400 text-xl">⚠️</div>
                <div className="text-yellow-300">이미 진행 중인 출금 신청이 있습니다. 완료 후 다시 시도해주세요.</div>
              </div>
            </div>
          )}

          {/* Notice */}
          <div className="p-6 mb-6 border-0" style={{
            background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
            border: '1px solid rgba(193, 154, 107, 0.2)',
            borderRadius: '8px'
          }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-2 h-2 animate-pulse" style={{
                background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                boxShadow: '0 0 8px rgba(193, 154, 107, 0.6)'
              }}></div>
              <h2 className="text-xl font-bold" style={{
                background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>Notice</h2>
            </div>
            <div className="space-y-3 text-base text-gray-300 leading-relaxed">
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>1.</span>
                <span>출금 시 반드시 본인 명의 계좌로만 신청해주시기 바랍니다.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>2.</span>
                <span>출금하신 머니는 출금자 본인 계좌로만 송금되며 타인의 계좌 출금 신청시 승인되지 않습니다.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>3.</span>
                <span>출금 신청 시 정확한 계좌정보 입력 후 신청하시길 부탁드립니다.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>4.</span>
                <span>출금은 최소 10,000원부터 가능하며, 수수료는 별도로 부과되지 않습니다.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>5.</span>
                <span>게임 플레이 중에는 출금이 제한될 수 있습니다. 게임 종료 후 출금해주세요.</span>
              </div>
            </div>
          </div>

          {/* 출금 안내 */}
          <div className="p-6 mb-6 border-0" style={{
            background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
            border: '1px solid rgba(193, 154, 107, 0.2)',
            borderRadius: '8px'
          }}>
            <div className="p-5 mb-4" style={{
              background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, rgba(166, 124, 82, 0.1) 100%)',
              border: '1px solid rgba(193, 154, 107, 0.3)',
              borderRadius: '8px'
            }}>
              <h3 className="text-lg font-bold mb-3" style={{
                background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>출금 안내</h3>
              <p className="text-base text-gray-300 mb-4 leading-relaxed">
                출금은 24시간 처리되며, 영업일 기준 1~3시간 내 처리됩니다. 출금 신청 후 계좌번호 확인이 필요한 경우 고객센터로 문의해주세요.
              </p>
            </div>

            <div className="space-y-3 text-sm text-gray-400 leading-relaxed">
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>•</span>
                <span>출금 신청 시 본인 명의 계좌번호를 정확히 입력해주세요.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>•</span>
                <span>출금 대기가 많을 경우 처리 시간이 지연될 수 있으니 양해 부탁드립니다.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>•</span>
                <span>출금 신청 시 본인 확인을 위해 출금 비밀번호(숫자 4자리)를 입력해야 합니다.</span>
              </div>
            </div>
          </div>

          {/* 출금 보유머니 */}
          <div className="mb-6">
            <label className="block text-base font-semibold mb-3" style={{ color: '#E6C9A8' }}>신청금액</label>
            <div className="relative">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-lg" style={{ color: '#C19A6B' }}>₩</div>
              <input
                type="text"
                value={withdrawAmount}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  const numValue = parseFloat(value || '0');
                  if (numValue > balance) {
                    return;
                  }
                  setWithdrawAmount(value ? parseInt(value).toLocaleString() : '');
                }}
                placeholder="출금할 금액을 입력해주세요"
                className="w-full pl-14 pr-5 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:ring-2 transition-all font-semibold border-0"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(193, 154, 107, 0.3)',
                  borderRadius: '8px'
                }}
                disabled={isWithdrawLocked}
              />
            </div>
          </div>

          {/* 출금계좌 입력 */}
          <div className="mb-6">
            <label className="block text-base font-semibold mb-3" style={{ color: '#E6C9A8' }}>출금 계좌 정보</label>
            <div className="space-y-3">
              <Select
                value={bankName}
                onValueChange={(value) => setBankName(value)}
                disabled={isWithdrawLocked}
              >
                <SelectTrigger
                  className="w-auto min-w-[200px] h-[56px] px-5 text-white text-lg focus:outline-none focus:ring-2 transition-all font-medium border-0 [&>span]:text-left"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(193, 154, 107, 0.3)',
                    borderRadius: '8px'
                  }}
                >
                  <SelectValue placeholder="은행 선택" className="text-left" />
                </SelectTrigger>
                <SelectContent
                  className="bg-black/80 border-0"
                  style={{
                    border: '1px solid rgba(193, 154, 107, 0.3)',
                    borderRadius: '8px'
                  }}
                >
                  {availableBanks.map((bank) => (
                    <SelectItem 
                      key={bank} 
                      value={bank}
                      className="text-white text-lg hover:bg-[rgba(193,154,107,0.2)] cursor-pointer focus:bg-[rgba(193,154,107,0.3)]"
                    >
                      {bank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="text"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="계좌번호 (숫자만 입력)"
                className="w-full px-5 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:ring-2 transition-all font-medium border-0"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(193, 154, 107, 0.3)',
                  borderRadius: '8px'
                }}
                disabled={isWithdrawLocked}
              />
              <input
                type="text"
                value={bankHolder}
                onChange={(e) => setBankHolder(e.target.value)}
                placeholder="예금주명"
                className="w-full px-5 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:ring-2 transition-all font-medium border-0"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(193, 154, 107, 0.3)',
                  borderRadius: '8px'
                }}
                disabled={isWithdrawLocked}
              />
            </div>
          </div>

          {/* 메모 입력 */}
          <div className="mb-6">
            <label className="block text-base font-semibold mb-3" style={{ color: '#E6C9A8' }}>메모 (선택사항)</label>
            <div className="relative">
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="추가 메모사항이 있으시면 입력해주세요"
                className="w-full px-5 py-4 text-white text-base placeholder-gray-500 focus:outline-none focus:ring-2 transition-all font-medium border-0"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(193, 154, 107, 0.3)',
                  borderRadius: '8px'
                }}
                rows={3}
                disabled={isWithdrawLocked}
              />
            </div>
          </div>

          {/* 금액 버튼 + 신청하기 */}
          <div className="mb-8 space-y-3">
            {/* 금액 버튼들 - 모바일 그리드 */}
            <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
              {[
                { amount: 10000, label: '1만원' },
                { amount: 30000, label: '3만원' },
                { amount: 50000, label: '5만원' },
                { amount: 100000, label: '10만원' },
                { amount: 300000, label: '30만원' },
                { amount: 500000, label: '50만원' },
                { amount: 1000000, label: '100만원' }
              ].map(({ amount, label }) => (
                <button
                  key={amount}
                  onClick={() => handleAmountClick(amount)}
                  disabled={isWithdrawLocked}
                  className="relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed px-4 md:px-6 py-3"
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    boxShadow: `
                      inset 0 2px 4px rgba(255, 255, 255, 0.3),
                      inset 0 -4px 8px rgba(0, 0, 0, 0.3)
                    `
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20 pointer-events-none"></div>
                  <span className="relative font-black text-white text-sm md:text-base" style={{
                    textShadow: `
                      2px 2px 0px rgba(0,0,0,0.5),
                      -1px -1px 0px rgba(255,255,255,0.3),
                      0 0 10px rgba(255,255,255,0.5)
                    `,
                    WebkitTextStroke: '0.5px rgba(0,0,0,0.2)'
                  }}>{label}</span>
                </button>
              ))}
              <button
                onClick={handleAllAmount}
                disabled={isWithdrawLocked}
                className="relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed px-4 md:px-6 py-3"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: `
                    inset 0 2px 4px rgba(255, 255, 255, 0.3),
                    inset 0 -4px 8px rgba(0, 0, 0, 0.3)
                  `
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20 pointer-events-none"></div>
                <span className="relative font-black text-white text-sm md:text-base" style={{
                  textShadow: `
                    2px 2px 0px rgba(0,0,0,0.5),
                    -1px -1px 0px rgba(255,255,255,0.3),
                    0 0 10px rgba(255,255,255,0.5)
                  `,
                  WebkitTextStroke: '0.5px rgba(0,0,0,0.2)'
                }}>전액</span>
              </button>
              <button
                onClick={handleClear}
                disabled={isWithdrawLocked}
                className="relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed px-4 md:px-6 py-3"
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  boxShadow: `
                    inset 0 2px 4px rgba(255, 255, 255, 0.3),
                    inset 0 -4px 8px rgba(0, 0, 0, 0.3)
                  `
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20 pointer-events-none"></div>
                <span className="relative font-black text-white text-sm md:text-base" style={{
                  textShadow: `
                    2px 2px 0px rgba(0,0,0,0.5),
                    -1px -1px 0px rgba(255,255,255,0.3),
                    0 0 10px rgba(255,255,255,0.5)
                  `,
                  WebkitTextStroke: '0.5px rgba(0,0,0,0.2)'
                }}>정정</span>
              </button>
            </div>

            {/* 신청하기 버튼 - 모바일 전체 너비 */}
            <button
              onClick={handleSubmitRequest}
              disabled={loading || isWithdrawLocked}
              className="w-full md:w-auto relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100 disabled:scale-100 disabled:opacity-50 disabled:cursor-not-allowed px-12 py-4 whitespace-nowrap"
              style={{
                background: (loading || isWithdrawLocked) ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' : 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                borderRadius: '8px',
                boxShadow: `
                  0 4px 15px rgba(193, 154, 107, 0.3),
                  inset 0 2px 4px rgba(255, 255, 255, 0.2),
                  inset 0 -4px 8px rgba(0, 0, 0, 0.3)
                `
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20 pointer-events-none"></div>
              <span className="relative text-lg font-black text-white" style={{
                textShadow: `
                  2px 2px 0px rgba(0,0,0,0.5),
                  -1px -1px 0px rgba(255,255,255,0.3),
                  0 0 10px rgba(255,255,255,0.5)
                `,
                WebkitTextStroke: '0.5px rgba(0,0,0,0.2)'
              }}>{loading ? '처리 중...' : '신청하기'}</span>
            </button>
          </div>

          {/* 비밀번호 확인 다이얼로그 */}
          {showPasswordDialog && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div 
                className="p-8 max-w-md w-full mx-4 border-0 select-none relative" 
                style={{
                  background: '#1a1a1a',
                  border: '2px solid rgba(193, 154, 107, 0.8)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                  transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)`,
                  cursor: isDragging ? 'grabbing' : 'default'
                }}
              >
                {/* X 닫기 버튼 */}
                <button
                  onClick={() => {
                    setShowPasswordDialog(false);
                    setPassword('');
                  }}
                  className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full transition-all hover:bg-white/10"
                  style={{ color: '#C19A6B' }}
                >
                  <X className="w-8 h-8" />
                </button>
                
                <h3 
                  className="text-xl font-bold mb-4 cursor-grab active:cursor-grabbing pr-12" 
                  style={{
                    background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                  onMouseDown={handleMouseDown}
                >
                  출금 신청 확인
                </h3>
                <p className="text-gray-300 mb-4">출금 신청을 완료하려면 비밀번호를 입력해주세요.</p>
                
                <div className="p-4 mb-4 border-0" style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(193, 154, 107, 0.4)',
                  borderRadius: '8px'
                }}>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-400">출금 금액:</span>
                    <span className="text-white font-semibold">{withdrawAmount}원</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-400">출금 후 잔고:</span>
                    <span className="text-white font-semibold">
                      <AnimatedCurrency value={balance - parseFloat(withdrawAmount.replace(/,/g, '') || '0')} duration={800} currencySymbol="₩" />
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mt-3">
                    <div>{bankName} {bankAccount}</div>
                    <div>예금주: {bankHolder}</div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-gray-300 mb-2">출금 비밀번호 (4자리) *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="출금 비밀번호 4자리를 입력해주세요"
                    className="w-full px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all border-0"
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(193, 154, 107, 0.4)',
                      borderRadius: '8px'
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && password) {
                        handleSubmit();
                      }
                    }}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowPasswordDialog(false);
                      setPassword('');
                    }}
                    className="flex-1 px-6 py-3 transition-all border-0 text-white"
                    style={{
                      background: '#2a2a2a',
                      border: '1px solid rgba(193, 154, 107, 0.5)',
                      borderRadius: '8px'
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading || !password}
                    className="flex-1 relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100 disabled:scale-100 disabled:opacity-50 px-6 py-3"
                    style={{
                      background: (loading || !password) ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' : 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                      borderRadius: '8px',
                      boxShadow: `
                        0 4px 15px rgba(193, 154, 107, 0.3),
                        inset 0 2px 4px rgba(255, 255, 255, 0.2),
                        inset 0 -4px 8px rgba(0, 0, 0, 0.3)
                      `
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20 pointer-events-none"></div>
                    <span className="relative font-black text-white" style={{
                      textShadow: `
                        2px 2px 0px rgba(0,0,0,0.5),
                        -1px -1px 0px rgba(255,255,255,0.3),
                        0 0 10px rgba(255,255,255,0.5)
                      `,
                      WebkitTextStroke: '0.5px rgba(0,0,0,0.2)'
                    }}>{loading ? '처리 중...' : '확인'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 출금 내역 테이블 */}
          <div className="overflow-hidden border-0" style={{
            background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)',
            border: '1px solid rgba(193, 154, 107, 0.2)',
            borderRadius: '8px'
          }}>
            <div className="px-6 py-4" style={{
              background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.15) 0%, rgba(166, 124, 82, 0.1) 100%)',
              borderBottom: '1px solid rgba(193, 154, 107, 0.2)'
            }}>
              <h3 className="text-xl font-bold" style={{
                background: 'linear-gradient(135deg, #E6C9A8 0%, #C19A6B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>최근 출금 내역</h3>
            </div>
            <div className="p-6">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : withdrawRecords.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">출금 내역이 없습니다.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr style={{
                        borderBottom: '1px solid rgba(193, 154, 107, 0.3)'
                      }}>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: '#C19A6B' }}>상태</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#C19A6B' }}>금액</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: '#C19A6B' }}>은행명</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: '#C19A6B' }}>계좌번호</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: '#C19A6B' }}>예금주</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#C19A6B' }}>신청일시</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawRecords.map((record, index) => {
                        const statusInfo = getStatusInfo(record.status);
                        const StatusIcon = statusInfo.icon;
                        
                        return (
                          <tr 
                            key={record.id}
                            style={{
                              borderBottom: index !== withdrawRecords.length - 1 ? '1px solid rgba(193, 154, 107, 0.1)' : 'none'
                            }}
                            className="hover:bg-black/20 transition-colors"
                          >
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <StatusIcon className={`w-4 h-4 ${statusInfo.textColor}`} />
                                <Badge
                                  variant="outline"
                                  className={`${statusInfo.color} text-white border-none text-xs`}
                                >
                                  {statusInfo.label}
                                </Badge>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="font-semibold text-white">₩{formatCurrency(record.amount)}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-gray-300">{record.bank_name}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-gray-300">{record.bank_account}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-gray-300">{record.bank_holder}</span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="text-gray-400 text-sm">
                                {new Date(record.created_at).toLocaleString('ko-KR', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}