import { useState, useEffect } from "react";
import { Shield, Search, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { MetricCard } from "./MetricCard";
import { useLanguage } from "../../contexts/LanguageContext";

interface BlacklistedUser {
  user_id: string;
  username: string;
  nickname: string;
  status: string;
  blocked_reason: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
  unblocked_at: string | null;
  admin_username?: string;
  admin_nickname?: string;
  admin_level?: string;
}

export function BlacklistManagement() {
  const { authState } = useAuth();
  const { t, language } = useLanguage();
  const [blacklistedUsers, setBlacklistedUsers] = useState<BlacklistedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoreLoading, setRestoreLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // 블랙리스트 사용자 조회
  const fetchBlacklistedUsers = async () => {
    try {
      setLoading(true);
      console.log('📋 블랙리스트 사용자 조회 시작');

      // users 테이블에서 blocked 상태만 조회 (조인 없이)
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          username,
          nickname,
          email,
          phone,
          status,
          balance,
          points,
          blocked_reason,
          blocked_at,
          blocked_by,
          unblocked_at,
          created_at,
          updated_at
        `)
        .eq('status', 'blocked')
        .order('blocked_at', { ascending: false });

      if (error) {
        console.error('❌ 블랙리스트 조회 오류:', error);
        throw error;
      }

      console.log('📊 블랙리스트 데이터:', data);
      console.log(`📈 블랙리스트 사용자 수: ${data?.length || 0}명`);
      
      // 데이터 구조를 뷰 형식에 맞게 변환
      const formattedData = (data || []).map((user: any) => ({
        user_id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        phone: user.phone,
        status: user.status,
        balance: user.balance,
        points: user.points,
        blocked_reason: user.blocked_reason,
        blocked_at: user.blocked_at,
        blocked_by: user.blocked_by,
        unblocked_at: user.unblocked_at,
        created_at: user.created_at,
        updated_at: user.updated_at
      }));
      
      setBlacklistedUsers(formattedData);

    } catch (error: any) {
      console.error('❌ 블랙리스트 조회 실패:', error);
      toast.error(t('blacklist.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  // 블랙리스트 해제 (복원)
  const handleRestoreUser = async (user: BlacklistedUser) => {
    if (!authState.user?.id) {
      toast.error(t('common.noAdminAuth'));
      return;
    }

    try {
      setRestoreLoading(user.user_id);
      console.log('🔓 블랙리스트 해제 시작:', user.user_id);

      // 새로운 심플한 해제 함수 호출
      const { data, error } = await supabase.rpc('remove_user_from_blacklist_simple', {
        p_user_id: user.user_id,
        p_admin_id: authState.user.id
      });

      if (error) {
        console.error('❌ 블랙리스트 해제 오류:', error);
        throw error;
      }

      console.log('✅ RPC 응답:', data);

      if (!data.success) {
        throw new Error(data.error || '블랙리스트 해제 실패');
      }

      toast.success(t('blacklist.restoreSuccess', { username: user.username }));
      
      // 목록에서 해당 사용자 제거
      setBlacklistedUsers(prev => prev.filter(u => u.user_id !== user.user_id));

    } catch (error: any) {
      console.error('❌ 블랙리스트 해제 실패:', error);
      toast.error(error.message || t('blacklist.restoreFailed'));
    } finally {
      setRestoreLoading(null);
    }
  };

  // 검색 필터링
  const filteredUsers = blacklistedUsers.filter(user =>
    user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.blocked_reason?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 초기 로드 및 실시간 구독
  useEffect(() => {
    fetchBlacklistedUsers();

    // users 테이블 변경 구독
    const channel = supabase
      .channel('blacklist-users-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          console.log('🔔 사용자 테이블 변경 감지:', payload);
          // status가 blocked로 변경되거나 blocked에서 active로 변경될 때
          if (payload.new?.status === 'blocked' || payload.old?.status === 'blocked') {
            fetchBlacklistedUsers();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading && blacklistedUsers.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Shield className="h-6 w-6 text-rose-400" />
            {t.blacklist.title}
          </h1>
          <p className="text-lg text-slate-400">
            {t.blacklist.subtitle}
          </p>
        </div>
        <Button 
          onClick={fetchBlacklistedUsers} 
          variant="outline"
          disabled={loading}
          className="text-lg px-6 py-3 h-auto"
        >
          <RefreshCw className={`h-6 w-6 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t.common.refresh}
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-2">
        <MetricCard
          title={t.blacklist.blockedUsers}
          value={blacklistedUsers.length.toLocaleString()}
          subtitle={t.blacklist.blockedCount}
          icon={Shield}
          color="red"
        />
        
        <MetricCard
          title={t.blacklist.searchResults}
          value={filteredUsers.length.toLocaleString()}
          subtitle={t.blacklist.filteredResults}
          icon={Search}
          color="blue"
        />
      </div>

      {/* 블랙리스트 목록 */}
      <div className="glass-card rounded-xl p-6">
        {/* 헤더 및 통합 필터 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
          <div>
            <h3 className="font-semibold text-slate-100 mb-1">{t.blacklist.listTitle}</h3>
            <p className="text-sm text-slate-400">
              {t.blacklist.totalUsers.replace('{{count}}', filteredUsers.length.toLocaleString())}
            </p>
          </div>
          
          {/* 통합 검색 */}
          <div className="relative w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t.blacklist.searchPlaceholder}
              className="pl-10 input-premium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="space-y-4">

          {/* 데이터 테이블 */}
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                {blacklistedUsers.length === 0 
                  ? t.blacklist.noBlacklist 
                  : t.blacklist.noSearchResults}
              </p>
              {blacklistedUsers.length === 0 && (
                <p className="text-sm text-gray-400 mt-2">
                  {t.blacklist.addFromUserManagement}
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">{t.userManagement.username}</th>
                    <th className="text-left p-3">{t.userManagement.nickname}</th>
                    <th className="text-left p-3">{t.blacklist.blockReason}</th>
                    <th className="text-left p-3">{t.blacklist.blockDate}</th>
                    <th className="text-left p-3">{t.common.status}</th>
                    <th className="text-left p-3">{t.blacklist.management}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.user_id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-medium">{user.username}</td>
                      <td className="p-3">{user.nickname}</td>
                      <td className="p-3">
                        <div className="max-w-[200px] truncate" title={user.blocked_reason || ''}>
                          {user.blocked_reason || t.blacklist.noReason}
                        </div>
                      </td>
                      <td className="p-3">
                        {user.blocked_at 
                          ? new Date(user.blocked_at).toLocaleString(language === 'en' ? 'en-US' : 'ko-KR')
                          : '-'
                        }
                      </td>
                      <td className="p-3">
                        <Badge variant="destructive">
                          {t.blacklist.blocked}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreUser(user)}
                          disabled={restoreLoading === user.user_id}
                          className="text-green-600 hover:bg-green-50"
                        >
                          {restoreLoading === user.user_id ? (
                            <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          {t.blacklist.restore}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BlacklistManagement;