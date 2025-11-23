import { useState, useEffect } from "react";
import { Plus, Search, Filter, Download, Upload, Edit, Trash2, Eye, DollarSign, UserX, UserCheck, X, Check, Clock, Bell, Users, Activity, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { DataTable } from "../common/DataTable";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle, AdminDialogTrigger as DialogTrigger } from "./AdminDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useAuth } from "../../hooks/useAuth";
import { useWebSocketContext } from "../../contexts/WebSocketContext";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { getAdminOpcode, isMultipleOpcode } from "../../lib/opcodeHelper";
import * as investApi from "../../lib/investApi";
import { retryApiAccountCreation, createApiAccounts } from "../../lib/apiAccountManager";
import { UserDetailModal } from "./UserDetailModal";
import { MetricCard } from "./MetricCard";
import { ForceTransactionModal } from "./ForceTransactionModal";
import { 
  useHierarchyAuth, 
  useHierarchicalData, 
  PermissionGate, 
  HierarchyBadge,
  HierarchyLevel 
} from "../common/HierarchyManager";
import { useLanguage } from "../../contexts/LanguageContext";

// 게임 제공사 이름 매핑 헬퍼 함수
const getProviderName = (providerId: number | string): string => {
  const id = typeof providerId === 'string' ? parseInt(providerId) : providerId;
  
  const providerMap: { [key: number]: string } = {
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
    // 카지노 제공사
    410: '에볼루션 게이밍',
    77: '마이크로 게이밍',
    2: 'Vivo 게이밍',
    30: '아시아 게이밍',
    78: '프라그마틱플레이',
    86: '섹시게이밍',
    11: '비비아이엔',
    28: '드림게임',
    89: '오리엔탈게임',
    91: '보타',
    44: '이주기',
    85: '플레이텍 라이브',
    0: '제네럴 카지노'
  };
  
  return providerMap[id] || `제공사 ${id}`;
};

// 은행 목록
const BANK_LIST = [
  'KB국민은행', '신한은행', '우리은행', '하나은행', '농협은행',
  'IBK기업은행', '부산은행', '대구은행', '광주은행', '전북은행',
  '경남은행', '제주은행', 'SC제일은행', 'HSBC은행', 'KDB산업은행',
  'NH농협은행', '신협중앙회', '우체국예금보험', '새마을금고',
  '카카오뱅크', '케이뱅크', '토스뱅크'
];

export function UserManagement() {
  const { authState } = useAuth();
  const { lastMessage, connected, sendMessage } = useWebSocketContext();
  const { userLevel, isSystemAdmin, getLevelName } = useHierarchyAuth();
  const { t } = useLanguage();
  
  // 사용자 데이터 (직접 조회)
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showForceTransactionModal, setShowForceTransactionModal] = useState(false);
  const [forceTransactionType, setForceTransactionType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [forceTransactionTarget, setForceTransactionTarget] = useState<any>(null);
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [detailUser, setDetailUser] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [availablePartners, setAvailablePartners] = useState<any[]>([]); // Lv1이 회원 생성 시 선택 가능한 파트너 목록
  const [currentUserBalance, setCurrentUserBalance] = useState(0); // 현재 관리자의 보유금
  
  // 입출금 대상 사용자의 소속 파트너 보유금 (강제 입출금 모달용)
  const [targetPartnerBalance, setTargetPartnerBalance] = useState(0); // 파트너의 balance
  const [targetPartnerLevel, setTargetPartnerLevel] = useState(0); // 소속 파트너의 레벨
  // ✅ Lv1 참고용 (UI 표시용, 실제 로직에는 사용하지 않음)
  const [targetPartnerInvestBalance, setTargetPartnerInvestBalance] = useState(0);
  const [targetPartnerOroplayBalance, setTargetPartnerOroplayBalance] = useState(0);
  
  const [formData, setFormData] = useState({
    username: '',
    nickname: '',
    password: '',
    bank_name: '',
    bank_account: '',
    memo: '',
    selected_referrer_id: '' // Lv1이 회원 생성 시 소속 파트너 선택
  });

  // 사용자 목록 조회 (하위 파트너 포함)
  const fetchUsers = async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      let allowedReferrerIds: string[] = [];

      if (authState.user?.level === 1) {
        // 시스템관리자: 모든 사용자
        const { data, error } = await supabase
          .from('users')
          .select(`
            *,
            balance_sync_call_count,
            balance_sync_started_at,
            referrer:partners!referrer_id(
              id,
              username,
              level
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setUsers(data || []);
        return;
      } else {
        // 일반 파트너: 자신 + 하위 파트너들의 사용자
        const { data: hierarchicalPartners } = await supabase
          .rpc('get_hierarchical_partners', { p_partner_id: authState.user?.id });
        
        allowedReferrerIds = [authState.user?.id || '', ...(hierarchicalPartners?.map((p: any) => p.id) || [])];
      }

      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          balance_sync_call_count,
          balance_sync_started_at,
          referrer:partners!referrer_id(
            id,
            username,
            level
          )
        `)
        .in('referrer_id', allowedReferrerIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('❌ 회원 목록 조회 실패:', error);
      if (!silent) toast.error('회원 목록을 불러오는데 실패했습니다.');
      setUsers([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // 현재 사용자의 보유금 조회
  const fetchCurrentUserBalance = async () => {
    if (!authState.user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('balance, level')
        .eq('id', authState.user.id)
        .single();
      
      if (error) throw error;
      
      console.log('💰 [UserManagement] 관리자 보유금 조회 (partners 테이블):', {
        level: data?.level,
        balance: data?.balance
      });
      
      // ✅ 모든 레벨에서 partners.balance 사용
      setCurrentUserBalance(data?.balance || 0);
      console.log('✅ 관리자 보유금 설정:', data?.balance || 0);
    } catch (error) {
      console.error('❌ 현재 사용자 보유금 조회 실패:', error);
    }
  };

  // 초기 로드
  useEffect(() => {
    fetchUsers();
    fetchCurrentUserBalance();
    // Lv1(시스템관리자)인 경우 선택 가능한 파트너 목록 로드
    if (authState.user?.level === 1) {
      loadAvailablePartners();
    }
  }, [authState.user?.id, authState.user?.level]);

  /**
   * Lv1(시스템관리자)이 회원 생성 시 선택 가능한 파트너 목록 로드
   */
  const loadAvailablePartners = async () => {
    try {
      const { data } = await supabase
        .from('partners')
        .select('id, username, nickname, partner_type, level')
        .in('partner_type', ['head_office', 'main_office', 'sub_office', 'distributor', 'store'])
        .eq('status', 'active')
        .order('level', { ascending: true })
        .order('created_at', { ascending: true });

      setAvailablePartners(data || []);
    } catch (error) {
      console.error('소속 파트너 목록 로드 실패:', error);
    }
  };

  // Realtime subscription for users table and partner balance
  useEffect(() => {
    if (!authState.user?.id) return;

    // users 테이블 변경 감지 - 깜박임 없는 업데이트
    const usersChannel = supabase
      .channel('users-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users'
        },
        (payload) => {
          console.log('👥 users 테이블 변경 감지:', payload);
          // silent 모드로 데이터 새로고침 (깜박임 없음)
          fetchUsers(true);
        }
      )
      .subscribe();

    // 현재 관리자의 partners 테이블 변경 감지 (balance, invest_balance, oroplay_balance)
    const partnerBalanceChannel = supabase
      .channel('current-partner-balance')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'partners',
          filter: `id=eq.${authState.user.id}`
        },
        (payload) => {
          const updated = payload.new as any;
          console.log('💰 현재 관리자 보유금 변경 (partners):', {
            balance: updated.balance,
            invest_balance: updated.invest_balance,
            oroplay_balance: updated.oroplay_balance,
            level: updated.level
          });
          
          // ✅ 모든 레벨에서 partners.balance 업데이트
          setCurrentUserBalance(updated.balance || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(partnerBalanceChannel);
    };
  }, [authState.user?.id]);

  // WebSocket 메시지 처리 - 깜박임 없는 업데이트
  useEffect(() => {
    if (lastMessage?.type === 'user_balance_updated' || lastMessage?.type === 'user_updated') {
      console.log('🔔 사용자 업데이트 알림 수신:', lastMessage);
      // silent 모드로 데이터 새로고침 (깜박임 없음)
      fetchUsers(true);
    }
  }, [lastMessage]);

  // 강제 입출금 대상 사용자의 소속 파트너 보유금 조회
  useEffect(() => {
    const fetchTargetPartnerBalance = async () => {
      if (!forceTransactionTarget?.id) {
        // 대상이 없으면 초기화
        setTargetPartnerBalance(0);
        setTargetPartnerInvestBalance(0);
        setTargetPartnerOroplayBalance(0);
        setTargetPartnerLevel(0);
        return;
      }

      try {
        console.log('🔍 [ForceTransaction] 대상 사용자:', {
          id: forceTransactionTarget.id,
          username: forceTransactionTarget.username,
          referrer_id: forceTransactionTarget.referrer_id,
          referrer: forceTransactionTarget.referrer
        });

        // 1. referrer_id 가져오기
        const partnerId = forceTransactionTarget.referrer_id;

        if (!partnerId) {
          console.error('❌ 사용자의 referrer_id가 없습니다.');
          return;
        }

        // 2. 파트너 정보 조회
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('balance, level, username')
          .eq('id', partnerId)
          .single();

        if (partnerError || !partnerData) {
          console.error('❌ 파트너 정보 조회 실패:', partnerError);
          return;
        }

        console.log('💰 [ForceTransaction] 소속 파트너 보유금 조회:', {
          partnerId,
          username: partnerData.username,
          level: partnerData.level,
          balance: partnerData.balance
        });

        setTargetPartnerLevel(partnerData.level);

        // ✅ Lv1의 경우: api_configs에서 실제 보유금 조회 (참고용)
        if (partnerData.level === 1) {
          const { data: apiConfigsData, error: apiConfigsError } = await supabase
            .from('api_configs')
            .select('balance, api_provider')
            .eq('partner_id', partnerId);

          if (!apiConfigsError && apiConfigsData) {
            const investBalance = apiConfigsData.find((c: any) => c.api_provider === 'invest')?.balance || 0;
            const oroplayBalance = apiConfigsData.find((c: any) => c.api_provider === 'oroplay')?.balance || 0;
            setTargetPartnerInvestBalance(investBalance);
            setTargetPartnerOroplayBalance(oroplayBalance);
            console.log('✅ Lv1 소속 파트너 보유금 설정 (api_configs):', {
              invest: investBalance,
              oroplay: oroplayBalance
            });
          } else {
            console.warn('⚠️ Lv1 api_configs 조회 실패:', apiConfigsError);
            setTargetPartnerInvestBalance(0);
            setTargetPartnerOroplayBalance(0);
          }
        }
        // ✅ Lv2의 경우: partners.invest_balance + partners.oroplay_balance 사용
        else if (partnerData.level === 2) {
          setTargetPartnerInvestBalance(partnerData.invest_balance || 0);
          setTargetPartnerOroplayBalance(partnerData.oroplay_balance || 0);
          console.log('✅ Lv2 소속 파트너 보유금 설정 (두 개 지갑):', {
            invest_balance: partnerData.invest_balance || 0,
            oroplay_balance: partnerData.oroplay_balance || 0
          });
        }
        // ✅ Lv3~7의 경우: partners.balance 사용
        else {
          setTargetPartnerBalance(partnerData.balance || 0);
          console.log('✅ Lv3~7 소속 파트너 보유금 설정:', partnerData.balance || 0);
        }
      } catch (error) {
        console.error('❌ 소속 파트너 보유금 조회 실패:', error);
      }
    };

    fetchTargetPartnerBalance();
  }, [forceTransactionTarget?.id]);

  // 회원 생성
  const createUser = async () => {
    if (!formData.username || !formData.password) {
      toast.error('아이디와 비밀번호는 필수입니다.');
      return;
    }

    // 중복 실행 방지
    if (createUserLoading) {
      console.warn('⚠️ 회원 생성이 이미 진행 중입니다.');
      return;
    }

    // 폼 데이터 저장 (모달 닫은 후에도 사용하기 위해)
    const userData = { ...formData };
    
    // 모달 즉시 닫기
    setShowCreateDialog(false);
    setFormData({
      username: '',
      nickname: '',
      password: '',
      bank_name: '',
      bank_account: '',
      memo: '',
      selected_referrer_id: ''
    });

    // 백그라운드에서 회원 생성 진행
    setCreateUserLoading(true);
    
    try {
      console.log('👤 새 회원 생성 시작:', userData.username);
      toast.loading(`[1/4] 아이디 중복 확인 중... (${userData.username})`, { id: 'create-user' });

      // 0. 아이디 중복 체크 (users + partners 테이블 모두 확인)
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', userData.username)
        .maybeSingle();

      if (existingUser) {
        toast.error(`이미 사용 중인 아이디입니다 (회원): ${userData.username}`, { id: 'create-user' });
        return;
      }

      const { data: existingPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('username', userData.username)
        .maybeSingle();

      if (existingPartner) {
        toast.error(`이미 사용 중인 아이디입니다 (파트너): ${userData.username}`, { id: 'create-user' });
        return;
      }

      toast.loading(`[2/4] DB에 회원 정보 저장 중... (${userData.username})`, { id: 'create-user' });

      // 실제 referrer_id 결정 (Lv1이 선택한 파트너 또는 현재 사용자)
      const actualReferrerId = (authState.user?.level === 1 && userData.selected_referrer_id) 
        ? userData.selected_referrer_id 
        : authState.user?.id;

      // 1. DB에 사용자 생성 (api_account_status = 'pending')
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          username: userData.username,
          nickname: userData.nickname || userData.username,
          password_hash: userData.password,
          bank_name: userData.bank_name || null,
          bank_account: userData.bank_account || null,
          memo: userData.memo || null,
          referrer_id: actualReferrerId,
          status: 'active',
          balance: 0,
          points: 0,
          api_account_status: 'pending',
          api_invest_created: false,
          api_oroplay_created: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ 회원 생성 DB 오류:', insertError);
        // 중복 키 에러인 경우 친절한 메시지
        if (insertError.code === '23505') {
          toast.error(`이미 사용 중인 아이디입니다: ${userData.username}`, { id: 'create-user' });
        } else {
          toast.error(`회원 생성 실패: ${insertError.message}`, { id: 'create-user' });
        }
        return;
      }

      console.log('✅ DB 회원 생성 완료:', newUser);
      toast.loading(`[3/5] 외부 API 계정 생성 중... (${userData.username})`, { id: 'create-user' });
      
      // 2. 관리자가 직접 생성하는 경우 바로 API 계정 생성 (승인 과정 없음)
      console.log('🌐 외부 API 계정 생성 시작 (Invest + OroPlay)');
      
      const apiResult = await createApiAccounts(
        newUser.id,
        userData.username,
        authState.user?.id || '',
        'create-user' // toastId 전달
      );

      console.log('🔍 API 계정 생성 결과:', apiResult);

      // API 계정 생성이 완전 실패한 경우 경고만 표시 (사용자는 이미 생성됨)
      if (apiResult.status === 'error') {
        toast.error(`⚠️ API 계정 생성 실패: ${apiResult.errorMessage}`, { id: 'create-user', duration: 10000 });
        console.error('❌ 외부 API 계정 생성 실패:', apiResult.errorMessage);
      } else if (apiResult.status === 'partial') {
        toast.warning(`⚠️ 일부 API만 생성됨 (Invest: ${apiResult.investCreated ? '✅' : '❌'} / OroPlay: ${apiResult.oroplayCreated ? '✅' : '❌'})`, { id: 'create-user', duration: 8000 });
        console.warn('⚠️ 부분 성공:', apiResult);
      } else {
        toast.success(`[5/5] ✅ 회원 ${userData.username} 생성 완료! (Invest ✅ / OroPlay ✅)`, { id: 'create-user', duration: 5000 });
        console.log('✅ 모든 API 계정 생성 성공');
      }
      
      await fetchUsers();
    } catch (error: any) {
      console.error('❌ 회원 생성 전체 오류:', error);
      toast.error(error.message || '회원 생성에 실패했습니다.', { id: 'create-user' });
    } finally {
      setCreateUserLoading(false);
    }
  };

  // 회원 승인
  const approveUser = async (userId: string, username: string) => {
    // 사용자 정보 조회 (referrer 정보 포함)
    const user = users.find(u => u.id === userId);
    if (!user) {
      toast.error('사용자 정보를 찾을 수 없습니다.');
      return;
    }

    // Optimistic Update
    setUsers(prevUsers => 
      prevUsers.map(u => 
        u.id === userId 
          ? { ...u, status: 'active', updated_at: new Date().toISOString() }
          : u
      )
    );

    try {
      setProcessingUserId(userId);
      console.log('✅ 회원 승인 처리 시작:', username);

      // 1. 외부 API 계정 생성 (Invest + OroPlay)
      // 관리자 승인 시 직접 동기 호출
      console.log('🌐 외부 API 계정 생성 시작 (Invest + OroPlay)');
      
      const apiResult = await createApiAccounts(
        userId,
        username,
        user.referrer_id || authState.user?.id || ''
      );

      console.log('🔍 API 계정 생성 결과:', apiResult);

      // API 계정 생성이 완전 실패한 경우 (둘 다 실패)
      if (apiResult.status === 'error') {
        // 롤백
        setUsers(prevUsers => 
          prevUsers.map(u => 
            u.id === userId 
              ? { ...u, status: 'pending' }
              : u
          )
        );
        toast.error(`외부 API 계정 생성 실패: ${apiResult.errorMessage}`);
        console.error('❌ 외부 API 계정 생성 실패:', apiResult.errorMessage);
        return;
      }

      // 부분 성공 시 경고 메시지
      if (apiResult.status === 'partial') {
        toast.warning(`일부 API 계정만 생성되었습니다: ${apiResult.errorMessage}`);
        console.warn('⚠️ 부분 성공:', apiResult);
      } else {
        console.log('✅ 모든 API 계정 생성 성공');
      }

      // 2. DB에 승인 상태 업데이트
      const { error } = await supabase
        .from('users')
        .update({ 
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        // 에러 발생 시 롤백
        setUsers(prevUsers => 
          prevUsers.map(u => 
            u.id === userId 
              ? { ...u, status: 'pending' }
              : u
          )
        );
        console.error('❌ 회원 승인 DB 오류:', error);
        throw error;
      }

      toast.success(`회원 ${username}이 승인되었습니다.`);
      // fetchUsers() 제거 - Realtime subscription이 자동으로 처리
    } catch (error: any) {
      console.error('회원 승인 실패:', error);
      toast.error(error.message || '회원 승인에 실패했습니다.');
    } finally {
      setProcessingUserId(null);
    }
  };

  // 회원 거절
  const rejectUser = async (userId: string, username: string) => {
    const user = users.find(u => u.id === userId);
    
    // Optimistic Update - 거절된 회원은 blocked 상태이므로 리스트에서 제거됨
    setUsers(prevUsers => prevUsers.filter(u => u.id !== userId));

    try {
      setProcessingUserId(userId);
      console.log('❌ 회원 가입 거절:', username);

      const { error } = await supabase
        .from('users')
        .update({ 
          status: 'blocked',
          memo: (user?.memo || '') + ' [가입 거절됨]',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        // 에러 발생 시 롤백
        if (user) {
          setUsers(prevUsers => [...prevUsers, user]);
        }
        console.error('❌ 회원 거절 오류:', error);
        throw error;
      }

      toast.success(`회원 ${username}의 가입이 거절되었습니다.`);
      // fetchUsers() 제거 - Realtime subscription이 자동으로 처리
    } catch (error: any) {
      console.error('회원 거절 실패:', error);
      toast.error(error.message || '회원 거절에 실패했습니다.');
    } finally {
      setProcessingUserId(null);
    }
  };

  // 회원 삭제
  const handleDeleteUser = async () => {
    if (!deleteUser) return;

    const userToDelete = deleteUser;
    
    // Optimistic Update - 즉시 리스트에서 제거
    setUsers(prevUsers => prevUsers.filter(u => u.id !== deleteUser.id));
    setShowDeleteDialog(false);

    try {
      setDeleteLoading(true);
      console.log('🗑️ 회원 삭제 처리:', deleteUser.username);

      // 1. 관련 데이터 정리 (외래키 제약조건 순서에 따라 삭제)
      
      // 1-1. 게임 세션 삭제 (user_sessions 테이블 사용)
      const { error: sessionError } = await supabase
        .from('user_sessions')
        .delete()
        .eq('user_id', deleteUser.id);

      if (sessionError) {
        console.warn('⚠️ 게임 세션 삭제 중 오류:', sessionError);
      }

      // 1-2. 메시지 큐 삭제 (sender_id 또는 target_id로 삭제)
      const { error: messageSenderError } = await supabase
        .from('message_queue')
        .delete()
        .eq('sender_id', deleteUser.id);

      if (messageSenderError) {
        console.warn('⚠️ 메��지 큐 (발송자) 삭제 중 오류:', messageSenderError);
      }

      const { error: messageTargetError } = await supabase
        .from('message_queue')
        .delete()
        .eq('target_id', deleteUser.id);

      if (messageTargetError) {
        console.warn('⚠️ 메시지 큐 (수신자) 삭제 중 오류:', messageTargetError);
      }

      // 1-3. 알림 삭제 (recipient_id 사용)
      const { error: notificationError } = await supabase
        .from('notifications')
        .delete()
        .eq('recipient_id', deleteUser.id);

      if (notificationError) {
        console.warn('⚠️ 알림 삭제 중 오류:', notificationError);
      }

      // 1-4. realtime_notifications 삭제
      const { error: realtimeNotifError } = await supabase
        .from('realtime_notifications')
        .delete()
        .eq('recipient_id', deleteUser.id);

      if (realtimeNotifError) {
        console.warn('⚠️ 실시간 알림 삭제 중 오류:', realtimeNotifError);
      }

      // 1-5. 트랜잭션 삭제 (외래키 제약조건 해결)
      const { error: transactionError } = await supabase
        .from('transactions')
        .delete()
        .eq('user_id', deleteUser.id);

      if (transactionError) {
        console.error('❌ 트랜잭션 삭제 중 오류:', transactionError);
        // 트랜잭션 삭제 실패 시 롤백
        setUsers(prevUsers => [...prevUsers, userToDelete]);
        toast.error('회원의 거래 내역 삭제에 실패했습니다.');
        setShowDeleteDialog(true);
        return;
      }

      // 1-6. 게임 기록 삭제
      const { error: gameRecordError } = await supabase
        .from('game_records')
        .delete()
        .eq('user_id', deleteUser.id);

      if (gameRecordError) {
        console.warn('⚠️ 게임 기록 삭제 중 오류:', gameRecordError);
      }

      // 2. 사용자 계정 삭제
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', deleteUser.id);

      if (error) {
        // 에러 발생 시 롤백
        setUsers(prevUsers => [...prevUsers, userToDelete]);
        console.error('❌ 회원 삭제 오류:', error);
        throw error;
      }

      console.log('✅ 회원 삭제 완료:', deleteUser.username);
      toast.success(`회원 ${deleteUser.username}이 삭제되었습니다.`);
      setDeleteUser(null);
      // fetchUsers() 제거 - Realtime subscription이 자동으로 처리
    } catch (error: any) {
      console.error('회원 삭제 실패:', error);
      toast.error(error.message || '회원 삭제에 실패했습니다.');
      setShowDeleteDialog(true); // 에러 발생 시 다시 다이얼로그 표시
    } finally {
      setDeleteLoading(false);
    }
  };

  // 강제 입출금 처리
  const handleForceTransaction = async (data: {
    targetId: string;
    type: 'deposit' | 'withdrawal';
    amount: number;
    memo: string;
  }) => {
    try {
      setProcessingUserId(data.targetId);
      const user = users.find(u => u.id === data.targetId);
      if (!user) {
        return;
      }

      console.log(`💰 강제 ${data.type === 'deposit' ? '입금' : '출금'} 처리 시작:`, user.username, data.amount);

      // ✅ Optimistic Update: UI에 즉시 반영
      const optimisticBalance = data.type === 'deposit' 
        ? (user.balance || 0) + data.amount 
        : (user.balance || 0) - data.amount;
      
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.id === data.targetId 
            ? { ...u, balance: optimisticBalance, updated_at: new Date().toISOString() }
            : u
        )
      );

      // 0. 현재 관리자의 opcode 정보 조회
      if (!authState.user) {
        // 롤백
        setUsers(prevUsers => 
          prevUsers.map(u => 
            u.id === data.targetId 
              ? { ...u, balance: user.balance, updated_at: user.updated_at }
              : u
          )
        );
        return;
      }

      // 관리자 정보 조회 (보유금 검증용)
      const { data: adminPartner, error: adminError } = await supabase
        .from('partners')
        .select('balance, level, nickname, partner_type, invest_balance, oroplay_balance')
        .eq('id', authState.user.id)
        .single();

      if (adminError || !adminPartner) {
        return;
      }

      const isSystemAdmin = adminPartner.level === 1;

      // 입금 시 관리자 보유금 검증 (시스템관리자는 제외)
      if (data.type === 'deposit' && !isSystemAdmin) {
        // Lv2: invest_balance와 oroplay_balance 중 최소값 체크
        if (adminPartner.level === 2) {
          const minBalance = Math.min(adminPartner.invest_balance || 0, adminPartner.oroplay_balance || 0);
          if (minBalance < data.amount) {
            console.error('❌ Lv2 보유금 부족:', { invest: adminPartner.invest_balance, oroplay: adminPartner.oroplay_balance, required: data.amount });
            return;
          }
        }
        // Lv3~7: 단일 balance 체크
        else if (adminPartner.balance < data.amount) {
          console.error('❌ 보유금 부족:', { balance: adminPartner.balance, required: data.amount });
          return;
        }
      }

      const opcodeConfigResult = await getAdminOpcode(authState.user);
      if (!opcodeConfigResult) {
        console.error('❌ API 설정이 없습니다. api_configs 테이블에 invest_opcode, invest_token, invest_secret_key를 설정하세요.');
        return;
      }

      // isMultipleOpcode인 경우 첫 번째 opcode 사용
      const opcodeConfig = isMultipleOpcode(opcodeConfigResult) 
        ? opcodeConfigResult.opcodes[0] 
        : opcodeConfigResult;

      if (!opcodeConfig) {
        return;
      }

      // 1. 외부 API 호출 (Lv1, Lv2는 입출금 모두 건너뜀)
      let apiResult: any = null;
      let actualBalance = user.balance || 0;
      
      // ✅ Lv1, Lv2 → Lv7 입금: 외부 API 호출 없이 내부 거래만
      if ((adminPartner.level === 1 || adminPartner.level === 2) && data.type === 'deposit') {
        console.log('✅ Lv1/Lv2 → Lv7 입금: 외부 API 호출 건너뜀 (내부 거래만, 게임 플레이 시에만 외부 API 차감)');
        // 사용자 잔고는 입금액만큼 증가 (API 호출 없이)
        actualBalance = (user.balance || 0) + data.amount;
      }
      // ✅ Lv1, Lv2 → Lv7 출금: 외부 API 호출 없이 내부 거래만 (강제 입금과 동일)
      else if ((adminPartner.level === 1 || adminPartner.level === 2) && data.type === 'withdrawal') {
        console.log('✅ Lv1/Lv2 → Lv7 출금: 외부 API 호출 건너뜀 (내부 거래만, 게임 종료 시에만 외부 API 회수)');
        // 사용자 잔고는 출금액만큼 감소 (API 호출 없이)
        actualBalance = (user.balance || 0) - data.amount;
      }
      // ✅ Lv3~6 → Lv7: 외부 API 호출
      else {
        apiResult = data.type === 'deposit'
          ? await investApi.depositBalance(
              user.username,
              data.amount,
              opcodeConfig.opcode,
              opcodeConfig.token,
              opcodeConfig.secretKey
            )
          : await investApi.withdrawBalance(
              user.username,
              data.amount,
              opcodeConfig.opcode,
              opcodeConfig.token,
              opcodeConfig.secretKey
            );

        if (!apiResult.success || apiResult.error) {
          console.error(`API ${data.type === 'deposit' ? '입금' : '출금'} 실패:`, apiResult.error);
          return;
        }

        console.log(`✅ API ${data.type === 'deposit' ? '입금' : '출금'} 성공:`, apiResult.data);

        // 2. API 응답에서 실제 잔고 추출
        actualBalance = investApi.extractBalanceFromResponse(apiResult.data, user.username);
        console.log('💰 실제 잔고:', actualBalance);
      }

      // 3. DB에 트랜잭션 기록
      const { error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          partner_id: authState.user?.id,
          transaction_type: data.type === 'deposit' ? 'admin_deposit' : 'admin_withdrawal',
          amount: data.amount,
          status: 'completed',
          processed_by: authState.user?.id,
          memo: data.memo || `[관리자 강제 ${data.type === 'deposit' ? '입금' : '출금'}] ${authState.user?.username}`,
          balance_before: user.balance || 0,
          balance_after: actualBalance,
          external_response: apiResult?.data || null
        });

      if (error) throw error;

      // 4. 사용자 잔고를 API 실제 값으로 동기화
      const { error: balanceError } = await supabase
        .from('users')
        .update({ 
          balance: actualBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (balanceError) throw balanceError;

      // 5. 관리자 보유금 업데이트 및 로그 기록
      // ✅ Lv1: 사용자 입출금은 내부 ��래만 (게임 플레이 시에만 외부 API 호출)
      if (adminPartner.level === 1) {
        console.log('ℹ️ Lv1 → Lv7 입출금은 내부 거래만 (Lv1 api_configs 변동 없음, 게임 플레이 시에만 외부 API 호출)');
      }
      // ✅ Lv2: 입출금 모두 내부 거래만 (입금과 동일 로직)
      else if (adminPartner.level === 2) {
        if (data.type === 'deposit') {
          // ✅ 입금: 내부 거래만 (API 보유금 변동 없음)
          console.log('ℹ️ Lv2 → Lv7 입금은 내부 거래만 (게임 플레이 시에만 외부 API 차감)');
          
          // 로그만 기록 (보유금 변동 없음을 명시)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: authState.user.id,
              balance_before: adminPartner.invest_balance || 0,
              balance_after: adminPartner.invest_balance || 0,
              amount: 0,
              transaction_type: 'internal',
              from_partner_id: authState.user.id,
              to_partner_id: null,
              processed_by: authState.user.id,
              api_type: 'invest',
              memo: `[회원 강제입금 - 내부거래] ${user.username}에게 ${data.amount.toLocaleString()}원 입금 (게임 플레이 시 차감)${data.memo ? `: ${data.memo}` : ''}`
            });

        } else {
          // ✅ 출금: 내부 거래만 (API 보유금 변동 없음, 강제입금과 동일 로직)
          console.log('ℹ️ Lv2 → Lv7 출금은 내부 거래만 (게임 종료 시에만 외부 API 회수)');
          
          // 로그만 기록 (보유금 변동 없음을 명시)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: authState.user.id,
              balance_before: adminPartner.invest_balance || 0,
              balance_after: adminPartner.invest_balance || 0,
              amount: 0,
              transaction_type: 'internal',
              from_partner_id: null,
              to_partner_id: authState.user.id,
              processed_by: authState.user.id,
              api_type: 'invest',
              memo: `[회원 강제출금 - 내부거래] ${user.username}으로부터 ${data.amount.toLocaleString()}원 출금 (게임 종료 시 회수)${data.memo ? `: ${data.memo}` : ''}`
            });

          console.log(`💰 Lv2 보유금 변동 없음 (내부 거래만): Invest(${(adminPartner.invest_balance || 0).toLocaleString()}), OroPlay(${(adminPartner.oroplay_balance || 0).toLocaleString()})`);
        }
      }
      // ✅ Lv3~7: 입출금 모두 내부 거래만 (입금과 동일 로직)
      else {
        if (data.type === 'deposit') {
          // ✅ 입금: 내부 거래만 (관리자 보유금 변동 없음)
          console.log('ℹ️ Lv3~7 → Lv7 입금은 내부 거래만 (게임 플레이 시에만 외부 API 차감)');
          
          // 로그만 기록 (보유금 변동 없음을 명시)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: authState.user.id,
              balance_before: adminPartner.balance,
              balance_after: adminPartner.balance,
              amount: 0,
              transaction_type: 'internal',
              from_partner_id: authState.user.id,
              to_partner_id: null,
              processed_by: authState.user.id,
              memo: `[회원 강제입금 - 내부거래] ${user.username}에게 ${data.amount.toLocaleString()}원 입금 (게임 플레이 시 차감)${data.memo ? `: ${data.memo}` : ''}`
            });

          console.log(`💰 Lv3~7 보유금 변동 없음 (내부 거래만): balance(${adminPartner.balance.toLocaleString()})`);

        } else {
          // ✅ 출금: 내부 거래만 (관리자 보유금 변동 없음, 강제입금과 동일 로직)
          console.log('ℹ️ Lv3~7 → Lv7 출금은 내부 거래만 (게임 종료 시에만 외부 API 회수)');
          
          // 로그만 기록 (보유금 변동 없음을 명시)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: authState.user.id,
              balance_before: adminPartner.balance,
              balance_after: adminPartner.balance,
              amount: 0,
              transaction_type: 'internal',
              from_partner_id: null,
              to_partner_id: authState.user.id,
              processed_by: authState.user.id,
              memo: `[회원 강제출금 - 내부거래] ${user.username}으로부터 ${data.amount.toLocaleString()}원 출금 (게임 종료 시 회수)${data.memo ? `: ${data.memo}` : ''}`
            });

          console.log(`💰 Lv3~7 보유금 변동 없음 (내부 거래만): balance(${adminPartner.balance.toLocaleString()})`);
        }
      }

      // 6. 실시간 업데이트 웹소켓 메시지
      if (connected && sendMessage) {
        sendMessage({
          type: 'user_balance_updated',
          data: {
            userId: user.id,
            amount: data.amount,
            type: data.type
          }
        });

        sendMessage({
          type: 'partner_balance_updated',
          data: {
            partnerId: authState.user.id,
            amount: data.type === 'deposit' ? -data.amount : data.amount,
            type: data.type === 'deposit' ? 'withdrawal' : 'deposit'
          }
        });
      }

      await fetchUsers();
      
      // 성공 메시지
      const actionText = data.type === 'deposit' ? '입금' : '출금';
      toast.success(`${user.username}님에게 ${data.amount.toLocaleString()}원 ${actionText} 완료`);
    } catch (error: any) {
      console.error('강제 입출금 처리 실패:', error);
      toast.error('강제 입출금 처리에 실패했습니다.');
    } finally {
      setProcessingUserId(null);
    }
  };

  // 강제 입출금 버튼 클릭
  const handleDepositClick = (user: any) => {
    setForceTransactionTarget(user);
    setForceTransactionType('deposit');
    setShowForceTransactionModal(true);
  };

  const handleWithdrawClick = (user: any) => {
    setForceTransactionTarget(user);
    setForceTransactionType('withdrawal');
    setShowForceTransactionModal(true);
  };

  // 회원 차단/해제 (팝업 없이 바로 실행) - suspended 상태 사용
  const handleToggleSuspend = async (user: any) => {
    if (!user) return;

    const isSuspended = user.status === 'suspended';
    const newStatus = isSuspended ? 'active' : 'suspended';

    // Optimistic Update: UI를 즉시 업데이트
    const newMemo = isSuspended 
      ? (user.memo || '').replace(/\s*\[차단됨.*?\]/g, '')
      : (user.memo || '') + ` [차단됨: 관리자 조치]`;
    
    setUsers(prevUsers => 
      prevUsers.map(u => 
        u.id === user.id 
          ? { ...u, status: newStatus, memo: newMemo, updated_at: new Date().toISOString() }
          : u
      )
    );

    try {
      setProcessingUserId(user.id);
      console.log('🚫 회원 차단/해제:', user.username, newStatus);

      const { error } = await supabase
        .from('users')
        .update({ 
          status: newStatus,
          memo: newMemo,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        // 에러 발생 시 롤백
        setUsers(prevUsers => 
          prevUsers.map(u => 
            u.id === user.id 
              ? { ...u, status: user.status, memo: user.memo }
              : u
          )
        );
        throw error;
      }

      toast.success(`${user.username}님이 ${isSuspended ? '차단 해제' : '차단'}되었습니다.`);
      // fetchUsers() 제거 - Realtime subscription이 자동으로 처리
    } catch (error: any) {
      console.error('회원 차단/해제 실패:', error);
      toast.error(error.message || '회원 차단/해제에 실패했습니다.');
    } finally {
      setProcessingUserId(null);
    }
  };

  // 블랙리스트 추가/제거 (팝업 없이 바로 실행)
  const handleToggleBlacklist = async (user: any) => {
    if (!user) return;

    const isCurrentlyBlocked = user.status === 'blocked';

    // Optimistic Update: 블랙리스트 추가 시 즉시 리스트에서 제거
    if (!isCurrentlyBlocked) {
      setUsers(prevUsers => prevUsers.filter(u => u.id !== user.id));
    }

    try {
      setProcessingUserId(user.id);
      console.log('🚨 블랙리스트 처리:', user.username);

      if (isCurrentlyBlocked) {
        // 블랙리스트에서 해제
        const { data, error } = await supabase
          .rpc('remove_user_from_blacklist_simple', {
            p_user_id: user.id,
            p_admin_id: authState.user?.id
          });

        if (error) throw error;
        
        const result = Array.isArray(data) ? data[0] : data;
        if (!result.success) {
          throw new Error(result.error);
        }

        toast.success(`${user.username}님이 블랙리스트에서 해제되었습니다.`);
      } else {
        // 블랙리스트에 추가
        const { data, error } = await supabase
          .rpc('add_user_to_blacklist_simple', {
            p_user_id: user.id,
            p_admin_id: authState.user?.id,
            p_reason: '관리자 조치'
          });

        if (error) {
          // 에러 발생 시 롤백 - 다시 리스트에 추가
          setUsers(prevUsers => [...prevUsers, user]);
          throw error;
        }
        
        const result = Array.isArray(data) ? data[0] : data;
        if (!result.success) {
          // 에러 발생 시 롤백
          setUsers(prevUsers => [...prevUsers, user]);
          throw new Error(result.error);
        }

        toast.success(`${user.username}님이 블랙리스트에 추가되었습니다.`);
      }

      // fetchUsers() 제거 - Realtime subscription이 자동으로 처리
    } catch (error: any) {
      console.error('블랙리스트 처리 실패:', error);
      toast.error(error.message || '블랙리스트 처리에 실패했습니다.');
    } finally {
      setProcessingUserId(null);
    }
  };

  // useHierarchicalData가 자동으로 데이터를 로드함

  // WebSocket 메시지 처리
  useEffect(() => {
    if (lastMessage?.type === 'user_registered') {
      console.log('🔔 새 회원 가입 알림 수신');
      fetchUsers();
      toast.info('새로운 회원 가입 신청이 있습니다.');
    }
  }, [lastMessage, fetchUsers]);

  // 필터링된 사용자 목록 (블랙리스트만 제외, 차단은 포함)
  const filteredUsers = users.filter(user => {
    // 블랙리스트(blocked 상태)만 회원 관리 리스트에서 제외
    // 차단(suspended)은 표시됨
    if (user.status === 'blocked') {
      return false;
    }

    const matchesSearch = searchTerm === '' || 
      user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.includes(searchTerm) ||
      user.bank_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.bank_account?.includes(searchTerm) ||
      user.balance?.toString().includes(searchTerm) ||
      user.points?.toString().includes(searchTerm) ||
      user.memo?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // 승인 대기 중인 사용자들
  const pendingUsers = users.filter(user => user.status === 'pending').slice(0, 5);

  // 테이블 컬럼 정의
  const columns = [
    {
      key: "username",
      header: t.userManagement.username,
    },
    {
      key: "nickname", 
      header: t.userManagement.nickname,
    },
    {
      key: "referrer_info",
      header: t.userManagement.affiliation,
      cell: (row: any) => (
        <span className="text-sm text-slate-300">
          {row.referrer ? row.referrer.username : t.userManagement.unassigned}
        </span>
      )
    },
    {
      key: "status",
      header: t.common.status,
      cell: (row: any) => {
        if (row.status === 'active') {
          return (
            <Badge className="px-3 py-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/50 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]">
              ● {t.userManagement.approved}
            </Badge>
          );
        } else if (row.status === 'pending') {
          return (
            <Badge className="px-3 py-1 bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-400 border border-orange-500/50 rounded-full shadow-[0_0_10px_rgba(251,146,60,0.5)]">
              ● {t.userManagement.waiting}
            </Badge>
          );
        } else if (row.status === 'suspended') {
          return (
            <Badge className="px-3 py-1 bg-gradient-to-r from-slate-500/20 to-gray-500/20 text-slate-400 border border-slate-500/50 rounded-full shadow-[0_0_10px_rgba(100,116,139,0.5)]">
              ● {t.userManagement.suspended}
            </Badge>
          );
        } else {
          // blocked 상태는 표시되지 않음 (블랙리스트로 이동)
          return null;
        }
      }
    },
    {
      key: "balance",
      header: t.common.balance,
      cell: (row: any) => (
        <span className="font-mono font-semibold text-cyan-400">
          {(row.balance || 0).toLocaleString()}원
        </span>
      )
    },
    {
      key: "points",
      header: t.userManagement.points,
      cell: (row: any) => (
        <span className="font-mono font-semibold text-purple-400">
          {(row.points || 0).toLocaleString()}P
        </span>
      )
    },
    {
      key: "vip_level",
      header: t.userManagement.level,
      cell: (row: any) => {
        const level = row.vip_level || 0;
        
        if (level === 0) {
          return (
            <Badge className="px-3 py-1 bg-slate-700/50 text-slate-300 border border-slate-600/50 rounded-full">
              ○ Silver
            </Badge>
          );
        } else if (level === 1) {
          return (
            <Badge className="px-3 py-1 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-400 border border-yellow-500/50 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.5)]">
              ⚡ Gold
            </Badge>
          );
        } else if (level === 2) {
          return (
            <Badge className="px-3 py-1 bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-400 border border-orange-500/50 rounded-full shadow-[0_0_10px_rgba(251,146,60,0.5)]">
              ⚡ Bronze
            </Badge>
          );
        } else {
          return (
            <Badge className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border border-purple-500/50 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]">
              ⚡ VIP
            </Badge>
          );
        }
      }
    },
    {
      key: "api_account_status",
      header: t.userManagement.accountStatus,
      cell: (row: any) => {
        const status = row.api_account_status || 'active';
        
        if (status === 'pending') {
          return (
            <div className="flex items-center gap-2">
              <Badge className="px-2 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full text-xs">
                {t.userManagement.creating}
              </Badge>
              <Clock className="h-3 w-3 text-amber-400 animate-pulse" />
            </div>
          );
        } else if (status === 'active') {
          return (
            <Badge className="px-2 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-full text-xs">
              {t.userManagement.normal}
            </Badge>
          );
        } else if (status === 'error') {
          return (
            <div className="flex items-center gap-2">
              <Badge className="px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/50 rounded-full text-xs">
                {t.common.error}
              </Badge>
              <AlertCircle className="h-3 w-3 text-red-400" />
            </div>
          );
        } else if (status === 'partial') {
          return (
            <Badge className="px-2 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/50 rounded-full text-xs">
              {t.userManagement.partialError}
            </Badge>
          );
        }
        
        return <span className="text-slate-500 text-xs">{t.userManagement.unknown}</span>;
      }
    },
    {
      key: "created_at",
      header: t.userManagement.registrationDate,
      cell: (row: any) => {
        const date = new Date(row.created_at);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return (
          <span className="text-slate-400 text-sm">
            {year}. {month}. {day}.
          </span>
        );
      }
    },
    {
      key: "last_login_at",
      header: t.userManagement.lastLogin,
      cell: (row: any) => {
        if (!row.last_login_at) {
          return <span className="text-slate-500 text-sm">{t.userManagement.notLoggedIn}</span>;
        }
        const date = new Date(row.last_login_at);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return (
          <span className="text-slate-400 text-sm">
            {year}. {month}. {day}.
          </span>
        );
      }
    },
    {
      key: "is_online",
      header: t.userManagement.connection,
      cell: (row: any) => {
        if (row.is_online) {
          return (
            <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 animate-pulse">
              ● {t.userManagement.online}
            </Badge>
          );
        } else {
          return (
            <Badge className="bg-slate-600 text-slate-300 border-0">
              ○ {t.userManagement.offline}
            </Badge>
          );
        }
      }
    },
    {
      key: "created_at_old",
      header: "가입일",
      cell: (row: any) => new Date(row.created_at).toLocaleDateString('ko-KR')
    },
    {
      key: "actions",
      header: t.common.actions,
      cell: (row: any) => {
        // 승인 대기 중인 사용자: 승인/거절 버튼만 표시
        if (row.status === 'pending') {
          return (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                onClick={() => approveUser(row.id, row.username)}
                disabled={processingUserId === row.id}
                className="btn-premium-success"
              >
                {processingUserId === row.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    {t.userManagement.approve}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => rejectUser(row.id, row.username)}
                disabled={processingUserId === row.id}
                className="btn-premium-danger"
              >
                {processingUserId === row.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    {t.userManagement.reject}
                  </>
                )}
              </Button>
            </div>
          );
        }

        // 승인된 사용자: 기존 관리 버튼들 표시
        return (
          <div className="flex items-center gap-1">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                setDetailUser(row);
                setShowDetailModal(true);
              }}
              title={t.userManagement.detailInfo}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {/* API 계정 오류 시 재시도 버튼 */}
            {(row.api_account_status === 'error' || row.api_account_status === 'partial') && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={async () => {
                  try {
                    setProcessingUserId(row.id);
                    toast.loading('API 계정 재생성 중...', { id: 'api-retry' });
                    await retryApiAccountCreation(row.id);
                    toast.success('API 계정 재생성 완료', { id: 'api-retry' });
                    fetchUsers(); // 목록 새로고침
                  } catch (error: any) {
                    toast.error('재생성 실패: ' + error.message, { id: 'api-retry' });
                  } finally {
                    setProcessingUserId(null);
                  }
                }}
                disabled={processingUserId === row.id}
                className="text-amber-600 hover:text-amber-700"
                title="API 계정 재시도"
              >
                {processingUserId === row.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleDepositClick(row)}
              className="text-green-600 hover:text-green-700"
              title={t.userManagement.deposit}
            >
              <DollarSign className="h-4 w-4" />
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleWithdrawClick(row)}
              className="text-red-600 hover:text-red-700"
              title={t.userManagement.withdrawal}
            >
              <DollarSign className="h-4 w-4" />
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleToggleSuspend(row)}
              disabled={processingUserId === row.id}
              className={row.status === 'suspended' ? 'text-blue-600 hover:text-blue-700' : 'text-orange-600 hover:text-orange-700'}
              title={row.status === 'suspended' ? t.userManagement.unblock : t.userManagement.block}
            >
              {processingUserId === row.id ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
              ) : row.status === 'suspended' ? (
                <UserCheck className="h-4 w-4" />
              ) : (
                <UserX className="h-4 w-4" />
              )}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleToggleBlacklist(row)}
              disabled={processingUserId === row.id}
              className="text-red-800 hover:text-red-900"
              title={t.userManagement.addToBlacklist}
            >
              {processingUserId === row.id ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
              ) : (
                <UserX className="h-4 w-4" />
              )}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                setDeleteUser(row);
                setShowDeleteDialog(true);
              }}
              className="text-red-600 hover:text-red-700"
              title={t.userManagement.deleteUser}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      }
    }
  ];

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">{t.userManagement.title}</h1>
          <p className="text-sm text-slate-400">
            {t.userManagement.description}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="btn-premium-primary">
          <Plus className="h-4 w-4 mr-2" />
          {t.userManagement.newUser}
        </Button>
      </div>



      {/* 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t.userManagement.totalUsers}
          value={users.length.toLocaleString()}
          subtitle={`↑ ${t.userManagement.registeredUserCount}`}
          icon={Users}
          color="purple"
        />
        
        <MetricCard
          title={t.userManagement.pendingApproval}
          value={pendingUsers.length.toLocaleString()}
          subtitle={t.userManagement.waitingMembers}
          icon={Clock}
          color="amber"
        />
        
        <MetricCard
          title={t.userManagement.activeUsers}
          value={users.filter(u => u.status === 'active').length.toLocaleString()}
          subtitle={t.userManagement.activeMembers}
          icon={UserCheck}
          color="green"
        />
        
        <MetricCard
          title={t.userManagement.onlineUsers}
          value={users.filter(u => u.status === 'active').length.toLocaleString()}
          subtitle={t.userManagement.realtimeUsers}
          icon={Activity}
          color="cyan"
        />
      </div>

      {/* 회원 목록 */}
      <div className="glass-card rounded-xl p-6">
        {/* 헤더 및 통합 필터 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
          <div>
            <h3 className="font-semibold text-slate-100 mb-1">{t.userManagement.userList}</h3>
            <p className="text-sm text-slate-400">
              {t.common.total} {filteredUsers.length.toLocaleString()}{t.userManagement.managingMembers}
            </p>
          </div>
          
          {/* 통합 검색 및 필터 */}
          <div className="flex items-center gap-3">
            <div className="relative w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder={t.userManagement.searchPlaceholder}
                className="pl-10 input-premium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] input-premium">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder={t.userManagement.statusFilter} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                    {t.common.all}
                  </div>
                </SelectItem>
                <SelectItem value="pending">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    {t.userManagement.pendingApproval}
                  </div>
                </SelectItem>
                <SelectItem value="active">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    {t.common.active}
                  </div>
                </SelectItem>
                <SelectItem value="suspended">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                    {t.userManagement.blocked}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* 테이블 (내부 검색 비활성화) */}
        <DataTable
          columns={columns}
          data={filteredUsers}
          searchable={false}
          emptyMessage={searchTerm ? t.userManagement.noSearchResults : t.userManagement.noUsers}
        />
      </div>

      {/* 회원 생성 다이얼로그 - 유리모피즘 효과 적용 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px] bg-slate-900/90 backdrop-blur-md border-slate-700/60 shadow-2xl shadow-blue-500/20">
          <DialogHeader>
            <DialogTitle className="text-xl text-slate-100 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">{t.userManagement.newUser}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {t.userManagement.createUserDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="username" className="text-right text-slate-300">
                {t.userManagement.username}
              </Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                placeholder={t.userManagement.enterUsername}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nickname" className="text-right text-slate-300">
                {t.userManagement.nickname}
              </Label>
              <Input
                id="nickname"
                value={formData.nickname}
                onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                placeholder={t.userManagement.enterNickname}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right text-slate-300">
                {t.common.password}
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-2 focus:ring-blue-500/20"
                placeholder={t.userManagement.enterInitialPassword}
              />
            </div>
            
            {/* Lv1(시스템관리자)이 회원 생성 시 소속 파트너 선택 */}
            {authState.user?.level === 1 && availablePartners.length > 0 && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-slate-300">
                  {t.userManagement.partnerAffiliation}
                </Label>
                <Select 
                  value={formData.selected_referrer_id || undefined} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, selected_referrer_id: value }))}
                >
                  <SelectTrigger className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20">
                    <SelectValue placeholder={t.userManagement.selectPartnerOptional} />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {availablePartners.map(partner => {
                      const levelMap: { [key: number]: string } = {
                        2: t.partnerManagement.headOffice,
                        3: t.partnerManagement.mainOffice,
                        4: t.partnerManagement.subOffice,
                        5: t.partnerManagement.distributor,
                        6: t.partnerManagement.store
                      };
                      const levelText = levelMap[partner.level] || `Level ${partner.level}`;
                      return (
                        <SelectItem 
                          key={partner.id} 
                          value={partner.id} 
                          className="text-slate-200 focus:bg-slate-700 focus:text-slate-100"
                        >
                          {partner.nickname || partner.username} ({levelText})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-slate-300">
                {t.userManagement.bankName}
              </Label>
              <Select 
                value={formData.bank_name || undefined} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, bank_name: value }))}
              >
                <SelectTrigger className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20">
                  <SelectValue placeholder={t.userManagement.selectBank} />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {BANK_LIST.map(bank => (
                    <SelectItem key={bank} value={bank} className="text-slate-200 focus:bg-slate-700 focus:text-slate-100">{bank}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="bank_account" className="text-right text-slate-300">
                {t.userManagement.accountNumber}
              </Label>
              <Input
                id="bank_account"
                value={formData.bank_account}
                onChange={(e) => setFormData(prev => ({ ...prev, bank_account: e.target.value }))}
                className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                placeholder={t.userManagement.enterAccountNumber}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="memo" className="text-right text-slate-300">
                {t.common.note}
              </Label>
              <Input
                id="memo"
                value={formData.memo}
                onChange={(e) => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                placeholder={t.userManagement.adminMemo}
              />
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button 
              type="button" 
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
            >
              {t.common.cancel}
            </Button>
            <Button 
              type="button"
              onClick={createUser}
              className="btn-premium-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t.userManagement.createUser}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 회원 삭제 확인 다이얼로그 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px] bg-slate-900/90 backdrop-blur-md border-slate-700/60 shadow-2xl shadow-red-500/20">
          <DialogHeader>
            <DialogTitle className="text-xl text-slate-100">{t.userManagement.deleteConfirm}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {t.userManagement.deleteConfirmMessagePrefix}{deleteUser?.username}{t.userManagement.deleteConfirmMessageSuffix}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteLoading}
              className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
            >
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleDeleteUser}
              disabled={deleteLoading}
              className="btn-premium-danger"
            >
              {deleteLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t.userManagement.deleting}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t.userManagement.permanentDelete}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 강제 입출금 모달 */}
      <ForceTransactionModal
        open={showForceTransactionModal}
        onOpenChange={(open) => {
          setShowForceTransactionModal(open);
          if (!open) {
            setForceTransactionTarget(null);
          }
        }}
        type={forceTransactionType}
        targetType="user"
        selectedTarget={forceTransactionTarget ? {
          id: forceTransactionTarget.id,
          username: forceTransactionTarget.username,
          nickname: forceTransactionTarget.nickname,
          balance: forceTransactionTarget.balance || 0
        } : null}
        onSubmit={handleForceTransaction}
        onTypeChange={setForceTransactionType}
        currentUserLevel={targetPartnerLevel}
        currentUserBalance={targetPartnerBalance}
      />

      {/* 사용자 상세 분석 모달 */}
      <UserDetailModal
        user={detailUser}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setDetailUser(null);
        }}
      />
    </div>
  );
}

export default UserManagement;