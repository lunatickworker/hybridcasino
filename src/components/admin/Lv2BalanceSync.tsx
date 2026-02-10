import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { RefreshCw, Wallet, ChevronDown } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { getOroPlayToken, getAgentBalance } from '../../lib/oroplayApi';
import { getLv1HonorApiCredentials } from '../../lib/apiConfigHelper';
import { checkApiActiveByPartnerId } from '../../lib/apiStatusChecker';
import { useApiStatus } from '../../hooks/useApiStatus';
import * as honorApiModule from '../../lib/honorApi';

interface SyncStats {
  lastSyncTime: string | null;
  totalSynced: number;
  totalErrors: number;
  isRunning: boolean;
  lastDetails: Array<{
    partner_id: string;
    name: string;
    oroplay_balance: number;
    honorapi_balance: number;
  }>;
}

interface Lv2Partner {
  id: string;
  nickname: string;
  oroplay_balance: number;
  honorapi_balance: number;
}

export function Lv2BalanceSync() {
  const [stats, setStats] = useState<SyncStats>({
    lastSyncTime: null,
    totalSynced: 0,
    totalErrors: 0,
    isRunning: true,
    lastDetails: []
  });
  const [manualSyncing, setManualSyncing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunningRef = useRef(false);
  const syncFunctionRef = useRef<() => Promise<void>>();
  
  // ✅ Lv1 파트너 ID 조회 (Lv2는 Lv1의 API 설정 사용)
  const [lv1PartnerId, setLv1PartnerId] = useState<string | null>(null);
  const { apiStatus } = useApiStatus(lv1PartnerId);

  useEffect(() => {
    isRunningRef.current = stats.isRunning;
  }, [stats.isRunning]);

  // Lv1 파트너 ID 조회
  useEffect(() => {
    const fetchLv1Partner = async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('id')
        .eq('level', 1)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setLv1PartnerId(data.id);
      }
    };

    fetchLv1Partner();
  }, []);

  // 동기화 함수 정의 - apiStatus 변경 시 업데이트
  useEffect(() => {
    syncFunctionRef.current = async () => {
      try {
        //console.log('🔄 [Lv2 Balance Auto Sync] 4초 자동 동기화 시작...');
        //console.log('   ✅ 활성화된 API:', apiStatus);

        // 모든 활성 Lv2 파트너 조회
        const { data: lv2Partners, error: lv2Error } = await supabase
          .from('partners')
          .select('id, nickname, selected_apis')
          .eq('level', 2)
          .eq('status', 'active')
          .order('created_at', { ascending: true });

        if (lv2Error) {
          console.error('❌ Lv2 파트너 조회 실패:', lv2Error);
          return;
        }

        if (!lv2Partners?.length) {
          //console.log('ℹ️ 활성 Lv2 파트너가 없습니다');
          return;
        }

        //console.log(`📊 [Lv2 Balance Auto Sync] 조회된 Lv2 파트너: ${lv2Partners.length}개`);
        //console.log(`   파트너 ID 목록:`, lv2Partners.map(p => ({ id: p.id, nickname: p.nickname })));

        let syncedCount = 0;
        const details: typeof stats.lastDetails = [];
        const processedPartners: Array<{ id: string; nickname: string; success: boolean; error?: string }> = [];

        // 각 Lv2 파트너의 보유금 동기화
        for (const partner of lv2Partners as Lv2Partner[]) {
          try {
            let oroplayBalance = 0;
            let honorapiBalance = 0;
            let updated = false;
            
            //console.log(`🔍 [${partner.nickname}] (${partner.id}) 동기화 시작 - selected_apis:`, partner.selected_apis);

            // OroPlay 동기화 (활성화된 경우만)
            if (apiStatus.oroplay) {
              try {
                let credentialPartnerId = '';
                let useFromLv2 = false;
                
                // 1️⃣ Lv2 자신의 OroPlay 설정 먼저 직접 확인
                const { data: lv2OroConfig } = await supabase
                  .from('api_configs')
                  .select('api_key, is_active')
                  .eq('partner_id', partner.id)
                  .eq('api_provider', 'oroplay')
                  .maybeSingle();

                if (lv2OroConfig?.is_active === true) {
                  credentialPartnerId = partner.id;
                  useFromLv2 = true;
                  //console.log(`✅ [${partner.nickname}] Lv2의 OroPlay 설정 발견`);
                } else {
                  // 2️⃣ Lv2에 없으면 무조건 Lv1의 credential 사용
                  credentialPartnerId = lv1PartnerId || '';
                  useFromLv2 = false;
                  //console.log(`ℹ️ [${partner.nickname}] Lv1의 OroPlay 설정 사용`);
                }
                
                if (credentialPartnerId) {
                  const token = await getOroPlayToken(credentialPartnerId);
                  oroplayBalance = await getAgentBalance(token);
                  updated = true;
                  //console.log(`✅ [${partner.nickname}] OroPlay balance: ${oroplayBalance} (from ${useFromLv2 ? 'Lv2' : 'Lv1'})`);
                  
                  // ✅ api_configs에 oroplay balance 업데이트
                  const { error: updateError } = await supabase
                    .from('api_configs')
                    .update({
                      balance: oroplayBalance,
                      updated_at: new Date().toISOString()
                    })
                    .eq('partner_id', partner.id)
                    .eq('api_provider', 'oroplay');

                  if (updateError) {
                    console.error(`❌ [${partner.nickname}] OroPlay api_configs 업데이트 실패:`, updateError);
                  }
                } else {
                  throw new Error(`Lv1 파트너 ID가 없어서 OroPlay credential을 조회할 수 없습니다`);
                }
              } catch (error) {
                console.error(`❌ [${partner.nickname}] OroPlay 동기화 실패:`, error);
              }
            }

            // HonorAPI 동기화 (활성화된 경우만)
            if (apiStatus.honorapi) {
              try {
                let credentialPartnerId = '';
                let useFromLv2 = false;
                
                // 1️⃣ Lv2 자신의 HonorAPI 설정 먼저 직접 확인
                const { data: lv2HonorConfig } = await supabase
                  .from('api_configs')
                  .select('api_key, is_active')
                  .eq('partner_id', partner.id)
                  .eq('api_provider', 'honorapi')
                  .maybeSingle();

                if (lv2HonorConfig?.is_active === true) {
                  credentialPartnerId = partner.id;
                  useFromLv2 = true;
                  //.log(`✅ [${partner.nickname}] Lv2의 HonorAPI 설정 발견`);
                } else {
                  // 2️⃣ Lv2에 없으면 무조건 Lv1의 credential 사용
                  credentialPartnerId = lv1PartnerId || '';
                  useFromLv2 = false;
                  //console.log(`ℹ️ [${partner.nickname}] Lv1의 HonorAPI 설정 사용`);
                }
                
                if (credentialPartnerId) {
                  const { data: credentials } = await supabase
                    .from('api_configs')
                    .select('api_key')
                    .eq('partner_id', credentialPartnerId)
                    .eq('api_provider', 'honorapi')
                    .maybeSingle();

                  if (credentials?.api_key) {
                    const agentInfo = await honorApiModule.getAgentInfo(credentials.api_key);
                    honorapiBalance = parseFloat(agentInfo.balance) || 0;
                    updated = true;
                    //console.log(`✅ [${partner.nickname}] HonorAPI balance: ${honorapiBalance} (from ${useFromLv2 ? 'Lv2' : 'Lv1'})`);
                    
                    // ✅ api_configs에 honorapi balance 업데이트
                    const { error: updateError } = await supabase
                      .from('api_configs')
                      .update({
                        balance: honorapiBalance,
                        updated_at: new Date().toISOString()
                      })
                      .eq('partner_id', partner.id)
                      .eq('api_provider', 'honorapi');

                    if (updateError) {
                      console.error(`❌ [${partner.nickname}] HonorAPI api_configs 업데이트 실패:`, updateError);
                    }
                  } else {
                    throw new Error(`HonorAPI credential을 찾을 수 없습니다 (${useFromLv2 ? 'Lv2' : 'Lv1'})`);
                  }
                } else {
                  throw new Error(`Lv1 파트너 ID가 없어서 HonorAPI credential을 조회할 수 없습니다`);
                }
              } catch (error) {
                console.error(`❌ [${partner.nickname}] HonorAPI 동기화 실패:`, error);
              }
            }

            // updated 상태 확인
            if (!updated) {
              //console.log(`⚠️ [${partner.nickname}] 업데이트 없음 - OroPlay: ${apiStatus.oroplay}, HonorAPI: ${apiStatus.honorapi}`);
            }

            // DB 업데이트 - selected_apis의 모든 API의 합계를 partners.balance에 저장
            if (updated) {
              // partners의 selected_apis 확인
              const { data: partnerData } = await supabase
                .from('partners')
                .select('selected_apis')
                .eq('id', partner.id)
                .single();

              if (partnerData?.selected_apis) {
                // selected_apis에 포함된 모든 API의 balance를 api_configs에서 조회
                const { data: allApiConfigs } = await supabase
                  .from('api_configs')
                  .select('api_provider, balance')
                  .eq('partner_id', partner.id);

                // selected_apis에 있는 API들만 합산
                let totalBalance = 0;
                if (allApiConfigs && allApiConfigs.length > 0) {
                  for (const api of partnerData.selected_apis) {
                    const config = allApiConfigs.find(c => c.api_provider === api);
                    if (config) {
                      totalBalance += config.balance || 0;
                    }
                  }
                } else {
                  // api_configs가 없으면 오로플레이 + 호노라피로 계산 (폴백)
                  totalBalance = oroplayBalance + honorapiBalance;
                }
                
                const { error: updateError } = await supabase
                  .from('partners')
                  .update({
                    balance: totalBalance,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', partner.id);

                if (!updateError) {
                  syncedCount++;
                  details.push({
                    partner_id: partner.id,
                    name: partner.nickname,
                    oroplay_balance: oroplayBalance,
                    honorapi_balance: honorapiBalance
                  });
                  processedPartners.push({ id: partner.id, nickname: partner.nickname, success: true });
                } else {
                  console.error(`❌ [${partner.nickname}] DB 업데이트 실패:`, updateError);
                  processedPartners.push({ id: partner.id, nickname: partner.nickname, success: false, error: updateError.message });
                }
              }
            }
          } catch (error) {
            console.error(`❌ [${partner.nickname}] 동기화 중 오류:`, error);
            processedPartners.push({ id: partner.id, nickname: partner.nickname, success: false, error: String(error) });
          }
        }

        //console.log(`📊 [Lv2 Balance Auto Sync] 처리 결과: ${syncedCount}/${lv2Partners.length} 성공`);
        //console.log(`   성공한 파트너:`, processedPartners.filter(p => p.success).map(p => p.nickname));
        //console.log(`   실패한 파트너:`, processedPartners.filter(p => !p.success).map(p => ({ nickname: p.nickname, error: p.error })));

        if (syncedCount > 0) {
          //console.log(`✅ [Lv2 Balance Auto Sync] 완료: ${syncedCount}/${lv2Partners.length} 파트너 동기화`);
          
          setStats(prev => ({
            ...prev,
            totalSynced: prev.totalSynced + syncedCount,
            lastSyncTime: new Date().toISOString(),
            lastDetails: details
          }));
        }

      } catch (error) {
        console.error('❌ [Lv2 Balance Auto Sync] 예외 발생:', error);
      }
    };
  }, [lv1PartnerId, apiStatus]);

  // 자동 동기화: 4초마다 모든 Lv2 파트너의 보유금 동기화
  useEffect(() => {
    if (!isRunningRef.current || !lv1PartnerId) return;

    // 초기 실행
    if (syncFunctionRef.current) {
      syncFunctionRef.current();
    }

    // 4초마다 반복
    const interval = setInterval(() => {
      if (syncFunctionRef.current) {
        syncFunctionRef.current();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [lv1PartnerId]);

  // 수동 동기화
  const handleManualSync = async () => {
    setManualSyncing(true);
    try {
      //console.log('🔄 [Lv2 Balance Manual Sync] 수동 동기화 시작...');

      // Lv1 파트너 조회
      const { data: lv1Partner, error: lv1Error } = await supabase
        .from('partners')
        .select('id')
        .eq('level', 1)
        .limit(1)
        .maybeSingle();

      if (lv1Error || !lv1Partner) {
        toast.error('Lv1 파트너를 찾을 수 없습니다.');
        return;
      }

      // 모든 활성 Lv2 파트너 조회
      const { data: lv2Partners, error: lv2Error } = await supabase
        .from('partners')
        .select('id, nickname, selected_apis')
        .eq('level', 2)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      if (lv2Error) {
        toast.error('Lv2 파트너 조회에 실패했습니다.');
        return;
      }

      if (!lv2Partners?.length) {
        toast.info('활성 Lv2 파트너가 없습니다.');
        return;
      }

      let syncedCount = 0;
      const details: typeof stats.lastDetails = [];

      // 각 Lv2 파트너의 보유금 동기화
      for (const partner of lv2Partners as Lv2Partner[]) {
        try {
          let oroplayBalance = 0;
          let honorapiBalance = 0;
          let updated = false;

          // OroPlay 동기화
          try {
            const isOroPlayActive = await checkApiActiveByPartnerId(lv1Partner.id, 'oroplay');
            if (isOroPlayActive) {
              const token = await getOroPlayToken(lv1Partner.id);
              oroplayBalance = await getAgentBalance(token);
              updated = true;
            }
          } catch (error) {
            console.warn(`⚠️ [${partner.nickname}] OroPlay 동기화 실패:`, error);
          }

          // HonorAPI 동기화
          try {
            const isHonorActive = await checkApiActiveByPartnerId(lv1Partner.id, 'honorapi');
            if (isHonorActive) {
              const credentials = await getLv1HonorApiCredentials(lv1Partner.id);
              if (credentials.api_key) {
                const agentInfo = await honorApiModule.getAgentInfo(credentials.api_key);
                honorapiBalance = parseFloat(agentInfo.balance) || 0;
                updated = true;
              }
            }
          } catch (error) {
            console.warn(`⚠️ [${partner.nickname}] HonorAPI 동기화 실패:`, error);
          }

          // DB 업데이트
          if (updated) {
            const { error: updateError } = await supabase
              .from('partners')
              .update({
                oroplay_balance: oroplayBalance,
                honorapi_balance: honorapiBalance,
                updated_at: new Date().toISOString()
              })
              .eq('id', partner.id);

            if (!updateError) {
              syncedCount++;
              details.push({
                partner_id: partner.id,
                name: partner.nickname,
                oroplay_balance: oroplayBalance,
                honorapi_balance: honorapiBalance
              });
            }
          }
        } catch (error) {
          console.error(`❌ [${partner.nickname}] 동기화 중 오류:`, error);
        }
      }

      toast.success(`${syncedCount}/${lv2Partners.length} 파트너 보유금 동기화 완료`);

      setStats(prev => ({
        ...prev,
        totalSynced: prev.totalSynced + syncedCount,
        lastSyncTime: new Date().toISOString(),
        lastDetails: details
      }));

    } catch (error) {
      console.error('❌ [Lv2 Balance Manual Sync] 예외 발생:', error);
      toast.error(`동기화 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setManualSyncing(false);
    }
  };

  const toggleAutoSync = () => {
    if (stats.isRunning) {
      setStats(prev => ({ ...prev, isRunning: false }));
      toast.info('Lv2 보유금 자동 동기화 중지');
    } else {
      setStats(prev => ({ ...prev, isRunning: true }));
      toast.info('Lv2 보유금 자동 동기화 시작 (4초 간격)');
    }
  };

  const resetStats = () => {
    setStats({
      lastSyncTime: null,
      totalSynced: 0,
      totalErrors: 0,
      isRunning: false,
      lastDetails: []
    });
    toast.success('통계 초기화 완료');
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <div className="relative">
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            max-height: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            max-height: 1000px;
            transform: translateY(0);
          }
        }

        @keyframes slideUp {
          from {
            opacity: 1;
            max-height: 1000px;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            max-height: 0;
            transform: translateY(-20px);
          }
        }

        .slide-down-enter {
          animation: slideDown 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .slide-up-exit {
          animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>

      {isExpanded && (
        <Card className="glass-card slide-down-enter mb-4">
          <CardContent className="pt-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-500/20">
                  <Wallet className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Lv2 보유금 자동 동기화</h3>
                  <p className="text-base text-muted-foreground mt-1">4초마다 모든 Lv2 파트너의 보유금을 자동 업데이트합니다</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={stats.isRunning ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}>
                  {stats.isRunning ? '실행 중' : '중지됨'}
                </Badge>
              </div>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="p-6 rounded-lg bg-white/5 border border-white/10">
                <div className="text-base text-muted-foreground mb-3 font-medium">마지막 동기화</div>
                <div className="text-2xl font-mono font-bold">{formatTime(stats.lastSyncTime)}</div>
              </div>
              <div className="p-6 rounded-lg bg-white/5 border border-white/10">
                <div className="text-base text-muted-foreground mb-3 font-medium">총 업데이트</div>
                <div className="text-2xl font-mono font-bold text-green-400">{stats.totalSynced}개</div>
              </div>
              <div className="p-6 rounded-lg bg-white/5 border border-white/10">
                <div className="text-base text-muted-foreground mb-3 font-medium">에러 횟수</div>
                <div className="text-2xl font-mono font-bold text-red-400">{stats.totalErrors}회</div>
              </div>
            </div>

            {/* 컨트롤 버튼 */}
            <div className="flex items-center gap-4 mb-6">
              <Button
                onClick={handleManualSync}
                disabled={manualSyncing}
                variant="outline"
                className="flex-1 h-11 text-base font-medium"
              >
                <RefreshCw className={`h-5 w-5 mr-2 ${manualSyncing ? 'animate-spin' : ''}`} />
                {manualSyncing ? '동기화 중...' : '수동 동기화'}
              </Button>
              <Button
                onClick={toggleAutoSync}
                variant="outline"
                className="h-11 text-base font-medium px-6"
              >
                {stats.isRunning ? '중지' : '시작'}
              </Button>
              <Button
                onClick={resetStats}
                variant="outline"
                className="h-11 text-base font-medium px-6"
              >
                초기화
              </Button>
            </div>

            {/* 실행 중 안내 */}
            {stats.isRunning && (
              <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="flex items-center gap-3 text-base text-green-400 font-medium">
                  <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                  <span>자동 동기화가 실행 중입니다. 4초마다 모든 Lv2 파트너의 보유금을 확인합니다.</span>
                </div>
              </div>
            )}

            {/* 최근 동기화 상세 */}
            {stats.lastDetails.length > 0 && (
              <div className="p-6 rounded-lg bg-white/5 border border-white/10">
                <div className="text-lg font-bold mb-4">최근 동기화 결과</div>
                <div className="space-y-3">
                  {stats.lastDetails.map(detail => (
                    <div key={detail.partner_id} className="flex justify-between items-center p-4 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                      <span className="text-base font-semibold text-white">{detail.name}</span>
                      <div className="flex gap-6 text-sm font-medium">
                        <span className="text-blue-400">🎮 OroPlay: <span className="font-bold text-base">{formatCurrency(detail.oroplay_balance)}</span></span>
                        <span className="text-purple-400">♟️ Honor: <span className="font-bold text-base">{formatCurrency(detail.honorapi_balance)}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 토글 버튼 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-green-500/20">
            <Wallet className="h-6 w-6 text-green-400" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-bold">Lv2 보유금 자동 동기화</h3>
            <p className="text-sm text-muted-foreground mt-1">{isExpanded ? '상세정보 닫기' : '상세정보 열기'}</p>
          </div>
        </div>
        <ChevronDown 
          className={`h-6 w-6 text-muted-foreground transition-transform duration-300 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
    </div>
  );
}