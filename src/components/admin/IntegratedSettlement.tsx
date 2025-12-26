import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, Calendar as CalendarIcon, Info, ArrowDownCircle, ArrowUpCircle, FileCheck, Wallet, CreditCard, TrendingUpDown } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { MetricCard } from "./MetricCard";
import { calculateIntegratedSettlement, calculatePartnerPayments, SettlementSummary, PartnerPaymentDetail, getDescendantUserIds, getWithdrawalAmount } from "../../lib/settlementCalculator";
import { getBettingStatsByGameType } from "../../lib/settlementCalculatorV2";
import { executeIntegratedSettlement } from "../../lib/settlementExecutor";
import { useLanguage } from "../../contexts/LanguageContext";
import { getTodayStartUTC, getTomorrowStartUTC } from "../../utils/timezone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

interface IntegratedSettlementProps {
  user: Partner;
}

interface DetailedStats {
  // 입출금 현황
  totalDeposit: number;
  totalWithdrawal: number;
  depositWithdrawalDiff: number;
  
  // 베팅 현황 (카지노/슬롯 분리)
  casinoBetAmount: number;
  casinoWinAmount: number;
  casinoLossAmount: number;
  slotBetAmount: number;
  slotWinAmount: number;
  slotLossAmount: number;
  
  // 게임 손익 (하우스 손익)
  casinoHouseProfit: number;
  slotHouseProfit: number;
  totalHouseProfit: number;
}

export function IntegratedSettlement({ user }: IntegratedSettlementProps) {
  const { t } = useLanguage();
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [settlementMethod, setSettlementMethod] = useState<'differential' | 'direct_subordinate'>('direct_subordinate');
  const [periodFilter, setPeriodFilter] = useState("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [apiFilter, setApiFilter] = useState<'all' | 'invest' | 'oroplay' | 'familyapi' | 'honorapi'>('all');
  const [availableApis, setAvailableApis] = useState<string[]>([]);
  // ✅ 최신 파트너 정보를 저장하는 state 추가
  const [currentPartner, setCurrentPartner] = useState<Partner>(user);
  const [summary, setSummary] = useState<SettlementSummary>({
    // 내 수입 - 카지노
    myCasinoRollingIncome: 0,
    myCasinoLosingIncome: 0,
    // 내 수입 - 슬롯
    mySlotRollingIncome: 0,
    mySlotLosingIncome: 0,
    // 내 수입 - 환전
    myWithdrawalIncome: 0,
    // 내 수입 - 합계 (하위 호환성)
    myRollingIncome: 0,
    myLosingIncome: 0,
    myTotalIncome: 0,
    // 하위 파트너 지급 - 카지노
    partnerCasinoRollingPayments: 0,
    partnerCasinoLosingPayments: 0,
    // 하위 파트너 지급 - 슬롯
    partnerSlotRollingPayments: 0,
    partnerSlotLosingPayments: 0,
    // 하위 파트너 지급 - 환전
    partnerWithdrawalPayments: 0,
    // 하위 파트너 지급 - 합계 (하위 호환성)
    partnerRollingPayments: 0,
    partnerLosingPayments: 0,
    partnerTotalPayments: 0,
    // 순수익 - 카지노
    netCasinoRollingProfit: 0,
    netCasinoLosingProfit: 0,
    // 순수익 - 슬롯
    netSlotRollingProfit: 0,
    netSlotLosingProfit: 0,
    // 순수익 - 환전
    netWithdrawalProfit: 0,
    // 순수익 - 합계 (하위 호환성)
    netRollingProfit: 0,
    netLosingProfit: 0,
    netTotalProfit: 0
  });
  const [detailedStats, setDetailedStats] = useState<DetailedStats>({
    totalDeposit: 0,
    totalWithdrawal: 0,
    depositWithdrawalDiff: 0,
    casinoBetAmount: 0,
    casinoWinAmount: 0,
    casinoLossAmount: 0,
    slotBetAmount: 0,
    slotWinAmount: 0,
    slotLossAmount: 0,
    casinoHouseProfit: 0,
    slotHouseProfit: 0,
    totalHouseProfit: 0
  });

  // ✅ 최신 파트너 정보 로드
  const loadCurrentPartner = async () => {
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      if (data) {
        setCurrentPartner(data as Partner);
      }
    } catch (error) {
      console.error('파트너 정보 로드 실패:', error);
    }
  };

  useEffect(() => {
    loadCurrentPartner(); // ✅ 파트너 정보 먼저 로드
    loadSettlementMethod();
    loadAvailableApis();
    loadIntegratedSettlement();
  }, [user.id, periodFilter, dateRange, apiFilter]);

  const loadAvailableApis = async () => {
    try {
      // Lv1의 활성화된 API 조회
      const { data, error } = await supabase
        .from('api_configs')
        .select('api_provider, is_active')
        .eq('partner_id', user.level === 1 ? user.id : user.parent_id)
        .eq('is_active', true);

      if (error) throw error;
      
      const apis = data?.map(config => config.api_provider) || [];
      setAvailableApis(apis);
      
      if (apiFilter !== 'all' && !apis.includes(apiFilter)) {
        setApiFilter('all');
      }
    } catch (error) {
      console.error('활성화된 API 조회 실패:', error);
    }
  };

  const loadSettlementMethod = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'settlement_method')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setSettlementMethod(data.setting_value as 'differential' | 'direct_subordinate');
      }
    } catch (error) {
      console.error(t.settlement.settlementMethodLoadFailed, error);
    }
  };

  const getDateRange = () => {
    const todayStart = getTodayStartUTC();
    const tomorrowStart = getTomorrowStartUTC();
    
    switch (periodFilter) {
      case "today":
        return {
          start: todayStart,
          end: tomorrowStart
        };
      case "yesterday":
        const yesterdayStart = new Date(new Date(todayStart).getTime() - 86400000).toISOString();
        return {
          start: yesterdayStart,
          end: todayStart
        };
      case "week":
        const weekStart = new Date(new Date(todayStart).getTime() - 7 * 86400000).toISOString();
        return {
          start: weekStart,
          end: tomorrowStart
        };
      case "month":
        const todayDate = new Date(todayStart);
        const monthStart = new Date(Date.UTC(
          todayDate.getUTCFullYear(),
          todayDate.getUTCMonth(),
          1, 0, 0, 0, 0
        )).toISOString();
        return {
          start: monthStart,
          end: tomorrowStart
        };
      case "custom":
        if (dateRange?.from) {
          const start = new Date(dateRange.from);
          const end = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
          return {
            start: start.toISOString(),
            end: new Date(end.getTime() + 86400000).toISOString()
          };
        }
        return {
          start: todayStart,
          end: tomorrowStart
        };
      default:
        return {
          start: todayStart,
          end: tomorrowStart
        };
    }
  };

  const loadDetailedStats = async (userIds: string[], startDate: string, endDate: string) => {
    try {
      // 입출금 현황 조회
      const { data: depositData } = await supabase
        .from('transactions')
        .select('amount')
        .in('user_id', userIds)
        .eq('transaction_type', 'deposit')
        .eq('status', 'approved')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      const totalDeposit = depositData?.reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;
      const totalWithdrawal = await getWithdrawalAmount(userIds, startDate, endDate);

      // 베팅 현황 조회 (카지노/슬롯 분리)
      const gameTypeStats = await getBettingStatsByGameType(userIds, startDate, endDate, apiFilter);

      // 승리액은 별도 계산 필요 (bet_amount - loss_amount)
      const casinoWinAmount = gameTypeStats.casino.betAmount - gameTypeStats.casino.lossAmount;
      const slotWinAmount = gameTypeStats.slot.betAmount - gameTypeStats.slot.lossAmount;

      // 하우스 손익 = 베팅액 - 승리액
      const casinoHouseProfit = gameTypeStats.casino.betAmount - casinoWinAmount;
      const slotHouseProfit = gameTypeStats.slot.betAmount - slotWinAmount;

      setDetailedStats({
        totalDeposit,
        totalWithdrawal,
        depositWithdrawalDiff: totalDeposit - totalWithdrawal,
        casinoBetAmount: gameTypeStats.casino.betAmount,
        casinoWinAmount,
        casinoLossAmount: gameTypeStats.casino.lossAmount,
        slotBetAmount: gameTypeStats.slot.betAmount,
        slotWinAmount,
        slotLossAmount: gameTypeStats.slot.lossAmount,
        casinoHouseProfit,
        slotHouseProfit,
        totalHouseProfit: casinoHouseProfit + slotHouseProfit
      });
    } catch (error) {
      console.error('상세 통계 조회 실패:', error);
    }
  };

  const loadIntegratedSettlement = async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      const { start, end } = getDateRange();

      const settlement = await calculateIntegratedSettlement(
        user.id,
        {
          rolling: currentPartner.commission_rolling,
          losing: currentPartner.commission_losing,
          casino_rolling: currentPartner.casino_rolling_commission ?? 0,
          casino_losing: currentPartner.casino_losing_commission ?? 0,
          slot_rolling: currentPartner.slot_rolling_commission ?? 0,
          slot_losing: currentPartner.slot_losing_commission ?? 0,
          withdrawal: currentPartner.withdrawal_fee
        },
        start,
        end,
        apiFilter
      );

      setSummary(settlement);

      // 상세 통계 조회
      const descendantUserIds = await getDescendantUserIds(user.id);
      if (descendantUserIds.length > 0) {
        await loadDetailedStats(descendantUserIds, start, end);
      }
    } catch (error) {
      console.error('통합 정산 계산 실패:', error);
      toast.error(t.settlement.commissionLoadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setInitialLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadIntegratedSettlement();
  };

  const handleExecuteSettlement = async () => {
    if (summary.netTotalProfit <= 0) {
      toast.error(t.settlement.netProfitZeroOrLess);
      return;
    }

    const confirmMessage = t.settlement.confirmIntegratedSettlement
      .replace('{myRolling}', summary.myRollingIncome.toLocaleString())
      .replace('{myLosing}', summary.myLosingIncome.toLocaleString())
      .replace('{myWithdrawal}', summary.myWithdrawalIncome.toLocaleString())
      .replace('{myTotal}', summary.myTotalIncome.toLocaleString())
      .replace('{partnerRolling}', summary.partnerRollingPayments.toLocaleString())
      .replace('{partnerLosing}', summary.partnerLosingPayments.toLocaleString())
      .replace('{partnerWithdrawal}', summary.partnerWithdrawalPayments.toLocaleString())
      .replace('{partnerTotal}', summary.partnerTotalPayments.toLocaleString())
      .replace('{netTotal}', summary.netTotalProfit.toLocaleString());

    if (!window.confirm(confirmMessage)) return;

    setExecuting(true);
    try {
      const { start, end } = getDateRange();
      
      const result = await executeIntegratedSettlement(
        user.id,
        {
          rolling: user.commission_rolling,
          losing: user.commission_losing,
          casino_rolling: user.casino_rolling_commission ?? 0,
          casino_losing: user.casino_losing_commission ?? 0,
          slot_rolling: user.slot_rolling_commission ?? 0,
          slot_losing: user.slot_losing_commission ?? 0,
          withdrawal: user.withdrawal_fee
        },
        start,
        end,
        periodFilter,
        apiFilter
      );

      if (result.success) {
        toast.success(result.message);
        loadIntegratedSettlement();
      } else {
        toast.error(result.message || t.settlement.integratedSettlementFailed);
      }
    } catch (error) {
      console.error('통합 정산 실행 오류:', error);
      toast.error(t.settlement.integratedSettlementError);
    } finally {
      setExecuting(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 relative">
      {/* 로딩 오버레이 */}
      {(loading || refreshing) && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-slate-800 p-6 rounded-lg shadow-xl flex items-center gap-3">
            <RefreshCw className="h-5 w-5 animate-spin text-purple-400" />
            <span className="text-white">데이터를 불러오는 중...</span>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-white mb-2">{t.settlement.integratedSettlementTitle}</h1>
          <p className="text-xl text-slate-400">
            {t.settlement.integratedSettlementSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-lg px-6 py-3"
          >
            <RefreshCw className={cn("h-6 w-6 mr-2", refreshing && "animate-spin")} />
            {t.common.refresh}
          </Button>
          <Button
            variant="default"
            size="lg"
            onClick={handleExecuteSettlement}
            disabled={executing || summary.netTotalProfit <= 0}
            className="bg-purple-600 hover:bg-purple-700 text-lg px-6 py-3"
          >
            <FileCheck className={cn("h-6 w-6 mr-2", executing && "animate-spin")} />
            {executing ? t.settlement.savingSettlement : t.settlement.saveSettlementRecord}
          </Button>
        </div>
      </div>

      {/* 기간 및 API 필터 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="text-3xl">조회 설정</CardTitle>
              <CardDescription className="text-xl">
                조회 기간 및 API를 선택하세요
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {user.level <= 2 && (
                <Select value={apiFilter} onValueChange={(value) => setApiFilter(value as 'all' | 'invest' | 'oroplay' | 'familyapi' | 'honorapi')}>
                  <SelectTrigger className="w-[210px] h-12 text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-lg">{t.settlement.allApi}</SelectItem>
                    {availableApis.includes('invest') && (
                      <SelectItem value="invest" className="text-lg">{t.settlement.investOnly}</SelectItem>
                    )}
                    {availableApis.includes('oroplay') && (
                      <SelectItem value="oroplay" className="text-lg">{t.settlement.oroplaysOnly}</SelectItem>
                    )}
                    {availableApis.includes('familyapi') && (
                      <SelectItem value="familyapi" className="text-lg">{t.settlement.familyApiOnly}</SelectItem>
                    )}
                    {availableApis.includes('honorapi') && (
                      <SelectItem value="honorapi" className="text-lg">{t.settlement.honorApiOnly}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}

              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[270px] h-12 text-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today" className="text-lg">{t.settlement.today}</SelectItem>
                  <SelectItem value="yesterday" className="text-lg">{t.settlement.yesterday}</SelectItem>
                  <SelectItem value="week" className="text-lg">{t.settlement.lastWeek}</SelectItem>
                  <SelectItem value="month" className="text-lg">{t.settlement.thisMonth}</SelectItem>
                  <SelectItem value="custom" className="text-lg">{t.settlement.customPeriod}</SelectItem>
                </SelectContent>
              </Select>

              {periodFilter === "custom" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[420px] h-12 justify-start text-left text-lg">
                      <CalendarIcon className="mr-2 h-6 w-6" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "PPP", { locale: ko })} -{" "}
                            {format(dateRange.to, "PPP", { locale: ko })}
                          </>
                        ) : (
                          format(dateRange.from, "PPP", { locale: ko })
                        )
                      ) : (
                        <span>{t.settlement.selectDate}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      locale={ko}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 1. 입출금 현황 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-3xl">
            <Wallet className="h-8 w-8 text-blue-400" />
            입출금 현황
          </CardTitle>
          <CardDescription className="text-xl">
            하위 조직의 실제 충전/환전 내역입니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="text-slate-400 text-xl mb-1">총 충전액</div>
              <div className="text-3xl text-emerald-400">
                ₩{detailedStats.totalDeposit.toLocaleString()}
              </div>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="text-slate-400 text-xl mb-1">총 환전액</div>
              <div className="text-3xl text-red-400">
                ₩{detailedStats.totalWithdrawal.toLocaleString()}
              </div>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="text-slate-400 text-xl mb-1">입출금 차액</div>
              <div className={cn(
                "text-3xl",
                detailedStats.depositWithdrawalDiff > 0 ? "text-emerald-400" : "text-red-400"
              )}>
                ₩{detailedStats.depositWithdrawalDiff.toLocaleString()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. 베팅 현황 (카지노/슬롯 분리) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-3xl">
            <CreditCard className="h-8 w-8 text-purple-400" />
            베팅 현황
          </CardTitle>
          <CardDescription className="text-xl">
            카지노와 슬롯 게임의 베팅 통계입니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 카지노 */}
            <div>
              <h3 className="text-xl mb-3 text-slate-300">🎰 카지노</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-1">총 베팅액</div>
                  <div className="text-3xl">
                    ₩{detailedStats.casinoBetAmount.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-1">총 승리액</div>
                  <div className="text-3xl text-emerald-400">
                    ₩{detailedStats.casinoWinAmount.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-1">손실액</div>
                  <div className="text-3xl text-red-400">
                    ₩{detailedStats.casinoLossAmount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* 슬롯 */}
            <div>
              <h3 className="text-xl mb-3 text-slate-300">🎲 슬롯</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-1">총 베팅액</div>
                  <div className="text-3xl">
                    ₩{detailedStats.slotBetAmount.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-1">총 승리액</div>
                  <div className="text-3xl text-emerald-400">
                    ₩{detailedStats.slotWinAmount.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-1">손실액</div>
                  <div className="text-3xl text-red-400">
                    ₩{detailedStats.slotLossAmount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. 통합 정산 (최종 손익) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-3xl">
            <TrendingUpDown className="h-8 w-8 text-yellow-400" />
            통합 정산
          </CardTitle>
          <CardDescription className="text-xl">
            입출금 + 게임 손익 + 커미션을 종합한 최종 정산 내역입니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 게임 하우스 손익 */}
            <div>
              <h3 className="text-xl mb-3 text-slate-300">게임 하우스 손익</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-1">카지노 손익</div>
                  <div className={cn(
                    "text-3xl",
                    detailedStats.casinoHouseProfit > 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    ₩{detailedStats.casinoHouseProfit.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-1">슬롯 손익</div>
                  <div className={cn(
                    "text-3xl",
                    detailedStats.slotHouseProfit > 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    ₩{detailedStats.slotHouseProfit.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-1">총 게임 손익</div>
                  <div className={cn(
                    "text-3xl",
                    detailedStats.totalHouseProfit > 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    ₩{detailedStats.totalHouseProfit.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* 커미션 수입 */}
            <div>
              <h3 className="text-xl mb-3 text-slate-300">내 커미션 수입</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-2">
                    카지노 (롤링: {currentPartner.casino_rolling_commission ?? 0}% / 루징: {currentPartner.casino_losing_commission ?? 0}%)
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xl">
                      <span className="text-slate-400">롤링:</span>
                      <span className="text-emerald-400">₩{summary.myCasinoRollingIncome.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xl">
                      <span className="text-slate-400">루징:</span>
                      <span className="text-emerald-400">₩{summary.myCasinoLosingIncome.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-2">
                    슬롯 (롤링: {currentPartner.slot_rolling_commission ?? 0}% / 루징: {currentPartner.slot_losing_commission ?? 0}%)
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xl">
                      <span className="text-slate-400">롤링:</span>
                      <span className="text-emerald-400">₩{summary.mySlotRollingIncome.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xl">
                      <span className="text-slate-400">루징:</span>
                      <span className="text-emerald-400">₩{summary.mySlotLosingIncome.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="text-slate-400 text-xl mb-2">
                    환전 수수료 ({currentPartner.withdrawal_fee ?? 0}%)
                  </div>
                  <div className="text-3xl text-emerald-400">
                    ₩{summary.myWithdrawalIncome.toLocaleString()}
                  </div>
                  <div className="text-lg text-slate-500 mt-1">총 수입: ₩{summary.myTotalIncome.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* 하위 파트너 지급 (요약만) - Lv6은 숨김 */}
            {user.level !== 6 && (
              <div>
                <h3 className="text-xl mb-3 text-slate-300">하위 파트너 지급</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-400 text-xl mb-2">카지노</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xl">
                        <span className="text-slate-400">롤링:</span>
                        <span className="text-red-400">₩{summary.partnerCasinoRollingPayments.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xl">
                        <span className="text-slate-400">루징:</span>
                        <span className="text-red-400">₩{summary.partnerCasinoLosingPayments.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-400 text-xl mb-2">슬롯</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xl">
                        <span className="text-slate-400">롤링:</span>
                        <span className="text-red-400">₩{summary.partnerSlotRollingPayments.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xl">
                        <span className="text-slate-400">루징:</span>
                        <span className="text-red-400">₩{summary.partnerSlotLosingPayments.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-400 text-xl mb-2">환전 수수료</div>
                    <div className="text-3xl text-red-400">
                      ₩{summary.partnerWithdrawalPayments.toLocaleString()}
                    </div>
                    <div className="text-lg text-slate-500 mt-1">총 지급: ₩{summary.partnerTotalPayments.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}

            {/* 최종 순수익 */}
            <div className="mt-6 p-6 bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg border border-purple-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-slate-400 text-xl mb-1">최종 순수익</div>
                  <div className="text-lg text-slate-500">
                    {user.level === 6 ? (
                      // Lv6: 하위 지급 없음
                      <>
                        입출금 차액 (₩{detailedStats.depositWithdrawalDiff.toLocaleString()}) 
                        + 게임 손익 (₩{detailedStats.totalHouseProfit.toLocaleString()})
                        + 커미션 수입 (₩{summary.myTotalIncome.toLocaleString()})
                      </>
                    ) : user.level >= 3 ? (
                      // Lv3~Lv5: 모든 항목 표시
                      <>
                        입출금 차액 (₩{detailedStats.depositWithdrawalDiff.toLocaleString()}) 
                        + 게임 손익 (₩{detailedStats.totalHouseProfit.toLocaleString()})
                        + 커미션 수입 (₩{summary.myTotalIncome.toLocaleString()})
                        - 하위 지급 (₩{summary.partnerTotalPayments.toLocaleString()})
                      </>
                    ) : (
                      // Lv1~Lv2: 기존대로
                      <>
                        입출금 차액 (₩{detailedStats.depositWithdrawalDiff.toLocaleString()}) 
                        + 게임 손익 (₩{detailedStats.totalHouseProfit.toLocaleString()})
                        + 커미션 수입 (₩{summary.myTotalIncome.toLocaleString()})
                        - 하위 지급 (₩{summary.partnerTotalPayments.toLocaleString()})
                      </>
                    )}
                  </div>
                  {/* ✅ 모든 레벨에서 커미션 총합 표시 */}
                  <div className="text-lg text-slate-400 mt-2">
                    커미션 총합: ₩{(summary.myCasinoRollingIncome + summary.myCasinoLosingIncome + summary.mySlotRollingIncome + summary.mySlotLosingIncome).toLocaleString()}
                  </div>
                </div>
                <div className={cn(
                  "text-4xl",
                  summary.netTotalProfit > 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {/* ✅ 소수점 절사 */}
                  ₩{Math.floor(detailedStats.depositWithdrawalDiff + detailedStats.totalHouseProfit + summary.myTotalIncome - summary.partnerTotalPayments).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}