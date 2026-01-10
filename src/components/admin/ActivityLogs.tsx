import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Partner } from "../../types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { DataTable } from "../common/DataTable";
import { RefreshCw, Search, Calendar, User, Shield, AlertCircle, CheckCircle, XCircle, Activity, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { MetricCard } from "./MetricCard";

interface ActivityLog {
  id: string;
  actor_id: string;
  actor_type: 'partner' | 'user';
  actor_username?: string;
  actor_nickname?: string;
  action: string; // 기존 테이블의 'action' 컬럼
  target_type?: string;
  target_id?: string;
  details?: Record<string, any>; // 기존 테이블의 'details' 컬럼 (description, success 포함)
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

interface ActivityLogsProps {
  user: Partner;
}

export function ActivityLogs({ user }: ActivityLogsProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false); // ⚡ 초기 로딩을 false로 유지
  const [refreshing, setRefreshing] = useState(false);
  const [cleaningLogs, setCleaningLogs] = useState(false);
  
  // 필터
  const [actorTypeFilter, setActorTypeFilter] = useState<'all' | 'partner' | 'user'>('all');
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('today');

  useEffect(() => {
    loadLogs();
  }, [user.id, actorTypeFilter, activityTypeFilter, dateFilter]);

  const loadLogs = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else if (logs.length === 0) {
        setLoading(true);
      }

      // 날짜 범위 계산
      const now = new Date();
      let startDate = new Date();
      
      switch (dateFilter) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'yesterday':
          startDate.setDate(startDate.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'all':
          startDate = new Date('2020-01-01'); // 충분히 과거
          break;
      }

      // 기본 쿼리
      let query = supabase
        .from('activity_logs')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);

      // 권한 필터링 (Lv1이 아니면 자신과 하위 조직만)
      if (user.level !== 1) {
        // 자신의 활동만 조회
        query = query.eq('actor_id', user.id);
      }

      // 행위자 타입 필터
      if (actorTypeFilter !== 'all') {
        query = query.eq('actor_type', actorTypeFilter);
      }

      // 활동 타입 필터
      if (activityTypeFilter !== 'all') {
        query = query.eq('action', activityTypeFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // ⚡ N+1 쿼리 최적화: 배치 쿼리로 행위자 정보 조회
      const rawLogs = data || [];
      
      // 파트너와 사용자 ID를 그룹화
      const partnerIds = [...new Set(rawLogs.filter(l => l.actor_type === 'partner').map(l => l.actor_id))];
      const userIds = [...new Set(rawLogs.filter(l => l.actor_type === 'user').map(l => l.actor_id))];
      
      // 배치 쿼리로 한 번에 조회
      const [partnersResult, usersResult] = await Promise.all([
        partnerIds.length > 0 
          ? supabase.from('partners').select('id, username, nickname').in('id', partnerIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length > 0
          ? supabase.from('users').select('id, username, nickname').in('id', userIds)
          : Promise.resolve({ data: [], error: null })
      ]);

      // Map으로 빠른 조회 구조 생성
      const partnersMap = new Map((partnersResult.data || []).map(p => [p.id, p]));
      const usersMap = new Map((usersResult.data || []).map(u => [u.id, u]));

      // 로그에 행위자 정보 병합 (클라이언트 사이드)
      const logsWithActorInfo = rawLogs.map(log => {
        let actorUsername = '-';
        let actorNickname = '-';

        if (log.actor_type === 'partner') {
          const partner = partnersMap.get(log.actor_id);
          if (partner) {
            actorUsername = partner.username;
            actorNickname = partner.nickname || partner.username;
          }
        } else if (log.actor_type === 'user') {
          const user = usersMap.get(log.actor_id);
          if (user) {
            actorUsername = user.username;
            actorNickname = user.nickname || user.username;
          }
        }

        return {
          ...log,
          actor_username: actorUsername,
          actor_nickname: actorNickname
        };
      });

      setLogs(logsWithActorInfo);
    } catch (error) {
      console.error('로그 조회 실패:', error);
      if (isManualRefresh) {
        toast.error('로그 조회 실패');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 활동 타입 한글명 매핑
  const getActivityTypeName = (type: string) => {
    const typeMap: Record<string, string> = {
      login: '로그인',
      logout: '로그아웃',
      login_failed: '로그인 실패',
      user_create: '회원 생성',
      user_update: '회원 수정',
      user_delete: '회원 삭제',
      user_balance_change: '회원 머니 변경',
      partner_create: '파트너 생성',
      partner_update: '파트너 수정',
      partner_balance_change: '파트너 머니 변경',
      deposit_request: '입금 요청',
      deposit_approve: '입금 승인',
      deposit_reject: '입금 거부',
      withdrawal_request: '출금 요청',
      withdrawal_approve: '출금 승인',
      withdrawal_reject: '출금 거부',
      game_launch: '게임 실행',
      game_end: '게임 종료',
      game_force_end: '게임 강제종료',
      // 🆕 게임 관련 추가 액션
      game_started: '게임 시작 성공',
      game_start_failed: '게임 시작 실패',
      game_session_ended: '게임 세션 종료',
      game_session_end_failed: '게임 세션 종료 실패',
      game_withdraw_failed: 'API 출금 실패',
      negative_balance_detected: '음수 잔고 감지',
      negative_final_balance_detected: '음수 최종 잔고 감지',
      settlement_execute: '정산 실행',
      commission_settle: '수수료 정산',
      system_setting_update: '시스템 설정 변경',
      page_view: '페이지 조회',
      data_export: '데이터 내보내기',
    };
    return typeMap[type] || type;
  };

  // 활동 타입별 색상
  const getActivityTypeColor = (type: string) => {
    if (type.includes('login')) return 'blue';
    if (type.includes('create')) return 'green';
    if (type.includes('update') || type.includes('change')) return 'amber';
    if (type.includes('delete') || type.includes('reject')) return 'red';
    if (type.includes('approve')) return 'emerald';
    if (type.includes('game')) return 'purple';
    if (type.includes('settlement')) return 'cyan';
    return 'slate';
  };

  // 검색 필터링
  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.actor_username?.toLowerCase().includes(term) ||
      log.actor_nickname?.toLowerCase().includes(term) ||
      log.details?.description?.toLowerCase().includes(term) ||
      log.ip_address?.toLowerCase().includes(term)
    );
  });

  // 오래된 로그 정리 함수 (Lv1 전용)
  const cleanOldLogs = async () => {
    if (user.level !== 1) {
      toast.error('Lv1 관리자만 로그를 정리할 수 있습니다.');
      return;
    }

    try {
      setCleaningLogs(true);

      // 시스템 설정에서 보관 기간 가져오기
      const { data: settingData, error: settingError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'activity_log_retention_days')
        .single();

      if (settingError && settingError.code !== 'PGRST116') {
        throw settingError;
      }

      const retentionDays = settingData?.setting_value ? parseInt(settingData.setting_value) : 90;

      // 삭제 기준 날짜 계산
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // 삭제할 로그 수 먼저 확인
      const { count, error: countError } = await supabase
        .from('activity_logs')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', cutoffDate.toISOString());

      if (countError) throw countError;

      if (!count || count === 0) {
        toast.info(`${retentionDays}일 이전의 로그가 없습니다.`);
        return;
      }

      // 확인 메시지
      const confirmed = window.confirm(
        `${retentionDays}일 이전의 활동 로그 ${count}건을 삭제합니다.\n계속하시겠습니까?`
      );

      if (!confirmed) return;

      // 오래된 로그 삭제
      const { error: deleteError } = await supabase
        .from('activity_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (deleteError) throw deleteError;

      toast.success(`${count}건의 오래된 활동 로그가 삭제되었습니다.`);
      
      // 로그 다시 로드
      await loadLogs(true);

    } catch (error) {
      console.error('로그 정리 실패:', error);
      toast.error('로그 정리 중 오류가 발생했습니다.');
    } finally {
      setCleaningLogs(false);
    }
  };

  const columns = [
    {
      key: 'created_at',
      header: '날짜/시간',
      sortable: true,
      render: (value: string) => (
        <div className="text-slate-300 text-base">
          <div className="font-medium">{format(new Date(value), 'yyyy-MM-dd', { locale: ko })}</div>
          <div className="text-sm text-slate-500">
            {format(new Date(value), 'HH:mm:ss', { locale: ko })}
          </div>
        </div>
      ),
    },
    {
      key: 'actor_type',
      header: '타입',
      render: (value: string) => (
        <Badge variant={value === 'partner' ? 'default' : 'secondary'} className="text-base px-3 py-1">
          {value === 'partner' ? (
            <><Shield className="w-4 h-4 mr-1" />관리자</>
          ) : (
            <><User className="w-4 h-4 mr-1" />회원</>
          )}
        </Badge>
      ),
    },
    {
      key: 'actor_username',
      header: '아이디',
      sortable: true,
      render: (value: string, row: ActivityLog) => (
        <div>
          <div className="text-slate-200 text-base font-medium">{value}</div>
          <div className="text-sm text-slate-500">{row.actor_nickname}</div>
        </div>
      ),
    },
    {
      key: 'action',
      header: '활동 유형',
      sortable: true,
      render: (value: string) => {
        const color = getActivityTypeColor(value);
        const colorClasses: Record<string, string> = {
          blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          green: 'bg-green-500/10 text-green-400 border-green-500/30',
          amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          red: 'bg-red-500/10 text-red-400 border-red-500/30',
          emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
          cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
          slate: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
        };
        return (
          <Badge variant="outline" className={`${colorClasses[color]} text-base px-3 py-1`}>
            {getActivityTypeName(value)}
          </Badge>
        );
      },
    },
    {
      key: 'details',
      header: '활동 내용',
      render: (value: Record<string, any>) => (
        <div className="text-slate-300 max-w-md text-base">
          <div className="truncate" title={value?.description}>
            {value?.description || '-'}
          </div>
          {value && Object.keys(value).length > 1 && (
            <div className="text-sm text-slate-500 mt-1 truncate" title={JSON.stringify(value, null, 2)}>
              {JSON.stringify(value)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'ip_address',
      header: 'IP 주소',
      sortable: true,
      render: (value: string) => (
        <span className="text-slate-300 font-mono text-base">
          {value || '-'}
        </span>
      ),
    },
    {
      key: 'user_agent',
      header: 'User Agent',
      render: (value: string) => (
        <div className="text-slate-300 text-base max-w-xs">
          <div className="truncate" title={value}>
            {value || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'details',
      header: '결과',
      render: (value: Record<string, any>) => (
        value?.success !== undefined ? (
          value?.success ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-base px-3 py-1">
              <CheckCircle className="w-4 h-4 mr-1" />
              성공
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-base px-3 py-1">
              <XCircle className="w-4 h-4 mr-1" />
              실패
            </Badge>
          )
        ) : (
          <span className="text-slate-500 text-base">-</span>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">접속 및 사용 기록</h2>
          <p className="text-sm text-slate-400 mt-1">
            관리자 및 회원의 모든 활동 기록을 조회합니다
          </p>
        </div>
        <div className="flex gap-2">
          {user.level === 1 && (
            <Button 
              onClick={cleanOldLogs} 
              disabled={loading || cleaningLogs}
              variant="destructive"
            >
              <Trash2 className={`w-4 h-4 mr-2 ${cleaningLogs ? 'animate-spin' : ''}`} />
              오래된 로그 정리
            </Button>
          )}
          <Button onClick={() => loadLogs(true)} disabled={loading || refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* 필터 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="text-sm text-slate-400 mb-2 block">검색</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="아이디, 닉네임, IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-400 mb-2 block">사용자 타입</label>
          <Select value={actorTypeFilter} onValueChange={(v: any) => setActorTypeFilter(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="partner">관리자</SelectItem>
              <SelectItem value="user">회원</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm text-slate-400 mb-2 block">활동 유형</label>
          <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="login">로그인</SelectItem>
              <SelectItem value="logout">로그아웃</SelectItem>
              <SelectItem value="login_failed">로그인 실패</SelectItem>
              <SelectItem value="user_create">회원 생성</SelectItem>
              <SelectItem value="user_update">회원 수정</SelectItem>
              <SelectItem value="user_delete">회원 삭제</SelectItem>
              <SelectItem value="user_balance_change">머니 변경</SelectItem>
              <SelectItem value="partner_create">파트너 생성</SelectItem>
              <SelectItem value="partner_update">파트너 수정</SelectItem>
              <SelectItem value="partner_balance_change">파트너 머니 변경</SelectItem>
              <SelectItem value="deposit_request">입금 요청</SelectItem>
              <SelectItem value="deposit_approve">입금 승인</SelectItem>
              <SelectItem value="deposit_reject">입금 거부</SelectItem>
              <SelectItem value="withdrawal_request">출금 요청</SelectItem>
              <SelectItem value="withdrawal_approve">출금 승인</SelectItem>
              <SelectItem value="withdrawal_reject">출금 거부</SelectItem>
              <SelectItem value="game_launch">게임 실행</SelectItem>
              <SelectItem value="game_end">게임 종료</SelectItem>
              <SelectItem value="game_force_end">게임 강제종료</SelectItem>
              <SelectItem value="game_started">게임 시작 성공</SelectItem>
              <SelectItem value="game_start_failed">게임 시작 실패</SelectItem>
              <SelectItem value="game_session_ended">게임 세션 종료</SelectItem>
              <SelectItem value="game_session_end_failed">게임 세션 종료 실패</SelectItem>
              <SelectItem value="game_withdraw_failed">API 출금 실패</SelectItem>
              <SelectItem value="negative_balance_detected">음수 잔고 감지</SelectItem>
              <SelectItem value="negative_final_balance_detected">음수 최종 잔고 감지</SelectItem>
              <SelectItem value="settlement_execute">정산 실행</SelectItem>
              <SelectItem value="commission_settle">수수료 정산</SelectItem>
              <SelectItem value="system_setting_update">시스템 설정 변경</SelectItem>
              <SelectItem value="page_view">페이지 조회</SelectItem>
              <SelectItem value="data_export">데이터 내보내기</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm text-slate-400 mb-2 block">기간</label>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[210px] h-14 text-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today" className="text-lg">오늘</SelectItem>
              <SelectItem value="yesterday" className="text-lg">어제</SelectItem>
              <SelectItem value="week" className="text-lg">최근 7일</SelectItem>
              <SelectItem value="month" className="text-lg">최근 30일</SelectItem>
              <SelectItem value="all" className="text-lg">전체</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 통계 요약 */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="전체 활동"
          value={`${filteredLogs.length}건`}
          subtitle="조회 기간 내 전체 활동"
          icon={Activity}
          color="purple"
        />
        <MetricCard
          title="관리자 활동"
          value={`${filteredLogs.filter(l => l.actor_type === 'partner').length}건`}
          subtitle="파트너 및 관리자 활동"
          icon={Shield}
          color="blue"
        />
        <MetricCard
          title="회원 활동"
          value={`${filteredLogs.filter(l => l.actor_type === 'user').length}건`}
          subtitle="일반 회원 활동"
          icon={User}
          color="cyan"
        />
        <MetricCard
          title="실패 건수"
          value={`${filteredLogs.filter(l => l.details?.success === false).length}건`}
          subtitle="실패한 활동 건수"
          icon={XCircle}
          color="red"
        />
      </div>

      {/* 테이블 */}
      <DataTable
        data={filteredLogs}
        columns={columns}
        loading={loading}
        emptyMessage="활동 기록이 없습니다"
        enableSearch={false}
        pageSize={20}
      />
    </div>
  );
}