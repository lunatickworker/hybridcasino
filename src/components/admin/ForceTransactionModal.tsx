import { useState } from "react";
import { Search, Trash2, TrendingUp, TrendingDown, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from "./AdminDialog";
import { toast } from "sonner@2.0.3";
import { useBalance } from "../../contexts/BalanceContext"; // ✅ API 설정 조회
import { useLanguage } from "../../contexts/LanguageContext";

interface ForceTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'deposit' | 'withdrawal';
  targetType: 'user' | 'partner';
  selectedTarget?: {
    id: string;
    username: string;
    nickname: string;
    balance: number | string;
    level?: number;
  } | null;
  targets?: Array<{
    id: string;
    username: string;
    nickname: string;
    balance: number | string;
    level?: number;
  }>;
  onSubmit: (data: {
    targetId: string;
    type: 'deposit' | 'withdrawal';
    amount: number;
    memo: string;
    apiType?: 'invest' | 'oroplay';
  }) => Promise<void>;
  onTypeChange: (type: 'deposit' | 'withdrawal') => void;
  currentUserLevel?: number; // Lv1인지 확인용
  currentUserBalance?: number; // 현재 관리자의 보유금 (입금 시 검증용) - Lv3~7용
  currentUserInvestBalance?: number; // Lv1/Lv2의 invest API balance
  currentUserOroplayBalance?: number; // Lv1/Lv2의 oroplay API balance
  currentUserFamilyapiBalance?: number; // Lv1/Lv2의 familyapi API balance
  useGmsMoney?: boolean; // ✅ GMS 머니 모드 (API 선택 없이 GMS로만 처리)
}

export function ForceTransactionModal({
  open,
  onOpenChange,
  type,
  targetType,
  selectedTarget: propSelectedTarget,
  targets = [],
  onSubmit,
  onTypeChange,
  currentUserLevel,
  currentUserBalance = 0,
  currentUserInvestBalance = 0,
  currentUserOroplayBalance = 0,
  currentUserFamilyapiBalance = 0,
  useGmsMoney = false
}: ForceTransactionModalProps) {
  const { t } = useLanguage();
  const { useInvestApi, useOroplayApi } = useBalance(); // ✅ API 활성화 상태
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // ✅ 기본 API 선택: oroplay (UserManagement와 동일)
  const defaultApiType = 'oroplay';
  const [apiType, setApiType] = useState<'invest' | 'oroplay'>(defaultApiType);

  // 금액 단축 버튼 (포인트 모달과 동일하게 4개씩)
  const amountShortcuts = [
    1000,
    3000, 
    5000,
    10000,
    30000,
    50000,
    100000,
    300000,
    500000,
    1000000
  ];

  // 선택된 대상: prop으로 받은 것 우선, 없으면 내부 state 사용
  const selectedTarget = propSelectedTarget || targets.find(t => t.id === selectedTargetId);
  const currentBalance = selectedTarget ? parseFloat(selectedTarget.balance?.toString() || '0') : 0;
  const isTargetFixed = !!propSelectedTarget;
  
  // ✅ Lv1 → Lv2 입출금 시에만 API 선택 표시
  // Lv2 → Lv3+는 무조건 oroplay_balance 사용 (UserManagement와 동일)
  // useGmsMoney가 true면 API 선택 숨김
  const showApiSelector = !useGmsMoney && targetType === 'partner' && 
                          (
                            // Lv1 → Lv2: 입금/출금 모두 API 선택
                            (currentUserLevel === 1 && selectedTarget?.level === 2)
                          );

  // 금액 단축 버튼 클릭 (누적 더하기)
  const handleAmountShortcut = (value: number) => {
    const currentAmount = parseFloat(amount || '0');
    const newAmount = currentAmount + value;
    setAmount(newAmount.toString());
  };

  // 금액 입력 처리 (자유롭게 입력 허용)
  const handleAmountChange = (value: string) => {
    setAmount(value);
  };

  // 검증 로직
  const amountNum = parseFloat(amount || '0');
  const isLv1ToLv2 = currentUserLevel === 1 && selectedTarget?.level === 2;
  const isLv1ToLv3 = currentUserLevel === 1 && selectedTarget?.level === 3;
  const isLv2ToLv3 = currentUserLevel === 2 && selectedTarget?.level === 3;
  
  let errorMessage = '';
  if (selectedTarget && amountNum > 0) {
    // 출금 시: 대상의 전체 balance만 체크
    if (type === 'withdrawal') {
      // ✅ Lv1 → Lv2 출금: Lv2의 GMS 머니(balance)만 체크
      // (API별로 나눠진 건 Lv1의 api_configs만 해당)
      if (amountNum > currentBalance) {
        errorMessage = `출금 가능 금액을 초과했습니다. (최대: ${currentBalance.toLocaleString()}원)`;
      }
    }
    
    // 입금 시: 관리자의 보유금 검증 (✅ API 활성화 상태 반영)
    if (type === 'deposit') {
      // Lv1 → Lv2 입금: 선택한 API 보유금 기준
      if (currentUserLevel === 1 && selectedTarget?.level === 2) {
        const selectedBalance = apiType === 'invest' ? currentUserInvestBalance : currentUserOroplayBalance;
        if (amountNum > selectedBalance) {
          const apiName = apiType === 'invest' ? 'Invest' : 'OroPlay';
          errorMessage = `${apiName} API 보유금이 부족합니다. (입금 가능: ${selectedBalance.toLocaleString()}원)`;
        }
      }
      // Lv1 → Lv3~7 입금: 활성화된 API 중 가장 작은 금액 기준
      else if (currentUserLevel === 1) {
        const balances = [];
        if (useInvestApi) balances.push(currentUserInvestBalance);
        if (useOroplayApi) balances.push(currentUserOroplayBalance);
        const minBalance = balances.length > 0 ? Math.min(...balances) : 0;
        
        if (amountNum > minBalance) {
          let insufficientApi = '';
          if (useInvestApi && useOroplayApi) {
            insufficientApi = currentUserInvestBalance < currentUserOroplayBalance ? 'Invest' : 'OroPlay';
          } else if (useInvestApi) {
            insufficientApi = 'Invest';
          } else {
            insufficientApi = 'OroPlay';
          }
          errorMessage = `${insufficientApi} API 보유금이 부족합니다. (입금 가능: ${minBalance.toLocaleString()}원)`;
        }
      }
      // Lv2 → Lv3~7 입금: 노출된 게임사의 최소 보유금 기준
      else if (currentUserLevel === 2) {
        const balances = [];
        if (useInvestApi && currentUserInvestBalance > 0) balances.push(currentUserInvestBalance);
        if (useOroplayApi && currentUserOroplayBalance > 0) balances.push(currentUserOroplayBalance);
        const minBalance = balances.length > 0 ? Math.min(...balances) : 0;
        
        if (amountNum > minBalance) {
          let insufficientApi = '';
          if (useInvestApi && useOroplayApi) {
            if (currentUserInvestBalance > 0 && currentUserOroplayBalance > 0) {
              insufficientApi = currentUserInvestBalance < currentUserOroplayBalance ? 'Invest' : 'OroPlay';
            } else if (currentUserInvestBalance > 0) {
              insufficientApi = 'Invest';
            } else {
              insufficientApi = 'OroPlay';
            }
          } else if (useInvestApi && currentUserInvestBalance > 0) {
            insufficientApi = 'Invest';
          } else if (useOroplayApi && currentUserOroplayBalance > 0) {
            insufficientApi = 'OroPlay';
          }
          errorMessage = insufficientApi 
            ? `${insufficientApi} API 보유금이 부족합니다. (입금 가능: ${minBalance.toLocaleString()}원)`
            : `노출된 게임사의 보유금이 없습니다.`;
        }
      }
      // Lv3~7 입금: 단일 balance 체크
      else if (amountNum > currentUserBalance) {
        errorMessage = `보유금이 부족합니다. (현재: ${currentUserBalance.toLocaleString()}원)`;
      }
    }
  }

  // 전액삭제
  const handleClearAmount = () => {
    setAmount('0');
  };

  // 전액출금
  const handleFullWithdrawal = () => {
    if (selectedTarget && type === 'withdrawal') {
      // ✅ Lv2는 GMS 머니(balance)만 사용하므로 단일 balance 전액 출금
      setAmount(currentBalance.toString());
    }
  };

  // 실행
  const handleSubmit = async () => {
    const targetId = propSelectedTarget?.id || selectedTargetId;
    
    if (!targetId || errorMessage) {
      return;
    }

    const submitAmount = parseFloat(amount || '0');
    if (submitAmount <= 0) {
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit({
        targetId,
        type,
        amount: submitAmount,
        memo,
        apiType: showApiSelector ? apiType : undefined
      });

      // 초기화
      if (!isTargetFixed) {
        setSelectedTargetId('');
      }
      setAmount('');
      setMemo('');
      setApiType('invest');
      onOpenChange(false);
    } catch (error) {
      console.error('강제 입출금 실행 오류:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        if (!isTargetFixed) {
          setSelectedTargetId('');
        }
        setAmount('');
        setMemo('');
        setApiType('invest');
      }
      onOpenChange(o);
    }}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-3xl">
            {type === 'deposit' ? (
              <>
                <TrendingUp className="h-7 w-7 text-emerald-500" />
                강제 입금
              </>
            ) : (
              <>
                <TrendingDown className="h-7 w-7 text-rose-500" />
                강제 출금
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-lg">
            {targetType === 'user' ? '회원' : '파트너'}의 잔액을 직접 조정합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* 거래 유형 */}
          <div className="grid gap-3">
            <Label htmlFor="force-transaction-type" className="text-lg">거래 유형</Label>
            <Select value={type} onValueChange={(v: 'deposit' | 'withdrawal') => onTypeChange(v)}>
              <SelectTrigger id="force-transaction-type" className="input-premium h-12 text-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="deposit" className="text-lg py-3">입금</SelectItem>
                <SelectItem value="withdrawal" className="text-lg py-3">출금</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 회원 선택 - 고정된 대상이 없을 때만 표시 */}
          {!isTargetFixed && (
            <div className="grid gap-3">
              <Label htmlFor="force-transaction-target-search" className="text-lg">{targetType === 'user' ? '회원' : '파트너'} 선택</Label>
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="force-transaction-target-search"
                    variant="outline"
                    role="combobox"
                    aria-expanded={searchOpen}
                    className="justify-between input-premium h-12 text-lg"
                  >
                    {selectedTargetId
                      ? `${selectedTarget?.username} (${selectedTarget?.nickname}) - ${currentBalance.toLocaleString()}원`
                      : `아이디, 닉네임으로 검색`}
                    <ChevronsUpDown className="ml-2 h-6 w-6 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[600px] p-0 bg-slate-800 border-slate-700">
                  <Command className="bg-slate-800">
                    <CommandInput 
                      placeholder={`아이디, 닉네임으로 검색...`}
                      className="h-12 text-lg text-slate-100 placeholder:text-slate-500"
                    />
                    <CommandList>
                      <CommandEmpty className="text-slate-400 py-6 text-center text-lg">
                        {targetType === 'user' ? '회원' : '파트너'}을 찾을 수 없습니다.
                      </CommandEmpty>
                      <CommandGroup className="max-h-64 overflow-auto">
                        {targets.map(t => (
                          <CommandItem
                            key={t.id}
                            value={`${t.username} ${t.nickname}`}
                            onSelect={() => {
                              setSelectedTargetId(t.id);
                              setSearchOpen(false);
                            }}
                            className="flex items-center justify-between cursor-pointer hover:bg-slate-700/50 text-slate-300 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <Check
                                className={`mr-2 h-6 w-6 ${
                                  selectedTargetId === t.id ? `opacity-100 ${type === 'deposit' ? 'text-emerald-500' : 'text-rose-500'}` : "opacity-0"
                                }`}
                              />
                              <div>
                                <div className="font-medium text-slate-100 text-lg">{t.username}</div>
                                <div className="text-base text-slate-400">{t.nickname}</div>
                              </div>
                            </div>
                            <div className="text-lg">
                              <span className="text-cyan-400 font-mono">{parseFloat(t.balance?.toString() || '0').toLocaleString()}원</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* 선택된 회원 정보 */}
          {selectedTarget && (
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg text-slate-400">선택된 {targetType === 'user' ? '회원' : '파트너'}</span>
                <span className="text-cyan-400 font-medium text-xl">{selectedTarget.nickname}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg text-slate-400">{targetType === 'user' ? '회원' : '파트너'} 잔고</span>
                <span className="font-mono text-cyan-400 text-xl">
                  {currentBalance.toLocaleString()}원
                </span>
              </div>
            </div>
          )}

          {/* 관리자 보유금 (입금 시에만 표시) */}
          {type === 'deposit' && (
            <div className="p-4 bg-emerald-900/20 rounded-lg border border-emerald-700/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg text-emerald-400">💰 관리자 보유금 (입금 가능 금액)</span>
              </div>
              {/* Lv1: API별 보유금 표시 (✅ 비활성화된 API 숨김) */}
              {currentUserLevel === 1 ? (
                <div className="space-y-2">
                  {useInvestApi && (
                    <div className="flex items-center justify-between">
                      <span className="text-base text-slate-400">Invest API:</span>
                      <span className={`font-mono text-lg ${
                        isLv1ToLv2 && apiType === 'invest' ? 'text-emerald-400 font-bold' : 'text-emerald-400/60'
                      }`}>
                        {currentUserInvestBalance.toLocaleString()}원
                      </span>
                    </div>
                  )}
                  {useOroplayApi && (
                    <div className="flex items-center justify-between">
                      <span className="text-base text-slate-400">OroPlay API:</span>
                      <span className={`font-mono text-lg ${
                        isLv1ToLv2 && apiType === 'oroplay' ? 'text-emerald-400 font-bold' : 'text-emerald-400/60'
                      }`}>
                        {currentUserOroplayBalance.toLocaleString()}원
                      </span>
                    </div>
                  )}
                  {isLv1ToLv2 ? (
                    <div className="pt-2 mt-2 border-t border-emerald-700/30 flex items-center justify-between">
                      <span className="text-lg text-emerald-400">입금 가능 (선택한 API):</span>
                      <span className="font-mono text-emerald-400 font-bold text-lg">
                        {(apiType === 'invest' ? currentUserInvestBalance : currentUserOroplayBalance).toLocaleString()}원
                      </span>
                    </div>
                  ) : (
                    <div className="pt-2 mt-2 border-t border-emerald-700/30 flex items-center justify-between">
                      <span className="text-lg text-emerald-400">입금 가능 (최소값):</span>
                      <span className="font-mono text-emerald-400 font-bold text-lg">
                        {(() => {
                          const balances = [];
                          if (useInvestApi) balances.push(currentUserInvestBalance);
                          if (useOroplayApi) balances.push(currentUserOroplayBalance);
                          return balances.length > 0 ? Math.min(...balances).toLocaleString() : '0';
                        })()}원
                      </span>
                    </div>
                  )}
                  <p className="text-base text-slate-500 mt-2">
                    {isLv1ToLv2 
                      ? `※ 선택한 API 보유금에서만 입금됩니다.`
                      : useInvestApi && useOroplayApi
                        ? `※ 두 API 중 가장 작은 보유금을 기준으로 입금 제한됩니다.`
                        : `※ 활성화된 API 보유금을 기준으로 입금 제한됩니다.`}
                  </p>
                </div>
              ) : currentUserLevel === 2 ? (
                <div className="space-y-2">
                  {/* ✅ Lv2: 총 보유금만 표시 */}
                  <div className="flex items-center justify-between">
                    <span className="text-lg text-emerald-400">총 보유금:</span>
                    <span className="font-mono text-emerald-400 font-bold text-lg">
                      {(currentUserInvestBalance + currentUserOroplayBalance + currentUserFamilyapiBalance).toLocaleString()}원
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-lg text-slate-400">사용 가능:</span>
                  <span className="font-mono text-emerald-400 text-lg">
                    {currentUserBalance.toLocaleString()}원
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ✅ API 선택 (Lv1 → Lv2 입출금만) - 비활성화된 API 숨김 */}
          {showApiSelector && (
            <div className="grid gap-3">
              <Label htmlFor="api-type-select" className="text-lg">
                {type === 'deposit' ? '입금할' : '회수할'} API 선택
              </Label>
              <Select value={apiType} onValueChange={(v: 'invest' | 'oroplay') => setApiType(v)}>
                <SelectTrigger id="api-type-select" className="input-premium h-12 text-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {useInvestApi && <SelectItem value="invest" className="text-lg py-3">Invest API</SelectItem>}
                  {useOroplayApi && <SelectItem value="oroplay" className="text-lg py-3">OroPlay API</SelectItem>}
                </SelectContent>
              </Select>
              <p className="text-base text-slate-500">
                {type === 'deposit' 
                  ? `선택한 API로만 입금됩니다.` 
                  : `선택한 API의 보유금에서만 출금됩니다.`}
              </p>
            </div>
          )}

          {/* 금액 */}
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="force-transaction-amount" className="text-lg">금액</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAmount}
                className={`h-9 px-3 text-base text-slate-400 ${
                  type === 'deposit' 
                    ? 'hover:text-orange-400 hover:bg-orange-500/10' 
                    : 'hover:text-red-400 hover:bg-red-500/10'
                }`}
              >
                전체삭제
              </Button>
            </div>
            <Input
              id="force-transaction-amount"
              name="amount"
              type="number"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className="input-premium h-12 text-lg"
              placeholder="금액을 입력하세요"
            />
          </div>

          {/* 금액 단축 버튼 */}
          <div className="grid gap-3">
            <Label className="text-slate-400 text-lg">단축 입력 (누적 더하기)</Label>
            <div className="grid grid-cols-4 gap-2">
              {amountShortcuts.map((amt) => (
                <Button
                  key={amt}
                  type="button"
                  variant="outline"
                  onClick={() => handleAmountShortcut(amt)}
                  className={`h-12 text-lg transition-all bg-slate-800/50 border-slate-700 text-slate-300 ${
                    type === 'deposit'
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
          {type === 'withdrawal' && selectedTarget && (
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleFullWithdrawal}
                className="w-full h-12 text-lg bg-red-900/20 border-red-500/50 text-red-400 hover:bg-red-900/40 hover:border-red-500"
              >
                <Trash2 className="h-6 w-6 mr-2" />
                전액출금
              </Button>
            </div>
          )}

          {/* 에러 메시지 */}
          {errorMessage && (
            <div className="p-4 bg-rose-900/20 border border-rose-500/50 rounded-lg">
              <p className="text-lg text-rose-400">{errorMessage}</p>
            </div>
          )}

          {/* 메모 */}
          <div className="grid gap-3">
            <Label htmlFor="force-transaction-memo" className="text-lg">메모</Label>
            <Textarea
              id="force-transaction-memo"
              name="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모를 입력하세요 (선택사항)"
              className="input-premium min-h-[120px] text-lg"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (!propSelectedTarget?.id && !selectedTargetId) || !amount || parseFloat(amount) <= 0 || !!errorMessage}
            className={`w-full h-12 text-lg ${type === 'deposit' ? 'btn-premium-warning' : 'btn-premium-danger'}`}
          >
            {submitting ? '처리 중...' : type === 'deposit' ? '강제 입금' : '강제 출금'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}