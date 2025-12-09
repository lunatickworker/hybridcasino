import React, { useState, useEffect } from "react";
import { Send, Trash2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle, AdminDialogFooter as DialogFooter, AdminDialogDescription as DialogDescription } from "../AdminDialog";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useBalance } from "../../../contexts/BalanceContext"; // ✅ API 활성화 상태 확인
import { toast } from "sonner@2.0.3";
import { Partner, TransferMode } from "./types";
import { transferBalanceToPartner as transferBalanceService } from "./transferService";
import { supabase } from "../../../lib/supabase"; // ✅ 현재 사용자 레벨 조회

interface PartnerTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPartner: Partner | null;
  transferMode: TransferMode;
  setTransferMode: (mode: TransferMode) => void;
  transferAmount: string;
  setTransferAmount: (amount: string) => void;
  transferMemo: string;
  setTransferMemo: (memo: string) => void;
  transferLoading: boolean;
  currentUserId: string;
  onSuccess: () => void;
  onWebSocketUpdate?: (data: any) => void;
  currentUserBalance?: number; // ✅ 현재 사용자 보유금
  currentUserInvestBalance?: number; // ✅ Lv2 Invest balance
  currentUserOroplayBalance?: number; // ✅ Lv2 OroPlay balance
}

export function PartnerTransferDialog({
  open,
  onOpenChange,
  targetPartner,
  transferMode,
  setTransferMode,
  transferAmount,
  setTransferAmount,
  transferMemo,
  setTransferMemo,
  transferLoading,
  currentUserId,
  onSuccess,
  onWebSocketUpdate,
  currentUserBalance = 0,
  currentUserInvestBalance = 0,
  currentUserOroplayBalance = 0
}: PartnerTransferDialogProps) {
  const { t } = useLanguage();
  const { useInvestApi, useOroplayApi } = useBalance(); // ✅ API 활성화 상태
  const [currentUserLevel, setCurrentUserLevel] = useState<number | null>(null);
  const [apiType, setApiType] = useState<'invest' | 'oroplay'>('oroplay'); // ✅ Lv2용 API 선택 (기본값: oroplay)

  // 금액 단축 버튼
  const amountShortcuts = [
    1000, 3000, 5000, 10000,
    30000, 50000, 100000, 300000,
    500000, 1000000
  ];

  // ✅ 현재 사용자 레벨 조회
  useEffect(() => {
    if (!currentUserId) return;

    const fetchUserLevel = async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('level')
        .eq('id', currentUserId)
        .single();

      if (!error && data) {
        setCurrentUserLevel(data.level);
        
        // ✅ Lv2가 아니면 API 선택 불필요
        if (data.level !== 2) {
          setApiType('oroplay'); // 기본값 유지
        }
      }
    };

    fetchUserLevel();
  }, [currentUserId]);

  // ✅ API 선택 표시 조건 (Lv2만)
  const showApiSelector = currentUserLevel === 2;

  // 금액 단축 버튼 클릭 (누적 더하기)
  const handleAmountShortcut = (value: number) => {
    const currentAmount = parseFloat(transferAmount || '0');
    const newAmount = currentAmount + value;
    setTransferAmount(newAmount.toString());
  };

  // 전액삭제
  const handleClearAmount = () => {
    setTransferAmount('0');
  };

  // 전액출금
  const handleFullWithdrawal = () => {
    if (targetPartner && transferMode === 'withdrawal') {
      setTransferAmount(targetPartner.balance.toString());
    }
  };

  const handleTransfer = async () => {
    if (!targetPartner || !currentUserId) return;

    const amount = parseFloat(transferAmount);

    // 입력 검증
    if (!amount || amount <= 0) {
      const typeText = transferMode === 'deposit' ? t.partnerManagement.depositLabel : t.partnerManagement.withdrawalLabel;
      toast.error(t.partnerManagement.depositOrWithdrawalAmountInvalid.replace('{{type}}', typeText));
      return;
    }

    try {
      // 서비스 호출
      await transferBalanceService({
        transferTargetPartner: targetPartner,
        currentUserId,
        amount,
        transferMode,
        transferMemo,
        apiType: currentUserLevel === 2 ? apiType : undefined // ✅ Lv2만 API 선택
      });

      // 성공 메시지
      const typeText = transferMode === 'deposit' ? '지급' : '회수';
      toast.success(`${targetPartner.nickname}에게 ${amount.toLocaleString()}원 ${typeText} 완료`, {
        duration: 3000,
        icon: '💰'
      });

      // 실시간 업데이트
      if (onWebSocketUpdate) {
        onWebSocketUpdate({
          type: 'partner_balance_transfer',
          data: { 
            from: currentUserId,
            to: targetPartner.id,
            amount,
            mode: transferMode
          }
        });
      }

      // 성공 콜백
      onSuccess();
      onOpenChange(false);

    } catch (error: any) {
      console.error('[Partner Balance Transfer Error]:', error);
      
      // 오류 메시지 파싱
      if (error.message?.includes('TARGET_BALANCE_INSUFFICIENT')) {
        const balance = error.message.split(':')[1];
        toast.error(t.partnerManagement.targetBalanceInsufficientError.replace('{{balance}}', parseInt(balance).toLocaleString()));
      } else if (error.message?.includes('SENDER_BALANCE_INSUFFICIENT')) {
        // 송신자 보유금 부족
        const message = error.message.split(':')[1];
        
        // Lv2 보유금 부족 (OroPlay만 표시)
        if (message?.includes('oroplay=')) {
          const oroplayMatch = message.match(/oroplay=(\d+)/);
          const requiredMatch = message.match(/required=(\d+)/);
          
          const oroplayBalance = oroplayMatch ? parseInt(oroplayMatch[1]) : 0;
          const required = requiredMatch ? parseInt(requiredMatch[1]) : 0;
          
          toast.error(
            `OroPlay API 보유금이 부족합니다.\n` +
            `현재 보유금: ${oroplayBalance.toLocaleString()}원\n` +
            `필요 금액: ${required.toLocaleString()}원`,
            { duration: 5000 }
          );
        } else {
          // Lv3~7 보유금 부족
          const balance = parseInt(message);
          toast.error(t.partnerManagement.balanceLowError.replace('{{balance}}', balance.toLocaleString()));
        }
      } else if (error.message?.includes('BALANCE_LOW_LV2')) {
        // Lv2 보유금 부족 (invest_balance, oroplay_balance 중 최소값)
        const parts = error.message.split(':');
        const minBalance = parts[1];
        const insufficientApi = parts[2];
        toast.error(
          `${insufficientApi} API 보유금이 부족합니다.\n` +
          `입금 가능 금액: ${parseInt(minBalance).toLocaleString()}원`,
          { duration: 5000 }
        );
      } else if (error.message?.includes('BALANCE_LOW')) {
        const balance = error.message.split(':')[1];
        toast.error(t.partnerManagement.balanceLowError.replace('{{balance}}', parseInt(balance).toLocaleString()));
      } else if (error.message?.includes('CHILD_BALANCE_EXCEEDS')) {
        const parts = error.message.split(':');
        const currentSum = parts[1];
        const afterSum = parts[2];
        const parentBalance = parts[3];
        toast.error(
          `하위 본사들의 보유금 합계가 대본사 보유금을 초과할 수 없습니다.\n` +
          `현재 하위 본사 보유금 합계: ${parseInt(currentSum).toLocaleString()}원\n` +
          `지급 후 합계: ${parseInt(afterSum).toLocaleString()}원\n` +
          `대본사 보유금: ${parseInt(parentBalance).toLocaleString()}원`,
          { duration: 5000 }
        );
      } else {
        const actionText = transferMode === 'deposit' ? t.partnerManagement.depositLabel : t.partnerManagement.withdrawalLabel;
        toast.error(`${actionText} failed`);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              {t.partnerManagement.partnerBalanceTransfer}
            </div>
          </DialogTitle>
          <DialogDescription>
            하위 파트너에게 GMS 머니를 지급하거나 회수합니다.
          </DialogDescription>
        </DialogHeader>

        {targetPartner && (
          <div className="grid gap-5 py-4">
            {/* 거래 유형 */}
            <div className="grid gap-2">
              <Label htmlFor="transfer-mode">거래 유형</Label>
              <Select value={transferMode} onValueChange={(value: TransferMode) => setTransferMode(value)}>
                <SelectTrigger id="transfer-mode" className="input-premium h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="deposit">{t.partnerManagement.depositLabel}</SelectItem>
                  <SelectItem value="withdrawal">{t.partnerManagement.withdrawalLabel}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 선택된 파트너 정보 */}
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">선택된 파트너</span>
                <span className="text-cyan-400 font-medium">{targetPartner.nickname}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">파트너 잔고</span>
                <span className="font-mono text-cyan-400">
                  {targetPartner.balance.toLocaleString()}원
                </span>
              </div>
              {/* ✅ Lv3~Lv6 파트너: 전체 지갑(balance) 표시 */}
              {targetPartner.level && targetPartner.level >= 3 && targetPartner.level <= 6 && (
                <div className="mt-2 pt-2 border-t border-slate-700">
                  <p className="text-[10px] text-slate-500">
                    ※ Lv{targetPartner.level}은 전체 지갑(balance)을 사용합니다.
                  </p>
                </div>
              )}
            </div>

            {/* 관리자 보유금 (입금 시에만 표시) */}
            {transferMode === 'deposit' && (
              <div className="p-3 bg-emerald-900/20 rounded-lg border border-emerald-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-emerald-400">💰 관리자 보유금 (입금 가능 금액)</span>
                </div>
                {currentUserLevel === 2 ? (
                  <div className="space-y-1.5">
                    {/* ✅ Lv2: 노출된 게임사의 보유금 표시 */}
                    {useInvestApi && currentUserInvestBalance > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Invest API:</span>
                        <span className="font-mono text-sm text-emerald-400">
                          {currentUserInvestBalance.toLocaleString()}원
                        </span>
                      </div>
                    )}
                    {useOroplayApi && currentUserOroplayBalance > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">OroPlay API:</span>
                        <span className="font-mono text-sm text-emerald-400">
                          {currentUserOroplayBalance.toLocaleString()}원
                        </span>
                      </div>
                    )}
                    <div className="pt-1.5 mt-1.5 border-t border-emerald-700/30 flex items-center justify-between">
                      <span className="text-sm text-emerald-400">입금 가능:</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {(() => {
                          const balances = [];
                          if (useInvestApi && currentUserInvestBalance > 0) balances.push(currentUserInvestBalance);
                          if (useOroplayApi && currentUserOroplayBalance > 0) balances.push(currentUserOroplayBalance);
                          return balances.length > 0 ? Math.min(...balances).toLocaleString() : '계산 없음';
                        })()}원
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      ※ Lv2 입금 시 Lv2 불용금을 활용합니다.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">사용 가능:</span>
                    <span className="font-mono text-emerald-400">
                      {currentUserBalance.toLocaleString()}원
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ✅ API 선택 (Lv2만) */}
            {showApiSelector && (
              <div className="grid gap-2">
                <Label htmlFor="api-type">자금</Label>
                <Select 
                  value={apiType} 
                  onValueChange={(value: 'invest' | 'oroplay') => setApiType(value)}
                >
                  <SelectTrigger id="api-type" className="input-premium h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {useInvestApi && <SelectItem value="invest">Invest API</SelectItem>}
                    {useOroplayApi && <SelectItem value="oroplay">OroPlay API</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 금액 */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="transfer-amount">금액</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAmount}
                  className={`h-7 px-2 text-xs text-slate-400 ${
                    transferMode === 'deposit' 
                      ? 'hover:text-orange-400 hover:bg-orange-500/10' 
                      : 'hover:text-red-400 hover:bg-red-500/10'
                  }`}
                >
                  전액삭제
                </Button>
              </div>
              <Input
                id="transfer-amount"
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="input-premium"
                placeholder="금액을 입력하세요"
              />
            </div>

            {/* 금액 단축 버튼 */}
            <div className="grid gap-2">
              <Label className="text-slate-400 text-sm">단축 입력 (누적 더하기)</Label>
              <div className="grid grid-cols-4 gap-2">
                {amountShortcuts.map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant="outline"
                    onClick={() => handleAmountShortcut(amt)}
                    className={`h-9 transition-all bg-slate-800/50 border-slate-700 text-slate-300 ${
                      transferMode === 'deposit'
                        ? 'hover:bg-orange-500/20 hover:border-orange-500/60 hover:text-orange-400 hover:shadow-[0_0_15px_rgba(251,146,60,0.3)]'
                        : 'hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                    }`}
                  >
                    +{amt >= 10000 ? `${amt / 10000}만` : `${amt / 1000}천`}
                  </Button>
                ))}
              </div>
            </div>

            {/* 전액출금 버튼 (출금 시에만) */}
            {transferMode === 'withdrawal' && (
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleFullWithdrawal}
                  className="w-full h-9 bg-red-900/20 border-red-500/50 text-red-400 hover:bg-red-900/40 hover:border-red-500"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  전액출금
                </Button>
              </div>
            )}

            {/* 메모 */}
            <div className="grid gap-2">
              <Label htmlFor="transfer-memo">메모</Label>
              <Textarea
                id="transfer-memo"
                value={transferMemo}
                onChange={(e) => setTransferMemo(e.target.value)}
                placeholder="메모를 입력하세요 (선택사항)"
                className="input-premium min-h-[80px]"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={handleTransfer}
            disabled={transferLoading || !transferAmount || parseFloat(transferAmount) <= 0}
            className={`w-full ${transferMode === 'deposit' ? 'btn-premium-warning' : 'btn-premium-danger'}`}
          >
            {transferLoading ? t.partnerManagement.processing : t.partnerManagement.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
