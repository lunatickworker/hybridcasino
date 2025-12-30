import { useState, useEffect } from "react";
import { History, RefreshCw, FileText, AlertCircle, Calendar as CalendarIcon, CheckCircle2, ArrowRightLeft, TrendingUp, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from "./AdminDialog";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { useLanguage } from "../../contexts/LanguageContext";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

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
  casino_rolling_commission: number;
  casino_losing_commission: number;
  slot_rolling_commission: number;
  slot_losing_commission: number;
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
  commission_conversions?: Record<string, { converted: boolean; converted_at?: string; amount?: number }>;
}

interface ConversionHistory {
  id: string;
  created_at: string;
  type: string;
  amount: number;
  balance_after: number;
  memo: string;
}

export function SettlementHistory({ user }: SettlementHistoryProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [conversionHistory, setConversionHistory] = useState<ConversionHistory[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [apiFilter, setApiFilter] = useState<string>("all");
  const [availableApis, setAvailableApis] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<{
    settlementId: string;
    type: 'casino_rolling' | 'casino_losing' | 'slot_rolling' | 'slot_losing';
    amount: number;
  } | null>(null);

  useEffect(() => {
    loadAvailableApis();
    loadSettlements();
    loadConversionHistory();
  }, [user.id, typeFilter, apiFilter, dateRange]);

  const loadAvailableApis = async () => {
    try {
      const { data, error } = await supabase
        .from('api_configs')
        .select('api_provider, is_active')
        .eq('partner_id', user.level === 1 ? user.id : user.parent_id)
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

      // settlements 테이블을 직접 조회 (카지노/슬롯 컬럼 포함)
      let query = supabase
        .from('settlements')
        .select('*')
        .eq('partner_id', user.id)
        .order('created_at', { ascending: false });

      // 날짜 필터
      if (dateRange?.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        query = query.lte('created_at', dateRange.to.toISOString());
      }

      // 정산 타입 필터
      if (typeFilter !== 'all') {
        query = query.eq('settlement_type', typeFilter);
      }

      // API 필터
      if (apiFilter !== 'all') {
        query = query.eq('api_filter', apiFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('정산 이력 조회 실패:', error);
        toast.error(t.settlement.historyLoadFailed);
        return;
      }

      // partner_id와 executed_by에서 파트너 정보 별도 조회
      const partnerIds = [...new Set([
        ...(data || []).map(s => s.partner_id).filter(Boolean),
        ...(data || []).map(s => s.executed_by).filter(Boolean)
      ])];

      const { data: partnersData } = await supabase
        .from('partners')
        .select('id, nickname')
        .in('id', partnerIds);

      const partnersMap = new Map(partnersData?.map(p => [p.id, p]) || []);

      // 데이터 매핑
      const formattedData = (data || []).map(settlement => ({
        ...settlement,
        partner_nickname: settlement.partner_id ? partnersMap.get(settlement.partner_id)?.nickname || '-' : '-',
        executor_nickname: settlement.executed_by ? partnersMap.get(settlement.executed_by)?.nickname || '-' : '-'
      }));

      setSettlements(formattedData);
    } catch (error) {
      console.error('정산 이력 조회 실패:', error);
      toast.error(t.settlement.historyLoadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadConversionHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('partner_id', user.id)
        .eq('transaction_type', 'commission_conversion')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setConversionHistory(data || []);
    } catch (error) {
      console.error('전환 내역 조회 실패:', error);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSettlements();
    loadConversionHistory();
  };

  const getSettlementTypeText = (type: string) => {
    switch (type) {
      case 'partner_commission': return '통합 정산';
      case 'integrated': return '통합 정산';
      case 'rolling': return '롤링';
      case 'losing': return '루징';
      default: return type;
    }
  };

  const getSettlementTypeColor = (type: string) => {
    switch (type) {
      case 'partner_commission': return 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border-purple-500/30';
      case 'integrated': return 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border-purple-500/30';
      case 'rolling': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'losing': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getPeriodText = (period: string) => {
    switch (period) {
      case 'today': return '오늘';
      case 'yesterday': return '어제';
      case 'week': return '최근 7일';
      case 'month': return '이번 달';
      case 'custom': return '사용자 지정';
      default: return period;
    }
  };

  const handleCommissionClick = (
    settlement: Settlement,
    type: 'casino_rolling' | 'casino_losing' | 'slot_rolling' | 'slot_losing', 
    amount: number
  ) => {
    const isConverted = settlement.commission_conversions?.[type]?.converted;
    
    if (isConverted) {
      toast.info('이미 보유금으로 전환된 커미션입니다.');
      return;
    }
    
    if (amount <= 0) {
      toast.error('전환할 커미션이 없습니다.');
      return;
    }
    
    setSelectedCommission({ settlementId: settlement.id, type, amount });
    setShowConvertDialog(true);
  };

  const handleConvertToBalance = async () => {
    if (!selectedCommission) return;

    try {
      setConvertingId(selectedCommission.settlementId);
      setShowConvertDialog(false);

      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('balance')
        .eq('id', user.id)
        .single();

      if (partnerError) throw partnerError;

      const newBalance = (partnerData.balance || 0) + selectedCommission.amount;

      const { error: updateError } = await supabase
        .from('partners')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) throw updateError;

      const commissionTypeText = {
        casino_rolling: '카지노 롤링 커미션',
        casino_losing: '카지노 루징 커미션',
        slot_rolling: '슬롯 롤링 커미션',
        slot_losing: '슬롯 루징 커미션'
      }[selectedCommission.type];

      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          partner_id: user.id,
          transaction_type: 'commission_conversion',
          amount: selectedCommission.amount,
          balance_after: newBalance,
          status: 'completed',
          memo: `${commissionTypeText} → 보유금 전환`,
          created_at: new Date().toISOString()
        });

      if (transactionError) {
        console.warn('트랜잭션 기록 생성 실패:', transactionError);
      }

      await supabase
        .from('settlements')
        .update({ 
          commission_conversions: {
            ...settlements.find(s => s.id === selectedCommission.settlementId)?.commission_conversions,
            [selectedCommission.type]: { 
              converted: true, 
              converted_at: new Date().toISOString(), 
              amount: selectedCommission.amount 
            }
          }
        })
        .eq('id', selectedCommission.settlementId);

      toast.success(`₩${selectedCommission.amount.toLocaleString()}이(가) 보유금으로 전환되었습니다!`);
      
      loadSettlements();
      loadConversionHistory();
      setSelectedCommission(null);
    } catch (error: any) {
      console.error('보유금 전환 실패:', error);
      toast.error(error.message || '보유금 전환에 실패했습니다.');
    } finally {
      setConvertingId(null);
    }
  };

  // 날짜 프리셋 함수들
  const setDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'all') => {
    const now = new Date();
    switch (preset) {
      case 'today':
        setDateRange({ from: startOfDay(now), to: endOfDay(now) });
        break;
      case 'yesterday':
        const yesterday = subDays(now, 1);
        setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
        break;
      case 'week':
        setDateRange({ from: startOfDay(subDays(now, 7)), to: endOfDay(now) });
        break;
      case 'month':
        setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case 'all':
        setDateRange(undefined);
        break;
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
          <h1 className="text-4xl text-white mb-3 flex items-center gap-3">
            <History className="h-10 w-10 text-gradient bg-gradient-to-r from-purple-400 to-pink-400" />
            정산 이력
          </h1>
          <p className="text-xl text-slate-400">
            커미션 정산 내역 및 보유금 전환 관리
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-lg px-6 py-3 h-auto hover:bg-purple-500/10 hover:border-purple-500/50"
        >
          <RefreshCw className={cn("h-6 w-6 mr-3", refreshing && "animate-spin")} />
          새로고침
        </Button>
      </div>

      {/* 정산 이력 카드 */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader className="border-b border-slate-800 pb-4">
          {/* 필터 영역 - 한 줄로 배치 */}
          <div className="flex items-center gap-3">
            {/* API 제공사 드롭다운 (Lv1, Lv2만) */}
            {user.level <= 2 && availableApis.length > 0 && (
              <div className="w-40">
                <Select value={apiFilter} onValueChange={setApiFilter}>
                  <SelectTrigger className="h-12 text-base rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-purple-500/50 transition-colors">
                    <SelectValue placeholder="API 제공사" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 API</SelectItem>
                    {availableApis.map(api => (
                      <SelectItem key={api} value={api}>{api}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 기간 선택 프리셋 버튼들 */}
            <div className="flex gap-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('today')}
                className="h-12 px-5 rounded-none border-r-0 text-base hover:bg-purple-500/10 hover:border-purple-500/50 hover:z-10"
              >
                오늘
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('yesterday')}
                className="h-12 px-5 rounded-none border-r-0 text-base hover:bg-purple-500/10 hover:border-purple-500/50 hover:z-10"
              >
                어제
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('week')}
                className="h-12 px-5 rounded-none border-r-0 text-base hover:bg-purple-500/10 hover:border-purple-500/50 hover:z-10"
              >
                최근 7일
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('month')}
                className="h-12 px-5 rounded-none border-r-0 text-base hover:bg-purple-500/10 hover:border-purple-500/50 hover:z-10"
              >
                이번 달
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('all')}
                className="h-12 px-5 rounded-none text-base hover:bg-purple-500/10 hover:border-purple-500/50 hover:z-10"
              >
                전체
              </Button>
            </div>

            {/* 커스텀 캘린더 */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className={cn(
                    "h-12 px-5 text-base justify-start text-left min-w-[280px] rounded-none",
                    "hover:bg-purple-500/10 hover:border-purple-500/50",
                    dateRange?.from && "border-purple-500/50 bg-purple-500/5"
                  )}
                >
                  <CalendarIcon className="mr-2 h-5 w-5" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "yyyy-MM-dd", { locale: ko })} ~ {format(dateRange.to, "yyyy-MM-dd", { locale: ko })}
                      </>
                    ) : (
                      format(dateRange.from, "yyyy-MM-dd", { locale: ko })
                    )
                  ) : (
                    <span className="text-slate-500">날짜 선택</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
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

            {/* 정산 유형 드롭다운 */}
            <div className="w-44">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-12 text-base rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-purple-500/50 transition-colors">
                  <SelectValue placeholder="정산 유형" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="partner_commission">통합 정산</SelectItem>
                  <SelectItem value="rolling">롤링</SelectItem>
                  <SelectItem value="losing">루징</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {settlements.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <AlertCircle className="h-20 w-20 mx-auto mb-4 opacity-30" />
              <p className="text-xl">정산 이력이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/30">
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-6 text-slate-400 font-medium">정산일시</th>
                    <th className="text-left p-6 text-slate-400 font-medium">정산 유형</th>
                    <th className="text-left p-6 text-slate-400 font-medium">정산 기간</th>
                    <th className="text-left p-6 text-slate-400 font-medium">기간</th>
                    <th className="text-left p-6 text-slate-400 font-medium">API</th>
                    <th className="text-right p-6 text-blue-400 font-medium">🎰 카지노 롤링</th>
                    <th className="text-right p-6 text-blue-400 font-medium">🎰 카지노 루징</th>
                    <th className="text-right p-6 text-purple-400 font-medium">🎮 슬롯 롤링</th>
                    <th className="text-right p-6 text-purple-400 font-medium">🎮 슬롯 루징</th>
                    <th className="text-right p-6 text-green-400 font-medium">💰 출금 수수료</th>
                    <th className="text-right p-6 text-slate-400 font-medium">총액</th>
                    <th className="text-left p-6 text-slate-400 font-medium">실행자</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((settlement) => {
                    const totalAmount = Math.round(
                      (settlement.casino_rolling_commission || 0) +
                      (settlement.casino_losing_commission || 0) +
                      (settlement.slot_rolling_commission || 0) +
                      (settlement.slot_losing_commission || 0) +
                      (settlement.withdrawal_commission || 0)
                    );
                    
                    const casinoRollingConverted = settlement.commission_conversions?.casino_rolling?.converted;
                    const casinoLosingConverted = settlement.commission_conversions?.casino_losing?.converted;
                    const slotRollingConverted = settlement.commission_conversions?.slot_rolling?.converted;
                    const slotLosingConverted = settlement.commission_conversions?.slot_losing?.converted;
                    
                    return (
                      <tr key={settlement.id} className="border-b border-slate-800 hover:bg-slate-800/20 transition-colors">
                        <td className="p-6 text-slate-300 whitespace-nowrap text-base">
                          {format(new Date(settlement.processed_at || settlement.created_at), "yyyy-MM-dd HH:mm", { locale: ko })}
                        </td>
                        <td className="p-6">
                          <Badge className={cn(getSettlementTypeColor(settlement.settlement_type), "px-4 py-2 whitespace-nowrap text-sm")}>
                            {getSettlementTypeText(settlement.settlement_type)}
                          </Badge>
                        </td>
                        <td className="p-6 text-slate-300 whitespace-nowrap text-base">
                          {getPeriodText(settlement.settlement_period)}
                        </td>
                        <td className="p-6 text-slate-300 whitespace-nowrap text-base">
                          {format(new Date(settlement.period_start), "MM/dd", { locale: ko })} ~ {format(new Date(settlement.period_end), "MM/dd", { locale: ko })}
                        </td>
                        <td className="p-6">
                          <Badge variant="outline" className="px-3 py-1.5 whitespace-nowrap text-sm">
                            {settlement.api_filter === 'all' ? '전체' : settlement.api_filter}
                          </Badge>
                        </td>
                        <td 
                          className={cn(
                            "p-6 text-right whitespace-nowrap transition-all duration-200 relative group",
                            casinoRollingConverted 
                              ? "text-slate-500 cursor-not-allowed" 
                              : "text-blue-400 cursor-pointer hover:text-blue-300 hover:bg-blue-500/10"
                          )}
                          onClick={() => handleCommissionClick(settlement, 'casino_rolling', Math.round(settlement.casino_rolling_commission || 0))}
                        >
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono text-lg font-semibold">₩{Math.round(settlement.casino_rolling_commission || 0).toLocaleString()}</span>
                            {casinoRollingConverted && <CheckCircle2 className="h-5 w-5 text-green-400" />}
                          </div>
                        </td>
                        <td 
                          className={cn(
                            "p-6 text-right whitespace-nowrap transition-all duration-200",
                            casinoLosingConverted 
                              ? "text-slate-500 cursor-not-allowed" 
                              : "text-blue-400 cursor-pointer hover:text-blue-300 hover:bg-blue-500/10"
                          )}
                          onClick={() => handleCommissionClick(settlement, 'casino_losing', Math.round(settlement.casino_losing_commission || 0))}
                        >
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono text-lg font-semibold">₩{Math.round(settlement.casino_losing_commission || 0).toLocaleString()}</span>
                            {casinoLosingConverted && <CheckCircle2 className="h-5 w-5 text-green-400" />}
                          </div>
                        </td>
                        <td 
                          className={cn(
                            "p-6 text-right whitespace-nowrap transition-all duration-200",
                            slotRollingConverted 
                              ? "text-slate-500 cursor-not-allowed" 
                              : "text-purple-400 cursor-pointer hover:text-purple-300 hover:bg-purple-500/10"
                          )}
                          onClick={() => handleCommissionClick(settlement, 'slot_rolling', Math.round(settlement.slot_rolling_commission || 0))}
                        >
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono text-lg font-semibold">₩{Math.round(settlement.slot_rolling_commission || 0).toLocaleString()}</span>
                            {slotRollingConverted && <CheckCircle2 className="h-5 w-5 text-green-400" />}
                          </div>
                        </td>
                        <td 
                          className={cn(
                            "p-6 text-right whitespace-nowrap transition-all duration-200",
                            slotLosingConverted 
                              ? "text-slate-500 cursor-not-allowed" 
                              : "text-purple-400 cursor-pointer hover:text-purple-300 hover:bg-purple-500/10"
                          )}
                          onClick={() => handleCommissionClick(settlement, 'slot_losing', Math.round(settlement.slot_losing_commission || 0))}
                        >
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono text-lg font-semibold">₩{Math.round(settlement.slot_losing_commission || 0).toLocaleString()}</span>
                            {slotLosingConverted && <CheckCircle2 className="h-5 w-5 text-green-400" />}
                          </div>
                        </td>
                        <td className="p-6 text-right text-green-400 whitespace-nowrap font-mono text-lg font-semibold">
                          ₩{Math.round(settlement.withdrawal_commission).toLocaleString()}
                        </td>
                        <td className="p-6 text-right whitespace-nowrap">
                          <span className="text-orange-400 font-mono font-bold text-xl">
                            ₩{totalAmount.toLocaleString()}
                          </span>
                        </td>
                        <td className="p-6 text-slate-300 whitespace-nowrap text-base">
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

      {/* 보유금 전환 내역 카드 */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader className="border-b border-slate-800">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="h-7 w-7 text-gradient bg-gradient-to-r from-purple-400 to-pink-400" />
            <div>
              <CardTitle className="text-2xl text-white">보유금 전환 내역</CardTitle>
              <CardDescription className="text-slate-400 mt-1">
                커미션을 보유금으로 전환한 기록입니다
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {conversionHistory.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <TrendingUp className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">전환 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/30">
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-6 text-slate-400 font-medium">전환일시</th>
                    <th className="text-left p-6 text-slate-400 font-medium">커미션 종류</th>
                    <th className="text-right p-6 text-slate-400 font-medium">전환 금액</th>
                    <th className="text-right p-6 text-slate-400 font-medium">전환 후 잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {conversionHistory.map((item) => (
                    <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/20 transition-colors">
                      <td className="p-6 text-slate-300 whitespace-nowrap text-base">
                        <div className="flex items-center gap-2">
                          <Clock className="h-5 w-5 text-slate-500" />
                          {format(new Date(item.created_at), "yyyy-MM-dd HH:mm", { locale: ko })}
                        </div>
                      </td>
                      <td className="p-6 text-slate-300 text-base">
                        {item.memo}
                      </td>
                      <td className="p-6 text-right whitespace-nowrap">
                        <span className="text-gradient bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent font-mono font-bold text-lg">
                          +₩{item.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="p-6 text-right text-green-400 whitespace-nowrap font-mono font-semibold text-lg">
                        ₩{item.balance_after.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 보유금 전환 다이얼로그 */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <ArrowRightLeft className="h-5 w-5 text-white" />
              </div>
              보유금 전환
            </DialogTitle>
            <DialogDescription className="text-base pt-4">
              선택한 커미션을 보유금으로 전환하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          {selectedCommission && (
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-lg p-6 my-4 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-700">
                <span className="text-slate-400">커미션 종류</span>
                <span className="text-white font-semibold">
                  {selectedCommission.type === 'casino_rolling' && '🎰 카지노 롤링'}
                  {selectedCommission.type === 'casino_losing' && '🎰 카지노 루징'}
                  {selectedCommission.type === 'slot_rolling' && '🎮 슬롯 롤링'}
                  {selectedCommission.type === 'slot_losing' && '🎮 슬�� 루징'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">전환 금액</span>
                <span className="text-2xl font-bold text-gradient bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  ₩{selectedCommission.amount.toLocaleString()}
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConvertDialog(false)}
              className="text-base px-6 h-11"
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={handleConvertToBalance}
              disabled={convertingId !== null}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-base px-6 h-11"
            >
              {convertingId !== null ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  전환 중...
                </div>
              ) : (
                '전환하기'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}