import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Search, Info } from "lucide-react";
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
  // 롤링 계산
  casinoTotalRolling: number; // 본인 베팅 기반
  slotTotalRolling: number;
  casinoChildrenRolling: number; // 하위 롤링 합계
  slotChildrenRolling: number;
  casinoIndividualRolling: number; // 본인만
  slotIndividualRolling: number;
  totalIndividualRolling: number;
  totalRolling: number; // 전체 롤링 (하위 빼기 전)
  // 루징 계산
  casinoTotalLosing: number;
  slotTotalLosing: number;
  casinoChildrenLosing: number;
  slotChildrenLosing: number;
  casinoIndividualLosing: number;
  slotIndividualLosing: number;
  totalIndividualLosing: number;
  totalLosing: number; // 전체 루징 (하위 빼기 전)
  totalSettlement: number; // 롤링 + 루징
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
}

export function IntegratedSettlement({ user }: IntegratedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'all' | '2' | '3' | '4' | '5' | 'user'>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [codeSearch, setCodeSearch] = useState("");
  const [showCumulative, setShowCumulative] = useState(false);
  const [data, setData] = useState<SettlementRow[]>([]);
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
    totalSettlementProfit: 0
  });

  useEffect(() => {
    fetchSettlementData();
  }, [dateRange]);

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      // ✅ 조직 격리: 권한별 하위 파트너 ID 목록 조회
      let allowedPartnerIds: string[] = [];
      
      if (user.level === 1) {
        // 시스템관리자: 모든 파트너
        const { data: allPartners } = await supabase
          .from('partners')
          .select('id');
        allowedPartnerIds = allPartners?.map(p => p.id) || [];
      } else {
        // 하위 파트너만 (자신 포함)
        allowedPartnerIds = [user.id];
        
        // 1단계 하위
        const { data: level1 } = await supabase
          .from('partners')
          .select('id')
          .eq('parent_id', user.id);
        
        const level1Ids = level1?.map(p => p.id) || [];
        allowedPartnerIds.push(...level1Ids);
        
        // 2단계 하위
        if (level1Ids.length > 0) {
          const { data: level2 } = await supabase
            .from('partners')
            .select('id')
            .in('parent_id', level1Ids);
          
          const level2Ids = level2?.map(p => p.id) || [];
          allowedPartnerIds.push(...level2Ids);
          
          // 3단계 하위
          if (level2Ids.length > 0) {
            const { data: level3 } = await supabase
              .from('partners')
              .select('id')
              .in('parent_id', level2Ids);
            
            const level3Ids = level3?.map(p => p.id) || [];
            allowedPartnerIds.push(...level3Ids);
            
            // 4단계 하위
            if (level3Ids.length > 0) {
              const { data: level4 } = await supabase
                .from('partners')
                .select('id')
                .in('parent_id', level3Ids);
              
              allowedPartnerIds.push(...(level4?.map(p => p.id) || []));
            }
          }
        }
      }

      // 1. 허용된 파트너만 조회 (Lv2 이상)
      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('*')
        .in('id', allowedPartnerIds)
        .gte('level', 2)
        .order('level', { ascending: true })
        .order('username', { ascending: true });

      if (partnersError) throw partnersError;

      // 2. 허용된 파트너들의 하위 회원만 조회
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, username, balance, points, referrer_id, casino_rolling_commission, casino_losing_commission, slot_rolling_commission, slot_losing_commission')
        .in('referrer_id', allowedPartnerIds)
        .order('username', { ascending: true });

      if (usersError) throw usersError;

      // 3. 기간 내 거래 데이터 조회
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      if (transError) throw transError;

      const { data: pointTransactions, error: pointError } = await supabase
        .from('point_transactions')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      if (pointError) throw pointError;

      const { data: gameRecords, error: gameError } = await supabase
        .from('game_records')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      if (gameError) throw gameError;

      // 4. 데이터 가공
      const rows = await processSettlementData(partners || [], users || [], transactions || [], pointTransactions || [], gameRecords || []);
      
      setData(rows);
      calculateSummary(rows);

    } catch (error) {
      console.error('정산 데이터 조회 실패:', error);
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

    // 파트너 처리
    for (const partner of partners) {
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
      rows.push(row);
    }

    // 사용자 처리
    for (const user of users) {
      const row = await calculateRowData(
        user.id,
        user.username,
        0,
        user.balance || 0,
        user.points || 0,
        user.casino_rolling_commission || 0,
        user.casino_losing_commission || 0,
        user.slot_rolling_commission || 0,
        user.slot_losing_commission || 0,
        transactions,
        pointTransactions,
        gameRecords,
        partners,
        users
      );
      rows.push(row);
    }

    return rows;
  };

  // 하위 사용자 ID 목록 가져오기
  const getDescendantUserIds = (partnerId: string, allUsers: any[]): string[] => {
    const directUsers = allUsers.filter(u => u.referrer_id === partnerId);
    return directUsers.map(u => u.id);
  };

  // 하위 파트너 ID 목록 가져오기 (재귀적)
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

    // 입출금 계산
    const userTransactions = transactions.filter(t => 
      isPartner ? t.partner_id === entityId : t.user_id === entityId
    );

    const deposit = userTransactions
      .filter(t => t.transaction_type === 'deposit' && t.status === 'approved')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const withdrawal = userTransactions
      .filter(t => t.transaction_type === 'withdrawal' && t.status === 'approved')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const adminDeposit = userTransactions
      .filter(t => t.transaction_type === 'admin_deposit' && t.status === 'approved')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const adminWithdrawal = userTransactions
      .filter(t => t.transaction_type === 'admin_withdrawal' && t.status === 'approved')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    // 포인트 계산
    const userPointTrans = pointTransactions.filter(pt =>
      isPartner ? pt.partner_id === entityId : pt.user_id === entityId
    );

    const pointGiven = userPointTrans
      .filter(pt => pt.type === 'commission_earned')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);

    const pointRecovered = userPointTrans
      .filter(pt => pt.type === 'point_to_balance')
      .reduce((sum, pt) => sum + (pt.amount || 0), 0);

    // 베팅 데이터 계산 (파트너는 하위 회원들의 베팅 합계)
    let userGameRecords: any[];
    
    if (isPartner) {
      // 파트너: 하위 사용자들의 베팅만 (파트너는 게임을 하지 않음)
      const descendantUserIds = getDescendantUserIds(entityId, users);
      const descendantPartnerIds = getDescendantPartnerIds(entityId, partners);
      
      // 직속 하위 회원들의 베팅
      userGameRecords = gameRecords.filter(gr => descendantUserIds.includes(gr.user_id));
      
      // 하위 파트너들의 회원들 베팅도 포함
      for (const childPartnerId of descendantPartnerIds) {
        const childUserIds = getDescendantUserIds(childPartnerId, users);
        const childRecords = gameRecords.filter(gr => childUserIds.includes(gr.user_id));
        userGameRecords = userGameRecords.concat(childRecords);
      }
    } else {
      // 회원: 본인의 베팅만
      userGameRecords = gameRecords.filter(gr => gr.user_id === entityId);
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

    // 본인 베팅 기반 롤링 계산
    const casinoTotalRolling = casinoBet * (casinoRollingRate / 100);
    const slotTotalRolling = slotBet * (slotRollingRate / 100);

    // 하위 롤링 합계 계산
    const childrenRolling = await getChildrenTotalRolling(entityId, level, gameRecords, partners, users);

    const casinoIndividualRolling = Math.max(0, casinoTotalRolling - childrenRolling.casino);
    const slotIndividualRolling = Math.max(0, slotTotalRolling - childrenRolling.slot);
    const totalIndividualRolling = casinoIndividualRolling + slotIndividualRolling;
    const totalRolling = casinoTotalRolling + slotTotalRolling; // 전체 롤링 (하위 빼기 전)

    // 루징 계산: (윈로스 - 총 롤링금) * 루징률
    const casinoLosableAmount = Math.max(0, casinoWinLoss - casinoTotalRolling);
    const slotLosableAmount = Math.max(0, slotWinLoss - slotTotalRolling);
    
    const casinoTotalLosing = casinoLosableAmount * (casinoLosingRate / 100);
    const slotTotalLosing = slotLosableAmount * (slotLosingRate / 100);

    // 하위 루징 합계 계산
    const childrenLosing = await getChildrenTotalLosing(entityId, level, gameRecords, partners, users);

    const casinoIndividualLosing = Math.max(0, casinoTotalLosing - childrenLosing.casino);
    const slotIndividualLosing = Math.max(0, slotTotalLosing - childrenLosing.slot);
    const totalIndividualLosing = casinoIndividualLosing + slotIndividualLosing;
    const totalLosing = casinoTotalLosing + slotTotalLosing; // 전체 루징 (하위 빼기 전)

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
      totalRolling, // 추가: 전체 롤링 (하위 빼기 전)
      casinoChildrenRolling: childrenRolling.casino,
      slotChildrenRolling: childrenRolling.slot,
      casinoIndividualRolling,
      slotIndividualRolling,
      totalIndividualRolling,
      casinoTotalLosing,
      slotTotalLosing,
      totalLosing, // 추가: 전체 루징
      casinoChildrenLosing: childrenLosing.casino,
      slotChildrenLosing: childrenLosing.slot,
      casinoIndividualLosing,
      slotIndividualLosing,
      totalIndividualLosing,
      totalSettlement: totalIndividualRolling + totalIndividualLosing
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

    // 직속 하위 파트너들의 롤링
    const children = partners.filter(p => p.parent_id === parentId);
    
    for (const child of children) {
      // 하위 파트너의 모든 하위 회원 베팅 합산
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

    // 직속 하위 회원들의 롤링
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
      
      casinoTotal += casinoLosable * ((childUser.casino_losing_commission || 0) / 100);
      slotTotal += slotLosable * ((childUser.slot_losing_commission || 0) / 100);
    }

    return { casino: casinoTotal, slot: slotTotal };
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 1: return '슈퍼관리자';
      case 2: return '본사';
      case 3: return '부본사';
      case 4: return '총판';
      case 5: return '매장';
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
      totalSettlementProfit: filteredRows.reduce((sum, r) => sum + r.totalSettlement, 0)
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

  const setQuickDateRange = (type: 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    let from: Date;
    let to: Date;

    if (type === 'yesterday') {
      // 어제 00:00 ~ 23:59
      from = startOfDay(subDays(today, 1));
      to = endOfDay(subDays(today, 1));
    } else if (type === 'week') {
      // 일주일 전 00:00 ~ 오늘 23:59
      from = startOfDay(subDays(today, 7));
      to = endOfDay(today);
    } else {
      // 한달 전 00:00 ~ 오늘 23:59
      from = startOfDay(subDays(today, 30));
      to = endOfDay(today);
    }

    setDateRange({ from, to });
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR').format(Math.round(num));
  };

  const filteredRows = getFilteredRows(data);

  return (
    <div className="space-y-6 p-6">
      {/* 1열: 제목 및 주의사항 */}
      <div className="space-y-2">
        <h1 className="text-2xl">통합 정산 (실시간 정산)</h1>
        <div className="flex items-start gap-2 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
          <Info className="size-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-900 dark:text-amber-100">
            <p>• 통합 정산 실시간 양식은 자정 이후 입금 출금 내역에 대한 실시간 정산 데이터를 표기합니다.</p>
            <p>• 기간 검색 시 기간 검색 또는 코드 검색으로 나온 데이터의 총 합계 데이터를 표기합니다.</p>
            <p>• 관리자 일자별 정산 내역은 영업 시작일부터 최대 두 달 일일 정산 데이터 값을 표기합니다.</p>
          </div>
        </div>
      </div>

      {/* 2열: 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총입금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalDeposit)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총출금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalWithdrawal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">관리자 총입금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.adminTotalDeposit)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">관리자 총출금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.adminTotalWithdrawal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">포인트지급</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.pointGiven)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">포인트회수</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.pointRecovered)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">입출차액</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.depositWithdrawalDiff)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">카지노 베팅</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.casinoBet)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">카지노 당첨</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.casinoWin)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">슬롯 베팅</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.slotBet)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">슬롯 당첨</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.slotWin)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총베팅</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalBet)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총당첨</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalWin)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">윈로스</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalWinLoss)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">총롤링금</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalRolling)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-xs">정산수익</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm">{formatNumber(summary.totalSettlementProfit)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 3열: 필터 영역 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* 레벨 필터 */}
            <div className="space-y-2">
              <label className="text-xs">등급 필터</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={levelFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setLevelFilter('all')}
                >
                  전체
                </Button>
                <Button
                  size="sm"
                  variant={levelFilter === '2' ? 'default' : 'outline'}
                  onClick={() => setLevelFilter('2')}
                >
                  본사
                </Button>
                <Button
                  size="sm"
                  variant={levelFilter === '3' ? 'default' : 'outline'}
                  onClick={() => setLevelFilter('3')}
                >
                  부본사
                </Button>
                <Button
                  size="sm"
                  variant={levelFilter === '4' ? 'default' : 'outline'}
                  onClick={() => setLevelFilter('4')}
                >
                  총판
                </Button>
                <Button
                  size="sm"
                  variant={levelFilter === '5' ? 'default' : 'outline'}
                  onClick={() => setLevelFilter('5')}
                >
                  매장
                </Button>
                <Button
                  size="sm"
                  variant={levelFilter === 'user' ? 'default' : 'outline'}
                  onClick={() => setLevelFilter('user')}
                >
                  회원
                </Button>
              </div>
            </div>

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
              <div className="flex gap-2">
                <Input
                  placeholder="아이디 검색..."
                  value={codeSearch}
                  onChange={(e) => setCodeSearch(e.target.value)}
                  className="w-[200px]"
                />
                <Button size="icon" variant="outline" onClick={() => calculateSummary(data)}>
                  <Search className="size-4" />
                </Button>
              </div>
            </div>

            {/* 단축 날짜 버튼 */}
            <div className="space-y-2">
              <label className="text-xs">단축 선택</label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setQuickDateRange('yesterday')}>
                  어제
                </Button>
                <Button size="sm" variant="outline" onClick={() => setQuickDateRange('week')}>
                  일주일
                </Button>
                <Button size="sm" variant="outline" onClick={() => setQuickDateRange('month')}>
                  한달
                </Button>
              </div>
            </div>

            {/* 누적정산 버튼 */}
            <div className="space-y-2">
              <label className="text-xs">누적정산</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={showCumulative ? 'default' : 'outline'}
                  onClick={() => setShowCumulative(!showCumulative)}
                >
                  {showCumulative ? '누적정산 표기' : '누적정산 끔'}
                </Button>
              </div>
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

      {/* 4열: 데이터 테이블 */}
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
                    <th className="p-2 text-left sticky left-0 bg-muted/50 z-10" rowSpan={2}>등급</th>
                    <th className="p-2 text-left sticky left-[80px] bg-muted/50 z-10" rowSpan={2}>아이디</th>
                    <th className="p-2 text-right" rowSpan={2}>보유머니</th>
                    <th className="p-2 text-right" rowSpan={2}>롤링포인트</th>
                    <th className="p-2 text-right" rowSpan={2}>입금</th>
                    <th className="p-2 text-right" rowSpan={2}>출금</th>
                    <th className="p-2 text-right" rowSpan={2}>관리자<br/>입금</th>
                    <th className="p-2 text-right" rowSpan={2}>관리자<br/>출금</th>
                    <th className="p-2 text-right" rowSpan={2}>포인트<br/>지급</th>
                    <th className="p-2 text-right" rowSpan={2}>포인트<br/>회수</th>
                    <th className="p-2 text-right" rowSpan={2}>입출<br/>차액</th>
                    <th className="p-2 text-left" rowSpan={2}>구분</th>
                    <th className="p-2 text-center" colSpan={2}>요율</th>
                    <th className="p-2 text-right" rowSpan={2}>총베팅</th>
                    <th className="p-2 text-right" rowSpan={2}>총당첨</th>
                    <th className="p-2 text-right" rowSpan={2}>윈로스</th>
                    <th className="p-2 text-right" rowSpan={2}>GGR</th>
                    <th className="p-2 text-center" colSpan={2}>개별 롤링</th>
                    <th className="p-2 text-right" rowSpan={2}>총<br/>롤링금</th>
                    <th className="p-2 text-right" rowSpan={2}>총<br/>루징</th>
                    <th className="p-2 text-right" rowSpan={2}>롤링금</th>
                    <th className="p-2 text-right" rowSpan={2}>낙첨금</th>
                  </tr>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-center">롤링</th>
                    <th className="p-2 text-center">루징</th>
                    <th className="p-2 text-center">카지노</th>
                    <th className="p-2 text-center">슬롯</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.flatMap((row, idx) => [
                    /* Casino Row */
                    <tr key={`${row.id}-casino`} className={cn(
                      "border-b",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/30",
                      row.level === 2 && "border-t-2 border-t-primary/30"
                    )}>
                      <td className="p-2 sticky left-0 bg-inherit z-10" rowSpan={2}>{row.levelName}</td>
                      <td className="p-2 sticky left-[80px] bg-inherit z-10" rowSpan={2}>{row.username}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.balance)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.points)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.deposit)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.withdrawal)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.adminDeposit)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.adminWithdrawal)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.pointGiven)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.pointRecovered)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.depositWithdrawalDiff)}</td>
                      <td className="p-2">Casino</td>
                      <td className="p-2 text-center">{row.casinoRollingRate}%</td>
                      <td className="p-2 text-center">{row.casinoLosingRate}%</td>
                      <td className="p-2 text-right">{formatNumber(row.casinoBet)}</td>
                      <td className="p-2 text-right">{formatNumber(row.casinoWin)}</td>
                      <td className="p-2 text-right">{formatNumber(row.casinoWinLoss)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.ggr)}</td>
                      <td className="p-2 text-right">{formatNumber(row.casinoIndividualRolling)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalRolling)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalLosing)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalIndividualRolling)}</td>
                      <td className="p-2 text-right" rowSpan={2}>{formatNumber(row.totalIndividualLosing)}</td>
                    </tr>,
                    /* Slot Row */
                    <tr key={`${row.id}-slot`} className={cn(
                      "border-b",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/30"
                    )}>
                      <td className="p-2">Slot</td>
                      <td className="p-2 text-center">{row.slotRollingRate}%</td>
                      <td className="p-2 text-center">{row.slotLosingRate}%</td>
                      <td className="p-2 text-right">{formatNumber(row.slotBet)}</td>
                      <td className="p-2 text-right">{formatNumber(row.slotWin)}</td>
                      <td className="p-2 text-right">{formatNumber(row.slotWinLoss)}</td>
                      <td className="p-2 text-right">{formatNumber(row.slotIndividualRolling)}</td>
                    </tr>
                  ])}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5열: 계산 방식 설명 */}
      <Card>
        <CardHeader>
          <CardTitle>계산 방식</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="font-medium mb-2">기본 계산</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 롤링금 = 총베팅 × 롤링률</li>
                <li>• 낙첨금(루징) = (윈로스 - 롤링금) × 루징률</li>
                <li>• GGR = 카지노 윈로스 + 슬롯 윈로스</li>
              </ul>
            </div>
            
            <div>
              <p className="font-medium mb-2">계층별 롤링 배분</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 본사: 본사 전체 롤링금 - 부본사별 전체 롤링금 = 본사 롤링금</li>
                <li>• 부본사: 부본사 전체 롤링금 - 총판별 전체 롤링금 = 부본사 롤링금</li>
                <li>• 총판: 총판 전체 롤링금 - 매장별 전체 롤링금 = 총판 롤링금</li>
                <li>• 매장: 매장 전체 롤링금 - 회원별 롤링금 = 매장 롤링금</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}