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
  };
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
}

export function UserBettingHistory({ user }: UserBettingHistoryProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<BettingRecord[]>([]);

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

      const { data, error } = await supabase
        .from('game_records')
        .select('*')
        .eq('username', user.username)
        .order('played_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('❌ 조회 실패:', error);
        throw error;
      }

      console.log('✅ 조회 성공:', data?.length || 0, '건');
      setRecords(data || []);

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

  // 통계 계산
  const stats = {
    totalBets: records.length,
    totalBetAmount: records.reduce((sum, r) => sum + (Number(r.bet_amount) || 0), 0),
    totalWinAmount: records.reduce((sum, r) => sum + (Number(r.win_amount) || 0), 0),
    netProfit: 0
  };
  stats.netProfit = stats.totalWinAmount - stats.totalBetAmount;

  // 상태 배지
  const getStatusBadge = (bet: number, win: number) => {
    const profit = win - bet;
    if (profit > 0) return <Badge className="bg-green-600">{t.user.win}</Badge>;
    if (profit < 0) return <Badge className="bg-red-600">{t.user.loss}</Badge>;
    return <Badge variant="secondary">{t.user.pending}</Badge>;
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="luxury-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-yellow-400 flex items-center gap-1">
              <Gamepad2 className="w-3 h-3" />
              {t.bettingHistory.totalBets}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-yellow-100">{stats.totalBets}{t.bettingManagement.count}</div>
          </CardContent>
        </Card>

        <Card className="luxury-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-yellow-400">{t.bettingHistory.totalBetAmount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-blue-400">₩{formatMoney(stats.totalBetAmount)}</div>
          </CardContent>
        </Card>

        <Card className="luxury-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-yellow-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {t.bettingHistory.totalWinAmount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-400">₩{formatMoney(stats.totalWinAmount)}</div>
          </CardContent>
        </Card>

        <Card className="luxury-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-yellow-400 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              {t.bettingHistory.netProfit}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${stats.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.netProfit >= 0 ? '+' : ''}₩{formatMoney(stats.netProfit)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 베팅 내역 */}
      <Card className="luxury-card">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="gold-text">{t.user.bettingHistoryTitle}</CardTitle>
              <p className="text-xs text-yellow-200/70 mt-1">{t.bettingHistory.last100 || '최근 100건'}</p>
            </div>
            <Button
              onClick={loadRecords}
              disabled={loading}
              variant="outline"
              size="sm"
              className="border-yellow-600/30 hover:bg-yellow-900/20"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t.common.refresh}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-yellow-400" />
                <p className="text-yellow-200">{t.common.loading}</p>
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-20">
              <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-yellow-600/50" />
              <p className="text-yellow-200/70 text-lg">{t.user.noBettingHistory}</p>
              <p className="text-yellow-200/50 text-sm mt-2">{t.bettingHistory.playToSeeRecords || '게임을 플레이하면 기록이 표시됩니다'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-yellow-600/30">
                    <th className="px-3 py-3 text-left text-xs text-yellow-400">{t.common.status}</th>
                    <th className="px-3 py-3 text-left text-xs text-yellow-400">{t.user.gameName}</th>
                    <th className="px-3 py-3 text-left text-xs text-yellow-400">{t.bettingHistory.provider}</th>
                    <th className="px-3 py-3 text-right text-xs text-yellow-400">{t.user.betAmount}</th>
                    <th className="px-3 py-3 text-right text-xs text-yellow-400">{t.user.winAmount}</th>
                    <th className="px-3 py-3 text-right text-xs text-yellow-400">{t.bettingHistory.profitLoss}</th>
                    <th className="px-3 py-3 text-left text-xs text-yellow-400">{t.bettingHistory.playTime}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const betAmount = Number(record.bet_amount) || 0;
                    const winAmount = Number(record.win_amount) || 0;
                    const profit = winAmount - betAmount;

                    return (
                      <tr
                        key={record.id}
                        className="border-b border-yellow-600/10 hover:bg-yellow-900/10 transition-colors"
                      >
                        <td className="px-3 py-3">
                          {getStatusBadge(betAmount, winAmount)}
                        </td>
                        <td className="px-3 py-3 text-yellow-100 text-sm max-w-[150px] truncate">
                          {record.game_title || `Game ${record.game_id}`}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="secondary" className="text-xs">
                            {record.provider_name || `Provider ${record.provider_id}`}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-sm text-blue-400">
                          ₩{formatMoney(betAmount)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-sm text-green-400">
                          ₩{formatMoney(winAmount)}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono text-sm ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {profit >= 0 ? '+' : ''}₩{formatMoney(profit)}
                        </td>
                        <td className="px-3 py-3 text-yellow-100 text-xs">
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
  );
}
