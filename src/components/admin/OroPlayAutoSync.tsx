import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { RefreshCw, PlayCircle, PauseCircle, Activity } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId } from '../../utils/supabase';

const SUPABASE_URL = `https://${projectId}.supabase.co`;
const SERVER_URL = `${SUPABASE_URL}/functions/v1/server`;

interface SyncStats {
  lastSyncTime: string | null;
  totalSynced: number;
  totalErrors: number;
  isRunning: boolean;
  syncCount: number;
}

export function OroPlayAutoSync() {
  const [stats, setStats] = useState<SyncStats>({
    lastSyncTime: null,
    totalSynced: 0,
    totalErrors: 0,
    isRunning: false,
    syncCount: 0
  });
  const [manualSyncing, setManualSyncing] = useState(false);

  // 4초마다 자동 동기화
  useEffect(() => {
    if (!stats.isRunning) return;

    const syncBets = async () => {
      try {
        console.log('🔄 [OroPlay Auto Sync] 베팅 기록 동기화 시작...');

        const response = await fetch(`${SERVER_URL}/sync/oroplay-bets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          console.error('❌ [OroPlay Auto Sync] 동기화 에러:', response.status);
          setStats(prev => ({
            ...prev,
            totalErrors: prev.totalErrors + 1,
            lastSyncTime: new Date().toISOString()
          }));
          return;
        }

        const data = await response.json();
        console.log('✅ [OroPlay Auto Sync] 동기화 완료:', data);

        setStats(prev => ({
          ...prev,
          totalSynced: prev.totalSynced + (data?.synced || 0),
          totalErrors: prev.totalErrors + (data?.errors || 0),
          lastSyncTime: new Date().toISOString(),
          syncCount: prev.syncCount + 1
        }));

      } catch (error) {
        console.error('❌ [OroPlay Auto Sync] 예외 발생:', error);
        setStats(prev => ({
          ...prev,
          totalErrors: prev.totalErrors + 1,
          lastSyncTime: new Date().toISOString()
        }));
      }
    };

    // 초기 실행
    syncBets();

    // 4초마다 반복
    const interval = setInterval(syncBets, 4000);

    return () => clearInterval(interval);
  }, [stats.isRunning]);

  // 수동 동기화
  const handleManualSync = async () => {
    setManualSyncing(true);
    try {
      console.log('🔄 [OroPlay Manual Sync] 수동 동기화 시작...');

      const response = await fetch(`${SERVER_URL}/sync/oroplay-bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.error('❌ [OroPlay Manual Sync] 동기화 에러:', response.status);
        toast.error('동기화 실패');
        return;
      }

      const data = await response.json();
      console.log('✅ [OroPlay Manual Sync] 동기화 완료:', data);

      setStats(prev => ({
        ...prev,
        totalSynced: prev.totalSynced + (data?.synced || 0),
        totalErrors: prev.totalErrors + (data?.errors || 0),
        lastSyncTime: new Date().toISOString(),
        syncCount: prev.syncCount + 1
      }));

      toast.success(`${data?.synced || 0}개 베팅 기록 동기화 완료`);

    } catch (error) {
      console.error('❌ [OroPlay Manual Sync] 예외 발생:', error);
      toast.error('동기화 중 오류 발생');
    } finally {
      setManualSyncing(false);
    }
  };

  // 자동 동기화 시작/중지
  const toggleAutoSync = () => {
    setStats(prev => ({
      ...prev,
      isRunning: !prev.isRunning
    }));

    if (!stats.isRunning) {
      toast.success('자동 동기화 시작 (4초 간격)');
    } else {
      toast.info('자동 동기화 중지');
    }
  };

  // 통계 초기화
  const resetStats = () => {
    setStats({
      lastSyncTime: null,
      totalSynced: 0,
      totalErrors: 0,
      isRunning: false,
      syncCount: 0
    });
    toast.success('통계 초기화 완료');
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <Card className="glass-card">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Activity className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold">OroPlay 베팅 자동 동기화</h3>
              <p className="text-sm text-muted-foreground">4초마다 베팅 기록을 자동으로 수집합니다</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={stats.isRunning ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}>
              {stats.isRunning ? '실행 중' : '중지됨'}
            </Badge>
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="text-sm text-muted-foreground mb-1">마지막 동기화</div>
            <div className="text-lg font-mono">{formatTime(stats.lastSyncTime)}</div>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="text-sm text-muted-foreground mb-1">동기화 횟수</div>
            <div className="text-lg font-mono text-blue-400">{stats.syncCount}회</div>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="text-sm text-muted-foreground mb-1">총 저장 기록</div>
            <div className="text-lg font-mono text-green-400">{stats.totalSynced}개</div>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="text-sm text-muted-foreground mb-1">에러 횟수</div>
            <div className="text-lg font-mono text-red-400">{stats.totalErrors}회</div>
          </div>
        </div>

        {/* 컨트롤 버튼 */}
        <div className="flex items-center gap-3">
          <Button
            onClick={toggleAutoSync}
            className={`flex-1 ${stats.isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
          >
            {stats.isRunning ? (
              <>
                <PauseCircle className="h-4 w-4 mr-2" />
                자동 동기화 중지
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                자동 동기화 시작
              </>
            )}
          </Button>
          <Button
            onClick={handleManualSync}
            disabled={manualSyncing}
            variant="outline"
            className="flex-1"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${manualSyncing ? 'animate-spin' : ''}`} />
            {manualSyncing ? '동기화 중...' : '수동 동기화'}
          </Button>
          <Button
            onClick={resetStats}
            variant="outline"
            disabled={stats.isRunning}
          >
            통계 초기화
          </Button>
        </div>

        {/* 실행 중 안내 */}
        {stats.isRunning && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-2 text-sm text-green-400">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>자동 동기화가 실행 중입니다. 4초마다 새로운 베팅 기록을 확인합니다.</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}