import { useState, useEffect, useMemo } from "react";
import { CreditCard, Download, RefreshCw, Eye, ChevronDown, ChevronUp, X } from "lucide-react";
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
import { getTodayStartUTC, getTomorrowStartUTC, formatSystemTime } from "../../utils/timezone";
import { GameResultDetail } from "./GameResultDetail";
import { GameResultInline } from "./GameResultInline";

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
  api_type?: string; // ✅ API 타입 추가
  bet_amount: number;
  win_amount: number;
  balance_before: number;
  balance_after: number;
  played_at: string;
  external?: {
    id: string;
    detail: any;
  } | null;
}

export function BettingHistory({ user }: BettingHistoryProps) {
  const { t } = useLanguage();
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bettingRecords, setBettingRecords] = useState<BettingRecord[]>([]);
  const [dateFilter, setDateFilter] = useState("today"); // ✅ 기본값을 'today'로 설정
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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
    const tomorrowStart = getTomorrowStartUTC();
    
    console.log('📅 [getDateRange] 계산 시작:');
    console.log('   now:', now.toISOString());
    console.log('   todayStart:', todayStart);
    console.log('   tomorrowStart:', tomorrowStart);
    console.log('   filter:', filter);
    
    switch (filter) {
      case 'today':
        // 오늘 0시(UTC+9) ~ 내일 0시(UTC+9)
        const result = { start: todayStart, end: tomorrowStart };
        console.log('   📊 RESULT:', result);
        return result;
      case 'week':
        const weekStart = new Date(new Date(todayStart).getTime() - 7 * 86400000).toISOString();
        const weekResult = { start: weekStart, end: tomorrowStart };
        console.log('   📊 RESULT:', weekResult);
        return weekResult;
      case 'month':
        const monthStart = new Date(new Date(todayStart).getTime() - 30 * 86400000).toISOString();
        const monthResult = { start: monthStart, end: tomorrowStart };
        console.log('   📊 RESULT:', monthResult);
        return monthResult;
      default:
        console.log('   📊 RESULT: null (unknown filter)');
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
  const loadBettingData = async (filter: string = dateFilter) => {
    let data: any = null;
    
    try {
      console.log('🔄 베팅 데이터 로드 시작', { filter });
      
      const dateRange = getDateRange(filter);

      // ✅ Get allowed partner IDs by permission level
      let allowedPartnerIds: string[] = [];
      
      if (user.level === 1) {
        // System admin: all partners + self
        allowedPartnerIds = [user.id];
        const { data: allPartners } = await supabase
          .from('partners')
          .select('id');
        allowedPartnerIds.push(...(allPartners?.map(p => p.id) || []));
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

      // ✅ System Admin: 모든 데이터 조회
      if (user.level === 1) {
        console.log('🔍 System Admin: Query ALL game records');
        console.log('   dateRange:', dateRange);
        
        let adminQuery = supabase.from('game_records').select('*');
        
        if (dateRange) {
          console.log('   ✅ 날짜 필터 적용:', { start: dateRange.start, end: dateRange.end });
          adminQuery = adminQuery
            .gte('played_at', dateRange.start)
            .lte('played_at', dateRange.end);
          console.log('   📋 필터링된 쿼리 URL:', adminQuery.url.href);
        } else {
          console.log('   ⚠️ 날짜 필터 미적용 (dateRange === null)');
        }
        
        adminQuery = adminQuery
          .order('played_at', { ascending: false })
          .order('external_txid', { ascending: false })
          .limit(1000);

        const { data: adminData, error: adminError } = await adminQuery;
        if (adminError) throw adminError;
        
        console.log('   ✅ System Admin 쿼리 완료:', adminData?.length || 0, '건');
        if (adminData && adminData.length > 0) {
          console.log('   샘플 [0]:', {
            username: adminData[0].username,
            played_at: adminData[0].played_at
          });
          console.log('   샘플 [-1]:', {
            username: adminData[adminData.length - 1].username,
            played_at: adminData[adminData.length - 1].played_at
          });
        }
        
        data = adminData;
      } else {
        // ✅ Regular Admin: user_id 또는 partner_id로 필터링
        // 🔴 먼저 조직 내 모든 게임 기록이 있는지 확인
        const { data: allOrgRecords, count: allOrgCount } = await supabase
          .from('game_records')
          .select('id', { count: 'exact' })
          .in('partner_id', allowedPartnerIds)
          .limit(1);
        
        console.log('🔍 [DEBUG] 조직 내 game_records (partner_id 기준):', allOrgCount, '건');
        if (allOrgRecords && allOrgRecords.length > 0) {
          console.log('🔍 [DEBUG] 첫 번째 레코드 존재');
        }
        
        // Regular admin: filter by child user IDs
        const { data: usersData } = await supabase
          .from('users')
          .select('id')
          .in('referrer_id', allowedPartnerIds);
        
        const userIds = usersData?.map(u => u.id) || [];
        console.log('👤 하위 회원 ID 개수:', userIds.length);
        console.log('👤 allowedPartnerIds:', allowedPartnerIds);
        console.log('👤 usersData:', usersData);
        
        // ✅ 두 개의 쿼리로 나누어 실행 (OR 대신 결과 병합)
        let baseQuery1 = supabase.from('game_records').select('*');
        let baseQuery2 = supabase.from('game_records').select('*');
        
        if (userIds.length > 0) {
          baseQuery1 = baseQuery1.in('user_id', userIds);
          baseQuery2 = baseQuery2.in('partner_id', allowedPartnerIds);
          console.log('🔍 Query 1 with user IDs:', userIds);
          console.log('🔍 Query 2 with partner IDs:', allowedPartnerIds);
        } else {
          // ✅ FIX: 하위 회원이 없으면 partner_id로만 조회
          console.log('⚠️ 하위 회원이 없습니다. partner_id로 직접 조회...');
          baseQuery1 = baseQuery1.in('partner_id', allowedPartnerIds);
          baseQuery2 = null;
          console.log('🔍 Query with partner IDs filter:', allowedPartnerIds);
        }
        
        // 날짜 필터가 있을 때만 적용
        if (dateRange) {
          baseQuery1 = baseQuery1
            .gte('played_at', dateRange.start)
            .lte('played_at', dateRange.end);
          if (baseQuery2) {
            baseQuery2 = baseQuery2
              .gte('played_at', dateRange.start)
              .lte('played_at', dateRange.end);
          }
        }
        
        // 정렬 및 제한
        baseQuery1 = baseQuery1
          .order('played_at', { ascending: false })
          .order('external_txid', { ascending: false })
          .limit(1000);
        
        if (baseQuery2) {
          baseQuery2 = baseQuery2
            .order('played_at', { ascending: false })
            .order('external_txid', { ascending: false })
            .limit(1000);
        }

        console.log('🔍 [BettingHistory] 최종 쿼리 실행 전:');
        console.log('   - user.level:', user.level);
        console.log('   - dateRange:', dateRange);
        console.log('   - baseQuery1 URL:', baseQuery1.url);
        if (baseQuery2) console.log('   - baseQuery2 URL:', baseQuery2.url);

        const { data: data1, error: error1 } = await baseQuery1;
        const { data: data2, error: error2 } = baseQuery2 ? await baseQuery2 : { data: [], error: null };

        if (error1) {
          console.error('❌ Query 1 실패:', error1);
          throw error1;
        }
        if (error2) {
          console.error('❌ Query 2 실패:', error2);
          throw error2;
        }

        // 두 쿼리 결과 병합 (중복 제거)
        const allData = [...(data1 || []), ...(data2 || [])];
        const uniqueData = Array.from(new Map(allData.map(item => [item.id, item])).values());
        uniqueData.sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());
        data = uniqueData.slice(0, 1000);

        console.log('✅ 베팅 데이터 로드 성공:', data?.length || 0, '건', {
          filter,
          dateRange,
          dataLength: data?.length,
          query1Count: data1?.length,
          query2Count: data2?.length
        });
      }
      
      // 🔍 디버깅: 첫 번째 레코드 출력
      if (data && data.length > 0) {
        console.log('📋 첫 번째 레코드:', {
          id: data[0].id,
          username: data[0].username,
          bet_amount: data[0].bet_amount,
          played_at: data[0].played_at
        });
      } else {
        console.log('⚠️ 조회된 데이터가 없습니다');
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
      
      console.log('📋 매핑된 데이터:', {
        mappedDataLength: mappedData.length,
        firstRecord: mappedData[0] ? {
          id: mappedData[0].id,
          username: mappedData[0].username,
          bet_amount: mappedData[0].bet_amount
        } : null
      });
      
      // ⭐ 데이터 상태 업데이트 - 처음 로드면 바로 설정, 이후는 병합
      setBettingRecords(prev => {
        // 처음 로드거나 새로 로드한 데이터가 있으면 새 데이터로 교체
        if (prev.length === 0 || mappedData.length > 0) {
          console.log(`✅ 베팅 레코드 업데이트: ${prev.length}건 → ${mappedData.length}건`);
          return mappedData;
        }
        
        // 새로 로드한 데이터가 없으면 기존 데이터 유지
        console.log('⚠️ 로드된 데이터 없음 - 기존 데이터 유지:', prev.length, '건');
        return prev;
      });
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

  // 초기 로드 (마운트 시에만)
  useEffect(() => {
    setLoading(true);
    
    // ✅ 초기 로드: "today" 필터로 데이터 로드 후 상태 업데이트
    const loadInitial = async () => {
      await loadBettingData("today");
      setDateFilter("today");
      console.log('✅ 초기 로드 완료: today 필터');
    };
    
    loadInitial().finally(() => setLoading(false));
  }, [user.id]); // user.id 변경 시만 재로드

  // dateFilter 변경 시 데이터 새로고침
  useEffect(() => {
    console.log('📅 dateFilter 변경:', dateFilter);
    loadBettingData(dateFilter);
  }, [dateFilter]);

  // ✅ Realtime 구독 - 자동 업데이트 (INSERT, DELETE, UPDATE)
  useEffect(() => {
    console.log('🔌 Realtime 구독 시작');
    
    const channel = supabase
      .channel('betting-realtime-' + Math.random())
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_records'
        },
        (payload) => {
          console.log('🎲 신규 베팅 데이터 감지:', payload.new?.external_txid);
          // ✅ 전체 새로고침 대신 1초 후 새로고침 (배치 처리)
          setTimeout(() => loadBettingData(), 1000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'game_records'
        },
        (payload) => {
          console.log('🗑️ 베팅 데이터 삭제:', payload.old?.external_txid);
          // DELETE는 즉시 UI에서 제거
          setBettingRecords(prev => 
            prev.filter(r => r.id !== payload.old?.id)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_records'
        },
        (payload) => {
          console.log('✏️ 베팅 데이터 수정:', payload.new?.external_txid);
          // UPDATE는 즉시 UI에서 반영
          setBettingRecords(prev =>
            prev.map(r => r.id === payload.new?.id ? payload.new : r)
          );
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
    console.log('📊 filteredRecords 계산:', { bettingRecordsLength: bettingRecords.length, searchTerm });
    
    const result = bettingRecords.filter(record => {
      // 검색 필터 - 사용자명, 게임명만
      if (!searchTerm) return true;
      
      const searchLower = searchTerm.toLowerCase();
      return (
        record.username?.toLowerCase().includes(searchLower) ||
        record.game_title?.toLowerCase().includes(searchLower)
      );
    });
    
    console.log('✅ filteredRecords 결과:', result.length, '건');
    return result;
  }, [bettingRecords, searchTerm]);

  // ✅ 검색된 데이터 기준으로 통계 계산 (useMemo로 메모이제이션)
  const stats = useMemo(() => {
    if (filteredRecords.length > 0) {
      const totalBetAmount = filteredRecords.reduce((sum, r) => sum + Math.abs(parseFloat(r.bet_amount?.toString() || '0')), 0);
      const totalWinAmount = filteredRecords.reduce((sum, r) => sum + parseFloat(r.win_amount?.toString() || '0'), 0);
      
      // ✅ 카지노/슬롯 베팅액 분리 집계
      const casinoBetAmount = filteredRecords
        .filter(r => r.game_type === 'casino')
        .reduce((sum, r) => sum + Math.abs(parseFloat(r.bet_amount?.toString() || '0')), 0);
      
      const slotBetAmount = filteredRecords
        .filter(r => r.game_type === 'slot')
        .reduce((sum, r) => sum + Math.abs(parseFloat(r.bet_amount?.toString() || '0')), 0);

      return {
        totalBets: filteredRecords.length,
        totalBetAmount,
        totalWinAmount,
        netProfit: totalBetAmount - totalWinAmount,  // ✅ 순손익 = 총 베팅액 - 당첨액
        casinoBetAmount,  // ✅ 카지노 베팅액
        slotBetAmount     // ✅ 슬롯 베팅액
      };
    } else {
      return {
        totalBets: 0,
        totalBetAmount: 0,
        totalWinAmount: 0,
        netProfit: 0,
        casinoBetAmount: 0,
        slotBetAmount: 0
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
      render: (_: any, record: BettingRecord) => {
        // ✅ game_title이 null이면 빨간색으로 "정보 누락" 표시
        if (!record?.game_title || record.game_title === 'null') {
          return <span className="text-red-400 font-semibold text-xl">Game null</span>;
        }
        return <span className="text-slate-200 text-xl">{record.game_title}</span>;
      }
    },
    {
      key: 'provider_name',
      header: t.bettingHistory.provider,
      render: (_: any, record: BettingRecord) => {
        // ✅ provider_name이 null이면 빨간색으로 "정보 누락" 표시
        if (!record?.provider_name || record.provider_name === 'null') {
          return <span className="text-red-400 font-semibold text-xl">Provider null</span>;
        }
        return <span className="text-slate-200 text-xl">{record.provider_name}</span>;
      }
    },
    {
      key: 'api_type',
      header: 'API',
      render: (_: any, record: BettingRecord) => {
        const apiType = record?.api_type || '-';
        const apiColors: Record<string, string> = {
          'invest': 'bg-blue-500/20 text-blue-300 border-blue-500/50',
          'oroplay': 'bg-purple-500/20 text-purple-300 border-purple-500/50',
          'familyapi': 'bg-green-500/20 text-green-300 border-green-500/50',
          'honorapi': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
        };
        const colorClass = apiColors[apiType] || 'bg-slate-500/20 text-slate-300 border-slate-500/50';
        
        return (
          <Badge className={`${colorClass} border text-sm px-2 py-1`}>
            {apiType.toUpperCase()}
          </Badge>
        );
      }
    },
    {
      key: 'game_type',
      header: '게임타입',
      render: (_: any, record: BettingRecord) => {
        // ✅ game_title이나 provider_name이 null이면 "누락"으로 표시
        const hasNullInfo = !record?.game_title || record.game_title === 'null' || 
                           !record?.provider_name || record.provider_name === 'null';
        
        if (hasNullInfo) {
          return (
            <Badge className="bg-red-500/20 text-red-300 border-red-500/50 border text-sm px-2 py-1">
              누락
            </Badge>
          );
        }
        
        const gameType = record?.game_type || 'casino';
        const isCasino = gameType === 'casino';
        
        return (
          <Badge className={`${isCasino ? 'bg-orange-500/20 text-orange-300 border-orange-500/50' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'} border text-sm px-2 py-1`}>
            {isCasino ? '카지노' : '슬롯'}
          </Badge>
        );
      }
    },
    {
      key: 'bet_amount',
      header: t.bettingHistory.betAmount,
      render: (_: any, record: BettingRecord) => {
        const amount = Math.abs(Number(record?.bet_amount || 0));
        return <span className="text-orange-400 font-semibold text-xl">{amount.toLocaleString()}</span>;
      }
    },
    {
      key: 'win_amount',
      header: t.bettingHistory.winAmount,
      render: (_: any, record: BettingRecord) => {
        const amount = Number(record?.win_amount || 0);
        if (amount === 0) return <span className="text-slate-500">-</span>;
        return <span className="text-emerald-400 font-semibold text-xl">{amount.toLocaleString()}</span>;
      }
    },
    {
      key: 'balance_before',
      header: t.bettingHistory.balanceBefore,
      render: (_: any, record: BettingRecord) => (
        <span className="text-slate-300 text-xl">{Number(record?.balance_before || 0).toLocaleString()}</span>
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
          <span className="text-slate-300 text-xl">{balanceAfter.toLocaleString()}</span>
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
            {profit > 0 ? '+' : ''}{profit.toLocaleString()}
          </span>
        );
      }
    },
    {
      key: 'game_result',
      header: '게임 결과',
      render: (_: any, record: BettingRecord) => {
        if (!record?.external?.detail) return <span className="text-slate-500 text-sm">-</span>;
        
        const isExpanded = expandedRow === record.id;
        
        return (
          <div>
            <Button
              onClick={() => setExpandedRow(isExpanded ? null : record.id)}
              variant="outline"
              size="sm"
              className="h-8 px-3 text-sm"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {isExpanded ? '닫기' : '보기'}
            </Button>
            {isExpanded && (
              <div className="mt-2">
                <GameResultInline
                  external={record.external}
                  gameTitle={record.game_title}
                />
              </div>
            )}
          </div>
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
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
        <MetricCard
          title="카지노 베팅"
          value={`₩${stats.casinoBetAmount.toLocaleString()}`}
          icon={CreditCard}
          color="orange"
        />
        <MetricCard
          title="슬롯 베팅"
          value={`₩${stats.slotBetAmount.toLocaleString()}`}
          icon={CreditCard}
          color="cyan"
        />
      </div>

      {/* 필터 및 액션 */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2 items-center w-full md:w-auto flex-wrap">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[100px] h-14 text-lg py-3 px-3 [&>span]:line-clamp-1 [&>svg]:h-5">
              <SelectValue placeholder={t.bettingHistory.periodSelection} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-lg">전체</SelectItem>
              <SelectItem value="today" className="text-lg">{t.bettingHistory.today}</SelectItem>
              <SelectItem value="week" className="text-lg">{t.bettingHistory.last7Days}</SelectItem>
              <SelectItem value="month" className="text-lg">{t.bettingHistory.last30Days}</SelectItem>
            </SelectContent>
          </Select>
          
          <div className="relative w-[260px]">
            <Input
              placeholder={t.bettingHistory.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full !h-14 text-lg py-3 px-3 !py-3 pr-10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="검색 초기화"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
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
        key={`betting-table-${dateFilter}`}
        data={filteredRecords}
        columns={columns}
        emptyMessage={t.bettingHistory.noBettingRecords}
        enableSearch={false}
        pageSize={20}
      />
    </div>
  );
}