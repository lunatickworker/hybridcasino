import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { RefreshCw, PlayCircle, PauseCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../../utils/supabase';
import { supabase } from '../../lib/supabase';

const SUPABASE_URL = `https://${projectId}.supabase.co`;
const SERVER_URL = `${SUPABASE_URL}/functions/v1/server`;

interface SyncStats {
  lastSyncTime: string | null;
  totalSynced: number;
  totalErrors: number;
  isRunning: boolean;
  syncCount: number;
}

export function Lv2BalanceSync() {
  const [stats, setStats] = useState<SyncStats>({
    lastSyncTime: null,
    totalSynced: 0,
    totalErrors: 0,
    isRunning: true, // ✅ 초기값을 true로 설정 (항상 실행 상태)
    syncCount: 0
  });
  const [manualSyncing, setManualSyncing] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // ✅ isRunning을 별도로 추적하여 무한 루프 방지
  const isRunningRef = useRef(false);

  // stats.isRunning 변경 시 ref 동기화
  useEffect(() => {
    isRunningRef.current = stats.isRunning;
  }, [stats.isRunning]);

  // 컴포넌트 마운트 시 세션 확인
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          setSessionToken(session.access_token);
          console.log('✅ [Lv2 Balance Auto Sync] 세션 토큰 확인 완료');
          // ✅ 세션 확인되면 자동 동기화 시작
          setStats(prev => ({ ...prev, isRunning: true }));
        }
        // 세션이 없어도 경고하지 않음 (이 앱은 partners 테이블로 인증)
      } catch (error) {
        console.error('❌ [Lv2 Balance Auto Sync] 세션 확인 실패:', error);
      }
    };

    checkSession();

    // 세션 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setSessionToken(session.access_token);
        // ✅ Lv2 로그인되면 자동 동기화 시작
        setStats(prev => ({ ...prev, isRunning: true }));
      } else {
        setSessionToken(null);
        // ✅ 로그아웃되면 자동 동기화 중지
        setStats(prev => ({ ...prev, isRunning: false }));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 4초마다 자동 동기화
  useEffect(() => {
    if (!stats.isRunning) return;

    const syncBalances = async () => {
      try {
        console.log('🔄 [Lv2 Balance Auto Sync] 보유금 동기화 시작...');

        // ✅ Anon key 사용 (세션이 없어도 동기화 가능)
        const authToken = sessionToken || publicAnonKey;

        const response = await fetch(`${SERVER_URL}/sync/lv2-balances`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ [Lv2 Balance Auto Sync] 동기화 에러:', response.status, errorText);
          setStats(prev => ({
            ...prev,
            totalErrors: prev.totalErrors + 1,
            lastSyncTime: new Date().toISOString()
          }));
          return;
        }

        const data = await response.json();
        console.log('✅ [Lv2 Balance Auto Sync] 동기화 완료:', data);

        setStats(prev => ({
          ...prev,
          totalSynced: prev.totalSynced + (data?.synced || 0),
          totalErrors: prev.totalErrors + (data?.errors || 0),
          lastSyncTime: new Date().toISOString(),
          syncCount: prev.syncCount + 1
        }));

      } catch (error) {
        console.error('❌ [Lv2 Balance Auto Sync] 예외 발생:', error);
        setStats(prev => ({
          ...prev,
          totalErrors: prev.totalErrors + 1,
          lastSyncTime: new Date().toISOString()
        }));
      }
    };

    // 초기 실행
    syncBalances();

    // 4초마다 반복
    const interval = setInterval(syncBalances, 4000);

    return () => clearInterval(interval);
  }, [stats.isRunning, sessionToken]);

  // 수동 동기화
  const handleManualSync = async () => {
    setManualSyncing(true);
    try {
      console.log('🔄 [Lv2 Balance Manual Sync] 수동 동기화 시작...');

      // ✅ Health check 먼저 확인
      console.log('🏥 Health check 시작...');
      console.log('Server URL:', SERVER_URL);
      
      try {
        const healthResponse = await fetch(`${SERVER_URL}/health`);
        console.log('Health Response Status:', healthResponse.status);
        
        if (!healthResponse.ok) {
          const errorText = await healthResponse.text();
          console.error('❌ Health check 실패:', healthResponse.status, errorText);
          toast.error(`Edge Function 연결 실패 (${healthResponse.status})`);
          return;
        }
        
        const healthData = await healthResponse.json();
        console.log('✅ Health check 성공:', healthData);
      } catch (healthError) {
        console.error('❌ Health check 실패:', healthError);
        toast.error('Edge Function에 연결할 수 없습니다. Edge Function이 배포되었는지 확인해주세요.');
        return;
      }

      // 인증 토큰 가져오기
      const authToken = sessionToken || publicAnonKey;
      console.log('🔑 사용 토큰:', authToken.substring(0, 20) + '...');
      console.log('📍 요청 URL:', `${SERVER_URL}/sync/lv2-balances`);

      const response = await fetch(`${SERVER_URL}/sync/lv2-balances`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      console.log('📡 응답 상태:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [Lv2 Balance Manual Sync] 동기화 에러:', response.status, errorText);
        
        if (response.status === 404) {
          toast.error('Edge Function 라우트를 찾을 수 없습니다. /sync/lv2-balances 엔드포인트가 배포되었는지 확인해주세요.');
        } else {
          toast.error(`동기화 실패: ${response.status} - ${errorText.substring(0, 100)}`);
        }
        return;
      }

      const data = await response.json();
      console.log('✅ [Lv2 Balance Manual Sync] 동기화 완료:', data);

      setStats(prev => ({
        ...prev,
        totalSynced: prev.totalSynced + (data?.synced || 0),
        totalErrors: prev.totalErrors + (data?.errors || 0),
        lastSyncTime: new Date().toISOString(),
        syncCount: prev.syncCount + 1
      }));

      toast.success(`${data?.synced || 0}개 파트너 보유금 동기화 완료`);

    } catch (error) {
      console.error('❌ [Lv2 Balance Manual Sync] 예외 발생:', error);
      toast.error(`동기화 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setManualSyncing(false);
    }
  };

  // 자동 동기화 시작/중지
  const toggleAutoSync = async () => {
    // 중지하는 경우는 세션 체크 불필요
    if (stats.isRunning) {
      setStats(prev => ({ ...prev, isRunning: false }));
      toast.info('Lv2 보유금 자동 동기화 중지');
      return;
    }

    // 시작하는 경우: 세션 토큰 확인
    let token = sessionToken;
    
    // 세션 토큰이 없으면 다시 가져오기 (선택사항)
    if (!token) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          token = session.access_token;
          setSessionToken(token);
        }
        // ✅ 세션이 없어도 동기화 시작 가능 (Edge Function에서 처리)
      } catch (error) {
        console.error('세션 확인 실패:', error);
      }
    }

    setStats(prev => ({ ...prev, isRunning: true }));
    toast.success('Lv2 보유금 자동 동기화 시작 (4초 간격)');
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
            <div className="p-2 rounded-lg bg-green-500/20">
              <Wallet className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Lv2 OroPlay 보유금 자동 동기화</h3>
              <p className="text-sm text-muted-foreground">4초마다 Lv2 파트너의 OroPlay 보유금을 자동 업데이트합니다</p>
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
            <div className="text-sm text-muted-foreground mb-1">총 업데이트</div>
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
          >
            통계 초기화
          </Button>
        </div>

        {/* 실행 중 안내 */}
        {stats.isRunning && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-2 text-sm text-green-400">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>자동 동기화가 실행 중입니다. 4초마다 Lv2 파트너의 OroPlay 보유금을 확인합니다.</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}