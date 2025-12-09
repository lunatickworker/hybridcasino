import React from "react";
import { Send } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle, AdminDialogFooter as DialogFooter, AdminDialogDescription as DialogDescription } from "../AdminDialog";
import { useLanguage } from "../../../contexts/LanguageContext";
import { toast } from "sonner@2.0.3";
import { Partner, TransferMode } from "./types";
import { transferBalanceToPartner as transferBalanceService } from "./transferService";

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
  onWebSocketUpdate
}: PartnerTransferDialogProps) {
  const { t } = useLanguage();

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
        transferMemo
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
      <DialogContent className="sm:max-w-[500px]">
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
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t.partnerManagement.targetPartner}</Label>
                <div className="mt-1 text-sm">{targetPartner.nickname}</div>
              </div>
              <div>
                <Label>{t.partnerManagement.currentBalance}</Label>
                <div className="mt-1 text-sm">{targetPartner.balance.toLocaleString()}원</div>
              </div>
            </div>

            <div>
              <Label htmlFor="transfer-mode">{t.partnerManagement.transactionType}</Label>
              <Select value={transferMode} onValueChange={(value: TransferMode) => setTransferMode(value)}>
                <SelectTrigger id="transfer-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">{t.partnerManagement.depositLabel}</SelectItem>
                  <SelectItem value="withdrawal">{t.partnerManagement.withdrawalLabel}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="transfer-amount">{t.partnerManagement.amount}</Label>
              <Input
                id="transfer-amount"
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="금액 입력"
              />
            </div>

            <div>
              <Label htmlFor="transfer-memo">{t.partnerManagement.memo}</Label>
              <Input
                id="transfer-memo"
                type="text"
                value={transferMemo}
                onChange={(e) => setTransferMemo(e.target.value)}
                placeholder="메모 입력 (선택사항)"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.partnerManagement.cancel}
          </Button>
          <Button onClick={handleTransfer} disabled={transferLoading}>
            {transferLoading ? t.partnerManagement.processing : t.partnerManagement.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}