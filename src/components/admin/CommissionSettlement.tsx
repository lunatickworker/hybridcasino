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

interface CommissionSettlementProps {
  user: Partner;
}

interface PartnerSettlementRow {
  level: number;
  levelName: string;
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
  // 정산
  casinoIndividualRolling: number;
  slotIndividualRolling: number;
  totalRolling: number;
  totalLosing: number;
  totalIndividualRolling: number;
  totalIndividualLosing: number;
  // 확장 상태
  hasChildren?: boolean;
  depth?: number;
}

export function CommissionSettlement({ user }: CommissionSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [data, setData] = useState<PartnerSettlementRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

  const getRowBackgroundColor = (level: number): string => {
    switch (level) {
      case 2: return '#FFE0E0'; // 운영사(대본) - 연한 빨간색
      case 3: return '#E3F2FD'; // 본사 - 연한 파란색
      case 4: return '#E8F5E9'; // 부본사 - 연한 초록색
      case 5: return '#FFF9E6'; // 총판 - 연한 노란색
      case 6: return '#F3E5F5'; // 매장 - 연한 보라색
      default: return '#ffffff'; // 회원 - 흰색
    }
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 2: return "대본";
      case 3: return "본사";
      case 4: return "부본";
      case 5: return "총판";
      case 6: return "매장";
      default: return "";
    }
  };

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      // 본인의 하위 파트너 조회 (재귀적)
      const descendantPartnerIds = await getDescendantPartnerIds(user.id);
      const allPartnerIds = [user.id, ...descendantPartnerIds];

      // 파트너 정보 조회 (Lv2~Lv6만)
      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('*')
        .in('id', allPartnerIds)
        .gte('level', 2)
        .lte('level', 6)
        .order('level', { ascending: true })
        .order('username', { ascending: true });

      if (partnersError) throw partnersError;

      const rows: PartnerSettlementRow[] = [];

      for (const partner of partners || []) {
        // 하위 회원 ID 조회
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id')
          .eq('referrer_id', partner.id);

        if (usersError) throw usersError;
        const userIds = users?.map(u => u.id) || [];

        // 입출금 데이터
        const { data: transactions } = await supabase
          .from('transactions')
          .select('*')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .in('user_id', userIds);

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
          .in('user_id', userIds);

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
          .in('user_id', userIds);

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

        // 커미션 계산
        const casinoRollingRate = partner.casino_rolling_commission || 0;
        const casinoLosingRate = partner.casino_losing_commission || 0;
        const slotRollingRate = partner.slot_rolling_commission || 0;
        const slotLosingRate = partner.slot_losing_commission || 0;

        // 롤링 계산
        const casinoTotalRolling = casinoBet * (casinoRollingRate / 100);
        const slotTotalRolling = slotBet * (slotRollingRate / 100);

        // 하위 파트너의 롤링 합계
        const childrenRolling = await getChildrenRolling(partner.id, dateRange.from, dateRange.to);
        const casinoChildrenRolling = childrenRolling.casino;
        const slotChildrenRolling = childrenRolling.slot;

        const casinoIndividualRolling = Math.max(0, casinoTotalRolling - casinoChildrenRolling);
        const slotIndividualRolling = Math.max(0, slotTotalRolling - slotChildrenRolling);

        // 루징 계산
        const casinoWinLoss = casinoBet - casinoWin;
        const slotWinLoss = slotBet - slotWin;
        
        const casinoLosable = Math.max(0, casinoWinLoss - casinoTotalRolling);
        const slotLosable = Math.max(0, slotWinLoss - slotTotalRolling);
        
        const casinoTotalLosing = casinoLosable * (casinoLosingRate / 100);
        const slotTotalLosing = slotLosable * (slotLosingRate / 100);

        // 하위 파트너의 루징 합계
        const childrenLosing = await getChildrenLosing(partner.id, dateRange.from, dateRange.to);
        const casinoChildrenLosing = childrenLosing.casino;
        const slotChildrenLosing = childrenLosing.slot;

        const casinoIndividualLosing = Math.max(0, casinoTotalLosing - casinoChildrenLosing);
        const slotIndividualLosing = Math.max(0, slotTotalLosing - slotChildrenLosing);

        // 하위가 있는지 확인
        const { data: children } = await supabase
          .from('partners')
          .select('id')
          .eq('parent_id', partner.id)
          .limit(1);

        rows.push({
          level: partner.level,
          levelName: getLevelName(partner.level),
          id: partner.id,
          username: partner.username,
          balance: partner.balance || 0,
          points: partner.point || 0,
          deposit,
          withdrawal,
          adminDeposit,
          adminWithdrawal,
          pointGiven,
          pointRecovered,
          depositWithdrawalDiff: deposit - withdrawal + adminDeposit - adminWithdrawal,
          casinoRollingRate,
          casinoLosingRate,
          slotRollingRate,
          slotLosingRate,
          totalBet,
          totalWin,
          totalWinLoss,
          ggr: totalWinLoss,
          casinoIndividualRolling,
          slotIndividualRolling,
          totalRolling: casinoTotalRolling + slotTotalRolling,
          totalLosing: casinoTotalLosing + slotTotalLosing,
          totalIndividualRolling: casinoIndividualRolling + slotIndividualRolling,
          totalIndividualLosing: casinoIndividualLosing + slotIndividualLosing,
          hasChildren: (children?.length || 0) > 0,
          depth: 0
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

  const getChildrenRolling = async (
    parentId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{ casino: number; slot: number }> => {
    let casinoTotal = 0;
    let slotTotal = 0;

    const { data: children } = await supabase
      .from('partners')
      .select('id, casino_rolling_commission, slot_rolling_commission')
      .eq('parent_id', parentId);

    if (!children || children.length === 0) {
      return { casino: 0, slot: 0 };
    }

    for (const child of children) {
      const { data: childUsers } = await supabase
        .from('users')
        .select('id')
        .eq('referrer_id', child.id);

      const childUserIds = childUsers?.map(u => u.id) || [];

      const { data: gameRecords } = await supabase
        .from('game_records')
        .select('game_type, bet_amount')
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString())
        .in('user_id', childUserIds);

      const casinoBet = gameRecords
        ?.filter(gr => gr.game_type === 'casino')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

      const slotBet = gameRecords
        ?.filter(gr => gr.game_type === 'slot')
        .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0) || 0;

      casinoTotal += casinoBet * ((child.casino_rolling_commission || 0) / 100);
      slotTotal += slotBet * ((child.slot_rolling_commission || 0) / 100);
    }

    return { casino: casinoTotal, slot: slotTotal };
  };

  const getChildrenLosing = async (
    parentId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{ casino: number; slot: number }> => {
    let casinoTotal = 0;
    let slotTotal = 0;

    const { data: children } = await supabase
      .from('partners')
      .select('id, casino_rolling_commission, casino_losing_commission, slot_rolling_commission, slot_losing_commission')
      .eq('parent_id', parentId);

    if (!children || children.length === 0) {
      return { casino: 0, slot: 0 };
    }

    for (const child of children) {
      const { data: childUsers } = await supabase
        .from('users')
        .select('id')
        .eq('referrer_id', child.id);

      const childUserIds = childUsers?.map(u => u.id) || [];

      const { data: gameRecords } = await supabase
        .from('game_records')
        .select('game_type, bet_amount, win_amount')
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString())
        .in('user_id', childUserIds);

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

      const casinoRolling = casinoBet * ((child.casino_rolling_commission || 0) / 100);
      const slotRolling = slotBet * ((child.slot_rolling_commission || 0) / 100);

      const casinoLosable = Math.max(0, (casinoBet - casinoWin) - casinoRolling);
      const slotLosable = Math.max(0, (slotBet - slotWin) - slotRolling);

      casinoTotal += casinoLosable * ((child.casino_losing_commission || 0) / 100);
      slotTotal += slotLosable * ((child.slot_losing_commission || 0) / 100);
    }

    return { casino: casinoTotal, slot: slotTotal };
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const toggleExpandAll = () => {
    if (expandAll) {
      setExpandedRows(new Set());
      setExpandAll(false);
    } else {
      const allIds = data.filter(r => r.hasChildren).map(r => r.id);
      setExpandedRows(new Set(allIds));
      setExpandAll(true);
    }
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(num);
  };

  const buildHierarchy = (rows: PartnerSettlementRow[]): PartnerSettlementRow[] => {
    // 계층 구조 구축 로직 (추후 구현)
    return rows;
  };

  const getVisibleRows = (): PartnerSettlementRow[] => {
    let result: PartnerSettlementRow[] = [];
    const hierarchy = buildHierarchy(data);

    for (const row of hierarchy) {
      if (!codeSearch || row.username.toLowerCase().includes(codeSearch.toLowerCase())) {
        result.push(row);
      }
    }

    return result;
  };

  const visibleRows = getVisibleRows();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f6fa', fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif', padding: '24px' }}>
      {/* 1. 상단 안내 영역 */}
      <div className="mb-5">
        <div className="flex items-start gap-3 p-4" style={{ backgroundColor: '#FFF8E1', border: '1px solid #FFE082' }}>
          <Info className="size-5 flex-shrink-0" style={{ color: '#F57C00', marginTop: '2px' }} />
          <div style={{ color: '#E65100', fontSize: '13px', lineHeight: '1.7' }}>
            <p>• 파트너별 정산 내역은 각 파트너의 직속 회원들의 베팅 데이터를 기반으로 정산 내역을 표시합니다.</p>
            <p>• 개별롤링 = 본인 전체 롤링 - 하위 파트너 전체 롤링으로 계산됩니다.</p>
            <p>• 롤링금/낙첨금은 하위 파트너를 제외한 본인의 순수 정산 수익입니다.</p>
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
            placeholder="파트너 ID 검색..."
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

          {/* 전체 펼치기/접기 */}
          <button
            onClick={toggleExpandAll}
            className="flex items-center gap-2"
            style={{
              padding: '10px 20px',
              backgroundColor: '#5C6BC0',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {expandAll ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {expandAll ? '전체 접기' : '전체 펼치기'}
          </button>

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
                {visibleRows.map((row, idx) => {
                  const bgColor = getRowBackgroundColor(row.level);
                  return (
                    <tr 
                      key={row.id} 
                      style={{
                        backgroundColor: bgColor,
                        borderBottom: '1px solid #E0E0E0',
                        cursor: row.hasChildren ? 'pointer' : 'default'
                      }}
                      onClick={() => row.hasChildren && toggleRow(row.id)}
                    >
                      <td className="p-3 sticky left-0 z-10" style={{ backgroundColor: bgColor, color: '#212121', fontSize: '13px', fontWeight: 600, width: '80px', whiteSpace: 'nowrap' }}>
                        <div className="flex items-center justify-center gap-1">
                          {row.hasChildren && row.level > 0 && (
                            expandedRows.has(row.id) ? 
                              <ChevronDown className="size-4" /> : 
                              <ChevronRight className="size-4" />
                          )}
                          {row.levelName}
                        </div>
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
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.casinoIndividualRolling)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.slotIndividualRolling)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.totalRolling)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px' }}>{formatNumber(row.totalLosing)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px', fontWeight: 600 }}>{formatNumber(row.totalIndividualRolling)}</td>
                      <td className="p-3 text-right" style={{ color: '#424242', fontSize: '13px', fontWeight: 600 }}>{formatNumber(row.totalIndividualLosing)}</td>
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
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>낙첨금</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  (총베팅 - 당첨금 - 총 롤링금) × 루징률
                </div>
              </div>
              <div className="grid grid-cols-[70px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>롤링금</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  총베팅 × 롤링률
                </div>
              </div>
            </div>
          </div>

          {/* 우측: 계층별 롤링 배분 */}
          <div className="flex-1">
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#212121', marginBottom: '12px' }}>계층별 롤링 배분</h4>
            <div className="space-y-2">
              <div className="grid grid-cols-[60px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>대본</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  대본 전체 롤링금 - 본사별 전체 롤링금 = 대본 롤링금
                </div>
              </div>
              <div className="grid grid-cols-[60px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>본사</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  본사 전체 롤링금 - 부본사별 전체 롤링금 = 본사 롤링금
                </div>
              </div>
              <div className="grid grid-cols-[60px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>부본사</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  부본사 전체 롤링금 - 총판별 전체 롤링금 = 부본사 롤링금
                </div>
              </div>
              <div className="grid grid-cols-[60px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>총판</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  총판 전체 롤링금 - 매장별 전체 롤링금 = 총판 롤링금
                </div>
              </div>
              <div className="grid grid-cols-[60px_1fr] gap-3 items-start">
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#424242' }}>매장</div>
                <div style={{ fontSize: '12px', color: '#616161', lineHeight: '1.6' }}>
                  매장 전체 롤링금 - 회원별 롤링금 = 매장 롤링금
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}