import { Alert, AlertDescription } from "../ui/alert";
import { Checkbox } from "../ui/checkbox";
import * as oroplayApi from "../../lib/oroplayApi";
import { useLanguage } from "../../contexts/LanguageContext";

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
        toast.error('데이터베이스 설정 필요', {
          description: 'SQL Editor에서 371_add_game_providers_api_columns.sql을 실행하세요',
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
        toast.warning('OroPlay 게임사가 없습니다', {
          description: '먼저 게임 관리에서 OroPlay 게임을 동기화하세요',
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
      toast.error('게임사를 선택하세요');
      return;
    }
    if (selectedUsers.length === 0) {
      toast.error('사용자를 선택하세요');
      return;
    }
    if (rtpValue < 30 || rtpValue > 99) {
      toast.error('RTP 값은 30~99 사이여야 합니다');
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

      toast.success(`${successCount}명의 RTP가 설정되었습니다`);
      await loadRTPHistory();
      setSelectedUsers([]);

    } catch (error: any) {
      toast.error('RTP 설정 실패', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  // Get User RTP - 개별 RTP 확인 (oroplayApi 사용)
  const handleGetUserRTP = async () => {
    if (!vendorCode) {
      toast.error('게임사를 선택하세요');
      return;
    }
    if (selectedUsers.length === 0) {
      toast.error('사용자를 선택하세요');
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
      toast.success('RTP 조회 완료');

    } catch (error: any) {
      toast.error('RTP 조회 실패', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset User RTP - 일괄 RTP 설정 (최대 500명) (oroplayApi 사용)
  const handleResetUserRTP = async () => {
    if (!vendorCode) {
      toast.error('게임사를 선택하세요');
      return;
    }
    if (selectedUsers.length === 0) {
      toast.error('사용자를 선택하세요');
      return;
    }
    if (selectedUsers.length > 500) {
      toast.error('최대 500명까지 선택 가능합니다');
      return;
    }
    if (rtpValue < 30 || rtpValue > 99) {
      toast.error('RTP 값은 30~99 사이여야 합니다');
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

      toast.success(`${selectedUsers.length}명의 RTP가 일괄 설정되었습니다`);

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
      toast.error('일괄 RTP 설정 실패', {
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
        toast.warning('최대 500명까지 선택 가능합니다');
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
            이 기능은 시스템관리자와 대본사만 접근할 수 있습니다.
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
        <UnifiedCard title="게임 공급사 선택">
          <div className="space-y-2">
            <Label>Vendor Code</Label>
            <Select value={vendorCode} onValueChange={setVendorCode}>
              <SelectTrigger>
                <SelectValue placeholder="게임사 선택" />
              </SelectTrigger>
              <SelectContent>
                {vendors.length === 0 ? (
                  <SelectItem value="none" disabled>
                    게임사가 없습니다. OroPlay 게임을 먼저 동기화하세요.
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
              RTP 설정을 적용할 슬롯 게임 공급사를 선택하세요.
            </p>
          </div>
        </UnifiedCard>

        {/* 작업 선택 */}
        <UnifiedCard title="작업 선택">
          <div className="space-y-4">
            <div className="flex gap-4">
              <Button
                variant={actionMode === 'set' ? 'default' : 'outline'}
                onClick={() => {
                  setActionMode('set');
                  setRtpResults([]);
                }}
              >
                Set User RTP (개별 설정)
              </Button>
              <Button
                variant={actionMode === 'get' ? 'default' : 'outline'}
                onClick={() => {
                  setActionMode('get');
                  setRtpResults([]);
                }}
              >
                Get User RTP (개별 확인)
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
                Reset User RTP (일괄 설정)
              </Button>
            </div>

            {/* 사용자 선택 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>대상 사용자</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAllUsers}
                >
                  {selectedUsers.length === users.length ? '전체 해제' : '전체 선택'}
                </Button>
              </div>
              
              <div className="border border-slate-700 rounded-lg p-4 max-h-60 overflow-y-auto bg-slate-900/50">
                {users.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    사용자가 없습니다
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
                  ? `최대 500명까지 선택 가능합니다. (현재 ${selectedUsers.length}명 선택)`
                  : actionMode === 'get'
                  ? `RTP를 조회할 사용자를 선택하세요. (현재 ${selectedUsers.length}명 선택)`
                  : `개별 설정할 사용자를 선택하세요. (현재 ${selectedUsers.length}명 선택)`}
              </p>
            </div>

            {/* RTP 값 입력 (get 모드에서는 숨김) */}
            {actionMode !== 'get' && (
              <div className="space-y-2">
                <Label>RTP 값 (30 ~ 99)</Label>
                <Input
                  type="number"
                  value={rtpValue}
                  onChange={(e) => setRtpValue(parseInt(e.target.value) || 85)}
                  min={30}
                  max={99}
                  className="bg-slate-900/50 border-slate-700"
                />
                <p className="text-xs text-gray-500">
                  높을수록 플레이어에게 유리합니다. (기본값: 85)
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
                  처리 중...
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4 mr-2" />
                  {actionMode === 'set' ? 'RTP 설정' :
                   actionMode === 'get' ? 'RTP 조회' :
                   '일괄 RTP 설정'}
                </>
              )}
            </Button>
          </div>
        </UnifiedCard>

        {/* RTP 조회 결과 */}
        {actionMode === 'get' && rtpResults.length > 0 && (
          <UnifiedCard title="RTP 조회 결과">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>사용자</TableHead>
                    <TableHead>현재 RTP</TableHead>
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
              <p><strong>주의사항:</strong></p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>이 기능은 OroPlay API 슬롯 게임에만 적용됩니다.</li>
                <li><strong>Set User RTP:</strong> 개별 사용자의 RTP를 설정합니다.</li>
                <li><strong>Get User RTP:</strong> 개별 사용자의 현재 RTP를 확인합니다.</li>
                <li><strong>Reset User RTP:</strong> 최대 500명의 RTP를 일괄 설정합니다.</li>
                <li>Invest API와는 무관한 기능입니다.</li>
              </ul>
            </div>
          </AlertDescription>
        </Alert>

        {/* 설정 이력 */}
        <UnifiedCard title="최근 설정 이력">
          <div className="overflow-x-auto">
            {rtpHistory.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                설정 이력이 없습니다
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시간</TableHead>
                    <TableHead>게임사</TableHead>
                    <TableHead>설정 방식</TableHead>
                    <TableHead>RTP</TableHead>
                    <TableHead>적용자</TableHead>
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
                          {record.setting_type === 'set' ? '개별 설정' : 
                           record.setting_type === 'reset' ? '일괄 설정' : 
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