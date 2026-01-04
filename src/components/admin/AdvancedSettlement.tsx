import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Info } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";
import { ko } from "date-fns/locale";

interface AdvancedSettlementProps {
  user: Partner;
}

interface DailySettlementRow {
  date: string;
  deposit: number;
  withdrawal: number;
  adminDeposit: number;
  adminWithdrawal: number;
  pointGiven: number;
  pointRecovered: number;
  depositWithdrawalDiff: number;
  casinoBet: number;
  casinoWin: number;
  casinoWinLoss: number;
  slotBet: number;
  slotWin: number;
  slotWinLoss: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  casinoRollingRate: number;
  casinoLosingRate: number;
  slotRollingRate: number;
  slotLosingRate: number;
  casinoRolling: number;
  slotRolling: number;
  totalRolling: number;
  casinoLosing: number;
  slotLosing: number;
  totalLosing: number;
  settlementProfit: number;
  actualSettlementProfit: number; // 실정산수익 추가
}

interface SummaryStats {
  totalDeposit: number;
  totalWithdrawal: number;
  adminTotalDeposit: number;
  adminTotalWithdrawal: number;
  pointGiven: number;
  pointRecovered: number;
  depositWithdrawalDiff: number;
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  totalRolling: number;
  totalSettlementProfit: number;
  totalActualSettlementProfit: number; // 실정산수익 추가
}

export default function AdvancedSettlement({ user }: AdvancedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [data, setData] = useState<DailySettlementRow[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({
    totalDeposit: 0,
    totalWithdrawal: 0,
    adminTotalDeposit: 0,
    adminTotalWithdrawal: 0,
    pointGiven: 0,
    pointRecovered: 0,
    depositWithdrawalDiff: 0,
    casinoBet: 0,
    casinoWin: 0,
    slotBet: 0,
    slotWin: 0,
    totalBet: 0,
    totalWin: 0,
    totalWinLoss: 0,
    totalRolling: 0,
    totalSettlementProfit: 0,
    totalActualSettlementProfit: 0 // 실정산수익 추가
  });

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      console.log('🔍 [일정산] 데이터 조회 시작', {
        dateRange: {
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString()
        },
        user: { id: user.id, username: user.username, level: user.level }
      });

      // 1. 본인의 하위 파트너 및 회원 ID 목록 조회
      let allowedPartnerIds: string[] = [user.id];
      let allowedUserIds: string[] = [];

      // 하위 파트너 조회 (재귀적으로 모든 하위)
      const descendantPartnerIds = await getDescendantPartnerIds(user.id);
      allowedPartnerIds.push(...descendantPartnerIds);
      console.log('✅ 허용된 파트너:', allowedPartnerIds.length, '개');

      // 모든 허용된 파트너들의 직속 회원 조회
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id')
        .in('referrer_id', allowedPartnerIds);

      if (usersError) throw usersError;
      allowedUserIds = users?.map(u => u.id) || [];
      console.log('✅ 허용된 회원:', allowedUserIds.length, '개');

      // ⚠️ 허용된 회원이 없으면 빈 배열 반환
      if (allowedUserIds.length === 0) {
        console.log('⚠️ 허용된 회원이 없어 정산 데이터가 없습니다.');
        setData([]);
        calculateSummary([]);
        setLoading(false);
        return;
      }

      // 2. 기간 내 거래 데이터 조회
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .in('user_id', allowedUserIds);

      if (transError) throw transError;
      console.log('✅ 거래 데이터:', transactions?.length || 0, '개');

      const { data: pointTransactions, error: pointError } = await supabase
        .from('point_transactions')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .in('user_id', allowedUserIds);

      if (pointError) throw pointError;
      console.log('✅ 포인트 거래:', pointTransactions?.length || 0, '개');

      const { data: gameRecords, error: gameError } = await supabase
        .from('game_records')
        .select('*')
        .gte('played_at', dateRange.from.toISOString())
        .lte('played_at', dateRange.to.toISOString())
        .in('user_id', allowedUserIds);

      if (gameError) throw gameError;
      console.log('✅ 게임 기록:', gameRecords?.length || 0, '개');

      // 3. 본인 커미션 정보 조회
      const myCommission = {
        casinoRolling: user.casino_rolling_commission || 0,
        casinoLosing: user.casino_losing_commission || 0,
        slotRolling: user.slot_rolling_commission || 0,
        slotLosing: user.slot_losing_commission || 0
      };

      // 4. 날짜별 데이터 집계
      const rows = await processDailySettlementData(
        dateRange.from,
        dateRange.to,
        transactions || [],
        pointTransactions || [],
        gameRecords || [],
        myCommission
      );
      
      console.log('✅ 일별 정산 데이터 처리 완료:', rows.length, '개');
      setData(rows);
      calculateSummary(rows);

    } catch (error) {
      console.error('❌ 정산 데이터 조회 실패:', error);
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

  const processDailySettlementData = async (
    fromDate: Date,
    toDate: Date,
    transactions: any[],
    pointTransactions: any[],
    gameRecords: any[],
    commission: any
  ): Promise<DailySettlementRow[]> => {
    const rows: DailySettlementRow[] = [];
    const days = eachDayOfInterval({ start: fromDate, end: toDate });

    for (const day of days) {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      // 해당 날짜의 거래만 필터링
      const dayTransactions = transactions.filter(t => {
        const tDate = new Date(t.created_at);
        return tDate >= dayStart && tDate <= dayEnd;
      });

      const dayPointTransactions = pointTransactions.filter(pt => {
        const ptDate = new Date(pt.created_at);
        return ptDate >= dayStart && ptDate <= dayEnd;
      });

      const dayGameRecords = gameRecords.filter(gr => {
        const grDate = new Date(gr.played_at);
        return grDate >= dayStart && grDate <= dayEnd;
      });

      // 입출금 계산
      const deposit = dayTransactions
        .filter(t => t.transaction_type === 'deposit' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const withdrawal = dayTransactions
        .filter(t => t.transaction_type === 'withdrawal' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const adminDeposit = dayTransactions
        .filter(t => t.transaction_type === 'admin_deposit' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const adminWithdrawal = dayTransactions
        .filter(t => t.transaction_type === 'admin_withdrawal' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      // 포인트 계산
      const pointGiven = dayPointTransactions
        .filter(pt => pt.type === 'admin_give')
        .reduce((sum, pt) => sum + (pt.amount || 0), 0);

      const pointRecovered = dayPointTransactions
        .filter(pt => pt.type === 'admin_deduct')
        .reduce((sum, pt) => sum + (pt.amount || 0), 0);

      // 베팅 데이터 계산
      const casinoBet = dayGameRecords
        .filter(gr => gr.game_type === 'casino')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);

      const casinoWin = dayGameRecords
        .filter(gr => gr.game_type === 'casino')
        .reduce((sum, gr) => sum + (gr.win_amount || 0), 0);

      const slotBet = dayGameRecords
        .filter(gr => gr.game_type === 'slot')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);

      const slotWin = dayGameRecords
        .filter(gr => gr.game_type === 'slot')
        .reduce((sum, gr) => sum + (gr.win_amount || 0), 0);

      const casinoWinLoss = casinoBet - casinoWin;
      const slotWinLoss = slotBet - slotWin;
      const totalBet = casinoBet + slotBet;
      const totalWin = casinoWin + slotWin;
      const totalWinLoss = totalBet - totalWin;

      // 롤링 계산
      const casinoRolling = casinoBet * (commission.casinoRolling / 100);
      const slotRolling = slotBet * (commission.slotRolling / 100);
      const totalRolling = casinoRolling + slotRolling;

      // 루징 계산
      const casinoLosable = Math.max(0, casinoWinLoss - casinoRolling);
      const slotLosable = Math.max(0, slotWinLoss - slotRolling);
      const casinoLosing = casinoLosable * (commission.casinoLosing / 100);
      const slotLosing = slotLosable * (commission.slotLosing / 100);
      const totalLosing = casinoLosing + slotLosing;

      rows.push({
        date: format(day, 'yyyy. M. d', { locale: ko }),
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
        slotBet,
        slotWin,
        slotWinLoss,
        totalBet,
        totalWin,
        totalWinLoss,
        casinoRollingRate: commission.casinoRolling,
        casinoLosingRate: commission.casinoLosing,
        slotRollingRate: commission.slotRolling,
        slotLosingRate: commission.slotLosing,
        casinoRolling,
        slotRolling,
        totalRolling,
        casinoLosing,
        slotLosing,
        totalLosing,
        settlementProfit: totalWinLoss - totalRolling, // 정산수익 = 윈로스 - 롤링금
        actualSettlementProfit: totalWinLoss - totalRolling - totalLosing // 실정산수익 = 윈로스 - 롤링금 - 루징금
      });
    }

    return rows;
  };

  const calculateSummary = (rows: DailySettlementRow[]) => {
    const summary: SummaryStats = {
      totalDeposit: rows.reduce((sum, r) => sum + r.deposit, 0),
      totalWithdrawal: rows.reduce((sum, r) => sum + r.withdrawal, 0),
      adminTotalDeposit: rows.reduce((sum, r) => sum + r.adminDeposit, 0),
      adminTotalWithdrawal: rows.reduce((sum, r) => sum + r.adminWithdrawal, 0),
      pointGiven: rows.reduce((sum, r) => sum + r.pointGiven, 0),
      pointRecovered: rows.reduce((sum, r) => sum + r.pointRecovered, 0),
      depositWithdrawalDiff: rows.reduce((sum, r) => sum + r.depositWithdrawalDiff, 0),
      casinoBet: rows.reduce((sum, r) => sum + r.casinoBet, 0),
      casinoWin: rows.reduce((sum, r) => sum + r.casinoWin, 0),
      slotBet: rows.reduce((sum, r) => sum + r.slotBet, 0),
      slotWin: rows.reduce((sum, r) => sum + r.slotWin, 0),
      totalBet: rows.reduce((sum, r) => sum + r.totalBet, 0),
      totalWin: rows.reduce((sum, r) => sum + r.totalWin, 0),
      totalWinLoss: rows.reduce((sum, r) => sum + r.totalWinLoss, 0),
      totalRolling: rows.reduce((sum, r) => sum + r.totalRolling, 0),
      totalSettlementProfit: rows.reduce((sum, r) => sum + r.settlementProfit, 0),
      totalActualSettlementProfit: rows.reduce((sum, r) => sum + r.actualSettlementProfit, 0) // 실정산수익 추가
    };

    setSummary(summary);
  };

  const setQuickDateRange = (type: 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    let from: Date;
    let to: Date;

    if (type === 'yesterday') {
      from = startOfDay(subDays(today, 1));
      to = endOfDay(subDays(today, 1));
    } else if (type === 'week') {
      from = startOfDay(subDays(today, 7));
      to = endOfDay(today);
    } else {
      from = startOfDay(subDays(today, 30));
      to = endOfDay(today);
    }

    setDateRange({ from, to });
    setDateFilterType(type);
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f6fa', fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif', padding: '24px' }}>
      {/* 1. 상단 안내 영역 */}
      <div className="mb-5">
        <div className="flex items-start gap-3 p-4" style={{ backgroundColor: '#FFF8E1', border: '1px solid #FFE082' }}>
          <Info className="size-5 flex-shrink-0" style={{ color: '#F57C00', marginTop: '2px' }} />
          <div style={{ color: '#E65100', fontSize: '13px', lineHeight: '1.7' }}>
            <p>• 관리자 일자별 정산 내역은 자신의 하위 회원들의 베팅을 기반으로 한 정산 데이터를 날짜별로 표기합니다.</p>
            <p>• 기간 검색으로 선택한 기간 내 일일 정산 데이터 값을 표기합니다.</p>
            <p>• 정산수익 = 윈로스 - 롤링금, 실정산수익 = 윈로스 - 롤링금 - 루징금</p>
          </div>
        </div>
      </div>

      {/* 2. 상단 정보 카드 - 2줄 가로 배치 */}
      <div className="mb-5 bg-white">
        {/* 첫 번째 줄 */}
        <div className="flex" style={{ borderBottom: '1px solid #e0e0e0' }}>
          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#FFF9E6', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600, marginBottom: '8px' }}>총입금</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.totalDeposit)}</p>
          </div>
          
          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#FFF9E6', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600, marginBottom: '8px' }}>총출금</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.totalWithdrawal)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#FFF9E6', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600, marginBottom: '8px' }}>관리자 총입금</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.adminTotalDeposit)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#FFF9E6', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600, marginBottom: '8px' }}>관리자 총출금</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.adminTotalWithdrawal)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E8F5E9', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#2E7D32', fontWeight: 600, marginBottom: '8px' }}>포인트지급</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.pointGiven)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E8F5E9', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#2E7D32', fontWeight: 600, marginBottom: '8px' }}>포인트회수</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.pointRecovered)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E3F2FD', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#1976D2', fontWeight: 600, marginBottom: '8px' }}>입출차액</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: summary.depositWithdrawalDiff < 0 ? '#D32F2F' : '#2E7D32', lineHeight: 1 }}>{formatNumber(summary.depositWithdrawalDiff)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E3F2FD' }}>
            <p style={{ fontSize: '12px', color: '#1976D2', fontWeight: 600, marginBottom: '8px' }}>총베팅</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.totalBet)}</p>
          </div>
        </div>

        {/* 두 번째 줄 */}
        <div className="flex">
          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E8F5E9', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#2E7D32', fontWeight: 600, marginBottom: '8px' }}>카지노 베팅</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.casinoBet)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E8F5E9', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#2E7D32', fontWeight: 600, marginBottom: '8px' }}>카지노 당첨</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.casinoWin)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E3F2FD', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#1976D2', fontWeight: 600, marginBottom: '8px' }}>슬롯 베팅</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.slotBet)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E3F2FD', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#1976D2', fontWeight: 600, marginBottom: '8px' }}>슬롯 당첨</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.slotWin)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E3F2FD', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#1976D2', fontWeight: 600, marginBottom: '8px' }}>총당첨</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.totalWin)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E3F2FD', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#1976D2', fontWeight: 600, marginBottom: '8px' }}>윈로스</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: summary.totalWinLoss < 0 ? '#D32F2F' : '#000000', lineHeight: 1 }}>{formatNumber(Math.abs(summary.totalWinLoss))}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E3F2FD', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#1976D2', fontWeight: 600, marginBottom: '8px' }}>총롤링금</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.totalRolling)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#E3F2FD' }}>
            <p style={{ fontSize: '12px', color: '#1976D2', fontWeight: 600, marginBottom: '8px' }}>정산수익</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#2E7D32', lineHeight: 1 }}>{formatNumber(summary.totalSettlementProfit)}</p>
          </div>
        </div>
      </div>

      {/* 3. 필터 및 검색 영역 */}
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

      {/* 4. 데이터 테이블 영역 */}
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
                  <th className="p-3 text-center" style={{ backgroundColor: '#FAFAFA', color: '#212121', fontSize: '13px', fontWeight: 700 }}>날짜</th>
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
                  <th className="p-3 text-center" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '13px', fontWeight: 700 }}>카지노베팅</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '13px', fontWeight: 700 }}>카지노당첨</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>슬롯베팅</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>슬롯당첨</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '13px', fontWeight: 700 }}>총베팅</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>총당첨</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>윈로스</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>총롤링금</th>
                  <th className="p-3 text-center" style={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontSize: '13px', fontWeight: 700 }}>정산수익</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-8 text-center" style={{ color: '#757575', fontSize: '14px' }}>
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  data.map((row, idx) => (
                    <tr 
                      key={row.date} 
                      style={{
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#F5F5F5',
                        borderBottom: '1px solid #E0E0E0'
                      }}
                    >
                      <td className="p-3 text-center" style={{ color: '#212121', fontSize: '13px', fontWeight: 600 }}>{row.date}</td>
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
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.casinoBet)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.casinoWin)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.slotBet)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.slotWin)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.totalBet)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.totalWin)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.totalWinLoss)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px', fontWeight: 600 }}>{formatNumber(row.totalRolling)}</td>
                      <td className="p-3 text-right" style={{ color: '#2E7D32', fontSize: '13px', fontWeight: 600 }}>{formatNumber(row.settlementProfit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. 계산 방식 설명 */}
      <div className="bg-white p-4">
        <div className="flex items-start gap-12">
          {/* 좌측: 기본 수식 */}
          <div className="flex-shrink-0" style={{ width: '300px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#212121', marginBottom: '12px' }}>계산 방식</h3>
            <div className="space-y-2">
              <div className="grid grid-cols-[70px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>롤링금</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  총베팅 × 롤링률
                </div>
              </div>
              <div className="grid grid-cols-[70px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>낙첨금</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  (윈로스 - 롤링금) × 루징률
                </div>
              </div>
              <div className="grid grid-cols-[70px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>정산수익</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  윈로스 - 롤링금
                </div>
              </div>
              <div className="grid grid-cols-[90px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>실정산수익</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  윈로스 - 롤링금 - 루징금
                </div>
              </div>
            </div>
          </div>

          {/* 우측: 일정산 특징 */}
          <div className="flex-1">
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#212121', marginBottom: '12px' }}>일정산 특징</h4>
            <div className="space-y-2">
              <div className="grid grid-cols-[100px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>데이터 범위</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  로그인한 사용자의 하위 회원들의 베팅 데이터만 집계
                </div>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>날짜별 집계</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  선택한 기간 내 일일 단위로 정산 데이터 표시
                </div>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>커미션 적용</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  로그인한 사용자의 롤링률/루징률 적용
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}