import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { AlertCircle, DollarSign, ArrowDown } from 'lucide-react';
import { Partner } from './partner/types';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';

interface HierarchyTransactionModalProps {
  open: boolean;
  onClose: () => void;
  type: 'deposit' | 'withdrawal';
  targetPartner: Partner;
  currentUser: Partner;
  onSuccess: () => void;
}

export function HierarchyTransactionModal({
  open,
  onClose,
  type,
  targetPartner,
  currentUser,
  onSuccess
}: HierarchyTransactionModalProps) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [parentPartner, setParentPartner] = useState<Partner | null>(null);
  const [walletType, setWalletType] = useState<'invest' | 'oroplay'>('invest');

  useEffect(() => {
    if (open && targetPartner.parent_id) {
      loadParentPartner();
    }
  }, [open, targetPartner]);

  const loadParentPartner = async () => {
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .eq('id', targetPartner.parent_id)
        .single();

      if (error) throw error;
      setParentPartner(data);
    } catch (error) {
      console.error('직속 상위 파트너 조회 실패:', error);
    }
  };

  const getAvailableBalance = () => {
    if (type === 'deposit') {
      // 입금: 직속 상위의 잔고 확인
      if (!parentPartner) return 0;

      if (parentPartner.level === 1) {
        // Lv1: API별 잔고는 api_configs에서 조회 필요 (여기서는 간단히 0 반환)
        return 0;
      } else if (parentPartner.level === 2) {
        // Lv2: invest_balance 또는 oroplay_balance
        return walletType === 'invest' 
          ? (parentPartner.invest_balance || 0)
          : (parentPartner.oroplay_balance || 0);
      } else {
        // Lv3~7: balance
        return parentPartner.balance || 0;
      }
    } else {
      // 출금: 대상 파트너의 잔고 확인
      if (targetPartner.level === 2) {
        // Lv2: invest_balance + oroplay_balance
        return (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0);
      } else {
        // Lv3~7: balance
        return targetPartner.balance || 0;
      }
    }
  };

  const handleSubmit = async () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      toast.error('올바른 금액을 입력하세요');
      return;
    }

    const availableBalance = getAvailableBalance();
    if (amountNum > availableBalance) {
      toast.error(`잔고가 부족합니다. 사용 가능 잔고: ₩${availableBalance.toLocaleString()}`);
      return;
    }

    setLoading(true);

    try {
      if (type === 'deposit') {
        await handleDeposit(amountNum);
      } else {
        await handleWithdrawal(amountNum);
      }

      toast.success(`${type === 'deposit' ? '입금' : '출금'} 완료`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('트랜잭션 실패:', error);
      toast.error(error.message || '트랜잭션 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async (amountNum: number) => {
    if (!parentPartner) throw new Error('직속 상위 파트너 정보가 없습니다');

    // 1. 직속 상위 잔고 차감
    if (parentPartner.level === 2) {
      // Lv2: invest_balance 또는 oroplay_balance 차감
      const balanceField = walletType === 'invest' ? 'invest_balance' : 'oroplay_balance';
      const newBalance = (parentPartner[balanceField] || 0) - amountNum;

      const { error: parentError } = await supabase
        .from('partners')
        .update({ [balanceField]: newBalance })
        .eq('id', parentPartner.id);

      if (parentError) throw parentError;
    } else if (parentPartner.level >= 3) {
      // Lv3~7: balance 차감
      const newBalance = (parentPartner.balance || 0) - amountNum;

      const { error: parentError } = await supabase
        .from('partners')
        .update({ balance: newBalance })
        .eq('id', parentPartner.id);

      if (parentError) throw parentError;
    }

    // 2. 대상 파트너 잔고 증가
    if (targetPartner.level === 2) {
      // Lv2: invest_balance 또는 oroplay_balance 증가
      const balanceField = walletType === 'invest' ? 'invest_balance' : 'oroplay_balance';
      const newBalance = (targetPartner[balanceField] || 0) + amountNum;

      const { error: targetError } = await supabase
        .from('partners')
        .update({ [balanceField]: newBalance })
        .eq('id', targetPartner.id);

      if (targetError) throw targetError;
    } else if (targetPartner.level >= 3) {
      // Lv3~7: balance 증가
      const newBalance = (targetPartner.balance || 0) + amountNum;

      const { error: targetError } = await supabase
        .from('partners')
        .update({ balance: newBalance })
        .eq('id', targetPartner.id);

      if (targetError) throw targetError;
    }

    // 3. 트랜잭션 기록 생성
    await createTransactionRecord('deposit', amountNum, parentPartner.id, targetPartner.id);
  };

  const handleWithdrawal = async (amountNum: number) => {
    // 1. 대상 파트너 잔고 차감
    if (targetPartner.level === 2) {
      // Lv2: invest_balance + oroplay_balance 중에서 차감
      // 간단히 invest_balance부터 차감
      let remaining = amountNum;
      let newInvestBalance = targetPartner.invest_balance || 0;
      let newOroplayBalance = targetPartner.oroplay_balance || 0;

      if (newInvestBalance >= remaining) {
        newInvestBalance -= remaining;
      } else {
        remaining -= newInvestBalance;
        newInvestBalance = 0;
        newOroplayBalance -= remaining;
      }

      const { error: targetError } = await supabase
        .from('partners')
        .update({ 
          invest_balance: newInvestBalance,
          oroplay_balance: newOroplayBalance
        })
        .eq('id', targetPartner.id);

      if (targetError) throw targetError;
    } else if (targetPartner.level >= 3) {
      // Lv3~7: balance 차감
      const newBalance = (targetPartner.balance || 0) - amountNum;

      const { error: targetError } = await supabase
        .from('partners')
        .update({ balance: newBalance })
        .eq('id', targetPartner.id);

      if (targetError) throw targetError;
    }

    // 2. 실행자(상위) 잔고 증가
    if (currentUser.level === 2) {
      // Lv2: invest_balance 또는 oroplay_balance 증가
      const balanceField = walletType === 'invest' ? 'invest_balance' : 'oroplay_balance';
      const newBalance = (currentUser[balanceField] || 0) + amountNum;

      const { error: executorError } = await supabase
        .from('partners')
        .update({ [balanceField]: newBalance })
        .eq('id', currentUser.id);

      if (executorError) throw executorError;
    } else if (currentUser.level >= 3) {
      // Lv3~7: balance 증가
      const newBalance = (currentUser.balance || 0) + amountNum;

      const { error: executorError } = await supabase
        .from('partners')
        .update({ balance: newBalance })
        .eq('id', currentUser.id);

      if (executorError) throw executorError;
    }

    // 3. 트랜잭션 기록 생성
    await createTransactionRecord('withdrawal', amountNum, targetPartner.id, currentUser.id);
  };

  const createTransactionRecord = async (
    txType: 'deposit' | 'withdrawal',
    amountNum: number,
    fromId: string,
    toId: string
  ) => {
    const { error } = await supabase
      .from('partner_transactions')
      .insert({
        partner_id: targetPartner.id,
        type: txType,
        amount: amountNum,
        balance_before: type === 'deposit' 
          ? (targetPartner.level === 2 
              ? (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0)
              : targetPartner.balance || 0)
          : (targetPartner.level === 2 
              ? (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0)
              : targetPartner.balance || 0),
        balance_after: type === 'deposit'
          ? (targetPartner.level === 2 
              ? (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0) + amountNum
              : (targetPartner.balance || 0) + amountNum)
          : (targetPartner.level === 2 
              ? (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0) - amountNum
              : (targetPartner.balance || 0) - amountNum),
        memo: memo || `${currentUser.nickname}이(가) ${type === 'deposit' ? '입금' : '출금'} 처리`,
        executed_by: currentUser.id,
        status: 'completed'
      });

    if (error) throw error;
  };

  const showWalletSelector = () => {
    if (type === 'deposit') {
      // 입금: 직속 상위가 Lv2이거나, 대상이 Lv2인 경우
      return parentPartner?.level === 2 || targetPartner.level === 2;
    } else {
      // 출금: 실행자(상위)가 Lv2인 경우
      return currentUser.level === 2;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === 'deposit' ? (
              <>
                <DollarSign className="h-5 w-5 text-green-400" />
                <span>하위 파트너 입금</span>
              </>
            ) : (
              <>
                <ArrowDown className="h-5 w-5 text-orange-400" />
                <span>하위 파트너 출금</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {type === 'deposit' 
              ? `${targetPartner.nickname} 파트너에게 입금합니다 (직속 상위: ${parentPartner?.nickname || '-'})`
              : `${targetPartner.nickname} 파트너로부터 출금합니다`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 사용 가능 잔고 표시 */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">
                {type === 'deposit' 
                  ? `직속 상위(${parentPartner?.nickname || '-'}) 잔고`
                  : `대상 파트너(${targetPartner.nickname}) 잔고`
                }
              </span>
              <span className="font-mono text-lg text-green-400">
                ₩{getAvailableBalance().toLocaleString()}
              </span>
            </div>
          </div>

          {/* 지갑 타입 선택 (Lv2 관련 트랜잭션인 경우) */}
          {showWalletSelector() && (
            <div className="space-y-2">
              <Label>지갑 선택</Label>
              <Select value={walletType} onValueChange={(v) => setWalletType(v as 'invest' | 'oroplay')}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invest">Invest 지갑</SelectItem>
                  <SelectItem value="oroplay">OroPlay 지갑</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 금액 입력 */}
          <div className="space-y-2">
            <Label>금액</Label>
            <Input
              type="number"
              placeholder="금액을 입력하세요"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          {/* 메모 */}
          <div className="space-y-2">
            <Label>메모 (선택)</Label>
            <Textarea
              placeholder="메모를 입력하세요"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
              rows={3}
            />
          </div>

          {/* 경고 메시지 */}
          {type === 'deposit' && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-yellow-200">
                입금 시 {parentPartner?.nickname || '직속 상위'} 파트너의 잔고에서 차감됩니다.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="border-slate-600 hover:bg-slate-800"
          >
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className={type === 'deposit' 
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-orange-600 hover:bg-orange-700'
            }
          >
            {loading ? '처리 중...' : (type === 'deposit' ? '입금' : '출금')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
