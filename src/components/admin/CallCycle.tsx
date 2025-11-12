import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { AlertCircle, Activity, RefreshCw } from "lucide-react";
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
  // 권한 확인 (시스템관리자, 대본사만)
  const canManageRTP = user.level === 0 || user.level === 1;

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

  useEffect(() => {
    if (canManageRTP) {
      loadVendors();
      loadUsers();
      loadRTPHistory();
    }
  }, [canManageRTP]);

  // OroPlay 토큰 가져오기 (oroplayApi 사용 - 자동 갱신 포함)
  const getOroPlayToken = async (): Promise<string> => {
    return await oroplayApi.getOroPlayToken(user.id);
  };

  // OroPlay 슬롯 게임사 목록 로드
  const loadVendors = async () => {
    try {
      // vendor_code 컬럼 확인
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

      // OroPlay 슬롯 게임사만 조회
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

  // 사용자 목록 로드
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

  // RTP 설정 이력 로드
  const loadRTPHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('rtp_settings')
        .select(`
          id,
          vendor_code,
          setting_type,
          rtp_value,
          user_id,
          created_at,
          applied_by:partners!rtp_settings_applied_by_fkey(username)
        `)
        .eq('partner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('RTP 이력 로드 오류:', error);
        return;
      }

      const history = (data || []).map(record => ({
        id: record.id,
        vendor_code: record.vendor_code,
        setting_type: record.setting_type,
        rtp_value: record.rtp_value,
        user_id: record.user_id,
        created_at: record.created_at,
        applied_by_username: record.applied_by?.username || '알 수 없음'
      }));

      setRtpHistory(history);
      
    } catch (error) {
      console.error('RTP 이력 로드 실패:', error);
    }
  };

  // Set User RTP - 개별 RTP 설정 (oroplayApi 사용)
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
          // ✅ oroplayApi 함수 사용
          await oroplayApi.setUserRTP(token, vendorCode, username, rtpValue);
          
          successCount++;

          // 로그 저장
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

  // Get User RTP - 개별 RTP 확인 (oroplayApi 사용)
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
          // ✅ oroplayApi 함수 사용
          const rtp = await oroplayApi.getUserRTP(token, vendorCode, username);
          
          results.push({
            username,
            rtp
          });
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

  // Reset User RTP - 일괄 RTP 설정 (최대 500명) (oroplayApi 사용)
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

      // ✅ oroplayApi 함수 사용
      await oroplayApi.batchSetRTP(token, vendorCode, data);

      toast.success(t.callCycle.batchRtpSetSuccess.replace('{{count}}', String(selectedUsers.length)));

      // 로그 저장
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

  // 사용자 선택 토글
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

  // 전체 선택/해제
  const toggleAllUsers = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      const limit = actionMode === 'reset' ? 500 : users.length;
      setSelectedUsers(users.slice(0, limit).map(u => u.username));
    }
  };

  if (!canManageRTP) {
    return (
      <DarkPageLayout>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t.callCycle.accessDenied}
          </AlertDescription>
        </Alert>
      </DarkPageLayout>
    );
  }

  return (
    <DarkPageLayout>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div>
          <h1 className="text-2xl mb-2">{t.callCycle.title}</h1>
          <p className="text-sm text-gray-400">
            {t.callCycle.subtitle}
          </p>
        </div>

        {/* 게임사 선택 */}
        <UnifiedCard title={t.callCycle.vendorSelection}>
          <div className="space-y-2">
            <Label>{t.callCycle.vendorCode}</Label>
            <Select value={vendorCode} onValueChange={setVendorCode}>
              <SelectTrigger>
                <SelectValue placeholder={t.callCycle.selectVendor} />
              </SelectTrigger>
              <SelectContent>
                {vendors.length === 0 ? (
                  <SelectItem value="none" disabled>
                    {t.callCycle.noVendors}
                  </SelectItem>
                ) : (
                  vendors.map(vendor => (
                    <SelectItem key={vendor.code} value={vendor.code}>
                      {vendor.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              {t.callCycle.vendorDescription}
            </p>
          </div>
        </UnifiedCard>

        {/* 작업 선택 */}
        <UnifiedCard title={t.callCycle.actionSelection}>
          <div className="space-y-4">
            <div className="flex gap-4">
              <Button
                variant={actionMode === 'set' ? 'default' : 'outline'}
                onClick={() => {
                  setActionMode('set');
                  setRtpResults([]);
                }}
              >
                {t.callCycle.setUserRTP}
              </Button>
              <Button
                variant={actionMode === 'get' ? 'default' : 'outline'}
                onClick={() => {
                  setActionMode('get');
                  setRtpResults([]);
                }}
              >
                {t.callCycle.getUserRTP}
              </Button>
              <Button
                variant={actionMode === 'reset' ? 'default' : 'outline'}
                onClick={() => {
                  setActionMode('reset');
                  setRtpResults([]);
                  // Reset 모드에서는 500명 제한
                  if (selectedUsers.length > 500) {
                    setSelectedUsers(selectedUsers.slice(0, 500));
                  }
                }}
              >
                {t.callCycle.resetUserRTP}
              </Button>
            </div>

            {/* 사용자 선택 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t.callCycle.targetUsers}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAllUsers}
                >
                  {selectedUsers.length === users.length ? t.callCycle.deselectAll : t.callCycle.selectAll}
                </Button>
              </div>
              
              <div className="border border-slate-700 rounded-lg p-4 max-h-60 overflow-y-auto bg-slate-900/50">
                {users.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    {t.callCycle.noUsers}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {users.map(user => (
                      <label
                        key={user.id}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-slate-800/50 p-2 rounded"
                      >
                        <Checkbox
                          checked={selectedUsers.includes(user.username)}
                          onCheckedChange={() => toggleUserSelection(user.username)}
                        />
                        <span className="text-sm">{user.username}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              <p className="text-xs text-gray-500">
                {actionMode === 'reset' 
                  ? t.callCycle.resetModeLimit.replace('{{count}}', String(selectedUsers.length))
                  : actionMode === 'get'
                  ? t.callCycle.getModeInfo.replace('{{count}}', String(selectedUsers.length))
                  : t.callCycle.setModeInfo.replace('{{count}}', String(selectedUsers.length))}
              </p>
            </div>

            {/* RTP 값 입력 (get 모드에서는 숨김) */}
            {actionMode !== 'get' && (
              <div className="space-y-2">
                <Label>{t.callCycle.rtpValue}</Label>
                <Input
                  type="number"
                  value={rtpValue}
                  onChange={(e) => setRtpValue(parseInt(e.target.value) || 85)}
                  min={30}
                  max={99}
                  className="bg-slate-900/50 border-slate-700"
                />
                <p className="text-xs text-gray-500">
                  {t.callCycle.rtpDescription}
                </p>
              </div>
            )}

            {/* 적용 버튼 */}
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
              disabled={
                loading ||
                !vendorCode ||
                selectedUsers.length === 0
              }
              className="w-full"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {t.callCycle.processing}
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4 mr-2" />
                  {actionMode === 'set' ? t.callCycle.setRTP :
                   actionMode === 'get' ? t.callCycle.getRTP :
                   t.callCycle.batchSetRTP}
                </>
              )}
            </Button>
          </div>
        </UnifiedCard>

        {/* RTP 조회 결과 */}
        {actionMode === 'get' && rtpResults.length > 0 && (
          <UnifiedCard title={t.callCycle.rtpResults}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.callCycle.username}</TableHead>
                    <TableHead>{t.callCycle.currentRTP}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rtpResults.map((result) => (
                    <TableRow key={result.username}>
                      <TableCell>{result.username}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{result.rtp}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </UnifiedCard>
        )}

        {/* 주의사항 */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p><strong>{t.callCycle.noticeTitle}</strong></p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>{t.callCycle.noticeOroplayOnly}</li>
                <li>{t.callCycle.noticeSetUser}</li>
                <li>{t.callCycle.noticeGetUser}</li>
                <li>{t.callCycle.noticeResetUser}</li>
                <li>{t.callCycle.noticeInvestNA}</li>
              </ul>
            </div>
          </AlertDescription>
        </Alert>

        {/* 설정 이력 */}
        <UnifiedCard title={t.callCycle.recentHistory}>
          <div className="overflow-x-auto">
            {rtpHistory.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                {t.callCycle.noHistory}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.callCycle.time}</TableHead>
                    <TableHead>{t.callCycle.vendor}</TableHead>
                    <TableHead>{t.callCycle.settingMethod}</TableHead>
                    <TableHead>{t.callCycle.rtp}</TableHead>
                    <TableHead>{t.callCycle.appliedBy}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rtpHistory.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        {new Date(record.created_at).toLocaleString('ko-KR')}
                      </TableCell>
                      <TableCell>{record.vendor_code}</TableCell>
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
                      <TableCell>{record.rtp_value}%</TableCell>
                      <TableCell>{record.applied_by_username}</TableCell>
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