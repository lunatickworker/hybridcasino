import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../lib/supabase';
import { Partner } from '../../types';
import {
  Coins,
  RefreshCw,
  Calendar,
  Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useLanguage } from '../../contexts/LanguageContext';

interface UserSettlementProps {
  user: Partner;
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

function UserSettlement({ user }: UserSettlementProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('today');
  const [userStats, setUserStats] = useState<UserStats[]>([]);

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
    loadUserStats();
  }, [dateRange]);

  const loadUserStats = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      
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
            // 커미션 정보
            casinoRollingRate: userItem.casino_rolling_rate || 0,
            casinoLosingRate: userItem.casino_losing_rate || 0,
            slotRollingRate: userItem.slot_rolling_rate || 0,
            slotLosingRate: userItem.slot_losing_rate || 0,
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-white mb-2">회원별 정산</h1>
          <p className="text-xl text-slate-400">
            하위 조직의 회원별 상세 정산 내역을 확인합니다
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
              <Calendar className="h-5 w-5 mr-2" />
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
            onClick={loadUserStats}
            disabled={loading}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
          >
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* 데이터 테이블 */}
      {loading ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-20">
            <div className="flex flex-col items-center justify-center gap-4">
              <RefreshCw className="h-12 w-12 text-cyan-400 animate-spin" />
              <p className="text-xl text-slate-400">데이터를 불러오는 중...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
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
                  {userStats.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-400 text-lg">
                        해당 기간에 회원 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    userStats.map((userItem) => (
                      <tr key={userItem.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="p-5 text-base text-white font-medium">{userItem.username}</td>
                        <td className="p-5 text-right text-lg text-blue-400 font-semibold">₩{userItem.totalDeposit.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-red-400 font-semibold">₩{userItem.totalWithdrawal.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-slate-300">₩{userItem.casinoBet.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-slate-300">₩{userItem.slotBet.toLocaleString()}</td>
                        <td className="p-5 text-right text-xl text-emerald-400 font-bold">₩{userItem.balance.toLocaleString()}</td>
                        <td className="p-5 text-right text-lg text-yellow-400 font-semibold">
                          <span className="flex items-center justify-end gap-1">
                            <Coins className="h-5 w-5" />
                            {userItem.point.toLocaleString()}P
                          </span>
                        </td>
                        <td className="p-5 text-right text-base text-slate-400">
                          {userItem.lastPlayedAt ? format(new Date(userItem.lastPlayedAt), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default UserSettlement;
