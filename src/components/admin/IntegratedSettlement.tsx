import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, Calendar as CalendarIcon, Info, ArrowDownCircle, ArrowUpCircle, FileCheck } from "lucide-react";
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
import { calculateIntegratedSettlement, calculatePartnerPayments, SettlementSummary, PartnerPaymentDetail } from "../../lib/settlementCalculator";
import { executeIntegratedSettlement } from "../../lib/settlementExecutor";
import { useLanguage } from "../../contexts/LanguageContext";
import { getTodayStartUTC, getTomorrowStartUTC } from "../../utils/timezone";

interface IntegratedSettlementProps {
  user: Partner;
}

export function IntegratedSettlement({ user }: IntegratedSettlementProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [settlementMethod, setSettlementMethod] = useState<'differential' | 'direct_subordinate'>('direct_subordinate');
  const [periodFilter, setPeriodFilter] = useState("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  // Lv3~Lv6은 통합 GMS 머니만 사용하므로 API 필터 불필요
  const [apiFilter, setApiFilter] = useState<'all' | 'invest' | 'oroplay'>('all');
  const [availableApis, setAvailableApis] = useState<string[]>([]);
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
  const [partnerPayments, setPartnerPayments] = useState<PartnerPaymentDetail[]>([]);

  useEffect(() => {
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
        .eq('partner_id', user.level === 1 ? user.id : user.parent_id) // Lv1 찾기
        .eq('is_active', true);

      if (error) throw error;
      
      const apis = data?.map(config => config.api_provider) || [];
      setAvailableApis(apis);
      
      // 현재 선택된 API가 비활성화된 경우 'all'로 변경
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
    // 시스템 타임존 기준 오늘/내일 0시
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
        // 시스템 타임존 기준 이번 달 1일 0시
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

  const loadIntegratedSettlement = async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      const { start, end } = getDateRange();

      console.log('[IntegratedSettlement] 정산 계산 시작:', {
        userId: user.id,
        commissionRates: {
          rolling: user.commission_rolling,
          losing: user.commission_losing,
          casino_rolling: user.casino_rolling_commission ?? 0,
          casino_losing: user.casino_losing_commission ?? 0,
          slot_rolling: user.slot_rolling_commission ?? 0,
          slot_losing: user.slot_losing_commission ?? 0,
          withdrawal: user.withdrawal_fee
        },
        startDate: start,
        endDate: end,
        apiFilter
      });

      const settlement = await calculateIntegratedSettlement(
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
        apiFilter
      );

      console.log('[IntegratedSettlement] 정산 결과:', settlement);

      setSummary(settlement);
      
      const payments = await calculatePartnerPayments(user.id, start, end, apiFilter);
      setPartnerPayments(payments.details);
    } catch (error) {
      console.error('통합 정산 계산 실패:', error);
      toast.error(t.settlement.commissionLoadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-white mb-2">{t.settlement.integratedSettlementTitle}</h1>
          <p className="text-slate-400">
            {t.settlement.integratedSettlementSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            {t.common.refresh}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleExecuteSettlement}
            disabled={executing || summary.netTotalProfit <= 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <FileCheck className={cn("h-4 w-4 mr-2", executing && "animate-spin")} />
            {executing ? t.settlement.savingSettlement : t.settlement.saveSettlementRecord}
          </Button>
        </div>
      </div>

      {/* 메인 정산 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 내 총 수입 */}
        <MetricCard
          title={t.settlement.myTotalIncome}
          value={`₩${summary.myTotalIncome.toLocaleString()}`}
          subtitle={`카지노: ₩${summary.myCasinoRollingIncome.toLocaleString()} (롤링) + ₩${summary.myCasinoLosingIncome.toLocaleString()} (루징) | 슬롯: ₩${summary.mySlotRollingIncome.toLocaleString()} (롤링) + ₩${summary.mySlotLosingIncome.toLocaleString()} (루징)`}
          icon={ArrowUpCircle}
          color="emerald"
        />

        {/* 하위 파트너 지급 */}
        <MetricCard
          title={t.settlement.partnerTotalPayments}
          value={`₩${summary.partnerTotalPayments.toLocaleString()}`}
          subtitle={`카지노: ₩${summary.partnerCasinoRollingPayments.toLocaleString()} (롤링) + ₩${summary.partnerCasinoLosingPayments.toLocaleString()} (루징) | 슬롯: ₩${summary.partnerSlotRollingPayments.toLocaleString()} (롤링) + ₩${summary.partnerSlotLosingPayments.toLocaleString()} (루징)`}
          icon={ArrowDownCircle}
          color="red"
        />

        {/* 순수익 */}
        <MetricCard
          title={t.settlement.netProfit}
          value={`₩${summary.netTotalProfit.toLocaleString()}`}
          subtitle={`카지노: ₩${summary.netCasinoRollingProfit.toLocaleString()} (롤링) + ₩${summary.netCasinoLosingProfit.toLocaleString()} (루징) | 슬롯: ₩${summary.netSlotRollingProfit.toLocaleString()} (롤링) + ₩${summary.netSlotLosingProfit.toLocaleString()} (루징)`}
          icon={DollarSign}
          color="blue"
        />
      </div>

      {/* 기간 및 API 필터 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle>조회 설정</CardTitle>
              <CardDescription>
                조회 기간 및 API를 선택하세요
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {/* API 필터 - Lv3~Lv6은 통합 GMS 머니만 사용하므로 숨김 */}
              {user.level <= 2 && (
                <Select value={apiFilter} onValueChange={(value) => setApiFilter(value as 'all' | 'invest' | 'oroplay')}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.settlement.allApi}</SelectItem>
                    {availableApis.includes('invest') && (
                      <SelectItem value="invest">{t.settlement.investOnly}</SelectItem>
                    )}
                    {availableApis.includes('oroplay') && (
                      <SelectItem value="oroplay">{t.settlement.oroplaysOnly}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}

              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">{t.settlement.today}</SelectItem>
                  <SelectItem value="yesterday">{t.settlement.yesterday}</SelectItem>
                  <SelectItem value="week">{t.settlement.lastWeek}</SelectItem>
                  <SelectItem value="month">{t.settlement.thisMonth}</SelectItem>
                  <SelectItem value="custom">{t.settlement.customPeriod}</SelectItem>
                </SelectContent>
              </Select>

              {periodFilter === "custom" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[280px] justify-start text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
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
    </div>
  );
}