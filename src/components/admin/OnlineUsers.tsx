import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { Partner } from "../../types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { DataTable } from "../common/DataTable";
import { AnimatedBalance } from "../common/AnimatedBalance";
import { toast } from "sonner@2.0.3";
import { RefreshCw, Power, Smartphone, Monitor, Users, DollarSign, TrendingDown, Clock } from "lucide-react";
import {
  AdminDialog as Dialog,
  AdminDialogContent as DialogContent,
  AdminDialogDescription as DialogDescription,
  AdminDialogFooter as DialogFooter,
  AdminDialogHeader as DialogHeader,
  AdminDialogTitle as DialogTitle,
} from "./AdminDialog";
import { MetricCard } from "./MetricCard";
import { getApiConfig, getUserBalanceWithConfig } from "../../lib/investApi";
import { useLanguage } from "../../contexts/LanguageContext";
import { cn } from "@/lib/utils";

// 게임 공급사 한글명 매핑
const PROVIDER_NAMES: Record<number, string> = {
  1: '마이크로게이밍',
  17: '플레이앤고',
  20: 'CQ9 게이밍',
  21: '제네시스 게이밍',
  22: '하바네로',
  23: '게임아트',
  27: '플레이텍',
  38: '블루프린트',
  39: '부운고',
  40: '드라군소프트',
  41: '엘크 스튜디오',
  47: '드림테크',
  51: '칼람바 게임즈',
  52: '모빌롯',
  53: '노리밋 시티',
  55: 'OMI 게이밍',
  56: '원터치',
  59: '플레이슨',
  60: '푸쉬 게이밍',
  61: '퀵스핀',
  62: 'RTG 슬롯',
  63: '리볼버 게이밍',
  65: '슬롯밀',
  66: '스피어헤드',
  70: '썬더킥',
  72: '우후 게임즈',
  74: '릴렉스 게이밍',
  75: '넷엔트',
  76: '레드타이거',
  87: 'PG소프트',
  88: '플레이스타',
  90: '빅타임게이밍',
  300: '프라그마틱 플레이',
  410: '에볼루션 게이밍',
  77: '마이크로게이밍 라이브',
  2: 'Vivo 게이밍',
  30: '아시아 게이밍',
  78: '프라그마틱 플레이 라이브',
  86: '섹시게이밍',
  11: '비비아이엔',
  28: '드림게임',
  89: '오리엔탈게임',
  91: '보타',
  44: '이주기',
  85: '플레이텍 라이브',
  0: '제네럴 카지노'
};

// 카지노 로비 한글명 매핑
const CASINO_LOBBY_NAMES: Record<number, string> = {
  410000: '에볼루션 라이브카지노',
  77060: '마이크로게이밍 라이브카지노',
  2029: 'Vivo 라이브카지노',
  30000: '아시아게이밍 라이브카지노',
  78001: '프라그마틱 라이브카지노',
  86001: '섹시게이밍 라이브카지노',
  11000: '비비아이엔 라이브카지노',
  28000: '드림게임 라이브카지노',
  89000: '오리엔탈게임 라이브카지노',
  91000: '보타 라이브카지노',
  44006: '이주기 라이브카지노',
  85036: '플레이텍 라이브카지노',
  0: '제네럴 라이브카지노'
};

interface OnlineSession {
  id: number;
  session_id: string;
  user_id: string;
  username: string;
  nickname: string;
  game_name: string;
  provider_name: string;
  balance_before: number;
  current_balance: number;
  device_type: string;
  ip_address: string;
  launched_at: string;
  last_activity_at: string;
  status: string;
}

interface OnlineUsersProps {
  user: Partner;
}

export function OnlineUsers({ user }: OnlineUsersProps) {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState<OnlineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSession, setSelectedSession] = useState<OnlineSession | null>(null);
  const [showKickDialog, setShowKickDialog] = useState(false);
  const [syncingBalance, setSyncingBalance] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  
  // 일괄 종료용 체크박스 상태
  const [selectedSessions, setSelectedSessions] = useState<Set<number>>(new Set());
  const [showBulkKickDialog, setShowBulkKickDialog] = useState(false);

  // 1초마다 접속시간 업데이트용
  useEffect(() => {
    const timer = setInterval(() => setTick(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // 온라인 세션 로드
  const loadSessions = async (isManualRefresh = false) => {
    try {
      // ✅ 수동 새로고침만 refreshing 상태 표시
      if (isManualRefresh) {
        setRefreshing(true);
      }
      // ✅ 첫 로딩만 loading 표시
      else if (sessions.length === 0) {
        setLoading(true);
      }
      // ✅ 자동 갱신(30초 타이머)은 백그라운드에서 조용히 처리 (깜박임 없음)

      // ⭐ game_launch_sessions에서 game_id가 있는 세션 조회 (active, ready만 - ended/force_ended 제외)
      let query = supabase
        .from('game_launch_sessions')
        .select(`
          id,
          session_id,
          user_id,
          game_id,
          status,
          balance_before,
          launched_at,
          last_activity_at,
          users!inner(
            id,
            username,
            nickname,
            balance,
            ip_address,
            device_info,
            referrer_id
          )
        `)
        .not('game_id', 'is', null)
        .in('status', ['active', 'ready'])
        .order('last_activity_at', { ascending: false });

      // 권한별 필터링
      if (user.level !== 1) {
        const { data: childPartners } = await supabase
          .rpc('get_hierarchical_partners', { p_partner_id: user.id });

        const allowedPartnerIds = [user.id, ...(childPartners?.map((p: any) => p.id) || [])];
        query = query.in('users.referrer_id', allowedPartnerIds);
      }

      const { data, error } = await query;

      if (error) throw error;

      // game_id로 게임 정보 조회
      const gameIds = [...new Set((data || []).map((s: any) => s.game_id).filter(Boolean))];
      let gamesMap: Record<number, any> = {};
      
      if (gameIds.length > 0) {
        const { data: gamesData } = await supabase
          .from('games')
          .select('id, name, provider_id, game_providers(name)')
          .in('id', gameIds);
        
        if (gamesData) {
          gamesMap = Object.fromEntries(gamesData.map(g => [g.id, g]));
        }
      }

      const formattedSessions: OnlineSession[] = (data || []).map((session: any) => {
        // IP 주소 처리 - users 테이블의 ip_address 사용
        const ipAddress = session.users.ip_address || '-';
        
        // device_info에서 디바이스 타입 추출
        let deviceType = 'PC';
        if (session.users.device_info) {
          const deviceInfo = session.users.device_info;
          if (deviceInfo.device === 'Mobile' || deviceInfo.device === 'mobile') {
            deviceType = 'Mobile';
          } else if (deviceInfo.platform) {
            const platform = String(deviceInfo.platform).toLowerCase();
            if (platform.includes('android') || platform.includes('iphone') || platform.includes('ipad') || platform.includes('mobile')) {
              deviceType = 'Mobile';
            }
          } else if (deviceInfo.userAgent) {
            const ua = String(deviceInfo.userAgent).toLowerCase();
            if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
              deviceType = 'Mobile';
            }
          }
        }

        // 게임 정보 가져오기 - 한글명 우선 사용
        const providerId = Math.floor(session.game_id / 1000);
        const providerName = PROVIDER_NAMES[providerId] || `Provider ${providerId}`;
        
        // 카지노 로비인 경우 한글명 매핑
        let gameName = CASINO_LOBBY_NAMES[session.game_id];
        
        // 로비가 아닌 경우 games 테이블에서 조회
        if (!gameName) {
          const gameInfo = gamesMap[session.game_id];
          gameName = gameInfo?.name || `Game ${session.game_id}`;
        }

        return {
          id: session.id,
          session_id: session.session_id,
          user_id: session.users.id,
          username: session.users.username,
          nickname: session.users.nickname || session.users.username,
          game_name: gameName,
          provider_name: providerName,
          balance_before: Number(session.balance_before) || 0,
          current_balance: Number(session.users.balance) || 0,
          device_type: deviceType,
          ip_address: ipAddress,
          launched_at: session.launched_at,
          last_activity_at: session.last_activity_at,
          status: session.status,
        };
      });

      // ✅ 기존 데이터와 비교하여 실제로 변경된 경우에만 업데이트 (깜박임 방지)
      setSessions(prevSessions => {
        // 데이터가 실제로 변경되었는지 확인
        if (prevSessions.length !== formattedSessions.length) {
          return formattedSessions;
        }
        
        // 각 세션의 주요 필드를 비교
        const hasChanges = formattedSessions.some((newSession, index) => {
          const oldSession = prevSessions.find(s => s.id === newSession.id);
          if (!oldSession) return true;
          
          // 변경 가능성이 있는 필드만 비교 (balance, status, last_activity_at)
          return (
            oldSession.current_balance !== newSession.current_balance ||
            oldSession.status !== newSession.status ||
            oldSession.last_activity_at !== newSession.last_activity_at
          );
        });
        
        // 변경사항이 없으면 기존 상태 유지 (리렌더링 방지)
        if (!hasChanges && prevSessions.length === formattedSessions.length) {
          // ID 기준으로 정렬 순서가 변경되었는지 확인
          const orderChanged = prevSessions.some((session, idx) => 
            session.id !== formattedSessions[idx]?.id
          );
          
          if (!orderChanged) {
            return prevSessions;
          }
        }
        
        return formattedSessions;
      });
    } catch (error) {
      console.error('세션 로드 오류:', error);
      // ✅ 자동 갱신 시에는 토스트 메시지 표시 안 함 (사용자 경험 개선)
      if (isManualRefresh) {
        toast.error('세션 로드 실패');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 30초마다 세션 자동 종료 + 데이터 갱신
  useEffect(() => {
    console.log('🔄 OnlineUsers 30초 타이머 시작');
    
    // 즉시 실행
    loadSessions();

    // 30초마다 실행
    const interval = setInterval(() => {
      console.log('⏰ 30초 경과 - 세션 자동 종료 체크 실행');
      loadSessions();
    }, 30000);

    return () => {
      console.log('🛑 OnlineUsers 30초 타이머 종료');
      clearInterval(interval);
    };
  }, [user.id, user.partner_type]);

  // 1시간마다 오래된 세션 정리
  useEffect(() => {
    const cleanupSessions = async () => {
      try {
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('game_launch_sessions')
          .delete()
          .in('status', ['ended', 'force_ended'])
          .lt('ended_at', fourHoursAgo)
          .select('id');

        if (error) {
          console.error('세션 정리 오류:', error);
        } else if (data && data.length > 0) {
          console.log(`🗑️ ${data.length}개 오래된 세션 삭제 (4시간 경과)`);
        }
      } catch (error) {
        console.error('세션 정리 실행 오류:', error);
      }
    };

    cleanupSessions();
    const interval = setInterval(cleanupSessions, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 접속시간 계산
  const getSessionTime = (launchedAt: string) => {
    const launchTime = new Date(launchedAt).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - launchTime);
    
    if (isNaN(diffMs)) return '0분';
    
    const diffMinutes = Math.floor(diffMs / 1000 / 60);
    if (diffMinutes < 60) return `${diffMinutes}분`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}시간 ${minutes}분`;
  };

  // 보유금 동기화
  const syncBalance = async (session: OnlineSession) => {
    try {
      setSyncingBalance(session.user_id);

      const apiConfig = await getApiConfig(user.id);
      if (!apiConfig) {
        toast.error('API 설정을 찾을 수 없습니다');
        return;
      }

      const balanceData = await getUserBalanceWithConfig(
        apiConfig.opcode,
        session.username,
        apiConfig.token,
        apiConfig.secret_key
      );

      if (balanceData && balanceData.success && typeof balanceData.balance === 'number') {
        await supabase
          .from('users')
          .update({ balance: balanceData.balance })
          .eq('id', session.user_id);

        toast.success('보유금 동기화 완료');
        loadSessions();
      } else {
        toast.error(balanceData?.error || '보유금 조회 실패');
      }
    } catch (error) {
      console.error('보유금 동기화 오류:', error);
      toast.error('보유금 동기화 실패');
    } finally {
      setSyncingBalance(null);
    }
  };

  // 세션 종료 시 보유금 동기화
  const syncBalanceOnSessionEnd = async (userId: string) => {
    try {
      console.log(`🔄 [보유금 동기화] 세션 종료 시 사용자 보유금 동기화 시작: user_id=${userId}`);

      // 1. 사용자 정보 조회 (referrer_id 포함)
      const userRecord = await supabase
        .from('users')
        .select('username, referrer_id')
        .eq('id', userId)
        .single();

      if (!userRecord.data) {
        console.error(`❌ [보유금 동기화] 사용자 정보 없음: user_id=${userId}`);
        return;
      }

      // 2. ⭐ referrer_id를 따라 최상위 Lv1 파트너 찾기
      let currentPartnerId = userRecord.data.referrer_id;
      if (!currentPartnerId) {
        console.error(`❌ [보유금 동기화] referrer_id 없음: user_id=${userId}`);
        return;
      }

      // parent_id 체인을 따라 Lv1까지 올라가기
      let topLevelPartnerId = currentPartnerId;
      let iterations = 0;
      const maxIterations = 10; // 무한 루프 방지

      while (iterations < maxIterations) {
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, parent_id, level')
          .eq('id', currentPartnerId)
          .single();

        if (partnerError || !partnerData) {
          console.error(`❌ [보유금 동기화] 파트너 정보 없음: partner_id=${currentPartnerId}`);
          break;
        }

        // Lv1에 도달하면 종료
        if (partnerData.level === 1 || !partnerData.parent_id) {
          topLevelPartnerId = partnerData.id;
          console.log(`   ✅ 최상위 Lv1 파트너 찾음: ${topLevelPartnerId} (level: ${partnerData.level})`);
          break;
        }

        // 상위 파트너로 이동
        currentPartnerId = partnerData.parent_id;
        iterations++;
      }

      if (iterations >= maxIterations) {
        console.error(`❌ [보유금 동기화] 최상위 파트너 찾기 실패 (무한 루프 방지)`);
        return;
      }

      // 3. ⭐ Lv1 파트너의 api_configs에서 credential 조회
      const apiConfig = await getApiConfig(topLevelPartnerId);
      if (!apiConfig) {
        console.error(`❌ [보유금 동기화] API 설정을 찾을 수 없습니다: partner_id=${topLevelPartnerId}`);
        return;
      }

      console.log(`   📍 사용 credential: partner_id=${topLevelPartnerId}`);

      // 4. 사용자 보유금 조회
      const balanceData = await getUserBalanceWithConfig(
        apiConfig.opcode,
        userRecord.data.username,
        apiConfig.token,
        apiConfig.secret_key
      );

      if (balanceData && balanceData.success && typeof balanceData.balance === 'number') {
        await supabase
          .from('users')
          .update({ balance: balanceData.balance })
          .eq('id', userId);

        console.log(`✅ [보유금 동기화] 세션 종료 시 보유금 동기화 완료: ${userId}, balance=${balanceData.balance}`);
      } else {
        console.error(balanceData?.error || '세션 종료 시 보유금 조회 실패');
      }
    } catch (error) {
      console.error(`❌ [보유금 동기화] 세션 종료 시 보유금 동기화 오류: user_id=${userId}`, error);
    }
  };

  // 강제 종료 (단일)
  const handleKickUser = async () => {
    if (!selectedSession) return;

    try {
      // 1️⃣ 세션 강제 종료
      const { error } = await supabase
        .from('game_launch_sessions')
        .update({ 
          status: 'force_ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', selectedSession.id);

      if (error) {
        console.error('세션 종료 오류:', error);
        toast.error(`세션 종료 실패: ${error.message}`);
        return;
      }

      // 2️⃣ 사용자 보유금 동기화 (백그라운드)
      console.log('💰 [강제 종료] 보유금 동기화 시작:', selectedSession.user_id);
      syncBalanceOnSessionEnd(selectedSession.user_id).catch(err => {
        console.error('❌ [강제 종료] 보유금 동기화 실패:', err);
      });

      toast.success('세션 강제 종료 완료');
      setShowKickDialog(false);
      setSelectedSession(null);
      
      await loadSessions();
    } catch (error) {
      console.error('강제 종료 오류:', error);
      toast.error('강제 종료 실패');
    }
  };

  // 일괄 강제 종료
  const handleBulkKickSessions = async () => {
    if (selectedSessions.size === 0) return;

    try {
      const sessionIds = Array.from(selectedSessions);
      
      // 1️⃣ 세션 목록 조회 (user_id 확보)
      const { data: sessionList } = await supabase
        .from('game_launch_sessions')
        .select('id, user_id')
        .in('id', sessionIds);
      
      // 2️⃣ 세션 일괄 강제 종료
      const { error } = await supabase
        .from('game_launch_sessions')
        .update({ 
          status: 'force_ended',
          ended_at: new Date().toISOString()
        })
        .in('id', sessionIds);

      if (error) {
        console.error('일괄 종료 오류:', error);
        toast.error(`일괄 종료 실패: ${error.message}`);
        return;
      }

      // 3️⃣ 각 사용자 보유금 동기화 (백그라운드)
      if (sessionList && sessionList.length > 0) {
        console.log(`💰 [일괄 강제 종료] ${sessionList.length}명 보유금 동기화 시작`);
        
        for (const session of sessionList) {
          syncBalanceOnSessionEnd(session.user_id).catch(err => {
            console.error(`❌ [일괄 강제 종료] 보유금 동기화 실패 (${session.user_id}):`, err);
          });
        }
      }

      toast.success(`${selectedSessions.size}개 세션 강제 종료 완료`);
      setShowBulkKickDialog(false);
      setSelectedSessions(new Set());
      
      await loadSessions();
    } catch (error) {
      console.error('일괄 강제 종료 오류:', error);
      toast.error('일괄 강제 종료 실패');
    }
  };

  // 체크박스 토글
  const toggleSessionSelection = (sessionId: number) => {
    setSelectedSessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  // 전체 선택/해제
  const toggleAllSessions = () => {
    if (selectedSessions.size === sessions.length) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(sessions.map(s => s.id)));
    }
  };

  // 통계 계산
  const totalUsers = sessions.length;
  const totalGameBalance = sessions.reduce((sum, s) => sum + s.current_balance, 0);
  const totalProfitLoss = sessions.reduce((sum, s) => sum + (s.current_balance - s.balance_before), 0);
  
  // 평균 세션 시간 계산 (분)
  let avgSessionTime = 0;
  if (sessions.length > 0) {
    const now = Date.now();
    const totalMinutes = sessions.reduce((sum, s) => {
      const launchTime = new Date(s.launched_at).getTime();
      const diffMs = Math.max(0, now - launchTime);
      return sum + (diffMs / 1000 / 60);
    }, 0);
    avgSessionTime = Math.floor(totalMinutes / sessions.length);
  }

  const columns = [
    {
      key: 'checkbox',
      header: (
        <input
          type="checkbox"
          checked={selectedSessions.size === sessions.length && sessions.length > 0}
          onChange={toggleAllSessions}
          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-900"
        />
      ),
      render: (_: any, row: OnlineSession) => (
        <input
          type="checkbox"
          checked={selectedSessions.has(row.id)}
          onChange={() => toggleSessionSelection(row.id)}
          disabled={row.status !== 'active'}
          className={cn(
            "w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-900",
            row.status !== 'active' && "opacity-40 cursor-not-allowed"
          )}
        />
      ),
    },
    {
      key: 'status',
      header: '상태',
      render: (value: string) => {
        const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
          active: { label: '접속중', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30' },
          ready: { label: '대기중', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30' },
          ended: { label: '종료', color: 'text-slate-400', bgColor: 'bg-slate-500/10', borderColor: 'border-slate-500/30' },
          force_ended: { label: '강제종료', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30' },
        };
        const config = statusConfig[value] || statusConfig.ended;
        return (
          <Badge variant="outline" className={cn(config.bgColor, config.color, config.borderColor)}>
            {config.label}
          </Badge>
        );
      },
    },
    {
      key: 'username',
      header: t.common.username,
      sortable: true,
      render: (value: string, row: OnlineSession) => (
        <span className={cn("text-slate-200", row.status !== 'active' && "opacity-40")}>
          {value}
        </span>
      ),
    },
    {
      key: 'nickname',
      header: t.common.nickname,
      sortable: true,
      render: (value: string, row: OnlineSession) => (
        <span className={cn("text-slate-200", row.status !== 'active' && "opacity-40")}>
          {value}
        </span>
      ),
    },
    {
      key: 'game_name',
      header: t.common.game,
      sortable: true,
      render: (value: string, row: OnlineSession) => (
        <div className={cn("space-y-1", row.status !== 'active' && "opacity-40")}>
          <div className="text-slate-200">{value}</div>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            {row.provider_name}
          </Badge>
        </div>
      ),
    },
    {
      key: 'balance_before',
      header: t.onlineUsers.startingBalance,
      sortable: true,
      render: (value: number, row: OnlineSession) => (
        <span className={cn("font-mono text-slate-300", row.status !== 'active' && "opacity-40")}>
          ₩{value.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'current_balance',
      header: t.onlineUsers.currentBalance,
      sortable: true,
      render: (value: number, row: OnlineSession) => {
        const diff = value - row.balance_before;
        const diffColor = diff >= 0 ? 'text-emerald-400' : 'text-red-400';
        const diffSign = diff >= 0 ? '+' : '';
        
        return (
          <div className="space-y-1">
            <AnimatedBalance 
              value={value} 
              inactive={row.status !== 'active'}
            />
            {diff !== 0 && (
              <div className={cn(`text-xs font-mono ${diffColor}`, row.status !== 'active' && "opacity-40")}>
                {diffSign}₩{diff.toLocaleString()}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'device_type',
      header: t.onlineUsers.deviceType,
      render: (value: string, row: OnlineSession) => (
        <Badge 
          variant={value === 'Mobile' ? 'default' : 'secondary'} 
          className={cn("gap-1", row.status !== 'active' && "opacity-40")}
        >
          {value === 'Mobile' ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
          {value}
        </Badge>
      ),
    },
    {
      key: 'ip_address',
      header: t.onlineUsers.ipAddress,
      sortable: true,
      render: (value: string, row: OnlineSession) => (
        <span className={cn("text-slate-300 font-mono text-xs", row.status !== 'active' && "opacity-40")}>
          {value}
        </span>
      ),
    },
    {
      key: 'launched_at',
      header: t.onlineUsers.connectionTime,
      render: (value: string, row: OnlineSession) => (
        <span className={cn("text-slate-300", row.status !== 'active' && "opacity-40")}>
          {getSessionTime(value)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.common.actions,
      render: (_: any, row: OnlineSession) => (
        <div className="flex items-center gap-2 justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => syncBalance(row)}
            disabled={syncingBalance === row.user_id || row.status !== 'active'}
            className={cn(
              "text-slate-400 hover:text-slate-200",
              row.status !== 'active' && "opacity-40 cursor-not-allowed"
            )}
          >
            <RefreshCw className={`w-3 h-3 ${syncingBalance === row.user_id ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedSession(row);
              setShowKickDialog(true);
            }}
            disabled={row.status !== 'active'}
            className={cn(
              "bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300",
              row.status !== 'active' && "opacity-40 cursor-not-allowed"
            )}
          >
            <Power className="w-3 h-3" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">{t.onlineUsers.title}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {t.onlineUsers.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedSessions.size > 0 && (
            <Button 
              variant="destructive"
              onClick={() => setShowBulkKickDialog(true)}
              className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/30"
            >
              <Power className="w-4 h-4 mr-2" />
              선택한 게임 종료 ({selectedSessions.size})
            </Button>
          )}
          <Button onClick={() => loadSessions(true)} disabled={loading || refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {t.onlineUsers.refresh}
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t.onlineUsers.onlineUsersTitle}
          value={`${totalUsers}${t.onlineUsers.people}`}
          subtitle={t.onlineUsers.realtimeConnections}
          icon={Users}
          color="purple"
        />
        <MetricCard
          title={t.onlineUsers.totalGameBalance}
          value={`₩${totalGameBalance.toLocaleString()}`}
          subtitle={t.onlineUsers.gameInternalBalance}
          icon={DollarSign}
          color="amber"
        />
        <MetricCard
          title={t.onlineUsers.totalProfitLoss}
          value={`₩${totalProfitLoss.toLocaleString()}`}
          subtitle={totalProfitLoss >= 0 ? t.onlineUsers.userProfit : t.onlineUsers.userLoss}
          icon={TrendingDown}
          color={totalProfitLoss >= 0 ? 'green' : 'red'}
        />
        <MetricCard
          title={t.onlineUsers.averageSession}
          value={`${avgSessionTime}${t.onlineUsers.minutes}`}
          subtitle={t.onlineUsers.averageConnectionTime}
          icon={Clock}
          color="cyan"
        />
      </div>

      <DataTable
        data={sessions}
        columns={columns}
        loading={loading}
        emptyMessage={t.onlineUsers.noOnlineUsers}
      />

      <Dialog open={showKickDialog} onOpenChange={setShowKickDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>세션 강제 종료</DialogTitle>
            <DialogDescription>
              {selectedSession?.username}({selectedSession?.nickname}) 님의 세션을 강제 종료하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKickDialog(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleKickUser}>
              강제 종료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkKickDialog} onOpenChange={setShowBulkKickDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>선택한 게임 일괄 종료</DialogTitle>
            <DialogDescription>
              선택한 {selectedSessions.size}개의 게임 세션을 모두 강제 종료하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkKickDialog(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleBulkKickSessions}>
              {selectedSessions.size}개 강제 종료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}