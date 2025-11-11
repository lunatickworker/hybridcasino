import { useState, useEffect } from "react";
import { History, RefreshCw, FileText, AlertCircle, Calendar as CalendarIcon } from "lucide-react";
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
import { useLanguage } from "../../contexts/LanguageContext";

interface SettlementHistoryProps {
  user: Partner;
}

interface Settlement {
  id: string;
  partner_id: string;
  partner_nickname: string;
  settlement_type: string;
  settlement_period: string;
  api_filter: string;
  period_start: string;
  period_end: string;
  total_bet_amount: number;
  total_win_amount: number;
  total_withdrawal_amount: number;
  rolling_commission: number;
  losing_commission: number;
  withdrawal_commission: number;
  commission_amount: number;
  my_total_income: number;
  partner_total_payments: number;
  net_profit: number;
  status: string;
  processed_at: string;
  created_at: string;
  executed_by: string;
  executor_nickname: string;
}

export function SettlementHistory({ user }: SettlementHistoryProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  useEffect(() => {
    loadSettlements();
  }, [user.id, typeFilter, dateRange]);

  const loadSettlements = async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }

      const startDate = dateRange?.from ? dateRange.from.toISOString() : null;
      const endDate = dateRange?.to ? dateRange.to.toISOString() : null;
      const settlementType = typeFilter === "all" ? null : typeFilter;

      const { data, error } = await supabase.rpc('get_settlement_history', {
        p_partner_id: user.id,
        p_start_date: startDate,
        p_end_date: endDate,
        p_settlement_type: settlementType
      });

      if (error) {
        console.error('정산 이력 조회 실패:', error);
        toast.error(t.settlement.historyLoadFailed);
        return;
      }

      setSettlements(data || []);
    } catch (error) {
      console.error('정산 이력 조회 실패:', error);
      toast.error(t.settlement.historyLoadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSettlements();
  };

  const getSettlementTypeText = (type: string) => {
    switch (type) {
      case 'partner_commission': return t.settlement.partnerCommission;
      case 'integrated': return t.settlement.integratedType;
      case 'rolling': return t.settlement.rollingType;
      case 'losing': return t.settlement.losingType;
      default: return type;
    }
  };

  const getSettlementTypeColor = (type: string) => {
    switch (type) {
      case 'partner_commission': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'integrated': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'rolling': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'losing': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getPeriodText = (period: string) => {
    switch (period) {
      case 'today': return t.settlement.today;
      case 'yesterday': return t.settlement.yesterday;
      case 'week': return t.settlement.lastWeek;
      case 'month': return t.settlement.thisMonth;
      case 'custom': return t.settlement.customPeriod;
      default: return period;
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
          <h1 className="text-2xl text-white mb-2">{t.settlement.historyTitle}</h1>
          <p className="text-slate-400">
            {t.settlement.historySubtitle}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          {t.common.refresh}
        </Button>
      </div>

      {/* 필터 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t.settlement.filter}</CardTitle>
            <div className="flex items-center gap-3">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.settlement.all}</SelectItem>
                  <SelectItem value="partner_commission">{t.settlement.partnerCommission}</SelectItem>
                  <SelectItem value="integrated">{t.settlement.integratedType}</SelectItem>
                  <SelectItem value="rolling">{t.settlement.rollingType}</SelectItem>
                  <SelectItem value="losing">{t.settlement.losingType}</SelectItem>
                </SelectContent>
              </Select>

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
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 정산 이력 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settlement.historyCount.replace('{count}', settlements.length.toString())}</CardTitle>
          <CardDescription>{t.settlement.completedSettlements}</CardDescription>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t.settlement.noHistory}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-3 text-slate-400">{t.settlement.settlementDateTime}</th>
                    <th className="text-left p-3 text-slate-400">{t.settlement.settlementType}</th>
                    <th className="text-left p-3 text-slate-400">{t.settlement.settlementPeriod}</th>
                    <th className="text-left p-3 text-slate-400">{t.settlement.periodRange}</th>
                    <th className="text-left p-3 text-slate-400">{t.settlement.api}</th>
                    <th className="text-right p-3 text-slate-400">{t.settlement.rolling}</th>
                    <th className="text-right p-3 text-slate-400">{t.settlement.losing}</th>
                    <th className="text-right p-3 text-slate-400">{t.settlement.withdrawal}</th>
                    <th className="text-right p-3 text-slate-400">{t.settlement.totalAmount}</th>
                    <th className="text-left p-3 text-slate-400">{t.settlement.executor}</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((settlement) => (
                    <tr key={settlement.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="p-3 text-slate-300">
                        {format(new Date(settlement.processed_at || settlement.created_at), "yyyy-MM-dd HH:mm", { locale: ko })}
                      </td>
                      <td className="p-3">
                        <Badge className={getSettlementTypeColor(settlement.settlement_type)}>
                          {getSettlementTypeText(settlement.settlement_type)}
                        </Badge>
                      </td>
                      <td className="p-3 text-slate-300">
                        {getPeriodText(settlement.settlement_period)}
                      </td>
                      <td className="p-3 text-slate-300 text-xs">
                        {format(new Date(settlement.period_start), "MM/dd", { locale: ko })} ~ {format(new Date(settlement.period_end), "MM/dd", { locale: ko })}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">
                          {settlement.api_filter === 'all' ? t.settlement.all : settlement.api_filter}
                        </Badge>
                      </td>
                      <td className="p-3 text-right text-blue-400">
                        ₩{settlement.rolling_commission.toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-purple-400">
                        ₩{settlement.losing_commission.toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-green-400">
                        ₩{settlement.withdrawal_commission.toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        {settlement.settlement_type === 'integrated' ? (
                          <div>
                            <p className="text-orange-400 font-mono">₩{settlement.net_profit.toLocaleString()}</p>
                            <p className="text-xs text-slate-500">{t.settlement.netProfitLabel}</p>
                          </div>
                        ) : (
                          <p className="text-orange-400 font-mono">₩{settlement.commission_amount.toLocaleString()}</p>
                        )}
                      </td>
                      <td className="p-3 text-slate-300 text-sm">
                        {settlement.executor_nickname || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
