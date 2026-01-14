import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, RefreshCw, Search, ChevronDown, ChevronRight, TrendingUp, Wallet, Coins, ArrowUpRight, ArrowDownRight, Activity, DollarSign, Gift, Percent, Play } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle, AdminDialogFooter as DialogFooter } from "./AdminDialog";
import { cn } from "../../lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { toast } from "sonner";
import { Partner } from "../../types";
import { Lv35Settlement } from "./Lv35Settlement";
import { Lv6Settlement } from "./Lv6Settlement";

interface NewIntegratedSettlementProps { user: Partner; }
interface SettlementRow {
  level: number; levelName: string; id: string; username: string;
  casinoRollingRate: number; slotRollingRate: number; casinoLosingRate: number; slotLosingRate: number;
  balance: number; points: number; onlineDeposit: number; onlineWithdrawal: number;
  manualDeposit: number; manualWithdrawal: number; pointGiven: number; pointRecovered: number;
  depositWithdrawalDiff: number; casinoBet: number; casinoWin: number; slotBet: number; slotWin: number;
  ggr: number; totalRolling: number; totalLosing: number; individualRolling: number; individualLosing: number;
  gongBetAppliedRolling: number; gongBetCutRolling: number;
  casinoGongBetAmount: number; slotGongBetAmount: number; cutRollingAmount: number;
  parentId?: string; hasChildren?: boolean;
}
interface SummaryStats {
  totalBalance: number; totalPoints: number; onlineDeposit: number; onlineWithdrawal: number;
  manualDeposit: number; manualWithdrawal: number; pointGiven: number; pointRecovered: number;
  depositWithdrawalDiff: number; casinoBet: number; casinoWin: number; slotBet: number; slotWin: number;
  ggr: number; totalRolling: number; totalLosing: number; individualRolling: number; individualLosing: number;
}

export function NewIntegratedSettlement({ user }: NewIntegratedSettlementProps) {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [codeSearch, setCodeSearch] = useState("");
  const [partnerLevelFilter, setPartnerLevelFilter] = useState<'all' | 3 | 4 | 5 | 6>('all');
  const [data, setData] = useState<SettlementRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [summary, setSummary] = useState<SummaryStats>({ totalBalance: 0, totalPoints: 0, onlineDeposit: 0, onlineWithdrawal: 0, manualDeposit: 0, manualWithdrawal: 0, pointGiven: 0, pointRecovered: 0, depositWithdrawalDiff: 0, casinoBet: 0, casinoWin: 0, slotBet: 0, slotWin: 0, ggr: 0, totalRolling: 0, totalLosing: 0, individualRolling: 0, individualLosing: 0 });

  // 공베팅 설정 상태
  const [showGongBetModal, setShowGongBetModal] = useState(false);
  const [gongBetEnabled, setGongBetEnabled] = useState(false);
  const [gongBetLevels, setGongBetLevels] = useState<{ [key: number]: boolean }>({
    3: false, 4: false, 5: false, 6: false
  });
  const [gongBetRate, setGongBetRate] = useState<number>(0);

  // 개별 공베팅 토글 상태 - 모달과 동기화
  const [casinoGongBetEnabled, setCasinoGongBetEnabled] = useState(false);
  const [slotGongBetEnabled, setSlotGongBetEnabled] = useState(false);
  const [cutRollingEnabled, setCutRollingEnabled] = useState(false);

  // 카드 토글 변경 시 자동 저장 (PartnerDashboard 로직 참고)
  const handleCasinoGongBetToggle = async (enabled: boolean) => {
    setCasinoGongBetEnabled(enabled);
    try {
      await saveGongBetSettings(enabled, null, null);
      // ✅ 토글 변경 후 테이블 데이터 다시 계산 (동기화)
      recalculateSettlementData();
    } catch (error) {
      console.error('자동 저장 실패:', error);
    }
  };

  const handleSlotGongBetToggle = async (enabled: boolean) => {
    setSlotGongBetEnabled(enabled);
    try {
      await saveGongBetSettings(null, enabled, null);
      // ✅ 토글 변경 후 테이블 데이터 다시 계산 (동기화)
      recalculateSettlementData();
    } catch (error) {
      console.error('자동 저장 실패:', error);
    }
  };

  const handleCutRollingToggle = async (enabled: boolean) => {
    setCutRollingEnabled(enabled);
    try {
      await saveGongBetSettings(null, null, enabled);
      // ✅ 토글 변경 후 테이블 데이터 다시 계산 (동기화)
      recalculateSettlementData();
    } catch (error) {
      console.error('자동 저장 실패:', error);
    }
  };

  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });

  // 공베팅 설정 로드
  const loadGongBetSettings = async () => {
    try {
      console.log('🔍 공베팅 설정 로드 시작 - 사용자 ID:', user.id);

      // 먼저 테이블 존재 확인
      const { data: tableCheck, error: tableError } = await supabase
        .from('user_settings')
        .select('count', { count: 'exact' })
        .limit(1);

      if (tableError) {
        console.error('❌ user_settings 테이블 접근 실패:', tableError);
        toast.error('데이터베이스 테이블을 찾을 수 없습니다.');
        return;
      }

      console.log('✅ user_settings 테이블 접근 성공');

      const { data: settings, error } = await supabase
        .from('user_settings')
        .select('gong_bet_settings')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('❌ 공베팅 설정 조회 실패:', error);
        toast.error('설정 조회에 실패했습니다.');
        return;
      }

      if (settings?.gong_bet_settings) {
        const gongSettings = settings.gong_bet_settings;
        console.log('✅ 공베팅 설정 로드됨:', gongSettings);

        // 각 설정값을 안전하게 추출하고 설정
        setGongBetEnabled(gongSettings.gongBetEnabled === true);
        setGongBetLevels(gongSettings.gongBetLevels || { 3: false, 4: false, 5: false, 6: false });
        setGongBetRate(typeof gongSettings.gongBetRate === 'number' ? gongSettings.gongBetRate : 0);
        setCasinoGongBetEnabled(gongSettings.casinoGongBetEnabled === true);
        setSlotGongBetEnabled(gongSettings.slotGongBetEnabled === true);
        setCutRollingEnabled(gongSettings.cutRollingEnabled === true);

        console.log('✅ 공베팅 설정 적용 완료');
    } else {
      console.log('ℹ️ 공베팅 설정이 없어 기본값 사용 (신규 사용자)');
      // 설정이 없으면 기본값으로 초기화
      setGongBetEnabled(false);
      setGongBetLevels({ 3: false, 4: false, 5: false, 6: false });
      setGongBetRate(0);
      setCasinoGongBetEnabled(false);
      setSlotGongBetEnabled(false);
      setCutRollingEnabled(false);
    }
  } catch (error) {
    console.error('❌ 공베팅 설정 로드 실패:', error);
    toast.error('설정 로드에 실패했습니다.');
    // 에러 시에도 기본값 설정
    setGongBetEnabled(false);
    setGongBetLevels({ 3: false, 4: false, 5: false, 6: false });
    setGongBetRate(0);
    setCasinoGongBetEnabled(false);
    setSlotGongBetEnabled(false);
    setCutRollingEnabled(false);
  }
};

  // 공베팅 설정 저장 (PartnerDashboard 로직 참고)
  const saveGongBetSettings = async (casinoEnabled?: boolean, slotEnabled?: boolean, cutEnabled?: boolean) => {
    try {
      const settingsData = {
        gongBetEnabled,
        gongBetLevels,
        gongBetRate,
        casinoGongBetEnabled: casinoEnabled !== undefined ? casinoEnabled : casinoGongBetEnabled,
        slotGongBetEnabled: slotEnabled !== undefined ? slotEnabled : slotGongBetEnabled,
        cutRollingEnabled: cutEnabled !== undefined ? cutEnabled : cutRollingEnabled
      };

      console.log('💾 공베팅 설정 저장 시도 - 사용자 ID:', user.id);
      console.log('💾 저장 데이터:', settingsData);
      console.log('💾 사용자 ID 타입:', typeof user.id);

      const { data, error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          gong_bet_settings: settingsData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })
        .select();

      if (error) {
        console.error('❌ 공베팅 설정 저장 실패:', error);
        console.error('❌ 에러 상세:', error.message, error.details, error.hint);
        throw error;
      }

      console.log('✅ 공베팅 설정 저장 성공 - 반환 데이터:', data);
      toast.success('공베팅 설정이 저장되었습니다.');
    } catch (error) {
      console.error('❌ 공베팅 설정 저장 실패:', error);
      toast.error('설정 저장에 실패했습니다.');
    }
  };

  // 초기 설정 로드
  useEffect(() => {
    loadGongBetSettings();
  }, []);

  // 모달 열릴 때 위치 초기화
  useEffect(() => {
    if (showGongBetModal) {
      setModalPosition({ x: 0, y: 0 });
    }
  }, [showGongBetModal]);

  useEffect(() => { fetchSettlementData(); }, [dateRange]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id); else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const toggleExpandAll = () => {
    if (expandAll) { setExpandedRows(new Set()); setExpandAll(false); }
    else { const allIds = new Set(data.filter(r => r.hasChildren).map(r => r.id)); setExpandedRows(allIds); setExpandAll(true); }
  };

  const getRowBackgroundColor = (level: number): string => {
    switch (level) {
      case 1: return 'rgba(168, 85, 247, 0.08)';
      case 2: return 'rgba(239, 68, 68, 0.08)';
      case 3: return 'rgba(59, 130, 246, 0.08)';
      case 4: return 'rgba(34, 197, 94, 0.08)';
      case 5: return 'rgba(245, 158, 11, 0.08)';
      case 6: return 'rgba(236, 72, 153, 0.08)';
      default: return 'transparent';
    }
  };

  const getLevelName = (level: number): string => {
    switch (level) {
      case 0: return '회원'; case 1: return '슈퍼관리자'; case 2: return '운영사(대본)';
      case 3: return '본사'; case 4: return '부본사'; case 5: return '총판'; case 6: return '매장';
      default: return '회원';
    }
  };

  const formatNumber = (num: number): string => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);

  const calculateSummary = (rows: SettlementRow[]) => {
    const filtered = getFilteredRows(rows);
    // ✅ 베팅 금액: Lv0 회원만 (39800)
    // ✅ 롤링금: 모든 행 합산 (회원롤링 + 매장롤링 + ...)
    const membersOnly = filtered.filter(r => r.level === 0);
    
    setSummary({
      totalBalance: filtered.reduce((sum, r) => sum + r.balance, 0),
      totalPoints: filtered.reduce((sum, r) => sum + r.points, 0),
      onlineDeposit: filtered.reduce((sum, r) => sum + r.onlineDeposit, 0),
      onlineWithdrawal: filtered.reduce((sum, r) => sum + r.onlineWithdrawal, 0),
      manualDeposit: filtered.reduce((sum, r) => sum + r.manualDeposit, 0),
      manualWithdrawal: filtered.reduce((sum, r) => sum + r.manualWithdrawal, 0),
      pointGiven: filtered.reduce((sum, r) => sum + r.pointGiven, 0),
      pointRecovered: filtered.reduce((sum, r) => sum + r.pointRecovered, 0),
      depositWithdrawalDiff: filtered.reduce((sum, r) => sum + r.depositWithdrawalDiff, 0),
      casinoBet: membersOnly.reduce((sum, r) => sum + r.casinoBet, 0),
      casinoWin: filtered.reduce((sum, r) => sum + r.casinoWin, 0),
      slotBet: membersOnly.reduce((sum, r) => sum + r.slotBet, 0),
      slotWin: filtered.reduce((sum, r) => sum + r.slotWin, 0),
      ggr: filtered.reduce((sum, r) => sum + r.ggr, 0),
      totalRolling: filtered.reduce((sum, r) => sum + r.totalRolling, 0),
      totalLosing: filtered.reduce((sum, r) => sum + r.totalLosing, 0),
      individualRolling: filtered.reduce((sum, r) => sum + r.individualRolling, 0),
      individualLosing: filtered.reduce((sum, r) => sum + r.individualLosing, 0)
    });
  };

  // ✅ 토글 상태가 변경되면 테이블 데이터를 다시 계산해서 동기화
  const recalculateSettlementData = () => {
    if (data.length === 0) return;
    
    const updatedRows = data.map(row => {
      const gongBetRateNum = typeof gongBetRate === 'number' ? gongBetRate : parseFloat(gongBetRate) || 0;
      const isGongBetApplied = gongBetEnabled && gongBetLevels[row.level];
      
      // 절삭 롤링금 재계산
      const gongBetCutRolling = isGongBetApplied ? row.totalRolling * (gongBetRateNum / 100) : 0;
      
      // 게임타입별 절삭 롤링금 재계산
      const casinoTotalRolling = row.casinoBet * (row.casinoRollingRate / 100);
      const slotTotalRolling = row.slotBet * (row.slotRollingRate / 100);
      
      const casinoGongBetCutRolling = isGongBetApplied ? casinoTotalRolling * (gongBetRateNum / 100) : 0;
      const slotGongBetCutRolling = isGongBetApplied ? slotTotalRolling * (gongBetRateNum / 100) : 0;
      
      // 공베팅차 재계산 (현재 토글 상태 반영)
      const casinoGongBetAmount = casinoGongBetEnabled && row.casinoRollingRate > 0 
        ? casinoGongBetCutRolling / (row.casinoRollingRate / 100)
        : 0;
      const slotGongBetAmount = slotGongBetEnabled && row.slotRollingRate > 0 
        ? slotGongBetCutRolling / (row.slotRollingRate / 100)
        : 0;
      const cutRollingAmount = cutRollingEnabled ? gongBetCutRolling : 0;
      
      return {
        ...row,
        casinoGongBetAmount,
        slotGongBetAmount,
        cutRollingAmount
      };
    });
    
    setData(updatedRows);
    calculateSummary(updatedRows);
  };

  const getFilteredRows = (rows: SettlementRow[]): SettlementRow[] => {
    let filtered = rows;
    if (codeSearch.trim()) filtered = filtered.filter(r => r.username.toLowerCase().includes(codeSearch.toLowerCase()));
    if (partnerLevelFilter !== 'all') filtered = filtered.filter(r => r.level === partnerLevelFilter);
    return filtered;
  };

  const getVisibleRows = (): SettlementRow[] => {
    const filtered = getFilteredRows(data);
    const visible: SettlementRow[] = [];
    const addRowWithChildren = (row: SettlementRow) => {
      visible.push(row);
      if (row.level > 0 && expandedRows.has(row.id)) {
        const childPartners = filtered.filter(r => r.parentId === row.id);
        childPartners.forEach(child => addRowWithChildren(child));
      }
    };
    const topLevelRows = filtered.filter(r => { if (r.level === 0) return false; if (!r.parentId) return true; return !filtered.some(parent => parent.id === r.parentId); });
    topLevelRows.forEach(row => addRowWithChildren(row));
    return visible;
  };

  const getDescendantPartnerIds = (partnerId: string, partners: any[]): string[] => {
    const directChildren = partners.filter(p => p.parent_id === partnerId);
    const childIds = directChildren.map(p => p.id);
    for (const child of directChildren) childIds.push(...getDescendantPartnerIds(child.id, partners));
    return childIds;
  };

  const getAllDescendantUserIds = (partnerId: string, allPartners: any[], allUsers: any[]): string[] => {
    const directUsers = allUsers.filter(u => u.referrer_id === partnerId).map(u => u.id);
    const childPartners = allPartners.filter(p => p.parent_id === partnerId);
    let allUsers_ids = [...directUsers];
    for (const childPartner of childPartners) allUsers_ids = allUsers_ids.concat(getAllDescendantUserIds(childPartner.id, allPartners, allUsers));
    return allUsers_ids;
  };

  const getAllDescendantPartnerIds = (partnerId: string, allPartners: any[]): string[] => {
    const directChildren = allPartners.filter(p => p.parent_id === partnerId);
    let allDescendants = directChildren.map(p => p.id);
    for (const child of directChildren) allDescendants = allDescendants.concat(getAllDescendantPartnerIds(child.id, allPartners));
    return allDescendants;
  };

  const calculateRowData = (
    entityId: string, username: string, level: number, balance: number, points: number,
    casinoRollingRate: number, casinoLosingRate: number, slotRollingRate: number, slotLosingRate: number,
    transactions: any[], pointTransactions: any[], gameRecords: any[], partners: any[], users: any[], partnerBalanceLogs: any[]
  ): SettlementRow => {
    // ✅ 수정: 직속 회원 데이터 합산
    // 각 파트너 행은 "해당 파트너의 직속 회원들"의 게임 데이터를 기반으로 계산
    let relevantUserIdsForTransactions: string[] = [];

    if (level >= 3 && level <= 6) {
      // ✅ 파트너 (Lv3-6): 직속 회원 데이터만 합산 (본인 제외)
      const directUserIds = users.filter(u => u.referrer_id === entityId).map(u => u.id);
      relevantUserIdsForTransactions = directUserIds;
    } else if (level === 2) {
      // ✅ Lv2 (운영사): 자신의 직속 파트너들(Lv3-6)의 직속 회원들을 합산
      const directPartnerIds = partners.filter(p => p.parent_id === entityId).map(p => p.id);
      const directUserIds = users.filter(u => directPartnerIds.includes(u.referrer_id)).map(u => u.id);
      relevantUserIdsForTransactions = directUserIds;
    } else if (level === 1) {
      // ✅ Lv1 (시스템관리자): 모든 회원들을 합산
      relevantUserIdsForTransactions = users.map(u => u.id);
    } else {
      // Lv0 회원: 본인 데이터만 계산
      relevantUserIdsForTransactions = [entityId];
    }
    const userTransactions = transactions.filter(t => relevantUserIdsForTransactions.includes(t.user_id));

    // 파트너의 경우 본인의 잔액 로그만 계산
    const relevantPartnerIdsForTransactions: string[] = level > 0 ? [entityId] : [];
    const partnerTransactions = transactions.filter(t => (t.transaction_type === 'partner_deposit' || t.transaction_type === 'partner_withdrawal') && relevantPartnerIdsForTransactions.includes(t.partner_id));

    // ✅ 온라인 입금/출금: 사용자 직접 입금/출금만 (deposit/withdrawal)
    const onlineDeposit = userTransactions.filter(t => t.transaction_type === 'deposit' && t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
    const onlineWithdrawal = userTransactions.filter(t => t.transaction_type === 'withdrawal' && t.status === 'completed').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    
    // ✅ 파트너 충환전: 파트너 입금/출금 신청
    const partnerChargeFromRequests = partnerTransactions.filter(t => t.transaction_type === 'partner_deposit' && t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
    const partnerExchangeFromRequests = partnerTransactions.filter(t => t.transaction_type === 'partner_withdrawal' && t.status === 'completed').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    
    // ✅ 수동 입금/출금: 파트너 간 거래 (admin_deposit_initial/send, admin_withdrawal_initial/send) + partner_balance_logs
    const adminDepositTransactions = userTransactions.filter(t => (t.transaction_type === 'admin_deposit_initial' || t.transaction_type === 'admin_deposit_send') && t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
    const adminWithdrawalTransactions = userTransactions.filter(t => (t.transaction_type === 'admin_withdrawal_initial' || t.transaction_type === 'admin_withdrawal_send') && t.status === 'completed').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    
    const relevantBalanceLogs = partnerBalanceLogs.filter(l => relevantPartnerIdsForTransactions.includes(l.partner_id) || relevantPartnerIdsForTransactions.includes(l.from_partner_id) || relevantPartnerIdsForTransactions.includes(l.to_partner_id));
    const manualDepositFromLogs = relevantBalanceLogs.filter(l => l.transaction_type === 'deposit').reduce((sum, l) => sum + (l.amount || 0), 0);
    const manualWithdrawalFromLogs = relevantBalanceLogs.filter(l => l.transaction_type === 'withdrawal').reduce((sum, l) => sum + Math.abs(l.amount || 0), 0);
    
    // ✅ 수동 입금/출금 = 파트너 간 거래 + 파트너 요청 + 수동 처리
    const manualDeposit = adminDepositTransactions + partnerChargeFromRequests + manualDepositFromLogs;
    const manualWithdrawal = adminWithdrawalTransactions + partnerExchangeFromRequests + manualWithdrawalFromLogs;
    const userPointTrans = pointTransactions.filter(pt => relevantUserIdsForTransactions.includes(pt.user_id));
    const pointGiven = userPointTrans.filter(pt => pt.type === 'commission_earned').reduce((sum, pt) => sum + (pt.amount || 0), 0);
    const pointRecovered = userPointTrans.filter(pt => pt.type === 'point_to_balance').reduce((sum, pt) => sum + (pt.amount || 0), 0);

    // 본인의 게임 기록만 계산
    const relevantGameRecords = gameRecords.filter(gr => relevantUserIdsForTransactions.includes(gr.user_id));
    const casinoBetRecords = relevantGameRecords.filter(gr => gr.game_type === 'casino');
    const slotBetRecords = relevantGameRecords.filter(gr => gr.game_type === 'slot');
    const casinoBet = Math.abs(casinoBetRecords.reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const casinoWin = casinoBetRecords.reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
    const slotBet = Math.abs(slotBetRecords.reduce((sum, gr) => sum + (gr.bet_amount || 0), 0));
    const slotWin = slotBetRecords.reduce((sum, gr) => sum + (gr.win_amount || 0), 0);
    
    // ✅ 게임 데이터 로드 확인 (디버깅)
    if (casinoBet > 0 || slotBet > 0) {
      console.log(`[정산계산] ${username}:`, {
        relevantUserCount: relevantUserIdsForTransactions.length,
        totalGameRecords: relevantGameRecords.length,
        casinoBets: casinoBetRecords.length,
        slotBets: slotBetRecords.length,
        casinoBet, casinoWin, slotBet, slotWin
      });
    }
    const casinoWinLoss = casinoBet - casinoWin;
    const slotWinLoss = slotBet - slotWin;
    const ggr = casinoWinLoss + slotWinLoss;
    const casinoTotalRolling = casinoBet * (casinoRollingRate / 100);
    const slotTotalRolling = slotBet * (slotRollingRate / 100);
    const totalRolling = casinoTotalRolling + slotTotalRolling;
    const casinoLosableAmount = Math.max(0, casinoWinLoss - casinoTotalRolling);
    const slotLosableAmount = Math.max(0, slotWinLoss - slotTotalRolling);
    const casinoTotalLosing = casinoLosableAmount * (casinoLosingRate / 100);
    const slotTotalLosing = slotLosableAmount * (slotLosingRate / 100);
    const totalLosing = casinoTotalLosing + slotTotalLosing;
    const individualRolling = totalRolling;
    const individualLosing = totalLosing;
    // ✅ 수정: 출금은 양수로 저장되어 있으므로 뺄셈 처리
    // (입금 10000) - (출금 10000) = 0 (올바름)
    const depositWithdrawalDiff = onlineDeposit - onlineWithdrawal + manualDeposit - manualWithdrawal;

    // 공베팅 적용: 해당 레벨이 활성화되어 있고 공베팅이 전체 활성화된 경우
    const gongBetRateNum = typeof gongBetRate === 'number' ? gongBetRate : parseFloat(gongBetRate) || 0;
    const isGongBetApplied = gongBetEnabled && gongBetLevels[level];
    const gongBetAppliedRolling = isGongBetApplied ? totalRolling * (1 - gongBetRateNum / 100) : totalRolling;
    const gongBetCutRolling = isGongBetApplied ? totalRolling * (gongBetRateNum / 100) : 0;

    // ✅ 게임타입별 절삭 롤링금 계산 (공베팅 적용 시 각 게임별로 절삭)
    const casinoGongBetCutRolling = isGongBetApplied ? casinoTotalRolling * (gongBetRateNum / 100) : 0;
    const slotGongBetCutRolling = isGongBetApplied ? slotTotalRolling * (gongBetRateNum / 100) : 0;

    // ✅ 공베팅차 = 절삭 롤링금을 각 게임의 롤링률로 역산
    // (절삭 롤링금이 원래 어느 정도 베팅에서 나왔는지 계산)
    const casinoGongBetAmount = casinoGongBetEnabled && casinoRollingRate > 0 
      ? casinoGongBetCutRolling / (casinoRollingRate / 100)
      : 0;
    const slotGongBetAmount = slotGongBetEnabled && slotRollingRate > 0 
      ? slotGongBetCutRolling / (slotRollingRate / 100)
      : 0;
    const cutRollingAmount = cutRollingEnabled ? gongBetCutRolling : 0;

    return {
      level, levelName: getLevelName(level), id: entityId, username,
      casinoRollingRate, slotRollingRate, casinoLosingRate, slotLosingRate,
      balance, points, onlineDeposit, onlineWithdrawal, manualDeposit, manualWithdrawal,
      pointGiven, pointRecovered, depositWithdrawalDiff, casinoBet, casinoWin, slotBet, slotWin, ggr,
      totalRolling, totalLosing, individualRolling, individualLosing,
      gongBetAppliedRolling, gongBetCutRolling,
      casinoGongBetAmount, slotGongBetAmount, cutRollingAmount
    };
  };

  const processSettlementData = (partners: any[], users: any[], completedTransactions: any[], allPointTransactions: any[], gameRecords: any[]): SettlementRow[] => {
    // ✅ completedTransactions에서 입출금 트랜잭션만 분리
    const depositWithdrawalTransactions = completedTransactions.filter(t => 
      !t.is_point_transaction && (t.transaction_type || t.user_id)
    );
    
    // ✅ 포인트 트랜잭션만 필터링
    const pointTransactions = completedTransactions.filter(t => t.is_point_transaction) || allPointTransactions || [];
    
    // ✅ partner_balance_logs 분리
    const partnerBalanceLogs = completedTransactions.filter(t => t.is_partner_transaction) || [];
    
    const rows: SettlementRow[] = [];
    for (const partner of partners) {
      const hasChildren = partners.some(p => p.parent_id === partner.id) || users.some(u => u.referrer_id === partner.id);
      const row = calculateRowData(partner.id, partner.username, partner.level, partner.balance || 0, 0, partner.casino_rolling_commission || 0, partner.casino_losing_commission || 0, partner.slot_rolling_commission || 0, partner.slot_losing_commission || 0, depositWithdrawalTransactions, pointTransactions, gameRecords, partners, users, partnerBalanceLogs);
      rows.push({ ...row, parentId: partner.parent_id, hasChildren });
    }
    for (const userItem of users) {
      const row = calculateRowData(userItem.id, userItem.username, 0, userItem.balance || 0, userItem.points || 0, userItem.casino_rolling_commission || userItem.casino_rolling_rate || 0, userItem.casino_losing_commission || userItem.casino_losing_rate || 0, userItem.slot_rolling_commission || userItem.slot_rolling_rate || 0, userItem.slot_losing_commission || userItem.slot_losing_rate || 0, depositWithdrawalTransactions, pointTransactions, gameRecords, partners, users, partnerBalanceLogs);
      rows.push({ ...row, parentId: userItem.referrer_id, hasChildren: false });
    }
    return rows;
  };

  // ✅ TransactionManagement와 동일한 completedTransactions 구성 (입출금 + 포인트)
  const getCompletedTransactionsForSettlement = (transactions: any[], partnerBalanceLogs: any[], pointTransactions: any[]) => {
    // 완성된 입출금만 필터링
    const filteredTransactions = transactions.filter(t => t.status === 'completed' || t.status === 'rejected');
    
    // partner_balance_logs 변환 (deposit/withdrawal만)
    const mappedPartnerTransactions = partnerBalanceLogs
      .filter(pt => pt.transaction_type === 'deposit' || pt.transaction_type === 'withdrawal')
      .map(pt => ({
        ...pt,
        status: 'completed',
        is_partner_transaction: true
      }));
    
    // point_transactions 변환
    const mappedPointTransactions = pointTransactions
      .map(pt => ({
        ...pt,
        status: 'completed',
        is_point_transaction: true
      }));
    
    // 입출금 + 포인트 합쳐서 시간순 정렬
    return [...filteredTransactions, ...mappedPartnerTransactions, ...mappedPointTransactions].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  };

  const fetchSettlementData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    try {
      // ✅ 정산 대상 파트너/사용자 조회
      const { data: allPartners, error: allPartnersError } = await supabase.from('partners').select('*').order('level', { ascending: true }).order('username', { ascending: true });
      if (allPartnersError) throw allPartnersError;
      
      const userLevel = user.level;
      const visiblePartnerIds = new Set<string>([user.id]);
      const descendantIds = getDescendantPartnerIds(user.id, allPartners || []);
      descendantIds.forEach(id => visiblePartnerIds.add(id));
      const visiblePartners = (allPartners || []).filter(p => p.level > userLevel && visiblePartnerIds.has(p.id));
      const visiblePartnerIdArray = Array.from(visiblePartnerIds);
      
      const { data: users, error: usersError } = await supabase.from('users').select('*').in('referrer_id', visiblePartnerIdArray).order('username', { ascending: true });
      if (usersError) throw usersError;
      
      const partners = visiblePartners;
      const targetUserIds = [...(users?.map(u => u.id) || []), ...(partners?.map(p => p.id) || [])];
      
      // ✅ 모든 데이터 조회
      let transactionsQuery = supabase.from('transactions').select('*');
      const userOnlyIds = users?.map(u => u.id) || [];
      const partnerOnlyIds = partners?.map(p => p.id) || [];
      
      if (userOnlyIds.length > 0 && partnerOnlyIds.length > 0) {
        transactionsQuery = transactionsQuery.or(`user_id.in.(${userOnlyIds.join(',')}),partner_id.in.(${partnerOnlyIds.join(',')})`);
      } else if (userOnlyIds.length > 0) {
        transactionsQuery = transactionsQuery.in('user_id', userOnlyIds);
      } else if (partnerOnlyIds.length > 0) {
        transactionsQuery = transactionsQuery.in('partner_id', partnerOnlyIds);
      }
      
      transactionsQuery = transactionsQuery.gte('created_at', dateRange.from.toISOString()).lte('created_at', dateRange.to.toISOString());
      const { data: transactionsData, error: transError } = await transactionsQuery;
      if (transError) throw transError;
      
      let partnerBalanceLogsQuery = supabase.from('partner_balance_logs').select('*').in('transaction_type', ['deposit', 'withdrawal']);
      if (user.level > 1) {
        partnerBalanceLogsQuery = partnerBalanceLogsQuery.or(`partner_id.in.(${visiblePartnerIdArray.join(',')}),from_partner_id.in.(${visiblePartnerIdArray.join(',')}),to_partner_id.in.(${visiblePartnerIdArray.join(',')})`);
      }
      partnerBalanceLogsQuery = partnerBalanceLogsQuery.gte('created_at', dateRange.from.toISOString()).lte('created_at', dateRange.to.toISOString());
      const { data: partnerBalanceLogs, error: balanceLogsError } = await partnerBalanceLogsQuery;
      if (balanceLogsError) throw balanceLogsError;
      
      let pointTransactionsQuery = supabase.from('point_transactions').select('*').in('user_id', targetUserIds);
      pointTransactionsQuery = pointTransactionsQuery.gte('created_at', dateRange.from.toISOString()).lte('created_at', dateRange.to.toISOString());
      const { data: pointTransactions, error: pointError } = await pointTransactionsQuery;
      if (pointError) throw pointError;
      
      let gameRecordsQuery = supabase.from('game_records').select('*').in('user_id', targetUserIds);
      gameRecordsQuery = gameRecordsQuery.gte('played_at', dateRange.from.toISOString()).lte('played_at', dateRange.to.toISOString());
      const { data: gameRecords, error: gameError } = await gameRecordsQuery;
      if (gameError) throw gameError;
      
      // ✅ 베팅 데이터 로드 확인 (디버깅)
      console.log('[정산 페이지] 베팅 데이터 로드:', {
        targetUserIds: targetUserIds.length,
        gameRecordsCount: gameRecords?.length || 0,
        casinoBets: gameRecords?.filter(gr => gr.game_type === 'casino').length || 0,
        slotBets: gameRecords?.filter(gr => gr.game_type === 'slot').length || 0,
        dateRange: { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }
      });
      
      // ✅ TransactionManagement와 동일한 completedTransactions 생성 (입출금 + 포인트)
      const completedTransactions = getCompletedTransactionsForSettlement(
        transactionsData || [], 
        partnerBalanceLogs || [],
        pointTransactions || []
      );
      
      // ✅ 정산 계산 (completedTransactions 기반)
      const rows = processSettlementData(partners || [], users || [], completedTransactions, pointTransactions || [], gameRecords || []);
      setData(rows);
      calculateSummary(rows);
      
      // ✅ 정산 결과 확인 (디버깅)
      console.log('[정산 페이지] 계산 완료:', {
        totalRows: rows.length,
        totalCasinoBet: rows.reduce((sum, r) => sum + r.casinoBet, 0),
        totalSlotBet: rows.reduce((sum, r) => sum + r.slotBet, 0),
        totalGGR: rows.reduce((sum, r) => sum + r.ggr, 0)
      });
    } catch (error) {
      console.error('정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const visibleRows = getVisibleRows();
  const totalPages = Math.ceil(visibleRows.length / itemsPerPage);
  const paginatedRows = visibleRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const setQuickDateRange = (type: 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    let from: Date;
    let to: Date;
    if (type === 'yesterday') { from = startOfDay(subDays(today, 1)); to = endOfDay(subDays(today, 1)); }
    else if (type === 'week') { from = startOfDay(subDays(today, 7)); to = endOfDay(today); }
    else { from = startOfDay(subDays(today, 30)); to = endOfDay(today); }
    setDateRange({ from, to });
    setDateFilterType(type);
  };

  // Lv3~Lv5 사용자는 Lv35Settlement 페이지로 리다이렉트
  if ([3, 4, 5].includes(user.level)) {
    return <Lv35Settlement user={user} />;
  }

  // Lv6 사용자는 Lv6Settlement 페이지로 리다이렉트
  if (user.level === 6) {
    return <Lv6Settlement user={user} />;
  }

  // 공베팅 요율 계산
  const gongBetRateNum = typeof gongBetRate === 'number' ? gongBetRate : parseFloat(gongBetRate) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><TrendingUp className="h-6 w-6 text-cyan-400" />통합 정산 관리</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowGongBetModal(true)} className="bg-orange-600 hover:bg-orange-700 text-white"><Play className="h-4 w-4 mr-2" />공베팅 실행</Button>
          <Button onClick={fetchSettlementData} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white"><RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />새로고침</Button>
        </div>
      </div>
      <div className="glass-card rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 mb-6">
        {/* 1행: 총입금 / 총출금 / 수동입금 / 수동출금 */}
        <div className="bg-gradient-to-br from-emerald-900/50 to-slate-900 rounded-xl p-4 border border-emerald-700/30 hover:border-emerald-600/50 transition-all shadow-lg shadow-emerald-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-emerald-500/20 rounded-lg"><ArrowUpRight className="h-6 w-6 text-emerald-400" /></div><span className="text-2xl text-slate-400 font-medium">총 입금</span></div>
          <div className="text-3xl font-bold text-emerald-400 font-asiahead ml-12">{formatNumber(summary.onlineDeposit)}</div>
        </div>
        <div className="bg-gradient-to-br from-rose-900/50 to-slate-900 rounded-xl p-4 border border-rose-700/30 hover:border-rose-600/50 transition-all shadow-lg shadow-rose-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-rose-500/20 rounded-lg"><ArrowDownRight className="h-6 w-6 text-rose-400" /></div><span className="text-2xl text-slate-400 font-medium">총 출금</span></div>
          <div className="text-3xl font-bold text-rose-400 font-asiahead ml-12">{formatNumber(summary.onlineWithdrawal)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/50 to-slate-900 rounded-xl p-4 border border-blue-700/30 hover:border-blue-600/50 transition-all shadow-lg shadow-blue-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-blue-500/20 rounded-lg"><DollarSign className="h-6 w-6 text-blue-400" /></div><span className="text-2xl text-slate-400 font-medium">수동 입금</span></div>
          <div className="text-3xl font-bold text-blue-400 font-asiahead ml-12">{formatNumber(summary.manualDeposit)}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-900/50 to-slate-900 rounded-xl p-4 border border-orange-700/30 hover:border-orange-600/50 transition-all shadow-lg shadow-orange-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-orange-500/20 rounded-lg"><DollarSign className="h-6 w-6 text-orange-400" /></div><span className="text-2xl text-slate-400 font-medium">수동 출금</span></div>
          <div className="text-3xl font-bold text-orange-400 font-asiahead ml-12">{formatNumber(summary.manualWithdrawal)}</div>
        </div>

        {/* 2행: 전체 머니 / 전체 포인트 / 포인트지급 / 포인트회수 */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600/50 transition-all shadow-lg shadow-slate-900/20">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-cyan-500/20 rounded-lg"><Wallet className="h-6 w-6 text-cyan-400" /></div><span className="text-2xl text-slate-400 font-medium">전체 머니</span></div>
          <div className="text-3xl font-bold text-slate-100 font-asiahead ml-12">{formatNumber(summary.totalBalance)}</div>
        </div>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600/50 transition-all shadow-lg shadow-slate-900/20">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-purple-500/20 rounded-lg"><Coins className="h-6 w-6 text-purple-400" /></div><span className="text-2xl text-slate-400 font-medium">전체 포인트</span></div>
          <div className="text-3xl font-bold text-purple-400 font-asiahead ml-12">{formatNumber(summary.totalPoints)}</div>
        </div>
        <div className="bg-gradient-to-br from-indigo-900/50 to-slate-900 rounded-xl p-4 border border-indigo-700/30 hover:border-indigo-600/50 transition-all shadow-lg shadow-indigo-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-indigo-500/20 rounded-lg"><Gift className="h-6 w-6 text-indigo-400" /></div><span className="text-2xl text-slate-400 font-medium">포인트 지급</span></div>
          <div className="text-3xl font-bold text-indigo-400 font-asiahead ml-12">{formatNumber(summary.pointGiven)}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-900/50 to-slate-900 rounded-xl p-4 border border-amber-700/30 hover:border-amber-600/50 transition-all shadow-lg shadow-amber-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-amber-500/20 rounded-lg"><Gift className="h-6 w-6 text-amber-400" /></div><span className="text-2xl text-slate-400 font-medium">포인트 회수</span></div>
          <div className="text-3xl font-bold text-amber-400 font-asiahead ml-12">{formatNumber(summary.pointRecovered)}</div>
        </div>

        {/* 3행: 카지노베팅 / 카지노당첨 / 슬롯베팅 / 슬롯당첨 */}
        <div className="bg-gradient-to-br from-violet-900/50 to-slate-900 rounded-xl p-4 border border-violet-700/30 hover:border-violet-600/50 transition-all shadow-lg shadow-violet-900/10">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-violet-500/20 rounded-lg"><TrendingUp className="h-6 w-6 text-violet-400" /></div><span className="text-2xl text-slate-400 font-medium">카지노 베팅</span></div>
              <div className="text-3xl font-bold text-violet-400 font-asiahead ml-12">{formatNumber(summary.casinoBet)}</div>
            </div>
            <div className="flex flex-col items-end gap-3 p-3 bg-gradient-to-br from-orange-950/30 to-red-950/30 rounded-lg border border-orange-700/50 min-w-[140px] flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-orange-300 whitespace-nowrap flex items-center gap-1">
                  🎯 카지노 공베팅
                </span>
                <Switch
                  checked={casinoGongBetEnabled}
                  onCheckedChange={handleCasinoGongBetToggle}
                  disabled={!gongBetEnabled}
                  size="sm"
                />
              </div>
              {casinoGongBetEnabled && (
                <div className="text-lg font-bold text-orange-200 bg-orange-900/40 px-3 py-1 rounded border border-orange-600/50 shadow-lg">
                  {formatNumber(summary.casinoBet * (gongBetRateNum / 100))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-fuchsia-900/50 to-slate-900 rounded-xl p-4 border border-fuchsia-700/30 hover:border-fuchsia-600/50 transition-all shadow-lg shadow-fuchsia-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-fuchsia-500/20 rounded-lg"><TrendingUp className="h-6 w-6 text-fuchsia-400" /></div><span className="text-2xl text-slate-400 font-medium">카지노 당첨</span></div>
          <div className="text-3xl font-bold text-fuchsia-400 font-asiahead ml-12">{formatNumber(summary.casinoWin)}</div>
        </div>
        <div className="bg-gradient-to-br from-teal-900/50 to-slate-900 rounded-xl p-4 border border-teal-700/30 hover:border-teal-600/50 transition-all shadow-lg shadow-teal-900/10">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-teal-500/20 rounded-lg"><Coins className="h-6 w-6 text-teal-400" /></div><span className="text-2xl text-slate-400 font-medium">슬롯 베팅</span></div>
              <div className="text-3xl font-bold text-teal-400 font-asiahead ml-12">{formatNumber(summary.slotBet)}</div>
            </div>
            <div className="flex flex-col items-end gap-3 p-3 bg-gradient-to-br from-green-950/30 to-teal-950/30 rounded-lg border border-green-700/50 min-w-[140px] flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-green-300 whitespace-nowrap flex items-center gap-1">
                  🎰 슬롯 공베팅
                </span>
                <Switch
                  checked={slotGongBetEnabled}
                  onCheckedChange={handleSlotGongBetToggle}
                  disabled={!gongBetEnabled}
                  size="sm"
                />
              </div>
              {slotGongBetEnabled && (
                <div className="text-lg font-bold text-green-200 bg-green-900/40 px-3 py-1 rounded border border-green-600/50 shadow-lg">
                  {formatNumber(summary.slotBet * (gongBetRateNum / 100))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-lime-900/50 to-slate-900 rounded-xl p-4 border border-lime-700/30 hover:border-lime-600/50 transition-all shadow-lg shadow-lime-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-lime-500/20 rounded-lg"><Coins className="h-6 w-6 text-lime-400" /></div><span className="text-2xl text-slate-400 font-medium">슬롯 당첨</span></div>
          <div className="text-3xl font-bold text-lime-400 font-asiahead ml-12">{formatNumber(summary.slotWin)}</div>
        </div>

        {/* 4행: GGR 합산 / 총 롤링금 / 입출차액 / 총루징 */}
        <div className="bg-gradient-to-br from-amber-800/50 to-slate-900 rounded-xl p-4 border border-amber-600/30 hover:border-amber-500/50 transition-all shadow-lg shadow-amber-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-amber-500/20 rounded-lg"><TrendingUp className="h-6 w-6 text-amber-400" /></div><span className="text-2xl text-slate-400 font-medium">GGR 합산</span></div>
          <div className="text-3xl font-bold text-amber-400 font-asiahead ml-12">{formatNumber(summary.ggr)}</div>
        </div>
        <div className="bg-gradient-to-br from-sky-900/50 to-slate-900 rounded-xl p-4 border border-sky-700/30 hover:border-sky-600/50 transition-all shadow-lg shadow-sky-900/10">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-sky-500/20 rounded-lg"><Percent className="h-6 w-6 text-sky-400" /></div><span className="text-2xl text-slate-400 font-medium">총 롤링금</span></div>
              <div className="text-3xl font-bold text-sky-400 font-asiahead ml-12">{formatNumber(summary.totalRolling)}</div>
            </div>
            <div className="flex flex-col items-end gap-3 p-3 bg-gradient-to-br from-blue-950/30 to-cyan-950/30 rounded-lg border border-blue-700/50 min-w-[140px] flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-blue-300 whitespace-nowrap flex items-center gap-1">
                  💰 절삭 롤링금
                </span>
                <Switch
                  checked={cutRollingEnabled}
                  onCheckedChange={handleCutRollingToggle}
                  disabled={!gongBetEnabled}
                  size="sm"
                />
              </div>
              {cutRollingEnabled && (
                <div className="text-lg font-bold text-blue-200 bg-blue-900/40 px-3 py-1 rounded border border-blue-600/50 shadow-lg">
                  {formatNumber(summary.totalRolling * (gongBetRateNum / 100))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-cyan-900/50 to-slate-900 rounded-xl p-4 border border-cyan-700/30 hover:border-cyan-600/50 transition-all shadow-lg shadow-cyan-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-cyan-500/20 rounded-lg"><Activity className="h-6 w-6 text-cyan-400" /></div><span className="text-2xl text-slate-400 font-medium">입출차액</span></div>
          <div className={cn("text-3xl font-bold font-asiahead ml-12", summary.depositWithdrawalDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatNumber(summary.depositWithdrawalDiff)}</div>
        </div>
        <div className="bg-gradient-to-br from-red-900/50 to-slate-900 rounded-xl p-4 border border-red-700/30 hover:border-red-600/50 transition-all shadow-lg shadow-red-900/10">
          <div className="flex items-center gap-3 mb-2"><div className="p-3 bg-red-500/20 rounded-lg"><Percent className="h-6 w-6 text-red-400" /></div><span className="text-2xl text-slate-400 font-medium">총 루징</span></div>
          <div className="text-3xl font-bold text-red-400 font-asiahead ml-12">{formatNumber(summary.totalLosing)}</div>
        </div>
      </div>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Button onClick={() => { setDateFilterType('today'); const today = new Date(); setDateRange({ from: startOfDay(today), to: endOfDay(today) }); }} variant={dateFilterType === 'today' ? 'default' : 'outline'} className="h-10">오늘</Button>
          <Button onClick={() => setQuickDateRange('yesterday')} variant={dateFilterType === 'yesterday' ? 'default' : 'outline'} className="h-10">어제</Button>
          <Button onClick={() => setQuickDateRange('week')} variant={dateFilterType === 'week' ? 'default' : 'outline'} className="h-10">일주일</Button>
          <Button onClick={() => setQuickDateRange('month')} variant={dateFilterType === 'month' ? 'default' : 'outline'} className="h-10">한달</Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal input-premium", !dateRange && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (dateRange.to ? (format(dateRange.from, "yyyy-MM-dd", { locale: ko }) + " - " + format(dateRange.to, "yyyy-MM-dd", { locale: ko })) : format(dateRange.from, "yyyy-MM-dd", { locale: ko })) : <span>날짜 선택</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ko} /></PopoverContent>
          </Popover>
          <div className="flex items-center gap-2">
            <Button onClick={() => setPartnerLevelFilter('all')} variant={partnerLevelFilter === 'all' ? 'default' : 'outline'} className="h-10 px-3">전체</Button>
            <Button onClick={() => setPartnerLevelFilter(3)} variant={partnerLevelFilter === 3 ? 'default' : 'outline'} className="h-10 px-3">본사</Button>
            <Button onClick={() => setPartnerLevelFilter(4)} variant={partnerLevelFilter === 4 ? 'default' : 'outline'} className="h-10 px-3">부본사</Button>
            <Button onClick={() => setPartnerLevelFilter(5)} variant={partnerLevelFilter === 5 ? 'default' : 'outline'} className="h-10 px-3">총판</Button>
            <Button onClick={() => setPartnerLevelFilter(6)} variant={partnerLevelFilter === 6 ? 'default' : 'outline'} className="h-10 px-3">매장</Button>
          </div>
          <div className="flex-1 relative"><Search className="absolute left-3 top-2.5 h-6 w-6 text-slate-400" /><Input placeholder="코드 검색..." className="pl-10 input-premium" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} /></div>
          <Button onClick={toggleExpandAll} variant="outline" className="h-10">{expandAll ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}{expandAll ? '전체 접기' : '전체 펼치기'}</Button>
        </div>
        {loading ? (<div className="flex items-center justify-center py-12"><LoadingSpinner /></div>) : (
          <div>
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9FA8DA #E8EAF6' }}>
              <style dangerouslySetInnerHTML={{ __html: `.overflow-x-auto::-webkit-scrollbar { height: 8px; } .overflow-x-auto::-webkit-scrollbar-track { background: #E8EAF6; } .overflow-x-auto::-webkit-scrollbar-thumb { background: #9FA8DA; border-radius: 4px; }` }} />
              <table className="w-full" style={{ tableLayout: 'auto' }}>
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-center text-white font-normal sticky left-0 bg-slate-900 z-10 whitespace-nowrap">등급</th>
                    <th className="px-4 py-3 text-center text-white font-normal bg-slate-900 whitespace-nowrap">아이디</th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-slate-800/70 whitespace-nowrap"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50 whitespace-nowrap">정산 기준</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50 whitespace-nowrap">카지노</div><div className="flex-1 py-2 border-r border-slate-700/50 whitespace-nowrap">슬롯</div><div className="flex-1 py-2 whitespace-nowrap">루징</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-indigo-950/60 whitespace-nowrap" style={{ minWidth: '160px' }}><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50 whitespace-nowrap">보유자산</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50 whitespace-nowrap">머니</div><div className="flex-1 py-2 whitespace-nowrap">포인트</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-orange-950/60 whitespace-nowrap"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50 whitespace-nowrap">온라인 입출금</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50 whitespace-nowrap">입금</div><div className="flex-1 py-2 whitespace-nowrap">출금</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-rose-950/60 whitespace-nowrap"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50 whitespace-nowrap">수동 입출금</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50 whitespace-nowrap">수동 입금</div><div className="flex-1 py-2 whitespace-nowrap">수동 출금</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-green-950/60 whitespace-nowrap"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50 whitespace-nowrap">포인트 관리</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50 whitespace-nowrap">지급</div><div className="flex-1 py-2 whitespace-nowrap">회수</div></div></div></th>
                    <th className="px-4 py-3 text-center text-white font-normal bg-cyan-950/60 whitespace-nowrap" style={{ minWidth: '120px' }}>입출차액</th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-blue-950/60"><div className="flex flex-col"><div className="py-1 border-b border-slate-700/50 whitespace-nowrap">게임 실적</div><div className="flex"><div className="py-1 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>카지노 베팅</div>{casinoGongBetEnabled && <div className="py-1 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>카지노 공베팅</div>}<div className="py-1 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>카지노 당첨</div><div className="py-1 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>슬롯 베팅</div>{slotGongBetEnabled && <div className="py-1 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>슬롯 공베팅</div>}<div className="py-1 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>슬롯 당첨</div></div></div></th>
                    <th className="px-4 py-3 text-center text-white font-normal bg-amber-950/60 whitespace-nowrap">GGR</th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-teal-950/60 whitespace-nowrap"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50 whitespace-nowrap">실정산</div><div className="flex"><div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>총 롤링</div>{cutRollingEnabled && <div className="py-2 border-r border-slate-700/50 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>절삭 롤링금</div>}<div className="py-2 whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>총 루징</div></div></div></th>
                    <th className="px-4 py-0 text-center text-white font-normal bg-emerald-950/70 whitespace-nowrap"><div className="flex flex-col"><div className="py-2 border-b border-slate-700/50 whitespace-nowrap">코드별 실정산</div><div className="flex"><div className="flex-1 py-2 border-r border-slate-700/50 whitespace-nowrap">롤링</div><div className="flex-1 py-2 whitespace-nowrap">루징</div></div></div></th>


                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => {
                    const bgColor = getRowBackgroundColor(row.level);
                    return (
                      <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors" style={{ backgroundColor: bgColor }}>
                        <td className="px-4 py-3 text-slate-300 sticky left-0 z-10 whitespace-nowrap" style={{ backgroundColor: bgColor, cursor: row.hasChildren ? 'pointer' : 'default' }} onClick={() => row.hasChildren && toggleRow(row.id)}>
                          <div className="flex items-center gap-1">{row.hasChildren && row.level > 0 && (expandedRows.has(row.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />)}{row.levelName}</div>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-200 font-asiahead whitespace-nowrap">{row.username}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-cyan-400 font-asiahead">{row.casinoRollingRate}%</div><div className="flex-1 text-purple-400 font-asiahead">{row.slotRollingRate}%</div><div className="flex-1 text-orange-400 font-asiahead">{row.casinoLosingRate}%</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-slate-300 font-asiahead">{formatNumber(row.balance)}</div><div className="flex-1 text-cyan-400 font-asiahead">{formatNumber(row.points)}</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.onlineDeposit)}</div><div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.onlineWithdrawal)}</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-emerald-400 font-asiahead">{formatNumber(row.manualDeposit)}</div><div className="flex-1 text-rose-400 font-asiahead">{formatNumber(row.manualWithdrawal)}</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-blue-400 font-asiahead">{formatNumber(row.pointGiven)}</div><div className="flex-1 text-orange-400 font-asiahead">{formatNumber(row.pointRecovered)}</div></div></td>
                        <td className={cn("px-4 py-3 text-center font-asiahead whitespace-nowrap", row.depositWithdrawalDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatNumber(row.depositWithdrawalDiff)}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex"><div className="text-center text-cyan-400 font-asiahead py-1 border-r border-slate-700/50 text-sm whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>{formatNumber(row.casinoBet)}</div>{casinoGongBetEnabled && <div className="text-center text-orange-400 font-asiahead py-1 border-r border-slate-700/50 text-sm whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>{formatNumber(row.casinoGongBetAmount)}</div>}<div className="text-center text-purple-400 font-asiahead py-1 border-r border-slate-700/50 text-sm whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>{formatNumber(row.casinoWin)}</div><div className="text-center text-cyan-400 font-asiahead py-1 border-r border-slate-700/50 text-sm whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>{formatNumber(row.slotBet)}</div>{slotGongBetEnabled && <div className="text-center text-green-400 font-asiahead py-1 border-r border-slate-700/50 text-sm whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>{formatNumber(row.slotGongBetAmount)}</div>}<div className="text-center text-purple-400 font-asiahead py-1 text-sm whitespace-nowrap" style={{ flexBasis: '120px', flexShrink: 0 }}>{formatNumber(row.slotWin)}</div></div></td>
                        <td className="px-4 py-3 text-center text-amber-400 font-asiahead whitespace-nowrap">{formatNumber(row.ggr)}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="text-teal-400 font-asiahead" style={{ flexBasis: '120px', flexShrink: 0 }}>{formatNumber(row.totalRolling)}</div>{cutRollingEnabled && <div className="text-teal-400 font-asiahead" style={{ flexBasis: '120px', flexShrink: 0 }}>{formatNumber(row.cutRollingAmount)}</div>}<div className="text-teal-400 font-asiahead" style={{ flexBasis: '120px', flexShrink: 0 }}>{formatNumber(row.totalLosing)}</div></div></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap"><div className="flex divide-x divide-slate-700/50"><div className="flex-1 text-green-400 font-asiahead font-semibold">{formatNumber(row.individualRolling)}</div><div className="flex-1 text-green-400 font-asiahead font-semibold">{formatNumber(row.individualLosing)}</div></div></td>


                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-700/50">
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-400">총 {visibleRows.length}개 중 {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, visibleRows.length)}개 표시</span>
                <div className="flex items-center gap-2"><span className="text-sm text-slate-400">페이지당:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                    <SelectTrigger className="w-[80px] h-9 input-premium"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700"><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-9">처음</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="h-9">이전</Button>
                <span className="text-sm text-slate-300 px-4">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="h-9">다음</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-9">마지막</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 공베팅 설정 모달 - 커스텀 모달 */}
      {showGongBetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowGongBetModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-[70vw] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            {/* 헤더 - 드래그 가능 */}
            <div
              className="bg-slate-800/50 border-b border-slate-700/50 p-6 pb-4 cursor-move select-none flex items-center justify-between"
              onMouseDown={(e) => {
                const modal = e.currentTarget.parentElement;
                if (!modal) return;

                const startX = e.clientX - modal.offsetLeft;
                const startY = e.clientY - modal.offsetTop;

                const handleMouseMove = (e: MouseEvent) => {
                  if (modal) {
                    modal.style.left = `${e.clientX - startX}px`;
                    modal.style.top = `${e.clientY - startY}px`;
                  }
                };

                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            >
              <div className="flex items-center gap-2">
                <Play className="h-5 w-5 text-orange-400" />
                <h2 className="text-xl font-semibold text-white">공베팅 설정</h2>
              </div>
              <button
                onClick={() => setShowGongBetModal(false)}
                className="text-slate-400 hover:text-white transition-colors text-xl"
              >
                ✕
              </button>
            </div>

            {/* 본문 */}
            <div className="p-8 space-y-8">
              {/* 공베팅 전체 활성화 */}
              <div className="flex items-center justify-between">
                <Label htmlFor="gong-bet-enabled" className="text-sm font-medium text-white">
                  공베팅 전체 활성화
                </Label>
                <Switch
                  id="gong-bet-enabled"
                  checked={gongBetEnabled}
                  onCheckedChange={async (enabled: boolean) => {
                    setGongBetEnabled(enabled);
                    try {
                      await saveGongBetSettings();
                    } catch (error) {
                      console.error('자동 저장 실패:', error);
                    }
                  }}
                />
              </div>

              {/* 개별 공베팅 기능 토글 */}
              <div className="space-y-4">
                <Label className="text-sm font-medium text-white">공베팅 기능 설정</Label>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <div>
                        <div className="text-white font-medium">카지노 공베팅</div>
                        <div className="text-sm text-slate-400">카지노 베팅에 대한 공베팅 적용</div>
                      </div>
                    </div>
                    <Switch
                      checked={casinoGongBetEnabled}
                      onCheckedChange={handleCasinoGongBetToggle}
                      disabled={!gongBetEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <div>
                        <div className="text-white font-medium">슬롯 공베팅</div>
                        <div className="text-sm text-slate-400">슬롯 베팅에 대한 공베팅 적용</div>
                      </div>
                    </div>
                    <Switch
                      checked={slotGongBetEnabled}
                      onCheckedChange={handleSlotGongBetToggle}
                      disabled={!gongBetEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <div>
                        <div className="text-white font-medium">절삭 롤링금</div>
                        <div className="text-sm text-slate-400">롤링금에서 일정 비율 차감</div>
                      </div>
                    </div>
                    <Switch
                      checked={cutRollingEnabled}
                      onCheckedChange={handleCutRollingToggle}
                      disabled={!gongBetEnabled}
                    />
                  </div>
                </div>
              </div>

              {/* 공베팅 적용 레벨 선택 */}
              <div className="space-y-4">
                <Label className="text-lg font-medium text-white">공베팅 적용 레벨</Label>
                <div className="grid grid-cols-2 gap-4">
                  {[3, 4, 5, 6].map((level) => (
                    <div key={level} className="flex items-center space-x-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                      <Switch
                        id={`level-${level}`}
                        checked={gongBetLevels[level]}
                        onCheckedChange={async (checked) => {
                          setGongBetLevels(prev => ({
                            ...prev,
                            [level]: checked
                          }));
                          try {
                            await saveGongBetSettings();
                          } catch (error) {
                            console.error('자동 저장 실패:', error);
                          }
                        }}
                        disabled={!gongBetEnabled}
                        size="lg"
                      />
                      <Label htmlFor={`level-${level}`} className="text-base text-white font-medium cursor-pointer">
                        {level === 3 ? '본사' : level === 4 ? '부본사' : level === 5 ? '총판' : level === 6 ? '매장' : ''}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* 공베팅 적용 요율 설정 */}
              <div className="space-y-4">
                <Label htmlFor="gong-bet-rate" className="text-lg font-medium text-white">
                  공베팅 적용 요율 (%)
                </Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="gong-bet-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={gongBetRate.toString()}
                    onChange={async (e) => {
                      const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                      setGongBetRate(value);
                      try {
                        await saveGongBetSettings();
                      } catch (error) {
                        console.error('자동 저장 실패:', error);
                      }
                    }}
                    placeholder="0"
                    className="input-premium text-lg py-3"
                    disabled={!gongBetEnabled}
                  />
                  <span className="text-white text-lg">%</span>
                </div>
                <p className="text-sm text-slate-400">
                  예시: 5% 설정 시 정상 롤링금의 5%만큼 차감됩니다.
                </p>
              </div>

              {/* 계산 예시 */}
              <div className="p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl border border-slate-700/50 space-y-4">
                <h4 className="text-lg font-medium text-white">실시간 계산 예시</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="text-slate-300">카지노 1% 롤링률, 10,000,000원 베팅</div>
                    <div className="text-slate-300">정상 롤링금: <span className="text-cyan-400 font-semibold">100,000원</span></div>
                    {(() => {
                      const rateNum = typeof gongBetRate === 'number' ? gongBetRate : parseFloat(gongBetRate) || 0;
                      return (
                        <>
                          <div className="text-slate-300">공베팅 {rateNum}% 적용: <span className="text-orange-400 font-semibold">{formatNumber(100000 * (1 - rateNum / 100))}원</span></div>
                          <div className="text-slate-300">절삭 롤링금: <span className="text-red-400 font-semibold">{formatNumber(100000 * (rateNum / 100))}원</span></div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="space-y-2">
                    <div className="text-slate-300">슬롯 1% 롤링률, 5,000,000원 베팅</div>
                    <div className="text-slate-300">정상 롤링금: <span className="text-cyan-400 font-semibold">50,000원</span></div>
                    {(() => {
                      const rateNum = typeof gongBetRate === 'number' ? gongBetRate : parseFloat(gongBetRate) || 0;
                      return (
                        <>
                          <div className="text-slate-300">공베팅 {rateNum}% 적용: <span className="text-orange-400 font-semibold">{formatNumber(50000 * (1 - rateNum / 100))}원</span></div>
                          <div className="text-slate-300">절삭 롤링금: <span className="text-red-400 font-semibold">{formatNumber(50000 * (rateNum / 100))}원</span></div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>


            </div>

            {/* 푸터 */}
            <div className="border-t border-slate-700/50 p-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowGongBetModal(false)}>
                취소
              </Button>
              <Button
                onClick={async () => {
                  await saveGongBetSettings();
                  // ✅ 모달에서 공베팅 설정 저장 후 테이블 동기화
                  recalculateSettlementData();
                  setShowGongBetModal(false);
                }}
                className="bg-orange-600 hover:bg-orange-700"
              >
                설정 저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
