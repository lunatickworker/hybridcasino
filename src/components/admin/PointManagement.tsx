import { useState, useEffect } from "react";
import { Coins, Plus, ArrowRightLeft, Search, TrendingUp, TrendingDown, Gift, Filter, Check, ChevronsUpDown, MinusCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { DataTableLarge } from "../common/DataTableLarge";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogFooter as DialogFooter, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle, AdminDialogTrigger as DialogTrigger } from "./AdminDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useAuth } from "../../hooks/useAuth";
import { useWebSocketContext } from "../../contexts/WebSocketContext";
import { useBalance } from "../../contexts/BalanceContext";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { MetricCard } from "./MetricCard";
import { useLanguage } from "../../contexts/LanguageContext";
import { getAdminOpcode, isMultipleOpcode } from '../../lib/opcodeHelper';
import { withdrawFromAccount } from '../../lib/investApi';

interface PointTransaction {
  id: string;
  user_id: string;
  user_username: string;
  user_nickname: string;
  partner_id: string;
  partner_nickname: string;
  transaction_type: 'earn' | 'use' | 'convert_to_balance' | 'admin_adjustment';
  amount: number;
  points_before: number;
  points_after: number;
  memo: string;
  created_at: string;
}

interface User {
  id: string;
  username: string;
  nickname: string;
  points: number;
  balance: number;
}

export function PointManagement() {
  const { t } = useLanguage();
  const { authState } = useAuth();
  const { connected, sendMessage } = useWebSocketContext();
  const { balance: adminBalance, syncBalance } = useBalance();
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showGiveDialog, setShowGiveDialog] = useState(false);
  const [showRecoverDialog, setShowRecoverDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pointAmount, setPointAmount] = useState("");
  const [recoverAmount, setRecoverAmount] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [recoverUserSearchOpen, setRecoverUserSearchOpen] = useState(false);
  const [convertUserSearchOpen, setConvertUserSearchOpen] = useState(false);

  // 포인트 거래 내역 조회 (referrer_id 기반)
  const fetchPointTransactions = async () => {
    try {
      setLoading(true);
      
      let pointQuery = supabase
        .from('point_transactions')
        .select(`
          *,
          users:user_id (
            username,
            nickname
          ),
          partners:partner_id (
            nickname
          )
        `);

      // ✅ 계층 구조 필터링: 시스템관리자가 아니면 하위 파트너들의 회원까지 포함
      if (authState.user?.level && authState.user.level > 1) {
        // get_hierarchical_partners RPC로 모든 하위 파트너 조회
        const { data: hierarchicalPartners } = await supabase
          .rpc('get_hierarchical_partners', { p_partner_id: authState.user.id });
        
        // ✅ 안전장치: 현재 사용자보다 level이 큰 파트너만 포함 (하위만)
        const childPartnerIds = (hierarchicalPartners || [])
          .filter((p: any) => p.level > authState.user.level)
          .map((p: any) => p.id);
        
        const partnerIds = [authState.user.id, ...childPartnerIds];
        
        // 자신과 하위 파트너들의 회원 조회
        const { data: userList } = await supabase
          .from('users')
          .select('id')
          .in('referrer_id', partnerIds);
        
        const userIds = userList?.map(u => u.id) || [];
        
        if (userIds.length > 0) {
          pointQuery = pointQuery.in('user_id', userIds);
        } else {
          setTransactions([]);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await pointQuery
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const formattedData = data?.map(item => ({
        ...item,
        user_username: item.users?.username || '',
        user_nickname: item.users?.nickname || '',
        partner_nickname: item.partners?.nickname || ''
      })) || [];

      setTransactions(formattedData);
    } catch (error) {
      console.error('포인트 거래 내역 조회 오류:', error);
      toast.error(t.pointManagement.loadTransactionsFailed);
    } finally {
      setLoading(false);
    }
  };

  // 사용자 목록 조회 (referrer_id 기반)
  const fetchUsers = async () => {
    try {
      let userQuery = supabase
        .from('users')
        .select('id, username, nickname, points, balance')
        .eq('status', 'active');

      // ✅ 계층 구조 필터링: 시스템관리자가 아니면 하위 파트너들의 회원까지 포함
      if (authState.user?.level && authState.user.level > 1) {
        // get_hierarchical_partners RPC로 모든 하위 파트너 조회
        const { data: hierarchicalPartners } = await supabase
          .rpc('get_hierarchical_partners', { p_partner_id: authState.user.id });
        
        // ✅ 안전장치: 현재 사용자보다 level이 큰 파트너만 포함 (하위만)
        const childPartnerIds = (hierarchicalPartners || [])
          .filter((p: any) => p.level > authState.user.level)
          .map((p: any) => p.id);
        
        const partnerIds = [authState.user.id, ...childPartnerIds];
        
        // 자신과 하위 파트너들의 회원만 조회
        userQuery = userQuery.in('referrer_id', partnerIds);
      }

      const { data, error } = await userQuery.order('username');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error(t.pointManagement.loadUsersFailed, error);
    }
  };

  // 단축 포인트 금액 설정
  const quickAmounts = [10, 30, 50, 70, 100, 200, 300, 400];
  
  const addQuickAmount = (amount: number) => {
    const currentAmount = parseFloat(pointAmount) || 0;
    setPointAmount((currentAmount + amount).toString());
  };

  const addQuickConvertAmount = (amount: number) => {
    const currentAmount = parseFloat(convertAmount) || 0;
    setConvertAmount((currentAmount + amount).toString());
  };

  const addQuickRecoverAmount = (amount: number) => {
    const currentAmount = parseFloat(recoverAmount) || 0;
    setRecoverAmount((currentAmount + amount).toString());
  };

  const clearPointAmount = () => {
    setPointAmount("");
  };

  const clearRecoverAmount = () => {
    setRecoverAmount("");
  };

  const clearConvertAmount = () => {
    setConvertAmount("");
  };

  // 포인트 지급 (외부 API 호출 없음 - 레벨별 차등 처리)
  const givePoints = async () => {
    try {
      if (!selectedUserId || !pointAmount || parseFloat(pointAmount) <= 0) {
        toast.error(t.pointManagement.enterValidAmount);
        return;
      }

      const amount = parseFloat(pointAmount);
      const adminLevel = authState.user?.level || 1;

      // Lv1은 포인트 지급 불가
      if (adminLevel === 1) {
        toast.error(t.pointManagement.lv1CannotGive);
        return;
      }

      setLoading(true);

      // 현재 관리자 정보 조회
      const { data: adminData, error: adminError } = await supabase
        .from('partners')
        .select('*')
        .eq('id', authState.user?.id)
        .single();

      if (adminError) {
        toast.error(`관리자 정보 조회 실패: ${adminError.message}`);
        setLoading(false);
        return;
      }

      // 현재 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', selectedUserId)
        .single();

      if (userError) {
        toast.error(`사용자 정보 조회 실패: ${userError.message}`);
        setLoading(false);
        return;
      }

      const currentPoints = userData.points || 0;

      console.log('🎁 [포인트 지급] 시작:', {
        adminLevel,
        adminId: authState.user?.id,
        userId: selectedUserId,
        amount
      });

      // 레벨별 처리
      if (adminLevel === 2) {
        // Lv2: 변동 없음 (Lv7 포인트만 증가, 기록만 남김)
        console.log('✅ [Lv2 포인트 지급] Lv7 포인트만 증가');

        // 1. Lv7 포인트 증가
        const newPoints = currentPoints + amount;
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            points: newPoints,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedUserId);

        if (updateError) throw updateError;

        // 2. 포인트 거래 내역 생성 (기록만)
        const { data: transactionData, error: transactionError } = await supabase
          .from('point_transactions')
          .insert([{
            user_id: selectedUserId,
            partner_id: authState.user?.id,
            transaction_type: 'admin_adjustment',
            amount: amount,
            points_before: currentPoints,
            points_after: newPoints,
            memo: memo || '관리자 포인트 지급 (Lv2)'
          }])
          .select()
          .single();

        if (transactionError) {
          console.error('❌ [포인트 지급] 거래내역 생성 실패:', transactionError);
        }

        toast.success(`${amount.toLocaleString()}P가 지급되었습니다. (Lv2는 변동 없음)`, {
          duration: 3000,
          icon: '🎁'
        });

        // 실시간 업데이트
        if (connected && sendMessage) {
          sendMessage({
            type: 'points_given',
            data: { transaction: transactionData }
          });
        }

      } else if (adminLevel === 3) {
        // Lv3: balance 차감 (Lv2와 동일한 로직)
        const currentBalance = adminData.balance || 0;

        if (amount > currentBalance) {
          toast.error(`보유금이 부족합니다. 현재 보유금: ${currentBalance.toLocaleString()}원`);
          setLoading(false);
          return;
        }

        // 1. Lv3 balance 차감
        const newAdminBalance = currentBalance - amount;
        const { error: adminUpdateError } = await supabase
          .from('partners')
          .update({ 
            balance: newAdminBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', authState.user?.id);

        if (adminUpdateError) throw adminUpdateError;

        // 2. Lv7 포인트 증가
        const newPoints = currentPoints + amount;
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            points: newPoints,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedUserId);

        if (updateError) throw updateError;

        // 3. 거래 내역 생성
        const { data: transactionData, error: transactionError } = await supabase
          .from('point_transactions')
          .insert([{
            user_id: selectedUserId,
            partner_id: authState.user?.id,
            transaction_type: 'admin_adjustment',
            amount: amount,
            points_before: currentPoints,
            points_after: newPoints,
            memo: memo || '관리자 포인트 지급 (Lv3)'
          }])
          .select()
          .single();

        if (transactionError) {
          console.error('❌ [포인트 지급] 거래내역 생성 실패:', transactionError);
        }

        // 4. 관리자 보유금 변경 로그 기록
        await supabase.from('partner_balance_logs').insert({
          partner_id: authState.user?.id,
          balance_before: currentBalance,
          balance_after: newAdminBalance,
          amount: -amount,
          transaction_type: 'admin_adjustment',
          processed_by: authState.user?.id,
          memo: `포인트 지급: ${userData.username} (${userData.nickname})`
        });

        toast.success(`${amount.toLocaleString()}P가 지급되었습니다. (보유금: ${newAdminBalance.toLocaleString()}원)`, {
          duration: 3000,
          icon: '🎁'
        });

        // 실시간 업데이트
        if (connected && sendMessage) {
          sendMessage({
            type: 'points_given',
            data: { transaction: transactionData }
          });
        }

      } else {
        // Lv4~6: balance 차감
        const currentBalance = adminData.balance || 0;

        if (amount > currentBalance) {
          toast.error(`보유금이 부족합니다. 현재 보유금: ${currentBalance.toLocaleString()}원`);
          setLoading(false);
          return;
        }

        // 1. 관리자 balance 차감
        const newAdminBalance = currentBalance - amount;
        const { error: adminUpdateError } = await supabase
          .from('partners')
          .update({ 
            balance: newAdminBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', authState.user?.id);

        if (adminUpdateError) throw adminUpdateError;

        // 2. Lv7 포인트 증가
        const newPoints = currentPoints + amount;
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            points: newPoints,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedUserId);

        if (updateError) throw updateError;

        // 3. 거래 내역 생성
        const { data: transactionData, error: transactionError } = await supabase
          .from('point_transactions')
          .insert([{
            user_id: selectedUserId,
            partner_id: authState.user?.id,
            transaction_type: 'admin_adjustment',
            amount: amount,
            points_before: currentPoints,
            points_after: newPoints,
            memo: memo || '관리자 포인트 지급'
          }])
          .select()
          .single();

        if (transactionError) {
          console.error('❌ [포인트 지급] 거래내역 생성 실패:', transactionError);
        }

        // 4. 관리자 보유금 변경 로그 기록
        await supabase.from('partner_balance_logs').insert({
          partner_id: authState.user?.id,
          balance_before: currentBalance,
          balance_after: newAdminBalance,
          amount: -amount,
          transaction_type: 'admin_adjustment',
          processed_by: authState.user?.id,
          memo: `포인트 지급: ${userData.username} (${userData.nickname})`
        });

        toast.success(`${amount.toLocaleString()}P가 지급되었습니다. (보유금: ${newAdminBalance.toLocaleString()}원)`, {
          duration: 3000,
          icon: '🎁'
        });

        // 실시간 업데이트
        if (connected && sendMessage) {
          sendMessage({
            type: 'points_given',
            data: { transaction: transactionData }
          });
        }
      }

      // 2-3. 포인트 거래 내역 생성
      const { data: transactionData, error: transactionError } = await supabase
        .from('point_transactions')
        .insert([{
          user_id: selectedUserId,
          partner_id: authState.user?.id,
          transaction_type: 'admin_adjustment',
          amount: amount,
          points_before: currentPoints,
          points_after: newPoints,
          memo: memo || '관리자 포인트 지급'
        }])
        .select()
        .single();

      if (transactionError) {
        console.error('❌ [포인트 지급] 거래내역 생성 실패:', transactionError);
      }

      toast.success(`${amount.toLocaleString()}P가 지급되었습니다. (보유금: ${newAdminBalance.toLocaleString()}원)`, {
        duration: 3000,
        icon: '🎁'
      });
      
      setShowGiveDialog(false);
      setSelectedUserId("");
      setPointAmount("");
      setMemo("");

      // ✅ 실시간 보유금 업데이트 (BalanceContext - Realtime 자동 감지)
      // partners 테이블 변경으로 인해 BalanceContext가 자동으로 업데이트됨
      console.log('✅ [포인트 지급] 보유금 실시간 업데이트 대기 중...');

      // 실시간 업데이트 (WebSocket)
      if (connected && sendMessage) {
        sendMessage({
          type: 'points_given',
          data: { transaction: transactionData }
        });
      }

      fetchPointTransactions();
      fetchUsers();
    } catch (error) {
      console.error('❌ [포인트 지급] 예상치 못한 오류:', error);
      toast.error('포인트 지급에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 포인트 회수 (외부 API 호출 없음 - 레벨별 차등 처리)
  const recoverPoints = async () => {
    try {
      if (!selectedUserId || !recoverAmount || parseFloat(recoverAmount) <= 0) {
        toast.error('사용자와 유효한 포인트 금액을 입력해주세요.');
        return;
      }

      setLoading(true);
      const amount = parseFloat(recoverAmount);
      const adminLevel = authState.user?.level || 1;

      // 현재 관리자 정보 조회
      const { data: adminData, error: adminError } = await supabase
        .from('partners')
        .select('*')
        .eq('id', authState.user?.id)
        .single();

      if (adminError) {
        toast.error(`관리자 정보 조회 실패: ${adminError.message}`);
        setLoading(false);
        return;
      }

      // 현재 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', selectedUserId)
        .single();

      if (userError) {
        toast.error(`사용자 정보 조회 실패: ${userError.message}`);
        setLoading(false);
        return;
      }

      const currentPoints = userData.points || 0;

      if (currentPoints < amount) {
        toast.error(`회수할 포인트가 부족합니다. 현재 포인트: ${currentPoints.toLocaleString()}P`);
        setLoading(false);
        return;
      }

      console.log('🔄 [포인트 회수] 시작:', {
        adminLevel,
        adminId: authState.user?.id,
        userId: selectedUserId,
        amount
      });

      // 레벨별 처리
      if (adminLevel === 2) {
        // Lv2: Lv7 포인트만 차감, Lv2 변동 없음
        console.log('✅ [Lv2 포인트 회수] Lv7 포인트만 차감, Lv2 변동 없음');

        // 1. Lv7 포인트 차감
        const newPoints = currentPoints - amount;
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            points: newPoints,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedUserId);

        if (updateError) throw updateError;

        // 2. 포인트 거래 내역 생성 (기록만)
        const { data: transactionData, error: transactionError } = await supabase
          .from('point_transactions')
          .insert([{
            user_id: selectedUserId,
            partner_id: authState.user?.id,
            transaction_type: 'use',
            amount: -amount,
            points_before: currentPoints,
            points_after: newPoints,
            memo: memo || '관리자 포인트 회수 (Lv2)'
          }])
          .select()
          .single();

        if (transactionError) {
          console.error('❌ [포인트 회수] 거래내역 생성 실패:', transactionError);
        }

        toast.success(`${amount.toLocaleString()}P가 회수되었습니다. (Lv2는 변동 없음)`, {
          duration: 3000,
          icon: '🔄'
        });

        // 실시간 업데이트
        if (connected && sendMessage) {
          sendMessage({
            type: 'points_recovered',
            data: { transaction: transactionData }
          });
        }

      } else if (adminLevel === 3) {
        // ✅ Lv3: Lv7 포인트 차감, Lv3 GMS 머니(balance) 증가
        console.log('✅ [Lv3 포인트 회수] Lv3 balance 증가');

        const lv3Balance = adminData.balance || 0;

        // 1. Lv7 포인트 차감
        const newPoints = currentPoints - amount;
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            points: newPoints,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedUserId);

        if (updateError) throw updateError;

        // 2. Lv3 balance 증가
        const newBalance = lv3Balance + amount;
        const { error: adminUpdateError } = await supabase
          .from('partners')
          .update({ 
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', authState.user?.id);

        if (adminUpdateError) throw adminUpdateError;

        // 3. 거래 내역 생성
        const { data: transactionData, error: transactionError } = await supabase
          .from('point_transactions')
          .insert([{
            user_id: selectedUserId,
            partner_id: authState.user?.id,
            transaction_type: 'use',
            amount: -amount,
            points_before: currentPoints,
            points_after: newPoints,
            memo: memo || '관리자 포인트 회수 (Lv3)'
          }])
          .select()
          .single();

        if (transactionError) {
          console.error('❌ [포인트 회수] 거래내역 생성 실패:', transactionError);
        }

        // 4. 관리자 보유금 변경 로그 기록
        await supabase.from('partner_balance_logs').insert({
          partner_id: authState.user?.id,
          balance_before: lv3InvestBalance,
          balance_after: newInvestBalance,
          amount: amount,
          transaction_type: 'admin_adjustment',
          processed_by: authState.user?.id,
          memo: `포인트 회수: ${userData.username} (${userData.nickname})`
        });

        toast.success(`${amount.toLocaleString()}P가 회수되었습니다. (Lv3 balance 증가)`, {
          duration: 3000,
          icon: '🔄'
        });

        // 실시간 업데이트
        if (connected && sendMessage) {
          sendMessage({
            type: 'points_recovered',
            data: { transaction: transactionData }
          });
        }

      } else {
        // Lv4~6: Lv7 포인트 차감, 관리자 balance 증가
        const currentBalance = adminData.balance || 0;

        // 1. Lv7 포인트 차감
        const newPoints = currentPoints - amount;
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            points: newPoints,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedUserId);

        if (updateError) throw updateError;

        // 2. 관리자 balance 증가
        const newAdminBalance = currentBalance + amount;
        const { error: adminUpdateError } = await supabase
          .from('partners')
          .update({ 
            balance: newAdminBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', authState.user?.id);

        if (adminUpdateError) throw adminUpdateError;

        // 3. 거래 내역 생성
        const { data: transactionData, error: transactionError } = await supabase
          .from('point_transactions')
          .insert([{
            user_id: selectedUserId,
            partner_id: authState.user?.id,
            transaction_type: 'use',
            amount: -amount,
            points_before: currentPoints,
            points_after: newPoints,
            memo: memo || '관리자 포인트 회수'
          }])
          .select()
          .single();

        if (transactionError) {
          console.error('❌ [포인트 회수] 거래내역 생성 실패:', transactionError);
        }

        // 4. 관리자 보유금 변경 로그 기록
        await supabase.from('partner_balance_logs').insert({
          partner_id: authState.user?.id,
          balance_before: currentBalance,
          balance_after: newAdminBalance,
          amount: amount,
          transaction_type: 'admin_adjustment',
          processed_by: authState.user?.id,
          memo: `포인트 회수: ${userData.username} (${userData.nickname})`
        });

        toast.success(`${amount.toLocaleString()}P가 회수되었습니다. (보유금: ${newAdminBalance.toLocaleString()}원)`, {
          duration: 3000,
          icon: '🔄'
        });

        // 실시간 업데이트
        if (connected && sendMessage) {
          sendMessage({
            type: 'points_recovered',
            data: { transaction: transactionData }
          });
        }
      }

      setShowRecoverDialog(false);
      setSelectedUserId("");
      setRecoverAmount("");
      setMemo("");

      fetchPointTransactions();
      fetchUsers();
    } catch (error) {
      console.error('❌ [포인트 회수] 예상치 못한 오류:', error);
      toast.error('포인트 회수에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Placeholder to be removed - start of old logic
  const _oldRecoverPointsLogic = async () => {
    try {
      // ✅ 1. 외부 API 호출 (출금 1.5) - 사용자의 상위 대본사 opcode 사용
      console.log('🔄 [포인트 회수] 외부 API 호출 시작');
      
      let opcode: string;
      let secretKey: string;
      let apiToken: string;
      let apiUsername: string;

      try {
        // 사용자의 소속 파트너 정보 조회
        if (!userData.referrer_id) {
          throw new Error('사용자의 소속 파트너(referrer_id)가 설정되지 않았습니다.');
        }

        const { data: referrerPartner, error: referrerError } = await supabase
          .from('partners')
          .select('*')
          .eq('id', userData.referrer_id)
          .single();

        if (referrerError || !referrerPartner) {
          throw new Error(`소속 파트너 조회 실패: ${referrerError?.message || '파트너를 찾을 수 없습니다.'}`);
        }

        console.log('✅ [포인트 회수] 소속 파트너 조회:', {
          partner_id: referrerPartner.id,
          partner_username: referrerPartner.username,
          partner_type: referrerPartner.partner_type
        });

        // 소속 파트너 기준으로 상위 대본사 opcode 조회
        const opcodeInfo = await getAdminOpcode(referrerPartner);
        
        if (isMultipleOpcode(opcodeInfo)) {
          if (opcodeInfo.opcodes.length === 0) {
            throw new Error('사용 가능한 OPCODE가 없습니다. 시스템 관리자에게 문의하세요.');
          }
          opcode = opcodeInfo.opcodes[0].opcode;
          secretKey = opcodeInfo.opcodes[0].secretKey;
          apiToken = opcodeInfo.opcodes[0].token;
        } else {
          opcode = opcodeInfo.opcode;
          secretKey = opcodeInfo.secretKey;
          apiToken = opcodeInfo.token;
        }

        // 외부 API 호출 시 사용자의 실제 username 사용
        apiUsername = userData.username.replace(/^btn_/, '');

        console.log('✅ [포인트 회수] API 설정 조회 완료:', {
          opcode: opcode,
          apiUsername: apiUsername
        });
      } catch (err: any) {
        const errorMsg = `상위 대본사 API 설정 조회 실패: ${err.message}`;
        console.error('❌ [포인트 회수]', errorMsg);
        toast.error(errorMsg, { 
          duration: 5000,
          description: 'API 설정을 확인하세요. DB는 업데이트되지 않았습니다.'
        });
        setLoading(false);
        return;
      }

      // 외부 API 출금 호출
      let apiResult;
      try {
        apiResult = await withdrawFromAccount(
          opcode,
          apiUsername,
          apiToken,
          amount,
          secretKey
        );
      } catch (err: any) {
        const errorMsg = `외부 API 호출 실패: ${err.message}`;
        console.error('❌ [포인트 회수]', errorMsg);
        toast.error(errorMsg, {
          duration: 7000,
          description: '네트워크 오류 또는 API 서버 문제입니다. 잠시 후 다시 시도하세요. DB는 업데이트되지 않았습니다.'
        });
        setLoading(false);
        return;
      }

      console.log('📡 [포인트 회수] API 응답:', apiResult);

      // API 응답 에러 체크
      if (apiResult.error) {
        const errorMsg = `외부 API 오류: ${apiResult.error}`;
        console.error('❌ [포인트 회수]', errorMsg);
        toast.error(errorMsg, {
          duration: 7000,
          description: 'API 서버에서 오류가 발생했습니다. 시스템 관리자에게 문의하세요. DB는 업데이트되지 않았습니다.'
        });
        setLoading(false);
        return;
      }

      // data 내부의 에러 메시지 확인
      if (apiResult.data) {
        const responseData = apiResult.data;
        
        if (responseData.RESULT === false) {
          const errorMsg = responseData.DATA?.message || responseData.message || '외부 API 처리 실패';
          console.error('❌ [포인트 회수] API 응답 에러:', errorMsg);
          toast.error(`외부 API 오류: ${errorMsg}`, {
            duration: 7000,
            description: '외부 시스템에서 요청을 거부했습니다. DB는 업데이트되지 않았습니다.'
          });
          setLoading(false);
          return;
        }
        
        if (responseData.is_text && responseData.text_response) {
          const text = responseData.text_response.toLowerCase();
          if (text.includes('error') || text.includes('실패') || text.includes('초과')) {
            console.error('❌ [포인트 회수] API 텍스트 응답 에러:', responseData.text_response);
            toast.error(`외부 API 오류: ${responseData.text_response}`, {
              duration: 7000,
              description: 'DB는 업데이트되지 않았습니다.'
            });
            setLoading(false);
            return;
          }
        }
      }

      console.log('✅ [포인트 회수] 외부 API 성공 - DB 업데이트 시작');

      // ✅ 2. DB 업데이트 (API 성공 후에만)
      const newPoints = currentPoints - amount;

      // 2-1. 사용자 포인트 감소
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          points: newPoints,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedUserId);

      if (updateError) {
        console.error('❌ [포인트 회수] DB 업데이트 실패:', updateError);
        toast.error('DB 업데이트 실패. 외부 API는 성공했지만 내부 DB 동기화에 문제가 발생했습니다. 시스템 관리자에게 문의하세요.', {
          duration: 10000
        });
        setLoading(false);
        return;
      }

      // 2-2. 관리자(파트너) 보유금 증가
      const newAdminBalance = adminBalance + amount;
      
      const { error: adminUpdateError } = await supabase
        .from('partners')
        .update({ 
          balance: newAdminBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', authState.user?.id);

      if (adminUpdateError) {
        console.error('❌ [포인트 회수] 관리자 보유금 업데이트 실패:', adminUpdateError);
        toast.error('관리자 보유금 업데이트 실패. 시스템 관리자에게 문의하세요.');
        setLoading(false);
        return;
      }

      // 관리자 보유금 변경 로그 기록
      await supabase.from('partner_balance_logs').insert({
        partner_id: authState.user?.id,
        balance_before: adminBalance,
        balance_after: newAdminBalance,
        amount: amount,
        transaction_type: 'admin_adjustment',
        processed_by: authState.user?.id,
        memo: `포인트 회수: ${userData.username} (${userData.nickname})`
      });

      // 2-3. 포인트 거래 내역 생성
      const { data: transactionData, error: transactionError } = await supabase
        .from('point_transactions')
        .insert([{
          user_id: selectedUserId,
          partner_id: authState.user?.id,
          transaction_type: 'use',
          amount: amount,
          points_before: currentPoints,
          points_after: newPoints,
          memo: memo || '관리자 포인트 회수'
        }])
        .select()
        .single();

      if (transactionError) {
        console.error('❌ [포인트 회수] 거래내역 생성 실패:', transactionError);
      }

      toast.success(`${amount.toLocaleString()}P가 회수되었습니다. (보유금: ${newAdminBalance.toLocaleString()}원)`, {
        duration: 3000,
        icon: '🔄'
      });
      
      setShowRecoverDialog(false);
      setSelectedUserId("");
      setRecoverAmount("");
      setMemo("");

      // ✅ 실시간 보유금 업데이트 (BalanceContext - Realtime 자동 감지)
      // partners 테이블 변경으로 인해 BalanceContext가 자동으로 업데이트됨
      console.log('✅ [포인트 회수] 보유금 실시간 업데이트 대기 중...');

      // 실시간 업데이트 (WebSocket)
      if (connected && sendMessage) {
        sendMessage({
          type: 'points_recovered',
          data: { transaction: transactionData }
        });
      }

      fetchPointTransactions();
      fetchUsers();
    } catch (error) {
      console.error('❌ [포인트 회수] 예상치 못한 오류:', error);
      toast.error('포인트 회수에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 포인트를 잔고로 전환
  const convertPointsToBalance = async () => {
    try {
      if (!selectedUserId || !convertAmount || parseFloat(convertAmount) <= 0) {
        toast.error('사용자와 유효한 전환 금액을 입력해주세요.');
        return;
      }

      setLoading(true);
      const amount = parseFloat(convertAmount);

      // 현재 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('points, balance')
        .eq('id', selectedUserId)
        .single();

      if (userError) throw userError;

      const currentPoints = userData.points || 0;
      const currentBalance = userData.balance || 0;

      if (currentPoints < amount) {
        toast.error('보유 포인트가 부족합니다.');
        return;
      }

      const newPoints = currentPoints - amount;
      const newBalance = currentBalance + amount;

      // 1. 사용자 정보 업데이트
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          points: newPoints,
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedUserId);

      if (updateError) throw updateError;

      // 2. 포인트 거래 내역 생성
      const { data: transactionData, error: transactionError } = await supabase
        .from('point_transactions')
        .insert([{
          user_id: selectedUserId,
          partner_id: authState.user?.id,
          transaction_type: 'convert_to_balance',
          amount: amount,
          points_before: currentPoints,
          points_after: newPoints,
          memo: memo || '포인트 -> 보유금 전환'
        }])
        .select()
        .single();

      if (transactionError) throw transactionError;

      toast.success(`${amount.toLocaleString()}P가 보유금으로 전환되었습니다.`);
      setShowConvertDialog(false);
      setSelectedUserId("");
      setConvertAmount("");
      setMemo("");

      // 실시간 업데이트
      if (connected && sendMessage) {
        sendMessage({
          type: 'points_converted',
          data: { transaction: transactionData }
        });
      }

      fetchPointTransactions();
      fetchUsers();
    } catch (error) {
      console.error('포인트 전환 오류:', error);
      toast.error('포인트 전환에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 거래 유형 번역 함수 (columns 정의 전에 선언)
  const getTransactionTypeText = (type: string) => {
    const typeMap: Record<string, string> = {
      'earn': t.pointManagement.typeEarn,
      'use': t.pointManagement.typeUse,
      'convert_to_balance': t.pointManagement.typeConvert,
      'admin_adjustment': t.pointManagement.typeAdjustment
    };
    return typeMap[type] || type;
  };

  // 필터링된 거래 내역
  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = transaction.user_username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         transaction.user_nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         transaction.memo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || transaction.transaction_type === typeFilter;
    return matchesSearch && matchesType;
  });

  // 테이블 컬럼 정의
  const columns = [
    {
      key: "user_username",
      header: t.pointManagement.username,
    },
    {
      key: "user_nickname",
      header: t.pointManagement.nickname,
    },
    {
      key: "transaction_type",
      header: t.pointManagement.transactionType,
      cell: (row: PointTransaction) => {
        const type = row.transaction_type;
        
        const badgeStyles = {
          earn: 'px-3 py-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/50 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]',
          use: 'px-3 py-1 bg-gradient-to-r from-rose-500/20 to-red-500/20 text-rose-400 border border-rose-500/50 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]',
          convert_to_balance: 'px-3 py-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 border border-blue-500/50 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]',
          admin_adjustment: 'px-3 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/50 rounded-full shadow-[0_0_10px_rgba(251,146,60,0.5)]'
        };
        
        return (
          <Badge className={badgeStyles[type as keyof typeof badgeStyles]}>
            {getTransactionTypeText(type)}
          </Badge>
        );
      },
    },
    {
      key: "amount",
      header: t.pointManagement.amount,
      cell: (row: PointTransaction) => {
        const amount = row.amount;
        const type = row.transaction_type;
        const isPositive = type === 'earn' || type === 'admin_adjustment';
        return (
          <span className={`font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : '-'}{Math.abs(amount).toLocaleString()}P
          </span>
        );
      },
    },
    {
      key: "points_before",
      header: t.pointManagement.pointsBefore,
      cell: (row: PointTransaction) => (
        <span className="font-mono text-slate-400">
          {row.points_before.toLocaleString()}P
        </span>
      ),
    },
    {
      key: "points_after",
      header: t.pointManagement.changedPoints,
      cell: (row: PointTransaction) => (
        <span className="font-mono font-semibold text-amber-400">
          {row.points_after.toLocaleString()}P
        </span>
      ),
    },
    {
      key: "memo",
      header: t.pointManagement.memo,
      cell: (row: PointTransaction) => (
        <div className="max-w-[200px] truncate text-slate-400" title={row.memo}>
          {row.memo}
        </div>
      ),
    },
    {
      key: "partner_nickname",
      header: t.pointManagement.processor,
      cell: (row: PointTransaction) => (
        <span className="text-cyan-400">{row.partner_nickname}</span>
      ),
    },
    {
      key: "created_at",
      header: t.pointManagement.processTime,
      cell: (row: PointTransaction) => {
        const date = new Date(row.created_at);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return (
          <span className="text-slate-400 text-sm">
            {year}. {month}. {day}. {hours}:{minutes}
          </span>
        );
      },
    },
  ];

  // 통계 계산
  const totalPointsGiven = transactions
    .filter(tx => tx.transaction_type === 'earn' || tx.transaction_type === 'admin_adjustment')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalPointsUsed = transactions
    .filter(tx => tx.transaction_type === 'use' || tx.transaction_type === 'convert_to_balance')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalPointsInSystem = users.reduce((sum, u) => sum + (u.points || 0), 0);

  useEffect(() => {
    fetchPointTransactions();
    fetchUsers();
  }, []);

  if (loading && transactions.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Coins className="h-6 w-6 text-amber-400" />
            {t.pointManagement.title}
          </h1>
          <p className="text-lg text-slate-400">
            {t.pointManagement.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showGiveDialog} onOpenChange={setShowGiveDialog}>
            <DialogTrigger asChild>
              <Button className="btn-premium-warning text-lg px-6 py-3 h-auto">
                <Gift className="h-6 w-6 mr-2" />
                {t.pointManagement.givePoints}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-2xl">
                  <Gift className="h-8 w-8 text-orange-500" />
                  {t.pointManagement.givePointsTitle}
                </DialogTitle>
                <DialogDescription className="text-lg">
                  {t.pointManagement.givePointsDesc}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-4">
                {/* 사용자 검색 */}
                <div className="grid gap-2">
                  <Label htmlFor="user" className="text-lg">{t.pointManagement.user}</Label>
                  <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={userSearchOpen}
                        className="justify-between input-premium h-14 text-lg"
                      >
                        {selectedUserId
                          ? users.find((user) => user.id === selectedUserId)?.username + 
                            " (" + users.find((user) => user.id === selectedUserId)?.nickname + ")" +
                            " - " + (users.find((user) => user.id === selectedUserId)?.points || 0).toLocaleString() + "P"
                          : t.pointManagement.selectUserMemoPlaceholder}
                        <ChevronsUpDown className="ml-2 h-6 w-6 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[480px] p-0 bg-slate-800 border-slate-700">
                      <Command className="bg-slate-800">
                        <CommandInput 
                          placeholder={t.pointManagement.searchUserPlaceholder}
                          className="h-12 text-lg text-slate-100 placeholder:text-slate-500" 
                        />
                        <CommandEmpty className="text-slate-400 py-6 text-center text-lg">
                          {t.pointManagement.userNotFound}
                        </CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {users.map((user) => (
                            <CommandItem
                              key={user.id}
                              value={`${user.username} ${user.nickname}`}
                              onSelect={() => {
                                setSelectedUserId(user.id);
                                setUserSearchOpen(false);
                              }}
                              className="flex items-center justify-between cursor-pointer hover:bg-slate-700/50 text-slate-300 py-3"
                            >
                              <div className="flex items-center gap-2">
                                <Check
                                  className={`mr-2 h-6 w-6 ${
                                    selectedUserId === user.id ? "opacity-100 text-orange-500" : "opacity-0"
                                  }`}
                                />
                                <div>
                                  <div className="font-medium text-slate-100 text-lg">{user.username}</div>
                                  <div className="text-base text-slate-400">{user.nickname}</div>
                                </div>
                              </div>
                              <div className="text-lg">
                                <span className="text-amber-400 font-mono">{user.points.toLocaleString()}P</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* 포인트 입력 */}
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="amount" className="text-lg">{t.pointManagement.points}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearPointAmount}
                      className="h-10 px-3 text-base text-slate-400 hover:text-orange-400 hover:bg-orange-500/10"
                    >
                      {t.pointManagement.deleteAll}
                    </Button>
                  </div>
                  <Input
                    id="amount"
                    type="number"
                    value={pointAmount}
                    onChange={(e) => setPointAmount(e.target.value)}
                    className="input-premium h-14 text-lg"
                    placeholder={t.pointManagement.enterGiveAmount}
                  />
                </div>

                {/* 포인트 단축버튼 */}
                <div className="grid gap-2">
                  <Label className="text-slate-400 text-lg">{t.pointManagement.quickGive}</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {quickAmounts.map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        variant="outline"
                        onClick={() => addQuickAmount(amount)}
                        className="h-12 text-base transition-all bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-orange-500/20 hover:border-orange-500/60 hover:text-orange-400 hover:shadow-[0_0_15px_rgba(251,146,60,0.3)]"
                      >
                        +{amount}P
                      </Button>
                    ))}
                  </div>
                </div>

                {/* 메모 */}
                <div className="grid gap-2">
                  <Label htmlFor="memo" className="text-lg">{t.pointManagement.memo}</Label>
                  <Textarea
                    id="memo"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="input-premium min-h-[120px] text-lg"
                    placeholder={t.pointManagement.giveMemoPlaceholder}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button 
                  type="submit" 
                  onClick={givePoints} 
                  disabled={loading} 
                  className="btn-premium-warning w-full h-14 text-lg"
                >
                  {loading ? t.pointManagement.processing : t.pointManagement.givePointsButton}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showRecoverDialog} onOpenChange={setShowRecoverDialog}>
            <DialogTrigger asChild>
              <Button className="btn-premium-danger text-lg px-6 py-3 h-auto">
                <MinusCircle className="h-6 w-6 mr-2" />
                {t.pointManagement.recoverPoints}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-2xl">
                  <MinusCircle className="h-8 w-8 text-red-500" />
                  {t.pointManagement.recoverPointsTitle}
                </DialogTitle>
                <DialogDescription className="text-lg">
                  {t.pointManagement.recoverPointsDesc}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-4">
                {/* 사용자 검색 */}
                <div className="grid gap-2">
                  <Label htmlFor="recover_user" className="text-lg">{t.pointManagement.user}</Label>
                  <Popover open={recoverUserSearchOpen} onOpenChange={setRecoverUserSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={recoverUserSearchOpen}
                        className="justify-between input-premium h-14 text-lg"
                      >
                        {selectedUserId
                          ? users.find((user) => user.id === selectedUserId)?.username + 
                            " (" + users.find((user) => user.id === selectedUserId)?.nickname + ")" +
                            " - " + (users.find((user) => user.id === selectedUserId)?.points || 0).toLocaleString() + "P"
                          : t.pointManagement.selectUserPlaceholder}
                        <ChevronsUpDown className="ml-2 h-6 w-6 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[480px] p-0 bg-slate-800 border-slate-700">
                      <Command className="bg-slate-800">
                        <CommandInput 
                          placeholder={t.pointManagement.searchUserPlaceholder}
                          className="h-12 text-lg text-slate-100 placeholder:text-slate-500" 
                        />
                        <CommandEmpty className="text-slate-400 py-6 text-center text-lg">
                          {t.pointManagement.userNotFound}
                        </CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {users.filter(u => u.points > 0).map((user) => (
                            <CommandItem
                              key={user.id}
                              value={`${user.username} ${user.nickname}`}
                              onSelect={() => {
                                setSelectedUserId(user.id);
                                setRecoverUserSearchOpen(false);
                              }}
                              className="flex items-center justify-between cursor-pointer hover:bg-slate-700/50 text-slate-300 py-3"
                            >
                              <div className="flex items-center gap-2">
                                <Check
                                  className={`mr-2 h-6 w-6 ${
                                    selectedUserId === user.id ? "opacity-100 text-red-500" : "opacity-0"
                                  }`}
                                />
                                <div>
                                  <div className="font-medium text-slate-100 text-lg">{user.username}</div>
                                  <div className="text-base text-slate-400">{user.nickname}</div>
                                </div>
                              </div>
                              <div className="text-lg">
                                <span className="text-amber-400 font-mono">{user.points.toLocaleString()}P</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* 포인트 입력 */}
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="recover_amount" className="text-lg">{t.pointManagement.recoverAmount}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearRecoverAmount}
                      className="h-10 px-3 text-base text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                    >
                      {t.pointManagement.deleteAll}
                    </Button>
                  </div>
                  <Input
                    id="recover_amount"
                    type="number"
                    value={recoverAmount}
                    onChange={(e) => setRecoverAmount(e.target.value)}
                    className="input-premium h-14 text-lg"
                    placeholder={t.pointManagement.enterRecoverAmount}
                  />
                </div>

                {/* 포인트 단축버튼 */}
                <div className="grid gap-2">
                  <Label className="text-slate-400 text-lg">{t.pointManagement.quickRecover}</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {quickAmounts.map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        variant="outline"
                        onClick={() => addQuickRecoverAmount(amount)}
                        className="h-12 text-base transition-all bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                      >
                        +{amount}P
                      </Button>
                    ))}
                  </div>
                </div>

                {/* 메모 */}
                <div className="grid gap-2">
                  <Label htmlFor="recover_memo" className="text-lg">{t.pointManagement.memo}</Label>
                  <Textarea
                    id="recover_memo"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="input-premium min-h-[120px] text-lg"
                    placeholder={t.pointManagement.recoverMemoPlaceholder}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button 
                  type="submit" 
                  onClick={recoverPoints} 
                  disabled={loading} 
                  className="btn-premium-danger w-full h-14 text-lg"
                >
                  {loading ? t.pointManagement.processing : t.pointManagement.recoverPointsButton}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
            <DialogTrigger asChild>
              <Button className="btn-premium-primary text-lg px-6 py-3 h-auto">
                <ArrowRightLeft className="h-6 w-6 mr-2" />
                {t.pointManagement.convertToBalance}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-2xl">
                  <ArrowRightLeft className="h-8 w-8 text-blue-500" />
                  {t.pointManagement.convertToBalanceTitle}
                </DialogTitle>
                <DialogDescription className="text-lg">
                  {t.pointManagement.convertPointsDesc}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-4">
                {/* 사용자 검색 */}
                <div className="grid gap-2">
                  <Label htmlFor="convert_user" className="text-lg">{t.pointManagement.user}</Label>
                  <Popover open={convertUserSearchOpen} onOpenChange={setConvertUserSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={convertUserSearchOpen}
                        className="justify-between input-premium h-14 text-lg"
                      >
                        {selectedUserId
                          ? users.find((user) => user.id === selectedUserId)?.username + 
                            " (" + users.find((user) => user.id === selectedUserId)?.nickname + ")" +
                            " - " + (users.find((user) => user.id === selectedUserId)?.points || 0).toLocaleString() + "P"
                          : t.pointManagement.selectUserPlaceholder}
                        <ChevronsUpDown className="ml-2 h-6 w-6 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[480px] p-0 bg-slate-800 border-slate-700">
                      <Command className="bg-slate-800">
                        <CommandInput 
                          placeholder={t.pointManagement.searchUserPlaceholder}
                          className="h-12 text-lg text-slate-100 placeholder:text-slate-500" 
                        />
                        <CommandEmpty className="text-slate-400 py-6 text-center text-lg">
                          {t.pointManagement.userNotFound}
                        </CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {users.filter(u => u.points > 0).map((user) => (
                            <CommandItem
                              key={user.id}
                              value={`${user.username} ${user.nickname}`}
                              onSelect={() => {
                                setSelectedUserId(user.id);
                                setConvertUserSearchOpen(false);
                              }}
                              className="flex items-center justify-between cursor-pointer hover:bg-slate-700/50 text-slate-300 py-3"
                            >
                              <div className="flex items-center gap-2">
                                <Check
                                  className={`mr-2 h-6 w-6 ${
                                    selectedUserId === user.id ? "opacity-100 text-blue-500" : "opacity-0"
                                  }`}
                                />
                                <div>
                                  <div className="font-medium text-slate-100 text-lg">{user.username}</div>
                                  <div className="text-base text-slate-400">{user.nickname}</div>
                                </div>
                              </div>
                              <div className="text-lg">
                                <span className="text-amber-400 font-mono">{user.points.toLocaleString()}P</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* 전환금액 입력 */}
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="convert_amount" className="text-lg">{t.pointManagement.convertAmount}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearConvertAmount}
                      className="h-10 px-3 text-base text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"
                    >
                      {t.pointManagement.deleteAll}
                    </Button>
                  </div>
                  <Input
                    id="convert_amount"
                    type="number"
                    value={convertAmount}
                    onChange={(e) => setConvertAmount(e.target.value)}
                    className="input-premium h-14 text-lg"
                    placeholder={t.pointManagement.enterConvertAmount}
                  />
                </div>

                {/* 포인트 단축버튼 */}
                <div className="grid gap-2">
                  <Label className="text-slate-400 text-lg">{t.pointManagement.quickConvert}</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {quickAmounts.map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        variant="outline"
                        onClick={() => addQuickConvertAmount(amount)}
                        className="h-12 text-base transition-all bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-blue-500/20 hover:border-blue-500/60 hover:text-blue-400 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                      >
                        +{amount}P
                      </Button>
                    ))}
                  </div>
                </div>

                {/* 메모 */}
                <div className="grid gap-2">
                  <Label htmlFor="convert_memo" className="text-lg">{t.pointManagement.memo}</Label>
                  <Textarea
                    id="convert_memo"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="input-premium min-h-[120px] text-lg"
                    placeholder={t.pointManagement.convertMemoPlaceholder}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button 
                  type="submit" 
                  onClick={convertPointsToBalance} 
                  disabled={loading}
                  className="btn-premium-primary w-full h-14 text-lg"
                >
                  {loading ? t.pointManagement.processing : t.pointManagement.convertButton}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-5 md:grid-cols-4">
        <MetricCard
          title={t.pointManagement.totalGivenPoints}
          value={`${totalPointsGiven.toLocaleString()}P`}
          subtitle={t.pointManagement.cumulativeGiven}
          icon={TrendingUp}
          color="green"
        />
        
        <MetricCard
          title={t.pointManagement.totalUsedPoints}
          value={`${totalPointsUsed.toLocaleString()}P`}
          subtitle={t.pointManagement.cumulativeUsed}
          icon={TrendingDown}
          color="red"
        />
        
        <MetricCard
          title={t.pointManagement.pointsInSystem}
          value={`${totalPointsInSystem.toLocaleString()}P`}
          subtitle={t.pointManagement.currentHolding}
          icon={Coins}
          color="orange"
        />
        
        <MetricCard
          title={t.pointManagement.netPoints}
          value={`${(totalPointsGiven - totalPointsUsed).toLocaleString()}P`}
          subtitle={t.pointManagement.givenMinusUsed}
          icon={Gift}
          color="purple"
        />
      </div>

      {/* 포인트 거래 내역 */}
      <div className="glass-card rounded-xl p-6">
        {/* 헤더 및 통합 필터 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
          <div>
            <h3 className="font-semibold text-slate-100 mb-1">{t.pointManagement.transactionHistory}</h3>
            <p className="text-sm text-slate-400">
              {t.pointManagement.totalTransactionsCount.replace('{{count}}', filteredTransactions.length.toLocaleString())}
            </p>
          </div>
          
          {/* 통합 검색 및 필터 */}
          <div className="flex items-center gap-3">
            <div className="relative w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder={t.pointManagement.searchMemoPlaceholder}
                className="pl-10 input-premium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] input-premium">
                <SelectValue placeholder={t.pointManagement.typeFilter} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                    {t.pointManagement.allTypes}
                  </div>
                </SelectItem>
                <SelectItem value="earn">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    {t.pointManagement.typeEarn}
                  </div>
                </SelectItem>
                <SelectItem value="use">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    {t.pointManagement.typeUse}
                  </div>
                </SelectItem>
                <SelectItem value="convert_to_balance">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    {t.pointManagement.typeConvert}
                  </div>
                </SelectItem>
                <SelectItem value="admin_adjustment">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    {t.pointManagement.typeAdjustment}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* 테이블 (내부 검색 비활성화) */}
        <DataTableLarge 
          columns={columns} 
          data={filteredTransactions}
          searchable={false}
          loading={loading}
          emptyMessage={searchTerm || typeFilter !== 'all' ? t.pointManagement.noSearchResults : t.pointManagement.noTransactionHistory}
        />
      </div>
    </div>
  );
}

export default PointManagement;