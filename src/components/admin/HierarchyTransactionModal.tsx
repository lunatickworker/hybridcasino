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
import { depositPartnerToChild, withdrawPartnerToChild } from '../../lib/operatorManualTransferUsage';

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
  const [walletType, setWalletType] = useState<'invest' | 'oroplay' | 'familyapi'>('invest');

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
        // Lv2: invest_balance, oroplay_balance, familyapi_balance
        if (walletType === 'invest') return parentPartner.invest_balance || 0;
        if (walletType === 'oroplay') return parentPartner.oroplay_balance || 0;
        if (walletType === 'familyapi') return parentPartner.familyapi_balance || 0;
        return 0;
      } else {
        // Lv3~7: balance
        return parentPartner.balance || 0;
      }
    } else {
      // 출금: 대상 파트너의 잔고 확인
      if (targetPartner.level === 2) {
        // Lv2: invest_balance + oroplay_balance + familyapi_balance
        return (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0) + (targetPartner.familyapi_balance || 0);
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
    // 통합 로직 사용
    const result = await depositPartnerToChild(
      currentUser.id,
      currentUser.level,
      targetPartner.id,
      amountNum,
      memo
    );

    if (!result.success) {
      throw new Error(result.message);
    }

    console.log('✅ 파트너 입금 처리 완료:', { transactionId: result.transactionId, amount: amountNum });
  };

  const handleWithdrawal = async (amountNum: number) => {
    // 통합 로직 사용
    const result = await withdrawPartnerToChild(
      currentUser.id,
      currentUser.level,
      targetPartner.id,
      amountNum,
      memo
    );

    if (!result.success) {
      throw new Error(result.message);
    }

    console.log('✅ 파트너 출금 처리 완료:', { transactionId: result.transactionId, amount: amountNum });
  };

  const createTransactionRecord = async (
    txType: 'deposit' | 'withdrawal',
    amountNum: number,
    fromId: string,
    toId: string
  ) => {
    // ✅ partner_transactions 기록 (기존)
    const { error: txError } = await supabase
      .from('partner_transactions')
      .insert({
        partner_id: targetPartner.id,
        type: txType,
        amount: amountNum,
        balance_before: type === 'deposit' 
          ? (targetPartner.level === 2 
              ? (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0) + (targetPartner.familyapi_balance || 0)
              : targetPartner.balance || 0)
          : (targetPartner.level === 2 
              ? (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0) + (targetPartner.familyapi_balance || 0)
              : targetPartner.balance || 0),
        balance_after: type === 'deposit'
          ? (targetPartner.level === 2 
              ? (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0) + (targetPartner.familyapi_balance || 0) + amountNum
              : (targetPartner.balance || 0) + amountNum)
          : (targetPartner.level === 2 
              ? (targetPartner.invest_balance || 0) + (targetPartner.oroplay_balance || 0) + (targetPartner.familyapi_balance || 0) - amountNum
              : (targetPartner.balance || 0) - amountNum),
        memo: memo || `${currentUser.nickname}이(가) ${type === 'deposit' ? '입금' : '출금'} 처리`,
        executed_by: currentUser.id,
        status: 'completed'
      });

    if (txError) throw txError;

    // ✅ partner_balance_logs 기록 (액션을 한 쪽만 1건 기록)
    const getBalanceBefore = (partner: Partner) => {
      if (partner.level === 2) {
        return (partner.invest_balance || 0) + (partner.oroplay_balance || 0) + (partner.familyapi_balance || 0);
      }
      return partner.balance || 0;
    };

    const balanceBefore = getBalanceBefore(currentUser);
    const balanceAfter = type === 'deposit' 
      ? balanceBefore - amountNum 
      : balanceBefore + amountNum;

    const transactionType = type === 'deposit' ? 'admin_withdrawal_send' : 'admin_deposit_send';

    const { error: logError } = await supabase
      .from('partner_balance_logs')
      .insert({
        partner_id: currentUser.id,  // ✅ 액션을 한 쪽의 ID
        transaction_type: transactionType,
        amount: type === 'deposit' ? -amountNum : amountNum,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        from_partner_id: type === 'deposit' ? currentUser.id : targetPartner.id,
        to_partner_id: type === 'deposit' ? targetPartner.id : currentUser.id,
        processed_by: currentUser.id,
        memo: memo || `${targetPartner.nickname}에게 ${type === 'deposit' ? '입금' : '출금'} - ${amountNum.toLocaleString()}원`,
        sync_source: null  // ✅ 수동 입력이므로 NULL (auto-trigger 아님)
      });

    if (logError) throw logError;
  };

  const showWalletSelector = () => {
    if (type === 'deposit') {
      // 입금: 직속 상위가 Lv2이거나, 대상이 Lv2인 경우
      return parentPartner?.level === 2 || targetPartner.level === 2;
    } else {
      // 출금: 실행자(상위)가 Lv2이고, 대상도 Lv2인 경우만 표시
      // Lv3~Lv7은 단일 지갑만 사용하므로 지갑 선택 불필요
      return currentUser.level === 2 && targetPartner.level === 2;
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
              <Select value={walletType} onValueChange={(v) => setWalletType(v as 'invest' | 'oroplay' | 'familyapi')}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invest">Invest 지갑</SelectItem>
                  <SelectItem value="oroplay">OroPlay 지갑</SelectItem>
                  <SelectItem value="familyapi">FamilyAPI 지갑</SelectItem>
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