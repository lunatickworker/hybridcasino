import { useState, useEffect } from "react";
import { Plus, Search, Filter, Download, Upload, Edit, Trash2, Eye, DollarSign, UserX, UserCheck, X, Check, Clock, Bell, Users, Activity, RefreshCw, AlertCircle, Info } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { DataTableLarge } from "../common/DataTableLarge";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle, AdminDialogTrigger as DialogTrigger, AdminDialogClose as DialogClose } from "./AdminDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useAuth } from "../../hooks/useAuth";
import { useWebSocketContext } from "../../contexts/WebSocketContext";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { getAdminOpcode, isMultipleOpcode } from "../../lib/opcodeHelper";
import * as investApi from "../../lib/investApi";
import { getOroPlayToken, depositBalance as oroplayDeposit, withdrawBalance as oroplayWithdraw } from "../../lib/oroplayApi";
import { retryApiAccountCreation, createApiAccounts } from "../../lib/apiAccountManager";
import { UserDetailModal } from "./UserDetailModal";
import { MetricCard } from "./MetricCard";
import { ForceTransactionModal } from "./ForceTransactionModal";
import * as bcrypt from 'bcryptjs';
import { 
  useHierarchyAuth, 
  useHierarchicalData, 
  PermissionGate, 
  HierarchyBadge,
  HierarchyLevel 
} from "../common/HierarchyManager";
import { useLanguage } from "../../contexts/LanguageContext";

// 회원 관리 컴포넌트 - 모달 사이즈 50% 증가 적용

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
  const [loading, setLoading] = useState(false); // ⚡ 초기 로딩을 false로 변경
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
  const [availablePartners, setAvailablePartners] = useState<any[]>([]); // 회원 생성 시 선택 가능한 파트너 목록 (Lv1: 전체, Lv2~Lv5: 본인+하위, Lv6: 본인)
  const [currentUserBalance, setCurrentUserBalance] = useState(0); // 현재 관리자의 보유금
  
  // 🆕 3단 필터 state
  const [selectedLevel, setSelectedLevel] = useState<number | ''>(''); // 1단: 권한 레벨
  const [partnerSearchTerm, setPartnerSearchTerm] = useState(''); // 3단: 검색어
  
  // 입출금 대상 사용자의 소속 파트너 보유금 (강제 입출금 모달용)
  const [targetPartnerBalance, setTargetPartnerBalance] = useState(0); // 파트너의 balance
  const [targetPartnerLevel, setTargetPartnerLevel] = useState(0); // 소속 파트너의 레벨
  // ✅ Lv1 참고용 (UI 표시용, 실제 로직에는 사용하지 않음)
  const [targetPartnerInvestBalance, setTargetPartnerInvestBalance] = useState(0);
  const [targetPartnerOroplayBalance, setTargetPartnerOroplayBalance] = useState(0);
  const [targetPartnerFamilyapiBalance, setTargetPartnerFamilyapiBalance] = useState(0);
  
  const [formData, setFormData] = useState({
    username: '',
    nickname: '',
    password: '',
    bank_name: '',
    bank_account: '',
    memo: '',
    selected_referrer_id: '', // 회원 생성 시 소속 파트너 선택 (Lv1~Lv6 모두 사용)
    bulk_mode: false, // 벌크 생성 모드
    bulk_start: '', // 벌크 시작 (예: dev1)
    bulk_end: '', // 벌크 종료 (예: dev40)
    casino_rolling_commission: '', // 카지노 롤링 커미션
    casino_losing_commission: '', // 카지노 루징 커미션
    slot_rolling_commission: '', // 슬롯 롤링 커미션
    slot_losing_commission: '' // 슬롯 루징 커미션
  });

  // ⚡ 최적화된 사용자 목록 조회 (하위 파트너 포함)
  const fetchUsers = async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      // ⚡ 병렬 조회로 최적화
      if (authState.user?.level === 1) {
        // 시스템관리자: 모든 사용자 (limit 제거, 필요시 페이지네이션 추가)
        const [usersResult, partnersResult] = await Promise.all([
          supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500), // ⚡ 초기 로드 속도 향상을 위해 500명으로 제한
          supabase
            .from('partners')
            .select('id, username, level')
        ]);

        if (usersResult.error) throw usersResult.error;

        const partnersMap = new Map(partnersResult.data?.map(p => [p.id, p]) || []);
        const usersWithReferrer = usersResult.data?.map(u => ({
          ...u,
          referrer: u.referrer_id ? partnersMap.get(u.referrer_id) : null
        })) || [];

        // 🔍 DEBUG: last_login_at 데이터 확인 (Lv1)
        console.log('🔍 [UserManagement Lv1] 조회된 사용자 샘플 (최초 3명):', 
          usersWithReferrer.slice(0, 3).map(u => ({
            username: u.username,
            last_login_at: u.last_login_at,
            created_at: u.created_at
          }))
        );

        setUsers(usersWithReferrer);
        return;
      }

      // ⚡ Lv2~Lv6: 재귀 최적화 - WITH RECURSIVE 쿼리 사용 불가하므로 BFS 방식으로 개선
      const getAllDescendants = async (partnerId: string): Promise<string[]> => {
        const queue = [partnerId];
        const visited = new Set<string>([partnerId]);
        const result: string[] = [];

        while (queue.length > 0) {
          const currentBatch = queue.splice(0, queue.length); // 현재 레벨 전체 처리
          
          if (currentBatch.length === 0) break;

          // ⚡ 배치로 한 번에 조회
          const { data: children } = await supabase
            .from('partners')
            .select('id')
            .in('parent_id', currentBatch);

          if (children && children.length > 0) {
            for (const child of children) {
              if (!visited.has(child.id)) {
                visited.add(child.id);
                queue.push(child.id);
                result.push(child.id);
              }
            }
          }
        }

        return result;
      };

      const descendants = await getAllDescendants(authState.user?.id || '');
      const allowedReferrerIds = [authState.user?.id || '', ...descendants];

      // ⚡ 병렬 조회
      const [usersResult, partnersResult] = await Promise.all([
        supabase
          .from('users')
          .select('*')
          .in('referrer_id', allowedReferrerIds)
          .order('created_at', { ascending: false })
          .limit(500), // ⚡ 초기 로드 속도 향상
        supabase
          .from('partners')
          .select('id, username, level')
          .in('id', allowedReferrerIds)
      ]);

      if (usersResult.error) throw usersResult.error;

      const partnersMap = new Map(partnersResult.data?.map(p => [p.id, p]) || []);
      const usersWithReferrer = usersResult.data?.map(u => ({
        ...u,
        referrer: u.referrer_id ? partnersMap.get(u.referrer_id) : null
      })) || [];

      // 🔍 DEBUG: last_login_at 데이터 확인
      console.log('🔍 [UserManagement] 조회된 사용자 샘플 (최초 3명):', 
        usersWithReferrer.slice(0, 3).map(u => ({
          username: u.username,
          last_login_at: u.last_login_at,
          created_at: u.created_at
        }))
      );

      setUsers(usersWithReferrer);
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
        .maybeSingle(); // ⭐ single() → maybeSingle()
      
      if (error) {
        console.error('❌ 현재 사용자 보유금 조회 실패:', error);
        return;
      }

      // ⭐ 데이터가 없으면 조용히 0으로 설정
      if (!data) {
        console.warn('⚠️ partners 데이터 없음 (user.id:', authState.user.id, ')');
        setCurrentUserBalance(0);
        return;
      }
      
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
    // Lv1~Lv6 모두 선택 가능한 파트너 목록 로드
    if (authState.user?.level) {
      loadAvailablePartners();
    }
  }, [authState.user?.id, authState.user?.level]);

  // 모달이 열릴 때 폼 초기화
  useEffect(() => {
    if (showCreateDialog) {
      setFormData({
        username: '',
        nickname: '',
        password: '',
        bank_name: '',
        bank_account: '',
        memo: '',
        selected_referrer_id: authState.user?.id || '',
        bulk_mode: false,
        bulk_start: '',
        bulk_end: '',
        casino_rolling_commission: '',
        casino_losing_commission: '',
        slot_rolling_commission: '',
        slot_losing_commission: ''
      });
    }
  }, [showCreateDialog, authState.user?.id]);

  /**
   * 회원 생성 시 선택 가능한 파트너 목록 로드
   * - Lv1: 모든 파트너
   * - Lv2~Lv5: 본인 포함 + 본인의 모든 하위 조직
   * - Lv6: 본인만 (하위 조직 없음)
   */
  const loadAvailablePartners = async () => {
    try {
      if (!authState.user?.id || !authState.user?.level) return;

      const currentLevel = authState.user.level;

      // Lv1: 모든 파트너 조회
      if (currentLevel === 1) {
        const { data } = await supabase
          .from('partners')
          .select('id, username, nickname, partner_type, level')
          .in('partner_type', ['head_office', 'main_office', 'sub_office', 'distributor', 'store'])
          .eq('status', 'active')
          .order('level', { ascending: true })
          .order('created_at', { ascending: true });

        setAvailablePartners(data || []);
        return;
      }

      // Lv2~Lv5: 본인 + 모든 하위 조직 조회
      if (currentLevel >= 2 && currentLevel <= 5) {
        // 1. 본인 정보 먼저 조회
        const { data: selfData } = await supabase
          .from('partners')
          .select('id, username, nickname, partner_type, level')
          .eq('id', authState.user.id)
          .single();

        if (!selfData) return;

        // 2. 재귀적으로 모든 하위 조직 조회
        const getAllDescendants = async (partnerId: string): Promise<any[]> => {
          const { data: children } = await supabase
            .from('partners')
            .select('id, username, nickname, partner_type, level, parent_id')
            .eq('parent_id', partnerId)
            .eq('status', 'active')
            .order('level', { ascending: true })
            .order('created_at', { ascending: true });

          if (!children || children.length === 0) return [];

          // 각 자식의 하위 조직도 재귀 조회
          const allDescendants = [...children];
          for (const child of children) {
            const grandChildren = await getAllDescendants(child.id);
            allDescendants.push(...grandChildren);
          }

          return allDescendants;
        };

        const descendants = await getAllDescendants(authState.user.id);
        
        // 본인 + 하위 조직 합치기
        const allPartners = [selfData, ...descendants];
        setAvailablePartners(allPartners);
        return;
      }

      // Lv6: 본인만
      if (currentLevel === 6) {
        const { data: selfData } = await supabase
          .from('partners')
          .select('id, username, nickname, partner_type, level')
          .eq('id', authState.user.id)
          .single();

        setAvailablePartners(selfData ? [selfData] : []);
      }
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

  // 강제 입출금 실행자(로그인한 관리자)의 보유금 조회
  useEffect(() => {
    const fetchTargetPartnerBalance = async () => {
      if (!forceTransactionTarget?.id) {
        // 대상이 없으면 초기화
        setTargetPartnerBalance(0);
        setTargetPartnerInvestBalance(0);
        setTargetPartnerOroplayBalance(0);
        setTargetPartnerFamilyapiBalance(0);
        setTargetPartnerLevel(0);
        return;
      }

      try {
        console.log('🔍 [ForceTransaction] 대상 사용자:', {
          id: forceTransactionTarget.id,
          username: forceTransactionTarget.username
        });

        // ✅ 강제 입출금 실행자는 로그인한 관리자이므로 로그인한 관리자의 보유금 조회
        const currentPartnerId = authState.user?.id;
        
        if (!currentPartnerId) {
          console.error('❌ 로그인한 관리자 정보가 없습니다.');
          return;
        }

        // 2. 현재 로그인한 관리자(실행자) 정보 조회
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('balance, level, username, invest_balance, oroplay_balance, familyapi_balance')
          .eq('id', currentPartnerId)
          .single();

        if (partnerError || !partnerData) {
          console.error('❌ 현재 관리자 정보 조회 실패:', partnerError);
          return;
        }

        console.log('💰 [ForceTransaction] 현재 로그인한 관리자(실행자) 보유금 조회:', {
          partnerId: currentPartnerId,
          username: partnerData.username,
          level: partnerData.level,
          balance: partnerData.balance
        });

        setTargetPartnerLevel(partnerData.level);

        // ✅ Lv1의 경우: api_configs에서 실제 보유금 조회
        if (partnerData.level === 1) {
          const { data: apiConfigsData, error: apiConfigsError } = await supabase
            .from('api_configs')
            .select('balance, api_provider')
            .eq('partner_id', currentPartnerId);

          if (!apiConfigsError && apiConfigsData) {
            const investBalance = apiConfigsData.find((c: any) => c.api_provider === 'invest')?.balance || 0;
            const oroplayBalance = apiConfigsData.find((c: any) => c.api_provider === 'oroplay')?.balance || 0;
            setTargetPartnerInvestBalance(investBalance);
            setTargetPartnerOroplayBalance(oroplayBalance);
            console.log('✅ Lv1 현재 관리자 보유금 설정 (api_configs):', {
              invest: investBalance,
              oroplay: oroplayBalance
            });
          } else {
            console.warn('⚠️ Lv1 api_configs 조회 실패:', apiConfigsError);
            setTargetPartnerInvestBalance(0);
            setTargetPartnerOroplayBalance(0);
          }
        }
        // ✅ Lv2의 경우: partners.invest_balance + partners.oroplay_balance + partners.familyapi_balance 사용
        else if (partnerData.level === 2) {
          setTargetPartnerInvestBalance(partnerData.invest_balance || 0);
          setTargetPartnerOroplayBalance(partnerData.oroplay_balance || 0);
          setTargetPartnerFamilyapiBalance(partnerData.familyapi_balance || 0);
          console.log('✅ Lv2 현재 관리자 보유금 설정 (세 개 지갑):', {
            invest_balance: partnerData.invest_balance || 0,
            oroplay_balance: partnerData.oroplay_balance || 0,
            familyapi_balance: partnerData.familyapi_balance || 0
          });
        }
        // ✅ Lv3~7의 경우: partners.balance 사용
        else {
          setTargetPartnerBalance(partnerData.balance || 0);
          console.log('✅ Lv3~7 현재 관리자 보유금 설정:', partnerData.balance || 0);
        }
      } catch (error) {
        console.error('❌ 현재 관리자 보유금 조회 실패:', error);
      }
    };

    fetchTargetPartnerBalance();
  }, [forceTransactionTarget?.id, authState.user?.id]);

  // 벌크 회원 생성 함수
  const createBulkUsers = async (prefix: string, startNum: number, endNum: number, password: string, bulkFormData: any) => {
    setShowCreateDialog(false);
    setFormData({
      username: '',
      nickname: '',
      password: '',
      bank_name: '',
      bank_account: '',
      memo: '',
      selected_referrer_id: '',
      bulk_mode: false,
      bulk_start: '',
      bulk_end: ''
    });
    // 🆕 3단 필터 초기화
    setSelectedLevel('');
    setPartnerSearchTerm('');
    
    setCreateUserLoading(true);
    
    const count = endNum - startNum + 1;
    let successCount = 0;
    let failCount = 0;
    const failedUsers: string[] = [];
    
    toast.loading(`벌크 회원 생성 시작: ${count}개 (${prefix}${startNum} ~ ${prefix}${endNum})`, { id: 'bulk-create' });
    
    try {
      const actualReferrerId = bulkFormData.selected_referrer_id || authState.user?.id;
      
      for (let i = startNum; i <= endNum; i++) {
        const username = `${prefix}${i}`;
        const nickname = bulkFormData.nickname ? `${bulkFormData.nickname}${i}` : username;
        
        try {
          toast.loading(`[${i - startNum + 1}/${count}] ${username} 생성 중...`, { id: 'bulk-create' });
          
          // 중복 체크
          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();
          
          if (existingUser) {
            console.warn(`⚠️ 이미 존재하는 회원: ${username}`);
            failCount++;
            failedUsers.push(`${username} (중복)`);
            continue;
          }
          
          const { data: existingPartner } = await supabase
            .from('partners')
            .select('id')
            .eq('username', username)
            .maybeSingle();
          
          if (existingPartner) {
            console.warn(`⚠️ 파트너로 존재하는 아이디: ${username}`);
            failCount++;
            failedUsers.push(`${username} (파트너 중복)`);
            continue;
          }
          
          // 비밀번호 해싱
          const hashedPassword = await bcrypt.hash(password, 10);
          // 출금 비밀번호 해싱 (기본값: 1234)
          const hashedWithdrawalPassword = await bcrypt.hash('1234', 10);
          
          // DB에 사용자 생성
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
              username,
              nickname,
              password_hash: hashedPassword,
          withdrawal_password: hashedWithdrawalPassword, // ✅ 출금 비밀번호 (기본값: 1234)
          bank_name: bulkFormData.bank_name || null,
              bank_account: bulkFormData.bank_account || null,
              memo: bulkFormData.memo || null,
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
            console.error(`❌ ${username} 생성 실패:`, insertError);
            failCount++;
            failedUsers.push(`${username} (DB 오류)`);
            continue;
          }
          
          // API 계정 생성 (백그라운드)
          createApiAccounts(
            newUser.id,
            username,
            actualReferrerId || '',
            undefined // toastId 없음 (벌크는 하나의 토스트만 사용)
          ).catch(err => {
            console.error(`⚠️ ${username} API 계정 생성 실패:`, err);
          });
          
          successCount++;
          
          // 10개마다 잠시 대기 (API 부하 방지)
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
        } catch (error) {
          console.error(`❌ ${username} 생성 중 오류:`, error);
          failCount++;
          failedUsers.push(`${username} (오류)`);
        }
      }
      
      // 결과 알림
      if (failCount === 0) {
        toast.success(`✅ 벌크 생성 완료! (${successCount}개 성공)`, { id: 'bulk-create', duration: 5000 });
      } else if (successCount === 0) {
        toast.error(`❌ 벌크 생성 실패! (${failCount}개 실패)\n실패: ${failedUsers.join(', ')}`, { id: 'bulk-create', duration: 10000 });
      } else {
        toast.warning(`⚠️ 벌크 생성 완료: 성공 ${successCount}개, 실패 ${failCount}개\n실패: ${failedUsers.join(', ')}`, { id: 'bulk-create', duration: 10000 });
      }
      
      await fetchUsers();
      
    } catch (error: any) {
      console.error('❌ 벌크 생성 전체 오류:', error);
      toast.error(`벌크 생성 오류: ${error.message}`, { id: 'bulk-create' });
    } finally {
      setCreateUserLoading(false);
    }
  };

  // 회원 생성 (단일 또는 벌크)
  const createUser = async () => {
    // 벌크 모드 검증
    if (formData.bulk_mode) {
      if (!formData.bulk_start || !formData.bulk_end || !formData.password) {
        toast.error('벌크 생성: 시작 ID, 종료 ID, 비밀번호는 필수입니다.');
        return;
      }
      
      // 벌크 범위 파싱
      const parseUsername = (str: string) => {
        const match = str.match(/^(.+?)(\d+)$/);
        if (!match) return null;
        return { prefix: match[1], num: parseInt(match[2]) };
      };
      
      const start = parseUsername(formData.bulk_start.trim());
      const end = parseUsername(formData.bulk_end.trim());
      
      if (!start || !end) {
        toast.error('벌크 생성: 올바른 형식이 아닙니다. (예: dev1, dev40)');
        return;
      }
      
      if (start.prefix !== end.prefix) {
        toast.error('벌크 생성: 시작과 종료의 접두사가 일치해야 합니다.');
        return;
      }
      
      if (start.num > end.num) {
        toast.error('벌크 생성: 시작 번호가 종료 번호보다 큽니다.');
        return;
      }
      
      const count = end.num - start.num + 1;
      if (count > 100) {
        toast.error(`벌크 생성: 최대 100개까지만 가능합니다. (현재: ${count}개)`);
        return;
      }
      
      // 벌크 생성 진행
      await createBulkUsers(start.prefix, start.num, end.num, formData.password, formData);
      return;
    }
    
    // 단일 생성 검증
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
      selected_referrer_id: '',
      bulk_mode: false,
      bulk_start: '',
      bulk_end: '',
      casino_rolling_commission: '',
      casino_losing_commission: '',
      slot_rolling_commission: '',
      slot_losing_commission: ''
    });
    // 🆕 3단 필터 초기화
    setSelectedLevel('');
    setPartnerSearchTerm('');

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

      // 실제 referrer_id 결정 (선택한 파트너 또는 현재 사용자)
      const actualReferrerId = userData.selected_referrer_id || authState.user?.id;

      // 비밀번호 해싱
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      // 출금 비밀번호 해싱 (기본값: 1234)
      const hashedWithdrawalPassword = await bcrypt.hash('1234', 10);

      // 1. DB에 사용자 생성 (api_account_status = 'pending')
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          username: userData.username,
          nickname: userData.nickname || userData.username,
          password_hash: hashedPassword,
          withdrawal_password: hashedWithdrawalPassword, // ✅ 출금 비밀번호 (기본값: 1234)
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
          casino_rolling_commission: parseFloat(userData.casino_rolling_commission || '0'),
          casino_losing_commission: parseFloat(userData.casino_losing_commission || '0'),
          slot_rolling_commission: parseFloat(userData.slot_rolling_commission || '0'),
          slot_losing_commission: parseFloat(userData.slot_losing_commission || '0'),
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
      // toast.loading(`[3/5] 외부 API 계정 생성 중... (${userData.username})`, { id: 'create-user' }); // 숨김 처리
      
      // 2. 관리자가 직접 생성하는 경우 바로 API 계정 생성 (승인 과정 없음)
      console.log('🌐 외부 API 계정 생성 시작 (Invest + OroPlay)');
      
      // ✅ actualReferrerId를 전달 (authState.user?.id가 아닌 실제 소속 파트너)
      const apiResult = await createApiAccounts(
        newUser.id,
        userData.username,
        actualReferrerId || '',
        undefined // toastId 전달하지 않음 (토스트 숨김)
      );

      console.log('🔍 API 계정 생성 결과:', apiResult);

      // API 계정 생성 결과 토스트 모두 숨김 처리
      // if (apiResult.status === 'error') {
      //   toast.error(`⚠️ API 계정 생성 실패: ${apiResult.errorMessage}`, { id: 'create-user', duration: 10000 });
      //   console.error('❌ 외부 API 계정 생성 실패:', apiResult.errorMessage);
      // } else if (apiResult.status === 'partial') {
      //   toast.warning(`⚠️ 일부 API만 생성됨 (Invest: ${apiResult.investCreated ? '✅' : '❌'} / OroPlay: ${apiResult.oroplayCreated ? '✅' : '❌'})`, { id: 'create-user', duration: 8000 });
      //   console.warn('⚠️ 부분 성공:', apiResult);
      // } else {
      //   toast.success(`[5/5] ✅ 회원 ${userData.username} 생성 완료! (Invest ✅ / OroPlay ✅)`, { id: 'create-user', duration: 5000 });
      //   console.log('✅ 모든 API 계정 생성 성공');
      // }
      
      // 간단한 성공 메시지만 표시
      toast.success(`✅ 회원 ${userData.username} 생성 완료!`, { id: 'create-user', duration: 3000 });
      
      // 🆕 모달 자동 닫기
      setShowCreateDialog(false);
      
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
      
      // 1-1. 게임 세션 비활성화 (user_sessions 테이블 - DELETE 대신 UPDATE)
      const { error: sessionError } = await supabase
        .from('user_sessions')
        .update({ is_active: false, logout_at: new Date().toISOString() })
        .eq('user_id', deleteUser.id);

      if (sessionError) {
        console.warn('⚠️ 게임 세션 비활성화 중 오류:', sessionError);
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

      // ✅ 사용자의 담당 파트너 (referrer_id) 조회
      const { data: userData, error: userQueryError } = await supabase
        .from('users')
        .select('referrer_id')
        .eq('id', user.id)
        .single();

      if (userQueryError || !userData?.referrer_id) {
        console.error('❌ 사용자의 담당 파트너를 찾을 수 없습니다:', userQueryError);
        toast.error('사용자의 담당 파트너를 찾을 수 없습니다.');
        setUsers(prevUsers => 
          prevUsers.map(u => 
            u.id === data.targetId 
              ? { ...u, balance: user.balance, updated_at: user.updated_at }
              : u
          )
        );
        return;
      }

      const responsiblePartnerId = userData.referrer_id;
      console.log('🔍 사용자의 담당 파트너:', responsiblePartnerId);

      // 담당 파트너 정보 조회
      const { data: responsiblePartner, error: partnerError } = await supabase
        .from('partners')
        .select('balance, level, nickname, username, partner_type')
        .eq('id', responsiblePartnerId)
        .single();

      if (partnerError || !responsiblePartner) {
        console.error('❌ 담당 파트너 정보 조회 실패:', partnerError);
        toast.error('담당 파트너 정보를 조회할 수 없습니다.');
        setUsers(prevUsers => 
          prevUsers.map(u => 
            u.id === data.targetId 
              ? { ...u, balance: user.balance, updated_at: user.updated_at }
              : u
          )
        );
        return;
      }

      console.log('💼 담당 파트너 정보:', {
        id: responsiblePartnerId,
        username: responsiblePartner.username,
        level: responsiblePartner.level,
        balance: responsiblePartner.balance
      });

      // 관리자 정보 조회 (현재 작업자)
      const { data: adminPartner, error: adminError } = await supabase
        .from('partners')
        .select('balance, level, nickname, partner_type, invest_balance, oroplay_balance, familyapi_balance, honorapi_balance, username')
        .eq('id', authState.user.id)
        .single();

      if (adminError || !adminPartner) {
        setUsers(prevUsers => 
          prevUsers.map(u => 
            u.id === data.targetId 
              ? { ...u, balance: user.balance, updated_at: user.updated_at }
              : u
          )
        );
        return;
      }

      const isSystemAdmin = adminPartner.level === 1;

      // ✅ 입금 시 실행자 보유금 검증 (Lv3~6만, Lv2는 제외)
      if (data.type === 'deposit' && adminPartner.level >= 3 && adminPartner.level <= 6) {
        console.log('💰 [입금] 실행자 보유금 검증 시작 (Lv3~6만)');
        
        const adminBalance = adminPartner.balance || 0;
        console.log(`💰 Lv${adminPartner.level} 실행자 보유금 (GMS 머니): ${adminBalance.toLocaleString()}`);
        
        if (adminBalance < data.amount) {
          console.error('❌ 실행자 보유금 부족:', { 
            level: adminPartner.level,
            balance: adminBalance, 
            required: data.amount 
          });
          toast.error(`보유금이 부족합니다. (현재: ${adminBalance.toLocaleString()}원, 필요: ${data.amount.toLocaleString()}원)`);
          setUsers(prevUsers => 
            prevUsers.map(u => 
              u.id === data.targetId 
                ? { ...u, balance: user.balance, updated_at: user.updated_at }
                : u
            )
          );
          return;
        }
        
        console.log('✅ 실행자 보유금 검증 통과');
      }
      
      // ✅ Lv2는 보유금 검증 건너뜀 (4초마다 API 동기화로 관리)
      if (data.type === 'deposit' && adminPartner.level === 2) {
        console.log('💰 [입금] Lv2는 보유금 검증 건너뜀 (API 동기화로 관리)');
      }

      // 1. 사용자 잔고 계산 (모든 레벨에서 API 호출 없이 내부 거래���)
      let actualBalance = user.balance || 0;
      
      console.log(`Lv${adminPartner.level} 내부 거래 (GMS 머니)`);
      
      // 사용자 잔고 계산 (API 호출 없이)
      actualBalance = data.type === 'deposit'
        ? (user.balance || 0) + data.amount
        : (user.balance || 0) - data.amount;

      // 2. DB에 트랜잭션 기록
      const { error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          partner_id: responsiblePartnerId, // ✅ 담당 파트너 ID (referrer_id)로 수정
          transaction_type: data.type === 'deposit' ? 'admin_deposit' : 'admin_withdrawal',
          amount: data.amount,
          status: 'completed',
          processed_by: authState.user?.id,
          memo: data.memo || `[관리자 강제 ${data.type === 'deposit' ? '입금' : '출금'}] ${authState.user?.username}`,
          balance_before: user.balance || 0,
          balance_after: actualBalance,
          // ✅ from_partner_id / to_partner_id 추가
          from_partner_id: data.type === 'deposit' ? authState.user.id : responsiblePartnerId,
          to_partner_id: data.type === 'deposit' ? responsiblePartnerId : authState.user.id
        });

      if (error) throw error;

      // 3. 사용자 잔고 동기화
      const { error: balanceError } = await supabase
        .from('users')
        .update({ 
          balance: actualBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (balanceError) throw balanceError;

      // 4. 담당 파트너와 실행자 로그 기록
      
      // ✅ 4-1. 담당 파트너 (referrer_id) 로그만 기록 (balance 변경 없음)
      console.log(`💼 담당 파트너 Lv${responsiblePartner.level} 로그 기록 시작`);
      
      const responsibleBalance = responsiblePartner.balance || 0;
      
      if (data.type === 'deposit') {
        // 로그 기록 (담당 파트너 확인용, balance 변경 없음)
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: responsiblePartnerId,
            balance_before: responsibleBalance,
            balance_after: responsibleBalance,
            amount: 0,
            transaction_type: 'user_deposit',
            from_partner_id: authState.user.id,
            to_partner_id: null,
            processed_by: authState.user.id,
            memo: data.memo || null  // ✅ 사용자 입력 메모만 저장
          });

        console.log(`✅ 담당 파트너 Lv${responsiblePartner.level} 로그 기록 완료 (balance 변경 없음)`);

      } else {
        // 로그 기록 (담당 파트너 확인용, balance 변경 없음)
        await supabase
          .from('partner_balance_logs')
          .insert({
            partner_id: responsiblePartnerId,
            balance_before: responsibleBalance,
            balance_after: responsibleBalance,
            amount: 0,
            transaction_type: 'user_withdrawal',
            from_partner_id: null,
            to_partner_id: authState.user.id,
            processed_by: authState.user.id,
            memo: data.memo || null  // ✅ 사용자 입력 메모만 저장
          });

        console.log(`✅ 담당 파트너 Lv${responsiblePartner.level} 로그 기록 완료 (balance 변경 없음)`);
      }

      // ✅ 4-2. 실행자 (adminPartner) 처리
      
      // Lv2: 로그만 기록 (balance 변동 없음, 외부 API 동기화)
      if (adminPartner.level === 2) {
        console.log(`💼 실행자 Lv2 로그 기록 시작 (balance 변동 없음)`);
        
        const currentBalance = adminPartner.balance || 0;
        
        if (data.type === 'deposit') {
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: authState.user.id,
              balance_before: currentBalance,
              balance_after: currentBalance,
              amount: 0,
              transaction_type: 'user_deposit',
              from_partner_id: authState.user.id,
              to_partner_id: responsiblePartnerId,
              processed_by: authState.user.id,
              memo: data.memo || null  // ✅ 사용자 입력 메모만 저장
            });

          console.log(`✅ 실행자 Lv2 로그 기록 완료 (balance 변동 없음)`);
        } else {
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: authState.user.id,
              balance_before: currentBalance,
              balance_after: currentBalance,
              amount: 0,
              transaction_type: 'user_withdrawal',
              from_partner_id: responsiblePartnerId,
              to_partner_id: authState.user.id,
              processed_by: authState.user.id,
              memo: data.memo || null  // ✅ 사용자 입력 메모만 저장
            });

          console.log(`✅ 실행자 Lv2 로그 기록 완료 (balance 변동 없음)`);
        }
      }
      
      // Lv3~6: balance 증감 (GMS 머니)
      if (adminPartner.level >= 3 && adminPartner.level <= 6) {
        console.log(`💼 실행자 Lv${adminPartner.level} 보유금 증감 시작 (GMS 머니)`);
        
        if (data.type === 'deposit') {
          // ✅ 입금: 실행자 보유금 차감
          const currentBalance = adminPartner.balance || 0;
          const newBalance = currentBalance - data.amount;
          console.log(`💰 실행자 Lv${adminPartner.level} 입금: balance 차감 ${currentBalance.toLocaleString()} → ${newBalance.toLocaleString()}`);
          
          // 실행자 balance 업데이트
          const { error: updateError } = await supabase
            .from('partners')
            .update({ balance: newBalance })
            .eq('id', authState.user.id);

          if (updateError) {
            console.error('❌ 실행자 balance 업데이트 실패:', updateError);
            throw updateError;
          }

          // 로그 기록 (실행자에게 기록)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: authState.user.id,
              balance_before: currentBalance,
              balance_after: newBalance,
              amount: -data.amount,
              transaction_type: 'user_deposit',
              from_partner_id: authState.user.id,
              to_partner_id: responsiblePartnerId,
              processed_by: authState.user.id,
              memo: data.memo || null  // ✅ 사용자 입력 메모만 저장
            });

          console.log(`✅ 실행자 Lv${adminPartner.level} balance 차감 완료: ${currentBalance.toLocaleString()} → ${newBalance.toLocaleString()}`);

        } else {
          // ✅ 출금: 실행자 보유금 증가
          const currentBalance = adminPartner.balance || 0;
          const newBalance = currentBalance + data.amount;
          console.log(`💰 실행자 Lv${adminPartner.level} 출금: balance 증가 ${currentBalance.toLocaleString()} → ${newBalance.toLocaleString()}`);
          
          // 실행자 balance 업데이트
          const { error: updateError } = await supabase
            .from('partners')
            .update({ balance: newBalance })
            .eq('id', authState.user.id);

          if (updateError) {
            console.error('❌ 실행자 balance 업데이트 실패:', updateError);
            throw updateError;
          }

          // 로그 기록 (실행자에게 기록)
          await supabase
            .from('partner_balance_logs')
            .insert({
              partner_id: authState.user.id,
              balance_before: currentBalance,
              balance_after: newBalance,
              amount: data.amount,
              transaction_type: 'user_withdrawal',
              from_partner_id: responsiblePartnerId,
              to_partner_id: authState.user.id,
              processed_by: authState.user.id,
              memo: data.memo || null  // ✅ 사용자 입력 메모만 저장
            });

          console.log(`✅ 실행자 Lv${adminPartner.level} balance 증가 완료: ${currentBalance.toLocaleString()} → ${newBalance.toLocaleString()}`);
        }
      }

      // 5. 실시간 업데이트 웹소켓 메시지
      if (connected && sendMessage) {
        sendMessage('user_balance_updated', {
          userId: user.id,
          amount: data.amount,
          type: data.type
        });

        // 실행자 balance 업데이트 메시지 (Lv3~Lv6만, Lv2는 제외)
        if (adminPartner.level >= 3 && adminPartner.level <= 6) {
          sendMessage('partner_balance_updated', {
            partnerId: authState.user.id,
            amount: data.type === 'deposit' ? -data.amount : data.amount,
            type: data.type === 'deposit' ? 'withdrawal' : 'deposit'
          });
        }
      }

      // ✅ Realtime 구독이 자동으로 처리하므로 fetchUsers() 제거
      // ✅ BalanceContext의 Realtime 구독이 자동으로 처리하므로 syncBalance() 제거
      
      // 성공 메시지
      const actionText = data.type === 'deposit' ? '입금' : '출금';
      toast.success(`${user.username}님에게 ${data.amount.toLocaleString()}원 ${actionText} 완료`);
    } catch (error: any) {
      // 롤백: Optimistic Update 되돌리기
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.id === data.targetId 
            ? { ...u, balance: user.balance, updated_at: user.updated_at }
            : u
        )
      );
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
        <span className="text-slate-300">
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
            <Badge className="px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/50 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]">
              ● {t.userManagement.approved}
            </Badge>
          );
        } else if (row.status === 'pending') {
          return (
            <Badge className="px-4 py-2 bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-400 border border-orange-500/50 rounded-full shadow-[0_0_10px_rgba(251,146,60,0.5)]">
              ● {t.userManagement.waiting}
            </Badge>
          );
        } else if (row.status === 'suspended') {
          return (
            <Badge className="px-4 py-2 bg-gradient-to-r from-slate-500/20 to-gray-500/20 text-slate-400 border border-slate-500/50 rounded-full shadow-[0_0_10px_rgba(100,116,139,0.5)]">
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
      cell: (row: any) => {
        const casinoPoints = row.casino_rolling_points || 0;
        const slotPoints = row.slot_rolling_points || 0;
        const totalPoints = casinoPoints + slotPoints;
        
        return (
          <Popover>
            <PopoverTrigger asChild>
              <button className="font-mono font-semibold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer">
                {totalPoints.toLocaleString()}P
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 glass-card border-purple-500/30 p-4">
              <div className="space-y-3">
                <h4 className="text-base font-semibold text-purple-300 mb-3 pb-2 border-b border-purple-500/30">포인트 상세</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">🎰 카지노 롤링</span>
                    <span className="font-mono text-base font-semibold text-purple-400">
                      {casinoPoints.toLocaleString()}P
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">🎮 슬롯 롤링</span>
                    <span className="font-mono text-base font-semibold text-pink-400">
                      {slotPoints.toLocaleString()}P
                    </span>
                  </div>
                  <div className="pt-2 mt-2 border-t border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold text-white">전체 합산</span>
                      <span className="font-mono text-lg font-bold text-purple-400">
                        {totalPoints.toLocaleString()}P
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        );
      }
    },
    {
      key: "vip_level",
      header: t.userManagement.level,
      cell: (row: any) => {
        const level = row.vip_level || 0;
        
        if (level === 0) {
          return (
            <Badge className="px-4 py-2 bg-slate-700/50 text-slate-300 border border-slate-600/50 rounded-full">
              ○ Silver
            </Badge>
          );
        } else if (level === 1) {
          return (
            <Badge className="px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-400 border border-yellow-500/50 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.5)]">
              ⚡ Gold
            </Badge>
          );
        } else if (level === 2) {
          return (
            <Badge className="px-4 py-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-400 border border-orange-500/50 rounded-full shadow-[0_0_10px_rgba(251,146,60,0.5)]">
              ⚡ Bronze
            </Badge>
          );
        } else {
          return (
            <Badge className="px-4 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border border-purple-500/50 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]">
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
              <Badge className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full">
                {t.userManagement.creating}
              </Badge>
              <Clock className="h-5 w-5 text-amber-400 animate-pulse" />
            </div>
          );
        } else if (status === 'active') {
          return (
            <Badge className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-full">
              {t.userManagement.normal}
            </Badge>
          );
        } else if (status === 'error') {
          return (
            <div className="flex items-center gap-2">
              <Badge className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/50 rounded-full">
                {t.common.error}
              </Badge>
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
          );
        } else if (status === 'partial') {
          return (
            <Badge className="px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/50 rounded-full">
              {t.userManagement.partialError}
            </Badge>
          );
        }
        
        return <span className="text-slate-500">{t.userManagement.unknown}</span>;
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
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return (
          <span className="text-slate-400">
            {year}. {month}. {day}. {hours}:{minutes}:{seconds}
          </span>
        );
      }
    },
    {
      key: "last_login_at",
      header: t.userManagement.lastLogin,
      cell: (row: any) => {
        if (!row.last_login_at) {
          return <span className="text-slate-500">{t.userManagement.notLoggedIn}</span>;
        }
        const date = new Date(row.last_login_at);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return (
          <span className="text-slate-400">
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
            <Badge className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 animate-pulse">
              ● {t.userManagement.online}
            </Badge>
          );
        } else {
          return (
            <Badge className="px-4 py-2 bg-slate-600 text-slate-300 border-0">
              ○ {t.userManagement.offline}
            </Badge>
          );
        }
      }
    },
    {
      key: "actions",
      header: t.common.actions,
      cell: (row: any) => {
        // 승인 대기 중인 사용자: 승인/거절 버튼만 표시
        if (row.status === 'pending') {
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => approveUser(row.id, row.username)}
                disabled={processingUserId === row.id}
                className="btn-premium-success h-10 px-4"
              >
                {processingUserId === row.id ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Check className="h-6 w-6 mr-1" />
                    {t.userManagement.approve}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => rejectUser(row.id, row.username)}
                disabled={processingUserId === row.id}
                className="btn-premium-danger h-10 px-4"
              >
                {processingUserId === row.id ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                ) : (
                  <>
                    <X className="h-6 w-6 mr-1" />
                    {t.userManagement.reject}
                  </>
                )}
              </Button>
            </div>
          );
        }

        // 승인된 사용자: 기존 관리 버튼들 표시
        return (
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                setDetailUser(row);
                setShowDetailModal(true);
              }}
              title={t.userManagement.detailInfo}
              className="h-10 w-10 p-0"
            >
              <Eye className="h-6 w-6" />
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
                className="text-amber-600 hover:text-amber-700 h-10 w-10 p-0"
                title="API 계정 재시도"
              >
                {processingUserId === row.id ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current"></div>
                ) : (
                  <RefreshCw className="h-6 w-6" />
                )}
              </Button>
            )}
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleDepositClick(row)}
              className="text-green-600 hover:text-green-700 h-10 w-10 p-0"
              title={t.userManagement.deposit}
            >
              <DollarSign className="h-6 w-6" />
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleWithdrawClick(row)}
              className="text-red-600 hover:text-red-700 h-10 w-10 p-0"
              title={t.userManagement.withdrawal}
            >
              <DollarSign className="h-6 w-6" />
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleToggleSuspend(row)}
              disabled={processingUserId === row.id}
              className={`h-10 w-10 p-0 ${row.status === 'suspended' ? 'text-blue-600 hover:text-blue-700' : 'text-orange-600 hover:text-orange-700'}`}
              title={row.status === 'suspended' ? t.userManagement.unblock : t.userManagement.block}
            >
              {processingUserId === row.id ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current"></div>
              ) : row.status === 'suspended' ? (
                <UserCheck className="h-6 w-6" />
              ) : (
                <UserX className="h-6 w-6" />
              )}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleToggleBlacklist(row)}
              disabled={processingUserId === row.id}
              className="text-red-800 hover:text-red-900 h-10 w-10 p-0"
              title={t.userManagement.addToBlacklist}
            >
              {processingUserId === row.id ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current"></div>
              ) : (
                <UserX className="h-6 w-6" />
              )}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                setDeleteUser(row);
                setShowDeleteDialog(true);
              }}
              className="text-red-600 hover:text-red-700 h-10 w-10 p-0"
              title={t.userManagement.deleteUser}
            >
              <Trash2 className="h-6 w-6" />
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
          <p className="text-lg text-slate-400">
            {t.userManagement.description}
          </p>
        </div>
        <Button 
          onClick={() => {
            // 모달이 열리기 **전에** 폼 초기화 (브라우저 자동 채우기 방지)
            setFormData({
              username: '',
              nickname: '',
              password: '',
              bank_name: '',
              bank_account: '',
              memo: '',
              selected_referrer_id: authState.user?.id || '',
              bulk_mode: false,
              bulk_start: '',
              bulk_end: '',
              casino_rolling_commission: '',
              casino_losing_commission: '',
              slot_rolling_commission: '',
              slot_losing_commission: ''
            });
            // 약간 기다린 후 모달 열기
            setTimeout(() => setShowCreateDialog(true), 10);
          }} 
          className="btn-premium-primary text-lg px-6 py-3 h-auto"
        >
          <Plus className="h-6 w-6 mr-2" />
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
          value={users.filter(u => u.is_online === true).length.toLocaleString()}
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
            <h3 className="text-2xl font-semibold text-slate-100 mb-2">{t.userManagement.userList}</h3>
            <p className="text-base text-slate-400">
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
        <DataTableLarge
          columns={columns}
          data={filteredUsers}
          searchable={false}
          emptyMessage={searchTerm ? t.userManagement.noSearchResults : t.userManagement.noUsers}
        />
      </div>

      {/* 회원 생성 다이얼로그 - 유리모피즘 효과 적용 */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) {
          // 모달이 닫힐 때 formData 리셋
          setFormData({
            username: '',
            nickname: '',
            password: '',
            bank_name: '',
            bank_account: '',
            memo: '',
            selected_referrer_id: '',
            bulk_mode: false,
            bulk_start: '',
            bulk_end: '',
            casino_rolling_commission: '',
            casino_losing_commission: '',
            slot_rolling_commission: '',
            slot_losing_commission: ''
          });
        }
        setShowCreateDialog(open);
      }}>
        <DialogContent 
          className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto border-slate-700/60 shadow-2xl shadow-blue-500/20"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-10">
            <X className="h-8 w-8 text-slate-400 hover:text-slate-100" />
            <span className="sr-only">닫기</span>
          </DialogClose>
          <DialogHeader>
            <DialogTitle className="text-2xl text-slate-100 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">{t.userManagement.newUser}</DialogTitle>
            <DialogDescription className="text-sm text-slate-400">
              {t.userManagement.createUserDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            {/* 벌크 생성 모드 토글 */}
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-lg border border-blue-500/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <Label htmlFor="bulk_mode" className="text-slate-100 cursor-pointer text-base">
                    벌크 생성 모드
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">여러 회원을 한 번에 생성합니다 (예: dev1 ~ dev40)</p>
                </div>
              </div>
              <Switch
                id="bulk_mode"
                checked={formData.bulk_mode}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, bulk_mode: checked }))}
              />
            </div>

            {/* 기본 정보 섹션 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-700/50">
                <div className="w-1 h-5 bg-gradient-to-b from-blue-400 to-cyan-400 rounded-full"></div>
                <h4 className="text-base font-semibold text-slate-200">기본 정보</h4>
                <span className="text-xs text-red-400">* 필수</span>
              </div>

              {/* 벌크 모드일 때 */}
              {formData.bulk_mode ? (
                <>
                  <div className="space-y-3 bg-slate-800/30 p-3 rounded-lg border border-slate-700/50">
                    <div className="grid grid-cols-4 items-center gap-3">
                      <Label htmlFor="bulk_start" className="text-right text-slate-300 text-sm">
                        시작 ID <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        id="bulk_start"
                        value={formData.bulk_start}
                        onChange={(e) => setFormData(prev => ({ ...prev, bulk_start: e.target.value }))}
                        className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-sm h-9"
                        placeholder="예: dev1"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-3">
                      <Label htmlFor="bulk_end" className="text-right text-slate-300 text-sm">
                        종료 ID <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        id="bulk_end"
                        value={formData.bulk_end}
                        onChange={(e) => setFormData(prev => ({ ...prev, bulk_end: e.target.value }))}
                        className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-sm h-9"
                        placeholder="예: dev40"
                      />
                    </div>
                  </div>
                  
                  {formData.bulk_start && formData.bulk_end && (() => {
                    const parseUsername = (str: string) => {
                      const match = str.match(/^(.+?)(\d+)$/);
                      if (!match) return null;
                      return { prefix: match[1], num: parseInt(match[2]) };
                    };
                    const start = parseUsername(formData.bulk_start.trim());
                    const end = parseUsername(formData.bulk_end.trim());
                    if (start && end && start.prefix === end.prefix) {
                      const count = end.num - start.num + 1;
                      return (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                              <Bell className="h-4 w-4 text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm text-blue-300 font-medium mb-0.5">
                                {formData.bulk_start} ~ {formData.bulk_end}
                              </p>
                              <p className="text-xs text-slate-400">
                                총 <strong className="text-blue-400">{count}개</strong> 회원이 생성됩니다
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  <div className="col-span-4 hidden text-sm text-slate-400 bg-blue-500/10 border border-blue-500/30 rounded p-3">
                  💡 <strong>{formData.bulk_start && formData.bulk_end ? 
                    `${formData.bulk_start} ~ ${formData.bulk_end}` : 
                    '범위를 입력하세요'}</strong> 
                  {formData.bulk_start && formData.bulk_end && (() => {
                    const parseUsername = (str: string) => {
                      const match = str.match(/^(.+?)(\d+)$/);
                      if (!match) return null;
                      return { prefix: match[1], num: parseInt(match[2]) };
                    };
                    const start = parseUsername(formData.bulk_start.trim());
                    const end = parseUsername(formData.bulk_end.trim());
                    if (start && end && start.prefix === end.prefix) {
                      const count = end.num - start.num + 1;
                      return ` (총 ${count}개 회원 생성)`;
                    }
                    return '';
                  })()}
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="nickname" className="text-right text-slate-300 text-sm">
                    닉네임 접두사
                  </Label>
                  <Input
                    id="nickname"
                    value={formData.nickname}
                    onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                    className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-sm h-9"
                    placeholder="비워두면 아이디와 동일"
                  />
                </div>
              </>
            ) : (
              <>
                  {/* 단일 생성 모드일 때 */}
                  <div className="grid grid-cols-4 items-center gap-3">
                    <Label htmlFor="username" className="text-right text-slate-300 text-sm">
                      {t.userManagement.username} <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-sm h-9"
                      placeholder={t.userManagement.enterUsername}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-3">
                    <Label htmlFor="nickname" className="text-right text-slate-300 text-sm">
                      {t.userManagement.nickname}
                    </Label>
            <Input
                    id="nickname"
                    value={formData.nickname}
                    onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                    className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-sm h-9"
                    placeholder={t.userManagement.enterNickname}
                    title="닉네임을 입력해주세요 (미입력 시 아이디와 동일)"
                    autoComplete="off"
                  />
                  </div>
                </>
              )}
              
              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="password" className="text-right text-slate-300 text-sm">
                  {t.common.password} <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-2 focus:ring-blue-500/20 text-sm h-9"
                  placeholder={t.userManagement.enterInitialPassword}
                  title="로그인 비밀번호를 입력해주세요"
                />
              </div>
              
              {/* 출금 비밀번호 안내 */}
              <div className="col-span-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Info className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-blue-300 font-medium mb-0.5">
                      출금 비밀번호 안내
                    </p>
                    <p className="text-xs text-slate-400">
                      회원 생성 시 출금 비밀번호는 자동으로 <strong className="text-blue-400">1234</strong>로 설정됩니다.<br />
                      회원이 마이페이지에서 직접 변경할 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 회원 생성 시 소속 파트너 선택 (3단 필터) */}
            {availablePartners.length > 0 && (() => {
              // 레벨 목록 추출 (중복 제거)
              const uniqueLevels = [...new Set(availablePartners.map(p => p.level))].sort((a, b) => a - b);
              
              // 1단 필터: 선택된 레벨에 해당하는 파트너들
              const levelFilteredPartners = selectedLevel 
                ? availablePartners.filter(p => p.level === selectedLevel)
                : availablePartners;
              
              // 3단 필터: 검색어로 필터링
              const searchFilteredPartners = levelFilteredPartners.filter(p => {
                if (!partnerSearchTerm) return true;
                const searchLower = partnerSearchTerm.toLowerCase();
                return (p.username?.toLowerCase().includes(searchLower) || 
                        p.nickname?.toLowerCase().includes(searchLower));
              });
              
              const levelMap: { [key: number]: string } = {
                2: t.partnerManagement.headOffice,
                3: t.partnerManagement.mainOffice,
                4: t.partnerManagement.subOffice,
                5: t.partnerManagement.distributor,
                6: t.partnerManagement.store
              };
              
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-slate-700/50">
                    <div className="w-1 h-5 bg-gradient-to-b from-purple-400 to-pink-400 rounded-full"></div>
                    <h4 className="text-base font-semibold text-slate-200">조직 설정</h4>
                  </div>
                  
                  {/* 3단 필터 - 한 줄에 3열 */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* 1단: 파트너 권한 드롭다운 */}
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs">파트너 권한</Label>
                      <Select 
                        value={selectedLevel === '' ? 'all' : selectedLevel.toString()} 
                        onValueChange={(value) => {
                          setSelectedLevel(value === 'all' ? '' : parseInt(value));
                          setFormData(prev => ({ ...prev, selected_referrer_id: '' }));
                        }}
                      >
                        <SelectTrigger className="input-premium focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 text-sm h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-sm py-1.5">
                            전체
                          </SelectItem>
                          {uniqueLevels.map(level => (
                            <SelectItem 
                              key={level} 
                              value={level.toString()} 
                              className="text-slate-200 focus:bg-slate-700 text-sm py-1.5"
                            >
                              {levelMap[level] || `Level ${level}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* 2단: 파트너 아이디 드롭다운 */}
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs">파트너 아이디</Label>
                      <Select 
                        value={formData.selected_referrer_id || undefined} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, selected_referrer_id: value }))}
                      >
                        <SelectTrigger className="input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-sm h-9">
                          <SelectValue placeholder="파트너 선택" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 max-h-[200px]">
                          {searchFilteredPartners.length === 0 ? (
                            <div className="text-center py-2 text-slate-400 text-xs">
                              파트너가 없습니다
                            </div>
                          ) : (
                            searchFilteredPartners.map(partner => {
                              const levelText = levelMap[partner.level] || `Level ${partner.level}`;
                              const isSelf = partner.id === authState.user?.id;
                              return (
                                <SelectItem 
                                  key={partner.id} 
                                  value={partner.id} 
                                  className="text-slate-200 focus:bg-slate-700 focus:text-slate-100 text-sm py-1.5"
                                >
                                  {partner.nickname || partner.username} ({levelText}){isSelf ? ' ⭐' : ''}
                                </SelectItem>
                              );
                            })
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* 3단: 검색 필터 */}
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs">검색</Label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                          value={partnerSearchTerm}
                          onChange={(e) => setPartnerSearchTerm(e.target.value)}
                          className="input-premium focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 text-sm h-9 pl-8"
                          placeholder="아이디/닉네임 검색"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* 선택된 파트너 정보 표시 */}
                  {formData.selected_referrer_id && (() => {
                    const selectedPartner = availablePartners.find(p => p.id === formData.selected_referrer_id);
                    if (selectedPartner) {
                      const levelText = levelMap[selectedPartner.level] || `Level ${selectedPartner.level}`;
                      const isSelf = selectedPartner.id === authState.user?.id;
                      return (
                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-2.5">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-purple-400" />
                            <div>
                              <p className="text-sm text-purple-300 font-medium">
                                선택된 파트너: {selectedPartner.nickname || selectedPartner.username}
                              </p>
                              <p className="text-xs text-slate-400">
                                권한: {levelText} {isSelf && '⭐ 본인'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              );
            })()}

            {/* 은행 정보 섹션 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-700/50">
                <div className="w-1 h-5 bg-gradient-to-b from-green-400 to-emerald-400 rounded-full"></div>
                <h4 className="text-base font-semibold text-slate-200">은행 정보</h4>
                <span className="text-xs text-slate-400">선택사항</span>
              </div>
              <div className="grid grid-cols-4 items-center gap-3">
                <Label className="text-right text-slate-300 text-sm">
                  {t.userManagement.bankName}
                </Label>
              <Select 
                value={formData.bank_name || undefined} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, bank_name: value }))}
              >
                <SelectTrigger className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-sm h-9">
                  <SelectValue placeholder={t.userManagement.selectBank} />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-[200px]">
                  {BANK_LIST.map(bank => (
                    <SelectItem key={bank} value={bank} className="text-slate-200 focus:bg-slate-700 focus:text-slate-100 text-sm py-1.5">{bank}</SelectItem>
                  ))}
                </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="bank_account" className="text-right text-slate-300 text-sm">
                  {t.userManagement.accountNumber}
                </Label>
                <Input
                  id="bank_account"
                  value={formData.bank_account}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_account: e.target.value }))}
                  className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-sm h-9"
                  placeholder={t.userManagement.enterAccountNumber}
                />
              </div>
            </div>

            {/* 커미션 설정 섹션 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-700/50">
                <div className="w-1 h-5 bg-gradient-to-b from-purple-400 to-pink-400 rounded-full"></div>
                <h4 className="text-base font-semibold text-slate-200">커미션 설정</h4>
                <span className="text-xs text-slate-400">베팅액의 %</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* 카지노 롤링 */}
                <div className="space-y-1.5">
                  <Label htmlFor="casino_rolling" className="text-slate-300 text-xs">
                    🎰 카지노 롤링 (%)
                  </Label>
                  <Input
                    id="casino_rolling"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.casino_rolling_commission}
                    onChange={(e) => setFormData(prev => ({ ...prev, casino_rolling_commission: e.target.value }))}
                    className="input-premium focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 text-sm h-9"
                    placeholder="0.00"
                  />
                </div>
                {/* 루징 커미션 (통합) */}
                <div className="space-y-1.5">
                  <Label htmlFor="losing_commission" className="text-slate-300 text-xs">
                    💰 루징 (%) - 카지노/슬롯 공통
                  </Label>
                  <Input
                    id="losing_commission"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.casino_losing_commission}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      casino_losing_commission: e.target.value,
                      slot_losing_commission: e.target.value // 슬롯 루징도 동일하게 설정
                    }))}
                    className="input-premium focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 text-sm h-9"
                    placeholder="0.00"
                  />
                </div>
                {/* 슬롯 롤링 */}
                <div className="space-y-1.5">
                  <Label htmlFor="slot_rolling" className="text-slate-300 text-xs">
                    🎮 슬롯 롤링 (%)
                  </Label>
                  <Input
                    id="slot_rolling"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.slot_rolling_commission}
                    onChange={(e) => setFormData(prev => ({ ...prev, slot_rolling_commission: e.target.value }))}
                    className="input-premium focus:border-pink-500/60 focus:ring-2 focus:ring-pink-500/20 text-sm h-9"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* 메모 섹션 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-700/50">
                <div className="w-1 h-5 bg-gradient-to-b from-amber-400 to-orange-400 rounded-full"></div>
                <h4 className="text-base font-semibold text-slate-200">메모</h4>
                <span className="text-xs text-slate-400">선택사항</span>
              </div>
              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="memo" className="text-right text-slate-300 text-sm">
                  {t.common.note}
                </Label>
                <Input
                  id="memo"
                  value={formData.memo}
                  onChange={(e) => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                  className="col-span-3 input-premium focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-sm h-9"
                  placeholder={t.userManagement.adminMemo}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100 text-sm px-4 py-2 h-9"
            >
              {t.common.cancel}
            </Button>
            <Button 
              type="button"
              onClick={createUser}
              className="btn-premium-primary text-sm px-4 py-2 h-9"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {t.userManagement.createUser}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 회원 삭제 확인 다이얼로그 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[600px] bg-slate-900/90 backdrop-blur-md border-slate-700/60 shadow-2xl shadow-red-500/20">
          <DialogHeader>
            <DialogTitle className="text-3xl text-slate-100">{t.userManagement.deleteConfirm}</DialogTitle>
            <DialogDescription className="text-lg text-slate-400">
              {t.userManagement.deleteConfirmMessagePrefix}{deleteUser?.username}{t.userManagement.deleteConfirmMessageSuffix}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteLoading}
              className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100 text-lg px-6 py-3 h-auto"
            >
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleDeleteUser}
              disabled={deleteLoading}
              className="btn-premium-danger text-lg px-6 py-3 h-auto"
            >
              {deleteLoading ? (
                <>
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-2"></div>
                  {t.userManagement.deleting}
                </>
              ) : (
                <>
                  <Trash2 className="h-6 w-6 mr-2" />
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
        currentUserInvestBalance={targetPartnerInvestBalance}
        currentUserOroplayBalance={targetPartnerOroplayBalance}
        currentUserFamilyapiBalance={targetPartnerFamilyapiBalance}
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
