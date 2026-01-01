import { ArrowRightLeft } from "lucide-react";
import { Button } from "../ui/button";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from "./AdminDialog";

interface CommissionConvertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCommission: {
    settlementId: string;
    type: 'casino_rolling' | 'casino_losing' | 'slot_rolling' | 'slot_losing';
    amount: number;
  } | null;
  onConvert: () => Promise<void>;
  converting: boolean;
}

export function CommissionConvertModal({ 
  open, 
  onOpenChange, 
  selectedCommission, 
  onConvert,
  converting 
}: CommissionConvertModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30">
              <ArrowRightLeft className="h-6 w-6 text-white" />
            </div>
            보유금 전환
          </DialogTitle>
          <DialogDescription className="text-lg pt-4">
            선택한 커미션을 보유금으로 전환하시겠습니까?
          </DialogDescription>
        </DialogHeader>
        {selectedCommission && (
          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-lg p-6 my-4 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-700">
              <span className="text-xl text-slate-300">커미션 타입</span>
              <span className="text-2xl font-semibold text-purple-400">
                {selectedCommission.type === 'casino_rolling' && '🎰 카지노 롤링'}
                {selectedCommission.type === 'casino_losing' && '🎰 카지노 루징'}
                {selectedCommission.type === 'slot_rolling' && '🎲 슬롯 롤링'}
                {selectedCommission.type === 'slot_losing' && '🎲 슬롯 루징'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xl text-slate-300">전환 금액</span>
              <span className="text-3xl font-bold text-emerald-400">
                ₩{selectedCommission.amount.toLocaleString()}
              </span>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-base text-blue-300 flex items-start gap-2">
                <span className="text-lg">ℹ️</span>
                <span>전환된 금액은 보유금으로 즉시 반영되며, 이 작업은 되돌릴 수 없습니다.</span>
              </p>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="bg-slate-700 border-slate-600 hover:bg-slate-600 text-lg h-12 px-6"
          >
            취소
          </Button>
          <Button 
            onClick={onConvert}
            disabled={converting}
            className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-lg h-12 px-6 font-semibold"
          >
            {converting ? '전환 중...' : '전환하기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}