import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { DataTable } from "../common/DataTable";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { toast } from "sonner@2.0.3";
import { Label } from "../ui/label";
import { RefreshCw, Download, AlertCircle, CloudDownload } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getGameHistory } from "../../lib/investApi";
import { Partner } from "../../types";
import { useLanguage } from "../../contexts/LanguageContext";
import { getAdminOpcode, isMultipleOpcode } from '../../lib/opcodeHelper';

interface BettingManagementProps {
  user: Partner;
}

interface BettingRecord {
  id: string;
  external_txid: number;
  user_id: string;
  username: string;
  referrer_nickname: string; // 소속 추가
  game_name: string;
  provider_name: string;
  bet_amount: number;
  win_amount: number;
  balance_before: number;
  balance_after: number;
  played_at: string;
  profit_loss: number;
}

export function BettingManagement({ user }: BettingManagementProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [bettingRecords, setBettingRecords] = useState<BettingRecord[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [totalBets, setTotalBets] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // 권한 확인 (시스템관리자 = level 1, 대본사 = level 2만 접근 가능)
  if (user.level > 2) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto" />
          <p className="text-muted-foreground">{t('bettingManagement.accessDenied')}</p>
        </div>
      </div>
    );
  }

  // ✅ 페이지 진입 시 자동으로 베팅 내역 조회
  useEffect(() => {
    fetchBettingRecords();
  }, []);

  // Realtime subscription for game_records table
  useEffect(() => {
    const channel = supabase
      .channel('game-records-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_records'
        },
        (payload) => {
          console.log('🎮 game_records 테이블 변경 감지:', payload);
          fetchBettingRecords();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 직접 쿼리로 베팅 내역 조회 (모든 최신 데이터)
  const fetchBettingRecords = async () => {
    try {
      setLoading(true);
      
      console.log('📊 전체 베팅 내역 조회 시작...');

      const { data, error, count } = await supabase
        .from('game_records')
        .select(`
          id,
          external_txid,
          user_id,
          username,
          game_id,
          provider_id,
          provider_name,
          game_title,
          game_type,
          api_type,
          bet_amount,
          win_amount,
          balance_before,
          balance_after,
          played_at,
          users!game_records_user_id_fkey(
            referrer_id,
            referrer:partners!users_referrer_id_fkey(nickname)
          )
        `, { count: 'exact' })
        .order('played_at', { ascending: false })
        .limit(1000);

      if (error) {
        console.error('❌ 조회 오류:', error);
        toast.error(t('bettingManagement.fetchError'), {
          description: `${error.message}`
        });
        throw error;
      }

      console.log('✅ 조회 결과:', { 
        count, 
        dataLength: data?.length,
        sampleData: data?.slice(0, 2)
      });

      const records: BettingRecord[] = (data || []).map((record: any) => ({
        id: record.id,
        external_txid: record.external_txid || 0,
        user_id: record.user_id,
        username: record.username || 'Unknown',
        referrer_nickname: record.users?.referrer?.nickname || '-',
        // ✅ game_title, provider_name은 이미 game_records에 저장되어 있음
        game_name: record.game_title || `Game ${record.game_id}`,
        provider_name: record.provider_name || `Provider ${record.provider_id}`,
        bet_amount: parseFloat(record.bet_amount || 0),
        win_amount: parseFloat(record.win_amount || 0),
        balance_before: parseFloat(record.balance_before || 0),
        balance_after: parseFloat(record.balance_after || 0),
        played_at: record.played_at,
        profit_loss: parseFloat(record.win_amount || 0) - parseFloat(record.bet_amount || 0)
      }));

      setBettingRecords(records);
      setTotalBets(count || 0);
      
      if (records.length === 0) {
        toast.warning(t('bettingManagement.fetchWarning'), {
          description: t('bettingManagement.fetchWarningDesc')
        });
      } else {
        toast.success(`✅ ${records.length}${t('bettingManagement.count')} ${t('bettingManagement.fetchSuccess')} (${t('bettingManagement.totalCount')} ${count}${t('bettingManagement.count')})`);
      }
    } catch (error) {
      console.error('❌ 베팅 내역 조회 오류:', error);
      toast.error(t('bettingManagement.fetchFailed'), {
        description: error instanceof Error ? error.message : t('bettingManagement.unknownError')
      });
      setBettingRecords([]);
    } finally {
      setLoading(false);
    }
  };

  // API에서 베팅 내역 가져오기
  const syncBettingFromApi = async () => {
    try {
      setSyncLoading(true);
      
      let opcode: string;
      let secretKey: string;
      
      try {
        const opcodeInfo = await getAdminOpcode(user);
        
        if (isMultipleOpcode(opcodeInfo)) {
          if (opcodeInfo.opcodes.length === 0) {
            toast.error(t('bettingManagement.noMasterAgent'));
            return;
          }
          
          const firstOpcode = opcodeInfo.opcodes[0];
          opcode = firstOpcode.opcode;
          secretKey = firstOpcode.secretKey;
          
          toast.info(`${firstOpcode.partnerName}${t('bettingManagement.syncStarting')}`, {
            description: `${t('common.total')} ${opcodeInfo.opcodes.length}${t('bettingManagement.syncStartingDesc')}`
          });
        } else {
          opcode = opcodeInfo.opcode;
          secretKey = opcodeInfo.secretKey;
          
          console.log(`✅ ${user.partner_type} - ${opcodeInfo.partnerName} ${t('bettingManagement.opcodeUsing')}`);
        }
      } catch (error: any) {
        toast.error(t('bettingManagement.opcodeFetchFailed'), {
          description: error.message
        });
        return;
      }

      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString();
      
      console.log('📥 베팅 내역 API 호출:', { year, month, opcode });
      
      const apiResult = await getGameHistory(
        opcode,
        year,
        month,
        0,
        4000,
        secretKey
      );

      if (apiResult.error) {
        toast.error(t('bettingManagement.apiCallError'), {
          description: apiResult.error
        });
        return;
      }

      const apiData = apiResult.data?.DATA || [];
      
      if (!Array.isArray(apiData) || apiData.length === 0) {
        toast.info(t('bettingManagement.noDataToFetch'));
        setLastSyncTime(new Date().toISOString());
        return;
      }

      console.log('✅ API 응답:', { 레코드수: apiData.length, 샘플: apiData[0] });

      const formattedRecords = apiData.map((record: any) => ({
        txid: record.txid?.toString() || record.id?.toString(),
        username: record.username || record.user_id,
        provider_id: record.provider_id || Math.floor((record.game_id || 0) / 1000),
        game_id: record.game_id?.toString() || '0',
        game_name: record.game_name || 'Unknown',
        bet_amount: parseFloat(record.bet_amount || record.bet || 0),
        win_amount: parseFloat(record.win_amount || record.win || 0),
        profit_loss: parseFloat(record.profit_loss || record.win_loss || 
                     ((record.win_amount || record.win || 0) - (record.bet_amount || record.bet || 0))),
        currency: record.currency || 'KRW',
        status: record.status || 'completed',
        round_id: record.round_id,
        session_id: record.session_id,
        game_start_time: record.game_start_time || record.start_time,
        game_end_time: record.game_end_time || record.end_time || record.played_at || record.created_at
      }));

      const { data: saveResult, error: saveError } = await supabase
        .rpc('save_betting_records_from_api', {
          p_records: formattedRecords
        });

      if (saveError) {
        console.error('❌ 저장 함수 호출 실패:', saveError);
        toast.error(t('bettingManagement.syncFailed'), {
          description: saveError.message
        });
        return;
      }

      const result = saveResult?.[0] || { 
        saved_count: 0, 
        skipped_count: 0, 
        error_count: 0, 
        errors: [] 
      };

      console.log('✅ 저장 결과:', result);

      const syncTime = new Date().toISOString();
      setLastSyncTime(syncTime);

      if (result.saved_count > 0) {
        toast.success(`${t('bettingManagement.saveSuccess')} ${result.saved_count}${t('bettingManagement.count')} ${t('bettingManagement.saveSuccessDesc')}`, {
          description: `${t('bettingManagement.syncTime')} ${syncTime}${result.skipped_count > 0 ? ` (${t('bettingManagement.duplicateSkipped')} ${result.skipped_count}${t('bettingManagement.skipped')})` : ''}`
        });
        
        fetchBettingRecords();
      } else if (result.skipped_count > 0) {
        toast.info(`${t('bettingManagement.alreadyExists')} (${result.skipped_count}${t('bettingManagement.count')})`);
      }

      if (result.error_count > 0 && result.errors && result.errors.length > 0) {
        console.warn('⚠️ 일부 저장 오류:', result.errors);
        toast.warning(`${result.error_count}${t('bettingManagement.partialSaveFailed')}`, {
          description: `${t('bettingManagement.saveSuccessCount')} ${result.saved_count}${t('bettingManagement.count')}, ${t('bettingManagement.skipCount')} ${result.skipped_count}${t('bettingManagement.count')}\n${t('bettingManagement.firstError')} ${result.errors[0]}`
        });
      }

    } catch (error) {
      console.error('❌ 베팅 동기화 오류:', error);
      toast.error(t('bettingManagement.syncFailed'), {
        description: error instanceof Error ? error.message : t('bettingManagement.unknownError')
      });
    } finally {
      setSyncLoading(false);
    }
  };

  // 엑셀 다운로드
  const downloadExcel = () => {
    try {
      const csvContent = [
        [t('bettingManagement.username'), t('bettingManagement.affiliation'), t('bettingManagement.gameName'), t('bettingManagement.provider'), t('bettingManagement.betAmount'), t('bettingManagement.winAmount'), t('bettingManagement.profitLoss'), t('bettingManagement.playTime')].join(','),
        ...filteredRecords.map(record => [
          record.username,
          record.referrer_nickname,
          `"${record.game_name}"`,
          record.provider_name,
          record.bet_amount,
          record.win_amount,
          record.profit_loss,
          record.played_at
        ].join(','))
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `betting_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success(t('bettingManagement.downloadComplete'));
    } catch (error) {
      console.error('다운로드 오류:', error);
      toast.error(t('bettingManagement.downloadFailed'));
    }
  };

  // 초기 로드
  useEffect(() => {
    fetchBettingRecords();
  }, []);

  // 사용자 검색 필터링
  const filteredRecords = userSearch
    ? bettingRecords.filter(record => 
        record.username.toLowerCase().includes(userSearch.toLowerCase())
      )
    : bettingRecords;

  const columns = [
    {
      key: 'username',
      title: t('bettingManagement.username')
    },
    {
      key: 'referrer_nickname',
      title: t('bettingManagement.affiliation'),
      render: (value: string) => (
        <Badge variant="outline" className="bg-slate-800/50 border-slate-600">
          {value}
        </Badge>
      )
    },
    {
      key: 'game_name',
      title: t('bettingManagement.gameName'),
      render: (value: string) => (
        <span className="max-w-[200px] truncate" title={value}>{value}</span>
      )
    },
    {
      key: 'provider_name',
      title: t('bettingManagement.provider'),
      render: (value: string) => <Badge variant="secondary">{value}</Badge>
    },
    {
      key: 'bet_amount',
      title: t('bettingManagement.betAmount'),
      render: (value: number) => (
        <span className="font-mono text-blue-600">₩{value.toLocaleString()}</span>
      )
    },
    {
      key: 'win_amount',
      title: t('bettingManagement.winAmount'),
      render: (value: number) => (
        <span className={`font-mono ${value > 0 ? 'text-green-600' : 'text-gray-500'}`}>
          ₩{value.toLocaleString()}
        </span>
      )
    },
    {
      key: 'profit_loss',
      title: t('bettingManagement.profitLoss'),
      render: (value: number) => (
        <span className={`font-mono ${value > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {value > 0 ? '+' : ''}₩{value.toLocaleString()}
        </span>
      )
    },
    {
      key: 'played_at',
      title: t('bettingManagement.playTime'),
      render: (value: string) => value ? new Date(value).toISOString().replace('T', ' ').substring(0, 19) : '-'
    }
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">{t('bettingManagement.title')}</h1>
          <p className="text-sm text-slate-400">
            {t('bettingManagement.viewCount')}: {filteredRecords.length}{t('bettingManagement.count')} {t('bettingManagement.of')} {t('bettingManagement.totalCount')}: {totalBets}{t('bettingManagement.count')}
            {lastSyncTime && (
              <span className="ml-4 text-green-400">
                {t('bettingManagement.lastSync')}: {new Date(lastSyncTime).toLocaleString('ko-KR')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={syncBettingFromApi} 
            disabled={syncLoading} 
            className="btn-premium-primary"
          >
            <CloudDownload className="h-4 w-4 mr-2" />
            {syncLoading ? t('bettingManagement.fetching') : t('bettingManagement.fetchBettingHistory')}
          </Button>
          <Button 
            onClick={downloadExcel} 
            disabled={loading || filteredRecords.length === 0} 
            variant="outline" 
            className="border-slate-600 hover:bg-slate-700"
          >
            <Download className="h-4 w-4 mr-2" />
            {t('common.download')}
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
            <div>
              <Label htmlFor="betting-user-search" className="text-slate-300">{t('bettingManagement.searchUsername')}</Label>
              <Input
                id="betting-user-search"
                name="user_search"
                placeholder={t('bettingManagement.searchUsernamePlaceholder')}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="input-premium max-w-xs"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : filteredRecords.length > 0 ? (
            <DataTable 
              columns={columns} 
              data={filteredRecords} 
              enableSearch={false}
            />
          ) : (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('bettingManagement.noBettingHistory')}</p>
              <p className="text-sm mt-2">
                {userSearch ? t('bettingManagement.changeSearchCondition') : t('bettingManagement.clickToSync')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}