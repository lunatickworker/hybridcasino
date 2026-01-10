import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle2, XCircle, Loader2, ServerCog } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../../utils/supabase';

const SUPABASE_URL = `https://${projectId}.supabase.co`;
const SERVER_URL = `${SUPABASE_URL}/functions/v1/server`;

interface TestResult {
  endpoint: string;
  status: 'pending' | 'success' | 'error';
  statusCode?: number;
  message?: string;
  data?: any;
}

export function EdgeFunctionTester() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  const runTests = async () => {
    setTesting(true);
    setResults([]);

    const tests: Array<{
      name: string;
      endpoint: string;
      method: 'GET' | 'POST';
    }> = [
      { name: 'Root', endpoint: '', method: 'GET' },
      { name: 'Health Check', endpoint: '/health', method: 'GET' },
      { name: 'OroPlay Bets Sync', endpoint: '/sync/oroplay-bets', method: 'POST' },
      { name: 'Lv2 Balance Sync', endpoint: '/sync/lv2-balances', method: 'POST' },
    ];

    for (const test of tests) {
      const result: TestResult = {
        endpoint: test.endpoint || '/',
        status: 'pending',
      };

      setResults(prev => [...prev, result]);

      try {
        const url = `${SERVER_URL}${test.endpoint}`;
        console.log(`🧪 테스트 중: ${test.method} ${url}`);

        const response = await fetch(url, {
          method: test.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        });

        const data = await response.json().catch(() => null);

        result.status = response.ok ? 'success' : 'error';
        result.statusCode = response.status;
        result.message = response.statusText;
        result.data = data;

        console.log(`${response.ok ? '✅' : '❌'} ${test.name}: ${response.status}`, data);

        setResults(prev => 
          prev.map(r => r.endpoint === result.endpoint ? result : r)
        );

      } catch (error: any) {
        result.status = 'error';
        result.message = error.message;
        
        console.error(`❌ ${test.name} 실패:`, error);

        setResults(prev => 
          prev.map(r => r.endpoint === result.endpoint ? result : r)
        );
      }

      // 각 테스트 사이에 짧은 딜레이
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setTesting(false);
    
    const allSuccess = results.every(r => r.status === 'success');
    if (allSuccess) {
      toast.success('모든 엔드포인트 테스트 통과');
    } else {
      toast.error('일부 엔드포인트에서 오류 발생');
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <ServerCog className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Edge Function 연결 테스트</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                모든 엔드포인트의 연결 상태를 확인합니다
              </p>
            </div>
          </div>
          <Button
            onClick={runTests}
            disabled={testing}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                테스트 중...
              </>
            ) : (
              '연결 테스트 실행'
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* 서버 정보 */}
        <div className="mb-6 p-4 rounded-lg bg-white/5 border border-white/10">
          <div className="text-sm text-muted-foreground mb-2">Edge Function URL</div>
          <div className="font-mono text-sm break-all">{SERVER_URL}</div>
        </div>

        {/* 테스트 결과 */}
        {results.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold mb-3">테스트 결과</div>
            {results.map((result, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-white/5 border border-white/10"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {result.status === 'pending' && (
                      <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                    )}
                    {result.status === 'success' && (
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                    )}
                    {result.status === 'error' && (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className="font-mono text-sm">{result.endpoint || '/'}</span>
                  </div>
                  {result.statusCode && (
                    <Badge
                      className={
                        result.statusCode < 300
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : result.statusCode === 404
                          ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                          : 'bg-red-500/20 text-red-400 border-red-500/30'
                      }
                    >
                      {result.statusCode}
                    </Badge>
                  )}
                </div>

                {result.message && (
                  <div className="text-sm text-muted-foreground mt-2">
                    {result.message}
                  </div>
                )}

                {result.data && (
                  <div className="mt-3 p-3 rounded bg-black/20 border border-white/5">
                    <pre className="text-xs overflow-auto max-h-32">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                )}

                {result.status === 'error' && result.statusCode === 404 && (
                  <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="text-sm text-yellow-400">
                      ⚠️ Edge Function이 배포되지 않았습니다. DEPLOY_GUIDE.md를 참고하세요.
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 배포 가이드 */}
        {results.some(r => r.statusCode === 404) && (
          <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <div className="text-sm font-semibold text-blue-400 mb-2">
              📖 배포 가이드
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>1. Supabase CLI 설치: <code className="px-1 py-0.5 bg-white/10 rounded">npm install -g supabase</code></p>
              <p>2. 프로젝트 연결: <code className="px-1 py-0.5 bg-white/10 rounded">supabase link --project-ref {projectId}</code></p>
              <p>3. 함수 배포: <code className="px-1 py-0.5 bg-white/10 rounded">supabase functions deploy server</code></p>
              <p className="mt-2">자세한 내용은 <code className="px-1 py-0.5 bg-white/10 rounded">/supabase/functions/DEPLOY_GUIDE.md</code>를 참고하세요.</p>
            </div>
          </div>
        )}

        {/* 초기 안내 */}
        {results.length === 0 && !testing && (
          <div className="text-center py-8 text-muted-foreground">
            <ServerCog className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>연결 테스트를 실행하여 Edge Function 상태를 확인하세요.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
