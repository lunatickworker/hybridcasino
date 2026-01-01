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
  
  // 강제 입출금 (admin_deposit, admin_withdrawal)
  forceDeposit: number;
  forceWithdrawal: number;
  
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
    forceDeposit: 0,
    forceWithdrawal: 0,
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

  // ✅ 실시간 업데이트 구독
  useEffect(() => {
    console.log('🔄 [IntegratedSettlement] 실시간 구독 시작');

    // transactions 테이블 구독 (입출금 변경 감지)
    const transactionsChannel = supabase
      .channel('transactions_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          console.log('💰 [transactions 변경 감지]:', payload.eventType);
          // 데이터 새로고침
          handleRefresh();
        }
      )
      .subscribe();

    // game_records 테이블 구독 (게임 기록 변경 감지)
    const gameRecordsChannel = supabase
      .channel('game_records_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_records'
        },
        (payload) => {
          console.log('🎮 [game_records 변경 감지]:', payload.eventType);
          // 데이터 새로고침
          handleRefresh();
        }
      )
      .subscribe();

    // settlements 테이블 구독 (정산 기록 변경 감지)
    const settlementsChannel = supabase
      .channel('settlements_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settlements'
        },
        (payload) => {
          console.log('📊 [settlements 변경 감지]:', payload.eventType);
          // 데이터 새로고침
          handleRefresh();
        }
      )
      .subscribe();

    // 클린업
    return () => {
      console.log('🔄 [IntegratedSettlement] 실시간 구독 해제');
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(gameRecordsChannel);
      supabase.removeChannel(settlementsChannel);
    };
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
      console.log('📊 [loadDetailedStats] 시작:', { 
        userCount: userIds.length, 
        startDate, 
        endDate,
        apiFilter 
      });

      // ✅ 입출금 현황: 하위 회원들의 입출금 (transactions 테이블 사용)
      let totalDeposit = 0;
      let totalWithdrawal = 0;
      let forceDeposit = 0;
      let forceWithdrawal = 0;

      if (userIds.length > 0) {
        // 청크로 나누어 처리 (userIds가 많을 경우 대비)
        const CHUNK_SIZE = 100;
        
        for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
          const chunk = userIds.slice(i, i + CHUNK_SIZE);
          
          // 입금 조회 (일반 + 강제)
          const { data: depositData, error: depositError } = await supabase
            .from('transactions')
            .select('amount, transaction_type')
            .in('transaction_type', ['deposit', 'admin_deposit'])
            .in('status', ['approved', 'completed'])
            .in('user_id', chunk)
            .gte('created_at', startDate)
            .lt('created_at', endDate);

          if (depositError) {
            console.error('❌ 입금 데이터 조회 오류:', depositError);
          } else {
            const normalDeposit = depositData?.filter(tx => tx.transaction_type === 'deposit').reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0) || 0;
            const adminDeposit = depositData?.filter(tx => tx.transaction_type === 'admin_deposit').reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0) || 0;
            totalDeposit += (normalDeposit + adminDeposit);
            forceDeposit += adminDeposit;
            console.log(`✅ 입금 데이터 (청크 ${Math.floor(i/CHUNK_SIZE) + 1}):`, depositData?.length, '건, 일반:', normalDeposit, '강제:', adminDeposit);
          }

          // 출금 조회 (일반 + 강제)
          const { data: withdrawalData, error: withdrawalError } = await supabase
            .from('transactions')
            .select('amount, transaction_type')
            .in('transaction_type', ['withdrawal', 'admin_withdrawal'])
            .in('status', ['approved', 'completed'])
            .in('user_id', chunk)
            .gte('created_at', startDate)
            .lt('created_at', endDate);

          if (withdrawalError) {
            console.error('❌ 출금 데이터 조회 오류:', withdrawalError);
          } else {
            const normalWithdrawal = withdrawalData?.filter(tx => tx.transaction_type === 'withdrawal').reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0) || 0;
            const adminWithdrawal = withdrawalData?.filter(tx => tx.transaction_type === 'admin_withdrawal').reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0) || 0;
            totalWithdrawal += (normalWithdrawal + adminWithdrawal);
            forceWithdrawal += adminWithdrawal;
            console.log(`✅ 출금 데이터 (청크 ${Math.floor(i/CHUNK_SIZE) + 1}):`, withdrawalData?.length, '건, 일반:', normalWithdrawal, '강제:', adminWithdrawal);
          }
        }
      }

      console.log('💰 입출금 합계:', { totalDeposit, totalWithdrawal, forceDeposit, forceWithdrawal });

      // 베팅 현황 조회 (카지노/슬롯 분리) - 하위 사용자들
      const gameTypeStats = await getBettingStatsByGameType(userIds, startDate, endDate, apiFilter);

      console.log('🎮 게임 타입별 통계:', gameTypeStats);

      // 승리액은 별도 계산 필요 (bet_amount - loss_amount)
      const casinoWinAmount = gameTypeStats.casino.betAmount - gameTypeStats.casino.lossAmount;
      const slotWinAmount = gameTypeStats.slot.betAmount - gameTypeStats.slot.lossAmount;

      // 하우스 손익 = 베팅액 - 승리액 = 손실액
      const casinoHouseProfit = gameTypeStats.casino.lossAmount;
      const slotHouseProfit = gameTypeStats.slot.lossAmount;

      const finalStats = {
        totalDeposit,
        totalWithdrawal,
        depositWithdrawalDiff: totalDeposit - totalWithdrawal,
        forceDeposit,
        forceWithdrawal,
        casinoBetAmount: gameTypeStats.casino.betAmount,
        casinoWinAmount,
        casinoLossAmount: gameTypeStats.casino.lossAmount,
        slotBetAmount: gameTypeStats.slot.betAmount,
        slotWinAmount,
        slotLossAmount: gameTypeStats.slot.lossAmount,
        casinoHouseProfit,
        slotHouseProfit,
        totalHouseProfit: casinoHouseProfit + slotHouseProfit
      };

      console.log('📈 최종 통계:', finalStats);

      setDetailedStats(finalStats);
    } catch (error) {
      console.error('❌ 상세 통계 조회 실패:', error);
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

  const finalProfit = Math.floor(detailedStats.depositWithdrawalDiff + detailedStats.totalHouseProfit + summary.myTotalIncome - summary.partnerTotalPayments);

  return (
    <div className="space-y-3 p-3 relative">
      {/* 로딩 오버레이 */}
      {(loading || refreshing) && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-slate-800 p-6 rounded-lg shadow-xl flex items-center gap-3">
            <RefreshCw className="h-5 w-5 animate-spin text-purple-400" />
            <span className="text-white text-xl">데이터를 불러오는 중...</span>
          </div>
        </div>
      )}

      {/* 상단 컨트롤 */}
      <div className="flex items-center justify-between bg-slate-800/30 rounded-lg p-3 border border-slate-700/40">
        <div className="flex items-center gap-2">
          {user.level <= 2 && (
            <Select value={apiFilter} onValueChange={(value) => setApiFilter(value as 'all' | 'invest' | 'oroplay' | 'familyapi' | 'honorapi')}>
              <SelectTrigger className="w-[160px] h-11 text-lg bg-slate-800/50 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
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
            <SelectTrigger className="w-[200px] h-11 text-lg bg-slate-800/50 border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
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
                <Button variant="outline" className="w-[340px] h-11 justify-start text-left text-lg bg-slate-800/50 border-slate-600">
                  <CalendarIcon className="mr-2 h-5 w-5" />
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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="default"
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-lg px-5 h-11 bg-slate-800/50 border-slate-600 hover:bg-slate-700"
          >
            <RefreshCw className={cn("h-5 w-5 mr-2", refreshing && "animate-spin")} />
            {t.common.refresh}
          </Button>
          <Button
            variant="default"
            size="default"
            onClick={handleExecuteSettlement}
            disabled={executing || summary.netTotalProfit <= 0}
            className="bg-purple-600 hover:bg-purple-700 text-lg px-5 h-11"
          >
            <FileCheck className={cn("h-5 w-5 mr-2", executing && "animate-spin")} />
            {executing ? t.settlement.savingSettlement : t.settlement.saveSettlementRecord}
          </Button>
        </div>
      </div>

      {/* 🎯 최종 순수익 - 가장 눈에 띄게 */}
      <div className="p-6 bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-purple-900/40 rounded-xl border-2 border-purple-500/50 shadow-2xl shadow-purple-500/20">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="text-slate-300 text-2xl mb-2 flex items-center gap-3">
              <TrendingUpDown className="h-8 w-8 text-yellow-400" />
              최종 순수익
            </div>
            <div className="text-slate-400 text-lg space-y-1">
              <div>입출금 차액: <span className={cn("font-semibold", detailedStats.depositWithdrawalDiff > 0 ? "text-emerald-400" : "text-red-400")}>₩{detailedStats.depositWithdrawalDiff.toLocaleString()}</span></div>
              <div>게임 손익: <span className={cn("font-semibold", detailedStats.totalHouseProfit > 0 ? "text-emerald-400" : "text-red-400")}>₩{detailedStats.totalHouseProfit.toLocaleString()}</span></div>
              <div>커미션 수입: <span className="text-emerald-400 font-semibold">+₩{summary.myTotalIncome.toLocaleString()}</span></div>
              {user.level !== 6 && (
                <div>하위 지급: <span className="text-red-400 font-semibold">-₩{summary.partnerTotalPayments.toLocaleString()}</span></div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className={cn(
              "text-6xl font-bold mb-2",
              finalProfit > 0 ? "text-emerald-400" : "text-red-400"
            )}>
              ₩{finalProfit.toLocaleString()}
            </div>
            <div className="text-xl text-slate-400">
              커미션: ₩{(summary.myCasinoRollingIncome + summary.myCasinoLosingIncome + summary.mySlotRollingIncome + summary.mySlotLosingIncome).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* 입출금 & 게임 손익 - 2열 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 입출금 현황 */}
        <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/40">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-7 w-7 text-blue-400" />
            <h3 className="text-2xl text-white">입출금 현황</h3>
          </div>
          <div className="space-y-2">
            <div className="p-3 bg-slate-900/50 rounded">
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg text-slate-300">총 입금</span>
                <span className="text-2xl text-emerald-400 font-semibold">₩{detailedStats.totalDeposit.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-4 pt-2 border-t border-slate-700/50">
                <div className="text-base text-slate-400">신청 입금:</div>
                <div className="text-right text-lg text-emerald-300">₩{(detailedStats.totalDeposit - detailedStats.forceDeposit).toLocaleString()}</div>
                <div className="text-base text-slate-400">강제 입금:</div>
                <div className="text-right text-lg text-orange-400">₩{detailedStats.forceDeposit.toLocaleString()}</div>
              </div>
            </div>
            <div className="p-3 bg-slate-900/50 rounded">
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg text-slate-300">총 출금</span>
                <span className="text-2xl text-red-400 font-semibold">₩{detailedStats.totalWithdrawal.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-4 pt-2 border-t border-slate-700/50">
                <div className="text-base text-slate-400">신청 출금:</div>
                <div className="text-right text-lg text-red-300">₩{(detailedStats.totalWithdrawal - detailedStats.forceWithdrawal).toLocaleString()}</div>
                <div className="text-base text-slate-400">강제 출금:</div>
                <div className="text-right text-lg text-orange-400">₩{detailedStats.forceWithdrawal.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded border border-blue-500/30">
              <span className="text-lg text-slate-200 font-semibold">차액</span>
              <span className={cn("text-2xl font-bold", detailedStats.depositWithdrawalDiff > 0 ? "text-emerald-400" : "text-red-400")}>
                ₩{detailedStats.depositWithdrawalDiff.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 게임 하우스 손익 */}
        <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/40">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-7 w-7 text-purple-400" />
            <h3 className="text-2xl text-white">게임 하우스 손익</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded">
              <span className="text-lg text-slate-300">🎰 카지노</span>
              <span className={cn("text-2xl font-semibold", detailedStats.casinoHouseProfit > 0 ? "text-emerald-400" : "text-red-400")}>
                ₩{detailedStats.casinoHouseProfit.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded">
              <span className="text-lg text-slate-300">🎲 슬롯</span>
              <span className={cn("text-2xl font-semibold", detailedStats.slotHouseProfit > 0 ? "text-emerald-400" : "text-red-400")}>
                ₩{detailedStats.slotHouseProfit.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded border border-purple-500/30">
              <span className="text-lg text-slate-200 font-semibold">총 손익</span>
              <span className={cn("text-2xl font-bold", detailedStats.totalHouseProfit > 0 ? "text-emerald-400" : "text-red-400")}>
                ₩{detailedStats.totalHouseProfit.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 커미션 수입 & 하위 지급 - 2열 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 내 커미션 수입 - 운영사(레벨2)는 숨김 */}
        {user.level !== 2 && (
          <div className="bg-gradient-to-br from-emerald-900/30 to-green-900/30 rounded-lg p-4 border border-emerald-500/40">
            <div className="flex items-center gap-2 mb-3">
              <ArrowDownCircle className="h-7 w-7 text-emerald-400" />
              <h3 className="text-2xl text-white">내 커미션 수입</h3>
            </div>
            <div className="space-y-2">
              <div className="p-3 bg-slate-900/40 rounded">
                <div className="text-base text-slate-400 mb-1">
                  🎰 카지노 (롤링 {currentPartner.casino_rolling_commission ?? 0}% / 루징 {currentPartner.casino_losing_commission ?? 0}%)
                </div>
                <div className="flex justify-between">
                  <span className="text-lg text-slate-300">롤링:</span>
                  <span className="text-xl text-emerald-400 font-semibold">₩{summary.myCasinoRollingIncome.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lg text-slate-300">루징:</span>
                  <span className="text-xl text-emerald-400 font-semibold">₩{summary.myCasinoLosingIncome.toLocaleString()}</span>
                </div>
              </div>
              <div className="p-3 bg-slate-900/40 rounded">
                <div className="text-base text-slate-400 mb-1">
                  🎲 슬롯 (롤링 {currentPartner.slot_rolling_commission ?? 0}% / 루징 {currentPartner.slot_losing_commission ?? 0}%)
                </div>
                <div className="flex justify-between">
                  <span className="text-lg text-slate-300">롤링:</span>
                  <span className="text-xl text-emerald-400 font-semibold">₩{summary.mySlotRollingIncome.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lg text-slate-300">루징:</span>
                  <span className="text-xl text-emerald-400 font-semibold">₩{summary.mySlotLosingIncome.toLocaleString()}</span>
                </div>
              </div>
              <div className="p-3 bg-slate-900/40 rounded">
                <div className="text-base text-slate-400 mb-1">
                  환전 수수료 ({currentPartner.withdrawal_fee ?? 0}%)
                </div>
                <div className="text-2xl text-emerald-400 font-bold">
                  ₩{summary.myWithdrawalIncome.toLocaleString()}
                </div>
              </div>
              <div className="p-3 bg-emerald-500/20 rounded border border-emerald-500/40">
                <div className="flex justify-between items-center">
                  <span className="text-xl text-slate-200 font-semibold">총 수입</span>
                  <span className="text-3xl text-emerald-400 font-bold">₩{summary.myTotalIncome.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 베팅 상세 통계 - 운영사(레벨2)일 때 커미션 카드 자리에 표시 */}
        {user.level === 2 && (
          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/40">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-7 w-7 text-cyan-400" />
              <h3 className="text-2xl text-white">베팅 상세 통계</h3>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-slate-900/40 rounded">
                <div className="text-lg text-slate-300 mb-2">🎰 카지노</div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-base text-slate-400">베팅:</span>
                  <span className="text-xl text-slate-300 font-semibold">₩{detailedStats.casinoBetAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-base text-slate-400">승리:</span>
                  <span className="text-xl text-emerald-400 font-semibold">₩{detailedStats.casinoWinAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-base text-slate-400">손실:</span>
                  <span className="text-xl text-red-400 font-semibold">₩{detailedStats.casinoLossAmount.toLocaleString()}</span>
                </div>
              </div>
              <div className="p-3 bg-slate-900/40 rounded">
                <div className="text-lg text-slate-300 mb-2">🎲 슬롯</div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-base text-slate-400">베팅:</span>
                  <span className="text-xl text-slate-300 font-semibold">₩{detailedStats.slotBetAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-base text-slate-400">승리:</span>
                  <span className="text-xl text-emerald-400 font-semibold">₩{detailedStats.slotWinAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-base text-slate-400">손실:</span>
                  <span className="text-xl text-red-400 font-semibold">₩{detailedStats.slotLossAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 하위 파트너 지급 */}
        {user.level !== 6 && (
          <div className="bg-gradient-to-br from-red-900/30 to-orange-900/30 rounded-lg p-4 border border-red-500/40">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpCircle className="h-7 w-7 text-red-400" />
              <h3 className="text-2xl text-white">하위 파트너 지급</h3>
            </div>
            <div className="space-y-2">
              <div className="p-3 bg-slate-900/40 rounded">
                <div className="text-base text-slate-400 mb-1">🎰 카지노</div>
                <div className="flex justify-between">
                  <span className="text-lg text-slate-300">롤링:</span>
                  <span className="text-xl text-red-400 font-semibold">₩{summary.partnerCasinoRollingPayments.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lg text-slate-300">루징:</span>
                  <span className="text-xl text-red-400 font-semibold">₩{summary.partnerCasinoLosingPayments.toLocaleString()}</span>
                </div>
              </div>
              <div className="p-3 bg-slate-900/40 rounded">
                <div className="text-base text-slate-400 mb-1">🎲 슬롯</div>
                <div className="flex justify-between">
                  <span className="text-lg text-slate-300">롤링:</span>
                  <span className="text-xl text-red-400 font-semibold">₩{summary.partnerSlotRollingPayments.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lg text-slate-300">루징:</span>
                  <span className="text-xl text-red-400 font-semibold">₩{summary.partnerSlotLosingPayments.toLocaleString()}</span>
                </div>
              </div>
              <div className="p-3 bg-slate-900/40 rounded">
                <div className="text-base text-slate-400 mb-1">환전 수수료</div>
                <div className="text-2xl text-red-400 font-bold">
                  ₩{summary.partnerWithdrawalPayments.toLocaleString()}
                </div>
              </div>
              <div className="p-3 bg-red-500/20 rounded border border-red-500/40">
                <div className="flex justify-between items-center">
                  <span className="text-xl text-slate-200 font-semibold">총 지급</span>
                  <span className="text-3xl text-red-400 font-bold">₩{summary.partnerTotalPayments.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 베팅 상세 통계 - 레벨2가 아닐 때만 하단에 축소 버전 표시 */}
      {user.level !== 2 && (
        <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
          <h3 className="text-lg text-slate-300 mb-2 flex items-center gap-2">
            <Info className="h-5 w-5" />
            베팅 상세 통계
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-base text-slate-400">🎰 카지노</div>
              <div className="flex justify-between text-base">
                <span className="text-slate-500">베팅:</span>
                <span className="text-slate-300">₩{detailedStats.casinoBetAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="text-slate-500">승리:</span>
                <span className="text-emerald-400">₩{detailedStats.casinoWinAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="text-slate-500">손실:</span>
                <span className="text-red-400">₩{detailedStats.casinoLossAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-base text-slate-400">🎲 슬롯</div>
              <div className="flex justify-between text-base">
                <span className="text-slate-500">베팅:</span>
                <span className="text-slate-300">₩{detailedStats.slotBetAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="text-slate-500">승리:</span>
                <span className="text-emerald-400">₩{detailedStats.slotWinAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="text-slate-500">손실:</span>
                <span className="text-red-400">₩{detailedStats.slotLossAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}