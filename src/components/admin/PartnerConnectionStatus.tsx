import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { Partner } from "../../types";
import { DataTable } from "../common/DataTable";
import { MetricCard } from "./MetricCard";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Wifi, CreditCard, Users, Wallet, Search } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

interface PartnerConnection {
  id: string;
  username: string;
  nickname: string;
  level: number;
  partner_type: string;
  balance: number;
  last_login_at: string | null;
  status: string;
  parent_nickname: string;
  user_count: number;
  users_balance: number;
}

interface PartnerStats {
  totalUsers: number;
  totalUserBalance: number;
}

interface PartnerConnectionStatusProps {
  user: Partner;
}

export function PartnerConnectionStatus({ user }: PartnerConnectionStatusProps) {
  const { t } = useLanguage();
  const [partners, setPartners] = useState<PartnerConnection[]>([]);
  const [filteredPartners, setFilteredPartners] = useState<PartnerConnection[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<PartnerStats>({ totalUsers: 0, totalUserBalance: 0 });
  const [loading, setLoading] = useState(true);
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [allPartnerIds, setAllPartnerIds] = useState<string[]>([]);

  // 모든 하위 파트너 ID를 재귀적으로 가져오기
  const getAllChildPartnerIds = async (partnerId: string): Promise<string[]> => {
    const partnerIds: string[] = [];
    const queue: string[] = [partnerId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      // 직속 하위 파트너 조회
      const { data, error } = await supabase
        .from('partners')
        .select('id')
        .eq('parent_id', currentId);

      if (!error && data) {
        for (const partner of data) {
          partnerIds.push(partner.id);
          queue.push(partner.id);
        }
      }
    }

    return partnerIds;
  };

  // 파트너 접속 현황 로드
  const loadPartnerConnections = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      // 자신 이하 모든 파트너 ID 가져오기
      let childPartnerIds: string[] = [];
      if (user.level !== 1) {
        childPartnerIds = await getAllChildPartnerIds(user.id);
      }

      // 파트너 목록 조회
      let query = supabase
        .from('partners')
        .select(`
          id,
          username,
          nickname,
          level,
          partner_type,
          balance,
          last_login_at,
          status,
          parent_id
        `)
        .order('last_login_at', { ascending: false, nullsFirst: false });

      // 시스템관리자(level 1)가 아닌 경우 자신의 하위 파트너만 필터링
      if (user.level !== 1 && childPartnerIds.length > 0) {
        query = query.in('id', childPartnerIds);
      } else if (user.level !== 1 && childPartnerIds.length === 0) {
        // 하위 파트너가 없으면 빈 배열
        setPartners([]);
        setAllPartnerIds([]);
        if (isInitial) setLoading(false);
        return;
      }

      const { data, error } = await query;

      if (error) throw error;

      // parent nickname을 가져오기 위해 parent_id 목록 조회
      const parentIds = [...new Set((data || []).map((p: any) => p.parent_id).filter(Boolean))];
      let parentMap: Record<string, string> = {};
      
      if (parentIds.length > 0) {
        const { data: parentData } = await supabase
          .from('partners')
          .select('id, nickname')
          .in('id', parentIds);
        
        if (parentData) {
          parentMap = parentData.reduce((acc, p) => {
            acc[p.id] = p.nickname;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // 각 파트너별 사용자 통계 조회
      const partnerUserStats: Record<string, { count: number; balance: number }> = {};
      
      if (data && data.length > 0) {
        const partnerIds = data.map((p: any) => p.id);
        
        // 각 파트너의 사용자 수와 보유금 합계 조회
        const { data: usersData } = await supabase
          .from('users')
          .select('referrer_id, balance')
          .in('referrer_id', partnerIds);
        
        if (usersData) {
          usersData.forEach((user: any) => {
            if (!partnerUserStats[user.referrer_id]) {
              partnerUserStats[user.referrer_id] = { count: 0, balance: 0 };
            }
            partnerUserStats[user.referrer_id].count += 1;
            partnerUserStats[user.referrer_id].balance += user.balance || 0;
          });
        }
      }

      // 데이터 포맷팅
      const formattedPartners: PartnerConnection[] = (data || []).map((partner: any) => {
        const userStats = partnerUserStats[partner.id] || { count: 0, balance: 0 };
        
        return {
          id: partner.id,
          username: partner.username,
          nickname: partner.nickname,
          level: partner.level,
          partner_type: partner.partner_type,
          balance: partner.balance || 0,
          last_login_at: partner.last_login_at,
          status: partner.status,
          parent_nickname: partner.parent_id ? (parentMap[partner.parent_id] || '-') : '-',
          user_count: userStats.count,
          users_balance: userStats.balance
        };
      });

      setPartners(formattedPartners);
      setFilteredPartners(formattedPartners);
      
      // 모든 파트너 ID 저장 (자신 포함)
      const partnerIdsForUsers = user.level === 1 
        ? formattedPartners.map(p => p.id)
        : [user.id, ...childPartnerIds];
      setAllPartnerIds(partnerIdsForUsers);

      // 사용자 통계 조회
      await loadUserStats(partnerIdsForUsers);

    } catch (error: any) {
      console.error("파트너 접속 현황 로드 오류:", error);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  // 사용자 통계 로드
  const loadUserStats = async (partnerIds: string[]) => {
    try {
      if (partnerIds.length === 0) {
        setStats({ totalUsers: 0, totalUserBalance: 0 });
        return;
      }

      // users 테이블에서 해당 파트너들의 사용자 조회
      const { data, error } = await supabase
        .from('users')
        .select('id, balance')
        .in('referrer_id', partnerIds);

      if (error) throw error;

      const totalUsers = data?.length || 0;
      const totalUserBalance = data?.reduce((sum, user) => sum + (user.balance || 0), 0) || 0;

      setStats({ totalUsers, totalUserBalance });
    } catch (error: any) {
      console.error("사용자 통계 로드 오류:", error);
    }
  };

  // 검색 필터링
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPartners(partners);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = partners.filter(
      (p) =>
        p.username.toLowerCase().includes(query) ||
        p.nickname.toLowerCase().includes(query) ||
        p.parent_nickname.toLowerCase().includes(query) ||
        getPartnerTypeText(p.partner_type).toLowerCase().includes(query)
    );
    setFilteredPartners(filtered);
  }, [searchQuery, partners]);

  // 초기 로드
  useEffect(() => {
    loadPartnerConnections(true);
  }, [user.id]);

  // Realtime 구독: partners, users 테이블 변경 감지
  useEffect(() => {
    console.log('🔔 Realtime 구독 시작: partners, users');

    const channel = supabase
      .channel('partner-connections-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'partners'
        },
        (payload) => {
          console.log('🔔 partners 변경 감지:', payload);
          
          // Debounce: 500ms 후에 재로드
          if (reloadTimeoutRef.current) {
            clearTimeout(reloadTimeoutRef.current);
          }
          reloadTimeoutRef.current = setTimeout(() => {
            loadPartnerConnections();
          }, 500);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users'
        },
        (payload) => {
          console.log('🔔 users 변경 감지:', payload);
          
          // 사용자 통계만 재로드
          if (allPartnerIds.length > 0) {
            if (reloadTimeoutRef.current) {
              clearTimeout(reloadTimeoutRef.current);
            }
            reloadTimeoutRef.current = setTimeout(() => {
              loadUserStats(allPartnerIds);
            }, 500);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }
    };
  }, [user.id, allPartnerIds]);

  // 파트너 타입 텍스트 변환
  const getPartnerTypeText = (type: string) => {
    const typeMap: Record<string, string> = {
      'system_admin': t.partnerCreation.partnerTypes.system_admin,
      'head_office': t.partnerCreation.partnerTypes.head_office,
      'main_office': t.partnerCreation.partnerTypes.main_office,
      'sub_office': t.partnerCreation.partnerTypes.sub_office,
      'distributor': t.partnerCreation.partnerTypes.distributor,
      'store': t.partnerCreation.partnerTypes.store
    };
    return typeMap[type] || type;
  };

  // 세션 시간 계산
  const getSessionTime = (lastLoginAt: string | null) => {
    if (!lastLoginAt) return '-';
    
    const loginTime = new Date(lastLoginAt).getTime();
    const now = Date.now();
    const diffMinutes = Math.floor((now - loginTime) / 1000 / 60);
    
    if (diffMinutes < 60) {
      return t.partnerConnectionStatus.minutesAgo.replace('{{minutes}}', diffMinutes.toString());
    }
    
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return t.partnerConnectionStatus.hoursMinutesAgo
      .replace('{{hours}}', hours.toString())
      .replace('{{minutes}}', minutes.toString());
  };

  // 온라인 파트너 (최근 30분 이내 접속)
  const onlinePartners = partners.filter(p => {
    if (!p.last_login_at) return false;
    const diffMinutes = Math.floor((Date.now() - new Date(p.last_login_at).getTime()) / 1000 / 60);
    return diffMinutes <= 30 && p.status === 'active';
  });

  // 총 파트너 보유금
  const totalPartnerBalance = partners.reduce((sum, p) => sum + p.balance, 0);

  const columns = [
    {
      header: t.partnerConnectionStatus.partnerInfo,
      cell: (partner: PartnerConnection) => (
        <div className="py-3 pl-10">
          <div className="flex items-center gap-3 text-xl">
            <span className="font-medium">{partner.username}</span>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {partner.nickname}
            </Badge>
            <span className="text-lg text-muted-foreground">
              {getPartnerTypeText(partner.partner_type)}
            </span>
            <span className="text-lg text-muted-foreground">
              ({t.partnerConnectionStatus.parentLabel}: {partner.parent_nickname})
            </span>
          </div>
        </div>
      ),
    },
    {
      header: t.partnerConnectionStatus.partnerBalance,
      cell: (partner: PartnerConnection) => (
        <div className="py-3">
          <span className={`font-medium text-xl ${partner.balance < 0 ? "text-red-400" : "text-emerald-400"}`}>
            ₩{partner.balance.toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      header: t.partnerConnectionStatus.userCount,
      cell: (partner: PartnerConnection) => (
        <div className="py-3">
          <span className="font-medium text-cyan-400 text-xl">
            {t.partnerConnectionStatus.peopleCount.replace('{{count}}', partner.user_count.toLocaleString())}
          </span>
        </div>
      ),
    },
    {
      header: t.partnerConnectionStatus.userBalanceSum,
      cell: (partner: PartnerConnection) => (
        <div className="py-3">
          <span className={`font-medium text-xl ${partner.users_balance < 0 ? "text-red-400" : "text-blue-400"}`}>
            ₩{partner.users_balance.toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      header: t.partnerConnectionStatus.connectionStatus,
      cell: (partner: PartnerConnection) => {
        const isOnline = partner.last_login_at && 
          (Date.now() - new Date(partner.last_login_at).getTime()) / 1000 / 60 <= 30 &&
          partner.status === 'active';
        
        return (
          <div className="flex flex-col gap-2 py-3">
            <Badge 
              variant={isOnline ? "default" : "outline"}
              className={`text-lg px-3 py-1 ${isOnline ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" : ""}`}
            >
              {isOnline ? t.partnerConnectionStatus.online : t.partnerConnectionStatus.offline}
            </Badge>
            {partner.status === 'suspended' && (
              <Badge variant="destructive" className="text-lg px-3 py-1">
                {t.partnerConnectionStatus.suspended}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      header: t.partnerConnectionStatus.lastLoginTime,
      cell: (partner: PartnerConnection) => (
        <div className="flex flex-col gap-1 py-3">
          <span className="text-xl">
            {partner.last_login_at 
              ? new Date(partner.last_login_at).toLocaleString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                }).replace(/\. /g, '.').replace(/\.$/, '')
              : '-'
            }
          </span>
          {partner.last_login_at && (
            <span className="text-lg text-muted-foreground">
              {t.partnerConnectionStatus.elapsedTime.replace('{{time}}', getSessionTime(partner.last_login_at))}
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-3xl">{t.partnerConnectionStatus.title}</h2>
          <p className="text-xl text-muted-foreground mt-2">
            {t.partnerConnectionStatus.subtitle}
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t.partnerConnectionStatus.onlinePartners}
          value={t.partnerConnectionStatus.peopleCount.replace('{{count}}', onlinePartners.length.toString())}
          subtitle={t.partnerConnectionStatus.onlineSubtitle}
          icon={Wifi}
          color="purple"
        />
        <MetricCard
          title={t.partnerConnectionStatus.partnerBalanceTotal}
          value={`₩${totalPartnerBalance.toLocaleString()}`}
          subtitle={t.partnerConnectionStatus.partnerBalanceSubtitle}
          icon={CreditCard}
          color="pink"
        />
        <MetricCard
          title={t.partnerConnectionStatus.managedUsersCount}
          value={t.partnerConnectionStatus.peopleCount.replace('{{count}}', stats.totalUsers.toLocaleString())}
          subtitle={t.partnerConnectionStatus.managedUsersSubtitle}
          icon={Users}
          color="cyan"
        />
        <MetricCard
          title={t.partnerConnectionStatus.userBalanceTotal}
          value={`₩${stats.totalUserBalance.toLocaleString()}`}
          subtitle={t.partnerConnectionStatus.userBalanceSubtitle}
          icon={Wallet}
          color="amber"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">{t.partnerConnectionStatus.loadingData}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <DataTable
            data={filteredPartners}
            columns={columns}
            emptyMessage={
              searchQuery 
                ? t.partnerConnectionStatus.noSearchResults
                : t.partnerConnectionStatus.noPartners
            }
            rowKey="id"
          />
        </div>
      )}
    </div>
  );
}