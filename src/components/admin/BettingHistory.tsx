import { useState, useEffect, useMemo } from "react";
import { CreditCard, Download, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { DataTable } from "../common/DataTable";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { MetricCard } from "./MetricCard";
import { forceSyncBettingHistory } from "./BettingHistorySync";
import { useLanguage } from "../../contexts/LanguageContext";
import { getTodayStartUTC, formatSystemTime } from "../../utils/timezone";

interface BettingHistoryProps {
  user: Partner;
}

interface BettingRecord {
  id: string;
  external_txid: string | number;
  username: string;
  user_id: string | null;
  game_id: number;
  provider_id: number;
  game_title?: string;
  provider_name?: string;
  game_type?: string;
  bet_amount: number;
  win_amount: number;
  balance_before: number;
  balance_after: number;
  played_at: string;
}

export function BettingHistory({ user }: BettingHistoryProps) {
  const { t } = useLanguage();
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bettingRecords, setBettingRecords] = useState<BettingRecord[]>([]);
  const [dateFilter, setDateFilter] = useState("today"); // ✅ 기본값을 "오늘"로 변경
  const [searchTerm, setSearchTerm] = useState("");

  // 날짜 포맷 (이미지와 동일: 2025년10월24일 08:19:52)
  const formatKoreanDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}년${month}월${day}일 ${hours}:${minutes}:${seconds}`;
  };

  // 날짜 범위 계산
  const getDateRange = (filter: string) => {
    const now = new Date();
    const todayStart = getTodayStartUTC();
    
    switch (filter) {
      case 'today':
        return { start: todayStart, end: now.toISOString() };
      case 'week':
        const weekStart = new Date(new Date(todayStart).getTime() - 7 * 86400000).toISOString();
        return { start: weekStart, end: now.toISOString() };
      case 'month':
        const monthStart = new Date(new Date(todayStart).getTime() - 30 * 86400000).toISOString();
        return { start: monthStart, end: now.toISOString() };
      default:
        return null;
    }
  };

  // ✅ 강제 새로고침 - API 호출 후 DB 조회
  const handleForceRefresh = async () => {
    try {
      console.log('🔄 강제 새로고침 시작');
      setRefreshing(true);
      
      // 1. API 호출하여 최신 데이터 동기화
      await forceSyncBettingHistory(user);
      
      // 2. 1초 대기 (DB INSERT 완료 대기)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. DB에서 데이터 로드
      await loadBettingData();
      
      toast.success(t.bettingHistory.refreshSuccess);
    } catch (error) {
      console.error('❌ 강제 새로고침 오류:', error);
      toast.error(t.bettingHistory.refreshFailed);
    } finally {
      setRefreshing(false);
    }
  };

  // ✅ 데이터 로드 - 조회만 담당 (내부용)
  const loadBettingData = async () => {
    try {
      console.log('🔄 베팅 데이터 로드 시작');
      
      const dateRange = getDateRange(dateFilter);

      // ✅ Get allowed partner IDs by permission level
      let allowedPartnerIds: string[] = [];
      
      if (user.level === 1) {
        // System admin: all partners
        const { data: allPartners } = await supabase
          .from('partners')
          .select('id');
        allowedPartnerIds = allPartners?.map(p => p.id) || [];
      } else {
        // Child partners only (including self)
        allowedPartnerIds = [user.id];
        
        // 1단계 하위
        const { data: level1 } = await supabase
          .from('partners')
          .select('id')
          .eq('parent_id', user.id);
        
        const level1Ids = level1?.map(p => p.id) || [];
        allowedPartnerIds.push(...level1Ids);
        
        if (level1Ids.length > 0) {
          // 2단계 하위
          const { data: level2 } = await supabase
            .from('partners')
            .select('id')
            .in('parent_id', level1Ids);
          
          const level2Ids = level2?.map(p => p.id) || [];
          allowedPartnerIds.push(...level2Ids);
          
          if (level2Ids.length > 0) {
            // 3단계 하위
            const { data: level3 } = await supabase
              .from('partners')
              .select('id')
              .in('parent_id', level2Ids);
            
            const level3Ids = level3?.map(p => p.id) || [];
            allowedPartnerIds.push(...level3Ids);
            
            if (level3Ids.length > 0) {
              // 4단계 하위
              const { data: level4 } = await supabase
                .from('partners')
                .select('id')
                .in('parent_id', level3Ids);
              
              const level4Ids = level4?.map(p => p.id) || [];
              allowedPartnerIds.push(...level4Ids);
              
              if (level4Ids.length > 0) {
                // 5단계 하위
                const { data: level5 } = await supabase
                  .from('partners')
                  .select('id')
                  .in('parent_id', level4Ids);
                
                const level5Ids = level5?.map(p => p.id) || [];
                allowedPartnerIds.push(...level5Ids);
              }
            }
          }
        }
      }
      
      console.log('👥 Child partner IDs count:', allowedPartnerIds.length);

      // ✅ Data query (filtered by level)
      let query = supabase
        .from('game_records')
        .select('*');

      if (user.level === 1) {
        // 시스템관리자: 모든 데이터 조회 가능
        if (allowedPartnerIds.length > 0) {
          query = query.in('partner_id', allowedPartnerIds);
        }
        console.log('🔍 System Admin: Query all partner data');
      } else {
        // Regular admin: filter by child user IDs
        const { data: usersData } = await supabase
          .from('users')
          .select('id')
          .in('referrer_id', allowedPartnerIds);
        
        const userIds = usersData?.map(u => u.id) || [];
        console.log('👤 하위 회원 ID 개수:', userIds.length);
        
        if (userIds.length > 0) {
          query = query.in('user_id', userIds);
          console.log('🔍 Query with user IDs filter');
        } else {
          // 하위 회원이 없으면 빈 결과 반환
          console.log('⚠️ 하위 회원이 없습니다.');
          setBettingRecords([]);
          return;
        }
      }
      
      // 날짜 필터가 있을 때만 적용
      if (dateRange) {
        query = query
          .gte('played_at', dateRange.start)
          .lte('played_at', dateRange.end);
      }
      
      // 정렬 및 제한 (최신순으로 정렬하여 최근 데이터 우선)
      query = query
        .order('played_at', { ascending: false })
        .order('external_txid', { ascending: false })
        .limit(1000);

      const { data, error } = await query;

      if (error) {
        console.error('❌ 베팅 데이터 로드 실패:', error);
        throw error;
      }

      console.log('✅ 베팅 데이터 로드 성공:', data?.length || 0, '건');
      
      // 🔍 디버깅: 첫 번째 레코드 출력
      if (data && data.length > 0) {
        console.log('📋 첫 번째 레코드:', data[0]);
      }
      
      // ✅ game_records 테이블에 이미 game_title, provider_name이 저장되어 있으므로
      // 별도 조인 없이 바로 사용 (null인 경우에만 fallback으로 games/providers 조회)
      
      // game_title이나 provider_name이 null인 레코드들을 위한 fallback 조회
      const recordsNeedingGameInfo = data?.filter(r => !r.game_title && r.game_id) || [];
      const recordsNeedingProviderInfo = data?.filter(r => !r.provider_name && r.provider_id) || [];
      
      const gameIds = [...new Set(recordsNeedingGameInfo.map(r => r.game_id))] as number[];
      const providerIds = [...new Set(recordsNeedingProviderInfo.map(r => r.provider_id))] as number[];
      
      console.log('🎮 Fallback 필요한 게임 ID:', gameIds.length, '개');
      console.log('🏢 Fallback 필요한 제공사 ID:', providerIds.length, '개');
      
      // 게임 정보 조회 (fallback)
      const gameMap = new Map<number, string>();
      if (gameIds.length > 0) {
        // 일반 games 테이블 조회
        const { data: gamesData } = await supabase
          .from('games')
          .select('id, name')
          .in('id', gameIds);
        
        gamesData?.forEach(game => {
          gameMap.set(game.id, game.name);
        });
        
        // honor_games 테이블도 조회
        const { data: honorGamesData } = await supabase
          .from('honor_games')
          .select('id, name')
          .in('id', gameIds);
        
        honorGamesData?.forEach(game => {
          gameMap.set(game.id, game.name);
        });
        
        console.log('✅ 게임 맵 생성 (fallback):', gameMap.size, '개');
      }
      
      // 제공사 정보 조회 (fallback)
      const providerMap = new Map<number, string>();
      if (providerIds.length > 0) {
        // 일반 game_providers 테이블 조회
        const { data: providersData } = await supabase
          .from('game_providers')
          .select('id, name')
          .in('id', providerIds);
        
        providersData?.forEach(provider => {
          providerMap.set(provider.id, provider.name);
        });
        
        // honor_game_providers 테이블도 조회
        const { data: honorProvidersData } = await supabase
          .from('honor_game_providers')
          .select('id, name')
          .in('id', providerIds);
        
        honorProvidersData?.forEach(provider => {
          providerMap.set(provider.id, provider.name);
        });
        
        console.log('✅ 제공사 맵 생성 (fallback):', providerMap.size, '개');
      }
      
      // ✅ 데이터 매핑 (이미 저장된 값 우선 사용, null인 경우에만 fallback)
      const mappedData = (data || []).map((record: any) => ({
        ...record,
        game_title: record.game_title || (record.game_id ? gameMap.get(record.game_id) || null : null),
        provider_name: record.provider_name || (record.provider_id ? providerMap.get(record.provider_id) || null : null)
      }));
      
      console.log('📋 매핑된 첫 레코드:', mappedData[0]);
      
      // 데이터 상태 업데이트
      setBettingRecords(mappedData);
    } catch (error) {
      console.error('❌ 베팅 데이터 로드 오류:', error);
      toast.error(t.bettingHistory.loadFailed);
    }
  };

  // CSV 다운로드
  const downloadExcel = () => {
    try {
      const csvContent = [
        ['TX ID', t.common.username, t.bettingHistory.gameName, t.bettingHistory.provider, t.bettingHistory.betAmount, t.bettingHistory.winAmount, t.bettingHistory.balanceBefore, t.bettingHistory.balanceAfter, t.bettingHistory.profitLoss, t.bettingHistory.playTime].join(','),
        ...filteredRecords.map(record => {
          // ✅ 손익 = 잔액 변화 (베팅후잔액 - 베팅전잔액)
          const profitLoss = parseFloat(record.balance_after?.toString() || '0') - parseFloat(record.balance_before?.toString() || '0');
          const gameType = record.game_type || 'casino';
          const gameTypeText = gameType === 'slot' ? '슬롯' : '카지노';
          
          return [
            record.external_txid,
            record.username,
            record.game_title || `Game ${record.game_id}`,
            gameTypeText,
            record.bet_amount,
            record.win_amount,
            record.balance_before,
            record.balance_after,
            profitLoss,
            formatKoreanDate(record.played_at)
          ].join(',');
        })
      ].join('\\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `betting_history_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success(t.bettingHistory.downloadSuccess);
    } catch (error) {
      console.error('다운로드 오류:', error);
      toast.error(t.bettingHistory.downloadFailed);
    }
  };

  // 초기 로드
  useEffect(() => {
    setLoading(true);
    loadBettingData().finally(() => setLoading(false));
  }, [dateFilter, user.id]);

  // ✅ Realtime 구독 - 자동 업데이트 (한번만 설정)
  useEffect(() => {
    console.log('🔌 Realtime 구독 시작');
    
    const channel = supabase
      .channel('betting-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_records'
        },
        (payload) => {
          console.log('🎲 신규 베팅 데이터 감지:', payload);
          // 즉시 데이터 재로드
          loadBettingData();
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime 구독 상태:', status);
      });

    return () => {
      console.log('🔌 Realtime 구독 해제');
      supabase.removeChannel(channel);
    };
  }, []); // ⚠️ 의존성 배열 비움 - 한번만 구독

  // ✅ 검색 필터링 (useMemo로 메모이제이션)
  const filteredRecords = useMemo(() => {
    return bettingRecords.filter(record => {
      // 검색 필터
      if (!searchTerm) return true;
      
      const searchLower = searchTerm.toLowerCase();
      return (
        record.username?.toLowerCase().includes(searchLower) ||
        record.game_title?.toLowerCase().includes(searchLower) ||
        record.provider_name?.toLowerCase().includes(searchLower) ||
        record.external_txid?.toString().includes(searchLower)
      );
    });
  }, [bettingRecords, searchTerm]);

  // ✅ 검색된 데이터 기준으로 통계 계산 (useMemo로 메모이제이션)
  const stats = useMemo(() => {
    if (filteredRecords.length > 0) {
      const totalBetAmount = filteredRecords.reduce((sum, r) => sum + Math.abs(parseFloat(r.bet_amount?.toString() || '0')), 0);
      const totalWinAmount = filteredRecords.reduce((sum, r) => sum + parseFloat(r.win_amount?.toString() || '0'), 0);

      return {
        totalBets: filteredRecords.length,
        totalBetAmount,
        totalWinAmount,
        netProfit: totalBetAmount - totalWinAmount  // ✅ 순손익 = 총 베팅액 - 당첨액
      };
    } else {
      return {
        totalBets: 0,
        totalBetAmount: 0,
        totalWinAmount: 0,
        netProfit: 0
      };
    }
  }, [filteredRecords]);

  // 테이블 컬럼 정의 (가독성 향상을 위한 명확한 컬러링)
  const columns = [
    {
      key: 'username',
      header: t.common.username,
      render: (_: any, record: BettingRecord) => (
        <span className="text-blue-300 font-medium text-xl">{record?.username}</span>
      )
    },
    {
      key: 'game_title',
      header: t.bettingHistory.gameName,
      render: (_: any, record: BettingRecord) => (
        <span className="text-slate-200 text-xl">{record?.game_title || `Korean Speed Baccarat A`}</span>
      )
    },
    {
      key: 'game_type',
      header: t.bettingHistory.provider,
      render: (_: any, record: BettingRecord) => {
        const gameType = record?.game_type || 'casino';
        const displayText = gameType === 'slot' ? '슬롯' : '카지노';
        
        return (
          <span className="text-slate-200 text-xl">
            {displayText}
          </span>
        );
      }
    },
    {
      key: 'bet_amount',
      header: t.bettingHistory.betAmount,
      render: (_: any, record: BettingRecord) => {
        const amount = Math.abs(Number(record?.bet_amount || 0));
        return <span className="text-orange-400 font-semibold text-xl">₩{amount.toLocaleString()}</span>;
      }
    },
    {
      key: 'win_amount',
      header: t.bettingHistory.winAmount,
      render: (_: any, record: BettingRecord) => {
        const amount = Number(record?.win_amount || 0);
        if (amount === 0) return <span className="text-slate-500">-</span>;
        return <span className="text-emerald-400 font-semibold text-xl">₩{amount.toLocaleString()}</span>;
      }
    },
    {
      key: 'balance_before',
      header: t.bettingHistory.balanceBefore,
      render: (_: any, record: BettingRecord) => (
        <span className="text-slate-300 text-xl">₩{Number(record?.balance_before || 0).toLocaleString()}</span>
      )
    },
    {
      key: 'balance_after',
      header: t.bettingHistory.balanceAfter,
      render: (_: any, record: BettingRecord) => {
        const balanceBefore = Number(record?.balance_before || 0);
        const betAmount = Math.abs(Number(record?.bet_amount || 0));
        const winAmount = Number(record?.win_amount || 0);
        const balanceAfter = balanceBefore - betAmount + winAmount;
        
        return (
          <span className="text-slate-300 text-xl">₩{balanceAfter.toLocaleString()}</span>
        );
      }
    },
    {
      key: 'profit',
      header: t.bettingHistory.profitLoss,
      render: (_: any, record: BettingRecord) => {
        if (!record) return <span>-</span>;
        // ✅ 손익 = -베팅액 + 당첨액
        const betAmount = Math.abs(Number(record.bet_amount || 0));
        const winAmount = Number(record.win_amount || 0);
        const profit = -betAmount + winAmount;
        const profitColor = profit > 0 ? 'text-green-400' : profit < 0 ? 'text-red-400' : 'text-slate-400';
        return (
          <span className={`${profitColor} font-bold text-xl`}>
            {profit > 0 ? '+' : ''}₩{profit.toLocaleString()}
          </span>
        );
      }
    },
    {
      key: 'played_at',
      header: t.bettingHistory.dateTime,
      render: (_: any, record: BettingRecord) => (
        <span className="text-lg text-slate-400">{formatKoreanDate(record?.played_at)}</span>
      )
    }
  ];

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title={t.bettingHistory.totalBets}
          value={stats.totalBets.toLocaleString()}
          icon={CreditCard}
          color="purple"
        />
        <MetricCard
          title={t.bettingHistory.totalBetAmount}
          value={`₩${stats.totalBetAmount.toLocaleString()}`}
          icon={CreditCard}
          color="red"
        />
        <MetricCard
          title={t.bettingHistory.totalWinAmount}
          value={`₩${stats.totalWinAmount.toLocaleString()}`}
          icon={CreditCard}
          color="green"
        />
        <MetricCard
          title={t.bettingHistory.netProfit}
          value={`₩${stats.netProfit.toLocaleString()}`}
          icon={CreditCard}
          color={stats.netProfit <= 0 ? "green" : "red"}
        />
      </div>

      {/* 필터 및 액션 */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2 items-center w-full md:w-auto flex-wrap">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[100px] h-14 text-lg">
              <SelectValue placeholder={t.bettingHistory.periodSelection} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-lg">전체</SelectItem>
              <SelectItem value="today" className="text-lg">{t.bettingHistory.today}</SelectItem>
              <SelectItem value="week" className="text-lg">{t.bettingHistory.last7Days}</SelectItem>
              <SelectItem value="month" className="text-lg">{t.bettingHistory.last30Days}</SelectItem>
            </SelectContent>
          </Select>
          
          <Input
            placeholder={t.bettingHistory.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-[260px] h-14 text-lg"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleForceRefresh} variant="outline" className="h-14 px-6 text-lg" disabled={refreshing}>
            <RefreshCw className={`h-6 w-6 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? t.common.refreshing : t.common.refresh}
          </Button>
          <Button onClick={downloadExcel} variant="outline" className="h-14 px-6 text-lg">
            <Download className="h-6 w-6 mr-2" />
            {t.bettingHistory.csvDownload}
          </Button>
        </div>
      </div>

      {/* 데이터 테이블 */}
      <DataTable
        data={filteredRecords}
        columns={columns}
        emptyMessage={t.bettingHistory.noBettingRecords}
        enableSearch={false}
        pageSize={20}
      />
    </div>
  );
}