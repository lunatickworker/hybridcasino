import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { format, startOfDay, endOfDay } from "date-fns";
import { ko } from "date-fns/locale";

interface UserSettlementProps {
  user: Partner;
}

interface UserSettlementRow {
  id: string;
  username: string;
  balance: number;
  points: number;
  deposit: number;
  withdrawal: number;
  adminDeposit: number;
  adminWithdrawal: number;
  pointGiven: number;
  pointRecovered: number;
  depositWithdrawalDiff: number;
  // 카지노
  casinoBet: number;
  casinoWin: number;
  casinoWinLoss: number;
  casinoRollingRate: number;
  casinoLosingRate: number;
  // 슬롯
  slotBet: number;
  slotWin: number;
  slotWinLoss: number;
  slotRollingRate: number;
  slotLosingRate: number;
  // 합계
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  ggr: number;
}

export default function UserSettlement({ user }: UserSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [codeSearch, setCodeSearch] = useState("");
  const [data, setData] = useState<UserSettlementRow[]>([]);

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      // 1. 본인의 하위 파트너 조회 (재귀적)
      const descendantPartnerIds = await getDescendantPartnerIds(user.id);
      const allPartnerIds = [user.id, ...descendantPartnerIds];

      // 2. 하위 파트너들의 회원만 조회
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('referrer_id', allPartnerIds)
        .order('username', { ascending: true });

      if (usersError) throw usersError;

      if (!users || users.length === 0) {
        setData([]);
        return;
      }

      // 3. 각 회원별 정산 데이터 조회
      const rows: UserSettlementRow[] = [];

      for (const userItem of users) {
        // 입출금 데이터
        const { data: transactions } = await supabase
          .from('transactions')
          .select('*')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .eq('user_id', userItem.id);

        const deposit = transactions
          ?.filter(t => t.transaction_type === 'deposit' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const withdrawal = transactions
          ?.filter(t => t.transaction_type === 'withdrawal' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const adminDeposit = transactions
          ?.filter(t => t.transaction_type === 'admin_deposit' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const adminWithdrawal = transactions
          ?.filter(t => t.transaction_type === 'admin_withdrawal' && t.status === 'approved')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        // 포인트 데이터
        const { data: pointTransactions } = await supabase
          .from('point_transactions')
          .select('*')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .eq('user_id', userItem.id);

        const pointGiven = pointTransactions
          ?.filter(pt => pt.type === 'admin_give')
          .reduce((sum, pt) => sum + (pt.amount || 0), 0) || 0;

        const pointRecovered = pointTransactions
          ?.filter(pt => pt.type === 'admin_deduct')
          .reduce((sum, pt) => sum + (pt.amount || 0), 0) || 0;

        // 게임 데이터
        const { data: gameRecords } = await supabase
          .from('game_records')
          .select('*')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .eq('user_id', userItem.id);

        const casinoBet = gameRecords
          ?.filter(gr => gr.game_type === 'casino')
          .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

        const casinoWin = gameRecords
          ?.filter(gr => gr.game_type === 'casino')
          .reduce((sum, gr) => sum + (gr.win_amount || 0), 0) || 0;

        const slotBet = gameRecords
          ?.filter(gr => gr.game_type === 'slot')
          .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

        const slotWin = gameRecords
          ?.filter(gr => gr.game_type === 'slot')
          .reduce((sum, gr) => sum + (gr.win_amount || 0), 0) || 0;

        const casinoWinLoss = casinoBet - casinoWin;
        const slotWinLoss = slotBet - slotWin;
        const totalWinLoss = casinoWinLoss + slotWinLoss;

        rows.push({
          id: userItem.id,
          username: userItem.username,
          balance: userItem.balance || 0,
          points: userItem.point || 0,
          deposit,
          withdrawal,
          adminDeposit,
          adminWithdrawal,
          pointGiven,
          pointRecovered,
          depositWithdrawalDiff: deposit - withdrawal + adminDeposit - adminWithdrawal,
          casinoBet,
          casinoWin,
          casinoWinLoss,
          casinoRollingRate: userItem.casino_rolling_rate || 0,
          casinoLosingRate: userItem.casino_losing_rate || 0,
          slotBet,
          slotWin,
          slotWinLoss,
          slotRollingRate: userItem.slot_rolling_rate || 0,
          slotLosingRate: userItem.slot_losing_rate || 0,
          totalBet: casinoBet + slotBet,
          totalWin: casinoWin + slotWin,
          totalWinLoss,
          ggr: totalWinLoss
        });
      }

      setData(rows);

    } catch (error) {
      console.error('정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getDescendantPartnerIds = async (partnerId: string): Promise<string[]> => {
    const { data: directChildren } = await supabase
      .from('partners')
      .select('id')
      .eq('parent_id', partnerId);

    if (!directChildren || directChildren.length === 0) {
      return [];
    }

    let allDescendants = directChildren.map(p => p.id);
    
    for (const child of directChildren) {
      const childDescendants = await getDescendantPartnerIds(child.id);
      allDescendants.push(...childDescendants);
    }
    
    return allDescendants;
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR').format(Math.round(num));
  };

  const filteredData = data.filter(row => {
    if (!codeSearch) return true;
    return row.username.toLowerCase().includes(codeSearch.toLowerCase());
  });

  return (
    <div className="space-y-6 p-6">
      {/* 1열: 제목 */}
      <div className="space-y-2">
        <h1 className="text-2xl">회원 정산 내역</h1>
      </div>

      {/* 2열: 필터 영역 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* 기간 검색 */}
            <div className="space-y-2">
              <label className="text-xs">기간 검색</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left", !dateRange && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 size-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "yyyy년 MM월 dd일", { locale: ko })} - {format(dateRange.to, "yyyy년 MM월 dd일", { locale: ko })}
                        </>
                      ) : (
                        format(dateRange.from, "yyyy년 MM월 dd일", { locale: ko })
                      )
                    ) : (
                      <span>날짜를 선택하세요</span>
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
            </div>

            {/* 코드 검색 */}
            <div className="space-y-2">
              <label className="text-xs">코드 검색</label>
              <Input
                placeholder="회원 ID 검색"
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value)}
                className="w-48"
              />
            </div>

            {/* 새로고침 */}
            <div className="space-y-2">
              <label className="text-xs">&nbsp;</label>
              <Button onClick={fetchSettlementData} disabled={loading}>
                <RefreshCw className={cn("size-4 mr-2", loading && "animate-spin")} />
                새로고침
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3열: 데이터 테이블 */}
      <Card>
        <CardContent className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left" rowSpan={2}>등급</th>
                    <th className="p-2 text-left" rowSpan={2}>아이디</th>
                    <th className="p-2 text-center" colSpan={2}>보유머니 및 포인트</th>
                    <th className="p-2 text-right" rowSpan={2}>입금</th>
                    <th className="p-2 text-right" rowSpan={2}>출금</th>
                    <th className="p-2 text-right" rowSpan={2}>관리자<br/>입금</th>
                    <th className="p-2 text-right" rowSpan={2}>관리자<br/>출금</th>
                    <th className="p-2 text-right" rowSpan={2}>포인트<br/>지급</th>
                    <th className="p-2 text-right" rowSpan={2}>포인트<br/>회수</th>
                    <th className="p-2 text-right" rowSpan={2}>입출<br/>차액</th>
                    <th className="p-2 text-center" rowSpan={2}>구분</th>
                    <th className="p-2 text-center" colSpan={2}>요율</th>
                    <th className="p-2 text-right" rowSpan={2}>총베팅</th>
                    <th className="p-2 text-right" rowSpan={2}>총당첨</th>
                    <th className="p-2 text-right" rowSpan={2}>윈로스</th>
                    <th className="p-2 text-right" rowSpan={2}>GGR</th>
                    <th className="p-2 text-center" colSpan={5}>정산 내역</th>
                  </tr>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-center">보유<br/>머니</th>
                    <th className="p-2 text-center">롤링<br/>포인트</th>
                    <th className="p-2 text-center">롤링</th>
                    <th className="p-2 text-center">루징</th>
                    <th className="p-2 text-center">개별<br/>롤링</th>
                    <th className="p-2 text-center">총<br/>롤링금</th>
                    <th className="p-2 text-center">총<br/>루징</th>
                    <th className="p-2 text-center">롤링금</th>
                    <th className="p-2 text-center">낙첨금</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => {
                    return [
                      /* Casino Row */
                      <tr key={`${row.id}-casino`} className={cn(
                        "border-b",
                        idx % 2 === 0 ? "bg-background" : "bg-muted/30"
                      )}>
                        <td className="p-2" rowSpan={2}>회원</td>
                        <td className="p-2" rowSpan={2}>{row.username}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.balance)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.points)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.deposit)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.withdrawal)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.adminDeposit)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.adminWithdrawal)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.pointGiven)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.pointRecovered)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.depositWithdrawalDiff)}</td>
                        <td className="p-2 text-center">Casino</td>
                        <td className="p-2 text-center">{row.casinoRollingRate}</td>
                        <td className="p-2 text-center">{row.casinoLosingRate}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalBet)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalWin)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalWinLoss)}</td>
                        <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.ggr)}</td>
                        <td className="p-2 text-right" rowSpan={2}>0</td>
                        <td className="p-2 text-right" rowSpan={2}></td>
                        <td className="p-2 text-right" rowSpan={2}></td>
                        <td className="p-2 text-right" rowSpan={2}></td>
                        <td className="p-2 text-right" rowSpan={2}></td>
                      </tr>,
                      /* Slot Row */
                      <tr key={`${row.id}-slot`} className={cn(
                        "border-b",
                        idx % 2 === 0 ? "bg-background" : "bg-muted/30"
                      )}>
                        <td className="p-2 text-center">Slot</td>
                        <td className="p-2 text-center">{row.slotRollingRate}</td>
                        <td className="p-2 text-center">{row.slotLosingRate}</td>
                      </tr>
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4열: 계산 방식 설명 */}
      <Card>
        <CardHeader>
          <CardTitle>계산 방식</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="font-medium mb-2">기본 계산</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 윈로스 = 총베팅 - 총당첨</li>
                <li>• GGR = 총 윈로스</li>
                <li>• 입출차액 = 입금 - 출금 + 관리자입금 - 관리자출금</li>
              </ul>
            </div>
            
            <div>
              <p className="font-medium mb-2">회원 정산</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 회원은 개별 롤링만 표시됩니다 (요율 0)</li>
                <li>• 하위 정산 내역은 비어있습니다</li>
                <li>• 카지노/슬롯 분리하여 집계됩니다</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
