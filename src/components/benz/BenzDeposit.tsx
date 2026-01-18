import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { useMessageQueue } from '../common/MessageQueueProvider';
import { AnimatedCurrency } from '../common/AnimatedNumber';
import { 
  CreditCard, 
  Wallet,
  Clock,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Info,
  Plus,
  Bell
} from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { Badge } from '../ui/badge';

interface BenzDepositProps {
  user: any;
  onRouteChange: (route: string) => void;
}

interface DepositRecord {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  memo?: string;
  created_at: string;
  bank_name?: string;
  bank_account?: string;
}

export function BenzDeposit({ user, onRouteChange }: BenzDepositProps) {
  const { sendMessage } = useMessageQueue();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositAccount, setDepositAccount] = useState('');
  const [memo, setMemo] = useState('');
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [depositRecords, setDepositRecords] = useState<DepositRecord[]>([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // 계좌정보 조회
  const loadAccountInfo = async () => {
    if (!user?.referrer_id) return;

    try {
      // 사용자의 최상위 파트너(Lv1) 찾기
      let currentPartnerId = user.referrer_id;
      let partnersChecked = 0;
      const maxDepth = 10;

      while (partnersChecked < maxDepth) {
        const { data: partner } = await supabase
          .from('partners')
          .select('level, referrer_id, bank_name, bank_account, bank_holder')
          .eq('id', currentPartnerId)
          .single();

        if (!partner) break;

        if (partner.level === 1) {
          // Lv1 찾음
          setAccountInfo({
            bank_name: partner.bank_name,
            bank_account: partner.bank_account,
            bank_holder: partner.bank_holder
          });
          break;
        }

        if (!partner.referrer_id) break;
        currentPartnerId = partner.referrer_id;
        partnersChecked++;
      }
    } catch (error) {
      console.error('계좌정보 조회 실패:', error);
    }
  };

  // 입금 내역 조회
  const loadDepositRecords = async () => {
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
        .eq('transaction_type', 'deposit')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setDepositRecords(data || []);
    } catch (error) {
      console.error('입금 내역 조회 실패:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // 현재 잔고 조회
  const fetchCurrentBalance = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('balance')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setCurrentBalance(parseFloat(data.balance) || 0);
    } catch (error) {
      console.error('잔고 조회 오류:', error);
    }
  };

  // 진행 중인 입금 신청 확인 (중복 방지)
  const checkPendingDeposit = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('transaction_type', 'deposit')
        .in('status', ['pending', 'approved'])
        .limit(1);

      if (error) {
        console.error('❌ 진행 중인 입금 확인 오류:', error);
        return true; // 오류 시 안전하게 진행 허용
      }

      if (data && data.length > 0) {
        toast.warning('이미 진행 중인 입금 신청이 있습니다.');
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ 진행 중인 입금 확인 오류:', error);
      return true; // 오류 시 안전하게 진행 허용
    }
  };

  const handleAmountClick = (amount: number) => {
    // 기존 금액에 누적
    const currentAmount = parseFloat(depositAmount.replace(/,/g, '')) || 0;
    const newAmount = currentAmount + amount;
    setDepositAmount(newAmount.toLocaleString());
  };

  const handleClear = () => {
    setDepositAmount('');
  };

  const handleSendAccountNumber = async () => {
    // 고객센터(Support)로 이동
    onRouteChange('/benz/support');
  };

  const handleSubmit = async () => {
    if (!depositAmount || parseFloat(depositAmount.replace(/,/g, '')) <= 0) {
      toast.error('입금 금액을 입력해주세요.');
      return;
    }

    if (!depositAccount || depositAccount.trim() === '') {
      toast.error('입금자 계좌번호를 입력해주세요.');
      return;
    }

    const amount = parseFloat(depositAmount.replace(/,/g, ''));

    // 최소/최대 금액 검증
    if (amount < 10000) {
      toast.error('최소 입금 금액은 10,000원입니다.');
      return;
    }

    if (amount > 10000000) {
      toast.error('최대 입금 금액은 10,000,000원입니다.');
      return;
    }

    // 중복 신청 방지
    const canDeposit = await checkPendingDeposit();
    if (!canDeposit) {
      return;
    }

    setLoading(true);

    try {
      // 현재 잔고 재조회
      await fetchCurrentBalance();

      // 입금 신청 데이터 생성
      const depositData = {
        user_id: user.id,
        partner_id: user.referrer_id || null,
        transaction_type: 'deposit',
        amount: amount,
        status: 'pending',
        balance_before: currentBalance,
        balance_after: currentBalance,
        bank_name: accountInfo?.bank_name || '미확인',
        bank_account: accountInfo?.bank_account || '미확인',
        bank_holder: accountInfo?.bank_holder || '미확인',
        memo: `입금자 계좌: ${depositAccount}${memo ? ` | ${memo}` : ''}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('💰 입금 신청 데이터:', {
        ...depositData,
        user_info: {
          id: user.id,
          username: user.username,
          referrer_id: user.referrer_id
        }
      });

      // 데이터베이스에 입금 신청 기록
      const { data: insertedData, error } = await supabase
        .from('transactions')
        .insert([depositData])
        .select()
        .single();

      if (error) throw error;

      // 메시지 큐를 통한 실시간 알림 전송
      const success = await sendMessage('deposit_request', {
        transaction_id: insertedData.id,
        user_id: user.id,
        username: user.username,
        nickname: user.nickname,
        amount: amount,
        bank_name: accountInfo?.bank_name || '미확인',
        bank_account: accountInfo?.bank_account || '미확인',
        depositor_name: depositAccount,
        memo: memo || null,
        subject: `${user.nickname}님의 입금 신청`,
        reference_type: 'transaction',
        reference_id: insertedData.id
      }, 3);

      if (success) {
        console.log('✅ 입금 요청 알림이 관리자에게 전송되었습니다.');
      }

      // 활동 로그 기록
      await supabase
        .from('activity_logs')
        .insert([{
          actor_type: 'user',
          actor_id: user.id,
          action: 'deposit_request',
          target_type: 'transaction',
          target_id: insertedData.id,
          details: {
            amount: amount,
            bank_name: accountInfo?.bank_name || '미확인',
            depositor_account: depositAccount
          }
        }]);

      toast.success('입금 신청이 완료되었습니다.', {
        duration: 4000,
      });

      setDepositAmount('');
      setDepositAccount('');
      setMemo('');

      // 즉시 내역 새로고침
      await loadDepositRecords();
    } catch (error: any) {
      console.error('❌ 입금 신청 실패:', error);
      toast.error(error.message || '입금 신청에 실패했습니다.');
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
      case 'completed':
        return { 
          color: 'bg-green-500', 
          textColor: 'text-green-400', 
          icon: CheckCircle, 
          label: '완료'
        };
      case 'rejected':
        return { 
          color: 'bg-red-500', 
          textColor: 'text-red-400', 
          icon: XCircle, 
          label: '거부'
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
    loadAccountInfo();
    loadDepositRecords();
    fetchCurrentBalance();

    // 실시간 입금 상태 업데이트 구독
    const subscription = supabase
      .channel(`deposit_updates_${user?.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${user?.id}`
      }, (payload) => {
        console.log('🔄 입금 상태 업데이트 수신:', payload);
        
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const newTransaction = payload.new as any;
          
          if (newTransaction.transaction_type === 'deposit') {
            // 즉시 데이터 새로고침
            loadDepositRecords();
            
            if (newTransaction.status === 'completed') {
              fetchCurrentBalance();
              toast.success(`입금이 완료되었습니다\n금액: ₩${formatCurrency(newTransaction.amount)}`, {
                duration: 5000,
              });
            } else if (newTransaction.status === 'rejected') {
              toast.error(`입금이 거부되었습니다\n금액: ₩${formatCurrency(newTransaction.amount)}`, {
                duration: 5000,
              });
            } else if (newTransaction.status === 'approved') {
              toast.info(`입금이 승인되었습니다\n금액: ₩${formatCurrency(newTransaction.amount)}`, {
                duration: 4000,
              });
            }
          }
        }
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, [user?.referrer_id, user?.id]);

  return (
    <div className="min-h-screen text-white p-4 md:p-6 pb-20 md:pb-6" style={{ fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif' }}>
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 justify-center">
        {/* 왼쪽 탭 메뉴 (모바일에서 숨김) */}
        <div className="hidden md:block w-56 flex-shrink-0">
          <button
            className="w-full py-4 px-5 mb-3 text-left relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100"
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
              }}>보유머니 입금</span>
            </div>
          </button>
          <button
            onClick={() => onRouteChange('/benz/withdraw')}
            className="w-full py-4 px-5 text-left border text-gray-300 font-medium text-lg transition-all"
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(193, 154, 107, 0.3)',
              borderRadius: '8px'
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-gray-400"></div>
              즉시머니 출금
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
                }}>보유머니 입금</h1>
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
                  <AnimatedCurrency value={currentBalance} duration={800} currencySymbol="₩" />
                </div>
              </div>
            </div>
          </div>

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
                <span>입금 시 반드시 계좌확인 후 입금을 부탁 드립니다.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>2.</span>
                <span>입금하신 머니는 입금자 본인 계좌로만 재차되며 타인의 은행 예금 신청시 승인되지 않습니다.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>3.</span>
                <span>입금계좌는 수시로 변경됩니다. [계좌번호 문의] 후 본사 예금 계좌번호를 확인 후 입금하시길 부탁드립니다.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>4.</span>
                <span>타사의 충전내역 및 베팅내역 캡쳐를 이용한 신청시 적발 시 제재처리 됩니다.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>5.</span>
                <span>최소 입금 금액: 10,000원 | 최대 입금 금액: 10,000,000원</span>
              </div>
            </div>
          </div>

          {/* 입금 계좌 정보 확인 */}
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
              }}>입금 계좌 정보</h3>
              <p className="text-base text-gray-300 mb-4 leading-relaxed">
                입금 계좌정보는 매번 변동될 수 있으며, 예금주는 수시로 변경됩니다. 입금 전에 반드시 계좌번호를 먼저 전달받으시기 바랍니다.
              </p>
              <button
                onClick={handleSendAccountNumber}
                className="relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100 px-8 py-3"
                style={{
                  background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                  borderRadius: '8px',
                  boxShadow: `
                    0 4px 15px rgba(193, 154, 107, 0.3),
                    inset 0 2px 4px rgba(255, 255, 255, 0.2),
                    inset 0 -4px 8px rgba(0, 0, 0, 0.3)
                  `
                }}
              >
                {/* 광택 효과 */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20 pointer-events-none"></div>
                <span className="relative font-black text-white" style={{
                  textShadow: `
                    2px 2px 0px rgba(0,0,0,0.5),
                    -1px -1px 0px rgba(255,255,255,0.3),
                    0 0 10px rgba(255,255,255,0.5)
                  `,
                  WebkitTextStroke: '0.5px rgba(0,0,0,0.2)'
                }}>계좌번호 문의</span>
              </button>
            </div>

            {accountInfo && (
              <div className="p-5 mb-4" style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
                borderRadius: '8px'
              }}>
                <div className="text-base space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-medium">은행:</span>
                    <span className="text-white font-semibold">{accountInfo.bank_name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-medium">계좌번호:</span>
                    <span className="text-white font-semibold">{accountInfo.bank_account || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-medium">예금주:</span>
                    <span className="text-white font-semibold">{accountInfo.bank_holder || '-'}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 text-sm text-gray-400 leading-relaxed">
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>•</span>
                <span>입금 전 반드시 위의 계좌번호 문의 버튼을 통해 고객센터로 문의해주세요.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>•</span>
                <span>계좌번호로 입금 신청 시 입금자명을 정확히 기재해주세요.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold flex-shrink-0" style={{ color: '#C19A6B' }}>•</span>
                <span>충전 신청이 많아 입금대기 상태가 지연될 수 있으며, 기다리시면 자동 정산됩니다.</span>
              </div>
            </div>
          </div>

          {/* 입금 보유머니 */}
          <div className="mb-6">
            <label className="block text-base font-semibold mb-3" style={{ color: '#E6C9A8' }}>입금액</label>
            <div className="relative">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-lg" style={{ color: '#C19A6B' }}>₩</div>
              <input
                type="text"
                value={depositAmount}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  setDepositAmount(value ? parseInt(value).toLocaleString() : '');
                }}
                placeholder="입금할 금액을 입력해주세요"
                className="w-full pl-14 pr-5 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:ring-2 transition-all font-semibold border-0"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(193, 154, 107, 0.3)',
                  borderRadius: '8px'
                }}
              />
            </div>
          </div>

          {/* 입금계좌 입력 */}
          <div className="mb-6">
            <label className="block text-base font-semibold mb-3" style={{ color: '#E6C9A8' }}>입금자 계좌 정보</label>
            <div className="relative">
              <input
                type="text"
                value={depositAccount}
                onChange={(e) => setDepositAccount(e.target.value)}
                placeholder="입금하신 계좌 정보를 입력해주세요"
                className="w-full px-5 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:ring-2 transition-all font-medium border-0"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(193, 154, 107, 0.3)',
                  borderRadius: '8px'
                }}
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
              />
            </div>
          </div>

          {/* 금액 버튼 + 신청하기 */}
          <div className="flex gap-3 mb-8">
            <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 flex-1">
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
                  className="relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100 px-4 md:px-6 py-3"
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
                onClick={handleClear}
                className="relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100 px-6 py-3"
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  boxShadow: `
                    inset 0 2px 4px rgba(255, 255, 255, 0.3),
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
                }}>정정</span>
              </button>
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="relative overflow-hidden transform transition-all duration-300 hover:scale-105 active:scale-100 disabled:scale-100 px-12 py-3 whitespace-nowrap"
              style={{
                background: loading ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' : 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
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

          {/* 입금 내역 테이블 */}
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
              }}>최근 입금 내역</h3>
            </div>
            <div className="p-6">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : depositRecords.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">입금 내역이 없습니다.</p>
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
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: '#C19A6B' }}>메모</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#C19A6B' }}>신청일시</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depositRecords.map((record, index) => {
                        const statusInfo = getStatusInfo(record.status);
                        const StatusIcon = statusInfo.icon;
                        
                        return (
                          <tr 
                            key={record.id}
                            style={{
                              borderBottom: index !== depositRecords.length - 1 ? '1px solid rgba(193, 154, 107, 0.1)' : 'none'
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
                              <span className="text-gray-300">{record.bank_name || '-'}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-gray-300">{record.bank_account || '-'}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-gray-300 text-sm">{record.memo || '-'}</span>
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