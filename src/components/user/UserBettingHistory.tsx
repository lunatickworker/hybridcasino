import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RefreshCw, Gamepad2, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';

interface UserBettingHistoryProps {
  user: {
    id: string;
    username: string;
  } | null;
}

interface BettingRecord {
  id: string;
  external_txid: string;
  username: string;
  game_id: number;
  provider_id: number;
  game_title: string;
  provider_name: string;
  bet_amount: number;
  win_amount: number;
  balance_before: number;
  balance_after: number;
  played_at: string;
  api_type?: string;
}

export function UserBettingHistory({ user }: UserBettingHistoryProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<BettingRecord[]>([]);
  
  // Guard against null user - AFTER all hooks
  if (!user) {
    return (
      <Card className="bg-[#1a1f3a] border-purple-900/30 text-white">
        <CardContent className="p-8 text-center">
          <p className="text-gray-400">사용자 정보를 불러올 수 없습니다.</p>
        </CardContent>
      </Card>
    );
  }
  
  // 날짜 포맷
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    const seconds = String(d.getUTCSeconds()).padStart(2, '0');
    return `${year}년${month}월${day}일 ${hours}:${minutes}:${seconds}`;
  };

  // 금액 포맷
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount || 0);
  };

  // 데이터 로드
  const loadRecords = async () => {
    try {
      setLoading(true);
      console.log('🎮 베팅내역 조회 시작:', user.username);

      // ✅ game_title과 provider_name은 이미 DB에 저장되어 있으므로 JOIN 불필요
      const { data, error } = await supabase
        .from('game_records')
        .select(`
          id,
          external_txid,
          username,
          game_id,
          provider_id,
          game_title,
          provider_name,
          bet_amount,
          win_amount,
          balance_before,
          balance_after,
          played_at,
          api_type
        `)
        .eq('username', user.username)
        .order('played_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('❌ 조회 실패:', error);
        throw error;
      }

      console.log('✅ 조회 성공:', data?.length || 0, '건');
      
      // ⭐ game_title/provider_name이 없는 경우 fallback 처리
      const mappedRecords = (data || []).map((record: any) => ({
        ...record,
        game_title: record.game_title || `Game ${record.game_id || 'Unknown'}`,
        provider_name: record.provider_name || `Provider ${record.provider_id || 'Unknown'}`,
      }));
      
      setRecords(mappedRecords);

    } catch (err: any) {
      console.error('❌ 에러:', err);
      toast.error(t.bettingHistory.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  // 초기 로드
  useEffect(() => {
    loadRecords();
  }, [user.username]);

  // ⭐ Realtime 구독: 새로운 베팅 기록 자동 반영
  useEffect(() => {
    const channel = supabase
      .channel('user-betting-records')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_records',
          filter: `username=eq.${user.username}`
        },
        (payload) => {
          console.log('🎮 새로운 베팅 기록:', payload);
          loadRecords(); // 새 기록 추가 시 전체 다시 로드
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.username]);

  // 통계 계산
  const stats = {
    totalBets: records.length,
    totalBetAmount: records.reduce((sum, r) => sum + Math.abs(Number(r.bet_amount) || 0), 0),
    totalWinAmount: records.reduce((sum, r) => sum + (Number(r.win_amount) || 0), 0),
    netProfit: 0
  };
  // ✅ 손익 = 당첨금액 - 베팅금액 (가장 직관적인 계산)
  stats.netProfit = records.reduce((sum, r) => {
    const winAmount = Number(r.win_amount) || 0;
    const betAmount = Math.abs(Number(r.bet_amount) || 0);
    return sum + (winAmount - betAmount);
  }, 0);

  // 상태 배지
  const getStatusBadge = (winAmount: number, betAmount: number) => {
    const profit = winAmount - betAmount;
    if (profit > 0) return <Badge className="bg-green-600">{t.user.win}</Badge>;
    if (profit < 0) return <Badge className="bg-red-600">{t.user.loss}</Badge>;
    return <Badge variant="secondary">{t.user.pending}</Badge>;
  };

  return (
    <div className="min-h-screen text-white p-6" style={{ fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif' }}>
      <div className="flex gap-6 justify-center">
        <div className="flex-1" style={{ maxWidth: '70%' }}>
          {/* 제목 */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1.5 h-8 bg-gradient-to-b from-purple-400 to-pink-500"></div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">베팅 내역</h1>
            </div>
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-slate-800/50 border-slate-700 rounded-none">
              <CardContent className="p-4 text-center">
                <Gamepad2 className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{stats.totalBets}건</div>
                <div className="text-sm text-slate-400">총 베팅횟수</div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 rounded-none">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">₩{formatMoney(stats.totalBetAmount)}</div>
                <div className="text-sm text-slate-400">총 베팅액</div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 rounded-none">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">₩{formatMoney(stats.totalWinAmount)}</div>
                <div className="text-sm text-slate-400">총 당첨액</div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 rounded-none">
              <CardContent className="p-4 text-center">
                <TrendingDown className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <div className={`text-2xl font-bold ${stats.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.netProfit >= 0 ? '+' : ''}₩{formatMoney(stats.netProfit)}
                </div>
                <div className="text-sm text-slate-400">순 손익</div>
              </CardContent>
            </Card>
          </div>

          {/* 베팅 내역 테이블 */}
          <Card className="bg-slate-800/50 border-slate-700 rounded-none">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl font-bold text-white">베팅내역</CardTitle>
                  <p className="text-sm text-slate-400 mt-1">최근 100건</p>
                </div>
                <Button
                  onClick={loadRecords}
                  disabled={loading}
                  variant="outline"
                  size="sm"
                  className="border-slate-600 hover:bg-slate-700/50 text-white"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  새로고침
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center py-20">
                  <div className="text-center">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-purple-400" />
                    <p className="text-slate-300 text-lg">로딩 중...</p>
                  </div>
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-20">
                  <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-slate-300 text-xl font-semibold mb-2">베팅 기록이 없습니다</p>
                  <p className="text-slate-400 text-sm">게임을 플레이하면 기록이 표시됩니다</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="px-4 py-4 text-left text-sm font-semibold text-slate-300">상태</th>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-slate-300">게임명</th>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-slate-300">제공사</th>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-slate-300">베팅금액</th>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-slate-300">당첨금액</th>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-slate-300">손익</th>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-slate-300">플레이 시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => {
                        const betAmount = Math.abs(Number(record.bet_amount) || 0);
                        const winAmount = Number(record.win_amount) || 0;
                        const profit = winAmount - betAmount;

                        return (
                          <tr
                            key={record.id}
                            className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                          >
                            <td className="px-4 py-4">
                              {getStatusBadge(winAmount, betAmount)}
                            </td>
                            <td className="px-4 py-4 text-white text-base font-medium max-w-[200px] truncate">
                              {record.game_title || `Game ${record.game_id}`}
                            </td>
                            <td className="px-4 py-4">
                              <Badge variant="secondary" className="text-sm bg-slate-700/50 text-slate-300 border-slate-600">
                                {record.provider_name || `Provider ${record.provider_id}`}
                              </Badge>
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-base text-blue-400 font-semibold">
                              ₩{formatMoney(betAmount)}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-base text-green-400 font-semibold">
                              {winAmount === 0 ? '-' : `₩${formatMoney(winAmount)}`}
                            </td>
                            <td className={`px-4 py-4 text-right font-mono text-base font-semibold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {profit >= 0 ? '+' : ''}₩{formatMoney(profit)}
                            </td>
                            <td className="px-4 py-4 text-slate-300 text-sm">
                              {formatDate(record.played_at)}
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
      </div>
    </div>
  );
}