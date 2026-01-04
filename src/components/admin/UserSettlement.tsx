import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Info, ChevronDown, ChevronRight } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
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
  // 요율
  casinoRollingRate: number;
  casinoLosingRate: number;
  slotRollingRate: number;
  slotLosingRate: number;
  // 베팅/당첨
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
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
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

        const totalBet = casinoBet + slotBet;
        const totalWin = casinoWin + slotWin;
        const totalWinLoss = totalBet - totalWin;

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
          casinoRollingRate: userItem.casino_rolling_rate || 0,
          casinoLosingRate: userItem.casino_losing_rate || 0,
          slotRollingRate: userItem.slot_rolling_rate || 0,
          slotLosingRate: userItem.slot_losing_rate || 0,
          totalBet,
          totalWin,
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
    <div className="min-h-screen" style={{ backgroundColor: '#f5f6fa', fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif', padding: '24px' }}>
      {/* 1. 상단 안내 영역 */}
      <div className="mb-5">
        <div className="flex items-start gap-3 p-4" style={{ backgroundColor: '#FFF8E1', border: '1px solid #FFE082' }}>
          <Info className="size-5 flex-shrink-0" style={{ color: '#F57C00', marginTop: '2px' }} />
          <div style={{ color: '#E65100', fontSize: '13px', lineHeight: '1.7' }}>
            <p>• 회원별 정산 내역은 하위 파트너들의 직속 회원들의 베팅 데이터를 기반으로 정산 내역을 표시합니다.</p>
            <p>• 회원은 개별 롤링만 표시되며, 하위 정산 내역은 없습니다.</p>
            <p>• 카지노/슬롯으로 분리하여 집계됩니다.</p>
          </div>
        </div>
      </div>

      {/* 2. 필터 및 검색 영역 */}
      <div className="p-5 mb-5" style={{ backgroundColor: '#E8EAF6' }}>
        <div className="flex flex-wrap items-center gap-3">
          {/* 날짜 필터 탭 */}
          <button
            onClick={() => {
              setDateFilterType('today');
              const today = new Date();
              setDateRange({ from: startOfDay(today), to: endOfDay(today) });
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: dateFilterType === 'today' ? '#3F51B5' : '#C5CAE9',
              color: dateFilterType === 'today' ? '#ffffff' : '#3F51B5',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            오늘
          </button>

          <button
            onClick={() => {
              setDateFilterType('yesterday');
              const yesterday = subDays(new Date(), 1);
              setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: dateFilterType === 'yesterday' ? '#3F51B5' : '#C5CAE9',
              color: dateFilterType === 'yesterday' ? '#ffffff' : '#3F51B5',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            어제
          </button>

          <button
            onClick={() => {
              setDateFilterType('week');
              const today = new Date();
              setDateRange({ from: startOfDay(subDays(today, 7)), to: endOfDay(today) });
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: dateFilterType === 'week' ? '#3F51B5' : '#C5CAE9',
              color: dateFilterType === 'week' ? '#ffffff' : '#3F51B5',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            일주일
          </button>

          <button
            onClick={() => {
              setDateFilterType('month');
              const today = new Date();
              setDateRange({ from: startOfDay(subDays(today, 30)), to: endOfDay(today) });
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: dateFilterType === 'month' ? '#3F51B5' : '#C5CAE9',
              color: dateFilterType === 'month' ? '#ffffff' : '#3F51B5',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            한달
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                onClick={() => setDateFilterType('custom')}
                className="flex items-center gap-2"
                style={{
                  padding: '10px 20px',
                  backgroundColor: dateFilterType === 'custom' ? '#3F51B5' : '#C5CAE9',
                  color: dateFilterType === 'custom' ? '#ffffff' : '#3F51B5',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <CalendarIcon className="size-4" />
                기간 검색
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  setDateFilterType('custom');
                }}
                numberOfMonths={2}
                locale={ko}
              />
            </PopoverContent>
          </Popover>

          <div style={{ width: '1px', height: '32px', backgroundColor: '#9FA8DA' }} />

          {/* 코드 검색 */}
          <input
            type="text"
            placeholder="회원 ID 검색..."
            value={codeSearch}
            onChange={(e) => setCodeSearch(e.target.value)}
            className="px-4 py-2"
            style={{
              backgroundColor: '#ffffff',
              color: '#1A237E',
              fontSize: '13px',
              fontWeight: 500,
              border: '1.5px solid #9FA8DA',
              width: '200px',
              outline: 'none'
            }}
          />

          {/* 새로고침 */}
          <button
            onClick={fetchSettlementData}
            disabled={loading}
            className="flex items-center gap-2 ml-auto"
            style={{
              padding: '10px 20px',
              backgroundColor: '#5C6BC0',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            새로고침
          </button>
        </div>

        {/* 선택된 기간 표시 */}
        {dateRange?.from && dateRange?.to && (
          <div style={{ marginTop: '12px', fontSize: '13px', color: '#3F51B5', fontWeight: 500 }}>
            선택된 기간: {format(dateRange.from, "yyyy년 MM월 dd일", { locale: ko })} - {format(dateRange.to, "yyyy년 MM월 dd일", { locale: ko })}
          </div>
        )}
      </div>

      {/* 3. 데이터 테이블 영역 */}
      <div className="overflow-hidden bg-white shadow-sm mb-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="overflow-x-auto" style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#9FA8DA #E8EAF6'
          }}>
            <style dangerouslySetInnerHTML={{
              __html: `
                .overflow-x-auto::-webkit-scrollbar {
                  height: 8px;
                }
                .overflow-x-auto::-webkit-scrollbar-track {
                  background: #E8EAF6;
                }
                .overflow-x-auto::-webkit-scrollbar-thumb {
                  background: #9FA8DA;
                  border-radius: 4px;
                }
                .overflow-x-auto::-webkit-scrollbar-thumb:hover {
                  background: #7986CB;
                }
              `
            }} />
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: '1800px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                  <th className="p-3 text-center sticky left-0 z-10" style={{ backgroundColor: '#FAFAFA', color: '#212121', fontSize: '13px', fontWeight: 700, width: '80px', whiteSpace: 'nowrap' }}>등급</th>
                  <th className="p-3 text-left sticky left-[80px] z-10" style={{ backgroundColor: '#FAFAFA', color: '#212121', fontSize: '13px', fontWeight: 700, width: '120px' }}>아이디</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FAFAFA', color: '#212121', fontSize: '13px', fontWeight: 700 }}>보유머니</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FAFAFA', color: '#212121', fontSize: '13px', fontWeight: 700 }}>롤링포인트</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FFF9E6', color: '#F57F17', fontSize: '13px', fontWeight: 700 }}>입금</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FFF9E6', color: '#F57F17', fontSize: '13px', fontWeight: 700 }}>출금</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FFF9E6', color: '#F57F17', fontSize: '13px', fontWeight: 700 }}>관리자입금</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FFF9E6', color: '#F57F17', fontSize: '13px', fontWeight: 700 }}>관리자출금</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '13px', fontWeight: 700 }}>포인트지급</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '13px', fontWeight: 700 }}>포인트회수</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>입출차액</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FAFAFA', color: '#212121', fontSize: '13px', fontWeight: 700 }}>카지노롤링</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FAFAFA', color: '#212121', fontSize: '13px', fontWeight: 700 }}>카지노루징</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FAFAFA', color: '#212121', fontSize: '13px', fontWeight: 700 }}>슬롯롤링</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#FAFAFA', color: '#212121', fontSize: '13px', fontWeight: 700 }}>슬롯루징</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '13px', fontWeight: 700 }}>총베팅</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '13px', fontWeight: 700 }}>총당첨</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>윈로스</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>GGR</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '13px', fontWeight: 700 }}>카지노개별롤링</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '13px', fontWeight: 700 }}>슬롯개별롤링</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>총롤링금</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>총루징</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>롤링금</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>낙첨금</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, idx) => {
                  const bgColor = '#ffffff'; // 회원은 흰색
                  return (
                    <tr 
                      key={row.id} 
                      style={{
                        backgroundColor: bgColor,
                        borderBottom: '1px solid #E0E0E0'
                      }}
                    >
                      <td className="p-3 sticky left-0 z-10" style={{ backgroundColor: bgColor, color: '#212121', fontSize: '13px', fontWeight: 600, width: '80px', whiteSpace: 'nowrap' }}>
                        회원
                      </td>
                      <td className="p-3 sticky left-[80px] z-10" style={{ backgroundColor: bgColor, color: '#212121', fontSize: '13px', fontWeight: 500, width: '120px' }}>{row.username}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.balance)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.points)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.deposit)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.withdrawal)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.adminDeposit)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.adminWithdrawal)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.pointGiven)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.pointRecovered)}</td>
                      <td className="p-3 text-right" style={{ color: row.depositWithdrawalDiff < 0 ? '#D32F2F' : '#424242', fontSize: '13px', fontWeight: 600 }}>{formatNumber(row.depositWithdrawalDiff)}</td>
                      <td className="p-3 text-center" style={{ color: '#424242', fontSize: '12px' }}>{row.casinoRollingRate}%</td>
                      <td className="p-3 text-center" style={{ color: '#424242', fontSize: '12px' }}>{row.casinoLosingRate}%</td>
                      <td className="p-3 text-center" style={{ color: '#424242', fontSize: '12px' }}>{row.slotRollingRate}%</td>
                      <td className="p-3 text-center" style={{ color: '#424242', fontSize: '12px' }}>{row.slotLosingRate}%</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.totalBet)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.totalWin)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.totalWinLoss)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px', fontWeight: 600 }}>{formatNumber(row.ggr)}</td>
                      <td className="p-3 text-right" style={{ color: '#9E9E9E', fontSize: '13px' }}>-</td>
                      <td className="p-3 text-right" style={{ color: '#9E9E9E', fontSize: '13px' }}>-</td>
                      <td className="p-3 text-right" style={{ color: '#9E9E9E', fontSize: '13px' }}>-</td>
                      <td className="p-3 text-right" style={{ color: '#9E9E9E', fontSize: '13px' }}>-</td>
                      <td className="p-3 text-right" style={{ color: '#9E9E9E', fontSize: '13px' }}>-</td>
                      <td className="p-3 text-right" style={{ color: '#9E9E9E', fontSize: '13px' }}>-</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. 계산 방식 설명 */}
      <div className="bg-white p-4">
        <div className="flex items-start gap-12">
          {/* 좌측: 기본 수식 */}
          <div className="flex-shrink-0" style={{ width: '300px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#212121', marginBottom: '12px' }}>계산 방식</h3>
            <div className="space-y-2">
              <div className="grid grid-cols-[70px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>윈로스</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  총베팅 - 총당첨
                </div>
              </div>
              <div className="grid grid-cols-[70px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>GGR</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  총 윈로스
                </div>
              </div>
              <div className="grid grid-cols-[70px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>입출차액</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  입금 - 출금 + 관리자입금 - 관리자출금
                </div>
              </div>
            </div>
          </div>

          {/* 우측: 회원 정산 특이사항 */}
          <div className="flex-1">
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#212121', marginBottom: '12px' }}>회원 정산 특이사항</h4>
            <div className="space-y-2">
              <div className="grid grid-cols-[80px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>정산 내역</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  회원은 하위가 없으므로 정산 관련 컬럼은 비어있습니다 (-)
                </div>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>개별 롤링</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  회원은 개별 롤링만 표시되며, 요율은 0%입니다
                </div>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>분리 집계</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  카지노/슬롯으로 분리하여 집계됩니다
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
