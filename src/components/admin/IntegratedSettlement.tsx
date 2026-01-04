import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Search, Info, ChevronDown, ChevronRight } from "lucide-react";
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

interface IntegratedSettlementProps {
  user: Partner;
}

interface SettlementRow {
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
  casinoBet: number;
  casinoWin: number;
  casinoWinLoss: number;
  slotBet: number;
  slotWin: number;
  slotWinLoss: number;
  totalBet: number;
  totalWin: number;
  totalWinLoss: number;
  ggr: number;
  casinoRollingRate: number;
  casinoLosingRate: number;
  slotRollingRate: number;
  slotLosingRate: number;
  casinoTotalRolling: number;
  slotTotalRolling: number;
  casinoChildrenRolling: number;
  slotChildrenRolling: number;
  casinoIndividualRolling: number;
  slotIndividualRolling: number;
  totalIndividualRolling: number;
  totalRolling: number;
  casinoTotalLosing: number;
  slotTotalLosing: number;
  casinoChildrenLosing: number;
  slotChildrenLosing: number;
  casinoIndividualLosing: number;
  slotIndividualLosing: number;
  totalIndividualLosing: number;
  totalLosing: number;
  totalSettlement: number;
  settlementProfit: number; // 정산수익 추가
  actualSettlementProfit: number; // 실정산수익 추가
  parentId?: string;
  referrerId?: string;
  hasChildren?: boolean;
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

export function IntegratedSettlement({ user }: IntegratedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'all' | '2' | '3' | '4' | '5' | '6' | 'user'>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [showCumulative, setShowCumulative] = useState(false); // 기본값: 오늘 기준 정산
  const [data, setData] = useState<SettlementRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
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
  }, [dateRange, showCumulative]);

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
      // 전체 접기
      setExpandedRows(new Set());
      setExpandAll(false);
    } else {
      // 전체 펼치기
      const allIds = new Set(data.filter(r => r.hasChildren).map(r => r.id));
      setExpandedRows(allIds);
      setExpandAll(true);
    }
  };

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

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      console.log('🔍 [통합정산] 데이터 조회 시작', {
        dateRange: {
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString()
        },
        user: {
          id: user.id,
          username: user.username,
          level: user.level
        }
      });

      // ✅ 계층 구조에 따른 허용된 파트너 ID 목록 생성
      let allowedPartnerIds: string[] = [];
      
      if (user.level === 1) {
        // 레벨 1 (시스템 관리자): 모든 파트너 (lv2 이상)
        const { data: allPartners } = await supabase
          .from('partners')
          .select('id')
          .gte('level', 2); // lv2(운영사) 이상만
        allowedPartnerIds = allPartners?.map(p => p.id) || [];
        console.log('✅ [Lv1 관리자] 모든 파트너 조회:', allowedPartnerIds.length, '개');
      } else {
        // 레벨 2 이상: 자기 자신 + 모든 하위 파트너
        allowedPartnerIds = [user.id];
        
        // get_hierarchical_partners RPC 사용
        const { data: hierarchicalPartners } = await supabase
          .rpc('get_hierarchical_partners', { p_partner_id: user.id });
        
        if (hierarchicalPartners) {
          allowedPartnerIds.push(...hierarchicalPartners.map((p: any) => p.id));
        }
        console.log('✅ [Lv' + user.level + ' 파트너] 하위 파트너 조회:', allowedPartnerIds.length, '개');
      }

      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('*')
        .in('id', allowedPartnerIds)
        .order('level', { ascending: true })
        .order('username', { ascending: true });

      if (partnersError) throw partnersError;
      console.log('✅ 파트너 데이터:', partners?.length || 0, '개');

      // ✅ 현재 로그인 사용자만 제외
      const filteredPartners = (partners || []).filter(p => p.id !== user.id);
      console.log('✅ 필터링 후 파트너:', filteredPartners.length, '개');

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('referrer_id', allowedPartnerIds)
        .order('username', { ascending: true });

      if (usersError) throw usersError;
      console.log('✅ 회원 데이터:', users?.length || 0, '개');
      
      // 첫 번째 회원의 롤링/루징 데이터 확인
      if (users && users.length > 0) {
        console.log('📋 첫 번째 회원 롤링/루징 데이터:', {
          username: users[0].username,
          casino_rolling_commission: users[0].casino_rolling_commission,
          casino_losing_commission: users[0].casino_losing_commission,
          slot_rolling_commission: users[0].slot_rolling_commission,
          slot_losing_commission: users[0].slot_losing_commission
        });
      }

      // 거래 데이터 조회 (누적 정산 모드면 날짜 필터 제거)
      const targetUserIds = users?.map(u => u.id) || [];
      console.log('🎯 조직격리 적용 - 대상 회원 ID:', targetUserIds.length, '명');
      
      let transactionsQuery = supabase.from('transactions').select('*').in('user_id', targetUserIds);
      if (!showCumulative) {
        console.log('📅 날짜 필터 적용:', {
          showCumulative,
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString()
        });
        transactionsQuery = transactionsQuery
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
      } else {
        console.log('📅 누적 정산 모드: 날짜 필터 없음');
      }
      const { data: transactions, error: transError } = await transactionsQuery;

      if (transError) throw transError;
      console.log('✅ 거래 데이터:', transactions?.length || 0, '개', showCumulative ? '(누적)' : '(기간)');
      
      // admin_deposit 타입의 거래만 필터링해서 확인
      const adminDeposits = transactions?.filter(t => t.transaction_type === 'admin_deposit' && t.status === 'completed') || [];
      console.log('💰 관리자 입금 거래:', {
        count: adminDeposits.length,
        total: adminDeposits.reduce((sum, t) => sum + (t.amount || 0), 0),
        transactions: adminDeposits.map(t => ({
          amount: t.amount,
          created_at: t.created_at,
          user_id: t.user_id
        }))
      });

      // 포인트 거래 데이터 조회
      let pointTransactionsQuery = supabase.from('point_transactions').select('*').in('user_id', targetUserIds);
      if (!showCumulative) {
        pointTransactionsQuery = pointTransactionsQuery
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
      }
      const { data: pointTransactions, error: pointError } = await pointTransactionsQuery;

      if (pointError) throw pointError;
      console.log('✅ 포인트 거래:', pointTransactions?.length || 0, '개', showCumulative ? '(누적)' : '(기간)');

      // 게임 기록 조회 (game_records는 played_at 컬럼 사용!)
      let gameRecordsQuery = supabase.from('game_records').select('*').in('user_id', targetUserIds);
      if (!showCumulative) {
        gameRecordsQuery = gameRecordsQuery
          .gte('played_at', dateRange.from.toISOString())
          .lte('played_at', dateRange.to.toISOString());
      }
      const { data: gameRecords, error: gameError } = await gameRecordsQuery;

      if (gameError) throw gameError;
      console.log('✅ 게임 기록:', gameRecords?.length || 0, '개', showCumulative ? '(누적)' : '(기간)');
      
      // 게임 기록 샘플 확인
      if (gameRecords && gameRecords.length > 0) {
        const sampleRecord = gameRecords[0];
        console.log('📋 게임 기록 샘플:', {
          user_id: sampleRecord.user_id,
          game_type: sampleRecord.game_type,
          bet_amount: sampleRecord.bet_amount,
          win_amount: sampleRecord.win_amount,
          created_at: sampleRecord.created_at
        });
        
        // game_type별 통계
        const casinoCount = gameRecords.filter(gr => gr.game_type === 'casino').length;
        const slotCount = gameRecords.filter(gr => gr.game_type === 'slot').length;
        const nullCount = gameRecords.filter(gr => !gr.game_type).length;
        console.log('📊 game_type 분포:', { casino: casinoCount, slot: slotCount, null: nullCount });
      }

      const rows = await processSettlementData(filteredPartners || [], users || [], transactions || [], pointTransactions || [], gameRecords || []);
      
      console.log('✅ 정산 데이터 처리 완료:', rows.length, '개');
      setData(rows);
      calculateSummary(rows);

    } catch (error) {
      console.error('❌ 정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const processSettlementData = async (
    partners: any[],
    users: any[],
    transactions: any[],
    pointTransactions: any[],
    gameRecords: any[]
  ): Promise<SettlementRow[]> => {
    const rows: SettlementRow[] = [];

    for (const partner of partners) {
      // 첫 번째 파트너 데이터로 필드명 확인
      if (partners.indexOf(partner) === 0) {
        console.log('🔍 첫 번째 파트너 데이터 샘플:', {
          username: partner.username,
          level: partner.level,
          rollingFields: {
            casino_rolling_commission: partner.casino_rolling_commission,
            casino_losing_commission: partner.casino_losing_commission,
            slot_rolling_commission: partner.slot_rolling_commission,
            slot_losing_commission: partner.slot_losing_commission
          }
        });
      }

      const hasChildren = partners.some(p => p.parent_id === partner.id) || 
                         users.some(u => u.referrer_id === partner.id);
      
      const row = await calculateRowData(
        partner.id,
        partner.username,
        partner.level,
        partner.balance || 0,
        0,
        partner.casino_rolling_commission || 0,
        partner.casino_losing_commission || 0,
        partner.slot_rolling_commission || 0,
        partner.slot_losing_commission || 0,
        transactions,
        pointTransactions,
        gameRecords,
        partners,
        users
      );
      rows.push({
        ...row,
        parentId: partner.parent_id,
        hasChildren
      });
    }

    for (const user of users) {
      // 첫 번째 사용자 데이터로 필드명 확인
      if (users.indexOf(user) === 0) {
        console.log('🔍 첫 번째 사용자 데이터 샘플:', {
          fields: Object.keys(user),
          rollingFields: {
            casino_rolling_commission: user.casino_rolling_commission,
            casino_rolling_rate: user.casino_rolling_rate,
            slot_rolling_commission: user.slot_rolling_commission,
            slot_rolling_rate: user.slot_rolling_rate
          }
        });
      }

      const row = await calculateRowData(
        user.id,
        user.username,
        0,
        user.balance || 0,
        user.points || 0,
        user.casino_rolling_commission || user.casino_rolling_rate || 0,
        user.casino_losing_commission || user.casino_losing_rate || 0,
        user.slot_rolling_commission || user.slot_rolling_rate || 0,
        user.slot_losing_commission || user.slot_losing_rate || 0,
        transactions,
        pointTransactions,
        gameRecords,
        partners,
        users
      );
      rows.push({
        ...row,
        referrerId: user.referrer_id,
        hasChildren: false
      });
    }

    return rows;
  };

  const getDescendantUserIds = (partnerId: string, allUsers: any[]): string[] => {
    const directUsers = allUsers.filter(u => u.referrer_id === partnerId);
    return directUsers.map(u => u.id);
  };

  const getDescendantPartnerIds = (partnerId: string, allPartners: any[]): string[] => {
    const directChildren = allPartners.filter(p => p.parent_id === partnerId);
    let allDescendants = directChildren.map(p => p.id);
    
    for (const child of directChildren) {
      allDescendants = allDescendants.concat(getDescendantPartnerIds(child.id, allPartners));
    }
    
    return allDescendants;
  };

  const calculateRowData = async (
    entityId: string,
    username: string,
    level: number,
    balance: number,
    points: number,
    casinoRollingRate: number,
    casinoLosingRate: number,
    slotRollingRate: number,
    slotLosingRate: number,
    transactions: any[],
    pointTransactions: any[],
    gameRecords: any[],
    partners: any[],
    users: any[]
  ): Promise<SettlementRow> => {
    const isPartner = level > 0;

    console.log(`📊 [${username}] 정산 계산 시작`, {
      level,
      isPartner,
      rates: {
        casinoRolling: casinoRollingRate,
        casinoLosing: casinoLosingRate,
        slotRolling: slotRollingRate,
        slotLosing: slotLosingRate
      }
    });

    // 거래 데이터 필터링 - 파트너/회원 모두 본인 거래만!
    const userTransactions = transactions.filter(t => t.user_id === entityId);

    const deposit = userTransactions
      .filter(t => t.transaction_type === 'deposit' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const withdrawal = userTransactions
      .filter(t => t.transaction_type === 'withdrawal' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const adminDeposit = userTransactions
      .filter(t => t.transaction_type === 'admin_deposit' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const adminWithdrawal = userTransactions
      .filter(t => t.transaction_type === 'admin_withdrawal' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    console.log(`  💰 [${username}] 거래 집계:`, {
      transactions: userTransactions.length,
      deposit,
      withdrawal,
      adminDeposit,
      adminWithdrawal
    });

    // 포인트 거래 데이터 필터링 - 본인 거래만!
    const userPointTrans = pointTransactions.filter(pt => pt.user_id === entityId);

    const pointGiven = userPointTrans
      .filter(pt => pt.type === 'commission_earned')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);

    const pointRecovered = userPointTrans
      .filter(pt => pt.type === 'point_to_balance')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);

    // 게임 기록 필터링 - 본인 기록만!
    const userGameRecords = gameRecords.filter(gr => gr.user_id === entityId);

    // 게임 기록 샘플 로그
    if (userGameRecords.length > 0 && userGameRecords.length <= 5) {
      console.log(`  🎮 [${username}] 게임 기록 샘플 (${userGameRecords.length}개):`, 
        userGameRecords.map(gr => ({
          game_type: gr.game_type,
          bet_amount: gr.bet_amount,
          win_amount: gr.win_amount,
          created_at: gr.created_at
        }))
      );
    }

    const casinoBet = userGameRecords
      .filter(gr => gr.game_type === 'casino')
      .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);

    const casinoWin = userGameRecords
      .filter(gr => gr.game_type === 'casino')
      .reduce((sum, gr) => sum + (gr.win_amount || 0), 0);

    const slotBet = userGameRecords
      .filter(gr => gr.game_type === 'slot')
      .reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);

    const slotWin = userGameRecords
      .filter(gr => gr.game_type === 'slot')
      .reduce((sum, gr) => sum + (gr.win_amount || 0), 0);

    const casinoWinLoss = casinoBet - casinoWin;
    const slotWinLoss = slotBet - slotWin;
    const totalWinLoss = casinoWinLoss + slotWinLoss;

    const casinoTotalRolling = casinoBet * (casinoRollingRate / 100);
    const slotTotalRolling = slotBet * (slotRollingRate / 100);

    console.log(`  💰 [${username}] 게임 데이터`, {
      gameRecordsCount: userGameRecords.length,
      casino: { bet: casinoBet, win: casinoWin, winLoss: casinoWinLoss },
      slot: { bet: slotBet, win: slotWin, winLoss: slotWinLoss },
      totalWinLoss,
      rolling: {
        casinoTotal: casinoTotalRolling,
        slotTotal: slotTotalRolling,
        total: casinoTotalRolling + slotTotalRolling
      }
    });

    const childrenRolling = await getChildrenTotalRolling(entityId, level, gameRecords, partners, users);

    const casinoIndividualRolling = Math.max(0, casinoTotalRolling - childrenRolling.casino);
    const slotIndividualRolling = Math.max(0, slotTotalRolling - childrenRolling.slot);
    const totalIndividualRolling = casinoIndividualRolling + slotIndividualRolling;
    const totalRolling = casinoTotalRolling + slotTotalRolling;

    const casinoLosableAmount = Math.max(0, casinoWinLoss - casinoTotalRolling);
    const slotLosableAmount = Math.max(0, slotWinLoss - slotTotalRolling);
    
    const casinoTotalLosing = casinoLosableAmount * (casinoLosingRate / 100);
    const slotTotalLosing = slotLosableAmount * (slotLosingRate / 100);

    const childrenLosing = await getChildrenTotalLosing(entityId, level, gameRecords, partners, users);

    const casinoIndividualLosing = Math.max(0, casinoTotalLosing - childrenLosing.casino);
    const slotIndividualLosing = Math.max(0, slotTotalLosing - childrenLosing.slot);
    const totalIndividualLosing = casinoIndividualLosing + slotIndividualLosing;
    const totalLosing = casinoTotalLosing + slotTotalLosing;

    console.log(`  🎯 [${username}] 롤링/루징 계산 완료`, {
      individualRolling: {
        casino: casinoIndividualRolling,
        slot: slotIndividualRolling,
        total: totalIndividualRolling
      },
      individualLosing: {
        casino: casinoIndividualLosing,
        slot: slotIndividualLosing,
        total: totalIndividualLosing
      }
    });

    // 정산수익 = 윈로스 - 롤링금 (개별롤링 사용)
    const settlementProfit = totalWinLoss - totalIndividualRolling;
    // 실정산수익 = 윈로스 - 롤링금 - 루징금 (개별롤링, 개별루징 사용)
    const actualSettlementProfit = totalWinLoss - totalIndividualRolling - totalIndividualLosing;

    return {
      level,
      levelName: getLevelName(level),
      id: entityId,
      username,
      balance,
      points,
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
      totalBet: casinoBet + slotBet,
      totalWin: casinoWin + slotWin,
      totalWinLoss,
      ggr: totalWinLoss,
      casinoRollingRate,
      casinoLosingRate,
      slotRollingRate,
      slotLosingRate,
      casinoTotalRolling,
      slotTotalRolling,
      totalRolling,
      casinoChildrenRolling: childrenRolling.casino,
      slotChildrenRolling: childrenRolling.slot,
      casinoIndividualRolling,
      slotIndividualRolling,
      totalIndividualRolling,
      casinoTotalLosing,
      slotTotalLosing,
      totalLosing,
      casinoChildrenLosing: childrenLosing.casino,
      slotChildrenLosing: childrenLosing.slot,
      casinoIndividualLosing,
      slotIndividualLosing,
      totalIndividualLosing,
      totalSettlement: settlementProfit,
      settlementProfit,
      actualSettlementProfit
    };
  };

  const getChildrenTotalRolling = async (
    parentId: string,
    parentLevel: number,
    gameRecords: any[],
    partners: any[],
    users: any[]
  ): Promise<{ casino: number; slot: number }> => {
    let casinoTotal = 0;
    let slotTotal = 0;

    if (parentLevel === 0) {
      return { casino: 0, slot: 0 };
    }

    const children = partners.filter(p => p.parent_id === parentId);
    
    for (const child of children) {
      const childUserIds = getDescendantUserIds(child.id, users);
      const childPartnerIds = getDescendantPartnerIds(child.id, partners);
      
      let childGameRecords = gameRecords.filter(gr => childUserIds.includes(gr.user_id));
      
      for (const descendantPartnerId of childPartnerIds) {
        const descendantUserIds = getDescendantUserIds(descendantPartnerId, users);
        childGameRecords = childGameRecords.concat(
          gameRecords.filter(gr => descendantUserIds.includes(gr.user_id))
        );
      }
      
      const casinoBet = childGameRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const slotBet = childGameRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      
      casinoTotal += casinoBet * ((child.casino_rolling_commission || 0) / 100);
      slotTotal += slotBet * ((child.slot_rolling_commission || 0) / 100);
    }

    const directUsers = users.filter(u => u.referrer_id === parentId);
    
    for (const childUser of directUsers) {
      const userRecords = gameRecords.filter(gr => gr.user_id === childUser.id);
      const casinoBet = userRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const slotBet = userRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      
      casinoTotal += casinoBet * ((childUser.casino_rolling_commission || 0) / 100);
      slotTotal += slotBet * ((childUser.slot_rolling_commission || 0) / 100);
    }

    return { casino: casinoTotal, slot: slotTotal };
  };

  const getChildrenTotalLosing = async (
    parentId: string,
    parentLevel: number,
    gameRecords: any[],
    partners: any[],
    users: any[]
  ): Promise<{ casino: number; slot: number }> => {
    let casinoTotal = 0;
    let slotTotal = 0;

    if (parentLevel === 0) {
      return { casino: 0, slot: 0 };
    }

    const children = partners.filter(p => p.parent_id === parentId);
    
    for (const child of children) {
      const childUserIds = getDescendantUserIds(child.id, users);
      const childPartnerIds = getDescendantPartnerIds(child.id, partners);
      
      let childGameRecords = gameRecords.filter(gr => childUserIds.includes(gr.user_id));
      
      for (const descendantPartnerId of childPartnerIds) {
        const descendantUserIds = getDescendantUserIds(descendantPartnerId, users);
        childGameRecords = childGameRecords.concat(
          gameRecords.filter(gr => descendantUserIds.includes(gr.user_id))
        );
      }
      
      const casinoBet = childGameRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const casinoWin = childGameRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
      const slotBet = childGameRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const slotWin = childGameRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
      
      const casinoRolling = casinoBet * ((child.casino_rolling_commission || 0) / 100);
      const slotRolling = slotBet * ((child.slot_rolling_commission || 0) / 100);
      
      const casinoLosable = Math.max(0, (casinoBet - casinoWin) - casinoRolling);
      const slotLosable = Math.max(0, (slotBet - slotWin) - slotRolling);
      
      casinoTotal += casinoLosable * ((child.casino_losing_commission || 0) / 100);
      slotTotal += slotLosable * ((child.slot_losing_commission || 0) / 100);
    }

    const directUsers = users.filter(u => u.referrer_id === parentId);
    
    for (const childUser of directUsers) {
      const userRecords = gameRecords.filter(gr => gr.user_id === childUser.id);
      const casinoBet = userRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const casinoWin = userRecords.filter(gr => gr.game_type === 'casino').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
      const slotBet = userRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.bet_amount || 0), 0);
      const slotWin = userRecords.filter(gr => gr.game_type === 'slot').reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
      
      const casinoRolling = casinoBet * ((childUser.casino_rolling_commission || 0) / 100);
      const slotRolling = slotBet * ((childUser.slot_rolling_commission || 0) / 100);
      
      const casinoLosable = Math.max(0, (casinoBet - casinoWin) - casinoRolling);
      const slotLosable = Math.max(0, (slotBet - slotWin) - slotRolling);
      
      casinoTotal += casinoLosable * ((childUser.casino_rolling_commission || 0) / 100);
      slotTotal += slotLosable * ((childUser.slot_losing_commission || 0) / 100);
    }

    return { casino: casinoTotal, slot: slotTotal };
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 1: return '슈퍼관리자';
      case 2: return '운영사(대본)';
      case 3: return '본사';
      case 4: return '부본사';
      case 5: return '총판';
      case 6: return '매장';
      default: return '회원';
    }
  };

  const calculateSummary = (rows: SettlementRow[]) => {
    const filteredRows = getFilteredRows(rows);
    
    const summary: SummaryStats = {
      totalDeposit: filteredRows.reduce((sum, r) => sum + r.deposit, 0),
      totalWithdrawal: filteredRows.reduce((sum, r) => sum + r.withdrawal, 0),
      adminTotalDeposit: filteredRows.reduce((sum, r) => sum + r.adminDeposit, 0),
      adminTotalWithdrawal: filteredRows.reduce((sum, r) => sum + r.adminWithdrawal, 0),
      pointGiven: filteredRows.reduce((sum, r) => sum + r.pointGiven, 0),
      pointRecovered: filteredRows.reduce((sum, r) => sum + r.pointRecovered, 0),
      depositWithdrawalDiff: filteredRows.reduce((sum, r) => sum + r.depositWithdrawalDiff, 0),
      casinoBet: filteredRows.reduce((sum, r) => sum + r.casinoBet, 0),
      casinoWin: filteredRows.reduce((sum, r) => sum + r.casinoWin, 0),
      slotBet: filteredRows.reduce((sum, r) => sum + r.slotBet, 0),
      slotWin: filteredRows.reduce((sum, r) => sum + r.slotWin, 0),
      totalBet: filteredRows.reduce((sum, r) => sum + r.totalBet, 0),
      totalWin: filteredRows.reduce((sum, r) => sum + r.totalWin, 0),
      totalWinLoss: filteredRows.reduce((sum, r) => sum + r.totalWinLoss, 0),
      totalRolling: filteredRows.reduce((sum, r) => sum + r.totalIndividualRolling, 0),
      totalSettlementProfit: filteredRows.reduce((sum, r) => sum + r.totalSettlement, 0),
      totalActualSettlementProfit: filteredRows.reduce((sum, r) => sum + r.actualSettlementProfit, 0) // 실정산수익 추가
    };

    setSummary(summary);
  };

  const getFilteredRows = (rows: SettlementRow[]): SettlementRow[] => {
    let filtered = rows;

    if (levelFilter !== 'all') {
      if (levelFilter === 'user') {
        filtered = filtered.filter(r => r.level === 0);
      } else {
        filtered = filtered.filter(r => r.level === parseInt(levelFilter));
      }
    }

    if (codeSearch.trim()) {
      filtered = filtered.filter(r => r.username.toLowerCase().includes(codeSearch.toLowerCase()));
    }

    return filtered;
  };

  const getVisibleRows = (): SettlementRow[] => {
    const filtered = getFilteredRows(data);
    const visible: SettlementRow[] = [];

    const addRowWithChildren = (row: SettlementRow) => {
      visible.push(row);
      
      if (row.level > 0 && expandedRows.has(row.id)) {
        // 하부 파트너 찾기
        const childPartners = filtered.filter(r => r.parentId === row.id);
        childPartners.forEach(child => addRowWithChildren(child));
        
        // 하부 회원 찾기
        const childUsers = filtered.filter(r => r.level === 0 && r.referrerId === row.id);
        childUsers.forEach(user => visible.push(user));
      }
    };

    // 최상위 파트너만 먼저 추가 (parent_id가 없거나 허용된 목록에 없는 경우)
    const topLevelRows = filtered.filter(r => {
      if (r.level === 0) return false; // 회원은 제외
      if (!r.parentId) return true;
      return !filtered.some(parent => parent.id === r.parentId);
    });

    topLevelRows.forEach(row => addRowWithChildren(row));

    return visible;
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

  const visibleRows = getVisibleRows();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f6fa', fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif', padding: '24px' }}>
      {/* 1. 상단 안내 영역 */}
      <div className="mb-5">
        <div className="flex items-start gap-3 p-4" style={{ backgroundColor: '#FFF8E1', border: '1px solid #FFE082' }}>
          <Info className="size-5 flex-shrink-0" style={{ color: '#F57C00', marginTop: '2px' }} />
          <div style={{ color: '#E65100', fontSize: '13px', lineHeight: '1.7' }}>
            <p>• 통합 정산 실시간 양식은 자정 이후 입금 출금 내역에 대한 실시간 정산 데이터를 표기합니다.</p>
            <p>• 기간 검색 시 기간 검색 또는 코드 검색으로 나온 데이터의 총 합계 데이터를 표기합니다.</p>
            <p>• 사용자 입금/출금: 사용자가 직접 신청한 입출금 내역 (transaction_type: deposit/withdrawal)</p>
            <p>• 관리자 입금/출금: 관리자가 직접 처리한 입출금 내역 (transaction_type: admin_deposit/admin_withdrawal)</p>
          </div>
        </div>
      </div>

      {/* 2. 상단 정보 카드 - 2줄 가로 배치 */}
      <div className="mb-5 bg-white">
        {/* 첫 번째 줄 */}
        <div className="flex" style={{ borderBottom: '1px solid #e0e0e0' }}>
          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#FFF9E6', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600, marginBottom: '8px' }}>사용자 입금</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.totalDeposit)}</p>
          </div>
          
          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#FFF9E6', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600, marginBottom: '8px' }}>사용자 출금</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.totalWithdrawal)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#FFF9E6', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600, marginBottom: '8px' }}>관리자 입금</p>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#000000', lineHeight: 1 }}>{formatNumber(summary.adminTotalDeposit)}</p>
          </div>

          <div className="flex-1 p-4 transition-all hover:brightness-95" style={{ backgroundColor: '#FFF9E6', borderRight: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600, marginBottom: '8px' }}>관리자 출금</p>
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

          <div style={{ width: '1px', height: '32px', backgroundColor: '#9FA8DA', margin: '0 8px' }} />

          {/* 등급 필터 */}
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '13px', color: '#3F51B5', fontWeight: 600 }}>등급</span>
            <div className="flex gap-2">
              {[
                { value: 'all', label: '전체' },
                { value: '2', label: '운영사(대본)' },
                { value: '3', label: '본사' },
                { value: '4', label: '부본사' },
                { value: '5', label: '총판' },
                { value: '6', label: '매장' },
                { value: 'user', label: '회원' }
              ].map(item => (
                <button
                  key={item.value}
                  onClick={() => setLevelFilter(item.value as any)}
                  className="px-4 py-2 transition-all hover:opacity-80"
                  style={{
                    backgroundColor: levelFilter === item.value ? '#5C6BC0' : '#C5CAE9',
                    color: levelFilter === item.value ? '#ffffff' : '#3F51B5',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: '1px', height: '32px', backgroundColor: '#9FA8DA' }} />

          {/* 코드 검색 */}
          <input
            type="text"
            placeholder="아이디 검색..."
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

          {/* 누적정산 & 새로고침 */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={toggleExpandAll}
              className="flex items-center gap-2 px-4 py-2 transition-all hover:opacity-80"
              style={{
                backgroundColor: '#7E57C2',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {expandAll ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              {expandAll ? '전체 접기' : '전체 펼치기'}
            </button>

            <button
              onClick={() => setShowCumulative(!showCumulative)}
              className="px-4 py-2 transition-all hover:opacity-80"
              style={{
                backgroundColor: showCumulative ? '#5C6BC0' : '#78909C',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              누적정산 {showCumulative ? '끔' : '표기'}
            </button>
            
            <button
              onClick={fetchSettlementData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 transition-all hover:opacity-80"
              style={{
                backgroundColor: '#5C6BC0',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              새로고침
            </button>
          </div>
        </div>
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
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={25} className="p-8 text-center" style={{ color: '#757575', fontSize: '14px' }}>
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, idx) => {
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
                  })
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