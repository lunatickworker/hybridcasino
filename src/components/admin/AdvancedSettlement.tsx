import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../lib/supabase';
import { Partner } from '../../types';
import {
  Building2,
  Users,
  Gamepad2,
  Calendar,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Filter,
  Download,
  ChevronRight,
  ArrowUpCircle,
  ArrowDownCircle,
  Coins,
  Trophy,
  Wallet,
  DollarSign,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { useLanguage } from '../../contexts/LanguageContext';

interface AdvancedSettlementProps {
  user: Partner;
}

interface TopLevelStats {
  totalDeposit: number;
  totalWithdrawal: number;
  totalCasinoBet: number;
  totalSlotBet: number;
  totalCasinoWin: number;
  totalSlotWin: number;
  totalCasinoLoss: number;
  totalSlotLoss: number;
  netProfit: number;
  partnerCount: number;
}

interface PartnerStats {
  id: string;
  username: string;
  level: number;
  partnerType: string;
  totalBet: number;
  casinoBet: number;
  slotBet: number;
  totalWin: number;
  totalLoss: number;
  commissionEarned: number;
  commissionPaid: number;
  netCommission: number;
  userCount: number;
  // 커미션 상세 정보
  casinoRollingRate: number;
  casinoLosingRate: number;
  slotRollingRate: number;
  slotLosingRate: number;
  casinoRollingCommission: number;
  casinoLosingCommission: number;
  slotRollingCommission: number;
  slotLosingCommission: number;
}

interface UserStats {
  id: string;
  username: string;
  totalDeposit: number;
  totalWithdrawal: number;
  casinoBet: number;
  slotBet: number;
  casinoWin: number;
  slotWin: number;
  balance: number;
  point: number;
  lastPlayedAt: string | null;
  // 커미션 상세 정보
  casinoRollingRate: number;
  casinoLosingRate: number;
  slotRollingRate: number;
  slotLosingRate: number;
  casinoRollingCommission: number;
  casinoLosingCommission: number;
  slotRollingCommission: number;
  slotLosingCommission: number;
}

interface GameTypeStats {
  gameName: string;
  providerName: string;
  totalBet: number;
  totalWin: number;
  totalLoss: number;
  profit: number;
  playCount: number;
}

interface DailyStats {
  date: string;
  totalDeposit: number;
  totalWithdrawal: number;
  totalBet: number;
  totalWin: number;
  totalLoss: number;
  netProfit: number;
  userCount: number;
  gameCount: number;
}

function AdvancedSettlement({ user }: AdvancedSettlementProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('top-level');
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('today');
  const [levelFilter, setLevelFilter] = useState('all');
  
  // 일자별 리포트 전용 날짜 필터
  const [dailyStartDate, setDailyStartDate] = useState<string>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString().split('T')[0];
  });
  const [dailyEndDate, setDailyEndDate] = useState<string>(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return today.toISOString().split('T')[0];
  });
  
  // 오늘 날짜 (최대 선택 가능 날짜)
  const today = new Date().toISOString().split('T')[0];

  // 파트너 타입명 변환 함수
  const getPartnerTypeName = (partnerType: string): string => {
    const typeNames: { [key: string]: string } = {
      'system_admin': t.partnerManagement.systemAdmin,
      'head_office': t.partnerManagement.headOffice,
      'main_office': t.partnerManagement.mainOffice,
      'sub_office': t.partnerManagement.subOffice,
      'distributor': t.partnerManagement.distributor,
      'store': t.partnerManagement.store
    };
    return typeNames[partnerType] || partnerType;
  };

  // 데이터 상태
  const [topLevelStats, setTopLevelStats] = useState<TopLevelStats | null>(null);
  const [partnerStats, setPartnerStats] = useState<PartnerStats[]>([]);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [gameTypeStats, setGameTypeStats] = useState<GameTypeStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);

  // 모든 하위 파트너 ID를 재귀적으로 수집하는 함수
  const getAllDescendantPartnerIds = async (partnerId: string): Promise<string[]> => {
    const descendantIds: string[] = [partnerId]; // 자기 자신 포함
    
    console.log(`🔎 [재귀] ${partnerId}의 직접 하위 파트너 조회 중...`);
    
    const { data: directChildren, error } = await supabase
      .from('partners')
      .select('id, username, level, parent_id')
      .eq('parent_id', partnerId);
    
    if (error) {
      console.error(`❌ [재귀] ${partnerId}의 하위 파트너 조회 에러:`, error);
    }
    
    console.log(`📊 [재귀] ${partnerId}의 직접 하위 파트너:`, directChildren?.length || 0, '명');
    if (directChildren && directChildren.length > 0) {
      console.log(`📋 [재귀] 하위 파트너 목록:`, directChildren.map(c => ({ id: c.id, username: c.username, level: c.level })));
    }
    
    if (directChildren && directChildren.length > 0) {
      for (const child of directChildren) {
        const childDescendants = await getAllDescendantPartnerIds(child.id);
        descendantIds.push(...childDescendants);
      }
    }
    
    return descendantIds;
  };

  // 날짜 범위 계산
  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    let end = new Date(now);

    switch (dateRange) {
      case 'today':
        start = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        start = new Date(now.setDate(now.getDate() - 1));
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        start = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        start = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        start = new Date(now.setHours(0, 0, 0, 0));
    }

    return {
      start: start.toISOString(),
      end: end.toISOString()
    };
  };

  // 데이터 로드
  useEffect(() => {
    loadData();
  }, [activeTab, dateRange, levelFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      switch (activeTab) {
        case 'top-level':
          await loadTopLevelStats(start, end);
          break;
        case 'partner':
          await loadPartnerStats(start, end);
          break;
        case 'user':
          await loadUserStats(start, end);
          break;
        case 'game-type':
          await loadGameTypeStats(start, end);
          break;
        case 'daily':
          await loadDailyStats(start, end);
          break;
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error);
      toast.error('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 1. 최상위 정산 (본사별 통합)
  const loadTopLevelStats = async (start: string, end: string) => {
    // Lv2 본사들만 조회
    const { data: headquarters } = await supabase
      .from('partners')
      .select('id')
      .eq('level', 2);

    if (!headquarters || headquarters.length === 0) {
      setTopLevelStats({
        totalDeposit: 0,
        totalWithdrawal: 0,
        totalCasinoBet: 0,
        totalSlotBet: 0,
        totalCasinoWin: 0,
        totalSlotWin: 0,
        totalCasinoLoss: 0,
        totalSlotLoss: 0,
        netProfit: 0,
        partnerCount: 0
      });
      return;
    }

    const hqIds = headquarters.map(hq => hq.id);

    // 모든 본사의 하위 파트너 조회
    const { data: allPartners } = await supabase
      .from('partners')
      .select('id')
      .in('referrer_id', hqIds);

    const allPartnerIds = allPartners?.map(p => p.id) || [];
    const allIds = [...hqIds, ...allPartnerIds];

    // 입출금 통계
    const { data: transactions } = await supabase
      .from('transactions')
      .select('type, amount')
      .in('partner_id', allIds)
      .gte('created_at', start)
      .lte('created_at', end);

    let totalDeposit = 0;
    let totalWithdrawal = 0;

    transactions?.forEach(tx => {
      if (tx.type === 'deposit' || tx.type === 'forced_deposit') {
        totalDeposit += tx.amount;
      } else if (tx.type === 'withdrawal' || tx.type === 'forced_withdrawal') {
        totalWithdrawal += tx.amount;
      }
    });

    // 게임 통계
    const { data: gameRecords } = await supabase
      .from('game_records')
      .select('game_type, bet_amount, win_amount')
      .in('partner_id', allIds)
      .gte('played_at', start)
      .lte('played_at', end);

    let totalCasinoBet = 0;
    let totalSlotBet = 0;
    let totalCasinoWin = 0;
    let totalSlotWin = 0;

    gameRecords?.forEach(record => {
      const bet = Math.abs(record.bet_amount || 0);
      const win = record.win_amount || 0;

      if (record.game_type === 'casino') {
        totalCasinoBet += bet;
        totalCasinoWin += win;
      } else if (record.game_type === 'slot') {
        totalSlotBet += bet;
        totalSlotWin += win;
      }
    });

    const totalCasinoLoss = totalCasinoBet - totalCasinoWin;
    const totalSlotLoss = totalSlotBet - totalSlotWin;
    const netProfit = totalDeposit - totalWithdrawal + totalCasinoLoss + totalSlotLoss;

    setTopLevelStats({
      totalDeposit,
      totalWithdrawal,
      totalCasinoBet,
      totalSlotBet,
      totalCasinoWin,
      totalSlotWin,
      totalCasinoLoss,
      totalSlotLoss,
      netProfit,
      partnerCount: headquarters.length
    });
  };

  // 2. 파트너 정산 (본사/부본/총판/매장별)
  const loadPartnerStats = async (start: string, end: string) => {
    try {
      // 현재 사용자의 모든 하위 파트너 ID 수집
      console.log('🔍 파트너 정산 - 현재 사용자:', user.username, user.id);
      const allDescendantIds = await getAllDescendantPartnerIds(user.id);
      console.log('🔍 수집된 하위 파트너 IDs:', allDescendantIds);
      
      // 자기 자신 제외하고 하위만 (일반회원 Lv6 제외)
      const descendantIdsWithoutSelf = allDescendantIds.filter(id => id !== user.id);
      console.log('🔍 자기 자신 제외한 하위 파트너 IDs:', descendantIdsWithoutSelf);
      
      if (descendantIdsWithoutSelf.length === 0) {
        console.log('⚠️ 하위 파트너가 없습니다.');
        setPartnerStats([]);
        return;
      }
      
      let query = supabase
        .from('partners')
        .select('*')
        .in('id', descendantIdsWithoutSelf)
        .lte('level', 6) // Lv6(매장) 포함
        .order('level', { ascending: true });

      if (levelFilter !== 'all') {
        query = query.eq('level', parseInt(levelFilter));
      }

      const { data: partners, error } = await query;
      
      if (error) {
        console.error('❌ 파트너 조회 에러:', error);
      }
      
      console.log('✅ 조회된 파트너 수:', partners?.length || 0);

      if (!partners || partners.length === 0) {
        setPartnerStats([]);
        return;
      }

      const stats: PartnerStats[] = await Promise.all(
        partners.map(async (partner) => {
          // 하위 사용자 조회
          const { data: users } = await supabase
            .from('users')
            .select('id')
            .eq('referrer_id', partner.id);

          const userIds = users?.map(u => u.id) || [];

          // 게임 기록 조회
          const { data: gameRecords } = await supabase
            .from('game_records')
            .select('game_type, bet_amount, win_amount')
            .in('user_id', userIds)
            .gte('played_at', start)
            .lte('played_at', end);

          let casinoBet = 0;
          let slotBet = 0;
          let totalWin = 0;

          gameRecords?.forEach(record => {
            const bet = Math.abs(record.bet_amount || 0);
            const win = record.win_amount || 0;

            if (record.game_type === 'casino') {
              casinoBet += bet;
            } else if (record.game_type === 'slot') {
              slotBet += bet;
            }
            totalWin += win;
          });

          const totalBet = casinoBet + slotBet;
          const totalLoss = totalBet - totalWin;

          // 커미션 정보 (settlements 테이블에서 조회)
          const { data: settlements } = await supabase
            .from('settlements')
            .select('*')
            .eq('partner_id', partner.id)
            .gte('period_start', start.split('T')[0])
            .lte('period_end', end.split('T')[0]);

          let commissionEarned = 0;
          let casinoRollingRate = 0;
          let casinoLosingRate = 0;
          let slotRollingRate = 0;
          let slotLosingRate = 0;
          let casinoRollingCommission = 0;
          let casinoLosingCommission = 0;
          let slotRollingCommission = 0;
          let slotLosingCommission = 0;

          settlements?.forEach(s => {
            commissionEarned += (s.casino_rolling_commission || 0) +
                              (s.casino_losing_commission || 0) +
                              (s.slot_rolling_commission || 0) +
                              (s.slot_losing_commission || 0) +
                              (s.withdrawal_fee_commission || 0);
            casinoRollingRate = s.casino_rolling_rate || 0;
            casinoLosingRate = s.casino_losing_rate || 0;
            slotRollingRate = s.slot_rolling_rate || 0;
            slotLosingRate = s.slot_losing_rate || 0;
            casinoRollingCommission = s.casino_rolling_commission || 0;
            casinoLosingCommission = s.casino_losing_commission || 0;
            slotRollingCommission = s.slot_rolling_commission || 0;
            slotLosingCommission = s.slot_losing_commission || 0;
          });

          // 하위 파트너에게 지급한 커미션
          const { data: childPartners } = await supabase
            .from('partners')
            .select('id')
            .eq('parent_id', partner.id);

          const childIds = childPartners?.map(c => c.id) || [];

          const { data: childSettlements } = await supabase
            .from('settlements')
            .select('*')
            .in('partner_id', childIds)
            .gte('period_start', start.split('T')[0])
            .lte('period_end', end.split('T')[0]);

          let commissionPaid = 0;
          childSettlements?.forEach(s => {
            commissionPaid += (s.casino_rolling_commission || 0) +
                            (s.casino_losing_commission || 0) +
                            (s.slot_rolling_commission || 0) +
                            (s.slot_losing_commission || 0) +
                            (s.withdrawal_fee_commission || 0);
          });

          return {
            id: partner.id,
            username: partner.username,
            level: partner.level,
            partnerType: partner.partner_type,
            totalBet,
            casinoBet,
            slotBet,
            totalWin,
            totalLoss,
            commissionEarned,
            commissionPaid,
            netCommission: commissionEarned - commissionPaid,
            userCount: userIds.length,
            // 커미션 상세 정보
            casinoRollingRate,
            casinoLosingRate,
            slotRollingRate,
            slotLosingRate,
            casinoRollingCommission,
            casinoLosingCommission,
            slotRollingCommission,
            slotLosingCommission
          };
        })
      );

      setPartnerStats(stats);
    } catch (error) {
      console.error('파트너 정산 로드 실패:', error);
      toast.error('파트너 정산 데이터를 불러오는데 실패했습니다.');
    }
  };

  // 3. 회원 정산
  const loadUserStats = async (start: string, end: string) => {
    try {
      // 현재 파트너의 모든 하위 파트너 ID 수집
      console.log('🔍 회원 정산 - 현재 사용자:', user.username, user.id);
      const allDescendantIds = await getAllDescendantPartnerIds(user.id);
      console.log('🔍 회원 정산 - 수집된 하위 파트너 IDs (자기 자신 포함):', allDescendantIds);
      
      // 하위 파트너들의 회원만 조회
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .in('referrer_id', allDescendantIds)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('❌ 회원 조회 에러:', error);
      }
      
      console.log('✅ 조회된 회원 수:', users?.length || 0);
      if (users && users.length > 0) {
        console.log('📋 회원 샘플:', users.slice(0, 3).map(u => ({ username: u.username, referrer_id: u.referrer_id })));
      }

      if (!users || users.length === 0) {
        setUserStats([]);
        return;
      }

      const stats: UserStats[] = await Promise.all(
        users.map(async (userItem) => {
          // 입출금 통계
          const { data: transactions } = await supabase
            .from('transactions')
            .select('type, amount')
            .eq('user_id', userItem.id)
            .gte('created_at', start)
            .lte('created_at', end);

          let totalDeposit = 0;
          let totalWithdrawal = 0;

          transactions?.forEach(tx => {
            if (tx.type === 'deposit' || tx.type === 'forced_deposit') {
              totalDeposit += tx.amount;
            } else if (tx.type === 'withdrawal' || tx.type === 'forced_withdrawal') {
              totalWithdrawal += tx.amount;
            }
          });

          // 게임 통계
          const { data: gameRecords } = await supabase
            .from('game_records')
            .select('game_type, bet_amount, win_amount, played_at')
            .eq('user_id', userItem.id)
            .gte('played_at', start)
            .lte('played_at', end)
            .order('played_at', { ascending: false })
            .limit(1);

          let casinoBet = 0;
          let slotBet = 0;
          let casinoWin = 0;
          let slotWin = 0;
          let lastPlayedAt: string | null = null;

          const { data: allRecords } = await supabase
            .from('game_records')
            .select('game_type, bet_amount, win_amount')
            .eq('user_id', userItem.id)
            .gte('played_at', start)
            .lte('played_at', end);

          allRecords?.forEach(record => {
            const bet = Math.abs(record.bet_amount || 0);
            const win = record.win_amount || 0;

            if (record.game_type === 'casino') {
              casinoBet += bet;
              casinoWin += win;
            } else if (record.game_type === 'slot') {
              slotBet += bet;
              slotWin += win;
            }
          });

          if (gameRecords && gameRecords.length > 0) {
            lastPlayedAt = gameRecords[0].played_at;
          }

          return {
            id: userItem.id,
            username: userItem.username,
            totalDeposit,
            totalWithdrawal,
            casinoBet,
            slotBet,
            casinoWin,
            slotWin,
            balance: userItem.balance || 0,
            point: userItem.point || 0,
            lastPlayedAt,
            // 커미션 상세 정보
            casinoRollingRate: 0,
            casinoLosingRate: 0,
            slotRollingRate: 0,
            slotLosingRate: 0,
            casinoRollingCommission: 0,
            casinoLosingCommission: 0,
            slotRollingCommission: 0,
            slotLosingCommission: 0
          };
        })
      );

      setUserStats(stats);
    } catch (error) {
      console.error('회원 정산 로드 실패:', error);
      toast.error('회원 정산 데이터를 불러오는데 실패했습니다.');
    }
  };

  // 4. 게임별 리포트
  const loadGameTypeStats = async (start: string, end: string) => {
    const { data: gameRecords } = await supabase
      .from('game_records')
      .select('game_type, bet_amount, win_amount, provider_name, game_name')
      .gte('played_at', start)
      .lte('played_at', end);

    const gameStats: { [key: string]: { totalBet: number, totalWin: number, totalLoss: number, profit: number, playCount: number } } = {};

    gameRecords?.forEach(record => {
      const bet = Math.abs(record.bet_amount || 0);
      const win = record.win_amount || 0;
      const gameType = record.game_type;
      const providerName = record.provider_name || 'Unknown';
      const gameName = record.game_name || 'Unknown';

      const key = `${gameType}-${providerName}-${gameName}`;

      if (!gameStats[key]) {
        gameStats[key] = {
          totalBet: 0,
          totalWin: 0,
          totalLoss: 0,
          profit: 0,
          playCount: 0
        };
      }

      gameStats[key].totalBet += bet;
      gameStats[key].totalWin += win;
      gameStats[key].totalLoss += bet - win;
      gameStats[key].profit += bet - win;
      gameStats[key].playCount += 1;
    });

    const stats: GameTypeStats[] = Object.keys(gameStats).map(key => {
      const [gameType, providerName, gameName] = key.split('-');
      return {
        gameName,
        providerName,
        totalBet: gameStats[key].totalBet,
        totalWin: gameStats[key].totalWin,
        totalLoss: gameStats[key].totalLoss,
        profit: gameStats[key].profit,
        playCount: gameStats[key].playCount
      };
    });

    setGameTypeStats(stats);
  };

  // 5. 일자별 리포트
  const loadDailyStats = async (start: string, end: string) => {
    try {
      console.log('🔍 일자별 리포트 - 현재 사용자:', user.username, user.id);
      
      // 현재 사용자의 모든 하위 파트너 ID 수집 (자기 자신 포함)
      const allDescendantPartnerIds = await getAllDescendantPartnerIds(user.id);
      console.log('🔍 일자별 리포트 - 수집된 하위 파트너 IDs:', allDescendantPartnerIds);
      
      // 하위 파트너들의 사용자 조회
      const { data: users } = await supabase
        .from('users')
        .select('id')
        .in('referrer_id', allDescendantPartnerIds);
      
      const userIds = users?.map(u => u.id) || [];
      console.log('🔍 일자별 리포트 - 조직 내 사용자 수:', userIds.length);
      
      if (userIds.length === 0) {
        console.log('⚠️ 조직 내 사용자가 없습니다.');
        setDailyStats([]);
        return;
      }
      
      // 날짜별로 그룹화하여 통계 생성
      const startDate = new Date(start);
      const endDate = new Date(end);
      const dailyData: DailyStats[] = [];

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);

        // 입출금 (조직 내 사용자만)
        const { data: transactions } = await supabase
          .from('transactions')
          .select('type, amount')
          .in('user_id', userIds)
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString());

        let totalDeposit = 0;
        let totalWithdrawal = 0;

        transactions?.forEach(tx => {
          if (tx.type === 'deposit' || tx.type === 'forced_deposit') {
            totalDeposit += tx.amount;
          } else if (tx.type === 'withdrawal' || tx.type === 'forced_withdrawal') {
            totalWithdrawal += tx.amount;
          }
        });

        // 게임 통계 (조직 내 사용자만)
        const { data: gameRecords } = await supabase
          .from('game_records')
          .select('bet_amount, win_amount, user_id')
          .in('user_id', userIds)
          .gte('played_at', dayStart.toISOString())
          .lte('played_at', dayEnd.toISOString());

        let totalBet = 0;
        let totalWin = 0;
        const uniqueUsers = new Set<string>();

        gameRecords?.forEach(record => {
          const bet = Math.abs(record.bet_amount || 0);
          const win = record.win_amount || 0;
          totalBet += bet;
          totalWin += win;
          uniqueUsers.add(record.user_id);
        });

        const totalLoss = totalBet - totalWin;
        const netProfit = totalDeposit - totalWithdrawal + totalLoss;

        dailyData.push({
          date: format(d, 'yyyy-MM-dd'),
          totalDeposit,
          totalWithdrawal,
          totalBet,
          totalWin,
          totalLoss,
          netProfit,
          userCount: uniqueUsers.size,
          gameCount: gameRecords?.length || 0
        });
      }

      console.log('✅ 일자별 데이터 생성 완료:', dailyData.length, '일');
      setDailyStats(dailyData);
    } catch (error) {
      console.error('일자별 리포트 로드 실패:', error);
      toast.error('일자별 리포트 데이터를 불러오는데 실패했습니다.');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl text-white mb-3">
            정산 관리
          </h1>
          <p className="text-xl text-slate-400">
            통합 정산 데이터 분석 및 리포트
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40 bg-slate-800 border-slate-700 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">오늘</SelectItem>
              <SelectItem value="yesterday">어제</SelectItem>
              <SelectItem value="week">최근 7일</SelectItem>
              <SelectItem value="month">최근 30일</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={loadData}
            disabled={loading}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 h-12 px-6"
          >
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* 탭 메뉴 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="bg-slate-800/30 rounded-xl p-1.5 border border-slate-700/40">
          <TabsList className="bg-transparent h-auto p-0 border-0 gap-2 w-full grid grid-cols-5">
            <TabsTrigger
              value="top-level"
              className="bg-transparent text-slate-400 text-lg rounded-lg px-6 py-4 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500/20 data-[state=active]:to-cyan-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20 data-[state=active]:border data-[state=active]:border-blue-400/30 transition-all duration-200"
            >
              최상위 정산
            </TabsTrigger>
            <TabsTrigger
              value="partner"
              className="bg-transparent text-slate-400 text-lg rounded-lg px-6 py-4 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500/20 data-[state=active]:to-pink-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 data-[state=active]:border data-[state=active]:border-purple-400/30 transition-all duration-200"
            >
              파트너 정산
            </TabsTrigger>
            <TabsTrigger
              value="user"
              className="bg-transparent text-slate-400 text-lg rounded-lg px-6 py-4 data-[state=active]:bg-gradient-to-br data-[state=active]:from-green-500/20 data-[state=active]:to-emerald-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-green-500/20 data-[state=active]:border data-[state=active]:border-green-400/30 transition-all duration-200"
            >
              회원 정산
            </TabsTrigger>
            <TabsTrigger
              value="game-type"
              className="bg-transparent text-slate-400 text-lg rounded-lg px-6 py-4 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500/20 data-[state=active]:to-amber-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-orange-500/20 data-[state=active]:border data-[state=active]:border-orange-400/30 transition-all duration-200"
            >
              게임별 리포트
            </TabsTrigger>
            <TabsTrigger
              value="daily"
              className="bg-transparent text-slate-400 text-lg rounded-lg px-6 py-4 data-[state=active]:bg-gradient-to-br data-[state=active]:from-pink-500/20 data-[state=active]:to-rose-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-pink-500/20 data-[state=active]:border data-[state=active]:border-pink-400/30 transition-all duration-200"
            >
              일자별 리포트
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. 최상위 정산 */}
        <TabsContent value="top-level" className="space-y-6">
          {topLevelStats && (
            <>
              <div className="grid grid-cols-4 gap-6">
                <Card className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border-blue-500/40">
                  <CardContent className="pt-8 pb-8">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-lg text-slate-300">총 입금</p>
                      <ArrowDownCircle className="h-6 w-6 text-blue-400" />
                    </div>
                    <p className="text-5xl text-white font-bold">
                      ₩{topLevelStats.totalDeposit.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-red-900/30 to-red-800/30 border-red-500/40">
                  <CardContent className="pt-8 pb-8">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-lg text-slate-300">총 출금</p>
                      <ArrowUpCircle className="h-6 w-6 text-red-400" />
                    </div>
                    <p className="text-5xl text-white font-bold">
                      ₩{topLevelStats.totalWithdrawal.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border-purple-500/40">
                  <CardContent className="pt-8 pb-8">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-lg text-slate-300">총 베팅</p>
                      <Trophy className="h-6 w-6 text-purple-400" />
                    </div>
                    <p className="text-5xl text-white font-bold">
                      ₩{(topLevelStats.totalCasinoBet + topLevelStats.totalSlotBet).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/30 border-emerald-500/40">
                  <CardContent className="pt-8 pb-8">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-lg text-slate-300">순이익</p>
                      <TrendingUp className="h-6 w-6 text-emerald-400" />
                    </div>
                    <p className="text-5xl text-white font-bold">
                      ₩{topLevelStats.netProfit.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-2xl text-white flex items-center gap-2">
                      🎰 카지노 통계
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-slate-900/40 rounded">
                      <span className="text-lg text-slate-300">총 베팅:</span>
                      <span className="text-2xl text-white font-bold">₩{topLevelStats.totalCasinoBet.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-slate-900/40 rounded">
                      <span className="text-lg text-slate-300">총 당첨:</span>
                      <span className="text-2xl text-emerald-400 font-bold">₩{topLevelStats.totalCasinoWin.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-slate-900/40 rounded">
                      <span className="text-lg text-slate-300">총 손실:</span>
                      <span className="text-2xl text-red-400 font-bold">₩{topLevelStats.totalCasinoLoss.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-2xl text-white flex items-center gap-2">
                      🎲 슬롯 통계
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-slate-900/40 rounded">
                      <span className="text-lg text-slate-300">총 베팅:</span>
                      <span className="text-2xl text-white font-bold">₩{topLevelStats.totalSlotBet.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-slate-900/40 rounded">
                      <span className="text-lg text-slate-300">총 당첨:</span>
                      <span className="text-2xl text-emerald-400 font-bold">₩{topLevelStats.totalSlotWin.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-slate-900/40 rounded">
                      <span className="text-lg text-slate-300">총 손실:</span>
                      <span className="text-2xl text-red-400 font-bold">₩{topLevelStats.totalSlotLoss.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* 2. 파트너 정산 */}
        <TabsContent value="partner" className="space-y-6">
          <div className="flex items-center gap-3">
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700 h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 레벨</SelectItem>
                {user.level < 2 && <SelectItem value="2">운영사</SelectItem>}
                {user.level < 3 && <SelectItem value="3">본사</SelectItem>}
                {user.level < 4 && <SelectItem value="4">부본사</SelectItem>}
                {user.level < 5 && <SelectItem value="5">총판</SelectItem>}
                {user.level < 6 && <SelectItem value="6">매장</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900/50">
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-5 text-base text-slate-300">파트너명</th>
                      <th className="text-left p-5 text-base text-slate-300">권한</th>
                      <th className="text-right p-5 text-base text-slate-300">총 베팅</th>
                      <th className="text-right p-5 text-base text-slate-300">카지노</th>
                      <th className="text-right p-5 text-base text-slate-300">슬롯</th>
                      <th className="text-right p-5 text-base text-slate-300">손실</th>
                      <th className="text-right p-5 text-base text-slate-300">수입 커미션</th>
                      <th className="text-right p-5 text-base text-slate-300">지급 커미션</th>
                      <th className="text-right p-5 text-base text-slate-300">순 커미션</th>
                      <th className="text-right p-5 text-base text-slate-300">회원수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerStats.map((partner) => (
                      <tr key={partner.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="p-5 text-base text-white font-medium">{partner.username}</td>
                        <td className="p-5 text-base text-slate-300">{getPartnerTypeName(partner.partnerType)}</td>
                        <td className="p-5 text-right text-lg text-white font-semibold">₩{partner.totalBet.toLocaleString()}</td>
                        <td className="p-5 text-right">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="text-lg text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5 rounded flex items-center gap-2 ml-auto cursor-pointer transition-colors">
                                ₩{partner.casinoBet.toLocaleString()}
                                <Info className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 bg-slate-900 border-slate-700">
                              <div className="space-y-3">
                                <h4 className="text-white font-semibold mb-2">🎰 카지노 커미션 상세</h4>
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                    <span className="text-slate-300">롤링 요율:</span>
                                    <span className="text-cyan-400 font-semibold">{partner.casinoRollingRate}%</span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                    <span className="text-slate-300">롤링 커미션:</span>
                                    <span className="text-emerald-400 font-semibold">₩{partner.casinoRollingCommission.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                    <span className="text-slate-300">루징 요율:</span>
                                    <span className="text-cyan-400 font-semibold">{partner.casinoLosingRate}%</span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                    <span className="text-slate-300">루징 커미션:</span>
                                    <span className="text-emerald-400 font-semibold">₩{partner.casinoLosingCommission.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </td>
                        <td className="p-5 text-right">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="text-lg text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5 rounded flex items-center gap-2 ml-auto cursor-pointer transition-colors">
                                ₩{partner.slotBet.toLocaleString()}
                                <Info className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 bg-slate-900 border-slate-700">
                              <div className="space-y-3">
                                <h4 className="text-white font-semibold mb-2">🎲 슬롯 커미션 상세</h4>
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                    <span className="text-slate-300">롤링 요율:</span>
                                    <span className="text-cyan-400 font-semibold">{partner.slotRollingRate}%</span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                    <span className="text-slate-300">롤링 커미션:</span>
                                    <span className="text-emerald-400 font-semibold">₩{partner.slotRollingCommission.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                    <span className="text-slate-300">루징 요율:</span>
                                    <span className="text-cyan-400 font-semibold">{partner.slotLosingRate}%</span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                    <span className="text-slate-300">루징 커미션:</span>
                                    <span className="text-emerald-400 font-semibold">₩{partner.slotLosingCommission.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </td>
                        <td className="p-5 text-right text-lg text-red-400 font-semibold">₩{partner.totalLoss.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-emerald-400 font-semibold">₩{partner.commissionEarned.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-orange-400 font-semibold">₩{partner.commissionPaid.toLocaleString()}</td>
                        <td className="p-5 text-right text-xl text-cyan-400 font-bold">₩{partner.netCommission.toLocaleString()}</td>
                        <td className="p-5 text-right text-base text-slate-400">{partner.userCount}명</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. 회원 정산 */}
        <TabsContent value="user" className="space-y-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900/50">
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-5 text-base text-slate-300">아이디</th>
                      <th className="text-right p-5 text-base text-slate-300">입금</th>
                      <th className="text-right p-5 text-base text-slate-300">출금</th>
                      <th className="text-right p-5 text-base text-slate-300">카지노 베팅</th>
                      <th className="text-right p-5 text-base text-slate-300">슬롯 베팅</th>
                      <th className="text-right p-5 text-base text-slate-300">보유머니</th>
                      <th className="text-right p-5 text-base text-slate-300">보유포인트</th>
                      <th className="text-right p-5 text-base text-slate-300">최근 플레이</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userStats.map((user) => (
                      <tr key={user.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="p-5 text-base text-white font-medium">{user.username}</td>
                        <td className="p-5 text-right text-lg text-blue-400 font-semibold">₩{user.totalDeposit.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-red-400 font-semibold">₩{user.totalWithdrawal.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-slate-300">₩{user.casinoBet.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-slate-300">₩{user.slotBet.toLocaleString()}</td>
                        <td className="p-5 text-right text-xl text-emerald-400 font-bold">₩{user.balance.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-yellow-400 font-semibold">
                          <span className="flex items-center justify-end gap-1">
                            <Coins className="h-5 w-5" />
                            {user.point.toLocaleString()}P
                          </span>
                        </td>
                        <td className="p-5 text-right text-base text-slate-400">
                          {user.lastPlayedAt ? format(new Date(user.lastPlayedAt), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. 게임별 리포트 */}
        <TabsContent value="game-type" className="space-y-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900/50">
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-5 text-base text-slate-300">게임명</th>
                      <th className="text-left p-5 text-base text-slate-300">제공사</th>
                      <th className="text-right p-5 text-base text-slate-300">총 베팅</th>
                      <th className="text-right p-5 text-base text-slate-300">총 당첨</th>
                      <th className="text-right p-5 text-base text-slate-300">손실</th>
                      <th className="text-right p-5 text-base text-slate-300">순이익</th>
                      <th className="text-right p-5 text-base text-slate-300">플레이 횟수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameTypeStats.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-10 text-center text-slate-400 text-lg">
                          해당 기간에 게임 기록이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      gameTypeStats
                        .sort((a, b) => b.totalBet - a.totalBet)
                        .map((game, index) => (
                          <tr key={`${game.gameName}-${game.providerName}-${index}`} className="border-b border-slate-800 hover:bg-slate-800/30">
                            <td className="p-5 text-base text-white font-medium">{game.gameName}</td>
                            <td className="p-5 text-base text-slate-300">{game.providerName}</td>
                            <td className="p-5 text-right text-lg text-white font-semibold">₩{game.totalBet.toLocaleString()}</td>
                            <td className="p-5 text-right text-lg text-emerald-400 font-semibold">₩{game.totalWin.toLocaleString()}</td>
                            <td className="p-5 text-right text-lg text-red-400 font-semibold">₩{game.totalLoss.toLocaleString()}</td>
                            <td className="p-5 text-right text-xl text-cyan-400 font-bold">₩{game.profit.toLocaleString()}</td>
                            <td className="p-5 text-right text-base text-slate-400">{game.playCount.toLocaleString()}회</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. 일자별 리포트 */}
        <TabsContent value="daily" className="space-y-6">
          {/* 날짜 필터 */}
          <div className="flex items-center gap-4 bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-3">
              <Calendar className="h-6 w-6 text-cyan-400" />
              <span className="text-lg text-slate-300">기간 선택:</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-400">시작일</label>
                <input
                  type="date"
                  value={dailyStartDate}
                  onChange={(e) => setDailyStartDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                />
              </div>
              
              <span className="text-slate-500 text-xl mt-6">~</span>
              
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-400">종료일</label>
                <input
                  type="date"
                  value={dailyEndDate}
                  onChange={(e) => setDailyEndDate(e.target.value)}
                  max={today}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                />
              </div>
            </div>
            
            <Button
              onClick={() => {
                const start = new Date(dailyStartDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(dailyEndDate);
                end.setHours(23, 59, 59, 999);
                loadDailyStats(start.toISOString(), end.toISOString());
              }}
              disabled={loading}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 h-12 px-8 mt-6"
            >
              <Filter className="h-5 w-5 mr-2" />
              조회
            </Button>
          </div>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900/50">
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-5 text-base text-slate-300">날짜</th>
                      <th className="text-right p-5 text-base text-slate-300">입금</th>
                      <th className="text-right p-5 text-base text-slate-300">출금</th>
                      <th className="text-right p-5 text-base text-slate-300">베팅</th>
                      <th className="text-right p-5 text-base text-slate-300">당첨</th>
                      <th className="text-right p-5 text-base text-slate-300">손실</th>
                      <th className="text-right p-5 text-base text-slate-300">순이익</th>
                      <th className="text-right p-5 text-base text-slate-300">활성 회원</th>
                      <th className="text-right p-5 text-base text-slate-300">게임 횟수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyStats.map((day) => (
                      <tr key={day.date} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="p-5 text-base text-white font-semibold">{day.date}</td>
                        <td className="p-5 text-right text-lg text-blue-400 font-semibold">₩{day.totalDeposit.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-red-400 font-semibold">₩{day.totalWithdrawal.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-slate-300">₩{day.totalBet.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-emerald-400 font-semibold">₩{day.totalWin.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-orange-400 font-semibold">₩{day.totalLoss.toLocaleString()}</td>
                        <td className={`p-5 text-right text-xl font-bold ${day.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          ₩{day.netProfit.toLocaleString()}
                        </td>
                        <td className="p-5 text-right text-base text-slate-400">{day.userCount}명</td>
                        <td className="p-5 text-right text-base text-slate-400">{day.gameCount.toLocaleString()}회</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AdvancedSettlement;