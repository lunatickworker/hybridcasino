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
  // ✅ 카지노/슬롯 구분 추가
  casino_rolling_commission: number;
  casino_losing_commission: number;
  slot_rolling_commission: number;
  slot_losing_commission: number;
  // 하위 호환성
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
  const [apiFilter, setApiFilter] = useState<string>("all");
  const [availableApis, setAvailableApis] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  useEffect(() => {
    loadAvailableApis();
    loadSettlements();
  }, [user.id, typeFilter, apiFilter, dateRange]);

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
    } catch (error) {
      console.error('활성화된 API 조회 실패:', error);
    }
  };

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

      // API 필터 적용 (클라이언트 측)
      let filteredData = data || [];
      if (apiFilter !== 'all') {
        filteredData = filteredData.filter((s: Settlement) => s.api_filter === apiFilter);
      }

      setSettlements(filteredData);
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
          <h1 className="text-4xl text-white mb-3">{t.settlement.historyTitle}</h1>
          <p className="text-xl text-slate-400">
            {t.settlement.historySubtitle}
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-lg px-6 py-3 h-auto"
        >
          <RefreshCw className={cn("h-6 w-6 mr-3", refreshing && "animate-spin")} />
          {t.common.refresh}
        </Button>
      </div>

      {/* 정산 이력 목록 - 필터 통합 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-6">
            <div>
              <CardDescription className="text-3xl text-slate-300">{t.settlement.completedSettlements}</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[240px] h-12 text-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-lg py-3">{t.settlement.all}</SelectItem>
                  <SelectItem value="partner_commission" className="text-lg py-3">{t.settlement.partnerCommission}</SelectItem>
                  <SelectItem value="integrated" className="text-lg py-3">{t.settlement.integratedType}</SelectItem>
                  <SelectItem value="rolling" className="text-lg py-3">{t.settlement.rollingType}</SelectItem>
                  <SelectItem value="losing" className="text-lg py-3">{t.settlement.losingType}</SelectItem>
                </SelectContent>
              </Select>

              {/* Lv1, Lv2만 API 필터 표시 */}
              {user.level <= 2 && (
                <Select value={apiFilter} onValueChange={setApiFilter}>
                  <SelectTrigger className="w-[240px] h-12 text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-lg py-3">{t.settlement.all}</SelectItem>
                    {availableApis.map(api => (
                      <SelectItem key={api} value={api} className="text-lg py-3">{api}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[360px] h-12 justify-start text-left text-lg">
                    <CalendarIcon className="mr-3 h-6 w-6" />
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
        <CardContent>
          {settlements.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <AlertCircle className="h-20 w-20 mx-auto mb-4 opacity-50" />
              <p className="text-xl">{t.settlement.noHistory}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-5 text-slate-400 text-base">{t.settlement.settlementDateTime}</th>
                    <th className="text-left p-5 text-slate-400 text-base">{t.settlement.settlementType}</th>
                    <th className="text-left p-5 text-slate-400 text-base">{t.settlement.settlementPeriod}</th>
                    <th className="text-left p-5 text-slate-400 text-base">{t.settlement.periodRange}</th>
                    <th className="text-left p-5 text-slate-400 text-base">{t.settlement.api}</th>
                    <th className="text-right p-5 text-blue-400 text-base">🎰 카지노 롤링</th>
                    <th className="text-right p-5 text-blue-400 text-base">🎰 카지노 루징</th>
                    <th className="text-right p-5 text-purple-400 text-base">🎮 슬롯 롤링</th>
                    <th className="text-right p-5 text-purple-400 text-base">🎮 슬롯 루징</th>
                    <th className="text-right p-5 text-green-400 text-base">💰 출금 수수료</th>
                    <th className="text-right p-5 text-slate-400 text-base">{t.settlement.totalAmount}</th>
                    <th className="text-left p-5 text-slate-400 text-base">{t.settlement.executor}</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((settlement) => {
                    // 총액 계산: 카지노 + 슬롯 + 출금 수수료
                    const totalAmount = Math.round(
                      (settlement.casino_rolling_commission || 0) +
                      (settlement.casino_losing_commission || 0) +
                      (settlement.slot_rolling_commission || 0) +
                      (settlement.slot_losing_commission || 0) +
                      (settlement.withdrawal_commission || 0)
                    );
                    
                    return (
                      <tr key={settlement.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="p-5 text-slate-300 text-lg whitespace-nowrap">
                          {format(new Date(settlement.processed_at || settlement.created_at), "yyyy-MM-dd HH:mm", { locale: ko })}
                        </td>
                        <td className="p-5">
                          <Badge className={cn(getSettlementTypeColor(settlement.settlement_type), "text-base px-4 py-2 whitespace-nowrap")}>
                            {getSettlementTypeText(settlement.settlement_type)}
                          </Badge>
                        </td>
                        <td className="p-5 text-slate-300 text-lg whitespace-nowrap">
                          {getPeriodText(settlement.settlement_period)}
                        </td>
                        <td className="p-5 text-slate-300 text-base whitespace-nowrap">
                          {format(new Date(settlement.period_start), "MM/dd", { locale: ko })} ~ {format(new Date(settlement.period_end), "MM/dd", { locale: ko })}
                        </td>
                        <td className="p-5">
                          <Badge variant="outline" className="text-base px-4 py-2 whitespace-nowrap">
                            {settlement.api_filter === 'all' ? t.settlement.all : settlement.api_filter}
                          </Badge>
                        </td>
                        <td className="p-5 text-right text-blue-400 text-lg whitespace-nowrap">
                          ₩{Math.round(settlement.casino_rolling_commission || 0).toLocaleString()}
                        </td>
                        <td className="p-5 text-right text-blue-400 text-lg whitespace-nowrap">
                          ₩{Math.round(settlement.casino_losing_commission || 0).toLocaleString()}
                        </td>
                        <td className="p-5 text-right text-purple-400 text-lg whitespace-nowrap">
                          ₩{Math.round(settlement.slot_rolling_commission || 0).toLocaleString()}
                        </td>
                        <td className="p-5 text-right text-purple-400 text-lg whitespace-nowrap">
                          ₩{Math.round(settlement.slot_losing_commission || 0).toLocaleString()}
                        </td>
                        <td className="p-5 text-right text-green-400 text-lg whitespace-nowrap">
                          ₩{Math.round(settlement.withdrawal_commission).toLocaleString()}
                        </td>
                        <td className="p-5 text-right whitespace-nowrap">
                          <span className="text-orange-400 font-mono text-xl">
                            ₩{totalAmount.toLocaleString()}
                          </span>
                        </td>
                        <td className="p-5 text-slate-300 text-lg whitespace-nowrap">
                          {settlement.executor_nickname || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}