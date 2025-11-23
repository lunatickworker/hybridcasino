import { useState, useEffect } from "react";
import { Calculator, Download, RefreshCw, TrendingUp, Calendar as CalendarIcon, AlertCircle, Wallet, BadgeDollarSign, CheckCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
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
import { calculateChildPartnersCommission, PartnerCommissionInfo } from "../../lib/settlementCalculator";
import { executePartnerCommissionSettlement } from "../../lib/settlementExecutor";
import { useLanguage } from "../../contexts/LanguageContext";

interface CommissionSettlementProps {
  user: Partner;
}

export function CommissionSettlement({ user }: CommissionSettlementProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [settlementMethod, setSettlementMethod] = useState<'differential' | 'direct_subordinate'>('direct_subordinate');
  const [periodFilter, setPeriodFilter] = useState("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [apiFilter, setApiFilter] = useState<'all' | 'invest' | 'oroplay'>('all');
  const [commissions, setCommissions] = useState<PartnerCommissionInfo[]>([]);
  
  const [stats, setStats] = useState({
    totalRollingCommission: 0,
    totalLosingCommission: 0,
    totalWithdrawalCommission: 0,
    totalCommission: 0,
    partnerCount: 0
  });

  useEffect(() => {
    loadSettlementMethod();
    loadCommissions();
  }, [user.id, periodFilter, dateRange, apiFilter]);

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
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (periodFilter) {
      case "today":
        return {
          start: today.toISOString(),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
        };
      case "yesterday":
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return {
          start: yesterday.toISOString(),
          end: today.toISOString()
        };
      case "week":
        const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return {
          start: weekStart.toISOString(),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
        };
      case "month":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          start: monthStart.toISOString(),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
        };
      case "custom":
        if (dateRange?.from) {
          const start = new Date(dateRange.from);
          const end = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
          return {
            start: start.toISOString(),
            end: new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString()
          };
        }
        return {
          start: today.toISOString(),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
        };
      default:
        return {
          start: today.toISOString(),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
        };
    }
  };

  const loadCommissions = async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      const { start, end } = getDateRange();

      const commissionsData = await calculateChildPartnersCommission(user.id, start, end, apiFilter);

      if (commissionsData.length === 0) {
        setCommissions([]);
        setStats({
          totalRollingCommission: 0,
          totalLosingCommission: 0,
          totalWithdrawalCommission: 0,
          totalCommission: 0,
          partnerCount: 0
        });
        return;
      }

      setCommissions(commissionsData);

      const newStats = commissionsData.reduce((acc, comm) => ({
        totalRollingCommission: acc.totalRollingCommission + comm.rolling_commission,
        totalLosingCommission: acc.totalLosingCommission + comm.losing_commission,
        totalWithdrawalCommission: acc.totalWithdrawalCommission + comm.withdrawal_commission,
        totalCommission: acc.totalCommission + comm.total_commission,
        partnerCount: acc.partnerCount + 1
      }), {
        totalRollingCommission: 0,
        totalLosingCommission: 0,
        totalWithdrawalCommission: 0,
        totalCommission: 0,
        partnerCount: 0
      });

      setStats(newStats);
    } catch (error) {
      console.error('수수료 계산 실패:', error);
      toast.error(t.settlement.commissionLoadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadCommissions();
  };

  const handleExport = () => {
    toast.info(t.settlement.exportExcelPreparing);
  };

  const handleExecuteSettlement = async () => {
    if (stats.totalCommission <= 0) {
      toast.error(t.settlement.noCommissionToSettle);
      return;
    }

    if (commissions.length === 0) {
      toast.error(t.settlement.noPartnersToSettle);
      return;
    }

    const confirmMessage = t.settlement.confirmSettlement
      .replace('{count}', commissions.length.toString())
      .replace('{total}', stats.totalCommission.toLocaleString())
      .replace('{rolling}', stats.totalRollingCommission.toLocaleString())
      .replace('{losing}', stats.totalLosingCommission.toLocaleString())
      .replace('{withdrawal}', stats.totalWithdrawalCommission.toLocaleString());

    if (!window.confirm(confirmMessage)) return;

    setExecuting(true);
    try {
      const { start, end } = getDateRange();
      
      const result = await executePartnerCommissionSettlement(
        user.id,
        start,
        end,
        periodFilter,
        apiFilter
      );

      if (result.success) {
        toast.success(result.message);
        loadCommissions();
      } else {
        toast.error(result.message || t.settlement.integratedSettlementFailed);
      }
    } catch (error) {
      console.error('정산 실행 오류:', error);
      toast.error(t.settlement.integratedSettlementError);
    } finally {
      setExecuting(false);
    }
  };

  const getLevelText = (level: number) => {
    switch (level) {
      case 2: return t.settlement.masterAgency;
      case 3: return t.settlement.mainAgency;
      case 4: return t.settlement.subAgency;
      case 5: return t.settlement.distributor;
      case 6: return t.settlement.store;
      default: return t.settlement.unknown;
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
          <h1 className="text-2xl text-white mb-2">{t.settlement.commissionSettlementTitle}</h1>
          <p className="text-slate-400">
            {t.settlement.commissionSettlementSubtitle}
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
            variant="outline"
            size="sm"
            onClick={handleExport}
          >
            <Download className="h-4 w-4 mr-2" />
            {t.settlement.exportExcel}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleExecuteSettlement}
            disabled={executing || stats.totalCommission <= 0}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <CheckCircle className={cn("h-4 w-4 mr-2", executing && "animate-spin")} />
            {executing ? t.settlement.settling : t.settlement.executeSettlement}
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <MetricCard
          title={t.settlement.rollingCommission}
          value={`₩${stats.totalRollingCommission.toLocaleString()}`}
          subtitle={t.settlement.rollingCommissionSubtitle}
          icon={TrendingUp}
          color="blue"
        />
        <MetricCard
          title={t.settlement.losingCommission}
          value={`₩${stats.totalLosingCommission.toLocaleString()}`}
          subtitle={t.settlement.losingCommissionSubtitle}
          icon={BadgeDollarSign}
          color="purple"
        />
        <MetricCard
          title={t.settlement.withdrawalCommission}
          value={`₩${stats.totalWithdrawalCommission.toLocaleString()}`}
          subtitle={t.settlement.withdrawalCommissionSubtitle}
          icon={Wallet}
          color="emerald"
        />
        <MetricCard
          title={t.settlement.totalCommission}
          value={`₩${stats.totalCommission.toLocaleString()}`}
          subtitle={t.settlement.totalCommissionSubtitle}
          icon={Calculator}
          color="orange"
        />
      </div>

      {/* 수수료 테이블 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle>{t.settlement.partnerCommissionDetails}</CardTitle>
              <CardDescription>
                {t.settlement.partnerCommissionDetailsDesc.replace('{count}', stats.partnerCount.toString())}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {/* API 필터 */}
              <Select value={apiFilter} onValueChange={(value) => setApiFilter(value as 'all' | 'invest' | 'oroplay')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.settlement.allApi}</SelectItem>
                  <SelectItem value="invest">{t.settlement.investOnly}</SelectItem>
                  <SelectItem value="oroplay">{t.settlement.oroplaysOnly}</SelectItem>
                </SelectContent>
              </Select>

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
        <CardContent>
          {commissions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t.settlement.noSubPartners}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-3 text-slate-400">{t.settlement.partner}</th>
                    <th className="text-left p-3 text-slate-400">{t.settlement.grade}</th>
                    <th className="text-right p-3 text-slate-400">{t.settlement.betAmount}</th>
                    <th className="text-right p-3 text-slate-400">{t.settlement.rollingCommission}</th>
                    <th className="text-right p-3 text-slate-400">{t.settlement.losingCommission}</th>
                    <th className="text-right p-3 text-slate-400">{t.settlement.withdrawalCommission}</th>
                    <th className="text-right p-3 text-slate-400">{t.settlement.totalCommission}</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((comm) => (
                    <tr key={comm.partner_id} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="p-3">
                        <div>
                          <p className="text-white">{comm.partner_nickname}</p>
                          <p className="text-xs text-slate-400">{comm.partner_username}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{getLevelText(comm.partner_level)}</Badge>
                      </td>
                      <td className="p-3 text-right text-slate-300">
                        ₩{comm.total_bet_amount.toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        <div>
                          <p className="text-blue-400">₩{comm.rolling_commission.toLocaleString()}</p>
                          <p className="text-xs text-slate-500">{comm.commission_rolling}%</p>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div>
                          <p className="text-purple-400">₩{comm.losing_commission.toLocaleString()}</p>
                          <p className="text-xs text-slate-500">{comm.commission_losing}%</p>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div>
                          <p className="text-green-400">₩{comm.withdrawal_commission.toLocaleString()}</p>
                          <p className="text-xs text-slate-500">{comm.withdrawal_fee}%</p>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <p className="text-orange-400 font-mono">₩{comm.total_commission.toLocaleString()}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800/50 border-t-2 border-slate-600">
                    <td colSpan={3} className="p-3 text-white">{t.settlement.totalSum}</td>
                    <td className="p-3 text-right text-blue-400 font-mono">
                      ₩{stats.totalRollingCommission.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-purple-400 font-mono">
                      ₩{stats.totalLosingCommission.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-green-400 font-mono">
                      ₩{stats.totalWithdrawalCommission.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-orange-400 font-mono">
                      ₩{stats.totalCommission.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
