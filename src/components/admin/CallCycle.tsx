import { useState, useEffect, useMemo } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { AlertCircle, Activity, RefreshCw, Search, Users, TrendingUp, X } from "lucide-react";
import { DarkPageLayout } from "../common/DarkPageLayout";
import { UnifiedCard } from "../common/UnifiedCard";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import * as oroplayApi from "../../lib/oroplayApi";
import { useLanguage } from "../../contexts/LanguageContext";
import { Partner } from "../../types";

interface CallCycleProps {
  user: Partner;
}

interface User {
  id: string;
  username: string;
}

interface Vendor {
  code: string;
  name: string;
}

interface RTPResult {
  username: string;
  rtp: number;
}

interface RTPHistory {
  id: number;
  vendor_code: string;
  setting_type: string;
  rtp_value: number;
  user_id: string | null;
  created_at: string;
  applied_by_username: string;
}

export function CallCycle({ user }: CallCycleProps) {
  const { t } = useLanguage();
  const canManageRTP = true;

  // 기본 상태
  const [actionMode, setActionMode] = useState<'set' | 'get' | 'reset'>('set');
  const [vendorCode, setVendorCode] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [rtpValue, setRtpValue] = useState(85);
  const [loading, setLoading] = useState(false);
  const [rtpResults, setRtpResults] = useState<RTPResult[]>([]);
  const [rtpHistory, setRtpHistory] = useState<RTPHistory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // 검색 필터링된 사용자 목록
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(u => u.username.toLowerCase().includes(query));
  }, [users, searchQuery]);

  useEffect(() => {
    if (canManageRTP) {
      loadVendors();
      loadUsers();
      loadRTPHistory();
    }
  }, [canManageRTP]);

  const getOroPlayToken = async (): Promise<string> => {
    return await oroplayApi.getOroPlayToken(user.id);
  };

  const loadVendors = async () => {
    try {
      const { data: testData, error: testError } = await supabase
        .from('game_providers')
        .select('vendor_code')
        .limit(1);
      
      if (testError && testError.code === '42703') {
        toast.error(t.callCycle.databaseSetupRequired, {
          description: t.callCycle.runMigrationSQL,
          duration: 10000
        });
        return;
      }

      const { data, error } = await supabase
        .from('game_providers')
        .select('name, vendor_code')
        .eq('api_type', 'oroplay')
        .eq('type', 'slot')
        .not('vendor_code', 'is', null)
        .order('name');
      
      if (error) {
        console.error('게임사 로드 오류:', error);
        return;
      }

      const vendorList = (data || []).map(v => ({
        code: v.vendor_code!,
        name: v.name
      }));

      if (vendorList.length === 0) {
        toast.warning(t.callCycle.noOroplayVendors, {
          description: t.callCycle.syncGamesFirst,
          duration: 7000
        });
      }

      setVendors(vendorList);
      
    } catch (error) {
      console.error('게임사 로드 실패:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username')
        .order('username');
      
      if (error) {
        console.error('사용자 로드 오류:', error);
        return;
      }

      setUsers(data || []);
      
    } catch (error) {
      console.error('사용자 로드 실패:', error);
    }
  };

  const loadRTPHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('rtp_settings')
        .select('id, vendor_code, setting_type, rtp_value, user_id, created_at, applied_by')
        .eq('partner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('RTP 이력 로드 오류:', error);
        return;
      }

      const appliedByIds = [...new Set((data || []).map(r => r.applied_by).filter(Boolean))];
      const { data: partnersData } = await supabase
        .from('partners')
        .select('id, username')
        .in('id', appliedByIds);
      
      const partnersMap = new Map(partnersData?.map(p => [p.id, p]) || []);

      const history = (data || []).map(record => ({
        id: record.id,
        vendor_code: record.vendor_code,
        setting_type: record.setting_type,
        rtp_value: record.rtp_value,
        user_id: record.user_id,
        created_at: record.created_at,
        applied_by_username: record.applied_by ? (partnersMap.get(record.applied_by)?.username || '알 수 없음') : '알 수 없음'
      }));

      setRtpHistory(history);
      
    } catch (error) {
      console.error('RTP 이력 로드 실패:', error);
    }
  };

  const handleSetUserRTP = async () => {
    if (!vendorCode) {
      toast.error(t.callCycle.selectVendorError);
      return;
    }
    if (selectedUsers.length === 0) {
      toast.error(t.callCycle.selectUsersError);
      return;
    }
    if (rtpValue < 30 || rtpValue > 99) {
      toast.error(t.callCycle.rtpRangeError);
      return;
    }

    setLoading(true);
    let successCount = 0;

    try {
      const token = await getOroPlayToken();

      for (const username of selectedUsers) {
        try {
          await oroplayApi.setUserRTP(token, vendorCode, username, rtpValue);
          successCount++;

          const userRecord = users.find(u => u.username === username);
          await supabase.from('rtp_settings').insert({
            partner_id: user.id,
            vendor_code: vendorCode,
            user_id: userRecord?.id || null,
            setting_type: 'set',
            rtp_value: rtpValue,
            applied_by: user.id
          });
        } catch (err) {
          console.error(`${username} RTP 설정 실패:`, err);
        }
      }

      toast.success(t.callCycle.rtpSetSuccess.replace('{{count}}', String(successCount)));
      await loadRTPHistory();
      setSelectedUsers([]);

    } catch (error: any) {
      toast.error(t.callCycle.rtpSetFailed, {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGetUserRTP = async () => {
    if (!vendorCode) {
      toast.error(t.callCycle.selectVendorError);
      return;
    }
    if (selectedUsers.length === 0) {
      toast.error(t.callCycle.selectUsersError);
      return;
    }

    setLoading(true);
    setRtpResults([]);

    try {
      const token = await getOroPlayToken();
      const results: RTPResult[] = [];

      for (const username of selectedUsers) {
        try {
          const rtp = await oroplayApi.getUserRTP(token, vendorCode, username);
          results.push({ username, rtp });
        } catch (err) {
          console.error(`${username} RTP 조회 실패:`, err);
        }
      }

      setRtpResults(results);
      toast.success(t.callCycle.rtpGetSuccess);

    } catch (error: any) {
      toast.error(t.callCycle.rtpGetFailed, {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetUserRTP = async () => {
    if (!vendorCode) {
      toast.error(t.callCycle.selectVendorError);
      return;
    }
    if (selectedUsers.length === 0) {
      toast.error(t.callCycle.selectUsersError);
      return;
    }
    if (selectedUsers.length > 500) {
      toast.error(t.callCycle.maxUsersError);
      return;
    }
    if (rtpValue < 30 || rtpValue > 99) {
      toast.error(t.callCycle.rtpRangeError);
      return;
    }

    setLoading(true);

    try {
      const token = await getOroPlayToken();

      const data = selectedUsers.map(username => ({
        userCode: username,
        rtp: rtpValue
      }));

      await oroplayApi.batchSetRTP(token, vendorCode, data);

      toast.success(t.callCycle.batchRtpSetSuccess.replace('{{count}}', String(selectedUsers.length)));

      await supabase.from('rtp_settings').insert({
        partner_id: user.id,
        vendor_code: vendorCode,
        user_id: null,
        setting_type: 'reset',
        rtp_value: rtpValue,
        applied_by: user.id
      });

      await loadRTPHistory();
      setSelectedUsers([]);

    } catch (error: any) {
      toast.error(t.callCycle.batchRtpSetFailed, {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleUserSelection = (username: string) => {
    if (selectedUsers.includes(username)) {
      setSelectedUsers(prev => prev.filter(u => u !== username));
    } else {
      if (actionMode === 'reset' && selectedUsers.length >= 500) {
        toast.warning(t.callCycle.maxUsersWarning);
        return;
      }
      setSelectedUsers(prev => [...prev, username]);
    }
  };

  const toggleAllUsers = () => {
    if (selectedUsers.length === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUsers([]);
    } else {
      const limit = actionMode === 'reset' ? 500 : filteredUsers.length;
      setSelectedUsers(filteredUsers.slice(0, limit).map(u => u.username));
    }
  };

  const selectedVendor = vendors.find(v => v.code === vendorCode);

  return (
    <DarkPageLayout>
      <div className="space-y-4">
        {/* 🎯 헤더 - 큰 타이틀 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl mb-1">{t.callCycle.title}</h1>
            <p className="text-base text-gray-400">{t.callCycle.subtitle}</p>
          </div>
        </div>

        {/* 📊 요약 카드 - 큰 폰트로 현재 상태 표시 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-6 h-6 text-blue-400" />
              <p className="text-sm text-gray-400">현재 RTP 설정값</p>
            </div>
            <p className="text-4xl text-white">{rtpValue}%</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-6 h-6 text-purple-400" />
              <p className="text-sm text-gray-400">선택된 사용자</p>
            </div>
            <p className="text-4xl text-white">{selectedUsers.length}<span className="text-xl text-gray-400 ml-2">/ {users.length}</span></p>
          </div>
          <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-6 h-6 text-green-400" />
              <p className="text-sm text-gray-400">선택된 게임사</p>
            </div>
            <p className="text-2xl text-white">{selectedVendor?.name || '미선택'}</p>
          </div>
        </div>

        {/* 🎮 2열 레이아웃 */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* 왼쪽: 설정 영역 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 게임사 선택 */}
            <UnifiedCard title={t.callCycle.vendorSelection}>
              <div className="space-y-3">
                <Label className="text-base">{t.callCycle.vendorCode}</Label>
                <Select value={vendorCode} onValueChange={setVendorCode}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder={t.callCycle.selectVendor} />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.length === 0 ? (
                      <SelectItem value="none" disabled>
                        {t.callCycle.noVendors}
                      </SelectItem>
                    ) : (
                      vendors.map((vendor, index) => (
                        <SelectItem key={`${vendor.code}-${index}`} value={vendor.code}>
                          {vendor.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </UnifiedCard>

            {/* 작업 선택 */}
            <UnifiedCard title={t.callCycle.actionSelection}>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={actionMode === 'set' ? 'default' : 'outline'}
                    onClick={() => {
                      setActionMode('set');
                      setRtpResults([]);
                    }}
                    className="h-14 text-base"
                  >
                    {t.callCycle.setUserRTP}
                  </Button>
                  <Button
                    variant={actionMode === 'get' ? 'default' : 'outline'}
                    onClick={() => {
                      setActionMode('get');
                      setRtpResults([]);
                    }}
                    className="h-14 text-base"
                  >
                    {t.callCycle.getUserRTP}
                  </Button>
                  <Button
                    variant={actionMode === 'reset' ? 'default' : 'outline'}
                    onClick={() => {
                      setActionMode('reset');
                      setRtpResults([]);
                      if (selectedUsers.length > 500) {
                        setSelectedUsers(selectedUsers.slice(0, 500));
                      }
                    }}
                    className="h-14 text-base"
                  >
                    {t.callCycle.resetUserRTP}
                  </Button>
                </div>

                {/* RTP 값 입력 */}
                {actionMode !== 'get' && (
                  <div className="space-y-3">
                    <Label className="text-base">{t.callCycle.rtpValue}</Label>
                    <Input
                      type="number"
                      value={rtpValue}
                      onChange={(e) => setRtpValue(parseInt(e.target.value) || 85)}
                      min={30}
                      max={99}
                      className="h-14 text-2xl text-center bg-slate-900/50 border-slate-700"
                    />
                    <p className="text-sm text-gray-500">{t.callCycle.rtpDescription}</p>
                  </div>
                )}

                {/* 실행 버튼 */}
                <Button
                  onClick={() => {
                    if (actionMode === 'set') {
                      handleSetUserRTP();
                    } else if (actionMode === 'get') {
                      handleGetUserRTP();
                    } else {
                      handleResetUserRTP();
                    }
                  }}
                  disabled={loading || !vendorCode || selectedUsers.length === 0}
                  className="w-full h-16 text-lg"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                      {t.callCycle.processing}
                    </>
                  ) : (
                    <>
                      <Activity className="w-5 h-5 mr-2" />
                      {actionMode === 'set' ? t.callCycle.setRTP :
                       actionMode === 'get' ? t.callCycle.getRTP :
                       t.callCycle.batchSetRTP}
                    </>
                  )}
                </Button>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <p className="text-base text-blue-200">
                    {actionMode === 'reset' 
                      ? `일괄 설정: 최대 500명 | 선택: ${selectedUsers.length}명`
                      : actionMode === 'get'
                      ? `조회 모드: ${selectedUsers.length}명 선택됨`
                      : `개별 설정: ${selectedUsers.length}명 선택됨`}
                  </p>
                </div>
              </div>
            </UnifiedCard>

            {/* 주의사항 - 더 컴팩트하게 */}
            <Alert>
              <AlertCircle className="h-5 w-5" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="text-base mb-2"><strong>{t.callCycle.noticeTitle}</strong></p>
                  <ul className="list-disc list-inside space-y-0.5 text-sm">
                    <li>{t.callCycle.noticeOroplayOnly}</li>
                    <li>{t.callCycle.noticeSetUser}</li>
                    <li>{t.callCycle.noticeGetUser}</li>
                    <li>{t.callCycle.noticeResetUser}</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          </div>

          {/* 오른쪽: 사용자 선택 영역 */}
          <div className="lg:col-span-3">
            <UnifiedCard title={t.callCycle.targetUsers}>
              <div className="space-y-3">
                {/* 검색 + 전체 선택 */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="사용자 검색..."
                      className="pl-10 h-12 text-base bg-slate-900/50 border-slate-700"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={toggleAllUsers}
                    className="h-12 px-6 text-base"
                  >
                    {selectedUsers.length === filteredUsers.length && filteredUsers.length > 0
                      ? t.callCycle.deselectAll
                      : t.callCycle.selectAll}
                  </Button>
                </div>
                
                {/* 사용자 테이블 */}
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                  <div className="max-h-[600px] overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                      <p className="text-base text-gray-500 text-center py-8">
                        {searchQuery ? '검색 결과가 없습니다.' : t.callCycle.noUsers}
                      </p>
                    ) : (
                      <Table>
                        <TableHeader className="sticky top-0 bg-slate-800 z-10">
                          <TableRow>
                            <TableHead className="w-12 text-center">
                              <Checkbox
                                checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                                onCheckedChange={toggleAllUsers}
                              />
                            </TableHead>
                            <TableHead className="text-base">사용자명</TableHead>
                            <TableHead className="text-base text-right">상태</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredUsers.map((u) => (
                            <TableRow
                              key={u.id}
                              className="cursor-pointer hover:bg-slate-800/50"
                              onClick={() => toggleUserSelection(u.username)}
                            >
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={selectedUsers.includes(u.username)}
                                  onCheckedChange={() => toggleUserSelection(u.username)}
                                />
                              </TableCell>
                              <TableCell className="text-base">{u.username}</TableCell>
                              <TableCell className="text-right">
                                {selectedUsers.includes(u.username) ? (
                                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">선택됨</Badge>
                                ) : (
                                  <Badge variant="outline" className="border-slate-600 text-slate-400">미선택</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-400">
                  {searchQuery && `검색 결과: ${filteredUsers.length}명 / `}
                  전체: {users.length}명 | 선택: {selectedUsers.length}명
                  {actionMode === 'reset' && ` (최대 500명)`}
                </p>
              </div>
            </UnifiedCard>
          </div>
        </div>

        {/* RTP 조회 결과 */}
        {actionMode === 'get' && rtpResults.length > 0 && (
          <UnifiedCard title={t.callCycle.rtpResults}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-base">{t.callCycle.username}</TableHead>
                    <TableHead className="text-base">{t.callCycle.currentRTP}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rtpResults.map((result) => (
                    <TableRow key={result.username}>
                      <TableCell className="text-base">{result.username}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-lg px-3 py-1">{result.rtp}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </UnifiedCard>
        )}

        {/* 설정 이력 */}
        <UnifiedCard title={t.callCycle.recentHistory}>
          <div className="overflow-x-auto">
            {rtpHistory.length === 0 ? (
              <p className="text-base text-gray-500 text-center py-8">
                {t.callCycle.noHistory}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-base">{t.callCycle.time}</TableHead>
                    <TableHead className="text-base">{t.callCycle.vendor}</TableHead>
                    <TableHead className="text-base">{t.callCycle.settingMethod}</TableHead>
                    <TableHead className="text-base">{t.callCycle.rtp}</TableHead>
                    <TableHead className="text-base">{t.callCycle.appliedBy}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rtpHistory.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="text-base">
                        {new Date(record.created_at).toLocaleString('ko-KR')}
                      </TableCell>
                      <TableCell className="text-base">{record.vendor_code}</TableCell>
                      <TableCell>
                        <Badge variant={
                          record.setting_type === 'set' ? 'default' :
                          record.setting_type === 'reset' ? 'secondary' :
                          'outline'
                        }>
                          {record.setting_type === 'set' ? t.callCycle.individualSetting : 
                           record.setting_type === 'reset' ? t.callCycle.batchSetting : 
                           record.setting_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-base">{record.rtp_value}%</TableCell>
                      <TableCell className="text-base">{record.applied_by_username}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </UnifiedCard>
      </div>
    </DarkPageLayout>
  );
}